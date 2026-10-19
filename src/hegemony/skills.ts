// ============================================================
// Hệ thống kỹ năng tướng.
// Mỗi kỹ năng là một object khai báo; HegemonyGame đọc và áp dụng.
// Mô tả kỹ năng được viết lại ngắn gọn, một số kỹ năng đã được đơn giản hóa
// để chỉ dùng Sát / Thiểm / Đào (ghi chú "đơn giản hóa").
// ============================================================
import { CARD_INFO, cardLabel, isRed } from '../core/cards.js';
import { pickCardFrom } from '../core/tricks.js';
import type { PlayerView } from '../core/view.js';
import type { EventMap, EventName } from '../core/events.js';
import { EQUIP_SLOTS, type Card, type CardName, type RespondContext, type Zone } from '../core/types.js';
import type { HegemonyGame, SlotKey } from './game.js';
import { getGeneral } from './generals.js';

/** Kỹ năng kích hoạt theo sự kiện. */
export interface SkillTrigger<K extends EventName> {
  event: K;
  /** Điều kiện kích hoạt. Được kiểm tra cả khi tướng đang úp. */
  can: (g: HegemonyGame, ctx: EventMap[K], owner: number) => boolean;
  /**
   * Tỏa định: nếu tướng đã lật thì tự chạy, không hỏi.
   * Nếu tướng đang úp, vẫn hỏi người chơi có muốn lật để kích hoạt không.
   */
  compulsory?: boolean;
  run: (g: HegemonyGame, ctx: EventMap[K], owner: number) => void | Promise<void>;
}

/** Union của mọi loại trigger, để một mảng có thể chứa trigger của nhiều sự kiện khác nhau. */
export type AnyTrigger = { [K in EventName]: SkillTrigger<K> }[EventName];

/** Kỹ năng chủ động: người chơi bấm dùng trong giai đoạn ra bài. */
export interface ActiveSkill {
  cards: 'none' | 'one' | 'any';
  target: 'none' | 'one';
  /** Còn dùng được không (ví dụ mỗi giai đoạn 1 lần). */
  available: (g: HegemonyGame, seat: number) => boolean;
  /** Mục tiêu hợp lệ (chỉ khi target = 'one'). */
  validTarget?: (g: HegemonyGame, seat: number, target: number) => boolean;
  /** Kiểm tra thêm các lá được chọn (số lượng, điều kiện). Trả lỗi hoặc null. */
  checkCards?: (g: HegemonyGame, seat: number, cardIds: number[]) => string | null;
  /** Số lá tối thiểu/tối đa (để gợi ý cho UI/bot). */
  minCards?: number;
  maxCards?: number;
  /** Một lá có được chọn không (để UI/bot biết lá nào hợp lệ). */
  cardOk?: (g: HegemonyGame, seat: number, cardId: number) => boolean;
  run: (g: HegemonyGame, seat: number, cardIds: number[], targets: number[]) => Promise<void>;
}

export interface Skill {
  id: string;
  name: string;
  desc: string;
  triggers?: AnyTrigger[];
  active?: ActiveSkill;
  /** Chuyển hóa: lá này còn được tính như những loại nào (Long Đảm, Võ Thánh, Cấp Cứu). */
  convert?: (g: HegemonyGame, seat: number, card: Card) => CardName[];
  /** Số lần Sát tối đa mỗi lượt (Bào Hao = Infinity). */
  slashLimit?: number;
  /** Chủ kỹ năng không thể bị chọn làm mục tiêu của Sát (Không Thành). Chỉ hiệu lực khi đã lật. */
  slashImmune?: (g: HegemonyGame, owner: number) => boolean;
  /** Chặn người khác dùng Đào (Hoàn Sát). Chỉ hiệu lực khi đã lật. */
  blockSave?: (g: HegemonyGame, owner: number, helper: number, dying: number) => boolean;
  /** Khi CHỦ KỸ NĂNG hấp hối: trả true để cấm `helper` dùng Đào cứu mình (Độc Thệ). Chỉ hiệu lực khi đã lật. */
  blockSaveSelf?: (g: HegemonyGame, owner: number, helper: number) => boolean;

  // ----- Giai đoạn 3 -----
  /** Kỹ năng chủ tướng ('main') hoặc phó tướng ('deputy'): chỉ có khi tướng nằm đúng vị trí đó. */
  position?: SlotKey;
  /** Cộng thêm tầm đánh (Mã Thuật). Chỉ hiệu lực khi đã lật. */
  rangeBonus?: (g: HegemonyGame, owner: number) => number;
  /** Người khác tính khoảng cách đến bạn cộng thêm (Nghĩa Tòng khi ít máu). Chỉ hiệu lực khi đã lật. */
  defenseBonus?: (g: HegemonyGame, owner: number) => number;
  /** Cộng thêm giới hạn bài trên tay (Tông Thất). Chỉ hiệu lực khi đã lật. */
  handLimitBonus?: (g: HegemonyGame, owner: number) => number;
  /** Trả true để CẤM chủ kỹ năng chọn `target` làm mục tiêu (Tự Thủ). Chỉ hiệu lực khi đã lật. */
  restrictTarget?: (g: HegemonyGame, owner: number, target: number) => boolean;

  // ----- Giai đoạn 7 (gói tướng mới) -----
  /** Khi không lắp giáp, coi như đang lắp giáp này (Bát Trận: 'bagua'). Chỉ hiệu lực khi đã lật. */
  virtualArmor?: (g: HegemonyGame, owner: number) => CardName | null;
  /** Chủ kỹ năng tính khoảng cách đến người khác trừ đi (Đồn Điền). Chỉ hiệu lực khi đã lật. */
  offenseBonus?: (g: HegemonyGame, owner: number) => number;
  /** Cộng thêm số người của một thế lực khi tính đại/tiểu thế lực (Hoằng Pháp: +1 mỗi Thiên Binh). Chỉ hiệu lực khi đã lật. */
  factionSizeBonus?: (g: HegemonyGame, owner: number, kingdom: string) => number;
  /** Số lần Sát thêm mỗi lượt (Tật Lê). Chỉ hiệu lực khi đã lật. */
  slashBonus?: (g: HegemonyGame, owner: number) => number;
  /** Trả true để CẤM `seat` lật tướng lúc này (Họa Thủy). Chỉ hiệu lực khi chủ kỹ năng đã lật. */
  blockReveal?: (g: HegemonyGame, owner: number, seat: number) => boolean;
  /** Trả true để CẤM `seat` hưởng ứng (đánh `accept`) lúc này (Họa Thủy, Khiêm Sách). Chỉ hiệu lực khi chủ kỹ năng đã lật. */
  blockResponse?: (g: HegemonyGame, owner: number, seat: number, accept: CardName[], source: number | null, context?: RespondContext) => boolean;
  /**
   * Khi người khác (`chooser`) sắp chọn 1 lá của chủ kỹ năng để lấy/bỏ: chủ kỹ năng có thể tự chọn (Văn Ngụy).
   * Trả về lá đã chọn hoặc null. Được gọi cả khi tướng đang úp (kỹ năng tự lật nếu cần).
   */
  redirectPick?: (g: HegemonyGame, owner: number, chooser: number, includeJudge: boolean) => Promise<{ id: number; from: Zone } | null>;
  /** Cẩm nang của chủ kỹ năng không giới hạn khoảng cách (Kỳ Tài). Chỉ hiệu lực khi đã lật. */
  trickNoDistance?: (g: HegemonyGame, owner: number) => boolean;
  /** Trả true để CẤM `chooser` lấy/bỏ trang bị của `target` (Phong Dương). Chỉ hiệu lực khi chủ kỹ năng đã lật. */
  protectEquip?: (g: HegemonyGame, owner: number, chooser: number, target: number) => boolean;
  /** Coi như đang có bảo vật này (Dung Tứ: Ngọc Tỷ) khi tính đại thế lực. Chỉ hiệu lực khi đã lật. */
  virtualTreasure?: (g: HegemonyGame, owner: number) => CardName | null;
  /** Trả true để chủ kỹ năng (người giết) bỏ qua thưởng/phạt khi giết `victim` (Trấn Vệ của Chu Linh). Chỉ hiệu lực khi đã lật. */
  skipRewardPunish?: (g: HegemonyGame, owner: number, victim: number) => boolean;

  // ----- Giai đoạn 12 (nhóm E: tướng có sẵn theo bản Việt hóa, quân chủ) -----
  /** "Giảm 0.5 máu gốc": cộng vào số âm dương ngư của tướng (thường là -1). Có `position` thì chỉ tính khi tướng ở đúng vị trí. */
  fishDelta?: number;
  /** Sát (lá `card`, null = Sát ảo) của chủ kỹ năng lên `target` không giới hạn khoảng cách (Võ Thánh, Liệt Cung). Chỉ hiệu lực khi đã lật. */
  slashNoRange?: (g: HegemonyGame, owner: number, target: number, card: Card | null) => boolean;
  /** Sát của chủ kỹ năng bỏ qua phòng cụ của `target` (Bào Hao + Ngũ Hổ Tướng Đại Kỳ). Chỉ hiệu lực khi đã lật. */
  ignoreArmor?: (g: HegemonyGame, owner: number, target: number) => boolean;
  /** Giảm khoảng cách từ `from` (có thể là người khác) đến mọi người (Nhạn Hàng). Chỉ hiệu lực khi đã lật. */
  auraOffense?: (g: HegemonyGame, owner: number, from: number) => number;
  /** Sau khi mở lá đấu điểm của chủ kỹ năng: trả về số điểm cộng thêm (Ưng Dương). Tướng úp thì tự lật khi trả về khác 0. */
  pindianBonus?: (g: HegemonyGame, owner: number, card: Card) => Promise<number>;

  // ----- Giai đoạn 5 -----
  /** Gợi ý cho bot với kỹ năng viết bằng JSON. */
  bot?: BotHint;
  /** Kỹ năng có sẵn trong code hay nạp từ thư mục content/. */
  origin?: 'builtin' | 'content';
}

/** Gợi ý cho bot: khi nào dùng kỹ năng chủ động, nhắm ai, có đồng ý kích hoạt không. */
export interface BotHint {
  use?: 'always' | 'never' | 'wounded' | 'healthy';
  target?: 'enemy' | 'ally' | 'any';
  /** Bot có đồng ý kích hoạt không. Hàm: quyết định theo view (ví dụ chỉ khi người đang trong lượt là kẻ địch). */
  confirm?: boolean | ((v: PlayerView, h: { isAlly: (seat: number) => boolean }) => boolean);
}

/**
 * Trang bị nào trao kỹ năng nào cho người đang lắp (Trượng Bát Xà Mâu, bảo vật, trang bị viết bằng JSON).
 * Trang bị cần 2 kỹ năng thì thêm khóa "<tên lá>#2" (Mộc Ngưu Lưu Mã).
 */
export const EQUIP_SKILLS: Record<string, string> = { zhangba: 'zhangba' };

/** Kỹ năng mọi người đều có (điều kiện nằm trong available/can): đặt bài lên Chiếu Thư của người cùng thế lực... */
export const GLOBAL_SKILLS: string[] = [];

/** Hàm trợ giúp để TypeScript suy ra đúng kiểu ctx theo tên sự kiện. */
function on<K extends EventName>(t: SkillTrigger<K>): AnyTrigger {
  return t as unknown as AnyTrigger;
}

const handOf = (g: HegemonyGame, seat: number) => g.player(seat).hand;
const nameOf = (g: HegemonyGame, seat: number) => g.player(seat).name;

/** Lấy ngẫu nhiên 1 lá trên tay `from` chuyển tới `to` (hoặc bỏ đi nếu to = null). Trả về lá đó. */
async function takeRandomHand(g: HegemonyGame, from: number, to: number | null, reason: string): Promise<Card | null> {
  const hand = handOf(g, from);
  if (hand.length === 0) return null;
  const id = hand[g.randomInt(hand.length)];
  await g.moveCards([id], { kind: 'hand', seat: from }, to === null ? { kind: 'discard' } : { kind: 'hand', seat: to }, reason);
  return g.card(id);
}

const SUITS = ['spade', 'heart', 'club', 'diamond'] as const;
const SUIT_OPTIONS = ['♠ Bích', '♥ Cơ', '♣ Chuồn', '♦ Rô'];

// ------------------------------------------------------------

export const SKILLS: Record<string, Skill> = {
  // ======================= CƠ CHẾ CHUNG =======================
  transform: {
    id: 'transform',
    name: 'Đổi phó tướng',
    desc: 'Lật phó tướng, bỏ nó ra khỏi ván, rồi nhận ngẫu nhiên một tướng cùng thế lực với chủ tướng làm phó tướng mới (úp). Máu giữ nguyên.',
  },

  mulligan: {
    id: 'mulligan',
    name: 'Đổi bài khởi đầu',
    desc: 'Đầu ván, mỗi người được đổi toàn bộ bài khởi đầu một lần.',
  },

  // ======================= TRANG BỊ =======================
  zhangba: {
    id: 'zhangba',
    name: 'Trượng Bát Xà Mâu',
    desc: 'Vũ khí. Bạn có thể dùng hoặc đánh 2 lá trên tay như 1 lá Sát.',
    active: {
      cards: 'any',
      target: 'one',
      minCards: 2,
      maxCards: 2,
      available: (g, seat) => handOf(g, seat).length >= 2
        && (g.player(seat).flags.shaUsed ?? 0) < g.slashLimit(seat) && g.targetsAs(seat, 'sha').length > 0,
      cardOk: (g, seat, id) => !g.cardBlocked(seat, g.card(id)),
      checkCards: (_g, _seat, ids) => (ids.length === 2 ? null : 'Cần chọn đúng 2 lá'),
      validTarget: (g, seat, t) => g.targetsAs(seat, 'sha').includes(t),
      run: async (g, seat, cardIds, targets) => {
        await g.useCardAs(seat, 'sha', targets, cardIds, { countSlash: true, label: 'Trượng Bát Xà Mâu' });
      },
    },
  },

  // ======================= NGỤY =======================
  // Mô tả theo bản Việt hóa QSanguosha-Hegemony (content/import/qsgs-viet.json).
  gianhung: {
    id: 'gianhung',
    name: 'Gian Hùng',
    desc: 'Sau khi bạn nhận sát thương, bạn có thể thu lấy lá gây sát thương cho bạn.',
    triggers: [on({
      event: 'damaged',
      can: (g, ctx, owner) => ctx.target === owner && ctx.card !== null
        && g.state.processing.includes(ctx.card.id),
      run: async (g, ctx, owner) => {
        await g.moveCards([ctx.card!.id], { kind: 'processing' }, { kind: 'hand', seat: owner }, 'gianhung');
      },
    })],
  },

  phanquy: {
    id: 'phanquy',
    name: 'Phản Quỹ',
    desc: 'Sau khi bạn nhận sát thương, bạn có thể thu lấy 1 lá của nguồn sát thương.',
    triggers: [on({
      event: 'damaged',
      can: (g, ctx, owner) => ctx.target === owner && ctx.source !== null && ctx.source !== owner
        && g.player(ctx.source).alive && g.cardCount(ctx.source) > 0,
      run: async (g, ctx, owner) => {
        const pick = await pickCardFrom(g, owner, ctx.source!, false, `Phản Quỹ: chọn 1 lá của ${nameOf(g, ctx.source!)}`);
        if (pick) await g.moveCards([pick.id], pick.from, { kind: 'hand', seat: owner }, 'phanquy');
      },
    })],
  },

  guicai: {
    id: 'guicai',
    name: 'Quỷ Tài',
    desc: 'Khi phán xét của 1 người có hiệu lực, bạn có thể đánh ra 1 lá (trên tay) để thay thế kết quả phán xét đó.',
    bot: { confirm: false },
    triggers: [on({
      event: 'judged',
      can: (g, ctx, owner) => handOf(g, owner).length > 0 && g.state.processing.includes(ctx.card.id),
      run: async (g, ctx, owner) => {
        const [id] = await g.chooseCards(owner, `Quỷ Tài: đánh 1 lá thay cho kết quả phán định ${cardLabel(ctx.card)} của ${nameOf(g, ctx.seat)}`,
          [...handOf(g, owner)], 0, 1);
        if (id === undefined) return;
        await replaceJudge(g, ctx, owner, id, { kind: 'hand', seat: owner }, false);
      },
    })],
  },

  tiandu: {
    id: 'tiandu',
    name: 'Thiên Khiển',
    desc: 'Sau khi phán xét của bạn có hiệu lực, bạn có thể thu lấy kết quả phán xét.',
    triggers: [
      observe('judged', (g, ctx) => { judgedBy(g).set(ctx.card.id, ctx.seat); }),
      on({
        event: 'cardsMoved',
        can: (g, ctx, owner) => ctx.from.kind === 'processing' && ctx.to.kind === 'discard' && ctx.reason === 'judge'
          && ctx.cardIds.some((id) => judgedBy(g).get(id) === owner && g.state.discardPile.includes(id)),
        run: async (g, ctx, owner) => {
          const ids = ctx.cardIds.filter((id) => judgedBy(g).get(id) === owner && g.state.discardPile.includes(id));
          for (const id of ids) judgedBy(g).delete(id);
          await g.moveCards(ids, { kind: 'discard' }, { kind: 'hand', seat: owner }, 'tiandu');
        },
      }),
    ],
  },

  dike: {
    id: 'dike',
    name: 'Di Kế',
    desc: 'Sau khi bạn nhận sát thương, bạn có thể xem 2 lá bài trên đầu chồng bài rút và giao cho tùy ý người.',
    triggers: [on({
      event: 'damaged',
      can: (_g, ctx, owner) => ctx.target === owner,
      run: async (g, _ctx, owner) => {
        let left: number[] = [];
        for (let i = 0; i < 2; i++) left.push((await g.takeTop({ kind: 'processing' }, 'dike')).id);
        try {
          while (left.length && g.player(owner).alive) {
            const ids = left.length === 1 ? left
              : await g.chooseCards(owner, 'Di Kế: chọn các lá giao cho cùng một người', left, 1, left.length, true);
            const cands = [owner, ...g.alivePlayers().map((p) => p.seat).filter((s) => s !== owner)];
            const [t] = await g.chooseTargets(owner, 'Di Kế: giao các lá đã chọn cho ai', cands, 1, 1, 'ally');
            const to = t ?? owner;
            await g.moveCards(ids, { kind: 'processing' }, { kind: 'hand', seat: to }, 'dike');
            if (to !== owner) g.say(`${nameOf(g, owner)} giao ${ids.length} lá cho ${nameOf(g, to)}.`);
            left = left.filter((x) => !ids.includes(x));
          }
        } finally {
          const rest = left.filter((id) => g.state.processing.includes(id));
          if (rest.length) await g.moveCards(rest, { kind: 'processing' }, { kind: 'discard' }, 'settle');
        }
      },
    })],
  },

  loay: {
    id: 'loay',
    name: 'Lỏa Y',
    desc: 'Khi kết thúc giai đoạn rút bài, bạn có thể bỏ 1 lá; trong lượt này, khi bạn gây sát thương cho mục tiêu của [Sát] hoặc [Quyết Đấu], sát thương này +1.',
    triggers: [
      on({
        event: 'phaseEnd',
        can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'draw' && g.cardCount(owner) > 0,
        run: async (g, _ctx, owner) => {
          const ids = await chooseOwn(g, owner, 'Lỏa Y: bỏ 1 lá', 1, 1);
          if (!ids.length) return;
          await discardOwnCards(g, owner, ids, 'loay');
          g.player(owner).flags.loay = 1;
        },
      }),
      on({
        event: 'beforeDamage',
        compulsory: true,
        can: (g, ctx, owner) => ctx.source === owner && (ctx.cardAs === 'sha' || ctx.cardAs === 'juedou') && ctx.target !== owner
          && g.state.currentSeat === owner && (g.player(owner).flags.loay ?? 0) > 0,
        run: (_g, ctx) => { ctx.amount += 1; },
      }),
    ],
  },

  cuonglie: {
    id: 'cuonglie',
    name: 'Cương Liệt',
    desc: 'Sau khi bạn nhận sát thương, bạn có thể tiến hành phán xét: Đỏ — bạn gây 1 sát thương cho nguồn sát thương; Đen — bạn bỏ 1 lá của nguồn sát thương.',
    triggers: [on({
      event: 'damaged',
      can: (g, ctx, owner) => ctx.target === owner && ctx.source !== null && ctx.source !== owner && g.player(ctx.source).alive,
      run: async (g, ctx, owner) => {
        const src = ctx.source!;
        const card = await g.judge(owner, 'Cương Liệt');
        let red: boolean;
        try { red = isRed(card); } finally { await g.finishJudge(card); }
        if (!g.player(src).alive || !g.player(owner).alive) return;
        if (red) {
          await g.damage({ source: owner, target: src, amount: 1, card: null, cancelled: false });
        } else {
          const pick = await pickCardFrom(g, owner, src, false, `Cương Liệt: chọn 1 lá của ${nameOf(g, src)} để bỏ`);
          if (pick) {
            await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'cuonglie');
            g.say(`${nameOf(g, src)} mất ${cardLabel(g.card(pick.id))}.`);
          }
        }
      },
    })],
  },

  dottap: {
    id: 'dottap',
    name: 'Tập Kích',
    desc: 'Giai đoạn rút bài, bạn có thể chọn rút bớt X lá và chọn X người khác có bài trên tay, thu lấy 1 lá trên tay của mỗi người.',
    triggers: [on({
      event: 'drawPhase',
      can: (g, ctx, owner) => ctx.seat === owner && ctx.count > 0
        && g.alivePlayers().some((p) => p.seat !== owner && p.hand.length > 0 && g.canTarget(owner, p.seat)),
      run: async (g, ctx, owner) => {
        const cands = g.alivePlayers()
          .filter((p) => p.seat !== owner && p.hand.length > 0 && g.canTarget(owner, p.seat))
          .map((p) => p.seat);
        const targets = await g.chooseTargets(owner, `Tập Kích: chọn tối đa ${Math.min(ctx.count, cands.length)} người để lấy bài (mỗi người bớt rút 1 lá)`,
          cands, 1, Math.min(ctx.count, cands.length));
        if (targets.length === 0) return;
        ctx.count -= targets.length;
        for (const t of targets) await takeRandomHand(g, t, owner, 'dottap');
      },
    })],
  },

  cuongtap: {
    id: 'cuongtap',
    name: 'Cường Kích',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác, bạn chọn bỏ 1 Vũ khí hoặc mất 1 máu, bạn gây 1 sát thương cho họ.',
    active: {
      cards: 'none',
      target: 'one',
      available: (g, seat) => !g.player(seat).flags.cuongtap && (g.player(seat).hp > 0 || weaponsOf(g, seat).length > 0),
      validTarget: (g, seat, t) => t !== seat && g.isAliveSeat(t),
      run: async (g, seat, _cards, [t]) => {
        g.player(seat).flags.cuongtap = 1;
        const weapons = weaponsOf(g, seat);
        const opts = [...(weapons.length ? ['Bỏ 1 Vũ khí'] : []), 'Mất 1 máu'];
        const pick = opts.length > 1 ? opts[await g.choose(seat, 'Cường Kích: chọn cách trả giá', opts)] : opts[0];
        if (pick === 'Bỏ 1 Vũ khí') {
          const [id] = await g.chooseCards(seat, 'Cường Kích: chọn Vũ khí để bỏ', weapons, 1, 1, true);
          await discardOwnCards(g, seat, [id ?? weapons[0]], 'cuongtap');
        } else {
          await g.loseHp(seat, 1);
        }
        if (g.player(seat).alive) await g.damage({ source: seat, target: t, amount: 1, card: null, cancelled: false });
      },
    },
  },

  khuynhquoc: {
    id: 'khuynhquoc',
    name: 'Khuynh Quốc',
    desc: 'Bạn có thể chuyển hóa sử dụng/đánh ra lá Đen trên tay thành [Thiểm].',
    convert: (g, seat, card) => (!isRed(card) && !isEquipped(g, seat, card.id) ? ['shan'] : []),
  },

  lacthan: {
    id: 'lacthan',
    name: 'Lạc Thần',
    desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể tiến hành phán xét; nếu kết quả có màu Đen, bạn có thể lặp lại quá trình này. '
      + 'Sau đó bạn thu lấy tất cả kết quả phán xét có màu Đen.',
    triggers: [on({
      event: 'phaseStart',
      can: (_g, ctx, owner) => ctx.seat === owner && ctx.phase === 'start',
      run: async (g, _ctx, owner) => {
        const blacks: number[] = [];
        try {
          for (let i = 0; i < 20 && g.player(owner).alive; i++) {
            const card = await g.judge(owner, 'Lạc Thần');
            if (isRed(card)) { await g.finishJudge(card); break; }
            blacks.push(card.id);
            const again = await g.ask({ type: 'confirm', seat: owner, skill: 'lacthan', prompt: 'Lạc Thần: phán định tiếp?', reveal: false });
            if (again.kind !== 'yes') break;
          }
        } finally {
          const got = blacks.filter((id) => g.state.processing.includes(id));
          if (got.length) {
            await g.moveCards(got, { kind: 'processing' }, g.player(owner).alive ? { kind: 'hand', seat: owner } : { kind: 'discard' }, 'lacthan');
          }
        }
      },
    })],
  },

  // ======================= THỤC =======================
  baohao: {
    id: 'baohao',
    name: 'Bào Hao',
    desc: 'Tỏa định kỹ: • Bạn sử dụng lá [Sát] không giới hạn số lượng. • Khi bạn sử dụng [Sát] thứ 2 trong 1 lượt, bạn rút 1 lá. '
      + '(Ngũ Hổ Tướng Đại Kỳ: [Sát] của bạn bỏ qua phòng cụ của mục tiêu.)',
    slashLimit: Infinity,
    ignoreArmor: (g, owner) => wuhu(g, owner),
    triggers: [on({
      event: 'cardUsed',
      compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && ctx.as === 'sha' && g.state.currentSeat === owner
        && (g.player(owner).flags.shaUsed ?? 0) === 1 && !g.player(owner).flags.baohaoDrew,
      run: async (g, _ctx, owner) => {
        g.player(owner).flags.baohaoDrew = 1;
        await g.draw(owner, 1);
      },
    })],
  },

  longdam: {
    id: 'longdam',
    name: 'Long Đảm',
    desc: '• Bạn có thể chuyển hóa sử dụng/đánh ra [Thiểm] thành [Sát]; sau khi [Sát] này bị triệt tiêu bởi [Thiểm] của mục tiêu, '
      + 'bạn có thể gây 1 sát thương cho 1 người khác ngoại trừ mục tiêu. • Bạn có thể chuyển hóa sử dụng/đánh ra [Sát] thành [Thiểm]; '
      + 'sau khi [Thiểm] này triệt tiêu [Sát] của 1 người, bạn có thể hồi 1 máu cho 1 người khác ngoại trừ người sử dụng [Sát]. '
      + '(Ngũ Hổ Tướng Đại Kỳ: khi bạn sử dụng/đánh ra [Sát] hoặc [Thiểm] bởi »Long Đảm«, bạn rút 1 lá.)',
    convert: (_g, _seat, card) => (card.name === 'sha' ? ['shan'] : card.name === 'shan' ? ['sha'] : []),
    triggers: [
      observe('cardResponded', (g, ctx, owner) => {
        if (ctx.seat === owner && ctx.as === 'shan' && ctx.card.name === 'sha') g.player(owner).flags.longdanShan = 1;
      }),
      on({
        event: 'slashDodged',
        can: (g, ctx, owner) => ctx.source === owner && ctx.card.name === 'shan' && !ctx.card.virtual
          && g.alivePlayers().some((p) => p.seat !== owner && p.seat !== ctx.target && g.canTarget(owner, p.seat)),
        run: async (g, ctx, owner) => {
          const cands = g.alivePlayers().map((p) => p.seat).filter((s) => s !== owner && s !== ctx.target && g.canTarget(owner, s));
          const [t] = await g.chooseTargets(owner, 'Long Đảm: gây 1 sát thương cho ai', cands, 1, 1, 'enemy');
          if (t !== undefined) await g.damage({ source: owner, target: t, amount: 1, card: null, cancelled: false });
        },
      }),
      on({
        event: 'slashDodged',
        can: (g, ctx, owner) => {
          if (ctx.target !== owner || !g.player(owner).flags.longdanShan) return false;
          g.player(owner).flags.longdanShan = 0;
          return g.alivePlayers().some((p) => p.seat !== owner && p.seat !== ctx.source && p.hp < p.maxHp);
        },
        run: async (g, ctx, owner) => {
          const cands = g.alivePlayers().filter((p) => p.seat !== owner && p.seat !== ctx.source && p.hp < p.maxHp).map((p) => p.seat);
          const [t] = await g.chooseTargets(owner, 'Long Đảm: hồi 1 máu cho ai', cands, 1, 1, 'ally');
          if (t !== undefined) await g.recover(t, 1, owner);
        },
      }),
      on({
        event: 'cardUsed',
        compulsory: true,
        can: (g, ctx, owner) => ctx.seat === owner && ((ctx.as === 'sha' && ctx.card.name === 'shan') || (ctx.as === 'shan' && ctx.card.name === 'sha'))
          && wuhu(g, owner),
        run: async (g, _ctx, owner) => { await g.draw(owner, 1); },
      }),
      on({
        event: 'cardResponded',
        compulsory: true,
        can: (g, ctx, owner) => ctx.seat === owner && ((ctx.as === 'sha' && ctx.card.name === 'shan') || (ctx.as === 'shan' && ctx.card.name === 'sha'))
          && wuhu(g, owner),
        run: async (g, _ctx, owner) => { await g.draw(owner, 1); },
      }),
    ],
  },

  vothanh: {
    id: 'vothanh',
    name: 'Võ Thánh',
    desc: '• Bạn có thể chuyển hóa sử dụng/đánh ra 1 lá Đỏ thành [Sát]. • Lá [Sát] RÔ do bạn sử dụng không giới hạn khoảng cách. '
      + '(Ngũ Hổ Tướng Đại Kỳ: lá bất kỳ, không cần Đỏ.)',
    convert: (g, seat, card) => (isRed(card) || wuhu(g, seat) ? ['sha'] : []),
    slashNoRange: (_g, _owner, _t, card) => card?.suit === 'diamond',
  },

  khongthanh: {
    id: 'khongthanh',
    name: 'Không Thành',
    desc: 'Tỏa định kỹ: • Khi bạn trở thành mục tiêu của [Sát]/[Quyết Đấu], nếu bạn không có bài trên tay, hủy bỏ mục tiêu đối với bạn. '
      + '• Ngoài lượt của bạn, khi bạn nhận được bài do người khác giao cho, nếu bạn không có bài trên tay, đặt những lá bài này lên tướng này, gọi là [Cầm]. '
      + '• Khi bắt đầu giai đoạn rút bài, bạn thu lấy tất cả lá [Cầm].',
    slashImmune: (g, owner) => handOf(g, owner).length === 0,
    triggers: [
      on({
        event: 'cardsMoved',
        compulsory: true,
        can: (g, ctx, owner) => ctx.to.kind === 'hand' && ctx.to.seat === owner && g.state.currentSeat !== owner
          && (ctx.from.kind === 'hand' || ctx.from.kind === 'equip') && ctx.from.seat !== owner
          && handOf(g, owner).length > 0 && handOf(g, owner).every((id) => ctx.cardIds.includes(id)),
        run: async (g, ctx, owner) => {
          const ids = ctx.cardIds.filter((id) => handOf(g, owner).includes(id));
          for (const id of ids) tagSet(g, 'cam').add(id);
          await g.moveCards(ids, { kind: 'hand', seat: owner }, { kind: 'special', seat: owner }, 'khongthanh');
          g.say(`${nameOf(g, owner)} đặt ${ids.length} lá lên tướng làm [Cầm].`);
        },
      }),
      on({
        event: 'phaseStart',
        compulsory: true,
        can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'draw' && taggedPile(g, owner, 'cam').length > 0,
        run: async (g, _ctx, owner) => {
          const ids = taggedPile(g, owner, 'cam');
          for (const id of ids) tagSet(g, 'cam').delete(id);
          await g.moveCards(ids, { kind: 'special', seat: owner }, { kind: 'hand', seat: owner }, 'khongthanh');
          g.say(`${nameOf(g, owner)} thu lấy ${ids.length} lá [Cầm].`);
        },
      }),
    ],
  },

  guanxing: {
    id: 'guanxing',
    name: 'Quan Tinh',
    desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể xem X lá bài trên đầu chồng bài rút (X là số người còn sống, tối đa 5), '
      + 'sau đó sắp xếp tùy ý những lá này lên đầu hoặc đáy chồng bài rút.',
    triggers: [guanxingTrigger(false)],
  },

  nhanduc: {
    id: 'nhanduc',
    name: 'Nhân Đức',
    desc: 'Giai đoạn ra bài, bạn có thể đem tùy ý lượng bài trên tay giao cho 1 người khác chưa nhận bài từ kỹ năng này trong giai đoạn này; '
      + 'nếu đây là lần đầu tổng số lá bạn giao bằng kỹ năng này trong giai đoạn này ≥ 2, bạn có thể xem như sử dụng 1 lá cơ bản.',
    active: {
      cards: 'any',
      target: 'one',
      available: (g, seat) => handOf(g, seat).length > 0,
      validTarget: (g, seat, t) => t !== seat && g.isAliveSeat(t) && !g.player(seat).flags[`nhanduc_${t}`],
      run: async (g, seat, cardIds, [t]) => {
        const p = g.player(seat);
        const before = p.flags.nhanduc ?? 0;
        p.flags[`nhanduc_${t}`] = 1;
        await g.moveCards(cardIds, { kind: 'hand', seat }, { kind: 'hand', seat: t }, 'nhanduc');
        p.flags.nhanduc = before + cardIds.length;
        g.say(`${p.name} giao ${cardIds.length} lá cho ${nameOf(g, t)}.`);
        if (before < 2 && p.flags.nhanduc >= 2) await useBasicAs(g, seat, 'Nhân Đức');
      },
    },
  },

  mathuat: {
    id: 'mathuat',
    name: 'Mã Thuật',
    desc: 'Tỏa định kỹ: Khoảng cách từ bạn đến người khác -1.',
    offenseBonus: () => 1,
  },

  thietky: {
    id: 'thietky',
    name: 'Thiết Kỵ',
    desc: 'Sau khi bạn xác định mục tiêu của [Sát], ứng với mỗi mục tiêu, bạn có thể tiến hành phán xét, thực hiện lần lượt: '
      + '- Vô hiệu hóa kỹ năng không phải Tỏa định kỹ của 1 tướng đã mở của mục tiêu trong lượt này; '
      + '- Mục tiêu chọn bỏ 1 lá cùng chất với kết quả phán xét hoặc không thể sử dụng [Thiểm] để hưởng ứng [Sát] này. '
      + '(Ngũ Hổ Tướng Đại Kỳ: vô hiệu hóa tất cả tướng đã mở.)',
    triggers: [on({
      event: 'slashTargeted',
      can: (g, ctx, owner) => ctx.source === owner && !ctx.noDodge && !ctx.cancelled && g.player(ctx.target).alive,
      run: async (g, ctx, owner) => {
        const card = await g.judge(owner, 'Thiết Kỵ');
        let suit: Card['suit'];
        try { suit = card.suit; } finally { await g.finishJudge(card); }
        const t = ctx.target;
        const h = g.heroes[t];
        if (h) {
          const open = (['main', 'deputy'] as const).filter((w) => h[w].revealed && !h[w].removed);
          let chosen: SlotKey[] = open;
          if (!wuhu(g, owner) && open.length > 1) {
            const i = await g.choose(owner, `Thiết Kỵ: vô hiệu hóa kỹ năng tướng nào của ${nameOf(g, t)}`, open.map((w) => g.generalName(h[w].generalId)));
            chosen = [open[i]];
          }
          for (const w of chosen) {
            h[w].suppressedTurn = g.state.turnCount;
            g.say(`Kỹ năng (không phải tỏa định) của ${g.generalName(h[w].generalId)} bị vô hiệu hóa trong lượt này.`);
          }
        }
        const fit = ownCards(g, t).filter((id) => g.card(id).suit === suit);
        const label = SUIT_OPTIONS[SUITS.indexOf(suit)];
        if (fit.length) {
          const i = await g.choose(t, `Thiết Kỵ: bỏ 1 lá ${label} hoặc không thể dùng Thiểm`, [`Bỏ 1 lá ${label}`, 'Không thể dùng Thiểm']);
          if (i === 0) {
            const [id] = await g.chooseCards(t, `Thiết Kỵ: chọn 1 lá ${label} để bỏ`, fit, 1, 1, true);
            await discardOwnCards(g, t, [id ?? fit[0]], 'thietky');
            return;
          }
        }
        ctx.noDodge = true;
      },
    })],
  },

  lietcung: {
    id: 'lietcung',
    name: 'Liệt Cung',
    desc: '• Lá [Sát] bạn sử dụng không giới hạn khoảng cách với mục tiêu có số bài trên tay ≤ bạn. '
      + '• Sau khi bạn xác định từng mục tiêu của [Sát], nếu số máu của họ ≥ bạn, bạn có thể chọn: 1. Mục tiêu không thể sử dụng [Thiểm] để hưởng ứng [Sát] này; '
      + '2. Sát thương từ lá [Sát] này +1 đối với mục tiêu này. (Ngũ Hổ Tướng Đại Kỳ: tầm đánh của bạn +1.)',
    slashNoRange: (g, owner, t) => handOf(g, t).length <= handOf(g, owner).length,
    rangeBonus: (g, owner) => (wuhu(g, owner) ? 1 : 0),
    triggers: [
      on({
        event: 'slashTargeted',
        can: (g, ctx, owner) => ctx.source === owner && !ctx.cancelled && g.player(ctx.target).alive
          && g.player(ctx.target).hp >= g.player(owner).hp,
        run: async (g, ctx) => {
          const i = await g.choose(ctx.source, 'Liệt Cung: chọn 1 mục', ['Mục tiêu không thể dùng Thiểm', 'Sát thương của Sát này +1']);
          if (i === 0) ctx.noDodge = true;
          else liegongBonus(g).add(`${ctx.card.id}:${ctx.target}`);
        },
      }),
      on({
        event: 'beforeDamage',
        compulsory: true,
        can: (g, ctx, owner) => ctx.source === owner && ctx.cardAs === 'sha' && ctx.card !== null
          && liegongBonus(g).has(`${ctx.card.id}:${ctx.target}`),
        run: (g, ctx) => {
          liegongBonus(g).delete(`${ctx.card!.id}:${ctx.target}`);
          ctx.amount += 1;
        },
      }),
      observe('slashEnd', (g, ctx) => { liegongBonus(g).delete(`${ctx.card.id}:${ctx.target}`); }),
    ],
  },

  khieuhan: {
    id: 'khieuhan',
    name: 'Khiêu Hấn',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể lệnh 1 người có tầm đánh tới bạn chọn 1 mục: 1. Họ sử dụng [Sát] với bạn; 2. Lệnh bạn bỏ 1 lá của họ.',
    active: {
      cards: 'none',
      target: 'one',
      available: (g, seat) => !g.player(seat).flags.khieuhan,
      validTarget: (g, seat, t) => t !== seat && g.isAliveSeat(t) && g.distance(t, seat) <= g.attackRange(t),
      run: async (g, seat, _cards, [t]) => {
        g.player(seat).flags.khieuhan = 1;
        const me = nameOf(g, seat);
        const picked = g.canTarget(t, seat) && g.canBeSlashTarget(t, seat)
          ? await g.pickResponse(t, ['sha'], `${me} khiêu khích: dùng Sát vào ${me}? (không thì ${me} bỏ 1 lá của bạn)`, seat, { kind: 'provoke', by: seat })
          : null;
        if (picked) {
          await g.slashOutOfTurn(t, seat, picked.card, picked.as);
          return;
        }
        const pick = await pickCardFrom(g, seat, t, false, `Khiêu Hấn: chọn 1 lá của ${nameOf(g, t)} để bỏ`);
        if (pick) {
          await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'khieuhan');
          g.say(`${nameOf(g, t)} không dùng Sát, mất ${cardLabel(g.card(pick.id))}.`);
        }
      },
    },
  },

  yizhi: {
    id: 'yizhi',
    name: 'Di Chí',
    desc: 'Phó tướng kỹ, giảm 0.5 máu gốc: Nếu chủ tướng của bạn có »Quan Tinh«: số lá được xem luôn là 5; không có »Quan Tinh«: bạn nhận »Quan Tinh«.',
    position: 'deputy',
    fishDelta: -1,
    triggers: [guanxingTrigger(true)],
  },

  thienphu: {
    id: 'thienphu',
    name: 'Thiên Phúc',
    desc: 'Chủ tướng kỹ, Trận pháp kỹ: Trong lượt của người có trong quan hệ đội hình với bạn (kể cả bạn), bạn có »Khán Phá« '
      + '(dùng 1 lá Đen trên tay như [Vô Giải Khả Kích]).',
    position: 'main',
    convert: (g, seat, card) => {
      const f = g.formation(seat);
      if (f.length < 2 || !f.includes(g.state.currentSeat)) return [];
      const kanpo = SKILLS.kanpo?.convert;
      if (kanpo) return kanpo(g, seat, card);
      return !isRed(card) && !isEquipped(g, seat, card.id) ? ['wuxie'] : [];
    },
  },

  // ======================= NGÔ =======================
  khacky: {
    id: 'khacky',
    name: 'Khắc Kỷ',
    desc: 'Tỏa định kỹ: Khi bắt đầu giai đoạn bỏ bài, nếu trong giai đoạn ra bài bạn không sử dụng các lá bài khác màu với nhau, giới hạn trữ bài của bạn trong lượt này +4.',
    triggers: [
      observe('cardUsed', (g, ctx, owner) => {
        if (ctx.seat !== owner || g.state.currentSeat !== owner || g.state.phase !== 'play' || isColorless(ctx.card)) return;
        g.player(owner).flags[isRed(ctx.card) ? 'keji_red' : 'keji_black'] = 1;
      }),
      on({
        event: 'phaseStart',
        compulsory: true,
        can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'discard'
          && !(g.player(owner).flags.keji_red && g.player(owner).flags.keji_black)
          && handOf(g, owner).length > g.handLimit(owner),
        run: (g, _ctx, owner) => {
          const f = g.player(owner).flags;
          f.turn_handLimitDelta = (f.turn_handLimitDelta ?? 0) + 4;
          g.say(`Giới hạn trữ bài của ${nameOf(g, owner)} lượt này +4.`);
        },
      }),
    ],
  },

  mouduan: {
    id: 'mouduan',
    name: 'Mưu Đoạn',
    desc: 'Khi bắt đầu giai đoạn kết thúc, nếu trong giai đoạn ra bài của lượt này bạn đã sử dụng bài từ 4 chất khác nhau hoặc 3 loại bài khác nhau, '
      + 'bạn có thể di chuyển 1 lá trên bàn chơi (trang bị hoặc lá trong khu vực phán định).',
    triggers: [
      observe('cardUsed', (g, ctx, owner) => {
        if (ctx.seat !== owner || g.state.currentSeat !== owner || g.state.phase !== 'play') return;
        const f = g.player(owner).flags;
        if (!isColorless(ctx.card)) f[`mouduan_s_${ctx.card.suit}`] = 1;
        const type = CARD_INFO[ctx.as]?.type;
        if (type) f[`mouduan_t_${type === 'delayed' ? 'trick' : type}`] = 1;
      }),
      on({
        event: 'phaseStart',
        can: (g, ctx, owner) => {
          if (ctx.seat !== owner || ctx.phase !== 'end') return false;
          const f = g.player(owner).flags;
          const suits = SUITS.filter((s) => f[`mouduan_s_${s}`]).length;
          const types = ['basic', 'trick', 'equip'].filter((t) => f[`mouduan_t_${t}`]).length;
          return (suits >= 4 || types >= 3) && boardMoves(g).length > 0;
        },
        run: async (g, _ctx, owner) => { await moveBoardCard(g, owner, 'Mưu Đoạn'); },
      }),
    ],
  },

  khonhuc: {
    id: 'khonhuc',
    name: 'Khổ Nhục',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá, thực hiện lần lượt: bạn mất 1 máu; bạn rút 3 lá; giới hạn sử dụng [Sát] của bạn trong giai đoạn này +1.',
    active: {
      cards: 'none',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.khonhuc && g.player(seat).hp > 0 && g.cardCount(seat) > 0,
      run: async (g, seat) => {
        const p = g.player(seat);
        p.flags.khonhuc = 1;
        const ids = await chooseOwn(g, seat, 'Khổ Nhục: bỏ 1 lá', 1, 1);
        await discardOwnCards(g, seat, ids, 'khonhuc');
        await g.loseHp(seat, 1);
        if (!p.alive) return;
        await g.draw(seat, 3);
        p.flags.turn_extraSlash = (p.flags.turn_extraSlash ?? 0) + 1;
      },
    },
  },

  chehoanh: {
    id: 'chehoanh',
    name: 'Chế Hành',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ tối đa X lá (X là giới hạn máu của bạn), bạn rút số lá tương ứng. '
      + 'Đang lắp Định Lan Dạ Minh Châu thì không giới hạn số lá. (Đơn giản hóa: chỉ bỏ bài trên tay.)',
    active: {
      cards: 'any',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.chehoanh && handOf(g, seat).length > 0,
      checkCards: (g, seat, ids) => (g.equipOf(seat, 'treasure')?.name === 'mingzhu' || ids.length <= g.player(seat).maxHp
        ? null : `Chỉ được bỏ tối đa ${g.player(seat).maxHp} lá (lắp Định Lan Dạ Minh Châu thì không giới hạn)`),
      run: async (g, seat, cardIds) => {
        g.player(seat).flags.chehoanh = 1;
        await g.moveCards(cardIds, { kind: 'hand', seat }, { kind: 'discard' }, 'chehoanh');
        await g.draw(seat, cardIds.length);
      },
    },
  },

  anhtu: {
    id: 'anhtu',
    name: 'Anh Tư',
    desc: 'Tỏa định kỹ: • Giai đoạn rút bài, bạn rút thêm 1 lá. • Giới hạn trữ bài của bạn bằng với giới hạn máu.',
    handLimitBonus: (g, owner) => Math.max(0, g.player(owner).maxHp - g.player(owner).hp),
    triggers: [on({
      event: 'drawPhase',
      compulsory: true,
      can: (_g, ctx, owner) => ctx.seat === owner,
      run: (_g, ctx) => { ctx.count += 1; },
    })],
  },

  phangian: {
    id: 'phangian',
    name: 'Phản Gián',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể mở ra 1 lá bài trên tay và giao cho 1 người khác, lệnh họ chọn 1 mục: '
      + '1. Mở ra tất cả bài trên tay và bỏ đi tất cả lá của họ có cùng chất với lá bạn đã mở; 2. Mất 1 máu.',
    active: {
      cards: 'none',
      target: 'one',
      available: (g, seat) => !g.player(seat).flags.phangian && handOf(g, seat).length > 0,
      validTarget: (g, seat, t) => t !== seat && g.isAliveSeat(t),
      run: async (g, seat, _cards, [t]) => {
        g.player(seat).flags.phangian = 1;
        const [id] = await g.chooseCards(seat, `Phản Gián: chọn 1 lá để mở ra và giao cho ${nameOf(g, t)}`, [...handOf(g, seat)], 1, 1);
        const cid = id ?? handOf(g, seat)[0];
        if (cid === undefined) return;
        const card = g.card(cid);
        g.say(`${nameOf(g, seat)} mở ${cardLabel(card)} và giao cho ${nameOf(g, t)}.`);
        await g.moveCards([cid], { kind: 'hand', seat }, { kind: 'hand', seat: t }, 'phangian');
        const label = SUIT_OPTIONS[SUITS.indexOf(card.suit)];
        const i = await g.choose(t, `Phản Gián của ${nameOf(g, seat)}: chọn 1 mục`, [`Mở bài trên tay, bỏ mọi lá ${label}`, 'Mất 1 máu']);
        if (i === 1) { await g.loseHp(t, 1); return; }
        g.say(`${nameOf(g, t)} mở bài trên tay: ${handOf(g, t).map((x) => cardLabel(g.card(x))).join(', ') || '(không có)'}.`);
        const lose = ownCards(g, t).filter((x) => g.card(x).suit === card.suit);
        await discardOwnCards(g, t, lose, 'phangian');
      },
    },
  },

  qianxun: {
    id: 'qianxun',
    name: 'Khiêm Tốn',
    desc: 'Tỏa định kỹ: • Khi bạn trở thành mục tiêu của [Thuận Thủ Khiên Dương], hủy bỏ mục tiêu đối với bạn. '
      + '• Khi [Lạc Bất Tư Thục] tiến vào vùng phán xét của bạn, đưa lá đó vào chồng bài bỏ.',
    triggers: [
      on({
        event: 'trickTargeted',
        compulsory: true,
        can: (_g, ctx, owner) => ctx.target === owner && ctx.name === 'shunshou' && !ctx.cancelled,
        run: (g, ctx, owner) => { ctx.cancelled = true; g.say(`Thuận Thủ Khiên Dương không có hiệu lực với ${nameOf(g, owner)}.`); },
      }),
      ...judgeAreaGuard('qianxun', (g, id) => g.delayedName(id) === 'lebu'),
    ],
  },

  duoshi: {
    id: 'duoshi',
    name: 'Độ Thế',
    desc: 'Bốn lần trong giai đoạn ra bài, bạn có thể chuyển hóa sử dụng bài Đỏ trên tay thành [Dĩ Dật Đãi Lao].',
    convert: (g, seat, card) => (isRed(card) && !isEquipped(g, seat, card.id) && g.state.currentSeat === seat
      && g.state.phase === 'play' && (g.player(seat).flags.duoshi ?? 0) < 4 ? ['yiyi'] : []),
    triggers: [observe('cardUsed', (g, ctx, owner) => {
      if (ctx.seat === owner && ctx.as === 'yiyi' && ctx.card.name !== 'yiyi' && g.state.currentSeat === owner) {
        g.player(owner).flags.duoshi = (g.player(owner).flags.duoshi ?? 0) + 1;
      }
    })],
  },

  kichngang: {
    id: 'kichngang',
    name: 'Hùng Dũng',
    desc: 'Sau khi bạn xác định hoặc trở thành mục tiêu của [Sát] Đỏ hoặc [Quyết Đấu], bạn có thể rút 1 lá.',
    triggers: [
      on({
        event: 'cardUsed',
        can: (_g, ctx, owner) => ctx.seat === owner && ctx.targets.length > 0
          && ((ctx.as === 'sha' && isRed(ctx.card) && !isColorless(ctx.card)) || ctx.as === 'juedou'),
        run: async (g, _ctx, owner) => { await g.draw(owner, 1); },
      }),
      on({
        event: 'slashTargeted',
        can: (_g, ctx, owner) => ctx.target === owner && isRed(ctx.card) && !isColorless(ctx.card),
        run: async (g, _ctx, owner) => { await g.draw(owner, 1); },
      }),
      on({
        event: 'trickTargeted',
        can: (_g, ctx, owner) => ctx.target === owner && ctx.name === 'juedou' && ctx.user !== owner,
        run: async (g, _ctx, owner) => { await g.draw(owner, 1); },
      }),
    ],
  },

  yingyang: {
    id: 'yingyang',
    name: 'Ưng Dương',
    desc: 'Sau khi mở lá đấu điểm của bạn, bạn có thể lệnh lá này +3 hoặc -3 điểm trong lần đấu điểm này (lớn nhất là K, nhỏ nhất là A).',
    pindianBonus: async (g, owner, card) => {
      const i = await g.choose(owner, `Ưng Dương: lá đấu điểm của bạn là ${cardLabel(card)}`, ['+3 điểm', '-3 điểm', 'Không dùng']);
      return i === 0 ? 3 : i === 1 ? -3 : 0;
    },
  },

  hunshang: {
    id: 'hunshang',
    name: 'Hồn Thương',
    desc: 'Phó tướng kỹ, giảm 0.5 máu gốc: Khi bắt đầu giai đoạn chuẩn bị, nếu số máu của bạn là 1, trong lượt này bạn có kỹ năng »Anh Tư« và »Anh Hồn«.',
    position: 'deputy',
    fishDelta: -1,
    triggers: [on({
      event: 'phaseStart',
      compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'start' && g.player(owner).hp === 1,
      run: async (g, ctx, owner) => {
        g.grantSkill(owner, 'anhtu', true);
        if (SKILLS.yinghun_sunjian) {
          g.grantSkill(owner, 'yinghun_sunjian', true);
          await runGrantedNow(g, owner, 'yinghun_sunjian', 'phaseStart', ctx);
        }
      },
    })],
  },

  doanbinh: {
    id: 'doanbinh',
    name: 'Đoản Binh',
    desc: 'Sau khi bạn chỉ định mục tiêu cho [Sát], bạn có thể chỉ định thêm 1 mục tiêu ở khoảng cách 1.',
    triggers: [on({
      event: 'cardUsed',
      can: (g, ctx, owner) => ctx.seat === owner && ctx.as === 'sha' && ctx.targets.length >= 1
        && doanBinhCandidates(g, owner, ctx.targets).length > 0,
      run: async (g, ctx, owner) => {
        const [t] = await g.chooseTargets(owner, 'Đoản Binh: chọn thêm 1 mục tiêu', doanBinhCandidates(g, owner, ctx.targets), 1, 1);
        if (t !== undefined) {
          ctx.targets.push(t); // engine đang duyệt chính mảng này nên mục tiêu mới sẽ được xử lý
          g.say(`${nameOf(g, owner)} thêm mục tiêu ${nameOf(g, t)}.`);
        }
      },
    })],
  },

  phantan: {
    id: 'phantan',
    name: 'Phấn Tấn',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá và lựa chọn 1 người khác, khoảng cách từ bạn đến họ là 1 trong lượt này.',
    active: {
      cards: 'one',
      target: 'one',
      available: (g, seat) => !g.player(seat).flags.phantan && handOf(g, seat).length > 0,
      validTarget: (g, seat, t) => t !== seat && g.isAliveSeat(t) && g.distance(seat, t) > 1,
      run: async (g, seat, cardIds, [t]) => {
        const p = g.player(seat);
        p.flags.phantan = 1;
        p.flags.fenxunTarget = t + 1; // +1 để phân biệt với "chưa có" (0)
        await g.moveCards(cardIds, { kind: 'hand', seat }, { kind: 'discard' }, 'phantan');
        g.say(`Khoảng cách từ ${p.name} đến ${nameOf(g, t)} là 1 trong lượt này.`);
      },
    },
  },

  batkhuat: {
    id: 'batkhuat',
    name: 'Bất Khuất',
    desc: 'Tỏa định kỹ: Khi bạn trong trạng thái hấp hối, bạn mở 1 lá trên đầu chồng bài rút và đặt lên tướng này, gọi là [Sang]; nếu [Sang] mới '
      + 'khác điểm với mọi [Sang] khác: bạn hồi máu đến 1; cùng điểm: bạn đưa [Sang] này vào chồng bài bỏ.',
    triggers: [on({
      event: 'dying',
      compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && g.player(owner).hp <= 0,
      run: async (g, _ctx, owner) => {
        const p = g.player(owner);
        const ranks = taggedPile(g, owner, 'sang').map((id) => g.card(id).rank);
        const card = await g.takeTop({ kind: 'special', seat: owner }, 'batkhuat');
        tagSet(g, 'sang').add(card.id);
        g.say(`${p.name} mở ${g.labelAs(card, card.name)} làm [Sang].`);
        if (ranks.includes(card.rank)) {
          g.say('Trùng điểm với [Sang] cũ, [Sang] này vào chồng bài bỏ.');
          tagSet(g, 'sang').delete(card.id);
          await g.moveCards([card.id], { kind: 'special', seat: owner }, { kind: 'discard' }, 'batkhuat');
        } else {
          await g.recover(owner, 1 - p.hp, owner);
        }
      },
    })],
  },

  fenji: {
    id: 'fenji',
    name: 'Phấn Kích',
    desc: 'Khi bắt đầu giai đoạn kết thúc của 1 người, nếu họ không có bài trên tay, bạn có thể lệnh cho họ rút 2 lá, sau đó bạn mất 1 máu.',
    bot: { confirm: (v, h) => h.isAlly(v.currentSeat) && v.players[v.me].hp > 1 },
    triggers: [on({
      event: 'phaseStart',
      can: (g, ctx, owner) => ctx.phase === 'end' && g.player(ctx.seat).alive && handOf(g, ctx.seat).length === 0 && g.player(owner).hp > 0,
      run: async (g, ctx, owner) => {
        await g.draw(ctx.seat, 2);
        await g.loseHp(owner, 1);
      },
    })],
  },

  // ======================= QUẦN =======================
  vosong: {
    id: 'vosong',
    name: 'Vô Song',
    desc: 'Tỏa định kỹ: • Mục tiêu [Sát] của bạn cần sử dụng 2 [Thiểm] để triệt tiêu. • Người [Quyết Đấu] với bạn cần đánh ra 2 [Sát] mỗi lần. '
      + '• Sau khi bạn chọn mục tiêu cho [Quyết Đấu] phi chuyển hóa, bạn có thể chọn thêm tối đa 2 người làm mục tiêu.',
    triggers: [
      on({
        event: 'slashTargeted',
        compulsory: true,
        can: (_g, ctx, owner) => ctx.source === owner,
        run: (_g, ctx) => { ctx.shanNeeded = Math.max(ctx.shanNeeded, 2); },
      }),
      on({
        event: 'duelStarted',
        compulsory: true,
        can: (_g, ctx, owner) => ctx.user === owner || ctx.target === owner,
        run: (_g, ctx, owner) => {
          const opponent = ctx.user === owner ? ctx.target : ctx.user;
          ctx.need[opponent] = Math.max(ctx.need[opponent] ?? 1, 2);
        },
      }),
      on({
        event: 'cardUsed',
        can: (g, ctx, owner) => ctx.seat === owner && ctx.as === 'juedou' && ctx.card.name === 'juedou' && !ctx.card.virtual
          && ctx.targets.length >= 1 && duelExtra(g, owner, ctx.targets).length > 0,
        run: async (g, ctx, owner) => {
          const extra = await g.chooseTargets(owner, 'Vô Song: chọn thêm tối đa 2 mục tiêu cho Quyết Đấu', duelExtra(g, owner, ctx.targets), 0, 2, 'enemy');
          for (const t of extra) if (!ctx.targets.includes(t)) ctx.targets.push(t);
          if (extra.length) g.say(`${nameOf(g, owner)} thêm mục tiêu Quyết Đấu: ${extra.map((t) => nameOf(g, t)).join(', ')}.`);
        },
      }),
    ],
  },

  capcuu: {
    id: 'capcuu',
    name: 'Cấp Cứu',
    desc: 'Ngoài lượt của bạn, bạn có thể chuyển hóa sử dụng bài Đỏ thành [Đào].',
    convert: (g, seat, card) => (isRed(card) && g.state.currentSeat !== seat ? ['tao'] : []),
  },

  chuli: {
    id: 'chuli',
    name: 'Trừ Lệ',
    desc: 'Một lần trong giai đoạn ra bài, nếu bạn có bài, bạn có thể chọn tối đa 3 người khác có thế lực khác nhau (hoặc chưa có thế lực) và có bài: '
      + 'bạn bỏ đi 1 lá của bạn và 1 lá của mỗi người đó; người mất đi lá BÍCH bởi kỹ năng này rút 1 lá.',
    bot: { use: 'always' },
    active: {
      cards: 'none',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.chuli && g.cardCount(seat) > 0 && chuliCands(g, seat).length > 0,
      run: async (g, seat) => {
        g.player(seat).flags.chuli = 1;
        const picked = await g.chooseTargets(seat, 'Trừ Lệ: chọn tối đa 3 người có thế lực khác nhau', chuliCands(g, seat), 1, 3, 'enemy');
        const seen = new Set<string>();
        const targets = picked.filter((t) => {
          const k = g.shownKingdom(t);
          if (k === null) return true;
          const key = k === 'careerist' ? `c${t}` : k;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const spade: number[] = [];
        const mine = await chooseOwn(g, seat, 'Trừ Lệ: bỏ 1 lá của bạn', 1, 1);
        if (mine.length) {
          if (g.card(mine[0]).suit === 'spade') spade.push(seat);
          await discardOwnCards(g, seat, mine, 'chuli');
        }
        for (const t of targets) {
          if (!g.player(t).alive || g.cardCount(t) === 0) continue;
          const pick = await pickCardFrom(g, seat, t, false, `Trừ Lệ: chọn 1 lá của ${nameOf(g, t)} để bỏ`);
          if (!pick) continue;
          if (g.card(pick.id).suit === 'spade') spade.push(t);
          await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'chuli');
          g.say(`${nameOf(g, t)} mất ${cardLabel(g.card(pick.id))}.`);
        }
        for (const s of spade) if (g.player(s).alive) await g.draw(s, 1);
      },
    },
  },

  jianchu: {
    id: 'jianchu',
    name: 'Kiện Xuất',
    desc: 'Sau khi bạn xác định mục tiêu của [Sát], ứng với mỗi mục tiêu, bạn có thể bỏ 1 lá của họ; nếu lá bị bỏ là: '
      + 'trang bị — họ không thể sử dụng [Thiểm] để hưởng ứng; không phải trang bị — họ thu lấy [Sát] mà bạn sử dụng (sau khi [Sát] xử lý xong với họ).',
    triggers: [
      on({
        event: 'slashTargeted',
        can: (g, ctx, owner) => ctx.source === owner && !ctx.cancelled && g.player(ctx.target).alive && g.cardCount(ctx.target) > 0,
        run: async (g, ctx, owner) => {
          const t = ctx.target;
          const pick = await pickCardFrom(g, owner, t, false, `Kiện Xuất: chọn 1 lá của ${nameOf(g, t)} để bỏ`);
          if (!pick) return;
          const equip = g.card(pick.id).type === 'equip';
          await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'jianchu');
          g.say(`${nameOf(g, t)} mất ${cardLabel(g.card(pick.id))}.`);
          if (equip) ctx.noDodge = true;
          else jianchuGive(g).add(`${ctx.card.id}:${t}`);
        },
      }),
      on({
        event: 'slashEnd',
        compulsory: true,
        can: (g, ctx, owner) => ctx.source === owner && jianchuGive(g).has(`${ctx.card.id}:${ctx.target}`),
        run: async (g, ctx) => {
          jianchuGive(g).delete(`${ctx.card.id}:${ctx.target}`);
          if (ctx.card.virtual || !g.state.processing.includes(ctx.card.id) || !g.player(ctx.target).alive) return;
          await g.moveCards([ctx.card.id], { kind: 'processing' }, { kind: 'hand', seat: ctx.target }, 'jianchu');
          g.say(`${nameOf(g, ctx.target)} thu lấy lá Sát.`);
        },
      }),
    ],
  },

  hoansat: {
    id: 'hoansat',
    name: 'Hoàn Sát',
    desc: 'Tỏa định kỹ: Trong lượt của bạn, khi có người vào trạng thái hấp hối, người khác (ngoài bạn) không trong trạng thái hấp hối không thể sử dụng [Đào].',
    blockSave: (g, owner, helper, dying) => g.state.currentSeat === owner && helper !== owner && helper !== dying,
  },

  weimu: {
    id: 'weimu',
    name: 'Duy Mạc',
    desc: 'Tỏa định kỹ: • Khi bạn trở thành mục tiêu của công cụ phổ thông Đen, hủy bỏ mục tiêu đối với bạn. '
      + '• Khi có lá Đen tiến vào vùng phán xét của bạn, đưa lá đó vào chồng bài bỏ.',
    triggers: [
      on({
        event: 'trickTargeted',
        compulsory: true,
        can: (_g, ctx, owner) => ctx.target === owner && ctx.user !== owner && !ctx.cancelled
          && CARD_INFO[ctx.name]?.type === 'trick' && !isRed(ctx.card) && !isColorless(ctx.card),
        run: (g, ctx, owner) => { ctx.cancelled = true; g.say(`Duy Mạc: ${CARD_INFO[ctx.name].label} Đen không có hiệu lực với ${nameOf(g, owner)}.`); },
      }),
      ...judgeAreaGuard('weimu', (g, id) => !isRed(g.card(id))),
    ],
  },

  luanwu: {
    id: 'luanwu',
    name: 'Loạn Vũ',
    desc: 'Hạn định kỹ: Giai đoạn ra bài, bạn có thể phát động kỹ năng này, lệnh tất cả người khác chọn 1 mục: '
      + '1. Họ sử dụng [Sát] với người có khoảng cách nhỏ nhất; 2. Họ mất 1 máu.',
    bot: { use: 'always' },
    active: {
      cards: 'none',
      target: 'none',
      available: (g, seat) => !limited(g).has(`luanwu:${seat}`),
      run: async (g, seat) => {
        limited(g).add(`luanwu:${seat}`);
        for (const t of g.aliveSeatsFrom(seat).filter((s) => s !== seat)) {
          if (!g.player(t).alive) continue;
          const others = g.alivePlayers().map((p) => p.seat).filter((s) => s !== t && Number.isFinite(g.distance(t, s)));
          const min = Math.min(...others.map((s) => g.distance(t, s)));
          const nearest = others.filter((s) => g.distance(t, s) === min && g.canTarget(t, s) && g.canBeSlashTarget(t, s));
          const picked = nearest.length
            ? await g.pickResponse(t, ['sha'], `Loạn Vũ: dùng Sát vào người gần nhất (${nearest.map((s) => nameOf(g, s)).join(', ')}), nếu không bạn mất 1 máu`, seat)
            : null;
          if (picked) {
            const [v] = nearest.length > 1 ? await g.chooseTargets(t, 'Loạn Vũ: chọn mục tiêu của Sát', nearest, 1, 1, 'enemy') : nearest;
            await g.slashOutOfTurn(t, v ?? nearest[0], picked.card, picked.as);
          } else {
            await g.loseHp(t, 1);
          }
        }
      },
    },
  },

  lijian: {
    id: 'lijian',
    name: 'Ly Gián',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá và lựa chọn 2 người khác có giới tính nam, lệnh người chọn sau xem như sử dụng [Quyết Đấu] với người chọn trước.',
    bot: { use: 'always' },
    active: {
      cards: 'one',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.lijian && handOf(g, seat).length > 0 && lijianCands(g, seat).length >= 2,
      run: async (g, seat, cardIds) => {
        g.player(seat).flags.lijian = 1;
        await g.moveCards(cardIds, { kind: 'hand', seat }, { kind: 'discard' }, 'lijian');
        const ts = await g.chooseTargets(seat, 'Ly Gián: chọn 2 người nam (người chọn trước bị Quyết Đấu, người chọn sau dùng Quyết Đấu)',
          lijianCands(g, seat), 2, 2, 'enemy');
        if (ts.length < 2) return;
        const [victim, user] = ts;
        if (!g.canBeSlashTarget(user, victim)) { g.say(`${nameOf(g, victim)} không thể là mục tiêu của Quyết Đấu.`); return; }
        await g.useCardAs(user, 'juedou', [victim], [], { label: 'Ly Gián' });
      },
    },
  },

  benguyet: {
    id: 'benguyet',
    name: 'Bế Nguyệt',
    desc: 'Khi bắt đầu giai đoạn kết thúc, bạn có thể rút 1 lá.',
    triggers: [on({
      event: 'phaseStart',
      can: (_g, ctx, owner) => ctx.seat === owner && ctx.phase === 'end',
      run: async (g, _ctx, owner) => { await g.draw(owner, 1); },
    })],
  },

  loikich: {
    id: 'loikich',
    name: 'Lôi Kích',
    desc: 'Khi bạn sử dụng/đánh ra [Thiểm], bạn có thể lệnh 1 người khác tiến hành phán xét; nếu kết quả có chất BÍCH, bạn gây 2 sát thương Lôi cho họ.',
    triggers: [on({
      event: 'cardResponded',
      can: (_g, ctx, owner) => ctx.seat === owner && ctx.as === 'shan',
      run: async (g, _ctx, owner) => {
        const cands = g.alivePlayers().filter((p) => p.seat !== owner && g.canTarget(owner, p.seat)).map((p) => p.seat);
        const [t] = await g.chooseTargets(owner, 'Lôi Kích: chọn 1 người phải phán định', cands, 0, 1);
        if (t === undefined) return;
        const card = await g.judge(t, 'Lôi Kích');
        let spade: boolean;
        try { spade = card.suit === 'spade'; } finally { await g.finishJudge(card); }
        if (spade) await g.damage({ source: owner, target: t, amount: 2, card: null, nature: 'thunder', cancelled: false });
      },
    })],
  },

  guidao: {
    id: 'guidao',
    name: 'Quỷ Đạo',
    desc: 'Khi phán xét của 1 người có hiệu lực, bạn có thể đánh ra 1 lá Đen (trên tay hoặc trang bị) để hoán đổi kết quả phán xét đó (bạn thu lấy lá cũ).',
    bot: { confirm: false },
    triggers: [on({
      event: 'judged',
      can: (g, ctx, owner) => ownCards(g, owner).some((id) => !isRed(g.card(id))) && g.state.processing.includes(ctx.card.id),
      run: async (g, ctx, owner) => {
        const blacks = ownCards(g, owner).filter((id) => !isRed(g.card(id)));
        const [id] = await g.chooseCards(owner, `Quỷ Đạo: đánh 1 lá Đen để đổi kết quả phán định ${cardLabel(ctx.card)} của ${nameOf(g, ctx.seat)}`, blacks, 0, 1, true);
        if (id === undefined) return;
        const z = zoneOfOwn(g, owner, id);
        if (z) await replaceJudge(g, ctx, owner, id, z, true);
      },
    })],
  },

  qushi: {
    id: 'qushi',
    name: 'Khu Thỉ',
    desc: 'Tỏa định kỹ: Giai đoạn ra bài của bạn, sau khi lá [Sát] do bạn sử dụng kết toán xong, nếu [Sát] này đã bị triệt tiêu, '
      + 'giới hạn sử dụng [Sát] và số mục tiêu của [Sát] do bạn sử dụng trong giai đoạn này +1.',
    triggers: [on({
      event: 'slashDodged',
      compulsory: true,
      can: (g, ctx, owner) => ctx.source === owner && g.state.currentSeat === owner && g.state.phase === 'play'
        && g.player(owner).flags.qushiCard !== ctx.card.id,
      run: (g, ctx, owner) => {
        const f = g.player(owner).flags;
        f.qushiCard = ctx.card.id;
        f.turn_extraSlash = (f.turn_extraSlash ?? 0) + 1;
        f.turn_extraSlashTargets = (f.turn_extraSlashTargets ?? 0) + 1;
        g.say(`${nameOf(g, owner)}: giới hạn Sát và số mục tiêu của Sát trong giai đoạn này +1.`);
      },
    })],
  },

  yanxing: {
    id: 'yanxing',
    name: 'Nhạn Hàng',
    desc: 'Trận pháp kỹ: Nếu bạn có trong quan hệ đội hình, khoảng cách từ người cùng đội hình với bạn (kể cả bạn) đến người khác -X '
      + '(X là số người khác có cùng đội hình với bạn).',
    auraOffense: (g, owner, from) => {
      const f = g.formation(owner);
      return f.length >= 2 && f.includes(from) ? f.length - 1 : 0;
    },
  },

  yicong: {
    id: 'yicong',
    name: 'Nghĩa Tòng',
    desc: 'Chủ tướng kỹ, giảm 0.5 máu gốc: Sau khi lá [Sát] do người khác cùng thế lực với bạn sử dụng kết toán xong, nếu [Sát] này đã bị triệt tiêu, '
      + 'họ có thể lệnh bạn thu lấy [Sát] này.',
    position: 'main',
    fishDelta: -1,
    triggers: [
      observe('slashDodged', (g, ctx) => { dodgedSlash(g).add(ctx.card.id); }),
      on({
        event: 'slashEnd',
        compulsory: true,
        can: (g, ctx, owner) => ctx.source !== owner && dodgedSlash(g).has(ctx.card.id) && !ctx.card.virtual
          && g.state.processing.includes(ctx.card.id) && g.isSameFaction(ctx.source, owner),
        run: async (g, ctx, owner) => {
          dodgedSlash(g).delete(ctx.card.id);
          const ok = await g.ask({ type: 'confirm', seat: ctx.source, skill: 'yicong', reveal: false,
            prompt: `Nghĩa Tòng: để ${nameOf(g, owner)} thu lấy lá Sát vừa bị né?` });
          if (ok.kind !== 'yes' || !g.state.processing.includes(ctx.card.id)) return;
          await g.moveCards([ctx.card.id], { kind: 'processing' }, { kind: 'hand', seat: owner }, 'yicong');
          g.say(`${nameOf(g, owner)} thu lấy lá Sát.`);
        },
      }),
    ],
  },

  tuthu: {
    id: 'tuthu',
    name: 'Tự Thủ',
    desc: 'Giai đoạn bốc bài, bạn có thể bốc thêm X lá (X = số thế lực đã lộ diện). Nếu làm vậy, lượt này bạn không thể chọn người khác làm mục tiêu.',
    triggers: [on({
      event: 'drawPhase',
      can: (_g, ctx, owner) => ctx.seat === owner,
      run: (g, ctx, owner) => {
        ctx.count += g.revealedFactionCount();
        g.player(owner).flags.tuthu = 1;
      },
    })],
    restrictTarget: (g, owner, target) => target !== owner && g.state.currentSeat === owner
      && (g.player(owner).flags.tuthu ?? 0) > 0,
  },

  tongthat: {
    id: 'tongthat',
    name: 'Tông Thất',
    desc: 'Tỏa định. Giới hạn bài trên tay của bạn + X (X = số thế lực đã lộ diện).',
    handLimitBonus: (g) => g.revealedFactionCount(),
  },
};

// ------------------------------------------------------------ Trợ giúp cho kỹ năng có sẵn

/** "Người quan sát": trigger không bao giờ kích hoạt, chỉ ghi nhận sự kiện (được gọi cả khi tướng đang úp). */
function observe<K extends EventName>(event: K, fn: (g: HegemonyGame, ctx: EventMap[K], owner: number) => void): AnyTrigger {
  return on<K>({ event, can: (g, ctx, owner) => { fn(g, ctx, owner); return false; }, run: () => {} });
}

/** Dữ liệu riêng của từng ván. */
const STORE = new WeakMap<HegemonyGame, Map<string, Set<number | string> | Map<number, number>>>();
function storeOf<T extends Set<number | string> | Map<number, number>>(g: HegemonyGame, key: string, make: () => T): T {
  let m = STORE.get(g);
  if (!m) STORE.set(g, (m = new Map()));
  let v = m.get(key) as T | undefined;
  if (!v) m.set(key, (v = make()));
  return v;
}
/** Tập các lá mang một nhãn ([Cầm], [Sang]...). Lá nằm trong khu vực riêng (special) của người sở hữu. */
export const tagSet = (g: HegemonyGame, tag: string) => storeOf(g, `tag:${tag}`, () => new Set<number>()) as Set<number>;
export const taggedPile = (g: HegemonyGame, seat: number, tag: string) => g.player(seat).special.filter((id) => tagSet(g, tag).has(id));
const judgedBy = (g: HegemonyGame) => storeOf(g, 'judgedBy', () => new Map<number, number>()) as Map<number, number>;
const liegongBonus = (g: HegemonyGame) => storeOf(g, 'liegong', () => new Set<string>()) as Set<string>;
const jianchuGive = (g: HegemonyGame) => storeOf(g, 'jianchu', () => new Set<string>()) as Set<string>;
const dodgedSlash = (g: HegemonyGame) => storeOf(g, 'dodged', () => new Set<number>()) as Set<number>;
const limited = (g: HegemonyGame) => storeOf(g, 'limited', () => new Set<string>()) as Set<string>;

/** Ngũ Hổ Tướng Đại Kỳ (Thụ Việt của Lưu Bị - Quân): `seat` thuộc thế lực Thục và quân chủ Thục đang có Thụ Việt. */
export function wuhu(g: HegemonyGame, seat: number): boolean {
  if (g.shownKingdom(seat) !== 'shu') return false;
  const lord = g.lordOf('shu');
  return lord !== null && g.hasSkill(lord, 'shouyue');
}

/** Lá ảo không có lá thật nào (không có màu / chất). */
const isColorless = (c: Card) => !!c.virtual && c.rank === 0;
/** Lá đang nằm trong khu vực trang bị của `s` (chuyển hóa "bài trên tay" không dùng được lá này). */
const isEquipped = (g: HegemonyGame, s: number, id: number) => EQUIP_SLOTS.some((sl) => g.player(s).equips[sl].includes(id));
const ownCards = (g: HegemonyGame, s: number) => [...g.player(s).hand, ...EQUIP_SLOTS.flatMap((sl) => g.player(s).equips[sl])];
function zoneOfOwn(g: HegemonyGame, s: number, id: number): Zone | null {
  const p = g.player(s);
  if (p.hand.includes(id)) return { kind: 'hand', seat: s };
  for (const slot of EQUIP_SLOTS) if (p.equips[slot].includes(id)) return { kind: 'equip', seat: s, slot };
  return null;
}
/** `seat` chọn `min`–`max` lá của chính mình (trên tay + trang bị). */
async function chooseOwn(g: HegemonyGame, seat: number, prompt: string, min: number, max: number): Promise<number[]> {
  const pool = ownCards(g, seat);
  if (!pool.length) return [];
  const ids = await g.chooseCards(seat, prompt, pool, Math.min(min, pool.length), Math.min(max, pool.length), true);
  return ids.length ? ids : pool.slice(0, Math.min(min, pool.length));
}
async function discardOwnCards(g: HegemonyGame, seat: number, ids: number[], reason: string): Promise<void> {
  const done: number[] = [];
  for (const id of ids) {
    const z = zoneOfOwn(g, seat, id);
    if (z) { await g.moveCards([id], z, { kind: 'discard' }, reason); done.push(id); }
  }
  if (done.length) g.say(`${nameOf(g, seat)} bỏ ${done.map((id) => cardLabel(g.card(id))).join(', ')}.`);
}
const weaponsOf = (g: HegemonyGame, s: number) => ownCards(g, s).filter((id) => CARD_INFO[g.card(id).name]?.slot === 'weapon');

/** Quỷ Tài / Quỷ Đạo: đặt lá `id` (đang ở `from`) làm kết quả phán định mới; lá cũ vào chồng bỏ hoặc về tay `owner`. */
async function replaceJudge(g: HegemonyGame, ctx: EventMap['judged'], owner: number, id: number, from: Zone, takeOld: boolean): Promise<void> {
  const old = ctx.card;
  await g.moveCards([id], from, { kind: 'processing' }, 'respond');
  if (g.state.processing.includes(old.id)) {
    await g.moveCards([old.id], { kind: 'processing' }, takeOld ? { kind: 'hand', seat: owner } : { kind: 'discard' }, takeOld ? 'guidao' : 'guicai');
  }
  ctx.card = g.card(id);
  judgedBy(g).set(id, ctx.seat);
  g.say(`${nameOf(g, owner)} đổi kết quả phán định thành ${cardLabel(ctx.card)}.`);
}

/** Khiêm Tốn / Duy Mạc: lá thỏa `pred` vào khu vực phán định của chủ kỹ năng thì bị bỏ. */
function judgeAreaGuard(skill: string, pred: (g: HegemonyGame, id: number) => boolean): AnyTrigger[] {
  const run = async (g: HegemonyGame, owner: number) => {
    const ids = g.player(owner).judgeArea.filter((id) => pred(g, id));
    if (!ids.length) return;
    await g.moveCards(ids, { kind: 'judge', seat: owner }, { kind: 'discard' }, skill);
    g.say(`${SKILLS[skill].name}: ${ids.map((id) => cardLabel(g.card(id))).join(', ')} trong khu vực phán định của ${nameOf(g, owner)} bị bỏ.`);
  };
  return [
    on({
      event: 'cardUsed', compulsory: true,
      can: (g, ctx, owner) => ctx.targets.includes(owner) && g.player(owner).judgeArea.some((id) => pred(g, id)),
      run: (g, _ctx, owner) => run(g, owner),
    }),
    on({
      event: 'cardsMoved', compulsory: true,
      can: (g, ctx, owner) => ctx.to.kind === 'judge' && ctx.to.seat === owner && ctx.reason !== 'delayed'
        && ctx.cardIds.some((id) => g.player(owner).judgeArea.includes(id) && pred(g, id)),
      run: (g, _ctx, owner) => run(g, owner),
    }),
  ];
}

/** Quan Tinh (và Di Chí: nhận Quan Tinh / xem 5 lá). */
function guanxingTrigger(fromYizhi: boolean): AnyTrigger {
  const mainHas = (g: HegemonyGame, s: number) => {
    const h = g.heroes[s];
    return !!h && !h.main.removed && !h.main.noSkills && getGeneral(h.main.generalId).skills.includes('guanxing');
  };
  return on({
    event: 'phaseStart',
    can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'start' && (!fromYizhi || !mainHas(g, owner)),
    run: async (g, _ctx, owner) => {
      const x = fromYizhi || g.hasSkill(owner, 'yizhi', false) ? 5 : Math.min(5, g.alivePlayers().length);
      await arrangeTop(g, owner, x, true, 'Quan Tinh');
    },
  });
}

/**
 * Xem X lá trên đầu chồng bài rút rồi sắp xếp lại. Người chơi chọn các lá để lại TRÊN ĐẦU (lá chọn trước nằm trên cùng);
 * nếu cho phép (`bottom`), các lá không chọn xuống đáy chồng bài, nếu không thì bắt buộc giữ lại hết trên đầu.
 */
export async function arrangeTop(g: HegemonyGame, seat: number, x: number, bottom: boolean, label: string): Promise<void> {
  const pile = g.state.drawPile;
  const n = Math.min(x, pile.length);
  if (n <= 0) return;
  const ids = pile.slice(-n).reverse(); // ids[0] = lá trên cùng
  const top = await g.chooseCards(seat, bottom
    ? `${label}: chọn các lá để lại TRÊN ĐẦU chồng bài (lá chọn trước nằm trên cùng); lá không chọn xuống đáy`
    : `${label}: sắp xếp lại — chọn lần lượt các lá từ trên xuống`, ids, bottom ? 0 : n, n, true);
  const keep = bottom ? top : [...top, ...ids.filter((id) => !top.includes(id))];
  const down = ids.filter((id) => !keep.includes(id));
  pile.splice(pile.length - n, n);
  for (const id of down) pile.unshift(id);
  for (let i = keep.length - 1; i >= 0; i--) pile.push(keep[i]);
  g.say(`${nameOf(g, seat)} dùng ${label}: ${keep.length} lá trên đầu, ${down.length} lá xuống đáy chồng bài.`);
}

/** Nhân Đức: xem như sử dụng 1 lá cơ bản (Đào / Sát / Rượu). */
async function useBasicAs(g: HegemonyGame, seat: number, label: string): Promise<void> {
  const p = g.player(seat);
  const opts: { text: string; run: () => Promise<void> }[] = [];
  if (p.hp < p.maxHp) opts.push({ text: 'Đào', run: () => g.useCardAs(seat, 'tao', [seat], [], { label }) });
  const shaTargets = (p.flags.shaUsed ?? 0) < g.slashLimit(seat) ? g.targetsAs(seat, 'sha') : [];
  if (shaTargets.length) {
    opts.push({ text: 'Sát', run: async () => {
      const [t] = await g.chooseTargets(seat, `${label}: chọn mục tiêu của Sát`, shaTargets, 1, 1, 'enemy');
      if (t !== undefined) await g.useCardAs(seat, 'sha', [t], [], { label, countSlash: true });
    } });
  }
  if (!p.flags.jiuUsed) opts.push({ text: 'Rượu', run: () => g.useCardAs(seat, 'jiu', [seat], [], { label }) });
  if (!opts.length) return;
  const i = await g.choose(seat, `${label}: xem như sử dụng 1 lá cơ bản`, [...opts.map((o) => o.text), 'Không dùng']);
  if (i < opts.length) await opts[i].run();
}

/** Các nước đi "di chuyển 1 lá trên bàn chơi": [người có lá, id lá, người nhận hợp lệ]. */
function boardMoves(g: HegemonyGame): { from: number; id: number; zone: Zone; to: number[] }[] {
  const out: { from: number; id: number; zone: Zone; to: number[] }[] = [];
  const alive = g.alivePlayers().map((p) => p.seat);
  for (const s of alive) {
    const p = g.player(s);
    for (const slot of EQUIP_SLOTS) {
      const id = p.equips[slot][0];
      if (id === undefined) continue;
      const to = alive.filter((t) => t !== s && !g.player(t).equips[slot].length
        && !((slot === 'defHorse' || slot === 'offHorse') && g.equipOf(t, 'offHorse')?.name === 'liulong'));
      if (to.length) out.push({ from: s, id, zone: { kind: 'equip', seat: s, slot }, to });
    }
    for (const id of p.judgeArea) {
      const name = g.delayedName(id);
      const to = alive.filter((t) => t !== s && !g.player(t).judgeArea.some((x) => g.delayedName(x) === name));
      if (to.length) out.push({ from: s, id, zone: { kind: 'judge', seat: s }, to });
    }
  }
  return out;
}

/** Di chuyển 1 lá trên bàn chơi (trang bị sang ô trống cùng loại, cẩm nang trì hoãn sang khu vực phán định khác). */
async function moveBoardCard(g: HegemonyGame, seat: number, label: string): Promise<void> {
  const moves = boardMoves(g);
  if (!moves.length) return;
  const owners = [...new Set(moves.map((m) => m.from))];
  const [from] = await g.chooseTargets(seat, `${label}: chọn người có lá trên bàn để di chuyển`, owners, 1, 1, 'enemy');
  if (from === undefined) return;
  const mine = moves.filter((m) => m.from === from);
  const [id] = await g.chooseCards(seat, `${label}: chọn lá để di chuyển`, mine.map((m) => m.id), 1, 1, true);
  const mv = mine.find((m) => m.id === id) ?? mine[0];
  const [to] = await g.chooseTargets(seat, `${label}: chuyển ${cardLabel(g.card(mv.id))} cho ai`, mv.to, 1, 1, mv.zone.kind === 'judge' ? 'enemy' : 'ally');
  if (to === undefined) return;
  const dest: Zone = mv.zone.kind === 'equip' ? { kind: 'equip', seat: to, slot: mv.zone.slot } : { kind: 'judge', seat: to };
  await g.moveCards([mv.id], mv.zone, dest, 'moveBoard');
  g.say(`${nameOf(g, seat)} chuyển ${cardLabel(g.card(mv.id))} của ${nameOf(g, from)} sang ${nameOf(g, to)}.`);
}

/** Chạy ngay trigger `event` của một kỹ năng vừa được trao (vì kỹ năng trao giữa chừng sự kiện không được dispatcher xét). */
export async function runGrantedNow<K extends EventName>(g: HegemonyGame, seat: number, skillId: string, event: K, ctx: EventMap[K]): Promise<void> {
  const s = SKILLS[skillId];
  for (const t of s?.triggers ?? []) {
    if (t.event !== event) continue;
    const trig = t as unknown as SkillTrigger<K>;
    if (!g.player(seat).alive || !trig.can(g, ctx, seat)) continue;
    if (!trig.compulsory) {
      const res = await g.ask({ type: 'confirm', seat, skill: skillId, reveal: false, prompt: `Kích hoạt ${s.name}?` });
      if (res.kind !== 'yes') continue;
    }
    g.say(`${nameOf(g, seat)} kích hoạt ${s.name}.`);
    await trig.run(g, ctx, seat);
  }
}

function duelExtra(g: HegemonyGame, owner: number, current: number[]): number[] {
  return g.alivePlayers().map((p) => p.seat)
    .filter((t) => t !== owner && !current.includes(t) && g.canTarget(owner, t) && g.canBeSlashTarget(owner, t));
}
function chuliCands(g: HegemonyGame, seat: number): number[] {
  return g.alivePlayers().map((p) => p.seat).filter((t) => t !== seat && g.cardCount(t) > 0 && g.canTarget(seat, t));
}
function lijianCands(g: HegemonyGame, seat: number): number[] {
  return g.alivePlayers().map((p) => p.seat).filter((t) => t !== seat && !g.isFemale(t) && g.canTarget(seat, t));
}

/** Các mục tiêu có thể thêm bằng Đoản Binh: còn sống, ở khoảng cách 1, chưa là mục tiêu, có thể bị Sát. */
function doanBinhCandidates(g: HegemonyGame, owner: number, current: number[]): number[] {
  return g.alivePlayers()
    .map((p) => p.seat)
    .filter((t) => t !== owner && !current.includes(t) && g.distance(owner, t) <= 1
      && g.canTarget(owner, t) && g.canBeSlashTarget(owner, t));
}

export function getSkill(id: string): Skill {
  const s = SKILLS[id];
  if (!s) throw new Error(`Kỹ năng ${id} không tồn tại`);
  return s;
}

// ============================================================
// QUÂN CHỦ (君主): kỹ năng của Lưu Bị / Trương Giác / Tào Tháo / Tôn Quyền - Quân.
// Tướng quân chủ khai báo trong content/generals/quan-chu.json ("lord": true, id lord_<id tướng thường>).
// Các "lá cờ" quân chủ trao cho người cùng thế lực (Thiên Binh, Ngũ Tử Lương Tướng Đạo, Duyên Giang Phong Hỏa Đồ)
// là kỹ năng chung (GLOBAL_SKILLS): ai cũng có, điều kiện nằm trong available/can.
// ============================================================

/** Vị trí hiện tại của một lá (bất kỳ vùng nào), hoặc null nếu đang trong chồng bài rút / ngoài ván. */
function findCard(g: HegemonyGame, id: number): Zone | null {
  if (g.state.discardPile.includes(id)) return { kind: 'discard' };
  if (g.state.processing.includes(id)) return { kind: 'processing' };
  for (const p of g.state.players) {
    if (p.hand.includes(id)) return { kind: 'hand', seat: p.seat };
    if (p.judgeArea.includes(id)) return { kind: 'judge', seat: p.seat };
    if (p.special.includes(id)) return { kind: 'special', seat: p.seat };
    for (const slot of EQUIP_SLOTS) if (p.equips[slot].includes(id)) return { kind: 'equip', seat: p.seat, slot };
  }
  return null;
}
/** Lá tên `name` đang ở chồng bỏ hoặc trên bàn (khu vực trang bị của ai đó), kèm vị trí. */
function onTableOrDiscard(g: HegemonyGame, name: CardName, exceptSeat = -1): { id: number; zone: Zone } | null {
  const d = g.state.discardPile.find((id) => g.card(id).name === name);
  if (d !== undefined) return { id: d, zone: { kind: 'discard' } };
  for (const p of g.alivePlayers()) {
    if (p.seat === exceptSeat) continue;
    for (const slot of EQUIP_SLOTS) {
      const id = p.equips[slot][0];
      if (id !== undefined && g.card(id).name === name) return { id, zone: { kind: 'equip', seat: p.seat, slot } };
    }
  }
  return null;
}
const isHorse = (c: Card) => c.type === 'equip' && ['defHorse', 'offHorse'].includes(CARD_INFO[c.name]?.slot ?? '');
const typeOf = (c: Card) => (c.type === 'delayed' ? 'trick' : c.type);
const TYPE_LABEL: Record<string, string> = { basic: 'cơ bản', trick: 'cẩm nang', equip: 'trang bị' };

/** Quân chủ còn sống của thế lực mà `seat` đang thuộc về (đã lộ, không phải dã tâm gia) và đang có kỹ năng `skill`. */
function lordWith(g: HegemonyGame, seat: number, kingdom: string, skill: string): number | null {
  if (g.shownKingdom(seat) !== kingdom) return null;
  const lord = g.lordOf(kingdom);
  return lord !== null && g.hasSkill(lord, skill) ? lord : null;
}
/** Thiên Binh: quân chủ Quần có Hoằng Pháp và còn [Thiên Binh] mà `seat` (người Quần) dùng được. */
function tianbingLord(g: HegemonyGame, seat: number): number | null {
  const lord = lordWith(g, seat, 'qun', 'hongfa');
  return lord !== null && taggedPile(g, lord, 'thienbinh').length > 0 ? lord : null;
}
const wuziBlocked = (g: HegemonyGame) => storeOf(g, 'wuziBlocked', () => new Set<number>()) as Set<number>;
const wuziGranted = (g: HegemonyGame) => storeOf(g, 'wuziGranted', () => new Map<number, number>()) as Map<number, number>;
const WUZI_SKILLS = ['dottap', 'xiaoguo', 'qiaobian', 'jieyue', 'duanliang'];
function wuziChoices(g: HegemonyGame): string[] {
  return WUZI_SKILLS.filter((id) => SKILLS[id] && !g.alivePlayers().some((p) => g.hasSkill(p.seat, id, true)));
}
const FLAME_SKILLS: [number, string][] = [[1, 'anhtu'], [2, 'haoshi'], [3, 'shelie'], [4, 'duoshi']];

Object.assign(SKILLS, {
  // ---------------- Lưu Bị - Quân ----------------
  zhangwu: {
    id: 'zhangwu',
    name: 'Chương Vũ',
    desc: 'Tỏa định kỹ: • Khi [Phi Long Đoạt Phượng] tiến vào chồng bài bỏ hoặc vùng trang bị của người khác, bạn thu lấy nó. '
      + '• Khi bạn mất đi [Phi Long Đoạt Phượng] không vì sử dụng, bạn mở nó ra, đặt vào đáy chồng bài rút và bạn rút 2 lá.',
    triggers: [
      on({
        event: 'cardsMoved',
        compulsory: true,
        can: (g, ctx, owner) => ctx.cardIds.some((id) => g.card(id).name === 'feilong')
          && !((ctx.from.kind === 'hand' || ctx.from.kind === 'equip') && ctx.from.seat === owner)
          && (ctx.to.kind === 'discard' || (ctx.to.kind === 'equip' && ctx.to.seat !== owner)),
        run: async (g, ctx, owner) => {
          for (const id of ctx.cardIds.filter((x) => g.card(x).name === 'feilong')) {
            const z = findCard(g, id);
            if (!z || (z.kind === 'hand' && z.seat === owner)) continue;
            await g.moveCards([id], z, { kind: 'hand', seat: owner }, 'zhangwu');
            g.say(`${nameOf(g, owner)} thu lấy Phi Long Đoạt Phượng.`);
          }
        },
      }),
      on({
        event: 'cardsMoved',
        compulsory: true,
        can: (g, ctx, owner) => ctx.cardIds.some((id) => g.card(id).name === 'feilong')
          && (ctx.from.kind === 'hand' || ctx.from.kind === 'equip') && ctx.from.seat === owner
          && ctx.reason !== 'equip' && ctx.reason !== 'use' && ctx.reason !== 'respond'
          && !((ctx.to.kind === 'hand' || ctx.to.kind === 'equip') && ctx.to.seat === owner),
        run: async (g, ctx, owner) => {
          for (const id of ctx.cardIds.filter((x) => g.card(x).name === 'feilong')) {
            const z = findCard(g, id);
            if (!z) continue;
            await g.moveCards([id], z, { kind: 'draw' }, 'zhangwu');
            const pile = g.state.drawPile;
            pile.splice(pile.indexOf(id), 1);
            pile.unshift(id); // phần tử đầu mảng = đáy chồng bài
            g.say(`${nameOf(g, owner)} mở ${cardLabel(g.card(id))}, đặt xuống đáy chồng bài.`);
          }
          await g.draw(owner, 2);
        },
      }),
    ],
  },

  shouyue: {
    id: 'shouyue',
    name: 'Thụ Việt',
    desc: 'Quân chủ kỹ, Tỏa định kỹ: Bạn có »Ngũ Hổ Tướng Đại Kỳ«: người thế lực Thục thay đổi các kỹ năng: '
      + '»Võ Thánh« bỏ chữ "Đỏ"; »Bào Hao« thêm: [Sát] bỏ qua phòng cụ của mục tiêu; »Long Đảm« thêm: khi sử dụng/đánh ra [Sát] hoặc [Thiểm] bởi Long Đảm, rút 1 lá; '
      + '»Liệt Cung« thêm: tầm đánh +1; »Thiết Kỵ«: "1 tướng đã mở" sửa thành "tất cả tướng đã mở".',
  },

  jizhao: {
    id: 'jizhao',
    name: 'Kích Chiếu',
    desc: 'Hạn định kỹ: Khi bạn trong trạng thái hấp hối, bạn có thể phát động: bổ sung bài trên tay đến giới hạn máu; hồi máu đến 2; '
      + 'mất kỹ năng »Thụ Việt« và nhận kỹ năng »Nhân Đức«.',
    triggers: [on({
      event: 'dying',
      can: (g, ctx, owner) => ctx.seat === owner && g.player(owner).hp <= 0 && !limited(g).has(`jizhao:${owner}`),
      run: async (g, _ctx, owner) => {
        limited(g).add(`jizhao:${owner}`);
        const p = g.player(owner);
        const n = p.maxHp - p.hand.length;
        if (n > 0) await g.draw(owner, n);
        if (p.hp < 2) await g.recover(owner, 2 - p.hp, owner);
        g.loseSkill(owner, 'shouyue');
        g.grantSkill(owner, 'nhanduc');
      },
    })],
  },

  // ---------------- Trương Giác - Quân ----------------
  wuxin: {
    id: 'wuxin',
    name: 'Ngộ Tâm',
    desc: 'Khi bắt đầu giai đoạn rút bài, bạn có thể xem X lá đầu chồng bài rút và sắp xếp tùy ý những lá này lên đầu chồng bài rút '
      + '(X là số người cùng thế lực với bạn, tính cả [Thiên Binh]).',
    triggers: [on({
      event: 'phaseStart',
      can: (_g, ctx, owner) => ctx.seat === owner && ctx.phase === 'draw',
      run: async (g, _ctx, owner) => {
        const k = g.shownKingdom(owner);
        const x = k && k !== 'careerist' ? g.factionSize(k) : 1;
        await arrangeTop(g, owner, Math.max(1, x), false, 'Ngộ Tâm');
      },
    })],
  },

  hongfa: {
    id: 'hongfa',
    name: 'Hoằng Pháp',
    desc: 'Quân chủ kỹ, Tỏa định kỹ: Bạn có »Hoàng Cân Thiên Bình Phủ«: • Khi bắt đầu giai đoạn chuẩn bị, nếu bạn không có [Thiên Binh], '
      + 'bạn lấy X lá đầu chồng bài rút đặt ngửa lên tướng này, gọi là [Thiên Binh] (X là số người cùng thế lực với bạn). '
      + '• Khi tính số người cùng thế lực với bạn, +1 với mỗi [Thiên Binh]. • Khi bạn mất máu, bạn có thể đưa 1 [Thiên Binh] vào chồng bài bỏ để chặn việc mất máu. '
      + '• Người thế lực Quần có thể chuyển hóa sử dụng/đánh ra [Thiên Binh] thành [Sát].',
    factionSizeBonus: (g, owner, kingdom) => (g.shownKingdom(owner) === kingdom ? taggedPile(g, owner, 'thienbinh').length : 0),
    triggers: [
      on({
        event: 'phaseStart',
        compulsory: true,
        can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'start' && taggedPile(g, owner, 'thienbinh').length === 0
          && g.shownKingdom(owner) !== null && g.shownKingdom(owner) !== 'careerist',
        run: async (g, _ctx, owner) => {
          const x = g.factionSize(String(g.shownKingdom(owner)));
          for (let i = 0; i < x; i++) {
            const c = await g.takeTop({ kind: 'special', seat: owner }, 'hongfa');
            tagSet(g, 'thienbinh').add(c.id);
          }
          g.say(`${nameOf(g, owner)} đặt ${x} lá lên tướng làm [Thiên Binh]: ${taggedPile(g, owner, 'thienbinh').map((id) => cardLabel(g.card(id))).join(', ')}.`);
        },
      }),
      on({
        event: 'beforeHpLost',
        can: (g, ctx, owner) => ctx.seat === owner && !ctx.cancelled && taggedPile(g, owner, 'thienbinh').length > 0,
        run: async (g, ctx, owner) => {
          const pile = taggedPile(g, owner, 'thienbinh');
          const [id] = await g.chooseCards(owner, 'Hoằng Pháp: bỏ 1 [Thiên Binh] để không mất máu', pile, 1, 1, true);
          const cid = id ?? pile[0];
          tagSet(g, 'thienbinh').delete(cid);
          await g.moveCards([cid], { kind: 'special', seat: owner }, { kind: 'discard' }, 'hongfa');
          ctx.cancelled = true;
          g.say(`${nameOf(g, owner)} bỏ 1 [Thiên Binh], không mất máu.`);
        },
      }),
    ],
  },

  tianbing: {
    id: 'tianbing',
    name: 'Thiên Binh (như Sát)',
    desc: 'Hoàng Cân Thiên Bình Phủ: người thế lực Quần có thể chuyển hóa sử dụng/đánh ra [Thiên Binh] trên tướng của Trương Giác - Quân thành [Sát].',
    bot: { use: 'always', target: 'enemy', confirm: (v) => !v.myHand.some((c) => c.name === 'sha') },
    convert: (g, _seat, card) => (tagSet(g, 'tbhand').has(card.id) ? ['sha'] : []),
    active: {
      cards: 'none',
      target: 'one',
      available: (g, seat) => tianbingLord(g, seat) !== null && (g.player(seat).flags.shaUsed ?? 0) < g.slashLimit(seat)
        && g.targetsAs(seat, 'sha').length > 0,
      validTarget: (g, seat, t) => g.targetsAs(seat, 'sha').includes(t),
      run: async (g, seat, _cards, [t]) => {
        const lord = tianbingLord(g, seat);
        if (lord === null) return;
        const pile = taggedPile(g, lord, 'thienbinh');
        const [id] = await g.chooseCards(seat, 'Thiên Binh: chọn 1 lá dùng như Sát', pile, 1, 1, true);
        const cid = id ?? pile[0];
        tagSet(g, 'thienbinh').delete(cid);
        await g.useCardAs(seat, 'sha', [t], [cid], { from: { kind: 'special', seat: lord }, countSlash: true, label: 'Thiên Binh' });
      },
    },
    triggers: [
      on({
        event: 'beforeRespond',
        can: (g, ctx, owner) => ctx.seat === owner && ctx.accept.includes('sha') && tianbingLord(g, owner) !== null,
        run: async (g, _ctx, owner) => {
          const lord = tianbingLord(g, owner);
          if (lord === null) return;
          const pile = taggedPile(g, lord, 'thienbinh');
          const [id] = await g.chooseCards(owner, 'Thiên Binh: lấy 1 lá để đánh ra như Sát', pile, 0, 1, true);
          if (id === undefined) return;
          tagSet(g, 'thienbinh').delete(id);
          await g.moveCards([id], { kind: 'special', seat: lord }, { kind: 'hand', seat: owner }, 'tianbing');
          tagSet(g, 'tbhand').add(id);
        },
      }),
      observe('cardsMoved', (g, ctx) => {
        if (ctx.from.kind !== 'hand') return;
        for (const id of ctx.cardIds) tagSet(g, 'tbhand').delete(id);
      }),
    ],
  },

  wendao: {
    id: 'wendao',
    name: 'Vấn Đạo',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá Đỏ ngoại trừ [Thái Bình Yêu Thuật] và thu lấy [Thái Bình Yêu Thuật] trong chồng bài bỏ hoặc trên bàn chơi.',
    bot: { use: 'always' },
    active: {
      cards: 'one',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.wendao && onTableOrDiscard(g, 'taiping', seat) !== null
        && handOf(g, seat).some((id) => isRed(g.card(id)) && g.card(id).name !== 'taiping'),
      cardOk: (g, _seat, id) => isRed(g.card(id)) && g.card(id).name !== 'taiping',
      checkCards: (g, _seat, ids) => (ids.every((id) => isRed(g.card(id)) && g.card(id).name !== 'taiping') ? null : 'Cần 1 lá Đỏ (không phải Thái Bình Yêu Thuật)'),
      run: async (g, seat, cardIds) => {
        g.player(seat).flags.wendao = 1;
        await g.moveCards(cardIds, { kind: 'hand', seat }, { kind: 'discard' }, 'wendao');
        const tp = onTableOrDiscard(g, 'taiping', seat);
        if (!tp) return;
        await g.moveCards([tp.id], tp.zone, { kind: 'hand', seat }, 'wendao');
        g.say(`${nameOf(g, seat)} thu lấy Thái Bình Yêu Thuật.`);
      },
    },
  },

  // ---------------- Tào Tháo - Quân ----------------
  jianan: {
    id: 'jianan',
    name: 'Kiến Anh',
    desc: 'Quân chủ kỹ, Tỏa định kỹ: Bạn có »Ngũ Tử Lương Tướng Đạo«: khi bắt đầu giai đoạn chuẩn bị của người thế lực Ngụy, họ có thể bỏ 1 lá, '
      + 'thực hiện lần lượt: nếu đã mở 2 tướng, chọn úp 1 tướng; họ chọn 1 tướng chưa mở, không thể mở tướng đó đến khi bắt đầu lượt tiếp theo của họ; '
      + 'họ chọn 1 trong các kỹ năng chưa có trên bàn: »Tập Kích«, »Kiêu Quả«, »Xảo Biến«, »Tiết Việt«, »Đoạn Lương«, nhận kỹ năng đó đến khi bắt đầu lượt tiếp theo của họ.',
  },

  elitegeneralflag: {
    id: 'elitegeneralflag',
    name: 'Ngũ Tử Lương Tướng Đạo',
    desc: 'Khi bắt đầu giai đoạn chuẩn bị của người thế lực Ngụy (khi Tào Tháo - Quân còn sống), họ có thể bỏ 1 lá và chọn 1 tướng chưa mở của họ '
      + '(nếu đã mở 2 tướng thì úp 1 tướng); họ chọn 1 kỹ năng chưa có trên bàn trong »Tập Kích«, »Kiêu Quả«, »Xảo Biến«, »Tiết Việt«, »Đoạn Lương«, '
      + 'nhận kỹ năng đó và không thể mở tướng đã chọn đến khi bắt đầu lượt tiếp theo của họ.',
    bot: { confirm: (v) => v.myHand.length >= 3 },
    blockReveal: (g, _owner, seat) => wuziBlocked(g).has(seat),
    triggers: [
      observe('turnStart', (g, ctx, owner) => {
        if (ctx.seat !== owner) return;
        wuziBlocked(g).delete(owner);
        const old = wuziGranted(g).get(owner);
        if (old !== undefined) { g.revokeSkill(owner, WUZI_SKILLS[old]); wuziGranted(g).delete(owner); }
      }),
      on({
        event: 'phaseStart',
        can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'start' && lordWith(g, owner, 'wei', 'jianan') !== null
          && g.cardCount(owner) > 0 && wuziChoices(g).length > 0,
        run: async (g, ctx, owner) => {
          const ids = await chooseOwn(g, owner, 'Ngũ Tử Lương Tướng Đạo: bỏ 1 lá', 1, 1);
          if (!ids.length) return;
          await discardOwnCards(g, owner, ids, 'elitegeneralflag');
          const h = g.hero(owner);
          if (h.main.revealed && h.deputy.revealed && !h.deputy.removed) {
            const hideMain = !g.isLord(owner) && !h.main.removed
              && (await g.choose(owner, 'Ngũ Tử Lương Tướng Đạo: úp 1 tướng', [`Úp phó tướng ${g.generalName(h.deputy.generalId)}`, `Úp chủ tướng ${g.generalName(h.main.generalId)}`])) === 1;
            g.hideGeneral(owner, hideMain ? 'main' : 'deputy');
          }
          wuziBlocked(g).add(owner);
          const choices = wuziChoices(g);
          if (!choices.length) return;
          const i = choices.length > 1 ? await g.choose(owner, 'Ngũ Tử Lương Tướng Đạo: chọn kỹ năng', choices.map((id) => SKILLS[id].name)) : 0;
          const id = choices[i] ?? choices[0];
          g.grantSkill(owner, id);
          wuziGranted(g).set(owner, WUZI_SKILLS.indexOf(id));
          await runGrantedNow(g, owner, id, 'phaseStart', ctx);
        },
      }),
    ],
  },

  huibian: {
    id: 'huibian',
    name: 'Huy Tiên',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người thế lực Ngụy và 1 người thế lực Ngụy khác đang bị thương: '
      + 'bạn gây 1 sát thương cho người đầu tiên và họ rút 2 lá; người còn lại hồi 1 máu.',
    bot: { use: 'always' },
    active: {
      cards: 'none',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.huibian && huibianFirst(g, seat).length > 0,
      run: async (g, seat) => {
        g.player(seat).flags.huibian = 1;
        const firsts = huibianFirst(g, seat);
        const [a] = await g.chooseTargets(seat, 'Huy Tiên: chọn người Ngụy chịu 1 sát thương rồi rút 2 lá',
          [...firsts].sort((x, y) => g.player(y).hp - g.player(x).hp), 1, 1, 'ally');
        const first = a ?? firsts[0];
        const seconds = weiSeats(g).filter((s) => s !== first && g.player(s).hp < g.player(s).maxHp);
        const [b] = await g.chooseTargets(seat, 'Huy Tiên: chọn người Ngụy khác đang bị thương để hồi 1 máu', seconds, 1, 1, 'ally');
        await g.damage({ source: seat, target: first, amount: 1, card: null, cancelled: false });
        if (g.player(first).alive) await g.draw(first, 2);
        const second = b ?? seconds[0];
        if (second !== undefined && g.player(second).alive) await g.recover(second, 1, seat);
      },
    },
  },

  zongyu: {
    id: 'zongyu',
    name: 'Tổng Ngự',
    desc: '• Khi [Lục Long Tham Giá] tiến vào vùng trang bị của người khác, nếu có Ngựa trong vùng trang bị của bạn, bạn có thể hoán đổi tất cả Ngựa '
      + 'trong vùng trang bị của bạn với [Lục Long Tham Giá]. • Khi bạn sử dụng 1 lá Ngựa, nếu trên bàn hoặc chồng bài bỏ có [Lục Long Tham Giá], '
      + 'bạn có thể đem [Lục Long Tham Giá] đặt vào vùng trang bị của bạn (bỏ các Ngựa khác).',
    triggers: [
      on({
        event: 'cardsMoved',
        can: (g, ctx, owner) => ctx.to.kind === 'equip' && ctx.to.seat !== owner && ctx.cardIds.some((id) => g.card(id).name === 'liulong')
          && (g.player(owner).equips.defHorse.length + g.player(owner).equips.offHorse.length) > 0,
        run: async (g, ctx, owner) => {
          if (ctx.to.kind !== 'equip') return;
          const other = ctx.to.seat;
          const ll = g.player(other).equips.offHorse.find((id) => g.card(id).name === 'liulong');
          if (ll === undefined) return;
          await g.moveCards([ll], { kind: 'equip', seat: other, slot: 'offHorse' }, { kind: 'processing' }, 'zongyu');
          for (const slot of ['defHorse', 'offHorse'] as const) {
            const h = g.player(owner).equips[slot][0];
            if (h === undefined) continue;
            const old = g.player(other).equips[slot][0];
            if (old !== undefined) await g.moveCards([old], { kind: 'equip', seat: other, slot }, { kind: 'discard' }, 'replace');
            await g.moveCards([h], { kind: 'equip', seat: owner, slot }, { kind: 'equip', seat: other, slot }, 'zongyu');
          }
          await g.moveCards([ll], { kind: 'processing' }, { kind: 'equip', seat: owner, slot: 'offHorse' }, 'zongyu');
          g.say(`${nameOf(g, owner)} hoán đổi Ngựa với Lục Long Tham Giá của ${nameOf(g, other)}.`);
        },
      }),
      on({
        event: 'cardUsed',
        can: (g, ctx, owner) => ctx.seat === owner && isHorse(ctx.card) && ctx.card.name !== 'liulong'
          && onTableOrDiscard(g, 'liulong', owner) !== null,
        run: async (g, _ctx, owner) => {
          const ll = onTableOrDiscard(g, 'liulong', owner);
          if (!ll) return;
          for (const slot of ['defHorse', 'offHorse'] as const) {
            const h = g.player(owner).equips[slot];
            if (h.length) await g.moveCards([...h], { kind: 'equip', seat: owner, slot }, { kind: 'discard' }, 'replace');
          }
          await g.moveCards([ll.id], ll.zone, { kind: 'equip', seat: owner, slot: 'offHorse' }, 'zongyu');
          g.say(`${nameOf(g, owner)} đặt Lục Long Tham Giá vào khu vực trang bị.`);
        },
      }),
    ],
  },

  // ---------------- Tôn Quyền - Quân ----------------
  jiahe: {
    id: 'jiahe',
    name: 'Gia Hỏa',
    desc: 'Quân chủ kỹ, Tỏa định kỹ: Bạn có »Duyên Giang Phong Hỏa Đồ«: • Một lần trong giai đoạn ra bài của mỗi người thế lực Ngô, họ có thể đặt 1 trang bị '
      + 'lên Phong Hỏa Đồ, gọi là [Phong Hỏa]. • Khi bắt đầu giai đoạn chuẩn bị của người thế lực Ngô, họ có thể nhận 1 kỹ năng (đến hết lượt) theo số [Phong Hỏa]: '
      + '1+: »Anh Tư«; 2+: »Hảo Thi«; 3+: »Thiệp Liệp«; 4+: »Độ Thế«; có từ 5 [Phong Hỏa] thì nhận thêm 1 kỹ năng khác. '
      + '• Tỏa định kỹ: sau khi bạn nhận sát thương từ lá bài, đưa 1 [Phong Hỏa] vào chồng bài bỏ.',
    triggers: [on({
      event: 'damaged',
      compulsory: true,
      can: (g, ctx, owner) => ctx.target === owner && ctx.card !== null && taggedPile(g, owner, 'phonghoa').length > 0,
      run: async (g, _ctx, owner) => {
        const pile = taggedPile(g, owner, 'phonghoa');
        const [id] = await g.chooseCards(owner, 'Gia Hỏa: đưa 1 [Phong Hỏa] vào chồng bài bỏ', pile, 1, 1, true);
        const cid = id ?? pile[0];
        tagSet(g, 'phonghoa').delete(cid);
        await g.moveCards([cid], { kind: 'special', seat: owner }, { kind: 'discard' }, 'jiahe');
        g.say(`Duyên Giang Phong Hỏa Đồ mất 1 [Phong Hỏa] (${cardLabel(g.card(cid))}).`);
      },
    })],
  },

  flamemap_dat: {
    id: 'flamemap_dat',
    name: 'Đặt lên Phong Hỏa Đồ',
    desc: 'Duyên Giang Phong Hỏa Đồ: một lần trong giai đoạn ra bài, người thế lực Ngô có thể đặt 1 trang bị (trên tay hoặc đang lắp) lên Phong Hỏa Đồ của Tôn Quyền - Quân, gọi là [Phong Hỏa].',
    bot: { use: 'healthy' },
    active: {
      cards: 'none',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.flamemapDat && lordWith(g, seat, 'wu', 'jiahe') !== null
        && ownCards(g, seat).some((id) => g.card(id).type === 'equip'),
      run: async (g, seat) => {
        const lord = lordWith(g, seat, 'wu', 'jiahe');
        if (lord === null) return;
        g.player(seat).flags.flamemapDat = 1;
        const eq = ownCards(g, seat).filter((id) => g.card(id).type === 'equip');
        const [id] = await g.chooseCards(seat, 'Phong Hỏa Đồ: chọn 1 trang bị để đặt lên làm [Phong Hỏa]', eq, 1, 1, true);
        const cid = id ?? eq[0];
        const z = zoneOfOwn(g, seat, cid);
        if (!z) return;
        tagSet(g, 'phonghoa').add(cid);
        await g.moveCards([cid], z, { kind: 'special', seat: lord }, 'flamemap');
        g.say(`${nameOf(g, seat)} đặt ${cardLabel(g.card(cid))} lên Duyên Giang Phong Hỏa Đồ (${taggedPile(g, lord, 'phonghoa').length} [Phong Hỏa]).`);
      },
    },
  },

  flamemap: {
    id: 'flamemap',
    name: 'Duyên Giang Phong Hỏa Đồ',
    desc: 'Khi bắt đầu giai đoạn chuẩn bị của người thế lực Ngô (khi Tôn Quyền - Quân còn sống), họ có thể nhận 1 kỹ năng đến hết lượt theo số [Phong Hỏa]: '
      + '1+: »Anh Tư«; 2+: »Hảo Thi«; 3+: »Thiệp Liệp«; 4+: »Độ Thế«; có từ 5 [Phong Hỏa] thì nhận thêm 1 kỹ năng khác.',
    triggers: [on({
      event: 'phaseStart',
      can: (g, ctx, owner) => {
        if (ctx.seat !== owner || ctx.phase !== 'start') return false;
        const lord = lordWith(g, owner, 'wu', 'jiahe');
        return lord !== null && flameChoices(g, owner, taggedPile(g, lord, 'phonghoa').length).length > 0;
      },
      run: async (g, _ctx, owner) => {
        const lord = lordWith(g, owner, 'wu', 'jiahe');
        if (lord === null) return;
        const n = taggedPile(g, lord, 'phonghoa').length;
        for (let k = 0; k < (n >= 5 ? 2 : 1); k++) {
          const choices = flameChoices(g, owner, n);
          if (!choices.length) return;
          const i = await g.choose(owner, 'Phong Hỏa Đồ: nhận kỹ năng nào (đến hết lượt)', [...choices.map((id) => SKILLS[id].name), 'Không nhận']);
          if (i >= choices.length) return;
          g.grantSkill(owner, choices[i], true);
        }
      },
    })],
  },

  lianzi: {
    id: 'lianzi',
    name: 'Liễm Tư',
    desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá trên tay, sau đó lật ra X lá trên đầu chồng bài rút (X là số [Phong Hỏa] cộng số lá trong vùng trang bị '
      + 'của những người thế lực Ngô), bạn thu lấy những lá cùng loại với lá bạn bỏ; nếu trong 1 lần bạn thu lấy > 3 lá, bạn mất kỹ năng này và nhận »Chế Hành«.',
    bot: { use: 'always' },
    active: {
      cards: 'one',
      target: 'none',
      available: (g, seat) => !g.player(seat).flags.lianzi && handOf(g, seat).length > 0 && lianziX(g, seat) > 0,
      run: async (g, seat, cardIds) => {
        g.player(seat).flags.lianzi = 1;
        const type = typeOf(g.card(cardIds[0]));
        await g.moveCards(cardIds, { kind: 'hand', seat }, { kind: 'discard' }, 'lianzi');
        const x = Math.min(lianziX(g, seat), 20);
        const shown: number[] = [];
        for (let i = 0; i < x; i++) shown.push((await g.takeTop({ kind: 'processing' }, 'lianzi')).id);
        g.say(`Liễm Tư lật ${x} lá: ${shown.map((id) => cardLabel(g.card(id))).join(', ')}.`);
        const got = shown.filter((id) => typeOf(g.card(id)) === type);
        if (got.length) await g.moveCards(got, { kind: 'processing' }, { kind: 'hand', seat }, 'lianzi');
        const rest = shown.filter((id) => !got.includes(id) && g.state.processing.includes(id));
        if (rest.length) await g.moveCards(rest, { kind: 'processing' }, { kind: 'discard' }, 'settle');
        g.say(`${nameOf(g, seat)} thu lấy ${got.length} lá ${TYPE_LABEL[type]}.`);
        if (got.length > 3) {
          g.loseSkill(seat, 'lianzi');
          g.grantSkill(seat, 'chehoanh');
        }
      },
    },
  },

  jubao: {
    id: 'jubao',
    name: 'Tư Bảo',
    desc: 'Tỏa định kỹ: • Người khác không thể thu lấy bảo vật trong khu trang bị của bạn. • Khi bắt đầu giai đoạn kết thúc, nếu trên bàn chơi hoặc chồng bài bỏ '
      + 'có [Định Lan Dạ Minh Châu], bạn rút 1 lá, sau đó thu lấy 1 lá của người đang trang bị [Định Lan Dạ Minh Châu]. '
      + '(Đơn giản hóa: bảo vật bị người khác lấy về tay thì trả lại ngay khu vực trang bị của bạn.)',
    triggers: [
      on({
        event: 'cardsMoved',
        compulsory: true,
        can: (g, ctx, owner) => ctx.from.kind === 'equip' && ctx.from.seat === owner && ctx.from.slot === 'treasure'
          && ctx.to.kind === 'hand' && ctx.to.seat !== owner && g.player(owner).equips.treasure.length === 0,
        run: async (g, ctx, owner) => {
          if (ctx.to.kind !== 'hand') return;
          const holder = ctx.to.seat;
          const id = ctx.cardIds.find((x) => g.player(holder).hand.includes(x));
          if (id === undefined) return;
          await g.moveCards([id], { kind: 'hand', seat: holder }, { kind: 'equip', seat: owner, slot: 'treasure' }, 'jubao');
          g.say(`Tư Bảo: ${nameOf(g, holder)} không thể thu lấy bảo vật của ${nameOf(g, owner)}.`);
        },
      }),
      on({
        event: 'phaseStart',
        compulsory: true,
        can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'end' && onTableOrDiscard(g, 'mingzhu') !== null,
        run: async (g, _ctx, owner) => {
          await g.draw(owner, 1);
          const mz = onTableOrDiscard(g, 'mingzhu');
          if (!mz || mz.zone.kind !== 'equip' || mz.zone.seat === owner) return;
          const holder = mz.zone.seat;
          if (g.cardCount(holder) === 0) return;
          const pick = await pickCardFrom(g, owner, holder, false, `Tư Bảo: chọn 1 lá của ${nameOf(g, holder)}`);
          if (pick) {
            await g.moveCards([pick.id], pick.from, { kind: 'hand', seat: owner }, 'jubao');
            g.say(`${nameOf(g, owner)} thu lấy 1 lá của ${nameOf(g, holder)}.`);
          }
        },
      }),
    ],
  },

  shelie: {
    id: 'shelie',
    name: 'Thiệp Liệp',
    desc: 'Khi bắt đầu giai đoạn rút bài, bạn có thể không rút bài, đổi thành lật ra 5 lá trên đầu chồng bài rút, thu lấy trong đó mỗi chất 1 lá.',
    triggers: [on({
      event: 'drawPhase',
      can: (_g, ctx, owner) => ctx.seat === owner && ctx.count > 0,
      run: async (g, ctx, owner) => {
        ctx.count = 0;
        const shown: number[] = [];
        for (let i = 0; i < 5; i++) shown.push((await g.takeTop({ kind: 'processing' }, 'shelie')).id);
        g.say(`Thiệp Liệp lật 5 lá: ${shown.map((id) => cardLabel(g.card(id))).join(', ')}.`);
        const got: number[] = [];
        for (const suit of SUITS) {
          const same = shown.filter((id) => g.card(id).suit === suit);
          if (!same.length) continue;
          const [id] = same.length > 1
            ? await g.chooseCards(owner, `Thiệp Liệp: chọn 1 lá ${SUIT_OPTIONS[SUITS.indexOf(suit)]}`, same, 1, 1, true) : same;
          got.push(id ?? same[0]);
        }
        await g.moveCards(got, { kind: 'processing' }, { kind: 'hand', seat: owner }, 'shelie');
        const rest = shown.filter((id) => !got.includes(id) && g.state.processing.includes(id));
        if (rest.length) await g.moveCards(rest, { kind: 'processing' }, { kind: 'discard' }, 'settle');
      },
    })],
  },
} satisfies Record<string, Skill>);

GLOBAL_SKILLS.push('tianbing', 'elitegeneralflag', 'flamemap_dat', 'flamemap');

function weiSeats(g: HegemonyGame): number[] {
  return g.alivePlayers().map((p) => p.seat).filter((s) => g.shownKingdom(s) === 'wei');
}
/** Huy Tiên: người Ngụy có thể là "người đầu tiên" (còn một người Ngụy khác đang bị thương). */
function huibianFirst(g: HegemonyGame, seat: number): number[] {
  const wei = weiSeats(g).filter((s) => s === seat || g.canTarget(seat, s));
  return wei.filter((a) => wei.some((b) => b !== a && g.player(b).hp < g.player(b).maxHp));
}
function flameChoices(g: HegemonyGame, seat: number, n: number): string[] {
  return FLAME_SKILLS.filter(([need, id]) => n >= need && SKILLS[id] && !g.hasSkill(seat, id, false)).map(([, id]) => id);
}
function lianziX(g: HegemonyGame, seat: number): number {
  const lord = g.lordOf('wu');
  const fire = lord === null ? 0 : taggedPile(g, lord, 'phonghoa').length;
  return fire + g.alivePlayers().filter((p) => g.shownKingdom(p.seat) === 'wu').reduce((n, p) => n + g.equipCount(p.seat), 0)
    + (g.shownKingdom(seat) === 'wu' ? 0 : g.equipCount(seat));
}
