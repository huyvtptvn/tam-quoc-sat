// ============================================================
// Kiểu dữ liệu cốt lõi của engine
// ============================================================

export type Suit = 'spade' | 'heart' | 'club' | 'diamond';

/** Tên lá bài. */
export type CardName =
  // Cơ bản
  | 'sha' | 'shan' | 'tao' | 'jiu'
  // Cẩm nang
  | 'wuxie' | 'wuxie_guo' | 'juedou' | 'nanman' | 'wanjian' | 'wuzhong' | 'guohe' | 'shunshou'
  | 'taoyuan' | 'huogong' | 'tiesuo' | 'zhiji' | 'yuanjiao' | 'yiyi'
  // Cẩm nang bộ Quân Tranh
  | 'jiedao' | 'wugu' | 'shuiyan'
  // Cẩm nang Thế Bị Thiên (Quốc Chiến)
  | 'huoshao' | 'diaohu' | 'lulitongxin' | 'lianjun' | 'xietianzi' | 'chiling'
  // Cẩm nang thế lực (Bất Thần) — nhận qua Chiếu Thư
  | 'haoling' | 'kefu' | 'guguo' | 'wenhe'
  // Cẩm nang trì hoãn
  | 'lebu' | 'bingliang' | 'shandian'
  // Vũ khí
  | 'zhuge' | 'qinggang' | 'hanbing' | 'guding' | 'qinglong' | 'guanshi' | 'fangtian' | 'qilin'
  | 'cixiong' | 'zhangba' | 'zhuque'
  | 'liujian' | 'sanjian' | 'qinglong_qc' | 'fangtian_qc' | 'feilong'
  // Giáp
  | 'bagua' | 'renwang' | 'tengjia' | 'baiyin' | 'huxinjing' | 'mingguang' | 'taiping'
  // Ngựa: +1 (phòng thủ) và -1 (tấn công)
  | 'jueying' | 'dilu' | 'zhuahuang' | 'hualiu' | 'chitu' | 'dayuan' | 'zixing' | 'jingfan' | 'liulong'
  // Bảo vật
  | 'yuxi' | 'muniu' | 'mingzhu' | 'zhaoshu';

export type CardType = 'basic' | 'trick' | 'delayed' | 'equip';

/** Ô trang bị. `treasure` = ô bảo vật (Ngọc Tỷ, Mộc Ngưu Lưu Mã, Định Lan Dạ Minh Châu). */
export type EquipSlot = 'weapon' | 'armor' | 'defHorse' | 'offHorse' | 'treasure';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'defHorse', 'offHorse', 'treasure'];

/** Thuộc tính sát thương. */
export type Nature = 'normal' | 'fire' | 'thunder';

export interface Card {
  readonly id: number;
  readonly name: CardName;
  readonly suit: Suit;
  readonly rank: number; // 1 (A) .. 13 (K)
  readonly type: CardType;
  /** Chỉ có ở Sát: Hỏa Sát hoặc Lôi Sát. */
  readonly nature?: 'fire' | 'thunder';
  /** Lá ảo ("coi như dùng một lá ..."): không nằm ở vùng nào, id âm. */
  readonly virtual?: boolean;
  /** Lá có dấu "Hợp" (合): dùng được cho hành động Hợp Tung. */
  readonly transferable?: boolean;
  /** Lá để riêng ngoài ván lúc đầu (Chiếu Thư, cẩm nang thế lực): nằm ở vùng "removed" cho đến khi được đưa vào. */
  readonly setAside?: boolean;
}

export type Phase = 'start' | 'judge' | 'draw' | 'play' | 'discard' | 'end';

export interface Player {
  readonly seat: number;
  readonly name: string;
  /**
   * Phe của người chơi. Giai đoạn 1 gán cố định.
   * Giai đoạn 2 (Quốc Chiến) sẽ thay bằng thế lực tính từ tướng đã lật.
   */
  team: string;
  hp: number;
  maxHp: number;
  hand: number[]; // card ids
  /** Khu vực riêng trên tướng (ngửa, ai cũng thấy). Ví dụ "Sẹo" của Chu Thái (Bất Khuất). */
  special: number[];
  /** Khu vực trang bị: mỗi ô chứa tối đa 1 lá (dùng mảng để đi chung cơ chế moveCards). */
  equips: Record<EquipSlot, number[]>;
  /** Khu vực phán định: cẩm nang trì hoãn đang chờ xử lý. Lá đặt sau cùng nằm cuối mảng. */
  judgeArea: number[];
  /** Đang bị xích (Thiết Tác Liên Hoàn). */
  chained: boolean;
  alive: boolean;
  /** Bộ đếm reset mỗi lượt của chính người này, ví dụ shaUsed. Khóa bắt đầu bằng "turn_" bị xóa cuối MỌI lượt. */
  flags: Record<string, number>;
  /** Tướng đang bị lật úp (叠置): lượt kế tiếp bị bỏ qua và lật lại. */
  faceDown?: boolean;
}

/** Các vùng chứa bài. Mỗi lá bài luôn nằm ở đúng một vùng. */
export type Zone =
  | { kind: 'hand'; seat: number }
  | { kind: 'draw' }
  | { kind: 'discard' }
  | { kind: 'processing' } // vùng xử lý: bài đang được dùng, chưa vào chồng bỏ
  | { kind: 'special'; seat: number } // khu vực riêng trên tướng
  | { kind: 'equip'; seat: number; slot: EquipSlot }
  | { kind: 'judge'; seat: number }
  | { kind: 'removed' }; // ngoài ván (移出游戏): lá để riêng, lá bị loại khỏi trận

export interface GameState {
  players: Player[];
  drawPile: number[]; // phần tử cuối mảng = lá trên cùng
  discardPile: number[];
  processing: number[];
  /** Bài ngoài ván (lá để riêng, lá bị loại khỏi trận). */
  removedPile: number[];
  currentSeat: number;
  phase: Phase;
  turnCount: number;
  finished: boolean;
  winner: string | null;
}

// ------------------------------------------------------------
// Hỏi – đáp giữa engine và người chơi (người thật hoặc bot)
// ------------------------------------------------------------

export type Request =
  /** Giai đoạn ra bài: chọn 1 lá để dùng hoặc kết thúc. */
  | { type: 'play'; seat: number }
  /** Yêu cầu đáp lại, ví dụ bị Sát thì đánh Thiểm. `context` cho bot/UI biết tình huống. */
  | { type: 'respond'; seat: number; accept: CardName[]; reason: string; source: number | null; context?: RespondContext }
  /** Có người hấp hối, hỏi có dùng Đào cứu không. */
  | { type: 'save'; seat: number; dying: number; need: number }
  /**
   * Bắt buộc bỏ đúng `count` lá trên tay. `cardIds`: các lá được phép bỏ (thiếu = cả tay).
   * `reason`: 'discardPhase' (giai đoạn bỏ bài) hoặc lý do khác; `limit`: giới hạn trữ bài (giai đoạn bỏ bài).
   */
  | { type: 'discard'; seat: number; count: number; cardIds?: number[]; reason?: string; limit?: number }
  // ----- Giai đoạn 2: Quốc Chiến -----
  /** Đầu trận: chọn 2 tướng cùng thế lực từ danh sách ứng viên. */
  /**
   * Chọn 2 tướng. `anyKingdom` = true (chế độ Loạn tướng): không cần cùng thế lực.
   * `mode`: 'normal' | 'free' (tự chọn từ danh sách) | 'chaos' (loạn tướng).
   */
  | { type: 'chooseGenerals'; seat: number; candidates: string[]; anyKingdom?: boolean; mode?: string; /** Thảo Phạt: ghép tướng tự do, cùng phe Liên quân. */ boss?: boolean }
  /** Đầu lượt: có lật tướng đang úp không. */
  | { type: 'reveal'; seat: number; canMain: boolean; canDeputy: boolean }
  /** Hỏi có kích hoạt kỹ năng không. `reveal` = true nghĩa là phải lật tướng để dùng. */
  | { type: 'confirm'; seat: number; skill: string; prompt: string; reveal: boolean }
  // ----- Giai đoạn 3 -----
  /** Chọn 1 trong các phương án (ví dụ Cương Liệt: bỏ 2 lá hay chịu 1 sát thương). */
  | { type: 'choose'; seat: number; prompt: string; options: string[] }
  /** Chọn từ min đến max người trong danh sách `candidates` (ví dụ Đột Tập, Lôi Kích). */
  | { type: 'chooseTargets'; seat: number; prompt: string; candidates: number[]; min: number; max: number; aim?: 'ally' | 'enemy' }
  // ----- Giai đoạn 4 -----
  /** Chọn từ min đến max lá trong `cardIds` (bài trên tay của chính mình), ví dụ Hỏa Công. */
  | { type: 'chooseCards'; seat: number; prompt: string; cardIds: number[]; min: number; max: number; cards?: Card[] };

/** Tình huống của một yêu cầu đáp lại. */
export type RespondContext =
  | { kind: 'slash'; source: number; card: Card }
  | { kind: 'aoe'; trick: CardName; user: number }
  | { kind: 'duel'; opponent: number }
  /** `cancelled`: hiện tại cẩm nang đang bị chặn hay không. */
  | { kind: 'nullify'; trick: CardName; user: number; target: number; cancelled: boolean }
  /** Thanh Long Yển Nguyệt Đao: có Sát tiếp mục tiêu này không. */
  | { kind: 'extraSlash'; target: number }
  | { kind: 'provoke'; by: number };

export type Response =
  /** `as`: dùng lá này như một loại bài khác nhờ kỹ năng (ví dụ Thiểm như Sát với Long Đảm). */
  | { kind: 'useCard'; cardId: number; targets: number[]; as?: CardName }
  | { kind: 'endPlay' }
  | { kind: 'card'; cardId: number }
  | { kind: 'pass' }
  | { kind: 'discard'; cardIds: number[] }
  /** Dùng kỹ năng chủ động trong giai đoạn ra bài. */
  | { kind: 'useSkill'; skill: string; cardIds: number[]; targets: number[] }
  | { kind: 'generals'; main: string; deputy: string }
  | { kind: 'reveal'; main: boolean; deputy: boolean }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'choice'; index: number }
  | { kind: 'targets'; targets: number[] }
  | { kind: 'cards'; cardIds: number[] };

/** Ngữ cảnh khi một lá được dùng/đánh ra: chủ động dùng, đáp lại, hay cứu người hấp hối. */
export type UseMode = 'use' | 'respond' | 'save';

/**
 * Bất kỳ ai điều khiển một ghế: bot, người chơi qua terminal,
 * hoặc (giai đoạn 6) một kết nối WebSocket.
 * Controller chỉ nhận PlayerView đã lọc, không bao giờ thấy toàn bộ state.
 */
export interface Controller {
  decide(req: Request, view: import('./view.js').PlayerView): Promise<Response>;
}
