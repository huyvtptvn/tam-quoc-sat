// Sửa lỗi 22/10: Khán Phá úp ngoài lượt phải lật tướng, Hào Khôi giao cho người khác phe,
// kỹ năng đổi tướng chỉ 1 lần, Hư Thực chặn mọi loại bài.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_INFO, isRed } from '../src/core/cards.js';
import type { Card } from '../src/core/types.js';
import { loadContent } from '../src/content/loader.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { enterPlay } from './helpers.js';
import { makeHG, revealAll } from './hg-helpers.js';

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

test('Khán Phá trên tướng úp: dùng lá Đen làm Vô Giải ngoài lượt thì lật tướng', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['wolong', 'liubei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const black = await take(game, 1, (c) => !isRed(c) && c.name !== 'wuxie' && c.name !== 'wuxie_guo');
  const gh = await take(game, 0, (c) => c.name === 'guohe');
  ctrls[1].set('respond', () => ({ kind: 'card', cardId: black })).set('confirm', () => ({ kind: 'yes' }));
  enterPlay(game, 0);
  await game.useCard(0, gh, [2]);
  assert.ok(game.state.discardPile.includes(black), 'đã đánh lá Đen');
  assert.ok(game.heroes[1].main.revealed, 'Ngọa Long (Khán Phá) đã lật');
});

test('Hào Khôi: giao bài cho người thế lực xác định KHÁC phe, không giao cho đồng minh', async () => {
  const { game, ctrls } = makeHG([['chendeng', 'huatuo'], ['lvbu', 'zhangjiao'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  game.player(1).hp = game.player(1).maxHp; // đồng minh nhiều máu nhất
  game.player(2).hp = 1; game.player(3).hp = 2;
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  let pool: number[] = [];
  ctrls[0].set('chooseTargets', (r) => { pool = (r as unknown as { targets: number[] }).targets; return { kind: 'targets', targets: [pool[0]] }; });
  enterPlay(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  game.state.phase = 'discard';
  const id = game.player(0).hand[0];
  await game.moveCards([id], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'discard');
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'discard' });
  assert.ok(!game.player(1).hand.includes(id), 'đồng minh không nhận');
  assert.ok(game.player(2).hand.includes(id) || game.player(3).hand.includes(id), 'người khác phe nhận');
  if (pool.length) assert.ok(!pool.includes(1));
});

test('Kỹ năng cho đổi tướng: mỗi kỹ năng chỉ đổi được 1 lần mỗi ván', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  const grant = { owner: 0, skill: 'diancai' };
  assert.equal(await game.askTransform(0, 'thử', grant), true, 'lần 1 đổi được');
  const dep = game.heroes[0].deputy.generalId;
  assert.equal(await game.askTransform(0, 'thử', grant), false, 'lần 2 không đổi');
  assert.equal(await game.transformDeputy(0, grant), false);
  assert.equal(game.heroes[0].deputy.generalId, dep);
  assert.equal(game.transformGrantUsed(grant), true);
});

for (const kind of ['sha', 'lebu', 'guohe'] as const) {
  test(`Hư Thực (Trần Đăng úp) chặn được ${kind} nhắm riêng mình và được lật tướng`, async () => {
    const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['chendeng', 'huatuo'], ['sunquan', 'lvmeng']]);
    await game.setup();
    await revealAll(game, 0);
    const asked: { skill: string; reveal: boolean }[] = [];
    ctrls[1].set('confirm', (r) => { const x = r as { skill: string; reveal: boolean }; asked.push(x); return { kind: x.skill === 'xushi' ? 'yes' : 'no' }; });
    const c = await take(game, 0, (x) => x.name === kind);
    const hp = game.player(1).hp;
    enterPlay(game, 0);
    await game.useCard(0, c, [1]);
    assert.ok(asked.some((a) => a.skill === 'xushi' && a.reveal), 'được hỏi Hư Thực (kèm lật tướng)');
    assert.ok(game.heroes[1].main.revealed, 'Trần Đăng đã lật');
    assert.equal(game.player(1).hp, hp, 'không mất máu');
    assert.equal(game.player(1).judgeArea.length, 0, 'không có lá trong khu phán định');
    assert.ok(game.state.discardPile.includes(c), 'lá bị hủy vào chồng bỏ');
  });
}

test('Tật Lê (Sa Ma Kha): X là tầm đánh TRƯỚC khi lắp — lắp tầm 2 (lá 1) rút 1, rồi lắp tầm 3 (lá 2) rút 2', async () => {
  const { game, ctrls } = makeHG([['shamoke', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  for (const id of [...game.player(0).hand]) await game.moveCards([id], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  const w2 = await take(game, 0, (c) => CARD_INFO[c.name].slot === 'weapon' && CARD_INFO[c.name].range === 2);
  const w3 = await take(game, 0, (c) => CARD_INFO[c.name].slot === 'weapon' && CARD_INFO[c.name].range === 3);
  enterPlay(game, 0);
  assert.equal(game.attackRange(0), 1, 'tầm đánh gốc là 1');
  await game.useCard(0, w2, []);
  assert.equal(game.player(0).hand.length, 1 + 1, 'còn Thanh Long + rút 1');
  await game.useCard(0, w3, []);
  assert.equal(game.player(0).hand.length, 1 + 2, 'rút thêm 2');
  assert.equal(game.attackRange(0), 3);
});
