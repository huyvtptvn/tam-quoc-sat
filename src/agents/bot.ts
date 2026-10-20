// ============================================================
// Bot dựa trên luật. Chỉ dùng PlayerView (không gian lận).
// ============================================================
import { CARD_INFO, keepValue, pickDiscards } from '../core/cards.js';
import { DELAYED_DEFS, TRICK_DEFS } from '../core/tricks.js';
import type { Card, CardName, Controller, Request, Response } from '../core/types.js';
import type { PlayerView, PublicPlayer, UseHint } from '../core/view.js';

/** Giá trị giữ lại của một lá (cao = quý, bỏ sau cùng): Đào > Vô Giải > Thiểm > Rượu > ... */
export const cardValue = keepValue;

/** Cẩm nang có hại cho mục tiêu không. */
export function isHarmful(trick: CardName): boolean {
  return TRICK_DEFS[trick]?.harmful ?? DELAYED_DEFS[trick]?.harmful ?? true;
}

export class SimpleBot implements Controller {
  async decide(req: Request, v: PlayerView): Promise<Response> {
    switch (req.type) {
      case 'play': return this.play(v);
      case 'respond': {
        const opt = v.responseOptions[0];
        if (!opt) return { kind: 'pass' };
        const ctx = req.context;
        if (ctx?.kind === 'nullify') {
          // Chặn cẩm nang có hại lên đồng minh / có lợi cho kẻ địch đã lộ; không chặn ngược đồng minh
          const target = v.players[ctx.target];
          const want = isHarmful(ctx.trick) ? this.isAlly(v, target) : !this.isAlly(v, target) && target.team !== null;
          return want !== ctx.cancelled ? { kind: 'card', cardId: opt.cardId } : { kind: 'pass' };
        }
        if (ctx?.kind === 'extraSlash' && this.isAlly(v, v.players[ctx.target])) return { kind: 'pass' };
        return { kind: 'card', cardId: opt.cardId };
      }
      case 'save': {
        const dying = v.players[req.dying];
        const shouldSave = req.dying === v.me || this.isAlly(v, dying);
        const opt = v.responseOptions[0];
        return shouldSave && opt ? { kind: 'card', cardId: opt.cardId } : { kind: 'pass' };
      }
      case 'discard': {
        // Chỉ chọn trong các lá được phép bỏ; giữ Đào, Vô Giải Khả Kích, Thiểm, Rượu đến cuối
        const ids = req.cardIds ?? v.myHand.map((c) => c.id);
        const mine = [...v.myHand, ...Object.values(v.players[v.me]?.equips ?? {}).filter((c): c is NonNullable<typeof c> => !!c)];
        const byId = new Map(mine.map((c) => [c.id, c]));
        // Ưu tiên bỏ bài trên tay; chỉ bỏ trang bị khi không đủ
        const handIds = ids.filter((id) => v.myHand.some((c) => c.id === id));
        const pool = handIds.length >= req.count ? handIds : ids.filter((id) => byId.has(id));
        return { kind: 'discard', cardIds: pickDiscards(pool, req.count, (id) => byId.get(id)!) };
      }
      case 'chooseCards': {
        // Bài không nằm trên tay (ví dụ xem bài trên cùng chồng bốc rồi chọn lấy): chọn lá giá trị cao nhất
        if (req.cards?.length) {
          const pool = [...req.cards].sort((a, b) => cardValue(b) - cardValue(a));
          return { kind: 'cards', cardIds: pool.slice(0, Math.max(req.min, Math.min(req.max, pool.length))).map((c) => c.id) };
        }
        // Bắt buộc chọn (ví dụ cho xem khi bị Hỏa Công): chọn lá ít giá trị; tùy chọn: chọn luôn để tấn công
        const cards = req.cardIds.map((id) => v.myHand.find((c) => c.id === id)).filter((c): c is Card => !!c);
        cards.sort((a, b) => cardValue(a) - cardValue(b));
        const n = Math.max(req.min, Math.min(req.max, 1));
        return { kind: 'cards', cardIds: cards.slice(0, n).map((c) => c.id) };
      }
      case 'chooseTargets': {
        const ranked = req.candidates.map((s) => v.players[s]).filter((p) => !this.isAlly(v, p))
          .sort((a, b) => this.targetScore(v, a) - this.targetScore(v, b)).map((p) => p.seat);
        let picked = ranked.slice(0, req.max);
        if (picked.length < req.min) picked = [...picked, ...req.candidates.filter((c) => !picked.includes(c))].slice(0, req.min);
        return { kind: 'targets', targets: picked };
      }
      case 'confirm':
        return { kind: 'yes' };
      case 'choose':
        return { kind: 'choice', index: 0 };
      default:
        return { kind: 'pass' };
    }
  }

  protected play(v: PlayerView): Response {
    const me = v.players[v.me];
    const hints = v.hints;
    const of = (n: CardName) => hints.filter((h) => this.nameOf(v, h) === n);
    const use = (h: UseHint, targets: number[] = []): Response => ({ kind: 'useCard', cardId: h.cardId, targets, as: h.as });
    const enemies = (ts: number[]) => ts.map((t) => v.players[t]).filter((p) => !this.isAlly(v, p))
      .sort((a, b) => this.targetScore(v, a) - this.targetScore(v, b));

    // 1. Mất máu thì ăn Đào
    const tao = of('tao')[0];
    if (tao && me.hp < me.maxHp) return use(tao);

    // 2. Trang bị: ô trống thì lắp, vũ khí tầm xa hơn thì thay
    for (const h of hints) {
      const card = this.card(v, h.cardId);
      const info = CARD_INFO[card.name];
      if (h.as || info.type !== 'equip') continue;
      const cur = me.equips[info.slot!];
      if (!cur || (info.slot === 'weapon' && (info.range ?? 1) > (CARD_INFO[cur.name].range ?? 1))) return use(h);
    }

    // 3. Cẩm nang có lợi cho bản thân
    for (const n of ['wuzhong', 'yiyi'] as CardName[]) { const h = of(n)[0]; if (h) return use(h); }
    const ty = of('taoyuan')[0];
    if (ty && me.hp < me.maxHp) return use(ty);
    const wg = of('wugu')[0];
    if (wg) return use(wg);
    const yj = of('yuanjiao')[0];
    if (yj && yj.targets.length) return use(yj, [yj.targets[0]]);

    // 4. Cẩm nang nhắm vào kẻ địch
    for (const n of ['guohe', 'shunshou', 'lebu', 'bingliang', 'jiedao', 'shuiyan'] as CardName[]) {
      for (const h of of(n)) { const e = enemies(h.targets)[0]; if (e) return use(h, [e.seat]); }
    }
    const shaCount = v.myHand.filter((c) => c.name === 'sha').length;
    const jd = of('juedou')[0];
    const jdTarget = jd ? enemies(jd.targets)[0] : undefined;
    if (jd && jdTarget && shaCount >= 1) return use(jd, [jdTarget.seat]);
    for (const n of ['nanman', 'wanjian'] as CardName[]) {
      const h = of(n)[0];
      if (!h) continue;
      const rest = v.players.filter((p) => p.alive && p.seat !== v.me);
      const allies = rest.filter((p) => this.isAlly(v, p)).length;
      if (rest.length - allies > allies) return use(h);
    }
    // Cẩm nang Quốc Chiến (giai đoạn 12)
    for (const n of ['xietianzi', 'guguo'] as CardName[]) { const h = of(n)[0]; if (h) return use(h); }
    for (const n of ['diaohu', 'haoling'] as CardName[]) {
      for (const h of of(n)) {
        const es = enemies(h.targets).slice(0, Math.max(1, h.maxTargets ?? 1)).map((p) => p.seat);
        if (es.length) return use(h, es);
      }
    }
    for (const n of ['huoshao', 'chiling'] as CardName[]) {
      const h = of(n)[0];
      if (h && (h.minTargets ?? 0) === 0) return use(h, []);
      if (h) { const e = enemies(h.targets)[0]; if (e) return use(h, [e.seat]); }
    }
    for (const n of ['lianjun', 'kefu', 'lulitongxin'] as CardName[]) {
      const h = of(n)[0];
      if (!h || !h.targets.length) continue;
      const allies = h.targets.filter((t) => this.isAlly(v, v.players[t]));
      const pick = n === 'kefu' ? (allies.length ? allies.slice(0, h.maxTargets ?? 1) : []) : [allies[0] ?? h.targets[0]];
      if (pick.length) return use(h, pick);
    }
    const wh = of('wenhe')[0];
    if (wh) {
      const rest = v.players.filter((p) => p.alive && p.seat !== v.me);
      const allies = rest.filter((p) => this.isAlly(v, p)).length;
      if (rest.length - allies > allies) return use(wh);
    }
    const hg = of('huogong')[0];
    const hgTarget = hg ? enemies(hg.targets)[0] : undefined;
    if (hg && hgTarget && v.myHand.length >= 3) return use(hg, [hgTarget.seat]);

    // 5. Sát kẻ địch (uống Rượu trước nếu được)
    for (const h of hints) {
      if (this.nameOf(v, h) !== 'sha') continue;
      const targets = enemies(h.targets).slice(0, h.maxTargets).map((p) => p.seat);
      if (targets.length === 0) continue;
      const jiu = of('jiu')[0];
      if (jiu && jiu.cardId !== h.cardId) return use(jiu);
      return use(h, targets);
    }

    // 6. Còn lại: Thiểm Điện khi khỏe, trùng chú Thiết Tác / Tri Kỷ
    const sd = of('shandian')[0];
    if (sd && me.hp >= 3) return use(sd);
    for (const n of ['tiesuo', 'zhiji'] as CardName[]) {
      const h = of(n).find((x) => x.minTargets === 0);
      if (h) return use(h, []);
    }
    return { kind: 'endPlay' };
  }

  /** Điểm càng thấp càng nên đánh trước. */
  protected targetScore(_v: PlayerView, p: PublicPlayer): number {
    return p.hp;
  }

  protected isAlly(v: PlayerView, p: PublicPlayer): boolean {
    const myTeam = v.players[v.me].team;
    return p.seat === v.me || (p.team !== null && p.team === myTeam);
  }

  protected nameOf(v: PlayerView, h: { cardId: number; as?: CardName }): CardName {
    return h.as ?? this.card(v, h.cardId).name;
  }

  protected card(v: PlayerView, id: number): Card {
    return v.myHand.find((c) => c.id === id)!;
  }
}
