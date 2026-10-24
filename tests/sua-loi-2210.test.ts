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

// ---------------- 23/10: vũ khí phát động sau khi chốt mục tiêu; Mễ Đạo đặt cả trang bị ----------------

test('Thư Hùng phát động sau khi Lưu Ly chuyển mục tiêu: không hỏi với Đại Kiều, xét người nhận mới', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['daqiao', 'sunquan'], ['liubei', 'guanyu'], ['sunjian', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2, 3);
  const w = game.state.drawPile.find((i) => game.card(i).name === 'cixiong')!;
  await game.moveCards([w], { kind: 'draw' }, { kind: 'equip', seat: 0, slot: 'weapon' }, 'test');
  const asked: string[] = [];
  ctrls[0].set('confirm', (r) => { asked.push((r as { skill: string }).skill); return { kind: 'yes' }; });
  ctrls[1].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'liuli' ? 'yes' : 'no' }))
    .set('chooseTargets', (r) => ({ kind: 'targets', targets: [(r as unknown as { candidates: number[] }).candidates[0]] }))
    .set('chooseCards', (r) => ({ kind: 'cards', cardIds: [(r as unknown as { cardIds: number[] }).cardIds[0]] }));
  const sha = await take(game, 0, (c) => c.name === 'sha' && !c.nature);
  enterPlay(game, 0);
  assert.ok(game.targetsAs(0, 'sha').includes(1), 'Đại Kiều trong tầm');
  await game.useCard(0, sha, [1]);
  assert.ok(game.log.some((l) => l.includes('Sát được chuyển sang')), 'Lưu Ly đã chuyển');
  assert.ok(!game.log.some((l) => l.includes('dùng Thư Hùng Song Cổ Kiếm')), 'không dùng Thư Hùng lên Đại Kiều (nam -> nam sau khi chuyển)');
  assert.ok(!asked.includes('cixiong'));
});

test('Mễ Đạo (Trương Lỗ): được chọn cả bài trên tay lẫn trang bị để đặt làm [Mễ]', async () => {
  const { game, ctrls } = makeHG([['caocao', 'zhanglu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const eq = game.state.drawPile.find((i) => CARD_INFO[game.card(i).name].slot === 'armor')!;
  await game.moveCards([eq], { kind: 'draw' }, { kind: 'equip', seat: 0, slot: 'armor' }, 'test');
  let offered: number[] = [];
  ctrls[0].set('confirm', () => ({ kind: 'yes' }))
    .set('chooseCards', (r) => { offered = (r as unknown as { cardIds: number[] }).cardIds; return { kind: 'cards', cardIds: [eq, game.player(0).hand[0]] }; });
  game.state.currentSeat = 0;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'end' });
  assert.ok(offered.includes(eq), 'trang bị nằm trong danh sách chọn');
  assert.ok(!game.player(0).equips.armor.includes(eq), 'trang bị đã thành [Mễ]');
  assert.ok(game.player(0).special.includes(eq));
});

test('Chế Hành (Tôn Quyền) và Định Lan Dạ Minh Châu: bỏ được cả trang bị', async () => {
  const { game } = makeHG([['sunquan', 'zhoutai'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  const w = game.state.drawPile.find((i) => CARD_INFO[game.card(i).name].slot === 'weapon')!;
  await game.moveCards([w], { kind: 'draw' }, { kind: 'equip', seat: 0, slot: 'weapon' }, 'test');
  enterPlay(game, 0);
  const hint = (game as unknown as { skillHints: (s: number) => { skill: string; validCards?: number[] }[] }).skillHints(0).find((h) => h.skill === 'chehoanh');
  assert.ok(hint?.validCards?.includes(w), 'gợi ý cho chọn trang bị');
  const h0 = game.player(0).hand[0];
  const n = game.cardCount(0);
  assert.equal(await useSkill(game, 0, 'chehoanh', [w, h0]), null);
  assert.equal(game.player(0).equips.weapon.length, 0, 'vũ khí đã bỏ');
  assert.equal(game.cardCount(0), n, 'bỏ 2 rút 2');
  // Minh Châu (tướng không có Chế Hành)
  const { game: g2 } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await g2.setup();
  const mz = g2.state.drawPile.find((i) => g2.card(i).name === 'mingzhu');
  assert.ok(mz !== undefined, 'bộ bài có Minh Châu');
  await g2.moveCards([mz], { kind: 'draw' }, { kind: 'equip', seat: 0, slot: 'treasure' }, 'test');
  const w2 = g2.state.drawPile.find((i) => CARD_INFO[g2.card(i).name].slot === 'armor')!;
  await g2.moveCards([w2], { kind: 'draw' }, { kind: 'equip', seat: 0, slot: 'armor' }, 'test');
  enterPlay(g2, 0);
  assert.equal(await useSkill(g2, 0, 'mingzhu', [w2]), null);
  assert.equal(g2.player(0).equips.armor.length, 0);
});

// ---------------- 23/10 tối ----------------

test('Chế Man (Mã Tắc): chỉ chặn sát thương khi mục tiêu có trang bị hoặc lá phán xét', async () => {
  const { game, ctrls } = makeHG([['masu', 'liubei'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const asked: string[] = [];
  ctrls[0].set('confirm', (r) => { asked.push((r as { skill: string }).skill); return { kind: 'no' }; });
  for (const sl of ['weapon', 'armor', 'defHorse', 'offHorse', 'treasure'] as const) game.player(1).equips[sl] = [];
  game.player(1).judgeArea = [];
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.ok(!asked.includes('zhiman'), 'không có trang bị / phán xét: không hỏi Chế Man');
  const w = game.state.drawPile.find((i) => CARD_INFO[game.card(i).name].slot === 'weapon')!;
  await game.moveCards([w], { kind: 'draw' }, { kind: 'equip', seat: 1, slot: 'weapon' }, 'test');
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.ok(asked.includes('zhiman'), 'có trang bị: được hỏi');
});

test('Trúc Khoa (Lý Nghiêm chủ tướng): chọn lại được mọi quân lệnh, kể cả do người khác ra', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liyan', 'liubei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 1);
  const prompts: string[] = [];
  ctrls[1].set('choose', (r) => {
    const x = r as unknown as { prompt: string; options: string[] };
    prompts.push(x.prompt);
    if (x.prompt.startsWith('Trúc Khoa: chọn lại')) return { kind: 'choice', index: 1 };
    if (x.prompt.startsWith('Trúc Khoa: chọn 1 trong 2')) { drawn = x.options; return { kind: 'choice', index: 0 }; }
    return { kind: 'choice', index: 0 };
  });
  let drawn: string[] = [];
  const hp = game.player(1).hp;
  const ok = await game.askOrder(0, 1, 2); // Quân lệnh 3: mất 1 máu
  assert.equal(ok, true);
  assert.ok(prompts.some((p) => p.startsWith('Trúc Khoa')), 'được hỏi chọn lại');
  assert.equal(drawn.length, 2, 'rút 2 quân lệnh để chọn 1');
  assert.ok(game.log.some((l) => l.includes('rút lại 2 quân lệnh và chọn: ' + drawn[0])));
  void hp;
});

test('Độc Tửu (Hà Thái Hậu): lượt người khác -> họ xem như dùng Tửu rồi chịu 1 sát thương; lượt mình -> chỉ dùng Tửu', async () => {
  const { game, ctrls } = makeHG([['hetaihou', 'lvbu'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  const prompts: string[] = [];
  ctrls[0].set('confirm', (r) => { const x = r as { skill: string; prompt: string }; if (x.skill === 'zhendu') prompts.push(x.prompt); return { kind: x.skill === 'zhendu' ? 'yes' : 'no' }; });
  enterPlay(game, 1);
  const hp = game.player(1).hp;
  await game.bus.emit('phaseStart', { seat: 1, phase: 'play' });
  assert.equal(game.player(1).flags.jiuBuff, 1, 'P1 xem như dùng Tửu');
  assert.equal(game.player(1).hp, hp - 1, 'P1 chịu 1 sát thương');
  assert.ok(prompts[0]?.includes(game.player(1).name), 'câu hỏi nêu tên người đang có lượt');
  enterPlay(game, 0);
  const hp0 = game.player(0).hp;
  await game.bus.emit('phaseStart', { seat: 0, phase: 'play' });
  assert.equal(game.player(0).flags.jiuBuff, 1);
  assert.equal(game.player(0).hp, hp0, 'lượt mình: không tự gây sát thương');
});

test('Thích Loạn: rút X (số người trận vong lượt này) + 2 cho mỗi người do mình giết', async () => {
  const { game, ctrls } = makeHG([['hetaihou', 'lvbu'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng'], ['liubei', 'guanyu'], ['zhangjiao', 'yuanshao']]);
  await game.setup();
  ctrls[0].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'qiluan' ? 'yes' : 'no' }));
  game.state.currentSeat = 1;
  await game.bus.emit('death', { seat: 2, killer: 0 } as never);
  await game.bus.emit('death', { seat: 3, killer: 1 } as never);
  const n = game.player(0).hand.length;
  await game.bus.emit('turnEnd', { seat: 1 } as never);
  assert.equal(game.player(0).hand.length, n + 2 + 2, '2 người chết + 2 (1 người do mình giết)');
});

test('Bi Ca: câu hỏi kích hoạt nêu rõ ai phán xét', async () => {
  const { game, ctrls } = makeHG([['caiwenji', 'diaochan'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  let prompt = '';
  ctrls[0].set('confirm', (r) => { const x = r as { skill: string; prompt: string }; if (x.skill === 'beige') prompt = x.prompt; return { kind: 'no' }; });
  const sha = game.state.drawPile.find((i) => game.card(i).name === 'sha')!;
  await game.damage({ source: 2, target: 1, amount: 1, card: game.card(sha), cardAs: 'sha', cancelled: false } as never);
  assert.ok(prompt.includes(game.player(1).name) && prompt.includes(game.player(2).name), prompt);
});

test('Dịch Quỷ (Tả Từ): bỏ 1 [Hồn] bất kỳ để xem như dùng Thiểm', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['new_zuoci', 'lvbu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0);
  await game.reveal(1, 'main');
  const huns = game.generalPile(1, 'Hồn');
  assert.ok(huns.length >= 1, 'đã nhận Hồn');
  for (const id of [...game.player(1).hand]) await game.moveCards([id], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  ctrls[1].set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'yigui' ? 'yes' : 'no' })).set('choose', () => ({ kind: 'choice', index: 0 }));
  const s = await take(game, 0, (c) => c.name === 'sha' && !c.nature);
  const hp = game.player(1).hp;
  enterPlay(game, 0);
  assert.ok(game.targetsAs(0, 'sha').includes(1));
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hp, hp, 'né được bằng Hồn');
  assert.equal(game.generalPile(1, 'Hồn').length, huns.length - 1, 'đã bỏ 1 Hồn');
});

test('Cận Hãm (Bành Dạng) lật cả 2 tướng đầu lượt: người xung quanh bị tác động trước, Bành Dạng úp tướng sau cùng', async () => {
  const { game, ctrls } = makeHG([['liubei', 'pengyang'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 1);
  ctrls[0].set('reveal', () => ({ kind: 'reveal', main: true, deputy: true }))
    .set('choose', (r) => { const o = (r as unknown as { options: string[] }).options; return { kind: 'choice', index: Math.max(0, o.indexOf('Bành Dạng')) }; });
  const h2 = game.player(2).hand.length;
  await (game as unknown as { askRevealAtTurnStart: (s: number) => Promise<void> }).askRevealAtTurnStart(0);
  assert.ok(!(game.heroes[1].main.revealed && game.heroes[1].deputy.revealed), 'P1 (lật hết tướng) bị úp 1 tướng');
  assert.equal(game.player(2).hand.length, h2 - 2, 'P2 (có tướng úp) bỏ 2 lá');
  assert.equal(game.heroes[0].deputy.revealed, false, 'Bành Dạng úp lại');
  const log = game.log.join('\n');
  assert.ok(log.indexOf('P0 úp lại phó tướng Bành Dạng') > log.indexOf('P2 bỏ'), 'Bành Dạng úp sau cùng');
});

test('Dịch Quỷ: Hồn 2 thế lực được hỏi chọn thế lực; người chưa lật tướng luôn là mục tiêu hợp lệ', async () => {
  const { game, ctrls } = makeHG([['new_zuoci', 'lvbu'], ['liubei', 'guanyu'], ['yuanshao', 'yanliangwenchou'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 1, 2);
  await game.reveal(0, 'main');
  for (const id of game.generalPile(0, 'Hồn')) game.removeFromGeneralPile(0, 'Hồn', [id]);
  game.addGeneralPile(0, 'Hồn', ['pengyang']); // Thục/Quần
  let kdPrompt: string[] = [];
  let targets: number[] = [];
  ctrls[0].set('choose', (r) => {
    const x = r as unknown as { prompt: string; options: string[] };
    if (x.prompt.includes('lá nào')) return { kind: 'choice', index: Math.max(0, x.options.indexOf('Quá Hà Sách Kiều')) };
    if (x.prompt.includes('thế lực nào')) { kdPrompt = x.options; return { kind: 'choice', index: x.options.findIndex((o) => o.startsWith('Quần')) }; }
    return { kind: 'choice', index: 0 };
  }).set('chooseTargets', (r) => { targets = (r as unknown as { candidates: number[] }).candidates; return { kind: 'targets', targets: [targets[0]] }; });
  enterPlay(game, 0);
  assert.equal(await useSkill(game, 0, 'yigui'), null);
  assert.equal(kdPrompt.length, 2, `hỏi chọn Thục hoặc Quần: ${kdPrompt.join(' | ')}`);
  assert.ok(targets.includes(2), 'chọn Quần: được nhắm người Quần');
  assert.ok(targets.includes(3), 'người chưa xác định thế lực luôn hợp lệ');
  assert.ok(!targets.includes(1), 'không nhắm người Thục khi đã chọn Quần');
});

test('Dịch Quỷ: lá lên bản thân (Hiệp Thiên Tử, Vô Trung...) cần Hồn cùng thế lực với Tả Từ; Dã tâm gia chỉ dùng Hồn Dã tâm', async () => {
  const { game, ctrls } = makeHG([['new_zuoci', 'lvbu'], ['yuanshao', 'yanliangwenchou'], ['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  for (const id of game.generalPile(0, 'Hồn')) game.removeFromGeneralPile(0, 'Hồn', [id]);
  game.addGeneralPile(0, 'Hồn', ['caiyong', 'zhaoyun']); // Quần, Thục
  let opts: string[] = []; let huns: string[] = [];
  ctrls[0].set('choose', (r) => {
    const x = r as unknown as { prompt: string; options: string[] };
    if (x.prompt.includes('lá nào')) { opts = x.options; return { kind: 'choice', index: Math.max(0, x.options.indexOf('Hiệp Thiên Tử Dĩ Lệnh Chư Hầu')) }; }
    if (x.prompt.includes('bỏ 1 [Hồn]')) { huns = x.options; return { kind: 'choice', index: 0 }; }
    return { kind: 'choice', index: 0 };
  });
  enterPlay(game, 0);
  assert.ok(game.isBig(0), 'Quần 2 người là đại thế lực (Hiệp Thiên Tử cần đại thế lực)');
  assert.equal(await useSkill(game, 0, 'yigui'), null);
  assert.ok(opts.includes('Hiệp Thiên Tử Dĩ Lệnh Chư Hầu'), opts.join(','));
  assert.ok(game.log.some((l) => l.includes('Hiệp Thiên Tử') && l.includes('Dịch Quỷ')), 'đã dùng Hiệp Thiên Tử');
  assert.ok(game.generalPile(0, 'Hồn').includes('zhaoyun') && !game.generalPile(0, 'Hồn').includes('caiyong'), 'bỏ Hồn Quần (cùng thế lực), giữ Hồn Thục');
  void huns;
  // Dã tâm gia: chỉ Hồn Dã tâm dùng lên bản thân
  game.heroes[0].careerist = true; game.heroes[0].careeristGroup = 0;
  const combos = (h: string[]) => { for (const id of game.generalPile(0, 'Hồn')) game.removeFromGeneralPile(0, 'Hồn', [id]); game.addGeneralPile(0, 'Hồn', h); };
  combos(['caiyong']);
  game.player(0).hp = game.player(0).maxHp - 1;
  const hint = () => (game as unknown as { skillHints: (s: number) => { skill: string }[] }).skillHints(0);
  opts = [];
  ctrls[0].set('choose', (r) => { const x = r as unknown as { prompt: string; options: string[] }; if (x.prompt.includes('lá nào')) opts = x.options; return { kind: 'choice', index: 0 }; })
    .set('chooseTargets', () => ({ kind: 'targets', targets: [] }));
  game.player(0).flags = {};
  if (hint().some((h) => h.skill === 'yigui')) await useSkill(game, 0, 'yigui');
  assert.ok(!opts.includes('Đào') && !opts.includes('Vô Trung Sinh Hữu'), `Hồn Quần không dùng lên Dã tâm gia: ${opts.join(',')}`);
  combos(['zhonghui']); // tướng Dã tâm gia
  opts = [];
  if (hint().some((h) => h.skill === 'yigui')) await useSkill(game, 0, 'yigui');
  assert.ok(opts.includes('Đào'), `Hồn Dã tâm dùng Đào lên bản thân: ${opts.join(',')}`);
});

test('Vạn Tiễn / Nam Man vẫn dùng được khi có người bị Điệu Hổ (người đó chỉ bị bỏ qua)', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng'], ['zhangjiao', 'yuanshao']]);
  await game.setup();
  await revealAll(game, 0);
  game.player(2).flags.turn_lured = 1;
  const w = await take(game, 0, (c) => c.name === 'wanjian');
  enterPlay(game, 0);
  const hp2 = game.player(2).hp;
  const r = await game.useCard(0, w, []);
  assert.ok(r.ok, String((r as { reason?: string }).reason));
  assert.equal(game.player(2).hp, hp2, 'người bị Điệu Hổ không bị ảnh hưởng');
});

test('Hồng Nhan: lá Bích của Tiểu Kiều (trên tay, phán định) xem như Cơ; người khác thì không', async () => {
  const { game } = makeHG([['xiaoqiao', 'zhouyu'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  const sp = await take(game, 0, (c) => c.suit === 'spade');
  assert.equal(game.card(sp).suit, 'heart', 'lá Bích trên tay Tiểu Kiều xem như Cơ');
  assert.ok(isRed(game.card(sp)));
  await game.moveCards([sp], { kind: 'hand', seat: 0 }, { kind: 'hand', seat: 1 }, 'test');
  assert.equal(game.card(sp).suit, 'spade', 'sang tay người khác lại là Bích');
  // Kết quả phán định Bích của Tiểu Kiều xem như Cơ (Lạc Bất không trúng, Bát Quái đỏ)
  const top = game.state.drawPile.findIndex((i) => game.card(i).suit === 'spade');
  const [id] = game.state.drawPile.splice(top, 1);
  game.state.drawPile.push(id);
  const j = await game.judge(0, 'test');
  assert.equal(j.id, id);
  assert.equal(j.suit, 'heart');
  await game.finishJudge(j);
  assert.equal(game.card(id).suit, 'spade', 'vào chồng bỏ thì trở lại Bích');
  const top2 = game.state.drawPile.findIndex((i) => game.card(i).suit === 'spade');
  const [id2] = game.state.drawPile.splice(top2, 1);
  game.state.drawPile.push(id2);
  const j2 = await game.judge(1, 'test');
  assert.equal(j2.suit, 'spade', 'phán định của người khác không đổi');
  await game.finishJudge(j2);
});

test('Hồng Nhan: Tiểu Kiều chưa lật tướng thì lá Bích vẫn là Bích', async () => {
  const { game } = makeHG([['xiaoqiao', 'zhouyu'], ['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  const sp = await take(game, 0, (c) => c.suit === 'spade');
  assert.equal(game.card(sp).suit, 'spade');
});

async function hanbingSetup(pair: [string, string], nHand: number) {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], pair, ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1);
  if (game.player(1).hand.length) await game.moveCards([...game.player(1).hand], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  const hb = await take(game, 0, (c) => c.name === 'hanbing');
  enterPlay(game, 0);
  await game.useCard(0, hb, []);
  const horse = await take(game, 1, (c) => c.name === 'dilu');
  await game.moveCards([horse], { kind: 'hand', seat: 1 }, { kind: 'equip', seat: 1, slot: 'defHorse' }, 'test');
  for (let i = 0; i < nHand; i++) await take(game, 1, (c) => c.name === 'tao');
  const sha = await take(game, 0, (c) => c.name === 'sha');
  ctrls[0].set('confirm', () => ({ kind: 'yes' })).set('choose', (r) => ({ kind: 'choice', index: (r as unknown as { options: string[] }).options.length - 1 }));
  ctrls[1].set('respond', () => ({ kind: 'pass' })).set('confirm', () => ({ kind: 'yes' }));
  return { game, sha };
}

test('Hàn Băng Kiếm: bỏ 2 lá trên tay cùng lúc, Thủ Thành của đồng minh chỉ kích 1 lần', async () => {
  const { game, sha } = await hanbingSetup(['jiangwanfeiyi', 'guanyu'], 2);
  await game.useCard(0, sha, [1]);
  assert.equal(game.player(1).equips.defHorse.length, 1, 'chọn 2 lá trên tay, ngựa còn');
  assert.equal(game.player(1).hand.length, 1, 'Thủ Thành chỉ rút 1 lá');
});

test('Hàn Băng Kiếm đã hủy sát thương thì Thiên Hương (Tiểu Kiều) không kích nữa', async () => {
  const { game, sha } = await hanbingSetup(['xiaoqiao', 'lvmeng'], 2);
  const hp0 = game.player(0).hp;
  await game.useCard(0, sha, [1]);
  assert.equal(game.cardCount(1), 1, 'chỉ mất 2 lá do Hàn Băng');
  assert.equal(game.player(0).hp, hp0);
});
