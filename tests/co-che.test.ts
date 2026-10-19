// Test các cơ chế mở rộng qua kỹ năng JSON (content/skills/vi-du-co-che.json).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import type { Request } from '../src/core/types.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
import { give } from './helpers.js';
import { makeHG, revealAll, stackTop, YES } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const useSkill = (game: HegemonyGame, seat: number, skill: string, targets: number[] = [], cardIds: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });
const emptyHands = async (game: HegemonyGame, ...seats: number[]) => {
  for (const s of seats) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
};

test('JSON turnOver: Cố Thủ bốc 3 lá rồi lật úp', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.grantSkill(0, 'mau_cu_thu');
  ctrls[0].set('confirm', YES);
  await game.runTurn(0);
  assert.equal(game.player(0).faceDown, true);
});

test('JSON useAs: coi như dùng Sát (lá ảo) gây sát thương, không cần lá thật', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  game.grantSkill(0, 'mau_thoat_kich');
  game.state.phase = 'play';
  const hp0 = game.player(0).hp, hp1 = game.player(1).hp;
  assert.equal(await useSkill(game, 0, 'mau_thoat_kich', [1]), null);
  assert.equal(game.player(0).hp, hp0 - 1);
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.equal(game.totalCards(), game.cards.size);
});

test('JSON virtualArmor: giáp ảo Bát Quái Trận', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.grantSkill(0, 'mau_bat_tran');
  assert.equal(game.armorOf(0), 'bagua');
});

test('JSON banCards: lá phán định đỏ -> người bị chọn không dùng được bài đỏ trong lượt', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.grantSkill(0, 'mau_tiem_tap');
  ctrls[0].set('confirm', YES).set('chooseTargets', (r: Request) => ({ kind: 'targets', targets: (r as { candidates: number[] }).candidates.slice(0, 1) }));
  stackTop(game, (c) => c.suit === 'heart');
  let banned = false;
  game.bus.on('phaseStart', ({ phase }) => { if (phase === 'draw') banned = !!game.player(1).flags.turn_banRed; });
  await game.runTurn(0);
  assert.equal(banned, true);
  assert.equal(game.player(1).flags.turn_banRed, undefined, 'hết lượt thì hết cấm');
});

test('JSON pindian: thắng đấu điểm thì gây sát thương', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await emptyHands(game, 0, 1);
  const k = game.state.drawPile.find((i) => game.card(i).rank === 13)!;
  const a = game.state.drawPile.find((i) => game.card(i).rank === 1)!;
  await game.moveCards([k], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  await game.moveCards([a], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  for (const c of ctrls) c.set('chooseCards', (r: Request) => ({ kind: 'cards', cardIds: (r as { cardIds: number[] }).cardIds.slice(0, 1) }));
  game.grantSkill(0, 'mau_tranh_hung');
  game.state.phase = 'play';
  const hp1 = game.player(1).hp;
  assert.equal(await useSkill(game, 0, 'mau_tranh_hung', [1]), null);
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.ok(game.log.some((l) => l.includes('thắng với')), 'biến pindian.mine dùng được trong "say"');
});

test('JSON order: người nhận không thực hiện quân lệnh -> người ra lệnh bốc 2 lá', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.grantSkill(0, 'mau_ban_lenh');
  ctrls[1].set('choose', (r: Request) => ({ kind: 'choice', index: (r as { options: string[] }).options.indexOf('Không thực hiện') }));
  game.state.phase = 'play';
  const n = game.player(0).hand.length;
  assert.equal(await useSkill(game, 0, 'mau_ban_lenh', [1]), null);
  assert.equal(game.player(0).hand.length, n + 2);
});

test('JSON death role victim: khi chết, người giết bị loại phó tướng', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await emptyHands(game, 0, 1);
  game.grantSkill(1, 'mau_tuyet_menh');
  game.player(1).hp = 1;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false }).catch(() => {});
  assert.equal(game.player(1).alive, false);
  assert.equal(game.hero(0).deputy.removed, true);
});

test('JSON trickTargeted + cancel: Vãn Nguy hủy Quá Hà Sách Kiều', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.grantSkill(1, 'mau_van_nguy');
  ctrls[1].set('confirm', YES);
  const [gh] = await give(game, 0, 'guohe');
  game.state.phase = 'play';
  const before = game.player(1).hand.length;
  await game.useCard(0, gh, [1]);
  assert.ok(game.log.some((l) => l.includes('Vãn Nguy')));
  assert.equal(game.player(1).hand.length, before - 1, 'chỉ mất đúng 1 lá tự bỏ');
});

test('JSON extraTurn: người được chọn có thêm một lượt', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']], { maxTurns: 2 });
  await game.setup();
  game.grantSkill(0, 'mau_nhuong_luot');
  let used = false;
  ctrls[0].set('play', (_r, v) => {
    if (used || !v.myHand.length) return { kind: 'endPlay' };
    used = true;
    return { kind: 'useSkill', skill: 'mau_nhuong_luot', cardIds: [v.myHand[0].id], targets: [1] };
  });
  await game.run();
  assert.ok(game.log.some((l) => l.includes('P1 được thêm một lượt')));
});

test('JSON besieging + needShan: bị vây công thì cần 2 Thiểm', async () => {
  // 4 người: hai Ngụy (ghế 0, 2) kẹp Thục (ghế 1). Bàn 3 người thì 2 Ngụy đã vượt nửa -> thành dã tâm gia.
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['simayi', 'guojia'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  assert.deepEqual(game.besiegers(1)?.sort(), [0, 2]);
  await emptyHands(game, 0, 1);
  game.grantSkill(0, 'mau_vay_ham');
  await give(game, 1, 'shan');
  ctrls[1].set('respond', (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' }));
  const [s] = await give(game, 0, 'sha');
  game.state.phase = 'play';
  const hp1 = game.player(1).hp;
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hp, hp1 - 1, 'một lá Thiểm không đủ');
});

test('JSON hideGeneral: úp lại tướng đã lật', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 1);
  game.grantSkill(0, 'mau_ly_gian_tuong');
  ctrls[0].set('choose', () => ({ kind: 'choice', index: 1 }));
  game.state.phase = 'play';
  const ids = game.player(0).hand.slice(0, 2);
  assert.equal(await useSkill(game, 0, 'mau_ly_gian_tuong', [1], ids), null);
  assert.equal(game.hero(1).deputy.revealed, false);
  assert.equal(game.hero(1).main.revealed, true);
});

test('JSON grantSkill turnOnly: Bào Hao chỉ có trong lượt này', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.grantSkill(0, 'mau_khich_le');
  game.state.phase = 'play';
  const [x] = game.player(0).hand;
  assert.equal(await useSkill(game, 0, 'mau_khich_le', [0], [x]), null);
  assert.equal(game.slashLimit(0), Infinity);
  await game.bus.emit('turnEnd', { seat: 0 });
  assert.equal(game.slashLimit(0), 1);
});
