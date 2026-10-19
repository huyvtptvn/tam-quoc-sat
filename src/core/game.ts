// ============================================================
// Game: trái tim của engine.
// Chứa state, xử lý vòng lượt, dùng bài, sát thương, hấp hối, tử vong.
// Không phụ thuộc mạng hay giao diện -> chạy được trong test, server, trình duyệt.
// ============================================================
import { buildDeck, CARD_INFO, cardLabel, EQUIP_SLOT_LABEL, pickDiscards } from './cards.js';
import { installEquipment, tryGuanshi, tryQinglong, tryZhangbaResponse } from './equipment.js';
import { EventBus, type DamageCtx } from './events.js';
import { createRng, shuffle, type Rng } from './rng.js';
import { checkTrickUse, resolveJudgePhase, resolveTrick, TRICK_DEFS, trickTargetSpec } from './tricks.js';
import {
  EQUIP_SLOTS,
  type Card, type CardName, type Controller, type EquipSlot, type GameState, type Phase, type Player,
  type Request, type RespondContext, type Response, type UseMode, type Zone,
} from './types.js';
import { viewFor, type PlayerView } from './view.js';

/** Cách chọn mục tiêu của một lá bài (cho UI/bot và kiểm tra hợp lệ). */
export interface TargetSpec {
  /** false: không cần chọn (tự xác định mục tiêu, ví dụ Nam Man, Đào). */
  needsTarget: boolean;
  /** Các mục tiêu có thể chọn. */
  candidates: number[];
  min: number;
  max: number;
}

export const PHASES: Phase[] = ['start', 'judge', 'draw', 'play', 'discard', 'end'];

export const PHASE_LABEL: Record<Phase, string> = {
  start: 'Bắt đầu', judge: 'Phán định', draw: 'Bốc bài',
  play: 'Ra bài', discard: 'Bỏ bài', end: 'Kết thúc',
};

export interface PlayerSetup {
  name: string;
  team: string;
  maxHp?: number;
  controller: Controller;
}

export interface GameOptions {
  seed?: number;
  startingHand?: number;
  /** Chống ván kéo dài vô hạn. */
  maxTurns?: number;
  /** Thời gian chờ mỗi câu hỏi (ms). 0 = chờ mãi. Server nên đặt ~15000. */
  timeoutMs?: number;
  /** Giai đoạn 1: cho mọi người thấy phe nhau. Quốc Chiến sẽ đặt false. */
  revealTeams?: boolean;
  firstSeat?: number;
  deck?: Card[];
  onLog?: (line: string) => void;
}

type ResolvedOptions = Required<Omit<GameOptions, 'deck'>>;

export type EndReason = 'victory' | 'deckExhausted' | 'turnLimit';

/** Sự kiện thống kê để tính điểm (xem src/hegemony/scoring.ts). `by` = người ra tay nếu biết. */
export type StatEvent =
  | { kind: 'turnedOver'; seat: number; faceDown: boolean; by: number | null }
  | { kind: 'nullified'; by: number; user: number; target: number; trick: CardName; cancelled: boolean }
  | { kind: 'delayedHit'; seat: number; name: CardName; cardId: number }
  | { kind: 'lured'; seat: number; by: number | null }
  /** Một kỹ năng của tướng `generalId` vừa được dùng/kích hoạt (để phát lồng tiếng). */
  | { kind: 'skillUsed'; seat: number; skill: string; generalId: string };

export interface GameResult {
  winner: string | null;
  reason: EndReason;
  turns: number;
}

export type UseResult = { ok: true } | { ok: false; reason: string };

/** Ném ra để thoát ngay khỏi chuỗi async lồng nhau khi ván kết thúc. */
export class GameOver extends Error {
  constructor(public readonly reason: EndReason) {
    super('GameOver');
  }
}

export class Game {
  readonly state: GameState;
  readonly bus = new EventBus();
  /**
   * Ai đang "ra tay" (người đang dùng lá / kỹ năng). Dùng để ghi điểm: lá bị bỏ, mất máu... do ai gây ra.
   * Không ảnh hưởng luật chơi.
   */
  readonly actorStack: number[] = [];
  /** Người đang ra tay hiện tại (null = không rõ, ví dụ giai đoạn bỏ bài). */
  get actor(): number | null { return this.actorStack.length ? this.actorStack[this.actorStack.length - 1] : null; }
  /** Chạy `fn` với `seat` là người ra tay. */
  async asActor<T>(seat: number, fn: () => Promise<T>): Promise<T> {
    this.actorStack.push(seat);
    try { return await fn(); } finally { this.actorStack.pop(); }
  }
  /** Sự kiện thống kê (đồng bộ, chỉ để ghi điểm): lật úp, Vô Giải, tù thành công, Điệu Hổ... */
  readonly statListeners: ((e: StatEvent) => void)[] = [];
  stat(e: StatEvent): void { for (const f of this.statListeners) f(e); }
  readonly log: string[] = [];
  readonly cards = new Map<number, Card>();
  readonly opts: ResolvedOptions;
  result: GameResult | null = null;

  protected readonly controllers: Controller[];
  protected readonly rng: Rng;
  protected started = false;

  constructor(setups: PlayerSetup[], options: GameOptions = {}) {
    if (setups.length < 2) throw new Error('Cần ít nhất 2 người chơi');
    this.opts = {
      seed: options.seed ?? Date.now(),
      startingHand: options.startingHand ?? 4,
      maxTurns: options.maxTurns ?? 500,
      timeoutMs: options.timeoutMs ?? 0,
      revealTeams: options.revealTeams ?? true,
      firstSeat: options.firstSeat ?? 0,
      onLog: options.onLog ?? (() => {}),
    };
    this.rng = createRng(this.opts.seed);

    const deck = options.deck ?? buildDeck();
    for (const c of deck) this.cards.set(c.id, c);
    this.controllers = setups.map((s) => s.controller);

    this.state = {
      players: setups.map((s, seat) => ({
        seat,
        name: s.name,
        team: s.team,
        hp: s.maxHp ?? 4,
        maxHp: s.maxHp ?? 4,
        hand: [],
        special: [],
        equips: { weapon: [], armor: [], defHorse: [], offHorse: [], treasure: [] },
        judgeArea: [],
        chained: false,
        alive: true,
        flags: {},
      })),
      drawPile: shuffle(deck.filter((c) => !c.setAside).map((c) => c.id), this.rng),
      discardPile: [],
      processing: [],
      removedPile: deck.filter((c) => c.setAside).map((c) => c.id),
      currentSeat: this.opts.firstSeat,
      phase: 'start',
      turnCount: 0,
      finished: false,
      winner: null,
    };
    this.notes = setups.map(() => []);
    installEquipment(this);
  }

  /** Hàng đợi lượt thêm. */
  protected readonly extraTurns: number[] = [];

  /** Cho `seat` thêm một lượt ngay sau lượt hiện tại. */
  grantExtraTurn(seat: number): void {
    this.extraTurns.push(seat);
  }

  /** Lá cẩm nang trì hoãn được đặt bằng cách chuyển hóa (ví dụ lá Rô dùng như Lạc Bất Tư Thục): id -> tên. */
  private readonly delayedAs = new Map<number, CardName>();

  /** Tên cẩm nang trì hoãn của một lá đang nằm trong khu vực phán định. */
  delayedName(id: number): CardName {
    return this.delayedAs.get(id) ?? this.card(id).name;
  }

  /** Ghi nhận lá `id` (vừa được kỹ năng đặt vào khu vực phán định) được tính như cẩm nang trì hoãn `name` (Chấn Tập). */
  markDelayedAs(id: number, name: CardName): void {
    if (name !== this.card(id).name) this.delayedAs.set(id, name);
  }

  /** Lá đang được xử lý mà không ai được hưởng ứng (Vãng Liệt): khi lá này còn ở vùng xử lý, mọi yêu cầu đánh bài đều bỏ qua. */
  noResponseCard: number | null = null;

  private virtualSeq = 0;

  /** Tạo một lá ảo ("coi như dùng một lá X"). Không thuộc vùng nào, không được moveCards. */
  virtualCard(name: CardName, like?: Card): Card {
    return {
      id: -(++this.virtualSeq), name, type: CARD_INFO[name].type, virtual: true,
      suit: like?.suit ?? 'spade', rank: like?.rank ?? 0,
    } as Card;
  }

  /** Thông tin riêng tư của từng người (ví dụ kết quả Tri Kỷ Tri Bỉ). Chỉ người đó thấy trong view. */
  readonly notes: string[][];

  /** Gửi một ghi chú riêng cho `seat`. */
  tell(seat: number, msg: string): void {
    this.notes[seat].push(msg);
  }

  // ==========================================================
  // API công khai
  // ==========================================================

  /** Chia bài đầu trận. Gọi tự động trong run(); test có thể gọi riêng. */
  async setup(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.say(`Ván bắt đầu với ${this.state.players.length} người chơi (seed ${this.opts.seed}).`);
    await this.bus.emit('gameStart', { seats: this.state.players.length });
    for (const p of this.state.players) await this.draw(p.seat, this.opts.startingHand, 'deal');
  }

  /** Chạy toàn bộ ván cho đến khi có kết quả. */
  async run(): Promise<GameResult> {
    try {
      await this.setup();
      let seat = this.opts.firstSeat;
      while (!this.state.finished) {
        await this.turn(seat);
        this.state.turnCount++;
        if (this.state.turnCount >= this.opts.maxTurns) await this.finish(null, 'turnLimit');
        // Lượt thêm (Phóng Quyền...): chạy ngay sau lượt vừa xong, rồi quay lại thứ tự cũ
        while (this.extraTurns.length > 0 && !this.state.finished) {
          const extra = this.extraTurns.shift()!;
          if (!this.player(extra).alive) continue;
          this.say(`${this.player(extra).name} được thêm một lượt.`);
          await this.turn(extra);
          this.state.turnCount++;
          if (this.state.turnCount >= this.opts.maxTurns) await this.finish(null, 'turnLimit');
        }
        seat = this.nextAliveSeat(seat);
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    return this.result!;
  }

  /** Chạy một lượt duy nhất (dùng trong test). */
  async runTurn(seat: number): Promise<void> {
    try {
      await this.turn(seat);
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
  }

  /** Dùng một lá bài từ bên ngoài (test, server). Có kiểm tra hợp lệ. */
  async useCard(seat: number, cardId: number, targets: number[], as?: CardName): Promise<UseResult> {
    const err = this.checkUse(seat, cardId, targets, as);
    if (err) return { ok: false, reason: err };
    try {
      await this.doUse(seat, cardId, targets, as);
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    return { ok: true };
  }

  // ==========================================================
  // Tra cứu
  // ==========================================================

  player(seat: number): Player {
    const p = this.state.players[seat];
    if (!p) throw new Error(`Ghế ${seat} không tồn tại`);
    return p;
  }

  card(id: number): Card {
    const c = this.cards.get(id);
    if (!c) throw new Error(`Lá bài ${id} không tồn tại`);
    return c;
  }

  /** Định nghĩa cẩm nang (cách chọn mục tiêu...). */
  trickDef(name: CardName) {
    return TRICK_DEFS[name] ?? null;
  }

  /** Tên mọi loại bài đang có (kể cả lá thêm từ content/). */
  allCardNames(): CardName[] {
    return Object.keys(CARD_INFO) as CardName[];
  }

  /** Mục tiêu tự động của cẩm nang không cần chọn (Nam Man: mọi người khác...). */
  autoTargetsOf(seat: number, name: CardName): number[] {
    const def = TRICK_DEFS[name];
    if (!def) return [];
    switch (def.targeting) {
      case 'self': return [seat];
      case 'allOthers': return this.aliveSeatsFrom(seat).filter((s) => s !== seat);
      case 'all': return this.aliveSeatsFrom(seat);
      case 'custom': return def.autoTargets!(this, seat);
      default: return [];
    }
  }

  /** Thông tin loại bài (tên hiển thị, loại, ô trang bị, tầm). */
  cardInfo(name: CardName) {
    return CARD_INFO[name];
  }

  isAliveSeat(seat: number): boolean {
    return Number.isInteger(seat) && seat >= 0 && seat < this.state.players.length
      && this.state.players[seat].alive;
  }

  alivePlayers(): Player[] {
    return this.state.players.filter((p) => p.alive);
  }

  /** Danh sách ghế còn sống theo thứ tự chỗ ngồi, bắt đầu từ `start` (kể cả start nếu còn sống). */
  aliveSeatsFrom(start: number): number[] {
    const n = this.state.players.length;
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const s = (start + k) % n;
      if (this.state.players[s].alive) out.push(s);
    }
    return out;
  }

  nextAliveSeat(seat: number): number {
    const n = this.state.players.length;
    for (let k = 1; k <= n; k++) {
      const s = (seat + k) % n;
      if (this.state.players[s].alive) return s;
    }
    return seat;
  }

  // ==========================================================
  // Luật có thể bị kỹ năng/trang bị thay đổi (điểm mở rộng)
  // ==========================================================

  /**
   * Khoảng cách = số bước ngắn nhất quanh bàn (chỉ đếm người còn sống),
   * trừ 1 nếu người đi có ngựa -1, cộng 1 nếu người đến có ngựa +1. Tối thiểu là 1.
   */
  distance(from: number, to: number): number {
    if (from === to) return 0;
    // Điệu Hổ Ly Sơn: người bị "điệu" không tính vào khoảng cách / vị trí trong lượt này
    if (this.isLured(from) || this.isLured(to)) return Infinity;
    const ring = this.alivePlayers().filter((p) => !this.isLured(p.seat)).map((p) => p.seat);
    const i = ring.indexOf(from);
    const j = ring.indexOf(to);
    if (i < 0 || j < 0) return Infinity;
    const d = Math.abs(i - j);
    const base = Math.min(d, ring.length - d);
    const off = this.equipOf(from, 'offHorse') ? 1 : 0;
    // Lục Long Tham Giá nằm ở ô ngựa -1 nhưng được tính cả là ngựa +1
    const def = this.equipOf(to, 'defHorse') || this.equipOf(to, 'offHorse')?.name === 'liulong' ? 1 : 0;
    return Math.max(1, base - off + def);
  }

  /** Bị Điệu Hổ Ly Sơn trong lượt này: không tính khoảng cách, không dùng bài, không bị chọn làm mục tiêu, máu không đổi. */
  isLured(seat: number): boolean {
    return !!this.state.players[seat]?.flags.turn_lured;
  }

  /** Tầm đánh = tầm của vũ khí, hoặc 1 nếu không có vũ khí. */
  attackRange(seat: number): number {
    const w = this.equipOf(seat, 'weapon');
    return w ? CARD_INFO[w.name].range ?? 1 : 1;
  }

  /** Số lần được dùng Sát mỗi lượt. Gia Cát Liên Nỏ / Bào Hao: không giới hạn. */
  slashLimit(seat: number): number {
    return this.weaponName(seat) === 'zhuge' ? Infinity : 1;
  }

  /** Số mục tiêu tối đa của lá Sát này. Phương Thiên Họa Kích: Sát là lá cuối cùng trên tay thì tối đa 3. */
  maxSlashTargets(seat: number, cardId: number): number {
    const hand = this.player(seat).hand;
    return this.weaponName(seat) === 'fangtian' && hand.length === 1 && hand[0] === cardId ? 3 : 1;
  }

  // ---------- Trang bị ----------

  equipOf(seat: number, slot: EquipSlot): Card | null {
    const id = this.player(seat).equips[slot][0];
    return id === undefined ? null : this.card(id);
  }

  weaponName(seat: number): CardName | null {
    return this.equipOf(seat, 'weapon')?.name ?? null;
  }

  /**
   * Giáp của `target` có hiệu lực không, trả về tên giáp.
   * Thanh Công Kiếm: Sát của người cầm kiếm bỏ qua giáp.
   */
  armorOf(target: number, source: number | null = null, isSlash = false): CardName | null {
    const a = this.equipOf(target, 'armor');
    if (!a) return null;
    if (isSlash && source !== null && this.player(source).alive && this.weaponName(source) === 'qinggang') return null;
    return a.name;
  }

  /** Số ngẫu nhiên 0..n-1 theo seed của ván (để kết quả tái hiện được). */
  randomInt(n: number): number {
    return Math.floor(this.rng() * n);
  }

  /** Tất cả bài của một người: trên tay, trang bị, phán định. */
  /** Số trang bị đang lắp (kể cả bảo vật). */
  equipCount(seat: number): number {
    const p = this.player(seat);
    return EQUIP_SLOTS.reduce((n, s) => n + p.equips[s].length, 0);
  }

  cardCount(seat: number, includeJudge = false): number {
    const p = this.player(seat);
    const eq = EQUIP_SLOTS.reduce((n, s) => n + p.equips[s].length, 0);
    return p.hand.length + eq + (includeJudge ? p.judgeArea.length : 0);
  }

  /** `chooser` bị cấm lấy/bỏ trang bị của `target` (Phong Dương). Quốc Chiến ghi đè. */
  equipProtected(_chooser: number, _target: number): boolean {
    return false;
  }

  /** Nhóm người bị Vô Giải·Quốc chặn cùng lúc khi chặn cẩm nang lên `target`. Quốc Chiến ghi đè. */
  factionGroup(target: number): number[] {
    return [target];
  }

  /** Giới hạn bài trên tay khi bỏ bài. */
  handLimit(seat: number): number {
    const f = this.player(seat).flags;
    if ((f.turn_handLimitFixed ?? 0) > 0) return f.turn_handLimitFixed;
    return Math.max(0, this.player(seat).hp + (f.turn_handLimitDelta ?? 0));
  }

  /**
   * Lá này đang bị cấm dùng/đánh không (ví dụ Tiềm Tập cấm lá đỏ, Phá Trận cấm mọi lá trên tay).
   * Cờ "turn_ban..." tự hết hiệu lực cuối lượt.
   */
  cardBlocked(seat: number, card: Card): boolean {
    const f = this.player(seat).flags;
    if (f.turn_banHand || f.turn_lured) return true;
    if (f[`turn_banType_${card.type}`]) return true; // Kê Lặc: cấm một loại bài trong lượt
    const red = card.suit === 'heart' || card.suit === 'diamond';
    return red ? !!f.turn_banRed : !!f.turn_banBlack;
  }

  /** Lá này được tính là những loại bài nào. Giai đoạn 2: Long Đảm cho Sát <-> Thiểm. */
  cardCountsAs(_seat: number, card: Card): CardName[] {
    // Vô Giải Khả Kích·Quốc cũng là một lá Vô Giải Khả Kích
    return card.name === 'wuxie_guo' ? ['wuxie_guo', 'wuxie'] : [card.name];
  }

  /** Thắng khi tất cả người còn sống cùng một phe. Chế độ Quốc Chiến ghi đè hàm này. */
  checkWinner(): string | null {
    const teams = new Set(this.alivePlayers().map((p) => p.team));
    return teams.size === 1 ? [...teams][0] : null;
  }

  /** `source` có được chọn `target` làm mục tiêu không (bất kỳ lá/kỹ năng nào). Ví dụ Tự Thủ. */
  canTarget(_source: number, target: number): boolean {
    return !this.isLured(target);
  }

  /**
   * Cứu người hấp hối bằng cách khác ngoài lá Đào (ví dụ ký hiệu Châu Liên Bích Hợp).
   * Trả về true nếu đã cứu (hồi máu) thành công.
   */
  protected async specialSave(_helper: number, _dying: number, _res: Extract<Response, { kind: 'useSkill' }>): Promise<boolean> {
    return false;
  }

  /** `target` có thể bị `source` chọn làm mục tiêu của Sát không. Ví dụ Không Thành. */
  canBeSlashTarget(_source: number, _target: number): boolean {
    return true;
  }

  /** `helper` có được dùng Đào cứu `dying` không. Ví dụ Hoàn Sát của Giả Hủ. */
  canSave(_helper: number, _dying: number): boolean {
    return true;
  }

  /** `seat` bị cấm hưởng ứng (đánh `accept`) lúc này không (Họa Thủy, Khiêm Sách). Engine gốc: không. */
  responseBlocked(_seat: number, _accept: CardName[], _source: number | null, _context?: RespondContext): boolean {
    return false;
  }

  /**
   * Khi `chooser` sắp chọn 1 lá của `target` để lấy/bỏ (Quá Hà, Thuận Thủ...): kỹ năng của `target`
   * có thể đổi thành tự chọn lá (Văn Ngụy). Trả về lá đã chọn hoặc null (chọn như bình thường).
   */
  async redirectPick(_chooser: number, _target: number, _includeJudge: boolean): Promise<{ id: number; from: Zone } | null> {
    return null;
  }

  /** Sát (lá `card`, null = Sát ảo) của `seat` lên `target` không giới hạn khoảng cách (Võ Thánh Rô, Liệt Cung). Engine gốc: không. */
  slashRangeExempt(_seat: number, _target: number, _card: Card | null): boolean {
    return false;
  }

  /** Cẩm nang của `seat` không giới hạn khoảng cách (Kỳ Tài). Engine gốc: không. */
  trickNoDistance(_seat: number): boolean {
    return false;
  }

  /**
   * Gọi ngay khi một lá được dùng/đánh ra như loại `as`.
   * Chế độ Quốc Chiến dùng chỗ này để lật tướng khi lá được chuyển hóa bằng kỹ năng của tướng đang úp.
   */
  protected async onCardUsedAs(_seat: number, _card: Card, _as: CardName, _mode: UseMode): Promise<void> {}

  /** Gọi ngay khi một người vừa chết, trước khi ghi log và bỏ bài (Quốc Chiến: lật hết tướng). */
  protected async beforeDeath(_seat: number): Promise<void> {}

  /** Dùng kỹ năng chủ động. Trả về lỗi hoặc null nếu thành công. Engine gốc không có kỹ năng. */
  protected async useSkillAction(_seat: number, _res: Extract<Response, { kind: 'useSkill' }>): Promise<string | null> {
    return 'Không có kỹ năng này';
  }

  /** Tạo view cho một người chơi. Chế độ Quốc Chiến ghi đè để thêm thông tin tướng. */
  makeView(seat: number, req?: Request): PlayerView {
    return viewFor(this, seat, req);
  }

  // ==========================================================
  // Kiểm tra hợp lệ khi dùng bài
  // ==========================================================

  /** Trả về null nếu hợp lệ, hoặc lý do không hợp lệ. */
  checkUse(seat: number, cardId: number, targets: number[], as?: CardName): string | null {
    const s = this.state;
    if (s.finished) return 'Ván đã kết thúc';
    if (!this.isAliveSeat(seat)) return 'Người chơi không hợp lệ';
    if (s.currentSeat !== seat || s.phase !== 'play') return 'Chỉ được dùng bài trong giai đoạn ra bài của mình';
    const p = this.player(seat);
    if (!p.hand.includes(cardId)) return 'Lá bài không có trên tay';
    if (!Array.isArray(targets) || new Set(targets).size !== targets.length) return 'Danh sách mục tiêu không hợp lệ';
    if (as !== undefined && !Object.hasOwn(CARD_INFO, as)) return 'Loại bài không hợp lệ';

    const card = this.card(cardId);
    const name = as ?? card.name;
    if (this.cardBlocked(seat, card)) return 'Lá này đang bị cấm dùng trong lượt này';
    if (!this.cardCountsAs(seat, card).includes(name)) return `Không thể dùng lá này như ${CARD_INFO[name].label}`;
    const info = CARD_INFO[name];

    if (info.type === 'equip') {
      if (targets.length !== 0) return 'Trang bị không cần chọn mục tiêu';
      // Lục Long Tham Giá chiếm cả hai ô ngựa: đang lắp thì không lắp ngựa khác được
      if ((info.slot === 'defHorse' || info.slot === 'offHorse') && name !== 'liulong' && this.equipOf(seat, 'offHorse')?.name === 'liulong') {
        return 'Đang lắp Lục Long Tham Giá: không thể lắp ngựa khác';
      }
      return null;
    }
    if (info.type === 'trick' || info.type === 'delayed') return checkTrickUse(this, seat, card, name, targets);

    switch (name) {
      case 'sha': {
        const max = this.maxSlashTargets(seat, cardId);
        if (targets.length < 1 || targets.length > max) return max > 1 ? `Sát cần 1–${max} mục tiêu` : 'Sát cần đúng 1 mục tiêu';
        if (p.flags.turn_banSha) return 'Không thể dùng Sát trong lượt này'; // Truân Trữ (Lý Phong)
        if ((p.flags.shaUsed ?? 0) >= this.slashLimit(seat)) return 'Đã dùng hết số lần Sát trong lượt';
        for (const t of targets) {
          if (!this.isAliveSeat(t)) return 'Mục tiêu không hợp lệ';
          if (t === seat) return 'Không thể Sát chính mình';
          if (this.distance(seat, t) > this.attackRange(seat) && !this.slashRangeExempt(seat, t, card)) return 'Mục tiêu ngoài tầm đánh';
          if (!this.canTarget(seat, t)) return 'Không thể chọn mục tiêu này';
          if (!this.canBeSlashTarget(seat, t)) return 'Mục tiêu không thể bị Sát';
        }
        return null;
      }
      case 'tao': {
        if (targets.length > 1 || (targets.length === 1 && targets[0] !== seat)) return 'Đào chỉ dùng cho bản thân';
        if (p.hp >= p.maxHp) return 'Máu đang đầy';
        return null;
      }
      case 'jiu': {
        if (targets.length > 1 || (targets.length === 1 && targets[0] !== seat)) return 'Rượu chỉ dùng cho bản thân';
        if (p.flags.jiuUsed) return 'Mỗi lượt chỉ được dùng 1 Rượu';
        return null;
      }
      default:
        return `${info.label} chỉ dùng để đáp lại`;
    }
  }

  /** Cách chọn mục tiêu của một lá khi dùng chủ động (cho UI/bot). */
  targetSpec(seat: number, cardId: number, as?: CardName): TargetSpec {
    const none: TargetSpec = { needsTarget: false, candidates: [], min: 0, max: 0 };
    const card = this.cards.get(cardId);
    if (!card) return { ...none, needsTarget: true };
    const name = as ?? card.name;
    const info = CARD_INFO[name];
    if (info.type === 'trick' || info.type === 'delayed') return trickTargetSpec(this, seat, card, name);
    if (name !== 'sha') return none;
    const candidates = this.alivePlayers().map((p) => p.seat)
      .filter((t) => this.checkUse(seat, cardId, [t], as) === null);
    return { needsTarget: true, candidates, min: 1, max: this.maxSlashTargets(seat, cardId) };
  }

  /** Các mục tiêu hợp lệ của một lá (để UI làm sáng). Trả về null nếu lá không cần chọn mục tiêu. */
  validTargets(seat: number, cardId: number, as?: CardName): number[] | null {
    const spec = this.targetSpec(seat, cardId, as);
    return spec.needsTarget ? spec.candidates : null;
  }

  // ==========================================================
  // Di chuyển bài
  // ==========================================================

  private zone(z: Zone): number[] {
    switch (z.kind) {
      case 'hand': return this.player(z.seat).hand;
      case 'draw': return this.state.drawPile;
      case 'discard': return this.state.discardPile;
      case 'processing': return this.state.processing;
      case 'special': return this.player(z.seat).special;
      case 'equip': return this.player(z.seat).equips[z.slot];
      case 'judge': return this.player(z.seat).judgeArea;
      case 'removed': return this.state.removedPile;
    }
  }

  /** Cách DUY NHẤT để chuyển bài giữa các vùng -> đảm bảo không mất/nhân bản lá nào. */
  async moveCards(ids: number[], from: Zone, to: Zone, reason: string): Promise<void> {
    if (ids.length === 0) return;
    const src = this.zone(from);
    const dst = this.zone(to);
    for (const id of ids) {
      const i = src.indexOf(id);
      if (i < 0) throw new Error(`Lá ${id} không nằm ở vùng ${from.kind}`);
      src.splice(i, 1);
      dst.push(id);
      // Chuyển giữa hai khu vực phán định (Xảo Biến...) thì lá vẫn giữ tên cẩm nang trì hoãn đã chuyển hóa
      if (from.kind === 'judge' && to.kind !== 'judge') this.delayedAs.delete(id);
    }
    await this.bus.emit('cardsMoved', { cardIds: [...ids], from, to, reason });
  }

  async draw(seat: number, n: number, reason = 'draw'): Promise<number[]> {
    const got: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.state.drawPile.length === 0) await this.reshuffle();
      const id = this.state.drawPile[this.state.drawPile.length - 1];
      await this.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat }, reason);
      got.push(id);
    }
    if (n > 0 && reason !== 'deal') this.say(`${this.player(seat).name} bốc ${n} lá.`);
    return got;
  }

  private async reshuffle(): Promise<void> {
    if (this.state.discardPile.length === 0) await this.finish(null, 'deckExhausted');
    this.say('Hết bài, xào lại chồng bài bỏ.');
    await this.moveCards([...this.state.discardPile], { kind: 'discard' }, { kind: 'draw' }, 'reshuffle');
    shuffle(this.state.drawPile, this.rng);
  }

  // ==========================================================
  // Hỏi người chơi
  // ==========================================================

  /** Câu trả lời mặc định khi người chơi lỗi, mất kết nối hoặc hết giờ. */
  protected fallback(req: Request): Response {
    switch (req.type) {
      case 'play': return { kind: 'endPlay' };
      case 'discard': return { kind: 'discard', cardIds: [] }; // không hợp lệ -> engine tự bỏ
      case 'chooseGenerals': return { kind: 'generals', main: '', deputy: '' }; // không hợp lệ -> engine tự chọn
      case 'reveal': return { kind: 'reveal', main: false, deputy: false };
      case 'confirm': return { kind: 'no' };
      case 'choose': return { kind: 'choice', index: 0 };
      case 'chooseTargets': return { kind: 'targets', targets: [] }; // thiếu -> engine tự chọn nếu bắt buộc
      case 'chooseCards': return { kind: 'cards', cardIds: [] };
      default: return { kind: 'pass' };
    }
  }

  async ask(req: Request): Promise<Response> {
    const controller = this.controllers[req.seat];
    const view = this.makeView(req.seat, req);
    let pending: Promise<Response> = Promise.resolve().then(() => controller.decide(req, view));
    if (this.opts.timeoutMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<Response>((resolve) => {
        timer = setTimeout(() => resolve(this.fallback(req)), this.opts.timeoutMs);
      });
      pending = Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
    }
    try {
      const res = await pending;
      return res && typeof res === 'object' ? res : this.fallback(req);
    } catch {
      return this.fallback(req);
    }
  }

  /**
   * Yêu cầu `seat` đánh ra một lá thuộc `accept` (ví dụ Thiểm).
   * Trả về lá đã đánh, hoặc null nếu không đánh / trả lời không hợp lệ.
   */
  async requestResponse(
    seat: number, accept: CardName[], reason: string, source: number | null, context?: RespondContext,
  ): Promise<Card | null> {
    if (!this.player(seat).alive) return null;
    // Vãng Liệt: lá đang xử lý không ai được hưởng ứng
    if (this.noResponseCard !== null && this.state.processing.includes(this.noResponseCard)) return null;
    // Kỹ năng cấm hưởng ứng (Họa Thủy, Khiêm Sách...): Quốc Chiến ghi đè responseBlocked
    if (this.responseBlocked(seat, accept, source, context)) return null;
    // Bát Quái Trận: khi cần đánh Thiểm, có thể phán định; đỏ thì coi như đã đánh Thiểm
    if (accept.includes('shan')) {
      const viaBagua = await this.tryBagua(seat, source, context);
      if (viaBagua) return viaBagua;
    }
    await this.bus.emit('beforeRespond', { seat, accept, source });
    const picked = await this.pickResponse(seat, accept, reason, source, context);
    if (!picked) return accept.includes('sha') ? tryZhangbaResponse(this, seat, reason) : null;
    const { card, as } = picked;
    const p = this.player(seat);

    await this.moveCards([card.id], { kind: 'hand', seat }, { kind: 'processing' }, 'respond');
    try {
      await this.onCardUsedAs(seat, card, as, 'respond');
      this.say(`${p.name} đánh ${this.labelAs(card, as)}.`);
      // Kỹ năng nghe sự kiện này (ví dụ Lôi Kích) có thể kết thúc ván ngay giữa chừng
      await this.bus.emit('cardResponded', { seat, card, as, reason });
    } finally {
      if (this.state.processing.includes(card.id)) {
        await this.moveCards([card.id], { kind: 'processing' }, { kind: 'discard' }, 'respond');
      }
    }
    return card;
  }

  /** Hỏi `seat` chọn một lá trên tay thuộc `accept`, kiểm tra hợp lệ nhưng CHƯA di chuyển lá. */
  async pickResponse(
    seat: number, accept: CardName[], reason: string, source: number | null, context?: RespondContext,
  ): Promise<{ card: Card; as: CardName } | null> {
    const p = this.player(seat);
    if (!p.alive) return null;
    const res = await this.ask({ type: 'respond', seat, accept, reason, source, ...(context ? { context } : {}) });
    if (res.kind !== 'card' || !p.hand.includes(res.cardId)) return null;
    const card = this.card(res.cardId);
    if (this.cardBlocked(seat, card)) return null;
    const as = accept.find((a) => this.cardCountsAs(seat, card).includes(a));
    return as ? { card, as } : null;
  }

  /** Bát Quái Trận. Trả về lá phán định (coi như lá Thiểm đã đánh) nếu thành công. */
  private async tryBagua(seat: number, source: number | null, context?: RespondContext): Promise<Card | null> {
    const isSlash = context?.kind === 'slash';
    if (this.armorOf(seat, source, isSlash) !== 'bagua') return null;
    const ok = await this.ask({ type: 'confirm', seat, skill: 'bagua', prompt: 'Dùng Bát Quái Trận (phán định, đỏ = Thiểm)?', reveal: false });
    if (ok.kind !== 'yes') return null;
    const card = await this.judge(seat, 'Bát Quái Trận');
    try {
      if (card.suit !== 'heart' && card.suit !== 'diamond') return null;
      this.say(`Bát Quái Trận có hiệu lực, ${this.player(seat).name} coi như đã đánh Thiểm.`);
      await this.bus.emit('cardResponded', { seat, card, as: 'shan', reason: 'bagua' });
      return card;
    } finally {
      await this.finishJudge(card);
    }
  }

  /** Hỏi chọn từ min đến max lá trong `cardIds`. Trả lời sai -> engine chọn `min` lá đầu. */
  async chooseCards(seat: number, prompt: string, cardIds: number[], min: number, max: number, show = false): Promise<number[]> {
    if (cardIds.length === 0 || max <= 0) return [];
    // show = true: gửi kèm mặt bài (bài không nằm trên tay người chọn, ví dụ bài trên cùng chồng bốc)
    const res = await this.ask({ type: 'chooseCards', seat, prompt, cardIds, min, max, ...(show ? { cards: cardIds.map((id) => this.card(id)) } : {}) });
    const c = res.kind === 'cards' && Array.isArray(res.cardIds) ? res.cardIds : [];
    const ok = c.length >= min && c.length <= max && new Set(c).size === c.length && c.every((x) => cardIds.includes(x));
    return ok ? [...c] : cardIds.slice(0, min);
  }

  /** Hỏi chọn 1 phương án. Trả lời sai -> phương án đầu tiên. */
  async choose(seat: number, prompt: string, options: string[]): Promise<number> {
    const res = await this.ask({ type: 'choose', seat, prompt, options });
    const i = res.kind === 'choice' ? res.index : -1;
    return Number.isInteger(i) && i >= 0 && i < options.length ? i : 0;
  }

  /**
   * Hỏi chọn từ min đến max mục tiêu trong `candidates`.
   * Trả lời sai: nếu min = 0 thì coi như không chọn ai, nếu bắt buộc thì engine chọn `min` người đầu.
   */
  async chooseTargets(seat: number, prompt: string, candidates: number[], min: number, max: number, aim?: 'ally' | 'enemy'): Promise<number[]> {
    if (candidates.length === 0 || max <= 0) return [];
    const res = await this.ask({ type: 'chooseTargets', seat, prompt, candidates, min, max, ...(aim ? { aim } : {}) });
    const t = res.kind === 'targets' && Array.isArray(res.targets) ? res.targets : [];
    const ok = t.length >= min && t.length <= max && new Set(t).size === t.length && t.every((x) => candidates.includes(x));
    return ok ? [...t] : candidates.slice(0, min);
  }

  /** Bắt `seat` bỏ đúng `count` lá trên tay (hoặc hết nếu không đủ). Trả lời sai -> tự bỏ các lá cuối. */
  async forceDiscard(seat: number, count: number, reason: string): Promise<number[]> {
    const p = this.player(seat);
    // Kê Lặc: lá thuộc loại bị cấm bỏ (cờ turn_banDiscardType_<loại>) không được chọn để bỏ
    const allowed = p.hand.filter((id) => !p.flags[`turn_banDiscardType_${this.card(id).type}`]);
    count = Math.min(count, allowed.length);
    if (count <= 0) return [];
    const res = await this.ask({
      type: 'discard', seat, count, cardIds: [...allowed], reason,
      ...(reason === 'discardPhase' ? { limit: this.handLimit(seat) } : {}),
    });
    let ids = res.kind === 'discard' && Array.isArray(res.cardIds) ? res.cardIds : [];
    const valid = ids.length === count && new Set(ids).size === count && ids.every((id) => allowed.includes(id));
    // Trả lời sai / hết giờ: tự bỏ các lá ít giá trị nhất, giữ Đào, Vô Giải, Thiểm, Rượu
    if (!valid) ids = pickDiscards(allowed, count, (id) => this.card(id));
    await this.moveCards(ids, { kind: 'hand', seat }, { kind: 'discard' }, reason);
    this.say(`${p.name} bỏ ${count} lá: ${ids.map((id) => cardLabel(this.card(id))).join(', ')}.`);
    return ids;
  }

  /** Lấy lá trên cùng chồng bốc (xào lại nếu hết) chuyển tới vùng `to`. */
  async takeTop(to: Zone, reason: string): Promise<Card> {
    if (this.state.drawPile.length === 0) await this.reshuffle();
    const id = this.state.drawPile[this.state.drawPile.length - 1];
    await this.moveCards([id], { kind: 'draw' }, to, reason);
    return this.card(id);
  }

  /**
   * Phán định: lật lá trên cùng vào vùng xử lý.
   * Người gọi đọc kết quả rồi BẮT BUỘC gọi finishJudge() (nên đặt trong finally).
   */
  async judge(seat: number, reason: string): Promise<Card> {
    const card = await this.takeTop({ kind: 'processing' }, 'judge');
    this.say(`${this.player(seat).name} phán định (${reason}): ${cardLabel(card)}.`);
    // Kỹ năng có thể thay lá phán định (Hoãn Thích): listener đổi ctx.card thì kết quả là lá mới
    this.cancelledJudges.delete(card.id);
    const ctx = await this.bus.emit('judged', { seat, card, reason });
    if (this.cancelledJudges.has(card.id)) this.cancelledJudges.add(ctx.card.id);
    return ctx.card;
  }

  /** Lá phán định đã bị kỹ năng "chặn lần phán xét" (Định Loạn): cẩm nang trì hoãn coi như không trúng. */
  readonly cancelledJudges = new Set<number>();

  /** Đưa lá phán định vào chồng bỏ (trừ khi đã bị kỹ năng lấy đi, ví dụ Lạc Thần). */
  async finishJudge(card: Card): Promise<void> {
    if (this.state.processing.includes(card.id)) {
      await this.moveCards([card.id], { kind: 'processing' }, { kind: 'discard' }, 'judge');
    }
  }

  /**
   * Dùng Sát ngoài giai đoạn ra bài (ví dụ bị Khiêu Hấn). Không tính vào số lần Sát của lượt.
   * `card` phải đang nằm trên tay `source`.
   */
  async slashOutOfTurn(source: number, target: number, card: Card, as: CardName): Promise<void> {
    const p = this.player(source);
    if (!p.alive || !this.isAliveSeat(target) || target === source || !p.hand.includes(card.id)) return;
    await this.moveCards([card.id], { kind: 'hand', seat: source }, { kind: 'processing' }, 'use');
    try {
      await this.onCardUsedAs(source, card, as, 'respond');
      this.say(`${p.name} dùng ${this.labelAs(card, as)} vào ${this.player(target).name}.`);
      await this.bus.emit('cardUsed', { seat: source, card, as, targets: [target] });
      await this.resolveSlash(source, target, await this.tryZhuque(source, card));
    } finally {
      if (this.state.processing.includes(card.id)) {
        await this.moveCards([card.id], { kind: 'processing' }, { kind: 'discard' }, 'settle');
      }
    }
  }

  // ==========================================================
  // Dùng bài
  // ==========================================================

  /** "Sát ♠7" hoặc "Thiểm ♦2 (như Sát)" */
  labelAs(card: Card, as: CardName): string {
    return as === card.name ? cardLabel(card) : `${cardLabel(card)} (như ${CARD_INFO[as].label})`;
  }

  private async doUse(seat: number, cardId: number, targets: number[], as?: CardName): Promise<void> {
    return this.asActor(seat, () => this.doUseInner(seat, cardId, targets, as));
  }

  private async doUseInner(seat: number, cardId: number, targets: number[], as?: CardName): Promise<void> {
    const p = this.player(seat);
    const card = this.card(cardId);
    const name = as ?? card.name;
    const info = CARD_INFO[name];

    // Trang bị và cẩm nang trì hoãn đi thẳng từ tay tới khu vực của chúng, không qua vùng xử lý
    if (info.type === 'equip' && name === card.name) return this.equip(seat, card);
    if (info.type === 'delayed') return this.placeDelayed(seat, card, targets, name);

    await this.moveCards([cardId], { kind: 'hand', seat }, { kind: 'processing' }, 'use');
    try {
      await this.onCardUsedAs(seat, card, name, 'use');

      // Trùng chú (recast): bỏ lá này để bốc 1 lá, không tính là "dùng"
      if (info.type === 'trick' && targets.length === 0 && TRICK_DEFS[name]?.recast) {
        this.say(`${p.name} trùng chú ${this.labelAs(card, name)}.`);
        await this.moveCards([cardId], { kind: 'processing' }, { kind: 'discard' }, 'recast');
        await this.draw(seat, 1);
        return;
      }

      const tgt = targets.map((t) => this.player(t).name).join(', ');
      this.say(`${p.name} dùng ${this.labelAs(card, name)}${tgt ? ` vào ${tgt}` : ''}.`);
      await this.bus.emit('cardUsed', { seat, card, as: name, targets });

      if (info.type === 'trick') {
        await resolveTrick(this, seat, card, name, targets);
        return;
      }
      switch (name) {
        case 'sha': {
          p.flags.shaUsed = (p.flags.shaUsed ?? 0) + 1;
          const bonus = p.flags.jiuBuff ? 1 : 0; // Rượu: Sát này gây thêm 1 sát thương
          p.flags.jiuBuff = 0;
          const slash = await this.tryZhuque(seat, card);
          const all = await this.extraSlashTargets(seat, slash, targets);
          this.slashStopped = false;
          for (const t of all) {
            if (this.slashStopped) break; // Phương Thiên Họa Kích (Quốc Chiến): có người né thì các mục tiêu còn lại thoát
            if (this.player(t).alive) await this.resolveSlash(seat, t, slash, bonus);
          }
          this.slashStopped = false;
          break;
        }
        case 'tao':
          await this.recover(seat, 1, seat);
          break;
        case 'jiu':
          p.flags.jiuUsed = 1;
          p.flags.jiuBuff = 1;
          this.say(`Sát tiếp theo của ${p.name} trong lượt này gây thêm 1 sát thương.`);
          break;
        default:
          break;
      }
    } finally {
      // Lá đã dùng xong thì vào chồng bỏ (trừ khi kỹ năng như Gian Hùng đã lấy mất)
      if (this.state.processing.includes(cardId)) {
        await this.moveCards([cardId], { kind: 'processing' }, { kind: 'discard' }, 'settle');
      }
    }
  }

  /**
   * Các mục tiêu hợp lệ nếu `seat` "coi như dùng" một lá `name` (không cần có lá thật trên tay).
   * ignoreRange: bỏ qua khoảng cách / tầm đánh (ví dụ Thần Tốc: Sát không giới hạn khoảng cách).
   */
  targetsAs(seat: number, name: CardName, ignoreRange = false): number[] {
    const fake = this.virtualCard(name);
    const info = CARD_INFO[name];
    if (info.type === 'trick') {
      const def = TRICK_DEFS[name];
      if (!def) return [];
      if (def.targeting !== 'one') return [];
      return this.alivePlayers().map((p) => p.seat)
        .filter((t) => def.validTarget?.(this, seat, t, fake) && (t === seat || this.canTarget(seat, t)));
    }
    if (name === 'sha') {
      return this.alivePlayers().map((p) => p.seat).filter((t) => t !== seat && this.canTarget(seat, t)
        && this.canBeSlashTarget(seat, t) && (ignoreRange || this.distance(seat, t) <= this.attackRange(seat) || this.slashRangeExempt(seat, t, null)));
    }
    return [];
  }

  /**
   * "Coi như dùng" một lá `name` (Thần Tốc, Kỳ Sách, Loạn Kích...).
   * `cardIds`: các lá thật bị tiêu hao (chuyển vào vùng xử lý rồi vào chồng bỏ), lấy từ vùng `from` (mặc định trên tay).
   * Không tính vào số lần Sát của lượt trừ khi countSlash = true.
   */
  async useCardAs(seat: number, name: CardName, targets: number[], cardIds: number[] = [],
    opts: { from?: Zone; countSlash?: boolean; label?: string } = {}): Promise<void> {
    return this.asActor(seat, () => this.useCardAsInner(seat, name, targets, cardIds, opts));
  }

  private async useCardAsInner(seat: number, name: CardName, targets: number[], cardIds: number[],
    opts: { from?: Zone; countSlash?: boolean; label?: string }): Promise<void> {
    const p = this.player(seat);
    if (!p.alive) return;
    const from: Zone = opts.from ?? { kind: 'hand', seat };
    if (cardIds.length) await this.moveCards(cardIds, from, { kind: 'processing' }, 'use');
    const card = cardIds.length === 1 ? { ...this.card(cardIds[0]), name } as Card
      : this.virtualCard(name, cardIds.length ? this.card(cardIds[0]) : undefined);
    try {
      const info = CARD_INFO[name];
      const tgt = targets.map((t) => this.player(t).name).join(', ');
      const via = opts.label ? ` (${opts.label})` : '';
      if (info.type === 'trick' && targets.length === 0 && TRICK_DEFS[name]?.targeting === 'one') return;
      this.say(`${p.name} dùng ${CARD_INFO[name].label}${via}${tgt ? ` vào ${tgt}` : ''}.`);
      await this.bus.emit('cardUsed', { seat, card, as: name, targets });
      if (info.type === 'trick') {
        await resolveTrick(this, seat, card, name, targets);
        return;
      }
      switch (name) {
        case 'sha': {
          if (opts.countSlash) p.flags.shaUsed = (p.flags.shaUsed ?? 0) + 1;
          const bonus = p.flags.jiuBuff ? 1 : 0;
          p.flags.jiuBuff = 0;
          const slash = await this.tryZhuque(seat, card);
          const all = await this.extraSlashTargets(seat, slash, targets);
          this.slashStopped = false;
          for (const t of all) {
            if (this.slashStopped) break;
            if (this.player(t).alive) await this.resolveSlash(seat, t, slash, bonus);
          }
          this.slashStopped = false;
          break;
        }
        case 'tao': await this.recover(targets[0] ?? seat, 1, seat); break;
        case 'jiu': p.flags.jiuUsed = 1; p.flags.jiuBuff = 1; break;
        default: break;
      }
    } finally {
      const left = cardIds.filter((id) => this.state.processing.includes(id));
      if (left.length) await this.moveCards(left, { kind: 'processing' }, { kind: 'discard' }, 'settle');
    }
  }

  /** Đặt true để dừng xử lý các mục tiêu còn lại của lá Sát đang dùng. */
  slashStopped = false;

  /** Thêm mục tiêu cho lá Sát vừa chọn mục tiêu (Phương Thiên Họa Kích bản Quốc Chiến). Engine gốc: không đổi. */
  protected async extraSlashTargets(_seat: number, _card: Card, targets: number[]): Promise<number[]> {
    return targets;
  }

  /** Chu Tước Vũ Phiến: Sát thường có thể đổi thành Hỏa Sát. Trả về lá Sát sẽ dùng để xử lý. */
  protected async tryZhuque(seat: number, card: Card): Promise<Card> {
    if (card.nature || this.weaponName(seat) !== 'zhuque') return card;
    const ok = await this.ask({ type: 'confirm', seat, skill: 'zhuque', prompt: 'Chu Tước Vũ Phiến: đổi Sát này thành Hỏa Sát?', reveal: false });
    if (ok.kind !== 'yes') return card;
    this.say(`${this.player(seat).name} dùng Chu Tước Vũ Phiến: Sát hóa thành Hỏa Sát.`);
    return { ...card, nature: 'fire' };
  }

  /** Giới tính nữ (Thư Hùng Song Cổ Kiếm, Kết Nhân...). Engine gốc không có tướng nên luôn false. */
  isFemale(_seat: number): boolean {
    return false;
  }

  /** Trang bị một lá: lá cũ cùng ô (nếu có) vào chồng bỏ. */
  async equip(seat: number, card: Card): Promise<void> {
    const slot = CARD_INFO[card.name].slot!;
    const p = this.player(seat);
    // Lục Long Tham Giá: bỏ cả ngựa +1 đang lắp
    if (card.name === 'liulong' && p.equips.defHorse.length) {
      await this.moveCards([...p.equips.defHorse], { kind: 'equip', seat, slot: 'defHorse' }, { kind: 'discard' }, 'replace');
    }
    const old = p.equips[slot][0];
    if (old !== undefined) {
      await this.moveCards([old], { kind: 'equip', seat, slot }, { kind: 'discard' }, 'replace');
    }
    // Kỹ năng phản ứng với việc bỏ trang bị cũ (ví dụ bắt bỏ bài) có thể đã lấy mất lá mới khỏi tay
    if (!p.hand.includes(card.id)) { this.say(`${p.name} không còn ${cardLabel(card)} để trang bị.`); return; }
    await this.moveCards([card.id], { kind: 'hand', seat }, { kind: 'equip', seat, slot }, 'equip');
    this.say(`${p.name} trang bị ${cardLabel(card)} (${EQUIP_SLOT_LABEL[slot]}).`);
    await this.bus.emit('cardUsed', { seat, card, as: card.name, targets: [seat] });
  }

  /** Đặt cẩm nang trì hoãn vào khu vực phán định của mục tiêu (Thiểm Điện: của chính mình). */
  private async placeDelayed(seat: number, card: Card, targets: number[], name: CardName = card.name): Promise<void> {
    const target = name === 'shandian' ? seat : targets[0];
    if (name !== card.name) await this.onCardUsedAs(seat, card, name, 'use');
    await this.moveCards([card.id], { kind: 'hand', seat }, { kind: 'judge', seat: target }, 'delayed');
    if (name !== card.name) this.delayedAs.set(card.id, name);
    this.say(`${this.player(seat).name} đặt ${this.labelAs(card, name)} vào khu vực phán định của ${this.player(target).name}.`);
    await this.bus.emit('cardUsed', { seat, card, as: name, targets: [target] });
  }

  /**
   * Xử lý một lá Sát lên một mục tiêu.
   * `bonus`: sát thương cộng thêm (Rượu).
   */
  async resolveSlash(source: number, target: number, card: Card, bonus = 0): Promise<void> {
    try {
      await this.resolveSlashInner(source, target, card, bonus);
    } finally {
      if (!this.state.finished) await this.bus.emit('slashEnd', { source, target, card });
    }
  }

  private async resolveSlashInner(source: number, target: number, card: Card, bonus: number): Promise<void> {
    const ctx = await this.bus.emit('slashTargeted', { source, target, card, cancelled: false, shanNeeded: 1, noDodge: false });
    if (ctx.cancelled || !this.player(target).alive) return;
    const hit = () => this.damage({
      source, target, amount: 1 + bonus, card, cardAs: 'sha', nature: card.nature ?? 'normal', cancelled: false,
    });
    if (ctx.noDodge) {
      this.say(`${this.player(target).name} không thể né Sát này.`);
      await hit();
      return;
    }

    for (let i = 0; i < ctx.shanNeeded; i++) {
      const left = ctx.shanNeeded - i;
      const reason = `${this.player(source).name} dùng ${cardLabel(card)} vào bạn${ctx.shanNeeded > 1 ? ` (cần thêm ${left} Thiểm)` : ''}`;
      const dodge = await this.requestResponse(target, ['shan'], reason, source, { kind: 'slash', source, card });
      if (!dodge) {
        await hit();
        return;
      }
    }
    // Quán Thạch Phủ: bỏ 2 lá để Sát vẫn trúng
    if (await tryGuanshi(this, source, target)) {
      await hit();
      return;
    }
    await this.bus.emit('slashDodged', { source, target, card });
    // Thanh Long Yển Nguyệt Đao: có thể Sát tiếp mục tiêu này
    await tryQinglong(this, source, target);
  }

  // ==========================================================
  // Máu: sát thương, hồi phục, hấp hối, tử vong
  // ==========================================================

  /**
   * Thứ tự theo luật gốc:
   * 1. beforeDamage (giáp/kỹ năng có thể giảm hoặc chặn)
   * 2. Trừ máu
   * 3. Nếu máu <= 0 -> hấp hối -> có thể chết
   * 4. Nếu còn sống -> damaged (kỹ năng "sau khi chịu sát thương" như Gian Hùng)
   */
  async damage(ctx: DamageCtx): Promise<void> {
    const tgt = this.player(ctx.target);
    if (!tgt.alive || this.isLured(ctx.target)) return;
    ctx.nature ??= 'normal';
    await this.bus.emit('beforeDamage', ctx);
    if (ctx.cancelled || ctx.amount <= 0) return;

    // Xích: người bị xích chịu sát thương thuộc tính thì được gỡ xích, rồi sát thương truyền sang người bị xích khác
    const spread = tgt.chained && ctx.nature !== 'normal';
    if (spread) tgt.chained = false;

    tgt.hp -= ctx.amount;
    const kind = ctx.nature === 'fire' ? ' hỏa' : ctx.nature === 'thunder' ? ' lôi' : '';
    this.say(`${tgt.name} chịu ${ctx.amount} sát thương${kind} (còn ${tgt.hp}/${tgt.maxHp}).`);
    await this.bus.emit('damageDealt', ctx);
    if (tgt.hp <= 0) await this.enterDying(ctx.target, ctx.source);
    if (tgt.alive) await this.bus.emit('damaged', ctx);

    if (spread && !ctx.chainTransmit) {
      for (const seat of this.aliveSeatsFrom(this.state.currentSeat)) {
        if (seat === ctx.target || !this.player(seat).chained) continue;
        this.say(`Sát thương truyền qua xích tới ${this.player(seat).name}.`);
        await this.damage({ ...ctx, target: seat, cancelled: false, chainTransmit: true });
      }
    }
  }

  async recover(seat: number, amount: number, source: number | null): Promise<number> {
    const p = this.player(seat);
    if (!p.alive || this.isLured(seat)) return 0;
    const actual = Math.min(amount, p.maxHp - p.hp);
    if (actual <= 0) return 0;
    p.hp += actual;
    this.say(`${p.name} hồi ${actual} máu (còn ${p.hp}/${p.maxHp}).`);
    await this.bus.emit('recovered', { seat, amount: actual, source });
    return actual;
  }

  /** Mất máu không phải sát thương (không kích hoạt kỹ năng "chịu sát thương"). */
  async loseHp(seat: number, amount: number): Promise<void> {
    const p = this.player(seat);
    if (!p.alive || amount <= 0 || this.isLured(seat)) return;
    // Kỹ năng có thể chặn việc mất máu (Hoàng Cân Thiên Bình Phủ: bỏ 1 Thiên Binh)
    const pre = await this.bus.emit('beforeHpLost', { seat, amount, cancelled: false });
    if (pre.cancelled || pre.amount <= 0 || !p.alive) return;
    amount = pre.amount;
    p.hp -= amount;
    this.say(`${p.name} mất ${amount} máu (còn ${p.hp}/${p.maxHp}).`);
    await this.bus.emit('hpLost', { seat, amount });
    if (p.hp <= 0) await this.enterDying(seat, null);
  }

  /** Hỏi lần lượt từng người (bắt đầu từ người đang trong lượt) có dùng Đào cứu không. */
  private async enterDying(seat: number, source: number | null): Promise<void> {
    const p = this.player(seat);
    this.say(`${p.name} hấp hối!`);
    await this.bus.emit('dying', { seat, source });

    for (const helperSeat of this.aliveSeatsFrom(this.state.currentSeat)) {
      const helper = this.player(helperSeat);
      if (!this.canSave(helperSeat, seat)) continue;
      // Một người có thể dùng nhiều Đào liên tiếp nếu cần hồi nhiều máu
      while (p.alive && p.hp <= 0 && helper.alive) {
        const res = await this.ask({ type: 'save', seat: helperSeat, dying: seat, need: 1 - p.hp });
        if (res.kind === 'useSkill') {
          if (await this.specialSave(helperSeat, seat, res)) continue;
          break;
        }
        if (res.kind !== 'card' || !helper.hand.includes(res.cardId)) break;
        const card = this.card(res.cardId);
        if (this.cardBlocked(helperSeat, card)) break;
        const names = this.cardCountsAs(helperSeat, card);
        const savedAs: CardName | null = names.includes('tao') ? 'tao'
          : helperSeat === seat && names.includes('jiu') ? 'jiu' : null; // Rượu chỉ tự cứu mình
        if (!savedAs) break;

        await this.moveCards([card.id], { kind: 'hand', seat: helperSeat }, { kind: 'processing' }, 'save');
        try {
          await this.onCardUsedAs(helperSeat, card, savedAs, 'save');
          this.say(`${helper.name} dùng ${this.labelAs(card, savedAs)} cứu ${p.name}.`);
          await this.recover(seat, 1, helperSeat);
        } finally {
          if (this.state.processing.includes(card.id)) {
            await this.moveCards([card.id], { kind: 'processing' }, { kind: 'discard' }, 'save');
          }
        }
      }
      if (p.hp > 0) return;
    }
    await this.die(seat, source);
  }

  private async die(seat: number, killer: number | null): Promise<void> {
    const p = this.player(seat);
    p.alive = false;
    await this.beforeDeath(seat);
    const by =killer !== null && killer !== seat ? ` bởi ${this.player(killer).name}` : '';
    this.say(`☠ ${p.name} (phe ${p.team}) tử trận${by}.`);
    const lost = [...p.hand, ...p.special, ...EQUIP_SLOTS.flatMap((s) => p.equips[s]), ...p.judgeArea];
    await this.moveCards([...p.hand], { kind: 'hand', seat }, { kind: 'discard' }, 'death');
    await this.moveCards([...p.special], { kind: 'special', seat }, { kind: 'discard' }, 'death');
    for (const slot of EQUIP_SLOTS) {
      await this.moveCards([...p.equips[slot]], { kind: 'equip', seat, slot }, { kind: 'discard' }, 'death');
    }
    await this.moveCards([...p.judgeArea], { kind: 'judge', seat }, { kind: 'discard' }, 'death');
    p.chained = false;
    p.faceDown = false;
    await this.bus.emit('death', { seat, killer, cards: lost });
    // Giai đoạn 2: thưởng/phạt khi giết theo luật Quốc Chiến đặt ở listener 'death'.
    const winner = this.checkWinner();
    if (winner !== null) await this.finish(winner, 'victory');
  }

  protected async finish(winner: string | null, reason: EndReason): Promise<never> {
    if (!this.state.finished) {
      this.state.finished = true;
      this.state.winner = winner;
      this.result = { winner, reason, turns: this.state.turnCount };
      const msg = reason === 'victory' ? `🏆 Phe ${winner} chiến thắng!`
        : reason === 'deckExhausted' ? 'Hết sạch bài, ván hòa.'
        : 'Quá số lượt tối đa, ván hòa.';
      this.say(msg);
      await this.bus.emit('gameOver', { winner, reason });
    }
    throw new GameOver(reason);
  }

  // ==========================================================
  // Vòng lượt và các giai đoạn
  // ==========================================================

  private async turn(seat: number): Promise<void> {
    const p = this.player(seat);
    if (!p.alive) return;
    this.state.currentSeat = seat;
    // Cờ "turn_" là hiệu lực tạm của lượt trước (đặt lên người khác) -> xóa ở mọi người
    this.clearTurnFlags();
    if (p.faceDown) {
      p.faceDown = false;
      this.say(`${p.name} đang bị lật úp: bỏ qua lượt này và lật tướng trở lại.`);
      return;
    }
    p.flags = {};
    this.say(`—— Lượt ${this.state.turnCount + 1}: ${p.name} ——`);
    await this.bus.emit('turnStart', { seat });

    for (const phase of PHASES) {
      if (!p.alive) break;
      const before = await this.bus.emit('phaseBefore', { seat, phase, skip: false });
      if (before.skip) continue;
      // Lạc Bất Tư Thục / Binh Lương Thốn Đoạn trúng thì bỏ qua giai đoạn tương ứng
      if (phase === 'play' && p.flags.skipPlay) { this.say(`${p.name} bỏ qua giai đoạn ra bài.`); continue; }
      if (phase === 'draw' && p.flags.skipDraw) { this.say(`${p.name} bỏ qua giai đoạn bốc bài.`); continue; }
      this.state.phase = phase;
      await this.bus.emit('phaseStart', { seat, phase });
      await this.runPhase(seat, phase);
      await this.bus.emit('phaseEnd', { seat, phase });
    }
    await this.bus.emit('turnEnd', { seat });
    this.clearTurnFlags();
  }

  private clearTurnFlags(): void {
    for (const q of this.state.players) {
      for (const k of Object.keys(q.flags)) if (k.startsWith('turn_')) delete q.flags[k];
    }
  }

  /** Lật úp / lật lại tướng (叠置). */
  turnOver(seat: number): void {
    const p = this.player(seat);
    p.faceDown = !p.faceDown;
    this.stat({ kind: 'turnedOver', seat, faceDown: p.faceDown, by: this.actor });
    this.say(p.faceDown ? `${p.name} bị lật úp (bỏ qua lượt kế tiếp).` : `${p.name} được lật lại.`);
  }

  /** Thêm một giai đoạn ngoài thứ tự thường (Đương Tiên: thêm 1 giai đoạn ra bài lúc bắt đầu lượt). */
  async runExtraPhase(seat: number, phase: Phase): Promise<void> {
    const p = this.player(seat);
    if (!p.alive || this.state.finished) return;
    const prev = this.state.phase;
    this.state.phase = phase;
    this.say(`${p.name} được thêm một giai đoạn ${phase === 'play' ? 'ra bài' : phase}.`);
    await this.bus.emit('phaseStart', { seat, phase });
    await this.runPhase(seat, phase);
    await this.bus.emit('phaseEnd', { seat, phase });
    delete p.flags.endPlay;
    this.state.phase = prev;
  }

  private async runPhase(seat: number, phase: Phase): Promise<void> {
    switch (phase) {
      case 'start':
      case 'end':
        return;
      case 'judge':
        return resolveJudgePhase(this, seat);
      case 'draw': {
        const ctx = await this.bus.emit('drawPhase', { seat, count: 2 });
        await this.draw(seat, Math.max(0, ctx.count));
        return;
      }
      case 'play':
        return this.playPhase(seat);
      case 'discard':
        return this.discardPhase(seat);
    }
  }

  private async playPhase(seat: number): Promise<void> {
    const p = this.player(seat);
    let invalid = 0;
    // Giới hạn an toàn: chống controller lỗi gửi mãi một hành động
    for (let actions = 0; actions < 200 && p.alive; actions++) {
      if (p.flags.endPlay) return; // kỹ năng kết thúc giai đoạn ra bài (Song Nhận thua)
      const res = await this.ask({ type: 'play', seat });
      if (res.kind === 'useSkill') {
        const err = await this.useSkillAction(seat, res);
        if (err) {
          this.say(`(${p.name}: ${err})`);
          if (++invalid >= 3) return;
        }
        continue;
      }
      if (res.kind !== 'useCard') return;
      const err = this.checkUse(seat, res.cardId, res.targets, res.as);
      if (err) {
        this.say(`(${p.name}: ${err})`);
        if (++invalid >= 3) return;
        continue;
      }
      await this.doUse(seat, res.cardId, res.targets, res.as);
    }
  }

  private async discardPhase(seat: number): Promise<void> {
    const p = this.player(seat);
    const count = p.hand.length - this.handLimit(seat);
    if (count <= 0) return;

    await this.forceDiscard(seat, count, 'discardPhase');
  }

  // ==========================================================

  say(line: string): void {
    this.log.push(line);
    this.opts.onLog(line);
  }

  /** Tổng số lá ở mọi vùng. Luôn phải bằng kích thước bộ bài (dùng để test). */
  totalCards(): number {
    const s = this.state;
    return s.drawPile.length + s.discardPile.length + s.processing.length + s.removedPile.length
      + s.players.reduce((n, p) => n + p.hand.length + p.special.length + p.judgeArea.length
        + EQUIP_SLOTS.reduce((m, slot) => m + p.equips[slot].length, 0), 0);
  }
}
