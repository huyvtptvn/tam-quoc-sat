// ============================================================
// Mô phỏng hàng loạt ván Quốc Chiến bot đấu bot.
// Chạy: npm run sim:qc -- 500 6     (500 ván, 6 người)
// ============================================================
import { HegemonyGame } from '../hegemony/game.js';
import { HegemonyBot } from '../hegemony/bot.js';

const n = Number(process.argv[2]) || 300;
const players = Number(process.argv[3]) || 6;
const wins: Record<string, number> = {};
let turns = 0;
let careeristGames = 0;
const t0 = performance.now();

for (let seed = 1; seed <= n; seed++) {
  const game = new HegemonyGame(
    Array.from({ length: players }, (_, i) => ({ name: `Bot ${i}`, controller: new HegemonyBot() })),
    { seed, candidates: Math.min(7, Math.floor(32 / players)) },
  );
  const r = await game.run();
  const key = r.winner?.startsWith('Dã tâm gia') ? 'Dã tâm gia' : r.winner ?? `hòa (${r.reason})`;
  wins[key] = (wins[key] ?? 0) + 1;
  turns += r.turns;
  if (game.heroes.some((h) => h.careerist)) careeristGames++;
  if (game.totalCards() !== game.cards.size) throw new Error(`Mất bài ở seed ${seed}!`);
}

const ms = performance.now() - t0;
console.log(`${n} ván ${players} người · trung bình ${(turns / n).toFixed(1)} lượt/ván · ${(ms / n).toFixed(2)} ms/ván`);
console.log(`Số ván có dã tâm gia xuất hiện: ${careeristGames}`);
for (const [k, v] of Object.entries(wins).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${v} (${((100 * v) / n).toFixed(1)}%)`);
}
