// Tính điểm trong ván + Elo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachScoring, SCORE_RULES } from '../src/hegemony/scoring.js';
import { eloDeltas, rankOf } from '../src/server/elo.js';
import type { CardName } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { makeHG, revealAll } from './hg-helpers.js';

// 6 người: Ngụy 0,1,2 · Thục 3,4 · Ngô 5
const P: [string, string][] = [['caocao', 'xuchu'], ['xiahoudun', 'zhangliao'], ['dianwei', 'zhenji'], ['liubei', 'guanyu'], ['zhangfei', 'zhaoyun'], ['sunquan', 'lvmeng']];
const grab = async (game: HegemonyGame, seat: number, name: CardName) => {
  const id = game.state.drawPile.find((i) => game.card(i).name === name)
    ?? game.state.players.flatMap((p) => p.hand).find((i) => game.card(i).name === name)!;
  const from = game.state.drawPile.includes(id) ? { kind: 'draw' as const } : { kind: 'hand' as const, seat: game.state.players.find((p) => p.hand.includes(id))!.seat };
  if (!(from.kind === 'hand' && from.seat === seat)) await game.moveCards([id], from, { kind: 'hand', seat }, 'test');
  return id;
};

test('Điểm sát thương: địch đã lộ +3, địch còn úp +4, đồng đội đã lộ −3, đồng đội còn úp −1', async () => {
  const { game } = makeHG(P);
  await game.setup();
  const sk = attachScoring(game);
  await game.damage({ source: 0, target: 3, amount: 1, card: null, cancelled: false }); // Thục còn úp
  await revealAll(game, 0, 1, 3);
  await game.damage({ source: 0, target: 3, amount: 1, card: null, cancelled: false }); // Thục đã lộ
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false }); // đồng đội đã lộ
  await game.damage({ source: 0, target: 2, amount: 1, card: null, cancelled: false }); // đồng đội còn úp
  const b = sk.compute();
  assert.equal(b.players[0].breakdown.damage, SCORE_RULES.damageEnemyHidden + SCORE_RULES.damageEnemy + SCORE_RULES.damageAlly + SCORE_RULES.damageAllyHidden);
  assert.equal(b.players[0].stats.damageToEnemy, 2);
  assert.equal(b.players[0].stats.damageToAlly, 2);
});

test('Điểm hồi máu cho đồng đội và Quá Hà Sách Kiều (hủy bài của địch)', async () => {
  const { game } = makeHG(P);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4, 5);
  const sk = attachScoring(game);
  game.player(1).hp = 1;
  await game.asActor(0, () => game.recover(1, 1, 0));
  game.state.currentSeat = 0; game.state.phase = 'play';
  const gh = await grab(game, 0, 'guohe');
  await game.useCard(0, gh, [3]);
  const b = sk.compute();
  assert.equal(b.players[0].breakdown.heal, SCORE_RULES.healAlly);
  assert.equal(b.players[0].stats.cardsDestroyed, 1, 'Quá Hà tính là hủy 1 lá của địch');
  assert.equal(b.players[0].breakdown.cards, SCORE_RULES.destroyEnemy);
});

test('Lạc Bất Tư Thục trúng địch: người đặt được +4', async () => {
  const { game } = makeHG(P);
  await game.setup();
  await revealAll(game, 0, 3);
  const sk = attachScoring(game);
  game.state.currentSeat = 0; game.state.phase = 'play';
  const lb = await grab(game, 0, 'lebu');
  await game.useCard(0, lb, [3]);
  // Phán định không phải Cơ -> trúng
  const pile = game.state.drawPile;
  const i = pile.findIndex((id) => game.card(id).suit !== 'heart');
  pile.push(...pile.splice(i, 1));
  game.state.currentSeat = 3;
  const { resolveJudgePhase } = await import('../src/core/tricks.js');
  await resolveJudgePhase(game, 3);
  const b = sk.compute();
  assert.equal(b.players[0].breakdown.jail, SCORE_RULES.lebuEnemy);
  assert.equal(b.players[0].stats.jailHits, 1);
});

test('Kết thúc ván: phe thắng còn sống +20, đã chết +10, sống sót +3; MVP và danh hiệu', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['xiahoudun', 'zhangliao'], ['sunquan', 'lvmeng']]);
  await game.setup();
  const sk = attachScoring(game);
  await revealAll(game, 0, 1, 2, 3);
  game.player(1).hp = 1; game.player(3).hp = 1; game.player(2).hp = 1;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  // Đồng đội (ghế 2) chết vì Ngô, rồi ghế 0 hạ Ngô -> Ngụy thắng, ghế 2 thắng dù đã chết
  await game.damage({ source: 3, target: 2, amount: 1, card: null, cancelled: false });
  try { await game.damage({ source: 0, target: 3, amount: 1, card: null, cancelled: false }); } catch { /* ván kết thúc */ }
  assert.ok(game.state.finished);
  const b = sk.compute();
  const p0 = b.players[0];
  assert.ok(p0.winner && b.players[2].winner && !b.players[1].winner && !b.players[3].winner);
  assert.equal(p0.breakdown.end, SCORE_RULES.winAlive + SCORE_RULES.survive + SCORE_RULES.firstReveal);
  assert.equal(b.players[2].breakdown.end, SCORE_RULES.winDead);
  assert.equal(p0.breakdown.kill, 2 * SCORE_RULES.killEnemy);
  assert.equal(b.mvp, 0);
  assert.ok(p0.titles.includes('MVP') && p0.titles.includes('Sát Thần'));
});

test('Elo: thắng thì tăng, thua thì giảm; ván chỉ 1 tài khoản đổi một nửa; bot/khách không đổi', () => {
  const base = { rating: 1200, games: 20, rated: true, score: 10 };
  const d = eloDeltas([
    { ...base, winner: true, faction: 'wei' }, { ...base, winner: true, faction: 'wei' },
    { ...base, winner: false, faction: 'shu' }, { ...base, winner: false, faction: 'shu', rated: false },
  ]);
  assert.ok(d[0] > 0 && d[1] > 0 && d[2] < 0);
  assert.equal(d[3], 0);
  const solo = eloDeltas([{ ...base, winner: true, faction: 'wei' }, { ...base, rated: false, winner: false, faction: 'shu' }]);
  const duo = eloDeltas([{ ...base, winner: true, faction: 'wei' }, { ...base, winner: false, faction: 'shu' }]);
  assert.equal(solo[0] * 2, duo[0]);
  // Điểm cá nhân cao hơn đồng đội -> được nhiều hơn đồng đội
  const perf = eloDeltas([
    { ...base, winner: true, faction: 'wei', score: 40 }, { ...base, winner: true, faction: 'wei', score: 5 },
    { ...base, winner: false, faction: 'shu' }, { ...base, winner: false, faction: 'shu' },
  ]);
  assert.ok(perf[0] > perf[1]);
  assert.equal(rankOf(1500, 30), 'Đại Tướng Quân');
  assert.match(rankOf(1500, 3), /Đang xếp hạng/);
});
