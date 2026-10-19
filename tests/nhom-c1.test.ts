// Test nhóm C1: tướng SP (content/generals/sp-1.json, content/scripts/goi-sp-1.mjs).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import { GENERALS } from '../src/hegemony/generals.js';
import { SKILLS } from '../src/hegemony/skills.js';
import type { Card, Request } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { enterPlay, give } from './helpers.js';
import { makeHG, revealAll, stackTop, YES, onlySkill, FIRST_OPTION, type Handler } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const IDS = ['liaohua', 'zhugejin', 'quancong', 'guohuai', 'yangxiu', 'zumao', 'fuwan', 'chendao', 'tianyu', 'huaxiong', 'liufuren', 'yijibo'];

/** Đưa một lá thỏa điều kiện từ chồng bốc lên tay. */
async function take(game: HegemonyGame, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('không tìm thấy lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}
const pickTargets = (seat: number): Handler => (req) => ({ kind: 'targets', targets: (req as { candidates: number[] }).candidates.includes(seat) ? [seat] : [] });
const pickCards = (pred: (id: number) => boolean): Handler => (req) => {
  const r = req as { cardIds: number[]; min: number };
  const ids = r.cardIds.filter(pred);
  return { kind: 'cards', cardIds: ids.length ? ids.slice(0, Math.max(1, r.min)) : r.cardIds.slice(0, r.min) };
};
const chooseIndex = (i: number): Handler => () => ({ kind: 'choice', index: i });
const chooseMatching = (text: string): Handler => (req) => ({ kind: 'choice', index: Math.max(0, (req as { options: string[] }).options.findIndex((o) => o.includes(text))) });

test('C1: 12 tướng được bật, đủ kỹ năng', () => {
  for (const id of IDS) {
    const g = GENERALS.find((x) => x.id === id);
    assert.ok(g, `${id} chưa được bật`);
    for (const s of g!.skills) assert.ok(SKILLS[s], `${id}: thiếu kỹ năng ${s}`);
  }
  assert.ok(GENERALS.find((x) => x.id === 'liufuren')?.female, 'Lưu Phu Nhân là nữ');
});

test('Đương Tiên: lật lần đầu nhận Tiên Khu, mỗi lượt có thêm 1 giai đoạn ra bài', async () => {
  const { game, ctrls } = makeHG([['liaohua', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  ctrls[0].set('confirm', YES);
  await game.runTurn(0);
  assert.equal(game.hero(0).main.revealed, true);
  assert.equal(game.hero(0).marks.pioneer, 2, 'Tiên Khu lật đầu tiên + Đương Tiên');
  assert.equal(ctrls[0].asked.filter((r) => r.type === 'play').length, 2, 'hai giai đoạn ra bài');
  assert.ok(game.log.some((l) => l.includes('được thêm một giai đoạn ra bài')));
});

test('Hoãn Thích: đánh lá Cơ thay phán định Lạc Bất của đồng minh', async () => {
  const { game, ctrls } = makeHG([['zhugejin', 'sunquan'], ['lvmeng', 'huanggai'], ['caocao', 'xuchu'], ['lvbu', 'pangde'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  const lebu = game.state.drawPile.find((i) => game.card(i).name === 'lebu')!;
  await game.moveCards([lebu], { kind: 'draw' }, { kind: 'judge', seat: 1 }, 'test');
  const heart = await take(game, 0, (c) => c.suit === 'heart');
  stackTop(game, (c) => c.suit === 'spade');
  ctrls[0].set('confirm', onlySkill('huanshi')).set('chooseCards', pickCards((id) => id === heart));
  await game.runTurn(1);
  assert.ok(game.log.some((l) => l.includes('Lạc Bất Tư Thục không có hiệu lực')), 'Lạc Bất phải bị hóa giải');
  assert.ok(!game.log.some((l) => l.includes('P1 bỏ qua giai đoạn ra bài')));
  assert.ok(game.state.discardPile.includes(heart));
});

test('Minh Triết: ngoài lượt đánh Thiểm đỏ thì bốc 1 lá', async () => {
  const { game, ctrls } = makeHG([['zhugejin', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  await take(game, 0, (c) => c.name === 'shan' && (c.suit === 'heart' || c.suit === 'diamond'));
  ctrls[0].set('confirm', onlySkill('mingzhe')).set('respond', (_r, v) => {
    const o = v.responseOptions.find((x) => ['heart', 'diamond'].includes(v.myHand.find((c) => c.id === x.cardId)!.suit));
    return o ? { kind: 'card', cardId: o.cardId } : { kind: 'pass' };
  });
  game.state.currentSeat = 1;
  const n = game.player(0).hand.length;
  const c = await game.requestResponse(0, ['shan'], 'test', 1);
  assert.ok(c);
  assert.equal(game.player(0).hand.length, n, 'mất 1 lá Thiểm, bốc 1 lá');
});

test('Hoằng Viện: bốc bài Hợp Tung được chuyển cho đồng minh', async () => {
  const { game, ctrls } = makeHG([['zhugejin', 'sunquan'], ['lvmeng', 'huanggai'], ['caocao', 'xuchu'], ['lvbu', 'pangde'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('hongyuan')).set('chooseTargets', pickTargets(1));
  const h0 = game.player(0).hand.length, h1 = game.player(1).hand.length;
  await game.doTransfer(0, game.player(0).hand[0], 2);
  assert.equal(game.player(0).hand.length, h0 - 1);
  assert.equal(game.player(1).hand.length, h1 + 1);
});

test('Thân Trùng: hoán đổi phó tướng với người cùng thế lực', async () => {
  const { game, ctrls } = makeHG([['sunquan', 'quancong'], ['lvmeng', 'huanggai'], ['caocao', 'xuchu'], ['lvbu', 'pangde'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('qinzhong')).set('chooseTargets', pickTargets(1));
  await game.runTurn(0);
  assert.equal(game.hero(0).deputy.generalId, 'huanggai');
  assert.equal(game.hero(1).deputy.generalId, 'quancong');
});

test('Chiêu Phụ: trao [Thưởng], rồi người có [Thưởng] dùng Sát xong thì Toàn Tông xem như dùng Sát', async () => {
  const { game, ctrls } = makeHG([['quancong', 'sunquan'], ['lvmeng', 'huanggai'], ['caocao', 'xuchu'], ['lvbu', 'pangde'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('zhaofu'))
    .set('chooseTargets', (req) => ({ kind: 'targets', targets: (req as { prompt: string }).prompt.includes('[Thưởng]') ? [1]
      : (req as { candidates: number[] }).candidates.filter((c) => c !== 1).slice(0, 1) }));
  enterPlay(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.ok(game.log.some((l) => l.includes('P1 nhận 1 [Thưởng]')));
  enterPlay(game, 1);
  const [sha] = await give(game, 1, 'sha');
  const hp = game.player(2).hp;
  const r = await game.useCard(1, sha, [2]);
  assert.equal(r.ok, true);
  assert.ok(game.log.some((l) => l.includes('P1 mất 1 [Thưởng]')));
  assert.equal(game.player(2).hp, hp - 1);
  assert.ok(game.log.some((l) => l.includes('P0 dùng Sát (Chiêu Phụ)')), 'P0 xem như dùng Sát');
});

test('Tinh Sách: lá thứ X (X = máu) kết toán xong thì ban quân lệnh, không chấp hành -> bốc 2', async () => {
  const { game, ctrls } = makeHG([['guohuai', 'xuchu'], ['liubei', 'zhangfei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  game.player(0).hp = 1;
  ctrls[0].set('confirm', onlySkill('jingce')).set('chooseTargets', pickTargets(2));
  ctrls[2].set('choose', chooseMatching('Không thực hiện'));
  enterPlay(game, 0);
  const [sha] = await give(game, 0, 'sha');
  const h = game.player(0).hand.length;
  await game.useCard(0, sha, [1]);
  assert.ok(game.log.some((l) => l.includes('P2 không thực hiện quân lệnh')));
  assert.equal(game.player(0).hand.length, h - 1 + 2);
});

test('Đạm Lạc: Nam Man nhiều mục tiêu -> bốc 1 lá và miễn nhiễm', async () => {
  const { game, ctrls } = makeHG([['yangxiu', 'caocao'], ['sunquan', 'lvmeng'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('danlao'));
  enterPlay(game, 1);
  const [nm] = await give(game, 1, 'nanman');
  const h = game.player(0).hand.length, hp = game.player(0).hp;
  const r = await game.useCard(1, nm, []);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.equal(game.player(0).hp, hp);
  assert.equal(game.player(0).hand.length, h + 1);
});

test('Kê Lặc: nguồn sát thương không thể dùng/bỏ loại bài đã chọn trong lượt này', async () => {
  const { game, ctrls } = makeHG([['yangxiu', 'caocao'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('jilei')).set('choose', chooseIndex(0));
  enterPlay(game, 1);
  const [s1, s2] = await give(game, 1, 'sha', 'sha');
  await game.useCard(1, s1, [0]);
  assert.equal(game.cardBlocked(1, game.card(s2)), true);
  assert.equal(game.checkUse(1, s2, [0]) !== null, true);
  // Bỏ bài: lá cơ bản không được chọn
  const nonBasic = game.player(1).hand.filter((id) => game.card(id).type !== 'basic').length;
  const dropped = await game.forceDiscard(1, 10, 'test');
  assert.equal(dropped.length, nonBasic);
  assert.ok(dropped.every((id) => game.card(id).type !== 'basic'));
});

test('Dẫn Binh + Tuyệt Địa: đặt [Trách], bị Sát thì bỏ 1, đầu lượt bỏ hết và bổ sung bài', async () => {
  const { game, ctrls } = makeHG([['zumao', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await give(game, 0, 'wuzhong', 'nanman');
  ctrls[0].set('confirm', YES).set('chooseCards', (req) => ({ kind: 'cards', cardIds: [...(req as { cardIds: number[] }).cardIds] }));
  ctrls[0].set('play', () => ({ kind: 'endPlay' }));
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  const n = game.player(0).special.length;
  assert.ok(n >= 2, 'ít nhất 2 [Trách]');
  enterPlay(game, 1);
  const [sha] = await give(game, 1, 'sha');
  await game.useCard(1, sha, [0]);
  assert.equal(game.player(0).special.length, n - 1, 'bị Sát: bỏ 1 [Trách]');
  ctrls[0].set('choose', chooseIndex(0));
  game.state.currentSeat = 0;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(game.player(0).special.length, 0);
  assert.ok(game.player(0).hand.length >= game.player(0).maxHp);
});

test('Mưu Hội: bốc 1 lá; bị né thì mục tiêu bỏ 1 lá của Phục Hoàn', async () => {
  const { game, ctrls } = makeHG([['fuwan', 'jiaxu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('moukui')).set('choose', chooseIndex(0));
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'shan');
  enterPlay(game, 0);
  const [sha] = await give(game, 0, 'sha');
  const before = game.cardCount(0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.cardCount(0), before - 1 + 1 - 1);
  assert.ok(game.log.some((l) => l.includes('P0 mất')));
});

test('Vãng Liệt: lá đầu không giới hạn khoảng cách; không ai hưởng ứng được, sau đó không thể dùng bài', async () => {
  const { game, ctrls } = makeHG([['chendao', 'zhangfei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng'], ['lvbu', 'pangde']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  ctrls[0].set('confirm', onlySkill('wanglie'));
  ctrls[2].set('respond', FIRST_OPTION);
  await give(game, 2, 'shan');
  enterPlay(game, 0);
  const [s1, s2] = await give(game, 0, 'sha', 'sha');
  assert.ok(game.distance(0, 2) <= game.attackRange(0), 'lá đầu không giới hạn khoảng cách');
  const hp = game.player(2).hp;
  const r = await game.useCard(0, s1, [2]);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.equal(game.player(2).hp, hp - 1, 'không thể đánh Thiểm');
  assert.equal(game.cardBlocked(0, game.card(s2)), true);
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'play' });
  assert.equal(game.cardBlocked(0, game.card(s2)), false);
});

test('Địa Tải: vây công, người vây còn lại bỏ 1 lá để Sát +1 sát thương', async () => {
  const { game, ctrls } = makeHG([['chendao', 'zhangfei'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['lvbu', 'pangde']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  ctrls[0].set('confirm', onlySkill('dizai'));
  enterPlay(game, 0);
  const [sha] = await give(game, 0, 'sha');
  const hp = game.player(1).hp;
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).hp, hp - 2);
});

test('Chấn Tập: chuyển hóa lá Rô thành Lạc Bất lên mục tiêu của Sát', async () => {
  const { game, ctrls } = makeHG([['tianyu', 'caocao'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const dia = await take(game, 0, (c) => c.suit === 'diamond' && c.type !== 'trick' && c.type !== 'delayed' && c.name !== 'sha');
  ctrls[0].set('confirm', onlySkill('zhenxi')).set('choose', chooseMatching('Đặt')).set('chooseCards', pickCards((id) => id === dia));
  enterPlay(game, 0);
  const [sha] = await give(game, 0, 'sha');
  await game.useCard(0, sha, [1]);
  assert.ok(game.player(1).judgeArea.includes(dia));
  assert.equal(game.delayedName(dia), 'lebu');
});

test('Kiệm Tố: bài nhận ngoài lượt thành [Kim]; đầu giai đoạn ra bài bỏ [Kim] để hồi máu', async () => {
  const { game, ctrls } = makeHG([['caocao', 'tianyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('jiansu')).set('chooseTargets', pickTargets(0));
  game.state.currentSeat = 1;
  const got = await game.draw(0, 2);
  assert.ok(game.log.some((l) => l.includes('là [Kim]')));
  game.player(0).hp = 1;
  ctrls[0].set('chooseCards', pickCards((id) => got.includes(id)));
  enterPlay(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.player(0).hp, 2);
  assert.ok(game.state.discardPile.some((id) => got.includes(id)));
});

test('Diệu Võ: gây sát thương khi Hoa Hùng còn úp -> +2 giới hạn máu, hồi 2', async () => {
  const { game, ctrls } = makeHG([['huaxiong', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await game.reveal(0, 'deputy');
  await revealAll(game, 1);
  ctrls[0].set('confirm', onlySkill('yaowu'));
  game.player(0).hp = 1;
  const max = game.player(0).maxHp;
  enterPlay(game, 0);
  const [sha] = await give(game, 0, 'sha');
  await game.useCard(0, sha, [1]);
  assert.equal(game.hero(0).main.revealed, true);
  assert.equal(game.player(0).maxHp, max + 2);
  assert.equal(game.player(0).hp, 3);
});

test('Thị Dũng: chưa Diệu Võ, bị lá đen gây sát thương thì bốc 1 lá', async () => {
  const { game } = makeHG([['huaxiong', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const black = game.card(game.state.drawPile.find((i) => ['spade', 'club'].includes(game.card(i).suit))!);
  const h = game.player(0).hand.length;
  await game.damage({ source: 1, target: 0, amount: 1, card: black, cancelled: false });
  assert.equal(game.player(0).hand.length, h + 1);
});

test('Truy Đố: người bị sát thương chọn +1 sát thương', async () => {
  const { game, ctrls } = makeHG([['liufuren', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('zhuidu'));
  ctrls[1].set('choose', chooseMatching('+1'));
  enterPlay(game, 0);
  const [sha] = await give(game, 0, 'sha');
  const hp = game.player(1).hp;
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).hp, hp - 2);
});

test('Kỳ Cung: hấp hối ngoài lượt, loại phó tướng; người trong lượt nhận kỹ năng, Lưu Phu Nhân hồi đầy máu', async () => {
  const { game, ctrls } = makeHG([['liufuren', 'huatuo'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('shigong'));
  ctrls[1].set('choose', chooseMatching('Nhận'));
  game.state.currentSeat = 1;
  await game.damage({ source: 1, target: 0, amount: game.player(0).hp, card: null, cancelled: false });
  assert.equal(game.player(0).alive, true);
  assert.equal(game.player(0).hp, game.player(0).maxHp);
  assert.equal(game.hero(0).deputy.removed, true);
  assert.equal(game.grantedSkills(1).length, 1);
});

test('Định Khoa + Cấp Viện: đồng minh mất bài ngoài lượt -> giao 1 lá, cho bốc 1 lá, nhận Âm Dương Ngư', async () => {
  const { game, ctrls } = makeHG([['yijibo', 'liubei'], ['zhangfei', 'guanyu'], ['caocao', 'xuchu'], ['lvbu', 'pangde'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('dingke')).set('choose', chooseIndex(0));
  game.state.currentSeat = 2;
  const h1 = game.player(1).hand.length;
  await game.moveCards([game.player(1).hand[0]], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'guohe');
  assert.equal(game.player(1).hand.length, h1 - 1 + 1 + 1);
  assert.equal(game.hero(0).marks.yinyang, 1 + ((3 + 4) % 2));
  // Mỗi lượt 1 lần
  await game.moveCards([game.player(1).hand[0]], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'guohe');
  assert.equal(game.player(1).hand.length, h1);
});

test('Cấp Viện: người hấp hối được bốc 1 lá', async () => {
  const { game, ctrls } = makeHG([['yijibo', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('jiyuan'));
  const req: Request[] = [];
  ctrls[0].set('save', (r) => { req.push(r); return { kind: 'pass' }; });
  await game.damage({ source: 1, target: 0, amount: game.player(0).hp, card: null, cancelled: false });
  assert.ok(game.log.some((l) => l.includes('kích hoạt Cấp Viện')));
  assert.ok(game.log.some((l) => l.includes('P0 bốc 1 lá')));
});
