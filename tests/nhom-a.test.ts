// Test nhóm A (content/scripts/goi-bo-sung.mjs): Mã Lương, Đặng Chi, Bành Dạng, Ngô Cảnh, Chu Di, Viên Thuật,
// Tả Từ, Nam Hoa Lão Tiên (+ kỹ năng Thiên Thư), Lữ Linh Khởi, Nễ Hành, Himiko.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, DISABLED_GENERALS } from '../src/content/loader.js';
import { GENERALS } from '../src/hegemony/generals.js';
import { SKILLS } from '../src/hegemony/skills.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import type { Card, Request, Response } from '../src/core/types.js';
import { give } from './helpers.js';
import { makeHG, revealAll, stackTop, onlySkill, YES } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const GROUP = ['maliang', 'dengzhi', 'pengyang', 'wujing', 'zhouyi', 'yuanshu', 'new_zuoci', 'nanhualaoxian', 'lvlingqi', 'miheng', 'beimihu'];

/** Dùng kỹ năng chủ động trực tiếp (như người chơi bấm trong giai đoạn ra bài). */
async function useSkill(game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) {
  game.state.currentSeat = seat;
  game.state.phase = 'play';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = await (game as any).useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
  assert.equal(err, null, String(err));
}

function enterPlay(game: HegemonyGame, seat: number) {
  game.state.currentSeat = seat;
  game.state.phase = 'play';
}

/** Lấy 1 lá thỏa điều kiện từ chồng bốc vào tay. */
async function giveWhere(game: HegemonyGame, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('không tìm thấy lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}

const pickTargets = (ts: number[]) => () => ({ kind: 'targets' as const, targets: ts });
const chooseIndex = (i: number) => (): Response => ({ kind: 'choice', index: i });
const chooseLabel = (s: string) => (req: Request): Response => {
  const opts = (req as { options: string[] }).options;
  const i = opts.findIndex((o) => o.includes(s));
  return { kind: 'choice', index: Math.max(0, i) };
};
const totalOk = (game: HegemonyGame) => assert.equal(game.totalCards(), game.cards.size);

test('nhóm A: 11 tướng được bật đủ kỹ năng, Tả Từ cũ vẫn tắt', () => {
  for (const id of GROUP) {
    const g = GENERALS.find((x) => x.id === id);
    assert.ok(g, `${id} chưa được bật`);
    for (const s of g!.skills) assert.ok(SKILLS[s], `${id}: thiếu ${s}`);
  }
  for (const s of ['weimengzongheng', 'xinghuo', 'leiji_tianshu', 'yinbing', 'huoqi', 'guizhu', 'xianshou', 'lundao', 'guanyue', 'yanzheng']) {
    assert.ok(SKILLS[s], `thiếu kỹ năng ${s}`);
  }
  assert.ok(DISABLED_GENERALS.some((g) => g.id === 'zuoci'));
  assert.ok(GENERALS.find((g) => g.id === 'lvlingqi')!.female);
});

// ---------------- Mã Lương ----------------

test('Mục Minh: 1 lá Cơ dùng như Viễn Giao Cận Công, mỗi giai đoạn ra bài 1 lần', async () => {
  const { game } = makeHG([['maliang', 'liubei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  enterPlay(game, 0);
  const h1 = await giveWhere(game, 0, (c) => c.suit === 'heart' && c.name !== 'tao');
  const h2 = await giveWhere(game, 0, (c) => c.suit === 'heart' && c.name !== 'tao' && c.id !== h1);
  assert.ok(game.cardCountsAs(0, game.card(h1)).includes('yuanjiao'));
  assert.ok(game.cardCountsAs(0, game.card(h1)).includes('lulitongxin'));
  const before = game.player(0).hand.length;
  const r = await game.useCard(0, h1, [1], 'yuanjiao');
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.equal(game.player(0).hand.length, before - 1 + 3);
  assert.ok(!game.cardCountsAs(0, game.card(h2)).includes('yuanjiao'), 'chỉ 1 lần mỗi giai đoạn ra bài');
  totalOk(game);
});

test('Nạp Man: phán xét không phải Bích -> hủy mục tiêu của Thiết Tác Liên Hoàn đen', async () => {
  const { game, ctrls } = makeHG([['maliang', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  for (const p of game.state.players) await game.moveCards([...p.hand], { kind: 'hand', seat: p.seat }, { kind: 'discard' }, 'test');
  const ts = await giveWhere(game, 1, (c) => c.name === 'tiesuo' && (c.suit === 'spade' || c.suit === 'club'));
  ctrls[0].set('confirm', onlySkill('naman')).set('choose', chooseLabel('Hủy')).set('chooseTargets', pickTargets([0]));
  stackTop(game, (c) => c.suit !== 'spade');
  enterPlay(game, 1);
  const r = await game.useCard(1, ts, [0, 2]);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.equal(game.player(0).chained, false, 'Mã Lương đã hủy mục tiêu của mình');
  assert.equal(game.player(2).chained, true);
  totalOk(game);
});

// ---------------- Đặng Chi ----------------

test('Ngụy Minh: lấy tối đa X lá rồi trả lại bằng số đó; Tung Hoành trao kỹ năng đến hết lượt kế tiếp của họ', async () => {
  const { game, ctrls } = makeHG([['dengzhi', 'liubei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const hp = game.player(0).hp;
  const before1 = game.player(1).hand.length;
  ctrls[0].set('choose', (req) => {
    const opts = (req as { options: string[] }).options;
    return { kind: 'choice', index: opts.includes('Có') ? opts.indexOf('Có') : 0 };
  });
  const own0 = game.player(0).hand.length;
  await useSkill(game, 0, 'weimeng', [], [1]);
  assert.equal(game.player(1).hand.length, before1);
  assert.equal(game.player(0).hand.length, own0);
  assert.ok(game.log.some((l) => l.includes(`lấy ${Math.min(hp, before1)} lá`)));
  assert.ok(game.grantedSkills(1).includes('weimengzongheng'));
  await game.runTurn(1);
  assert.ok(!game.grantedSkills(1).includes('weimengzongheng'), 'mất kỹ năng sau lượt của họ');
  totalOk(game);
});

test('Giản Lượng: ít bài nhất -> người cùng thế lực mỗi người rút 1 lá', async () => {
  const { game, ctrls } = makeHG([['dengzhi', 'liubei'], ['caocao', 'xuchu'], ['zhangfei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  await game.moveCards([...game.player(0).hand], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  ctrls[0].set('confirm', onlySkill('jianliang'));
  const h1 = game.player(1).hand.length, h2 = game.player(2).hand.length;
  game.state.currentSeat = 0;
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.count, 2);
  assert.equal(game.player(0).hand.length, 1);
  assert.equal(game.player(2).hand.length, h2 + 1);
  assert.equal(game.player(1).hand.length, h1);
});

// ---------------- Bành Dạng ----------------

test('Cận Hãm: mở tướng -> người khoảng cách 1 đã mở hết thì úp 1 tướng, có tướng úp thì bỏ 2 lá', async () => {
  const { game } = makeHG([['liubei', 'pengyang'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 1);
  await game.reveal(2, 'main');
  const h2 = game.player(2).hand.length;
  const h0 = game.player(0).hand.length;
  await game.reveal(0, 'deputy');
  const h = game.hero(1);
  assert.equal(h.main.revealed && h.deputy.revealed, false, 'P1 phải úp 1 tướng');
  assert.equal(game.player(2).hand.length, h2 - 2);
  assert.equal(game.player(0).hand.length, h0 - 2, 'Bành Dạng cũng là mục tiêu: chủ tướng còn úp -> tự bỏ 2 lá');
  totalOk(game);
});

test('Cận Hãm: mở cả 2 tướng cùng lúc -> Bành Dạng không tự bỏ bài mà úp 1 tướng (chọn úp lại Bành Dạng để phát động tiếp)', async () => {
  const { game, ctrls } = makeHG([['liubei', 'pengyang'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  const h0 = game.player(0).hand.length;
  let opts: string[] = [];
  ctrls[0].set('reveal', () => ({ kind: 'reveal', main: true, deputy: true }))
    .set('choose', (r) => { opts = (r as { options: string[] }).options; return { kind: 'choice', index: 0 }; });
  await (game as unknown as { askRevealAtTurnStart(s: number): Promise<void> }).askRevealAtTurnStart(0);
  assert.equal(game.player(0).hand.length, h0, 'không tự bỏ bài');
  assert.equal(opts[0], 'Bành Dạng', 'Bành Dạng đứng đầu lựa chọn úp');
  assert.equal(game.hero(0).deputy.revealed, false, 'đã úp lại Bành Dạng');
  assert.equal(game.hero(0).main.revealed, true);
});

test('Thông Linh: sau khi gây sát thương cho A, người cùng thế lực dùng Sát vào A trúng -> rút 2 lá', async () => {
  const { game, ctrls } = makeHG([['liubei', 'pengyang'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  for (const p of game.state.players) await game.moveCards([...p.hand], { kind: 'hand', seat: p.seat }, { kind: 'discard' }, 'test');
  const [s1, s2] = await give(game, 0, 'sha', 'sha');
  ctrls[0].set('confirm', onlySkill('tongling')).set('chooseTargets', pickTargets([0])).set('choose', chooseIndex(0));
  enterPlay(game, 0);
  const hp1 = game.player(1).hp;
  const r = await game.useCard(0, s1, [1]);
  assert.equal(r.ok, true);
  assert.equal(game.player(1).hp, hp1 - 2);
  assert.ok(!game.player(0).hand.includes(s2));
  assert.equal(game.player(0).hand.length, 2, 'rút 2 lá');
  totalOk(game);
});

// ---------------- Ngô Cảnh ----------------

test('Điều Quy: trang bị dùng như Điệu Hổ Ly Sơn; đội hình thay đổi -> rút X lá', async () => {
  const { game, ctrls } = makeHG([['wujing', 'sunquan'], ['caocao', 'xuchu'], ['lvmeng', 'huanggai'], ['xiahoudun', 'zhangliao']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  const eq = await giveWhere(game, 0, (c) => c.type === 'equip');
  ctrls[0].set('chooseTargets', pickTargets([1]));
  const h = game.player(0).hand.length;
  await useSkill(game, 0, 'diaogui', [eq]);
  assert.ok(game.isLured(1));
  assert.ok(game.state.discardPile.includes(eq));
  assert.equal(game.player(0).hand.length, h - 1 + 2, 'đội hình Ngô [0,2] mới hình thành -> rút 2');
  totalOk(game);
});

test('Phong Dương: người khác thế lực không thể bỏ trang bị của người cùng đội hình', async () => {
  const { game, ctrls } = makeHG([['wujing', 'sunquan'], ['lvmeng', 'huanggai'], ['caocao', 'xuchu'], ['xiahoudun', 'zhangliao']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  // 0 và 1 kề nhau -> đội hình Ngô
  await game.moveCards([...game.player(1).hand], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const eq = await giveWhere(game, 1, (c) => c.type === 'equip' && game.cardInfo(c.name).slot === 'weapon');
  await game.moveCards([eq], { kind: 'hand', seat: 1 }, { kind: 'equip', seat: 1, slot: 'weapon' }, 'test');
  assert.equal(game.equipProtected(2, 1), true);
  assert.equal(game.equipProtected(0, 1), false);
  assert.equal(game.equipProtected(2, 3), false);
  const gh = await giveWhere(game, 2, (c) => c.name === 'guohe');
  ctrls[2].set('choose', chooseIndex(0));
  enterPlay(game, 2);
  const r = await game.useCard(2, gh, [1]);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.ok(game.player(1).equips.weapon.includes(eq), 'vũ khí vẫn còn');
  totalOk(game);
});

// ---------------- Chu Di ----------------

test('Trục Khấu: gây sát thương lần đầu trong giai đoạn ra bài -> rút X lá (X = số lá đã dùng trong lượt)', async () => {
  const { game, ctrls } = makeHG([['zhouyi', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  for (const p of game.state.players) await game.moveCards([...p.hand], { kind: 'hand', seat: p.seat }, { kind: 'discard' }, 'test');
  const [s] = await give(game, 0, 'sha');
  ctrls[0].set('confirm', onlySkill('zhukou_zy'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(game.player(0).hand.length, 1);
});

test('Đoạn Niệm: cuối giai đoạn ra bài bỏ hết bài rồi rút đến giới hạn máu', async () => {
  const { game, ctrls } = makeHG([['zhouyi', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('duannian'));
  await game.moveCards(game.player(0).hand.slice(0, 3), { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  game.state.currentSeat = 0;
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'play' });
  assert.equal(game.player(0).hand.length, game.player(0).maxHp);
  totalOk(game);
});

test('Liên Hựu + Hưng Hỏa: chết thì trao Hưng Hỏa; sát thương Hỏa +1', async () => {
  const { game, ctrls } = makeHG([['zhouyi', 'sunquan'], ['caocao', 'xuchu'], ['lvmeng', 'huanggai']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('lianyou')).set('chooseTargets', pickTargets([2]));
  game.player(0).hp = 1;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(0).alive, false);
  assert.ok(game.grantedSkills(2).includes('xinghuo'));
  const hp = game.player(1).hp;
  await game.damage({ source: 2, target: 1, amount: 1, card: null, nature: 'fire', cancelled: false });
  assert.equal(game.player(1).hp, hp - 2);
});

// ---------------- Viên Thuật ----------------

test('Dong Tứ: không ai có Ngọc Tỷ -> là đại thế lực duy nhất, bốc thêm 1; bị Tri Kỷ thì mở bài', async () => {
  const { game } = makeHG([['yuanshu', 'lvbu'], ['caocao', 'xuchu'], ['xiahoudun', 'zhangliao']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  assert.equal(game.isBig(0), true);
  assert.equal(game.isBig(1), false, 'Ngụy 2 người vẫn là tiểu thế lực');
  game.state.currentSeat = 0;
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.count, 3);
  const zj = await giveWhere(game, 1, (c) => c.name === 'zhiji');
  enterPlay(game, 1);
  await game.useCard(1, zj, [0]);
  assert.ok(game.log.some((l) => l.includes('Dong Tứ: P0 mở bài trên tay')));
  totalOk(game);
});

test('Ngụy Đế: người đã rút bài trong lượt không chấp hành quân lệnh -> lấy hết bài rồi trả lại bằng số đó', async () => {
  const { game, ctrls } = makeHG([['yuanshu', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  enterPlay(game, 0);
  await game.draw(1, 1);
  ctrls[1].set('choose', chooseLabel('Không thực hiện'));
  const n1 = game.player(1).hand.length, n0 = game.player(0).hand.length;
  await useSkill(game, 0, 'weidi', [], [1]);
  assert.equal(game.player(1).hand.length, n1);
  assert.equal(game.player(0).hand.length, n0);
  assert.ok(game.log.some((l) => l.includes(`thu lấy ${n1} lá`)));
  totalOk(game);
});

// ---------------- Tả Từ ----------------

test('Dịch Quỷ: mở tướng nhận 2 [Hồn]; bỏ 1 [Hồn] để coi như dùng Sát vào người cùng thế lực với [Hồn]', async () => {
  const { game, ctrls } = makeHG([['new_zuoci', 'lvbu'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 1, 2);
  await game.reveal(0, 'main');
  assert.equal(game.generalPile(0, 'Hồn').length, 2);
  game.removeFromGeneralPile(0, 'Hồn', game.generalPile(0, 'Hồn'));
  const wei = game.generalDeck().find((id) => game.generalInfo(id)!.kingdom === 'wei')!;
  game.addGeneralPile(0, 'Hồn', [wei]);
  ctrls[0].set('choose', chooseLabel('Sát'));
  let cands: number[] = [];
  ctrls[0].set('chooseTargets', (req) => { cands = (req as { candidates: number[] }).candidates; return { kind: 'targets', targets: [1] }; });
  const hp = game.player(1).hp;
  await useSkill(game, 0, 'yigui');
  assert.deepEqual(cands, [1], 'chỉ nhắm được người thế lực Ngụy');
  assert.equal(game.player(1).hp, hp - 1);
  assert.equal(game.generalPile(0, 'Hồn').length, 0);
});

test('Cấp Hồn: nhận sát thương -> nhận 1 [Hồn]', async () => {
  const { game, ctrls } = makeHG([['new_zuoci', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const n = game.generalPile(0, 'Hồn').length;
  ctrls[0].set('confirm', onlySkill('jihun'));
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.generalPile(0, 'Hồn').length, n + 1);
});

// ---------------- Nam Hoa Lão Tiên ----------------

test('Cộng Tu: rút ít 1 lá, chọn người rút 1 lá; lần sau không được chọn lại cùng mục', async () => {
  const { game, ctrls } = makeHG([['nanhualaoxian', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('gongxiu')).set('chooseTargets', pickTargets([0]));
  let opts: string[] = [];
  ctrls[0].set('choose', (req) => { opts = (req as { options: string[] }).options; return { kind: 'choice', index: 0 }; });
  game.state.currentSeat = 0;
  const h = game.player(0).hand.length;
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.count, 1);
  assert.equal(game.player(0).hand.length, h + 1);
  ctrls[0].set('chooseTargets', pickTargets([1]));
  const h1 = game.player(1).hand.length;
  opts = [];
  await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(opts.length, 0, 'chỉ còn 1 mục nên không hỏi');
  assert.equal(game.player(1).hand.length, h1 - 1, 'lần này họ phải bỏ 1 lá');
});

test('Kinh Hợp: mở 1 lá, chọn 1 người có tướng đã mở nhận 1 kỹ năng Thiên Thư đến đầu lượt kế tiếp của bạn', async () => {
  const { game, ctrls } = makeHG([['nanhualaoxian', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('chooseTargets', pickTargets([0])).set('choose', chooseIndex(0));
  await useSkill(game, 0, 'jinghe', [game.player(0).hand[0]]);
  const got = game.grantedSkills(0);
  assert.equal(got.length, 1);
  assert.ok(['leiji_tianshu', 'yinbing', 'huoqi', 'guizhu', 'xianshou', 'lundao', 'guanyue', 'yanzheng'].includes(got[0]));
  await game.bus.emit('turnStart', { seat: 0 });
  assert.equal(game.grantedSkills(0).length, 0);
});

test('Thiên Thư: Tiên Thụ, Âm Binh, Hoạt Khí, Quan Nguyệt, Luận Đạo, Quỷ Trợ', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['lvbu', 'diaochan'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  for (const k of ['xianshou', 'yinbing', 'huoqi', 'guanyue', 'lundao', 'guizhu']) game.grantSkill(0, k);
  ctrls[0].set('confirm', YES);
  // Tiên Thụ: chưa bị thương -> rút 2
  const h1 = game.player(1).hand.length;
  await useSkill(game, 0, 'xianshou', [], [1]);
  assert.equal(game.player(1).hand.length, h1 + 2);
  // Âm Binh: Sát khiến mục tiêu mất máu (không phải sát thương); người khác mất máu -> rút 1
  let damaged = 0;
  game.bus.on('damageDealt', () => { damaged++; });
  const s = (await give(game, 0, 'sha'))[0];
  const hp2 = game.player(2).hp, h0 = game.player(0).hand.length;
  ctrls[2].set('respond', () => ({ kind: 'pass' }));
  await game.useCard(0, s, [2]);
  assert.equal(game.player(2).hp, hp2 - 1);
  assert.equal(damaged, 0);
  assert.equal(game.player(0).hand.length, h0 - 1 + 1);
  // Hoạt Khí: người ít máu nhất hồi 1, rút 1
  const hc = game.player(0).hand[0];
  const h2 = game.player(2).hand.length;
  await useSkill(game, 0, 'huoqi', [hc], [2]);
  assert.equal(game.player(2).hp, hp2);
  assert.equal(game.player(2).hand.length, h2 + 1);
  // Quan Nguyệt: xem 2 lá trên cùng, thu lấy 1
  const top = game.state.drawPile.at(-1)!;
  const n0 = game.player(0).hand.length;
  ctrls[0].set('chooseCards', () => ({ kind: 'cards', cardIds: [top] }));
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  assert.ok(game.player(0).hand.includes(top));
  assert.equal(game.player(0).hand.length, n0 + 1);
  // Luận Đạo: nguồn sát thương ít bài hơn -> rút 1
  await game.moveCards([...game.player(1).hand], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const n1 = game.player(0).hand.length;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(0).hand.length, n1 + 1);
  // Quỷ Trợ: có người hấp hối -> rút 2 (1 lần mỗi lượt)
  const n2 = game.player(0).hand.length;
  game.player(2).hp = 1;
  ctrls[2].set('save', () => ({ kind: 'pass' }));
  await game.damage({ source: 1, target: 2, amount: 1, card: null, cancelled: false });
  assert.ok(game.player(0).hand.length >= n2 + 2);
  totalOk(game);
});

test('Thiên Thư: Lôi Kích (đánh Thiểm -> phán xét Bích gây 2 sát thương Lôi) và Ngôn Chính', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['lvbu', 'diaochan']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.grantSkill(0, 'leiji_tianshu');
  ctrls[0].set('confirm', onlySkill('leiji_tianshu')).set('chooseTargets', pickTargets([1]));
  ctrls[0].set('respond', (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' }));
  await give(game, 0, 'shan');
  const s = (await give(game, 1, 'sha'))[0];
  enterPlay(game, 1);
  const hp = game.player(1).hp;
  // Lá trên cùng sẽ là lá phán xét: đặt một lá Bích
  stackTop(game, (c) => c.suit === 'spade');
  await game.useCard(1, s, [0]);
  assert.equal(game.player(1).hp, hp - 2);
  // Ngôn Chính
  game.revokeSkill(0, 'leiji_tianshu');
  game.grantSkill(0, 'yanzheng');
  ctrls[0].set('confirm', onlySkill('yanzheng'));
  await give(game, 0, 'sha', 'sha');
  const hp1 = game.player(1).hp;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(game.player(0).hand.length, 1);
  assert.equal(game.player(1).hp, hp1 - 1);
  totalOk(game);
});

// ---------------- Lữ Linh Khởi ----------------

test('Thần Uy: chủ tướng giảm 0.5 máu gốc, giới hạn trữ bài +2, nhiều máu nhất thì rút thêm 2', async () => {
  const { game } = makeHG([['lvlingqi', 'pangde'], ['caocao', 'xiahoudun'], ['pangde', 'lvlingqi']].slice(0, 2) as [string, string][]);
  await game.setup();
  assert.equal(game.player(0).maxHp, Math.floor((4 - 1 + 4) / 2));
  await revealAll(game, 0, 1);
  assert.equal(game.handLimit(0), game.player(0).hp + 2);
  game.state.currentSeat = 0;
  game.player(1).hp = 1;
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.count, 4);
  // Làm phó tướng thì không có Thần Uy
  const b = makeHG([['pangde', 'lvlingqi'], ['caocao', 'xuchu']]);
  await b.game.setup();
  assert.equal(b.game.player(0).maxHp, 4);
  assert.equal(b.game.hasSkill(0, 'shenwei', false), false);
});

test('Quắc Vũ: mở tay có 3 loại bài -> lấy Sát từ chồng bỏ, không giới hạn khoảng cách, Sát thêm 2 mục tiêu', async () => {
  const { game, ctrls } = makeHG([['lvlingqi', 'pangde'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng'], ['zhangfei', 'liubei'], ['xiahoudun', 'zhangliao']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  for (const p of game.state.players) await game.moveCards([...p.hand], { kind: 'hand', seat: p.seat }, { kind: 'discard' }, 'test');
  const [s] = await give(game, 0, 'sha');
  await giveWhere(game, 0, (c) => c.type === 'equip');
  await giveWhere(game, 0, (c) => c.name === 'wuzhong');
  ctrls[0].set('confirm', YES).set('chooseTargets', (req) => ({ kind: 'targets', targets: (req as { candidates: number[] }).candidates.slice(0, 2) }));
  enterPlay(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.player(0).flags.guowu, 3);
  assert.equal(game.player(0).hand.length, 4, 'thu thêm 1 Sát từ chồng bỏ');
  assert.equal(game.distance(0, 2), 1);
  const r = await game.useCard(0, s, [2]);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  const hit = [1, 2, 3, 4].filter((t) => game.player(t).hp < game.player(t).maxHp);
  assert.equal(hit.length, 3, 'Sát có 3 mục tiêu');
  totalOk(game);
});

test('Trang Nhung: bỏ 1 lá công cụ -> có Vô Song trong giai đoạn ra bài', async () => {
  const { game } = makeHG([['lvlingqi', 'pangde'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const t = await giveWhere(game, 0, (c) => c.type === 'trick');
  await useSkill(game, 0, 'zhuangrong', [t]);
  assert.ok(game.hasSkill(0, 'vosong'));
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'play' });
  assert.ok(!game.hasSkill(0, 'vosong'));
  totalOk(game);
});

// ---------------- Nễ Hành ----------------

test('Cuồng Tài: Sát không giới hạn số lần/khoảng cách; không dùng bài thì giới hạn trữ bài +1', async () => {
  const { game } = makeHG([['miheng', 'lvbu'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng'], ['zhangfei', 'liubei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  enterPlay(game, 0);
  assert.equal(game.slashLimit(0), Infinity);
  assert.equal(game.distance(0, 2), 1);
  const lim = game.handLimit(0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'discard' });
  assert.equal(game.handLimit(0), lim + 1);
  game.player(0).flags.stat_used = 1;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'discard' });
  assert.equal(game.handLimit(0), lim);
});

test('Thiệt Kiếm: là mục tiêu duy nhất của Sát -> bỏ hết bài, gây 1 sát thương cho người dùng', async () => {
  const { game, ctrls } = makeHG([['miheng', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('shejian')).set('choose', chooseLabel('Gây 1 sát thương'));
  const s = (await give(game, 1, 'sha'))[0];
  enterPlay(game, 1);
  const hp1 = game.player(1).hp;
  await game.useCard(1, s, [0]);
  assert.equal(game.player(0).hand.length, 0);
  assert.equal(game.player(1).hp, hp1 - 1);
  totalOk(game);
});

// ---------------- Himiko ----------------

test('Quỷ Thuật: lá Bích dùng như Tri Kỷ / Viễn Giao, phải xen kẽ trong lượt', async () => {
  const { game } = makeHG([['beimihu', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  enterPlay(game, 0);
  const a = await giveWhere(game, 0, (c) => c.suit === 'spade' && c.name !== 'zhiji');
  const b = await giveWhere(game, 0, (c) => c.suit === 'spade' && c.id !== a && c.name !== 'zhiji' && c.name !== 'yuanjiao');
  assert.deepEqual(game.cardCountsAs(0, game.card(a)).filter((n) => n === 'zhiji' || n === 'yuanjiao').sort(), ['yuanjiao', 'zhiji']);
  const r = await game.useCard(0, a, [1], 'zhiji');
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  const now = game.cardCountsAs(0, game.card(b));
  assert.ok(now.includes('yuanjiao') && !now.includes('zhiji'), 'lần sau phải là Viễn Giao');
  totalOk(game);
});

test('Viễn Vực: nguồn sát thương không có bạn trong tầm đánh -> sát thương −1', async () => {
  const { game } = makeHG([['beimihu', 'lvbu'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng'], ['zhangfei', 'liubei'], ['xiahoudun', 'zhangliao']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  const hp = game.player(0).hp;
  await game.damage({ source: 2, target: 0, amount: 2, card: null, cancelled: false });
  assert.equal(game.player(0).hp, hp - 1);
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(0).hp, hp - 2, 'người kề bên: không giảm');
});
