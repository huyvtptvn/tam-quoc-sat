// Bot Quốc Chiến theo Bộ quy tắc hành vi BOT – TQS: kiểm tra các tình huống mẫu (Chương X).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerView, PublicPlayer } from '../src/core/view.js';
import { HegemonyBot } from '../src/hegemony/bot.js';
import type { Card } from '../src/core/types.js';

let cid = 1000;
const card = (name: string): Card => ({ id: cid++, name, suit: 'spade', rank: 7, type: 'basic' } as unknown as Card);

function P(seat: number, o: Partial<PublicPlayer> & { gens?: [string, string]; hidden?: boolean }): PublicPlayer {
  const [a, b] = o.gens ?? ['caocao', 'xuchu'];
  return {
    seat, name: `P${seat}`, team: null, hp: 3, maxHp: 4, handCount: 3, alive: true, special: [], equips: {}, judgeArea: [], chained: false,
    kingdom: null, marks: { yinyang: 0, pioneer: 0, pair: 0 },
    generals: { main: { generalId: o.hidden ? null : a, revealed: !o.hidden }, deputy: { generalId: o.hidden ? null : b, revealed: !o.hidden } },
    ...o,
  } as PublicPlayer;
}

function view(me: number, players: PublicPlayer[], log: string[] = []): PlayerView {
  return {
    me, myHand: [card('sha')], players, drawPileCount: 50, discardPileCount: 0, lastDiscards: [], currentSeat: me, phase: 'play', turn: 5,
    shaUsed: 0, hints: [], responseOptions: [], notes: [], recentLog: log,
  } as PlayerView;
}

/** Ghế bot sẽ chọn trong các ứng viên (chooseTargets aim 'enemy'). */
async function pick(v: PlayerView, candidates: number[]): Promise<number> {
  const bot = new HegemonyBot();
  const r = await bot.decide({ type: 'chooseTargets', seat: v.me, prompt: '', candidates, min: 1, max: 1, aim: 'enemy' } as never, v);
  return (r as { targets: number[] }).targets[0];
}

test('Tình huống A (luật mới): ưu tiên đánh phe đông người nhất (Ngụy 3 người) dù Thục mạnh hơn', async () => {
  const v = view(0, [
    P(0, { kingdom: 'wu', gens: ['sunquan', 'zhoutai'], hp: 3, handCount: 3 }),
    P(1, { kingdom: 'wei', gens: ['yuejin', 'lidian'], hp: 2, maxHp: 3, handCount: 1 }),
    P(2, { kingdom: 'wu', gens: ['lvmeng', 'ganning'], hp: 3, handCount: 3 }),
    P(3, { kingdom: 'wei', gens: ['zangba', 'yujin'], hp: 2, maxHp: 3, handCount: 1 }),
    P(4, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 4, handCount: 5, equips: { weapon: card('qinglong'), armor: card('bagua') } as never }),
    P(5, { kingdom: 'wei', gens: ['caohong', 'caoren'], hp: 1, maxHp: 4, handCount: 0 }),
    P(6, { kingdom: 'shu', gens: ['zhugeliang', 'huangyueying'], hp: 3, handCount: 5, equips: { weapon: card('zhuge'), offHorse: card('chitu') } as never }),
  ]);
  const t = await pick(v, [1, 3, 4, 6]);
  assert.ok(t === 1 || t === 3, `chọn người Ngụy (phe đông nhất) (chọn P${t})`);
});

test('Tình huống C: cuối ván ưu tiên chặn Dã tâm gia có khả năng thắng hơn người Ngô dễ đánh', async () => {
  const v = view(0, [
    P(0, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 3 }),
    P(1, { kingdom: 'shu', gens: ['zhaoyun', 'liushan'], hp: 2 }),
    P(2, { kingdom: 'wu', gens: ['lvmeng', 'ganning'], hp: 2, handCount: 2 }),
    P(3, { kingdom: 'careerist', careeristGroup: 3, gens: ['simazhao', 'xuchu'], hp: 3, handCount: 5, equips: { weapon: card('qinglong') } as never }),
    P(4, { alive: false, kingdom: 'wei' }),
  ]);
  assert.equal(await pick(v, [2, 3]), 3);
});

test('Tình huống D: người chưa lộ từng cứu người Ngô bị coi là có khả năng cao là đồng minh -> đánh kẻ địch đã xác định', async () => {
  const players = [
    P(0, { kingdom: 'wu', gens: ['sunquan', 'zhoutai'] }),
    P(1, { hidden: true, hp: 3 }),
    P(2, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 4, handCount: 4 }),
    P(3, { kingdom: 'wu', gens: ['lvmeng', 'ganning'], hp: 1 }),
    P(4, { hidden: true }), P(5, { hidden: true }),
  ];
  const v = view(0, players, ['P2 dùng Sát vào P3.', 'P1 dùng Đào cứu P3.', 'P1 dùng Sát vào P2.']);
  const bot = new HegemonyBot();
  await bot.decide({ type: 'chooseTargets', seat: 0, prompt: '', candidates: [1, 2], min: 1, max: 1, aim: 'enemy' } as never, v);
  const r = await bot.decide({ type: 'chooseTargets', seat: 0, prompt: '', candidates: [1, 2], min: 1, max: 1, aim: 'enemy' } as never, v);
  assert.equal((r as { targets: number[] }).targets[0], 2, 'đánh người Thục đã lộ');
  const p1 = (bot as unknown as { allyProb: (v: PlayerView, p: PublicPlayer) => number }).allyProb(v, players[1]);
  const p4 = (bot as unknown as { allyProb: (v: PlayerView, p: PublicPlayer) => number }).allyProb(v, players[4]);
  assert.ok(p1 > p4 && p1 < 1, `xác suất đồng minh tăng nhưng không tuyệt đối (P1=${p1.toFixed(2)}, P4=${p4.toFixed(2)})`);
});

test('Điều 29: có thể thắng ngay (hạ người cuối cùng khác phe) thì ưu tiên tuyệt đối', async () => {
  const v = view(0, [
    P(0, { kingdom: 'wei', gens: ['caocao', 'xuchu'] }),
    P(1, { kingdom: 'wei', gens: ['xiahoudun', 'xiahouyuan'] }),
    P(2, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 1, handCount: 0 }),
    P(3, { alive: false }),
  ]);
  assert.equal(await pick(v, [2]), 2);
});

test('Hai Dã tâm gia khác nhóm không phải đồng minh; cùng nhóm Lạp Long Nhân Tâm là đồng minh', async () => {
  const players = [
    P(0, { kingdom: 'careerist', careeristGroup: 0, gens: ['simazhao', 'xuchu'] }),
    P(1, { kingdom: 'careerist', careeristGroup: 1, gens: ['zhonghui', 'caoren'] }),
    P(2, { kingdom: 'careerist', careeristGroup: 0, gens: ['caocao', 'dianwei'] }),
  ];
  const bot = new HegemonyBot();
  const v = view(0, players);
  const ally = (s: number) => (bot as unknown as { isAlly: (v: PlayerView, p: PublicPlayer) => boolean }).isAlly(v, players[s]);
  assert.equal(ally(1), false);
  assert.equal(ally(2), true);
});

test('Cẩm nang cả bàn: không dùng khi phần lớn người còn lại có khả năng là đồng minh', async () => {
  const bot = new HegemonyBot();
  const players = [
    P(0, { kingdom: 'wei', gens: ['caocao', 'xuchu'] }),
    P(1, { kingdom: 'wei', gens: ['xiahoudun', 'xiahouyuan'], hp: 1 }),
    P(2, { kingdom: 'wei', gens: ['caoren', 'caohong'], hp: 1 }),
    P(3, { kingdom: 'shu', gens: ['liubei', 'guanyu'] }),
  ];
  const v = view(0, players);
  assert.equal((bot as unknown as { aoeWorth: (v: PlayerView) => boolean }).aoeWorth(v), false);
});

test('Luật mới: là phe đông nhất thì đánh người yếu nhất bàn', async () => {
  const v = view(0, [
    P(0, { kingdom: 'wei', gens: ['caocao', 'xuchu'], hp: 4, handCount: 4 }),
    P(1, { kingdom: 'wei', gens: ['zangba', 'yujin'], hp: 3 }),
    P(2, { kingdom: 'wei', gens: ['yuejin', 'lidian'], hp: 3 }),
    P(3, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 4, handCount: 5 }),
    P(4, { kingdom: 'wu', gens: ['lvmeng', 'ganning'], hp: 1, handCount: 0 }),
    P(5, { kingdom: 'shu', gens: ['zhugeliang', 'huangyueying'], hp: 3, handCount: 4 }),
  ]);
  assert.equal(await pick(v, [3, 4, 5]), 4);
});

test('Luật mới: không tự đánh đồng đội dù đồng đội máu thấp', async () => {
  const v = view(0, [
    P(0, { kingdom: 'wei', gens: ['caocao', 'xuchu'] }),
    P(1, { kingdom: 'wei', gens: ['zangba', 'yujin'], hp: 1, handCount: 0 }),
    P(2, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 4, handCount: 5 }),
  ]);
  assert.equal(await pick(v, [1, 2]), 2);
});

async function hezong(players: PublicPlayer[]): Promise<{ skill?: string; targets?: number[] }> {
  const v = view(0, players);
  const hand = [card('shan'), card('jiu')];
  v.myHand = hand;
  v.skillHints = [{ skill: 'transfer', targets: players.filter((p) => p.seat !== 0).map((p) => p.seat), validCards: hand.map((c) => c.id), maxCards: 3, needsTarget: true }] as never;
  const r = await new HegemonyBot().decide({ type: 'play', seat: 0, prompt: '' } as never, v);
  return r as never;
}

test('Luật mới: phe đông nhất không dùng Hợp Tung', async () => {
  const r = await hezong([
    P(0, { kingdom: 'wei', gens: ['caocao', 'xuchu'] }),
    P(1, { kingdom: 'wei', gens: ['zangba', 'yujin'] }),
    P(2, { kingdom: 'shu', gens: ['liubei', 'guanyu'] }),
    P(3, { kingdom: 'wu', gens: ['lvmeng', 'ganning'] }),
  ]);
  assert.notEqual(r.skill, 'transfer');
});

test('Luật mới: phe nhỏ Hợp Tung cho phe yếu, không giao phe đông nhất', async () => {
  const r = await hezong([
    P(0, { kingdom: 'wu', gens: ['sunquan', 'zhoutai'] }),
    P(1, { kingdom: 'wei', gens: ['zangba', 'yujin'], hp: 1 }),
    P(2, { kingdom: 'wei', gens: ['caocao', 'xuchu'] }),
    P(3, { kingdom: 'shu', gens: ['liubei', 'guanyu'], hp: 4 }),
  ]);
  assert.equal(r.skill, 'transfer');
  assert.deepEqual(r.targets, [3]);
});
