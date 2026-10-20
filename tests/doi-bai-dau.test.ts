// Đổi bài khởi đầu là bước ngoài ván: không kích hoạt kỹ năng.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/loader.js';
import { HegemonyGame } from '../src/hegemony/game.js';
import { ByType } from './hg-helpers.js';

before(async () => { await loadContent('content'); });

test('Đổi bài khởi đầu nằm ngoài ván: không kích hoạt kỹ năng mất/nhận bài (Đồn Điền của Đặng Ngải)', async () => {
  const ctrls = [0, 1, 2].map(() => new ByType().set('confirm', () => ({ kind: 'yes' })));
  const game = new HegemonyGame(ctrls.map((controller, i) => ({ name: `P${i}`, controller })),
    { seed: 5, mulligan: true, presetGenerals: [['liubei', 'guanyu'], ['dengai', 'caocao'], ['sunquan', 'lvmeng']] });
  await game.setup();
  assert.ok(ctrls[1].asked.some((r) => r.type === 'confirm' && (r as { skill: string }).skill === 'mulligan'), 'Đặng Ngải được hỏi đổi bài');
  assert.ok(game.log.some((l) => /P1 đổi bài khởi đầu/.test(l)));
  assert.equal(game.player(1).hand.length, 4);
  assert.ok(!ctrls[1].asked.some((r) => (r as { skill?: string }).skill === 'tuntian'), 'không hỏi Đồn Điền');
  assert.equal(game.player(1).special.length, 0, 'không có Điền');
  assert.ok(!game.log.some((l) => /Đồn Điền/.test(l)));
});
