// Ô bảo vật (Ngọc Tỷ, Mộc Ngưu Lưu Mã, Định Lan Dạ Minh Châu) và Thủy Yêm Thất Quân.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandardDeck } from '../src/core/cards.js';
import type { CardName, Request } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { muniuPile } from '../src/hegemony/treasures.js';
import { give } from './helpers.js';
import { makeHG, revealAll } from './hg-helpers.js';

const useSkill = (game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
const emptyHands = async (game: HegemonyGame, ...seats: number[]) => {
  for (const s of seats) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
};
const equip = async (game: HegemonyGame, seat: number, name: CardName) => {
  const [id] = await give(game, seat, name);
  await game.equip(seat, game.card(id));
  return id;
};

test('Bảo vật nằm ở ô riêng, không đẩy trang bị khác ra', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await equip(game, 0, 'qinggang');
  await equip(game, 0, 'yuxi');
  assert.equal(game.weaponName(0), 'qinggang');
  assert.equal(game.equipOf(0, 'treasure')?.name, 'yuxi');
  assert.equal(game.equipCount(0), 2);
});

test('Ngọc Tỷ: đã lật tướng thì bốc thêm 1 lá và coi như dùng Tri Kỷ Tri Bỉ', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  await emptyHands(game, 0);
  await equip(game, 0, 'yuxi');
  ctrls[0].set('chooseTargets', (r: Request) => ({ kind: 'targets', targets: (r as { candidates: number[] }).candidates.slice(0, 1) }));
  await game.runTurn(0);
  assert.ok(game.log.some((l) => l.includes('Ngọc Tỷ: P0 bốc thêm 1 lá')));
  assert.ok(game.log.some((l) => l.includes('Tri Kỷ Tri Bỉ (Ngọc Tỷ)')));
});

test('Ngọc Tỷ: chưa lật tướng nào thì không có hiệu lực', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await equip(game, 0, 'yuxi');
  await game.runTurn(0);
  assert.ok(!game.log.some((l) => l.includes('Ngọc Tỷ: P0 bốc thêm') || l.includes('(Ngọc Tỷ)')));
});

test('Mộc Ngưu Lưu Mã: cất bài, đánh Thiểm từ dưới Mộc Ngưu, chuyển cho người khác', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await emptyHands(game, 0, 1, 2);
  await equip(game, 1, 'muniu');
  game.state.currentSeat = 1;
  game.state.phase = 'play';
  const [shan] = await give(game, 1, 'shan');
  assert.equal(await useSkill(game, 1, 'muniu', [shan]), null);
  assert.deepEqual(muniuPile(game, 1), [shan]);
  assert.equal(game.player(1).hand.length, 0);
  assert.notEqual(await useSkill(game, 1, 'muniu', []), null, 'mỗi giai đoạn 1 lần');

  // P0 Sát P1: P1 lấy Thiểm từ Mộc Ngưu ra đánh
  ctrls[1].set('confirm', () => ({ kind: 'yes' })).set('chooseCards', (r: Request) => ({ kind: 'cards', cardIds: (r as { cardIds: number[] }).cardIds.slice(0, 1) }))
    .set('respond', (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' }));
  game.state.currentSeat = 0;
  game.player(0).flags = {};
  const [s] = await give(game, 0, 'sha');
  const hp1 = game.player(1).hp;
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hp, hp1, 'đã né bằng Thiểm dưới Mộc Ngưu');
  assert.equal(muniuPile(game, 1).length, 0);

  // Lượt sau của P1: cất 1 lá rồi chuyển Mộc Ngưu cho P2, lá đi theo
  game.state.currentSeat = 1;
  game.player(1).flags = {};
  const [x] = await give(game, 1, 'tao');
  ctrls[1].set('chooseTargets', () => ({ kind: 'targets', targets: [2] }));
  assert.equal(await useSkill(game, 1, 'muniu', [x]), null);
  assert.equal(game.equipOf(2, 'treasure')?.name, 'muniu');
  assert.deepEqual(muniuPile(game, 2), [x]);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Mộc Ngưu Lưu Mã: bị phá thì các lá bên dưới vào chồng bỏ', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  await equip(game, 1, 'muniu');
  game.state.currentSeat = 1;
  game.state.phase = 'play';
  const [t] = await give(game, 1, 'tao');
  await useSkill(game, 1, 'muniu', [t]);
  ctrls[0].set('choose', (r: Request) => ({ kind: 'choice', index: (r as { options: string[] }).options.findIndex((o) => o.startsWith('Bảo vật')) }));
  game.state.currentSeat = 0;
  const [gh] = await give(game, 0, 'guohe');
  await game.useCard(0, gh, [1]);
  assert.equal(game.equipOf(1, 'treasure'), null);
  assert.ok(game.state.discardPile.includes(t));
  assert.equal(game.player(1).special.length, 0);
});

test('Định Lan Dạ Minh Châu: người không có Chế Hoành được dùng Chế Hoành (tối đa máu tối đa lá)', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await equip(game, 0, 'mingzhu');
  game.state.phase = 'play';
  const max = game.player(0).maxHp;
  const many = await give(game, 0, ...Array<CardName>(max + 1).fill('sha'));
  assert.notEqual(await useSkill(game, 0, 'mingzhu', many), null, 'quá số lá cho phép');
  const n = game.player(0).hand.length;
  assert.equal(await useSkill(game, 0, 'mingzhu', many.slice(0, 2)), null);
  assert.equal(game.player(0).hand.length, n);
});

test('Định Lan Dạ Minh Châu: Tôn Quyền đã có Chế Hoành thì bỏ giới hạn số lá', async () => {
  const { game } = makeHG([['sunquan', 'lvmeng'], ['caocao', 'xuchu']]);
  await game.setup();
  game.state.phase = 'play';
  const max = game.player(0).maxHp;
  const many = await give(game, 0, ...Array<CardName>(max + 2).fill('sha'));
  assert.notEqual(await useSkill(game, 0, 'chehoanh', many), null, 'không có Minh Châu: tối đa máu tối đa');
  await equip(game, 0, 'mingzhu');
  assert.ok(!game.skillEntries(0).some((e) => e.skill.id === 'mingzhu' && e.skill.active!.available(game, 0)), 'không có thêm nút Minh Châu');
  assert.equal(await useSkill(game, 0, 'chehoanh', many), null);
});

test('Thủy Yêm Thất Quân: chỉ dùng lên người có trang bị; họ chọn bỏ hết trang bị', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [sy] = await give(game, 0, 'shuiyan');
  game.state.phase = 'play';
  assert.equal((await game.useCard(0, sy, [1])).ok, false, 'người không có trang bị thì không dùng được');
  await equip(game, 1, 'qinggang');
  await equip(game, 1, 'yuxi');
  const hp = game.player(1).hp;
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 0 }));
  assert.equal((await game.useCard(0, sy, [1])).ok, true);
  assert.equal(game.equipCount(1), 0);
  assert.equal(game.player(1).hp, hp);
});

test('Thủy Yêm Thất Quân: chọn chịu 1 sát thương lôi', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await equip(game, 1, 'chitu');
  const [sy] = await give(game, 0, 'shuiyan');
  game.state.phase = 'play';
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 1 }));
  const hp = game.player(1).hp;
  await game.useCard(0, sy, [1]);
  assert.equal(game.player(1).hp, hp - 1);
  assert.equal(game.equipCount(1), 1);
  assert.ok(game.log.some((l) => l.includes('sát thương lôi')));
});

test('Bộ Quốc Chiến có 3 bảo vật và 2 Thủy Yêm; 40 ván bot không lỗi', async () => {
  const names = buildStandardDeck().map((c) => c.name);
  for (const n of ['yuxi', 'muniu', 'mingzhu'] as CardName[]) assert.equal(names.filter((x) => x === n).length, 1, n);
  assert.equal(names.filter((x) => x === 'shuiyan').length, 2);
  const { HegemonyGame } = await import('../src/hegemony/game.js');
  const { HegemonyBot } = await import('../src/hegemony/bot.js');
  for (let seed = 1; seed <= 40; seed++) {
    const n = 4 + (seed % 4);
    const game = new HegemonyGame(Array.from({ length: n }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })), { seed, maxTurns: 120 });
    await game.run();
    assert.equal(game.totalCards(), game.cards.size, `seed ${seed}`);
  }
});


