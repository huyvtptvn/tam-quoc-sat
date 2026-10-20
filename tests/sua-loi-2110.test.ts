// Sửa lỗi 21/10: Anh Hồn bỏ cả trang bị, Trác Vi + Hoãn Thích, Bát Trận úp, Âm Dương Ngư +2 giới hạn, Đổng Trác, phòng ngẫu nhiên.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_INFO, isRed } from '../src/core/cards.js';
import type { Card, CardName } from '../src/core/types.js';
import { loadContent } from '../src/content/loader.js';
import { getGeneral } from '../src/hegemony/generals.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { enterPlay } from './helpers.js';
import { makeHG, revealAll, stackTop, type Handler } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

async function take(game: HegemonyGame, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('không tìm thấy lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}
async function equip(game: HegemonyGame, seat: number, n: CardName): Promise<number> {
  const id = game.state.drawPile.find((i) => game.card(i).name === n)!;
  await game.moveCards([id], { kind: 'draw' }, { kind: 'equip', seat, slot: CARD_INFO[n].slot! }, 'test');
  return id;
}

test('Anh Hồn (Tôn Kiên): người bị chọn được bỏ cả trang bị', async () => {
  const { game, ctrls } = makeHG([['sunjian', 'sunquan'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  game.player(0).hp = game.player(0).maxHp - 2; // X = 2
  for (const id of [...game.player(1).hand]) await game.moveCards([id], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const horse = await equip(game, 1, 'chitu');
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('chooseTargets', () => ({ kind: 'targets', targets: [1] }))
    .set('choose', () => ({ kind: 'choice', index: 1 })); // rút 1, bỏ X=2
  let offered: number[] = [];
  ctrls[1].set('discard', (req) => { offered = (req as { cardIds: number[] }).cardIds; return { kind: 'discard', cardIds: offered.slice(0, 2) }; });
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.ok(offered.includes(horse), 'trang bị nằm trong danh sách được bỏ');
  assert.equal(offered.length, 2);
  assert.equal(game.equipOf(1, 'offHorse'), null, 'đã bỏ ngựa');
  assert.equal(game.player(1).hand.length, 0);
});

test('Trác Vi (Lục Kháng) nhận lá phán định đỏ gây sát thương mà Gia Cát Cẩn đánh thay (Hoãn Thích)', async () => {
  const { game, ctrls } = makeHG([['lukang', 'sunquan'], ['zhugejin', 'lvmeng'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['lvbu', 'pangde']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const redSha = await take(game, 1, (c) => c.name === 'sha' && isRed(c));
  stackTop(game, (c) => c.name === 'tao');
  ctrls[1].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'huanshi' ? 'yes' : 'no' }))
    .set('chooseCards', (r) => ({ kind: 'cards', cardIds: (r as { cardIds: number[] }).cardIds.includes(redSha) ? [redSha] : [] }));
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('choose', () => ({ kind: 'choice', index: 1 }));
  const card = await game.judge(0, 'thử');
  await game.finishJudge(card);
  assert.equal(card.id, redSha, 'kết quả phán định là lá Sát đỏ đánh thay');
  assert.ok(game.player(0).hand.includes(redSha), 'Lục Kháng thu lá Sát đỏ');
});

test('Bát Trận trên tướng đang úp: khi trúng Vạn Tiễn được hỏi lật tướng để phán định như Bát Quái', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['wolong', 'liubei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const asked: { skill: string; reveal: boolean }[] = [];
  ctrls[1].set('confirm', (r) => { const x = r as { skill: string; reveal: boolean }; asked.push({ skill: x.skill, reveal: x.reveal }); return { kind: 'yes' }; });
  const w = await take(game, 0, (c) => c.name === 'wanjian');
  stackTop(game, (c) => isRed(c));
  enterPlay(game, 0);
  const hp = game.player(1).hp;
  await game.useCard(0, w, []);
  assert.ok(asked.some((a) => a.skill === 'bagua' && a.reveal), 'được hỏi (kèm lật tướng)');
  assert.ok(game.heroes[1].main.revealed, 'Ngọa Long đã lật');
  assert.equal(game.player(1).hp, hp, 'phán định đỏ: coi như đánh Thiểm');
});

test('Bát Quái Trận thật: trúng Vạn Tiễn được hỏi', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await equip(game, 1, 'bagua');
  const asked: string[] = [];
  ctrls[1].set('confirm', (r) => { asked.push((r as { skill: string }).skill); return { kind: 'yes' }; });
  const w = await take(game, 0, (c) => c.name === 'wanjian');
  enterPlay(game, 0);
  await game.useCard(0, w, []);
  assert.ok(asked.includes('bagua'));
});

test('Âm Dương Ngư: đầu giai đoạn bỏ bài dùng để +2 giới hạn trữ bài', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.hero(0).marks.yinyang = 1;
  const limit = game.handLimit(0);
  while (game.player(0).hand.length < limit + 3) await take(game, 0, () => true);
  let discarded = -1;
  const yes: Handler = (r) => ({ kind: (r as { skill: string }).skill === 'mark:yinyang-limit' ? 'yes' : 'no' });
  ctrls[0].set('confirm', yes).set('discard', (r) => { discarded = (r as { count: number }).count; return { kind: 'discard', cardIds: (r as { cardIds: number[] }).cardIds.slice(0, (r as { count: number }).count) }; });
  await (game as unknown as { discardPhase(s: number): Promise<void> }).discardPhase(0);
  assert.equal(discarded, 1, 'chỉ phải bỏ 1 lá thay vì 3');
  assert.equal(game.hero(0).marks.yinyang, 0);
});

test('Đổng Trác có 4 âm dương ngư', () => {
  assert.equal(getGeneral('dongzhuo').halfHp, 4);
});
