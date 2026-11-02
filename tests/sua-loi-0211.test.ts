// Sửa lỗi theo danh sách bug 01/11 (BUG-059 → BUG-066).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { CardName, Request } from '../src/core/types.js';
import { isBlack, isRed } from '../src/core/cards.js';
import { loadContent } from '../src/content/loader.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { enterPlay, give } from './helpers.js';
import { makeHG, revealAll } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const useSkill = (game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
const equip = async (game: HegemonyGame, seat: number, name: CardName) => {
  const [id] = await give(game, seat, name);
  await game.equip(seat, game.card(id));
  return id;
};
const emptyHands = async (game: HegemonyGame, ...seats: number[]) => {
  for (const s of seats) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
};

test('BUG-059: Kiếm Ca (Thạch Thao) dùng trang bị như Sát (gợi ý ra bài + đánh ra khi bị Nam Man)', async () => {
  const { game, ctrls } = makeHG([['zhangjiao', 'shitao'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0);
  const eq = await equip(game, 0, 'qinggang');
  enterPlay(game, 0);
  const v = game.makeView(0, { type: 'play', seat: 0 } as Request);
  assert.ok(v.hints.some((h) => h.cardId === eq && h.as === 'sha'), 'trang bị dùng được như Sát');
  // Bị Nam Man: đánh trang bị như Sát
  ctrls[0].set('respond', (_r, vv) => {
    const o = vv.responseOptions.find((x) => x.cardId === eq);
    return o ? { kind: 'card', cardId: eq } : { kind: 'pass' };
  });
  enterPlay(game, 1);
  const [nm] = await give(game, 1, 'nanman');
  const hp = game.player(0).hp;
  await game.useCard(1, nm, []);
  assert.equal(game.player(0).hp, hp, 'đã đánh Sát bằng trang bị');
  assert.equal(game.player(0).equips.weapon.length, 0);
});

test('BUG-060: Dịch Quỷ có cả công cụ nhiều mục tiêu, tác động lên người chưa xác định thế lực', async () => {
  const { game, ctrls } = makeHG([['new_zuoci', 'yuji'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const pile = game.generalPile(0, 'Hồn');
  assert.ok(pile.length >= 1);
  let names: string[] = [];
  ctrls[0].set('choose', (r) => {
    const o = (r as { options: string[]; prompt: string }).options;
    if ((r as { prompt: string }).prompt.includes('xem như dùng lá nào')) { names = o; return { kind: 'choice', index: Math.max(0, o.indexOf('Nam Man Nhập Xâm')) }; }
    return { kind: 'choice', index: 0 };
  });
  enterPlay(game, 0);
  const hp = [2, 3].map((s) => game.player(s).hp);
  assert.equal(await useSkill(game, 0, 'yigui'), null);
  assert.ok(names.includes('Nam Man Nhập Xâm'), 'có Nam Man');
  assert.ok(names.includes('Vạn Tiễn Tề Phát'), 'có Vạn Tiễn');
  assert.ok(names.some((n) => n.includes('Dĩ Dật')), 'có Dĩ Dật Đãi Lao');
  // Ghế 2, 3 chưa lật tướng: là mục tiêu hợp lệ của mọi [Hồn]
  assert.ok([2, 3].some((s, i) => game.player(s).hp < hp[i] || game.log.some((l) => l.includes(`P${s}`))), 'Nam Man tác động lên người chưa lật tướng');
});

test('BUG-061: người đang úp không cùng thế lực với ai (trừ chính mình)', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['caoang', 'dianwei'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  assert.equal(game.isSameFaction(0, 1), false);
  assert.equal(game.isSameFaction(1, 1), true);
  assert.equal(game.isDifferentFaction(0, 1), false);
  assert.equal(game.isOtherFaction(0, 1), true);
});

test('BUG-062: Kỳ Sách (Tuân Du) không có cẩm nang thế lực / công cụ thời gian', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xunyou'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  let opts: string[] = [];
  ctrls[0].set('choose', (r) => { opts = (r as { options: string[] }).options; return { kind: 'choice', index: 0 }; })
    .set('chooseTargets', (r) => ({ kind: 'targets', targets: (r as { candidates: number[] }).candidates.slice(0, 1) }));
  enterPlay(game, 0);
  await useSkill(game, 0, 'qice');
  assert.ok(opts.length > 0);
  for (const bad of ['Hiệu Lệnh Thiên Hạ', 'Khắc Phục Trung Nguyên', 'Cố Quốc An Bang', 'Văn Hòa Loạn Võ', 'Lạc Bất Tư Thục', 'Sắc Lệnh']) {
    assert.ok(!opts.includes(bad), bad);
  }
});

test('BUG-063: Di Chí (Khương Duy phó tướng) không có Gia Cát Lượng chủ tướng: Quan Tinh xem theo số người', async () => {
  const { game, ctrls } = makeHG([['liubei', 'jiangwei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  let seen = 0;
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('chooseCards', (r) => { seen = (r as { cardIds: number[] }).cardIds.length; return { kind: 'cards', cardIds: [] }; });
  game.state.currentSeat = 0;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(seen, 3, 'bàn 3 người: xem 3 lá');
});

test('BUG-064: không có đại thế lực thì không ai là tiểu thế lực; có rồi thì người chưa lật cũng là tiểu', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng'], ['zhangjiao', 'yuji'], ['caoren', 'caohong']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  assert.equal(game.hasFactionDivision(), false);
  assert.equal(game.isSmall(1), false);
  enterPlay(game, 0);
  const [ll] = await give(game, 0, 'lulitongxin');
  assert.notEqual(game.checkUse(0, ll, [1]), null, 'không dùng được Lục Lực Đồng Tâm');
  assert.equal(game.checkUse(0, ll, []), null, 'vẫn trùng chú được');
  await revealAll(game, 4); // Ngụy 2 người -> đại thế lực
  assert.equal(game.isBig(0), true);
  assert.equal(game.isSmall(1), true);
  assert.equal(game.isSmall(3), true, 'người chưa lật là tiểu thế lực');
  assert.equal(game.checkUse(0, ll, [1]), null);
});

test('BUG-065: lá ảo không chuyển hóa từ lá thật là không màu', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  const v = game.virtualCard('sha');
  assert.equal(isRed(v), false);
  assert.equal(isBlack(v), false);
  const red = game.state.drawPile.map((i) => game.card(i)).find((c) => c.suit === 'heart')!;
  assert.equal(isRed(game.virtualCard('sha', red)), true);
});

test('BUG-066: Hung Ngược cho chọn 2 [Lục] để bỏ', async () => {
  const { game, ctrls } = makeHG([['sunchen', 'caocao'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  game.addGeneralPile(0, 'Lục', ['zhaoyun', 'machao', 'huangzhong'], true);
  const prompts: string[] = [];
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('choose', (r) => { prompts.push((r as { prompt: string }).prompt); return { kind: 'choice', index: 1 }; });
  game.state.currentSeat = 0;
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'play' });
  assert.ok(prompts.filter((p) => p.includes('Hung Ngược')).length >= 2, 'được hỏi chọn [Lục]');
  assert.deepEqual(game.generalPile(0, 'Lục'), ['zhaoyun']);
});
