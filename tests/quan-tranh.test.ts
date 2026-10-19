// Bộ bài Quân Tranh và các lá mới: Chu Tước, Thư Hùng, Trượng Bát, Tá Đao, Ngũ Cốc, Hoa Lưu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeckById, DECKS } from '../src/core/cards.js';
import type { CardName, Request } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { give } from './helpers.js';
import { FIRST_OPTION, makeHG, onlySkill, revealAll } from './hg-helpers.js';

const QT = () => ({ deck: buildDeckById('quantranh') });
const emptyHands = async (game: HegemonyGame, ...seats: number[]) => {
  for (const s of seats) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
};
const equip = async (game: HegemonyGame, seat: number, name: CardName) => {
  const [id] = await give(game, seat, name);
  await game.equip(seat, game.card(id));
};

test('Bộ Quân Tranh: 160 lá, đúng số lượng các lá chính', () => {
  const deck = buildDeckById('quantranh');
  assert.equal(deck.length, 160);
  const count = (pred: (c: (typeof deck)[number]) => boolean) => deck.filter(pred).length;
  assert.equal(count((c) => c.name === 'sha' && !c.nature), 30);
  assert.equal(count((c) => c.nature === 'fire'), 5);
  assert.equal(count((c) => c.nature === 'thunder'), 9);
  assert.equal(count((c) => c.name === 'shan'), 24);
  assert.equal(count((c) => c.name === 'tao'), 12);
  assert.equal(count((c) => c.name === 'wuxie'), 7);
  // Mỗi chất đủ 40 lá
  for (const suit of ['spade', 'heart', 'club', 'diamond']) assert.equal(count((c) => c.suit === suit), 40, suit);
  assert.equal(buildDeckById('khong-co').length, buildDeckById(undefined).length, 'id lạ -> bộ mặc định');
  assert.ok(DECKS.quocchien && DECKS.quantranh);
});

test('Chu Tước Vũ Phiến: Sát thường thành Hỏa Sát, xuyên Đằng Giáp và +1 sát thương', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']], QT());
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  await equip(game, 0, 'zhuque');
  await equip(game, 1, 'tengjia');
  ctrls[0].set('confirm', onlySkill('zhuque'));
  const s = game.state.drawPile.find((i) => game.card(i).name === 'sha' && !game.card(i).nature)!;
  await game.moveCards([s], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  game.state.phase = 'play';
  game.player(1).hp = game.player(1).maxHp = 4;
  assert.equal((await game.useCard(0, s, [1])).ok, true);
  assert.equal(game.player(1).hp, 2, 'Hỏa Sát + Đằng Giáp = 2 sát thương');
});

test('Thư Hùng Song Cổ Kiếm: Sát người khác giới -> họ bỏ 1 lá', async () => {
  const { game, ctrls } = makeHG([['liubei', 'guanyu'], ['zhenji', 'xuchu']], QT());
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  assert.equal(game.isFemale(1), true);
  assert.equal(game.isFemale(0), false);
  await equip(game, 0, 'cixiong');
  await give(game, 1, 'tao', 'tao');
  ctrls[0].set('confirm', onlySkill('cixiong'));
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 0 }));
  const [s] = await give(game, 0, 'sha');
  game.state.phase = 'play';
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hand.length, 1, 'bỏ 1 trong 2 lá Đào');
});

test('Trượng Bát Xà Mâu: 2 lá như Sát khi đáp Nam Man, và chủ động dùng như Sát', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']], QT());
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  await equip(game, 1, 'zhangba');
  await give(game, 1, 'tao', 'shan');
  ctrls[1].set('confirm', onlySkill('zhangba'));
  const [nm] = await give(game, 0, 'nanman');
  game.state.phase = 'play';
  const hp1 = game.player(1).hp;
  await game.useCard(0, nm, []);
  assert.equal(game.player(1).hp, hp1, 'đã đáp bằng 2 lá');
  assert.equal(game.player(1).hand.length, 0);
  assert.equal(game.totalCards(), game.cards.size);

  // Chủ động: lượt của P1, ghép 2 lá thành Sát vào P0
  game.state.currentSeat = 1;
  game.player(1).flags = {};
  const ids = await give(game, 1, 'tao', 'shan');
  const hp0 = game.player(0).hp;
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(1, { kind: 'useSkill', skill: 'zhangba', cardIds: ids, targets: [0] });
  assert.equal(err, null);
  assert.equal(game.player(0).hp, hp0 - 1);
  assert.equal(game.player(1).flags.shaUsed, 1, 'tính vào số lần Sát');
});

test('Tá Đao Sát Nhân: không chịu Sát thì giao vũ khí', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']], QT());
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await emptyHands(game, 0, 1, 2);
  await equip(game, 1, 'qinggang');
  ctrls[0].set('chooseTargets', (r: Request) => ({ kind: 'targets', targets: [(r as { candidates: number[] }).candidates.includes(2) ? 2 : 0] }));
  const [jd] = await give(game, 0, 'jiedao');
  game.state.phase = 'play';
  assert.equal((await game.useCard(0, jd, [1])).ok, true);
  assert.equal(game.player(1).equips.weapon.length, 0);
  assert.ok(game.player(0).hand.some((id) => game.card(id).name === 'qinggang'));
});

test('Tá Đao Sát Nhân: có Sát thì phải Sát người được chọn', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']], QT());
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await emptyHands(game, 0, 1, 2);
  await equip(game, 1, 'qinggang');
  await give(game, 1, 'sha');
  ctrls[1].set('respond', FIRST_OPTION);
  ctrls[0].set('chooseTargets', (r: Request) => ({ kind: 'targets', targets: [(r as { candidates: number[] }).candidates.includes(2) ? 2 : 0] }));
  const [jd] = await give(game, 0, 'jiedao');
  game.state.phase = 'play';
  const victim = game.player(2);
  const hp = victim.hp;
  await game.useCard(0, jd, [1]);
  assert.equal(game.player(1).equips.weapon.length, 1, 'giữ được vũ khí');
  assert.equal(victim.hp, hp - 1);
});

test('Ngũ Cốc Phong Đăng: mỗi người lấy 1 lá, không còn lá thừa ở vùng xử lý', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']], QT());
  await game.setup();
  await emptyHands(game, 0, 1, 2);
  const [wg] = await give(game, 0, 'wugu');
  game.state.phase = 'play';
  await game.useCard(0, wg, []);
  assert.deepEqual([0, 1, 2].map((s) => game.player(s).hand.length), [1, 1, 1]);
  assert.equal(game.state.processing.length, 0);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Hoa Lưu là ngựa +1', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']], QT());
  await game.setup();
  const d = game.distance(0, 1);
  await equip(game, 1, 'hualiu');
  assert.equal(game.distance(0, 1), d + 1);
});

test('Bộ Quân Tranh: 40 ván bot không lỗi, không mất lá', async () => {
  const { HegemonyGame } = await import('../src/hegemony/game.js');
  const { HegemonyBot } = await import('../src/hegemony/bot.js');
  for (let seed = 1; seed <= 40; seed++) {
    const n = 4 + (seed % 4);
    const game = new HegemonyGame(Array.from({ length: n }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })),
      { seed, deck: buildDeckById('quantranh'), maxTurns: 120 });
    await game.run();
    assert.equal(game.totalCards(), game.cards.size, `seed ${seed}`);
  }
});

test('Lá chuyển hóa thành cẩm nang trì hoãn giữ tên khi bị chuyển sang khu vực phán định khác', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']], QT());
  await game.setup();
  const [x] = await give(game, 0, 'shan');
  await game.moveCards([x], { kind: 'hand', seat: 0 }, { kind: 'judge', seat: 1 }, 'test');
  (game as unknown as { delayedAs: Map<number, CardName> }).delayedAs.set(x, 'lebu');
  await game.moveCards([x], { kind: 'judge', seat: 1 }, { kind: 'judge', seat: 0 }, 'test');
  assert.equal(game.delayedName(x), 'lebu');
  await game.moveCards([x], { kind: 'judge', seat: 0 }, { kind: 'discard' }, 'test');
  assert.equal(game.delayedName(x), 'shan');
});

test('Bộ Ứng Biến: 143 lá (161 trong bảng − 18 lá chưa dùng), có Thủy Yêm, Mộc Ngưu', async () => {
  const deck = buildDeckById('ungbien');
  assert.equal(deck.length, 143);
  assert.equal(deck.filter((c) => c.name === 'shuiyan').length, 2);
  assert.equal(deck.filter((c) => c.name === 'muniu').length, 1);
  assert.equal(deck.filter((c) => c.nature === 'thunder').length, 11);
  assert.equal(deck.filter((c) => c.nature === 'fire').length, 6);
  const { HegemonyGame } = await import('../src/hegemony/game.js');
  const { HegemonyBot } = await import('../src/hegemony/bot.js');
  for (let seed = 1; seed <= 30; seed++) {
    const game = new HegemonyGame(Array.from({ length: 4 + (seed % 4) }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })),
      { seed, deck: buildDeckById('ungbien'), maxTurns: 120 });
    await game.run();
    assert.equal(game.totalCards(), game.cards.size, `seed ${seed}`);
  }
});
