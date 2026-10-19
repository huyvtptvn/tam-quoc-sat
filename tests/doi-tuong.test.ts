// Đổi phó tướng (变更副将) và lật tướng trong lượt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGeneral } from '../src/hegemony/generals.js';
import { makeHG, revealAll } from './hg-helpers.js';

const useSkill = (game: ReturnType<typeof makeHG>['game'], seat: number, skill: string) =>
  (game as unknown as { useSkillAction: (s: number, r: object) => Promise<string | null> })
    .useSkillAction(seat, { kind: 'useSkill', skill, cardIds: [], targets: [] });

test('Đổi phó tướng: lật phó tướng cũ, nhận tướng cùng thế lực (úp), máu giữ nguyên, tướng cũ không quay lại', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  const hp = game.player(0).hp, max = game.player(0).maxHp;
  const before = game.transformCandidates(0);
  assert.ok(before.length > 0 && before.every((id) => getGeneral(id).kingdom === 'wei'));
  assert.ok(!before.includes('caocao') && !before.includes('xuchu'));
  assert.equal(await game.transformDeputy(0), true);
  const h = game.hero(0);
  assert.notEqual(h.deputy.generalId, 'xuchu');
  assert.equal(getGeneral(h.deputy.generalId).kingdom, 'wei');
  assert.equal(h.deputy.revealed, false);
  assert.equal(game.player(0).hp, hp);
  assert.equal(game.player(0).maxHp, max);
  assert.ok(game.log.some((l) => l.includes('lật phó tướng Hứa Chử')), 'phó tướng cũ được lật trước');
  assert.ok(!game.transformCandidates(0).includes('xuchu'));
  assert.ok(game.notes[0].some((n) => n.startsWith('Phó tướng mới')));
});

test('Đổi phó tướng: phó tướng đã bị loại thì không đổi được; hỏi trước khi đổi', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  assert.equal(await game.askTransform(0, 'Thử'), false, 'mặc định trả lời không');
  ctrls[0].set('confirm', () => ({ kind: 'yes' }));
  assert.equal(await game.askTransform(0, 'Thử'), true);
  await game.removeGeneral(1, 'deputy');
  assert.equal(await game.transformDeputy(1), false);
});

test('Trong lượt của mình có thể lật tướng ngay (gợi ý "reveal:main" / "reveal:deputy")', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['liubei', 'guanyu']]);
  await game.setup();
  game.state.currentSeat = 0;
  game.state.phase = 'play';
  const v = game.makeView(0, { type: 'play', seat: 0 });
  assert.deepEqual(v.skillHints!.filter((h) => h.skill.startsWith('reveal:')).map((h) => h.skill), ['reveal:main', 'reveal:deputy']);
  assert.equal(await useSkill(game, 0, 'reveal:deputy'), null);
  assert.equal(game.hero(0).deputy.revealed, true);
  assert.equal(game.hero(0).main.revealed, false);
  assert.notEqual(await useSkill(game, 0, 'reveal:deputy'), null, 'đã lật rồi');
  await revealAll(game, 0);
  const v2 = game.makeView(0, { type: 'play', seat: 0 });
  assert.equal(v2.skillHints!.filter((h) => h.skill.startsWith('reveal:')).length, 0);
});
