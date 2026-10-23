// ============================================================
// Cơ chế dùng chung cho nhiều kỹ năng Quốc Chiến:
//   - Đấu điểm (拼点)
//   - Quân lệnh (军令)
//   - Trận pháp: người kề bên, vây công (围攻), đội hình (队列)
// HegemonyGame gọi các hàm này qua g.pindian(), g.drawOrder(), g.askOrder(), g.besiegers()...
// để kỹ năng JSON và JavaScript đều dùng được.
// ============================================================
import { cardLabel } from '../core/cards.js';
import { EQUIP_SLOTS, type Card, type Zone } from '../core/types.js';
import type { HegemonyGame } from './game.js';

const nameOf = (g: HegemonyGame, s: number) => g.player(s).name;

// ------------------------------------------------------------ Đấu điểm

export interface PindianResult {
  /** Người phát động thắng (điểm lớn hơn hẳn). Hòa tính là không thắng. */
  win: boolean;
  mine: Card;
  theirs: Card;
}

/**
 * `a` đấu điểm với `b`: mỗi người chọn 1 lá trên tay, cùng lật, so điểm (A = 1 ... K = 13).
 * Hai lá vào chồng bỏ. Trả về null nếu một bên không có bài trên tay.
 */
export async function pindian(g: HegemonyGame, a: number, b: number, reason: string): Promise<PindianResult | null> {
  const ha = g.player(a).hand, hb = g.player(b).hand;
  if (!ha.length || !hb.length || a === b) return null;
  const [ia] = await g.chooseCards(a, `${reason}: chọn 1 lá để đấu điểm với ${nameOf(g, b)}`, [...ha], 1, 1);
  let [ib] = await g.chooseCards(b, `${reason}: ${nameOf(g, a)} đấu điểm với bạn — chọn 1 lá`, [...hb], 1, 1);
  await g.moveCards([ia], { kind: 'hand', seat: a }, { kind: 'processing' }, 'pindian');
  // Kỹ năng phản ứng khi `a` mất lá (Tử Gián...) có thể đã lấy mất lá `b` vừa chọn: lấy lá khác, hết bài thì hủy đấu điểm
  if (!hb.includes(ib)) {
    if (!hb.length) {
      if (g.state.processing.includes(ia)) await g.moveCards([ia], { kind: 'processing' }, { kind: 'discard' }, 'pindian');
      return null;
    }
    ib = hb[g.randomInt(hb.length)];
  }
  await g.moveCards([ib], { kind: 'hand', seat: b }, { kind: 'processing' }, 'pindian');
  const mine = g.card(ia), theirs = g.card(ib);
  // Ưng Dương: điểm lá đấu điểm có thể được cộng/trừ (giới hạn A..K)
  const clamp = (n: number) => Math.max(1, Math.min(13, n));
  const ra = clamp(mine.rank + await g.pindianBonus(a, mine));
  const rb = clamp(theirs.rank + await g.pindianBonus(b, theirs));
  const win = ra > rb;
  g.say(`Đấu điểm: ${nameOf(g, a)} ${cardLabel(mine)}${ra !== mine.rank ? ` (tính là ${ra})` : ''} — ${nameOf(g, b)} ${cardLabel(theirs)}${rb !== theirs.rank ? ` (tính là ${rb})` : ''}. `
    + (win ? `${nameOf(g, a)} thắng.` : `${nameOf(g, a)} không thắng.`));
  const left = [ia, ib].filter((id) => g.state.processing.includes(id));
  if (left.length) await g.moveCards(left, { kind: 'processing' }, { kind: 'discard' }, 'pindian');
  return { win, mine, theirs };
}

// ------------------------------------------------------------ Quân lệnh

export const ORDERS = [
  'Quân lệnh 1: người ra lệnh chọn 1 người, bạn gây 1 sát thương cho người đó',
  'Quân lệnh 2: bạn bốc 1 lá, rồi giao 2 lá cho người ra lệnh',
  'Quân lệnh 3: bạn mất 1 máu',
  'Quân lệnh 4: lượt này bạn không thể dùng hoặc đánh bài trên tay',
  'Quân lệnh 5: bạn bị lật úp (bỏ qua lượt kế tiếp)',
  'Quân lệnh 6: bạn giữ 1 lá trên tay và 1 trang bị, bỏ hết các lá còn lại',
];

/** Người ra lệnh rút ngẫu nhiên 2 quân lệnh và chọn 1. Trả về số thứ tự 0..5. */
export async function drawOrder(g: HegemonyGame, issuer: number): Promise<number> {
  const a = g.randomInt(6);
  let b = g.randomInt(5);
  if (b >= a) b++;
  const i = await g.choose(issuer, 'Chọn quân lệnh', [ORDERS[a], ORDERS[b]]);
  return i === 0 ? a : b;
}

function zoneOfOwn(g: HegemonyGame, seat: number, id: number): Zone | null {
  const p = g.player(seat);
  if (p.hand.includes(id)) return { kind: 'hand', seat };
  for (const slot of EQUIP_SLOTS) if (p.equips[slot].includes(id)) return { kind: 'equip', seat, slot };
  return null;
}

/**
 * Trúc Khoa (Lý Nghiêm, chủ tướng kỹ): sau khi chọn chấp hành quân lệnh, có thể chọn lại quân lệnh để chấp hành.
 * Trả về quân lệnh sẽ chấp hành (0..5).
 */
export async function reselectOrder(g: HegemonyGame, target: number, order: number): Promise<number> {
  const zk = g.skillEntries(target).find((e) => e.skill.id === 'zhuke');
  if (!zk || !g.player(target).alive) return order;
  if (!zk.slot.revealed && !g.canReveal(target)) return order;
  const go = await g.choose(target, `Trúc Khoa${zk.slot.revealed ? '' : ' (lật tướng)'}: chọn lại quân lệnh? (rút ngẫu nhiên 2 quân lệnh mới, chọn 1 để chấp hành)`,
    [`Giữ: ${ORDERS[order]}`, 'Rút 2 quân lệnh mới']);
  if (go !== 1) return order;
  if (!zk.slot.revealed) await g.reveal(target, zk.which);
  // Rút ngẫu nhiên 2 quân lệnh (khác nhau) trong cả 6 — có thể trùng quân lệnh đang có — rồi chọn 1
  const pool = [0, 1, 2, 3, 4, 5];
  const a = pool.splice(g.randomInt(pool.length), 1)[0];
  const b = pool[g.randomInt(pool.length)];
  const i = await g.choose(target, 'Trúc Khoa: chọn 1 trong 2 quân lệnh để chấp hành', [ORDERS[a], ORDERS[b]]);
  const next = i === 1 ? b : a;
  g.say(`${nameOf(g, target)} dùng Trúc Khoa, rút lại 2 quân lệnh và chọn: ${ORDERS[next]}.`);
  return next;
}

/** Hỏi `target` có thực hiện quân lệnh không; thực hiện nếu đồng ý. Trả về true nếu đã thực hiện. */
export async function askOrder(g: HegemonyGame, issuer: number, target: number, order: number): Promise<boolean> {
  if (!g.player(target).alive) return false;
  const yes = await g.choose(target, `${nameOf(g, issuer)} ban quân lệnh — ${ORDERS[order]}. Bạn có thực hiện không?`, ['Thực hiện', 'Không thực hiện']);
  if (yes !== 0) { g.say(`${nameOf(g, target)} không thực hiện quân lệnh.`); return false; }
  order = await reselectOrder(g, target, order);
  g.say(`${nameOf(g, target)} thực hiện quân lệnh.`);
  const p = g.player(target);
  const own = () => [...p.hand, ...EQUIP_SLOTS.flatMap((s) => p.equips[s])];
  switch (order) {
    case 0: {
      const [t] = await g.chooseTargets(issuer, 'Quân lệnh: chọn người chịu 1 sát thương', g.alivePlayers().map((q) => q.seat), 1, 1, 'enemy');
      if (t !== undefined) await g.damage({ source: target, target: t, amount: 1, card: null, cancelled: false });
      break;
    }
    case 1: {
      await g.draw(target, 1);
      if (target === issuer) break;
      const k = Math.min(2, own().length);
      const ids = k ? await g.chooseCards(target, `Quân lệnh: giao ${k} lá cho ${nameOf(g, issuer)}`, own(), k, k, true) : [];
      for (const id of ids) {
        const z = zoneOfOwn(g, target, id);
        if (z) await g.moveCards([id], z, { kind: 'hand', seat: issuer }, 'order');
      }
      break;
    }
    case 2: await g.loseHp(target, 1); break;
    case 3: p.flags.turn_banHand = 1; break;
    case 4: g.turnOver(target); break;
    case 5: {
      const keepH = p.hand.length ? await g.chooseCards(target, 'Quân lệnh: giữ lại 1 lá trên tay', [...p.hand], 1, 1) : [];
      const eqs = EQUIP_SLOTS.flatMap((s) => p.equips[s]);
      const keepE = eqs.length ? await g.chooseCards(target, 'Quân lệnh: giữ lại 1 trang bị', eqs, 1, 1, true) : [];
      for (const id of own().filter((x) => !keepH.includes(x) && !keepE.includes(x))) {
        const z = zoneOfOwn(g, target, id);
        if (z) await g.moveCards([id], z, { kind: 'discard' }, 'order');
      }
      break;
    }
  }
  return true;
}

// ------------------------------------------------------------ Trận pháp

/**
 * Vòng ghế dùng cho trận pháp: người còn sống, KHÔNG tính người đang bị Điệu Hổ Ly Sơn
 * (họ tạm rời bàn trong lượt: không có hàng xóm, không thuộc đội hình, không vây/bị vây).
 */
export function tableRing(g: HegemonyGame): number[] {
  return g.alivePlayers().map((p) => p.seat).filter((s) => !g.isLured(s));
}

/** Người kế tiếp `seat` theo chiều lượt trên vòng ghế (bỏ qua người bị Điệu Hổ). */
export function nextOnTable(g: HegemonyGame, seat: number): number | null {
  const n = g.state.players.length;
  for (let k = 1; k < n; k++) {
    const s = (seat + k) % n;
    if (g.player(s).alive && !g.isLured(s)) return s;
  }
  return null;
}

/** Hai người kề bên còn sống của `seat`: [trước, sau]. Bàn dưới 3 người thì không có. */
export function neighbors(g: HegemonyGame, seat: number): number[] {
  const ring = tableRing(g);
  const i = ring.indexOf(seat);
  if (i < 0 || ring.length < 3) return [];
  return [ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length]];
}

/**
 * Vây công (围攻): `target` bị kẹp giữa hai người cùng thế lực (đã lộ) và khác thế lực với `target`.
 * Trả về [người vây 1, người vây 2] hoặc null.
 */
export function besiegers(g: HegemonyGame, target: number): [number, number] | null {
  const nb = neighbors(g, target);
  if (nb.length !== 2) return null;
  const [a, b] = nb;
  if (a === b || !g.isSameFaction(a, b) || !g.isDifferentFaction(a, target)) return null;
  return [a, b];
}

/** Đội hình (队列): các người ngồi liền nhau cùng thế lực với `seat` (gồm cả `seat`). */
export function formation(g: HegemonyGame, seat: number): number[] {
  const ring = tableRing(g);
  const out = new Set([seat]);
  if (g.shownKingdom(seat) === null || !ring.includes(seat)) return [...out];
  const n = ring.length, i = ring.indexOf(seat);
  for (const dir of [1, -1]) {
    for (let k = 1; k < n; k++) {
      const s = ring[(((i + dir * k) % n) + n) % n];
      if (s === seat || !g.isSameFaction(s, seat)) break;
      out.add(s);
    }
  }
  return [...out];
}
