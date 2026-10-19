// ============================================================
// Danh mục sự kiện cho kỹ năng JSON (phần "KHI").
// Mỗi sự kiện: ánh xạ tới sự kiện của engine + các biến dùng được trong "if"/hành động
// + các hành động được phép SỬA sự kiện (ví dụ tăng sát thương, bỏ qua giai đoạn).
// Trang quản trị và tài liệu đọc trực tiếp bảng này.
// ============================================================
import { isRed } from '../core/cards.js';
import type { EventName } from '../core/events.js';
import type { Game } from '../core/game.js';
import type { Card } from '../core/types.js';
import type { Value } from './expr.js';

export interface EventSpec {
  /** Sự kiện thật của engine. */
  engine: EventName;
  desc: string;
  /** Tên biến -> mô tả (biến "self" luôn có, là chủ kỹ năng). */
  vars: Record<string, string>;
  /** Hành động sửa sự kiện được phép dùng. */
  mods: string[];
  /** Đọc dữ liệu sự kiện thành biến. */
  read: (ctx: any, g: Game) => Record<string, Value>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Lọc thêm (cho sự kiện suy ra từ sự kiện khác). */
  filter?: (ctx: any, g: Game) => boolean; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Thông tin một lá bài thành biến dạng object: card.name, card.color... */
export function cardVars(card: Card | null | undefined, as?: string): Value {
  if (!card) return null;
  return {
    id: card.id,
    name: as ?? card.name,
    realName: card.name,
    color: isRed(card) ? 'red' : 'black',
    suit: card.suit,
    rank: card.rank,
    type: card.type,
    nature: card.nature ?? 'normal',
  };
}

const DAMAGE_VARS = {
  source: 'Người gây sát thương (null nếu không có)',
  target: 'Người chịu sát thương',
  amount: 'Số sát thương',
  nature: "Thuộc tính: 'normal' | 'fire' | 'thunder'",
  card: 'Lá gây sát thương (card.name, card.color...), có thể null',
  byCard: "Loại lá gây sát thương: 'sha', 'juedou', 'nanman'... hoặc '' ",
};
const readDamage = (c: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  source: c.source, target: c.target, amount: c.amount, nature: c.nature ?? 'normal',
  card: cardVars(c.card, c.cardAs), byCard: c.cardAs ?? '',
});

export const EVENT_SPECS: Record<string, EventSpec> = {
  damaged: {
    engine: 'damaged',
    desc: 'Sau khi một người chịu sát thương (và vẫn còn sống). Dùng "role": "target" cho "sau khi BẠN chịu sát thương", "role": "source" cho "sau khi bạn GÂY sát thương".',
    vars: DAMAGE_VARS, mods: [], read: readDamage,
  },
  beforeDamage: {
    engine: 'beforeDamage',
    desc: 'Ngay trước khi sát thương được tính. Có thể tăng/giảm/chặn sát thương.',
    vars: DAMAGE_VARS, mods: ['modifyDamage', 'setDamage', 'cancel'], read: readDamage,
  },
  hpLost: {
    engine: 'hpLost',
    desc: 'Sau khi một người mất máu (không phải sát thương, ví dụ Khổ Nhục).',
    vars: { who: 'Người mất máu', amount: 'Số máu mất' }, mods: [],
    read: (c) => ({ who: c.seat, amount: c.amount }),
  },
  recovered: {
    engine: 'recovered',
    desc: 'Sau khi một người hồi máu.',
    vars: { who: 'Người hồi máu', amount: 'Số máu hồi', source: 'Người giúp hồi (có thể null)' }, mods: [],
    read: (c) => ({ who: c.seat, amount: c.amount, source: c.source }),
  },
  cardUsed: {
    engine: 'cardUsed',
    desc: 'Khi một người dùng một lá bài (Sát, cẩm nang, trang bị...).',
    vars: {
      user: 'Người dùng', card: 'Lá bài (card.name là loại được tính, ví dụ Thiểm dùng như Sát thì là sha)',
      target: 'Mục tiêu đầu tiên (null nếu không có)', targetCount: 'Số mục tiêu',
    },
    mods: [],
    read: (c) => ({ user: c.seat, card: cardVars(c.card, c.as), target: c.targets[0] ?? null, targetCount: c.targets.length }),
  },
  cardResponded: {
    engine: 'cardResponded',
    desc: 'Khi một người đánh ra một lá để đáp lại (Thiểm khi bị Sát, Sát khi bị Nam Man...).',
    vars: { responder: 'Người đánh', card: 'Lá đã đánh (card.name là loại được tính)' }, mods: [],
    read: (c) => ({ responder: c.seat, card: cardVars(c.card, c.as) }),
  },
  slashTargeted: {
    engine: 'slashTargeted',
    desc: 'Khi một lá Sát chọn mục tiêu (trước khi mục tiêu đánh Thiểm).',
    vars: { source: 'Người dùng Sát', target: 'Mục tiêu', card: 'Lá Sát' },
    mods: ['noDodge', 'needShan', 'cancel'],
    read: (c) => ({ source: c.source, target: c.target, card: cardVars(c.card, 'sha') }),
  },
  slashDodged: {
    engine: 'slashDodged',
    desc: 'Khi Sát bị Thiểm né.',
    vars: { source: 'Người dùng Sát', target: 'Người đã né', card: 'Lá Sát' }, mods: [],
    read: (c) => ({ source: c.source, target: c.target, card: cardVars(c.card, 'sha') }),
  },
  turnStart: {
    engine: 'turnStart', desc: 'Đầu lượt của một người.',
    vars: { current: 'Người đang trong lượt' }, mods: [], read: (c) => ({ current: c.seat }),
  },
  turnEnd: {
    engine: 'turnEnd', desc: 'Cuối lượt của một người.',
    vars: { current: 'Người đang trong lượt' }, mods: [], read: (c) => ({ current: c.seat }),
  },
  phaseBefore: {
    engine: 'phaseBefore',
    desc: "Trước khi một giai đoạn bắt đầu. Có thể bỏ qua giai đoạn đó. phase: 'start' | 'judge' | 'draw' | 'play' | 'discard' | 'end'.",
    vars: { current: 'Người đang trong lượt', phase: 'Tên giai đoạn' }, mods: ['skipPhase'],
    read: (c) => ({ current: c.seat, phase: c.phase }),
  },
  phaseStart: {
    engine: 'phaseStart', desc: 'Khi một giai đoạn bắt đầu.',
    vars: { current: 'Người đang trong lượt', phase: 'Tên giai đoạn' }, mods: [],
    read: (c) => ({ current: c.seat, phase: c.phase }),
  },
  phaseEnd: {
    engine: 'phaseEnd', desc: 'Khi một giai đoạn kết thúc.',
    vars: { current: 'Người đang trong lượt', phase: 'Tên giai đoạn' }, mods: [],
    read: (c) => ({ current: c.seat, phase: c.phase }),
  },
  drawPhase: {
    engine: 'drawPhase', desc: 'Giai đoạn bốc bài. Có thể đổi số lá bốc.',
    vars: { current: 'Người đang bốc', count: 'Số lá sẽ bốc (mặc định 2)' }, mods: ['drawCount'],
    read: (c) => ({ current: c.seat, count: c.count }),
  },
  dying: {
    engine: 'dying', desc: 'Khi một người rơi vào hấp hối (trước khi mọi người được hỏi cứu).',
    vars: { dying: 'Người hấp hối', source: 'Người gây ra (có thể null)' }, mods: [],
    read: (c) => ({ dying: c.seat, source: c.source }),
  },
  death: {
    engine: 'death', desc: 'Khi một người tử trận. Dùng "role": "victim" cho kỹ năng "khi BẠN chết" (Đoạn Trường) — vẫn kích hoạt dù bạn vừa chết.',
    vars: { victim: 'Người chết', killer: 'Người giết (có thể null)' }, mods: [],
    read: (c) => ({ victim: c.seat, killer: c.killer }),
  },
  handEmptied: {
    engine: 'cardsMoved', desc: 'Khi một người mất lá bài cuối cùng trên tay.',
    vars: { owner: 'Người vừa hết bài' }, mods: [],
    filter: (c, g) => c.from.kind === 'hand' && g.player(c.from.seat).hand.length === 0,
    read: (c) => ({ owner: c.from.seat }),
  },
  cardsLeftHand: {
    engine: 'cardsMoved', desc: 'Khi bài rời khỏi tay một người (dùng, đánh, bỏ, bị lấy...).',
    vars: { owner: 'Người mất bài', count: 'Số lá', reason: "Lý do: 'use', 'respond', 'discardPhase', 'guohe'..." }, mods: [],
    filter: (c) => c.from.kind === 'hand' && !(c.to.kind === 'hand' && c.to.seat === c.from.seat),
    read: (c) => ({ owner: c.from.seat, count: c.cardIds.length, reason: c.reason }),
  },
  duelStarted: {
    engine: 'duelStarted', desc: 'Khi Quyết Đấu bắt đầu. Có thể đổi số Sát mỗi bên phải đánh.',
    vars: { user: 'Người dùng Quyết Đấu', target: 'Mục tiêu' }, mods: ['needSha'],
    read: (c) => ({ user: c.user, target: c.target }),
  },
  judged: {
    engine: 'judged', desc: 'Khi một lá phán định vừa được lật.',
    vars: { who: 'Người phán định', judge: 'Lá phán định (judge.color, judge.suit, judge.rank...)', reason: 'Lý do phán định' },
    mods: [], read: (c) => ({ who: c.seat, judge: cardVars(c.card), reason: c.reason }),
  },
  trickTargeted: {
    engine: 'trickTargeted',
    desc: 'Khi một cẩm nang (không trì hoãn) nhắm vào một người, TRƯỚC khi hỏi Vô Giải. Dùng "cancel" để hủy mục tiêu này (Vãn Nguy, Họa Thủ).',
    vars: { user: 'Người dùng cẩm nang', target: 'Người bị nhắm', card: "Lá cẩm nang (card.name: 'guohe', 'nanman'...)" },
    mods: ['cancel'],
    read: (c) => ({ user: c.user, target: c.target, card: cardVars(c.card, c.name) }),
  },
  generalRemoved: {
    engine: 'generalRemoved', desc: 'Khi một tướng bị loại bỏ khỏi ván.',
    vars: { who: 'Người mất tướng', general: 'id tướng bị loại' }, mods: [],
    read: (c) => ({ who: c.seat, general: c.generalId }),
  },
  generalRevealed: {
    engine: 'generalRevealed', desc: 'Khi một tướng được lật.',
    vars: { who: 'Người lật tướng', first: 'true nếu là lần lật đầu tiên của người đó' }, mods: [],
    read: (c) => ({ who: c.seat, first: c.first }),
  },
};
