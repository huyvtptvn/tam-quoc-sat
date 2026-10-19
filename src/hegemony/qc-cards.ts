// ============================================================
// Lá bài Quốc Chiến mở rộng: Thế Bị Thiên (势备篇), lá quân chủ, Bất Thần (cẩm nang thế lực, Chiếu Thư).
// Mô tả theo bản Việt hóa QSanguosha-Hegemony (src/core/card-desc.ts).
// - Cẩm nang: đăng ký vào TRICK_DEFS khi import file này.
// - Trang bị: installQcCards(game) gắn các listener vào event bus của ván.
// ============================================================
import { cardLabel, CARD_INFO } from '../core/cards.js';
import type { Game } from '../core/game.js';
import { pickCardFrom, registerTrick } from '../core/tricks.js';
import { EQUIP_SLOTS, type Card, type CardName } from '../core/types.js';
import type { HegemonyGame } from './game.js';
import type { Kingdom } from './generals.js';
import { formation } from './mechanics.js';
import { EQUIP_SKILLS, GLOBAL_SKILLS, SKILLS } from './skills.js';

const hg = (g: Game) => g as HegemonyGame;
const nameOf = (g: Game, s: number) => g.player(s).name;
const others = (g: Game, s: number) => g.aliveSeatsFrom(s).filter((x) => x !== s);
const ownCards = (g: Game, s: number) => [...g.player(s).hand, ...EQUIP_SLOTS.flatMap((sl) => g.player(s).equips[sl])];
function zoneOf(g: Game, s: number, id: number) {
  const p = g.player(s);
  if (p.hand.includes(id)) return { kind: 'hand' as const, seat: s };
  for (const slot of EQUIP_SLOTS) if (p.equips[slot].includes(id)) return { kind: 'equip' as const, seat: s, slot };
  return null;
}
async function confirm(g: Game, seat: number, skill: string, prompt: string): Promise<boolean> {
  return (await g.ask({ type: 'confirm', seat, skill, prompt, reveal: false })).kind === 'yes';
}
/** Bỏ `n` lá (trên tay hoặc trang bị) do chính người đó chọn. */
async function discardOwn(g: Game, seat: number, n: number, prompt: string, withEquip = true): Promise<number[]> {
  const pool = withEquip ? ownCards(g, seat) : [...g.player(seat).hand];
  const k = Math.min(n, pool.length);
  if (!k) return [];
  const ids = await g.chooseCards(seat, prompt, pool, k, k, true);
  for (const id of ids) {
    const z = zoneOf(g, seat, id);
    if (z) await g.moveCards([id], z, { kind: 'discard' }, 'discard');
  }
  if (ids.length) g.say(`${nameOf(g, seat)} bỏ ${ids.map((id) => cardLabel(g.card(id))).join(', ')}.`);
  return ids;
}

// ============================================================
// Cẩm nang Thế Bị Thiên
// ============================================================

// Hỏa Thiêu Liên Doanh: gây 1 sát thương hỏa cho người ngay sau bạn và những người cùng đội hình với họ.
registerTrick({
  name: 'huoshao', targeting: 'custom', harmful: true,
  autoTargets: (g, user) => {
    const next = g.nextAliveSeat(user);
    if (next === user) return [];
    return formation(hg(g), next).filter((s) => s !== user);
  },
  effect: async (g, user, t, card) => {
    await g.damage({ source: user, target: t, amount: 1, card, cardAs: 'huoshao', nature: 'fire', cancelled: false });
  },
});

// Điệu Hổ Ly Sơn: 1–2 người khác "rời bàn" trong lượt này.
registerTrick({
  name: 'diaohu', targeting: 'one', min: 1, max: 2, harmful: true,
  validTarget: (_g, user, t) => t !== user,
  effect: async (g, _user, t) => {
    g.player(t).flags.turn_lured = 1;
    g.stat({ kind: 'lured', seat: t, by: _user });
    g.say(`${nameOf(g, t)} bị Điệu Hổ Ly Sơn: lượt này không tính khoảng cách, không dùng bài, không bị chọn làm mục tiêu, máu không đổi.`);
  },
});

// Lục Lực Đồng Tâm: chọn 1 người thuộc đại hoặc tiểu thế lực -> mọi người cùng cấp đó. Đang xích thì bốc 1, không thì bị xích.
registerTrick({
  name: 'lulitongxin', targeting: 'one', min: 1, max: 1, recast: true, harmful: false,
  validTarget: (g, _user, t) => hg(g).shownKingdom(t) !== null,
  expandTargets: (g, _user, [c]) => {
    const big = hg(g).isBig(c);
    return g.aliveSeatsFrom(g.state.currentSeat).filter((s) => hg(g).shownKingdom(s) !== null && hg(g).isBig(s) === big);
  },
  effect: async (g, _user, t) => {
    const p = g.player(t);
    if (p.chained) { await g.draw(t, 1); return; }
    if (g.armorOf(t) === 'mingguang' && hg(g).isSmall(t)) { g.say(`Minh Quang Khải: ${p.name} (tiểu thế lực) không thể bị xích.`); return; }
    p.chained = true;
    g.say(`${p.name} bị xích.`);
  },
});

// Liên Quân Thịnh Yến: chọn 1 người có thế lực khác bạn -> bạn và cả thế lực đó.
registerTrick({
  name: 'lianjun', targeting: 'one', min: 1, max: 1, harmful: false,
  validTarget: (g, user, t) => t !== user && hg(g).shownKingdom(t) !== null && !hg(g).isSameFaction(user, t),
  expandTargets: (g, user, [c]) => [user, ...g.aliveSeatsFrom(user).filter((s) => s !== user && (s === c || hg(g).isSameFaction(s, c)))],
  effect: async (g, user, t, card) => {
    if (t === user) {
      const x = Math.max(1, (card as Card & { lianjunX?: number }).lianjunX ?? 1);
      const p = g.player(user);
      const maxRec = Math.min(x, p.maxHp - p.hp);
      let rec = 0;
      if (maxRec > 0) {
        const opts = Array.from({ length: maxRec + 1 }, (_, i) => `Hồi ${maxRec - i} máu, bốc ${x - (maxRec - i)} lá`);
        rec = maxRec - (await g.choose(user, `Liên Quân Thịnh Yến: chia ${x} điểm giữa hồi máu và bốc bài`, opts));
      }
      if (rec) await g.recover(user, rec, user);
      if (x - rec > 0) await g.draw(user, x - rec);
      return;
    }
    await g.draw(t, 1);
    if (g.player(t).chained) { g.player(t).chained = false; g.say(`${nameOf(g, t)} được gỡ xích.`); }
  },
  before: async (_g, _user, targets, card) => {
    // X = số người của thế lực được chọn (mọi mục tiêu trừ người dùng)
    (card as Card & { lianjunX?: number }).lianjunX = targets.length - 1;
  },
});

// Hiệp Thiên Tử Dĩ Lệnh Chư Hầu: chỉ đại thế lực, trong giai đoạn ra bài của mình.
registerTrick({
  name: 'xietianzi', targeting: 'self', harmful: false,
  canUse: (g, user) => (!hg(g).isBig(user) ? 'Chỉ đại thế lực mới dùng được' : g.state.currentSeat !== user || g.state.phase !== 'play' ? 'Chỉ dùng trong giai đoạn ra bài của bạn' : null),
  effect: async (g, user) => {
    const p = g.player(user);
    p.flags.endPlay = 1;
    p.flags.turn_xietianzi = 1;
    g.say(`${p.name} kết thúc giai đoạn ra bài; cuối giai đoạn bỏ bài có thể bỏ 1 lá để có thêm một lượt.`);
  },
});

// Sắc Lệnh: mọi người chưa có thế lực chọn: lật 1 tướng và bốc 1 lá / bỏ 1 trang bị / mất 1 máu.
async function chilingEffect(g: Game, t: number): Promise<void> {
  const h = hg(g).heroes[t];
  if (!h || hg(g).isRevealedAny(t) || !g.player(t).alive) return;
  const opts: { label: string; run: () => Promise<void> }[] = [];
  if (hg(g).canReveal(t)) {
    if (!h.main.removed) opts.push({ label: 'Lật chủ tướng và bốc 1 lá', run: async () => { await hg(g).reveal(t, 'main'); await g.draw(t, 1); } });
    if (!h.deputy.removed) opts.push({ label: 'Lật phó tướng và bốc 1 lá', run: async () => { await hg(g).reveal(t, 'deputy'); await g.draw(t, 1); } });
  }
  const eq = EQUIP_SLOTS.flatMap((sl) => g.player(t).equips[sl]);
  if (eq.length) {
    opts.push({ label: 'Bỏ 1 trang bị', run: async () => {
      const [id] = await g.chooseCards(t, 'Sắc Lệnh: chọn trang bị để bỏ', eq, 1, 1, true);
      const z = zoneOf(g, t, id);
      if (z) await g.moveCards([id], z, { kind: 'discard' }, 'chiling');
    } });
  }
  opts.push({ label: 'Mất 1 máu', run: async () => { await g.loseHp(t, 1); } });
  const i = await g.choose(t, 'Sắc Lệnh: chọn 1 mục', opts.map((o) => o.label));
  await opts[i].run();
}
registerTrick({
  name: 'chiling', targeting: 'custom', harmful: true,
  autoTargets: (g, user) => g.aliveSeatsFrom(user).filter((s) => !hg(g).isRevealedAny(s)),
  effect: async (g, _user, t) => { await chilingEffect(g, t); },
});

// ============================================================
// Cẩm nang thế lực (Bất Thần) — chỉ nhận được qua Chiếu Thư
// ============================================================

// Hiệu Lệnh Thiên Hạ (Ngụy)
registerTrick({
  name: 'haoling', targeting: 'one', min: 1, max: 1, harmful: true,
  validTarget: (g, user, t) => t !== user && g.player(t).hp > Math.min(...g.alivePlayers().map((p) => p.hp)),
  effect: async (g, user, t) => {
    for (const s of g.aliveSeatsFrom(user).filter((x) => x !== t)) {
      if (!g.player(t).alive || !g.player(s).alive) return;
      const wei = hg(g).shownKingdom(s) === 'wei';
      const opts: string[] = [];
      if (wei || g.player(s).hand.length) opts.push(wei ? 'Coi như dùng Sát vào mục tiêu' : 'Bỏ 1 lá trên tay, coi như dùng Sát vào mục tiêu');
      if (g.cardCount(t) > 0) opts.push(wei ? 'Lấy 1 lá của mục tiêu' : 'Bỏ 1 lá của mục tiêu');
      opts.push('Không làm gì');
      const pick = opts[await g.choose(s, `Hiệu Lệnh Thiên Hạ nhắm ${nameOf(g, t)}`, opts)];
      if (pick.includes('Sát')) {
        if (!wei) await g.forceDiscard(s, 1, 'haoling');
        await g.useCardAs(s, 'sha', [t], [], { label: 'Hiệu Lệnh Thiên Hạ' });
      } else if (pick.includes('mục tiêu')) {
        const c = await pickCardFrom(g, s, t, false, 'Hiệu Lệnh Thiên Hạ: chọn lá');
        if (c) await g.moveCards([c.id], c.from, wei ? { kind: 'hand', seat: s } : { kind: 'discard' }, 'haoling');
      }
    }
  },
});

// Khắc Phục Trung Nguyên (Thục)
registerTrick({
  name: 'kefu', targeting: 'one', min: 1, max: 10, harmful: false,
  validTarget: (g, _u, t) => g.isAliveSeat(t),
  effect: async (g, _user, t) => {
    const shu = hg(g).shownKingdom(t) === 'shu';
    const cands = g.targetsAs(t, 'sha');
    const opts = [...(cands.length ? [`Coi như dùng Sát${shu ? ' (+1 sát thương)' : ''}`] : []), `Bốc ${shu ? 2 : 1} lá`];
    const i = await g.choose(t, 'Khắc Phục Trung Nguyên: chọn 1 mục', opts);
    if (opts[i].startsWith('Coi')) {
      const [v] = await g.chooseTargets(t, 'Khắc Phục Trung Nguyên: chọn mục tiêu của Sát', cands, 1, 1, 'enemy');
      if (v === undefined) return;
      if (shu) g.player(t).flags.jiuBuff = (g.player(t).flags.jiuBuff ?? 0) + 1;
      await g.useCardAs(t, 'sha', [v], [], { label: 'Khắc Phục Trung Nguyên' });
    } else await g.draw(t, shu ? 2 : 1);
  },
});

// Cố Quốc An Bang (Ngô)
registerTrick({
  name: 'guguo', targeting: 'self', harmful: false,
  effect: async (g, user) => {
    await g.draw(user, 8);
    const hand = [...g.player(user).hand];
    const need = Math.min(6, hand.length);
    const ids = await g.chooseCards(user, 'Cố Quốc An Bang: bỏ ít nhất 6 lá trên tay', hand, need, hand.length);
    await g.moveCards(ids, { kind: 'hand', seat: user }, { kind: 'discard' }, 'guguo');
    g.say(`${nameOf(g, user)} bỏ ${ids.length} lá.`);
    if (hg(g).shownKingdom(user) !== 'wu') return;
    const mates = others(g, user).filter((s) => hg(g).shownKingdom(s) === 'wu');
    let left = ids.filter((id) => g.state.discardPile.includes(id)).slice(0, 6);
    for (const m of mates) {
      if (!left.length) break;
      const give = await g.chooseCards(user, `Cố Quốc An Bang: giao tối đa 2 lá vừa bỏ cho ${nameOf(g, m)}`, left, 0, Math.min(2, left.length), true);
      if (give.length) await g.moveCards(give, { kind: 'discard' }, { kind: 'hand', seat: m }, 'guguo');
      left = left.filter((x) => !give.includes(x));
    }
  },
});

// Văn Hòa Loạn Võ (Quần)
registerTrick({
  name: 'wenhe', targeting: 'allOthers', harmful: true,
  effect: async (g, user, t) => {
    const p = g.player(t);
    if (!p.hand.length) return;
    g.say(`${p.name} cho xem bài trên tay: ${p.hand.map((id) => cardLabel(g.card(id))).join(', ')}.`);
    const types = new Set(p.hand.map((id) => g.card(id).type === 'delayed' ? 'trick' : g.card(id).type));
    const opts = [...(types.size >= 2 ? [`${p.name} bỏ 2 lá khác loại trên tay`] : []), `Bạn bỏ 1 lá trên tay ${p.name}`];
    const i = await g.choose(user, 'Văn Hòa Loạn Võ: chọn 1 mục', opts);
    if (opts[i].startsWith('Bạn')) {
      const [id] = await g.chooseCards(user, `Văn Hòa Loạn Võ: bỏ 1 lá của ${p.name}`, [...p.hand], 1, 1, true);
      await g.moveCards([id], { kind: 'hand', seat: t }, { kind: 'discard' }, 'wenhe');
    } else {
      const [a] = await g.chooseCards(t, 'Văn Hòa Loạn Võ: chọn lá thứ nhất để bỏ', [...p.hand], 1, 1);
      const ta = g.card(a).type === 'delayed' ? 'trick' : g.card(a).type;
      const rest = p.hand.filter((x) => x !== a && (g.card(x).type === 'delayed' ? 'trick' : g.card(x).type) !== ta);
      const [b] = rest.length ? await g.chooseCards(t, 'Văn Hòa Loạn Võ: chọn lá khác loại để bỏ', rest, 1, 1) : [];
      await g.moveCards([a, ...(b !== undefined ? [b] : [])], { kind: 'hand', seat: t }, { kind: 'discard' }, 'wenhe');
    }
    if (hg(g).shownKingdom(t) === 'qun' && p.alive && p.hand.length === 0 && p.hp > 0) await g.draw(t, p.hp);
  },
});

/** Cẩm nang thế lực theo thế lực. */
export const FACTION_TRICKS: Partial<Record<Kingdom, CardName>> = { wei: 'haoling', shu: 'kefu', wu: 'guguo', qun: 'wenhe' };

// ============================================================
// Chiếu Thư (bảo vật): người cùng thế lực đặt bài lên làm [Chiếu]; đủ 4 chất -> đổi lấy 1 cẩm nang thế lực
// ============================================================

const EDICT = new WeakMap<Game, Set<number>>();
const edictTags = (g: Game) => { let s = EDICT.get(g); if (!s) EDICT.set(g, (s = new Set())); return s; };
export const edictPile = (g: Game, seat: number) => g.player(seat).special.filter((id) => edictTags(g).has(id));
const edictOwner = (g: Game, seat: number) => g.alivePlayers().find((p) => p.seat !== seat
  && g.equipOf(p.seat, 'treasure')?.name === 'zhaoshu' && hg(g).isSameFaction(p.seat, seat))?.seat;

SKILLS.zhaoshu_dat = {
  id: 'zhaoshu_dat',
  name: 'Đặt lên Chiếu Thư',
  desc: 'Một lần trong giai đoạn ra bài, người cùng thế lực với người lắp Chiếu Thư có thể đặt 1 lá trên tay (tiểu thế lực: tối đa 2 lá) lên Chiếu Thư, gọi là [Chiếu].',
  active: {
    cards: 'any', target: 'none', minCards: 1, maxCards: 2,
    available: (g, seat) => edictOwner(g, seat) !== undefined && !g.player(seat).flags.zhaoshuDat && g.player(seat).hand.length > 0,
    checkCards: (g, seat, ids) => (ids.length <= (hg(g).isSmall(seat) ? 2 : 1) ? null : 'Chỉ tiểu thế lực mới được đặt 2 lá'),
    run: async (g, seat, ids) => {
      const owner = edictOwner(g, seat);
      if (owner === undefined) return;
      g.player(seat).flags.zhaoshuDat = 1;
      for (const id of ids) edictTags(g).add(id);
      await g.moveCards(ids, { kind: 'hand', seat }, { kind: 'special', seat: owner }, 'zhaoshu');
      g.say(`${nameOf(g, seat)} đặt ${ids.length} lá lên Chiếu Thư của ${nameOf(g, owner)}.`);
    },
  },
};
SKILLS.zhaoshu = {
  id: 'zhaoshu',
  name: 'Chiếu Thư',
  desc: 'Bảo vật. Một lần trong giai đoạn ra bài, nếu có 4 [Chiếu] khác chất, bạn có thể bỏ hết [Chiếu] để nhận ngẫu nhiên 1 lá cẩm nang thế lực.',
  active: {
    cards: 'none', target: 'none',
    available: (g, seat) => !g.player(seat).flags.zhaoshuDoi && new Set(edictPile(g, seat).map((id) => g.card(id).suit)).size >= 4
      && g.state.removedPile.some((id) => Object.values(FACTION_TRICKS).includes(g.card(id).name)),
    run: async (g, seat) => {
      g.player(seat).flags.zhaoshuDoi = 1;
      const pile = edictPile(g, seat);
      for (const id of pile) edictTags(g).delete(id);
      await g.moveCards(pile, { kind: 'special', seat }, { kind: 'discard' }, 'zhaoshu');
      const tricks = g.state.removedPile.filter((id) => Object.values(FACTION_TRICKS).includes(g.card(id).name));
      const id = tricks[g.randomInt(tricks.length)];
      await g.moveCards([id], { kind: 'removed' }, { kind: 'hand', seat }, 'zhaoshu');
      g.say(`${nameOf(g, seat)} dùng Chiếu Thư nhận ${CARD_INFO[g.card(id).name].label}.`);
    },
  },
};
EQUIP_SKILLS.zhaoshu = 'zhaoshu';
GLOBAL_SKILLS.push('zhaoshu_dat');

// ============================================================
// Trang bị và hiệu ứng theo sự kiện
// ============================================================

export function installQcCards(g: HegemonyGame): void {
  const say = (t: string) => g.say(t);

  // ---------- Thanh Long Yển Nguyệt Đao (Quốc Chiến): mục tiêu không thể lật tướng đến khi Sát xử lý xong ----------
  g.bus.on('slashTargeted', (ctx) => {
    if (g.weaponName(ctx.source) !== 'qinglong_qc') return;
    g.player(ctx.target).flags.qinglongLock = (g.player(ctx.target).flags.qinglongLock ?? 0) + 1;
  }, 120);
  g.bus.on('slashEnd', (ctx) => {
    const f = g.player(ctx.target).flags;
    if (f.qinglongLock) f.qinglongLock -= 1;
  });

  // ---------- Phi Long Đoạt Phượng: mục tiêu bỏ 1 lá; mục tiêu hấp hối vì Sát này -> lấy 1 lá trên tay họ ----------
  g.bus.on('slashTargeted', async (ctx) => {
    if (ctx.cancelled || g.weaponName(ctx.source) !== 'feilong' || g.cardCount(ctx.target) === 0) return;
    if (!await confirm(g, ctx.source, 'feilong', `Phi Long Đoạt Phượng: buộc ${nameOf(g, ctx.target)} bỏ 1 lá?`)) return;
    await discardOwn(g, ctx.target, 1, 'Phi Long Đoạt Phượng: chọn 1 lá để bỏ');
  }, 90);
  let feilongHit: { source: number; target: number } | null = null;
  g.bus.on('damageDealt', (ctx) => {
    feilongHit = ctx.source !== null && ctx.cardAs === 'sha' && g.weaponName(ctx.source) === 'feilong' ? { source: ctx.source, target: ctx.target } : null;
  });
  g.bus.on('dying', async ({ seat }) => {
    const hit = feilongHit;
    feilongHit = null;
    if (!hit || hit.target !== seat || !g.player(hit.source).alive || !g.player(seat).hand.length) return;
    if (!await confirm(g, hit.source, 'feilong', `Phi Long Đoạt Phượng: lấy 1 lá trên tay ${nameOf(g, seat)}?`)) return;
    const hand = g.player(seat).hand;
    await g.moveCards([hand[g.randomInt(hand.length)]], { kind: 'hand', seat }, { kind: 'hand', seat: hit.source }, 'feilong');
    say(`${nameOf(g, hit.source)} dùng Phi Long Đoạt Phượng lấy 1 lá của ${nameOf(g, seat)}.`);
  });

  // ---------- Tam Tiêm Lưỡng Nhận Đao: Sát gây sát thương -> bỏ 1 lá, gây 1 sát thương cho người ở khoảng cách 1 của mục tiêu ----------
  g.bus.on('damaged', async (ctx) => {
    const src = ctx.source;
    if (src === null || ctx.cardAs !== 'sha' || ctx.chainTransmit || !g.player(src).alive || g.weaponName(src) !== 'sanjian') return;
    if (!g.player(src).hand.length) return;
    const near = g.alivePlayers().map((p) => p.seat).filter((s) => s !== ctx.target && s !== src && g.distance(ctx.target, s) === 1 && g.canTarget(src, s));
    if (!near.length) return;
    const [v] = await g.chooseTargets(src, `Tam Tiêm Lưỡng Nhận Đao: chọn người ở khoảng cách 1 của ${nameOf(g, ctx.target)} (bỏ qua để không dùng)`, near, 0, 1, 'enemy');
    if (v === undefined) return;
    const [id] = await g.chooseCards(src, 'Tam Tiêm Lưỡng Nhận Đao: bỏ 1 lá trên tay', [...g.player(src).hand], 1, 1);
    await g.moveCards([id], { kind: 'hand', seat: src }, { kind: 'discard' }, 'sanjian');
    say(`${nameOf(g, src)} dùng Tam Tiêm Lưỡng Nhận Đao.`);
    await g.damage({ source: src, target: v, amount: 1, card: null, cancelled: false });
  });

  // ---------- Phương Thiên Họa Kích (Quốc Chiến): có người né thì Sát không còn hiệu quả với các mục tiêu còn lại ----------
  g.bus.on('slashDodged', (ctx) => {
    if (g.weaponName(ctx.source) === 'fangtian_qc' && (g.player(ctx.source).flags.halberdUsed ?? 0) > 0) g.slashStopped = true;
  });

  // ---------- Hộ Tâm Kính: sát thương ≥ máu hiện tại -> bỏ giáp để ngăn ----------
  g.bus.on('beforeDamage', async (ctx) => {
    if (ctx.cancelled || ctx.amount < g.player(ctx.target).hp) return;
    if (g.armorOf(ctx.target, ctx.source, ctx.cardAs === 'sha') !== 'huxinjing') return;
    if (!await confirm(g, ctx.target, 'huxinjing', `Hộ Tâm Kính: bỏ giáp để ngăn ${ctx.amount} sát thương?`)) return;
    const id = g.player(ctx.target).equips.armor[0];
    if (id === undefined) return;
    await g.moveCards([id], { kind: 'equip', seat: ctx.target, slot: 'armor' }, { kind: 'discard' }, 'huxinjing');
    ctx.cancelled = true;
    say(`Hộ Tâm Kính của ${nameOf(g, ctx.target)} ngăn ${ctx.amount} sát thương.`);
  }, -90);

  // ---------- Minh Quang Khải: miễn Hỏa Thiêu Liên Doanh / Hỏa Công / Hỏa Sát; tiểu thế lực không bị xích ----------
  g.bus.on('trickTargeted', (ctx) => {
    if (ctx.cancelled || g.armorOf(ctx.target) !== 'mingguang') return;
    if (ctx.name === 'huoshao' || ctx.name === 'huogong') {
      ctx.cancelled = true;
      say(`Minh Quang Khải: ${CARD_INFO[ctx.name].label} không có hiệu lực với ${nameOf(g, ctx.target)}.`);
    } else if (ctx.name === 'tiesuo' && !g.player(ctx.target).chained && g.isSmall(ctx.target)) {
      ctx.cancelled = true;
      say(`Minh Quang Khải: ${nameOf(g, ctx.target)} (tiểu thế lực) không thể bị xích.`);
    }
  }, 100);
  g.bus.on('slashTargeted', (ctx) => {
    if (ctx.cancelled || ctx.card.nature !== 'fire' || g.armorOf(ctx.target, ctx.source, true) !== 'mingguang') return;
    ctx.cancelled = true;
    say(`Minh Quang Khải: Hỏa Sát không có hiệu lực với ${nameOf(g, ctx.target)}.`);
  }, 100);

  // ---------- Thái Bình Yêu Thuật: miễn sát thương thuộc tính; rời khỏi trang bị -> bốc 2, máu > 1 thì mất 1 ----------
  g.bus.on('beforeDamage', (ctx) => {
    if (ctx.cancelled || ctx.nature === 'normal' || g.armorOf(ctx.target, ctx.source, ctx.cardAs === 'sha') !== 'taiping') return;
    ctx.cancelled = true;
    say(`Thái Bình Yêu Thuật của ${nameOf(g, ctx.target)} ngăn sát thương thuộc tính.`);
  }, 95);
  g.bus.on('cardsMoved', async (ctx) => {
    if (ctx.from.kind !== 'equip' || ctx.from.slot !== 'armor' || !ctx.cardIds.some((id) => g.card(id).name === 'taiping')) return;
    const s = ctx.from.seat;
    if (!g.player(s).alive) return;
    say(`${nameOf(g, s)} mất Thái Bình Yêu Thuật.`);
    await g.draw(s, 2);
    if (g.player(s).hp > 1) await g.loseHp(s, 1);
  });

  // ---------- Sắc Lệnh: vào chồng bỏ không phải do dùng -> loại khỏi ván, Chiếu Thư vào đáy chồng bài, cuối lượt có hiệu lực ----------
  let chilingPending = false;
  g.bus.on('cardsMoved', async (ctx) => {
    if (ctx.to.kind !== 'discard' || ctx.reason === 'settle' || ctx.reason === 'use') return;
    const ids = ctx.cardIds.filter((id) => g.card(id).name === 'chiling' && g.state.discardPile.includes(id));
    if (!ids.length) return;
    await g.moveCards(ids, { kind: 'discard' }, { kind: 'removed' }, 'chiling');
    say('Sắc Lệnh bị bỏ mà không dùng: loại khỏi ván; cuối lượt này, người chưa có thế lực phải chấp hành Sắc Lệnh.');
    const edict = g.state.removedPile.find((id) => g.card(id).name === 'zhaoshu');
    if (edict !== undefined) {
      await g.moveCards([edict], { kind: 'removed' }, { kind: 'draw' }, 'chiling');
      const pile = g.state.drawPile;
      pile.splice(pile.indexOf(edict), 1);
      pile.unshift(edict); // phần tử đầu mảng = đáy chồng bài
      say('Chiếu Thư được đưa vào đáy chồng bài.');
    }
    chilingPending = true;
  });
  g.bus.on('turnEnd', async () => {
    if (!chilingPending) return;
    chilingPending = false;
    for (const s of g.aliveSeatsFrom(g.state.currentSeat)) await chilingEffect(g, s);
  });

  // ---------- Hiệp Thiên Tử: cuối giai đoạn bỏ bài, bỏ 1 lá để có thêm một lượt ----------
  g.bus.on('phaseEnd', async ({ seat, phase }) => {
    if (phase !== 'discard' || !g.player(seat).flags.turn_xietianzi || !g.player(seat).hand.length) return;
    const [id] = await g.chooseCards(seat, 'Hiệp Thiên Tử: bỏ 1 lá trên tay để có thêm một lượt? (bỏ qua để thôi)', [...g.player(seat).hand], 0, 1);
    if (id === undefined) return;
    await g.moveCards([id], { kind: 'hand', seat }, { kind: 'discard' }, 'xietianzi');
    g.grantExtraTurn(seat);
  });

  // ---------- Chiếu Thư: bỏ các [Chiếu] khi Chiếu Thư rời khu vực ----------
  g.bus.on('cardsMoved', async (ctx) => {
    if (ctx.from.kind !== 'equip' || ctx.from.slot !== 'treasure' || !ctx.cardIds.some((id) => g.card(id).name === 'zhaoshu')) return;
    const s = ctx.from.seat;
    const pile = edictPile(g, s);
    if (!pile.length) return;
    for (const id of pile) edictTags(g).delete(id);
    await g.moveCards(pile, { kind: 'special', seat: s }, { kind: 'discard' }, 'zhaoshu');
  });
}

/** Phương Thiên Họa Kích (Quốc Chiến): thêm mục tiêu — mỗi thế lực khác với mục tiêu 1 người, và người chưa có thế lực. */
export async function halberdTargets(g: HegemonyGame, seat: number, targets: number[]): Promise<number[]> {
  g.player(seat).flags.halberdUsed = 0;
  if (g.weaponName(seat) !== 'fangtian_qc' || !targets.length) return targets;
  const legal = g.alivePlayers().map((p) => p.seat).filter((t) => !targets.includes(t) && t !== seat && g.canTarget(seat, t)
    && g.canBeSlashTarget(seat, t) && g.distance(seat, t) <= g.attackRange(seat));
  const usedKingdoms = new Set(targets.map((t) => g.shownKingdom(t)).filter((k) => k !== null).map(String));
  const cands = legal.filter((t) => g.shownKingdom(t) === null || !usedKingdoms.has(String(g.shownKingdom(t))));
  if (!cands.length) return targets;
  const extra = await g.chooseTargets(seat, 'Phương Thiên Họa Kích: thêm mục tiêu (mỗi thế lực khác 1 người, người chưa có thế lực tùy ý)', cands, 0, cands.length, 'enemy');
  const out = [...targets];
  for (const t of extra) {
    const k = g.shownKingdom(t);
    if (k !== null && k !== 'careerist' && usedKingdoms.has(k)) continue;
    if (k !== null && k !== 'careerist') usedKingdoms.add(k);
    out.push(t);
  }
  if (out.length > targets.length) {
    g.player(seat).flags.halberdUsed = 1;
    g.say(`${nameOf(g, seat)} dùng Phương Thiên Họa Kích, thêm mục tiêu: ${out.slice(targets.length).map((t) => nameOf(g, t)).join(', ')}.`);
  }
  return out;
}

/** Ngô Lục Kiếm: người khác cùng thế lực với người lắp được +1 tầm đánh (mỗi thanh). */
export function sixSwordsBonus(g: HegemonyGame, seat: number): number {
  if (g.shownKingdom(seat) === null) return 0;
  return g.alivePlayers().filter((p) => p.seat !== seat && g.weaponName(p.seat) === 'liujian' && g.isSameFaction(p.seat, seat)).length;
}

/** Thái Bình Yêu Thuật: giới hạn bài trên tay +X (X = số người cùng thế lực). */
export function peaceSpellBonus(g: HegemonyGame, seat: number): number {
  if (g.armorOf(seat) !== 'taiping') return 0;
  const k = g.shownKingdom(seat);
  if (k === null) return 0;
  return k === 'careerist' ? 1 : g.factionSize(k);
}

