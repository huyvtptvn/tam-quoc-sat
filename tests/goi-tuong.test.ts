// Test gói tướng mới (content/scripts/goi-*.mjs) và các phần engine mở rộng đi kèm.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/loader.js';
import { GENERALS } from '../src/hegemony/generals.js';
import { SKILLS } from '../src/hegemony/skills.js';
import type { Request } from '../src/core/types.js';
import { give } from './helpers.js';
import { makeHG, revealAll, stackTop, YES, onlySkill } from './hg-helpers.js';

before(async () => {
  const r = await loadContent('content');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

const chooseFirst = (req: Request) => ({ kind: 'targets' as const, targets: (req as { candidates: number[] }).candidates.slice(0, 1) });

test('gói tướng: các tướng được bật đều có đủ kỹ năng, mọi kỹ năng tồn tại', () => {
  const list = JSON.parse(readFileSync('content/generals/goi-tuong-moi.json', 'utf8')).filter((g: { id?: string }) => g.id);
  const enabled = list.filter((g: { disabled?: boolean }) => !g.disabled);
  assert.ok(enabled.length >= 70, `chỉ có ${enabled.length} tướng được bật`);
  for (const g of enabled) {
    assert.ok(GENERALS.some((x) => x.id === g.id), `${g.id} không có trong GENERALS`);
    assert.ok(g.skills.length > 0, `${g.id} chưa có kỹ năng`);
    for (const s of g.skills) assert.ok(SKILLS[s], `${g.id}: thiếu kỹ năng ${s}`);
  }
});

test('Cứ Thủ: 3 thế lực -> bốc 3 lá, dùng trang bị / bỏ 1 lá rồi bị lật úp, lượt kế tiếp bị bỏ qua', async () => {
  const { game, ctrls } = makeHG([['caoren', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('jushou'));
  const before = game.player(0).hand.length;
  await game.runTurn(0);
  assert.equal(game.player(0).faceDown, true);
  assert.ok(game.player(0).hand.length >= before + 2);
  const turnsBefore = game.log.filter((l) => l.startsWith('—— Lượt')).length;
  await game.runTurn(0);
  assert.equal(game.player(0).faceDown, false);
  assert.equal(game.log.filter((l) => l.startsWith('—— Lượt')).length, turnsBefore, 'lượt bị bỏ qua không in dòng "Lượt"');
});

test('Phóng Quyền: bỏ qua ra bài, cuối lượt bỏ 1 lá để người khác được thêm lượt', async () => {
  const { game, ctrls } = makeHG([['liushan', 'zhangfei'], ['caocao', 'xuchu']], { maxTurns: 3 });
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('confirm', onlySkill('fangquan')).set('chooseTargets', chooseFirst);
  ctrls[0].set('discard', (_r, v) => ({ kind: 'discard', cardIds: v.myHand.slice(0, (_r as { count: number }).count).map((c) => c.id) }));
  await game.run();
  assert.ok(game.log.some((l) => l.includes('P1 được thêm một lượt')), 'P1 phải được thêm lượt');
});

test('Quốc Sắc: lá Rô dùng như Lạc Bất Tư Thục, xử lý theo Lạc Bất ở giai đoạn phán định', async () => {
  const { game } = makeHG([['daqiao', 'sunquan'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  const [d] = await give(game, 0, 'shan');
  const id = game.card(d).suit === 'diamond' ? d : (await (async () => {
    const x = game.state.drawPile.find((i) => game.card(i).suit === 'diamond' && game.card(i).type !== 'equip')!;
    await game.moveCards([x], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
    return x;
  })());
  game.state.phase = 'play';
  const r = await game.useCard(0, id, [1], 'lebu');
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  assert.ok(game.player(1).judgeArea.includes(id));
  assert.equal(game.delayedName(id), 'lebu');
  assert.equal(game.makeView(1).players[1].judgeArea[0].name, 'lebu');
  stackTop(game, (c) => c.suit === 'spade');
  await game.runTurn(1);
  assert.ok(game.log.some((l) => l.includes('Lạc Bất Tư Thục có hiệu lực')));
  assert.equal(game.player(1).judgeArea.length, 0);
});

test('Họa Thủ: Nam Man không có hiệu lực với Mạnh Hoạch, và Mạnh Hoạch thành nguồn sát thương', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['menghuo', 'zhangfei'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  game.player(2).hand.length = 0;
  for (const s of [1, 2]) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
  const [nm] = await give(game, 0, 'nanman');
  game.state.phase = 'play';
  const hp1 = game.player(1).hp;
  let sourceOf2: number | null = -1;
  game.bus.on('damageDealt', (c) => { if (c.target === 2) sourceOf2 = c.source; });
  await game.useCard(0, nm, []);
  assert.equal(game.player(1).hp, hp1, 'Mạnh Hoạch không mất máu');
  assert.equal(sourceOf2, 1, 'nguồn sát thương lên P2 là Mạnh Hoạch');
});

test('Bát Trận: không lắp giáp thì coi như có Bát Quái Trận', async () => {
  const { game } = makeHG([['wolong', 'zhugeliang'], ['caocao', 'xuchu']]);
  await game.setup();
  assert.equal(game.armorOf(0), null, 'chưa lật tướng thì chưa có');
  await revealAll(game, 0);
  assert.equal(game.armorOf(0), 'bagua');
});

test('Tiềm Tập: bốc 1, bỏ 1 lá; người bị chọn không thể dùng bài cùng màu lá đã bỏ trong lượt', async () => {
  const { game, ctrls } = makeHG([['madai', 'zhangfei'], ['caocao', 'xuchu']]);
  await game.setup();
  await revealAll(game, 0);
  const [heart] = await give(game, 0, 'tao');
  ctrls[0].set('confirm', onlySkill('qianxi')).set('chooseTargets', chooseFirst)
    .set('chooseCards', () => ({ kind: 'cards', cardIds: [heart] }));
  let blocked = false;
  game.bus.on('phaseStart', ({ phase }) => {
    if (phase !== 'draw') return;
    const red = game.player(1).hand.map((i) => game.card(i)).find((c) => c.suit === 'heart' || c.suit === 'diamond');
    if (red) blocked = game.cardBlocked(1, red);
    else blocked = !!game.player(1).flags.turn_banRed;
  });
  await game.runTurn(0);
  assert.equal(blocked, true);
  assert.equal(game.player(1).flags.turn_banRed, undefined, 'hết lượt thì hết cấm');
});

test('Tồn Tự: loại bỏ My phu nhân, người được chọn nhận Dũng Quyết và bốc 2 lá', async () => {
  const { game } = makeHG([['mifuren', 'liubei'], ['zhangfei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.state.phase = 'play';
  const n = game.player(1).hand.length;
  // Gọi thẳng hành động dùng kỹ năng
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'cunsi', cardIds: [], targets: [1] });
  assert.equal(err, null);
  assert.equal(game.hero(0).main.removed, true);
  assert.ok(game.grantedSkills(1).includes('yongjue'));
  assert.equal(game.player(1).hand.length, n + 2);
  assert.ok(!game.skillEntries(0).some((e) => e.skill.id === 'cunsi'), 'tướng bị loại thì mất kỹ năng');
  assert.equal(game.makeView(2 > 1 ? 1 : 0).players[0].generals!.main.removed, true);
});

test('Lưu Ly: Đại Kiều bỏ 1 lá chuyển Sát sang người khác trong tầm đánh', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['daqiao', 'sunquan'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  for (const s of [1, 2]) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
  await give(game, 1, 'tao');
  ctrls[1].set('confirm', onlySkill('liuli')).set('chooseTargets', () => ({ kind: 'targets', targets: [2] }))
    .set('chooseCards', (r) => ({ kind: 'cards', cardIds: (r as { cardIds: number[] }).cardIds.slice(0, 1) }));
  const [s] = await give(game, 0, 'sha');
  game.state.phase = 'play';
  const hp1 = game.player(1).hp, hp2 = game.player(2).hp;
  await game.useCard(0, s, [1]);
  assert.equal(game.player(1).hp, hp1);
  assert.equal(game.player(2).hp, hp2 - 1);
  assert.equal(game.player(1).hand.length, 0, 'đã bỏ 1 lá');
});

test('Thiên Hương: bỏ 1 lá Cơ chặn sát thương; mục mặc định: người được chọn mất 1 máu và nhận lá vừa bỏ', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['xiaoqiao', 'sunquan'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  const heart = game.state.drawPile.find((i) => game.card(i).suit === 'heart')!;
  await game.moveCards([heart], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  ctrls[1].set('confirm', onlySkill('tianxiang')).set('chooseTargets', () => ({ kind: 'targets', targets: [2] }))
    .set('chooseCards', (r) => ({ kind: 'cards', cardIds: [heart].filter((x) => (r as { cardIds: number[] }).cardIds.includes(x)) }));
  const hp1 = game.player(1).hp, hp2 = game.player(2).hp, h2 = game.player(2).hand.length;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).hp, hp1);
  assert.equal(game.player(2).hp, hp2 - 1);
  assert.equal(game.player(2).hand.length, h2 + 1);
});

test('Thần Tốc: bỏ qua phán định + bốc bài, coi như dùng Sát (lá ảo) gây sát thương', async () => {
  const { game, ctrls } = makeHG([['xiahouyuan', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  await game.moveCards([...game.player(1).hand], { kind: 'hand', seat: 1 }, { kind: 'discard' }, 'test');
  let asked = 0;
  ctrls[0].set('confirm', (r) => ((r as { skill: string }).skill === 'shensu' && asked++ === 0 ? { kind: 'yes' } : { kind: 'no' }))
    .set('chooseTargets', chooseFirst);
  const hand0 = game.player(0).hand.length;
  const hp1 = game.player(1).hp;
  await game.runTurn(0);
  assert.equal(game.player(1).hp, hp1 - 1);
  assert.ok(game.player(0).hand.length <= hand0, 'không bốc bài');
  assert.ok(game.log.some((l) => l.includes('(Thần Tốc)')));
  assert.equal(game.totalCards(), game.cards.size);
});

test('Đoạn Trường: khi chết, người giết mất kỹ năng của một tướng', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['caiwenji', 'lvbu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  for (const s of [0, 1]) await game.moveCards([...game.player(s).hand], { kind: 'hand', seat: s }, { kind: 'discard' }, 'test');
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 0 }));
  game.player(1).hp = 1;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false }).catch(() => {});
  assert.equal(game.player(1).alive, false);
  assert.equal(game.hero(0).main.noSkills, true);
  assert.ok(!game.skillEntries(0).some((e) => e.skill.id === 'gianhung'));
});

test('Kỳ Sách: dùng toàn bộ bài trên tay như Vô Trung Sinh Hữu', async () => {
  const { game, ctrls } = makeHG([['xunyou', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  ctrls[0].set('choose', (r) => ({ kind: 'choice', index: (r as { options: string[] }).options.indexOf('Vô Trung Sinh Hữu') }));
  game.state.phase = 'play';
  const before = game.player(0).hand.length;
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'qice', cardIds: [], targets: [] });
  assert.equal(err, null);
  assert.ok(before >= 1);
  assert.equal(game.player(0).hand.length, 2, 'bỏ hết bài trên tay, bốc 2 lá');
  assert.equal(game.totalCards(), game.cards.size);
});

test('Hành Thương: nhận toàn bộ bài của người vừa chết', async () => {
  const { game, ctrls } = makeHG([['caopi', 'xuchu'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await revealAll(game, 0, 1, 2);
  ctrls[0].set('confirm', onlySkill('xingshang'));
  const n1 = game.player(1).hand.length;
  const n0 = game.player(0).hand.length;
  game.player(1).hp = 1;
  await game.damage({ source: 2, target: 1, amount: 1, card: null, cancelled: false });
  assert.equal(game.player(1).alive, false);
  assert.equal(game.player(0).hand.length, n0 + n1);
});

test('Tuần Tuần: đầu giai đoạn bốc bài xem 4 lá (gửi kèm mặt bài), đặt 2 lá lên đầu, 2 lá xuống đáy rồi bốc bình thường', async () => {
  const { game, ctrls } = makeHG([['lidian', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0);
  const top4 = game.state.drawPile.slice(-4).reverse();
  let shown: unknown[] = [];
  ctrls[0].set('confirm', onlySkill('xunxun')).set('chooseCards', (r) => {
    shown = (r as { cards?: unknown[] }).cards ?? [];
    return { kind: 'cards', cardIds: top4.slice(2, 4) };
  });
  game.state.currentSeat = 0;
  game.state.phase = 'draw';
  await game.bus.emit('phaseStart', { seat: 0, phase: 'draw' });
  assert.equal(shown.length, 4, 'người chọn thấy mặt 4 lá');
  assert.deepEqual(game.state.drawPile.slice(-2).sort(), top4.slice(2, 4).sort(), 'hai lá được chọn nằm trên cùng');
  assert.deepEqual(game.state.drawPile.slice(0, 2).sort(), top4.slice(0, 2).sort(), 'hai lá còn lại nằm dưới đáy');
  await (game as unknown as { runPhase: (s: number, p: string) => Promise<void> }).runPhase(0, 'draw');
  assert.ok(top4.slice(2, 4).every((id) => game.player(0).hand.includes(id)));
});

test('mô phỏng nhanh 30 ván 8 người với toàn bộ tướng: không lỗi, không mất lá', async () => {
  const { HegemonyGame } = await import('../src/hegemony/game.js');
  const { HegemonyBot } = await import('../src/hegemony/bot.js');
  for (let seed = 1; seed <= 30; seed++) {
    const game = new HegemonyGame(Array.from({ length: 8 }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })),
      { seed, maxTurns: 400, candidates: 7 });
    let bad = 0;
    game.bus.on('cardsMoved', () => { if (game.totalCards() !== game.cards.size) bad++; });
    await game.run();
    assert.equal(bad, 0, `seed ${seed}: mất/nhân bản lá`);
  }
});

void YES;

test('Cuồng Phủ: sau khi Sát chọn mục tiêu, thu lấy trang bị (Mộc Ngưu Lưu Mã về tay, bài bên dưới vào chồng bỏ); Sát không gây sát thương thì bỏ 2 lá', async () => {
  const { muniuPile } = await import('../src/hegemony/treasures.js');
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  await revealAll(game, 0, 1);
  game.grantSkill(0, 'kuangfu');
  const [ox] = await give(game, 1, 'muniu');
  await game.equip(1, game.card(ox));
  game.state.currentSeat = 1;
  game.state.phase = 'play';
  const [t] = await give(game, 1, 'tao');
  await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(1, { kind: 'useSkill', skill: 'muniu', cardIds: [t], targets: [] });
  game.state.currentSeat = 0;
  ctrls[0].set('confirm', YES).set('choose', () => ({ kind: 'choice', index: 0 }));
  ctrls[1].set('respond', (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' }));
  await give(game, 1, 'shan');
  const [s] = await give(game, 0, 'sha');
  await give(game, 0, 'tao', 'tao');
  const before = game.player(0).hand.length;
  await game.useCard(0, s, [1]);
  assert.ok(game.state.discardPile.includes(t), 'bài dưới Mộc Ngưu vào chồng bỏ');
  assert.deepEqual(muniuPile(game, 1), []);
  assert.equal(game.equipOf(1, 'treasure'), null);
  // Sát bị né: bỏ 2 lá trên tay -> lá Mộc Ngưu vừa thu (đã vào tay) cũng có thể bị bỏ; tổng số lá trên tay giảm đúng 1 (−Sát +Mộc Ngưu −2)
  assert.equal(game.player(0).hand.length, before - 1 + 1 - 2);
});
