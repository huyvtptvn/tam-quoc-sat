// ============================================================
// Mô phỏng hàng loạt ván bot đấu bot để kiểm tra độ ổn định & cân bằng.
// Chạy: npm run sim -- 1000
// ============================================================
import { Game } from '../core/game.js';
import { SimpleBot } from '../agents/bot.js';

const n = Number(process.argv[2]) || 500;
const wins: Record<string, number> = {};
let turns = 0;
const t0 = performance.now();

for (let seed = 1; seed <= n; seed++) {
  const game = new Game(
    ['Thục', 'Ngụy', 'Thục', 'Ngụy', 'Ngô'].map((team, i) => ({
      name: `Bot ${i}`, team, controller: new SimpleBot(),
    })),
    { seed },
  );
  const r = await game.run();
  const key = r.winner ?? `hòa (${r.reason})`;
  wins[key] = (wins[key] ?? 0) + 1;
  turns += r.turns;
  if (game.totalCards() !== game.cards.size) throw new Error(`Mất bài ở seed ${seed}!`);
}

const ms = performance.now() - t0;
console.log(`${n} ván · trung bình ${(turns / n).toFixed(1)} lượt/ván · ${(ms / n).toFixed(2)} ms/ván`);
for (const [k, v] of Object.entries(wins).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${v} (${((100 * v) / n).toFixed(1)}%)`);
}
