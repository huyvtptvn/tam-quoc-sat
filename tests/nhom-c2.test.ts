// Test nhóm C2: tướng SP (content/generals/sp-2.json, content/scripts/goi-sp-2.mjs).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import { SKILLS } from '../src/hegemony/skills.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import type { Request } from '../src/core/types.js';
import { give } from './helpers.js';
import { makeHG, revealAll, onlySkill, YES, FIRST_OPTION } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const pickSeat = (seat: number) => (req: Request) => ({ kind: 'targets' as const, targets: (req as { candidates: number[] }).candidates.includes(seat) ? [seat] : [] });
const pickIndex = (i: number) => () => ({ kind: 'choice' as const, index: i });
async function clearHand(game: HegemonyGame, seat: number) {
  await game.moveCards([...game.player(seat).hand], { kind: 'hand', seat }, { kind: 'discard' }, 'test');
}
function enterPlay(game: HegemonyGame, seat: number) {
  game.state.currentSeat = seat;
  game.state.phase = 'play';
}

test('C2: các tướng có đủ kỹ năng', () => {
  for (const s of ['kangrui', 'huxun', 'yuancong', 'shefu', 'benyu', 'tanfeng', 'lifu', 'yanzhong', 'jinwu', 'zhuke', 'quanjia',
    'mashu_maxiumatie', 'kenshang', 'xiaolian', 'kangkai', 'feiying_caoang', 'jutian', 'haokui', 'xushi', 'jiange', 'qianxue', 'zhuhu', 'nizhan']) {
    assert.ok(SKILLS[s], `thiếu kỹ năng ${s}`);
  }
});

test('Kháng Nhuệ (Trương Dực): hủy Sát của đồng minh, đồng minh bổ sung bài và không thể nhắm người khác', async () => {
  const { game, ctrls } = makeHG([['zhangyi', 'guanyu'], ['liubei', 'zhangfei'], ['caocao', 'xuchu'], ['sunquan', 'zhouyu'], ['lvbu', 'huatuo']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await clearHand(game, 1);
  const [s1, s2] = await give(game, 1, 'sha', 'sha');
  ctrls[0].set('confirm', onlySkill('kangrui'));
  enterPlay(game, 1);
  const hp2 = game.player(2).hp;
  const r = await game.useCard(1, s1, [2]);
  assert.equal(r.ok, true);
  assert.equal(game.player(2).hp, hp2, 'Sát bị hủy bỏ mục tiêu');
  assert.equal(game.player(1).hand.length, game.player(1).hp, 'bổ sung bài đến số máu');
  assert.notEqual(game.checkUse(1, s2, [2]), null, 'giai đoạn này không thể nhắm người khác');
});

test('Kháng Nhuệ: chọn mục 2 — mục tiêu ban đầu xem như dùng Quyết Đấu +1 sát thương', async () => {
  const { game, ctrls } = makeHG([['zhangyi', 'guanyu'], ['liubei', 'zhangfei'], ['caocao', 'xuchu'], ['sunquan', 'zhouyu'], ['lvbu', 'huatuo']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await clearHand(game, 1);
  const [s1] = await give(game, 1, 'sha');
  ctrls[0].set('confirm', onlySkill('kangrui'));
  ctrls[1].set('choose', pickIndex(1));
  enterPlay(game, 1);
  const hp1 = game.player(1).hp;
  await game.useCard(1, s1, [2]);
  assert.equal(game.player(1).hp, hp1 - 2, 'P1 không có Sát, chịu 2 sát thương từ Quyết Đấu');
});

test('Hổ Huân (Trình Phổ): có người hấp hối do bạn, cuối lượt tăng giới hạn máu và hồi máu', async () => {
  const { game, ctrls } = makeHG([['chengpu', 'sunquan'], ['caocao', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('huxun'));
  game.state.currentSeat = 0;
  game.player(1).hp = 1;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  const max = game.player(0).maxHp;
  await game.bus.emit('turnEnd', { seat: 0 });
  assert.equal(game.player(0).maxHp, max + 1);
  assert.equal(game.player(0).hp, max + 1);
});

test('Nguyên Tòng (Trình Phổ): đồng minh không gây sát thương thì giao 1 lá, Trình Phổ dùng 1 lá trên tay', async () => {
  const { game, ctrls } = makeHG([['chengpu', 'sunquan'], ['zhouyu', 'lvmeng'], ['caocao', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clearHand(game, 0);
  const [wz] = await give(game, 0, 'wuzhong');
  ctrls[0].set('confirm', onlySkill('yuancong'));
  ctrls[0].set('chooseCards', (req) => ({ kind: 'cards', cardIds: (req as { cardIds: number[] }).cardIds.filter((id) => id === wz) }));
  ctrls[1].set('chooseCards', (req) => ({ kind: 'cards', cardIds: (req as { cardIds: number[] }).cardIds.slice(0, 1) }));
  game.state.currentSeat = 1;
  await game.bus.emit('phaseEnd', { seat: 1, phase: 'play' });
  assert.ok(!game.player(0).hand.includes(wz), 'đã dùng Vô Trung Sinh Hữu');
  assert.equal(game.player(0).hand.length, 3, '1 lá được giao + 2 lá từ Vô Trung');
});

test('Phục Binh (Trình Dục): đặt Sát làm Phục Binh, hủy hoàn toàn Sát của người khác', async () => {
  const { game, ctrls } = makeHG([['chengyu', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [amb] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  await SKILLS.shefu.active!.run(game, 0, [amb], []);
  assert.ok(game.player(0).special.includes(amb));
  ctrls[0].set('confirm', onlySkill('shefu'));
  const [s] = await give(game, 1, 'sha');
  enterPlay(game, 1);
  game.player(1).flags = {};
  const hp0 = game.player(0).hp;
  await game.useCard(1, s, [0]);
  assert.equal(game.player(0).hp, hp0, 'Sát bị hủy');
  assert.ok(game.state.discardPile.includes(amb), 'Phục Binh vào chồng bỏ');
});

test('Bí Dục (Trình Dục): ít bài hơn nguồn sát thương thì bổ sung bài bằng họ', async () => {
  const { game, ctrls } = makeHG([['chengyu', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clearHand(game, 0);
  ctrls[0].set('confirm', onlySkill('benyu'));
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(0).hand.length, Math.min(5, game.player(1).hand.length));
});

test('Tham Phong (Hạ Hầu Thượng): bỏ 1 lá của người khác thế lực; họ nhận 1 sát thương Hỏa để bạn bỏ qua giai đoạn ra bài', async () => {
  const { game, ctrls } = makeHG([['xiahoushang', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('tanfeng')).set('chooseTargets', pickSeat(1));
  ctrls[1].set('choose', (req) => ({ kind: 'choice', index: (req as { prompt: string }).prompt.includes('chọn giai đoạn') ? 2 : 1 }));
  game.state.currentSeat = 0;
  const n1 = game.cardCount(1), hp1 = game.player(1).hp;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'start' });
  assert.equal(game.cardCount(1), n1 - 1);
  assert.equal(game.player(1).hp, hp1 - 1);
  const ctx = await game.bus.emit('phaseBefore', { seat: 0, phase: 'play', skip: false });
  assert.equal(ctx.skip, true);
  const ctx2 = await game.bus.emit('phaseBefore', { seat: 0, phase: 'draw', skip: false });
  assert.equal(ctx2.skip, false);
});

test('Lễ Phụ (Cố Ung): mục tiêu bỏ 2 lá rồi nhận lá trên cùng chồng bài', async () => {
  const { game } = makeHG([['guyong', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  enterPlay(game, 0);
  const top = game.state.drawPile[game.state.drawPile.length - 1];
  const n = game.cardCount(1);
  await SKILLS.lifu.active!.run(game, 0, [], [1]);
  assert.equal(game.cardCount(1), n - 1);
  assert.ok(game.player(1).hand.includes(top));
});

test('Ngôn Trung (Cố Ung): đoán đúng Bích thì người kia mất 1 máu', async () => {
  const { game, ctrls } = makeHG([['guyong', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await clearHand(game, 1);
  const spade = game.state.drawPile.find((id) => game.card(id).suit === 'spade')!;
  await game.moveCards([spade], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  ctrls[0].set('confirm', onlySkill('yanzhong')).set('choose', pickIndex(0)).set('chooseTargets', pickSeat(1));
  game.state.currentSeat = 0;
  const hp1 = game.player(1).hp;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.ok(game.state.discardPile.includes(spade));
});

test('Lý Nghiêm: Trúc Khoa giảm 1 âm dương ngư khi là chủ tướng; Căng Võ chấp hành quân lệnh (chọn lại bằng Trúc Khoa) rồi xem như dùng Sát', async () => {
  const { game, ctrls } = makeHG([['liyan', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  assert.equal(game.player(0).maxHp, 3, '(4 - 1 + 4) / 2 = 3');
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('jinwu')).set('chooseTargets', pickSeat(1));
  ctrls[0].set('choose', (req) => {
    const r = req as { prompt: string; options: string[] };
    if (r.prompt.startsWith('Trúc Khoa: chọn lại')) { reselect = true; return { kind: 'choice', index: 1 }; }
    const i = r.options.findIndex((o) => o.includes('Quân lệnh 2:'));
    return { kind: 'choice', index: i >= 0 ? i : 0 };
  });
  let reselect = false;
  game.state.currentSeat = 0;
  const hp1 = game.player(1).hp;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.ok(reselect, 'được hỏi chọn lại quân lệnh (Trúc Khoa)');
  assert.ok(game.log.some((l) => l.includes('rút lại 2 quân lệnh')), 'rút 2 quân lệnh mới');
  assert.equal(game.player(1).hp, hp1 - 1, 'Sát của Căng Võ trúng');
  assert.ok(!game.player(0).flags.endPlay);
});

test('Khuyến Giá (Lý Nghiêm phó tướng): triệu hoán — người hưởng ứng không thành dã tâm gia, cả thế lực bốc 1 lá', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'liyan'], ['guanyu', 'zhaoyun'], ['caocao', 'xuchu']]);
  await game.setup();
  ctrls[1].set('confirm', onlySkill('quanjia'));
  const n0 = game.player(0).hand.length, n1 = game.player(1).hand.length;
  await game.reveal(0, 'deputy');
  assert.equal(game.hero(1).main.revealed, true);
  assert.equal(game.hero(1).careerist, false, 'hưởng ứng triệu hoán không thành dã tâm gia');
  assert.ok(game.isSameFaction(0, 1));
  assert.equal(game.player(0).hand.length, n0 + 1);
  assert.equal(game.player(1).hand.length, n1 + 1);
});

test('Khẩn Thương (Mã Hưu & Mã Thiết): dùng 2 lá như Sát, gây 1 sát thương thì rút 1 lá; dùng 1 lá trúng thì mất Mã Thuật', async () => {
  const { game, ctrls } = makeHG([['maxiumatie', 'lvbu'], ['caocao', 'xuchu'], ['liubei', 'zhangfei'], ['sunquan', 'zhouyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  ctrls[0].set('choose', pickIndex(0));
  enterPlay(game, 0);
  game.player(0).flags = {};
  assert.equal(game.distance(0, 2), 1, 'Mã Thuật: khoảng cách 2 - 1');
  const ids = game.player(0).hand.slice(0, 2);
  const n = game.player(0).hand.length, hp1 = game.player(1).hp;
  await SKILLS.kenshang.active!.run(game, 0, ids, [1]);
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.equal(game.player(0).hand.length, n - 2 + 1);
  game.player(0).flags = {};
  const [one] = game.player(0).hand;
  await SKILLS.kenshang.active!.run(game, 0, [one], [1]);
  assert.equal(game.distance(0, 2), 2, 'đã mất Mã Thuật');
});

test('Khảng Khái + Hiếu Liêm (Tào Ngang): loại bỏ tướng khi đồng minh bị Sát, đồng minh nhận Phi Ảnh, hồi máu; cả thế lực rút 1 lá', async () => {
  const { game, ctrls } = makeHG([['caoang', 'xuchu'], ['caocao', 'zhenji'], ['liubei', 'zhangfei'], ['sunquan', 'zhouyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  ctrls[0].set('confirm', onlySkill('kangkai')).set('chooseTargets', pickSeat(1));
  game.player(1).hp -= 2;
  const hp1 = game.player(1).hp;
  const n0 = game.player(0).hand.length, n1 = game.player(1).hand.length;
  const [s] = await give(game, 2, 'sha');
  enterPlay(game, 2);
  game.player(2).flags = {};
  const d = game.distance(3, 1);
  const r = await game.useCard(2, s, [1]);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.equal(game.hero(0).main.removed, true);
  assert.ok(game.grantedSkills(1).includes('feiying_caoang'));
  assert.equal(game.distance(3, 1), d + 1, 'Phi Ảnh: khoảng cách đến P1 +1');
  assert.equal(game.player(1).hp, hp1 + 1 - 1, 'hồi 1 máu rồi trúng Sát');
  assert.equal(game.player(0).hand.length, n0 + 1);
  assert.equal(game.player(1).hand.length, n1 + 1);
});

test('Cự Thiên (Chu Hoàn): sau khi gây sát thương, lệnh người bị thương bỏ bài đến bằng số máu', async () => {
  const { game, ctrls } = makeHG([['zhuhuan', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await give(game, 1, 'sha', 'sha');
  ctrls[0].set('confirm', onlySkill('jutian')).set('chooseTargets', pickSeat(1));
  game.state.currentSeat = 0;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hand.length, game.player(1).hp);
});

test('Hư Thực (Trần Đăng): đang úp thì hủy Sát nhắm vào mình và bỏ 1 lá của người dùng', async () => {
  const { game, ctrls } = makeHG([['lvbu', 'chendeng'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 1);
  await game.reveal(0, 'main');
  ctrls[0].set('confirm', onlySkill('xushi'));
  const [s] = await give(game, 1, 'sha');
  enterPlay(game, 1);
  game.player(1).flags = {};
  const hp0 = game.player(0).hp, n1 = game.cardCount(1);
  await game.useCard(1, s, [0]);
  assert.equal(game.player(0).hp, hp0);
  assert.equal(game.hero(0).deputy.revealed, true);
  assert.equal(game.cardCount(1), n1 - 2, 'mất lá Sát + 1 lá bị bỏ');
});

test('Hào Khôi (Trần Đăng): rút 2 lá, lá bỏ ở giai đoạn bỏ bài giao cho người khác có thế lực', async () => {
  const { game, ctrls } = makeHG([['lvbu', 'chendeng'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('haokui'));
  ctrls[0].set('discard', (req, v) => ({ kind: 'discard', cardIds: v.myHand.slice(0, (req as { count: number }).count).map((c) => c.id) }));
  const n1 = game.player(1).hand.length;
  await game.runTurn(0);
  const discarded = game.lastDiscardPhase?.ids ?? [];
  assert.ok(discarded.length > 0, 'có bỏ bài');
  for (const id of discarded) assert.ok(game.player(1).hand.includes(id), 'lá bỏ được giao cho P1');
  assert.equal(game.player(1).hand.length, n1 + discarded.length);
});

test('Thạch Thao: Kiếm Ca (lá phi cơ bản như Sát), máu giảm khi là chủ tướng; Trục Cốc: đồng minh đổi phó tướng thì Thạch Thao bị đổi đi', async () => {
  const { game } = makeHG([['shitao', 'lvbu'], ['huatuo', 'diaochan'], ['caocao', 'xuchu'], ['liubei', 'zhangfei']]);
  await game.setup();
  assert.equal(game.player(0).maxHp, Math.floor((4 - 1 + 5) / 2));
  await revealAll(game, 0, 1);
  const trick = game.player(0).hand.find((id) => game.card(id).type !== 'basic')
    ?? (await give(game, 0, 'wuzhong'))[0];
  assert.ok(game.cardCountsAs(0, game.card(trick)).includes('sha'));
  await game.transformDeputy(1);
  const h = game.hero(0);
  assert.equal(h.main.generalId, 'lvbu', 'đã hoán đổi chủ/phó tướng');
  assert.notEqual(h.deputy.generalId, 'shitao', 'Thạch Thao bị đổi đi');
});

test('Tiềm Học (Thạch Thao): mất lá cuối cùng trên tay trong lượt thì cuối lượt thu lấy lá phi cơ bản đã vào chồng bỏ', async () => {
  const { game, ctrls } = makeHG([['shitao', 'lvbu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  ctrls[0].set('confirm', onlySkill('qianxue')).set('chooseCards', (req) => ({ kind: 'cards', cardIds: (req as { cardIds: number[] }).cardIds.slice(0, 1) }));
  game.state.currentSeat = 1;
  const [wz] = await give(game, 1, 'wuzhong');
  await game.moveCards([wz], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  await clearHand(game, 0);
  await game.bus.emit('turnEnd', { seat: 1 });
  assert.ok(game.player(0).hand.includes(wz));
});

test('Nghịch Trảm (Tôn Hoàn): né Sát của người khác, cuối lượt họ xem như dùng Sát bỏ qua phòng cụ', async () => {
  const { game, ctrls } = makeHG([['sunhuan', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const [rw] = await give(game, 1, 'renwang');
  await game.equip(1, game.card(rw));
  await give(game, 0, 'shan');
  ctrls[0].set('respond', FIRST_OPTION).set('confirm', onlySkill('nizhan')).set('choose', pickIndex(1));
  const [s] = await give(game, 1, 'sha');
  enterPlay(game, 1);
  game.player(1).flags = {};
  const hp0 = game.player(0).hp;
  await game.useCard(1, s, [0]);
  assert.equal(game.player(0).hp, hp0, 'đã né');
  ctrls[0].set('respond', () => ({ kind: 'pass' }));
  const hp1 = game.player(1).hp;
  await game.bus.emit('turnEnd', { seat: 1 });
  assert.equal(game.player(1).hp, hp1 - 1, 'Sát đen vẫn trúng dù có Nhân Vương Thuẫn');
});

void YES;
