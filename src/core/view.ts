// ============================================================
// Lọc thông tin: mỗi người chỉ nhận được những gì họ được phép thấy.
// Server sẽ gửi PlayerView này xuống client, KHÔNG BAO GIỜ gửi GameState gốc.
// ============================================================
import type { Game } from './game.js';
import { EQUIP_SLOTS, type Card, type CardName, type EquipSlot, type Phase, type Request } from './types.js';

/** Một ô tướng nhìn từ góc của người xem. generalId = null nghĩa là đang úp và người xem không được biết. */
export interface SlotView {
  generalId: string | null;
  revealed: boolean;
  /** Tướng đã bị loại khỏi ván (移除). */
  removed?: boolean;
}

export interface PublicPlayer {
  seat: number;
  name: string;
  /** null nếu phe chưa được tiết lộ cho người xem. */
  team: string | null;
  hp: number;
  maxHp: number;
  handCount: number;
  alive: boolean;
  /** Bài ở khu vực riêng trên tướng (ngửa, ai cũng thấy). */
  special: Card[];
  /** Trang bị (ngửa). */
  equips: Partial<Record<EquipSlot, Card>>;
  /** Cẩm nang trì hoãn đang chờ phán định (ngửa). */
  judgeArea: Card[];
  chained: boolean;
  /** Đang bị lật úp (bỏ qua lượt kế tiếp). */
  faceDown?: boolean;
  // ----- Chỉ có ở chế độ Quốc Chiến -----
  /** Thế lực đã lộ: 'wei' | 'shu' | 'wu' | 'qun' | 'careerist' (dã tâm gia), null = chưa lộ. */
  kingdom?: string | null;
  generals?: { main: SlotView; deputy: SlotView };
  marks?: { yinyang: number; pioneer: number; pair: number; ambition?: number };
  /** Đồng minh dã tâm gia (Lạp Long Nhân Tâm): ghế người cầm đầu. */
  careeristGroup?: number;
  /** Chồng tướng riêng trên tướng (Hồn của Tả Từ, Lục của Tôn Lâm...): tên, số lá, và id tướng nếu người xem được thấy. */
  generalPiles?: { name: string; count: number; ids?: string[] }[];
  /** Là quân chủ. */
  lord?: boolean;
}

/** Gợi ý cho UI/bot: những lá dùng được ngay và mục tiêu hợp lệ. */
export interface UseHint {
  cardId: number;
  /** Có giá trị khi lá được dùng như loại khác nhờ kỹ năng. */
  as?: CardName;
  needsTarget: boolean;
  targets: number[];
  /** Số mục tiêu tối thiểu/tối đa. minTargets = 0 với Thiết Tác / Tri Kỷ nghĩa là có thể trùng chú. */
  minTargets: number;
  maxTargets: number;
}

/** Gợi ý kỹ năng chủ động dùng được ngay (Quốc Chiến). */
export interface SkillHint {
  skill: string;
  name: string;
  /** Số lá cần chọn: 'none' | 'one' | 'any' (ít nhất 1). */
  cards: 'none' | 'one' | 'any';
  /** Mục tiêu hợp lệ; rỗng nếu không cần mục tiêu. */
  targets: number[];
  needsTarget: boolean;
  /** Dùng kỹ năng này sẽ lật tướng đang úp. */
  reveals: boolean;
  /** Số lá tối thiểu/tối đa và các lá trên tay được phép chọn. */
  minCards?: number;
  maxCards?: number;
  validCards?: number[];
}

export interface PlayerView {
  me: number;
  myHand: Card[];
  players: PublicPlayer[];
  drawPileCount: number;
  discardPileCount: number;
  lastDiscards: Card[];
  currentSeat: number;
  phase: Phase;
  turn: number;
  shaUsed: number;
  /** Chỉ có giá trị khi đang được hỏi 'play'. */
  hints: UseHint[];
  /** Chỉ có giá trị khi đang được hỏi 'respond' hoặc 'save': các lá có thể đánh ra. */
  responseOptions: { cardId: number; as: CardName }[];
  /** Chỉ có ở Quốc Chiến, khi đang được hỏi 'play'. */
  skillHints?: SkillHint[];
  /** Ghi chú riêng tư chỉ mình bạn thấy (ví dụ kết quả Tri Kỷ Tri Bỉ). */
  notes: string[];
  /** Chỉ có khi được hỏi 'save': các cách cứu không dùng lá bài (gửi lại dạng useSkill). */
  specialSaves?: { skill: string; name: string }[];
  recentLog: string[];
}

export function viewFor(game: Game, seat: number, req?: Request): PlayerView {
  const s = game.state;
  const me = game.player(seat);

  const players: PublicPlayer[] = s.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    team: game.opts.revealTeams || p.seat === seat || !p.alive ? p.team : null,
    hp: p.hp,
    maxHp: p.maxHp,
    handCount: p.hand.length, // CHỈ số lượng, không lộ bài
    alive: p.alive,
    special: p.special.map((id) => game.card(id)),
    equips: Object.fromEntries(EQUIP_SLOTS.filter((s) => p.equips[s].length).map((s) => [s, game.card(p.equips[s][0])])),
    // Lá chuyển hóa hiện theo tên cẩm nang trì hoãn (ví dụ lá Rô dùng như Lạc Bất Tư Thục)
    judgeArea: p.judgeArea.map((id) => {
      const c = game.card(id);
      const n = game.delayedName(id);
      return n === c.name ? c : { ...c, name: n };
    }),
    faceDown: !!p.faceDown,
    chained: p.chained,
  }));

  const hints: UseHint[] = [];
  const responseOptions: { cardId: number; as: CardName }[] = [];

  if (req?.type === 'play') {
    for (const id of me.hand) {
      const card = game.card(id);
      // Một lá có thể dùng được theo nhiều cách (ví dụ Long Đảm: Thiểm cũng là Sát)
      for (const as of new Set(game.cardCountsAs(seat, card))) {
        const asField = as === card.name ? {} : { as };
        const spec = game.targetSpec(seat, id, as);
        if (!spec.needsTarget) {
          if (game.checkUse(seat, id, [], as) === null) {
            hints.push({ cardId: id, ...asField, needsTarget: false, targets: [], minTargets: 0, maxTargets: 0 });
          }
        } else if (spec.candidates.length > 0 || (spec.min === 0 && game.checkUse(seat, id, [], as) === null)) {
          hints.push({ cardId: id, ...asField, needsTarget: true, targets: spec.candidates, minTargets: spec.min, maxTargets: spec.max });
        }
      }
    }
  }

  if (req?.type === 'respond' || req?.type === 'save') {
    // Khi cứu: Đào; riêng người đang hấp hối còn được dùng Rượu
    const accept: CardName[] = req.type === 'respond' ? req.accept : req.dying === seat ? ['tao', 'jiu'] : ['tao'];
    for (const id of me.hand) {
      if (game.cardBlocked(seat, game.card(id))) continue;
      const as = accept.find((a) => game.cardCountsAs(seat, game.card(id)).includes(a));
      if (as) responseOptions.push({ cardId: id, as });
    }
  }

  return {
    me: seat,
    myHand: me.hand.map((id) => game.card(id)),
    players,
    drawPileCount: s.drawPile.length,
    discardPileCount: s.discardPile.length,
    lastDiscards: s.discardPile.slice(-5).map((id) => game.card(id)),
    currentSeat: s.currentSeat,
    phase: s.phase,
    turn: s.turnCount + 1,
    shaUsed: me.flags.shaUsed ?? 0,
    hints,
    responseOptions,
    notes: game.notes[seat].slice(-10),
    recentLog: game.log.slice(-10),
  };
}
