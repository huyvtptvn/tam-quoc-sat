// Hàm trợ giúp dùng chung cho các test Quốc Chiến.
import type { CardName, Controller, Request, Response } from '../src/core/types.js';
import type { PlayerView } from '../src/core/view.js';
import { HegemonyGame, type HegemonyOptions } from '../src/hegemony/game.js';
import type { Card } from '../src/core/types.js';

export type Handler = (req: Request, v: PlayerView) => Response;

/** Controller trả lời theo loại câu hỏi. Mặc định: bỏ qua, không lật, không kích hoạt kỹ năng. */
export class ByType implements Controller {
  readonly asked: Request[] = [];
  /** Trả lời câu "chọn kỹ năng kích hoạt trước" (mặc định: hỏi lần lượt như confirm). */
  skillOrder?: Handler;
  constructor(public handlers: Partial<Record<Request['type'], Handler>> = {}) {}
  set(type: Request['type'], h: Handler): this { this.handlers[type] = h; return this; }
  async decide(req: Request, v: PlayerView): Promise<Response> {
    this.asked.push(req);
    // Chọn kỹ năng kích hoạt trước (nhiều kỹ năng cùng lúc): hỏi lần lượt như từng câu "confirm",
    // chọn kỹ năng đầu tiên được đồng ý (giữ nguyên cách các test viết handler cho confirm)
    if (req.type === 'choose' && Array.isArray(req.skills) && this.skillOrder) return this.skillOrder(req, v);
    if (req.type === 'choose' && Array.isArray(req.skills)) {
      for (const [i, sk] of req.skills.entries()) {
        if (!sk) continue;
        const r = await this.decide({ type: 'confirm', seat: req.seat, skill: sk, reveal: !!req.skillReveal?.[i], prompt: '' }, v);
        if (r.kind === 'yes') return { kind: 'choice', index: i };
      }
      return { kind: 'choice', index: req.skills.length - 1 };
    }
    // Đáp lại có nút kỹ năng ảo (Dịch Quỷ, Thao Loạn...): không đánh lá thì hỏi như câu "confirm" cũ
    if (req.type === 'respond' && req.virtuals?.length) {
      const h0 = this.handlers.respond;
      const r = h0 ? h0(req, v) : { kind: 'pass' as const };
      if (r.kind !== 'pass') return r;
      for (const o of req.virtuals) {
        const c = await this.decide({ type: 'confirm', seat: req.seat, skill: o.skill, reveal: o.reveal, prompt: '',
          respond: { accept: [o.as], ...(req.context ? { context: req.context } : {}) } }, v);
        if (c.kind === 'yes') return { kind: 'useSkill', skill: `virtual:${o.skill}:${o.as}`, cardIds: [], targets: [] };
      }
      return r;
    }
    const h = this.handlers[req.type];
    if (h) return h(req, v);
    switch (req.type) {
      case 'play': return { kind: 'endPlay' };
      case 'discard': return { kind: 'discard', cardIds: [] };
      case 'reveal': return { kind: 'reveal', main: false, deputy: false };
      case 'confirm': return { kind: 'no' };
      case 'chooseGenerals': return { kind: 'generals', main: '', deputy: '' };
      case 'choose': return { kind: 'choice', index: 0 };
      case 'chooseTargets': return { kind: 'targets', targets: [] };
      default: return { kind: 'pass' };
    }
  }
}

export const YES: Handler = () => ({ kind: 'yes' });
/** Đánh lá đầu tiên có thể đánh (Thiểm khi bị Sát, Đào khi cứu). */
export const FIRST_OPTION: Handler = (_r, v) => (v.responseOptions[0] ? { kind: 'card', cardId: v.responseOptions[0].cardId } : { kind: 'pass' });
/** Đồng ý đúng một kỹ năng, từ chối các kỹ năng khác. */
export const onlySkill = (id: string): Handler => (req) => ((req as { skill: string }).skill === id ? { kind: 'yes' } : { kind: 'no' });

export function makeHG(presets: [string, string][], opts: HegemonyOptions = {}) {
  const ctrls = presets.map(() => new ByType());
  const game = new HegemonyGame(
    ctrls.map((controller, i) => ({ name: `P${i}`, controller })),
    { seed: 42, presetGenerals: presets, ...opts },
  );
  return { game, ctrls };
}

export async function revealAll(game: HegemonyGame, ...seats: number[]) {
  for (const s of seats) {
    await game.reveal(s, 'main');
    await game.reveal(s, 'deputy');
  }
}

export const sha = (game: HegemonyGame, seat: number, target: number) => {
  const id = game.player(seat).hand.find((i) => game.card(i).name === 'sha')!;
  return game.useCard(seat, id, [target]);
};

/**
 * Đặt một lá thỏa điều kiện lên trên cùng chồng bốc (để điều khiển kết quả phán định trong test).
 * Chỉ đổi thứ tự trong chồng bốc, không đổi vùng -> tổng số lá vẫn đúng.
 */
export function stackTop(game: HegemonyGame, pred: (c: Card) => boolean, skipIds: number[] = []): Card {
  const pile = game.state.drawPile;
  const i = pile.findIndex((id) => pred(game.card(id)) && !skipIds.includes(id));
  if (i < 0) throw new Error('Không tìm thấy lá phù hợp trong chồng bốc');
  const [id] = pile.splice(i, 1);
  pile.push(id);
  return game.card(id);
}

export const isBlack = (c: Card) => c.suit === 'spade' || c.suit === 'club';
export const named = (n: CardName) => (c: Card) => c.name === n;
