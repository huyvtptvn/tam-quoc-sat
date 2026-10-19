// ============================================================
// Kiểm tra nội dung + mô phỏng bot đấu bot.
//   npm run content:check                         (kiểm tra lỗi + 100 ván 6 người)
//   npm run content:check -- --games 300 --players 8
//   npm run content:check -- --focus chen_gong    (ghế 0 luôn cầm tướng này, để thử tướng mới)
//   npm run content:check -- --deck quantranh     (dùng bộ bài Quân Tranh)
//   npm run content:check -- --mode chaos         (chế độ chọn tướng: normal | free | chaos, có đổi bài khởi đầu)
//   thêm --json để in kết quả dạng JSON (trang quản trị dùng)
// ============================================================
import { getGeneral, GENERALS, isDualGeneral, kingdomsOf, KINGDOM_LABEL } from '../hegemony/generals.js';
import { HegemonyGame, type GameMode } from '../hegemony/game.js';
import { HegemonyBot } from '../hegemony/bot.js';
import { createRng, shuffle } from '../core/rng.js';
import { buildDeckById } from '../core/cards.js';
import { loadContent } from './loader.js';

export interface SimReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  games: number;
  players: number;
  draws: number;
  avgTurns: number;
  crashes: { seed: number; error: string }[];
  invariantViolations: number;
  kingdoms: Record<string, number>;
  generals: { id: string; name: string; kingdom: string; picked: number; winRate: number; content: boolean }[];
  msPerGame: number;
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/** Tạo cặp tướng cho mọi ghế, ghế 0 luôn có tướng `focus`. */
export function focusPresets(focus: string, players: number, seed: number): [string, string][] {
  const rng = createRng(seed);
  const f = getGeneral(focus);
  const pool = shuffle(GENERALS.filter((g) => !g.lord).map((g) => g.id).filter((id) => id !== focus), rng);
  /** Lấy 1 tướng: làm chủ (đúng thế lực, không phải tướng 2 thế lực) hoặc làm phó (thế lực có chứa kd, không phải tướng tím). */
  const take = (kd: string, asMain: boolean) => {
    const i = pool.findIndex((id) => (asMain ? getGeneral(id).kingdom === kd && !isDualGeneral(id) : getGeneral(id).kingdom !== 'ye' && kingdomsOf(id).includes(kd as never)));
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  const out: [string, string][] = [];
  if (isDualGeneral(focus)) {
    // Tướng 2 thế lực chỉ làm phó tướng
    const kd = kingdomsOf(focus)[Math.floor(rng() * 2)];
    out.push([take(kd, true)!, focus]);
  } else {
    // Tướng Dã tâm gia: phó tướng lấy từ một thế lực thường bất kỳ
    const deputyKd = f.kingdom === 'ye' ? ['wei', 'shu', 'wu', 'qun'][Math.floor(rng() * 4)] : f.kingdom;
    out.push([focus, take(deputyKd, false)!]);
  }
  // Các ghế khác: chọn ngẫu nhiên một thế lực còn đủ tướng (giống chia bài thật)
  for (let s = 1; s < players; s++) {
    const options = ['wei', 'shu', 'wu', 'qun'].filter((kd) => pool.some((x) => getGeneral(x).kingdom === kd && !isDualGeneral(x))
      && pool.filter((x) => getGeneral(x).kingdom !== 'ye' && kingdomsOf(x).includes(kd as never)).length >= 2);
    const kd = options[Math.floor(rng() * options.length)];
    const m = take(kd, true)!;
    out.push([m, take(kd, false)!]);
  }
  return out;
}

export async function runCheck(dir: string, games: number, players: number, focus?: string, deck?: string, mode?: GameMode): Promise<SimReport> {
  const loaded = await loadContent(dir);
  const report: SimReport = {
    ok: loaded.ok, errors: loaded.errors, warnings: loaded.warnings, games: 0, players, draws: 0, avgTurns: 0,
    crashes: [], invariantViolations: 0, kingdoms: {}, generals: [], msPerGame: 0,
  };
  if (!loaded.ok) return report;
  if (focus && !GENERALS.some((g) => g.id === focus)) {
    report.ok = false;
    report.errors.push(`--focus: không có tướng "${focus}"`);
    return report;
  }

  const contentIds = new Set([...(loaded.applied?.generals ?? []), ...(loaded.applied?.patchedGenerals ?? [])]);
  const picked: Record<string, number> = {};
  const won: Record<string, number> = {};
  let turns = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= games; seed++) {
    const game = new HegemonyGame(
      Array.from({ length: players }, (_, i) => ({ name: `Bot ${i}`, controller: new HegemonyBot() })),
      {
        seed, maxTurns: 800, candidates: Math.min(7, Math.floor(GENERALS.length / players)),
        ...(deck ? { deck: buildDeckById(deck) } : {}),
        ...(mode ? { mode, mulligan: true } : {}),
        ...(focus ? { presetGenerals: focusPresets(focus, players, seed) } : {}),
      },
    );
    game.bus.on('cardsMoved', () => { if (game.totalCards() !== game.cards.size) report.invariantViolations++; });
    try {
      const r = await game.run();
      report.games++;
      turns += r.turns;
      if (r.reason !== 'victory') { report.draws++; continue; }
      const key = r.winner!.startsWith('Dã tâm gia') ? 'Dã tâm gia' : r.winner!;
      report.kingdoms[key] = (report.kingdoms[key] ?? 0) + 1;
      game.heroes.forEach((h, seat) => {
        for (const id of [h.main.generalId, h.deputy.generalId]) {
          picked[id] = (picked[id] ?? 0) + 1;
          const p = game.state.players[seat];
          if (p.team === r.winner || (key === 'Dã tâm gia' && p.alive)) won[id] = (won[id] ?? 0) + 1;
        }
      });
    } catch (e) {
      report.crashes.push({ seed, error: (e as Error).stack ?? String(e) });
    }
  }
  report.msPerGame = (performance.now() - t0) / Math.max(1, games);
  report.avgTurns = turns / Math.max(1, report.games);
  report.generals = GENERALS.map((g) => ({
    id: g.id, name: g.name, kingdom: KINGDOM_LABEL[g.kingdom], picked: picked[g.id] ?? 0,
    winRate: picked[g.id] ? (won[g.id] ?? 0) / picked[g.id] : 0, content: contentIds.has(g.id),
  })).sort((a, b) => b.winRate - a.winRate);
  report.ok = report.crashes.length === 0 && report.invariantViolations === 0;
  return report;
}

// ---------- Chạy từ dòng lệnh ----------
const isMain = process.argv[1] && /check\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const dir = arg('dir', 'content');
  const report = await runCheck(dir, Number(arg('games', '100')), Number(arg('players', '6')), process.argv.includes('--focus') ? arg('focus', '') : undefined,
    process.argv.includes('--deck') ? arg('deck', '') : undefined,
    process.argv.includes('--mode') ? arg('mode', 'normal') as GameMode : undefined);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report));
  } else {
    if (report.errors.length) {
      console.log(`✗ ${report.errors.length} lỗi:\n`);
      for (const e of report.errors) console.log(`  • ${e}\n`);
    }
    if (report.warnings.length) {
      console.log(`! ${report.warnings.length} cảnh báo:`);
      for (const w of report.warnings) console.log(`  • ${w}`);
      console.log();
    }
    if (report.games) {
      console.log(`Mô phỏng ${report.games} ván ${report.players} người · ${report.avgTurns.toFixed(1)} lượt/ván · ${report.msPerGame.toFixed(1)} ms/ván · hòa ${report.draws}`);
      console.log('Tỉ lệ thắng theo thế lực:', Object.entries(report.kingdoms).map(([k, v]) => `${k} ${(100 * v / report.games).toFixed(0)}%`).join(' · '));
      const content = report.generals.filter((g) => g.content);
      if (content.length) {
        console.log('Tướng trong content/:');
        for (const g of content) console.log(`  ${g.name.padEnd(14)} (${g.kingdom}) chọn ${g.picked} lần, thắng ${(100 * g.winRate).toFixed(0)}%`);
      }
      if (report.crashes.length) {
        console.log(`\n✗ ${report.crashes.length} ván bị lỗi (crash). Ván đầu tiên (seed ${report.crashes[0].seed}):\n${report.crashes[0].error}`);
      }
      if (report.invariantViolations) console.log(`✗ Vi phạm bất biến số lá bài: ${report.invariantViolations}`);
    }
    console.log(report.ok ? '\n✓ Nội dung hợp lệ.' : '\n✗ Có lỗi, xem ở trên.');
    process.exitCode = report.ok ? 0 : 1;
  }
}
