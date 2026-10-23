// ============================================================
// Người chơi, phòng chơi, sảnh chờ.
// ============================================================
import { buildDeckById, deckLabel, DECKS, DEFAULT_DECK } from '../core/cards.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Controller, Request, Response } from '../core/types.js';
import type { PlayerView } from '../core/view.js';
import { HegemonyBot } from '../hegemony/bot.js';
import { GAME_MODES, HegemonyGame, type GameMode } from '../hegemony/game.js';
import { GENERALS } from '../hegemony/generals.js';
import { attachScoring, type ScoreKeeper } from '../hegemony/scoring.js';
import { BOSS_DIFFICULTY, BOSSES, BossBot, type BossDifficulty } from '../hegemony/boss.js';
import type { AccountStore, SeatOwner } from './accounts.js';
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol.js';

// ------------------------------------------------------------
// Người chơi
// ------------------------------------------------------------

export class PlayerSession {
  readonly id = randomUUID();
  readonly token = randomBytes(18).toString('base64url');
  ws: WebSocket | null = null;
  roomId: string | null = null;
  /** Tài khoản đã đăng nhập (null = khách, không tính xếp hạng). */
  accountId: string | null = null;
  username: string | null = null;
  /** Đang theo dõi phòng `roomId` (khán giả), không ngồi ghế. */
  spectating = false;
  /** Mã đăng nhập tài khoản mà kết nối này dùng (để tự đăng xuất khi người chơi tắt trang). */
  authToken: string | null = null;
  /** Hẹn giờ "hết phiên" sau khi mất kết nối. */
  expireTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(public name: string) {}

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === 1; // 1 = OPEN
  }

  send(msg: ServerMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }
}

// ------------------------------------------------------------
// SocketController: một ghế do người thật điều khiển qua WebSocket
// ------------------------------------------------------------

let nextReqId = 1;

/**
 * Engine gọi decide() như với bot. Controller gửi câu hỏi xuống client và chờ trả lời.
 * - Hết giờ: bot trả lời thay (không bị "đứng" ván).
 * - Rớt mạng: câu hỏi vẫn chờ đến hết giờ; kết nối lại thì được gửi lại.
 * - Rời phòng giữa ván: bot điều khiển ghế đó đến hết ván.
 */
export class SocketController implements Controller {
  private pending: {
    reqId: number; req: Request; view: PlayerView; deadline: number;
    resolve: (r: Response) => void; timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readonly bot = new HegemonyBot();

  constructor(public session: PlayerSession | null, private readonly timeoutMs: number) {}

  async decide(req: Request, view: PlayerView): Promise<Response> {
    const s = this.session;
    if (!s) return this.bot.decide(req, view);
    return new Promise<Response>((resolve) => {
      const reqId = nextReqId++;
      // Chọn tướng cần nhiều thời gian hơn (nhất là chế độ tự chọn với cả trăm tướng)
      // Bỏ bài nhiều lá cũng cần thêm thời gian để người chơi tự chọn
      const ms = req.type === 'chooseGenerals' ? CHOOSE_GENERALS_MS
        : req.type === 'discard' ? Math.max(this.timeoutMs * 2, 45_000) : this.timeoutMs;
      const timer = setTimeout(() => void this.expire(reqId), ms);
      this.pending = { reqId, req, view, resolve, timer, deadline: Date.now() + ms };
      s.send({ t: 'request', reqId, request: req, view, timeoutMs: ms });
    });
  }

  private async expire(reqId: number): Promise<void> {
    const p = this.pending;
    if (!p || p.reqId !== reqId) return;
    this.pending = null;
    clearTimeout(p.timer);
    this.session?.send({ t: 'requestClosed', reqId, reason: 'timeout' });
    p.resolve(await this.bot.decide(p.req, p.view));
  }

  /** Trả lời ngay câu hỏi đang chờ bằng bot (ví dụ người chơi vừa đầu hàng). */
  cancelPending(): void {
    if (this.pending) void this.expire(this.pending.reqId);
  }

  /** Nhận câu trả lời từ client. Engine sẽ tự kiểm tra hợp lệ. */
  answer(reqId: number, response: Response): boolean {
    const p = this.pending;
    if (!p || p.reqId !== reqId) return false;
    this.pending = null;
    clearTimeout(p.timer);
    p.resolve(response);
    return true;
  }

  /** Câu hỏi đang chờ người chơi trả lời (để view gửi kèm vẫn có gợi ý lá dùng được). */
  pendingRequest(): Request | undefined {
    return this.pending?.req;
  }

  /** Gửi lại câu hỏi đang chờ (sau khi kết nối lại). */
  resend(): void {
    const p = this.pending;
    if (p && this.session) {
      this.session.send({ t: 'request', reqId: p.reqId, request: p.req, view: p.view, timeoutMs: Math.max(1000, p.deadline - Date.now()) });
    }
  }

  /** Người chơi rời phòng: giao ghế cho bot, trả lời ngay câu hỏi đang chờ. */
  detach(): void {
    this.session = null;
    if (this.pending) void this.expire(this.pending.reqId);
  }
}

// ------------------------------------------------------------
// Phòng chơi
// ------------------------------------------------------------

type Seat = { kind: 'human'; session: PlayerSession } | { kind: 'bot'; name: string };

/**
 * Bot có nhịp: chỉ chờ khi bot thật sự làm gì đó (đánh bài, dùng kỹ năng);
 * bỏ qua (pass / không) thì trả lời ngay để Vô Giải hỏi cả bàn không bị chậm.
 */
/** Thời gian chọn tướng: 2 phút. */
export const CHOOSE_GENERALS_MS = 120_000;

function paced(bot: Controller, delayMs: number): Controller {
  if (delayMs <= 0) return bot;
  return {
    async decide(req, view) {
      const res = await bot.decide(req, view);
      const idle = res.kind === 'pass' || res.kind === 'no' || req.type === 'chooseGenerals';
      if (!idle) await new Promise((r) => setTimeout(r, delayMs));
      return res;
    },
  };
}

export class Room {
  readonly id = randomBytes(3).toString('hex');
  status: RoomInfo['status'] = 'waiting';
  seats: Seat[] = [];
  game: HegemonyGame | null = null;
  /** Bộ bài dùng khi bắt đầu ván (xem DECKS trong core/cards.ts). */
  deck = DEFAULT_DECK;
  /** Chế độ chọn tướng (xem GAME_MODES). */
  mode: GameMode = 'normal';
  /** Cho mọi người đổi bài khởi đầu một lần. */
  mulligan = true;
  /** Cho người có chủ tướng có bản quân chủ đổi thành quân chủ. */
  lord = true;
  /** Mật khẩu phòng ('' = phòng mở). */
  password = '';
  /** Thảo Phạt (đánh boss): boss ngồi thêm 1 ghế cuối, do máy điều khiển. */
  boss: { id: string; difficulty: BossDifficulty } | null = null;
  private controllers: Controller[] = [];
  /** Kho tài khoản để ghi kết quả ván (Lobby gán). */
  accounts: AccountStore | null = null;
  private scorer: ScoreKeeper | null = null;
  private owners: SeatOwner[] = [];
  private logQueue: string[] = [];
  private flushScheduled = false;

  constructor(
    public name: string,
    public host: PlayerSession,
    public readonly maxSeats: number,
    public readonly timeoutSec: number,
    private readonly onGameEnd: (room: Room) => void,
    /** Bot "suy nghĩ" bao lâu trước khi đánh, để người chơi kịp nhìn (0 = đánh ngay). */
    private readonly botDelayMs = 0,
  ) {}

  info(): RoomInfo {
    return {
      id: this.id, name: this.name, host: this.host.name, hostSeat: this.seatOf(this.host), status: this.status,
      maxSeats: this.maxSeats, timeoutSec: this.timeoutSec,
      deck: this.deck, deckLabel: deckLabel(this.deck),
      mode: this.mode, modeLabel: this.boss ? 'Thảo Phạt' : GAME_MODES[this.mode].label, mulligan: this.mulligan, lord: this.lord,
      spectators: this.spectators.map((s) => s.name),
      ...(this.password ? { locked: true } : {}),
      boss: this.boss ? { id: this.boss.id, name: BOSSES[this.boss.id].name, difficulty: this.boss.difficulty, difficultyLabel: BOSS_DIFFICULTY[this.boss.difficulty].label } : null,
      seats: this.seats.map((s, index) => s.kind === 'human'
        ? { index, kind: 'human', name: s.session.name, connected: s.session.connected, ...(s.session.username ? { username: s.session.username } : {}) }
        : { index, kind: 'bot', name: s.name, connected: true }),
    };
  }

  seatOf(session: PlayerSession): number | null {
    const i = this.seats.findIndex((s) => s.kind === 'human' && s.session === session);
    return i < 0 ? null : i;
  }

  humans(): PlayerSession[] {
    return this.seats.flatMap((s) => (s.kind === 'human' ? [s.session] : []));
  }

  /** Khán giả đang theo dõi phòng. */
  spectators: PlayerSession[] = [];
  /** Phòng đã bị giải tán (ván đang chạy dừng, không lưu kết quả). */
  dissolved = false;

  broadcast(msg: ServerMsg): void {
    for (const h of this.humans()) h.send(msg);
    for (const s of this.spectators) s.send(msg);
  }

  sendRoomState(): void {
    if (this.dissolved) return;
    for (const h of this.humans()) h.send({ t: 'room', room: this.info(), yourSeat: this.seatOf(h) });
    for (const s of this.spectators) s.send({ t: 'room', room: this.info(), yourSeat: null, spectating: true });
  }

  /** Thêm khán giả; nếu ván đang chạy thì gửi ngay trạng thái bàn chơi. */
  addSpectator(session: PlayerSession): void {
    if (!this.spectators.includes(session)) this.spectators.push(session);
    session.roomId = this.id;
    session.spectating = true;
    this.sendRoomState();
    if (this.game) session.send({ t: 'state', view: this.game.spectatorView(), log: this.game.log.slice(-30) });
  }

  removeSpectator(session: PlayerSession): void {
    this.spectators = this.spectators.filter((s) => s !== session);
    session.spectating = false;
    session.roomId = null;
  }

  /**
   * Giải tán phòng: ván đang chơi bị hủy (không lưu kết quả, không tính điểm), mọi người về sảnh.
   * `by`: ai giải tán (hiện trong thông báo).
   */
  dissolve(by: string): void {
    if (this.dissolved) return;
    const everyone = [...this.humans(), ...this.spectators];
    this.dissolved = true;
    if (this.game && this.status === 'playing') {
      this.game.abort();
      // Trả lời ngay mọi câu hỏi đang chờ người thật để engine chạy tới lần hỏi kế tiếp và dừng
      for (const c of this.controllers) if (c instanceof SocketController) c.detach();
    }
    for (const s of everyone) {
      s.send({ t: 'notice', text: `Phòng "${this.name}" đã bị giải tán (${by}).` });
      s.send({ t: 'room', room: null, yourSeat: null });
      s.roomId = null;
      s.spectating = false;
    }
    this.seats = [];
    this.spectators = [];
  }

  controllerOf(session: PlayerSession): SocketController | null {
    const i = this.seatOf(session);
    const c = i === null ? null : this.controllers[i];
    return c instanceof SocketController ? c : null;
  }

  start(): string | null {
    if (this.status === 'playing') return 'Ván đang diễn ra';
    if (this.seats.length < 2) return 'Cần ít nhất 2 ghế (thêm bot nếu thiếu người)';
    const candidates = Math.min(7, Math.floor(GENERALS.length / this.seats.length));
    if (candidates < 2) return 'Không đủ tướng cho số người này';

    if (this.boss && (this.seats.length < 2 || this.seats.length > 5)) return 'Thảo Phạt cần 2–5 người chơi (kể cả bot)';
    // Mỗi ván xếp lại thứ tự ngồi ngẫu nhiên (không theo thứ tự vào phòng)
    for (let i = this.seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.seats[i], this.seats[j]] = [this.seats[j], this.seats[i]];
    }
    this.controllers = this.seats.map((s) => (s.kind === 'human' ? new SocketController(s.session, this.timeoutSec * 1000) : paced(new HegemonyBot(), this.botDelayMs)));
    const setups = this.seats.map((s, i) => ({ name: s.kind === 'human' ? s.session.name : s.name, controller: this.controllers[i] }));
    if (this.boss) {
      // Boss ngồi ghế cuối (sau mọi ghế của phòng), luôn do máy điều khiển
      const bossCtrl = paced(new BossBot(), this.botDelayMs);
      this.controllers.push(bossCtrl);
      setups.push({ name: BOSSES[this.boss.id].name, controller: bossCtrl });
    }
    this.game = new HegemonyGame(setups, {
      seed: Date.now(), candidates: this.boss ? 5 : candidates, deck: buildDeckById(this.deck),
      mode: this.boss ? 'normal' : this.mode, mulligan: this.mulligan, lordConvert: this.lord && !this.boss,
      ...(this.boss ? { boss: this.boss } : {}), onLog: (line) => this.queueLog(line),
      // Mỗi lá phán định dừng một chút cho mọi người kịp nhìn (Lạc Thần lật liên tục, Bát Quái, Thiểm Điện...)
      judgePauseMs: this.botDelayMs > 0 ? Math.min(1200, Math.max(400, Math.round(this.botDelayMs / 2))) : 0,
    });
    this.scorer = attachScoring(this.game);
    // Lồng tiếng: báo client khi kỹ năng được dùng / có người tử trận
    const g0 = this.game;
    g0.statListeners.push((e) => {
      if (e.kind === 'skillUsed') this.broadcast({ t: 'sfx', kind: 'skill', seat: e.seat, general: e.generalId, skill: e.skill });
    });
    g0.bus.on('death', ({ seat }) => {
      const h = g0.heroes[seat];
      if (h) this.broadcast({ t: 'sfx', kind: 'death', seat, general: h.main.generalId });
    }, 1000);
    this.owners = this.seats.map((s) => ({ accountId: s.kind === 'human' ? s.session.accountId : null, bot: s.kind === 'bot' }));
    if (this.boss) this.owners.push({ accountId: null, bot: true });
    this.status = 'playing';
    this.sendRoomState();
    const game = this.game;
    game.run()
      .then((result) => {
        if (this.dissolved || result.reason === 'aborted') return; // phòng giải tán: không lưu, không tính điểm
        let scores; let match;
        try {
          scores = this.scorer!.compute();
          const keys = game.state.players.map((p) => this.scorer!.factionKey(p.seat));
          match = game.bossSeat !== null
            ? this.accounts?.recordBossMatch({
              room: this.name, deck: this.deck, turns: result.turns, winner: result.winner,
              boss: { id: game.bossDef!.id, name: game.bossDef!.name, difficulty: game.bossDifficulty, difficultyLabel: BOSS_DIFFICULTY[game.bossDifficulty].label, rounds: game.bossRound },
            }, this.owners, scores, game.bossSeat)
            : this.accounts?.recordMatch(
              { room: this.name, deck: this.deck, mode: this.mode, turns: result.turns, winner: result.winner },
              this.owners, scores, keys,
            );
        } catch (e) {
          console.error(`[phòng ${this.id}] lỗi tính điểm:`, e);
        }
        this.broadcast({
          t: 'gameOver', result, ...(scores ? { scores } : {}),
          ...(match ? { match: { id: match.id, ranked: match.ranked, ratings: match.players.map((p) => ({ before: p.ratingBefore, after: p.ratingAfter })) } } : {}),
        });
      })
      .catch((err) => {
        if (this.dissolved) return;
        console.error(`[phòng ${this.id}] lỗi engine:`, err);
        this.broadcast({ t: 'error', message: `Ván bị lỗi và đã dừng: ${(err as Error).message}` });
      })
      .finally(() => {
        if (!this.dissolved) this.flush();
        this.status = 'waiting';
        this.game = null;
        this.controllers = [];
        this.sendRoomState();
        this.onGameEnd(this);
      });
    return null;
  }

  /** Gom các dòng nhật ký rồi gửi trạng thái mới cho mọi người (mỗi người một view riêng). */
  private queueLog(line: string): void {
    this.logQueue.push(line);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      setImmediate(() => this.flush());
    }
  }

  private flush(): void {
    this.flushScheduled = false;
    const log = this.logQueue;
    this.logQueue = [];
    if (!this.game) return;
    // View phải tính theo câu hỏi đang chờ: nếu không, gợi ý "lá dùng được" bị xóa mất
    // (log thường được gửi NGAY SAU câu hỏi, ghi đè view của câu hỏi -> bấm lá bài không có tác dụng).
    this.seats.forEach((s, i) => {
      if (s.kind !== 'human') return;
      const ctrl = this.controllers[i];
      const req = ctrl instanceof SocketController ? ctrl.pendingRequest() : undefined;
      s.session.send({ t: 'state', view: this.game!.makeView(i, req), log });
    });
    if (this.spectators.length) {
      const view = this.game.spectatorView();
      for (const sp of this.spectators) sp.send({ t: 'state', view, log });
    }
  }

  /** Gửi lại toàn bộ trạng thái cho một người (khi kết nối lại). */
  resync(session: PlayerSession): void {
    if (this.spectators.includes(session)) {
      session.send({ t: 'room', room: this.info(), yourSeat: null, spectating: true });
      if (this.game) session.send({ t: 'state', view: this.game.spectatorView(), log: this.game.log.slice(-30) });
      return;
    }
    const i = this.seatOf(session);
    if (i === null) return;
    session.send({ t: 'room', room: this.info(), yourSeat: i });
    if (this.game) {
      const ctrl = this.controllers[i];
      const req = ctrl instanceof SocketController ? ctrl.pendingRequest() : undefined;
      session.send({ t: 'state', view: this.game.makeView(i, req), log: this.game.log.slice(-30) });
      this.controllerOf(session)?.resend();
    }
  }

  removeHuman(session: PlayerSession): void {
    const i = this.seatOf(session);
    if (i === null) return;
    if (this.status === 'playing') {
      // Giữa ván: giữ ghế nhưng giao cho bot
      this.controllerOf(session)?.detach();
      this.seats[i] = { kind: 'bot', name: `${session.name} (bot)` };
    } else {
      this.seats.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------
// Sảnh chờ: xử lý tin nhắn của client
// ------------------------------------------------------------

export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly byToken = new Map<string, PlayerSession>();
  private idleWaiters: (() => void)[] = [];
  contentVersion = 0;
  /** Kho tài khoản (null = server không lưu tài khoản). */
  accounts: AccountStore | null = null;
  /** Độ trễ của bot trong các phòng mới (ms). */
  botDelayMs = 0;
  /**
   * Mất kết nối quá lâu (tắt trang) thì hết phiên: tự đăng xuất tài khoản và rời phòng.
   * Khoảng chờ cho phép tải lại trang / mạng chập chờn. Giữa ván được chờ lâu hơn (khóa màn hình điện thoại...).
   */
  graceMs = 30_000;
  gracePlayingMs = 120_000;
  /** Phòng chỉ còn bot (không người chơi nào ngồi ghế) quá thời gian này thì tự đóng, ván bị hủy. */
  botOnlyCloseMs = 5 * 60_000;
  private readonly botOnlySince = new Map<string, number>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  /** Bắt đầu quét định kỳ các phòng chỉ còn bot. */
  startSweeper(): void {
    if (this.sweepTimer) return;
    const every = Math.max(200, Math.min(30_000, Math.floor(this.botOnlyCloseMs / 5)));
    this.sweepTimer = setInterval(() => this.sweepBotOnlyRooms(), every);
    this.sweepTimer.unref?.();
  }

  stopSweeper(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /** Đóng các phòng đã chỉ có bot ngồi liên tục quá botOnlyCloseMs. */
  sweepBotOnlyRooms(now = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      if (room.humans().length > 0) { this.botOnlySince.delete(room.id); continue; }
      const since = this.botOnlySince.get(room.id);
      if (since === undefined) { this.botOnlySince.set(room.id, now); continue; }
      if (now - since >= this.botOnlyCloseMs) {
        this.botOnlySince.delete(room.id);
        this.dissolveRoom(room, `phòng chỉ còn bot quá ${Math.round(this.botOnlyCloseMs / 60_000)} phút`);
      }
    }
    for (const id of [...this.botOnlySince.keys()]) if (!this.rooms.has(id)) this.botOnlySince.delete(id);
  }

  activeGames(): number {
    return [...this.rooms.values()].filter((r) => r.status === 'playing').length;
  }

  /** Gọi `cb` khi không còn ván nào đang chơi (dùng để áp dụng nội dung mới). */
  whenIdle(cb: () => void): void {
    if (this.activeGames() === 0) cb();
    else this.idleWaiters.push(cb);
  }

  /** Giải tán phòng (chủ phòng hoặc quản trị viên). */
  dissolveRoom(room: Room, by: string): void {
    room.dissolve(by);
    this.rooms.delete(room.id);
    this.broadcastRooms();
  }

  private onGameEnd = (room: Room) => {
    void room;
    if (this.activeGames() === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
  };

  /** Tài khoản đang kết nối: id tài khoản -> tên phòng (null nếu ở sảnh). */
  /** Số người đang kết nối (khách + tài khoản). */
  onlineCount(): number {
    let n = 0;
    for (const s of this.byToken.values()) if (s.ws) n++;
    return n;
  }

  onlineAccounts(): Map<string, string | null> {
    const out = new Map<string, string | null>();
    for (const s of this.byToken.values()) {
      if (!s.ws || !s.accountId) continue;
      out.set(s.accountId, s.roomId ? this.rooms.get(s.roomId)?.name ?? null : null);
    }
    return out;
  }

  roomList(): RoomInfo[] {
    return [...this.rooms.values()].map((r) => r.info());
  }

  broadcastRooms(): void {
    const rooms = this.roomList();
    for (const s of this.byToken.values()) if (!s.roomId) s.send({ t: 'rooms', rooms });
  }

  /** Kết nối mới: tạo người chơi mới, hoặc nhận lại người chơi cũ nếu token đúng. */
  attach(ws: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>): PlayerSession {
    let session = msg.token ? this.byToken.get(msg.token) : undefined;
    if (session) {
      if (session.expireTimer) { clearTimeout(session.expireTimer); session.expireTimer = null; }
      if (session.ws && session.ws !== ws) session.ws.close(4000, 'Đã kết nối ở nơi khác');
    } else {
      session = new PlayerSession(String(msg.name || 'Người chơi').slice(0, 24));
      this.byToken.set(session.token, session);
    }
    // Đăng nhập tài khoản (nếu có mã); không có hoặc sai mã thì chơi như khách
    const acc = this.accounts?.byAuthToken(msg.auth) ?? null;
    if (acc) {
      session.authToken = String(msg.auth);
      // Đang trong ván thì không đổi chủ ghế giữa chừng
      if (!session.roomId || this.rooms.get(session.roomId)?.status !== 'playing') {
        session.accountId = acc.id; session.username = acc.username; session.name = acc.displayName;
      }
    } else if (msg.auth !== undefined && session.accountId && (!session.roomId || this.rooms.get(session.roomId)?.status !== 'playing')) {
      // Mã sai/hết hạn hoặc đăng xuất: thành khách
      session.accountId = null; session.username = null; session.name = String(msg.name || session.name).slice(0, 24);
    }
    if (!acc) session.authToken = null;
    session.ws = ws;
    session.send({
      t: 'welcome', playerId: session.id, token: session.token, name: session.name, contentVersion: this.contentVersion,
      account: acc && session.accountId === acc.id ? this.accounts!.publicProfile(acc) : null,
    });
    const room = session.roomId ? this.rooms.get(session.roomId) : undefined;
    if (room) {
      room.resync(session);
      room.sendRoomState();
    } else {
      session.roomId = null;
      session.send({ t: 'rooms', rooms: this.roomList() });
    }
    return session;
  }

  detachSocket(session: PlayerSession, ws: WebSocket): void {
    if (session.ws !== ws) return;
    session.ws = null;
    const room = session.roomId ? this.rooms.get(session.roomId) : undefined;
    room?.sendRoomState();
    if (session.expireTimer) clearTimeout(session.expireTimer);
    const wait = room?.status === 'playing' && !session.spectating ? this.gracePlayingMs : this.graceMs;
    session.expireTimer = setTimeout(() => this.expire(session), wait);
    session.expireTimer.unref?.();
  }

  /** Hết phiên (đã tắt trang): đăng xuất tài khoản, rời phòng (giữa ván thì bot chơi thay), xóa phiên. */
  expire(session: PlayerSession): void {
    session.expireTimer = null;
    if (session.ws) return; // đã kết nối lại
    if (session.authToken) this.accounts?.logout(session.authToken);
    session.authToken = null;
    const room = session.roomId ? this.rooms.get(session.roomId) : undefined;
    if (room) this.leave(session, room);
    session.roomId = null;
    session.accountId = null; session.username = null;
    this.byToken.delete(session.token);
  }

  /** Rời phòng (người chơi hoặc người xem). Giữa ván: ghế giao cho bot. */
  leave(session: PlayerSession, room: Room): void {
    if (session.spectating) {
      room.removeSpectator(session);
      room.sendRoomState();
      this.broadcastRooms();
      return;
    }
    room.removeHuman(session);
    session.roomId = null;
    if (room.humans().length === 0 && room.status !== 'playing') {
      room.dissolve('không còn người chơi');
      this.rooms.delete(room.id);
    } else {
      if (room.host === session && room.humans()[0]) room.host = room.humans()[0];
      room.sendRoomState();
    }
    this.broadcastRooms();
  }

  /** Tài khoản này đang ngồi ở phòng nào khác (qua tab/thiết bị khác)? */
  private seatedElsewhere(session: PlayerSession): Room | null {
    if (!session.accountId) return null;
    for (const r of this.rooms.values()) {
      if (r.humans().some((h) => h !== session && h.accountId === session.accountId)) return r;
    }
    return null;
  }

  handle(session: PlayerSession, msg: ClientMsg): void {
    const room = session.roomId ? this.rooms.get(session.roomId) ?? null : null;
    const err = (message: string) => session.send({ t: 'error', message });

    switch (msg.t) {
      case 'listRooms':
        session.send({ t: 'rooms', rooms: this.roomList() });
        return;
      case 'createRoom': {
        if (room) return err('Bạn đang ở trong một phòng');
        const other = this.seatedElsewhere(session);
        if (other) return err(`Tài khoản này đang ngồi ở phòng "${other.name}" (tab hoặc thiết bị khác)`);
        // Thảo Phạt: 2–5 người chơi (boss ngồi thêm 1 ghế riêng)
        const seats = Math.min(typeof msg.boss === 'string' && BOSSES[msg.boss] ? 5 : 10, Math.max(2, Math.floor(Number(msg.seats) || 5)));
        const timeoutSec = Math.min(120, Math.max(5, Math.floor(Number(msg.timeoutSec) || 30)));
        const r = new Room(String(msg.name || `Phòng của ${session.name}`).slice(0, 40), session, seats, timeoutSec, this.onGameEnd, this.botDelayMs);
        r.accounts = this.accounts;
        if (typeof msg.deck === 'string' && DECKS[msg.deck]) r.deck = msg.deck;
        if (typeof msg.mode === 'string' && msg.mode in GAME_MODES) r.mode = msg.mode as GameMode;
        if (typeof msg.mulligan === 'boolean') r.mulligan = msg.mulligan;
        if (typeof msg.lord === 'boolean') r.lord = msg.lord;
        if (typeof msg.password === 'string') r.password = msg.password.trim().slice(0, 20);
        if (typeof msg.boss === 'string' && BOSSES[msg.boss]) {
          r.boss = { id: msg.boss, difficulty: (typeof msg.bossDifficulty === 'string' && msg.bossDifficulty in BOSS_DIFFICULTY ? msg.bossDifficulty : 'normal') as BossDifficulty };
        }
        r.seats.push({ kind: 'human', session });
        this.rooms.set(r.id, r);
        session.roomId = r.id;
        r.sendRoomState();
        this.broadcastRooms();
        return;
      }
      case 'joinRoom': {
        if (room) return err('Bạn đang ở trong một phòng');
        const r = this.rooms.get(msg.roomId);
        if (!r) return err('Phòng không tồn tại');
        if (r.password && msg.password !== r.password) return session.send({ t: 'needPassword', roomId: r.id, action: 'join', wrong: msg.password !== undefined });
        if (r.status !== 'waiting') return err('Phòng đang chơi');
        if (r.seats.length >= r.maxSeats) return err('Phòng đã đủ người');
        if (session.accountId && r.humans().some((h) => h.accountId === session.accountId)) return err('Tài khoản này đã ngồi trong phòng');
        const other = this.seatedElsewhere(session);
        if (other) return err(`Tài khoản này đang ngồi ở phòng "${other.name}" (tab hoặc thiết bị khác)`);
        r.seats.push({ kind: 'human', session });
        session.roomId = r.id;
        r.sendRoomState();
        this.broadcastRooms();
        return;
      }
      case 'spectate': {
        if (room) return err('Bạn đang ở trong một phòng');
        const r = this.rooms.get(msg.roomId);
        if (!r) return err('Phòng không tồn tại');
        if (r.password && msg.password !== r.password) return session.send({ t: 'needPassword', roomId: r.id, action: 'spectate', wrong: msg.password !== undefined });
        r.addSpectator(session);
        this.broadcastRooms();
        return;
      }
      case 'dissolveRoom': {
        if (!room) return err('Bạn chưa vào phòng');
        if (room.host !== session || session.spectating) return err('Chỉ chủ phòng (hoặc quản trị viên) mới giải tán được phòng');
        this.dissolveRoom(room, `chủ phòng ${session.name}`);
        return;
      }
      case 'surrender': {
        const seat = room?.seatOf(session) ?? null;
        if (!room || seat === null || !room.game || room.status !== 'playing') return err('Bạn không ở trong ván nào đang chơi');
        if (!room.game.requestSurrender(seat)) return err('Không thể đầu hàng lúc này');
        room.controllerOf(session)?.cancelPending();
        session.send({ t: 'notice', text: 'Bạn đã đầu hàng. Vẫn có thể ở lại xem đến hết ván.' });
        return;
      }
      case 'leaveRoom': {
        if (!room) return;
        this.leave(session, room);
        session.send({ t: 'room', room: null, yourSeat: null });
        return;
      }
      case 'addBot':
      case 'removeBot': {
        if (!room) return err('Bạn chưa vào phòng');
        if (room.host !== session) return err('Chỉ chủ phòng mới làm được');
        if (room.status !== 'waiting') return err('Ván đang diễn ra');
        if (msg.t === 'addBot') {
          if (room.seats.length >= room.maxSeats) return err('Phòng đã đủ ghế');
          room.seats.push({ kind: 'bot', name: `Bot ${room.seats.filter((s) => s.kind === 'bot').length + 1}` });
        } else {
          const i = room.seats.map((s) => s.kind).lastIndexOf('bot');
          if (i >= 0) room.seats.splice(i, 1);
        }
        room.sendRoomState();
        this.broadcastRooms();
        return;
      }
      case 'start': {
        if (!room) return err('Bạn chưa vào phòng');
        if (room.host !== session) return err('Chỉ chủ phòng mới bắt đầu được');
        const e = room.start();
        if (e) return err(e);
        this.broadcastRooms();
        return;
      }
      case 'answer': {
        const c = room?.controllerOf(session);
        if (!c || !c.answer(msg.reqId, msg.response)) session.send({ t: 'requestClosed', reqId: msg.reqId, reason: 'answered' });
        return;
      }
      case 'chat':
        if (room) room.broadcast({ t: 'chat', from: session.spectating ? `${session.name} (xem)` : session.name, text: String(msg.text).slice(0, 300) });
        return;
      default:
        return err('Tin nhắn không hợp lệ');
    }
  }
}
