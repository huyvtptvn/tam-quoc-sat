// Chế độ Thảo Phạt (đánh boss) + bảng xếp hạng riêng.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '../src/content/loader.js';
import { BossBot } from '../src/hegemony/boss.js';
import { HegemonyBot } from '../src/hegemony/bot.js';
import { HegemonyGame } from '../src/hegemony/game.js';
import { attachScoring } from '../src/hegemony/scoring.js';
import { AccountStore } from '../src/server/accounts.js';
import { ByType } from './hg-helpers.js';

before(async () => { await loadContent('content'); });

/** 3 người chơi + boss Lữ Bố (ghế 3). */
function makeBoss(difficulty: 'normal' | 'hard' | 'nightmare' = 'normal') {
  const ctrls = [new ByType(), new ByType(), new ByType(), new ByType()];
  const game = new HegemonyGame(ctrls.map((controller, i) => ({ name: i === 3 ? 'Lữ Bố' : `P${i}`, controller })), {
    seed: 7, boss: { id: 'lubu', difficulty },
    presetGenerals: [['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']],
  });
  return { game, ctrls };
}

test('Thiết lập: boss ghế cuối, lật hết tướng, Liên quân cùng phe, boss là kẻ địch chung', async () => {
  const { game } = makeBoss();
  await game.setup();
  assert.equal(game.bossSeat, 3);
  assert.equal(game.heroes[3].main.generalId, 'boss_lvbu');
  assert.equal(game.player(3).maxHp, 4 + 4 * 3);
  assert.ok(game.heroes.every((h) => h.main.revealed && h.deputy.revealed));
  assert.ok(game.isSameFaction(0, 1) && game.isSameFaction(1, 2), 'Ngụy, Thục, Ngô đều là Liên quân');
  assert.ok(!game.isSameFaction(0, 3) && !game.isSameFaction(3, 0));
  assert.equal(game.player(0).team, 'Liên quân');
  assert.equal(game.player(3).team, 'Boss');
  assert.ok(game.hasSkill(0, 'khieuchien'));
  const v = game.makeView(0);
  assert.equal(v.boss?.name, 'Lữ Bố – Hổ Lao Quan');
});

test('Độ khó làm tăng máu boss', async () => {
  const { game } = makeBoss('nightmare');
  await game.setup();
  assert.equal(game.player(3).maxHp, Math.round(16 * 1.4));
});

test('Thứ tự lượt: mọi người chơi đi 1 lượt rồi tới boss', () => {
  const { game } = makeBoss();
  const order = [0];
  let s = 0;
  for (let i = 0; i < 7; i++) { s = (game as unknown as { nextTurnSeat: (x: number) => number }).nextTurnSeat(s); order.push(s); }
  assert.deepEqual(order, [0, 1, 2, 3, 0, 1, 2, 3]);
});

test('Còn nửa máu: boss sang giai đoạn Bạo Nộ, hồi 3 máu, có thêm kỹ năng', async () => {
  const { game } = makeBoss();
  await game.setup();
  const max = game.player(3).maxHp;
  await game.damage({ source: 0, target: 3, amount: max - Math.floor(max / 2), card: null, cancelled: false });
  assert.equal(game.bossPhase, 1);
  assert.equal(game.heroes[3].main.generalId, 'boss_lvbu2');
  assert.equal(game.player(3).hp, Math.floor(max / 2) + 3);
  assert.ok(game.hasSkill(3, 'boss_thanphan'));
  assert.ok(game.bossThreat[0] > 0, 'gây sát thương cho boss thì tăng thù hận');
});

test('Người chơi chết: tốn 1 Quân lương, sống lại sau 2 lượt boss; tất cả cùng chết thì boss thắng', async () => {
  const { game } = makeBoss();
  await game.setup();
  game.player(0).hp = 1;
  await game.damage({ source: 3, target: 0, amount: 1, card: null, cancelled: false });
  assert.ok(!game.player(0).alive);
  assert.equal(game.bossFood, 2);
  assert.equal(game.bossReviving.get(0), 2);
  for (let i = 0; i < 2; i++) await game.bus.emit('turnEnd', { seat: 3 });
  assert.ok(game.player(0).alive);
  assert.equal(game.player(0).hp, 2);
  for (const s of [0, 1, 2]) game.player(s).hp = 1;
  for (const s of [0, 1]) await game.damage({ source: 3, target: s, amount: 1, card: null, cancelled: false });
  assert.ok(!game.state.finished);
  try { await game.damage({ source: 3, target: 2, amount: 1, card: null, cancelled: false }); } catch { /* ván kết thúc */ }
  assert.equal(game.state.winner, 'Boss');
});

test('Hạ boss ở giai đoạn cuối: Liên quân thắng; Chiến công = điểm + thưởng độ khó + thưởng tốc độ', async () => {
  const { game } = makeBoss('hard');
  await game.setup();
  const sk = attachScoring(game);
  game.bossRound = 5;
  await game.damage({ source: 0, target: 3, amount: game.player(3).hp - 1, card: null, cancelled: false });
  assert.equal(game.bossPhase, 1);
  try { await game.damage({ source: 1, target: 3, amount: game.player(3).hp, card: null, cancelled: false }); } catch { /* ván kết thúc */ }
  assert.equal(game.state.winner, 'Liên quân');
  const b = sk.compute();
  assert.ok(b.players[0].winner && b.players[1].winner && b.players[2].winner && !b.players[3].winner);
  assert.equal(b.players[2].breakdown.end, 50 + 2 * (15 - 5) + 3);
  assert.notEqual(b.mvp, 3, 'boss không được MVP');
});

test('Bảng xếp hạng Thảo Phạt: ghi Chiến công, số lần hạ boss, kỷ lục số vòng; không đổi Elo', async () => {
  const store = new AccountStore(mkdtempSync(join(tmpdir(), 'tqs-boss-')));
  const a = store.register('daboss', 'matkhau1');
  const acc = store.byAuthToken(a.token)!;
  const { game } = makeBoss();
  await game.setup();
  const sk = attachScoring(game);
  game.bossRound = 6;
  await game.damage({ source: 0, target: 3, amount: game.player(3).hp - 1, card: null, cancelled: false });
  try { await game.damage({ source: 0, target: 3, amount: 99, card: null, cancelled: false }); } catch { /* xong */ }
  const board = sk.compute();
  const rec = store.recordBossMatch({ room: 'r', deck: 'quocchien', turns: 20, winner: game.state.winner,
    boss: { id: 'lubu', name: 'Lữ Bố – Hổ Lao Quan', difficulty: 'normal', difficultyLabel: 'Thường', rounds: 6 } },
  [{ accountId: acc.id, bot: false }, { accountId: null, bot: true }, { accountId: null, bot: true }, { accountId: null, bot: true }], board, 3);
  assert.ok(rec.boss?.win && !rec.ranked);
  assert.equal(acc.rating, 1200, 'không tính Elo');
  const lb = store.bossLeaderboard('lubu', 'normal');
  assert.equal(lb.fastest[0].rounds, 6);
  assert.equal(lb.players[0].username, 'daboss');
  assert.equal(lb.players[0].clears, 1);
  assert.equal(lb.players[0].points, board.players[0].total);
  assert.equal(store.bossLeaderboard('lubu', 'hard').players.length, 0);
});

test('Bot chơi trọn ván Thảo Phạt ở mọi độ khó, 2–5 người', async () => {
  for (const difficulty of ['normal', 'hard', 'nightmare'] as const) {
    for (let n = 2; n <= 5; n++) {
      const g = new HegemonyGame([...Array.from({ length: n }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })), { name: 'Boss', controller: new BossBot() }],
        { seed: 100 + n, boss: { id: 'lubu', difficulty } });
      const r = await g.run();
      assert.ok(r.winner === 'Liên quân' || r.winner === 'Boss', `kết quả lạ: ${r.winner}`);
    }
  }
});
