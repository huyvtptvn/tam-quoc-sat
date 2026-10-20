// ============================================================
// Event bus: mọi hành động trong game đều phát ra sự kiện.
// Giai đoạn 2, kỹ năng tướng sẽ là các listener gắn vào đây.
// ============================================================
import type { Card, CardName, Nature, Phase, Zone } from './types.js';

export interface DamageCtx {
  source: number | null; // null = sát thương không nguồn (ví dụ Thiểm Điện)
  target: number;
  amount: number;
  card: Card | null;
  /** Lá gây sát thương được tính như loại gì (ví dụ Thiểm dùng như Sát -> 'sha'). */
  cardAs?: CardName;
  /** Thuộc tính: thường / hỏa / lôi. Mặc định 'normal'. */
  nature?: Nature;
  /** Đây là sát thương được truyền qua xích (không truyền tiếp nữa). */
  chainTransmit?: boolean;
  /** Listener của beforeDamage có thể đặt true để chặn sát thương (giáp, kỹ năng). */
  cancelled: boolean;
}

/** Bảng ánh xạ tên sự kiện -> dữ liệu đi kèm. Listener có thể sửa ctx (ví dụ đổi amount). */
export interface EventMap {
  gameStart: { seats: number };
  turnStart: { seat: number };
  turnEnd: { seat: number };
  /** Đặt skip = true để bỏ qua giai đoạn (ví dụ Lạc Bất Tư Thục bỏ giai đoạn ra bài). */
  phaseBefore: { seat: number; phase: Phase; skip: boolean };
  phaseStart: { seat: number; phase: Phase };
  phaseEnd: { seat: number; phase: Phase };
  /** Sửa count để thay đổi số lá bốc trong giai đoạn bốc bài. */
  drawPhase: { seat: number; count: number };
  cardsMoved: { cardIds: number[]; from: Zone; to: Zone; reason: string };
  cardUsed: { seat: number; card: Card; as: CardName; targets: number[] };
  cardResponded: { seat: number; card: Card; as: CardName; reason: string };
  /**
   * Đặt cancelled = true để Sát mất hiệu lực với mục tiêu này.
   * Sửa shanNeeded để đổi số Thiểm cần đánh (ví dụ Vô Song của Lữ Bố = 2).
   */
  slashTargeted: {
    source: number; target: number; card: Card; cancelled: boolean; shanNeeded: number;
    /** Đặt true để mục tiêu không thể đánh Thiểm (Thiết Kỵ, Liệt Cung). */
    noDodge: boolean;
  };
  slashDodged: { source: number; target: number; card: Card };
  /** Một lá Sát đã xử lý xong với một mục tiêu (dù trúng, bị né hay bị hủy). */
  slashEnd: { source: number; target: number; card: Card };
  beforeDamage: DamageCtx;
  /** Ngay sau khi trừ máu, TRƯỚC hấp hối. Luôn phát kể cả khi mục tiêu sắp chết (Cuồng Cốt). */
  damageDealt: DamageCtx;
  /** Chỉ phát khi mục tiêu còn sống sau khi đã qua hấp hối (ví dụ Gian Hùng). */
  damaged: DamageCtx;
  recovered: { seat: number; amount: number; source: number | null };
  /** Mất máu (không phải sát thương), ví dụ Khổ Nhục. */
  hpLost: { seat: number; amount: number };
  /** Sắp mất máu (không phải sát thương). Đặt cancelled = true để chặn (Hoàng Cân Thiên Bình Phủ). */
  beforeHpLost: { seat: number; amount: number; cancelled: boolean };
  /** Bắt đầu Quyết Đấu. Sửa need[seat] để đổi số Sát mỗi bên phải đánh mỗi lần (Vô Song = 2). */
  duelStarted: { user: number; target: number; card: Card; need: Record<number, number> };
  /** Vừa lật lá phán định (lá đang nằm ở vùng xử lý). */
  judged: { seat: number; card: Card; reason: string };
  /** Lá phán định cuối cùng, sau khi mọi kỹ năng sửa phán định đã chạy. */
  judgeFinal: { seat: number; card: Card; reason: string };
  /** Một cẩm nang (không trì hoãn) chọn trúng `target`, TRƯỚC khi hỏi Vô Giải. Đặt cancelled = true để bỏ qua mục tiêu này. */
  trickTargeted: { user: number; target: number; card: Card; name: CardName; cancelled: boolean };
  /** Sắp hỏi `seat` đánh một lá thuộc `accept` (kỹ năng có thể đưa thêm bài vào tay trước khi hỏi, ví dụ Ngạo Tài). */
  beforeRespond: { seat: number; accept: CardName[]; source: number | null };
  /** Một tướng bị loại bỏ khỏi ván (Quốc Chiến: 移除武将牌). */
  generalRemoved: { seat: number; generalId: string };
  /** Hợp Tung: `seat` sắp bốc 1 lá; kỹ năng có thể đổi người bốc (Hoằng Viện của Gia Cát Cẩn). */
  transferDraw: { seat: number; drawer: number; target: number };
  /** Một người vừa đổi phó tướng (变更副将). */
  deputyTransformed: { seat: number; oldGeneral: string; newGeneral: string };
  /** Một tướng vừa được lật (Quốc Chiến). */
  generalRevealed: { seat: number; generalId: string; first: boolean };
  dying: { seat: number; source: number | null };
  /** `cards`: các lá của người chết vừa bị bỏ vào chồng bỏ (Hành Thương có thể lấy). */
  death: { seat: number; killer: number | null; cards: number[] };
  gameOver: { winner: string | null; reason: string };
}

export type EventName = keyof EventMap;
export type Listener<K extends EventName> = (ctx: EventMap[K]) => void | Promise<void>;

interface Entry {
  fn: (ctx: unknown) => void | Promise<void>;
  priority: number;
}

export class EventBus {
  private readonly listeners = new Map<EventName, Entry[]>();

  /** Đăng ký listener. Priority cao chạy trước. Trả về hàm hủy đăng ký. */
  on<K extends EventName>(event: K, fn: Listener<K>, priority = 0): () => void {
    const list = this.listeners.get(event) ?? [];
    const entry: Entry = { fn: fn as Entry['fn'], priority };
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);
    this.listeners.set(event, list);
    return () => {
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
    };
  }

  /** Chạy tuần tự từng listener (await từng cái), trả về ctx sau khi đã bị sửa. */
  async emit<K extends EventName>(event: K, ctx: EventMap[K]): Promise<EventMap[K]> {
    const list = [...(this.listeners.get(event) ?? [])];
    for (const { fn } of list) await fn(ctx);
    return ctx;
  }
}
