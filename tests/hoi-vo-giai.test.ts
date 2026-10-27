// Luồng hỏi Vô Giải: nút kỹ năng ảo ngay trong bước chọn lá (Tả Từ, Đỗ Dự) và "bỏ qua cả lá này".
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Request } from '../src/core/types.js';
import { loadContent } from '../src/content/loader.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { HegemonyBot } from '../src/hegemony/bot.js';
import { enterPlay } from './helpers.js';
import { makeHG, revealAll } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

async function take(game: HegemonyGame, seat: number, pred: (c: Card) => boolean): Promise<number> {
  const id = game.state.drawPile.find((i) => pred(game.card(i)));
  if (id === undefined) throw new Error('không tìm thấy lá phù hợp');
  await game.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return id;
}

async function emptyHand(game: HegemonyGame, seat: number) {
  for (const id of [...game.player(seat).hand]) await game.moveCards([id], { kind: 'hand', seat }, { kind: 'discard' }, 'test');
}

test('Tả Từ: nút Dịch Quỷ → Vô Giải hiện ngay trong bước chọn lá, bấm là chặn, không hỏi xác nhận riêng', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['new_zuoci', 'lvbu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  await game.reveal(1, 'main');
  const huns = game.generalPile(1, 'Hồn').length;
  await emptyHand(game, 1);
  const gh = await take(game, 0, (c) => c.name === 'guohe');
  await take(game, 1, (c) => c.name === 'tao');
  const seen: Request[] = [];
  ctrls[1].set('respond', (r) => {
    seen.push(r);
    const req = r as Extract<Request, { type: 'respond' }>;
    const o = req.virtuals?.find((x) => x.skill === 'yigui' && x.as === 'wuxie');
    return o ? { kind: 'useSkill', skill: `virtual:yigui:wuxie`, cardIds: [], targets: [] } : { kind: 'pass' };
  }).set('choose', () => ({ kind: 'choice', index: 0 }));
  ctrls[0].set('chooseCards', (r) => ({ kind: 'cards', cardIds: [(r as { cardIds: number[] }).cardIds[0]] }));
  enterPlay(game, 0);
  await game.useCard(0, gh, [1]);
  const req = seen.find((r) => (r as { context?: { kind: string } }).context?.kind === 'nullify') as Extract<Request, { type: 'respond' }>;
  assert.ok(req, 'Tả Từ được hỏi Vô Giải');
  assert.deepEqual(req.virtuals?.filter((o) => o.skill === 'yigui').map((o) => o.as).sort(), ['wuxie', 'wuxie_guo'], 'có 2 nút: Vô Giải và Vô Giải·Quốc');
  assert.equal(ctrls[1].asked.filter((r) => r.type === 'respond').length, 1, 'chỉ 1 câu hỏi (không có bước xác nhận riêng)');
  assert.ok(game.log.some((l) => l.includes('bị Vô Giải chặn')), 'Quá Hà bị chặn');
  assert.equal(game.generalPile(1, 'Hồn').length, huns - 1);
});

test('Đỗ Dự: khi đáp lại, tay bài không sáng cả; có nút Diệt Ngô', async () => {
  const { game, ctrls } = makeHG([['duyu', 'xuchu'], ['liubei', 'zhangfei'], ['caocao', 'simayi']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  // Thục dùng trang bị -> 1 Võ Khố
  const w = (await take(game, 1, (c) => c.name === 'zhuahuang'));
  await game.equip(1, game.card(w));
  const peach = await take(game, 0, (c) => c.name === 'tao');
  let views = 0;
  ctrls[0].set('respond', (r, v) => {
    views++;
    assert.equal(v.responseOptions.some((o) => o.cardId === peach), false, 'Đào không sáng như Thiểm');
    assert.ok((r as Extract<Request, { type: 'respond' }>).virtuals?.some((o) => o.skill === 'miewu' && o.as === 'shan'));
    return { kind: 'pass' };
  });
  const played = await game.requestResponse(0, ['shan'], 'test', 1);
  assert.equal(played, null);
  assert.equal(views, 1);
});

test('Bỏ qua cả lá này: Nam Man nhiều mục tiêu, người cầm Vô Giải chỉ bị hỏi 1 lần', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng'], ['zhangjiao', 'yuji']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  const nm = await take(game, 0, (c) => c.name === 'nanman');
  await take(game, 2, (c) => c.name === 'wuxie' || c.name === 'wuxie_guo');
  let asked = 0; let muteable = false;
  ctrls[2].set('respond', (r) => {
    const c = (r as Extract<Request, { type: 'respond' }>).context;
    if (c?.kind === 'nullify') { asked++; muteable = !!c.muteable; return { kind: 'pass', mute: true }; }
    return { kind: 'pass' };
  });
  enterPlay(game, 0);
  await game.useCard(0, nm, []);
  assert.equal(asked, 1, 'chỉ hỏi 1 lần cho cả lá');
  assert.ok(muteable, 'có lựa chọn bỏ qua cả lá');
});

test('Bot: dùng nút Dịch Quỷ để chặn cẩm nang của địch lên đồng minh', async () => {
  const bot = new HegemonyBot();
  const v = {
    me: 1, myHand: [], players: [0, 1, 2].map((seat) => ({ seat, name: `P${seat}`, team: null, hp: 3, maxHp: 4, handCount: 2, alive: true, special: [],
      equips: {}, judgeArea: [], chained: false, kingdom: seat === 0 ? 'wei' : 'qun', marks: { yinyang: 0, pioneer: 0, pair: 0 },
      generals: { main: { generalId: seat === 1 ? 'new_zuoci' : 'zhangjiao', revealed: true }, deputy: { generalId: 'yuji', revealed: true } } })),
    drawPileCount: 50, discardPileCount: 0, lastDiscards: [], currentSeat: 0, phase: 'play', turn: 3, shaUsed: 0, hints: [], responseOptions: [],
    notes: [], recentLog: [],
  };
  const r = await bot.decide({ type: 'respond', seat: 1, accept: ['wuxie_guo', 'wuxie'], reason: '', source: 0,
    context: { kind: 'nullify', trick: 'guohe', user: 0, target: 2, cancelled: false },
    virtuals: [{ skill: 'yigui', name: 'Dịch Quỷ', as: 'wuxie', label: 'Vô Giải', reveal: false }] } as never, v as never);
  assert.deepEqual(r, { kind: 'useSkill', skill: 'virtual:yigui:wuxie', cardIds: [], targets: [] });
});
