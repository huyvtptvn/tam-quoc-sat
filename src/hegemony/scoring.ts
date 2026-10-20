// ============================================================
// Tính điểm cá nhân trong một ván Quốc Chiến.
//
// Trong ván chỉ GHI LẠI sự việc (ai làm gì với ai, lúc đó mục tiêu còn úp tướng không).
// Hết ván mới quy ra điểm, dựa trên thế lực THẬT của mọi người lúc kết thúc:
// đánh trúng địch khi họ còn úp được thưởng thêm, lỡ tay đánh đồng đội đang úp chỉ bị trừ nhẹ.
// Không ảnh hưởng luật chơi.
// ============================================================
import { DELAYED_DEFS, TRICK_DEFS } from '../core/tricks.js';
import type { StatEvent } from '../core/game.js';
import type { CardName, Zone } from '../core/types.js';
import type { HegemonyGame } from './game.js';
import { BOSS_DIFFICULTY } from './boss.js';

/** Bảng điểm (sửa ở đây để cân bằng lại). */
export const SCORE_RULES = {
  damageEnemy: 3, damageEnemyHidden: 4, damageAlly: -3, damageAllyHidden: -1,
  killEnemy: 5, killAlly: -6,
  healAlly: 2, healSelf: 1, healEnemy: -2, saveBonus: 3,
  destroyEnemy: 1, destroyAlly: -1, stealEnemy: 1.5, stealAlly: -1,
  unjailAlly: 2, unjailEnemy: -1,
  hpLossEnemy: 3, hpLossAlly: -2,
  lebuEnemy: 4, lebuAlly: -4, bingliangEnemy: 3, bingliangAlly: -3,
  flipEnemy: 4, flipAlly: -4, lureEnemy: 2,
  nullifyProtect: 2, nullifyWrong: -2, dodge: 0.5, giveAlly: 0.5,
  // Kết thúc ván (gấp đôi bản đề xuất đầu, trừ 2 mục cuối)
  winAlive: 20, winDead: 10, careeristSolo: 40, survive: 3, firstReveal: 1,
} as const;

export type ScoreCategory = 'damage' | 'kill' | 'heal' | 'cards' | 'hpLoss' | 'jail' | 'control' | 'support' | 'end';

export const CATEGORY_LABEL: Record<ScoreCategory, string> = {
  damage: 'Sát thương', kill: 'Hạ gục', heal: 'Hồi máu', cards: 'Hủy/lấy bài', hpLoss: 'Làm mất máu',
  jail: 'Tù (Lạc Bất, Binh Lương)', control: 'Khống chế (lật úp, Điệu Hổ)', support: 'Phòng thủ & hỗ trợ', end: 'Kết thúc ván',
};

/** Số liệu thô của một người (để hiện bảng và chọn danh hiệu). */
export interface RawStats {
  damageToEnemy: number; damageToAlly: number; damageTaken: number; kills: number; allyKills: number;
  healed: number; saves: number; cardsDestroyed: number; cardsStolen: number; hpLossCaused: number;
  jailHits: number; flips: number; nullifies: number; dodges: number;
}

export interface PlayerScore {
  seat: number;
  name: string;
  /** Phe cuối ván: wei/shu/wu/qun hoặc 'careerist'. */
  faction: string;
  generals: [string, string];
  alive: boolean;
  winner: boolean;
  total: number;
  breakdown: Record<ScoreCategory, number>;
  stats: RawStats;
  titles: string[];
}

export interface ScoreBoard {
  players: PlayerScore[];
  mvp: number | null;
}

type Rec =
  | { k: 'damage'; by: number; to: number; n: number; hidden: boolean }
  | { k: 'kill'; by: number; to: number }
  | { k: 'heal'; by: number; to: number; n: number; save: boolean }
  | { k: 'destroy' | 'steal' | 'unjail' | 'give'; by: number; to: number; n: number }
  | { k: 'hpLoss'; by: number; to: number; n: number }
  | { k: 'jail'; by: number; to: number; name: CardName }
  | { k: 'flip' | 'lure'; by: number; to: number }
  | { k: 'nullify'; by: number; user: number; target: number; trick: CardName }
  | { k: 'dodge'; by: number };

/** Lý do di chuyển bài không tính là "người khác hủy/lấy bài của bạn". */
const NEUTRAL_REASONS = new Set([
  'use', 'respond', 'death', 'discardPhase', 'judge', 'judgePhase', 'settle', 'recast', 'transfer', 'replace',
  'penalty', 'reward', 'save', 'test', 'reshuffle', 'draw', 'deal', 'mulligan', 'equip', 'delayed',
]);

const ownerOf = (z: Zone): number | null =>
  z.kind === 'hand' || z.kind === 'equip' || z.kind === 'judge' ? z.seat : null;

export class ScoreKeeper {
  private readonly recs: Rec[] = [];
  /** Ai đặt cẩm nang trì hoãn này (id lá -> ghế). */
  private readonly placer = new Map<number, number>();
  private firstRevealer: number | null = null;
  private board: ScoreBoard | null = null;

  constructor(private readonly g: HegemonyGame) {
    const bus = g.bus;
    const LOW = -10_000; // chạy sau cùng: thấy giá trị cuối
    bus.on('damageDealt', (c) => {
      if (c.source === null || c.source === c.target) return;
      this.recs.push({ k: 'damage', by: c.source, to: c.target, n: c.amount, hidden: !this.revealed(c.target) });
    }, LOW);
    bus.on('death', (c) => { if (c.killer !== null && c.killer !== c.seat) this.recs.push({ k: 'kill', by: c.killer, to: c.seat }); }, LOW);
    bus.on('recovered', (c) => {
      const by = c.source ?? g.actor;
      if (by === null || c.amount <= 0) return;
      const save = g.player(c.seat).hp - c.amount <= 0 && by !== c.seat;
      this.recs.push({ k: 'heal', by, to: c.seat, n: c.amount, save });
    }, LOW);
    bus.on('hpLost', (c) => {
      const by = g.actor;
      if (by !== null && by !== c.seat && c.amount > 0) this.recs.push({ k: 'hpLoss', by, to: c.seat, n: c.amount });
    }, LOW);
    bus.on('slashDodged', (c) => { this.recs.push({ k: 'dodge', by: c.target }); }, LOW);
    bus.on('generalRevealed', (c) => { if (this.firstRevealer === null) this.firstRevealer = c.seat; }, LOW);
    bus.on('cardsMoved', (c) => this.onMove(c.cardIds, c.from, c.to, c.reason), LOW);
    g.statListeners.push((e) => this.onStat(e));
  }

  private revealed(seat: number): boolean {
    try { return this.g.isRevealedAny(seat); } catch { return false; }
  }

  private onMove(ids: number[], from: Zone, to: Zone, reason: string): void {
    const a = this.g.actor;
    // Ghi người đặt cẩm nang trì hoãn
    if (to.kind === 'judge') {
      const who = a ?? ownerOf(from);
      if (who !== null) for (const id of ids) if (!this.placer.has(id) || from.kind !== 'judge') this.placer.set(id, who);
      return;
    }
    const owner = ownerOf(from);
    if (owner === null || a === null || NEUTRAL_REASONS.has(reason)) return;
    const n = ids.length;
    if (owner === a) {
      // Tự giao bài cho người khác (Nhân Đức...)
      if (from.kind === 'hand' && to.kind === 'hand' && to.seat !== a) this.recs.push({ k: 'give', by: a, to: to.seat, n });
      return;
    }
    if (from.kind === 'judge') { this.recs.push({ k: 'unjail', by: a, to: owner, n }); return; }
    if (to.kind === 'hand' && to.seat === a) this.recs.push({ k: 'steal', by: a, to: owner, n });
    else if (to.kind === 'equip' && to.seat === a) this.recs.push({ k: 'steal', by: a, to: owner, n });
    else this.recs.push({ k: 'destroy', by: a, to: owner, n });
  }

  private onStat(e: StatEvent): void {
    switch (e.kind) {
      case 'turnedOver':
        if (e.faceDown && e.by !== null && e.by !== e.seat) this.recs.push({ k: 'flip', by: e.by, to: e.seat });
        break;
      case 'lured':
        if (e.by !== null && e.by !== e.seat) this.recs.push({ k: 'lure', by: e.by, to: e.seat });
        break;
      case 'delayedHit': {
        const by = this.placer.get(e.cardId);
        if (by !== undefined && by !== e.seat && (e.name === 'lebu' || e.name === 'bingliang')) this.recs.push({ k: 'jail', by, to: e.seat, name: e.name });
        break;
      }
      case 'nullified':
        if (e.cancelled) this.recs.push({ k: 'nullify', by: e.by, user: e.user, target: e.target, trick: e.trick });
        break;
    }
  }

  /** Khóa phe cuối ván: dã tâm gia mỗi người một phe riêng. */
  factionKey(seat: number): string {
    const h = this.g.heroes[seat];
    if (!h) return `?${seat}`;
    if (h.careerist) return `c${h.careeristGroup ?? seat}`;
    const k = this.g.realKingdom(seat);
    return k === 'ye' ? `c${seat}` : k;
  }

  private ally(a: number, b: number): boolean {
    return a === b || this.factionKey(a) === this.factionKey(b);
  }

  /** Những ghế thắng ván (kể cả đã chết). */
  winners(): Set<number> {
    const out = this.winnersRaw();
    for (const s of this.g.surrendered) out.delete(s); // đầu hàng thì không được tính thắng
    return out;
  }

  private winnersRaw(): Set<number> {
    const res = this.g.result;
    const out = new Set<number>();
    if (!res?.winner) return out;
    if (this.g.bossSeat !== null) {
      if (res.winner === 'Boss') out.add(this.g.bossSeat);
      else for (const s of this.g.playerSeats()) out.add(s);
      return out;
    }
    const alive = this.g.alivePlayers();
    if (alive.length === 0) return out;
    const key = this.factionKey(alive[0].seat);
    for (const p of this.g.state.players) if (this.factionKey(p.seat) === key) out.add(p.seat);
    return out;
  }

  /** Quy ra điểm (gọi sau khi ván kết thúc; gọi lại trả kết quả cũ). */
  compute(): ScoreBoard {
    if (this.board) return this.board;
    const R = SCORE_RULES;
    const g = this.g;
    const n = g.state.players.length;
    const blankStats = (): RawStats => ({
      damageToEnemy: 0, damageToAlly: 0, damageTaken: 0, kills: 0, allyKills: 0, healed: 0, saves: 0,
      cardsDestroyed: 0, cardsStolen: 0, hpLossCaused: 0, jailHits: 0, flips: 0, nullifies: 0, dodges: 0,
    });
    const bd = Array.from({ length: n }, () => ({ damage: 0, kill: 0, heal: 0, cards: 0, hpLoss: 0, jail: 0, control: 0, support: 0, end: 0 } as Record<ScoreCategory, number>));
    const st = Array.from({ length: n }, blankStats);
    const add = (seat: number, cat: ScoreCategory, v: number) => { bd[seat][cat] += v; };

    for (const r of this.recs) {
      switch (r.k) {
        case 'damage': {
          st[r.to].damageTaken += r.n;
          if (this.ally(r.by, r.to)) { st[r.by].damageToAlly += r.n; add(r.by, 'damage', r.n * (r.hidden ? R.damageAllyHidden : R.damageAlly)); }
          else { st[r.by].damageToEnemy += r.n; add(r.by, 'damage', r.n * (r.hidden ? R.damageEnemyHidden : R.damageEnemy)); }
          break;
        }
        case 'kill':
          if (this.ally(r.by, r.to)) { st[r.by].allyKills++; add(r.by, 'kill', R.killAlly); }
          else { st[r.by].kills++; add(r.by, 'kill', R.killEnemy); }
          break;
        case 'heal': {
          const self = r.by === r.to;
          const v = self ? R.healSelf : this.ally(r.by, r.to) ? R.healAlly : R.healEnemy;
          add(r.by, 'heal', r.n * v);
          if (v > 0) st[r.by].healed += r.n;
          if (r.save && !self && this.ally(r.by, r.to)) { add(r.by, 'heal', R.saveBonus); st[r.by].saves++; }
          break;
        }
        case 'destroy':
          add(r.by, 'cards', r.n * (this.ally(r.by, r.to) ? R.destroyAlly : R.destroyEnemy));
          if (!this.ally(r.by, r.to)) st[r.by].cardsDestroyed += r.n;
          break;
        case 'steal':
          add(r.by, 'cards', r.n * (this.ally(r.by, r.to) ? R.stealAlly : R.stealEnemy));
          if (!this.ally(r.by, r.to)) st[r.by].cardsStolen += r.n;
          break;
        case 'unjail':
          add(r.by, 'support', r.n * (this.ally(r.by, r.to) ? R.unjailAlly : R.unjailEnemy));
          break;
        case 'give':
          if (this.ally(r.by, r.to)) add(r.by, 'support', r.n * R.giveAlly);
          break;
        case 'hpLoss':
          add(r.by, 'hpLoss', r.n * (this.ally(r.by, r.to) ? R.hpLossAlly : R.hpLossEnemy));
          if (!this.ally(r.by, r.to)) st[r.by].hpLossCaused += r.n;
          break;
        case 'jail': {
          const enemy = !this.ally(r.by, r.to);
          const v = r.name === 'lebu' ? (enemy ? R.lebuEnemy : R.lebuAlly) : (enemy ? R.bingliangEnemy : R.bingliangAlly);
          add(r.by, 'jail', v);
          if (enemy) st[r.by].jailHits++;
          break;
        }
        case 'flip':
          add(r.by, 'control', this.ally(r.by, r.to) ? R.flipAlly : R.flipEnemy);
          if (!this.ally(r.by, r.to)) st[r.by].flips++;
          break;
        case 'lure':
          if (!this.ally(r.by, r.to)) add(r.by, 'control', R.lureEnemy);
          break;
        case 'nullify': {
          const harmful = TRICK_DEFS[r.trick]?.harmful ?? DELAYED_DEFS[r.trick]?.harmful ?? true;
          const protectsFriend = this.ally(r.by, r.target);
          if (harmful && protectsFriend && !this.ally(r.by, r.user)) { add(r.by, 'support', R.nullifyProtect); st[r.by].nullifies++; }
          else if (!harmful && protectsFriend && r.target !== r.by) add(r.by, 'support', R.nullifyWrong);
          break;
        }
        case 'dodge':
          add(r.by, 'support', R.dodge); st[r.by].dodges++;
          break;
      }
    }

    // Kết thúc ván
    const win = this.winners();
    const soloCareerist = win.size === 1 && this.factionKey([...win][0]).startsWith('c');
    const boss = g.bossSeat;
    for (const p of g.state.players) {
      if (boss !== null) {
        // Thảo Phạt (Chiến công): thắng theo độ khó + thưởng tốc độ (mỗi vòng sớm hơn giới hạn +2); boss không tính điểm kết thúc
        if (p.seat === boss) continue;
        if (win.has(p.seat)) add(p.seat, 'end', BOSS_DIFFICULTY[g.bossDifficulty].winBonus + 2 * Math.max(0, g.bossDef!.roundLimit - g.bossRound));
        if (p.alive) add(p.seat, 'end', R.survive);
        continue;
      }
      if (win.has(p.seat)) add(p.seat, 'end', soloCareerist ? R.careeristSolo : p.alive ? R.winAlive : R.winDead);
      if (p.alive) add(p.seat, 'end', R.survive);
      if (this.firstRevealer === p.seat) add(p.seat, 'end', R.firstReveal);
    }

    const round = (x: number) => Math.round(x * 10) / 10;
    const players: PlayerScore[] = g.state.players.map((p) => {
      const h = g.heroes[p.seat];
      const b = Object.fromEntries(Object.entries(bd[p.seat]).map(([k, v]) => [k, round(v)])) as Record<ScoreCategory, number>;
      const key = this.factionKey(p.seat);
      return {
        seat: p.seat, name: p.name,
        faction: key.startsWith('c') ? 'careerist' : key,
        generals: [h?.main.generalId ?? '', h?.deputy.generalId ?? ''],
        alive: p.alive, winner: win.has(p.seat),
        total: round(Object.values(b).reduce((s, v) => s + v, 0)),
        breakdown: b, stats: st[p.seat], titles: [],
      };
    });
    // Danh hiệu: người dẫn đầu mỗi chỉ số (phải > 0)
    const crown = (title: string, f: (s: RawStats) => number) => {
      const cands = players.filter((p) => p.seat !== boss);
      const best = Math.max(...cands.map((p) => f(p.stats)));
      if (best > 0) for (const p of cands) if (f(p.stats) === best) p.titles.push(title);
    };
    crown('Sát Thần', (s) => s.damageToEnemy);
    crown('Thần Y', (s) => s.healed);
    crown('Cai Ngục', (s) => s.jailHits);
    crown('Đạo Tặc', (s) => s.cardsDestroyed + s.cardsStolen);
    crown('Kẻ Phản Bội', (s) => s.damageToAlly + s.allyKills * 3);
    // MVP chỉ xét người chơi (không xét boss)
    const pool = players.filter((p) => p.seat !== boss);
    const top = Math.max(...pool.map((p) => p.total));
    const mvp = pool.find((p) => p.total === top)?.seat ?? null;
    if (mvp !== null) players[mvp].titles.unshift('MVP');
    this.board = { players, mvp };
    return this.board;
  }
}

/** Gắn bộ tính điểm vào ván (gọi trước game.run()). */
export function attachScoring(g: HegemonyGame): ScoreKeeper {
  return new ScoreKeeper(g);
}
