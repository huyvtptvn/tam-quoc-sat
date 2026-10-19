// Fuzz test Quốc Chiến: bot đánh hàng trăm ván, một nửa cố tình gửi rác.
// Kiểm tra bất biến + KHÔNG BAO GIỜ lộ tướng úp của người khác trong view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import type { Controller, Request, Response } from '../src/core/types.js';
import type { PlayerView } from '../src/core/view.js';
import { HegemonyGame } from '../src/hegemony/game.js';
import { HegemonyBot } from '../src/hegemony/bot.js';

class ChaosHBot implements Controller {
  private readonly rng;
  private readonly inner = new HegemonyBot();
  constructor(seed: number) { this.rng = createRng(seed); }
  async decide(req: Request, v: PlayerView): Promise<Response> {
    const r = this.rng();
    if (r < 0.15) {
      const any = v.myHand[0]?.id ?? 1;
      const junk: Response[] = [
        { kind: 'generals', main: 'caocao', deputy: 'zhangfei' },
        { kind: 'generals', main: 'khong-ton-tai', deputy: '' },
        { kind: 'useSkill', skill: 'khonhuc', cardIds: [any], targets: [0] },
        { kind: 'useSkill', skill: 'thanhnang', cardIds: [any, any], targets: [9] },
        { kind: 'useSkill', skill: 'mark:yinyang', cardIds: [], targets: [] },
        { kind: 'useSkill', skill: 'baohao', cardIds: [], targets: [] },
        { kind: 'useCard', cardId: any, targets: [0], as: 'tao' },
        { kind: 'useCard', cardId: any, targets: [1], as: 'xyz' as never },
        { kind: 'reveal', main: true, deputy: true },
        { kind: 'yes' },
        { kind: 'cards', cardIds: [any, 99999] },
        { kind: 'targets', targets: [v.me, v.me, 42] },
        { kind: 'choice', index: 99 },
        { kind: 'useCard', cardId: any, targets: [0, 1, 2, 3, 4] },
        { kind: 'useCard', cardId: any, targets: [] },
      ];
      return junk[Math.floor(this.rng() * junk.length)];
    }
    if (r < 0.2) throw new Error('bot lỗi');
    return this.inner.decide(req, v);
  }
}

/** Bọc controller: mỗi lần được hỏi, kiểm tra view không chứa tướng úp của người khác. */
class LeakGuard implements Controller {
  constructor(private readonly inner: Controller, private readonly game: () => HegemonyGame, private readonly leaks: string[]) {}
  async decide(req: Request, v: PlayerView): Promise<Response> {
    const g = this.game();
    if (g.heroes.length > 0) {
      const json = JSON.stringify(v);
      for (const p of g.state.players) {
        if (p.seat === v.me || !p.alive) continue;
        for (const slot of [g.heroes[p.seat].main, g.heroes[p.seat].deputy]) {
          // Được xem hợp lệ (Tri Kỷ Tri Bỉ, Ngọc Tỷ...) thì không tính là lộ
          const learned = (g as unknown as { known: Map<number, Set<string>> }).known.get(v.me)?.has(slot.generalId);
          if (!slot.revealed && !learned && json.includes(`"${slot.generalId}"`)) this.leaks.push(`${slot.generalId} -> ghế ${v.me}`);
        }
      }
    }
    return this.inner.decide(req, v);
  }
}

test('300 ván Quốc Chiến: luôn kết thúc, không mất bài, không lộ tướng úp, người thắng đúng', async () => {
  for (let seed = 1; seed <= 300; seed++) {
    const n = 3 + (seed % 6); // 3..8 người
    const leaks: string[] = [];
    let game!: HegemonyGame;
    game = new HegemonyGame(
      Array.from({ length: n }, (_, i) => ({
        name: `B${i}`,
        controller: new LeakGuard(i % 2 ? new ChaosHBot(seed * 10 + i) : new HegemonyBot(), () => game, leaks),
      })),
      { seed, maxTurns: 600, candidates: Math.min(7, Math.floor(32 / n)) },
    );
    let violations = 0;
    game.bus.on('cardsMoved', () => {
      if (game.totalCards() !== game.cards.size) violations++;
      for (const p of game.state.players) if (p.hp > p.maxHp) violations++;
    });

    const r = await game.run();
    assert.ok(r, `seed ${seed}: không có kết quả`);
    assert.equal(violations, 0, `seed ${seed}: vi phạm bất biến`);
    assert.deepEqual(leaks, [], `seed ${seed}: lộ thông tin`);
    assert.equal(game.state.processing.length, 0, `seed ${seed}: bài kẹt ở vùng xử lý`);
    for (const p of game.state.players) {
      if (p.alive) continue;
      const h = game.heroes[p.seat];
      assert.ok(h.main.revealed && h.deputy.revealed, `seed ${seed}: người chết chưa lật tướng`);
      assert.equal(p.hand.length, 0, `seed ${seed}: người chết còn bài`);
    }
    if (r.reason === 'victory') {
      const alive = game.alivePlayers();
      if (r.winner!.startsWith('Dã tâm gia')) {
        assert.equal(alive.length, 1);
        assert.ok(game.heroes[alive[0].seat].careerist);
      } else {
        for (const p of alive) {
          assert.ok(!game.heroes[p.seat].careerist, `seed ${seed}: dã tâm gia trong phe thắng`);
          assert.equal(p.team, r.winner, `seed ${seed}: người thắng sai`);
        }
      }
    }
  }
});
