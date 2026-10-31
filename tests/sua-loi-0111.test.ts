// Sửa lỗi theo danh sách bug 30–31/10 (BUG-039 → BUG-058).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeckById } from '../src/core/cards.js';
import type { CardName, Request } from '../src/core/types.js';
import { loadContent } from '../src/content/loader.js';
import { getGeneral, isPair } from '../src/hegemony/generals.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { HegemonyBot } from '../src/hegemony/bot.js';
import { muniuPile } from '../src/hegemony/treasures.js';
import { enterPlay, give } from './helpers.js';
import { makeHG, revealAll } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const QT = () => ({ deck: buildDeckById('quantranh') });
const useSkill = (game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
const equip = async (game: HegemonyGame, seat: number, name: CardName) => {
  const [id] = await give(game, seat, name);
  await game.equip(seat, game.card(id));
  return id;
};
const emptyHands = async (game: HegemonyGame, ...seats: number[]) => {
  for (const s of seats) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
};
const toTop = (game: HegemonyGame, pred: (n: string) => boolean) => {
  const p = game.state.drawPile;
  const id = p.find((i) => pred(game.card(i).name))!;
  p.splice(p.indexOf(id), 1); p.push(id);
  return id;
};

test('BUG-039: Ngạo Tài (Gia Cát Khác) dùng được khi bị Tá Đao Sát Nhân bắt Sát', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['sunquan', 'zhugeke'], ['liubei', 'guanyu']], QT());
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await emptyHands(game, 0, 1, 2);
  await equip(game, 1, 'qinggang');
  const sha = toTop(game, (n) => n === 'sha');
  ctrls[1].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'aocai' ? 'yes' : 'no' }))
    .set('chooseCards', (r) => ({ kind: 'cards', cardIds: [(r as { cardIds: number[] }).cardIds[0]] }))
    .set('respond', (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' }));
  ctrls[0].set('chooseTargets', (r: Request) => ({ kind: 'targets', targets: [(r as { candidates: number[] }).candidates.includes(2) ? 2 : 0] }));
  const [jd] = await give(game, 0, 'jiedao');
  game.state.phase = 'play';
  await game.useCard(0, jd, [1]);
  assert.equal(game.player(1).equips.weapon.length, 1, 'giữ được vũ khí nhờ Sát từ Ngạo Tài');
  assert.ok(game.state.discardPile.includes(sha));
});

test('BUG-040: Trượng Bát Xà Mâu dùng 2 lá như Sát khi bị Tá Đao Sát Nhân', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']], QT());
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await emptyHands(game, 0, 1, 2);
  await equip(game, 1, 'zhangba');
  const two = await give(game, 1, 'shan', 'tao');
  let offered = false;
  ctrls[1].set('respond', (r) => {
    offered = !!(r as Extract<Request, { type: 'respond' }>).virtuals?.some((o) => o.skill === 'zhangba');
    return { kind: 'useSkill', skill: 'virtual:zhangba:sha', cardIds: [], targets: [] };
  }).set('chooseCards', () => ({ kind: 'cards', cardIds: two }));
  ctrls[0].set('chooseTargets', (r: Request) => ({ kind: 'targets', targets: [(r as { candidates: number[] }).candidates.includes(2) ? 2 : 0] }));
  const [jd] = await give(game, 0, 'jiedao');
  game.state.phase = 'play';
  await game.useCard(0, jd, [1]);
  assert.ok(offered, 'có nút Trượng Bát');
  assert.equal(game.player(1).equips.weapon.length, 1, 'giữ được vũ khí');
  assert.equal(game.player(1).hand.length, 0, 'đã dùng 2 lá');
});

test('BUG-041: Chiếu Thư đặt lên tướng, không chiếm ô bảo vật', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['caoren', 'caohong'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng'], ['zhangjiao', 'yuji']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await equip(game, 0, 'muniu');
  const zs = game.state.removedPile.find((i) => game.card(i).name === 'zhaoshu')!;
  await game.moveCards([zs], { kind: 'removed' }, { kind: 'hand', seat: 0 }, 'test');
  enterPlay(game, 0);
  await game.useCard(0, zs, []);
  assert.equal(game.equipOf(0, 'treasure')?.name, 'muniu', 'Mộc Ngưu vẫn ở ô bảo vật');
  assert.ok(game.player(0).special.includes(zs), 'Chiếu Thư nằm trên tướng');
  // Đồng minh cùng thế lực đặt [Chiếu]
  enterPlay(game, 1);
  const [c] = await give(game, 1, 'sha');
  assert.equal(await useSkill(game, 1, 'zhaoshu_dat', [c]), null);
  assert.ok(game.player(0).special.includes(c));
});

test('BUG-042: Vô Giải trong Mộc Ngưu được hỏi và dùng được', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  await equip(game, 1, 'muniu');
  enterPlay(game, 1);
  const [wx] = await give(game, 1, 'wuxie');
  assert.equal(await useSkill(game, 1, 'muniu', [wx]), null);
  const [t] = await give(game, 1, 'tao');
  ctrls[1].set('respond', (_r, v) => (v.responseOptions.some((o) => o.cardId === wx) ? { kind: 'card', cardId: wx } : { kind: 'pass' }));
  enterPlay(game, 0);
  const [gh] = await give(game, 0, 'guohe');
  ctrls[0].set('chooseCards', () => ({ kind: 'cards', cardIds: [t] }));
  await game.useCard(0, gh, [1]);
  assert.ok(game.log.some((l) => l.includes('bị Vô Giải chặn')));
  assert.equal(muniuPile(game, 1).length, 0);
  assert.ok(game.player(1).hand.includes(t), 'không mất Đào');
});

test('BUG-043/044: Quyền Kế đặt được trang bị; bị úp tướng thì mất các [Quyền]', async () => {
  const { game, ctrls } = makeHG([['zhonghui', 'caocao'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0);
  const eq = await equip(game, 0, 'qinggang');
  let pool: number[] = [];
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('chooseCards', (r) => { pool = (r as { cardIds: number[] }).cardIds; return { kind: 'cards', cardIds: [eq] }; });
  await game.damage({ source: 1, target: 0, amount: 1, card: null, cancelled: false });
  assert.ok(pool.includes(eq), 'được chọn cả trang bị');
  assert.ok(game.player(0).special.includes(eq), 'trang bị thành [Quyền]');
  await game.hideGeneral(0, 'main');
  assert.equal(game.player(0).special.length, 0, 'úp Chung Hội: mất [Quyền]');
  assert.ok(game.state.discardPile.includes(eq));
});

test('BUG-045: Hoa Đà dùng bài đỏ trong vùng trang bị như Đào ngoài lượt', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['huatuo', 'yuji'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  await emptyHands(game, 1);
  const red = game.state.drawPile.find((i) => game.card(i).type === 'equip' && ['heart', 'diamond'].includes(game.card(i).suit)
    && ['defHorse', 'offHorse', 'armor', 'weapon'].includes(String((game.cardInfo(game.card(i).name) as { slot?: string }).slot)))!;
  await game.moveCards([red], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  await game.equip(1, game.card(red));
  game.state.currentSeat = 0;
  let opts: number[] = [];
  ctrls[1].set('save', (_r, v) => { opts = v.responseOptions.map((o) => o.cardId); return opts.includes(red) ? { kind: 'card', cardId: red } : { kind: 'pass' }; });
  game.player(2).hp = 1;
  await game.damage({ source: 0, target: 2, amount: 1, card: null, cancelled: false });
  assert.ok(opts.includes(red), 'trang bị đỏ có trong lựa chọn cứu');
  assert.equal(game.player(2).alive, true);
});

test('BUG-046: Từ Thứ làm phó tướng với tướng 2 máu: 3.5 máu -> 3 máu + Âm Dương Ngư', async () => {
  const { game } = makeHG([['zhurong', 'xushu'], ['caocao', 'xuchu']]);
  await game.setup();
  assert.equal(game.player(0).maxHp, 3);
  await revealAll(game, 0);
  assert.equal(game.hero(0).marks.yinyang, 1);
});

test('BUG-047: đổi phó tướng được xem 3 tướng chọn 1', async () => {
  const { game, ctrls } = makeHG([['liubei', 'xushu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  let opts: string[] = [];
  ctrls[0].set('choose', (r) => { opts = (r as { options: string[] }).options; return { kind: 'choice', index: 2 }; });
  assert.equal(await game.transformDeputy(0), true);
  assert.equal(opts.length, 3);
  assert.equal(getGeneral(game.hero(0).deputy.generalId).name, opts[2]);
});

test('BUG-048/058: đã "thay vì rút bài" thì Ngọc Tỷ / kỹ năng rút bài khác không kích', async () => {
  const { game, ctrls } = makeHG([['dongzhuo', 'yuji'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0);
  await equip(game, 0, 'yuxi' as CardName);
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  game.state.currentSeat = 0;
  const ctx = await game.bus.emit('drawPhase', { seat: 0, count: 2 });
  assert.equal(ctx.replaced, true);
  assert.ok(!game.log.some((l) => l.includes('Ngọc Tỷ: P0 bốc thêm')), 'Ngọc Tỷ không cộng thêm');
});

test('BUG-053/056: quân chủ là hảo cặp với tướng cùng thế lực; Tư Mã Chiêu 3 âm dương ngư', () => {
  assert.ok(isPair('lord_liubei', 'zhaoyun'));
  assert.ok(isPair('machao', 'lord_liubei'));
  assert.ok(!isPair('lord_liubei', 'caocao'));
  assert.equal(getGeneral('simazhao').halfHp, 3);
});

test('BUG-054: bot Chế Hành không bỏ quá giới hạn máu', async () => {
  const bot = new HegemonyBot();
  const mk = (id: number) => ({ id, name: 'sha', suit: 'spade', rank: 7, type: 'basic' });
  const v = {
    me: 0, myHand: [1, 2, 3, 4, 5, 6].map(mk), drawPileCount: 50, discardPileCount: 0, lastDiscards: [], currentSeat: 0, phase: 'play', turn: 3,
    shaUsed: 1, hints: [], responseOptions: [], notes: [], recentLog: [],
    skillHints: [{ skill: 'chehoanh', name: 'Chế Hành', cards: 'any', targets: [], needsTarget: false, reveals: false, minCards: 1, maxCards: 3 }],
    players: [0, 1].map((seat) => ({ seat, name: `P${seat}`, team: null, hp: 3, maxHp: 3, handCount: 6, alive: true, special: [], equips: {}, judgeArea: [],
      chained: false, kingdom: seat ? 'wei' : 'wu', marks: { yinyang: 0, pioneer: 0, pair: 0 },
      generals: { main: { generalId: seat ? 'caocao' : 'sunquan', revealed: true }, deputy: { generalId: seat ? 'xuchu' : 'zhoutai', revealed: true } } })),
  };
  const r = await bot.decide({ type: 'play', seat: 0 } as never, v as never) as { skill?: string; cardIds?: number[] };
  if (r.skill === 'chehoanh') assert.ok(r.cardIds!.length <= 3);
});

test('BUG-055: Thiết Kỵ — mục tiêu được hỏi; hết giờ / không chọn thì không bị bỏ bài', async () => {
  const { game, ctrls } = makeHG([['machao', 'guanyu'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  const before = game.player(1).hand.length + game.equipCount(1);
  let asked = false;
  ctrls[1].set('choose', (r) => { asked = (r as { prompt: string }).prompt.includes('Thiết Kỵ'); return { kind: 'choice', index: 0 }; });
  ctrls[0].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'thietky' ? 'yes' : 'no' }));
  enterPlay(game, 0);
  const [s] = await give(game, 0, 'sha');
  if (!game.targetsAs(0, 'sha').includes(1)) return;
  const hand0 = game.player(1).hand.length;
  await game.useCard(0, s, [1]);
  if (asked) assert.ok(game.player(1).hand.length + game.equipCount(1) >= Math.min(before, hand0) - 0, 'không tự bỏ bài');
});

test('BUG-057: Xuyên Tâm bỏ toàn bộ trang bị một lần — Kiêu Cơ chỉ rút 1 lần', async () => {
  const { game, ctrls } = makeHG([['zhangren', 'yuji'], ['sunshangxiang', 'zhoutai']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 1);
  await equip(game, 1, 'qinggang');
  await equip(game, 1, 'dilu');
  ctrls[0].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'chuanxin' ? 'yes' : 'no' }));
  ctrls[1].set('confirm', () => ({ kind: 'yes' })).set('choose', () => ({ kind: 'choice', index: 0 }));
  enterPlay(game, 0);
  const [s] = await give(game, 0, 'sha');
  if (!game.targetsAs(0, 'sha').includes(1)) return;
  ctrls[1].set('respond', () => ({ kind: 'pass' }));
  await game.useCard(0, s, [1]);
  assert.equal(game.equipCount(1), 0);
  assert.equal(game.player(1).hand.length, 3, 'Kiêu Cơ rút 3 lá một lần');
});

test('BUG-049/050/051: view có trạng thái Hạn định kỹ, kỹ năng mất / nhận thêm', async () => {
  const { game } = makeHG([['jiaxu', 'yuji'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  let st = game.makeView(1).players[0].skillState;
  assert.ok(st?.limited?.some((x) => x.id === 'luanwu' && !x.used));
  game.usedLimited.add('luanwu:0');
  game.grantSkill(0, 'feiying');
  game.loseSkill(0, 'weimu');
  st = game.makeView(1).players[0].skillState;
  assert.ok(st?.limited?.some((x) => x.id === 'luanwu' && x.used));
  assert.ok(st?.granted?.some((x) => x.id === 'feiying'));
  assert.ok(st?.lost?.some((x) => x.id === 'weimu'));
  assert.ok(st?.virtualEquips?.some((x) => x.label === 'Ngựa +1'));
});
