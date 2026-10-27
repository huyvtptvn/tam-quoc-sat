// ============================================================
// Sự kiện đua top (giới hạn thời gian). Bảng xếp hạng sự kiện tính lại từ lịch sử ván (matches.jsonl),
// nên không cần lưu thêm gì trong lúc diễn ra; khi hết hạn thì trao danh hiệu một lần (events-state.json).
// ============================================================
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountStore, MatchRecord } from './accounts.js';
import { rankOf } from './elo.js';

export type EventKind = 'elo' | 'bestScore';

export interface EventReward { place: number; title: string; text: string }

export interface EventDef {
  id: string;
  kind: EventKind;
  name: string;
  tagline: string;
  /** Các đoạn giới thiệu. */
  intro: string[];
  rules: string[];
  rewards: EventReward[];
  start: string; // ISO
  end: string;   // ISO
  /** Elo: số ván xếp hạng tối thiểu trong thời gian sự kiện để được xét. */
  minGames?: number;
  /** Điểm ván: ván phải có ít nhất bấy nhiêu người (tính cả bot). */
  minPlayers?: number;
  /** Ảnh minh họa (skin tướng). */
  art?: string;
}

export interface EventRow {
  place: number; username: string; displayName: string; rank: string;
  /** Elo cuối kỳ hoặc điểm ván cao nhất. */
  value: number;
  games: number; wins: number;
  /** Ván đạt điểm cao nhất (sự kiện điểm ván). */
  matchId?: string; generals?: string[]; at?: string;
}

const START = '2026-10-27T12:00:00+07:00';
const END = '2026-11-08T23:59:59+07:00';

export const EVENTS: EventDef[] = [
  {
    id: 'dua-top-elo-t11-2026',
    kind: 'elo',
    name: 'Đua Top Elo · Thu Chinh',
    tagline: 'Ba vị tướng có Elo cao nhất khi trống thu quân vang lên sẽ được ghi danh bảng vàng.',
    intro: [
      'Gió thu thổi qua Xích Bích, chư hầu khắp nơi lại khởi binh. Trong suốt thời gian sự kiện, mỗi ván Quốc Chiến có tính Elo đều góp phần vào cuộc đua lên ngôi.',
      'Khi sự kiện khép lại, ba người chơi có Elo cao nhất sẽ nhận danh hiệu riêng hiển thị trên trang cá nhân và bảng xếp hạng.',
    ],
    rules: [
      'Chỉ tính các ván Quốc Chiến có tính Elo, chơi bằng tài khoản (khách không được xét).',
      'Phải chơi ít nhất 5 ván có tính Elo trong thời gian sự kiện mới được xếp hạng.',
      'Elo dùng để xếp hạng là Elo ngay sau ván cuối cùng bạn chơi trước khi sự kiện kết thúc.',
      'Bằng Elo: ai thắng nhiều ván hơn trong sự kiện xếp trên; vẫn bằng thì ai đạt mốc đó sớm hơn xếp trên.',
      'Ván chưa kết thúc lúc hết giờ không được tính.',
    ],
    rewards: [
      { place: 1, title: 'Bá Vương Thu Chinh', text: 'Danh hiệu vàng "Bá Vương Thu Chinh" + tên in trên bảng vàng sự kiện' },
      { place: 2, title: 'Đại Tướng Thu Chinh', text: 'Danh hiệu "Đại Tướng Thu Chinh"' },
      { place: 3, title: 'Tiên Phong Thu Chinh', text: 'Danh hiệu "Tiên Phong Thu Chinh"' },
    ],
    start: START, end: END, minGames: 5, art: '/skins/caocao/1/full.png',
  },
  {
    id: 'dua-diem-van-t11-2026',
    kind: 'bestScore',
    name: 'Đua Điểm Ván Đấu · Nhất Kỵ Đương Thiên',
    tagline: 'Một ván để đời: điểm tổng cao nhất của bạn trong một ván sẽ được ghi lại.',
    intro: [
      'Không cần đánh nhiều, chỉ cần đánh hay. Mỗi ván Quốc Chiến, hệ thống tính điểm hành động: sát thương, hạ gục, hồi máu, khống chế, hỗ trợ đồng minh và điểm kết thúc ván.',
      'Điểm tổng cao nhất của bạn trong một ván (trong thời gian sự kiện) là thành tích dự thi. Chơi lại bao nhiêu lần cũng được, hệ thống chỉ giữ ván tốt nhất.',
    ],
    rules: [
      'Tính các ván Quốc Chiến đã kết thúc, chơi bằng tài khoản (khách không được xét); ván Thảo Phạt không tính.',
      'Ván phải có ít nhất 5 người ngồi (tính cả bot).',
      'Mỗi người chỉ giữ 1 thành tích: điểm tổng cao nhất trong một ván.',
      'Bằng điểm: ai đạt trước xếp trên.',
      'Ván chưa kết thúc lúc hết giờ không được tính.',
    ],
    rewards: [
      { place: 1, title: 'Nhất Kỵ Đương Thiên', text: 'Danh hiệu vàng "Nhất Kỵ Đương Thiên" + ván đấu được ghim lên bảng vàng' },
      { place: 2, title: 'Vạn Nhân Địch', text: 'Danh hiệu "Vạn Nhân Địch"' },
      { place: 3, title: 'Mãnh Tướng', text: 'Danh hiệu "Mãnh Tướng"' },
    ],
    start: START, end: END, minPlayers: 5, art: '/skins/zhaoyun/1/full.png',
  },
];

const inWindow = (m: MatchRecord, def: EventDef) => {
  const t = Date.parse(m.at);
  return t >= Date.parse(def.start) && t <= Date.parse(def.end);
};

/** Bảng xếp hạng của một sự kiện, tính từ lịch sử ván. */
export function eventStandings(def: EventDef, matches: readonly MatchRecord[], acc: AccountStore): EventRow[] {
  const rows = new Map<string, EventRow & { reachedAt: number }>();
  for (const m of matches) {
    if (m.boss || !inWindow(m, def)) continue;
    if (def.kind === 'elo' && !m.ranked) continue;
    if (def.kind === 'bestScore' && m.players.length < (def.minPlayers ?? 0)) continue;
    for (const p of m.players) {
      if (!p.username) continue;
      if (def.kind === 'elo' && p.ratingAfter === null) continue;
      let r = rows.get(p.username);
      if (!r) {
        const a = acc.profile(p.username)?.profile;
        r = { place: 0, username: p.username, displayName: a?.displayName ?? p.name, rank: '', value: -Infinity, games: 0, wins: 0, reachedAt: 0 };
        rows.set(p.username, r);
      }
      r.games++;
      if (p.winner) r.wins++;
      const t = Date.parse(m.at);
      if (def.kind === 'elo') {
        // ván sau cùng trong kỳ quyết định Elo
        if (t >= r.reachedAt) { r.value = p.ratingAfter!; r.reachedAt = t; }
      } else if (p.score > r.value || (p.score === r.value && t < r.reachedAt)) {
        r.value = p.score; r.reachedAt = t; r.matchId = m.id; r.generals = p.generals; r.at = m.at;
      }
    }
  }
  const list = [...rows.values()].filter((r) => def.kind !== 'elo' || r.games >= (def.minGames ?? 0));
  list.sort((a, b) => b.value - a.value || (def.kind === 'elo' ? b.wins - a.wins : 0) || a.reachedAt - b.reachedAt);
  return list.map(({ reachedAt: _r, ...r }, i) => ({ ...r, place: i + 1, rank: def.kind === 'elo' ? rankOf(r.value, 99) : (acc.profile(r.username)?.profile.rank ?? '') }));
}

/** Người chơi chưa đủ điều kiện (sự kiện Elo): số ván đã chơi trong kỳ. */
export function eventProgress(def: EventDef, matches: readonly MatchRecord[], username: string): { games: number } {
  let games = 0;
  for (const m of matches) {
    if (m.boss || !inWindow(m, def) || (def.kind === 'elo' && !m.ranked)) continue;
    if (m.players.some((p) => p.username === username && (def.kind !== 'elo' || p.ratingAfter !== null))) games++;
  }
  return { games };
}

/** Trao thưởng các sự kiện đã kết thúc (mỗi sự kiện đúng 1 lần). */
export class EventAwards {
  private state: Record<string, { at: string; winners: { place: number; username: string; title: string }[] }> = {};
  private readonly file: string;
  constructor(dir: string) {
    this.file = join(dir, 'events-state.json');
    if (existsSync(this.file)) { try { this.state = JSON.parse(readFileSync(this.file, 'utf8')); } catch { /* hỏng: coi như chưa trao */ } }
  }
  winners(id: string) { return this.state[id]?.winners ?? null; }
  /** Gọi định kỳ: sự kiện nào hết hạn mà chưa trao thì trao danh hiệu cho top 3. */
  tick(acc: AccountStore, now = Date.now()): string[] {
    const done: string[] = [];
    for (const def of EVENTS) {
      if (now <= Date.parse(def.end) || this.state[def.id]) continue;
      const top = eventStandings(def, acc.allMatches(), acc).slice(0, def.rewards.length);
      const winners = top.map((r) => {
        const rw = def.rewards.find((x) => x.place === r.place)!;
        acc.grantTitle(r.username, rw.title);
        return { place: r.place, username: r.username, title: rw.title };
      });
      this.state[def.id] = { at: new Date(now).toISOString(), winners };
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 1));
      renameSync(`${this.file}.tmp`, this.file);
      done.push(def.id);
    }
    return done;
  }
}
