// Giai đoạn 12: đại/tiểu thế lực, Hợp Tung, chồng tướng riêng, Điệu Hổ Ly Sơn, Lục Long, lá để ngoài ván, cẩm nang mới.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardName } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { makeHG, revealAll } from './hg-helpers.js';

/** Lấy lá theo tên từ chồng bốc hoặc tay bất kỳ ai (lá có thể đã được chia lúc bắt đầu). */
const grab = async (game: HegemonyGame, seat: number, name: CardName) => {
  const inDraw = game.state.drawPile.find((i) => game.card(i).name === name);
  if (inDraw !== undefined) { await game.moveCards([inDraw], { kind: 'draw' }, { kind: 'hand', seat }, 'test'); return inDraw; }
  for (const p of game.state.players) {
    const id = p.hand.find((i) => game.card(i).name === name);
    if (id !== undefined) { if (p.seat !== seat) await game.moveCards([id], { kind: 'hand', seat: p.seat }, { kind: 'hand', seat }, 'test'); return id; }
  }
  throw new Error(`không tìm thấy ${name}`);
};
const equip = async (game: HegemonyGame, seat: number, name: CardName) => {
  const id = await grab(game, seat, name);
  await game.equip(seat, game.card(id));
  return id;
};
const inPlay = (game: HegemonyGame, seat: number) => { game.state.currentSeat = seat; game.state.phase = 'play'; };
const WEI3_SHU2: [string, string][] = [['caocao', 'xuchu'], ['xiahoudun', 'zhangliao'], ['dianwei', 'zhenji'], ['liubei', 'guanyu'], ['zhangfei', 'zhaoyun'], ['sunquan', 'lvmeng']];

test('Bộ Quốc Chiến đầy đủ: Chiếu Thư + 4 cẩm nang thế lực nằm ngoài ván, không lẫn vào chồng bốc', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  const names = game.state.removedPile.map((id) => game.card(id).name).sort();
  assert.deepEqual(names, ['guguo', 'haoling', 'kefu', 'wenhe', 'zhaoshu'].sort());
  assert.ok(game.state.drawPile.every((id) => !game.card(id).setAside));
});

test('Đại/tiểu thế lực: thế lực đông nhất (≥2 người) là đại thế lực', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4, 5);
  assert.deepEqual(game.bigFactions(), ['wei']);
  assert.ok(game.isBig(0) && game.isBig(2));
  assert.ok(game.isSmall(3) && !game.isBig(4));
});

test('Đại thế lực: hòa số người thì cả hai đều lớn; 1 người không bao giờ là đại thế lực', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 3, 4);
  assert.deepEqual(game.bigFactions().sort(), ['shu', 'wei']);
  const solo = makeHG(WEI3_SHU2).game;
  await solo.setup();
  await revealAll(solo, 0, 3);
  assert.deepEqual(solo.bigFactions(), []);
  assert.ok(solo.isSmall(0) && solo.isSmall(3));
});

test('Ngọc Tỷ: thế lực của người lắp là đại thế lực duy nhất', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4, 5);
  await equip(game, 3, 'yuxi');
  assert.deepEqual(game.bigFactions(), ['shu']);
  assert.ok(game.isSmall(0) && game.isBig(4));
});

test('Hiệp Thiên Tử: tiểu thế lực không dùng được, đại thế lực dùng được trong giai đoạn ra bài', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4, 5);
  const a = await grab(game, 3, 'xietianzi');
  inPlay(game, 3);
  assert.notEqual(game.checkUse(3, a, []), null);
  const b = await grab(game, 0, 'xietianzi');
  inPlay(game, 0);
  assert.equal(game.checkUse(0, b, []), null);
});

test('Hợp Tung: giao lá có dấu Hợp cho người chưa có thế lực thì không bốc; cho người khác phe thì bốc lại bằng số lá đã giao', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 3);
  const ids = game.state.drawPile.filter((i) => game.card(i).transferable).slice(0, 2);
  assert.equal(ids.length, 2, 'bộ bài phải có lá dấu Hợp');
  await game.moveCards(ids, { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  assert.ok(game.isTransferable(0, ids[0]));
  assert.ok(game.transferTargets(0).includes(4), 'người chưa lộ nhận được');
  assert.ok(!game.transferTargets(0).includes(0));
  const before = game.player(0).hand.length;
  await game.doTransfer(0, [ids[0]], 4);
  assert.equal(game.player(0).hand.length, before - 1);
  assert.ok(game.player(4).hand.includes(ids[0]));
  game.player(0).flags.turn_transferUsed = 0;
  await game.doTransfer(0, [ids[1]], 3);
  assert.equal(game.player(0).hand.length, before - 1, 'giao 1, bốc 1');
});

test('Chồng tướng riêng: tướng lấy ra không còn trong chồng bài tướng; trả lại thì có lại; người khác chỉ thấy số lượng', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  const deck0 = game.generalDeck().length;
  const ids = game.takeGeneralsFromDeck(2);
  assert.equal(ids.length, 2);
  game.addGeneralPile(0, 'Hồn', ids);
  assert.deepEqual(game.generalPile(0, 'Hồn'), ids);
  assert.equal(game.generalDeck().length, deck0 - 2);
  assert.ok(ids.every((id) => !game.generalDeck().includes(id)));
  const mine = game.makeView(0).players[0].generalPiles!;
  const theirs = game.makeView(1).players[0].generalPiles!;
  assert.deepEqual(mine[0], { name: 'Hồn', count: 2, ids });
  assert.deepEqual(theirs[0], { name: 'Hồn', count: 2 });
  game.removeFromGeneralPile(0, 'Hồn', [ids[0]]);
  assert.deepEqual(game.generalPile(0, 'Hồn'), [ids[1]]);
  assert.equal(game.generalDeck().length, deck0 - 1);
});

test('Điệu Hổ Ly Sơn: người bị điệu không tính khoảng cách, không bị chọn, không mất máu', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4, 5);
  const id = await grab(game, 0, 'diaohu');
  inPlay(game, 0);
  await game.useCard(0, id, [1]);
  assert.ok(game.isLured(1));
  assert.equal(game.distance(0, 1), Infinity);
  assert.equal(game.distance(0, 2), 1, 'ghế 1 bị bỏ khỏi vòng nên ghế 2 sát cạnh ghế 0');
  assert.equal(game.canTarget(0, 1), false);
  const hp = game.player(1).hp;
  await game.damage({ source: 3, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, hp);
});

test('Lục Long Tham Giá: vừa là ngựa -1 vừa là ngựa +1, và đẩy ngựa +1 cũ ra', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng'], ['zhangjiao', 'huatuo'], ['xiahoudun', 'zhangliao']]);
  await game.setup();
  const d02 = game.distance(0, 2);
  const d20 = game.distance(2, 0);
  const horse = game.state.drawPile.find((i) => ['jueying', 'dilu', 'zhuahuang', 'hualiu'].includes(game.card(i).name))!;
  await game.moveCards([horse], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  await game.equip(0, game.card(horse));
  await equip(game, 0, 'liulong');
  assert.equal(game.equipOf(0, 'defHorse'), null);
  assert.equal(game.distance(0, 2), Math.max(1, d02 - 1));
  assert.equal(game.distance(2, 0), d20 + 1);
});

test('Hỏa Thiêu Liên Doanh: gây 1 sát thương hỏa cho người ngay sau bạn', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4, 5);
  const id = await grab(game, 5, 'huoshao');
  inPlay(game, 5);
  const hp = game.player(0).hp;
  const err = await game.useCard(5, id, []);
  assert.ok(!err || (err as { ok?: boolean }).ok !== false);
  assert.equal(game.player(0).hp, hp - 1);
  assert.ok(game.log.some((l) => /hỏa/i.test(l)));
});

test('Bỏ bài: người chơi chọn lá nào thì bỏ đúng lá đó; câu hỏi gửi kèm danh sách lá được bỏ và giới hạn trữ bài', async () => {
  const { game, ctrls } = makeHG(WEI3_SHU2);
  await game.setup();
  const hand = game.player(0).hand;
  await grab(game, 0, 'sha'); await grab(game, 0, 'shan'); await grab(game, 0, 'tao');
  const pickedTao = hand.find((i) => game.card(i).name === 'tao')!;
  let asked: { cardIds?: number[]; limit?: number; reason?: string } | null = null;
  ctrls[0].set('discard', (r) => {
    asked = r as never;
    const ids = [pickedTao, ...hand.filter((i) => i !== pickedTao)].slice(0, (r as { count: number }).count);
    return { kind: 'discard', cardIds: ids };
  });
  game.player(0).hp = 1;
  const count = hand.length - game.handLimit(0);
  assert.ok(count > 0);
  await game.forceDiscard(0, count, 'discardPhase');
  assert.ok(asked!.cardIds!.length > 0 && asked!.reason === 'discardPhase' && asked!.limit === game.handLimit(0));
  assert.ok(!game.player(0).hand.includes(pickedTao), 'lá người chơi chọn (Đào) phải bị bỏ');
});

test('Bỏ bài: hết giờ / trả lời sai thì tự bỏ lá ít giá trị, giữ Đào, Vô Giải, Thiểm, Rượu', async () => {
  const { game, ctrls } = makeHG(WEI3_SHU2);
  await game.setup();
  await game.moveCards([...game.player(0).hand], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  for (const n of ['tao', 'wuxie', 'shan', 'jiu', 'sha', 'guohe'] as CardName[]) await grab(game, 0, n);
  ctrls[0].set('discard', () => ({ kind: 'discard', cardIds: [] }));
  await game.forceDiscard(0, 2, 'discardPhase');
  assert.deepEqual(game.player(0).hand.map((i) => game.card(i).name).sort(), ['jiu', 'shan', 'tao', 'wuxie']);
});

test('Bot bỏ bài: giữ Đào, Vô Giải Khả Kích, Thiểm, Rượu', async () => {
  const { SimpleBot } = await import('../src/agents/bot.js');
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await game.moveCards([...game.player(0).hand], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  for (const n of ['tao', 'wuxie', 'shan', 'jiu', 'sha', 'guohe', 'tiesuo'] as CardName[]) await grab(game, 0, n);
  const req = { type: 'discard' as const, seat: 0, count: 3, cardIds: [...game.player(0).hand] };
  const res = await new SimpleBot().decide(req, game.makeView(0, req));
  assert.equal(res.kind, 'discard');
  const names = (res as { cardIds: number[] }).cardIds.map((i) => game.card(i).name).sort();
  assert.ok(!names.some((n) => ['tao', 'wuxie', 'shan', 'jiu'].includes(n)), `bot bỏ nhầm: ${names}`);
});

test('Hợp Tung: giao tối đa 3 lá, rút lại bằng số lá đã giao; mỗi giai đoạn ra bài 1 lần (lượt sau dùng lại được); người cùng thế lực không nhận được', async () => {
  const { game } = makeHG(WEI3_SHU2);
  await game.setup();
  await revealAll(game, 0, 1, 3);
  const ids = game.state.drawPile.filter((i) => game.card(i).transferable).slice(0, 4);
  assert.equal(ids.length, 4);
  await game.moveCards(ids, { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  assert.ok(!game.transferTargets(0).includes(1), 'cùng thế lực (Ngụy) không nhận');
  assert.ok(game.transferTargets(0).includes(3) && game.transferTargets(0).includes(4));
  game.state.currentSeat = 0; game.state.phase = 'play';
  const before = game.player(0).hand.length;
  const use = (cardIds: number[], t: number) => (game as unknown as { useSkillAction(s: number, r: unknown): Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'transfer', cardIds, targets: [t] });
  assert.notEqual(await use(ids.slice(0, 4), 3), null, 'không cho giao 4 lá');
  assert.equal(await use(ids.slice(0, 3), 3), null);
  assert.equal(game.player(3).hand.filter((i) => ids.includes(i)).length, 3);
  assert.equal(game.player(0).hand.length, before, 'giao 3, rút lại 3');
  assert.notEqual(await use([ids[3]], 4), null, 'mỗi giai đoạn ra bài chỉ 1 lần');
  await game.bus.emit('turnEnd', { seat: 0 });
  for (const k of Object.keys(game.player(0).flags)) if (k.startsWith('turn_')) delete game.player(0).flags[k];
  assert.equal(await use([ids[3]], 4), null, 'lượt sau dùng lại được');
});
