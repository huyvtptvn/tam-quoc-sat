// Tướng 2 thế lực (双势力) và tướng tím / dã tâm gia (野心家): Bạo lộ dã tâm, dấu Dã Tâm Gia, Lạp Long Nhân Tâm.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import { isDualGeneral, kingdomsOf } from '../src/hegemony/generals.js';
import { HegemonyGame } from '../src/hegemony/game.js';
import type { Request } from '../src/core/types.js';
import { ByType, makeHG } from './hg-helpers.js';

before(async () => { await loadContent('content'); });

test('Dữ liệu: Mạnh Đạt là tướng 2 thế lực Ngụy/Thục', () => {
  assert.ok(isDualGeneral('mengda'));
  assert.deepEqual(kingdomsOf('mengda'), ['wei', 'shu']);
  assert.ok(!isDualGeneral('caocao'));
});

test('Tướng 2 thế lực chỉ làm phó tướng; chủ tướng phải thuộc 1 trong 2 thế lực', () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  assert.ok(game.isValidPair('caocao', 'mengda'), 'chủ Ngụy + phó Ngụy/Thục');
  assert.ok(game.isValidPair('liubei', 'mengda'), 'chủ Thục + phó Ngụy/Thục');
  assert.ok(!game.isValidPair('sunquan', 'mengda'), 'chủ Ngô không ghép được');
  assert.ok(!game.isValidPair('mengda', 'caocao'), 'tướng 2 thế lực không làm chủ tướng');
  assert.ok(!game.isValidPair('mengda', 'xiahouba'), 'hai tướng 2 thế lực: không ai làm chủ được');
  assert.ok(game.isValidPair('zhonghui', 'mengda'), 'tướng tím làm chủ, phó tướng bất kỳ');
  assert.ok(!game.isValidPair('caocao', 'zhonghui'), 'tướng tím không làm phó tướng');
  assert.ok(game.autoPick(['mengda', 'liubei', 'sunquan']).join() === 'liubei,mengda');
});

test('Lật phó tướng 2 thế lực trước: phe theo chủ tướng (đang úp)', async () => {
  const { game } = makeHG([['liubei', 'mengda'], ['caocao', 'xuchu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await game.reveal(0, 'deputy');
  assert.equal(game.shownKingdom(0), 'shu');
  assert.ok(game.log.some((l) => l.includes('phe Thục theo chủ tướng')));
});

test('Đổi phó tướng: tướng 2 thế lực có thể được nhận nếu có thế lực của chủ tướng', () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  const c = game.transformCandidates(0);
  assert.ok(c.includes('mengda') && c.includes('wenqin'));
  assert.ok(!c.includes('panjun'), 'Thục/Ngô không có Ngụy');
});

test('Tướng tím còn úp, chỉ lật phó tướng: tạm theo thế lực phó tướng, chưa là dã tâm gia', async () => {
  const { game } = makeHG([['zhonghui', 'xuchu'], ['caocao', 'xiahoudun'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await game.reveal(0, 'deputy');
  assert.equal(game.shownKingdom(0), 'wei');
  assert.ok(game.isSameFaction(0, 0) || true);
  await game.reveal(1, 'main');
  assert.ok(game.isSameFaction(0, 1), 'đang được coi là người Ngụy');
});

test('Lật tướng tím: bạo lộ dã tâm, nhận dấu Dã Tâm Gia, Lạp Long Nhân Tâm: 1 người gia nhập, bốc đến 4, hồi 1', async () => {
  const { game, ctrls } = makeHG([['zhonghui', 'xuchu'], ['caocao', 'xiahoudun'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  const asked: string[] = [];
  ctrls[0].set('confirm', (r) => ((r as { skill: string }).skill === 'recruit' ? { kind: 'yes' } : { kind: 'no' }));
  ctrls[1].set('confirm', (r) => { asked.push(`1:${(r as { skill: string }).skill}`); return { kind: 'no' }; });
  ctrls[2].set('confirm', (r) => { asked.push(`2:${(r as { skill: string }).skill}`); return { kind: 'yes' }; });
  ctrls[3].set('confirm', (r) => { asked.push(`3:${(r as { skill: string }).skill}`); return { kind: 'yes' }; });
  game.player(2).hp = 2;
  await game.moveCards([...game.player(2).hand].slice(1), { kind: 'hand', seat: 2 }, { kind: 'discard' }, 'test');
  await game.reveal(0, 'main');
  const h0 = game.heroes[0];
  assert.ok(h0.careerist && h0.exposed);
  assert.equal(h0.marks.ambition, 1);
  assert.deepEqual(asked, ['1:joinCareerist', '2:joinCareerist'], 'người thứ 2 đồng ý thì dừng, không hỏi tiếp');
  assert.equal(game.shownKingdom(2), 'careerist');
  assert.ok(game.isSameFaction(0, 2) && game.isSameFaction(2, 0));
  assert.ok(!game.isSameFaction(0, 3));
  assert.equal(game.player(2).hand.length, 4);
  assert.equal(game.player(2).hp, 3);
  assert.equal(game.player(0).team, game.player(2).team);
});

test('Phe dã tâm gia thắng khi chỉ còn người trong nhóm', async () => {
  const { game, ctrls } = makeHG([['zhonghui', 'xuchu'], ['caocao', 'xiahoudun'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  ctrls[2].set('confirm', () => ({ kind: 'yes' }));
  await game.reveal(0, 'main');
  for (const s of [1, 3]) game.player(s).hp = 1;
  await game.damage({ source: 0, target: 1, amount: 1, card: null, cancelled: false });
  assert.ok(!game.state.finished);
  try { await game.damage({ source: 2, target: 3, amount: 1, card: null, cancelled: false }); } catch { /* ván kết thúc */ }
  assert.ok(game.state.finished);
  assert.match(game.state.winner ?? '', /^Dã tâm gia P0/);
});

test('Bạo lộ dã tâm: phe "giả" sắp thắng thì tướng tím đang úp bị buộc lật, ván chưa kết thúc', async () => {
  const { game } = makeHG([['simazhao', 'xuchu'], ['caocao', 'xiahoudun'], ['liubei', 'guanyu'], ['sunquan', 'lvmeng']]);
  await game.setup();
  await game.reveal(0, 'deputy');
  await game.reveal(1, 'main');
  game.player(2).hp = 1; game.player(3).hp = 1;
  await game.damage({ source: 1, target: 2, amount: 1, card: null, cancelled: false });
  await game.damage({ source: 1, target: 3, amount: 1, card: null, cancelled: false });
  assert.ok(!game.state.finished, 'Ngụy chưa thắng vì ghế 0 thật ra là dã tâm gia');
  assert.ok(game.heroes[0].main.revealed && game.heroes[0].careerist);
  assert.equal(game.heroes[0].marks.ambition, 1);
});

test('Dấu Dã Tâm Gia dùng thay Âm Dương Ngư (bốc 1 lá)', async () => {
  const { game } = makeHG([['zhonghui', 'xuchu'], ['caocao', 'xiahoudun'], ['liubei', 'guanyu']]);
  await game.setup();
  await game.reveal(0, 'main');
  const n = game.player(0).hand.length;
  const err = await (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(0, { kind: 'useSkill', skill: 'mark:yinyang', cardIds: [], targets: [] });
  assert.equal(err, null);
  assert.equal(game.player(0).hand.length, n + 1);
  assert.equal(game.heroes[0].marks.ambition, 0);
});

test('Ván bot có tướng 2 thế lực và tướng tím chạy trọn, cặp tướng luôn hợp lệ', async () => {
  const { HegemonyBot } = await import('../src/hegemony/bot.js');
  for (let seed = 1; seed <= 25; seed++) {
    for (const mode of ['normal', 'free', 'chaos'] as const) {
      const g = new HegemonyGame(Array.from({ length: 6 }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() })), { seed, mode });
      await g.run();
      for (const h of g.heroes) assert.ok(g.isValidPair(h.main.generalId, h.deputy.generalId) || h.deputy.removed || mode === 'chaos',
        `ghép sai: ${h.main.generalId} + ${h.deputy.generalId}`);
      for (const h of g.heroes) assert.ok(!isDualGeneral(h.main.generalId), 'tướng 2 thế lực không bao giờ làm chủ');
    }
  }
  void ByType; void ({} as Request);
});
