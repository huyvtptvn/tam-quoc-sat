// Test tướng tiêu chuẩn theo file lua (content/scripts/goi-chuan.mjs): Bàng Thống, Từ Hoảng, Thái Sử Từ.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import { getGeneral } from '../src/hegemony/generals.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import type { Response } from '../src/core/types.js';
import { enterPlay } from './helpers.js';
import { makeHG, onlySkill } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const useSkill = (game: HegemonyGame, seat: number, skill: string, targets: number[], cardIds: number[] = []) =>
  (game as unknown as { useSkillAction(s: number, r: Response): Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });

/** Chuyển 1 lá thỏa điều kiện từ chồng bốc lên tay. */
async function take(game: HegemonyGame, seat: number, pred: (id: number) => boolean): Promise<number> {
  const id = game.state.drawPile.find(pred);
  assert.ok(id !== undefined, 'không tìm thấy lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}

test('khai báo: kỹ năng và số âm dương ngư theo bản Quốc Chiến', () => {
  assert.deepEqual(getGeneral('pang_tong').skills, ['lianhuan', 'niepan']);
  assert.equal(getGeneral('pang_tong').halfHp, 3);
  assert.deepEqual(getGeneral('xu_huang').skills, ['duanliang']);
  assert.equal(getGeneral('xu_huang').halfHp, 4);
  assert.deepEqual(getGeneral('taishi_ci').skills, ['tianyi']);
  assert.equal(getGeneral('taishi_ci').kingdom, 'wu');
});

test('Liên Hoàn: lá Tép trên tay dùng như Thiết Tác Liên Hoàn hoặc trùng chú (chỉ trong giai đoạn ra bài)', async () => {
  const { game } = makeHG([['pang_tong', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'zhoutai']]);
  const club = (id: number) => game.card(id).suit === 'club' && game.card(id).type !== 'trick' && game.card(id).type !== 'delayed';
  const a = await take(game, 0, club);
  const b = await take(game, 0, (id) => club(id) && id !== a);
  game.state.currentSeat = 0;
  game.state.phase = 'end';
  assert.equal(game.cardCountsAs(0, game.card(a)).includes('tiesuo'), false, 'ngoài giai đoạn ra bài');
  enterPlay(game, 0);
  assert.ok(game.cardCountsAs(0, game.card(a)).includes('tiesuo'));
  const r1 = await game.useCard(0, a, [1, 2], 'tiesuo');
  assert.equal(r1.ok, true);
  assert.equal(game.player(1).chained && game.player(2).chained, true);
  assert.equal(game.hero(0).main.revealed, true, 'dùng kỹ năng của tướng úp thì mở tướng');
  const before = game.player(0).hand.length;
  const r2 = await game.useCard(0, b, [], 'tiesuo');
  assert.equal(r2.ok, true);
  assert.equal(game.player(0).hand.length, before, 'trùng chú: bỏ 1 lá, rút 1 lá');
  assert.ok(game.state.discardPile.includes(b));
});

test('Niết Bàn: hấp hối thì bỏ hết bài, hồi đến 3 máu, rút 3 lá, gỡ xích và lật lại tướng; chỉ 1 lần mỗi ván', async () => {
  const { game, ctrls } = makeHG([['pang_tong', 'zhugeliang'], ['caocao', 'xuchu'], ['sunquan', 'zhoutai']]);
  ctrls[0].set('confirm', onlySkill('niepan'));
  const p = game.player(0);
  const old = await take(game, 0, () => true);
  p.chained = true;
  p.faceDown = true;
  p.hp = 1;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(p.alive, true);
  assert.equal(p.hp, Math.min(3, p.maxHp));
  assert.equal(p.hand.length, 3);
  assert.ok(!p.hand.includes(old), 'bài cũ đã bị bỏ');
  assert.equal(p.chained, false);
  assert.equal(p.faceDown, false);
  // Lần hấp hối thứ hai: không còn Niết Bàn
  const asked = ctrls[0].asked.filter((r) => r.type === 'confirm' && (r as { skill: string }).skill === 'niepan').length;
  p.hp = 1;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(ctrls[0].asked.filter((r) => r.type === 'confirm' && (r as { skill: string }).skill === 'niepan').length, asked);
  assert.equal(p.alive, false);
});

test('Đoạn Lương: lá Đen không phải công cụ dùng như Binh Lương không giới hạn khoảng cách; mục tiêu xa hơn 2 thì hết lượt dùng trong giai đoạn', async () => {
  const { game } = makeHG([['xu_huang', 'caocao'], ['liubei', 'guanyu'], ['sunquan', 'zhoutai'], ['zhangjiao', 'lvbu'], ['dianwei', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  const black = (id: number) => ['spade', 'club'].includes(game.card(id).suit) && game.card(id).type === 'basic';
  await take(game, 0, black);
  await take(game, 0, black);
  enterPlay(game, 0);
  assert.equal(game.distance(0, 2), 2);
  assert.equal(await useSkill(game, 0, 'duanliang', [2]), null);
  assert.equal(game.player(2).judgeArea.length, 1);
  assert.equal(game.delayedName(game.player(2).judgeArea[0]), 'bingliang');
  assert.equal(game.hero(0).main.revealed, true);
  assert.notEqual(await useSkill(game, 0, 'duanliang', [2]), null, 'đã có Binh Lương');
  assert.equal(game.distance(0, 3), 3);
  assert.equal(await useSkill(game, 0, 'duanliang', [3]), null, 'không giới hạn khoảng cách');
  assert.equal(game.delayedName(game.player(3).judgeArea[0]), 'bingliang');
  assert.equal(game.player(0).hand.length, 0);
  await take(game, 0, black);
  assert.notEqual(await useSkill(game, 0, 'duanliang', [1]), null, 'khoảng cách > 2: không dùng được nữa trong giai đoạn này');
});

test('Thiên Nghĩa: thắng đấu điểm thì Sát không giới hạn khoảng cách, +1 lần và +1 mục tiêu; thua thì không thể dùng Sát', async () => {
  const win = makeHG([['taishi_ci', 'sunquan'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['zhangjiao', 'lvbu']]).game;
  await take(win, 0, (id) => win.card(id).rank === 13);
  await take(win, 1, (id) => win.card(id).rank === 1);
  enterPlay(win, 0);
  const limit = win.slashLimit(0);
  const targets = win.maxSlashTargets(0, -1);
  assert.equal(await useSkill(win, 0, 'tianyi', [1]), null);
  assert.equal(win.slashLimit(0), limit + 1);
  assert.equal(win.maxSlashTargets(0, -1), targets + 1);
  assert.equal(win.slashRangeExempt(0, 2, null), true);
  assert.notEqual(await useSkill(win, 0, 'tianyi', [2]), null, 'mỗi giai đoạn 1 lần');

  const lose = makeHG([['taishi_ci', 'sunquan'], ['caocao', 'xuchu']]).game;
  await take(lose, 0, (id) => lose.card(id).rank === 1);
  await take(lose, 1, (id) => lose.card(id).rank === 13);
  enterPlay(lose, 0);
  assert.equal(await useSkill(lose, 0, 'tianyi', [1]), null);
  const sha = await take(lose, 0, (id) => lose.card(id).name === 'sha');
  const r = await lose.useCard(0, sha, [1]);
  assert.equal(r.ok, false);
});
