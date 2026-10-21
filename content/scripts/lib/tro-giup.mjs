// ============================================================
// Hàm trợ giúp dùng chung cho các kỹ năng viết bằng JavaScript (gói tướng mới).
// File này không khai báo kỹ năng nào (export default rỗng) — chỉ để các file khác import.
// ============================================================

export default {};

export const name = (g, s) => g.player(s).name;
export const hand = (g, s) => g.player(s).hand;
export const isRed = (c) => c.suit === 'heart' || c.suit === 'diamond';
export const colorOf = (c) => (isRed(c) ? 'đỏ' : 'đen');
export const SLOTS = ['weapon', 'armor', 'defHorse', 'offHorse', 'treasure'];
export const SLOT_LABEL = { weapon: 'Vũ khí', armor: 'Giáp', defHorse: 'Ngựa +1', offHorse: 'Ngựa −1', treasure: 'Bảo vật' };
export const SUIT_LABEL = { spade: '♠ Bích', heart: '♥ Cơ', club: '♣ Chuồn', diamond: '♦ Rô' };

/** Nhãn lá bài, ví dụ "Sát ♠7". */
export const label = (g, id) => g.labelAs(g.card(id), g.card(id).name);

/** Hàm trợ giúp để viết trigger gọn: on('damaged', can, run, { compulsory }) */
export function on(event, can, run, extra = {}) {
  return { event, can, run, ...extra };
}

// ---------- Dữ liệu riêng của từng ván (không mất khi sang lượt mới) ----------
const STORE = new WeakMap();
export function store(g) {
  let s = STORE.get(g);
  if (!s) { s = {}; STORE.set(g, s); }
  return s;
}

/** Kỹ năng hạn định (mỗi ván 1 lần) của một ghế. */
export function limitedUsed(g, seat, id) {
  return !!store(g)[`limited:${id}:${seat}`];
}
export function markLimited(g, seat, id) {
  store(g)[`limited:${id}:${seat}`] = true;
}
export function resetLimited(g, seat, id) {
  delete store(g)[`limited:${id}:${seat}`];
}

/** Mỗi lượt (của bất kỳ ai) 1 lần: trả true nếu CHƯA dùng trong lượt hiện tại, và đánh dấu đã dùng. */
export function oncePerTurn(g, seat, id) {
  const k = `turn:${id}:${seat}`;
  const s = store(g);
  if (s[k] === g.state.turnCount) return false;
  s[k] = g.state.turnCount;
  return true;
}
export function usedThisTurn(g, seat, id) {
  return store(g)[`turn:${id}:${seat}`] === g.state.turnCount;
}

// ---------- Giới tính (cho Kết Nhân, Ly Gián...) ----------
/** Giới tính theo chủ tướng (danh sách tướng nữ nằm trong engine: FEMALE_GENERALS / "gender" trong JSON). */
export function isFemale(g, seat) {
  return g.isFemale(seat);
}

// ---------- Lá bài ----------

/** Tất cả lá trong khu vực của một người (tay + trang bị [+ phán định]). */
export function allCards(g, seat, includeJudge = false) {
  const p = g.player(seat);
  const eq = SLOTS.flatMap((s) => p.equips[s]);
  return [...p.hand, ...eq, ...(includeJudge ? p.judgeArea : [])];
}

/** Tìm vùng hiện tại của một lá thuộc `seat`. */
export function zoneOf(g, seat, id) {
  const p = g.player(seat);
  if (p.hand.includes(id)) return { kind: 'hand', seat };
  if (p.judgeArea.includes(id)) return { kind: 'judge', seat };
  if (p.special.includes(id)) return { kind: 'special', seat };
  for (const slot of SLOTS) if (p.equips[slot].includes(id)) return { kind: 'equip', seat, slot };
  return null;
}

/** `chooser` chọn 1 lá trong khu vực của `target`: trang bị/phán định chọn đích danh, bài trên tay lấy ngẫu nhiên. */
export async function pickCard(g, chooser, target, prompt, { hand: useHand = true, equip = true, judge = false } = {}) {
  const p = g.player(target);
  const opts = [];
  if (equip) for (const slot of SLOTS) {
    const id = p.equips[slot][0];
    if (id !== undefined) opts.push({ label: `${SLOT_LABEL[slot]}: ${label(g, id)}`, id, from: { kind: 'equip', seat: target, slot } });
  }
  if (useHand && p.hand.length) {
    opts.push({ label: `Bài trên tay (ngẫu nhiên, còn ${p.hand.length} lá)`, hand: true });
  }
  if (judge) for (const id of p.judgeArea) opts.push({ label: `Phán định: ${label(g, id)}`, id, from: { kind: 'judge', seat: target } });
  if (!opts.length) return null;
  const i = opts.length === 1 ? 0 : await g.choose(chooser, prompt, opts.map((o) => o.label));
  const o = opts[i];
  if (o.hand) return { id: p.hand[g.randomInt(p.hand.length)], from: { kind: 'hand', seat: target } };
  return { id: o.id, from: o.from };
}

/** Bỏ 1 lá của `target` do `chooser` chọn. */
export async function discardFrom(g, chooser, target, prompt = 'Chọn lá để bỏ', opts) {
  const pick = await pickCard(g, chooser, target, prompt, opts);
  if (!pick) return null;
  await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'skill');
  g.say(`${name(g, target)} mất ${label(g, pick.id)}.`);
  return pick.id;
}

/** Lấy 1 lá của `target` về tay `chooser`. */
export async function takeFrom(g, chooser, target, prompt = 'Chọn lá để lấy', opts) {
  const pick = await pickCard(g, chooser, target, prompt, opts);
  if (!pick) return null;
  await g.moveCards([pick.id], pick.from, { kind: 'hand', seat: chooser }, 'skill');
  g.say(`${name(g, chooser)} lấy 1 lá của ${name(g, target)}.`);
  return pick.id;
}

/** `seat` tự chọn `min`–`max` lá của chính mình (tay + trang bị nếu withEquip). */
export async function chooseOwn(g, seat, prompt, min, max, { withEquip = true, filter = () => true } = {}) {
  const ids = (withEquip ? allCards(g, seat) : [...hand(g, seat)]).filter((id) => filter(g.card(id)));
  if (ids.length < min) return null;
  if (!ids.length) return [];
  return g.chooseCards(seat, prompt, ids, min, Math.min(max, ids.length), true);
}

/** Bỏ các lá của chính mình (có thể gồm trang bị). */
export async function discardOwn(g, seat, ids, reason = 'skill') {
  for (const id of ids) {
    const z = zoneOf(g, seat, id);
    if (z) await g.moveCards([id], z, { kind: 'discard' }, reason);
  }
  if (ids.length) g.say(`${name(g, seat)} bỏ ${ids.map((id) => label(g, id)).join(', ')}.`);
}

/** Tặng các lá (tay hoặc trang bị) cho người khác. */
export async function give(g, from, to, ids, reason = 'give') {
  for (const id of ids) {
    const z = zoneOf(g, from, id);
    if (z) await g.moveCards([id], z, { kind: 'hand', seat: to }, reason);
  }
  if (ids.length) g.say(`${name(g, from)} giao ${ids.length} lá cho ${name(g, to)}.`);
}

/** Đặt một lá trang bị (đang ở `from`) vào khu vực trang bị của `seat`; lá cũ cùng ô vào chồng bỏ. */
export async function putEquip(g, id, from, seat) {
  const c = g.card(id);
  const slot = equipSlot(g, c);
  if (!slot) return false;
  const old = g.player(seat).equips[slot][0];
  if (old !== undefined) await g.moveCards([old], { kind: 'equip', seat, slot }, { kind: 'discard' }, 'replace');
  await g.moveCards([id], from, { kind: 'equip', seat, slot }, 'equip');
  g.say(`${label(g, id)} được đặt vào khu vực trang bị của ${name(g, seat)}.`);
  return true;
}

/** Ô trang bị của một lá (null nếu không phải trang bị). */
export function equipSlot(g, c) {
  return c.type === 'equip' ? g.cardInfo(c.name)?.slot ?? null : null;
}

/** Đặt một lá vào/ra khỏi đáy chồng bốc. */
export function moveToBottom(g, ids) {
  const pile = g.state.drawPile;
  for (const id of ids) {
    const i = pile.indexOf(id);
    if (i >= 0) { pile.splice(i, 1); pile.unshift(id); }
  }
}

/** Lật X lá trên cùng vào vùng xử lý (cho xem / chọn). */
export async function revealTop(g, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((await g.takeTop({ kind: 'processing' }, 'reveal')).id);
  g.say(`Lật ${n} lá: ${out.map((id) => label(g, id)).join(', ')}.`);
  return out;
}

/** Bỏ các lá còn trong vùng xử lý vào chồng bỏ. */
export async function clearProcessing(g, ids) {
  const left = ids.filter((id) => g.state.processing.includes(id));
  if (left.length) await g.moveCards(left, { kind: 'processing' }, { kind: 'discard' }, 'settle');
}

// ---------- Đấu điểm, quân lệnh, trận pháp: nằm trong engine (src/hegemony/mechanics.ts) ----------
/** Đấu điểm. Trả về { win, mine, theirs } hoặc null. */
export const pindian = (g, a, b, reason) => g.pindian(a, b, reason);
/** Rút 2 quân lệnh, người ra lệnh chọn 1. */
export const drawOrder = (g, issuer) => g.drawOrder(issuer);
/** Hỏi thực hiện quân lệnh. */
export const askOrder = (g, issuer, target, order) => g.askOrder(issuer, target, order);
export const neighbors = (g, seat) => g.neighbors(seat);
/** [người vây 1, người vây 2] hoặc null. */
export const besiegers = (g, target) => g.besiegers(target);
export const formation = (g, seat) => g.formation(seat);

/** Những người cùng thế lực (đã lộ) với `seat`, gồm cả `seat`. */
export function sameFactionSeats(g, seat) {
  return g.alivePlayers().map((p) => p.seat).filter((s) => s === seat || g.isSameFaction(s, seat));
}

/** Người khác (còn sống) có thể chọn làm mục tiêu kỹ năng. */
export function others(g, seat, pred = () => true) {
  return g.alivePlayers().map((p) => p.seat).filter((s) => s !== seat && g.canTarget(seat, s) && pred(s));
}

/** Đang ở giai đoạn ra bài của chính mình. */
export const inMyPlay = (g, seat) => g.state.currentSeat === seat && g.state.phase === 'play';

/** Ô ('main' | 'deputy') đang chứa tướng `generalId` của `seat`, hoặc null. */
export function slotOf(g, seat, generalId) {
  const h = g.hero(seat);
  return h.main.generalId === generalId ? 'main' : h.deputy.generalId === generalId ? 'deputy' : null;
}

/**
 * "Người quan sát": trigger không bao giờ kích hoạt, chỉ dùng hàm `fn` để ghi nhận sự kiện (đếm, nhớ lá bài...).
 * Được gọi cho mọi chủ kỹ năng còn sống, kể cả khi tướng đang úp.
 */
export function observe(event, fn) {
  return { event, can: (g, ctx, owner) => { fn(g, ctx, owner); return false; }, run: () => {}, observer: true };
}

/** Người có ít máu nhất / nhiều máu nhất (trong số còn sống). */
export const minHp = (g) => Math.min(...g.alivePlayers().map((p) => p.hp));
export const maxHp = (g) => Math.max(...g.alivePlayers().map((p) => p.hp));
export const lostHp = (g, s) => g.player(s).maxHp - g.player(s).hp;
export const isBasic = (c) => c.type === 'basic';
export const isEquip = (c) => c.type === 'equip';
