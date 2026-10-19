// ============================================================
// Quản lý nội dung trên server: nạp, theo dõi thay đổi, kiểm tra trước khi lưu,
// áp dụng khi không còn ván nào đang chơi, chạy mô phỏng trong tiến trình riêng.
// ============================================================
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentContent, listContentFiles, prepareContent, type ContentSummary, type Prepared } from '../content/loader.js';
import type { SimReport } from '../content/check.js';
import type { Lobby } from './rooms.js';

export interface ApplyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** 'applied' = đã áp dụng; 'pending' = sẽ áp dụng khi các ván đang chơi kết thúc; 'rejected' = có lỗi. */
  status: 'applied' | 'pending' | 'rejected';
  summary?: ContentSummary | Prepared['summary'];
}

const CHECK_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../content/check.ts');

export class ContentManager {
  private watcher: FSWatcher | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private pending: Prepared | null = null;
  lastErrors: string[] = [];
  lastWarnings: string[] = [];

  constructor(readonly dir: string, private readonly lobby: Lobby, private readonly log = console.log) {}

  get summary(): ContentSummary | null {
    return currentContent();
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Đường dẫn an toàn bên trong thư mục content (chặn "../"). */
  resolvePath(rel: string): string {
    const clean = normalize(String(rel)).replace(/^([/\\])+/, '');
    if (clean.startsWith('..') || !/\.(json|mjs|js|md)$/.test(clean)) throw new Error('Đường dẫn không hợp lệ (chỉ .json, .mjs, .js, .md trong thư mục content)');
    const full = resolve(this.dir, clean);
    if (!full.startsWith(resolve(this.dir))) throw new Error('Đường dẫn không hợp lệ');
    return full;
  }

  files(): string[] {
    return listContentFiles(this.dir);
  }

  read(rel: string): string {
    return readFileSync(this.resolvePath(rel), 'utf8');
  }

  /** Kiểm tra (không áp dụng), có thể kèm nội dung chưa lưu. */
  async validate(overrides: Record<string, string | null> = {}): Promise<Prepared> {
    return prepareContent(this.dir, overrides);
  }

  /** Nạp lại từ đĩa. Nếu đang có ván chơi thì xếp hàng, áp dụng khi rảnh. */
  async reload(reason = 'yêu cầu'): Promise<ApplyResult> {
    const p = await prepareContent(this.dir);
    this.lastErrors = p.errors;
    this.lastWarnings = p.warnings;
    if (!p.ok) {
      this.log(`[nội dung] ✗ Không áp dụng (${reason}): ${p.errors.length} lỗi`);
      for (const e of p.errors) this.log(`   • ${e}`);
      return { ok: false, errors: p.errors, warnings: p.warnings, status: 'rejected' };
    }
    if (this.lobby.activeGames() > 0) {
      const first = this.pending === null;
      this.pending = p;
      if (first) this.lobby.whenIdle(() => this.applyPending());
      this.log(`[nội dung] Đã kiểm tra OK (${reason}). Sẽ áp dụng khi ${this.lobby.activeGames()} ván đang chơi kết thúc.`);
      return { ok: true, errors: [], warnings: p.warnings, status: 'pending', summary: p.summary };
    }
    const s = p.apply();
    this.lobby.contentVersion = s.version;
    this.log(`[nội dung] ✓ Áp dụng phiên bản ${s.version} (${reason}): ${s.skills.length} kỹ năng, ${s.generals.length} tướng mới, ${s.cards.length} lá bài mới.`);
    return { ok: true, errors: [], warnings: p.warnings, status: 'applied', summary: s };
  }

  private applyPending(): void {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    const s = p.apply();
    this.lobby.contentVersion = s.version;
    this.log(`[nội dung] ✓ Áp dụng phiên bản ${s.version} (sau khi các ván kết thúc).`);
  }

  /** Lưu file: kiểm tra toàn bộ nội dung với file mới trước; có lỗi thì KHÔNG ghi. */
  async save(rel: string, text: string): Promise<ApplyResult> {
    if (/\.(mjs|js)$/i.test(String(rel))) {
      return { ok: false, errors: ['Không thể ghi/xóa script (.mjs/.js) qua trang quản trị. Hãy đặt file trực tiếp trong content/scripts/ trên máy chủ.'], warnings: [], status: 'rejected' };
    }
    const full = this.resolvePath(rel);
    const key = normalize(rel).split('\\').join('/').replace(/^\/+/, '');
    const p = await this.validate({ [key]: text });
    if (!p.ok) return { ok: false, errors: p.errors, warnings: p.warnings, status: 'rejected' };
    mkdirSync(dirname(full), { recursive: true });
    this.suppressWatch();
    writeFileSync(full, text, 'utf8');
    return this.reload(`lưu ${key}`);
  }

  async remove(rel: string): Promise<ApplyResult> {
    if (/\.(mjs|js)$/i.test(String(rel))) {
      return { ok: false, errors: ['Không thể ghi/xóa script (.mjs/.js) qua trang quản trị. Hãy đặt file trực tiếp trong content/scripts/ trên máy chủ.'], warnings: [], status: 'rejected' };
    }
    const full = this.resolvePath(rel);
    const key = normalize(rel).split('\\').join('/').replace(/^\/+/, '');
    if (!existsSync(full)) return { ok: false, errors: ['File không tồn tại'], warnings: [], status: 'rejected' };
    const p = await this.validate({ [key]: null });
    if (!p.ok) return { ok: false, errors: p.errors, warnings: p.warnings, status: 'rejected' };
    this.suppressWatch();
    unlinkSync(full);
    return this.reload(`xóa ${key}`);
  }

  /** Theo dõi thư mục: sửa file bằng trình soạn thảo bất kỳ cũng tự nạp lại. */
  watch(): void {
    if (this.watcher || !existsSync(this.dir)) return;
    try {
      this.watcher = watch(this.dir, { recursive: true }, (_e, file) => {
        if (!file || !/\.(json|mjs|js)$/.test(String(file))) return;
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => void this.reload(`file thay đổi: ${file}`), 400);
      });
    } catch (e) {
      this.log(`[nội dung] Không theo dõi được thư mục (${(e as Error).message}). Dùng nút "Nạp lại" trên trang quản trị.`);
    }
  }

  private suppressWatch(): void {
    // Lưu từ trang quản trị đã tự nạp lại; bỏ qua sự kiện theo dõi file ngay sau đó
    setTimeout(() => { if (this.debounce) { clearTimeout(this.debounce); this.debounce = null; } }, 450);
  }

  close(): void {
    this.watcher?.close();
    if (this.debounce) clearTimeout(this.debounce);
  }

  /** Chạy mô phỏng trong tiến trình riêng (không làm chậm server, không đụng nội dung đang chạy). */
  simulate(games: number, players: number, focus?: string): Promise<SimReport> {
    const args = ['--import', 'tsx', CHECK_SCRIPT, '--dir', this.dir, '--games', String(games), '--players', String(players), '--json'];
    if (focus) args.push('--focus', focus);
    return new Promise((resolveP, reject) => {
      const child = spawn(process.execPath, args, { cwd: join(dirname(CHECK_SCRIPT), '../..') });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Mô phỏng quá 180 giây, đã dừng')); }, 180_000);
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('close', () => {
        clearTimeout(timer);
        const line = out.trim().split('\n').pop() ?? '';
        try { resolveP(JSON.parse(line)); } catch { reject(new Error(`Mô phỏng lỗi: ${err || out}`.slice(0, 2000))); }
      });
    });
  }
}
