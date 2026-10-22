// Sửa lỗi 22/10: Khán Phá úp ngoài lượt phải lật tướng, Hào Khôi giao cho người khác phe,
// kỹ năng đổi tướng chỉ 1 lần, Hư Thực chặn mọi loại bài.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_INFO, isRed } from '../src/core/cards.js';
import type { Card } from '../src/core/types.js';
import { loadContent } from '../src/content/loader.js';
import type { HegemonyGame } from '../src/hegemony/game.js';
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

test('Khán Phá trên tướng úp: dùng lá Đen làm Vô Giải ngoài lượt thì lật tướng', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['wolong', 'liubei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const black = await take(game, 1, (c) => !isRed(c) && c.name !== 'wuxie' && c.name !== 'wuxie_guo');
  const gh = await take(game, 0, (c) => c.name === 'guohe');
  ctrls[1].set('respond', () => ({ kind: 'card', cardId: black })).set('confirm', () => ({ kind: 'yes' }));
  enterPlay(game, 0);
  await game.useCard(0, gh, [2]);
  assert.ok(game.state.discardPile.includes(black), 'đã đánh lá Đen');
  assert.ok(game.heroes[1].main.revealed, 'Ngọa Long (Khán Phá) đã lật');
});

test('Hào Khôi: giao bài cho người thế lực xác định KHÁC phe, không giao cho đồng minh', async () => {
  const { game, ctrls } = makeHG([['chendeng', 'huatuo'], ['lvbu', 'zhangjiao'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  game.player(1).hp = game.player(1).maxHp; // đồng minh nhiều máu nhất
  game.player(2).hp = 1; game.player(3).hp = 2;
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  let pool: number[] = [];
  ctrls[0].set('chooseTargets', (r) => { pool = (r as unknown as { targets: number[] }).targets; return { kind: 'targets', targets: [pool[0]] }; });
  enterPlay(game, 0);
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  game.state.phase = 'discard';
  const id = game.player(0).hand[0];
  await game.moveCards([id], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'discard');
  await game.bus.emit('phaseEnd', { seat: 0, phase: 'discard' });
  assert.ok(!game.player(1).hand.includes(id), 'đồng minh không nhận');
  assert.ok(game.player(2).hand.includes(id) || game.player(3).hand.includes(id), 'người khác phe nhận');
  if (pool.length) assert.ok(!pool.includes(1));
});

test('Kỹ năng cho đổi tướng: mỗi kỹ năng chỉ đổi được 1 lần mỗi ván', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  const grant = { owner: 0, skill: 'diancai' };
  assert.equal(await game.askTransform(0, 'thử', grant), true, 'lần 1 đổi được');
  const dep = game.heroes[0].deputy.generalId;
  assert.equal(await game.askTransform(0, 'thử', grant), false, 'lần 2 không đổi');
  assert.equal(await game.transformDeputy(0, grant), false);
  assert.equal(game.heroes[0].deputy.generalId, dep);
  assert.equal(game.transformGrantUsed(grant), true);
});

for (const kind of ['sha', 'lebu', 'guohe'] as const) {
  test(`Hư Thực (Trần Đăng úp) chặn được ${kind} nhắm riêng mình và được lật tướng`, async () => {
    const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['chendeng', 'huatuo'], ['sunquan', 'lvmeng']]);
    await game.setup();
    await revealAll(game, 0);
    const asked: { skill: string; reveal: boolean }[] = [];
    ctrls[1].set('confirm', (r) => { const x = r as { skill: string; reveal: boolean }; asked.push(x); return { kind: x.skill === 'xushi' ? 'yes' : 'no' }; });
    const c = await take(game, 0, (x) => x.name === kind);
    const hp = game.player(1).hp;
    enterPlay(game, 0);
    await game.useCard(0, c, [1]);
    assert.ok(asked.some((a) => a.skill === 'xushi' && a.reveal), 'được hỏi Hư Thực (kèm lật tướng)');
    assert.ok(game.heroes[1].main.revealed, 'Trần Đăng đã lật');
    assert.equal(game.player(1).hp, hp, 'không mất máu');
    assert.equal(game.player(1).judgeArea.length, 0, 'không có lá trong khu phán định');
    assert.ok(game.state.discardPile.includes(c), 'lá bị hủy vào chồng bỏ');
  });
}

test('Tật Lê (Sa Ma Kha): X là tầm đánh TRƯỚC khi lắp — lắp tầm 2 (lá 1) rút 1, rồi lắp tầm 3 (lá 2) rút 2', async () => {
  const { game, ctrls } = makeHG([['shamoke', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  for (const id of [...game.player(0).hand]) await game.moveCards([id], { kind: 'hand', seat: 0 }, { kind: 'discard' }, 'test');
  const w2 = await take(game, 0, (c) => CARD_INFO[c.name].slot === 'weapon' && CARD_INFO[c.name].range === 2);
  const w3 = await take(game, 0, (c) => CARD_INFO[c.name].slot === 'weapon' && CARD_INFO[c.name].range === 3);
  enterPlay(game, 0);
  assert.equal(game.attackRange(0), 1, 'tầm đánh gốc là 1');
  await game.useCard(0, w2, []);
  assert.equal(game.player(0).hand.length, 1 + 1, 'còn Thanh Long + rút 1');
  await game.useCard(0, w3, []);
  assert.equal(game.player(0).hand.length, 1 + 2, 'rút thêm 2');
  assert.equal(game.attackRange(0), 3);
});

const useSkill = (game: HegemonyGame, seat: number, skill: string, cardIds: number[] = [], targets: number[] = []) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds, targets });

test('Quốc Sắc (Đại Kiều): dùng lá Rô đang trang bị làm Lạc Bất Tư Thục', async () => {
  const { game, ctrls } = makeHG([['daqiao', 'sunquan'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  const id = game.state.drawPile.find((i) => game.card(i).suit === 'diamond' && CARD_INFO[game.card(i).name].type === 'equip')!;
  assert.ok(id !== undefined);
  const slot = CARD_INFO[game.card(id).name].slot!;
  await game.moveCards([id], { kind: 'draw' }, { kind: 'equip', seat: 0, slot }, 'test');
  ctrls[0].set('chooseCards', (r) => ({ kind: 'cards', cardIds: [(r as unknown as { cardIds: number[] }).cardIds[0]] }));
  enterPlay(game, 0);
  assert.equal(await useSkill(game, 0, 'guose', [], [1]), null);
  assert.ok(game.player(1).judgeArea.includes(id), 'lá trang bị Rô nằm trong khu phán định của mục tiêu');
  assert.equal(game.delayedName(id), 'lebu');
  assert.ok(!game.player(0).equips[slot].includes(id));
  assert.notEqual(await useSkill(game, 0, 'guose', [], [2]), null, 'hết lá Rô trang bị thì không dùng được');
});

test('Liệt Nhận (Chúc Dung): chỉ đấu điểm với mục tiêu của Sát, không với người bị lan xích', async () => {
  const { game, ctrls } = makeHG([['zhurong', 'menghuo'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  game.player(1).chained = true; game.player(2).chained = true;
  const fire = game.state.drawPile.find((i) => game.card(i).name === 'sha' && game.card(i).nature === 'fire')!;
  assert.ok(fire !== undefined, 'có Hỏa Sát');
  await game.moveCards([fire], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  const pinned: number[] = [];
  ctrls[0].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'lieren' ? 'yes' : 'no' }));
  game.bus.on('pindianStart' as never, ((ctx: { to: number }) => { pinned.push(ctx.to); }) as never);
  const before = game.log.length;
  enterPlay(game, 0);
  const t = game.distance(0, 1) <= game.attackRange(0) ? 1 : 3;
  game.player(t).chained = true;
  await game.useCard(0, fire, [t]);
  const lines = game.log.slice(before).filter((l) => /đấu điểm/i.test(l));
  const other = [1, 2].find((s) => s !== t)!;
  const otherName = game.player(other).name;
  assert.ok(lines.some((l) => l.includes(game.player(t).name)), 'vẫn đấu điểm với mục tiêu của Sát');
  assert.ok(!lines.some((l) => l.includes(otherName)), `không đấu điểm với người bị lan xích: ${lines.join(' | ')}`);
});

// ---------------- Thao Loạn (Trương Nhượng) ----------------

test('Thao Loạn: có "Không dùng", có Hỏa/Lôi Sát; hủy chọn mục tiêu thì KHÔNG lật tướng', async () => {
  const { game, ctrls } = makeHG([['zhangrang', 'hejin'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  let opts: string[] = [];
  ctrls[0].set('choose', (r) => { opts = (r as unknown as { options: string[] }).options; return { kind: 'choice', index: opts.indexOf('Sát') }; })
    .set('chooseTargets', () => ({ kind: 'targets', targets: [] }));
  enterPlay(game, 0);
  assert.equal(await useSkill(game, 0, 'taoluan'), null);
  assert.equal(opts[opts.length - 1], 'Không dùng');
  assert.ok(opts.includes('Hỏa Sát') && opts.includes('Lôi Sát'), opts.join(','));
  assert.equal(game.heroes[0].main.revealed, false, 'hủy thì tướng vẫn úp');
});

test('Thao Loạn: Lôi Sát ảo gây sát thương lôi', async () => {
  const { game, ctrls } = makeHG([['zhangrang', 'hejin'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  ctrls[0].set('choose', (r) => ({ kind: 'choice', index: (r as unknown as { options: string[] }).options.indexOf('Lôi Sát') }))
    .set('chooseTargets', (r) => ({ kind: 'targets', targets: [(r as unknown as { candidates: number[] }).candidates[0]] }));
  enterPlay(game, 0);
  await useSkill(game, 0, 'taoluan');
  assert.ok(game.heroes[0].main.revealed);
  assert.ok(game.log.some((l) => l.includes('Lôi Sát (Thao Loạn)')));
  assert.ok(game.log.some((l) => l.includes('sát thương lôi')), 'sát thương lôi');
});

test('Thao Loạn: xem như Thiểm khi bị Sát (lật tướng)', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangrang', 'hejin'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  const sha = await take(game, 0, (c) => c.name === 'sha' && !c.nature);
  ctrls[1].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'taoluan' ? 'yes' : 'no' }));
  const hp = game.player(1).hp;
  enterPlay(game, 0);
  game.player(0).flags = {};
  const t = game.distance(0, 1) <= game.attackRange(0) ? 1 : null;
  if (t === null) return; // không trong tầm (ngồi ngẫu nhiên)
  await game.useCard(0, sha, [1]);
  assert.ok(game.heroes[1].main.revealed, 'Trương Nhượng lật');
  assert.equal(game.player(1).hp, hp, 'không mất máu');
});

test('Thao Loạn: xem như Vô Giải (được hỏi dù không có lá Vô Giải)', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangrang', 'hejin'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  for (const id of [...game.player(1).hand]) await game.moveCards([id], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const gh = await take(game, 0, (c) => c.name === 'guohe');
  const victim = await take(game, 2, (c) => c.name === 'tao');
  ctrls[1].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'taoluan' ? 'yes' : 'no' }));
  ctrls[0].set('chooseCards', () => ({ kind: 'cards', cardIds: [victim] }));
  enterPlay(game, 0);
  await game.useCard(0, gh, [2]);
  assert.ok(game.heroes[1].main.revealed);
  assert.ok(game.log.some((l) => l.includes('bị Vô Giải chặn')), 'Quá Hà bị chặn');
});

test('Thao Loạn: xem như Đào cứu người hấp hối', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangrang', 'hejin'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 2);
  ctrls[1].set('save', (_r, v) => {
    const s = (v as { specialSaves?: { skill: string }[] }).specialSaves?.find((x) => x.skill === 'virtual:taoluan:tao');
    return s ? { kind: 'useSkill', skill: s.skill, cardIds: [], targets: [] } : { kind: 'pass' };
  });
  game.player(2).hp = 1;
  await game.loseHp(2, 1);
  assert.ok(game.player(2).alive, 'được cứu');
  assert.equal(game.player(2).hp, 1);
  assert.ok(game.heroes[1].main.revealed, 'Trương Nhượng lật');
});

test('Thao Loạn: cuối lượt chưa lật hết tướng thì không kích hoạt (không ghi log thừa)', async () => {
  const { game, ctrls } = makeHG([['zhangrang', 'hejin'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  ctrls[0].set('choose', (r) => ({ kind: 'choice', index: (r as unknown as { options: string[] }).options.indexOf('Nam Man Nhập Xâm') }));
  enterPlay(game, 0);
  await useSkill(game, 0, 'taoluan');
  const n = game.log.length;
  await game.bus.emit('turnEnd', { seat: 0 } as never);
  assert.ok(!game.log.slice(n).some((l) => l.includes('Thao Loạn')));
});

// ---------------- Nhóm Dã tâm gia ----------------

test('Nhóm Dã tâm gia (cùng người cầm đầu) là 1 phe và được tính đại/tiểu thế lực', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng'], ['zhangjiao', 'yuanshao'], ['zhenji', 'xiahoudun']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3, 4);
  for (const s of [1, 2]) { game.heroes[s].careerist = true; game.heroes[s].careeristGroup = 1; }
  assert.ok(game.isSameFaction(1, 2), 'cùng nhóm = cùng phe');
  assert.ok(!game.isSameFaction(1, 0));
  assert.equal(game.factionSizeOf(1), 2);
  // Ngụy có 2 người (0, 4), nhóm Dã tâm gia 2 người -> cả hai là đại thế lực
  assert.ok(game.isBig(1) && game.isBig(2), 'nhóm Dã tâm gia là đại thế lực');
  assert.ok(game.isBig(0));
  assert.ok(game.isSmall(3));
  game.heroes[3].careerist = true; game.heroes[3].careeristGroup = 1;
  assert.equal(game.factionSizeOf(3), 3);
  assert.ok(game.isBig(1) && !game.isBig(0), 'nhóm 3 người là đại thế lực duy nhất');
});

// ---------------- Điệu Hổ Ly Sơn: kỹ năng vẫn tác động được ----------------

test('Điệu Hổ: người bị điệu hổ vẫn bị kỹ năng chọn (Nhân Đức giao bài), nhưng không là mục tiêu của lá bài', async () => {
  const { game, ctrls } = makeHG([['liubei', 'guanyu'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const dh = await take(game, 0, (c) => c.name === 'diaohu');
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [] }));
  enterPlay(game, 0);
  const r = await game.useCard(0, dh, [1]);
  assert.ok(r.ok, String((r as { reason?: string }).reason));
  assert.ok(game.isLured(1), 'P1 bị điệu hổ');
  // Lá bài: không chọn được
  const sha = await take(game, 0, (c) => c.name === 'sha');
  assert.equal((await game.useCard(0, sha, [1])).ok, false, 'không Sát được người bị điệu hổ');
  assert.ok(!game.targetsAs(0, 'guohe').includes(1), 'không là mục tiêu Quá Hà');
  // Kỹ năng: vẫn tác động
  assert.ok(game.canTarget(0, 1));
  const give = game.player(0).hand.find((id) => id !== sha)!;
  const n = game.player(1).hand.length;
  assert.equal(await useSkill(game, 0, 'nhanduc', [give], [1]), null);
  assert.equal(game.player(1).hand.length, n + 1, 'Nhân Đức giao bài cho người bị điệu hổ');
  // Máu không đổi
  const hp = game.player(1).hp;
  await game.loseHp(1, 1);
  assert.equal(game.player(1).hp, hp);
  // "Xem như dùng" lá bởi kỹ năng cũng không nhắm được
  const before = game.log.length;
  await game.useCardAs(0, 'sha', [1], [], { label: 'thử' });
  assert.ok(!game.log.slice(before).some((l) => l.includes('dùng Sát')), 'Sát ảo không nhắm người bị điệu hổ');
});
