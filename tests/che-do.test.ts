// Ba chế độ chọn tướng và đổi bài khởi đầu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from '../src/core/types.js';
import { HegemonyGame } from '../src/hegemony/game.js';
import { HegemonyBot } from '../src/hegemony/bot.js';
import { getGeneral } from '../src/hegemony/generals.js';
import { ByType } from './hg-helpers.js';

const bots = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `B${i}`, controller: new HegemonyBot() }));

test('Loạn tướng: mỗi người được chia 3 tướng, chọn 2 tướng khác thế lực được; phe theo chủ tướng', async () => {
  const asked: Request[] = [];
  const pick = new ByType().set('chooseGenerals', (r) => {
    asked.push(r);
    const c = (r as { candidates: string[] }).candidates;
    // cố tình chọn 2 tướng khác thế lực nếu có
    const a = c[0];
    const b = c.find((x) => getGeneral(x).kingdom !== getGeneral(a).kingdom) ?? c[1];
    return { kind: 'generals', main: a, deputy: b };
  });
  const game = new HegemonyGame([{ name: 'P0', controller: pick }, ...bots(3)], { seed: 5, mode: 'chaos' });
  await game.setup();
  const req = asked[0] as { candidates: string[]; anyKingdom?: boolean };
  assert.equal(req.candidates.length, 3);
  assert.equal(req.anyKingdom, true);
  const h = game.hero(0);
  assert.equal(h.main.generalId, req.candidates[0], 'chọn được, không bị engine tự chọn thay');
  await game.reveal(0, 'deputy');
  assert.equal(game.shownKingdom(0), getGeneral(h.main.generalId).kingdom, 'phe theo chủ tướng');
});

test('Tự chọn tướng: thấy toàn bộ danh sách, chọn lần lượt, người sau không thấy tướng người trước đã chọn', async () => {
  const lists: string[][] = [];
  const mk = () => new ByType().set('chooseGenerals', (r) => {
    const c = (r as { candidates: string[] }).candidates;
    lists.push(c);
    const pair = c.filter((x) => getGeneral(x).kingdom === 'shu').slice(0, 2);
    return { kind: 'generals', main: pair[0], deputy: pair[1] };
  });
  const game = new HegemonyGame([{ name: 'P0', controller: mk() }, { name: 'P1', controller: mk() }, ...bots(2)], { seed: 9, mode: 'free' });
  await game.setup();
  assert.ok(lists[0].length >= 30, 'người đầu thấy toàn bộ tướng');
  assert.equal(lists[1].length, lists[0].length - 2);
  const g0 = game.hero(0), g1 = game.hero(1);
  assert.ok(!lists[1].includes(g0.main.generalId) && !lists[1].includes(g0.deputy.generalId));
  assert.notEqual(g0.main.generalId, g1.main.generalId);
  assert.equal(getGeneral(g1.main.generalId).kingdom, 'shu');
  const all = game.heroes.flatMap((h) => [h.main.generalId, h.deputy.generalId]);
  assert.equal(new Set(all).size, all.length, 'không ai trùng tướng');
});

test('Tự chọn tướng: chọn sai (khác thế lực) thì engine tự chọn cặp hợp lệ', async () => {
  const bad = new ByType().set('chooseGenerals', (r) => {
    const c = (r as { candidates: string[] }).candidates;
    const a = c[0];
    const b = c.find((x) => getGeneral(x).kingdom !== getGeneral(a).kingdom)!;
    return { kind: 'generals', main: a, deputy: b };
  });
  const game = new HegemonyGame([{ name: 'P0', controller: bad }, ...bots(2)], { seed: 3, mode: 'free' });
  await game.setup();
  const h = game.hero(0);
  assert.equal(getGeneral(h.main.generalId).kingdom, getGeneral(h.deputy.generalId).kingdom);
});

test('Đổi bài khởi đầu: người đồng ý nhận 4 lá mới, người từ chối giữ nguyên; tổng số lá không đổi', async () => {
  const yes = new ByType().set('confirm', (r) => ({ kind: (r as { skill: string }).skill === 'mulligan' ? 'yes' : 'no' }));
  const no = new ByType();
  const game = new HegemonyGame([{ name: 'P0', controller: yes }, { name: 'P1', controller: no }],
    { seed: 11, mulligan: true, presetGenerals: [['caocao', 'xuchu'], ['liubei', 'guanyu']] });
  let before0: number[] = [], before1: number[] = [];
  game.bus.on('gameStart', () => {});
  const origAsk = game.ask.bind(game);
  (game as unknown as { ask: typeof game.ask }).ask = async (req) => {
    if (req.type === 'confirm' && req.skill === 'mulligan') {
      if (req.seat === 0) before0 = [...game.player(0).hand];
      else before1 = [...game.player(1).hand];
    }
    return origAsk(req);
  };
  await game.setup();
  assert.equal(game.player(0).hand.length, 4);
  assert.equal(game.player(1).hand.length, 4);
  assert.deepEqual(game.player(1).hand, before1, 'P1 giữ bài');
  assert.ok(game.log.some((l) => l.includes('P0 đổi bài khởi đầu')));
  assert.ok(!game.log.some((l) => l.includes('P1 đổi bài khởi đầu')));
  assert.equal(before0.length, 4);
  assert.equal(game.totalCards(), game.cards.size);
});

test('Ba chế độ chạy trọn ván bằng bot, có đổi bài khởi đầu', async () => {
  for (const mode of ['normal', 'free', 'chaos'] as const) {
    for (let seed = 1; seed <= 15; seed++) {
      const game = new HegemonyGame(bots(3 + (seed % 5)), { seed, mode, mulligan: true, maxTurns: 150 });
      const r = await game.run();
      assert.ok(r, `${mode} seed ${seed}`);
      assert.equal(game.totalCards(), game.cards.size);
    }
  }
});
