// Fuzz test: cho bot chơi hàng trăm ván, kể cả bot cố tình gửi nước đi sai,
// và kiểm tra các bất biến (invariant) luôn đúng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { SimpleBot } from '../src/agents/bot.js';
import { createRng } from '../src/core/rng.js';
import type { Controller, Request, Response } from '../src/core/types.js';
import type { PlayerView } from '../src/core/view.js';

/** Bot hỗn loạn: lúc chơi đúng, lúc gửi rác để thử khả năng chống gian lận của engine. */
class ChaosBot implements Controller {
  private readonly rng;
  private readonly inner = new SimpleBot();
  constructor(seed: number) { this.rng = createRng(seed); }
  async decide(req: Request, v: PlayerView): Promise<Response> {
    const r = this.rng();
    if (r < 0.15) {
      const any = v.myHand[0]?.id ?? 1;
      const junk: Response[] = [
        { kind: 'useCard', cardId: any, targets: [v.me] },
        { kind: 'useCard', cardId: 99999, targets: [0] },
        { kind: 'card', cardId: 1 },
        { kind: 'discard', cardIds: [any, any] },
        { kind: 'useCard', cardId: any, targets: [0, 0, 1] },
      ];
      return junk[Math.floor(this.rng() * junk.length)];
    }
    if (r < 0.2) throw new Error('bot lỗi');
    return this.inner.decide(req, v);
  }
}

test('500 ván bot đấu bot: luôn kết thúc, không mất bài, máu hợp lệ', async () => {
  for (let seed = 1; seed <= 500; seed++) {
    const teams = ['A', 'B', 'A', 'B', 'C'];
    const game = new Game(
      teams.map((team, i) => ({
        name: `B${i}`,
        team,
        controller: i % 2 ? new ChaosBot(seed * 10 + i) : new SimpleBot(),
      })),
      { seed, maxTurns: 1000 },
    );
    let violations = 0;
    game.bus.on('cardsMoved', () => {
      if (game.totalCards() !== game.cards.size) violations++;
      for (const p of game.state.players) if (p.hp > p.maxHp) violations++;
    });
    const r = await game.run();
    assert.ok(r, `seed ${seed}: không có kết quả`);
    assert.equal(violations, 0, `seed ${seed}: vi phạm bất biến`);
    assert.equal(game.state.processing.length, 0, `seed ${seed}: còn bài kẹt ở vùng xử lý`);
    if (r.reason === 'victory') {
      const alive = game.alivePlayers();
      assert.ok(alive.every((p) => p.team === r.winner), `seed ${seed}: người thắng sai`);
    }
    for (const p of game.state.players) {
      if (!p.alive) assert.equal(p.hand.length, 0, `seed ${seed}: người chết còn bài`);
    }
  }
});
