// Test nhóm E (giai đoạn 12): tướng có sẵn chỉnh theo bản Việt hóa QSanguosha-Hegemony, và 4 tướng quân chủ.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '../src/content/loader.js';
import type { Card, CardName, Response } from '../src/core/types.js';
import { getGeneral, isLordId, lordVersionOf } from '../src/hegemony/generals.js';
import { PlayerSession, Room } from '../src/server/rooms.js';
import { enterPlay, give } from './helpers.js';
import { FIRST_OPTION, isBlack, makeHG, onlySkill, revealAll, sha, stackTop, YES } from './hg-helpers.js';

const playSteps = (steps: Response[]) => () => steps.shift() ?? ({ kind: 'endPlay' } as Response);

/** Lấy 1 lá thỏa điều kiện từ chồng bài lên tay `seat`. */
async function take(game: ReturnType<typeof makeHG>['game'], seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((x) => pred(game.card(x)));
  if (id === undefined) throw new Error('không tìm thấy lá');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}
const named = (n: CardName) => (c: Card) => c.name === n;

before(async () => {
  // Chỉ nạp file của nhóm E (kỹ năng quân chủ nằm trong engine) để không phụ thuộc nội dung của nhóm khác
  const dir = mkdtempSync(join(tmpdir(), 'tqs-nhom-e-'));
  mkdirSync(join(dir, 'generals'));
  cpSync('content/generals/quan-chu.json', join(dir, 'generals', 'quan-chu.json'));
  const r = await loadContent(dir);
  assert.ok(r.ok, r.errors.join('\n'));
});

// ============================================================ Quân chủ: khai báo, đổi tướng

test('quân chủ: 4 tướng được khai báo, đổi chủ tướng thường thành quân chủ khi bật lordConvert', async () => {
  for (const id of ['liubei', 'zhangjiao', 'caocao', 'sunquan']) {
    assert.equal(lordVersionOf(id), `lord_${id}`);
    assert.ok(isLordId(`lord_${id}`));
  }
  const { game, ctrls } = makeHG([['liubei', 'guanyu'], ['caocao', 'xuchu'], ['sunquan', 'zhoutai']], { lordConvert: true });
  ctrls[0].set('confirm', onlySkill('changeToLord'));
  await game.setup();
  assert.equal(game.hero(0).main.generalId, 'lord_liubei');
  assert.equal(game.hero(1).main.generalId, 'caocao', 'không đồng ý thì giữ tướng thường');
  assert.ok(game.isLord(0));
  assert.equal(game.player(0).maxHp, Math.floor((4 + getGeneral('guanyu').halfHp) / 2));
  await game.runTurn(0);
  assert.equal(game.hero(0).main.revealed, true, 'quân chủ lật ngay đầu lượt đầu tiên');
});

test('phòng chơi: tùy chọn "lord" mặc định bật', () => {
  const r = new Room('x', new PlayerSession('a'), 4, 10, () => {});
  assert.equal(r.info().lord, true);
});

// ============================================================ Lưu Bị - Quân

test('Ngũ Hổ Tướng Đại Kỳ: Võ Thánh dùng lá đen, Bào Hao bỏ qua giáp (chỉ khi quân chủ Thục còn Thụ Việt)', async () => {
  const { game } = makeHG([['lord_liubei', 'zhaoyun'], ['guanyu', 'zhangfei'], ['caocao', 'xuchu']]);
  await revealAll(game, 0, 1, 2);
  const black = await take(game, 1, (c) => isBlack(c) && c.name !== 'sha');
  assert.ok(game.cardCountsAs(1, game.card(black)).includes('sha'));
  const rw = await take(game, 2, named('renwang'));
  await game.moveCards([rw], { kind: 'hand', seat: 2 }, { kind: 'equip', seat: 2, slot: 'armor' }, 'test');
  assert.equal(game.armorOf(2, 1, true), null);
  assert.equal(game.armorOf(2, 0, true), 'renwang');
  game.loseSkill(0, 'shouyue');
  assert.ok(!game.cardCountsAs(1, game.card(black)).includes('sha'));
  assert.equal(game.armorOf(2, 1, true), 'renwang');
});

test('Chương Vũ: Phi Long vào trang bị người khác thì quân chủ thu lấy; mất Phi Long không vì sử dụng thì đặt xuống đáy chồng bài và rút 2', async () => {
  const { game } = makeHG([['lord_liubei', 'zhaoyun'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  const fl = await take(game, 1, named('feilong'));
  await game.moveCards([fl], { kind: 'hand', seat: 1 }, { kind: 'equip', seat: 1, slot: 'weapon' }, 'equip');
  assert.ok(game.player(0).hand.includes(fl));
  const before = game.player(0).hand.length;
  await game.moveCards([fl], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'discard');
  assert.equal(game.state.drawPile[0], fl, 'Phi Long nằm ở đáy chồng bài');
  assert.equal(game.player(0).hand.length, before - 1 + 2);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Kích Chiếu: hấp hối thì bổ sung bài, hồi đến 2 máu, mất Thụ Việt và nhận Nhân Đức (1 lần mỗi ván)', async () => {
  const { game, ctrls } = makeHG([['lord_liubei', 'zhaoyun'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('jizhao'));
  await revealAll(game, 0);
  game.player(0).hp = 1;
  await game.loseHp(0, 1);
  assert.equal(game.player(0).hp, 2);
  assert.ok(game.player(0).hand.length >= game.player(0).maxHp);
  assert.equal(game.hasSkill(0, 'shouyue'), false);
  assert.equal(game.hasSkill(0, 'nhanduc'), true);
});

// ============================================================ Trương Giác - Quân

test('Hoằng Pháp: đặt X Thiên Binh, +1 người mỗi Thiên Binh, bỏ Thiên Binh để không mất máu; người Quần dùng Thiên Binh như Sát', async () => {
  const { game, ctrls } = makeHG([['lord_zhangjiao', 'huatuo'], ['zhangjiao', 'diaochan'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await revealAll(game, 0, 1);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(game.player(0).special.length, 2, 'X = 2 người Quần');
  assert.equal(game.factionSize('qun'), 4);
  ctrls[0].set('confirm', onlySkill('hongfa'));
  const hp = game.player(0).hp;
  await game.loseHp(0, 1);
  assert.equal(game.player(0).hp, hp);
  assert.equal(game.player(0).special.length, 1);
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 1) ctx.count = 0; });
  ctrls[1].set('play', playSteps([{ kind: 'useSkill', skill: 'tianbing', cardIds: [], targets: [2] }]));
  await game.runTurn(1);
  assert.equal(game.player(2).hp, game.player(2).maxHp - 1);
  assert.equal(game.player(0).special.length, 0);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Vấn Đạo: bỏ 1 lá đỏ để thu lấy Thái Bình Yêu Thuật trong chồng bỏ', async () => {
  const { game, ctrls } = makeHG([['lord_zhangjiao', 'huatuo'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  const tp = await take(game, 1, named('taiping'));
  await game.moveCards([tp], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const red = await take(game, 0, (c) => (c.suit === 'heart' || c.suit === 'diamond') && c.name !== 'taiping');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'wendao', cardIds: [red], targets: [] }]));
  await game.runTurn(0);
  assert.ok(game.player(0).hand.includes(tp) || game.player(0).equips.armor.includes(tp));
});

// ============================================================ Tào Tháo - Quân

test('Ngũ Tử Lương Tướng Đạo: người Ngụy bỏ 1 lá, úp 1 tướng, nhận kỹ năng đến đầu lượt sau và không lật được tướng đó', async () => {
  const { game, ctrls } = makeHG([['lord_caocao', 'xuchu'], ['xiahoudun', 'dianwei'], ['liubei', 'guanyu'], ['sunquan', 'zhoutai']]);
  await revealAll(game, 0, 1);
  await give(game, 1, 'tao');
  ctrls[1].set('confirm', onlySkill('elitegeneralflag'));
  game.state.currentSeat = 1;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'start' });
  assert.equal(game.player(1).hand.length, 0, 'đã bỏ 1 lá');
  assert.equal(game.hero(1).deputy.revealed, false, 'úp phó tướng');
  assert.equal(game.hasSkill(1, 'dottap'), true, 'nhận Tập Kích');
  assert.equal(game.canReveal(1), false);
  await game.bus.emit('turnStart', { seat: 1 });
  assert.equal(game.hasSkill(1, 'dottap'), false);
  assert.equal(game.canReveal(1), true);
});

test('Huy Tiên: gây 1 sát thương cho người Ngụy (họ rút 2), người Ngụy khác bị thương hồi 1 máu', async () => {
  const { game, ctrls } = makeHG([['lord_caocao', 'xuchu'], ['xiahoudun', 'dianwei'], ['liubei', 'guanyu']]);
  await revealAll(game, 0, 1);
  game.player(1).hp = 2;
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'huibian', cardIds: [], targets: [] }]));
  const hp0 = game.player(0).hp;
  await game.runTurn(0);
  assert.equal(game.player(0).hp, hp0 - 1);
  assert.equal(game.player(1).hp, 3);
});

test('Tổng Ngự: dùng 1 lá Ngựa thì có thể đặt Lục Long Tham Giá (trong chồng bỏ) vào trang bị', async () => {
  const { game, ctrls } = makeHG([['lord_caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('zongyu'));
  const ll = await take(game, 1, named('liulong'));
  await game.moveCards([ll], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const horse = await take(game, 0, named('dilu'));
  enterPlay(game, 0);
  await game.useCard(0, horse, []);
  assert.ok(game.player(0).equips.offHorse.includes(ll));
  assert.equal(game.player(0).equips.defHorse.length, 0);
  assert.ok(game.state.discardPile.includes(horse));
});

// ============================================================ Tôn Quyền - Quân

test('Duyên Giang Phong Hỏa Đồ: người Ngô đặt trang bị làm Phong Hỏa; đầu lượt nhận Anh Tư; quân chủ chịu sát thương từ lá bài thì mất 1 Phong Hỏa', async () => {
  const { game, ctrls } = makeHG([['lord_sunquan', 'zhoutai'], ['zhouyu', 'luxun'], ['caocao', 'xuchu']]);
  await revealAll(game, 0, 1);
  await give(game, 1, 'jueying');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 1) ctx.count = 0; });
  ctrls[1].set('play', playSteps([{ kind: 'useSkill', skill: 'flamemap_dat', cardIds: [], targets: [] }]));
  await game.runTurn(1);
  assert.equal(game.player(0).special.length, 1);
  ctrls[1].set('confirm', onlySkill('flamemap'));
  game.state.currentSeat = 1;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'start' });
  assert.equal(game.hasSkill(1, 'anhtu'), true);
  const [s] = await give(game, 2, 'sha');
  game.state.currentSeat = 2;
  await game.useCardAs(2, 'sha', [0], [s]);
  assert.equal(game.player(0).special.length, 0);
});

test('Tư Bảo: người khác lấy bảo vật thì bị trả lại; cuối lượt có Minh Châu trên bàn thì rút 1 và lấy 1 lá của người lắp', async () => {
  const { game } = makeHG([['lord_sunquan', 'zhoutai'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await revealAll(game, 0);
  const yx = await take(game, 0, named('yuxi'));
  await game.moveCards([yx], { kind: 'hand', seat: 0 }, { kind: 'equip', seat: 0, slot: 'treasure' }, 'equip');
  await game.moveCards([yx], { kind: 'equip', seat: 0, slot: 'treasure' }, { kind: 'hand', seat: 1 }, 'shunshou');
  assert.ok(game.player(0).equips.treasure.includes(yx));
  const mz = await take(game, 2, named('mingzhu'));
  await game.moveCards([mz], { kind: 'hand', seat: 2 }, { kind: 'equip', seat: 2, slot: 'treasure' }, 'equip');
  await give(game, 2, 'sha');
  const before = game.player(0).hand.length;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  assert.equal(game.player(0).hand.length, before + 2);
});

// ============================================================ Tướng có sẵn (theo bản Việt hóa)

test('Quỷ Tài: đánh 1 lá thay kết quả phán định; Thiên Khiển: Quách Gia thu lấy kết quả phán định của mình', async () => {
  const { game, ctrls } = makeHG([['guojia', 'xuchu'], ['simayi', 'caocao']]);
  await revealAll(game, 0, 1);
  ctrls[1].set('confirm', onlySkill('guicai'));
  ctrls[0].set('confirm', onlySkill('tiandu'));
  const [mine] = await give(game, 1, 'tao');
  ctrls[1].set('chooseCards', () => ({ kind: 'cards', cardIds: [mine] }));
  const j = await game.judge(0, 'thử');
  assert.equal(j.id, mine);
  await game.finishJudge(j);
  assert.ok(game.player(0).hand.includes(mine), 'Thiên Khiển thu lấy lá phán định cuối cùng');
});

test('Ưng Dương: lá đấu điểm +3', async () => {
  const { game, ctrls } = makeHG([['sunce', 'zhouyu'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  const a = await take(game, 0, (c) => c.rank === 5);
  const b = await take(game, 1, (c) => c.rank === 7);
  ctrls[0].set('choose', () => ({ kind: 'choice', index: 0 }));
  const r = await game.pindian(0, 1, 'thử');
  assert.ok(r && r.win);
  assert.ok(game.state.discardPile.includes(a) && game.state.discardPile.includes(b));
});

test('Bất Khuất (tỏa định): hấp hối thì mở Sang, khác điểm thì hồi về 1 máu', async () => {
  const { game } = makeHG([['zhoutai', 'sunquan'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  game.player(0).hp = 1;
  await game.loseHp(0, 1);
  assert.equal(game.player(0).alive, true);
  assert.equal(game.player(0).hp, 1);
  assert.equal(game.player(0).special.length, 1);
});

test('Vô Song: Quyết Đấu thật được thêm tối đa 2 mục tiêu', async () => {
  const { game, ctrls } = makeHG([['lvbu', 'diaochan'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'zhoutai']]);
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('vosong'));
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [2] }));
  const [jd] = await give(game, 0, 'juedou');
  enterPlay(game, 0);
  await game.useCard(0, jd, [1]);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.equal(game.player(2).hp, game.player(2).maxHp - 1);
});

test('Ly Gián: bỏ 1 lá, người chọn sau coi như dùng Quyết Đấu với người chọn trước', async () => {
  const { game, ctrls } = makeHG([['diaochan', 'lvbu'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  const [c] = await give(game, 0, 'tao');
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'lijian', cardIds: [c], targets: [] }]));
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [1, 2] }));
  await game.runTurn(0);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.equal(game.player(2).hp, game.player(2).maxHp);
  assert.ok(game.state.discardPile.includes(c));
});

test('Loạn Vũ (hạn định): người không dùng Sát vào người gần nhất thì mất 1 máu; chỉ 1 lần', async () => {
  const { game, ctrls } = makeHG([['jiaxu', 'diaochan'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  game.bus.on('drawPhase', () => {});
  ctrls[0].set('play', playSteps([
    { kind: 'useSkill', skill: 'luanwu', cardIds: [], targets: [] },
    { kind: 'useSkill', skill: 'luanwu', cardIds: [], targets: [] },
  ]));
  await game.runTurn(0);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.equal(game.player(2).hp, game.player(2).maxHp - 1);
  assert.ok(game.log.some((l) => l.includes('Kỹ năng hiện không dùng được')));
});

test('Khu Thỉ: Sát bị né trong giai đoạn ra bài thì giới hạn Sát và số mục tiêu +1', async () => {
  const { game, ctrls } = makeHG([['gongsunzan', 'diaochan'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'shan');
  const [s1, s2] = await give(game, 0, 'sha', 'sha');
  enterPlay(game, 0);
  await game.useCard(0, s1, [1]);
  assert.equal(game.slashLimit(0), 2);
  assert.equal(game.maxSlashTargets(0, s2), 2);
});

test('Nghĩa Tòng: Sát của người cùng thế lực bị né thì Công Tôn Toản thu lấy lá Sát; chủ tướng giảm 0.5 máu', async () => {
  const { game, ctrls } = makeHG([['zhangjiao', 'huatuo'], ['gongsunzan', 'diaochan'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'zhoutai']]);
  assert.equal(game.player(1).maxHp, 3, '(4 - 1 + 3) / 2');
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('yicong'));
  ctrls[2].set('respond', FIRST_OPTION);
  await give(game, 2, 'shan');
  const [s] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  await game.useCard(0, s, [2]);
  assert.ok(game.player(1).hand.includes(s));
});

test('Quan Tinh: chọn lá để lại trên đầu, còn lại xuống đáy chồng bài', async () => {
  const { game, ctrls } = makeHG([['zhugeliang', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'zhoutai']]);
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('guanxing'));
  const pile = game.state.drawPile;
  const top3 = pile.slice(-3).reverse();
  ctrls[0].set('chooseCards', () => ({ kind: 'cards', cardIds: [top3[2]] }));
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(pile[pile.length - 1], top3[2]);
  assert.ok(pile.slice(0, 2).includes(top3[0]) && pile.slice(0, 2).includes(top3[1]));
});

test('Không Thành: ngoài lượt, hết bài mà được giao bài thì đặt làm [Cầm]; đầu giai đoạn rút bài thu lấy', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['zhugeliang', 'liubei']]);
  await revealAll(game, 1);
  const [c] = await give(game, 0, 'tao');
  game.state.currentSeat = 0;
  await game.moveCards([c], { kind: 'hand', seat: 0 }, { kind: 'hand', seat: 1 }, 'give');
  assert.deepEqual(game.player(1).special, [c]);
  assert.equal(game.player(1).hand.length, 0);
  game.state.currentSeat = 1;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'draw' });
  assert.ok(game.player(1).hand.includes(c));
});

test('Võ Thánh: Sát Rô không giới hạn khoảng cách; Mã Thuật: khoảng cách đến người khác -1', async () => {
  const { game } = makeHG([['guanyu', 'zhangfei'], ['caocao', 'xuchu'], ['lvmeng', 'luxun'], ['lvbu', 'jiaxu'], ['guojia', 'simayi']]);
  await revealAll(game, 0);
  const d = await take(game, 0, (c) => c.suit === 'diamond');
  const h = await take(game, 0, (c) => c.suit === 'heart');
  enterPlay(game, 0);
  assert.equal(game.checkUse(0, d, [2], 'sha'), null);
  assert.match(game.checkUse(0, h, [2], 'sha') ?? '', /ngoài tầm/);
});

test('Hồn Thương: đầu giai đoạn chuẩn bị còn 1 máu thì có Anh Tư trong lượt', async () => {
  const { game } = makeHG([['sunquan', 'sunce'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  game.player(0).hp = 1;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(game.hasSkill(0, 'anhtu'), true);
  await game.bus.emit('turnEnd', { seat: 0 });
  assert.equal(game.hasSkill(0, 'anhtu'), false);
});

test('Phản Gián: giao 1 lá đã mở; người nhận chọn bỏ mọi lá cùng chất', async () => {
  const { game, ctrls } = makeHG([['zhouyu', 'sunce'], ['caocao', 'xuchu']]);
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  const sp = await take(game, 0, (c) => c.suit === 'spade');
  const sp2 = await take(game, 1, (c) => c.suit === 'spade');
  const ht = await take(game, 1, (c) => c.suit === 'heart');
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'phangian', cardIds: [], targets: [1] }]));
  await game.runTurn(0);
  assert.ok(game.state.discardPile.includes(sp) && game.state.discardPile.includes(sp2));
  assert.ok(game.player(1).hand.includes(ht));
});

test('mô phỏng: ván bot có quân chủ không lỗi, không mất lá', async () => {
  const { HegemonyGame } = await import('../src/hegemony/game.js');
  const { HegemonyBot } = await import('../src/hegemony/bot.js');
  const presets: [string, string][][] = [
    [['lord_liubei', 'guanyu'], ['lord_caocao', 'xuchu'], ['lord_sunquan', 'zhoutai'], ['lord_zhangjiao', 'huatuo'], ['zhangfei', 'zhaoyun'], ['xiahoudun', 'dianwei']],
    [['lord_zhangjiao', 'jiaxu'], ['diaochan', 'lvbu'], ['lord_sunquan', 'luxun'], ['zhouyu', 'sunce'], ['lord_liubei', 'machao'], ['huangzhong', 'jiangwei']],
  ];
  for (let seed = 1; seed <= 6; seed++) {
    const p = presets[seed % 2];
    const game = new HegemonyGame(p.map((_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })), { seed, maxTurns: 300, presetGenerals: p });
    let bad = 0;
    game.bus.on('cardsMoved', () => { if (game.totalCards() !== game.cards.size) bad++; });
    await game.run();
    assert.equal(bad, 0);
  }
  void sha; void stackTop; void YES;
});
