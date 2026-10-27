// ============================================================
// Bot Quốc Chiến. Chỉ dùng PlayerView (không biết tướng úp của người khác).
// ============================================================
import { SimpleBot } from '../agents/bot.js';
import type { Request, Response } from '../core/types.js';
import type { PlayerView, PublicPlayer } from '../core/view.js';
import { cardValue } from '../agents/bot.js';
import { getGeneral, isDualGeneral, kingdomsOf, type Kingdom } from './generals.js';
import { SKILLS } from './skills.js';
import { BotBrain, keyOf, realKingdomOf } from './bot-brain.js';

export class HegemonyBot extends SimpleBot {
  /** Bộ não chiến thuật (đánh giá sức mạnh phe, ưu tiên mục tiêu, xác suất đồng minh của người chưa lộ). */
  protected readonly brain = new BotBrain();

  /** Khóa phe của mình: phe đã lộ, hoặc thế lực thật (mình biết tướng của mình). */
  protected myKey(v: PlayerView): string | null {
    const me = v.players?.[v.me];
    if (!me) return null;
    return keyOf(me) ?? realKingdomOf(v);
  }

  private amCareerist(v: PlayerView): boolean {
    const me = v.players[v.me];
    if (me.kingdom === 'careerist') return true;
    if (me.kingdom != null) return false;
    return !this.safeToReveal(v); // lật ra sẽ thành dã tâm gia
  }

  /** Xác suất `p` là đồng minh (người đã lộ: 0/1; chưa lộ: ước lượng). */
  protected allyProb(v: PlayerView, p: PublicPlayer): number {
    if (this.isAlly(v, p)) return 1;
    if (v.boss) return 0;
    return this.brain.allyProb(v, p, this.myKey(v), realKingdomOf(v), this.amCareerist(v));
  }

  override async decide(req: Request, v: PlayerView): Promise<Response> {
    if (!v.boss && v.players?.[v.me]) this.brain.observe(v, this.myKey(v));
    switch (req.type) {
      case 'chooseGenerals':
        return this.choose(req.candidates, !!req.anyKingdom);
      case 'reveal': {
        // Lật cả hai nếu an toàn (không biến mình thành dã tâm gia)
        const ok = this.safeToReveal(v);
        return { kind: 'reveal', main: ok && req.canMain, deputy: ok && req.canDeputy };
      }
      case 'confirm': {
        // Đổi bài khởi đầu: đổi khi tay bài ít lá "tốt" (Đào, Thiểm, Vô Trung, Rượu)
        if (req.skill === 'mulligan') {
          const good = v.myHand.filter((c) => ['tao', 'shan', 'wuzhong', 'jiu', 'wuxie'].includes(c.name)).length;
          return { kind: good <= 1 ? 'yes' : 'no' };
        }
        // Lạp Long Nhân Tâm: chỉ gia nhập dã tâm gia khi thế lực của mình gần như không còn ai
        if (req.skill === 'joinCareerist') {
          const k = this.myKingdom(v);
          const mates = v.players.filter((p) => p.alive && p.seat !== v.me && p.kingdom === k).length;
          return { kind: mates === 0 && v.players[v.me].hp <= 2 ? 'yes' : 'no' };
        }
        // Điều 17: không giữ tướng úp đến chết — sắp chết thì chấp nhận lật (kể cả thành dã tâm gia) nếu kỹ năng giúp sống sót
        if (req.reveal && !this.safeToReveal(v) && !(v.players[v.me].hp <= 1 && req.respond)) return { kind: 'no' };
        const hasSha = v.myHand.some((c) => c.name === 'sha');
        // Lõa Y: chỉ bốc ít đi khi có Sát để tận dụng; Tự Thủ: chỉ khi không định tấn công ai
        if (req.skill === 'loay' && !hasSha) return { kind: 'no' };
        const c = SKILLS[req.skill]?.bot?.confirm;
        if (c === false) return { kind: 'no' };
        if (typeof c === 'function' && !c(v, { isAlly: (s) => this.isAlly(v, v.players[s]) }, req)) return { kind: 'no' };
        if (req.skill === 'tuthu' && hasSha) return { kind: 'no' };
        return { kind: 'yes' };
      }
      case 'choose':
        // Chọn kỹ năng kích hoạt trước: lấy kỹ năng đầu tiên mà bot đồng ý kích hoạt
        if (Array.isArray(req.skills)) {
          for (const [i, sk] of req.skills.entries()) {
            if (!sk) continue;
            const r = await this.decide({ type: 'confirm', seat: req.seat, skill: sk, reveal: !!req.skillReveal?.[i], prompt: '' }, v);
            if (r.kind === 'yes') return { kind: 'choice', index: i };
          }
          return { kind: 'choice', index: req.skills.length - 1 };
        }
        return { kind: 'choice', index: this.chooseOption(req.options, v) };
      case 'chooseTargets': {
        // Kỹ năng có lợi (aim = 'ally'): chọn đồng minh / bản thân, ưu tiên người ít máu ít bài
        if (req.aim === 'ally') {
          const allies = req.candidates.map((s) => v.players[s]).filter((p) => this.isAlly(v, p))
            .sort((a, b) => (a.hp + a.handCount) - (b.hp + b.handCount)).map((p) => p.seat);
          let picked = allies.slice(0, req.max);
          if (picked.length < req.min) picked = [...picked, ...req.candidates.filter((c) => !picked.includes(c))].slice(0, req.min);
          return { kind: 'targets', targets: picked };
        }
        // Ưu tiên kẻ địch (đã lộ trước), không bao giờ chọn đồng minh nếu không bắt buộc
        const ranked = req.candidates.map((s) => v.players[s])
          .filter((p) => !this.isAlly(v, p))
          .sort((a, b) => this.targetScore(v, a) - this.targetScore(v, b))
          .map((p) => p.seat);
        let picked = ranked.slice(0, req.max);
        if (picked.length < req.min) picked = [...picked, ...req.candidates.filter((c) => !picked.includes(c))].slice(0, req.min);
        return { kind: 'targets', targets: picked };
      }
      case 'save': {
        const dying = v.players[req.dying];
        const shouldSave = req.dying === v.me || (this.isAlly(v, dying) && this.worthSaving(v, dying, req.need));
        if (shouldSave && v.responseOptions.length === 0 && v.specialSaves?.length) {
          return { kind: 'useSkill', skill: v.specialSaves[0].skill, cardIds: [], targets: [] };
        }
        return super.decide(req, v);
      }
      default:
        return super.decide(req, v);
    }
  }

  /** Chọn phương án: đoán chất (Phản Gián) thì đoán Rô vì bộ bài nhiều lá đỏ; Cương Liệt thì cân nhắc máu và bài. */
  private chooseOption(options: string[], v: PlayerView): number {
    if (options.length === 4) return 3;
    // Thủy Yêm Thất Quân: còn khỏe và có từ 2 trang bị thì chịu sát thương, giữ trang bị
    if (options[1] === 'Chịu 1 sát thương lôi') {
      const me = v.players[v.me];
      const eq = Object.keys(me.equips ?? {}).length;
      return me.hp >= 3 && eq >= 2 ? 1 : 0;
    }
    if (options[0]?.startsWith('Bỏ 2')) {
      const me = v.players[v.me];
      return v.myHand.length >= 3 || me.hp <= 2 ? 0 : 1;
    }
    return 0;
  }

  private choose(candidates: string[], anyKingdom = false): Response {
    let best: [string, string] = [candidates[0], candidates[1]];
    let bestScore = -1;
    for (const a of candidates) {
      for (const b of candidates) {
        const ga = getGeneral(a);
        const gb = getGeneral(b);
        // a = chủ tướng, b = phó tướng (tướng tím chỉ làm chủ, tướng 2 thế lực chỉ làm phó)
        if (a === b || gb.kingdom === 'ye' || isDualGeneral(a)) continue;
        if (!anyKingdom && ga.kingdom !== 'ye' && !kingdomsOf(b).includes(ga.kingdom)) continue;
        const score = ga.halfHp + gb.halfHp + 0.5 * (ga.skills.length + gb.skills.length);
        if (score > bestScore) {
          bestScore = score;
          best = [a, b];
        }
      }
    }
    return { kind: 'generals', main: best[0], deputy: best[1] };
  }

  private myKingdom(v: PlayerView): Kingdom {
    const g = v.players[v.me].generals!;
    const km = getGeneral(g.main.generalId!).kingdom;
    // Chủ tướng tím còn úp: tạm theo thế lực phó tướng
    if (km === 'ye' && !g.main.revealed && g.deputy.generalId && !isDualGeneral(g.deputy.generalId)) return getGeneral(g.deputy.generalId).kingdom;
    return km;
  }

  private amRevealed(v: PlayerView): boolean {
    return v.players[v.me].kingdom != null;
  }

  /** Lật tướng lúc này có làm mình thành dã tâm gia không. */
  private safeToReveal(v: PlayerView): boolean {
    if (this.amRevealed(v)) return true;
    const k = this.myKingdom(v);
    const shown = v.players.filter((p) => p.seat !== v.me && p.kingdom === k).length;
    return shown + 1 <= v.players.length / 2;
  }

  /** Đồng minh: cùng thế lực đã lộ với mình (dã tâm gia thì không có đồng minh). */
  protected override isAlly(v: PlayerView, p: PublicPlayer): boolean {
    if (p.seat === v.me) return true;
    // Thảo Phạt: mọi người chơi là đồng minh, boss là kẻ địch chung
    if (v.boss) return v.me !== v.boss.seat && p.seat !== v.boss.seat;
    const me = v.players[v.me];
    if (me.kingdom === 'careerist') {
      // Đồng minh Lạp Long Nhân Tâm
      return p.kingdom === 'careerist' && me.careeristGroup !== undefined && p.careeristGroup === me.careeristGroup;
    }
    if (!this.amRevealed(v) && !this.safeToReveal(v)) return false;
    return p.kingdom != null && p.kingdom === this.myKingdom(v);
  }

  /** Điểm càng thấp càng nên đánh trước: âm của điểm ưu tiên chiến thuật (Điều 8–9, 28–32). */
  protected override targetScore(v: PlayerView, p: PublicPlayer): number {
    if (v.boss) return p.hp;
    return -this.brain.targetPriority(v, p, { myKey: this.myKey(v), allyP: this.allyProb(v, p), dmg: true });
  }

  /** Điều 32/37: không tấn công người chưa lộ có khả năng cao là đồng đội (trừ khi đó là kẻ địch đã xác nhận). */
  protected override attackable(v: PlayerView, p: PublicPlayer): boolean {
    if (this.isAlly(v, p)) return false;
    if (v.boss || p.kingdom != null) return true;
    return this.allyProb(v, p) < 0.5;
  }

  /** Cẩm nang cả bàn: tổng thiệt hại kỳ vọng lên kẻ địch phải lớn hơn lên đồng minh (tính cả xác suất người chưa lộ). */
  protected override aoeWorth(v: PlayerView): boolean {
    if (v.boss) return super.aoeWorth(v);
    // Không tự đánh đồng đội: còn đồng minh đã lộ nào trúng đòn thì không dùng bài đánh cả bàn
    if (v.players.some((p) => p.alive && p.seat !== v.me && !p.lured && this.isAlly(v, p))) return false;
    let enemy = 0, ally = 0;
    for (const p of v.players) {
      if (!p.alive || p.seat === v.me || p.lured) continue;
      const a = this.allyProb(v, p);
      const w = p.hp <= 1 ? 1.6 : 1; // người sắp chết bị ảnh hưởng nặng hơn
      ally += a * w;
      enemy += (1 - a) * w;
    }
    return enemy > ally * 1.2;
  }

  /**
   * Điều 22: cứu đồng đội có giá trị, nhưng không lãng phí khi không cứu nổi
   * và không tự đẩy mình vào chỗ chết khi mình cũng sắp chết.
   */
  private worthSaving(v: PlayerView, dying: PublicPlayer, need: number): boolean {
    const me = v.players[v.me];
    const mySaves = v.responseOptions.length + (v.specialSaves?.length ?? 0);
    const otherHelpers = v.players.filter((p) => p.alive && p.seat !== v.me && p.seat !== dying.seat && this.isAlly(v, p)).length;
    if (need > mySaves && otherHelpers === 0) return false; // không đủ để cứu sống
    // Mình chỉ còn 1 máu và chỉ có đúng 1 Đào: giữ cho mình nếu phe còn người khác cứu được
    if (me.hp <= 1 && mySaves <= 1 && otherHelpers > 0) return false;
    return true;
  }

  protected override play(v: PlayerView): Response {
    const me = v.players[v.me];
    const skills = v.skillHints ?? [];
    const canReveal = this.safeToReveal(v);
    const usable = skills.filter((s) => !s.reveals || canReveal);

    // Ký hiệu: Châu Liên Bích Hợp dùng như Đào khi mất máu, còn lại dùng ngay để bốc bài
    const pairTao = usable.find((s) => s.skill === 'mark:pair-tao');
    if (pairTao && me.hp <= 2) return { kind: 'useSkill', skill: pairTao.skill, cardIds: [], targets: [] };
    const mark = usable.find((s) => s.skill.startsWith('mark:') && s.skill !== 'mark:pair-tao');
    if (mark) return { kind: 'useSkill', skill: mark.skill, cardIds: [], targets: [] };

    const enemyIn = (targets: number[]) => targets.map((t) => v.players[t])
      .filter((p) => !this.isAlly(v, p))
      .sort((a, b) => this.targetScore(v, a) - this.targetScore(v, b))[0];

    // Cường Tập: còn nhiều máu thì đánh kẻ địch
    const ct = usable.find((s) => s.skill === 'cuongtap');
    const ctTarget = ct && me.hp >= 3 ? enemyIn(ct.targets) : undefined;
    if (ctTarget && ctTarget.kingdom != null) return { kind: 'useSkill', skill: 'cuongtap', cardIds: [], targets: [ctTarget.seat] };

    // Phản Gián / Khiêu Hấn: nhắm kẻ địch
    const pg = usable.find((s) => s.skill === 'phangian');
    const pgTarget = pg ? enemyIn(pg.targets) : undefined;
    if (pgTarget) return { kind: 'useSkill', skill: 'phangian', cardIds: [], targets: [pgTarget.seat] };
    const kh = usable.find((s) => s.skill === 'khieuhan');
    const khTarget = kh && v.myHand.some((c) => c.name === 'shan') ? enemyIn(kh.targets) : undefined;
    if (khTarget) return { kind: 'useSkill', skill: 'khieuhan', cardIds: [], targets: [khTarget.seat] };

    // Nhân Đức: thừa bài và mất máu thì tặng 2 lá Sát cho đồng minh để hồi máu
    const nd = usable.find((s) => s.skill === 'nhanduc');
    if (nd && me.hp < me.maxHp && v.myHand.length > me.hp) {
      const ally = nd.targets.map((t) => v.players[t]).find((p) => this.isAlly(v, p));
      const gifts = v.myHand.filter((c) => c.name === 'sha').slice(0, 2);
      if (ally && gifts.length === 2) return { kind: 'useSkill', skill: 'nhanduc', cardIds: gifts.map((c) => c.id), targets: [ally.seat] };
    }

    // Thanh Nang: bỏ 1 lá Sát thừa để hồi máu cho mình hoặc đồng minh
    const tn = usable.find((s) => s.skill === 'thanhnang');
    const spare = v.myHand.find((c) => c.name === 'sha');
    if (tn && spare) {
      const target = tn.targets.map((t) => v.players[t]).filter((p) => this.isAlly(v, p)).sort((a, b) => a.hp - b.hp)[0];
      if (target) return { kind: 'useSkill', skill: 'thanhnang', cardIds: [spare.id], targets: [target.seat] };
    }

    // Khổ Nhục: chỉ khi còn nhiều máu, ít bài, và có Đào/Thiểm trong tay thì không cần
    if (usable.some((s) => s.skill === 'khonhuc') && me.hp >= 3 && me.hp >= me.maxHp - 1 && v.myHand.length <= 2) {
      return { kind: 'useSkill', skill: 'khonhuc', cardIds: [], targets: [] };
    }

    // Chế Hoành: đổi các lá Sát dư (chỉ giữ 1 lá Sát) lấy bài mới
    if (usable.some((s) => s.skill === 'chehoanh')) {
      const shas = v.myHand.filter((c) => c.name === 'sha');
      if (shas.length >= 2) return { kind: 'useSkill', skill: 'chehoanh', cardIds: shas.slice(1).map((c) => c.id), targets: [] };
    }

    // Mộc Ngưu Lưu Mã: bài trên tay dư thì cất bớt 1 lá rẻ nhất xuống (không phải bỏ ở giai đoạn bỏ bài)
    const mn = usable.find((s) => s.skill === 'muniu');
    if (mn && v.myHand.length > me.hp) {
      const cheap = (mn.validCards ?? []).map((id) => v.myHand.find((c) => c.id === id)!).filter(Boolean)
        .sort((a, b) => cardValue(a) - cardValue(b))[0];
      if (cheap) return { kind: 'useSkill', skill: 'muniu', cardIds: [cheap.id], targets: [] };
    }

    // Trượng Bát Xà Mâu: hết Sát thật mà bài trên tay dư thì ghép 2 lá rẻ nhất thành Sát
    const zb = usable.find((s) => s.skill === 'zhangba');
    const zbTarget = zb && !v.myHand.some((c) => c.name === 'sha') && v.myHand.length >= 3 ? enemyIn(zb.targets) : undefined;
    if (zb && zbTarget) {
      const cheap = (zb.validCards ?? []).map((id) => v.myHand.find((c) => c.id === id)!).filter(Boolean)
        .sort((a, b) => cardValue(a) - cardValue(b)).slice(0, 2).map((c) => c.id);
      if (cheap.length === 2) return { kind: 'useSkill', skill: 'zhangba', cardIds: cheap, targets: [zbTarget.seat] };
    }

    // Hợp Tung: giao tối đa 3 lá có dấu Hợp (lá ít giá trị nhất) cho người đã xác định thế lực — để được rút lại bằng số lá.
    // Ưu tiên người ít máu nhất, rồi thế lực có ít người đã lật tướng nhất (giúp thế lực yếu, kìm đại thế lực).
    const ht = usable.find((s) => s.skill === 'transfer');
    const sizes = this.brain.factionSizes(v, this.myKey(v));
    // Đang là phe đông nhất thì không Hợp Tung (không tiếp sức cho phe khác)
    if (ht && !sizes.biggest) {
      const fsize = (p: PublicPlayer) => sizes.sizes.get(keyOf(p) ?? '') ?? 1;
      // Chỉ giao cho thế lực yếu: ít người nhất, rồi ít máu nhất; không giao cho phe đông nhất
      const target = ht.targets.map((t) => v.players[t]).filter((p) => p.kingdom != null && !(fsize(p) >= 2 && fsize(p) === sizes.maxOther))
        .sort((a, b) => fsize(a) - fsize(b) || a.hp - b.hp || a.handCount - b.handCount)[0];
      const give = (ht.validCards ?? []).map((id) => v.myHand.find((c) => c.id === id)!).filter(Boolean)
        .sort((a, b) => cardValue(a) - cardValue(b)).slice(0, Math.min(3, ht.maxCards ?? 3)).map((c) => c.id);
      if (target && give.length) return { kind: 'useSkill', skill: 'transfer', cardIds: give, targets: [target.seat] };
    }

    // Kỹ năng chủ động viết bằng JSON: làm theo gợi ý "bot" trong file nội dung
    for (const s of usable) {
      const hint = SKILLS[s.skill]?.bot;
      if (!hint || (SKILLS[s.skill]?.origin !== 'content' && !hint.use)) continue; // kỹ năng có sẵn: chỉ khi có gợi ý use
      const ok = hint.use === 'always' || (hint.use === 'wounded' && me.hp < me.maxHp) || (hint.use === 'healthy' && me.hp >= me.maxHp - 1);
      if (!ok) continue;
      let targets: number[] = [];
      if (s.needsTarget) {
        const pool = s.targets.map((t) => v.players[t]);
        const pick = hint.target === 'ally' ? pool.find((p) => this.isAlly(v, p))
          : hint.target === 'any' ? pool[0] : enemyIn(s.targets);
        if (!pick) continue;
        targets = [pick.seat];
      }
      const cards = (s.validCards ?? []).map((id) => v.myHand.find((c) => c.id === id)!).filter(Boolean)
        .sort((a, b) => cardValue(a) - cardValue(b)).slice(0, s.minCards ?? 0).map((c) => c.id);
      return { kind: 'useSkill', skill: s.skill, cardIds: cards, targets };
    }

    // Không dùng bài chuyển hóa nếu việc đó buộc lật tướng không an toàn: lọc gợi ý có `as`
    if (!canReveal) v = { ...v, hints: v.hints.filter((h) => !h.as) };
    return super.play(v);
  }
}
