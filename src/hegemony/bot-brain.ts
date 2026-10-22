// ============================================================
// "Bộ não" chiến thuật của bot Quốc Chiến (theo Bộ quy tắc hành vi BOT – TQS).
// Chỉ dùng PlayerView: thế lực đã lộ, máu, số bài, trang bị, tướng đã lật, log công khai.
// Không biết bài trên tay hay tướng úp của người khác.
//
// - Điều 4–6: điểm sức mạnh từng phe (0–100, chuẩn hóa theo phe mạnh nhất).
// - Điều 7–10, 28–32: điểm ưu tiên mục tiêu (thang 100) + phạt rủi ro.
// - Điều 12–14: mỗi Dã tâm gia (hoặc nhóm Lạp Long Nhân Tâm) là một phe riêng.
// - Điều 15: xác suất người chưa lộ là đồng minh (tiên nghiệm theo số chỗ còn lại + hành vi trong log).
// ============================================================
import type { PlayerView, PublicPlayer } from '../core/view.js';
import { CARD_INFO } from '../core/cards.js';
import { getGeneral, isDualGeneral, kingdomsOf, type Kingdom } from './generals.js';

/** Kỹ năng hưởng lợi khi bị sát thương / mất máu (Điều 18, 30): đánh họ thì phạt điểm trừ khi kết liễu. */
const DAMAGE_BENEFIT = new Set([
  'gianhung', 'phanquy', 'dike', 'cuonglie', 'jiahe', 'fudi', 'shicai', 'jihun', 'lundao', 'jieming', 'fangzhu',
  'hengjiang', 'zhiyu', 'shangshi', 'enyuan', 'benyu', 'jilei', 'xingzhao', 'zhaoxin',
]);

/** Trọng số sức mạnh phe (Điều 4). */
const W = { people: 20, skills: 20, hp: 15, hand: 12, equip: 10, formation: 10, control: 8, sustain: 5 };

export type FactionKey = string;

export interface FactionInfo {
  key: FactionKey;
  members: PublicPlayer[];
  /** 0–100 sau chuẩn hóa. */
  strength: number;
}

export class BotBrain {
  /** Thiện cảm quan sát được: >0 là hành vi giúp phe của mình, <0 là tấn công phe của mình (theo log công khai). */
  private readonly attitude = new Map<number, number>();
  private lastLog: string[] = [];

  /** Cập nhật hành vi từ log công khai (Điều 15: cập nhật xác suất theo hành vi, không khẳng định tuyệt đối). */
  observe(v: PlayerView, myKey: FactionKey | null): void {
    const log = v.recentLog ?? [];
    // Tìm phần log mới so với lần trước (log trượt 10 dòng cuối)
    let start = 0;
    for (let k = Math.min(this.lastLog.length, log.length); k > 0; k--) {
      const tail = this.lastLog.slice(-k);
      if (tail.every((l, i) => log[i] === l)) { start = k; break; }
    }
    const fresh = log.slice(start);
    this.lastLog = log.slice();
    if (!myKey) return;
    const bySeatName = new Map(v.players.map((p) => [p.name, p.seat]));
    const mine = new Set(v.players.filter((p) => p.alive && keyOf(p) === myKey).map((p) => p.seat));
    mine.add(v.me);
    for (const line of fresh) {
      const clean = line.replace(/^\\?#\s*/, '');
      // "A dùng <lá> vào B, C." — lá gây hại thì là thù địch, lá có lợi (Đào, Viện Giao...) là thiện chí
      const m = /^(.+?) dùng (.+?) vào (.+?)\.$/.exec(clean);
      if (m) {
        const a = bySeatName.get(m[1]);
        if (a === undefined || a === v.me) continue;
        const targets = m[3].split(', ').map((n) => bySeatName.get(n)).filter((x): x is number => x !== undefined);
        const friendly = /Đào|Viện Giao|Đào Viên|Liên Quân|Khắc Phục/.test(m[2]);
        for (const t of targets) if (mine.has(t)) this.bump(a, friendly ? 1 : -1);
        continue;
      }
      const s = /^(.+?) dùng .+ cứu (.+?)\.$/.exec(clean);
      if (s) {
        const a = bySeatName.get(s[1]); const t = bySeatName.get(s[2]);
        if (a !== undefined && t !== undefined && a !== v.me && mine.has(t)) this.bump(a, 2);
      }
    }
  }

  private bump(seat: number, d: number): void {
    this.attitude.set(seat, Math.max(-6, Math.min(6, (this.attitude.get(seat) ?? 0) + d)));
  }

  /** Xác suất người `p` (chưa lộ) cùng phe với mình. Người đã lộ: 1 hoặc 0. */
  allyProb(v: PlayerView, p: PublicPlayer, myKey: FactionKey | null, myKingdom: Kingdom | null, careerist: boolean): number {
    if (p.seat === v.me) return 1;
    if (p.kingdom != null) return myKey !== null && keyOf(p) === myKey ? 1 : 0;
    if (careerist || !myKingdom) return 0; // Dã tâm gia: người chưa lộ không thể là đồng minh
    // Tiên nghiệm: số chỗ còn lại của thế lực mình / số người chưa lộ (mỗi thế lực tối đa một nửa bàn)
    const total = v.players.length;
    const shownMine = v.players.filter((q) => q.kingdom === myKingdom && q.seat !== v.me).length;
    const hidden = v.players.filter((q) => q.alive && q.kingdom == null && q.seat !== v.me).length;
    const slots = Math.max(0, Math.floor(total / 2) - shownMine - 1);
    let prior = hidden ? Math.min(0.9, slots / hidden) : 0;
    // Hành vi quan sát: mỗi điểm thiện cảm dịch xác suất ~10%
    const att = this.attitude.get(p.seat) ?? 0;
    prior = Math.max(0.02, Math.min(0.95, prior + att * 0.1));
    return prior;
  }

  /** Các phe đã lộ và điểm sức mạnh (Điều 4–6). */
  factions(v: PlayerView): FactionInfo[] {
    const alive = v.players.filter((p) => p.alive);
    const groups = new Map<FactionKey, PublicPlayer[]>();
    for (const p of alive) {
      const k = keyOf(p);
      if (k === null) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    }
    const raw = [...groups.entries()].map(([key, members]) => ({ key, members, f: factors(v, members) }));
    const max: Record<keyof typeof W, number> = { people: 0, skills: 0, hp: 0, hand: 0, equip: 0, formation: 0, control: 0, sustain: 0 };
    for (const r of raw) for (const k of Object.keys(W) as (keyof typeof W)[]) max[k] = Math.max(max[k], r.f[k]);
    return raw.map((r) => {
      let s = 0;
      for (const k of Object.keys(W) as (keyof typeof W)[]) s += W[k] * (max[k] > 0 ? r.f[k] / max[k] : 0);
      // Điều 5: phe đông mà hầu hết sắp chết -> giảm; phe phụ thuộc 1 người -> giảm độ bền
      const dying = r.members.filter((m) => m.hp <= 1).length;
      if (r.members.length >= 2 && dying >= r.members.length - 1) s *= 0.8;
      return { key: r.key, members: r.members, strength: Math.round(Math.max(0, Math.min(100, s))) };
    });
  }

  /**
   * Điểm ưu tiên tấn công mục tiêu `t` (thang ~100, cao = nên đánh trước) — Điều 8, 9, 28–32.
   * `dmg`: hành động có gây sát thương không (để xét kết liễu / kỹ năng hưởng lợi khi bị đánh).
   */
  targetPriority(v: PlayerView, t: PublicPlayer, ctx: { myKey: FactionKey | null; allyP: number; dmg: boolean }): number {
    const facs = this.factions(v);
    const alive = v.players.filter((p) => p.alive);
    const me = v.players[v.me];
    const tk = keyOf(t);
    const fac = tk ? facs.find((f) => f.key === tk) : undefined;
    const enemyFacs = facs.filter((f) => f.key !== ctx.myKey).sort((a, b) => b.strength - a.strength);
    const lead = enemyFacs[0];
    const second = enemyFacs[1];

    // 1) Mức nguy hiểm của phe mục tiêu (25). Người chưa lộ: mức trung bình, giảm theo độ bất định.
    let danger = fac ? fac.strength : 35;
    // Điều 9: phe dẫn đầu vượt phe thứ hai ≥ 25 điểm -> tăng mạnh ưu tiên ngăn phe dẫn đầu
    if (fac && lead && fac.key === lead.key && second && lead.strength - second.strength >= 25) danger = Math.min(100, danger + 25);
    let score = 25 * danger / 100;

    // 2) Khả năng trực tiếp gây thất bại cho mình (20): tới được mình, nhiều bài, có vũ khí
    const reach = approxDistance(v, t.seat, v.me) <= attackRange(t);
    const threat = (reach ? 0.5 : 0.15) + Math.min(0.3, t.handCount * 0.06) + (t.equips.weapon ? 0.2 : 0);
    score += 20 * Math.min(1, threat) * (me.hp <= 2 ? 1.2 : 1);

    // 3) Giá trị vô hiệu hóa (20): kỹ năng đã lộ, bài, ký hiệu
    const skills = revealedSkillCount(t);
    score += 20 * Math.min(1, 0.25 * skills + 0.08 * t.handCount + (t.marks ? 0.1 * (t.marks.pair + (t.marks.ambition ?? 0)) : 0));

    // 4) Khả năng hạ gục / khống chế thành công (15): ít máu, ít bài, không giáp
    const armor = !!t.equips.armor;
    const kill = t.hp <= 1 ? 1 : t.hp === 2 ? 0.6 : 0.3;
    score += 15 * kill * (armor ? 0.7 : 1) * (t.handCount <= 1 ? 1 : 0.8);

    // 5) Nhân vật cốt lõi của phe (10): tỷ trọng đóng góp trong phe
    if (fac && fac.members.length > 1) {
      const share = (revealedSkillCount(t) + t.hp + t.handCount) / fac.members.reduce((n, m) => n + revealedSkillCount(m) + m.hp + m.handCount, 0);
      score += 10 * Math.min(1, share * fac.members.length * 0.6);
    } else if (fac) score += 6;

    // 6) Tài nguyên (5) và vị trí (5)
    score += 5 * Math.min(1, (Object.keys(t.equips).length + t.handCount) / 6);
    score += reach ? 5 : 2;

    // ---- Ngoại lệ ưu tiên cao ----
    // Điều 29: cơ hội thắng tức thời — hạ người này khiến chỉ còn phe mình
    if (ctx.dmg && t.hp <= 1 && ctx.myKey) {
      const rest = alive.filter((p) => p.seat !== t.seat);
      if (rest.every((p) => keyOf(p) === ctx.myKey || p.seat === v.me)) score += 100;
    }
    // Điều 28/36: phe (hoặc Dã tâm gia) có thể thắng ngay: còn đúng 1 người khác phe họ
    if (fac && fac.key !== ctx.myKey) {
      const others = alive.filter((p) => keyOf(p) !== fac.key);
      if (others.length <= 1) score += 40;
      if (fac.key.startsWith('c') && alive.length <= 4) score += 15; // Dã tâm gia cuối ván
    }
    // Cuối ván (Điều 27): tăng trọng số kết liễu
    if (alive.length <= 4 && ctx.dmg && t.hp <= 1) score += 15;

    // ---- Phạt ----
    // Điều 32: có thể là đồng đội chưa lộ
    score -= ctx.allyP * 60;
    // Điều 18/30: mục tiêu hưởng lợi khi bị sát thương (trừ khi kết liễu)
    if (ctx.dmg && t.hp > 1 && hasDamageBenefit(t)) score -= 12;
    // Điều 9: phe mình yếu nhất -> tránh đối đầu phe mạnh nhất (trừ khi phe đó đe dọa trực tiếp)
    const mineF = ctx.myKey ? facs.find((f) => f.key === ctx.myKey) : undefined;
    if (mineF && fac && lead && fac.key === lead.key && facs.every((f) => f.strength >= mineF.strength) && !reach) score -= 8;
    // Bị điệu hổ / không thể đánh
    if (t.lured) score -= 50;
    return score;
  }
}

/** Khóa phe nhìn thấy: thế lực, hoặc "c<người cầm đầu>" cho dã tâm gia. null = chưa lộ. */
export function keyOf(p: PublicPlayer): FactionKey | null {
  if (p.kingdom == null) return null;
  return p.kingdom === 'careerist' ? `c${p.careeristGroup ?? p.seat}` : p.kingdom;
}

function revealedSkillCount(p: PublicPlayer): number {
  let n = 0;
  for (const s of [p.generals?.main, p.generals?.deputy]) {
    if (!s?.revealed || s.removed || !s.generalId) continue;
    try { n += getGeneral(s.generalId).skills.length; } catch { /* tướng lạ */ }
  }
  return n;
}

function hasDamageBenefit(p: PublicPlayer): boolean {
  for (const s of [p.generals?.main, p.generals?.deputy]) {
    if (!s?.revealed || s.removed || !s.generalId) continue;
    try { if (getGeneral(s.generalId).skills.some((id) => DAMAGE_BENEFIT.has(id))) return true; } catch { /* */ }
  }
  return false;
}

function attackRange(p: PublicPlayer): number {
  const w = p.equips.weapon;
  return w ? CARD_INFO[w.name]?.range ?? 1 : 1;
}

/** Khoảng cách gần đúng từ `a` đến `b` theo vòng người còn sống (không tính người bị điệu hổ) + ngựa. */
export function approxDistance(v: PlayerView, a: number, b: number): number {
  const ring = v.players.filter((p) => p.alive && !p.lured).map((p) => p.seat);
  const ia = ring.indexOf(a);
  const ib = ring.indexOf(b);
  if (ia < 0 || ib < 0) return 99;
  const d = Math.abs(ia - ib);
  let dist = Math.min(d, ring.length - d);
  if (v.players[a].equips.offHorse) dist -= 1;
  if (v.players[b].equips.defHorse) dist += 1;
  return Math.max(1, dist);
}

/** Các yếu tố thô của một phe (Điều 4). */
function factors(v: PlayerView, members: PublicPlayer[]): Record<keyof typeof W, number> {
  const active = members.filter((m) => !m.faceDown && !m.lured && !m.judgeArea.some((c) => c.name === 'lebu'));
  let formation = 0;
  const ring = v.players.filter((p) => p.alive).map((p) => p.seat);
  const set = new Set(members.map((m) => m.seat));
  for (let i = 0; i < ring.length; i++) if (set.has(ring[i]) && set.has(ring[(i + 1) % ring.length]) && ring.length > 2) formation++;
  return {
    people: active.length + 0.5 * (members.length - active.length),
    skills: members.reduce((n, m) => n + revealedSkillCount(m), 0),
    hp: members.reduce((n, m) => n + m.hp, 0),
    hand: members.reduce((n, m) => n + m.handCount, 0),
    equip: members.reduce((n, m) => n + Object.keys(m.equips).length + (attackRange(m) - 1) * 0.5, 0),
    formation,
    control: members.reduce((n, m) => n + (m.equips.weapon ? 1 : 0) + (m.handCount >= 4 ? 1 : 0), 0),
    sustain: members.reduce((n, m) => n + m.maxHp, 0),
  };
}

/** Thế lực thật của mình (từ tướng của mình — mình được biết). */
export function realKingdomOf(v: PlayerView): Kingdom | null {
  const g = v.players?.[v.me]?.generals;
  if (!g?.main.generalId) return null;
  const km = getGeneral(g.main.generalId).kingdom;
  if (km === 'ye' && !g.main.revealed && g.deputy.generalId && !isDualGeneral(g.deputy.generalId)) return kingdomsOf(g.deputy.generalId)[0];
  return km === 'ye' ? null : km;
}
