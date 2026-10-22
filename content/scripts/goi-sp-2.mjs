// ============================================================
// Gói tướng SP (nhóm C2): Trương Dực, Trình Phổ, Trình Dục, Hạ Hầu Thượng, Cố Ung, Lý Nghiêm,
// Mã Hưu & Mã Thiết, Tào Ngang, Chu Hoàn, Trần Đăng, Thạch Thao, Tôn Hoàn.
// ============================================================
import {
  allCards, chooseOwn, discardFrom, discardOwn, give, hand, isBasic, label, name, observe, on, others,
  sameFactionSeats, slotOf, store, takeFrom, zoneOf, SLOTS,
} from './lib/tro-giup.mjs';

// ---------------- Hàm trợ giúp riêng của gói ----------------

const T = (g) => g.state.turnCount;
const aliveSeats = (g) => g.alivePlayers().map((p) => p.seat);
const equipsOf = (g, s) => SLOTS.flatMap((sl) => g.player(s).equips[sl]);
const SUITS = ['spade', 'heart', 'club', 'diamond'];
const SUIT_NAMES = ['♠ Bích', '♥ Cơ', '♣ Chuồn', '♦ Rô'];
const PHASE_NAMES = { start: 'chuẩn bị', judge: 'phán định', draw: 'rút bài', play: 'ra bài', discard: 'bỏ bài', end: 'kết thúc' };

/** `a` cùng thế lực với `o`. Nếu `o` chưa lật tướng thì so với thế lực thật của `o` (lật để kích hoạt). */
function allyOf(g, a, o) {
  if (a === o) return true;
  const ka = g.shownKingdom(a);
  if (ka === null) return false;
  if (g.isRevealedAny(o)) return g.isSameFaction(a, o); // nhóm Dã tâm gia cùng phe
  if (ka === 'careerist') return false;
  return g.realKingdom(o) === ka;
}

/** Lá dùng chỉ định đúng 1 người khác làm mục tiêu: Sát hoặc cẩm nang thường chọn 1 mục tiêu. */
function singleOtherTarget(g, ctx) {
  if (ctx.targets.length !== 1 || ctx.targets[0] === ctx.seat) return false;
  if (ctx.as === 'sha') return true;
  if (g.cardInfo(ctx.as)?.type !== 'trick') return false;
  const def = g.trickDef(ctx.as);
  return !!def && def.targeting === 'one' && !def.expandTargets;
}

/** Mục tiêu duy nhất của một lá bất kỳ do người khác dùng (Hư Thực): Sát, cẩm nang 1 mục tiêu, cẩm nang trì hoãn... */
function soleTargetAnyCard(g, ctx) {
  if (ctx.targets.length !== 1 || ctx.targets[0] === ctx.seat) return false;
  const type = g.cardInfo(ctx.as)?.type;
  if (type === 'trick') {
    const def = g.trickDef(ctx.as);
    return !!def && !def.expandTargets; // lá tự mở rộng mục tiêu (Lục Lực Đồng Tâm...) không phải "mục tiêu duy nhất"
  }
  return true;
}

/** Hủy bỏ một mục tiêu của lá vừa dùng (engine đang duyệt chính mảng ctx.targets) + cờ phòng hờ. */
function cancelTarget(g, ctx, t) {
  const i = ctx.targets.indexOf(t);
  if (i >= 0) ctx.targets.splice(i, 1);
  cancels(g).add(`${ctx.card.id}:${t}`);
}
/** Hủy bỏ hoàn toàn lá vừa dùng (mọi mục tiêu, kể cả mục tiêu tự động như Nam Man). */
function cancelAll(g, ctx) {
  ctx.targets.length = 0;
  cancels(g).add(`${ctx.card.id}:*`);
}
function cancels(g) {
  const s = store(g);
  return (s.spCancels ??= new Set());
}
/** Các trigger quan sát dùng chung để thực thi việc hủy mục tiêu. */
const CANCEL_OBSERVERS = [
  observe('slashTargeted', (g, ctx) => {
    const c = cancels(g);
    if (c.has(`${ctx.card.id}:${ctx.target}`) || c.has(`${ctx.card.id}:*`)) ctx.cancelled = true;
  }),
  observe('trickTargeted', (g, ctx) => {
    const c = cancels(g);
    if (c.has(`${ctx.card.id}:${ctx.target}`) || c.has(`${ctx.card.id}:*`)) ctx.cancelled = true;
  }),
  observe('cardsMoved', (g, ctx) => {
    if (ctx.from.kind !== 'processing') return;
    const c = cancels(g);
    if (!c.size) return;
    for (const id of ctx.cardIds) for (const k of [...c]) if (k.startsWith(`${id}:`)) c.delete(k);
  }),
  observe('turnEnd', (g) => { cancels(g).clear(); }),
];

/** Di chuyển 1 lá trên bàn (trang bị, hoặc cả lá phán định) sang vùng tương ứng của người khác. */
async function moveBoardCard(g, o, prompt, { judge = true } = {}) {
  const srcs = aliveSeats(g).filter((s) => equipsOf(g, s).length || (judge && g.player(s).judgeArea.length));
  if (!srcs.length) return false;
  const [from] = await g.chooseTargets(o, `${prompt}: chọn người có lá để di chuyển (bỏ trống = thôi)`, srcs, 0, 1, 'enemy');
  if (from === undefined) return false;
  const ids = [...equipsOf(g, from), ...(judge ? g.player(from).judgeArea : [])];
  const [cid] = await g.chooseCards(o, `${prompt}: chọn lá để di chuyển`, ids, 1, 1, true);
  const z = cid === undefined ? null : zoneOf(g, from, cid);
  if (!z) return false;
  const dests = aliveSeats(g).filter((s) => s !== from && (z.kind === 'equip'
    ? g.player(s).equips[z.slot].length === 0
    : !g.player(s).judgeArea.some((x) => g.delayedName(x) === g.delayedName(cid))));
  if (!dests.length) { g.say('Không có chỗ để di chuyển lá này.'); return false; }
  const [to] = await g.chooseTargets(o, `${prompt}: chuyển ${label(g, cid)} cho ai`, dests, 1, 1, z.kind === 'equip' ? 'ally' : 'enemy');
  if (to === undefined) return false;
  await g.moveCards([cid], z, z.kind === 'equip' ? { kind: 'equip', seat: to, slot: z.slot } : { kind: 'judge', seat: to }, 'move');
  g.say(`${label(g, cid)} được chuyển từ ${name(g, from)} sang ${name(g, to)}.`);
  return true;
}

/** Lá trên tay `s` có thể dùng ngay (ngoài giai đoạn ra bài) bằng tên thật của nó không. */
function usableNow(g, s, id) {
  const c = g.card(id);
  if (g.cardBlocked(s, c)) return false;
  const info = g.cardInfo(c.name);
  if (!info) return false;
  if (info.type === 'equip') return true;
  if (c.name === 'sha') return g.targetsAs(s, 'sha').length > 0;
  if (c.name === 'tao') return g.player(s).hp < g.player(s).maxHp;
  if (info.type !== 'trick') return false;
  const def = g.trickDef(c.name);
  if (!def || def.canUse?.(g, s)) return false;
  if (def.targeting === 'one') return !def.expandTargets && (def.max ?? 1) === 1 && g.targetsAs(s, c.name).length > 0;
  if (def.targeting === 'self') return true;
  if (def.targeting === 'allOthers' || def.targeting === 'all') return g.autoTargetsOf(s, c.name).length > 0;
  return false;
}

/** `s` có thể dùng 1 lá trên tay (Nguyên Tòng). */
async function useOneFromHand(g, s, lbl) {
  const cands = hand(g, s).filter((id) => usableNow(g, s, id));
  if (!cands.length) return;
  const [id] = await g.chooseCards(s, `${lbl}: có thể dùng 1 lá trên tay`, cands, 0, 1);
  if (id === undefined || !hand(g, s).includes(id)) return;
  const c = g.card(id);
  const info = g.cardInfo(c.name);
  if (info.type === 'equip') { await g.equip(s, c); return; }
  let targets = [];
  if (c.name === 'sha') {
    const [t] = await g.chooseTargets(s, `${lbl}: chọn mục tiêu cho ${label(g, id)}`, g.targetsAs(s, 'sha'), 1, 1, 'enemy');
    if (t === undefined) return;
    targets = [t];
  } else if (c.name === 'tao') {
    targets = [s];
  } else if (g.trickDef(c.name)?.targeting === 'one') {
    const harmful = g.trickDef(c.name).harmful;
    const [t] = await g.chooseTargets(s, `${lbl}: chọn mục tiêu cho ${label(g, id)}`, g.targetsAs(s, c.name), 1, 1, harmful ? 'enemy' : 'ally');
    if (t === undefined) return;
    targets = [t];
  }
  await g.useCardAs(s, c.name, targets, [id], { label: lbl });
}

/** "Giảm 0.5 máu gốc" khi là chủ tướng: bớt 1 âm dương ngư của tướng `gid` (tính lại máu đầu ván và ký hiệu Âm Dương Ngư). */
function halfHpObservers(gid) {
  const fish = (g, o) => g.generalHalfHp(g.hero(o).main.generalId) + g.generalHalfHp(g.hero(o).deputy.generalId);
  return [
    observe('gameStart', (g, _ctx, o) => {
      const k = `half:${gid}:${o}`;
      if (store(g)[k] || g.hero(o).main.generalId !== gid) return;
      store(g)[k] = 1;
      const p = g.player(o);
      p.maxHp = p.hp = Math.max(1, Math.floor((fish(g, o) - 1) / 2));
    }),
    // Ký hiệu Âm Dương Ngư tính theo số cá đã giảm
    observe('generalRevealed', (g, ctx, o) => {
      const h = g.hero(o);
      const k = `halfmark:${gid}:${o}`;
      if (ctx.seat !== o || store(g)[k] || !store(g)[`half:${gid}:${o}`] || !h.bothRevealedHandled) return;
      store(g)[k] = 1;
      const before = fish(g, o) % 2 === 1, after = (fish(g, o) - 1) % 2 === 1;
      if (before && !after && h.marks.yinyang > 0) h.marks.yinyang--;
      if (!before && after) { h.marks.yinyang++; g.say(`${name(g, o)} có nửa máu lẻ, nhận ký hiệu Âm Dương Ngư.`); }
    }),
  ];
}

// Quân lệnh (bản sao để Trúc Khoa có thể đổi quân lệnh trước khi chấp hành)
const ORDER_SHORT = [
  'Quân lệnh 1: gây 1 sát thương cho 1 người do người ra lệnh chọn',
  'Quân lệnh 2: bốc 1 lá, rồi giao 2 lá cho người ra lệnh',
  'Quân lệnh 3: mất 1 máu',
  'Quân lệnh 4: lượt này không thể dùng/đánh bài trên tay',
  'Quân lệnh 5: bị chồng tướng (lật úp)',
  'Quân lệnh 6: giữ 1 lá trên tay và 1 trang bị, bỏ hết các lá còn lại',
];

export default {
  skills: [
    // ================= Trương Dực =================
    {
      id: 'kangrui', name: 'Kháng Nhuệ',
      desc: 'Một lần trong giai đoạn ra bài của 1 người cùng thế lực với bạn, khi họ sử dụng bài có chỉ định 1 người khác làm mục tiêu duy nhất, '
        + 'bạn có thể hủy bỏ mục tiêu của lá đó, lệnh họ chọn 1 mục: 1. Bổ sung bài trên tay đến X lá (X là số máu của họ), giai đoạn này, '
        + 'họ không thể chỉ định người ngoài họ làm mục tiêu của bài; 2. Nếu không có người trong trạng thái hấp hối, lệnh mục tiêu ban đầu '
        + 'của lá đó xem như sử dụng [Quyết đấu] với họ, số sát thương của [Quyết đấu] này +1. (Đơn giản hóa: chỉ áp dụng cho Sát và cẩm nang thường.)',
      bot: { confirm: (v, h) => h.isAlly(v.currentSeat) && v.players[v.currentSeat].handCount + 1 < v.players[v.currentSeat].hp },
      triggers: [
        ...CANCEL_OBSERVERS,
        observe('beforeDamage', (g, ctx) => {
          const k = store(g).kangruiDuel;
          if (k && ctx.cardAs === 'juedou' && ctx.card?.virtual && !ctx.kangrui
            && [k.a, k.b].includes(ctx.target) && [k.a, k.b].includes(ctx.source)) { ctx.kangrui = true; ctx.amount += 1; }
        }),
        on('cardUsed', (g, ctx, o) => ctx.seat === g.state.currentSeat && g.state.phase === 'play' && g.player(ctx.seat).alive
          && allyOf(g, ctx.seat, o) && singleOtherTarget(g, ctx) && store(g)[`kangrui:${o}`] !== T(g),
          async (g, ctx, o) => {
            if (!(ctx.seat === o || g.isSameFaction(ctx.seat, o))) return;
            store(g)[`kangrui:${o}`] = T(g);
            const u = ctx.seat, t = ctx.targets[0];
            cancelTarget(g, ctx, t);
            g.say(`Mục tiêu ${name(g, t)} của lá ${g.cardInfo(ctx.as).label} bị hủy bỏ.`);
            const x = g.player(u).hp;
            const opts = [`Bổ sung bài trên tay đến ${x} lá (giai đoạn này không thể dùng bài lên người khác)`];
            const noDying = g.alivePlayers().every((p) => p.hp > 0);
            if (noDying && g.isAliveSeat(t)) opts.push(`${name(g, t)} xem như dùng Quyết Đấu (+1 sát thương) với bạn`);
            const i = opts.length > 1 ? await g.choose(u, 'Kháng Nhuệ: chọn 1 mục', opts) : 0;
            if (i === 0) {
              const n = x - hand(g, u).length;
              if (n > 0) await g.draw(u, n);
              g.grantSkill(u, 'kangrui_lock', true);
              return;
            }
            const prev = store(g).kangruiDuel;
            store(g).kangruiDuel = { a: t, b: u };
            try {
              await g.useCardAs(t, 'juedou', [u], [], { label: 'Kháng Nhuệ' });
            } finally {
              store(g).kangruiDuel = prev;
            }
          }),
      ],
    },
    {
      id: 'kangrui_lock', name: 'Kháng Nhuệ (khóa mục tiêu)',
      desc: 'Giai đoạn ra bài này, bạn không thể chỉ định người khác làm mục tiêu của bài.',
      restrictTarget: (g, owner, target) => target !== owner && g.state.currentSeat === owner && g.state.phase === 'play',
    },

    // ================= Trình Phổ =================
    {
      id: 'huxun', name: 'Hổ Huân',
      desc: 'Khi 1 người kết thúc lượt, nếu trong lượt này có người tiến vào trạng thái hấp hối do bạn gây sát thương, bạn có thể chọn 1 mục: '
        + '1. Nếu bạn không phải người duy nhất có giới hạn máu cao nhất, bạn tăng 1 giới hạn máu và hồi 1 máu; 2. Bạn có thể di chuyển 1 lá trên bàn chơi.',
      triggers: [
        observe('dying', (g, ctx, o) => { if (ctx.source === o) store(g)[`huxun:${o}`] = T(g); }),
        on('turnEnd', (g, _ctx, o) => store(g)[`huxun:${o}`] === T(g) && g.player(o).alive
          && (huxunCanGain(g, o) || aliveSeats(g).some((s) => equipsOf(g, s).length || g.player(s).judgeArea.length)),
          async (g, _ctx, o) => {
            store(g)[`huxun:${o}`] = -1;
            const opts = [];
            if (huxunCanGain(g, o)) opts.push('gain');
            if (aliveSeats(g).some((s) => equipsOf(g, s).length || g.player(s).judgeArea.length)) opts.push('move');
            if (!opts.length) return;
            const i = opts.length > 1
              ? await g.choose(o, 'Hổ Huân: chọn 1 mục', opts.map((x) => (x === 'gain' ? 'Tăng 1 giới hạn máu và hồi 1 máu' : 'Di chuyển 1 lá trên bàn chơi')))
              : 0;
            if (opts[i] === 'gain') {
              g.player(o).maxHp += 1;
              g.say(`${name(g, o)} tăng 1 giới hạn máu (còn ${g.player(o).hp}/${g.player(o).maxHp}).`);
              await g.recover(o, 1, o);
            } else {
              await moveBoardCard(g, o, 'Hổ Huân');
            }
          }),
      ],
    },
    {
      id: 'yuancong', name: 'Nguyên Tòng',
      desc: 'Khi kết thúc giai đoạn ra bài của 1 người cùng thế lực với bạn, nếu trong giai đoạn này họ không gây sát thương, họ có thể giao 1 lá cho bạn, '
        + 'sau đó bạn có thể sử dụng 1 lá trên tay.',
      triggers: [
        on('phaseEnd', (g, ctx, o) => ctx.phase === 'play' && ctx.seat !== o && g.player(ctx.seat).alive && allyOf(g, ctx.seat, o)
          && !((g.player(ctx.seat).flags.stat_dmgPlay ?? 0) > 0) && allCards(g, ctx.seat).length > 0,
          async (g, ctx, o) => {
            const u = ctx.seat;
            if (!g.isSameFaction(u, o)) return;
            const ids = await g.chooseCards(u, `Nguyên Tòng của ${name(g, o)}: có thể giao 1 lá cho họ`, allCards(g, u), 0, 1);
            if (!ids.length) return;
            await give(g, u, o, ids);
            await useOneFromHand(g, o, 'Nguyên Tòng');
          }),
      ],
    },

    // ================= Trình Dục =================
    {
      id: 'shefu', name: 'Phục Binh',
      desc: '• Một lần trong giai đoạn ra bài, bạn có thể đặt 1 lá trên tay lên tướng của bạn, gọi là [Phục Binh]. '
        + '• Khi 1 người khác sử dụng bài trên tay, bạn có thể đưa 1 [Phục Binh] có cùng tên với lá đó vào chồng bài bỏ, hủy bỏ hoàn toàn lá đó. '
        + '• Khi bắt đầu giai đoạn chuẩn bị, nếu số [Phục Binh] > 2, bạn đưa số [Phục Binh] vào chồng bài bỏ đến khi còn 2. '
        + '(Đơn giản hóa: [Phục Binh] nằm ở khu vực riêng, mọi người đều thấy; không hủy được Đào và Rượu.)',
      bot: { use: 'always', confirm: (v, h) => !h.isAlly(v.currentSeat) },
      active: {
        cards: 'one', target: 'none',
        available: (g, s) => !g.player(s).flags.shefu && hand(g, s).length > 0,
        run: async (g, s, [id]) => {
          g.player(s).flags.shefu = 1;
          await g.moveCards([id], { kind: 'hand', seat: s }, { kind: 'special', seat: s }, 'shefu');
          ambushes(g, s).push(id);
          g.say(`${name(g, s)} đặt 1 lá lên tướng làm [Phục Binh].`);
        },
      },
      triggers: [
        ...CANCEL_OBSERVERS,
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && ctx.card.id >= 0 && !ctx.card.virtual && shefuKind(g, ctx.as)
          && ambushes(g, o).some((id) => g.card(id).name === ctx.as),
          async (g, ctx, o) => {
            const id = ambushes(g, o).find((x) => g.card(x).name === ctx.as);
            if (id === undefined) return;
            await g.moveCards([id], { kind: 'special', seat: o }, { kind: 'discard' }, 'shefu');
            g.say(`${name(g, o)} bỏ [Phục Binh] ${label(g, id)}: ${g.cardInfo(ctx.as).label} của ${name(g, ctx.seat)} bị hủy bỏ hoàn toàn.`);
            const kind = shefuKind(g, ctx.as);
            if (kind === 'equip' || kind === 'delayed') {
              const owner = kind === 'equip' ? ctx.seat : ctx.targets[0];
              const z = owner === undefined ? null : zoneOf(g, owner, ctx.card.id);
              if (z) await g.moveCards([ctx.card.id], z, { kind: 'discard' }, 'shefu');
              return;
            }
            cancelAll(g, ctx);
          }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && ambushes(g, o).length > 2,
          async (g, _ctx, o) => {
            const list = ambushes(g, o);
            const n = list.length - 2;
            const ids = await g.chooseCards(o, `Phục Binh: chọn ${n} [Phục Binh] để bỏ`, list, n, n, true);
            await g.moveCards(ids, { kind: 'special', seat: o }, { kind: 'discard' }, 'shefu');
            g.say(`${name(g, o)} bỏ ${n} [Phục Binh].`);
          }, { compulsory: true }),
      ],
    },
    {
      id: 'benyu', name: 'Bí Dục',
      desc: 'Sau khi bạn nhận sát thương: * Nếu bài trên tay bạn ít hơn nguồn sát thương, bạn chọn 1 mục: 1. Bổ sung bài trên tay đến khi bằng với họ, '
        + 'tối đa 5 lá; 2. Lệnh họ bỏ đi bài trên tay đến khi bằng bạn, tối đa bỏ 5 lá. * Nếu bài trên tay bạn nhiều hơn nguồn sát thương, '
        + 'bạn có thể bỏ số bài trên tay bằng số bài trên tay họ +1, sau đó gây 1 sát thương cho họ.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive
          && hand(g, o).length !== hand(g, ctx.source).length,
          async (g, ctx, o) => {
            const src = ctx.source;
            const mine = hand(g, o).length, theirs = hand(g, src).length;
            if (mine < theirs) {
              const drawN = Math.max(0, Math.min(theirs, 5) - mine);
              const discN = Math.min(5, theirs - mine);
              const opts = [];
              if (drawN > 0) opts.push(['draw', `Bổ sung bài đến ${Math.min(theirs, 5)} lá (rút ${drawN})`]);
              opts.push(['disc', `${name(g, src)} bỏ ${discN} lá trên tay`]);
              const i = opts.length > 1 ? await g.choose(o, 'Bí Dục: chọn 1 mục', opts.map((x) => x[1])) : 0;
              if (opts[i][0] === 'draw') await g.draw(o, drawN);
              else await g.forceDiscard(src, discN, 'benyu');
              return;
            }
            const n = theirs + 1;
            if (mine < n) return;
            // Bot: chỉ bỏ khi tốn ít bài (phương án đầu tiên là phương án bot chọn)
            const yes = `Bỏ ${n} lá trên tay, gây 1 sát thương cho ${name(g, src)}`;
            const opts = n <= 2 ? [yes, 'Không'] : ['Không', yes];
            const i = await g.choose(o, 'Bí Dục', opts);
            if (opts[i] !== yes) return;
            const ids = await g.chooseCards(o, `Bí Dục: chọn ${n} lá để bỏ`, [...hand(g, o)], n, n);
            await discardOwn(g, o, ids);
            if (g.player(src).alive) await g.damage({ source: o, target: src, amount: 1, card: null, cancelled: false });
          }),
      ],
    },

    // ================= Hạ Hầu Thượng =================
    {
      id: 'tanfeng', name: 'Tham Phong',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể bỏ 1 lá trong vùng chơi của 1 người thế lực khác bạn; '
        + '▷ Họ có thể chọn nhận 1 sát thương Hỏa từ bạn để lệnh bạn bỏ qua 1 giai đoạn trong lượt này, ngoại trừ giai đoạn chuẩn bị.',
      triggers: [
        observe('phaseBefore', (g, ctx, o) => {
          const s = store(g)[`tanfeng:${o}`];
          if (ctx.seat === o && s && s.turn === T(g) && s.phase === ctx.phase && !ctx.skip) {
            ctx.skip = true;
            g.say(`${name(g, o)} bỏ qua giai đoạn ${PHASE_NAMES[ctx.phase]} (Tham Phong).`);
          }
        }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && tanfengTargets(g, o).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Tham Phong: chọn 1 người thế lực khác bạn', tanfengTargets(g, o), 1, 1, 'enemy');
            if (t === undefined) return;
            await discardFrom(g, o, t, `Tham Phong: chọn lá của ${name(g, t)} để bỏ`, { judge: true });
            if (!g.player(t).alive || !g.player(o).alive) return;
            const i = await g.choose(t, `Tham Phong của ${name(g, o)}: nhận 1 sát thương Hỏa để ${name(g, o)} bỏ qua 1 giai đoạn?`,
              ['Không', 'Nhận 1 sát thương Hỏa']);
            if (i !== 1) return;
            await g.damage({ source: o, target: t, amount: 1, card: null, nature: 'fire', cancelled: false });
            if (!g.player(o).alive) return;
            const phases = ['judge', 'draw', 'play', 'discard', 'end'];
            const chooser = g.player(t).alive ? t : o;
            const j = await g.choose(chooser, `Tham Phong: chọn giai đoạn ${name(g, o)} phải bỏ qua`, phases.map((p) => `Giai đoạn ${PHASE_NAMES[p]}`));
            store(g)[`tanfeng:${o}`] = { turn: T(g), phase: phases[j] };
            g.say(`${name(g, o)} sẽ bỏ qua giai đoạn ${PHASE_NAMES[phases[j]]} trong lượt này.`);
          }),
      ],
    },

    // ================= Cố Ung =================
    {
      id: 'lifu', name: 'Lễ Phụ',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người, lệnh họ bỏ 2 lá, sau đó bạn xem lá trên đầu chồng bài rút và giao cho họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.lifu,
        validTarget: (g, _s, t) => g.isAliveSeat(t) && g.cardCount(t) >= 2,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.lifu = 1;
          const n = Math.min(2, g.cardCount(t));
          const ids = await chooseOwn(g, t, `Lễ Phụ của ${name(g, s)}: bỏ ${n} lá`, n, n);
          await discardOwn(g, t, ids ?? []);
          if (!g.player(t).alive) return;
          const card = await g.takeTop({ kind: 'hand', seat: t }, 'lifu');
          g.tell(s, `Lễ Phụ: lá trên cùng chồng bài là ${label(g, card.id)}, đã giao cho ${name(g, t)}.`);
          g.say(`${name(g, s)} xem lá trên cùng chồng bài và giao cho ${name(g, t)}.`);
        },
      },
    },
    {
      id: 'yanzhong', name: 'Ngôn Trung',
      desc: 'Khi bắt đầu giai đoạn kết thúc, bạn có thể chọn 1 chất và chọn 1 người khác có bài trên tay, bạn bỏ 1 lá trên tay họ; '
        + 'nếu chất của lá đã bỏ và chất đã đoán: * Khác chất: bạn bỏ 1 lá; * Cùng chất và chất đó là: CƠ: Bạn hồi 1 máu; '
        + 'RÔ: Bạn rút 1 lá, loại bỏ trạng thái xích; TÉP: Họ giao 1 lá cho bạn; BÍCH: Họ mất 1 máu.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && others(g, o, (s) => hand(g, s).length > 0).length > 0,
          async (g, _ctx, o) => {
            const si = await g.choose(o, 'Ngôn Trung: đoán 1 chất', SUIT_NAMES);
            const [t] = await g.chooseTargets(o, 'Ngôn Trung: chọn 1 người khác có bài trên tay', others(g, o, (s) => hand(g, s).length > 0), 1, 1, 'enemy');
            if (t === undefined) return;
            const h = hand(g, t);
            const id = h[g.randomInt(h.length)];
            await g.moveCards([id], { kind: 'hand', seat: t }, { kind: 'discard' }, 'yanzhong');
            const suit = g.card(id).suit;
            g.say(`${name(g, o)} đoán ${SUIT_NAMES[si]}, bỏ ${label(g, id)} của ${name(g, t)}.`);
            if (suit !== SUITS[si]) {
              const mineIds = await chooseOwn(g, o, 'Ngôn Trung: đoán sai, bỏ 1 lá', 1, 1);
              if (mineIds?.length) await discardOwn(g, o, mineIds);
              return;
            }
            if (suit === 'heart') await g.recover(o, 1, o);
            else if (suit === 'diamond') {
              await g.draw(o, 1);
              if (g.player(o).chained) { g.player(o).chained = false; g.say(`${name(g, o)} thoát trạng thái xích.`); }
            } else if (suit === 'club') {
              if (!g.player(t).alive || !allCards(g, t).length) return;
              const ids = await chooseOwn(g, t, `Ngôn Trung: giao 1 lá cho ${name(g, o)}`, 1, 1);
              if (ids?.length) await give(g, t, o, ids);
            } else if (suit === 'spade') {
              await g.loseHp(t, 1);
            }
          }),
      ],
    },

    // ================= Lý Nghiêm =================
    {
      id: 'jinwu', name: 'Căng Võ',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể yêu cầu bạn chấp hành 1 quân lệnh: * Nếu chấp hành, bạn xem như sử dụng 1 [Sát]; '
        + '* Nếu không chấp hành, bạn kết thúc giai đoạn này.',
      bot: { confirm: (v) => v.players[v.me].hp >= 3 },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play', async (g, _ctx, o) => {
          let order = await g.drawOrder(o);
          const yes = await g.choose(o, `Căng Võ — ${ORDER_SHORT[order]}. Bạn có chấp hành không?`, ['Chấp hành', 'Không chấp hành']);
          if (yes !== 0) {
            g.say(`${name(g, o)} không chấp hành quân lệnh, kết thúc giai đoạn ra bài.`);
            g.player(o).flags.endPlay = 1;
            return;
          }
          // Trúc Khoa (chủ tướng): được chọn lại quân lệnh để chấp hành
          const zk = g.skillEntries(o).find((e) => e.skill.id === 'zhuke');
          if (zk) {
            const rest = [0, 1, 2, 3, 4, 5].filter((x) => x !== order);
            const j = await g.choose(o, 'Trúc Khoa: có thể chọn lại quân lệnh để chấp hành', [`Giữ: ${ORDER_SHORT[order]}`, ...rest.map((x) => ORDER_SHORT[x])]);
            if (j > 0) {
              if (!zk.slot.revealed) await g.reveal(o, zk.which);
              order = rest[j - 1];
              g.say(`${name(g, o)} dùng Trúc Khoa, chọn lại: ${ORDER_SHORT[order]}.`);
            }
          }
          await doOrder(g, o, o, order);
          if (!g.player(o).alive) return;
          const ts = g.targetsAs(o, 'sha');
          const [t] = await g.chooseTargets(o, 'Căng Võ: chọn mục tiêu cho [Sát]', ts, 1, 1, 'enemy');
          if (t !== undefined) await g.useCardAs(o, 'sha', [t], [], { label: 'Căng Võ' });
        }),
      ],
    },
    {
      id: 'zhuke', name: 'Trúc Khoa', position: 'main',
      desc: 'Chủ tướng kỹ, Giảm 0.5 máu gốc: • Sau khi bạn chọn chấp hành quân lệnh, bạn có thể chọn lại quân lệnh để chấp hành. '
        + '• Khi bạn nhận trạng thái xích hoặc trạng thái chồng tướng, bạn có thể lệnh 1 người cùng thế lực với bạn hồi 1 máu. '
        + '(Đơn giản hóa: chọn lại quân lệnh chỉ áp dụng cho quân lệnh của Căng Võ.)',
      triggers: [
        ...halfHpObservers('liyan'),
        ...['cardsMoved', 'phaseStart', 'phaseEnd', 'turnEnd', 'damaged'].map((ev) => on(ev, (g, ctx, o) => zhukeCheck(g, ctx, o),
          async (g, _ctx, o) => {
            store(g)[`zhuke:${o}`].token = null;
            const cands = sameFactionSeats(g, o).filter((s) => g.player(s).hp < g.player(s).maxHp);
            const [t] = await g.chooseTargets(o, 'Trúc Khoa: chọn 1 người cùng thế lực hồi 1 máu', cands, 1, 1, 'ally');
            if (t !== undefined) await g.recover(t, 1, o);
          })),
      ],
    },
    {
      id: 'quanjia', name: 'Khuyến Giá', position: 'deputy',
      desc: 'Phó tướng kỹ: Sau khi bạn mở tướng này lần đầu tiên, bạn phát động kỹ năng này, thực hiện lần lượt: '
        + '- Triệu hoán thế lực, có thể hưởng ứng triệu hoán này mà không trở thành dã tâm; - Người cùng thế lực với bạn rút 1 lá; '
        + '- Người có kỹ năng »Nhân Đức« nhận kỹ năng »Chương Vũ« và »Thụ Việt«. '
        + '(Đơn giản hóa: hưởng ứng triệu hoán = người chưa lật tướng có thế lực thật giống bạn được lật chủ tướng mà không thành dã tâm gia; '
        + 'chưa có phần »Chương Vũ«/»Thụ Việt«.)',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'liyan' && slotOf(g, o, 'liyan') === 'deputy'
          && !store(g)[`quanjia:${o}`],
          async (g, _ctx, o) => {
            store(g)[`quanjia:${o}`] = 1;
            const h = g.hero(o);
            const k = g.realKingdom(o);
            if (!h.careerist && k !== 'ye') {
              for (const s of aliveSeats(g)) {
                if (s === o || g.isRevealedAny(s) || g.realKingdom(s) !== k) continue;
                const hs = g.hero(s);
                if (hs.main.removed) continue;
                const res = await g.ask({ type: 'confirm', seat: s, skill: 'quanjia', reveal: false,
                  prompt: `Khuyến Giá của ${name(g, o)}: hưởng ứng triệu hoán, lật chủ tướng (không trở thành dã tâm gia)?` });
                if (res.kind !== 'yes') continue;
                await g.reveal(s, 'main');
                if (hs.careerist && g.lordOf(k, true) === null) {
                  hs.careerist = false;
                  g.player(s).team = g.player(o).team;
                  g.say(`${name(g, s)} hưởng ứng triệu hoán, không trở thành dã tâm gia.`);
                }
              }
            }
            for (const s of sameFactionSeats(g, o)) if (g.player(s).alive) await g.draw(s, 1);
          }, { compulsory: true }),
      ],
    },

    // ================= Mã Hưu & Mã Thiết =================
    {
      id: 'mashu_maxiumatie', name: 'Mã Thuật',
      desc: 'Tỏa định kỹ: Khoảng cách từ bạn đến người khác -1.',
      offenseBonus: (g, o) => (lostSkill(g, o, 'mashu_maxiumatie') ? 0 : 1),
    },
    {
      id: 'kenshang', name: 'Khẩn Thương',
      desc: 'Bạn có thể chuyển hóa sử dụng tùy ý số lá của bạn thành [Sát] (ít nhất 1 lá); ▶ Sau khi bạn chỉ định mục tiêu cho [Sát] này, '
        + 'bạn có thể lệnh tất cả người khác ở ngoài tầm đánh của bạn trở thành mục tiêu của [Sát] này (không giới hạn khoảng cách), '
        + 'hủy bỏ tất cả mục tiêu trong tầm đánh của bạn; ▶ Sau khi lá [Sát] này kết toán, nếu số lá bạn đã đem sử dụng > X, bạn rút X lá; '
        + 'Ngược lại, bạn mất »Mã Thuật« hoặc »Khẩn Thương« (X là tổng số sát thương mà [Sát] này đã gây ra). '
        + '(Đơn giản hóa: chỉ dùng bài trên tay, chỉ dùng chủ động trong giai đoạn ra bài.)',
      bot: { use: 'healthy', target: 'enemy' },
      active: {
        cards: 'any', target: 'one', minCards: 1,
        available: (g, s) => !lostSkill(g, s, 'kenshang') && hand(g, s).length > 0
          && (g.player(s).flags.shaUsed ?? 0) < g.slashLimit(s) && g.targetsAs(s, 'sha').length > 0,
        cardOk: (g, s, id) => !g.cardBlocked(s, g.card(id)),
        validTarget: (g, s, t) => g.targetsAs(s, 'sha').includes(t),
        run: async (g, s, ids, [t]) => {
          let targets = [t];
          const far = aliveSeats(g).filter((x) => x !== s && g.canTarget(s, x) && g.canBeSlashTarget(s, x) && g.distance(s, x) > g.attackRange(s));
          if (far.length) {
            const i = await g.choose(s, 'Khẩn Thương: đổi mục tiêu?', ['Giữ mục tiêu',
              `Đổi thành mọi người ngoài tầm đánh: ${far.map((x) => name(g, x)).join(', ')}`]);
            if (i === 1) { targets = far; g.say(`${name(g, s)} đổi mục tiêu Sát thành ${far.map((x) => name(g, x)).join(', ')}.`); }
          }
          const st = { seat: s, dmg: 0 };
          const prev = store(g).kenshang;
          store(g).kenshang = st;
          try {
            await g.useCardAs(s, 'sha', targets, ids, { countSlash: true, label: 'Khẩn Thương' });
          } finally {
            store(g).kenshang = prev;
          }
          if (!g.player(s).alive) return;
          if (ids.length > st.dmg) {
            if (st.dmg > 0) await g.draw(s, st.dmg);
            return;
          }
          const left = ['mashu_maxiumatie', 'kenshang'].filter((x) => !lostSkill(g, s, x));
          if (!left.length) return;
          const i = left.length > 1 ? await g.choose(s, 'Khẩn Thương: chọn kỹ năng để mất', ['Mã Thuật', 'Khẩn Thương']) : 0;
          (store(g)[`lost:${s}`] ??= new Set()).add(left[i]);
          g.say(`${name(g, s)} mất kỹ năng ${left[i] === 'kenshang' ? 'Khẩn Thương' : 'Mã Thuật'}.`);
        },
      },
      triggers: [
        observe('damageDealt', (g, ctx, o) => {
          const st = store(g).kenshang;
          if (st && st.seat === o && ctx.source === o && ctx.cardAs === 'sha') st.dmg += ctx.amount;
        }),
      ],
    },

    // ================= Tào Ngang =================
    {
      id: 'xiaolian', name: 'Hiếu Liêm',
      desc: '• Sau khi mở tướng này lần đầu, bạn có thể di chuyển 1 trang bị trên bàn chơi; sau đó, bạn có thể lặp lại quá trình này thêm 1 lần. '
        + '• Sau khi tướng này bị loại bỏ, người cùng thế lực với bạn rút 1 lá.',
      triggers: [
        observe('gameStart', (g) => installCaoangRemoval(g)),
        observe('turnStart', (g) => installCaoangRemoval(g)),
        on('generalRevealed', (g, ctx, o) => { installCaoangRemoval(g); return ctx.seat === o && ctx.generalId === 'caoang'
          && !store(g)[`xiaolian:${o}`] && aliveSeats(g).some((s) => equipsOf(g, s).length > 0); },
          async (g, _ctx, o) => {
            store(g)[`xiaolian:${o}`] = 1;
            if (await moveBoardCard(g, o, 'Hiếu Liêm (1/2)', { judge: false })) await moveBoardCard(g, o, 'Hiếu Liêm (2/2)', { judge: false });
          }),
      ],
    },
    {
      id: 'kangkai', name: 'Khảng Khái',
      desc: 'Sau khi 1 người cùng thế lực với bạn trở thành mục tiêu của [Sát], bạn có thể loại bỏ tướng này, thực hiện lần lượt: '
        + '- Chọn 1 người, lệnh họ nhận kỹ năng »Phi Ảnh«; - Nếu người đó không phải là bạn, người đó hồi 1 máu và thoát trạng thái xích.',
      bot: { confirm: (v, h) => v.players.some((p) => p.alive && h.isAlly(p.seat) && p.hp <= 1) },
      triggers: [
        on('slashTargeted', (g, ctx, o) => !ctx.cancelled && g.player(ctx.target).alive && allyOf(g, ctx.target, o) && caoangSlot(g, o) !== null,
          async (g, ctx, o) => {
            const which = caoangSlot(g, o);
            if (which === null || !(ctx.target === o || g.isSameFaction(ctx.target, o))) return;
            await g.removeGeneral(o, which);
            const [t] = await g.chooseTargets(o, 'Khảng Khái: chọn 1 người nhận kỹ năng Phi Ảnh', aliveSeats(g), 1, 1, 'ally');
            if (t === undefined) return;
            g.grantSkill(t, 'feiying_caoang');
            if (t !== o) {
              await g.recover(t, 1, o);
              if (g.player(t).chained) { g.player(t).chained = false; g.say(`${name(g, t)} thoát trạng thái xích.`); }
            }
          }),
      ],
    },
    {
      id: 'feiying_caoang', name: 'Phi Ảnh',
      desc: 'Tỏa định kỹ: Khoảng cách từ người khác đến bạn +1.',
      defenseBonus: () => 1,
    },

    // ================= Chu Hoàn =================
    {
      id: 'jutian', name: 'Cự Thiên',
      desc: 'Một lần trong lượt của mỗi người đối với mỗi mục lựa chọn, sau khi bạn gây sát thương cho người khác, bạn có thể chọn 1 mục: '
        + '1. Bạn chọn 1 người cùng thế lực với người đã nhận sát thương, lệnh họ bỏ bài trên tay đến khi bằng với số máu của họ, tối đa bỏ 5 lá; '
        + '2. Bạn chọn 1 người cùng thế lực với bạn, lệnh họ bổ sung bài trên tay đến giới hạn máu của họ. '
        + '(Đơn giản hóa: chỉ kích hoạt khi người nhận sát thương còn sống.)',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.source === o && ctx.target !== o && g.player(o).alive
          && (jutianOpt1(g, ctx, o).length > 0 || jutianOpt2(g, o, true).length > 0),
          async (g, ctx, o) => {
            const opts = [];
            if (jutianOpt1(g, ctx, o).length) opts.push(['disc', 'Một người cùng thế lực với người nhận sát thương bỏ bài đến bằng số máu']);
            if (jutianOpt2(g, o, false).length) opts.push(['draw', 'Một người cùng thế lực với bạn bổ sung bài đến giới hạn máu']);
            if (!opts.length) return;
            const i = opts.length > 1 ? await g.choose(o, 'Cự Thiên: chọn 1 mục', opts.map((x) => x[1])) : 0;
            if (opts[i][0] === 'disc') {
              const cands = jutianOpt1(g, ctx, o);
              store(g)[`jutian1:${o}`] = T(g);
              const [t] = await g.chooseTargets(o, 'Cự Thiên: chọn người bỏ bài', cands, 1, 1, 'enemy');
              if (t === undefined) return;
              await g.forceDiscard(t, Math.min(5, hand(g, t).length - g.player(t).hp), 'jutian');
            } else {
              const cands = jutianOpt2(g, o, false);
              store(g)[`jutian2:${o}`] = T(g);
              const [t] = await g.chooseTargets(o, 'Cự Thiên: chọn người bổ sung bài', cands, 1, 1, 'ally');
              if (t === undefined) return;
              await g.draw(t, g.player(t).maxHp - hand(g, t).length);
            }
          }),
      ],
    },

    // ================= Trần Đăng =================
    {
      id: 'haokui', name: 'Hào Khôi',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể rút 2 lá; ▶ Khi có bài tiến vào chồng bài bỏ trong giai đoạn bỏ bài lượt này, bạn đem những lá này '
        + 'giao cho 1 người thế lực xác định khác bạn, ưu tiên theo thứ tự sau: * Người thuộc đại thế lực; * Người có số máu lớn nhất trong số những người '
        + 'thế lực xác định khác bạn; ▶ Khi kết thúc lượt này, nếu bạn không giao bài cho người khác bởi kỹ năng này, bạn thực hiện lần lượt: '
        + '- Nếu bạn đã mở tất cả tướng, bạn có thể úp tướng này; - Bạn có thể chọn 1 người cùng thế lực với bạn, họ có thể đổi Phó tướng. '
        + '(Đơn giản hóa: các lá bỏ trong giai đoạn bỏ bài được giao một lần khi giai đoạn bỏ bài kết thúc.)',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play', async (g, _ctx, o) => {
          await g.draw(o, 2);
          store(g)[`haokui:${o}`] = { turn: T(g), ids: [], gave: false };
        }),
        observe('cardsMoved', (g, ctx, o) => {
          const hk = store(g)[`haokui:${o}`];
          if (hk && hk.turn === T(g) && g.state.currentSeat === o && g.state.phase === 'discard' && ctx.to.kind === 'discard') hk.ids.push(...ctx.cardIds);
        }),
        on('phaseEnd', (g, ctx, o) => {
          const hk = store(g)[`haokui:${o}`];
          return ctx.seat === o && ctx.phase === 'discard' && hk?.turn === T(g) && haokuiCards(g, hk).length > 0 && haokuiReceivers(g, o).length > 0;
        }, async (g, _ctx, o) => {
          const hk = store(g)[`haokui:${o}`];
          const ids = haokuiCards(g, hk);
          const pool = haokuiReceivers(g, o);
          const [t] = pool.length > 1 ? await g.chooseTargets(o, 'Hào Khôi: chọn người nhận các lá vừa bỏ', pool, 1, 1, 'ally') : pool;
          if (t === undefined || !ids.length) return;
          await g.moveCards(ids, { kind: 'discard' }, { kind: 'hand', seat: t }, 'haokui');
          hk.gave = true;
          g.say(`${name(g, o)} giao ${ids.length} lá vừa bỏ cho ${name(g, t)}: ${ids.map((id) => label(g, id)).join(', ')}.`);
        }, { compulsory: true }),
        on('turnEnd', (g, ctx, o) => {
          const hk = store(g)[`haokui:${o}`];
          return ctx.seat === o && hk?.turn === T(g) && !hk.gave && g.player(o).alive;
        }, async (g, _ctx, o) => {
          const hk = store(g)[`haokui:${o}`];
          hk.gave = true; // chỉ một lần
          const h = g.hero(o);
          const which = slotOf(g, o, 'chendeng');
          if (which && h.main.revealed && h.deputy.revealed && !h[which].removed) {
            const i = await g.choose(o, 'Hào Khôi: úp tướng Trần Đăng?', ['Úp tướng này', 'Không']);
            if (i === 0) g.hideGeneral(o, which);
          }
          if (g.transformGrantUsed({ owner: o, skill: 'haokui' })) return; // mỗi ván chỉ cho đổi tướng 1 lần
          const [t] = await g.chooseTargets(o, 'Hào Khôi: chọn 1 người cùng thế lực có thể đổi phó tướng (bỏ trống = thôi)',
            sameFactionSeats(g, o).filter((s) => g.transformCandidates(s).length > 0 && !g.hero(s).deputy.removed), 0, 1, 'ally');
          if (t !== undefined) await g.askTransform(t, `Hào Khôi của ${name(g, o)}`, { owner: o, skill: 'haokui' });
        }),
      ],
    },
    {
      id: 'xushi', name: 'Hư Thực',
      desc: 'Khi bạn trở thành mục tiêu duy nhất của bài do người khác sử dụng (mọi loại bài: Sát, cẩm nang, cẩm nang trì hoãn...), '
        + 'nếu tướng này đang úp, bạn có thể lật tướng này để hủy bỏ mục tiêu đối với bạn; ▷ Bạn lệnh họ bỏ 1 lá.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) },
      triggers: [
        ...CANCEL_OBSERVERS,
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && soleTargetAnyCard(g, ctx) && ctx.targets[0] === o && chendengHidden(g, o),
          async (g, ctx, o) => {
            // Cẩm nang trì hoãn đã nằm trong khu phán định của bạn: bỏ nó đi
            if (g.cardInfo(ctx.as)?.type === 'delayed' && g.player(o).judgeArea.includes(ctx.card.id)) {
              await g.moveCards([ctx.card.id], { kind: 'judge', seat: o }, { kind: 'discard' }, 'xushi');
            }
            cancelTarget(g, ctx, o);
            g.say(`${name(g, o)} hủy bỏ mục tiêu ${g.cardInfo(ctx.as).label} đối với mình.`);
            if (g.player(ctx.seat).alive && g.cardCount(ctx.seat) > 0) await discardFrom(g, o, ctx.seat, `Hư Thực: bỏ 1 lá của ${name(g, ctx.seat)}`);
          }),
      ],
    },

    // ================= Thạch Thao =================
    {
      id: 'jiange', name: 'Kiếm Ca',
      desc: 'Bạn có thể chuyển hóa sử dụng/đánh ra lá phi cơ bản thành [Sát].',
      convert: (_g, _s, c) => (!isBasic(c) ? ['sha'] : []),
    },
    {
      id: 'qianxue', name: 'Tiềm Học', position: 'main',
      desc: 'Chủ tướng kỹ, Giảm 0.5 máu gốc: Khi 1 người kết thúc lượt, bạn có thể thu lấy tối đa X lá trong những lá đã tiến vào chồng bài bỏ trong lượt này '
        + '(X là số vùng của bạn mà đã mất đi lá cuối cùng trong lượt này); ▶ Bạn cần ưu tiên thu lấy những lá phi cơ bản trước; '
        + '▶ Bạn không thể thu lấy [Hiệp Thiên Tử Dĩ Lệnh Chư Hầu].',
      triggers: [
        ...halfHpObservers('shitao'),
        observe('cardsMoved', (g, ctx, o) => {
          const qx = qianxueState(g, o);
          if (ctx.to.kind === 'discard') for (const id of ctx.cardIds) qx.ids.add(id);
          const f = ctx.from;
          if (f.seat !== o || !g.player(o).alive) return;
          const p = g.player(o);
          if (f.kind === 'hand' && p.hand.length === 0) qx.zones.add('hand');
          if (f.kind === 'equip' && equipsOf(g, o).length === 0) qx.zones.add('equip');
          if (f.kind === 'judge' && p.judgeArea.length === 0) qx.zones.add('judge');
        }),
        on('turnEnd', (g, _ctx, o) => g.player(o).alive && qianxueState(g, o).zones.size > 0 && qianxuePool(g, o).length > 0,
          async (g, _ctx, o) => {
            const qx = qianxueState(g, o);
            const x = qx.zones.size;
            qx.zones.clear();
            const pool = qianxuePool(g, o);
            const nb = pool.filter((id) => !isBasic(g.card(id)));
            const basic = pool.filter((id) => isBasic(g.card(id)));
            let got = [];
            if (nb.length) got = await g.chooseCards(o, `Tiềm Học: thu lấy tối đa ${x} lá phi cơ bản`, nb, 0, Math.min(x, nb.length), true);
            if (got.length === nb.length && got.length < x && basic.length) {
              got = [...got, ...await g.chooseCards(o, `Tiềm Học: thu lấy thêm tối đa ${x - got.length} lá cơ bản`, basic, 0, Math.min(x - got.length, basic.length), true)];
            }
            const ok = got.filter((id) => g.state.discardPile.includes(id));
            if (!ok.length) return;
            await g.moveCards(ok, { kind: 'discard' }, { kind: 'hand', seat: o }, 'qianxue');
            g.say(`${name(g, o)} thu lấy ${ok.map((id) => label(g, id)).join(', ')}.`);
          }),
      ],
    },
    {
      id: 'zhuhu', name: 'Trục Cốc',
      desc: 'Tỏa định kỹ: Sau khi người cùng thế lực với bạn đổi Phó tướng hoặc trận vong, nếu vị trí của tướng này là: '
        + '- Chủ tướng và tướng còn lại của bạn là tướng đơn thế lực: Bạn hoán đổi Chủ tướng và Phó tướng - Phó tướng: Bạn thoát khỏi trạng thái xích; '
        + '▶ Bạn đổi Phó tướng.',
      triggers: [
        on('deputyTransformed', (g, ctx, o) => ctx.seat !== o && g.player(o).alive && g.isAliveSeat(ctx.seat) && allyOf(g, ctx.seat, o) && shitaoSlot(g, o) !== null,
          async (g, ctx, o) => { if (g.isSameFaction(ctx.seat, o)) await zhuhuRun(g, o); }, { compulsory: true }),
        on('death', (g, ctx, o) => ctx.seat !== o && g.player(o).alive && allyOf(g, ctx.seat, o) && shitaoSlot(g, o) !== null,
          async (g, ctx, o) => { if (g.isSameFaction(ctx.seat, o)) await zhuhuRun(g, o); }, { compulsory: true }),
      ],
    },

    // ================= Tôn Hoàn =================
    {
      id: 'nizhan', name: 'Nghịch Trảm',
      desc: 'Khi kết thúc lượt của người khác, nếu bạn đã triệt tiêu lá bài do họ sử dụng trong lượt này hoặc bạn đã mất đi lá cuối cùng trên tay, '
        + 'bạn có thể chọn 1 mục: 1. Bạn thu lấy 1 lá của họ; 2. Bạn xem như sử dụng 1 [Sát] Bỏ qua phòng cụ với họ. '
        + '(Đơn giản hóa: "triệt tiêu" = bạn né Sát của họ bằng Thiểm, hoặc bạn đánh Vô Giải trong lượt của họ.)',
      triggers: [
        observe('slashDodged', (g, ctx, o) => {
          if (ctx.target === o && ctx.source === g.state.currentSeat && ctx.source !== o) store(g)[`nizhan:${o}`] = T(g);
        }),
        observe('cardResponded', (g, ctx, o) => {
          if (ctx.seat === o && ctx.as === 'wuxie' && g.state.currentSeat !== o) store(g)[`nizhan:${o}`] = T(g);
        }),
        observe('cardsMoved', (g, ctx, o) => {
          if (ctx.from.kind === 'hand' && ctx.from.seat === o && g.state.currentSeat !== o && g.player(o).alive
            && hand(g, o).length === 0) store(g)[`nizhan:${o}`] = T(g);
        }),
        on('turnEnd', (g, ctx, o) => ctx.seat !== o && g.player(o).alive && g.isAliveSeat(ctx.seat) && store(g)[`nizhan:${o}`] === T(g)
          && (g.cardCount(ctx.seat) > 0 || (g.canTarget(o, ctx.seat) && g.canBeSlashTarget(o, ctx.seat))),
          async (g, ctx, o) => {
            store(g)[`nizhan:${o}`] = -1;
            const t = ctx.seat;
            const opts = [];
            if (g.cardCount(t) > 0) opts.push(['take', `Thu lấy 1 lá của ${name(g, t)}`]);
            if (g.canTarget(o, t) && g.canBeSlashTarget(o, t)) opts.push(['sha', `Xem như dùng Sát (bỏ qua phòng cụ) với ${name(g, t)}`]);
            if (!opts.length) return;
            const i = opts.length > 1 ? await g.choose(o, 'Nghịch Trảm: chọn 1 mục', opts.map((x) => x[1])) : 0;
            if (opts[i][0] === 'take') { await takeFrom(g, o, t, `Nghịch Trảm: chọn lá của ${name(g, t)}`); return; }
            const f = g.player(t).flags;
            f.turn_ignoreArmor = 1;
            try {
              await g.useCardAs(o, 'sha', [t], [], { label: 'Nghịch Trảm' });
            } finally {
              delete f.turn_ignoreArmor;
            }
          }),
      ],
    },
  ],
};

// ---------------- Hàm trợ giúp cho từng tướng ----------------

function huxunCanGain(g, o) {
  const me = g.player(o).maxHp;
  return g.alivePlayers().some((p) => p.seat !== o && p.maxHp >= me);
}

function ambushes(g, s) {
  const k = `shefu:${s}`;
  const list = (store(g)[k] ??= []);
  const sp = g.player(s).special;
  const live = list.filter((id) => sp.includes(id));
  list.length = 0;
  list.push(...live);
  return list;
}

/** Loại lá có thể bị Phục Binh hủy: 'basic' (Sát), 'trick', 'delayed', 'equip'; null nếu không. */
function shefuKind(g, as) {
  if (as === 'sha') return 'basic';
  const t = g.cardInfo(as)?.type;
  return t === 'trick' || t === 'delayed' || t === 'equip' ? t : null;
}

function tanfengTargets(g, o) {
  return others(g, o, (s) => !allyOf(g, s, o) && (allCards(g, s).length > 0 || g.player(s).judgeArea.length > 0));
}

function lostSkill(g, s, id) {
  return !!store(g)[`lost:${s}`]?.has(id);
}

/** Trúc Khoa: phát hiện lúc bạn vừa bị xích / vừa bị chồng tướng. Dùng chính object ctx làm "vé" để lần kiểm tra lại sau khi xác nhận vẫn đúng. */
function zhukeCheck(g, ctx, o) {
  const k = `zhuke:${o}`;
  const st = (store(g)[k] ??= { chained: false, faceDown: false, token: null });
  const p = g.player(o);
  if (!p.alive) return false;
  const nowC = !!p.chained, nowF = !!p.faceDown;
  const fresh = (nowC && !st.chained) || (nowF && !st.faceDown);
  st.chained = nowC;
  st.faceDown = nowF;
  if (fresh) st.token = ctx;
  if (st.token !== ctx) return false;
  return sameFactionSeats(g, o).some((s) => g.player(s).hp < g.player(s).maxHp);
}

/** Quân lệnh do `issuer` ban cho `target` (giống engine, nhưng không hỏi lại có chấp hành không). */
async function doOrder(g, issuer, target, order) {
  const p = g.player(target);
  if (!p.alive) return;
  g.say(`${name(g, target)} chấp hành ${ORDER_SHORT[order]}.`);
  const own = () => allCards(g, target);
  switch (order) {
    case 0: {
      const [t] = await g.chooseTargets(issuer, 'Quân lệnh: chọn người chịu 1 sát thương', aliveSeats(g), 1, 1, 'enemy');
      if (t !== undefined) await g.damage({ source: target, target: t, amount: 1, card: null, cancelled: false });
      break;
    }
    case 1: {
      await g.draw(target, 1);
      if (target === issuer) break;
      const k = Math.min(2, own().length);
      const ids = k ? await g.chooseCards(target, `Quân lệnh: giao ${k} lá cho ${name(g, issuer)}`, own(), k, k, true) : [];
      await give(g, target, issuer, ids, 'order');
      break;
    }
    case 2: await g.loseHp(target, 1); break;
    case 3: p.flags.turn_banHand = 1; break;
    case 4: g.turnOver(target); break;
    case 5: {
      const keepH = p.hand.length ? await g.chooseCards(target, 'Quân lệnh: giữ lại 1 lá trên tay', [...p.hand], 1, 1) : [];
      const eqs = equipsOf(g, target);
      const keepE = eqs.length ? await g.chooseCards(target, 'Quân lệnh: giữ lại 1 trang bị', eqs, 1, 1, true) : [];
      const drop = own().filter((x) => !keepH.includes(x) && !keepE.includes(x));
      for (const id of drop) {
        const z = zoneOf(g, target, id);
        if (z) await g.moveCards([id], z, { kind: 'discard' }, 'order');
      }
      break;
    }
    default: break;
  }
}

function caoangSlot(g, o) {
  const w = slotOf(g, o, 'caoang');
  return w && !g.hero(o)[w].removed ? w : null;
}

/** Hiếu Liêm (phần 2): sau khi tướng Tào Ngang bị loại bỏ (kể cả bị đổi phó tướng), người cùng thế lực rút 1 lá. */
function installCaoangRemoval(g) {
  const s = store(g);
  if (s.caoangRemovalInstalled) return;
  s.caoangRemovalInstalled = true;
  g.bus.on('generalRemoved', async ({ seat, generalId }) => {
    if (generalId !== 'caoang' || g.state.finished) return;
    g.say('Hiếu Liêm: tướng Tào Ngang bị loại bỏ, người cùng thế lực rút 1 lá.');
    const list = g.isAliveSeat(seat) ? sameFactionSeats(g, seat) : aliveSeats(g).filter((x) => g.isSameFaction(x, seat));
    for (const x of list) if (g.player(x).alive) await g.draw(x, 1);
  });
}

function jutianOpt1(g, ctx, o) {
  if (store(g)[`jutian1:${o}`] === T(g)) return [];
  const v = ctx.target;
  return aliveSeats(g).filter((s) => (s === v || g.isSameFaction(s, v)) && hand(g, s).length > g.player(s).hp);
}
function jutianOpt2(g, o, hypothetical) {
  if (store(g)[`jutian2:${o}`] === T(g)) return [];
  const pool = hypothetical && !g.isRevealedAny(o) ? aliveSeats(g).filter((s) => allyOf(g, s, o)) : sameFactionSeats(g, o);
  return pool.filter((s) => hand(g, s).length < g.player(s).maxHp);
}

function haokuiCards(g, hk) {
  return [...new Set(hk.ids)].filter((id) => g.state.discardPile.includes(id));
}
/** Người nhận Hào Khôi: người khác đã có thế lực; ưu tiên đại thế lực, rồi người nhiều máu nhất. */
function haokuiReceivers(g, o) {
  // Người thế lực xác định KHÁC bạn (không cùng phe)
  const det = aliveSeats(g).filter((s) => s !== o && g.isRevealedAny(s) && !g.isSameFaction(o, s));
  const big = det.filter((s) => g.isBig(s));
  if (big.length) return big;
  const top = Math.max(...det.map((s) => g.player(s).hp));
  return det.filter((s) => g.player(s).hp === top);
}

function chendengHidden(g, o) {
  const w = slotOf(g, o, 'chendeng');
  return !!w && !g.hero(o)[w].revealed && !g.hero(o)[w].removed;
}

function qianxueState(g, o) {
  const k = `qianxue:${o}`;
  let st = store(g)[k];
  if (!st || st.turn !== T(g)) st = store(g)[k] = { turn: T(g), ids: new Set(), zones: new Set() };
  return st;
}
function qianxuePool(g, o) {
  return [...qianxueState(g, o).ids].filter((id) => g.state.discardPile.includes(id) && g.card(id).name !== 'xietianzi');
}

function shitaoSlot(g, o) {
  const w = slotOf(g, o, 'shitao');
  return w && !g.hero(o)[w].removed ? w : null;
}

async function zhuhuRun(g, o) {
  const which = shitaoSlot(g, o);
  if (!which || !g.player(o).alive) return;
  const h = g.hero(o);
  if (which === 'main') {
    if (h.deputy.removed) return;
    [h.main, h.deputy] = [h.deputy, h.main];
    g.say(`${name(g, o)} hoán đổi chủ tướng và phó tướng.`);
  } else if (g.player(o).chained) {
    g.player(o).chained = false;
    g.say(`${name(g, o)} thoát trạng thái xích.`);
  }
  await g.transformDeputy(o, { owner: o, skill: 'zhuhu' });
}
