// ============================================================
// Tài khoản, lịch sử ván, Elo, bảng xếp hạng.
//
// Lưu bằng file trong thư mục dữ liệu (mặc định ./data):
//   accounts.json   danh sách tài khoản (mật khẩu chỉ lưu dạng băm scrypt)
//   matches.jsonl   mỗi dòng một ván đã chơi
// ============================================================
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreBoard } from '../hegemony/scoring.js';
import { ELO_START, eloDeltas, rankOf } from './elo.js';

export interface Account {
  id: string;
  username: string;
  displayName: string;
  salt: string;
  hash: string;
  createdAt: string;
  rating: number;
  peak: number;
  games: number;
  wins: number;
  mvps: number;
  totalScore: number;
  bestScore: number;
  titles: Record<string, number>;
  /** Băm sha256 của các mã đăng nhập còn hiệu lực (tối đa 10 thiết bị). */
  tokens: string[];
  /** Lần cuối mỗi mã đăng nhập được dùng (ms). Không dùng quá LOGIN_TTL_MS thì mã hết hạn. */
  tokenUsed?: Record<string, number>;
  lastPlayed: string | null;
  /** Thảo Phạt: thống kê theo "<boss>:<độ khó>". best = số vòng ít nhất khi thắng. */
  boss?: Record<string, BossStat>;
}

export interface BossStat { plays: number; clears: number; points: number; best: number | null }

/** Thông tin công khai của một tài khoản. */
export interface PublicProfile {
  username: string;
  displayName: string;
  rating: number;
  peak: number;
  rank: string;
  games: number;
  wins: number;
  winRate: number;
  mvps: number;
  avgScore: number;
  bestScore: number;
  titles: Record<string, number>;
  createdAt: string;
  lastPlayed: string | null;
  /** Thảo Phạt: tổng Chiến công, số lần hạ boss, số ván đánh boss. */
  boss: { points: number; clears: number; plays: number };
}

export interface MatchPlayer {
  seat: number;
  name: string;
  username: string | null;
  bot: boolean;
  generals: [string, string];
  faction: string;
  winner: boolean;
  alive: boolean;
  score: number;
  breakdown: Record<string, number>;
  titles: string[];
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface MatchRecord {
  id: string;
  at: string;
  room: string;
  deck: string;
  mode: string;
  turns: number;
  winner: string | null;
  ranked: boolean;
  players: MatchPlayer[];
  /** Ván Thảo Phạt (đánh boss). */
  boss?: { id: string; name: string; difficulty: string; difficultyLabel: string; rounds: number; win: boolean };
}

/** Người ngồi ghế lúc bắt đầu ván. */
export interface SeatOwner {
  accountId: string | null;
  bot: boolean;
}

const USERNAME = /^[a-zA-Z0-9_.-]{3,20}$/;
/** "Nhớ đăng nhập": mã đăng nhập hết hạn sau 30 ngày KHÔNG dùng (mỗi lần vào game lại tính lại từ đầu). */
export const LOGIN_TTL_MS = 30 * 24 * 3600_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hashPw = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString('hex');

export class AccountStore {
  private accounts: Account[] = [];
  private readonly byId = new Map<string, Account>();
  private readonly byName = new Map<string, Account>();
  private readonly byToken = new Map<string, Account>();
  /** Các ván gần đây (giữ tối đa 5000 ván trong bộ nhớ). */
  private matches: MatchRecord[] = [];
  private readonly failures = new Map<string, { n: number; until: number }>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    const accFile = join(dir, 'accounts.json');
    if (existsSync(accFile)) {
      const data = JSON.parse(readFileSync(accFile, 'utf8')) as { accounts: Account[] };
      for (const a of data.accounts ?? []) this.index(a);
    }
    const mFile = join(dir, 'matches.jsonl');
    if (existsSync(mFile)) {
      for (const line of readFileSync(mFile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { this.matches.push(JSON.parse(line) as MatchRecord); } catch { /* dòng hỏng: bỏ qua */ }
      }
      if (this.matches.length > 5000) this.matches = this.matches.slice(-5000);
    }
  }

  private index(a: Account): void {
    this.accounts.push(a);
    this.byId.set(a.id, a);
    this.byName.set(a.username.toLowerCase(), a);
    for (const t of a.tokens) this.byToken.set(t, a);
  }

  /** Ghi file an toàn: ghi file tạm rồi đổi tên (không hỏng file nếu tắt giữa chừng). */
  private save(): void {
    const file = join(this.dir, 'accounts.json');
    writeFileSync(`${file}.tmp`, JSON.stringify({ accounts: this.accounts }, null, 1));
    renameSync(`${file}.tmp`, file);
  }

  private issueToken(a: Account): string {
    const token = randomBytes(24).toString('base64url');
    const h = sha(token);
    a.tokens.push(h);
    (a.tokenUsed ??= {})[h] = Date.now();
    this.byToken.set(h, a);
    while (a.tokens.length > 10) { const old = a.tokens.shift()!; this.byToken.delete(old); delete a.tokenUsed[old]; }
    return token;
  }

  register(username: string, password: string, displayName?: string): { token: string; profile: PublicProfile } {
    username = String(username ?? '').trim();
    password = String(password ?? '');
    if (!USERNAME.test(username)) throw new Error('Tên đăng nhập 3–20 ký tự: chữ không dấu, số, dấu _ . -');
    if (password.length < 6 || password.length > 100) throw new Error('Mật khẩu cần 6–100 ký tự');
    if (this.byName.has(username.toLowerCase())) throw new Error('Tên đăng nhập đã có người dùng');
    const salt = randomBytes(16).toString('hex');
    const a: Account = {
      id: randomUUID(), username, displayName: String(displayName || username).trim().slice(0, 24) || username,
      salt, hash: hashPw(password, salt), createdAt: new Date().toISOString(),
      rating: ELO_START, peak: ELO_START, games: 0, wins: 0, mvps: 0, totalScore: 0, bestScore: 0, titles: {},
      tokens: [], lastPlayed: null,
    };
    this.index(a);
    const token = this.issueToken(a);
    this.save();
    return { token, profile: this.publicProfile(a) };
  }

  login(username: string, password: string): { token: string; profile: PublicProfile } {
    const key = String(username ?? '').trim().toLowerCase();
    const f = this.failures.get(key);
    if (f && f.until > Date.now()) throw new Error('Sai mật khẩu nhiều lần, thử lại sau 1 phút');
    const a = this.byName.get(key);
    const ok = !!a && timingSafeEqual(Buffer.from(hashPw(String(password ?? ''), a.salt), 'hex'), Buffer.from(a.hash, 'hex'));
    if (!ok || !a) {
      const n = (f?.n ?? 0) + 1;
      this.failures.set(key, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      throw new Error('Sai tên đăng nhập hoặc mật khẩu');
    }
    this.failures.delete(key);
    const token = this.issueToken(a);
    this.save();
    return { token, profile: this.publicProfile(a) };
  }

  logout(token: string): void {
    const h = sha(String(token ?? ''));
    const a = this.byToken.get(h);
    if (!a) return;
    this.byToken.delete(h);
    a.tokens = a.tokens.filter((t) => t !== h);
    this.save();
  }

  /** Tài khoản của mã đăng nhập; mã quá 30 ngày không dùng thì hết hạn. Dùng lại thì gia hạn. */
  byAuthToken(token: string | undefined | null, now = Date.now()): Account | null {
    if (!token) return null;
    const h = sha(String(token));
    const a = this.byToken.get(h);
    if (!a) return null;
    const used = a.tokenUsed?.[h] ?? now; // mã cũ (trước khi có hạn): tính từ lúc này
    if (now - used > LOGIN_TTL_MS) {
      this.byToken.delete(h);
      a.tokens = a.tokens.filter((t) => t !== h);
      if (a.tokenUsed) delete a.tokenUsed[h];
      this.save();
      return null;
    }
    // Gia hạn (ghi file tối đa mỗi giờ một lần cho mỗi mã)
    if (!a.tokenUsed?.[h] || now - a.tokenUsed[h] > 3600_000) { (a.tokenUsed ??= {})[h] = now; this.save(); }
    return a;
  }

  /** Danh sách tài khoản cho trang quản trị (không bao giờ kèm mật khẩu băm hay mã đăng nhập). */
  adminList(): (PublicProfile & { id: string; devices: number })[] {
    return this.accounts.map((a) => ({ ...this.publicProfile(a), id: a.id, devices: a.tokens.length }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Quản trị: đặt mật khẩu tạm mới và đăng xuất mọi thiết bị. Trả về mật khẩu tạm. */
  adminResetPassword(username: string): string {
    const a = this.byName.get(String(username ?? '').toLowerCase());
    if (!a) throw new Error('Không có tài khoản này');
    const pw = randomBytes(6).toString('base64url');
    a.salt = randomBytes(16).toString('hex');
    a.hash = hashPw(pw, a.salt);
    for (const t of a.tokens) this.byToken.delete(t);
    a.tokens = [];
    this.failures.delete(a.username.toLowerCase());
    this.save();
    return pw;
  }

  /** Quản trị: đăng xuất tài khoản khỏi mọi thiết bị. */
  adminLogoutAll(username: string): void {
    const a = this.byName.get(String(username ?? '').toLowerCase());
    if (!a) throw new Error('Không có tài khoản này');
    for (const t of a.tokens) this.byToken.delete(t);
    a.tokens = [];
    a.tokenUsed = {};
    this.save();
  }

  get(id: string): Account | null {
    return this.byId.get(id) ?? null;
  }

  publicProfile(a: Account): PublicProfile {
    return {
      username: a.username, displayName: a.displayName, rating: a.rating, peak: a.peak, rank: rankOf(a.rating, a.games),
      games: a.games, wins: a.wins, winRate: a.games ? Math.round((a.wins / a.games) * 1000) / 10 : 0,
      mvps: a.mvps, avgScore: a.games ? Math.round((a.totalScore / a.games) * 10) / 10 : 0, bestScore: a.bestScore,
      titles: a.titles, createdAt: a.createdAt, lastPlayed: a.lastPlayed,
      boss: Object.values(a.boss ?? {}).reduce((s, x) => ({ points: Math.round((s.points + x.points) * 10) / 10, clears: s.clears + x.clears, plays: s.plays + x.plays }), { points: 0, clears: 0, plays: 0 }),
    };
  }

  profile(username: string): { profile: PublicProfile; matches: MatchRecord[] } | null {
    const a = this.byName.get(String(username ?? '').toLowerCase());
    if (!a) return null;
    const matches = this.matches.filter((m) => m.players.some((p) => p.username === a.username)).slice(-20).reverse();
    return { profile: this.publicProfile(a), matches };
  }

  /** Toàn bộ lịch sử ván đang giữ trong bộ nhớ (tối đa 5000 ván gần nhất). */
  allMatches(): readonly MatchRecord[] {
    return this.matches;
  }

  /** Trao danh hiệu (sự kiện): cộng vào bộ danh hiệu của tài khoản. */
  grantTitle(username: string, title: string): void {
    const a = this.byName.get(username.toLowerCase());
    if (!a) return;
    a.titles[title] = (a.titles[title] ?? 0) + 1;
    this.save();
  }

  match(id: string): MatchRecord | null {
    return this.matches.find((m) => m.id === id) ?? null;
  }

  /** Bảng xếp hạng. sort: rating | wins | score (điểm TB) | mvp. Chỉ người đã chơi ít nhất 1 ván. */
  leaderboard(sort = 'rating', limit = 100): (PublicProfile & { place: number })[] {
    const key: Record<string, (p: PublicProfile) => number> = {
      rating: (p) => p.rating, wins: (p) => p.wins, score: (p) => p.avgScore, mvp: (p) => p.mvps,
    };
    const f = key[sort] ?? key.rating;
    return this.accounts.filter((a) => a.games > 0).map((a) => this.publicProfile(a))
      .sort((a, b) => f(b) - f(a) || b.rating - a.rating || a.username.localeCompare(b.username))
      .slice(0, Math.max(1, Math.min(500, limit)))
      .map((p, i) => ({ ...p, place: i + 1 }));
  }

  /**
   * Ghi một ván Thảo Phạt: không tính Elo. Mỗi người có tài khoản cộng Chiến công (điểm trong ván),
   * số lần đánh / hạ boss và kỷ lục số vòng ít nhất cho đúng boss + độ khó.
   */
  recordBossMatch(info: { room: string; deck: string; turns: number; winner: string | null;
    boss: { id: string; name: string; difficulty: string; difficultyLabel: string; rounds: number } },
  owners: SeatOwner[], board: ScoreBoard, bossSeat: number): MatchRecord {
    const win = info.winner === 'Liên quân';
    const key = `${info.boss.id}:${info.boss.difficulty}`;
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const players: MatchPlayer[] = board.players.map((p, i) => {
      const acc = owners[i]?.accountId ? this.byId.get(owners[i].accountId!) ?? null : null;
      const a = acc && !seen.has(acc.id) && i !== bossSeat ? acc : null;
      if (a) {
        seen.add(a.id);
        const st = (a.boss ??= {})[key] ?? (a.boss[key] = { plays: 0, clears: 0, points: 0, best: null });
        st.plays++;
        st.points += p.total;
        if (win) { st.clears++; st.best = st.best === null ? info.boss.rounds : Math.min(st.best, info.boss.rounds); }
        a.lastPlayed = now;
      }
      return {
        seat: p.seat, name: p.name, username: a?.username ?? null, bot: owners[i]?.bot ?? true,
        generals: p.generals, faction: i === bossSeat ? 'boss' : 'lienquan', winner: p.winner, alive: p.alive, score: p.total,
        breakdown: p.breakdown, titles: p.titles, ratingBefore: null, ratingAfter: null,
      };
    });
    const rec: MatchRecord = {
      id: randomBytes(5).toString('hex'), at: now, room: info.room, deck: info.deck, mode: 'boss', turns: info.turns,
      winner: info.winner, ranked: false, players, boss: { ...info.boss, win },
    };
    this.matches.push(rec);
    if (this.matches.length > 5000) this.matches.shift();
    appendFileSync(join(this.dir, 'matches.jsonl'), `${JSON.stringify(rec)}\n`);
    if (seen.size) this.save();
    return rec;
  }

  /**
   * Bảng xếp hạng Thảo Phạt cho 1 boss (+ độ khó, hoặc 'all' = mọi độ khó):
   * - fastest: các đội hạ boss nhanh nhất (ít vòng nhất, rồi sớm nhất);
   * - players: người chơi theo tổng Chiến công.
   */
  bossLeaderboard(boss: string, difficulty = 'all', limit = 50) {
    const match = (k: string) => k.startsWith(`${boss}:`) && (difficulty === 'all' || k === `${boss}:${difficulty}`);
    const fastest = this.matches
      .filter((m) => m.boss && m.boss.id === boss && m.boss.win && (difficulty === 'all' || m.boss.difficulty === difficulty))
      .sort((a, b) => a.boss!.rounds - b.boss!.rounds || a.at.localeCompare(b.at))
      .slice(0, 20)
      .map((m, i) => ({
        place: i + 1, id: m.id, at: m.at, rounds: m.boss!.rounds, difficulty: m.boss!.difficultyLabel,
        team: m.players.filter((p) => p.faction !== 'boss').map((p) => ({ name: p.name, username: p.username, generals: p.generals, score: p.score })),
      }));
    const players = this.accounts.map((a) => {
      const stats = Object.entries(a.boss ?? {}).filter(([k]) => match(k)).map(([, v]) => v);
      const bests = stats.map((x) => x.best).filter((x): x is number => x !== null);
      return {
        username: a.username, displayName: a.displayName,
        plays: stats.reduce((s, x) => s + x.plays, 0), clears: stats.reduce((s, x) => s + x.clears, 0),
        points: Math.round(stats.reduce((s, x) => s + x.points, 0) * 10) / 10, best: bests.length ? Math.min(...bests) : null,
      };
    }).filter((p) => p.plays > 0)
      .sort((a, b) => b.points - a.points || b.clears - a.clears || a.username.localeCompare(b.username))
      .slice(0, Math.max(1, Math.min(500, limit)))
      .map((p, i) => ({ ...p, place: i + 1 }));
    return { fastest, players };
  }

  /**
   * Ghi một ván đã xong: cập nhật thống kê + Elo cho người có tài khoản, lưu lịch sử.
   * Ván tính xếp hạng khi có ít nhất 1 người có tài khoản và ván có người thắng.
   */
  recordMatch(info: { room: string; deck: string; mode: string; turns: number; winner: string | null },
    owners: SeatOwner[], board: ScoreBoard, factionKeys: string[]): MatchRecord {
    const accs = owners.map((o) => (o.accountId ? this.byId.get(o.accountId) ?? null : null));
    // Một tài khoản ngồi nhiều ghế (không nên xảy ra): chỉ tính ghế đầu
    const seen = new Set<string>();
    const rated = accs.map((a) => { if (!a || seen.has(a.id)) return false; seen.add(a.id); return true; });
    const ranked = rated.some(Boolean) && info.winner !== null;
    const deltas = ranked ? eloDeltas(board.players.map((p, i) => ({
      rating: accs[i]?.rating ?? 0, games: accs[i]?.games ?? 0, rated: rated[i],
      winner: p.winner, score: p.total, faction: factionKeys[i],
    }))) : board.players.map(() => 0);
    const now = new Date().toISOString();
    const players: MatchPlayer[] = board.players.map((p, i) => {
      const a = rated[i] ? accs[i] : null;
      const before = a ? a.rating : null;
      if (a) {
        a.rating += deltas[i];
        a.peak = Math.max(a.peak, a.rating);
        a.games++;
        if (p.winner) a.wins++;
        if (board.mvp === p.seat) a.mvps++;
        a.totalScore += p.total;
        a.bestScore = Math.max(a.bestScore, p.total);
        for (const t of p.titles) a.titles[t] = (a.titles[t] ?? 0) + 1;
        a.lastPlayed = now;
      }
      return {
        seat: p.seat, name: p.name, username: a?.username ?? null, bot: owners[i].bot,
        generals: p.generals, faction: p.faction, winner: p.winner, alive: p.alive, score: p.total,
        breakdown: p.breakdown, titles: p.titles, ratingBefore: before, ratingAfter: a ? a.rating : null,
      };
    });
    const rec: MatchRecord = { id: randomBytes(5).toString('hex'), at: now, ...info, ranked, players };
    this.matches.push(rec);
    if (this.matches.length > 5000) this.matches.shift();
    appendFileSync(join(this.dir, 'matches.jsonl'), `${JSON.stringify(rec)}\n`);
    if (rated.some(Boolean)) this.save();
    return rec;
  }
}
