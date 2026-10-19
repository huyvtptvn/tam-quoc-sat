import { Game, type GameOptions } from '../src/core/game.js';
import type { CardName, Controller, Request, Response } from '../src/core/types.js';
import type { PlayerView } from '../src/core/view.js';

type Step = Response | ((req: Request, v: PlayerView) => Response);

/** Controller trả lời theo kịch bản định sẵn; hết kịch bản thì bỏ qua. Ghi lại mọi câu hỏi nhận được. */
export class Scripted implements Controller {
  readonly asked: Request[] = [];
  constructor(private readonly steps: Step[] = []) {}

  push(...steps: Step[]): this {
    this.steps.push(...steps);
    return this;
  }

  async decide(req: Request, v: PlayerView): Promise<Response> {
    this.asked.push(req);
    const step = this.steps.shift();
    if (step) return typeof step === 'function' ? step(req, v) : step;
    if (req.type === 'play') return { kind: 'endPlay' };
    if (req.type === 'discard') return { kind: 'discard', cardIds: [] };
    return { kind: 'pass' };
  }
}

/** Tạo ván với các controller Scripted, chưa chia bài (tay trống). */
export function makeGame(n: number, opts: GameOptions & { teams?: string[]; hp?: number[] } = {}) {
  const ctrls = Array.from({ length: n }, () => new Scripted());
  const game = new Game(
    ctrls.map((controller, i) => ({
      name: `P${i}`,
      team: opts.teams?.[i] ?? `T${i}`,
      maxHp: opts.hp?.[i] ?? 4,
      controller,
    })),
    { seed: 42, ...opts },
  );
  return { game, ctrls };
}

/** Lấy lá theo tên từ chồng bốc đưa vào tay (giữ đúng tổng số lá). Trả về id các lá. */
export async function give(game: Game, seat: number, ...names: CardName[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const id = game.state.drawPile.find((i) => game.card(i).name === name && !ids.includes(i));
    if (id === undefined) throw new Error(`Hết lá ${name} trong chồng bốc`);
    ids.push(id);
  }
  await game.moveCards(ids, { kind: 'draw' }, { kind: 'hand', seat }, 'test');
  return ids;
}

/** Đặt ván vào giai đoạn ra bài của `seat` (bỏ qua bốc bài) để test useCard trực tiếp. */
export function enterPlay(game: Game, seat: number): void {
  game.state.currentSeat = seat;
  game.state.phase = 'play';
  game.player(seat).flags = {};
}
