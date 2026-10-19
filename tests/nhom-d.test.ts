// Test nhóm D: gói Hán (content/scripts/goi-han.mjs, content/generals/han.json) + Lãng Khách (Vô Định, Triệu Thị Trinh).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/loader.js';
import { GENERALS } from '../src/hegemony/generals.js';
import { SKILLS } from '../src/hegemony/skills.js';
import type { Card, Request, Response } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { give } from './helpers.js';
import { makeHG, revealAll, stackTop, onlySkill, YES } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

type Opts = { options: string[] };
const act = (game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
const pick = (text: string) => (r: Request): Response => ({ kind: 'choice', index: Math.max(0, (r as unknown as Opts).options.findIndex((o) => o.includes(text))) });
const targets = (...ts: number[]) => (): Response => ({ kind: 'targets', targets: ts });
const cards = (fn: (r: { cardIds: number[] }) => number[]) => (r: Request): Response => ({ kind: 'cards', cardIds: fn(r as unknown as { cardIds: number[] }) });

async function clear(game: HegemonyGame, ...seats: number[]) {
  for (const s of seats) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
}
/** Lấy 1 lá thỏa điều kiện từ chồng bốc vào tay. */
async function giveWhere(game: HegemonyGame, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('không có lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}

const playOf = (game: HegemonyGame, seat: number) => { game.state.currentSeat = seat; game.state.phase = 'play'; };
const okCards = (game: HegemonyGame) => assert.equal(game.totalCards(), game.cards.size);

const IDS = ['liuxie', 'liubian', 'zhangrang', 'hejin', 'wangyun', 'wangrong', 'fuhuanghou', 'dongcheng', 'tangji', 'caiyong', 'huangfusong', 'liuhong', 'wuding', 'zhaoshizhen'];

test('nhóm D: 14 tướng được bật, đủ kỹ năng; tướng Hán xếp vào Quần, Lãng Khách là Dã tâm gia', () => {
  const list = JSON.parse(readFileSync('content/generals/han.json', 'utf8')).filter((g: { id?: string }) => g.id);
  assert.deepEqual(list.map((g: { id: string }) => g.id).sort(), [...IDS].sort());
  for (const id of IDS) {
    const g = GENERALS.find((x) => x.id === id);
    assert.ok(g, `${id} chưa bật`);
    assert.equal(g!.kingdom, id === 'wuding' || id === 'zhaoshizhen' ? 'ye' : 'qun');
    for (const s of g!.skills) assert.ok(SKILLS[s], `${id}: thiếu kỹ năng ${s}`);
  }
  assert.ok(SKILLS.siweishen);
  assert.equal(GENERALS.find((x) => x.id === 'wangrong')!.female, true);
});

test('Lưu Hiệp — Thiên Mệnh: bị Sát thì bỏ 2 lá rồi rút 2 lá', async () => {
  const { game, ctrls } = makeHG([['liuxie', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('tianming'));
  const before = game.player(0).hand.length;
  const disc = game.state.discardPile.length;
  playOf(game, 1);
  await give(game, 1, 'sha');
  await game.useCard(1, game.player(1).hand.find((i) => game.card(i).name === 'sha')!, [0]);
  assert.ok(game.log.some((l) => l.includes('kích hoạt Thiên Mệnh')));
  assert.equal(game.player(0).hand.length, before, 'bỏ 2 rút 2');
  assert.ok(game.state.discardPile.length >= disc + 3, '2 lá bị bỏ + lá Sát');
  okCards(game);
});

test('Lưu Hiệp — Mật Chiếu: giao X lá (X = số thế lực khác), người nhận thắng đấu điểm thì Sát người thua', async () => {
  const { game, ctrls } = makeHG([['liuxie', 'lvbu'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await clear(game, 0, 1, 2);
  const k = await giveWhere(game, 0, (c) => c.rank === 13);
  await giveWhere(game, 0, (c) => c.rank < 13);
  await giveWhere(game, 2, (c) => c.rank === 1);
  playOf(game, 0);
  ctrls[0].set('chooseTargets', targets(2));
  ctrls[1].set('chooseCards', cards(() => [k]));
  const hp2 = game.player(2).hp;
  assert.equal(await act(game, 0, 'mizhao', [], [1]), null);
  assert.equal(game.player(0).hand.length, 0, 'giao 2 lá (Thục, Ngụy)');
  assert.equal(game.player(2).hp, hp2 - 1, 'Trương Phi thắng đấu điểm, Sát Tào Tháo');
  assert.notEqual(await act(game, 0, 'mizhao', [], [1]), null, 'mỗi giai đoạn 1 lần');
  okCards(game);
});

test('Lưu Biện — Thi Oán (1 lần mỗi lượt) và Độc Thệ (cấm người khác cứu bằng Đào, truyền cho kẻ giết)', async () => {
  const { game, ctrls } = makeHG([['liubian', 'huatuo'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('shiyuan'));
  playOf(game, 1);
  await give(game, 1, 'sha', 'sha');
  const before = game.player(0).hand.length;
  await game.useCard(1, game.player(1).hand.find((i) => game.card(i).name === 'sha')!, [0]);
  assert.equal(game.player(0).hand.length, before + 2, 'máu Trương Phi (4) > Lưu Biện nên rút 2');
  game.player(1).flags.shaUsed = 0;
  await game.useCard(1, game.player(1).hand.find((i) => game.card(i).name === 'sha')!, [0]);
  assert.equal(game.player(0).hand.length, before + 2, 'đã dùng trong lượt này');
  assert.equal(game.canSave(1, 0), false);
  assert.equal(game.canSave(0, 0), true);
  // Chết vì sát thương của P1 -> P1 nhận Độc Thệ
  await clear(game, 0);
  game.player(0).hp = 1;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false }).catch(() => {});
  assert.equal(game.player(0).alive, false);
  assert.ok(game.hasSkill(1, 'dushi'));
});

test('Trương Nhượng — Thao Loạn: mở tướng để xem như dùng Sát; cuối lượt nhận bài, Đỏ > Đen thì úp lại', async () => {
  const { game, ctrls } = makeHG([['zhangrang', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await game.reveal(0, 'deputy');
  await game.reveal(1, 'main');
  await clear(game, 1);
  playOf(game, 0);
  ctrls[0].set('choose', pick('Sát')).set('chooseTargets', targets(1));
  const hp1 = game.player(1).hp;
  assert.equal(await act(game, 0, 'taoluan'), null);
  assert.equal(game.hero(0).main.revealed, true);
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.notEqual(await act(game, 0, 'taoluan'), null, 'tướng đã mở thì không dùng được');
  const red = await giveWhere(game, 1, (c) => c.suit === 'heart');
  await game.bus.emit('turnEnd', { seat: 0 });
  assert.ok(game.player(0).hand.includes(red), 'Trương Phi giao lá đã mở');
  assert.equal(game.hero(0).main.revealed, false, 'Đỏ > Đen: úp lại Trương Nhượng');
  okCards(game);
});

test('Hà Tiến — Mưu Tru: người cùng máu giao 1 lá, ít bài hơn thì được Sát Hà Tiến', async () => {
  const { game, ctrls } = makeHG([['hejin', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clear(game, 1);
  await giveWhere(game, 1, (c) => c.name !== 'sha');
  playOf(game, 0);
  ctrls[0].set('chooseTargets', targets(1));
  ctrls[1].set('confirm', YES).set('choose', pick('Sát'));
  const n0 = game.player(0).hand.length;
  const hp0 = game.player(0).hp;
  assert.equal(await act(game, 0, 'mouzhu'), null);
  assert.equal(game.player(0).hand.length, n0 + 1);
  assert.equal(game.player(0).hp, hp0 - 1, 'Trương Phi 0 lá < Hà Tiến: xem như Sát');
  okCards(game);
});

test('Hà Tiến — Diên Họa: khi chết bỏ X lá của nguồn sát thương (X = số lá trên tay)', async () => {
  const { game, ctrls } = makeHG([['hejin', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clear(game, 0);
  await give(game, 0, 'sha', 'sha');
  ctrls[0].set('confirm', onlySkill('yanhuo'));
  const n1 = game.cardCount(1);
  game.player(0).hp = 1;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false }).catch(() => {});
  assert.equal(game.player(0).alive, false);
  assert.equal(game.cardCount(1), n1 - 2 + 1, 'bỏ 2 lá, rồi P1 được thưởng 1 lá vì giết người khác phe');
  okCards(game);
});

test('Vương Doãn — Liên Kế (+1 sát thương lần tới) và Định Trứ (người đã nhận bài xem như dùng Quyết Đấu)', async () => {
  const { game, ctrls } = makeHG([['wangyun', 'lvbu'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await clear(game, 1, 2);
  playOf(game, 0);
  const [a, b] = game.player(0).hand;
  assert.equal(await act(game, 0, 'lianji', [a], [1]), null);
  assert.equal(await act(game, 0, 'lianji', [b], [2]), null);
  assert.notEqual(await act(game, 0, 'lianji', [game.player(0).hand[0]], [2]), null, 'mỗi người chỉ nhận 1 lần');
  let n = 0;
  ctrls[0].set('confirm', onlySkill('dingzhu'));
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [n++ === 0 ? 1 : 2] }));
  const hp2 = game.player(2).hp;
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'play' });
  assert.equal(game.player(2).hp, hp2 - 2, 'thua Quyết Đấu: 1 + 1 (Liên Kế)');
  okCards(game);
});

test('Vương Vinh — Mẫn Tư (bỏ lá tổng 13, nhận gấp đôi; lá Cơ không tính giới hạn) và Vũ Tụng', async () => {
  const { game, ctrls } = makeHG([['wangrong', 'lvbu'], ['huatuo', 'pangde'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  await clear(game, 0);
  const k = await giveWhere(game, 0, (c) => c.rank === 13);
  stackTop(game, (c) => c.suit === 'heart');
  const h1 = game.state.drawPile[game.state.drawPile.length - 1];
  stackTop(game, (c) => c.suit === 'heart', [h1]);
  playOf(game, 0);
  ctrls[0].set('chooseCards', cards(() => [k]));
  assert.equal(await act(game, 0, 'minsi'), null);
  assert.equal(game.player(0).hand.length, 2);
  assert.equal(game.handLimit(0), game.player(0).hp + 2, '2 lá Cơ không tính');
  // Vũ Tụng: người cùng thế lực nhận Mẫn Tư
  ctrls[0].set('confirm', onlySkill('wucong')).set('chooseTargets', targets(1));
  game.player(0).hp = 1;
  await game.damage({ source: 2, target: 0, amount: 1, card: null, cancelled: false }).catch(() => {});
  assert.equal(game.player(0).alive, false);
  assert.ok(game.hasSkill(1, 'minsi'));
  okCards(game);
});

test('Phục Hoàng Hậu — Chúy Khủng thắng thì chặn sát thương của người đó; Cầu Viện chuyển thêm mục tiêu Sát', async () => {
  const { game, ctrls } = makeHG([['fuhuanghou', 'lvbu'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await clear(game, 0, 1, 2);
  game.player(0).hp -= 1;
  await giveWhere(game, 0, (c) => c.rank === 13);
  await giveWhere(game, 1, (c) => c.rank === 1);
  ctrls[0].set('confirm', onlySkill('zhuikong'));
  game.state.currentSeat = 1;
  game.state.phase = 'start';
  await game.bus.emit('phaseStart', { seat: 1, phase: 'start' });
  const hp2 = game.player(2).hp;
  await game.damage({ source: 1, target: 2, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(2).hp, hp2, 'sát thương bị chặn');
  // Cầu Viện: Tào Tháo không có Thiểm -> trở thành mục tiêu
  game.player(1).flags = {};
  ctrls[0].set('confirm', onlySkill('qiuyuan')).set('chooseTargets', targets(2));
  playOf(game, 1);
  await give(game, 1, 'sha');
  const hp0 = game.player(0).hp;
  await game.useCard(1, game.player(1).hand.find((i) => game.card(i).name === 'sha')!, [0]);
  assert.equal(game.player(2).hp, hp2 - 1);
  assert.equal(game.player(0).hp, hp0 - 1);
  okCards(game);
});

test('Đổng Thừa — Thừa Chiếu: đã nhận ≥2 lá trong lượt, đấu điểm thắng thì Sát bỏ qua phòng cụ', async () => {
  const { game, ctrls } = makeHG([['dongcheng', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clear(game, 0, 1);
  game.state.currentSeat = 1;
  const k = await giveWhere(game, 0, (c) => c.rank === 13);
  await game.draw(0, 1);
  await giveWhere(game, 1, (c) => c.rank === 1);
  const rw = game.state.drawPile.find((i) => game.card(i).name === 'renwang')!;
  await game.moveCards([rw], { kind: 'draw' }, { kind: 'equip', seat: 1, slot: 'armor' }, 'test');
  ctrls[0].set('confirm', onlySkill('chengzhao')).set('chooseTargets', targets(1)).set('chooseCards', cards(() => [k]));
  const hp1 = game.player(1).hp;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'end' });
  assert.equal(game.player(1).hp, hp1 - 1, 'Sát ảo (đen) bỏ qua Nhân Vương Thuẫn');
  okCards(game);
});

test('Đường Cơ — Ai Vũ (tổng bỏ ≥3 lá thì cả hai hồi máu) và Quyết Biệt (nhận bài người cùng thế lực chết)', async () => {
  const { game, ctrls } = makeHG([['tangji', 'lvbu'], ['huatuo', 'pangde'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  game.player(0).hp -= 1;
  ctrls[0].set('confirm', onlySkill('aiwu')).set('choose', pick('Bỏ 3'));
  const hp0 = game.player(0).hp;
  const hp1 = game.player(1).hp;
  await game.damage({ source: 2, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(0).hp, hp0 + 1);
  assert.equal(game.player(1).hp, hp1, 'mất 1 rồi hồi 1');
  // Quyết Biệt
  ctrls[0].set('confirm', onlySkill('juebie'));
  ctrls[1].set('confirm', YES);
  const n0 = game.player(0).hand.length;
  const n1 = game.cardCount(1);
  game.player(1).hp = 1;
  await game.damage({ source: 2, target: 1, amount: 1, card: null, cancelled: false }).catch(() => {});
  assert.equal(game.player(1).alive, false);
  assert.equal(game.player(0).hand.length, n0 + n1);
  okCards(game);
});

test('Thái Ung — Chú Điển (Trùng Chú khi bị lá Đen nhắm) và Bác Thông (4 lá khác chất = Đào, rồi giao lá cho người khác)', async () => {
  const { game, ctrls } = makeHG([['caiyong', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const sha = await giveWhere(game, 1, (c) => c.name === 'sha' && c.suit === 'spade');
  stackTop(game, (c) => c.suit === 'club');
  ctrls[0].set('confirm', (r) => ({ kind: ['zhudian', 'zhudian_show'].includes((r as { skill: string }).skill) ? 'yes' : 'no' }));
  const n0 = game.player(0).hand.length;
  playOf(game, 1);
  await game.useCard(1, sha, [0]);
  assert.equal(game.player(0).hand.length, n0 + 1, 'trùng chú (−1 +1), lá Chuồn ≠ Bích nên rút thêm 1');
  // Bác Thông
  await clear(game, 0);
  const four: number[] = [];
  for (const s of ['spade', 'heart', 'club', 'diamond']) four.push(await giveWhere(game, 0, (c) => c.suit === s));
  game.player(0).hp -= 1;
  playOf(game, 0);
  ctrls[0].set('choose', pick('Đào')).set('chooseCards', cards(() => four)).set('chooseTargets', targets(1));
  const hp = game.player(0).hp;
  const n1 = game.player(1).hand.length;
  assert.equal(await act(game, 0, 'botong'), null);
  assert.equal(game.player(0).hp, hp + 1);
  assert.equal(game.player(1).hand.length, n1 + 4);
  okCards(game);
});

test('Hoàng Phủ Tung — Định Loạn chặn phán xét Bích của Lạc Bất rồi dùng Hỏa Sát; Thế Kích bỏ lá Đỏ', async () => {
  const { game, ctrls } = makeHG([['huangfusong', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clear(game, 1);
  const lb = game.state.drawPile.find((i) => game.card(i).name === 'lebu')!;
  await game.moveCards([lb], { kind: 'draw' }, { kind: 'judge', seat: 1 }, 'test');
  stackTop(game, (c) => c.suit === 'spade');
  ctrls[0].set('confirm', onlySkill('dingluan')).set('choose', pick('Hỏa Sát'));
  const hp1 = game.player(1).hp;
  await game.runTurn(1);
  assert.ok(game.log.some((l) => l.includes('Định Loạn: lần phán xét')));
  assert.ok(!game.log.some((l) => l.includes('Lạc Bất Tư Thục có hiệu lực')));
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.ok(game.log.some((l) => l.includes('sát thương hỏa')));
  // Thế Kích
  const { game: g2, ctrls: c2 } = makeHG([['huangfusong', 'lvbu'], ['zhangfei', 'guanyu']]);
  await g2.setup();
  await revealAll(g2, 0, 1);
  await clear(g2, 0, 1);
  for (let i = 0; i < 3; i++) await giveWhere(g2, 1, (c) => c.suit === 'heart');
  c2[0].set('confirm', onlySkill('shiji')).set('chooseCards', cards((r) => r.cardIds.slice(0, 2)));
  await g2.damage({ source: 0, target: 1, amount: 1, card: null, nature: 'fire', cancelled: false });
  assert.equal(g2.player(1).hand.length, 1);
  assert.equal(g2.player(0).hand.length, 2);
  okCards(g2);
});

test('Lưu Hoành — Dục Tước: không chấp hành quân lệnh thì bị úp tướng và không lật lại được; chấp hành thì lượt sau gây sát thương rút 2', async () => {
  const { game, ctrls } = makeHG([['liuhong', 'lvbu'], ['machao', 'zhangfei'], ['caocao', 'zhenji']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('yujue')).set('choose', () => ({ kind: 'choice', index: 0 }));
  ctrls[1].set('choose', pick('Không thực hiện'));
  game.state.currentSeat = 1;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'play' });
  const h = game.hero(1);
  assert.equal(h.main.revealed && h.deputy.revealed, false, 'bị úp 1 tướng');
  assert.equal(game.canReveal(1), false);
  // Chấp hành quân lệnh (Tào Tháo + Chân Cơ: 3 kỹ năng > 2)
  ctrls[0].set('confirm', onlySkill('yujue'));
  ctrls[2].set('choose', pick('Thực hiện'));
  game.state.currentSeat = 2;
  await game.bus.emit('phaseStart', { seat: 2, phase: 'play' });
  if (!game.player(2).alive) return;
  game.state.turnCount += 1;
  game.state.currentSeat = 2;
  await game.bus.emit('turnStart', { seat: 2 });
  const n2 = game.player(2).hand.length;
  await game.damage({ source: 2, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(2).hand.length, n2 + 2);
  const n2b = game.player(2).hand.length;
  await game.damage({ source: 2, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(2).hand.length, n2b, 'chỉ 1 lần');
});

test('Triệu Thị Trinh — Bạch Tượng, Bà Vương (Nam Man vào 1 thế lực, chặn sát thương để bỏ trang bị), Sinh Vi Tướng → Tử Vi Thần', async () => {
  const { game, ctrls } = makeHG([['zhaoshizhen', 'lvbu'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu'], ['huatuo', 'pangde']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  // Bạch Tượng
  assert.equal(game.attackRange(0), 2);
  assert.equal(game.distance(1, 0), 2);
  const hp0 = game.player(0).hp;
  playOf(game, 1);
  await give(game, 1, 'nanman');
  await game.useCard(1, game.player(1).hand.find((i) => game.card(i).name === 'nanman')!, []);
  assert.equal(game.player(0).hp, hp0, 'Nam Man không có hiệu quả');
  // Bà Vương vào thế lực Ngụy (Tào Tháo), Tào Tháo có trang bị
  await clear(game, 1, 2, 3);
  const eq = game.state.drawPile.find((i) => game.card(i).name === 'renwang')!;
  await game.moveCards([eq], { kind: 'draw' }, { kind: 'equip', seat: 2, slot: 'armor' }, 'test');
  const ace = await giveWhere(game, 0, (c) => [1, 12, 13].includes(c.rank));
  playOf(game, 0);
  ctrls[0].set('choose', pick('Ngụy')).set('confirm', onlySkill('powang'));
  const hp1 = game.player(1).hp, hp2 = game.player(2).hp;
  assert.equal(await act(game, 0, 'powang', [ace]), null);
  assert.equal(game.player(1).hp, hp1, 'Thục không bị nhắm');
  assert.equal(game.player(2).hp, hp2, 'sát thương bị chặn');
  assert.equal(game.equipCount(2), 0, 'bỏ hết trang bị');
  // Sinh Vi Tướng
  ctrls[0].set('confirm', onlySkill('shengweijiang'));
  game.player(0).hp = 1;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  const p0 = game.player(0);
  assert.equal(p0.hp, p0.maxHp);
  assert.ok(p0.hand.length >= p0.maxHp);
  assert.ok(game.hasSkill(0, 'siweishen'));
  await game.bus.emit('turnEnd', { seat: 0 }).catch(() => {});
  assert.equal(game.player(0).alive, false, 'Tử Vi Thần: hết lượt thì trận vong');
  okCards(game);
});

test('Vô Định — Biến Hóa: sao chép kỹ năng tướng đã mở; hoặc +1 giới hạn máu và đầu lượt đổi phó tướng', async () => {
  const { game, ctrls } = makeHG([['wuding', 'lvbu'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 1);
  ctrls[0].set('choose', pick('Trương Phi'));
  await game.reveal(0, 'main');
  assert.ok(game.hasSkill(0, 'baohao'));
  assert.equal(game.slashLimit(0), Infinity);

  const { game: g2, ctrls: c2 } = makeHG([['wuding', 'lvbu'], ['zhangfei', 'guanyu']]);
  await g2.setup();
  c2[0].set('choose', pick('Vô tính'));
  const max = g2.player(0).maxHp;
  await g2.reveal(0, 'main');
  assert.equal(g2.player(0).maxHp, max + 1);
  const dep = g2.hero(0).deputy.generalId;
  g2.state.currentSeat = 0;
  await g2.bus.emit('turnStart', { seat: 0 });
  assert.notEqual(g2.hero(0).deputy.generalId, dep, 'đổi phó tướng');
});
