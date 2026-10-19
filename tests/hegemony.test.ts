import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from '../src/core/types.js';
import { HegemonyGame, MARK_SKILL } from '../src/hegemony/game.js';
import { getGeneral } from '../src/hegemony/generals.js';
import { enterPlay, give } from './helpers.js';
import { ByType, FIRST_OPTION, makeHG, revealAll, sha, YES } from './hg-helpers.js';

// ============================================================ Chọn tướng

test('chia ứng viên: mọi người luôn có 1 cặp cùng thế lực, không ai trùng tướng (2–8 người)', async () => {
  for (let n = 2; n <= 8; n++) {
    for (let seed = 1; seed <= 30; seed++) {
      const ctrls = Array.from({ length: n }, () => new ByType());
      const game = new HegemonyGame(ctrls.map((controller, i) => ({ name: `P${i}`, controller })), { seed });
      await game.setup();
      const all = game.heroes.flatMap((h) => [h.main.generalId, h.deputy.generalId]);
      assert.equal(new Set(all).size, all.length, `trùng tướng n=${n} seed=${seed}`);
      game.heroes.forEach((h, seat) => {
        const req = ctrls[seat].asked.find((r) => r.type === 'chooseGenerals') as Extract<Request, { type: 'chooseGenerals' }>;
        assert.ok(req.candidates.includes(h.main.generalId) && req.candidates.includes(h.deputy.generalId));
        assert.ok(game.isValidPair(h.main.generalId, h.deputy.generalId));
        assert.equal(h.main.revealed || h.deputy.revealed, false, 'đầu trận tướng phải úp');
      });
    }
  }
});

test('chọn đúng thì giữ nguyên lựa chọn; chọn sai (khác thế lực) thì engine tự chọn cặp hợp lệ', async () => {
  const ctrls = [new ByType(), new ByType()];
  ctrls[0].set('chooseGenerals', (req) => {
    const c = (req as Extract<Request, { type: 'chooseGenerals' }>).candidates;
    const pair = c.flatMap((a) => c.map((b) => [a, b])).find(([a, b]) => a !== b && getGeneral(a).kingdom === getGeneral(b).kingdom)!;
    return { kind: 'generals', main: pair[0], deputy: pair[1] };
  });
  ctrls[1].set('chooseGenerals', () => ({ kind: 'generals', main: 'caocao', deputy: 'zhangfei' }));
  const game = new HegemonyGame(ctrls.map((controller, i) => ({ name: `P${i}`, controller })), { seed: 3 });
  await game.setup();
  for (const h of game.heroes) assert.ok(game.isValidPair(h.main.generalId, h.deputy.generalId));
});

test('máu tối đa = tổng âm dương ngư / 2, làm tròn xuống', () => {
  const pairs: [string, string][] = [['caocao', 'simayi'], ['guanyu', 'zhangfei'], ['lvbu', 'jiaxu']];
  const { game } = makeHG(pairs);
  pairs.forEach(([m, d], seat) => {
    assert.equal(game.player(seat).maxHp, Math.floor((getGeneral(m).halfHp + getGeneral(d).halfHp) / 2));
  });
  assert.equal(game.player(1).maxHp, 4); // Quan Vũ 5 + Trương Phi 4 = 9 cá -> 4 máu
});

// ============================================================ Lật tướng

test('đầu lượt được hỏi lật tướng; người lật đầu tiên nhận Tiên Khu', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  ctrls[0].set('reveal', () => ({ kind: 'reveal', main: true, deputy: false }));
  ctrls[1].set('reveal', () => ({ kind: 'reveal', main: true, deputy: true }));
  await game.runTurn(0);
  assert.equal(game.hero(0).main.revealed, true);
  assert.equal(game.hero(0).deputy.revealed, false);
  assert.equal(game.hero(0).marks.pioneer, 1);
  await game.runTurn(1);
  assert.equal(game.hero(1).marks.pioneer, 0, 'Tiên Khu chỉ cho người đầu tiên');
});

test('lật đủ 2 tướng có nửa máu lẻ thì nhận Âm Dương Ngư; dùng để bốc 1 lá', async () => {
  const { game, ctrls } = makeHG([['guojia', 'xuchu'], ['zhangfei', 'zhaoyun']]); // 3 + 4 = 7 cá (lẻ)
  await game.reveal(1, 'main'); // để người 0 không nhận Tiên Khu
  await revealAll(game, 0);
  assert.equal(game.hero(0).marks.yinyang, 1);
  ctrls[0].set('play', (_r, v) => (v.skillHints?.some((s) => s.skill === MARK_SKILL.yinyang)
    ? { kind: 'useSkill', skill: MARK_SKILL.yinyang, cardIds: [], targets: [] } : { kind: 'endPlay' }));
  game.player(0).maxHp = game.player(0).hp = 10; // tránh bỏ bài
  ctrls[0].set('confirm', () => ({ kind: 'no' })); // không dùng Lõa Y
  await game.runTurn(0);
  assert.equal(game.hero(0).marks.yinyang, 0);
  assert.equal(game.player(0).hand.length, 3, 'bốc 2 + 1 từ Âm Dương Ngư');
});

// ============================================================ Thế lực, dã tâm gia

test('người chưa lộ thì không cùng phe mà cũng không khác phe', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['guojia', 'simayi'], ['zhangfei', 'zhaoyun']]);
  assert.equal(game.isSameFaction(0, 1), false);
  assert.equal(game.isDifferentFaction(0, 2), false);
  await game.reveal(0, 'main');
  await game.reveal(2, 'main');
  assert.equal(game.isDifferentFaction(0, 2), true);
});

test('dã tâm gia: ván 3 người, người Ngụy thứ hai lật tướng trở thành dã tâm gia', async () => {
  const { game } = makeHG([['caocao', 'simayi'], ['guojia', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  await game.reveal(0, 'main');
  assert.equal(game.hero(0).careerist, false);
  await game.reveal(1, 'main'); // 2 người Ngụy > 3/2
  assert.equal(game.hero(1).careerist, true);
  assert.equal(game.shownKingdom(1), 'careerist');
  assert.equal(game.isSameFaction(0, 1), false);
  assert.equal(game.isDifferentFaction(0, 1), true);
});

// ============================================================ Thưởng phạt

test('giết người khác phe: bốc số lá bằng số người của phe nạn nhân (tính cả nạn nhân)', async () => {
  const { game } = makeHG([['zhangfei', 'zhaoyun'], ['caocao', 'xuchu'], ['lvmeng', 'luxun'], ['guojia', 'simayi']]);
  await game.reveal(0, 'main');
  await game.reveal(3, 'main'); // một người Ngụy khác đã lộ
  game.player(1).hp = 1; // nạn nhân Ngụy đang úp: sẽ bị lật khi chết
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).alive, false);
  assert.equal(game.hero(1).main.revealed && game.hero(1).deputy.revealed, true, 'người chết bị lật hết tướng');
  assert.equal(game.player(0).hand.length, 2, 'phe Ngụy có 2 người -> bốc 2');
});

test('giết người cùng phe: bỏ toàn bộ bài trên tay', async () => {
  const { game } = makeHG([['zhangfei', 'zhaoyun'], ['guanyu', 'zhugeliang'], ['lvmeng', 'luxun'], ['caocao', 'xuchu']]);
  await game.reveal(0, 'main');
  await game.reveal(1, 'main');
  game.player(1).hp = 1;
  await give(game, 0, 'sha', 'tao', 'shan');
  await give(game, 1, 'tao'); // để có bài (không dùng)
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).alive, false);
  assert.equal(game.player(0).hand.length, 0);
});

test('người giết chưa lộ phe: không thưởng, không phạt', async () => {
  const { game } = makeHG([['zhangfei', 'zhaoyun'], ['caocao', 'xuchu'], ['lvmeng', 'luxun'], ['lvbu', 'jiaxu']]);
  game.player(1).hp = 1;
  await give(game, 0, 'sha', 'shan');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(0).hand.length, 1);
  assert.equal(game.hero(0).main.revealed, false);
});

// ============================================================ Điều kiện thắng

test('chỉ còn một thế lực thì thắng, người còn úp bị lật ra', async () => {
  const { game } = makeHG([['zhangfei', 'zhaoyun'], ['caocao', 'xuchu'], ['guanyu', 'zhugeliang'], ['lvmeng', 'luxun']]);
  await game.reveal(0, 'main');
  game.player(1).hp = 1;
  game.player(3).alive = false;
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.result?.winner, 'Thục');
  assert.equal(game.hero(2).main.revealed, true);
});

test('còn lại cùng thế lực nhưng nếu lật sẽ có dã tâm gia thì ván chưa kết thúc', async () => {
  const { game } = makeHG([['caocao', 'simayi'], ['guojia', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  game.player(2).hp = 1;
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 2);
  assert.equal(game.player(2).alive, false);
  assert.equal(game.state.finished, false, '2 người Ngụy > 3/2: một người sẽ là dã tâm gia');
});

test('dã tâm gia sống sót cuối cùng thì thắng', async () => {
  const { game } = makeHG([['caocao', 'simayi'], ['guojia', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  await game.reveal(0, 'main');
  await game.reveal(1, 'main'); // dã tâm gia
  game.player(2).alive = false;
  game.player(0).hp = 1;
  await give(game, 1, 'sha');
  enterPlay(game, 1);
  await sha(game, 1, 0);
  assert.equal(game.result?.winner, 'Dã tâm gia P1');
});

// ============================================================ Kỹ năng: úp và lật

test('Gian Hùng: đồng ý thì lật Tào Tháo và nhận lá Sát vừa gây sát thương', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['caocao', 'xuchu']]);
  ctrls[1].set('confirm', YES);
  const [s] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(game.hero(1).main.revealed, true);
  assert.ok(game.player(1).hand.includes(s));
  assert.equal(game.player(1).hp, 3);
});

test('Gian Hùng: từ chối thì tướng vẫn úp, lá Sát vào chồng bỏ', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['caocao', 'xuchu']]);
  const [s] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.equal(game.hero(1).main.revealed, false);
  assert.ok(game.state.discardPile.includes(s));
  assert.ok(ctrls[1].asked.some((r) => r.type === 'confirm' && r.reveal));
});

test('Không Thành: tướng úp thì vẫn bị Sát; đã lật và hết bài thì không thể bị Sát', async () => {
  const { game } = makeHG([['zhangfei', 'zhaoyun'], ['zhugeliang', 'guanyu']]);
  const [s1] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  assert.equal(game.checkUse(0, s1, [1]), null);
  await game.reveal(1, 'main');
  assert.match(game.checkUse(0, s1, [1]) ?? '', /không thể bị Sát/);
});

test('Bào Hao úp: Sát lần thứ 2 tự lật Trương Phi', async () => {
  const { game } = makeHG([['zhangfei', 'zhaoyun'], ['caocao', 'xuchu']]);
  const [s1, s2] = await give(game, 0, 'sha', 'sha');
  enterPlay(game, 0);
  await game.useCard(0, s1, [1]);
  assert.equal(game.hero(0).main.revealed, false, 'Sát lần 1 không cần lật');
  assert.deepEqual(await game.useCard(0, s2, [1]), { ok: true });
  assert.equal(game.hero(0).main.revealed, true);
});

test('Long Đảm: dùng Thiểm như Sát (lật Triệu Vân); đánh Sát như Thiểm để né', async () => {
  const { game, ctrls } = makeHG([['zhaoyun', 'zhangfei'], ['guanyu', 'zhugeliang'], ['caocao', 'xuchu']]);
  const [shan] = await give(game, 0, 'shan');
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, shan, [1], 'sha')).ok, true);
  assert.equal(game.hero(0).main.revealed, true);
  assert.equal(game.player(1).hp, 3);

  // Người 2 Sát Triệu Vân, Triệu Vân chỉ có Sát trên tay
  ctrls[0].set('respond', FIRST_OPTION);
  await give(game, 0, 'sha');
  await give(game, 2, 'sha');
  enterPlay(game, 2);
  await sha(game, 2, 0);
  assert.equal(game.player(0).hp, game.player(0).maxHp);
});

test('dùng lá như loại khác mà không có kỹ năng thì bị từ chối', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['guanyu', 'zhugeliang']]);
  const [shan] = await give(game, 0, 'shan');
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, shan, [1], 'sha')).ok, false);
  assert.equal((await game.useCard(0, shan, [1], 'xyz' as never)).ok, false);
});

test('Võ Thánh: lá đỏ dùng như Sát', async () => {
  const { game } = makeHG([['guanyu', 'zhugeliang'], ['caocao', 'xuchu']]);
  const red = game.state.drawPile.find((id) => game.card(id).name === 'shan')!; // mọi Thiểm đều đỏ
  await game.moveCards([red], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  enterPlay(game, 0);
  assert.equal((await game.useCard(0, red, [1], 'sha')).ok, true);
  assert.equal(game.player(1).hp, 3);
});

test('Vô Song: mục tiêu cần 2 Thiểm mới né được', async () => {
  const { game, ctrls } = makeHG([['lvbu', 'huatuo'], ['caocao', 'xuchu']]);
  await game.reveal(0, 'main');
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'shan');
  await give(game, 0, 'sha', 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, 3, 'chỉ có 1 Thiểm -> vẫn trúng');
  await give(game, 1, 'shan', 'shan');
  game.player(0).flags = {};
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, 3, '2 Thiểm -> né được');
});

test('Cấp Cứu: ngoài lượt của Hoa Đà, lá đỏ dùng như Đào để cứu người', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['zhangfei', 'zhaoyun'], ['huatuo', 'lvbu']]);
  ctrls[2].set('save', FIRST_OPTION);
  const red = game.state.drawPile.find((id) => game.card(id).name === 'shan')!;
  await game.moveCards([red], { kind: 'draw' }, { kind: 'hand', seat: 2 }, 'test');
  game.player(1).hp = 1;
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).alive, true);
  assert.equal(game.hero(2).main.revealed, true, 'dùng Cấp Cứu thì lật Hoa Đà');
  // Trong lượt của mình thì không được
  enterPlay(game, 2);
  await give(game, 2, 'shan');
  const card = game.card(game.player(2).hand[0]);
  assert.equal(game.cardCountsAs(2, card).includes('tao'), false);
});

test('Hoàn Sát: trong lượt Giả Hủ, người khác không được hỏi dùng Đào', async () => {
  const { game, ctrls } = makeHG([['jiaxu', 'lvbu'], ['caocao', 'xuchu'], ['zhangfei', 'zhaoyun']]);
  await game.reveal(0, 'main');
  await give(game, 2, 'tao');
  game.player(1).hp = 1;
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).alive, false);
  assert.equal(ctrls[2].asked.some((r) => r.type === 'save'), false);
  assert.equal(ctrls[1].asked.some((r) => r.type === 'save'), true, 'người hấp hối vẫn được tự cứu');
});

test('Khổ Nhục: bỏ 1 lá, mất 1 máu, rút 3 lá, Sát +1 lần; lật Hoàng Cái', async () => {
  const { game, ctrls } = makeHG([['huanggai', 'lvmeng'], ['caocao', 'xuchu']]);
  let used = false;
  let limit = 0;
  ctrls[0].set('play', () => {
    if (used) { limit = game.slashLimit(0); return { kind: 'endPlay' }; }
    used = true;
    return { kind: 'useSkill', skill: 'khonhuc', cardIds: [], targets: [] };
  });
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.equal(game.player(0).hp, 9);
  assert.equal(game.player(0).hand.length, 4, 'bốc 2, bỏ 1, rút 3');
  assert.equal(game.hero(0).main.revealed, true);
  assert.equal(limit, 2, 'Sát +1 lần trong giai đoạn này');
});

test('Trừ Lệ: bỏ 1 lá của mình và của người khác; ai mất lá Bích thì rút 1; mỗi giai đoạn 1 lần', async () => {
  const { game, ctrls } = makeHG([['huatuo', 'lvbu'], ['caocao', 'xuchu']]);
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  const spade = game.state.drawPile.find((id) => game.card(id).suit === 'spade')!;
  const heart = game.state.drawPile.find((id) => game.card(id).suit === 'heart')!;
  await game.moveCards([heart], { kind: 'draw' }, { kind: 'hand', seat: 0 }, 'test');
  await game.moveCards([spade], { kind: 'draw' }, { kind: 'hand', seat: 1 }, 'test');
  const use: Response = { kind: 'useSkill', skill: 'chuli', cardIds: [], targets: [] };
  ctrls[0].set('play', (() => { const steps = [use, { ...use }]; return () => steps.shift() ?? ({ kind: 'endPlay' } as Response); })());
  ctrls[0].set('chooseTargets', () => ({ kind: 'targets', targets: [1] }));
  await game.runTurn(0);
  assert.ok(game.state.discardPile.includes(heart) && game.state.discardPile.includes(spade));
  assert.equal(game.player(0).hand.length, 0, 'mất lá Cơ: không rút');
  assert.equal(game.player(1).hand.length, 1, 'mất lá Bích: rút 1');
  assert.ok(game.log.some((l) => l.includes('Kỹ năng hiện không dùng được')));
});

test('Chế Hoành: bỏ N lá bốc N lá, mỗi giai đoạn 1 lần', async () => {
  const { game, ctrls } = makeHG([['sunquan', 'lvmeng'], ['caocao', 'xuchu']]);
  game.player(0).maxHp = game.player(0).hp = 10;
  const before: number[] = [];
  ctrls[0].set('play', (_r, v) => {
    if (v.skillHints?.some((h) => h.skill === 'chehoanh')) {
      before.push(...v.myHand.slice(0, 2).map((c) => c.id));
      return { kind: 'useSkill', skill: 'chehoanh', cardIds: before, targets: [] };
    }
    return { kind: 'endPlay' };
  });
  await give(game, 0, 'sha', 'sha');
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 4);
  for (const id of before) assert.ok(game.state.discardPile.includes(id));
});

test('Lỏa Y: cuối giai đoạn rút bài bỏ 1 lá, Sát trong lượt gây thêm 1 sát thương', async () => {
  const { game, ctrls } = makeHG([['xuchu', 'caocao'], ['zhangfei', 'zhaoyun']]);
  ctrls[0].set('confirm', YES);
  ctrls[0].set('chooseCards', (_r, v) => ({ kind: 'cards', cardIds: [v.myHand.find((c) => c.name !== 'sha')!.id] }));
  ctrls[0].set('play', (_r, v) => {
    const h = v.hints.find((x) => v.myHand.find((c) => c.id === x.cardId)?.name === 'sha');
    return h ? { kind: 'useCard', cardId: h.cardId, targets: [1] } : { kind: 'endPlay' };
  });
  await give(game, 0, 'sha');
  game.bus.on('drawPhase', (ctx) => { if (ctx.seat === 0) ctx.count = 0; });
  await give(game, 0, 'shan');
  game.player(0).maxHp = game.player(0).hp = 10;
  await game.runTurn(0);
  assert.equal(game.player(1).hp, 2);
  assert.equal(game.player(0).hand.length, 0, 'Thiểm bị bỏ, Sát đã dùng');
});

test('Khắc Kỷ: không dùng bài khác màu trong giai đoạn ra bài thì giới hạn trữ bài +4', async () => {
  const { game, ctrls } = makeHG([['lvmeng', 'luxun'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', YES);
  await give(game, 0, 'shan', 'shan', 'shan', 'shan', 'shan');
  await game.runTurn(0);
  assert.equal(game.player(0).hand.length, 7);
  assert.equal(ctrls[0].asked.some((r) => r.type === 'discard'), false);
});

test('Phản Quỹ: chịu sát thương thì lấy 1 lá trên tay người gây sát thương', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['simayi', 'caocao']]);
  ctrls[1].set('confirm', (req) => ((req as { skill: string }).skill === 'phanquy' ? { kind: 'yes' } : { kind: 'no' }));
  const [s, other] = await give(game, 0, 'sha', 'tao');
  enterPlay(game, 0);
  await game.useCard(0, s, [1]);
  assert.ok(game.player(1).hand.includes(other));
});

test('Di Kế: chịu sát thương thì xem 2 lá trên cùng và giao cho người tùy chọn (mặc định: bản thân)', async () => {
  const { game, ctrls } = makeHG([['zhangfei', 'zhaoyun'], ['guojia', 'caocao']]);
  ctrls[1].set('confirm', (req) => ((req as { skill: string }).skill === 'dike' ? { kind: 'yes' } : { kind: 'no' }));
  await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hand.length, 2);
});

test('Khiêm Tốn: Thuận Thủ không có hiệu lực, Lạc Bất Tư Thục vào khu vực phán định thì bị bỏ', async () => {
  const { game, ctrls } = makeHG([['caocao', 'xuchu'], ['luxun', 'lvmeng']]);
  ctrls[1].set('confirm', YES);
  const [ss, lb] = await give(game, 0, 'shunshou', 'lebu');
  await give(game, 1, 'shan');
  enterPlay(game, 0);
  await game.useCard(0, ss, [1]);
  assert.equal(game.player(1).hand.length, 1);
  assert.equal(game.hero(1).main.revealed, true);
  await game.useCard(0, lb, [1]);
  assert.equal(game.player(1).judgeArea.length, 0);
  assert.ok(game.state.discardPile.includes(lb));
});

test('Độ Thế: lá đỏ trên tay dùng như Dĩ Dật Đãi Lao, tối đa 4 lần mỗi giai đoạn', async () => {
  const { game } = makeHG([['luxun', 'lvmeng'], ['caocao', 'xuchu']]);
  await revealAll(game, 0);
  const reds = await give(game, 0, 'tao', 'tao', 'tao', 'tao', 'tao');
  enterPlay(game, 0);
  for (let i = 0; i < 4; i++) {
    const id = game.player(0).hand.find((x) => reds.includes(x))!;
    assert.equal(game.checkUse(0, id, [], 'yiyi'), null);
    await game.useCard(0, id, [], 'yiyi');
  }
  const left = game.player(0).hand.find((x) => game.card(x).name === 'tao' || game.card(x).suit === 'heart' || game.card(x).suit === 'diamond');
  if (left !== undefined) assert.notEqual(game.checkUse(0, left, [], 'yiyi'), null, 'lần thứ 5 bị từ chối');
});

test('Kiện Xuất: bỏ lá không phải trang bị thì mục tiêu thu lấy Sát; bỏ trang bị thì không thể né', async () => {
  const { game, ctrls } = makeHG([['pangde', 'jiaxu'], ['caocao', 'xuchu']]);
  ctrls[0].set('confirm', YES);
  ctrls[1].set('respond', FIRST_OPTION);
  await give(game, 1, 'shan', 'shan');
  const [s1] = await give(game, 0, 'sha');
  enterPlay(game, 0);
  await sha(game, 0, 1);
  assert.equal(game.player(1).hp, 4, 'còn 1 Thiểm để né');
  assert.ok(game.player(1).hand.includes(s1), 'mục tiêu thu lấy lá Sát');

  const g2 = makeHG([['pangde', 'jiaxu'], ['caocao', 'xuchu']]);
  g2.ctrls[0].set('confirm', YES);
  g2.ctrls[1].set('respond', FIRST_OPTION);
  const [wp] = await give(g2.game, 1, 'zhuge');
  await g2.game.moveCards([wp], { kind: 'hand', seat: 1 }, { kind: 'equip', seat: 1, slot: 'weapon' }, 'test');
  await give(g2.game, 1, 'shan');
  await give(g2.game, 0, 'sha');
  g2.ctrls[0].set('choose', (r) => ({ kind: 'choice', index: (r as { options: string[] }).options.findIndex((o) => o.includes('Gia Cát')) }));
  enterPlay(g2.game, 0);
  await sha(g2.game, 0, 1);
  assert.equal(g2.game.player(1).hp, 3, 'mất trang bị: không thể dùng Thiểm');
});

// ============================================================ Thông tin ẩn

test('view: tướng úp của người khác bị ẩn; của mình và của người đã chết thì thấy', async () => {
  const { game } = makeHG([['caocao', 'xuchu'], ['zhangfei', 'zhaoyun'], ['lvmeng', 'luxun']]);
  await game.reveal(1, 'main');
  const v = game.makeView(0);
  const json = JSON.stringify(v);
  assert.equal(v.players[0].generals!.main.generalId, 'caocao');
  assert.equal(v.players[1].generals!.main.generalId, 'zhangfei');
  assert.equal(v.players[1].generals!.deputy.generalId, null);
  assert.equal(v.players[2].generals!.main.generalId, null);
  for (const hidden of ['zhaoyun', 'lvmeng', 'luxun']) assert.equal(json.includes(hidden), false, `lộ ${hidden}`);
  assert.equal(v.players[2].kingdom, null);
  assert.equal(v.players[1].kingdom, 'shu');
});
