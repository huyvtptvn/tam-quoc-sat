// Test giai đoạn 3: cơ chế mới (phán định, chọn mục tiêu, khu vực riêng, tầm đánh...),
// Châu Liên Bích Hợp, kỹ năng chủ/phó tướng và 16 tướng mới.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRed } from '../src/core/cards.js';
import type { Response } from '../src/core/types.js';
import { MARK_SKILL } from '../src/hegemony/game.js';
import { enterPlay, give } from './helpers.js';
import { FIRST_OPTION, isBlack, makeHG, named, onlySkill, revealAll, sha, stackTop, YES } from './hg-helpers.js';

/** Trả lời 'play' lần lượt theo danh sách, hết danh sách thì kết thúc giai đoạn ra bài. */
const playSteps = (steps: Response[]) => () => steps.shift() ?? ({ kind: 'endPlay' } as Response);

// ============================================================ Cơ chế lõi mới

test('phán định: lá lật ra nằm ở vùng xử lý, finishJudge đưa vào chồng bỏ', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  const top = stackTop(game, named('tao'));
  const card = await game.judge(0, 'thử');
  assert.equal(card.id, top.id);
  assert.ok(game.state.processing.includes(card.id));
  await game.finishJudge(card);
  assert.ok(game.state.discardPile.includes(card.id));
  assert.equal(game.totalCards(), game.cards.size);
});

test('chooseTargets: trả lời sai thì không chọn ai (nếu không bắt buộc) hoặc engine tự chọn (nếu bắt buộc)', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangfei', 'zhaoyun'], ['lvmeng', 'luxun']]);
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [0, 0, 7] }));
  assert.deepEqual(await game.chooseTargets(0, 'x', [1, 2], 0, 1), []);
  assert.deepEqual(await game.chooseTargets(0, 'x', [1, 2], 1, 1), [1]);
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [2] }));
  assert.deepEqual(await game.chooseTargets(0, 'x', [1, 2], 1, 1), [2]);
});

// ============================================================ Châu Liên Bích Hợp

test('Châu Liên Bích Hợp: lật đủ cặp tướng có duyên thì nhận ký hiệu, dùng để bốc 2 lá', async () => {
  const { game, ctrls } = makeHG([['liubei', 'guanyu'], ['caocao', 'simayi']]);
  await revealAll(game, 1); // để người 0 không nhận Tiên Khu
  assert.equal(game.hero(1).marks.pair, 0, 'Tào Tháo + Tư Mã Ý không phải một cặp');
  await revealAll(game, 0);
  assert.equal(game.hero(0).marks.pair, 1);
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: MARK_SKILL.pair, cardIds: [], targets: [] }]));
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.equal(game.hero(0).marks.pair, 0);
  assert.equal(game.player(0).hand.length, 4, 'bốc 2 + 2 từ ký hiệu');
});

test('Châu Liên Bích Hợp: dùng như Đào để cứu đồng minh đang hấp hối', async () => {
  const { game, ctrls } = makeHG([['caocao', 'simayi'], ['liubei', 'zhangfei'], ['guanyu', 'zhugeliang']]);
  await revealAll(game, 1);
  ctrls[1].set('save', (_r, v) => (v.specialSaves?.length
    ? { kind: 'useSkill', skill: v.specialSaves[0].skill, cardIds: [], targets: [] } : { kind: 'pass' }));
  game.player(2).hp = 1;
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 2);
  assert.equal(game.player(2).alive, true);
  assert.equal(game.player(2).hp, 1);
  assert.equal(game.hero(1).marks.pair, 0);
});

// ============================================================ Kỹ năng chủ tướng / phó tướng

test('kỹ năng chủ tướng: Thiên Phúc chỉ có khi Khương Duy là chủ tướng', async () => {
  const a = makeHG([['jiangwei', 'zhaoyun'], ['caocao', 'xuchu']]).game;
  await revealAll(a, 0);
  assert.equal(a.hasSkill(0, 'thienphu'), true);
  const b = makeHG([['zhaoyun', 'jiangwei'], ['caocao', 'xuchu']]).game;
  await revealAll(b, 0);
  assert.equal(b.hasSkill(0, 'thienphu'), false);
  assert.equal(b.hasSkill(0, 'khieuhan'), true, 'kỹ năng thường vẫn có ở vị trí phó tướng');
  assert.equal(b.hasSkill(0, 'yizhi'), true, 'Di Chí là kỹ năng phó tướng');
  assert.equal(a.hasSkill(0, 'yizhi'), false);
});

test('kỹ năng phó tướng "giảm 0.5 máu gốc": Hồn Thương chỉ trừ âm dương ngư khi Tôn Sách là phó tướng', async () => {
  const a = makeHG([['sunquan', 'sunce'], ['caocao', 'xuchu']]).game;
  assert.equal(a.player(0).maxHp, 3, '(4 + 4 - 1) / 2');
  await revealAll(a, 0);
  assert.equal(a.hasSkill(0, 'hunshang'), true);
  const b = makeHG([['sunce', 'sunquan'], ['caocao', 'xuchu']]).game;
  assert.equal(b.player(0).maxHp, 4);
  await revealAll(b, 0);
  assert.equal(b.hasSkill(0, 'hunshang'), false);
});

// ============================================================ Tầm đánh, khoảng cách, mục tiêu

test('Mã Thuật: đã lật thì Sát được người ở khoảng cách 2; còn úp thì không', async () => {
  const { game } = makeHG([['machao', 'zhaoyun'], ['caocao', 'xuchu'], ['lvmeng', 'luxun'], ['lvbu', 'jiaxu'], ['guojia', 'simayi']]);
  const [s] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  assert.notEqual(game.checkUse(0, s, [2]), null);
  await game.reveal(0, 'main');
  assert.equal(game.checkUse(0, s, [2]), null);
});

test('Nhạn Hàng: người cùng đội hình với Công Tôn Toản tính khoảng cách đến người khác -X', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['gongsunzan', 'lvbu'], ['zhangjiao', 'huatuo'], ['zhangfei', 'zhaoyun'], ['lvmeng', 'luxun']]);
  assert.equal(game.distance(2, 4), 2);
  await revealAll(game, 1, 2);
  assert.equal(game.distance(2, 4), 1, 'đội hình 2 người: -1');
  assert.equal(game.distance(1, 3), 1);
});

test('Tự Thủ + Tông Thất: bốc thêm X lá, không thể chọn người khác làm mục tiêu, giới hạn bài + X', async () => {
  const { game, ctrls } = makeHG([['liubiao', 'diaochan'], ['caocao', 'xuchu']]);
  await game.reveal(1, 'main'); // 2 thế lực sẽ lộ diện: Quần (sau khi lật) và Ngụy
  ctrls[0].set('confirm', onlySkill('tuthu'));
  let tried = false;
  ctrls[0].set('play', (_r, v) => {
    if (tried) return { kind: 'endPlay' };
    tried = true;
    const s = v.myHand.find((c) => c.name === 'sha');
    return s ? { kind: 'useCard', cardId: s.id, targets: [1] } : { kind: 'endPlay' };
  });
  await give(game, 0, 'sha');
  await game.runTurn(0);
  assert.equal(game.player(1).hp, game.player(1).maxHp, 'không được Sát người khác');
  assert.equal(game.player(0).hand.length, 5, '1 Sát + bốc 2 + 2 (X = 2 thế lực)');
  assert.equal(ctrls[0].asked.some((r) => r.type === 'discard'), false, 'giới hạn bài = 3 máu + 2');
});

test('Đoản Binh: Sát được thêm 1 mục tiêu ở khoảng cách 1', async () => {
  const { game, ctrls } = makeHG([['dingfeng', 'lvmeng'], ['caocao', 'xuchu'], ['lvbu', 'jiaxu'], ['zhangfei', 'zhaoyun']]);
  ctrls[0].set('confirm', onlySkill('doanbinh'));
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [3] }));
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.equal(game.player(3).hp, game.player(3).maxHp - 1);
  assert.equal(game.player(2).hp, game.player(2).maxHp);
});

test('Phấn Tấn: bỏ 1 lá để khoảng cách đến một người là 1 trong lượt này', async () => {
  const { game, ctrls } = makeHG([['dingfeng', 'lvmeng'], ['caocao', 'xuchu'], ['lvbu', 'jiaxu'], ['zhangfei', 'zhaoyun'], ['guojia', 'simayi']]);
  const [cost, s] = await give(game, 0, 'shan', 'sha');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([
    { kind: 'useSkill', skill: 'phantan', cardIds: [cost], targets: [2] },
    { kind: 'useCard', cardId: s, targets: [2] },
  ]));
  await game.runTurn(0);
  assert.equal(game.player(2).hp, game.player(2).maxHp - 1);
  assert.equal(game.distance(1, 2), 1, 'chỉ ảnh hưởng người dùng kỹ năng');
});

// ============================================================ Tướng mới: Ngụy

test('Cương Liệt: phán định đen thì bỏ 1 lá của nguồn sát thương; đỏ thì gây 1 sát thương', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['xiahoudun', 'xuchu']]);
  ctrls[1].set('confirm', onlySkill('cuonglie'));
  await give(game, 0, 'sha', 'shan', 'shan', 'tao');
  stackTop(game, isBlack);
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(0).hand.length, 2, '3 lá còn lại, bị bỏ 1');
  assert.equal(game.player(0).hp, game.player(0).maxHp);

  stackTop(game, (c) => isRed(c));
  game.player(0).flags = {};
  await give(game, 0, 'sha');
  await sha(game, 0, 1);
  assert.equal(game.player(0).hp, game.player(0).maxHp - 1);
});

test('Đột Tập: không bốc bài mà lấy 1 lá của tối đa 2 người', async () => {
  const { game, ctrls } = makeHG([['zhangliao', 'xuchu'], ['zhangfei', 'zhaoyun'], ['lvmeng', 'luxun']]);
  ctrls[0].set('confirm', onlySkill('dottap'));
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [1, 2] }));
  await give(game, 1, 'tao', 'tao');
  await give(game, 2, 'shan');
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 2);
  assert.equal(game.player(1).hand.length, 1);
  assert.equal(game.player(2).hand.length, 0);
});

test('Cường Tập: mất 1 máu gây 1 sát thương, mỗi giai đoạn 1 lần', async () => {
  const { game, ctrls } = makeHG([['dianwei', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  const use: Response = { kind: 'useSkill', skill: 'cuongtap', cardIds: [], targets: [1] };
  ctrls[0].set('play', playSteps([use, { ...use }]));
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.equal(game.player(0).hp, 9);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.ok(game.log.some((l) => l.includes('Kỹ năng hiện không dùng được')));
});

test('Lạc Thần: nhận các lá đen liên tiếp, dừng khi gặp lá đỏ', async () => {
  const { game, ctrls } = makeHG([['zhenji', 'caocao'], ['zhangfei', 'zhaoyun']]);
  ctrls[0].set('confirm', YES);
  const red = stackTop(game, (c) => isRed(c));
  const b1 = stackTop(game, isBlack);
  const b2 = stackTop(game, isBlack); // b2 nằm trên cùng
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.ok(game.player(0).hand.includes(b1.id) && game.player(0).hand.includes(b2.id));
  assert.ok(game.state.discardPile.includes(red.id));
});

test('Khuynh Quốc: lá đen dùng như Thiểm (lật Chân Cơ)', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['zhenji', 'caocao']]);
  ctrls[1].set('respond', FIRST_OPTION);
  const black = game.state.drawPile.find((id) => game.card(id).name === 'sha' && isBlack(game.card(id)))!;
  await game.moveCards([black], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, game.player(1).maxHp);
  assert.equal(game.hero(1).main.revealed, true);
});

// ============================================================ Tướng mới: Thục

test('Nhân Đức: giao đủ 2 lá thì xem như dùng 1 lá cơ bản (Đào), chỉ lần đầu; mỗi người chỉ nhận 1 lần', async () => {
  const { game, ctrls } = makeHG([['liubei', 'guanyu'], ['zhangfei', 'zhaoyun'], ['caocao', 'xuchu']]);
  const [a, b, c, d] = await give(game, 0, 'sha', 'sha', 'sha', 'sha');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  game.player(0).hp = game.player(0).maxHp - 2;
  ctrls[0].set('choose', () => ({ kind: 'choice', index: 0 }));
  ctrls[0].set('play', playSteps([
    { kind: 'useSkill', skill: 'nhanduc', cardIds: [a], targets: [1] },
    { kind: 'useSkill', skill: 'nhanduc', cardIds: [b], targets: [1] }, // đã nhận rồi: bị từ chối
    { kind: 'useSkill', skill: 'nhanduc', cardIds: [b], targets: [2] },
    { kind: 'useSkill', skill: 'nhanduc', cardIds: [c, d], targets: [1] }, // vẫn bị từ chối
  ]));
  await game.runTurn(0);
  assert.equal(game.player(0).hp, game.player(0).maxHp - 1);
  assert.equal(game.player(1).hand.length, 1);
  assert.equal(game.player(2).hand.length, 1);
});

test('Thiết Kỵ: mục tiêu không bỏ được lá cùng chất thì không thể né; tướng đã mở mất kỹ năng không tỏa định trong lượt', async () => {
  const { game, ctrls } = makeHG([['machao', 'zhaoyun'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('thietky'));
  ctrls[1].set('respond', FIRST_OPTION);
  await revealAll(game, 1);
  const [shan] = await give(game, 1, 'shan');
  await give(game, 0, 'sha');
  const top = stackTop(game, (c) => c.suit !== game.card(shan).suit);
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.equal(ctrls[1].asked.some((r) => r.type === 'respond'), false);
  assert.ok(game.state.discardPile.includes(top.id));
  assert.equal(game.hasSkill(1, 'gianhung'), false, 'Gian Hùng bị vô hiệu trong lượt này');
});

test('Liệt Cung: mục tiêu có số bài ≥ máu của Hoàng Trung thì không thể né', async () => {
  const { game, ctrls } = makeHG([['huangzhong', 'zhangfei'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('lietcung'));
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'shan', 'shan', 'shan', 'shan');
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
});

test('Khiêu Hấn: mục tiêu dùng Sát vào Khương Duy, hoặc bị bỏ 1 lá', async () => {
  const { game, ctrls } = makeHG([['jiangwei', 'zhaoyun'], ['caocao', 'xuchu']]);
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'khieuhan', cardIds: [], targets: [1] }]));
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'sha');
  await game.runTurn(0);
  assert.equal(game.player(0).hp, game.player(0).maxHp - 1, 'bị Sát ngược');

  const g2 = makeHG([['jiangwei', 'zhaoyun'], ['caocao', 'xuchu']]);
  g2.game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  g2.ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'khieuhan', cardIds: [], targets: [1] }]));
  const [t] = await give(g2.game, 1, 'tao');
  await g2.game.runTurn(0);
  assert.ok(g2.game.state.discardPile.includes(t), 'không có Sát thì bị bỏ 1 lá');
});

// ============================================================ Tướng mới: Ngô

test('Anh Tư: giai đoạn bốc bài bốc thêm 1 lá', async () => {
  const { game, ctrls } = makeHG([['zhouyu', 'sunce'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('anhtu'));
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 3);
});

test('Phản Gián: đoán sai chất thì nhận lá và chịu 1 sát thương', async () => {
  const { game, ctrls } = makeHG([['zhouyu', 'sunce'], ['caocao', 'xuchu']]);
  const spade = game.state.drawPile.find((id) => game.card(id).suit === 'spade')!;
  await game.moveCards([spade], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'phangian', cardIds: [], targets: [1] }]));
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 1 })); // đoán Cơ
  await game.runTurn(0);
  assert.ok(game.player(1).hand.includes(spade));
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
});

test('Kích Ngang: dùng Sát đỏ thì bốc 1 lá', async () => {
  const { game, ctrls } = makeHG([['sunce', 'zhouyu'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('kichngang'));
  const red = game.state.drawPile.find((id) => game.card(id).name === 'sha' && isRed(game.card(id)))!;
  await game.moveCards([red], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  enterPlay(game, 0);
  await game.useCard(0, red, [1]);
  assert.equal(game.player(0).hand.length, 1);
});

test('Bất Khuất: lật Sẹo khác điểm thì sống; trùng điểm thì chết và Sẹo vào chồng bỏ', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['zhoutai', 'sunquan'], ['caocao', 'xuchu']]);
  ctrls[1].set('confirm', onlySkill('batkhuat'));
  game.player(1).hp = 1;
  await give(game, 0, 'sha', 'sha');
  const scar = stackTop(game, () => true);
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).alive, true);
  assert.equal(game.player(1).hp, 1);
  assert.deepEqual(game.player(1).special, [scar.id]);
  assert.equal(game.makeView(2).players[1].special[0].id, scar.id, 'Sẹo là thông tin công khai');

  stackTop(game, (c) => c.rank === scar.rank, [scar.id]);
  game.player(0).flags = {};
  await sha(game, 0, 1);
  assert.equal(game.player(1).alive, false);
  assert.ok(game.state.discardPile.includes(scar.id));
  assert.equal(game.totalCards(), game.cards.size);
});

// ============================================================ Tướng mới: Quần

test('Lôi Kích: đánh Thiểm rồi khiến người khác phán định, Bích thì chịu 2 sát thương', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['zhangjiao', 'lvbu']]);
  ctrls[1].set('respond', FIRST_OPTION);
  ctrls[1].set('confirm', onlySkill('loikich'));
  ctrls[1].set('chooseTargets', () => ({ kind: 'targets', targets: [0] }));
  await give(game, 1, 'shan');
  await give(game, 0, 'sha');
  stackTop(game, (c) => c.suit === 'spade');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, game.player(1).maxHp);
  assert.equal(game.player(0).hp, game.player(0).maxHp - 2);
});

test('Bế Nguyệt: giai đoạn kết thúc bốc 1 lá', async () => {
  const { game, ctrls } = makeHG([['diaochan', 'lvbu'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('benguyet'));
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 3);
});
