// ============================================================
// Gói tướng HÁN (QSanguosha-Hegemony, HanPackage.lua) + 2 tướng Lãng Khách (LangKhach.lua).
// Engine chưa có thế lực Hán nên các tướng Hán được xếp vào QUẦN.
// ============================================================
import {
  allCards, chooseOwn, discardFrom, discardOwn, give, hand, isRed, label, limitedUsed, markLimited, name,
  observe, on, oncePerTurn, others, pindian, slotOf, store, usedThisTurn, zoneOf, SLOTS,
} from './lib/tro-giup.mjs';

const equipsOf = (g, s) => SLOTS.flatMap((sl) => g.player(s).equips[sl]);
const alive = (g, s) => g.player(s).alive;
const VALUE = { tao: 6, wuxie: 5, wuxie_guo: 5, shan: 4, jiu: 3, sha: 2 };
const cardValue = (c) => VALUE[c.name] ?? 1;
const cheapest = (g, ids) => [...ids].sort((a, b) => cardValue(g.card(a)) - cardValue(g.card(b)));
/** Lá ảo không có màu (dùng không cần lá thật, hoặc chuyển hóa nhiều lá). */
const colorless = (c) => c.id < 0;
const isBlackCard = (c) => !colorless(c) && !isRed(c);

/**
 * "Xem như sử dụng" Sát (lá ảo) có thể mang thuộc tính / bỏ qua phòng cụ.
 * Không tính vào số lần Sát, không xét khoảng cách.
 */
async function useSha(g, s, targets, { nature, ignoreArmor, label: via } = {}) {
  targets = targets.filter((t) => alive(g, t) && t !== s && g.canBeSlashTarget(s, t));
  if (!alive(g, s) || !targets.length) return;
  if (!nature && !ignoreArmor) { await g.useCardAs(s, 'sha', targets, [], { label: via }); return; }
  const card = { ...g.virtualCard('sha'), ...(nature ? { nature } : {}) };
  g.say(`${name(g, s)} dùng ${nature === 'fire' ? 'Hỏa Sát' : 'Sát'}${via ? ` (${via})` : ''} vào ${targets.map((t) => name(g, t)).join(', ')}`
    + `${ignoreArmor ? ' — bỏ qua phòng cụ' : ''}.`);
  await g.bus.emit('cardUsed', { seat: s, card, as: 'sha', targets });
  for (const t of targets) {
    if (!alive(g, t) || !alive(g, s)) continue;
    // Bỏ qua phòng cụ: cờ tạm turn_ignoreArmor trên mục tiêu (engine đọc trong armorOf)
    const f = g.player(t).flags;
    const had = !!f.turn_ignoreArmor;
    if (ignoreArmor) f.turn_ignoreArmor = 1;
    try {
      await g.resolveSlash(s, t, card);
    } finally {
      if (ignoreArmor && !had) delete g.player(t).flags.turn_ignoreArmor;
    }
  }
}

/** Kỹ năng "sau khi bạn trở thành mục tiêu của lá do người khác dùng": Sát, cẩm nang thường, cẩm nang trì hoãn. */
function whenTargeted(can, run, extra = {}) {
  return [
    on('slashTargeted', (g, ctx, o) => ctx.target === o && ctx.source !== o && !ctx.cancelled && can(g, o, ctx.source, ctx.card),
      (g, ctx, o) => run(g, o, ctx.source, ctx.card), extra),
    on('trickTargeted', (g, ctx, o) => ctx.target === o && ctx.user !== o && !ctx.cancelled && can(g, o, ctx.user, ctx.card),
      (g, ctx, o) => run(g, o, ctx.user, ctx.card), extra),
    on('cardUsed', (g, ctx, o) => ctx.seat !== o && g.cardInfo(ctx.as)?.type === 'delayed' && ctx.targets.includes(o) && can(g, o, ctx.seat, ctx.card),
      (g, ctx, o) => run(g, o, ctx.seat, ctx.card), extra),
  ];
}

// ---------- Đếm số lá mỗi người nhận vào tay trong lượt (Thừa Chiếu, Định Trứ) ----------
const SEEN_MOVES = new WeakSet();
function trackReceive(g, ctx) {
  if (SEEN_MOVES.has(ctx)) return; // nhiều chủ kỹ năng cùng quan sát một sự kiện: chỉ đếm 1 lần
  SEEN_MOVES.add(ctx);
  if (ctx.to.kind !== 'hand' || ctx.reason === 'deal') return;
  if (ctx.from.kind === 'hand' && ctx.from.seat === ctx.to.seat) return;
  const st = store(g);
  if (st.recvTurn !== g.state.turnCount) { st.recvTurn = g.state.turnCount; st.recv = {}; }
  st.recv[ctx.to.seat] = (st.recv[ctx.to.seat] ?? 0) + ctx.cardIds.length;
}
const received = (g, s) => (store(g).recvTurn === g.state.turnCount ? store(g).recv[s] ?? 0 : 0);
const receiveObserver = () => observe('cardsMoved', (g, ctx) => trackReceive(g, ctx));

/** Thế lực của một người (dã tâm gia mỗi người một thế lực riêng), null nếu chưa lộ. */
function factionKey(g, s, assumeRevealed = false) {
  const k = g.shownKingdom(s) ?? (assumeRevealed ? (g.hero(s).careerist || g.realKingdom(s) === 'ye' ? 'careerist' : g.realKingdom(s)) : null);
  return k === 'careerist' ? `c${s}` : k;
}

/** Tập con các lá có tổng điểm đúng `sum` (ít lá nhất, rẻ nhất). null nếu không có. */
function subsetWithSum(g, ids, sum) {
  let best = new Map([[0, []]]);
  for (const id of cheapest(g, ids)) {
    const r = g.card(id).rank;
    const next = new Map(best);
    for (const [s, list] of best) {
      const t = s + r;
      if (t > sum) continue;
      const cur = next.get(t);
      if (!cur || cur.length > list.length + 1) next.set(t, [...list, id]);
    }
    best = next;
  }
  const out = best.get(sum);
  return out && out.length ? out : null;
}

/** 4 lá khác chất trên tay (mỗi chất lấy lá rẻ nhất), null nếu không đủ. */
function fourSuits(g, s) {
  const out = [];
  for (const suit of ['spade', 'heart', 'club', 'diamond']) {
    const id = cheapest(g, hand(g, s).filter((x) => g.card(x).suit === suit && !g.cardBlocked(s, g.card(x))))[0];
    if (id === undefined) return null;
    out.push(id);
  }
  return out;
}

/** Các lá cơ bản "xem như dùng" được lúc này (Bác Thông, Thao Loạn). */
function basicOptions(g, s) {
  const p = g.player(s);
  const out = [];
  if (p.hp < p.maxHp) out.push('tao');
  if ((p.flags.shaUsed ?? 0) < g.slashLimit(s) && g.targetsAs(s, 'sha').length) out.push('sha');
  if (!p.flags.jiuUsed && g.cards && [...g.cards.values()].some((c) => c.name === 'jiu')) out.push('jiu');
  return out;
}

/** Cẩm nang thường (không trì hoãn) có trong bộ bài ván này và dùng được lúc này (Thao Loạn). */
const TRICK_ORDER = ['wuzhong', 'juedou', 'shunshou', 'guohe', 'nanman', 'wanjian', 'huogong', 'shuiyan', 'jiedao', 'wugu', 'taoyuan'];
function trickOptions(g, s) {
  const names = new Set([...g.cards.values()].filter((c) => !c.virtual && g.cardInfo(c.name)?.type === 'trick').map((c) => c.name));
  const list = [...TRICK_ORDER.filter((n) => names.has(n)), ...[...names].filter((n) => !TRICK_ORDER.includes(n)).sort()];
  return list.filter((n) => {
    const def = g.trickDef(n);
    if (!def || def.canUse?.(g, s)) return false;
    if (n === 'taoyuan') return g.alivePlayers().some((p) => p.hp < p.maxHp);
    if (def.targeting === 'one') return g.targetsAs(s, n).length > 0;
    return def.targeting !== 'custom' || g.autoTargetsOf(s, n).length > 0;
  });
}

/** `seat` chọn targets cho một lá "xem như dùng" `n`; trả về null nếu bỏ. */
async function pickTargetsFor(g, s, n, prompt) {
  if (n === 'sha') {
    const t = await g.chooseTargets(s, prompt, g.targetsAs(s, 'sha'), 1, 1, 'enemy');
    return t.length ? t : null;
  }
  if (n === 'tao' || n === 'jiu') return [s];
  const def = g.trickDef(n);
  if (def?.targeting === 'one') {
    const cands = g.targetsAs(s, n);
    const t = await g.chooseTargets(s, prompt, cands, 1, Math.min(def.max ?? 1, cands.length), def.harmful ? 'enemy' : 'ally');
    return t.length ? t : null;
  }
  return [];
}

/** Id các kỹ năng của tướng ở ô `w` của `s` (không gồm kỹ năng được trao / trang bị). */
function slotSkills(g, s, w) {
  const slot = g.hero(s)[w];
  return g.skillEntries(s).filter((e) => e.slot === slot).map((e) => e.skill.id);
}

/** Số kỹ năng ghi trên các tướng đã lật của `s` (`extraSlot`: coi như ô này đã lật). */
function revealedSkillCount(g, s, extraSlot = null) {
  const h = g.hero(s);
  let n = 0;
  for (const w of ['main', 'deputy']) {
    if (h[w].removed || !(h[w].revealed || w === extraSlot)) continue;
    n += slotSkills(g, s, w).length;
  }
  return n;
}

export default {
  skills: [
    // ================= Lưu Hiệp =================
    {
      id: 'tianming', name: 'Thiên Mệnh',
      desc: 'Sau khi bạn trở thành mục tiêu của [Sát], bạn có thể phát động kỹ năng này, thực hiện lần lượt: bạn bỏ 2 lá trên tay (không đủ thì bỏ hết); bạn rút 2 lá.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.target === o && !ctx.cancelled, async (g, _ctx, o) => {
          if (hand(g, o).length) await g.forceDiscard(o, 2, 'tianming');
          await g.draw(o, 2);
        }),
      ],
    },
    {
      id: 'mizhao', name: 'Mật Chiếu',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể giao X lá trên tay cho 1 người khác (X là số thế lực khác bạn trên bàn, ít nhất 1); '
        + 'bạn lệnh họ đấu điểm với 1 người khác do bạn chọn, người thắng xem như sử dụng 1 [Sát] với người thua. '
        + '(đơn giản hóa: cần có đủ X lá trên tay; hòa thì không ai dùng Sát)',
      bot: { use: 'always', target: 'ally' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.mizhao && mizhaoX(g, s) >= 1 && hand(g, s).length >= mizhaoX(g, s)
          && g.alivePlayers().filter((p) => p.seat !== s).length >= 2,
        validTarget: (g, s, t) => t !== s && alive(g, t),
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.mizhao = 1;
          const x = mizhaoX(g, s);
          const ids = await g.chooseCards(s, `Mật Chiếu: giao ${x} lá cho ${name(g, t)}`, [...hand(g, s)], x, x);
          await give(g, s, t, ids);
          const cands = g.alivePlayers().map((p) => p.seat).filter((b) => b !== t && hand(g, b).length > 0 && g.canTarget(s, b));
          if (!hand(g, t).length || !cands.length) return;
          const [b] = await g.chooseTargets(s, `Mật Chiếu: ${name(g, t)} đấu điểm với ai`, cands, 1, 1, 'enemy');
          if (b === undefined) return;
          const r = await pindian(g, t, b, 'Mật Chiếu');
          if (!r || r.mine.rank === r.theirs.rank) return;
          const [win, lose] = r.win ? [t, b] : [b, t];
          await useSha(g, win, [lose], { label: 'Mật Chiếu' });
        },
      },
    },

    // ================= Lưu Biện =================
    {
      id: 'shiyuan', name: 'Thi Oán',
      desc: 'Một lần trong lượt của mỗi người, sau khi bạn trở thành mục tiêu của bài do người khác sử dụng: nếu máu của họ lớn hơn bạn, bạn có thể rút 2 lá; ngược lại bạn có thể rút 1 lá.',
      triggers: whenTargeted((g, o, src) => src !== null && !usedThisTurn(g, o, 'shiyuan'), async (g, o, src) => {
        if (!oncePerTurn(g, o, 'shiyuan')) return;
        await g.draw(o, g.player(src).hp > g.player(o).hp ? 2 : 1);
      }),
    },
    {
      id: 'dushi', name: 'Độc Thệ',
      desc: 'Tỏa định kỹ: Người khác không thể sử dụng [Đào] với bạn. Khi bạn trận vong do người khác gây sát thương, họ nhận kỹ năng này.',
      blockSaveSelf: (_g, owner, helper) => helper !== owner,
      triggers: [
        on('death', (g, ctx, o) => ctx.seat === o && ctx.killer !== null && ctx.killer !== o && alive(g, ctx.killer) && !g.hasSkill(ctx.killer, 'dushi'),
          (g, ctx) => { g.grantSkill(ctx.killer, 'dushi'); }, { compulsory: true }),
      ],
    },

    // ================= Trương Nhượng =================
    {
      id: 'taoluan', name: 'Thao Loạn',
      desc: 'Khi bạn cần sử dụng 1 lá cơ bản/công cụ phổ thông, bạn có thể mở tướng này, xem như sử dụng lá đó. Khi kết thúc lượt này, nếu bạn đã mở tất cả tướng, '
        + 'bạn chọn tối đa 3 người khác đã trở thành mục tiêu của lá đó và có bài trên tay: lần lượt họ mở 1 lá trên tay và giao cho bạn; '
        + 'trong các lá đã mở, nếu số lá Đỏ > Đen, bạn úp tướng này. (đơn giản hóa: chỉ dùng chủ động trong giai đoạn ra bài, không dùng để đáp lại như Thiểm/Vô Giải)',
      bot: { use: 'always' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => { const w = slotOf(g, s, 'zhangrang'); return !!w && !g.hero(s)[w].revealed && taoluanOptions(g, s).length > 0; },
        run: async (g, s) => {
          const opts = taoluanOptions(g, s);
          const labels = opts.map((n) => g.cardInfo(n).label);
          if (labels.length === 4) labels.push('Không dùng'); // (tránh đúng 4 phương án)
          const i = await g.choose(s, 'Thao Loạn: xem như sử dụng lá nào', labels);
          const n = opts[i];
          if (!n) return;
          const targets = await pickTargetsFor(g, s, n, `Thao Loạn: chọn mục tiêu cho ${g.cardInfo(n).label}`);
          if (!targets) return;
          const hit = n === 'sha' || g.trickDef(n)?.targeting === 'one' ? targets : g.autoTargetsOf(s, n);
          store(g)[`taoluan:${s}`] = { turn: g.state.turnCount, targets: hit.filter((t) => t !== s) };
          await g.useCardAs(s, n, targets, [], { countSlash: n === 'sha', label: 'Thao Loạn' });
        },
      },
      triggers: [
        on('turnEnd', (g, ctx, o) => {
          const st = store(g)[`taoluan:${o}`];
          return ctx.seat === o && !!st && st.turn === g.state.turnCount;
        }, async (g, _ctx, o) => {
          const st = store(g)[`taoluan:${o}`];
          delete store(g)[`taoluan:${o}`];
          const h = g.hero(o);
          if (!['main', 'deputy'].every((w) => h[w].revealed || h[w].removed)) return;
          const cands = st.targets.filter((t) => alive(g, t) && hand(g, t).length > 0);
          const picked = cands.length ? await g.chooseTargets(o, 'Thao Loạn: chọn tối đa 3 người giao bài cho bạn', cands, 0, Math.min(3, cands.length), 'enemy') : [];
          let red = 0, black = 0;
          for (const t of picked) {
            if (!hand(g, t).length || !alive(g, o)) continue;
            const [id] = await g.chooseCards(t, `Thao Loạn: mở 1 lá trên tay và giao cho ${name(g, o)}`, [...hand(g, t)], 1, 1);
            if (id === undefined) continue;
            g.say(`${name(g, t)} mở ${label(g, id)}.`);
            if (isRed(g.card(id))) red++; else black++;
            await give(g, t, o, [id]);
          }
          const w = slotOf(g, o, 'zhangrang');
          if (red > black && w) g.hideGeneral(o, w);
        }, { compulsory: true }),
      ],
    },

    // ================= Hà Tiến =================
    {
      id: 'mouzhu', name: 'Mưu Tru',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn những người khác có số máu bằng bạn hoặc ở khoảng cách 1 của bạn; lần lượt: họ giao 1 lá trên tay cho bạn; '
        + 'nếu số lá trên tay họ < bạn, họ có thể xem như sử dụng 1 [Sát] hoặc [Quyết Đấu] với bạn.',
      bot: { use: 'always', confirm: (v, h) => !h.isAlly(v.currentSeat) },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !g.player(s).flags.mouzhu && mouzhuCands(g, s).length > 0,
        run: async (g, s) => {
          g.player(s).flags.mouzhu = 1;
          const cands = mouzhuCands(g, s);
          const picked = await g.chooseTargets(s, 'Mưu Tru: chọn những người giao bài cho bạn', cands, 0, cands.length, 'enemy');
          for (const t of g.aliveSeatsFrom(s).filter((x) => picked.includes(x))) {
            if (!alive(g, s)) return;
            if (!alive(g, t)) continue;
            if (hand(g, t).length) {
              const [id] = await g.chooseCards(t, `Mưu Tru: giao 1 lá trên tay cho ${name(g, s)}`, [...hand(g, t)], 1, 1);
              if (id !== undefined) await give(g, t, s, [id]);
            }
            if (hand(g, t).length >= hand(g, s).length || !g.canTarget(t, s) || !g.canBeSlashTarget(t, s)) continue;
            const res = await g.ask({ type: 'confirm', seat: t, skill: 'mouzhu', reveal: false, prompt: `Mưu Tru: xem như dùng Sát hoặc Quyết Đấu với ${name(g, s)}?` });
            if (res.kind !== 'yes') continue;
            const i = await g.choose(t, 'Mưu Tru: xem như dùng', ['Sát', 'Quyết Đấu']);
            if (i === 0) await useSha(g, t, [s], { label: 'Mưu Tru' });
            else await g.useCardAs(t, 'juedou', [s], [], { label: 'Mưu Tru' });
          }
        },
      },
    },
    {
      id: 'yanhuo', name: 'Diên Họa',
      desc: 'Khi bạn trận vong, bạn có thể chọn 1 mục: 1. Bạn bỏ X lá của nguồn sát thương; 2. Bạn bỏ 1 lá của tối đa X người (X là số lá trên tay bạn lúc trận vong).',
      triggers: [
        // Lúc hấp hối còn sống: chụp lại bài trên tay; khi chết, X = số lá trong đó vẫn còn trên tay lúc trận vong
        observe('dying', (g, ctx, o) => { if (ctx.seat === o) store(g)[`yanhuo:${o}`] = new Set(hand(g, o)); }),
        on('death', (g, ctx, o) => ctx.seat === o && yanhuoX(g, o, ctx.cards) > 0
          && g.alivePlayers().some((p) => allCards(g, p.seat).length > 0), async (g, ctx, o) => {
          const x = yanhuoX(g, o, ctx.cards);
          delete store(g)[`yanhuo:${o}`];
          const k = ctx.killer;
          const canSrc = k !== null && k !== o && alive(g, k) && allCards(g, k).length > 0;
          const i = canSrc ? await g.choose(o, 'Diên Họa: chọn', [`Bỏ ${x} lá của ${name(g, k)}`, `Bỏ 1 lá của tối đa ${x} người`]) : 1;
          if (i === 0) {
            for (let n = 0; n < x && allCards(g, k).length; n++) await discardFrom(g, o, k, 'Diên Họa: chọn lá để bỏ');
            return;
          }
          const cands = g.alivePlayers().map((p) => p.seat).filter((s) => allCards(g, s).length > 0);
          const picked = await g.chooseTargets(o, `Diên Họa: chọn tối đa ${x} người`, cands, 0, Math.min(x, cands.length), 'enemy');
          for (const t of picked) if (allCards(g, t).length) await discardFrom(g, o, t, 'Diên Họa: chọn lá để bỏ');
        }),
      ],
    },

    // ================= Vương Doãn =================
    {
      id: 'lianji', name: 'Liên Kế',
      desc: 'Giai đoạn ra bài, bạn có thể giao 1 lá trên tay cho 1 người khác chưa nhận bài từ kỹ năng này (trong lượt này); khi tính toán sát thương tiếp theo họ phải nhận trong lượt này, sát thương này +1.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'one', target: 'one',
        available: (g, s) => hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && alive(g, t) && !g.player(t).flags.turn_lianjiGot,
        run: async (g, s, [id], [t]) => {
          await give(g, s, t, [id]);
          const f = g.player(t).flags;
          f.turn_lianjiGot = 1;
          f.turn_lianji = 1;
          g.say(`Sát thương tiếp theo ${name(g, t)} phải nhận trong lượt này +1.`);
        },
      },
      triggers: [
        on('beforeDamage', (g, ctx) => !ctx.cancelled && ctx.amount > 0 && !!g.player(ctx.target).flags.turn_lianji, (g, ctx) => {
          delete g.player(ctx.target).flags.turn_lianji;
          ctx.amount += 1;
          g.say(`Liên Kế: sát thương lên ${name(g, ctx.target)} +1.`);
        }, { compulsory: true }),
      ],
    },
    {
      id: 'dingzhu', name: 'Định Trứ',
      desc: 'Khi kết thúc giai đoạn ra bài, bạn có thể chọn 1 người khác đã nhận bài trong lượt này, họ xem như sử dụng 1 [Quyết Đấu] (với mục tiêu do bạn chọn).',
      triggers: [
        receiveObserver(),
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && others(g, o, (s) => received(g, s) > 0).length > 0, async (g, _ctx, o) => {
          const cands = others(g, o, (s) => received(g, s) > 0);
          const [p] = await g.chooseTargets(o, 'Định Trứ: chọn người xem như dùng Quyết Đấu', cands, 1, 1, 'enemy');
          if (p === undefined) return;
          const targets = g.alivePlayers().map((q) => q.seat).filter((x) => x !== p && g.canTarget(p, x) && g.canBeSlashTarget(p, x));
          const [x] = await g.chooseTargets(o, `Định Trứ: ${name(g, p)} Quyết Đấu với ai`, targets, 0, 1, 'enemy');
          if (x !== undefined) await g.useCardAs(p, 'juedou', [x], [], { label: 'Định Trứ' });
        }),
      ],
    },

    // ================= Vương Vinh =================
    {
      id: 'minsi', name: 'Mẫn Tư',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ số lá tùy ý có tổng điểm bằng 13, sau đó lật ra số lá gấp đôi từ chồng bài rút, bạn thu lấy những lá đó; '
        + 'những lá CƠ bạn đã thu bằng kỹ năng này trong lượt này không tính vào giới hạn trữ bài trên tay. (Chọn sai tổng thì hệ thống tự chọn một bộ lá hợp lệ.)',
      bot: { use: 'always' },
      handLimitBonus: (g, o) => {
        const st = store(g)[`minsi:${o}`];
        if (!st || st.turn !== g.state.turnCount) return 0;
        return hand(g, o).filter((id) => st.ids.includes(id)).length;
      },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !g.player(s).flags.minsi && !!subsetWithSum(g, minsiPool(g, s), 13),
        run: async (g, s) => {
          g.player(s).flags.minsi = 1;
          const pool = minsiPool(g, s);
          let ids = await g.chooseCards(s, 'Mẫn Tư: chọn các lá có tổng điểm bằng 13', pool, 1, pool.length);
          if (ids.reduce((n, id) => n + g.card(id).rank, 0) !== 13) ids = subsetWithSum(g, pool, 13);
          if (!ids) return;
          await discardOwn(g, s, ids);
          const got = [];
          for (let i = 0; i < ids.length * 2; i++) got.push((await g.takeTop({ kind: 'processing' }, 'reveal')).id);
          g.say(`Mẫn Tư lật: ${got.map((id) => label(g, id)).join(', ')}.`);
          await g.moveCards(got, { kind: 'processing' }, { kind: 'hand', seat: s }, 'minsi');
          const hearts = got.filter((id) => g.card(id).suit === 'heart');
          const st = store(g)[`minsi:${s}`];
          store(g)[`minsi:${s}`] = { turn: g.state.turnCount, ids: [...(st?.turn === g.state.turnCount ? st.ids : []), ...hearts] };
        },
      },
    },
    {
      id: 'wucong', name: 'Vũ Tụng',
      desc: 'Khi bạn trận vong, bạn có thể lệnh 1 người khác có cùng thế lực với bạn nhận »Mẫn Tư«.',
      triggers: [
        on('death', (g, ctx, o) => ctx.seat === o && others(g, o, (s) => g.isSameFaction(s, o) && !g.hasSkill(s, 'minsi')).length > 0, async (g, _ctx, o) => {
          const [t] = await g.chooseTargets(o, 'Vũ Tụng: ai nhận Mẫn Tư', others(g, o, (s) => g.isSameFaction(s, o) && !g.hasSkill(s, 'minsi')), 1, 1, 'ally');
          if (t !== undefined) g.grantSkill(t, 'minsi');
        }),
      ],
    },

    // ================= Phục Hoàng Hậu =================
    {
      id: 'zhuikong', name: 'Chúy Khủng',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị của người khác, nếu bạn đang bị thương, bạn có thể đấu điểm với họ: nếu bạn thắng, chặn tất cả sát thương họ gây ra trong lượt này; '
        + 'nếu bạn không thắng, họ có thể xem như sử dụng 1 [Sát] với bạn.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) && v.myHand.some((c) => c.rank >= 10) },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'start' && alive(g, ctx.seat) && g.player(o).hp < g.player(o).maxHp
          && hand(g, o).length > 0 && hand(g, ctx.seat).length > 0, async (g, ctx, o) => {
          const t = ctx.seat;
          const r = await pindian(g, o, t, 'Chúy Khủng');
          if (!r) return;
          if (r.win) {
            g.player(t).flags.turn_zhuikong = o + 1;
            g.say(`Mọi sát thương ${name(g, t)} gây ra trong lượt này bị chặn.`);
            return;
          }
          if (!alive(g, o) || !g.canBeSlashTarget(t, o)) return;
          const res = await g.ask({ type: 'confirm', seat: t, skill: 'zhuikong_sha', reveal: false, prompt: `Chúy Khủng: xem như dùng Sát với ${name(g, o)}?` });
          if (res.kind === 'yes') await useSha(g, t, [o], { label: 'Chúy Khủng' });
        }),
        on('beforeDamage', (g, ctx, o) => !ctx.cancelled && ctx.source !== null && g.player(ctx.source).flags.turn_zhuikong === o + 1,
          (g, ctx) => { ctx.cancelled = true; g.say(`Chúy Khủng: sát thương của ${name(g, ctx.source)} bị chặn.`); }, { compulsory: true }),
      ],
    },
    {
      id: 'qiuyuan', name: 'Cầu Viện',
      desc: 'Khi bạn trở thành mục tiêu của [Sát], bạn có thể lệnh 1 người khác ngoài người sử dụng chọn 1 mục: 1. Họ giao cho bạn 1 lá [Thiểm]; 2. Họ trở thành mục tiêu của [Sát] này.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.target === o && !ctx.cancelled && qiuyuanCands(g, o, ctx.source).length > 0, async (g, ctx, o) => {
          const [x] = await g.chooseTargets(o, 'Cầu Viện: chọn 1 người', qiuyuanCands(g, o, ctx.source), 0, 1, 'ally');
          if (x === undefined) return;
          const shans = hand(g, x).filter((id) => g.cardCountsAs(x, g.card(id)).includes('shan'));
          const canSlash = alive(g, ctx.source) && g.canBeSlashTarget(ctx.source, x);
          const opts = [];
          if (shans.length) opts.push(`Giao cho ${name(g, o)} 1 lá Thiểm`);
          if (canSlash) opts.push('Trở thành mục tiêu của Sát này');
          if (!opts.length) return;
          const i = opts.length > 1 ? await g.choose(x, `Cầu Viện của ${name(g, o)}: bạn chọn`, opts) : 0;
          if (shans.length && i === 0) {
            const [id] = await g.chooseCards(x, `Cầu Viện: giao 1 lá Thiểm cho ${name(g, o)}`, shans, 1, 1);
            await give(g, x, o, [id]);
          } else {
            g.say(`${name(g, x)} trở thành mục tiêu của Sát này.`);
            await g.resolveSlash(ctx.source, x, ctx.card);
          }
        }),
      ],
    },

    // ================= Đổng Thừa =================
    {
      id: 'chengzhao', name: 'Thừa Chiếu',
      desc: 'Khi bắt đầu giai đoạn kết thúc của 1 người, nếu lượt này bạn đã nhận từ 2 lá trở lên, bạn có thể đấu điểm với 1 người trong tầm đánh của bạn, '
        + 'người thắng xem như sử dụng 1 [Sát] bỏ qua phòng cụ với người thua.',
      bot: { confirm: (v) => v.myHand.some((c) => c.rank >= 10) },
      triggers: [
        receiveObserver(),
        on('phaseStart', (g, ctx, o) => ctx.phase === 'end' && received(g, o) >= 2 && hand(g, o).length > 0 && chengzhaoCands(g, o).length > 0, async (g, _ctx, o) => {
          const [t] = await g.chooseTargets(o, 'Thừa Chiếu: đấu điểm với ai', chengzhaoCands(g, o), 1, 1, 'enemy');
          if (t === undefined) return;
          const r = await pindian(g, o, t, 'Thừa Chiếu');
          if (!r || r.mine.rank === r.theirs.rank) return;
          const [win, lose] = r.win ? [o, t] : [t, o];
          await useSha(g, win, [lose], { ignoreArmor: true, label: 'Thừa Chiếu' });
        }),
      ],
    },

    // ================= Đường Cơ =================
    {
      id: 'aiwu', name: 'Ai Vũ',
      desc: 'Một lần trong lượt của mỗi người, sau khi người khác nhận sát thương, bạn có thể bỏ từ 1 đến 3 lá; họ có thể bỏ từ 1 đến 3 lá; '
        + 'nếu tổng số lá đã bỏ bởi kỹ năng này ≥ 3, bạn và họ hồi 1 máu.',
      bot: { confirm: (v) => v.myHand.length >= 3 && v.players[v.me].hp < v.players[v.me].maxHp },
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target !== o && alive(g, ctx.target) && allCards(g, o).length > 0 && !usedThisTurn(g, o, 'aiwu'), async (g, ctx, o) => {
          if (!oncePerTurn(g, o, 'aiwu')) return;
          const t = ctx.target;
          const max = Math.min(3, allCards(g, o).length);
          const counts = Array.from({ length: max }, (_, i) => max - i);
          const ci = counts.length > 1 ? await g.choose(o, 'Ai Vũ: bỏ mấy lá', counts.map((n) => `Bỏ ${n} lá`)) : 0;
          const k = counts[ci];
          const mine = await chooseOwn(g, o, `Ai Vũ: chọn ${k} lá để bỏ`, k, k);
          if (!mine?.length) return;
          await discardOwn(g, o, mine);
          let theirs = [];
          const tc = allCards(g, t).length;
          if (tc && alive(g, t)) {
            if (mine.length < 3 && tc >= 3 - mine.length) {
              const need = 3 - mine.length;
              const i = await g.choose(t, `Ai Vũ của ${name(g, o)}: bạn có bỏ bài không`, [`Bỏ ${need}–3 lá (bạn và ${name(g, o)} cùng hồi 1 máu)`, 'Không bỏ']);
              if (i === 0) theirs = (await chooseOwn(g, t, `Ai Vũ: chọn ${need}–3 lá để bỏ`, need, 3)) ?? [];
            } else {
              theirs = (await chooseOwn(g, t, 'Ai Vũ: bạn có thể bỏ 1–3 lá', 0, 3)) ?? [];
            }
          }
          if (theirs.length) await discardOwn(g, t, theirs);
          if (mine.length + theirs.length >= 3) {
            await g.recover(o, 1, o);
            await g.recover(t, 1, o);
          }
        }),
      ],
    },
    {
      id: 'juebie', name: 'Quyết Biệt',
      desc: 'Khi người khác có cùng thế lực với bạn trận vong, họ có thể giao tất cả bài của họ cho bạn.',
      triggers: [
        on('death', (g, ctx, o) => ctx.seat !== o && alive(g, o) && g.isSameFaction(ctx.seat, o) && ctx.cards.some((id) => g.state.discardPile.includes(id)),
          async (g, ctx, o) => {
            const res = await g.ask({ type: 'confirm', seat: ctx.seat, skill: 'juebie_give', reveal: false, prompt: `Quyết Biệt: giao tất cả bài của bạn cho ${name(g, o)}?` });
            if (res.kind !== 'yes') return;
            const ids = ctx.cards.filter((id) => g.state.discardPile.includes(id));
            if (!ids.length) return;
            await g.moveCards(ids, { kind: 'discard' }, { kind: 'hand', seat: o }, 'juebie');
            g.say(`${name(g, o)} nhận ${ids.length} lá của ${name(g, ctx.seat)}.`);
          }),
      ],
    },

    // ================= Thái Ung =================
    {
      id: 'zhudian', name: 'Chú Điển',
      desc: 'Sau khi bạn trở thành mục tiêu của lá Đen do người khác sử dụng, bạn có thể Trùng Chú 1 lá của bạn; nếu lá bạn rút có màu Đen và khác chất với lá được sử dụng, '
        + 'bạn có thể mở lá đó và rút 1 lá. (Lá ảo không có màu.)',
      triggers: whenTargeted((g, o, _src, card) => isBlackCard(card) && allCards(g, o).length > 0, async (g, o, _src, card) => {
        const ids = await chooseOwn(g, o, 'Chú Điển: chọn 1 lá để Trùng Chú', 1, 1);
        if (!ids?.length) return;
        const z = zoneOf(g, o, ids[0]);
        if (!z) return;
        g.say(`${name(g, o)} trùng chú ${label(g, ids[0])}.`);
        await g.moveCards(ids, z, { kind: 'discard' }, 'recast');
        const [got] = await g.draw(o, 1);
        const c = g.card(got);
        if (isRed(c) || c.suit === card.suit) return;
        const res = await g.ask({ type: 'confirm', seat: o, skill: 'zhudian_show', reveal: false, prompt: `Chú Điển: mở ${label(g, got)} và rút 1 lá?` });
        if (res.kind !== 'yes') return;
        g.say(`${name(g, o)} mở ${label(g, got)}.`);
        await g.draw(o, 1);
      }),
    },
    {
      id: 'botong', name: 'Bác Thông',
      desc: 'Bạn có thể chuyển hóa sử dụng 4 lá khác chất thành 1 lá cơ bản; sau khi lá này kết toán xong, bạn có thể đem những lá này tùy ý giao cho những người khác. '
        + '(đơn giản hóa: chỉ dùng chủ động trong giai đoạn ra bài — Sát/Đào/Rượu; chọn sai thì hệ thống tự chọn 4 lá khác chất)',
      bot: { use: 'wounded' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !!fourSuits(g, s) && basicOptions(g, s).length > 0,
        run: async (g, s) => {
          const opts = basicOptions(g, s);
          const i = opts.length > 1 ? await g.choose(s, 'Bác Thông: xem như dùng', opts.map((n) => g.cardInfo(n).label)) : 0;
          const n = opts[i];
          const pool = hand(g, s).filter((id) => !g.cardBlocked(s, g.card(id)));
          let ids = await g.chooseCards(s, 'Bác Thông: chọn 4 lá khác chất', pool, 4, 4);
          if (new Set(ids.map((id) => g.card(id).suit)).size !== 4) ids = fourSuits(g, s);
          if (!ids) return;
          const targets = await pickTargetsFor(g, s, n, 'Bác Thông: chọn mục tiêu cho Sát');
          if (!targets) return;
          await g.useCardAs(s, n, targets, ids, { countSlash: n === 'sha', label: 'Bác Thông' });
          for (const id of ids) {
            if (!alive(g, s) || !g.state.discardPile.includes(id)) continue;
            const cands = others(g, s);
            const [t] = await g.chooseTargets(s, `Bác Thông: giao ${label(g, id)} cho ai (bỏ qua = không giao)`, cands, 0, 1, 'ally');
            if (t === undefined) continue;
            await g.moveCards([id], { kind: 'discard' }, { kind: 'hand', seat: t }, 'botong');
            g.say(`${name(g, t)} nhận ${label(g, id)}.`);
          }
        },
      },
    },

    // ================= Hoàng Phủ Tung =================
    {
      id: 'dingluan', name: 'Định Loạn',
      desc: 'Một lần trong lượt của mỗi người, khi phán xét của 1 người ở khoảng cách ≤ số lá trên tay bạn có hiệu lực, nếu kết quả phán xét có chất BÍCH, bạn có thể chặn lần phán xét này; '
        + 'bạn có thể xem như sử dụng 1 [Sát Hỏa] với họ. (đơn giản hóa: chỉ áp dụng cho phán xét của cẩm nang trì hoãn trong giai đoạn phán định)',
      bot: { confirm: (v, h) => h.isAlly(v.currentSeat) },
      triggers: [
        on('judged', (g, ctx, o) => g.state.phase === 'judge' && ctx.seat === g.state.currentSeat && ctx.card.suit === 'spade'
          && g.state.processing.includes(ctx.card.id) && !!g.cancelledJudges && !usedThisTurn(g, o, 'dingluan')
          && g.distance(o, ctx.seat) <= hand(g, o).length, async (g, ctx, o) => {
          if (!oncePerTurn(g, o, 'dingluan')) return;
          g.cancelledJudges.add(ctx.card.id);
          g.say(`Định Loạn: lần phán xét của ${name(g, ctx.seat)} bị chặn.`);
          const t = ctx.seat;
          if (t === o || !alive(g, t) || !g.canBeSlashTarget(o, t) || !g.canTarget(o, t)) return;
          const i = await g.choose(o, `Định Loạn: xem như dùng Hỏa Sát với ${name(g, t)}?`, ['Không', 'Dùng Hỏa Sát']);
          if (i === 1) await useSha(g, o, [t], { nature: 'fire', label: 'Định Loạn' });
        }),
      ],
    },
    {
      id: 'shiji', name: 'Thế Kích',
      desc: 'Khi bạn gây sát thương thuộc tính cho người khác, nếu số lá trên tay bạn không phải nhiều nhất, bạn có thể xem bài trên tay họ và bỏ tối đa 2 lá Đỏ trong đó; '
        + 'sau đó bạn rút số lá tương đương với số lá đã bỏ.',
      triggers: [
        on('damageDealt', (g, ctx, o) => ctx.source === o && ctx.target !== o && (ctx.nature ?? 'normal') !== 'normal' && alive(g, ctx.target)
          && hand(g, ctx.target).length > 0 && g.alivePlayers().some((p) => p.seat !== o && p.hand.length > hand(g, o).length), async (g, ctx, o) => {
          const t = ctx.target;
          g.tell(o, `Bài trên tay ${name(g, t)}: ${hand(g, t).map((id) => label(g, id)).join(', ')}.`);
          const reds = hand(g, t).filter((id) => isRed(g.card(id)));
          const ids = reds.length ? await g.chooseCards(o, `Thế Kích: bỏ tối đa 2 lá Đỏ của ${name(g, t)}`, reds, 0, Math.min(2, reds.length), true) : [];
          if (!ids.length) return;
          await g.moveCards(ids, { kind: 'hand', seat: t }, { kind: 'discard' }, 'shiji');
          g.say(`${name(g, t)} mất ${ids.map((id) => label(g, id)).join(', ')}.`);
          await g.draw(o, ids.length);
        }),
      ],
    },

    // ================= Lưu Hoành =================
    {
      id: 'yujue', name: 'Dục Tước',
      desc: 'Khi bắt đầu giai đoạn ra bài của người khác, nếu tổng số kỹ năng ghi trên những lá tướng đã mở của họ > bạn, bạn có thể bỏ 1 lá, yêu cầu họ chấp hành 1 [Quân Lệnh]. '
        + 'Nếu họ chấp hành, sau khi họ gây sát thương trong lượt sau của họ, họ rút 2 lá (1 lần). Nếu không chấp hành: nếu họ đã mở tất cả tướng, bạn úp 1 tướng của họ '
        + 'và họ không thể mở tướng đó trong lượt này; nếu họ có tướng úp, bạn lệnh họ thay đổi trạng thái chồng tướng.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) },
      blockReveal: (g, _o, seat) => store(g)[`yujueBlock:${seat}`] === g.state.turnCount,
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'play' && alive(g, ctx.seat) && allCards(g, o).length > 0
          && revealedSkillCount(g, ctx.seat) > revealedSkillCount(g, o, slotOf(g, o, 'liuhong')), async (g, ctx, o) => {
          const t = ctx.seat;
          const ids = await chooseOwn(g, o, 'Dục Tước: bỏ 1 lá', 1, 1);
          if (!ids?.length) return;
          await discardOwn(g, o, ids);
          const order = await g.drawOrder(o);
          if (await g.askOrder(o, t, order)) {
            store(g)[`yujue:${t}`] = { armed: g.state.turnCount, active: -1 };
            return;
          }
          if (!alive(g, t)) return;
          const h = g.hero(t);
          const shown = ['main', 'deputy'].filter((w) => h[w].revealed && !h[w].removed);
          const hidden = ['main', 'deputy'].filter((w) => !h[w].revealed && !h[w].removed);
          if (!hidden.length && shown.length) {
            const i = shown.length > 1 ? await g.choose(o, `Dục Tước: úp tướng nào của ${name(g, t)}`, shown.map((w) => g.generalName(h[w].generalId))) : 0;
            g.hideGeneral(t, shown[i]);
            store(g)[`yujueBlock:${t}`] = g.state.turnCount;
          } else if (hidden.length) {
            g.turnOver(t);
          }
        }),
        observe('turnStart', (g, ctx) => {
          const st = store(g)[`yujue:${ctx.seat}`];
          if (st && st.active < 0 && g.state.turnCount > st.armed) st.active = g.state.turnCount;
        }),
        observe('turnEnd', (g, ctx) => {
          const st = store(g)[`yujue:${ctx.seat}`];
          if (st && st.active >= 0 && st.active <= g.state.turnCount) delete store(g)[`yujue:${ctx.seat}`];
        }),
        on('damageDealt', (g, ctx) => {
          if (ctx.source === null || !alive(g, ctx.source)) return false;
          const st = store(g)[`yujue:${ctx.source}`];
          return !!st && st.active === g.state.turnCount && g.state.currentSeat === ctx.source;
        }, async (g, ctx) => {
          delete store(g)[`yujue:${ctx.source}`];
          await g.draw(ctx.source, 2);
        }, { compulsory: true }),
      ],
    },

    // ================= Vô Định (Lãng Khách) =================
    {
      id: 'bianhua', name: 'Biến Hóa',
      desc: 'Tỏa định kỹ: Sau khi mở tướng này lần đầu, bạn chọn 1 mục: 1. Chọn 1 tướng đã mở trên bàn của người khác: tướng này nhận kỹ năng gốc (trừ Quân chủ kỹ) của tướng đó; '
        + '2. Tướng này vô tính, bạn tăng 1 giới hạn máu, hồi 1 máu. Sau khi bắt đầu lượt, nếu tướng này đã mở và không có kỹ năng khác, bạn đổi phó tướng (bỏ qua giới hạn). '
        + '(đơn giản hóa: không sao chép giới tính / châu liên bích hợp; không có tiêu ký [Dã tâm gia])',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'wuding' && !store(g)[`bianhua:${o}`], async (g, _ctx, o) => {
          const st = (store(g)[`bianhua:${o}`] = { skills: [] });
          const opts = [];
          for (const p of g.alivePlayers()) {
            if (p.seat === o) continue;
            const h = g.hero(p.seat);
            for (const w of ['main', 'deputy']) {
              const gid = h[w].generalId;
              if (!h[w].revealed || h[w].removed || g.isLord?.(p.seat) && w === 'main') continue;
              const skills = slotSkills(g, p.seat, w).filter((id) => id !== 'bianhua');
              if (skills.length) opts.push({ gid, skills });
            }
          }
          const labels = [...opts.map((x) => `Sao chép ${g.generalName(x.gid)} (${x.skills.map((id) => g.skillName(id)).join(', ')})`),
            'Vô tính: +1 giới hạn máu, hồi 1 máu'];
          const i = await g.choose(o, 'Biến Hóa: chọn', labels);
          if (i < opts.length) {
            for (const id of opts[i].skills) {
              if (g.hasSkill(o, id, false)) continue;
              g.grantSkill(o, id);
              st.skills.push(id);
            }
            g.say(`${name(g, o)} biến hóa thành ${g.generalName(opts[i].gid)}.`);
          } else {
            const p = g.player(o);
            p.maxHp += 1;
            g.say(`${p.name} +1 giới hạn máu (${p.maxHp}).`);
            await g.recover(o, 1, o);
          }
        }, { compulsory: true }),
        on('turnStart', (g, ctx, o) => {
          const w = slotOf(g, o, 'wuding');
          const st = store(g)[`bianhua:${o}`];
          return ctx.seat === o && !!w && g.hero(o)[w].revealed && !!st && st.skills.length === 0 && g.transformCandidates(o).length > 0;
        }, async (g, _ctx, o) => { await g.transformDeputy(o); }, { compulsory: true }),
      ],
    },

    // ================= Triệu Thị Trinh (Lãng Khách) =================
    {
      id: 'baixiang', name: 'Bạch Tượng',
      desc: 'Tỏa định kỹ: [Nam Man Nhập Xâm] không có hiệu quả với bạn. Nếu bạn không có Ngựa trong vùng trang bị, khoảng cách từ người khác đến bạn +1, tầm đánh của bạn +1.',
      rangeBonus: (g, o) => (noHorse(g, o) ? 1 : 0),
      defenseBonus: (g, o) => (noHorse(g, o) ? 1 : 0),
      triggers: [
        on('trickTargeted', (_g, ctx, o) => ctx.target === o && ctx.name === 'nanman' && !ctx.cancelled,
          (g, ctx, o) => { ctx.cancelled = true; g.say(`Bạch Tượng: Nam Man không có hiệu quả với ${name(g, o)}.`); }, { compulsory: true }),
      ],
    },
    {
      id: 'powang', name: 'Bà Vương', position: 'main',
      desc: 'Chủ tướng kỹ (giảm 0.5 máu gốc, đã tính vào số âm dương ngư): Một lần trong giai đoạn ra bài, bạn có thể chuyển hóa sử dụng 1 lá có điểm A/Q/K thành '
        + '[Nam Man Nhập Xâm] với tất cả người khác thuộc 1 thế lực; khi bạn gây sát thương bởi [Nam Man Nhập Xâm] này, nếu mục tiêu có lá trong vùng trang bị, '
        + 'bạn có thể chặn sát thương này, sau đó bỏ tất cả lá trong vùng trang bị của mục tiêu.',
      bot: { use: 'always' },
      active: {
        cards: 'one', target: 'none',
        cardOk: (g, s, id) => [1, 12, 13].includes(g.card(id).rank) && !g.cardBlocked(s, g.card(id)),
        checkCards: (g, _s, ids) => (ids.every((id) => [1, 12, 13].includes(g.card(id).rank)) ? null : 'Cần lá có điểm A, Q hoặc K'),
        available: (g, s) => !g.player(s).flags.powang && powangGroups(g, s).length > 0
          && hand(g, s).some((id) => [1, 12, 13].includes(g.card(id).rank) && !g.cardBlocked(s, g.card(id))),
        run: async (g, s, [id]) => {
          g.player(s).flags.powang = 1;
          const groups = powangGroups(g, s).sort((a, b) => b.seats.length - a.seats.length);
          const i = groups.length > 1 ? await g.choose(s, 'Bà Vương: Nam Man vào thế lực nào', groups.map((x) => `${x.label} (${x.seats.map((t) => name(g, t)).join(', ')})`)) : 0;
          const set = new Set(groups[i].seats);
          const offT = g.bus.on('trickTargeted', (ctx) => {
            if (ctx.card.id === id && ctx.user === s && !set.has(ctx.target)) ctx.cancelled = true;
          }, 1000);
          const offD = g.bus.on('beforeDamage', async (ctx) => {
            if (ctx.cancelled || ctx.source !== s || ctx.cardAs !== 'nanman' || ctx.card?.id !== id || !equipsOf(g, ctx.target).length) return;
            const res = await g.ask({ type: 'confirm', seat: s, skill: 'powang', reveal: false, prompt: `Bà Vương: chặn sát thương lên ${name(g, ctx.target)} để bỏ hết trang bị của họ?` });
            if (res.kind !== 'yes') return;
            ctx.cancelled = true;
            g.say(`Bà Vương: chặn sát thương, bỏ toàn bộ trang bị của ${name(g, ctx.target)}.`);
            await discardOwn(g, ctx.target, equipsOf(g, ctx.target));
          }, 1000);
          try {
            await g.useCardAs(s, 'nanman', [], [id], { label: 'Bà Vương' });
          } finally {
            offT();
            offD();
          }
        },
      },
    },
    {
      id: 'shengweijiang', name: 'Sinh Vi Tướng',
      desc: 'Khi bạn hấp hối, nếu số máu của bạn ≤0, bạn có thể: hồi máu đến tối đa và bổ sung bài trên tay tới giới hạn máu; lệnh người đang trong giai đoạn ra bài kết thúc giai đoạn này; '
        + 'bạn mất kỹ năng này, nhận kỹ năng »Tử Vi Thần«. (đơn giản hóa: phát động ngay khi vào hấp hối, trước khi người khác cứu)',
      triggers: [
        on('dying', (g, ctx, o) => ctx.seat === o && g.player(o).hp <= 0 && !store(g)[`shengweijiang:${o}`], async (g, _ctx, o) => {
          store(g)[`shengweijiang:${o}`] = true;
          const p = g.player(o);
          await g.recover(o, p.maxHp - p.hp, o);
          if (p.hand.length < p.maxHp) await g.draw(o, p.maxHp - p.hand.length);
          if (g.state.phase === 'play' && alive(g, g.state.currentSeat)) {
            g.player(g.state.currentSeat).flags.endPlay = 1;
            g.say(`${name(g, g.state.currentSeat)} phải kết thúc giai đoạn ra bài.`);
          }
          g.say(`${p.name} mất kỹ năng Sinh Vi Tướng.`);
          g.grantSkill(o, 'siweishen');
        }),
      ],
    },
    {
      id: 'siweishen', name: 'Tử Vi Thần',
      desc: 'Một lần trong ván đấu, khi người cùng thế lực với bạn gây sát thương, bạn có thể lệnh sát thương này +1. Tỏa định kỹ: Sau khi bạn kết thúc lượt, bạn trận vong.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => !ctx.cancelled && ctx.amount > 0 && ctx.source !== null && alive(g, ctx.source)
          && (ctx.source === o || g.isSameFaction(ctx.source, o)) && ctx.target !== o && !limitedUsed(g, o, 'siweishen'),
          (g, ctx, o) => { markLimited(g, o, 'siweishen'); ctx.amount += 1; g.say(`Tử Vi Thần: sát thương +1 (${ctx.amount}).`); }),
        on('turnEnd', (g, ctx, o) => ctx.seat === o && alive(g, o), async (g, _ctx, o) => {
          g.say(`${name(g, o)} đã hết thời gian, trận vong (Tử Vi Thần).`);
          await g.die(o, null);
        }, { compulsory: true }),
      ],
    },
  ],
};

// ---------- Hàm riêng ----------

function mizhaoX(g, s) {
  const mine = factionKey(g, s, true);
  const keys = new Set();
  for (const p of g.alivePlayers()) {
    if (p.seat === s) continue;
    const k = factionKey(g, p.seat);
    if (k !== null && k !== mine) keys.add(k);
  }
  return keys.size;
}

function yanhuoX(g, o, lost) {
  const snap = store(g)[`yanhuo:${o}`];
  return snap ? lost.filter((id) => snap.has(id)).length : 0;
}

function mouzhuCands(g, s) {
  return others(g, s, (t) => g.player(t).hp === g.player(s).hp || g.distance(s, t) <= 1);
}

function qiuyuanCands(g, o, src) {
  return others(g, o, (x) => x !== src);
}

function chengzhaoCands(g, o) {
  return others(g, o, (t) => hand(g, t).length > 0 && g.distance(o, t) <= g.attackRange(o));
}

function minsiPool(g, s) {
  return allCards(g, s);
}

function noHorse(g, o) {
  const e = g.player(o).equips;
  return e.defHorse.length === 0 && e.offHorse.length === 0;
}

function taoluanOptions(g, s) {
  const basics = basicOptions(g, s);
  const tricks = trickOptions(g, s);
  // Ưu tiên cho bot (chọn phương án đầu): Đào khi mất máu, Vô Trung, Sát, rồi các cẩm nang khác
  const out = [];
  if (basics.includes('tao')) out.push('tao');
  if (tricks.includes('wuzhong')) out.push('wuzhong');
  if (basics.includes('sha')) out.push('sha');
  for (const n of tricks) if (!out.includes(n)) out.push(n);
  if (basics.includes('jiu')) out.push('jiu');
  return out;
}

/** Các nhóm thế lực (đã lộ) của người khác cho Bà Vương. */
function powangGroups(g, s) {
  const map = new Map();
  for (const p of g.alivePlayers()) {
    if (p.seat === s || !g.canTarget(s, p.seat)) continue;
    const k = factionKey(g, p.seat);
    if (k === null) continue;
    if (!map.has(k)) map.set(k, { label: k.startsWith('c') ? `Dã tâm gia ${p.name}` : g.player(p.seat).team, seats: [] });
    map.get(k).seats.push(p.seat);
  }
  return [...map.values()];
}

