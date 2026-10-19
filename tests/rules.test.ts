import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../src/core/cards.js';
import { viewFor } from '../src/core/view.js';
import { enterPlay, give, makeGame } from './helpers.js';

test('bộ bài giai đoạn 1: 30 Sát, 15 Thiểm, 8 Đào, id không trùng', () => {
  const deck = buildDeck();
  const count = (n: string) => deck.filter((c) => c.name === n).length;
  assert.equal(count('sha'), 30);
  assert.equal(count('shan'), 15);
  assert.equal(count('tao'), 8);
  assert.equal(new Set(deck.map((c) => c.id)).size, deck.length);
});

test('chia bài đầu trận: mỗi người 4 lá', async () => {
  const { game } = makeGame(4);
  await game.setup();
  for (const p of game.state.players) assert.equal(p.hand.length, 4);
  assert.equal(game.totalCards(), game.cards.size);
});

test('cùng seed thì cùng thứ tự bài', async () => {
  const a = makeGame(4, { seed: 7 }).game;
  const b = makeGame(4, { seed: 7 }).game;
  assert.deepEqual(a.state.drawPile, b.state.drawPile);
});

// ---------------------------------------------------------- Sát / Thiểm

test('Sát trúng khi mục tiêu không có Thiểm: mất 1 máu', async () => {
  const { game } = makeGame(2);
  const [sha] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  assert.deepEqual(await game.useCard(0, sha, [1]), { ok: true });
  assert.equal(game.player(1).hp, 3);
  assert.ok(game.state.discardPile.includes(sha), 'Sát vào chồng bỏ sau khi xử lý');
});

test('Thiểm né được Sát', async () => {
  const { game, ctrls } = makeGame(2);
  const [sha] = await give(game, 0, 'sha');
  const [shan] = await give(game, 1, 'shan');
  ctrls[1].push({ kind: 'card', cardId: shan });
  enterPlay(game, 0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).hp, 4);
  assert.equal(game.player(1).hand.length, 0);
  assert.equal(ctrls[1].asked[0].type, 'respond');
});

test('đáp lại bằng lá sai loại (Sát thay vì Thiểm) bị coi như không đánh', async () => {
  const { game, ctrls } = makeGame(2);
  const [sha] = await give(game, 0, 'sha');
  const [fake] = await give(game, 1, 'sha');
  ctrls[1].push({ kind: 'card', cardId: fake });
  enterPlay(game, 0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).hp, 3);
  assert.ok(game.player(1).hand.includes(fake), 'lá sai không bị lấy mất');
});

test('chỉ được Sát 1 lần mỗi lượt', async () => {
  const { game } = makeGame(2);
  const [s1, s2] = await give(game, 0, 'sha', 'sha');
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, s1, [1])).ok, true);
  const r = await game.useCard(0, s2, [1]);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /hết số lần Sát/);
});

test('không Sát được mục tiêu ngoài tầm (khoảng cách 2 trong bàn 5 người)', async () => {
  const { game } = makeGame(5);
  const [sha] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  assert.equal(game.distance(0, 1), 1);
  assert.equal(game.distance(0, 2), 2);
  assert.equal(game.distance(0, 4), 1, 'tính vòng quanh bàn');
  assert.equal((await game.useCard(0, sha, [2])).ok, false);
  assert.deepEqual(game.validTargets(0, sha), [1, 4]);
});

test('khoảng cách thu hẹp khi có người chết', async () => {
  const { game } = makeGame(5);
  game.player(1).alive = false;
  assert.equal(game.distance(0, 2), 1);
});

test('không được Sát chính mình, không dùng bài ngoài lượt, không chủ động dùng Thiểm', async () => {
  const { game } = makeGame(3);
  const [sha, shan] = await give(game, 0, 'sha', 'shan');
  enterPlay(game, 1);
  assert.equal((await game.useCard(0, sha, [1])).ok, false, 'ngoài lượt');
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, sha, [0])).ok, false, 'Sát chính mình');
  assert.equal((await game.useCard(0, shan, [])).ok, false, 'Thiểm chủ động');
  assert.equal((await game.useCard(0, 9999, [1])).ok, false, 'lá không có trên tay');
});

// ---------------------------------------------------------- Đào, hấp hối, tử vong

test('Đào hồi 1 máu, không dùng được khi máu đầy', async () => {
  const { game } = makeGame(2);
  const [t1, t2] = await give(game, 0, 'tao', 'tao');
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, t1, [])).ok, false);
  game.player(0).hp = 2;
  assert.equal((await game.useCard(0, t1, [])).ok, true);
  assert.equal(game.player(0).hp, 3);
  assert.equal((await game.useCard(0, t2, [1])).ok, false, 'không dùng Đào cho người khác');
});

test('hấp hối: người khác dùng Đào cứu, người được cứu sống với 1 máu', async () => {
  const { game, ctrls } = makeGame(3);
  game.player(1).hp = 1;
  const [sha] = await give(game, 0, 'sha');
  const [tao] = await give(game, 2, 'tao');
  ctrls[2].push({ kind: 'card', cardId: tao });
  enterPlay(game, 0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).alive, true);
  assert.equal(game.player(1).hp, 1);
  // Thứ tự hỏi cứu bắt đầu từ người đang trong lượt (ghế 0), rồi 1, rồi 2
  assert.equal(ctrls[0].asked.at(-1)?.type, 'save');
  assert.equal(ctrls[1].asked.at(-1)?.type, 'save');
});

test('hấp hối ở -1 máu cần 2 Đào; một người được dùng liên tiếp', async () => {
  const { game, ctrls } = makeGame(2, { teams: ['A', 'B'] });
  game.player(1).hp = 0; // giả lập: sắp nhận thêm 1 sát thương -> -1
  const [t1, t2] = await give(game, 1, 'tao', 'tao');
  ctrls[1].push({ kind: 'card', cardId: t1 }, { kind: 'card', cardId: t2 });
  enterPlay(game, 0);
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).alive, true);
  assert.equal(game.player(1).hp, 1);
});

test('không ai cứu: tử trận, toàn bộ bài trên tay vào chồng bỏ, phe còn lại thắng', async () => {
  const { game } = makeGame(2, { teams: ['Thục', 'Ngụy'] });
  game.player(1).hp = 1;
  const [sha] = await give(game, 0, 'sha');
  const held = await give(game, 1, 'sha', 'sha');
  enterPlay(game, 0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).alive, false);
  for (const id of held) assert.ok(game.state.discardPile.includes(id));
  assert.equal(game.state.finished, true);
  assert.equal(game.result?.winner, 'Thục');
  assert.equal(game.totalCards(), game.cards.size);
});

test('đồng đội chết nhưng phe vẫn còn người thì ván chưa kết thúc', async () => {
  const { game } = makeGame(3, { teams: ['A', 'B', 'B'] });
  game.player(1).hp = 1;
  const [sha] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).alive, false);
  assert.equal(game.state.finished, false);
});

test('event damaged chạy SAU hấp hối và chỉ khi còn sống', async () => {
  const { game, ctrls } = makeGame(3);
  const order: string[] = [];
  game.bus.on('dying', () => { order.push('dying'); });
  game.bus.on('damaged', () => { order.push('damaged'); });
  game.player(1).hp = 1;
  const [tao] = await give(game, 1, 'tao');
  ctrls[1].push({ kind: 'card', cardId: tao });
  enterPlay(game, 0);
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.deepEqual(order, ['dying', 'damaged']);
});

test('beforeDamage có thể giảm hoặc chặn sát thương (điểm móc cho giáp/kỹ năng)', async () => {
  const { game } = makeGame(2);
  game.bus.on('beforeDamage', (ctx) => { if (ctx.target === 1) ctx.cancelled = true; });
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, 4);
});

// ---------------------------------------------------------- Vòng lượt

test('một lượt đầy đủ: bốc 2 lá, ra bài, bỏ bài xuống bằng số máu', async () => {
  const { game, ctrls } = makeGame(2);
  game.player(0).hp = 2;
  await give(game, 0, 'sha', 'sha', 'sha'); // 3 lá + bốc 2 = 5, máu 2 -> bỏ 3
  await game.runTurn(0);
  const req = ctrls[0].asked.find((r) => r.type === 'discard');
  assert.ok(req && req.type === 'discard');
  assert.equal(req.count, 3);
  assert.equal(req.reason, 'discardPhase');
  assert.equal(req.limit, 2);
  assert.deepEqual([...req.cardIds!].sort(), [...game.player(0).hand, ...game.state.discardPile.slice(-3)].sort());
  assert.equal(game.player(0).hand.length, 2, 'trả lời sai -> engine tự bỏ');
});

test('bỏ bài đúng các lá người chơi chọn', async () => {
  const { game, ctrls } = makeGame(2);
  game.player(0).hp = 1;
  const [keep, d1] = await give(game, 0, 'tao', 'sha');
  ctrls[0].push({ kind: 'endPlay' }, (req, v) => ({
    kind: 'discard',
    cardIds: v.myHand.filter((c) => c.id !== keep).slice(0, (req as { count: number }).count).map((c) => c.id),
  }));
  await game.runTurn(0);
  assert.deepEqual(game.player(0).hand, [keep]);
  assert.ok(game.state.discardPile.includes(d1));
});

test('phaseBefore.skip bỏ qua được giai đoạn (điểm móc cho Lạc Bất Tư Thục)', async () => {
  const { game, ctrls } = makeGame(2);
  game.bus.on('phaseBefore', (ctx) => { if (ctx.phase === 'play') ctx.skip = true; });
  await game.runTurn(0);
  assert.equal(ctrls[0].asked.some((r) => r.type === 'play'), false);
});

test('drawPhase có thể thay đổi số lá bốc', async () => {
  const { game } = makeGame(2);
  game.bus.on('drawPhase', (ctx) => { ctx.count = 3; });
  game.player(0).hp = 10; game.player(0).maxHp = 10; // tránh bỏ bài
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 3);
});

test('hết chồng bốc thì xào lại chồng bỏ', async () => {
  const { game } = makeGame(2);
  await game.setup();
  const rest = [...game.state.drawPile];
  await game.moveCards(rest, { kind: 'draw' }, { kind: 'discard' }, 'test');
  await game.draw(0, 2);
  assert.equal(game.player(0).hand.length, 6);
  assert.equal(game.state.discardPile.length, 0);
  assert.equal(game.totalCards(), game.cards.size);
});

test('controller ném lỗi hoặc treo quá thời gian -> dùng câu trả lời mặc định', async () => {
  const { game, ctrls } = makeGame(2, { timeoutMs: 30 });
  const [sha] = await give(game, 0, 'sha');
  await give(game, 1, 'shan');
  ctrls[1].push(() => new Promise<never>(() => {}) as never); // không bao giờ trả lời
  enterPlay(game, 0);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).hp, 3, 'hết giờ = không đánh Thiểm');
});

// ---------------------------------------------------------- Thông tin ẩn

test('PlayerView không lộ bài trên tay người khác', async () => {
  const { game } = makeGame(3, { revealTeams: false });
  await game.setup();
  const v = viewFor(game, 0);
  assert.equal(v.myHand.length, 4);
  const json = JSON.stringify(v);
  for (const id of game.player(1).hand) {
    assert.equal(v.myHand.some((c) => c.id === id), false);
  }
  assert.equal(v.players[1].team, null, 'phe người khác bị ẩn khi revealTeams = false');
  assert.equal(v.players[0].team, 'T0');
  assert.equal(json.includes('drawPile"'), false, 'không gửi chồng bốc');
});
