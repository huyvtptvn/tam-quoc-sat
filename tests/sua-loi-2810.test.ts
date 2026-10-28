// Sửa lỗi theo danh sách bug 28/10 (BUG-010 → BUG-038).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { CardName, Request } from '../src/core/types.js';
import { loadContent } from '../src/content/loader.js';
import { getGeneral, isPair } from '../src/hegemony/generals.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { muniuPile } from '../src/hegemony/treasures.js';
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
const emptyHand = async (game: HegemonyGame, s: number) =>
  game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');

test('BUG-012/013: Dương Hỗ 3 âm dương ngư, Nam Hoa Lão Tiên 4 âm dương ngư', () => {
  assert.equal(getGeneral('yanghu').halfHp, 3);
  assert.equal(getGeneral('nanhualaoxian').halfHp, 4);
});

test('BUG-014 → 031: các hảo cặp mới', () => {
  for (const [a, b] of [['simayi', 'zhangchunhua'], ['simayi', 'simazhao'], ['jiangwei', 'zhonghui'], ['jiangwei', 'xiahouba'],
    ['zhanghe', 'guohuai'], ['dianwei', 'caoang'], ['caopi', 'xiahoushang'], ['caopi', 'chengyu'], ['caopi', 'caozhen'],
    ['guanyu', 'zhangfei'], ['guanyu', 'liaohua'], ['zhugeliang', 'maliang'], ['zhaoyun', 'xushu'], ['zhaoyun', 'chendao'],
    ['machao', 'yangwan'], ['wolong', 'xushu'], ['sunquan', 'zhugejin'], ['ganning', 'sufei'], ['zhouyu', 'chengpu'],
    ['sunjian', 'zumao'], ['dingfeng', 'zhugejin'], ['yuanshao', 'liufuren'], ['liaohua', 'zhangyi'], ['liyan', 'chendao']]) {
    assert.ok(isPair(a, b) && isPair(b, a), `${a} – ${b}`);
  }
});

test('BUG-011: Thành Lược (Hứa Du) kích khi đồng minh dùng Lục Lực Đồng Tâm nhiều mục tiêu', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuyou'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  const [ll] = await give(game, 0, 'lulitongxin');
  ctrls[0].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'chenglve' ? 'yes' : 'no' }));
  enterPlay(game, 0);
  const n = game.player(0).hand.length;
  await game.useCard(0, ll, [1]);
  assert.ok(game.log.some((l) => l.includes('Thành Lược')), 'Thành Lược kích hoạt');
  assert.ok(game.player(0).hand.length >= n, 'được rút bài (Lục Lực đã dùng nhưng rút lại)');
});

test('BUG-033: Lễ Phụ (Cố Ung) chọn được người có ít hơn 2 lá, họ vẫn nhận lá trên chồng bài', async () => {
  const { game } = makeHG([['zhoutai', 'guyong'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHand(game, 1);
  enterPlay(game, 0);
  assert.equal(await useSkill(game, 0, 'lifu', [], [1]), null);
  assert.equal(game.player(1).hand.length, 1, 'nhận 1 lá trên cùng chồng bài');
});

test('BUG-034: Tiên Khu vừa bốc đến 4 lá vừa xem 1 tướng úp', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  await emptyHand(game, 0);
  game.hero(0).marks.pioneer = 1;
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [1] }));
  enterPlay(game, 0);
  assert.equal(await useSkill(game, 0, 'mark:pioneer'), null);
  assert.equal(game.player(0).hand.length, 4);
  const v = game.makeView(0);
  assert.ok(v.players[1].generals!.main.generalId !== null || v.players[1].generals!.deputy.generalId !== null, 'đã thấy 1 tướng úp');
});

test('BUG-035: Thanh Long Yển Nguyệt Đao (QC) — Lưu Hiệp đang úp không lật được để dùng Thiên Mệnh', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liuxie', 'lvbu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  await equip(game, 0, 'qinglong_qc' as CardName);
  ctrls[1].set('confirm', () => ({ kind: 'yes' })).set('reveal', () => ({ kind: 'reveal', main: true, deputy: true }));
  const [s] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  if (!game.targetsAs(0, 'sha').includes(1)) return; // không trong tầm (chỗ ngồi)
  await game.useCard(0, s, [1]);
  assert.equal(game.heroes[1].main.revealed, false, 'Lưu Hiệp không được lật');
  assert.ok(!game.log.some((l) => l.includes('Thiên Mệnh')));
  assert.equal(game.player(1).flags.qinglongLock ?? 0, 0, 'mở khóa sau khi Sát xong');
});

test('BUG-036: Kiêu Cơ — bỏ 2 trang bị cùng lúc chỉ rút 1 lần', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['sunshangxiang', 'zhoutai']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHand(game, 1);
  const a = await equip(game, 1, 'qinggang');
  const b = await equip(game, 1, 'dilu');
  ctrls[1].set('confirm', () => ({ kind: 'yes' })).set('discard', () => ({ kind: 'discard', cardIds: [a, b] }));
  game.state.currentSeat = 0;
  await game.forceDiscard(1, 2, 'test', { equip: true });
  assert.equal(game.player(1).hand.length, 3, 'chỉ rút 3 lá một lần (ngoài lượt)');
});

test('BUG-037: Ty Địch — không có lựa chọn hồi máu cho chính Tào Chân', async () => {
  const { game, ctrls } = makeHG([['caozhen', 'xuchu'], ['liubei', 'guanyu'], ['caocao', 'dianwei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  game.player(0).hp = game.player(0).maxHp - 1;
  const [yu] = await give(game, 0, 'sha');
  await game.moveCards([yu], { kind: 'hand', seat: 0 }, { kind: 'special', seat: 0 }, 'sidi');
  const opts: string[][] = [];
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('chooseCards', (r) => ({ kind: 'cards', cardIds: (r as { cardIds: number[] }).cardIds.slice(0, 1) }))
    .set('choose', (r) => { opts.push((r as { options: string[] }).options); return { kind: 'choice', index: 0 }; });
  await game.bus.emit('turnStart', { seat: 1 });
  assert.ok(opts.every((o) => !o.some((x) => x.includes('hồi 1 máu'))), 'không có hồi máu khi chỉ Tào Chân mất máu');
});

test('BUG-038: cấm Công cụ thì cả lá chuyển hóa thành công cụ trì hoãn cũng không dùng được', async () => {
  const { game } = makeHG([['daqiao', 'zhoutai'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const id = game.state.drawPile.find((i) => game.card(i).suit === 'diamond' && game.card(i).type === 'basic')!;
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  enterPlay(game, 0);
  assert.equal(game.checkUse(0, id, [1], 'lebu'), null, 'bình thường dùng được Quốc Sắc');
  const f = game.player(0).flags; f.turn_banType_trick = 1; f.turn_banType_delayed = 1;
  assert.notEqual(game.checkUse(0, id, [1], 'lebu'), null);
  assert.ok(!game.makeView(0, { type: 'play', seat: 0 } as Request).hints.some((h) => h.cardId === id && h.as === 'lebu'));
});

test('BUG-010: Mộc Ngưu — bài bên dưới hiện cùng bài trên tay, dùng thẳng được; ô bảo vật ghi số lá', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHand(game, 0);
  await equip(game, 0, 'muniu');
  enterPlay(game, 0);
  const [t] = await give(game, 0, 'tao');
  assert.equal(await useSkill(game, 0, 'muniu', [t]), null);
  game.player(0).hp = game.player(0).maxHp - 1;
  const v = game.makeView(0, { type: 'play', seat: 0 } as Request);
  assert.deepEqual(v.muniuIds, [t]);
  assert.ok(v.myHand.some((c) => c.id === t), 'hiện cùng bài trên tay');
  assert.equal(v.players[0].handCount, 0, 'số bài trên tay vẫn là bài thật');
  assert.ok(v.hints.some((h) => h.cardId === t), 'có gợi ý dùng Đào từ Mộc Ngưu');
  assert.equal(game.makeView(1).players[0].muniuCount, 1, 'người khác thấy số lá');
  assert.ok(!(game.makeView(1).players[0].specialPiles ?? []).some((p) => p.name === 'Mộc Ngưu'));
  // Dùng thẳng lá dưới Mộc Ngưu trong giai đoạn ra bài
  const ask = game.ask.bind(game);
  let n = 0;
  (game as unknown as { ask: typeof ask }).ask = async (r) => (r.type === 'play' ? (n++ ? { kind: 'endPlay' } : { kind: 'useCard', cardId: t, targets: [] }) : ask(r));
  await (game as unknown as { playPhase: (s: number) => Promise<void> }).playPhase(0);
  assert.equal(game.player(0).hp, game.player(0).maxHp, 'đã dùng Đào');
  assert.equal(muniuPile(game, 0).length, 0);
});
