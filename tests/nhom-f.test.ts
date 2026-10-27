// Nhóm F: đối chiếu kỹ năng gói tướng mới (content/scripts/goi-*.mjs) với mô tả chuẩn trong qsgs-viet.json.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import type { Request } from '../src/core/types.js';
import { give } from './helpers.js';
import { makeHG, revealAll, stackTop, YES, onlySkill } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const choice = (i: number) => () => ({ kind: 'choice' as const, index: i });
const targets = (...t: number[]) => () => ({ kind: 'targets' as const, targets: t });
const cards = (...ids: number[]) => (req: Request) => ({ kind: 'cards' as const, cardIds: ids.filter((x) => (req as { cardIds: number[] }).cardIds.includes(x)) });
const handSize = (g: { player: (s: number) => { hand: number[] } }, s: number) => g.player(s).hand.length;

// ---------------- Ngụy ----------------

test('Thần Tốc: bỏ qua giai đoạn bỏ bài, mất 1 máu, coi như dùng Sát', async () => {
  const { game, ctrls } = makeHG([['xiahouyuan', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('shensu'));
  game.state.currentSeat = 0;
  const hp0 = game.player(0).hp, hp1 = game.player(1).hp;
  const ctx = await game.bus.emit('phaseBefore', { seat: 0, phase: 'discard', skip: false });
  assert.equal(ctx.skip, true);
  assert.equal(game.player(0).hp, hp0 - 1);
  assert.equal(game.player(1).hp, hp1 - 1);
});

test('Chiếm Thủ: chỉ 2 thế lực -> bốc 2 lá, không bị lật úp', async () => {
  const { game, ctrls } = makeHG([['caoren', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('jushou'));
  game.state.currentSeat = 0;
  const before = handSize(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  assert.ok(!game.player(0).faceDown);
  assert.equal(handSize(game, 0), before + 1, 'bốc 2, rồi dùng trang bị hoặc bỏ 1 lá');
});

test('Lưu Đày: người bị chọn có thể bỏ X lá rồi mất 1 máu', async () => {
  const { game, ctrls } = makeHG([['caopi', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('fangzhu')).set('chooseTargets', targets(1));
  ctrls[1].set('choose', choice(1));
  const h1 = handSize(game, 1), hp1 = game.player(1).hp;
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(handSize(game, 1), h1 - 1);
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.ok(!game.player(1).faceDown);
});

test('Dũng Mãnh: người bị chọn bỏ 1 trang bị thì Nhạc Tiến rút 1 lá', async () => {
  const { game, ctrls } = makeHG([['yuejin', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [horse] = await give(game, 1, 'dilu');
  await game.equip(1, game.card(horse));
  await give(game, 0, 'shan');
  ctrls[0].set('confirm', onlySkill('xiaoguo'));
  ctrls[1].set('choose', choice(0));
  game.state.currentSeat = 1;
  const h0 = handSize(game, 0);
  await game.bus.emit('phaseStart', { seat: 1, phase: 'end' });
  assert.equal(game.equipOf(1, 'defHorse'), null);
  assert.equal(handSize(game, 0), h0 - 1 + 1);
});

test('Cấp Tập: làm chủ tướng thì giảm 0.5 máu gốc', async () => {
  // chọn phó tướng Ngụy sao cho tổng số cá là số chẵn (để thấy rõ việc giảm máu)
  const probe = makeHG([['dengai', 'caocao'], ['liubei', 'zhangfei']]).game;
  const even = ['caocao', 'xuchu', 'simayi', 'caoren', 'yuejin', 'zhangchunhua', 'lidian']
    .find((id) => (probe.generalHalfHp('dengai') + probe.generalHalfHp(id)) % 2 === 0)!;
  const sum = probe.generalHalfHp('dengai') + probe.generalHalfHp(even);
  const a = makeHG([['dengai', even], ['liubei', 'zhangfei']]);
  await a.game.setup();
  assert.equal(a.game.player(0).maxHp, sum / 2 - 1);
  const b = makeHG([[even, 'dengai'], ['liubei', 'zhangfei']]);
  await b.game.setup();
  assert.equal(b.game.player(0).maxHp, sum / 2, 'làm phó tướng thì không giảm');
});

test('Tiết Mệnh: nhận 2 sát thương một lần chỉ kích hoạt một lần', async () => {
  const { game, ctrls } = makeHG([['xuchu', 'caocao'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.grantSkill(0, 'jieming');
  let asked = 0;
  ctrls[0].set('confirm', (r) => { if ((r as { skill: string }).skill === 'jieming') asked++; return { kind: 'no' }; });
  await game.damage({ source: 1, target: 0, amount: 2, card: null, cancelled: false });
  assert.equal(asked, 1);
});

test('Hoành Giang: cuối lượt rút X lá (X = số lần đã phát động)', async () => {
  const { game, ctrls } = makeHG([['liubei', 'zhangfei'], ['zangba', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[1].set('confirm', onlySkill('hengjiang'));
  game.state.currentSeat = 0;
  await game.damage({ source: 0, target: 1, amount: 2, card: null, cancelled: false });
  assert.equal(game.handLimit(0), game.player(0).hp - 2);
  const h1 = handSize(game, 1);
  await game.bus.emit('turnEnd', { seat: 0 });
  assert.equal(handSize(game, 1), h1 + 2);
});

test('Văn Ngụy: khi bị Quá Hà Sách Kiều chọn bài, Biện Phu Nhân tự chọn lá', async () => {
  const { game, ctrls } = makeHG([['liubei', 'zhangfei'], ['bianhuanghou', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [mine] = await give(game, 1, 'shan');
  const [gh] = await give(game, 0, 'guohe');
  ctrls[1].set('confirm', onlySkill('wanwei')).set('chooseCards', cards(mine));
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const r = await game.useCard(0, gh, [1]);
  assert.equal(r.ok, true);
  assert.ok(game.state.discardPile.includes(mine), 'lá do Biện Phu Nhân chọn bị bỏ');
});

test('Vũ Khố: chỉ người thế lực xác định khác dùng trang bị mới tăng dấu; Diệt Ngô chuyển hóa lá rồi rút 1', async () => {
  const { game, ctrls } = makeHG([['duyu', 'xuchu'], ['liubei', 'zhangfei'], ['caocao', 'simayi']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  const [w1] = await give(game, 2, 'jueying');
  await game.equip(2, game.card(w1));
  const [w2] = await give(game, 1, 'zhuahuang');
  await game.equip(1, game.card(w2));
  // cùng thế lực (Ngụy) không tăng; Thục tăng 1 -> dùng được Diệt Ngô
  const [peach] = await give(game, 0, 'tao');
  assert.ok(game.cardCountsAs(0, game.card(peach)).includes('shan'), 'có Võ Khố: Đào tính như Thiểm');
  // Khi đáp lại: tay bài không sáng cả, Diệt Ngô hiện thành nút; bấm rồi chọn lá chuyển hóa
  let req: { virtuals?: { skill: string }[] } | null = null;
  ctrls[0].set('respond', (r) => { req = r as never; return { kind: 'pass' }; }).set('confirm', YES)
    .set('chooseCards', () => ({ kind: 'cards', cardIds: [peach] }));
  const h0 = handSize(game, 0);
  const played = await game.requestResponse(0, ['shan'], 'test', 1);
  assert.ok(played);
  assert.ok(req!.virtuals?.some((o) => o.skill === 'miewu'), 'có nút Diệt Ngô');
  assert.ok(game.state.discardPile.includes(peach), 'lá Đào được chuyển hóa vào chồng bỏ');
  assert.equal(handSize(game, 0), h0 - 1 + 1, 'rút 1 lá sau khi dùng Diệt Ngô');
  const [p2] = await give(game, 0, 'tao');
  assert.equal(game.cardCountsAs(0, game.card(p2)).includes('shan'), false, 'hết Võ Khố (chỉ 1 dấu) thì không chuyển hóa nữa');
});

test('Quả Quyết: lần đầu mở tướng gây 1 sát thương; Thương Thệ: bỏ 1 lá rồi rút X lá', async () => {
  const { game, ctrls } = makeHG([['zhangchunhua', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  ctrls[0].set('chooseTargets', targets(1)).set('confirm', onlySkill('shangshi')).set('choose', choice(0));
  const hp1 = game.player(1).hp;
  await game.reveal(0, 'main');
  assert.equal(game.player(1).hp, hp1 - 1);
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  const x = game.player(0).maxHp - game.player(0).hp;
  assert.ok(x >= 1);
  assert.ok(game.log.some((l) => l.includes(`bốc ${x} lá`)));
});

test('Tức Binh: người dùng Sát đen đơn mục tiêu bổ sung bài đến số máu rồi không thể dùng bài trên tay', async () => {
  const { game, ctrls } = makeHG([['liubei', 'zhangfei'], ['huaxin', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await game.moveCards([...game.player(0).hand], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  const sha = game.state.drawPile.find((i) => game.card(i).name === 'sha' && (game.card(i).suit === 'spade' || game.card(i).suit === 'club'))!;
  await game.moveCards([sha], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  ctrls[1].set('confirm', onlySkill('xibing'));
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  await game.useCard(0, sha, [1]);
  assert.equal(handSize(game, 0), game.player(0).hp);
  assert.equal(game.player(0).flags.turn_banHand, 1);
});

// ---------------- Thục ----------------

test('Kỳ Tài: Thuận Thủ Khiên Dương không giới hạn khoảng cách', async () => {
  const { game } = makeHG([['huangyueying', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'huanggai'], ['zhangfei', 'zhaoyun']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  game.grantSkill(0, 'qicai');
  const [ss] = await give(game, 0, 'shunshou');
  assert.ok(game.distance(0, 2) > 1);
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  assert.ok(game.validTargets(0, ss)?.includes(2));
});

test('Cuồng Cốt: máu đầy thì rút 1 lá', async () => {
  const { game, ctrls } = makeHG([['weiyan', 'liubei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('kuanggu'));
  const h0 = handSize(game, 0);
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(handSize(game, 0), h0 + 1);
});

test('Tái Khởi: cuối giai đoạn bỏ bài, người cùng thế lực chọn rút 1 lá hoặc để Mạnh Hoạch hồi máu', async () => {
  const { game, ctrls } = makeHG([['menghuo', 'zhangfei'], ['liubei', 'zhaoyun'], ['caocao', 'xuchu'], ['sunquan', 'huanggai'], ['jiling', 'tianfeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  ctrls[0].set('confirm', onlySkill('zaiqi')).set('chooseTargets', targets(0, 1));
  ctrls[1].set('choose', choice(0));
  game.state.currentSeat = 0;
  const red = game.state.drawPile.find((i) => ['heart', 'diamond'].includes(game.card(i).suit))!;
  await game.moveCards([red], { kind: 'draw' }, { kind: 'discard' }, 'skill');
  const red2 = game.state.drawPile.find((i) => ['heart', 'diamond'].includes(game.card(i).suit))!;
  await game.moveCards([red2], { kind: 'draw' }, { kind: 'discard' }, 'skill');
  const h1 = handSize(game, 1);
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'discard' });
  assert.equal(handSize(game, 1), h1 + 1);
});

test('Thục Thận: hồi máu thì có thể cho bất kỳ người khác rút 1 lá; Sinh Tức ở đầu giai đoạn kết thúc', async () => {
  const { game, ctrls } = makeHG([['ganfuren', 'liubei'], ['caocao', 'xuchu'], ['jiangwanfeiyi', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('shushen')).set('chooseTargets', targets(1));
  game.player(0).hp -= 1;
  const h1 = handSize(game, 1);
  await game.recover(0, 1, 0);
  assert.equal(handSize(game, 1), h1 + 1, 'người khác thế lực cũng được');
  ctrls[2].set('confirm', onlySkill('shengxi'));
  game.state.currentSeat = 2;
  game.player(2).flags = {};
  const h2 = handSize(game, 2);
  await game.bus.emit('phaseStart', { seat: 2, phase: 'end' });
  assert.equal(handSize(game, 2), h2 + 2);
});

test('Cử Tiến: người cùng thế lực hấp hối -> hồi đến 1 máu, rồi đổi phó tướng', async () => {
  const { game, ctrls } = makeHG([['liubei', 'zhangfei'], ['caocao', 'xuchu'], ['zhaoyun', 'guanyu'], ['sunquan', 'huanggai'], ['jiling', 'tianfeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  game.grantSkill(0, 'jujian');
  ctrls[0].set('confirm', onlySkill('jujian'));
  const oldDeputy = game.hero(0).deputy.generalId;
  game.player(2).hp = 1;
  await game.damage({ source: 1, target: 2, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(2).alive, true);
  assert.equal(game.player(2).hp, 1);
  assert.notEqual(game.hero(0).deputy.generalId, oldDeputy);
});

test('Tật Lê: lá thứ X (X = tầm đánh) trong lượt thì rút X lá', async () => {
  const { game, ctrls } = makeHG([['shamoke', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('jili'));
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const [p] = await give(game, 0, 'tao');
  game.player(0).hp -= 1;
  const h0 = handSize(game, 0);
  await game.useCard(0, p, []);
  assert.equal(handSize(game, 0), h0 - 1 + 1, 'tầm đánh 1: lá đầu tiên rút 1');
});

test('Báo Liệt: dùng Sát vào người có máu ≥ bạn không giới hạn khoảng cách', async () => {
  const { game } = makeHG([['zhangfei', 'xiahouba'], ['caocao', 'xuchu'], ['sunquan', 'huanggai'], ['zhaoyun', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  const [s] = await give(game, 0, 'sha');
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  assert.ok(game.distance(0, 2) > game.attackRange(0));
  const hp2 = game.player(2).hp;
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'baolie', cardIds: [s], targets: [2] });
  assert.equal(err, null);
  assert.equal(game.player(2).hp, hp2 - 1);
});

// ---------------- Ngô ----------------

test('Kiêu Cơ: mất trang bị ngoài lượt thì rút 3 lá, trong lượt rút 1 lá', async () => {
  const { game, ctrls } = makeHG([['sunshangxiang', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('xiaoji'));
  const [h1, h2] = await give(game, 0, 'dilu', 'chitu');
  await game.equip(0, game.card(h1));
  await game.equip(0, game.card(h2));
  game.state.currentSeat = 1;
  let n = handSize(game, 0);
  await game.moveCards([h1], { kind: 'equip', seat: 0, slot: 'defHorse' }, { kind: 'discard' }, 'skill');
  assert.equal(handSize(game, 0), n + 3);
  game.state.currentSeat = 0;
  n = handSize(game, 0);
  await game.moveCards([h2], { kind: 'equip', seat: 0, slot: 'offHorse' }, { kind: 'discard' }, 'skill');
  assert.equal(handSize(game, 0), n + 1);
});

test('Thiên Hương: mục 1 — nguồn sát thương gây 1 sát thương cho người được chọn rồi họ rút X lá; mỗi mục một lần mỗi lượt', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['xiaoqiao', 'sunquan'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  const hearts = game.state.drawPile.filter((i) => game.card(i).suit === 'heart').slice(0, 3);
  await game.moveCards(hearts, { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  ctrls[1].set('confirm', onlySkill('tianxiang')).set('chooseTargets', targets(2)).set('choose', (r) => {
    const opts = (r as { options: string[] }).options;
    return { kind: 'choice', index: Math.max(0, opts.findIndex((o) => o.includes('gây 1 sát thương'))) };
  });
  const hp1 = game.player(1).hp, hp2 = game.player(2).hp, h2 = handSize(game, 2);
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, hp1);
  assert.equal(game.player(2).hp, hp2 - 1);
  assert.equal(handSize(game, 2), h2 + 1);
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(2).hp, hp2 - 2, 'lần 2: mục còn lại (mất 1 máu)');
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, hp1 - 1, 'tối đa 2 lần mỗi lượt');
});

test('Đoạn Tiết: xích X người (X = máu đã mất, ít nhất 1) rồi tự xích', async () => {
  const { game, ctrls } = makeHG([['chenwudongxi', 'sunquan'], ['caocao', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  game.player(0).hp -= 2;
  ctrls[0].set('chooseTargets', targets(2));
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'duanxie', cardIds: [], targets: [1] });
  assert.equal(err, null);
  assert.ok(game.player(0).chained && game.player(1).chained && game.player(2).chained);
});

test('Bổ Ích: sau khi người cùng thế lực thoát hấp hối, nguồn sát thương không chấp hành quân lệnh thì họ hồi 1 máu', async () => {
  const { game, ctrls } = makeHG([['wuguotai', 'sunquan'], ['caocao', 'xuchu'], ['huanggai', 'lvmeng'], ['liubei', 'zhangfei'], ['jiling', 'tianfeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  const [p] = await give(game, 0, 'tao');
  ctrls[0].set('confirm', onlySkill('buyi')).set('save', () => ({ kind: 'card', cardId: p }));
  ctrls[1].set('choose', choice(1));
  game.player(2).hp = 1;
  await game.damage({ source: 1, target: 2, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(2).alive, true);
  assert.equal(game.player(2).hp, 2, 'cứu lên 1 rồi Bổ Ích hồi thêm 1');
});

test('Độc Tiến: rút thêm nửa số trang bị (làm tròn lên); lần đầu mở tướng khi không có ai cùng thế lực nhận Tiên Khu', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['lingcao', 'sunquan']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[1].set('confirm', onlySkill('dujin'));
  await game.reveal(1, 'main');
  assert.equal(game.hero(1).marks.pioneer, 1);
  const [h] = await give(game, 1, 'dilu');
  await game.equip(1, game.card(h));
  const ctx = await game.bus.emit('drawPhase', { seat: 1, count: 2 });
  assert.equal(ctx.count, 3);
});

test('Phong Thế: lá đơn mục tiêu vào người ít bài hơn -> bỏ 1 lá mỗi bên, sát thương +1', async () => {
  const { game, ctrls } = makeHG([['sunquan', 'mifangfushiren'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await give(game, 0, 'tao', 'tao', 'tao', 'tao');
  ctrls[0].set('confirm', onlySkill('fengshix'));
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const [s] = await give(game, 0, 'sha');
  const hp1 = game.player(1).hp;
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hp, hp1 - 2);
});

// ---------------- Quần ----------------

test('Loạn Kích: không dùng lá cùng chất với lá đã dùng cho Loạn Kích trong lượt', async () => {
  const { game, ctrls } = makeHG([['yuanshao', 'jiling'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[1].set('respond', () => ({ kind: 'pass' }));
  const pick = (suit: string, n: number) => game.state.drawPile.filter((i) => game.card(i).suit === suit).slice(0, n);
  const ids = [...pick('spade', 2), ...pick('heart', 1), ...pick('club', 1)];
  await game.moveCards(ids, { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const use = (c: number[]) => (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'luanji', cardIds: c, targets: [] });
  assert.equal(await use([ids[0], ids[2]]), null);
  assert.notEqual(await use([ids[1], ids[3]]), null, 'Bích đã dùng');
});

test('Song Nhận: thua đấu điểm thì lượt này không thể chọn người khác làm mục tiêu', async () => {
  const { game, ctrls } = makeHG([['jiling', 'yuanshao'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const low = game.state.drawPile.find((i) => game.card(i).rank === 1)!;
  const high = game.state.drawPile.find((i) => game.card(i).rank === 13)!;
  await game.moveCards([low], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  await game.moveCards([high], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  ctrls[0].set('confirm', onlySkill('shuangren')).set('chooseTargets', targets(1)).set('chooseCards', cards(low));
  ctrls[1].set('chooseCards', cards(high));
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.canTarget(0, 1), false);
});

test('Họa Thủy: trong lượt của Trâu Thị, mục tiêu của Vạn Tiễn không thể đánh Thiểm', async () => {
  const { game } = makeHG([['zoushi', 'jiling'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.state.currentSeat = 0;
  assert.equal(game.responseBlocked(1, ['shan'], 0, { kind: 'aoe', trick: 'wanjian', user: 0 }), true);
  assert.equal(game.responseBlocked(1, ['shan'], 0, { kind: 'aoe', trick: 'nanman', user: 0 }), false);
  game.state.currentSeat = 1;
  assert.equal(game.responseBlocked(1, ['shan'], 0, { kind: 'aoe', trick: 'wanjian', user: 0 }), false);
});

test('Khuynh Thành: bỏ 1 lá Đen (không cần là trang bị) để úp 1 tướng của người đã mở hết tướng', async () => {
  const { game } = makeHG([['zoushi', 'jiling'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const black = game.state.drawPile.find((i) => ['spade', 'club'].includes(game.card(i).suit) && game.card(i).type !== 'equip')!;
  await game.moveCards([black], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'qingcheng', cardIds: [], targets: [1] });
  assert.equal(err, null);
  const h = game.hero(1);
  assert.ok(!h.main.revealed || !h.deputy.revealed);
});

test('Thiên Huyễn: lá vào vùng phán xét của người cùng thế lực có thể bị đưa vào chồng bỏ bằng 1 Huyễn', async () => {
  const { game, ctrls } = makeHG([['yuji', 'jiling'], ['caocao', 'xuchu'], ['yuanshao', 'tianfeng'], ['liubei', 'zhangfei'], ['sunquan', 'huanggai']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  const [hx] = await give(game, 0, 'shan');
  await game.moveCards([hx], { kind: 'hand', seat: 0 }, { kind: 'special', seat: 0 }, 'test');
  ctrls[0].set('confirm', onlySkill('qianhuan'));
  const [lb] = await give(game, 1, 'lebu');
  game.state.currentSeat = 1;
  game.state.phase = 'play';
  await game.useCard(1, lb, [2]);
  assert.equal(game.player(2).judgeArea.length, 0);
  assert.ok(game.state.discardPile.includes(lb) && game.state.discardPile.includes(hx));
});

test('Ám Dũng: nhân đôi sát thương; mục tiêu đã mở hết tướng thì mất 1 máu và mất kỹ năng', async () => {
  const { game, ctrls } = makeHG([['xunchen', 'jiling'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('anyong'));
  const hp0 = game.player(0).hp, hp1 = game.player(1).hp;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, hp1 - 2);
  assert.equal(game.player(0).hp, hp0 - 1);
  game.state.turnCount++;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, hp1 - 3, 'đã mất Ám Dũng');
});

test('Vấn Kế: người khác thế lực giao lá thì Lưu Kỳ giao lại 1 lá khác', async () => {
  const { game, ctrls } = makeHG([['jiling', 'liuqi'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('wenji')).set('chooseTargets', targets(1));
  game.state.currentSeat = 0;
  const h0 = handSize(game, 0), h1 = handSize(game, 1);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(handSize(game, 0), h0);
  assert.equal(handSize(game, 1), h1);
});

test('Ty Địch: người cùng thế lực bị thương đặt Ngự; đầu lượt người khác thế lực bỏ Ngự để cấm loại bài', async () => {
  const { game, ctrls } = makeHG([['caozhen', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [s] = await give(game, 0, 'sha');
  ctrls[0].set('confirm', onlySkill('sidi')).set('chooseCards', (r) => ({ kind: 'cards', cardIds: (r as { cardIds: number[] }).cardIds.slice(0, 1) }));
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(0).special.length, 1);
  void s;
  game.state.currentSeat = 1;
  await game.bus.emit('turnStart', { seat: 1 });
  const ty = Object.keys(game.player(1).flags).find((k) => k.startsWith('turn_banType_'));
  assert.ok(ty, 'đã cấm một loại bài');
  void stackTop;
});
