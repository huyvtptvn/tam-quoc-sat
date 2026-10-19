// ============================================================
// Cẩm nang và cẩm nang trì hoãn.
// Mỗi lá được khai báo: cách chọn mục tiêu + hiệu ứng lên từng mục tiêu.
// Engine lo phần chung: kiểm tra hợp lệ, hỏi Vô Giải Khả Kích cho từng mục tiêu, thứ tự xử lý.
// ============================================================
import { CARD_INFO, cardLabel, EQUIP_SLOT_LABEL } from './cards.js';
import type { Game, TargetSpec } from './game.js';
import type { Card, CardName, EquipSlot, Zone } from './types.js';

/**
 * Cách xác định mục tiêu:
 * - 'self': chỉ bản thân (Vô Trung Sinh Hữu)
 * - 'one': chọn từ min đến max người hợp lệ (Quyết Đấu, Thiết Tác...)
 * - 'allOthers': mọi người khác, bắt đầu từ người kế tiếp (Nam Man, Vạn Tiễn)
 * - 'all': mọi người, bắt đầu từ bản thân (Đào Viên)
 * - 'custom': do `autoTargets` quyết định (Dĩ Dật Đãi Lao)
 */
export type Targeting = 'self' | 'one' | 'allOthers' | 'all' | 'custom';

export interface TrickDef {
  name: CardName;
  targeting: Targeting;
  min?: number;
  max?: number;
  /** Cho phép trùng chú: dùng với 0 mục tiêu nghĩa là bỏ lá này để bốc 1 lá. */
  recast?: boolean;
  /** Có hại cho mục tiêu không (bot dùng để quyết định có Vô Giải hay không). */
  harmful: boolean;
  validTarget?: (g: Game, user: number, t: number, card: Card) => boolean;
  autoTargets?: (g: Game, user: number) => number[];
  /** Điều kiện dùng thêm (trả lỗi hoặc null). */
  canUse?: (g: Game, user: number) => string | null;
  effect: (g: Game, user: number, target: number, card: Card) => Promise<void>;
  /**
   * Với targeting 'one': từ người được chọn suy ra toàn bộ mục tiêu thật
   * (Lục Lực Đồng Tâm: mọi người cùng đại/tiểu thế lực; Liên Quân Thịnh Yến: bạn + cả thế lực đó).
   */
  expandTargets?: (g: Game, user: number, chosen: number[]) => number[];
  /** Chạy một lần trước khi xử lý các mục tiêu (Ngũ Cốc: lật bài ra giữa bàn). */
  before?: (g: Game, user: number, targets: number[], card: Card) => Promise<void>;
  /** Chạy một lần sau cùng, kể cả khi bị ngắt giữa chừng (Ngũ Cốc: bỏ các lá còn thừa). */
  after?: (g: Game, user: number, card: Card) => Promise<void>;
}

/** Cẩm nang trì hoãn: đặt vào khu vực phán định, xử lý ở giai đoạn phán định. */
export interface DelayedDef {
  name: CardName;
  harmful: true;
  /** Mục tiêu hợp lệ khi đặt (Thiểm Điện luôn là bản thân). */
  validTarget: (g: Game, user: number, t: number) => boolean;
  /** Kết quả phán định có "trúng" không. */
  hits: (judge: Card, g: Game, seat: number) => boolean;
  onHit: (g: Game, seat: number, card: Card) => Promise<void>;
}

const name = (g: Game, seat: number) => g.player(seat).name;

/** Những người `a` có thể dùng Sát vào (trong tầm đánh) — mục tiêu B của Tá Đao Sát Nhân. */
function jiedaoVictims(g: Game, a: number): number[] {
  return g.alivePlayers().map((p) => p.seat)
    .filter((b) => b !== a && g.canTarget(a, b) && g.canBeSlashTarget(a, b) && g.distance(a, b) <= g.attackRange(a));
}

/** Các lá Ngũ Cốc đang lật (dạng ngăn xếp phòng trường hợp lồng nhau). */
const WUGU = new WeakMap<Game, number[][]>();
function wuguPools(g: Game): number[][] {
  let s = WUGU.get(g);
  if (!s) WUGU.set(g, (s = []));
  return s;
}
const others = (g: Game, user: number) => g.aliveSeatsFrom(user).filter((s) => s !== user);

// ============================================================
// Lấy 1 lá của người khác (Quá Hà Sách Kiều, Thuận Thủ, Hàn Băng Kiếm)
// ============================================================

/**
 * `chooser` chọn 1 lá của `target`: trang bị và phán định là bài ngửa (chọn đích danh),
 * bài trên tay thì lấy ngẫu nhiên. Thứ tự lựa chọn: trang bị -> trên tay -> phán định.
 */
export async function pickCardFrom(
  g: Game, chooser: number, target: number, includeJudge: boolean, prompt: string,
): Promise<{ id: number; from: Zone } | null> {
  // Văn Ngụy: người bị chọn bài có thể tự chọn lá của mình
  if (chooser !== target) {
    const own = await g.redirectPick(chooser, target, includeJudge);
    if (own) return own;
  }
  const p = g.player(target);
  const opts: { label: string; pick: () => { id: number; from: Zone } }[] = [];
  const locked = g.equipProtected(chooser, target); // Phong Dương: không được lấy/bỏ trang bị
  for (const slot of ['armor', 'weapon', 'offHorse', 'defHorse', 'treasure'] as EquipSlot[]) {
    const id = p.equips[slot][0];
    if (id !== undefined && !locked) {
      opts.push({ label: `${EQUIP_SLOT_LABEL[slot]}: ${cardLabel(g.card(id))}`, pick: () => ({ id, from: { kind: 'equip', seat: target, slot } }) });
    }
  }
  if (p.hand.length > 0) {
    opts.push({
      label: `Bài trên tay (ngẫu nhiên, còn ${p.hand.length} lá)`,
      pick: () => ({ id: p.hand[g.randomInt(p.hand.length)], from: { kind: 'hand', seat: target } }),
    });
  }
  if (includeJudge) {
    for (const id of p.judgeArea) {
      opts.push({ label: `Phán định: ${cardLabel(g.card(id))}`, pick: () => ({ id, from: { kind: 'judge', seat: target } }) });
    }
  }
  if (opts.length === 0) return null;
  const i = opts.length === 1 ? 0 : await g.choose(chooser, prompt, opts.map((o) => o.label));
  return opts[i].pick();
}

// ============================================================
// Định nghĩa cẩm nang
// ============================================================

export const TRICK_DEFS: Partial<Record<CardName, TrickDef>> = {
  wuzhong: {
    name: 'wuzhong', targeting: 'self', harmful: false,
    effect: async (g, _user, t) => { await g.draw(t, 2); },
  },

  juedou: {
    name: 'juedou', targeting: 'one', min: 1, max: 1, harmful: true,
    validTarget: (g, user, t) => t !== user && g.canBeSlashTarget(user, t),
    effect: async (g, user, target, card) => {
      // Hai bên lần lượt đánh Sát, bắt đầu từ mục tiêu; ai không đánh được thì chịu 1 sát thương từ người kia
      const ctx = await g.bus.emit('duelStarted', { user, target, card, need: { [user]: 1, [target]: 1 } });
      let cur = target;
      let other = user;
      for (let round = 0; round < 100; round++) {
        if (!g.player(cur).alive || !g.player(other).alive) return;
        const need = ctx.need[cur] ?? 1;
        for (let k = 0; k < need; k++) {
          const left = need - k;
          const played = await g.requestResponse(cur, ['sha'],
            `Quyết Đấu với ${name(g, other)}: đánh Sát${need > 1 ? ` (cần thêm ${left})` : ''}`, other, { kind: 'duel', opponent: other });
          if (!played) {
            await g.damage({ source: other, target: cur, amount: 1, card, cardAs: 'juedou', cancelled: false });
            return;
          }
        }
        [cur, other] = [other, cur];
      }
    },
  },

  nanman: {
    name: 'nanman', targeting: 'allOthers', harmful: true,
    effect: async (g, user, t, card) => {
      if (g.armorOf(t) === 'tengjia') { g.say(`Đằng Giáp: Nam Man không có hiệu lực với ${name(g, t)}.`); return; }
      const played = await g.requestResponse(t, ['sha'], `${name(g, user)} dùng Nam Man Nhập Xâm: đánh Sát hoặc chịu 1 sát thương`,
        user, { kind: 'aoe', trick: 'nanman', user });
      if (!played) await g.damage({ source: user, target: t, amount: 1, card, cardAs: 'nanman', cancelled: false });
    },
  },

  wanjian: {
    name: 'wanjian', targeting: 'allOthers', harmful: true,
    effect: async (g, user, t, card) => {
      if (g.armorOf(t) === 'tengjia') { g.say(`Đằng Giáp: Vạn Tiễn không có hiệu lực với ${name(g, t)}.`); return; }
      const played = await g.requestResponse(t, ['shan'], `${name(g, user)} dùng Vạn Tiễn Tề Phát: đánh Thiểm hoặc chịu 1 sát thương`,
        user, { kind: 'aoe', trick: 'wanjian', user });
      if (!played) await g.damage({ source: user, target: t, amount: 1, card, cardAs: 'wanjian', cancelled: false });
    },
  },

  taoyuan: {
    name: 'taoyuan', targeting: 'all', harmful: false,
    effect: async (g, user, t) => { await g.recover(t, 1, user); },
  },

  guohe: {
    name: 'guohe', targeting: 'one', min: 1, max: 1, harmful: true,
    validTarget: (g, user, t) => t !== user && g.cardCount(t, true) > 0,
    effect: async (g, user, t) => {
      const pick = await pickCardFrom(g, user, t, true, `Quá Hà Sách Kiều: chọn lá của ${name(g, t)} để bỏ`);
      if (!pick) return;
      await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'guohe');
      g.say(`${name(g, t)} mất ${cardLabel(g.card(pick.id))}.`);
    },
  },

  shunshou: {
    name: 'shunshou', targeting: 'one', min: 1, max: 1, harmful: true,
    validTarget: (g, user, t) => t !== user && (g.distance(user, t) <= 1 || g.trickNoDistance(user)) && g.cardCount(t, true) > 0,
    effect: async (g, user, t) => {
      const pick = await pickCardFrom(g, user, t, true, `Thuận Thủ Khiên Dương: chọn lá của ${name(g, t)} để lấy`);
      if (!pick) return;
      await g.moveCards([pick.id], pick.from, { kind: 'hand', seat: user }, 'shunshou');
      g.say(`${name(g, user)} lấy 1 lá của ${name(g, t)}.`);
    },
  },

  huogong: {
    name: 'huogong', targeting: 'one', min: 1, max: 1, harmful: true,
    validTarget: (g, _user, t) => g.player(t).hand.length > 0,
    effect: async (g, user, t, card) => {
      // Mục tiêu cho xem 1 lá; người dùng bỏ 1 lá cùng chất để gây 1 sát thương hỏa
      const tp = g.player(t);
      if (tp.hand.length === 0) return;
      const [shownId] = await g.chooseCards(t, `Hỏa Công của ${name(g, user)}: chọn 1 lá trên tay để cho xem`, [...tp.hand], 1, 1);
      const shown = g.card(shownId);
      g.say(`${name(g, t)} cho xem ${cardLabel(shown)}.`);
      const same = g.player(user).hand.filter((id) => id !== shownId && g.card(id).suit === shown.suit);
      if (same.length === 0) { g.say(`${name(g, user)} không có lá cùng chất.`); return; }
      const [disc] = await g.chooseCards(user, `Hỏa Công: bỏ 1 lá cùng chất để gây 1 sát thương hỏa cho ${name(g, t)}?`, same, 0, 1);
      if (disc === undefined) return;
      await g.moveCards([disc], { kind: 'hand', seat: user }, { kind: 'discard' }, 'huogong');
      await g.damage({ source: user, target: t, amount: 1, card, cardAs: 'huogong', nature: 'fire', cancelled: false });
    },
  },

  // Tá Đao Sát Nhân: chọn người có vũ khí (A) rồi chọn người A sẽ Sát (B, trong tầm đánh của A).
  // A phải dùng Sát vào B, nếu không thì giao vũ khí cho người dùng lá này.
  jiedao: {
    name: 'jiedao', targeting: 'one', min: 1, max: 1, harmful: true,
    validTarget: (g, user, t) => t !== user && !!g.equipOf(t, 'weapon') && jiedaoVictims(g, t).length > 0,
    effect: async (g, user, a) => {
      const victims = jiedaoVictims(g, a);
      if (!g.equipOf(a, 'weapon')) return;
      const [b] = victims.length
        ? await g.chooseTargets(user, `Tá Đao Sát Nhân: chọn người để ${name(g, a)} phải dùng Sát vào`, victims, 1, 1, 'enemy')
        : [];
      if (b !== undefined) {
        const picked = await g.pickResponse(a, ['sha'], `${name(g, user)} dùng Tá Đao Sát Nhân: dùng Sát vào ${name(g, b)}, nếu không phải giao vũ khí`,
          user, { kind: 'extraSlash', target: b });
        if (picked) { await g.slashOutOfTurn(a, b, picked.card, picked.as); return; }
      }
      const w = g.player(a).equips.weapon[0];
      if (w === undefined || !g.player(user).alive) return;
      await g.moveCards([w], { kind: 'equip', seat: a, slot: 'weapon' }, { kind: 'hand', seat: user }, 'jiedao');
      g.say(`${name(g, a)} không Sát, giao ${cardLabel(g.card(w))} cho ${name(g, user)}.`);
    },
  },

  // Ngũ Cốc Phong Đăng: lật số lá bằng số mục tiêu, mỗi người (bắt đầu từ người dùng) lấy 1 lá.
  wugu: {
    name: 'wugu', targeting: 'all', harmful: false,
    before: async (g, _user, targets) => {
      const ids: number[] = [];
      for (let i = 0; i < targets.length; i++) ids.push((await g.takeTop({ kind: 'processing' }, 'wugu')).id);
      wuguPools(g).push(ids);
      g.say(`Ngũ Cốc Phong Đăng lật: ${ids.map((id) => cardLabel(g.card(id))).join(', ')}.`);
    },
    effect: async (g, _user, t) => {
      const stack = wuguPools(g);
      const pool = stack[stack.length - 1]?.filter((id) => g.state.processing.includes(id)) ?? [];
      if (!pool.length) return;
      const [id] = await g.chooseCards(t, 'Ngũ Cốc Phong Đăng: chọn 1 lá', pool, 1, 1, true);
      await g.moveCards([id], { kind: 'processing' }, { kind: 'hand', seat: t }, 'wugu');
      g.say(`${name(g, t)} lấy ${cardLabel(g.card(id))}.`);
    },
    after: async (g) => {
      const ids = wuguPools(g).pop() ?? [];
      const left = ids.filter((id) => g.state.processing.includes(id));
      if (left.length) await g.moveCards(left, { kind: 'processing' }, { kind: 'discard' }, 'wugu');
    },
  },

  // Thủy Yêm Thất Quân: dùng với một người khác ĐANG CÓ trang bị. Họ chọn: bỏ hết trang bị, hoặc chịu 1 sát thương lôi.
  shuiyan: {
    name: 'shuiyan', targeting: 'one', min: 1, max: 1, harmful: true,
    validTarget: (g, user, t) => t !== user && g.equipCount(t) > 0,
    effect: async (g, user, t, card) => {
      const p = g.player(t);
      const eqs = (['weapon', 'armor', 'defHorse', 'offHorse', 'treasure'] as EquipSlot[])
        .flatMap((slot) => p.equips[slot].map((id) => ({ id, slot })));
      const i = eqs.length === 0 ? 1
        : await g.choose(t, `Thủy Yêm Thất Quân của ${name(g, user)}`, [`Bỏ hết ${eqs.length} trang bị`, 'Chịu 1 sát thương lôi']);
      if (i === 0) {
        for (const e of eqs) {
          if (p.equips[e.slot].includes(e.id)) await g.moveCards([e.id], { kind: 'equip', seat: t, slot: e.slot }, { kind: 'discard' }, 'shuiyan');
        }
        g.say(`${name(g, t)} bỏ hết trang bị.`);
        return;
      }
      await g.damage({ source: g.player(user).alive ? user : null, target: t, amount: 1, card, cardAs: 'shuiyan', nature: 'thunder', cancelled: false });
    },
  },

  tiesuo: {
    name: 'tiesuo', targeting: 'one', min: 1, max: 2, recast: true, harmful: true,
    validTarget: (g, _user, t) => g.isAliveSeat(t),
    effect: async (g, _user, t) => {
      const p = g.player(t);
      p.chained = !p.chained;
      g.say(p.chained ? `${p.name} bị xích.` : `${p.name} được gỡ xích.`);
    },
  },
};

export const DELAYED_DEFS: Partial<Record<CardName, DelayedDef>> = {
  lebu: {
    name: 'lebu', harmful: true,
    validTarget: (g, user, t) => t !== user,
    hits: (j) => j.suit !== 'heart',
    onHit: async (g, seat) => {
      g.player(seat).flags.skipPlay = 1;
      g.say(`Lạc Bất Tư Thục có hiệu lực: ${name(g, seat)} sẽ bỏ qua giai đoạn ra bài.`);
    },
  },
  bingliang: {
    name: 'bingliang', harmful: true,
    validTarget: (g, user, t) => t !== user && (g.distance(user, t) <= 1 || g.trickNoDistance(user)),
    hits: (j) => j.suit !== 'club',
    onHit: async (g, seat) => {
      g.player(seat).flags.skipDraw = 1;
      g.say(`Binh Lương Thốn Đoạn có hiệu lực: ${name(g, seat)} sẽ bỏ qua giai đoạn bốc bài.`);
    },
  },
  shandian: {
    name: 'shandian', harmful: true,
    validTarget: (_g, user, t) => t === user,
    hits: (j) => j.suit === 'spade' && j.rank >= 2 && j.rank <= 9,
    onHit: async (g, seat, card) => {
      g.say(`Thiểm Điện đánh trúng ${name(g, seat)}!`);
      await g.damage({ source: null, target: seat, amount: 3, card, cardAs: 'shandian', nature: 'thunder', cancelled: false });
    },
  },
};

/** Thêm một cẩm nang mới (ví dụ các lá riêng của Quốc Chiến). */
export function registerTrick(def: TrickDef): void {
  TRICK_DEFS[def.name] = def;
}

// ============================================================
// Mục tiêu và kiểm tra hợp lệ
// ============================================================

/** Danh sách mục tiêu tự động cho các lá không cần chọn. */
function autoTargets(g: Game, def: TrickDef, user: number): number[] {
  switch (def.targeting) {
    case 'self': return [user];
    case 'allOthers': return others(g, user);
    case 'all': return g.aliveSeatsFrom(user);
    case 'custom': return def.autoTargets!(g, user);
    default: return [];
  }
}

export function trickTargetSpec(g: Game, seat: number, card: Card, cardName: CardName): TargetSpec {
  const delayed = DELAYED_DEFS[cardName];
  if (delayed) {
    if (cardName === 'shandian') return { needsTarget: false, candidates: [], min: 0, max: 0 };
    const candidates = g.alivePlayers().map((p) => p.seat).filter((t) => checkTrickUse(g, seat, card, cardName, [t]) === null);
    return { needsTarget: true, candidates, min: 1, max: 1 };
  }
  const def = TRICK_DEFS[cardName];
  if (!def || def.targeting !== 'one') return { needsTarget: false, candidates: [], min: 0, max: 0 };
  const candidates = g.alivePlayers().map((p) => p.seat).filter((t) => checkTrickUse(g, seat, card, cardName, [t]) === null);
  return { needsTarget: true, candidates, min: def.recast ? 0 : def.min ?? 1, max: def.max ?? 1 };
}

export function checkTrickUse(g: Game, seat: number, card: Card, cardName: CardName, targets: number[]): string | null {
  const label = CARD_INFO[cardName].label;

  const delayed = DELAYED_DEFS[cardName];
  if (delayed) {
    const t = cardName === 'shandian' ? seat : targets[0];
    if (cardName === 'shandian' ? targets.length > 1 || (targets.length === 1 && targets[0] !== seat) : targets.length !== 1) {
      return cardName === 'shandian' ? 'Thiểm Điện đặt vào khu vực của chính bạn' : `${label} cần đúng 1 mục tiêu`;
    }
    if (!g.isAliveSeat(t) || !delayed.validTarget(g, seat, t)) return 'Mục tiêu không hợp lệ';
    if (t !== seat && !g.canTarget(seat, t)) return 'Không thể chọn mục tiêu này';
    if (g.player(t).judgeArea.some((id) => g.delayedName(id) === cardName)) return `Mục tiêu đã có ${label}`;
    return null;
  }

  const def = TRICK_DEFS[cardName];
  if (!def) return `${label} chỉ dùng để đáp lại`;
  const extra = def.canUse?.(g, seat);
  if (extra) return extra;

  if (def.targeting !== 'one') {
    if (targets.length > 0) return `${label} không cần chọn mục tiêu`;
    const auto = autoTargets(g, def, seat);
    if (auto.length === 0) return 'Không có mục tiêu hợp lệ';
    if (auto.some((t) => t !== seat && !g.canTarget(seat, t))) return 'Không thể chọn mục tiêu này';
    return null;
  }

  if (targets.length === 0 && def.recast) return null; // trùng chú
  const min = def.min ?? 1;
  const max = def.max ?? 1;
  if (targets.length < min || targets.length > max) return min === max ? `${label} cần đúng ${min} mục tiêu` : `${label} cần ${min}–${max} mục tiêu`;
  for (const t of targets) {
    if (!g.isAliveSeat(t) || !def.validTarget?.(g, seat, t, card)) return 'Mục tiêu không hợp lệ';
    if (t !== seat && !g.canTarget(seat, t)) return 'Không thể chọn mục tiêu này';
  }
  return null;
}

// ============================================================
// Vô Giải Khả Kích
// ============================================================

/**
 * Hỏi Vô Giải cho một mục tiêu. Mỗi lá Vô Giải đánh ra đảo trạng thái "bị chặn";
 * sau mỗi lá, mọi người lại được hỏi (để Vô Giải chặn Vô Giải), đến khi không ai đánh nữa.
 * Trả về: có bị chặn không, và nhóm người được chặn luôn (Vô Giải·Quốc chặn cho cả thế lực).
 */
export async function askNullify(
  g: Game, trick: CardName, user: number, target: number,
): Promise<{ cancelled: boolean; group: number[] }> {
  let cancelled = false;
  let national = false;
  let lastResponder: number | null = null;
  const label = CARD_INFO[trick].label;
  for (let round = 0; round < 50; round++) {
    let played: Card | null = null;
    for (const seat of g.aliveSeatsFrom(g.state.currentSeat)) {
      // Chỉ hỏi người đang có lá Vô Giải (đỡ phải hỏi cả bàn mỗi lần)
      if (!g.player(seat).hand.some((id) => g.cardCountsAs(seat, g.card(id)).includes('wuxie'))) continue;
      const prompt = cancelled
        ? `${label} lên ${name(g, target)} đang bị Vô Giải chặn. Dùng Vô Giải để hóa giải?`
        : `Dùng Vô Giải chặn ${label} lên ${name(g, target)}?`;
      played = await g.requestResponse(seat, ['wuxie'], prompt, user,
        { kind: 'nullify', trick, user, target, cancelled });
      if (played) { lastResponder = seat; break; }
    }
    if (!played) break;
    cancelled = !cancelled;
    if (lastResponder !== null) g.stat({ kind: 'nullified', by: lastResponder, user, target, trick, cancelled });
    // Vô Giải·Quốc: chọn chặn cho riêng mục tiêu hay cả thế lực của mục tiêu
    national = false;
    if (cancelled && played.name === 'wuxie_guo' && g.factionGroup(target).length > 1) {
      national = (await g.choose(lastResponder ?? g.state.currentSeat, 'Vô Giải Khả Kích·Quốc: chặn cho ai?', ['Toàn bộ thế lực của mục tiêu', 'Chỉ mục tiêu'])) === 0;
    }
  }
  return { cancelled, group: cancelled ? (national ? g.factionGroup(target) : [target]) : [] };
}

// ============================================================
// Xử lý cẩm nang
// ============================================================

export async function resolveTrick(g: Game, user: number, card: Card, cardName: CardName, chosen: number[]): Promise<void> {
  const def = TRICK_DEFS[cardName]!;
  const targets = def.targeting === 'one' ? (def.expandTargets ? def.expandTargets(g, user, chosen) : chosen) : autoTargets(g, def, user);
  const skip = new Set<number>();
  if (def.before) await def.before(g, user, targets, card);
  try {
    for (const t of targets) {
      if (!g.player(t).alive || skip.has(t)) continue;
      const tg = await g.bus.emit('trickTargeted', { user, target: t, card, name: cardName, cancelled: false });
      if (tg.cancelled) continue;
      const res = await askNullify(g, cardName, user, t);
      if (res.cancelled) {
        for (const s of res.group) skip.add(s);
        const who = res.group.length > 1 ? res.group.map((s) => name(g, s)).join(', ') : name(g, t);
        g.say(`${CARD_INFO[cardName].label} lên ${who} bị Vô Giải chặn.`);
        continue;
      }
      await def.effect(g, user, t, card);
    }
  } finally {
    if (def.after && !g.state.finished) await def.after(g, user, card);
  }
}

/** Giai đoạn phán định: xử lý các cẩm nang trì hoãn, lá đặt sau cùng xử lý trước. */
export async function resolveJudgePhase(g: Game, seat: number): Promise<void> {
  const p = g.player(seat);
  const queue = [...p.judgeArea].reverse();
  for (const id of queue) {
    if (!p.alive || !p.judgeArea.includes(id)) continue;
    const realCard = g.card(id);
    const dname = g.delayedName(id);
    // Lá chuyển hóa (ví dụ Quốc Sắc): xử lý theo tên cẩm nang, không theo mặt lá thật
    const card = dname === realCard.name ? realCard : { ...realCard, name: dname };
    const def = DELAYED_DEFS[dname];
    if (!def) {
      // Phòng hờ: lá không phải cẩm nang trì hoãn lọt vào khu vực phán định -> bỏ đi
      await g.moveCards([id], { kind: 'judge', seat }, { kind: 'discard' }, 'judgePhase');
      continue;
    }
    await g.moveCards([id], { kind: 'judge', seat }, { kind: 'processing' }, 'judgePhase');
    let passOn = card.name === 'shandian'; // Thiểm Điện không trúng thì chuyển sang người kế tiếp
    try {
      const n = await askNullify(g, card.name, seat, seat);
      if (n.cancelled) {
        g.say(`${cardLabel(card)} của ${p.name} bị Vô Giải chặn.`);
        continue;
      }
      const j = await g.judge(seat, CARD_INFO[card.name].label);
      let hit: boolean;
      try {
        hit = !g.cancelledJudges.has(j.id) && def.hits(j, g, seat);
      } finally {
        await g.finishJudge(j);
      }
      if (hit) {
        passOn = false;
        g.stat({ kind: 'delayedHit', seat, name: card.name, cardId: id });
        await def.onHit(g, seat, card);
      } else {
        g.say(`${CARD_INFO[card.name].label} không có hiệu lực.`);
      }
    } finally {
      if (g.state.processing.includes(id)) {
        if (passOn && !g.state.finished) await passShandian(g, seat, id);
        else await g.moveCards([id], { kind: 'processing' }, { kind: 'discard' }, 'judgePhase');
      }
    }
  }
}

/** Chuyển Thiểm Điện sang người kế tiếp chưa có Thiểm Điện (có thể quay về chính mình). */
async function passShandian(g: Game, from: number, id: number): Promise<void> {
  const order = g.aliveSeatsFrom(g.nextAliveSeat(from));
  const next = order.find((s) => !g.player(s).judgeArea.some((x) => g.delayedName(x) === 'shandian'));
  if (next === undefined) {
    await g.moveCards([id], { kind: 'processing' }, { kind: 'discard' }, 'judgePhase');
    return;
  }
  await g.moveCards([id], { kind: 'processing' }, { kind: 'judge', seat: next }, 'shandian');
  g.say(`Thiểm Điện chuyển sang ${name(g, next)}.`);
}
