// Test ngôn ngữ kỹ năng JSON và bộ nạp nội dung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARD_INFO, isRed } from '../src/core/cards.js';
import { compileExpr, evalBool, evalNum } from '../src/content/expr.js';
import { loadContent, prepareContent } from '../src/content/loader.js';
import { getGeneral, GENERALS } from '../src/hegemony/generals.js';
import { SKILLS } from '../src/hegemony/skills.js';
import { enterPlay, give } from './helpers.js';
import { FIRST_OPTION, isBlack, makeHG, onlySkill, revealAll, sha, stackTop, YES } from './hg-helpers.js';
import type { Response } from '../src/core/types.js';

/** Tạo thư mục nội dung tạm từ các file cho trước. */
function contentDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tqs-c-'));
  for (const [rel, data] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data));
  }
  return dir;
}

const playSteps = (steps: Response[]) => () => steps.shift() ?? ({ kind: 'endPlay' } as Response);

// ============================================================ Biểu thức

test('biểu thức: số học, so sánh, logic, thuộc tính, hàm', () => {
  const env = {
    vars: { self: 0, target: 0, amount: 2, card: { color: 'red' } },
    player: (_s: number, p: string) => (p === 'hp' ? 2 : p === 'lostHp' ? 3 : null),
    call: (f: string, a: unknown[]) => (f === 'min' ? Math.min(...(a as number[])) : null),
  };
  assert.equal(evalBool(compileExpr('target == self and self.hp <= 2'), env as never), true);
  assert.equal(evalNum(compileExpr('min(2, self.lostHp) * amount + 1'), env as never), 5);
  assert.equal(evalBool(compileExpr("card.color == 'red' && not (amount > 5)"), env as never), true);
  assert.equal(evalNum(compileExpr('7 / 2'), env as never), 3, 'chia lấy phần nguyên');
  assert.equal(evalNum(compileExpr('self.lostHp > 0 ? 2 : 0'), env as never), 2, 'toán tử 3 ngôi');
  assert.equal(evalNum(compileExpr('amount > 5 ? 1 : amount > 1 ? 7 : 0'), env as never), 7, '3 ngôi lồng nhau');
  assert.throws(() => compileExpr('self.hp <= '));
  assert.throws(() => compileExpr('eval(1)'), /Hàm không tồn tại/);
});

// ============================================================ Kỹ năng mẫu trong ván thật

test('nội dung mẫu nạp được, không lỗi', async () => {
  const r = await loadContent('content');
  assert.deepEqual(r.errors, []);
  assert.ok(r.applied!.skills.includes('phan_hoi'));
  assert.ok(GENERALS.some((g) => g.id === 'chen_gong'));
  assert.equal(getGeneral('xuchu').halfHp, 5, 'chỉnh tướng có sẵn');
});

test('Phản Hồi (kích hoạt): chịu sát thương thì bốc số lá bằng số sát thương', async () => {
  await loadContent('content');
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['taishi_ci', 'sunquan']]);
  ctrls[1].set('confirm', onlySkill('phan_hoi'));
  await game.damage({ source: 0, target: 1, amount: 2, card: null, cancelled: false });
  assert.equal(game.player(1).hand.length, 2);
  assert.equal(game.hero(1).main.revealed, true, 'dùng kỹ năng của tướng úp thì lật tướng');
});

test('Kiên Thủ (sửa sự kiện, tỏa định): ít máu thì sát thương lớn hơn 1 giảm 1', async () => {
  await loadContent('content');
  const { game } = makeHG([['caocao', 'xuchu'], ['taishi_ci', 'sunquan']]);
  await game.reveal(1, 'main');
  game.player(1).hp = 2;
  await game.damage({ source: 0, target: 1, amount: 2, card: null, cancelled: false });
  assert.equal(game.player(1).hp, 1);
});

test('Độc Kế (phán định + lựa chọn + giới hạn mỗi lượt)', async () => {
  await loadContent('content');
  const { game, ctrls } = makeHG([['chen_gong', 'lvbu'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', onlySkill('doc_ke'));
  ctrls[1].set('choose', () => ({ kind: 'choice', index: 1 })); // chọn mất 1 máu
  await give(game, 1, 'tao');
  const [s1, s2] = await give(game, 0, 'sha', 'sha');
  stackTop(game, isBlack);
  game.bus.on('slashTargeted', (ctx) => { ctx.noDodge = true; });
  enterPlay(game, 0);
  game.player(0).flags = {};
  await game.useCard(0, s1, [1]);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 2, 'Sát 1 + mất 1 máu');
  // Lượt này đã dùng: Sát thứ hai (bỏ giới hạn Sát) không kích hoạt nữa
  game.player(0).flags = {};
  stackTop(game, isBlack);
  await game.useCard(0, s2, [1]);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 3);
});

test('Trần Tình (chủ động): bỏ 1 lá đỏ gây sát thương; lá đen bị từ chối; mỗi lượt 1 lần', async () => {
  await loadContent('content');
  const { game, ctrls } = makeHG([['chen_gong', 'lvbu'], ['caocao', 'xuchu']]);
  const red = game.state.drawPile.find((id) => isRed(game.card(id)))!;
  const black = game.state.drawPile.find((id) => !isRed(game.card(id)))!;
  await game.moveCards([red, black], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([
    { kind: 'useSkill', skill: 'tran_tinh', cardIds: [black], targets: [1] },
    { kind: 'useSkill', skill: 'tran_tinh', cardIds: [red], targets: [1] },
    { kind: 'useSkill', skill: 'tran_tinh', cardIds: [black], targets: [1] },
  ]));
  await game.runTurn(0);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  assert.ok(game.log.some((l) => l.includes('Lá được chọn không hợp lệ')));
  assert.ok(game.log.some((l) => l.includes('Kỹ năng hiện không dùng được')));
});

test('Mưu Định (chủ động): bỏ 2 lá bốc 3 lá', async () => {
  await loadContent('content');
  const { game, ctrls } = makeHG([['pang_tong', 'liubei'], ['caocao', 'xuchu']]);
  const [a, b] = await give(game, 0, 'sha', 'sha');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  game.player(0).maxHp = game.player(0).hp = 10;
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'muu_dinh', cardIds: [a, b], targets: [] }]));
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 3);
});

test('An Cư: cuối lượt hết bài thì hồi 1 máu', async () => {
  await loadContent('content');
  const { game } = makeHG([['pang_tong', 'liubei'], ['caocao', 'xuchu']]);
  await game.reveal(0, 'main');
  game.player(0).hp = 1;
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  await game.runTurn(0);
  assert.equal(game.player(0).hp, 2);
});

test('Kiếm Khách (bị động): tầm đánh +1, Sát 2 lần, lá Chuồn dùng như Sát', async () => {
  await loadContent('content');
  const { game } = makeHG([['xu_huang', 'caocao'], ['zhangfei', 'zhaoyun'], ['lvmeng', 'luxun'], ['lvbu', 'jiaxu'], ['guojia', 'simayi']]);
  await game.reveal(0, 'main');
  assert.equal(game.attackRange(0), 2);
  assert.equal(game.slashLimit(0), 2);
  const club = game.state.drawPile.find((id) => game.card(id).suit === 'club' && game.card(id).name !== 'sha')!;
  assert.ok(game.cardCountsAs(0, game.card(club)).includes('sha'));
});

test('Tích Lương (bị động): giới hạn bài trên tay cộng số máu đã mất', async () => {
  const dir = contentDir({
    'skills/a.json': [{ id: 'tich_luong', name: 'Tích Lương', type: 'passive', handLimit: 'self.lostHp' }],
    'generals/a.json': [{ id: 'tl', name: 'TL', kingdom: 'wei', halfHp: 4, skills: ['tich_luong'] }],
  });
  await loadContent(dir);
  const { game } = makeHG([['tl', 'caocao'], ['zhangfei', 'zhaoyun']]);
  await game.reveal(0, 'main');
  game.player(0).hp = 2;
  assert.equal(game.handLimit(0), 4);
});

// ============================================================ Lá bài mới

test('lá bài mới: cẩm nang, cẩm nang đánh lan, cẩm nang trì hoãn, vũ khí có kỹ năng', async () => {
  await loadContent('content');
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangfei', 'zhaoyun'], ['lvmeng', 'luxun']]);
  const [bp, ct, hh, lt] = await give(game, 0, 'binh_phap' as never, 'chan_te' as never, 'hoa_hoan' as never, 'luu_tinh' as never);
  const victim = (await give(game, 1, 'tao'))[0];
  enterPlay(game, 0);
  await game.useCard(0, bp, [1]);
  assert.ok(game.state.discardPile.includes(victim), 'Binh Pháp bỏ 1 lá của mục tiêu');
  await game.useCard(0, ct, []);
  assert.ok(game.player(1).hand.length >= 1 && game.player(2).hand.length >= 1, 'Chẩn Tế: người ít bài bốc 1');
  await game.useCard(0, hh, [1]);
  assert.equal(game.player(1).judgeArea.length, 1);
  await game.useCard(0, lt, []);
  assert.equal(game.weaponName(0), 'luu_tinh');
  assert.equal(game.attackRange(0), 3);
  // Hỏa Hoạn: phán định Cơ -> 1 sát thương hỏa
  stackTop(game, (c) => c.suit === 'heart');
  game.bus.on('phaseBefore', (ctx) => { if (ctx.phase !== 'judge') ctx.skip = true; });
  await game.runTurn(1);
  assert.equal(game.player(1).hp, game.player(1).maxHp - 1);
  // Kỹ năng của vũ khí: Sát bị né thì bỏ ngẫu nhiên 1 lá của mục tiêu
  ctrls[0].set('confirm', YES);
  ctrls[2].set('respond', FIRST_OPTION);
  await give(game, 2, 'shan', 'tao');
  await give(game, 0, 'sha');
  const before = game.player(2).hand.length;
  enterPlay(game, 0);
  await sha(game, 0, 2);
  assert.equal(game.player(2).hand.length, before - 2, 'mất 1 Thiểm đã đánh + 1 lá bị Lưu Tinh Tiễn bỏ');
});

// ============================================================ Báo lỗi

test('báo lỗi: sự kiện sai, biến sai, sửa sự kiện không đúng chỗ, thiếu tham số', async () => {
  const dir = contentDir({
    'skills/x.json': [
      { id: 'a1', name: 'A1', type: 'trigger', event: 'damagedd', actions: [{ do: 'draw' }] },
      { id: 'a2', name: 'A2', type: 'trigger', event: 'damaged', if: 'amout > 1', actions: [{ do: 'draw' }] },
      { id: 'a3', name: 'A3', type: 'trigger', event: 'damaged', actions: [{ do: 'modifyDamage', add: '1' }] },
      { id: 'a4', name: 'A4', type: 'trigger', event: 'damaged', actions: [{ do: 'damage' }] },
      { id: 'a5', name: 'A5', type: 'trigger', event: 'damaged', actions: [{ do: 'draw', count: 'self.hp +' }] },
      { id: 'A6', name: 'Sai id', type: 'passive', handLimit: '1' },
    ],
  });
  const p = await prepareContent(dir);
  const all = p.errors.join('\n');
  assert.equal(p.ok, false);
  assert.match(all, /a1: "event" không hợp lệ: "damagedd"/);
  assert.match(all, /a2 > if: biến "amout" không dùng được ở đây/);
  assert.match(all, /a3 > actions\[0\]: "modifyDamage" chỉ dùng được ở sự kiện cho phép/);
  assert.match(all, /a4 > actions\[0\]: "damage" thiếu tham số bắt buộc "who"/);
  assert.match(all, /a5 > actions\[0\]\.count: Biểu thức không hợp lệ/);
  assert.match(all, /"id" phải viết thường/);
});

test('báo lỗi: tướng dùng kỹ năng không tồn tại, thế lực còn dưới 2 tướng, bộ bài sai định dạng', async () => {
  const dir = contentDir({
    'generals/x.json': [
      { id: 'moi', name: 'Mới', kingdom: 'wei', halfHp: 4, skills: ['khong_co'] },
      ...['lvbu', 'huatuo', 'pangde', 'jiaxu', 'diaochan', 'zhangjiao', 'gongsunzan'].map((id) => ({ id, disabled: true })),
    ],
    'deck.json': { mode: 'add', cards: [['sha', 'S14 X3'], ['khong_co_bai', 'S1']] },
  });
  const p = await prepareContent(dir);
  const all = p.errors.join('\n');
  assert.match(all, /không có kỹ năng "khong_co"/);
  assert.match(all, /Thế lực qun chỉ còn 1 tướng/);
  assert.match(all, /"S14" sai định dạng/);
  assert.match(all, /không có loại bài "khong_co_bai"/);
});

test('nạp thư mục rỗng thì mọi thứ trở về như gốc (không để lại rác)', async () => {
  await loadContent('content');
  assert.ok(SKILLS.phan_hoi && 'binh_phap' in CARD_INFO);
  await loadContent(contentDir({}));
  assert.equal(SKILLS.phan_hoi, undefined);
  assert.equal('binh_phap' in CARD_INFO, false);
  assert.equal(GENERALS.some((g) => g.id === 'chen_gong'), false);
  assert.equal(getGeneral('xuchu').halfHp, 4);
});

test('nội dung lỗi không làm thay đổi engine', async () => {
  await loadContent('content');
  const before = Object.keys(SKILLS).length;
  const r = await loadContent(contentDir({ 'skills/x.json': '[{ "id": ' }));
  assert.equal(r.ok, false);
  assert.equal(Object.keys(SKILLS).length, before);
  assert.ok(SKILLS.phan_hoi, 'nội dung cũ vẫn còn');
});

test('ghi đè kỹ năng có sẵn: có cảnh báo và tướng có sẵn dùng phiên bản mới', async () => {
  const dir = contentDir({
    'skills/x.json': [{ id: 'khonhuc', name: 'Khổ Nhục (sửa)', type: 'active', bot: { use: 'never' }, actions: [{ do: 'loseHp' }, { do: 'draw', count: '3' }] }],
  });
  const r = await loadContent(dir);
  assert.ok(r.warnings.some((w) => w.includes('ghi đè kỹ năng có sẵn')));
  const { game, ctrls } = makeHG([['huanggai', 'lvmeng'], ['caocao', 'xuchu']]);
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  ctrls[0].set('play', playSteps([{ kind: 'useSkill', skill: 'khonhuc', cardIds: [], targets: [] }]));
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 3);
  void revealAll;
});
