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
  lastPlayed: string | null;
}

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
}

/** Người ngồi ghế lúc bắt đầu ván. */
export interface SeatOwner {
  accountId: string | null;
  bot: boolean;
}

const USERNAME = /^[a-zA-Z0-9_.-]{3,20}$/;
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
    this.byToken.set(h, a);
    while (a.tokens.length > 10) this.byToken.delete(a.tokens.shift()!);
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

  byAuthToken(token: string | undefined | null): Account | null {
    return token ? this.byToken.get(sha(String(token))) ?? null : null;
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
    };
  }

  profile(username: string): { profile: PublicProfile; matches: MatchRecord[] } | null {
    const a = this.byName.get(String(username ?? '').toLowerCase());
    if (!a) return null;
    const matches = this.matches.filter((m) => m.players.some((p) => p.username === a.username)).slice(-20).reverse();
    return { profile: this.publicProfile(a), matches };
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
