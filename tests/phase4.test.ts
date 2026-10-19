// Test giai đoạn 4: bộ bài đầy đủ — trang bị, cẩm nang, cẩm nang trì hoãn, Vô Giải, thuộc tính, xích, Rượu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, buildDeckById, buildStandardDeck, CARD_INFO, isRed, QUOCCHIEN_BASE } from '../src/core/cards.js';
import { Game, type GameOptions } from '../src/core/game.js';
import type { Card, CardName, Request, Response } from '../src/core/types.js';
import { enterPlay, give } from './helpers.js';
import { ByType, FIRST_OPTION, makeHG, revealAll, stackTop, YES, type Handler } from './hg-helpers.js';

// ------------------------------------------------------------ Trợ giúp

function makeG(n: number, opts: GameOptions = {}) {
  const ctrls = Array.from({ length: n }, () => new ByType());
  const game = new Game(ctrls.map((controller, i) => ({ name: `P${i}`, team: `T${i}`, controller })),
    { seed: 7, deck: buildDeckById('quantranh'), ...opts }); // bộ có đủ Cổ Đĩnh Đao, Thanh Long, Phương Thiên bản thường
  return { game, ctrls };
}

/** Lấy từ chồng bốc lá đầu tiên thỏa điều kiện vào tay. */
async function take(game: Game, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('Không tìm thấy lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}
const is = (n: CardName, nature?: 'normal' | 'fire' | 'thunder') =>
  (c: Card) => c.name === n && (nature === undefined || (c.nature ?? 'normal') === nature);

/** Lắp thẳng một trang bị từ chồng bốc. */
async function equipFromDeck(game: Game, seat: number, n: CardName): Promise<number> {
  const id = game.state.drawPile.find((i) => game.card(i).name === n)!;
  await game.moveCards([id], { kind: 'draw' }, { kind: 'equip', seat, slot: CARD_INFO[n].slot! }, 'test');
  return id;
}

/** Vô Giải: chỉ đánh khi trạng thái "bị chặn" hiện tại bằng `whenCancelled`. */
const nullifyWhen = (whenCancelled: boolean): Handler => (req, v) => {
  const ctx = (req as Extract<Request, { type: 'respond' }>).context;
  if (ctx?.kind === 'nullify' && ctx.cancelled === whenCancelled && v.responseOptions[0]) {
    return { kind: 'card', cardId: v.responseOptions[0].cardId };
  }
  return ctx?.kind === 'nullify' ? { kind: 'pass' } : FIRST_OPTION(req, v);
};

const hp = (game: Game, seat: number) => game.player(seat).hp;
const full = (game: Game, seat: number) => game.player(seat).maxHp;

// ============================================================ Bộ bài

test('bộ Quốc Chiến tiêu chuẩn: 108 lá theo mã nguồn; bộ đầy đủ 169 lá (5 lá để riêng ngoài ván), id không trùng', () => {
  const base = build(QUOCCHIEN_BASE);
  assert.equal(base.length, 108);
  const count = (t: string) => base.filter((c) => c.type === t).length;
  assert.deepEqual([count('basic'), count('trick'), count('delayed'), count('equip')], [54, 29, 5, 20]);
  assert.ok(base.filter((c) => c.name === 'shan').every(isRed), 'Thiểm đều đỏ');
  const full = buildStandardDeck();
  assert.equal(full.length, 169);
  assert.equal(new Set(full.map((c) => c.id)).size, 169);
  assert.equal(full.filter((c) => c.setAside).length, 5);
  assert.equal(full.filter((c) => c.transferable).length, 13);
})

// ============================================================ Trang bị

test('vũ khí: tầm đánh theo vũ khí; lắp vũ khí mới thì vũ khí cũ vào chồng bỏ', async () => {
  const { game } = makeG(2);
  const a = await take(game, 0, is('qinglong'));
  const b = await take(game, 0, is('zhuge'));
  enterPlay(game, 0);
  await game.useCard(0, a, []);
  assert.equal(game.attackRange(0), 3);
  await game.useCard(0, b, []);
  assert.equal(game.attackRange(0), 1);
  assert.ok(game.state.discardPile.includes(a));
});

test('Gia Cát Liên Nỏ: dùng Sát không giới hạn', async () => {
  const { game } = makeG(2);
  await equipFromDeck(game, 0, 'zhuge');
  const s1 = await take(game, 0, is('sha', 'normal'));
  const s2 = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, s1, [1])).ok, true);
  assert.equal((await game.useCard(0, s2, [1])).ok, true);
  assert.equal(hp(game, 1), full(game, 1) - 2);
});

test('ngựa: -1 rút ngắn khoảng cách mình đến người khác, +1 tăng khoảng cách người khác đến mình', async () => {
  const { game } = makeG(5);
  assert.equal(game.distance(0, 2), 2);
  await equipFromDeck(game, 0, 'chitu');
  assert.equal(game.distance(0, 2), 1);
  await equipFromDeck(game, 2, 'jueying');
  assert.equal(game.distance(0, 2), 2);
  assert.equal(game.distance(1, 2), 2);
  assert.equal(game.distance(2, 1), 1, 'ngựa +1 không ảnh hưởng chiều đi');
});

test('Nhân Vương Thuẫn chặn Sát đen; Sát đỏ vẫn trúng; Thanh Công Kiếm bỏ qua giáp', async () => {
  const { game } = makeG(2);
  await equipFromDeck(game, 1, 'renwang');
  const black = await take(game, 0, (c) => is('sha', 'normal')(c) && !isRed(c));
  enterPlay(game, 0);
  await game.useCard(0, black, [1]);
  assert.equal(hp(game, 1), full(game, 1));
  const red = await take(game, 0, (c) => is('sha')(c) && isRed(c));
  game.player(0).flags = {};
  await game.useCard(0, red, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1);
  await equipFromDeck(game, 0, 'qinggang');
  const black2 = await take(game, 0, (c) => is('sha', 'normal')(c) && !isRed(c));
  game.player(0).flags = {};
  await game.useCard(0, black2, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 2);
});

test('Đằng Giáp: chặn Sát thường và Nam Man; Hỏa Sát gây thêm 1 sát thương', async () => {
  const { game } = makeG(3);
  await equipFromDeck(game, 1, 'tengjia');
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1));
  const nm = await take(game, 0, is('nanman'));
  await game.useCard(0, nm, []);
  assert.equal(hp(game, 1), full(game, 1), 'Nam Man vô hiệu với Đằng Giáp');
  assert.equal(hp(game, 2), full(game, 2) - 1, 'người không có Đằng Giáp vẫn bị');
  const fire = await take(game, 0, is('sha', 'fire'));
  game.player(0).flags = {};
  await game.useCard(0, fire, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 2);
});

test('Bạch Ngân Sư Tử: sát thương lớn hơn 1 giảm còn 1; khi bị gỡ ra thì hồi 1 máu', async () => {
  const { game } = makeG(2);
  await equipFromDeck(game, 1, 'baiyin');
  const jiu = await take(game, 0, is('jiu'));
  const s = await take(game, 0, is('sha', 'normal'));
  const gh = await take(game, 0, is('guohe'));
  enterPlay(game, 0);
  await game.useCard(0, jiu, []);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1, 'Rượu + Sát = 2 -> giảm còn 1');
  await game.useCard(0, gh, [1]); // Quá Hà Sách Kiều phá giáp (lựa chọn đầu tiên là giáp)
  assert.equal(game.equipOf(1, 'armor'), null);
  assert.equal(hp(game, 1), full(game, 1));
});

test('Bát Quái Trận: phán định đỏ thì coi như đã đánh Thiểm', async () => {
  const { game, ctrls } = makeG(2);
  await equipFromDeck(game, 1, 'bagua');
  ctrls[1].set('confirm', YES);
  const s = await take(game, 0, is('sha', 'normal'));
  stackTop(game as never, isRed);
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1));
  assert.equal(game.totalCards(), game.cards.size);
});

test('Hàn Băng Kiếm: không gây sát thương mà bỏ 2 lá của mục tiêu', async () => {
  const { game, ctrls } = makeG(2);
  await equipFromDeck(game, 0, 'hanbing');
  ctrls[0].set('confirm', YES);
  await take(game, 1, is('tao'));
  await take(game, 1, is('tao'));
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1));
  assert.equal(game.player(1).hand.length, 0);
});

test('Cổ Đĩnh Đao: mục tiêu không có bài trên tay thì sát thương +1', async () => {
  const { game } = makeG(2);
  await equipFromDeck(game, 0, 'guding');
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 2);
});

test('Quán Thạch Phủ: Sát bị né, bỏ 2 lá để Sát vẫn trúng', async () => {
  const { game, ctrls } = makeG(2);
  await equipFromDeck(game, 0, 'guanshi');
  ctrls[0].set('confirm', YES);
  ctrls[1].set('respond', FIRST_OPTION);
  await take(game, 1, is('shan'));
  const s = await take(game, 0, is('sha', 'normal'));
  await take(game, 0, is('tao'));
  await take(game, 0, is('tao'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1);
  assert.equal(game.player(0).hand.length, 0);
});

test('Thanh Long Yển Nguyệt Đao: Sát bị né thì được Sát tiếp', async () => {
  const { game, ctrls } = makeG(2);
  await equipFromDeck(game, 0, 'qinglong');
  ctrls[0].set('respond', FIRST_OPTION);
  ctrls[1].set('respond', FIRST_OPTION);
  await take(game, 1, is('shan'));
  const s = await take(game, 0, is('sha', 'normal'));
  await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1);
  assert.equal(game.player(0).flags.shaUsed, 1, 'Sát thêm không tính vào số lần Sát');
});

test('Phương Thiên Họa Kích: Sát là lá cuối cùng thì chọn được tối đa 3 mục tiêu', async () => {
  const { game } = makeG(4);
  await equipFromDeck(game, 0, 'fangtian');
  const s = await take(game, 0, is('sha', 'normal'));
  const extra = await take(game, 0, is('tao'));
  enterPlay(game, 0);
  assert.notEqual(game.checkUse(0, s, [1, 2, 3]), null, 'còn lá khác trên tay thì không được');
  await game.moveCards([extra], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  assert.equal(game.targetSpec(0, s).max, 3);
  await game.useCard(0, s, [1, 2, 3]);
  for (const t of [1, 2, 3]) assert.equal(hp(game, t), full(game, t) - 1);
});

test('Kỳ Lân Cung: Sát gây sát thương thì bắn rơi ngựa của mục tiêu', async () => {
  const { game, ctrls } = makeG(2);
  await equipFromDeck(game, 0, 'qilin');
  await equipFromDeck(game, 1, 'jueying');
  ctrls[0].set('confirm', YES);
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(game.equipOf(1, 'defHorse'), null);
});

// ============================================================ Rượu

test('Rượu: Sát tiếp theo +1 sát thương, mỗi lượt 1 lần; khi hấp hối chỉ tự cứu được mình', async () => {
  const { game, ctrls } = makeG(3);
  const j1 = await take(game, 0, is('jiu'));
  const j2 = await take(game, 0, is('jiu'));
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, j1, []);
  assert.notEqual(game.checkUse(0, j2, []), null);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 2);

  // P1 còn 2 máu, bị Rượu+Sát lần nữa -> hấp hối, tự cứu bằng Rượu; P2 có Rượu nhưng không được dùng cứu người khác
  ctrls[1].set('save', FIRST_OPTION);
  ctrls[2].set('save', FIRST_OPTION);
  await take(game, 1, is('jiu'));
  await take(game, 2, is('jiu'));
  game.player(0).flags = {};
  const s2 = await take(game, 0, is('sha', 'normal'));
  await game.useCard(0, j2, []);
  await game.useCard(0, s2, [1]);
  assert.equal(game.player(1).alive, true);
  assert.equal(hp(game, 1), 1);
  assert.equal(game.player(2).hand.length, 1, 'Rượu của P2 vẫn còn');
});

// ============================================================ Cẩm nang

test('Quyết Đấu: hai bên lần lượt đánh Sát, ai hết trước thì chịu 1 sát thương', async () => {
  const { game, ctrls } = makeG(2);
  ctrls[1].set('respond', FIRST_OPTION);
  await take(game, 1, is('sha'));
  const jd = await take(game, 0, is('juedou'));
  enterPlay(game, 0);
  await game.useCard(0, jd, [1]);
  assert.equal(hp(game, 0), full(game, 0) - 1, 'P1 đánh 1 Sát, P0 không có Sát -> P0 chịu');
  assert.equal(hp(game, 1), full(game, 1));
});

test('Nam Man / Vạn Tiễn: mỗi người khác đánh Sát / Thiểm hoặc chịu 1 sát thương', async () => {
  const { game, ctrls } = makeG(3);
  ctrls[1].set('respond', FIRST_OPTION);
  ctrls[2].set('respond', FIRST_OPTION);
  await take(game, 1, is('sha'));
  const nm = await take(game, 0, is('nanman'));
  const wj = await take(game, 0, is('wanjian'));
  enterPlay(game, 0);
  await game.useCard(0, nm, []);
  assert.deepEqual([hp(game, 1), hp(game, 2)], [full(game, 1), full(game, 2) - 1]);
  await take(game, 2, is('shan'));
  await game.useCard(0, wj, []);
  assert.deepEqual([hp(game, 1), hp(game, 2)], [full(game, 1) - 1, full(game, 2) - 1]);
  assert.equal(hp(game, 0), full(game, 0), 'không ảnh hưởng người dùng');
});

test('Vô Trung Sinh Hữu bốc 2; Đào Viên Kết Nghĩa mọi người hồi 1', async () => {
  const { game } = makeG(3);
  const wz = await take(game, 0, is('wuzhong'));
  const ty = await take(game, 0, is('taoyuan'));
  enterPlay(game, 0);
  await game.useCard(0, wz, []);
  assert.equal(game.player(0).hand.length, 3);
  game.player(0).hp = 2;
  game.player(1).hp = 3;
  await game.useCard(0, ty, []);
  assert.deepEqual([hp(game, 0), hp(game, 1), hp(game, 2)], [3, 4, 4]);
});

test('Quá Hà Sách Kiều bỏ trang bị; Thuận Thủ chỉ dùng ở khoảng cách 1 và lấy bài về tay', async () => {
  const { game } = makeG(4);
  const armor = await equipFromDeck(game, 1, 'renwang');
  const gh = await take(game, 0, is('guohe'));
  const ss = await take(game, 0, is('shunshou'));
  const target = await take(game, 1, is('tao'));
  enterPlay(game, 0);
  await game.useCard(0, gh, [1]);
  assert.ok(game.state.discardPile.includes(armor));
  assert.notEqual(game.checkUse(0, ss, [2]), null, 'khoảng cách 2');
  await take(game, 2, is('tao'));
  await game.useCard(0, ss, [1]);
  assert.ok(game.player(0).hand.includes(target));
});

test('Hỏa Công: mục tiêu cho xem 1 lá, bỏ 1 lá cùng chất để gây 1 sát thương hỏa', async () => {
  const { game, ctrls } = makeG(2);
  await take(game, 1, (c) => c.name === 'tao' && c.suit === 'heart');
  const hg = await take(game, 0, is('huogong'));
  const heart = await take(game, 0, (c) => c.name === 'shan' && c.suit === 'heart');
  ctrls[0].set('chooseCards', () => ({ kind: 'cards', cardIds: [heart] }));
  enterPlay(game, 0);
  await game.useCard(0, hg, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1);
  assert.ok(game.state.discardPile.includes(heart));
});

test('Thiết Tác Liên Hoàn: xích 2 người, sát thương hỏa truyền qua xích rồi gỡ xích; trùng chú bốc 1', async () => {
  const { game } = makeG(3);
  const ts = await take(game, 0, is('tiesuo'));
  const fire = await take(game, 0, is('sha', 'fire'));
  enterPlay(game, 0);
  await game.useCard(0, ts, [1, 2]);
  assert.ok(game.player(1).chained && game.player(2).chained);
  await game.useCard(0, fire, [1]);
  assert.deepEqual([hp(game, 1), hp(game, 2)], [full(game, 1) - 1, full(game, 2) - 1]);
  assert.ok(!game.player(1).chained && !game.player(2).chained);

  const ts2 = await take(game, 0, is('tiesuo'));
  const before = game.player(0).hand.length;
  await game.useCard(0, ts2, []);
  assert.equal(game.player(0).hand.length, before, 'mất lá Thiết Tác, bốc 1 lá');
  assert.ok(game.state.discardPile.includes(ts2));
});

test('sát thương thường không truyền qua xích', async () => {
  const { game } = makeG(3);
  game.player(1).chained = game.player(2).chained = true;
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(hp(game, 2), full(game, 2));
  assert.ok(game.player(1).chained);
});

// ============================================================ Vô Giải Khả Kích

test('Vô Giải chặn cẩm nang; Vô Giải chặn Vô Giải thì cẩm nang lại có hiệu lực', async () => {
  const { game, ctrls } = makeG(2);
  ctrls[1].set('respond', nullifyWhen(false));
  await take(game, 1, is('wuxie'));
  const jd = await take(game, 0, is('juedou'));
  enterPlay(game, 0);
  await game.useCard(0, jd, [1]);
  assert.equal(hp(game, 1), full(game, 1), 'bị chặn');

  ctrls[0].set('respond', nullifyWhen(true));
  await take(game, 1, is('wuxie'));
  await take(game, 0, (c) => c.name === 'wuxie' || c.name === 'wuxie_guo');
  const jd2 = await take(game, 0, is('juedou'));
  await game.useCard(0, jd2, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1, 'P0 hóa giải Vô Giải của P1');
});

test('Vô Giải·Quốc: chặn Nam Man cho cả thế lực đã lộ của mục tiêu', async () => {
  const { game, ctrls } = makeHG([['lvmeng', 'luxun'], ['caocao', 'xuchu'], ['guojia', 'simayi'], ['zhangfei', 'zhaoyun']]);
  await revealAll(game, 1, 2);
  ctrls[1].set('respond', (req, v) => {
    const ctx = (req as Extract<Request, { type: 'respond' }>).context;
    return ctx?.kind === 'nullify' && ctx.target === 1 && !ctx.cancelled && v.responseOptions[0]
      ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' };
  });
  await give(game, 1, 'wuxie_guo');
  const [nm] = await give(game, 0, 'nanman');
  enterPlay(game, 0);
  await game.useCard(0, nm, []);
  assert.equal(hp(game, 1), full(game, 1));
  assert.equal(hp(game, 2), full(game, 2), 'cùng thế lực Ngụy -> được chặn luôn');
  assert.equal(hp(game, 3), full(game, 3) - 1);
});

// ============================================================ Cẩm nang trì hoãn

test('Lạc Bất Tư Thục: phán định không phải Cơ thì bỏ qua giai đoạn ra bài', async () => {
  const { game, ctrls } = makeG(2);
  const lb = await take(game, 0, is('lebu'));
  enterPlay(game, 0);
  await game.useCard(0, lb, [1]);
  assert.equal(game.player(1).judgeArea.length, 1);
  stackTop(game as never, (c) => c.suit !== 'heart');
  await game.runTurn(1);
  assert.equal(ctrls[1].asked.some((r) => r.type === 'play'), false);
  assert.ok(game.state.discardPile.includes(lb));
});

test('Lạc Bất Tư Thục: phán định Cơ thì không có hiệu lực', async () => {
  const { game, ctrls } = makeG(2);
  const lb = await take(game, 0, is('lebu'));
  enterPlay(game, 0);
  await game.useCard(0, lb, [1]);
  stackTop(game as never, (c) => c.suit === 'heart');
  await game.runTurn(1);
  assert.equal(ctrls[1].asked.some((r) => r.type === 'play'), true);
});

test('Binh Lương Thốn Đoạn: chỉ đặt ở khoảng cách 1; trúng thì bỏ qua giai đoạn bốc bài', async () => {
  const { game } = makeG(4);
  const bl = await take(game, 0, is('bingliang'));
  enterPlay(game, 0);
  assert.notEqual(game.checkUse(0, bl, [2]), null);
  await game.useCard(0, bl, [1]);
  stackTop(game as never, (c) => c.suit !== 'club');
  await game.runTurn(1);
  assert.equal(game.player(1).hand.length, 0);
});

test('Thiểm Điện: Bích 2–9 thì chịu 3 sát thương lôi; không trúng thì chuyển sang người kế tiếp', async () => {
  const a = makeG(3);
  const sd = await take(a.game, 0, is('shandian'));
  enterPlay(a.game, 0);
  await a.game.useCard(0, sd, []);
  stackTop(a.game as never, (c) => c.suit === 'spade' && c.rank >= 2 && c.rank <= 9);
  a.game.player(0).maxHp = a.game.player(0).hp = 5;
  await a.game.runTurn(0);
  assert.equal(hp(a.game, 0), 2);

  const b = makeG(3);
  const sd2 = await take(b.game, 0, is('shandian'));
  enterPlay(b.game, 0);
  await b.game.useCard(0, sd2, []);
  stackTop(b.game as never, (c) => c.suit === 'heart');
  await b.game.runTurn(0);
  assert.deepEqual(b.game.player(1).judgeArea, [sd2]);
});

test('cẩm nang trì hoãn bị Vô Giải chặn thì vào chồng bỏ, không phán định', async () => {
  const { game, ctrls } = makeG(2);
  ctrls[1].set('respond', nullifyWhen(false));
  await take(game, 1, is('wuxie'));
  const lb = await take(game, 0, is('lebu'));
  enterPlay(game, 0);
  await game.useCard(0, lb, [1]);
  await game.runTurn(1);
  assert.equal(ctrls[1].asked.some((r) => r.type === 'play'), true);
  assert.ok(game.state.discardPile.includes(lb));
});

test('chết thì trang bị và khu vực phán định vào chồng bỏ', async () => {
  const { game } = makeG(3);
  const eq = await equipFromDeck(game, 1, 'chitu');
  const lb = await take(game, 0, is('lebu'));
  const s = await take(game, 0, is('sha', 'normal'));
  enterPlay(game, 0);
  await game.useCard(0, lb, [1]);
  game.player(1).hp = 1;
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).alive, false);
  assert.ok(game.state.discardPile.includes(eq) && game.state.discardPile.includes(lb));
  assert.equal(game.totalCards(), game.cards.size);
});

// ============================================================ Cẩm nang Quốc Chiến

test('Tri Kỷ Tri Bỉ: xem tướng úp, chỉ người dùng thấy; dùng 0 mục tiêu để trùng chú', async () => {
  const { game, ctrls } = makeHG([['lvmeng', 'luxun'], ['caocao', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  ctrls[0].set('choose', () => ({ kind: 'choice', index: 1 })); // xem phó tướng
  const [zj, zj2] = await give(game, 0, 'zhiji', 'zhiji');
  enterPlay(game, 0);
  await game.useCard(0, zj, [1]);
  assert.equal(game.makeView(0).players[1].generals!.deputy.generalId, 'xuchu');
  assert.equal(game.makeView(2).players[1].generals!.deputy.generalId, null, 'người khác không thấy');
  assert.ok(game.makeView(0).notes.some((n) => n.includes('Hứa Chử')));
  await game.useCard(0, zj2, []);
  assert.equal(game.player(0).hand.length, 1, 'trùng chú: bỏ 1 bốc 1');
});

test('Viễn Giao Cận Công: chỉ dùng với người khác phe đã lộ; họ bốc 1, mình bốc 3', async () => {
  const { game } = makeHG([['lvmeng', 'luxun'], ['caocao', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  const [yj] = await give(game, 0, 'yuanjiao');
  enterPlay(game, 0);
  assert.notEqual(game.checkUse(0, yj, [1]), null, 'chưa lộ phe');
  await revealAll(game, 0, 1);
  await game.useCard(0, yj, [1]);
  assert.equal(game.player(1).hand.length, 1);
  assert.equal(game.player(0).hand.length, 3);
});

test('Dĩ Dật Đãi Lao: mình và người cùng phe bốc 2 bỏ 2', async () => {
  // 4 người để 2 người Ngô không vượt quá một nửa (bàn 3 người thì người Ngô thứ hai thành dã tâm gia)
  const { game, ctrls } = makeHG([['lvmeng', 'luxun'], ['sunquan', 'zhouyu'], ['zhangfei', 'zhaoyun'], ['caocao', 'xuchu']]);
  await revealAll(game, 0, 1, 2);
  assert.equal(game.isSameFaction(0, 1), true);
  const [yy] = await give(game, 0, 'yiyi');
  enterPlay(game, 0);
  await game.useCard(0, yy, []);
  assert.ok(ctrls[1].asked.some((r) => r.type === 'discard'));
  assert.equal(ctrls[2].asked.some((r) => r.type === 'discard'), false);
  assert.equal(game.state.discardPile.length, 5, 'Dĩ Dật + 2×2 lá bỏ');
});

test('Vô Song trong Quyết Đấu: đối thủ của Lữ Bố mỗi lần phải đánh 2 Sát', async () => {
  const { game, ctrls } = makeHG([['lvbu', 'jiaxu'], ['caocao', 'xuchu']]);
  await game.reveal(0, 'main');
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'sha');
  const [jd] = await give(game, 0, 'juedou');
  enterPlay(game, 0);
  await game.useCard(0, jd, [1]);
  assert.equal(hp(game, 1), full(game, 1) - 1);
  assert.equal(game.player(1).hand.length, 0, 'đã đánh 1 Sát nhưng không đủ 2');
});

test('Không Thành: hết bài thì không thể là mục tiêu của Quyết Đấu', async () => {
  const { game } = makeHG([['lvbu', 'jiaxu'], ['zhugeliang', 'guanyu']]);
  await game.reveal(1, 'main');
  const [jd] = await give(game, 0, 'juedou');
  enterPlay(game, 0);
  assert.notEqual(game.checkUse(0, jd, [1]), null);
});

test('Gian Hùng nhận lá Nam Man đã gây sát thương', async () => {
  const { game, ctrls } = makeHG([['lvbu', 'jiaxu'], ['caocao', 'xuchu']]);
  ctrls[1].set('confirm', YES);
  const [nm] = await give(game, 0, 'nanman');
  enterPlay(game, 0);
  await game.useCard(0, nm, []);
  assert.ok(game.player(1).hand.includes(nm));
});

// Đảm bảo Response được dùng (tránh cảnh báo import thừa ở một số cấu hình)
export type _R = Response;
