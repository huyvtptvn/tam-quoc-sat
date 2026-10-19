// Test nhóm B: tướng Bất Thần / Quyền / Tung Hoành Bãi Hạp... (content/scripts/goi-bat-than.mjs).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/loader.js';
import { GENERALS } from '../src/hegemony/generals.js';
import { SKILLS } from '../src/hegemony/skills.js';
import type { Card, Request } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { give } from './helpers.js';
import { makeHG, revealAll, onlySkill, YES, isBlack } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const chooseFirst = (req: Request) => ({ kind: 'targets' as const, targets: (req as { candidates: number[] }).candidates.slice(0, 1) });
const useSkill = (game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
const play = (game: HegemonyGame, seat: number) => { game.state.currentSeat = seat; game.state.phase = 'play'; };
async function clearHand(game: HegemonyGame, seat: number) {
  await game.moveCards([...game.player(seat).hand], { kind: 'hand', seat }, { kind: 'discard' }, 'test');
}
/** Đưa 1 lá thỏa điều kiện từ chồng bốc vào tay. */
async function take(game: HegemonyGame, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('không tìm thấy lá');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}
async function equip(game: HegemonyGame, seat: number, slot: 'weapon' | 'defHorse') {
  const id = game.state.drawPile.find((i) => game.card(i).type === 'equip' && game.cardInfo(game.card(i).name).slot === slot)!;
  await game.moveCards([id], { kind: 'draw' }, { kind: 'equip', seat, slot }, 'test');
  return id;
}
const dmg = (game: HegemonyGame, source: number | null, target: number, amount = 1) =>
  game.damage({ source, target, amount, card: null, cancelled: false });

const IDS = ['mengda', 'tangzi', 'zhanglu', 'shixie', 'zhonghui', 'dongzhao', 'yanbaihu', 'simazhao', 'sunchen', 'wenqin',
  'gongsunyuan', 'liuba', 'zhuling', 'cuiyanmaojie', 'lifeng', 'yangwan', 'zongyux', 'fengxi', 'yanghu'];

test('nhóm B: 19 tướng đều được bật và có đủ kỹ năng', () => {
  const list = JSON.parse(readFileSync('content/generals/bat-than.json', 'utf8')).filter((g: { id?: string }) => g.id);
  for (const id of IDS) {
    const g = list.find((x: { id: string }) => x.id === id);
    assert.ok(g && !g.disabled, `${id} phải được bật`);
    assert.ok(GENERALS.some((x) => x.id === id), `${id} không có trong GENERALS`);
    for (const s of g.skills) assert.ok(SKILLS[s], `${id}: thiếu kỹ năng ${s}`);
  }
  for (const id of ['zhonghui', 'simazhao', 'sunchen', 'gongsunyuan']) assert.equal(GENERALS.find((x) => x.id === id)!.kingdom, 'ye');
});

test('Mạnh Đạt — Cầu An chặn sát thương, Lượng Phản mất 1 máu và thu lại [Hàm]', async () => {
  const { game, ctrls } = makeHG([['mengda', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('qiuan'));
  const [s] = await give(game, 1, 'sha');
  play(game, 1);
  const hp = game.player(0).hp;
  const r = await game.useCard(1, s, [0]);
  assert.equal(r.ok, true);
  assert.equal(game.player(0).hp, hp, 'sát thương bị chặn');
  assert.deepEqual(game.player(0).special, [s], 'lá Sát thành [Hàm]');
  game.state.currentSeat = 0;
  game.state.phase = 'start';
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(game.player(0).hp, hp - 1);
  assert.ok(game.player(0).hand.includes(s), 'thu lại [Hàm]');
  assert.equal(game.player(0).special.length, 0);
});

test('Đường Tư — Hưng Thạo 2+: sau khi chịu sát thương, người ít bài hơn rút 1 lá', async () => {
  const { game } = makeHG([['tangzi', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.player(1).hp -= 1; // Thục có người bị thương
  await clearHand(game, 0);
  await dmg(game, 1, 0); // Ngụy cũng có người bị thương -> 2 thế lực
  assert.equal(game.player(0).hand.length, 1, 'Đường Tư (ít bài hơn) rút 1 lá');
  game.state.phase = 'discard';
  assert.equal(game.handLimit(0), game.player(0).hp, 'chưa đủ 3 thế lực bị thương thì không +4');
});

test('Trương Lỗ — Mễ Đạo đặt [Mễ] rồi thay lá phán định; Bố Thí nhận [Nghĩa Xá]', async () => {
  const { game, ctrls } = makeHG([['zhanglu', 'huatuo'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('midao'));
  await game.runTurn(0);
  assert.equal(game.player(0).special.length, 2, 'có 2 [Mễ]');
  assert.ok(game.log.some((l) => l.includes('[Nghĩa Xá]')), 'cuối lượt nhận Nghĩa Xá');
  const mi = [...game.player(0).special];
  const j = await game.judge(1, 'thử');
  assert.ok(mi.includes(j.id), 'kết quả phán định là lá [Mễ]');
  assert.equal(game.player(0).special.length, 1);
  await game.finishJudge(j);
  // Bố Thí: đầu giai đoạn chuẩn bị của người khác, giao 1 lá -> rút 2
  ctrls[0].set('confirm', onlySkill('bushi'));
  const before = game.player(0).hand.length;
  game.state.currentSeat = 1;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'start' });
  assert.equal(game.player(0).hand.length, before + 1);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Sĩ Nhiếp — Tị Loạn tăng khoảng cách, Lễ Hạ cho Sĩ Nhiếp rút 1 lá', async () => {
  const { game } = makeHG([['shixie', 'sunquan'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await equip(game, 0, 'defHorse');
  assert.equal(game.distance(1, 0), 3, '1 + ngựa +1 + Tị Loạn 1');
  const before = game.player(0).hand.length;
  game.state.currentSeat = 1;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'start' });
  assert.equal(game.player(0).hand.length, before + 1);
});

test('Chung Hội — Quyền Kế đặt [Quyền], Bài Dị cho rút bài', async () => {
  const { game, ctrls } = makeHG([['zhonghui', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  assert.equal(game.hero(0).careerist, true, 'Chung Hội là dã tâm gia');
  ctrls[0].set('confirm', onlySkill('quanji'));
  game.state.currentSeat = 0;
  await dmg(game, 1, 0);
  await dmg(game, 1, 0); // cùng lượt, cùng thời điểm: không kích hoạt lần 2
  await dmg(game, 0, 1);
  assert.equal(game.player(0).special.length, 2, '2 [Quyền]');
  game.state.phase = 'discard';
  assert.equal(game.handLimit(0), game.player(0).hp + 2);
  play(game, 0);
  const h1 = game.player(1).hand.length;
  const err = await useSkill(game, 0, 'paiyi', [], [1]);
  assert.equal(err, null);
  assert.equal(game.player(0).special.length, 1);
  assert.equal(game.player(1).hand.length, h1 + 1, 'rút X = 1 lá');
});

test('Đổng Chiêu — Tạc Vận bỏ X lá, khoảng cách thành 1, gây 1 sát thương', async () => {
  const { game } = makeHG([['dongzhao', 'xuchu'], ['liubei', 'zhangfei'], ['zhaoyun', 'machao'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 2);
  play(game, 0);
  assert.equal(game.distance(0, 2), 2);
  const hp = game.player(2).hp;
  const hand = game.player(0).hand.length;
  assert.equal(await useSkill(game, 0, 'zaoyun', [], [2]), null);
  assert.equal(game.player(2).hp, hp - 1);
  assert.equal(game.player(0).hand.length, hand - 1);
  assert.equal(game.distance(0, 2), 1);
});

test('Đổng Chiêu — Khuyến Tiến chỉ chọn được người đã chịu sát thương trong giai đoạn này', async () => {
  const { game } = makeHG([['dongzhao', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  play(game, 0);
  const c = game.player(0).hand[0];
  assert.notEqual(await useSkill(game, 0, 'quanjin', [c], [1]), null, 'chưa ai chịu sát thương');
  await dmg(game, 0, 1);
  assert.equal(await useSkill(game, 0, 'quanjin', [c], [1]), null);
  assert.ok(game.player(1).hand.includes(c));
});

test('Nghiêm Bạch Hổ — Ký Li: sát thương lần 2 trong giai đoạn bị chặn và loại bỏ tướng', async () => {
  const { game } = makeHG([['yanbaihu', 'huatuo'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.state.currentSeat = 1;
  game.state.phase = 'play';
  const hp = game.player(0).hp;
  await dmg(game, 1, 0);
  await dmg(game, 1, 0);
  assert.equal(game.player(0).hp, hp - 1);
  assert.equal(game.hero(0).main.removed, true);
});

test('Nghiêm Bạch Hổ — Trĩ Đạo: chỉ được chọn người đã chọn làm mục tiêu, khoảng cách là 1', async () => {
  const { game, ctrls } = makeHG([['yanbaihu', 'huatuo'], ['liubei', 'zhangfei'], ['zhaoyun', 'machao'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('chooseTargets', (req) => ({ kind: 'targets', targets: (req as { candidates: number[] }).candidates.includes(2) ? [2] : [] }));
  play(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.distance(0, 2), 1);
  assert.equal(game.canTarget(0, 1), false);
  assert.equal(game.canTarget(0, 2), true);
});

test('Tư Mã Chiêu — Túc Trí: Sát trong lượt gây thêm 1; chưa đủ 3 lần thì nhận Phản Quỹ', async () => {
  const { game } = makeHG([['simazhao', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [s] = await give(game, 0, 'sha');
  play(game, 0);
  const hp = game.player(1).hp;
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hp, hp - 2);
  await game.bus.emit('turnEnd', { seat: 0 });
  assert.ok(game.grantedSkills(0).includes('phanquy'));
  await game.bus.emit('turnStart', { seat: 0 });
  assert.ok(!game.grantedSkills(0).includes('phanquy'), 'đầu lượt sau mất Phản Quỹ');
});

test('Tôn Lâm — Thị Lực: giết người thì nhận tướng của họ + 2 tướng từ chồng làm [Lục]', async () => {
  const { game, ctrls } = makeHG([['sunchen', 'xuchu'], ['liubei', 'zhangfei'], ['caocao', 'dianwei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('shilu'));
  game.player(2).hp = 1;
  await dmg(game, 0, 2);
  assert.equal(game.player(2).alive, false);
  const pile = game.generalPile(0, 'Lục');
  assert.equal(pile.length, 4);
  assert.ok(pile.includes('caocao') && pile.includes('dianwei'));
});

test('Tôn Lâm — Hung Ngược: bỏ [Lục], sát thương lên người cùng thế lực với [Lục] +1', async () => {
  const { game, ctrls } = makeHG([['sunchen', 'xuchu'], ['liubei', 'zhangfei'], ['caocao', 'dianwei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  game.addGeneralPile(0, 'Lục', ['zhaoyun'], true);
  ctrls[0].set('confirm', onlySkill('xiongnve'));
  play(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.generalPile(0, 'Lục').length, 0);
  const h1 = game.player(1).hp, h2 = game.player(2).hp;
  await dmg(game, 0, 1);
  await dmg(game, 0, 2);
  assert.equal(game.player(1).hp, h1 - 2, 'Thục: +1');
  assert.equal(game.player(2).hp, h2 - 1, 'Ngụy: không');
});

test('Văn Khâm — Căng Phạt: mục tiêu không có trang bị thì để Văn Khâm lấy 1 lá', async () => {
  const { game } = makeHG([['wenqin', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  play(game, 0);
  const h0 = game.player(0).hand.length, h1 = game.player(1).hand.length;
  assert.equal(await useSkill(game, 0, 'jinfa', [game.player(0).hand[0]], [1]), null);
  assert.equal(game.player(0).hand.length, h0);
  assert.equal(game.player(1).hand.length, h1 - 1);
});

test('Công Tôn Uyên — Hoài Dị lấy trang bị làm [Dị]; Tứ Tuy rút thêm và trận vong khi quá nhiều [Dị]', async () => {
  const { game, ctrls } = makeHG([['gongsunyuan', 'xuchu'], ['liubei', 'zhangfei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await clearHand(game, 0);
  await clearHand(game, 1);
  await take(game, 0, (c) => !isBlack(c) && c.type === 'basic');
  await take(game, 0, (c) => isBlack(c) && c.type === 'basic');
  await take(game, 0, (c) => isBlack(c) && c.type === 'basic');
  const w = await equip(game, 1, 'weapon');
  ctrls[0].set('chooseTargets', (req) => ({ kind: 'targets', targets: (req as { candidates: number[] }).candidates.filter((t) => t === 1) }));
  play(game, 0);
  assert.equal(await useSkill(game, 0, 'huaiyi'), null);
  assert.equal(game.player(0).hand.length, 2, 'bỏ 1 lá đỏ (màu ít hơn)');
  assert.deepEqual(game.player(0).special, [w], 'vũ khí thành [Dị]');
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.count, 3);
  // Dùng [Dị]: lắp vào khu vực trang bị
  assert.equal(await useSkill(game, 0, 'huaiyi_di'), null);
  assert.equal(game.player(0).equips.weapon[0], w);
});

test('Công Tôn Uyên — Tứ Tuy: số [Dị] > giới hạn máu thì trận vong ở giai đoạn kết thúc', async () => {
  const { game, ctrls } = makeHG([['gongsunyuan', 'xuchu'], ['liubei', 'zhangfei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('chooseTargets', (req) => ({ kind: 'targets', targets: (req as { candidates: number[] }).candidates.filter((t) => t === 1) }));
  const mhp = game.player(0).maxHp;
  for (let i = 0; i <= mhp; i++) {
    const w = await equip(game, 1, 'weapon');
    await clearHand(game, 0);
    await clearHand(game, 1);
    await take(game, 0, (c) => !isBlack(c) && c.type === 'basic');
    await take(game, 0, (c) => isBlack(c) && c.type === 'basic');
    game.player(0).flags = {};
    play(game, 0);
    assert.equal(await useSkill(game, 0, 'huaiyi'), null);
    assert.ok(game.player(0).special.includes(w));
  }
  assert.equal(game.player(0).special.length, mhp + 1);
  await game.runTurn(0);
  assert.equal(game.player(0).alive, false);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Lưu Ba — Quy Ẩn: người cùng thế lực hồi đầy máu, loại bỏ Lưu Ba', async () => {
  const { game } = makeHG([['liuba', 'zhangfei'], ['zhaoyun', 'machao'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  game.player(0).hp = 1;
  game.player(1).hp = 1;
  game.player(2).hp = 1;
  play(game, 0);
  assert.equal(await useSkill(game, 0, 'qingyin'), null);
  assert.equal(game.player(0).hp, game.player(0).maxHp);
  assert.equal(game.player(1).hp, game.player(1).maxHp);
  assert.equal(game.player(2).hp, 1, 'khác thế lực không hồi');
  assert.equal(game.hero(0).main.removed, true);
  assert.notEqual(await useSkill(game, 0, 'qingyin'), null, 'hạn định: không dùng lại');
});

test('Lưu Ba — Trù Độ: người cùng thế lực rút số lá đã bỏ ở giai đoạn bỏ bài', async () => {
  const { game, ctrls } = makeHG([['liuba', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('tongdu'));
  game.player(0).hp = 1; // giới hạn bài 1 -> bỏ nhiều lá
  await game.runTurn(0);
  const d = game.lastDiscardPhase!;
  assert.ok(d.ids.length > 0);
  assert.equal(game.player(0).hand.length, 1 + Math.min(3, d.ids.length));
});

test('Chu Linh — Trấn Vệ: mất 1 máu, cuối giai đoạn bỏ bài người khác bỏ X lá hoặc chịu sát thương', async () => {
  const { game, ctrls } = makeHG([['zhuling', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('juejue'));
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 1 })); // chịu sát thương
  const hp0 = game.player(0).hp, hp1 = game.player(1).hp;
  await game.runTurn(0);
  assert.equal(game.player(0).hp, hp0 - 1);
  assert.equal(game.player(1).hp, hp1 - 1);
});

test('Chu Linh — Trấn Vệ: giết người cùng thế lực thì bỏ qua thưởng phạt', async () => {
  const { game } = makeHG([['zhuling', 'xuchu'], ['caocao', 'dianwei'], ['liubei', 'zhangfei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  const h = game.player(0).hand.length;
  game.player(1).hp = 1;
  await dmg(game, 0, 1);
  assert.equal(game.player(1).alive, false);
  assert.equal(game.player(0).hand.length, h, 'không bị bỏ hết bài');
});

test('Thôi Diễm & Mao Giới — Chinh Tịch: giao 1 lá cơ bản, nhận lại 2 lá cơ bản', async () => {
  const { game, ctrls } = makeHG([['cuiyanmaojie', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clearHand(game, 0);
  await clearHand(game, 1);
  const [sh] = await give(game, 0, 'shan');
  await give(game, 1, 'sha', 'sha');
  ctrls[0].set('confirm', onlySkill('zhengbi')).set('chooseTargets', chooseFirst);
  play(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.player(0).hand.length, 2);
  assert.ok(game.player(0).hand.every((id) => game.card(id).name === 'sha'));
  assert.ok(game.player(1).hand.includes(sh));
});

test('Thôi Diễm & Mao Giới — Phụng Nghênh: cả tay bài thành Hiệp Thiên Tử, người cùng thế lực bổ sung bài', async () => {
  const { game } = makeHG([['cuiyanmaojie', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  play(game, 0);
  assert.equal(await useSkill(game, 0, 'fengying'), null);
  assert.equal(game.player(0).hand.length, game.player(0).maxHp);
  assert.equal(game.player(0).flags.turn_xietianzi, 1);
});

test('Lý Phong — Truân Trữ: rút thêm 2, không dùng được Sát, đặt [Lương]; Thâu Lương cho rút 2', async () => {
  const { game, ctrls } = makeHG([['lifeng', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', YES);
  game.state.currentSeat = 0;
  game.state.phase = 'draw';
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.count, 4);
  await give(game, 0, 'sha');
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'draw' });
  assert.ok(game.player(0).special.length >= 1);
  play(game, 0);
  const s = game.player(0).hand.find((id) => game.card(id).name === 'sha')!;
  assert.notEqual(game.checkUse(0, s, [1]), null, 'không thể dùng Sát');
  const n = game.player(0).special.length;
  const h = game.player(0).hand.length;
  game.state.phase = 'end';
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  assert.equal(game.player(0).special.length, n - 1);
  assert.equal(game.player(0).hand.length, h + 2);
});

test('Dương Uyển — Dụ Ngôn: bỏ bài trong lượt thì lấy các lá khác chất trong 4 lá lật ra', async () => {
  const { game, ctrls } = makeHG([['yangwan', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('youyan'));
  play(game, 0);
  const top = game.state.drawPile.slice(-4);
  const id = game.player(0).hand[0];
  const suit = game.card(id).suit;
  const expect = top.filter((x) => game.card(x).suit !== suit);
  await game.moveCards([id], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'skill');
  for (const x of expect) assert.ok(game.player(0).hand.includes(x));
  assert.equal(game.totalCards(), game.cards.size);
});

test('Dương Uyển — Truy Hoàn: người nhận [Sát thương] gây 1 sát thương cho nguồn', async () => {
  const { game, ctrls } = makeHG([['yangwan', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('zhuihuan')).set('chooseTargets', (req) => ({ kind: 'targets', targets: (req as { candidates: number[] }).candidates.filter((t) => t === 0) }));
  game.state.currentSeat = 0;
  await game.bus.emit('turnEnd', { seat: 0 });
  const hp1 = game.player(1).hp;
  game.state.currentSeat = 1;
  await dmg(game, 1, 0);
  assert.equal(game.player(1).hp, hp1 - 1);
});

test('Tông Dự — Khí Ngạo: bị người khác thế lực chọn làm mục tiêu, bỏ 1 lá của họ rồi bỏ 1 lá', async () => {
  const { game, ctrls } = makeHG([['zongyux', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('qiao'));
  const [s] = await give(game, 1, 'sha');
  play(game, 1);
  const h0 = game.player(0).hand.length, h1 = game.player(1).hand.length;
  await game.useCard(1, s, [0]);
  assert.equal(game.player(1).hand.length, h1 - 2);
  assert.equal(game.player(0).hand.length, h0 - 1);
});

test('Tông Dự — Thừa Thưởng: lá không gây sát thương thì thu lá cùng chất và điểm từ chồng bài', async () => {
  const { game, ctrls } = makeHG([['zongyux', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('chengshang'));
  ctrls[1].set('respond', (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' }));
  const [s] = await give(game, 0, 'sha');
  await give(game, 1, 'shan');
  const c = game.card(s);
  const same = game.state.drawPile.filter((x) => game.card(x).suit === c.suit && game.card(x).rank === c.rank);
  play(game, 0);
  await game.useCard(0, s, [1]);
  for (const x of same) assert.ok(game.player(0).hand.includes(x));
  if (!same.length) assert.ok(game.log.some((l) => l.includes('thêm 1 lần')));
});

test('Phùng Hy — Bác Ngôn: mục tiêu bổ sung bài đến giới hạn máu và không thể dùng bài trên tay', async () => {
  const { game } = makeHG([['fengxi', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clearHand(game, 1);
  play(game, 0);
  assert.equal(await useSkill(game, 0, 'boyan', [], [1]), null);
  assert.equal(game.player(1).hand.length, game.player(1).maxHp);
  assert.equal(game.cardBlocked(1, game.card(game.player(1).hand[0])), true);
});

test('Phùng Hy — Ngọc Toái: mất 1 máu, người dùng lá đen bỏ X lá trên tay', async () => {
  const { game, ctrls } = makeHG([['fengxi', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('yusui'));
  await clearHand(game, 1);
  const s = await take(game, 1, (c) => c.name === 'sha' && isBlack(c));
  await give(game, 1, 'shan', 'shan', 'shan', 'shan', 'shan');
  play(game, 1);
  const hp0 = game.player(0).hp;
  await game.useCard(1, s, [0]);
  assert.ok(game.player(0).hp <= hp0 - 1);
  assert.ok(game.player(1).hand.length <= 5 - Math.min(5, game.player(1).maxHp));
});

test('Dương Hỗ — Đức Thiệu: mục tiêu duy nhất của lá đen, bỏ 1 lá của người dùng', async () => {
  const { game, ctrls } = makeHG([['yanghu', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('deshao'));
  const s = await take(game, 1, (c) => c.name === 'sha' && isBlack(c));
  play(game, 1);
  const h1 = game.player(1).hand.length;
  await game.useCard(1, s, [0]);
  assert.equal(game.player(1).hand.length, h1 - 2);
});

test('Dương Hỗ — Minh Phạt: cuối lượt sau của mục tiêu, họ ít bài hơn thì chịu 1 sát thương', async () => {
  const { game } = makeHG([['yanghu', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  play(game, 0);
  assert.equal(await useSkill(game, 0, 'mingfa', [], [1]), null);
  game.state.turnCount++;
  await clearHand(game, 1);
  await give(game, 0, 'sha', 'sha');
  const hp = game.player(1).hp;
  game.state.currentSeat = 1;
  await game.bus.emit('turnEnd', { seat: 1 });
  assert.equal(game.player(1).hp, hp - 1);
});
