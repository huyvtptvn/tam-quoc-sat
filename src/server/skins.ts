// ============================================================
// Skin tướng (ảnh + lồng tiếng) lấy từ thư mục hero-skin của QSanguosha.
//
//   content/images/hero-skin/<id tướng QSGS>/<số skin>/full.png        ảnh tướng (250×292)
//   content/images/hero-skin/<id tướng QSGS>/<số skin>/<kỹ năng><n>.ogg lồng tiếng khi dùng kỹ năng (ogg/mp3/wav)
//   content/images/hero-skin/<id tướng QSGS>/<số skin>/death.ogg        câu nói lúc tử trận
//   content/images/hero-skin/<id tướng QSGS>/<số skin>/zh_CN.lua        tên skin: ["#<id>"] = "..."
// File nằm thẳng trong thư mục tướng (không có số) được coi là một skin riêng (số 0).
//
// Id tướng QSGS và id kỹ năng QSGS được đổi sang id trong game nhờ content/import/qsgs-viet.json
// (trường `ours` của tướng; kỹ năng khớp theo tên đã đồng bộ với file lua).
// ============================================================
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { getGeneral, GENERALS, isGeneralId } from '../hegemony/generals.js';
import { SKILLS } from '../hegemony/skills.js';

export interface SkinInfo {
  /** Tên thư mục skin ("1", "2"... hoặc "0" cho file nằm thẳng trong thư mục tướng). */
  key: string;
  /** Tên skin (từ zh_CN.lua) hoặc "Skin <số>". */
  name: string;
  image: string;
  /** id kỹ năng trong game -> các file lồng tiếng. */
  voices: Record<string, string[]>;
  death?: string;
}

export const SKIN_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
const AUDIO = new Set(['.ogg', '.mp3', '.wav']);

/** Thư mục QSGS khác id trong game nhưng là cùng một người. */
const ALIAS: Record<string, string> = { zuoci: 'new_zuoci' };

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

export class SkinStore {
  private cache: { at: number; data: Record<string, SkinInfo[]> } | null = null;

  constructor(private readonly root: string, private readonly importFile: string) {}

  /** Đường dẫn file thật cho url /skins/<tướng>/<skin>/<file>, hoặc null nếu không hợp lệ / không tồn tại. */
  resolve(rel: string): string | null {
    const parts = rel.split('/').filter(Boolean);
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => p === '..' || p.startsWith('.') || /[\\:]/.test(p))) return null;
    if (!SKIN_MIME[extname(parts[parts.length - 1]).toLowerCase()]) return null;
    const full = resolve(this.root, ...parts);
    if (!full.startsWith(resolve(this.root) + sep) || !existsSync(full) || !statSync(full).isFile()) return null;
    return full;
  }

  /** Bảng { id tướng trong game -> danh sách skin }. Được tính lại khi nội dung đổi (gọi invalidate). */
  index(): Record<string, SkinInfo[]> {
    if (this.cache) return this.cache.data;
    const data = this.build();
    this.cache = { at: Date.now(), data };
    return data;
  }

  invalidate(): void {
    this.cache = null;
  }

  private build(): Record<string, SkinInfo[]> {
    const out: Record<string, SkinInfo[]> = {};
    if (!existsSync(this.root)) return out;
    const qsgs = this.loadImport();
    for (const dir of readdirSync(this.root).sort()) {
      const gdir = join(this.root, dir);
      if (!statSync(gdir).isDirectory()) continue;
      const ours = ALIAS[dir] ?? qsgs.generalMap.get(dir) ?? dir;
      // Tướng trống (sujiang/sujiangf): dùng làm ảnh tướng úp
      if (!isGeneralId(ours) && ours !== 'sujiang' && ours !== 'sujiangf') continue;
      const skillMap = this.skillMapFor(dir, ours, qsgs);
      const list = out[ours] ?? (out[ours] = []);
      const entries = readdirSync(gdir);
      const keys = entries.filter((e) => statSync(join(gdir, e)).isDirectory()).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
      if (entries.some((e) => !statSync(join(gdir, e)).isDirectory() && e.toLowerCase() === 'full.png')) keys.unshift('');
      for (const key of keys) {
        const sdir = key ? join(gdir, key) : gdir;
        const files = readdirSync(sdir).filter((f) => statSync(join(sdir, f)).isFile());
        const url = (f: string) => `/skins/${encodeURIComponent(dir)}/${key ? `${encodeURIComponent(key)}/` : ''}${encodeURIComponent(f)}`;
        const img = files.find((f) => f.toLowerCase() === 'full.png')
          ?? files.find((f) => f.toLowerCase() === 'card.jpg')
          ?? files.find((f) => /\.(png|jpe?g)$/i.test(f) && !/avatar/i.test(f));
        if (!img) continue;
        const voices: Record<string, string[]> = {};
        let death: string | undefined;
        for (const f of files) {
          const ext = extname(f).toLowerCase();
          if (!AUDIO.has(ext)) continue;
          const base = f.slice(0, -ext.length);
          if (/^death$/i.test(base)) { death = url(f); continue; }
          const m = /^(.+?)(\d+)$/.exec(base);
          const qskill = (m ? m[1] : base).toLowerCase();
          const sk = skillMap.get(qskill) ?? (SKILLS[qskill] ? qskill : null);
          if (!sk) continue;
          (voices[sk] ??= []).push(url(f));
        }
        list.push({ key: key || '0', name: this.skinName(sdir, dir) ?? `Skin ${key || '0'}`, image: url(img), voices, ...(death ? { death } : {}) });
      }
      if (!list.length) delete out[ours];
    }
    return out;
  }

  private loadImport(): { generalMap: Map<string, string>; skills: Map<string, { id: string; name: string }[]> } {
    const generalMap = new Map<string, string>();
    const skills = new Map<string, { id: string; name: string }[]>();
    if (!existsSync(this.importFile)) return { generalMap, skills };
    try {
      const q = JSON.parse(readFileSync(this.importFile, 'utf8')) as { generals: { id: string; ours?: string; skills: { id: string; name: string }[] }[] };
      for (const g of q.generals) {
        generalMap.set(g.id, g.ours ?? g.id);
        skills.set(g.id, g.skills ?? []);
      }
    } catch { /* file hỏng: chỉ khớp theo id */ }
    return { generalMap, skills };
  }

  /** id kỹ năng QSGS -> id kỹ năng trong game (khớp theo tên kỹ năng của tướng đó). */
  private skillMapFor(dir: string, ours: string, qsgs: ReturnType<SkinStore['loadImport']>): Map<string, string> {
    const map = new Map<string, string>();
    if (!isGeneralId(ours)) return map;
    const mine = getGeneral(ours).skills;
    const byName = new Map(mine.map((id) => [norm(SKILLS[id]?.name ?? id), id]));
    for (const s of qsgs.skills.get(dir) ?? []) {
      const hit = (s.name && byName.get(norm(s.name))) || (mine.includes(s.id) ? s.id : null);
      if (hit) map.set(s.id.toLowerCase(), hit);
    }
    // Kỹ năng trùng id QSGS (Gian Hùng của Tào Tháo...) dùng thẳng
    for (const id of mine) if (!map.has(id)) map.set(id, id);
    return map;
  }

  /** Tên skin trong zh_CN.lua: ["#<id>"] = "...". */
  private skinName(sdir: string, dir: string): string | null {
    const f = join(sdir, 'zh_CN.lua');
    if (!existsSync(f)) return null;
    const m = new RegExp(`\\["#${dir}"\\]\\s*=\\s*"([^"]+)"`).exec(readFileSync(f, 'utf8'));
    return m ? m[1] : null;
  }
}

/** Số tướng trong game có ít nhất 1 skin (để báo cáo). */
export function skinCoverage(index: Record<string, SkinInfo[]>): { withSkin: number; total: number } {
  return { withSkin: GENERALS.filter((g) => index[g.id]?.length).length, total: GENERALS.length };
}
