// ============================================================
// Gói tướng nhóm B — Bất Thần (君临天下·不臣篇), Quyền, Tung Hoành Bãi Hạp, Thập Chu Niên, Mobile.
// Mô tả kỹ năng theo content/import/qsgs-viet.json (bản Việt hóa QSanguosha-Hegemony).
// Chỗ đơn giản hóa ghi "(đơn giản hóa: ...)" ở cuối mô tả.
// ============================================================
import {
  allCards, chooseOwn, discardFrom, discardOwn, drawOrder, askOrder, hand, isBasic, isEquip, isRed, label,
  limitedUsed, markLimited, moveToBottom, name, observe, on, others, putEquip, sameFactionSeats, slotOf, store,
  takeFrom, zoneOf, SLOTS,
} from './lib/tro-giup.mjs';

// ---------------------------------------------------------------
// Trợ giúp riêng của gói này
// ---------------------------------------------------------------

/** Chồng bài có tên trên tướng (các lá nằm ở vùng `special`, gắn nhãn theo tên chồng để không lẫn với kỹ năng khác). */
function tags(g, nm) {
  const s = store(g);
  const k = `bt_pile:${nm}`;
  if (!s[k]) s[k] = new Map();
  return s[k];
}
const pileOf = (g, seat, nm) => g.player(seat).special.filter((id) => tags(g, nm).get(id) === seat);
async function toPile(g, seat, nm, ids, reason = nm) {
  for (const id of ids) {
    let from = null;
    if (g.state.processing.includes(id)) from = { kind: 'processing' };
    else {
      for (const p of g.state.players) { from = zoneOf(g, p.seat, id); if (from) break; }
    }
    if (!from) continue;
    tags(g, nm).set(id, seat);
    await g.moveCards([id], from, { kind: 'special', seat }, reason);
  }
  if (ids.length) g.say(`${name(g, seat)} đặt ${ids.map((id) => label(g, id)).join(', ')} lên tướng làm [${nm}] (${pileOf(g, seat, nm).length}).`);
}
async function fromPile(g, seat, nm, ids, to, reason = nm) {
  for (const id of ids) {
    tags(g, nm).delete(id);
    if (g.player(seat).special.includes(id)) await g.moveCards([id], { kind: 'special', seat }, to, reason);
  }
}

/** Lý do di chuyển bài KHÔNG phải là "bỏ bài" (dùng, đánh ra, trang bị bị thay, chết...). */
const NOT_DISCARD = new Set(['use', 'respond', 'settle', 'save', 'death', 'replace', 'judge', 'recast', 'equip', 'reshuffle',
  'transfer', 'delayed', 'judgePhase', 'shandian', 'draw', 'deal', 'reveal']);
const isDiscardMove = (ctx) => ctx.to.kind === 'discard' && (ctx.from.kind === 'hand' || ctx.from.kind === 'equip')
  && !NOT_DISCARD.has(ctx.reason);

/** `x` đã có thế lực và khác thế lực với `o` (nếu `o` chưa lật thì so với thế lực thật của `o`). */
function diffFaction(g, o, x) {
  if (x === o || !g.isRevealedAny(x)) return false;
  if (g.isRevealedAny(o)) return !g.isSameFaction(o, x);
  const k = g.shownKingdom(x);
  if (k === 'careerist' && g.hero(o).careerist && g.hero(o).careeristGroup !== undefined && g.hero(x).careeristGroup === g.hero(o).careeristGroup) return false;
  return k === 'careerist' || k !== g.realKingdom(o);
}
const dmg = (g, source, target, amount = 1) => g.damage({ source, target, amount, card: null, cancelled: false });
const turnKey = (g) => `${g.state.turnCount}`;
const phaseKey = (g) => `${g.state.turnCount}:${g.state.phase}`;
const revealedCount = (g, s) => { const h = g.hero(s); return (h.main.revealed ? 1 : 0) + (h.deputy.revealed ? 1 : 0); };
const isBlackCard = (c) => !isRed(c);

/** Bộ đếm theo khóa (lượt/giai đoạn). */
function counter(g, id, seat, key) {
  const s = store(g);
  const k = `bt_cnt:${id}:${seat}`;
  if (!s[k] || s[k].key !== key) s[k] = { key, n: 0 };
  return s[k];
}

/** Số thế lực có người bị thương (người chưa có thế lực không tính; mỗi dã tâm gia là 1 thế lực). */
function woundedFactions(g) {
  const ks = new Set();
  for (const p of g.alivePlayers()) {
    if (p.hp >= p.maxHp) continue;
    const k = g.factionKeyOf(p.seat); // nhóm Dã tâm gia chung khóa
    if (k !== null) ks.add(k);
  }
  return ks.size;
}

/** Người chơi `t` có thế lực trùng với thế lực in trên tướng `gid` không. */
function matchesGeneralKingdom(g, t, gid) {
  const k = g.generalKingdom(gid);
  const s = g.shownKingdom(t);
  if (s === null || k === null) return false;
  return k === 'ye' ? s === 'careerist' : s === k;
}

const XINGZHAO_HINT = 'Hưng Thạo';

export default {
  skills: [
    // ================= Mạnh Đạt =================
    {
      id: 'qiuan', name: 'Cầu An',
      desc: 'Khi bạn nhận sát thương, nếu bạn không có [Hàm], bạn có thể đem lá gây sát thương cho bạn đặt lên tướng này, gọi là [Hàm], sau đó chặn sát thương này.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.target === o && !ctx.cancelled && ctx.card && ctx.card.id >= 0
          && g.state.processing.includes(ctx.card.id) && pileOf(g, o, 'Hàm').length === 0,
          async (g, ctx, o) => {
            await toPile(g, o, 'Hàm', [ctx.card.id], 'qiuan');
            ctx.cancelled = true;
            g.say(`${name(g, o)} chặn sát thương này.`);
          }),
      ],
    },
    {
      id: 'liangfan', name: 'Lượng Phản',
      desc: 'Tỏa định kỹ: Khi bắt đầu giai đoạn chuẩn bị, nếu bạn có [Hàm], bạn mất 1 máu, sau đó thu lấy tất cả [Hàm]; '
        + 'trong lượt này, sau khi bạn gây sát thương cho 1 người do sử dụng [Hàm], bạn có thể thu lấy 1 lá của họ.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && pileOf(g, o, 'Hàm').length > 0,
          async (g, _ctx, o) => {
            await g.loseHp(o, 1);
            if (!g.player(o).alive) return;
            const ids = pileOf(g, o, 'Hàm');
            await fromPile(g, o, 'Hàm', ids, { kind: 'hand', seat: o }, 'liangfan');
            store(g)[`liangfan:${o}`] = { turn: g.state.turnCount, ids };
            g.say(`${name(g, o)} thu lại ${ids.length} [Hàm].`);
          }, { compulsory: true }),
        on('damaged', (g, ctx, o) => {
          const r = store(g)[`liangfan:${o}`];
          return !!r && r.turn === g.state.turnCount && ctx.source === o && ctx.target !== o && ctx.card
            && r.ids.includes(ctx.card.id) && g.player(ctx.target).alive && g.cardCount(ctx.target) > 0;
        }, async (g, ctx, o) => { await takeFrom(g, o, ctx.target, 'Lượng Phản: chọn lá để lấy'); }),
      ],
    },

    // ================= Đường Tư =================
    {
      id: 'xingzhao', name: 'Hưng Thạo',
      desc: 'Tỏa định kỹ: Dựa theo số thế lực trên bàn chơi có người bị thương: 1+: bạn có kỹ năng »Tuân Tuân«; '
        + '2+: sau khi bạn nhận sát thương, nếu số bài trên tay bạn và nguồn sát thương khác nhau, người ít bài trên tay hơn rút 1 lá; '
        + '3+: giai đoạn bỏ bài, giới hạn trữ bài của bạn +4; 4+: khi bạn mất bài trong vùng trang bị, bạn rút 1 lá.',
      handLimitBonus: (g) => (g.state.phase === 'discard' && woundedFactions(g) >= 3 ? 4 : 0),
      triggers: [
        // 1+: Tuân Tuân
        on('drawPhase', (g, ctx, o) => ctx.seat === o && ctx.count > 0 && woundedFactions(g) >= 1 && g.state.drawPile.length >= 4,
          async (g, ctx, o) => {
            ctx.count = 0;
            const top = g.state.drawPile.slice(-4).reverse();
            const keep = await g.chooseCards(o, `${XINGZHAO_HINT} (Tuân Tuân): chọn 2 lá để lấy`, top, 2, 2, true);
            await g.moveCards(keep, { kind: 'draw' }, { kind: 'hand', seat: o }, 'xunxun');
            moveToBottom(g, top.filter((id) => !keep.includes(id)));
            g.say(`${name(g, o)} lấy 2 lá, đặt 2 lá xuống đáy chồng bài.`);
          }),
        // 2+
        on('damaged', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive
          && woundedFactions(g) >= 2 && hand(g, o).length !== hand(g, ctx.source).length,
          async (g, ctx, o) => {
            const who = hand(g, o).length < hand(g, ctx.source).length ? o : ctx.source;
            await g.draw(who, 1);
          }, { compulsory: true }),
        // 4+
        on('cardsMoved', (g, ctx, o) => ctx.from.kind === 'equip' && ctx.from.seat === o && g.player(o).alive
          && !(ctx.to.kind === 'equip' && ctx.to.seat === o) && woundedFactions(g) >= 4,
          async (g, _ctx, o) => { await g.draw(o, 1); }, { compulsory: true }),
      ],
    },

    // ================= Trương Lỗ =================
    {
      id: 'bushi', name: 'Bố Thí',
      desc: 'Khi kết thúc lượt, bạn nhận X [Nghĩa Xá] (X là số máu của bạn). Khi bắt đầu giai đoạn chuẩn bị của người khác, nếu bạn có [Nghĩa Xá], '
        + 'bạn có thể giao 1 lá cho họ, sau đó bỏ 1 [Nghĩa Xá] và rút 2 lá. Khi bắt đầu giai đoạn chuẩn bị của bạn, bạn bỏ X lá '
        + '(X là số người còn sống trừ số máu của bạn và trừ 2), sau đó bỏ tất cả [Nghĩa Xá].',
      triggers: [
        on('turnEnd', (g, ctx, o) => ctx.seat === o && g.player(o).alive && g.player(o).hp > 0, (g, _ctx, o) => {
          const s = store(g);
          s[`yishe:${o}`] = (s[`yishe:${o}`] ?? 0) + g.player(o).hp;
          g.say(`${name(g, o)} nhận ${g.player(o).hp} [Nghĩa Xá] (có ${s[`yishe:${o}`]}).`);
        }, { compulsory: true }),
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'start' && g.player(ctx.seat).alive
          && (store(g)[`yishe:${o}`] ?? 0) > 0 && allCards(g, o).length > 0,
          async (g, ctx, o) => {
            const [id] = await g.chooseCards(o, `Bố Thí: giao 1 lá cho ${name(g, ctx.seat)}`, allCards(g, o), 1, 1);
            const z = zoneOf(g, o, id);
            if (z) await g.moveCards([id], z, { kind: 'hand', seat: ctx.seat }, 'bushi');
            g.say(`${name(g, o)} giao 1 lá cho ${name(g, ctx.seat)}.`);
            store(g)[`yishe:${o}`] -= 1;
            await g.draw(o, 2);
          }),
        on('phaseStart', (g, ctx, o) => {
          if (ctx.seat !== o || ctx.phase !== 'start') return false;
          const x = g.alivePlayers().length - g.player(o).hp - 2;
          return (store(g)[`yishe:${o}`] ?? 0) > 0 || (x > 0 && allCards(g, o).length > 0);
        }, async (g, _ctx, o) => {
          const x = Math.min(g.alivePlayers().length - g.player(o).hp - 2, allCards(g, o).length);
          if (x > 0) {
            const ids = await chooseOwn(g, o, `Bố Thí: bỏ ${x} lá`, x, x);
            if (ids?.length) await discardOwn(g, o, ids);
          }
          if (store(g)[`yishe:${o}`]) g.say(`${name(g, o)} bỏ tất cả [Nghĩa Xá].`);
          store(g)[`yishe:${o}`] = 0;
        }, { compulsory: true }),
      ],
    },
    {
      id: 'midao', name: 'Mễ Đạo',
      desc: 'Khi bắt đầu giai đoạn kết thúc, nếu không có [Mễ], bạn có thể rút 2 lá, sau đó đặt 2 lá (bài trên tay hoặc trang bị) lên tướng này, gọi là [Mễ]. '
        + 'Khi phán xét của 1 người có hiệu lực, bạn có thể đánh ra 1 [Mễ] để thay đổi kết quả phán xét, sau đó thu lấy lá phán xét ban đầu.',
      bot: { confirm: (v) => v.phase === 'end' },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && pileOf(g, o, 'Mễ').length === 0,
          async (g, _ctx, o) => {
            await g.draw(o, 2);
            const pool = allCards(g, o); // bài trên tay + trang bị
            const n = Math.min(2, pool.length);
            if (!n) return;
            const ids = await g.chooseCards(o, 'Mễ Đạo: chọn 2 lá (trên tay hoặc trang bị) đặt lên tướng làm [Mễ]', pool, n, n);
            await toPile(g, o, 'Mễ', ids, 'midao');
          }),
        on('judged', (g, ctx, o) => pileOf(g, o, 'Mễ').length > 0 && g.state.processing.includes(ctx.card.id),
          async (g, ctx, o) => {
            const [id] = await g.chooseCards(o, 'Mễ Đạo: chọn 1 [Mễ] để thay lá phán định', pileOf(g, o, 'Mễ'), 1, 1, true);
            if (id === undefined) return;
            const old = ctx.card;
            await fromPile(g, o, 'Mễ', [id], { kind: 'processing' }, 'midao');
            if (g.state.processing.includes(old.id)) await g.moveCards([old.id], { kind: 'processing' }, { kind: 'hand', seat: o }, 'midao');
            ctx.card = g.card(id);
            g.say(`${name(g, o)} đánh ra [Mễ] ${label(g, id)} thay cho lá phán định ${label(g, old.id)}.`);
          }),
      ],
    },

    // ================= Sĩ Nhiếp =================
    {
      id: 'biluan', name: 'Tị Loạn',
      desc: 'Tỏa định kỹ: Khoảng cách từ người khác tới bạn +X (X là số lá trong vùng trang bị của bạn).',
      defenseBonus: (g, o) => g.equipCount(o),
    },
    {
      id: 'lixia', name: 'Lễ Hạ',
      desc: 'Tỏa định kỹ: Khi bắt đầu giai đoạn chuẩn bị của người thế lực khác bạn, nếu bạn không ở trong tầm đánh của họ, bạn lệnh họ chọn 1 mục: '
        + '1. Lệnh bạn rút 1 lá; 2. Bỏ 1 lá trong vùng trang bị của bạn, sau đó họ mất 1 máu.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'start' && g.player(ctx.seat).alive && diffFaction(g, o, ctx.seat)
          && g.distance(ctx.seat, o) > g.attackRange(ctx.seat),
          async (g, ctx, o) => {
            const t = ctx.seat;
            const eqs = SLOTS.flatMap((sl) => g.player(o).equips[sl]);
            const opts = [`Để ${name(g, o)} rút 1 lá`];
            if (eqs.length) opts.push(`Bỏ 1 trang bị của ${name(g, o)}, rồi bạn mất 1 máu`);
            const i = opts.length > 1 ? await g.choose(t, `Lễ Hạ của ${name(g, o)}: chọn 1 mục`, opts) : 0;
            if (i === 0) { await g.draw(o, 1); return; }
            const [e] = await g.chooseCards(t, `Lễ Hạ: chọn trang bị của ${name(g, o)} để bỏ`, eqs, 1, 1, true);
            const z = zoneOf(g, o, e);
            if (z) await g.moveCards([e], z, { kind: 'discard' }, 'lixia');
            g.say(`${name(g, t)} bỏ ${label(g, e)} của ${name(g, o)}.`);
            await g.loseHp(t, 1);
          }, { compulsory: true }),
      ],
    },

    // ================= Chung Hội =================
    {
      id: 'quanji', name: 'Quyền Kế',
      desc: 'Một lần trong lượt của mỗi người ứng với mỗi thời điểm, sau khi bạn gây hoặc nhận sát thương, bạn có thể rút 1 lá, '
        + 'sau đó đặt ngửa 1 lá lên tướng này, gọi là [Quyền]. Giới hạn trữ bài của bạn +X (X là số [Quyền]). '
        + '(đơn giản hóa: gây sát thương cho người đã trận vong thì không kích hoạt.)',
      handLimitBonus: (g, o) => pileOf(g, o, 'Quyền').length,
      triggers: [
        on('damaged', (g, ctx, o) => g.player(o).alive && ((ctx.target === o && counter(g, 'quanji_in', o, turnKey(g)).n === 0)
          || (ctx.source === o && counter(g, 'quanji_out', o, turnKey(g)).n === 0)),
          async (g, ctx, o) => {
            const kind = ctx.target === o && counter(g, 'quanji_in', o, turnKey(g)).n === 0 ? 'quanji_in' : 'quanji_out';
            counter(g, kind, o, turnKey(g)).n++;
            await g.draw(o, 1);
            if (!hand(g, o).length) return;
            const [id] = await g.chooseCards(o, 'Quyền Kế: chọn 1 lá đặt lên tướng làm [Quyền]', [...hand(g, o)], 1, 1);
            await toPile(g, o, 'Quyền', [id], 'quanji');
          }),
      ],
    },
    {
      id: 'paiyi', name: 'Bài Dị',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể đưa 1 [Quyền] vào chồng bài bỏ và chọn 1 người, họ rút X lá (X là số [Quyền] bạn có, tối đa 7); '
        + 'nếu số bài trên tay họ > bạn, bạn gây 1 sát thương cho họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.paiyi && pileOf(g, s, 'Quyền').length > 0,
        validTarget: (g, _s, t) => g.isAliveSeat(t),
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.paiyi = 1;
          const [id] = await g.chooseCards(s, 'Bài Dị: chọn 1 [Quyền] để bỏ', pileOf(g, s, 'Quyền'), 1, 1, true);
          await fromPile(g, s, 'Quyền', [id], { kind: 'discard' }, 'paiyi');
          const x = Math.min(7, pileOf(g, s, 'Quyền').length);
          if (x > 0) await g.draw(t, x);
          if (t !== s && g.player(t).alive && hand(g, t).length > hand(g, s).length) await dmg(g, s, t);
        },
      },
    },

    // ================= Đổng Chiêu =================
    {
      id: 'quanjin', name: 'Khuyến Tiến',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể giao 1 lá trên tay cho người từng nhận sát thương trong giai đoạn này và lệnh họ chấp hành 1 [Quân Lệnh]: '
        + 'nếu họ chấp hành, bạn rút 1 lá; nếu không và bạn không phải người có nhiều bài trên tay nhất, bạn bổ sung bài trên tay đến khi bằng người '
        + 'có nhiều bài trên tay nhất, tối đa 5 lá.',
      bot: { use: 'always', target: 'any' },
      triggers: [
        observe('damageDealt', (g, ctx, o) => {
          if (g.state.currentSeat !== o || g.state.phase !== 'play') return;
          const c = counter(g, 'quanjin_hurt', o, phaseKey(g));
          (c.set ??= new Set()).add(ctx.target);
        }),
      ],
      active: {
        cards: 'one', target: 'one',
        available: (g, s) => !g.player(s).flags.quanjin && hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && g.isAliveSeat(t) && !!counter(g, 'quanjin_hurt', s, phaseKey(g)).set?.has(t),
        run: async (g, s, [cid], [t]) => {
          g.player(s).flags.quanjin = 1;
          await g.moveCards([cid], { kind: 'hand', seat: s }, { kind: 'hand', seat: t }, 'quanjin');
          g.say(`${name(g, s)} giao 1 lá cho ${name(g, t)}.`);
          const order = await drawOrder(g, s);
          if (await askOrder(g, s, t, order)) {
            if (g.player(s).alive) await g.draw(s, 1);
            return;
          }
          if (!g.player(s).alive) return;
          const most = Math.max(...g.alivePlayers().map((p) => p.hand.length));
          const need = Math.min(5, most - hand(g, s).length);
          if (need > 0) await g.draw(s, need);
        },
      },
    },
    {
      id: 'zaoyun', name: 'Tạc Vận',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác thế lực (đã xác định) mà khoảng cách từ bạn đến họ lớn hơn 1 và bỏ X lá bài trên tay '
        + '(X là khoảng cách từ bạn đến họ −1), lệnh khoảng cách từ bạn đến họ là 1 trong lượt này, sau đó bạn gây 1 sát thương cho họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.zaoyun,
        validTarget: (g, s, t) => {
          if (!g.isAliveSeat(t) || !diffFaction(g, s, t)) return false;
          const d = g.distance(s, t);
          return Number.isFinite(d) && d > 1 && hand(g, s).length >= d - 1;
        },
        run: async (g, s, _c, [t]) => {
          const p = g.player(s);
          p.flags.zaoyun = 1;
          const x = g.distance(s, t) - 1;
          const ids = await g.chooseCards(s, `Tạc Vận: bỏ ${x} lá trên tay`, [...hand(g, s)], x, x);
          await discardOwn(g, s, ids);
          p.flags.fenxunTarget = t + 1;
          g.say(`Khoảng cách từ ${p.name} đến ${name(g, t)} là 1 trong lượt này.`);
          await dmg(g, s, t);
        },
      },
    },

    // ================= Nghiêm Bạch Hổ =================
    {
      id: 'zhidao', name: 'Trĩ Đạo',
      desc: 'Tỏa định kỹ: Khi bắt đầu giai đoạn ra bài, bạn chọn 1 người khác, trong lượt này: khoảng cách từ bạn đến họ là 1; '
        + 'bạn không thể chỉ định người khác ngoại trừ họ làm mục tiêu sử dụng bài; sau khi bạn gây sát thương cho họ lần đầu tiên trong giai đoạn này, '
        + 'bạn thu lấy 1 lá trong vùng chơi của họ. (đơn giản hóa: hạn chế mục tiêu áp dụng cho cả kỹ năng.)',
      restrictTarget: (g, o, t) => g.state.currentSeat === o && (g.player(o).flags.zhidaoTarget ?? 0) > 0
        && t !== o && t !== g.player(o).flags.zhidaoTarget - 1,
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && g.alivePlayers().some((p) => p.seat !== o && !g.isLured(p.seat)),
          async (g, _ctx, o) => {
            const cands = g.alivePlayers().map((p) => p.seat).filter((s) => s !== o && !g.isLured(s));
            const [t] = await g.chooseTargets(o, 'Trĩ Đạo: chọn 1 người khác', cands, 1, 1, 'enemy');
            if (t === undefined) return;
            const f = g.player(o).flags;
            f.zhidaoTarget = t + 1;
            f.fenxunTarget = t + 1;
            f.zhidaoHit = 0;
            g.say(`${name(g, o)} chọn ${name(g, t)}: lượt này khoảng cách đến họ là 1 và chỉ được dùng bài vào họ.`);
          }, { compulsory: true }),
        on('damaged', (g, ctx, o) => {
          const f = g.player(o).flags;
          return ctx.source === o && g.state.currentSeat === o && g.state.phase === 'play' && (f.zhidaoTarget ?? 0) === ctx.target + 1
            && !f.zhidaoHit && g.player(ctx.target).alive && g.cardCount(ctx.target, true) > 0;
        }, async (g, ctx, o) => {
          g.player(o).flags.zhidaoHit = 1;
          await takeFrom(g, o, ctx.target, 'Trĩ Đạo: chọn lá để lấy', { judge: true });
        }, { compulsory: true }),
      ],
    },
    {
      id: 'jilix', name: 'Ký Li',
      desc: 'Tỏa định kỹ: Sau khi kết toán xong lá cơ bản Đỏ hoặc công cụ phổ thông Đỏ, nếu bạn là mục tiêu duy nhất của lá này, bạn lệnh cho người sử dụng '
        + 'xem như sử dụng lá cùng tên với lá đó với bạn (không giới hạn khoảng cách, số lần sử dụng). Khi bạn nhận sát thương lần thứ 2 trong cùng 1 giai đoạn, '
        + 'bạn chặn sát thương và loại bỏ tướng này. (đơn giản hóa: lá xem như sử dụng không có màu nên không kích hoạt lại.)',
      triggers: [
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.card.id < 0 || ctx.targets.length !== 1 || ctx.targets[0] !== o || !isRed(ctx.card)) return;
          const type = g.cardInfo(ctx.as)?.type;
          if (type !== 'basic' && type !== 'trick') return;
          if (type === 'basic' && !['sha', 'tao', 'jiu'].includes(ctx.as)) return;
          if (type === 'trick') {
            const def = g.trickDef(ctx.as);
            if (!def || !['one', 'self'].includes(def.targeting)) return;
          }
          const s = store(g);
          (s[`jilix:${o}`] ??= new Map()).set(ctx.card.id, { user: ctx.seat, as: ctx.as });
        }),
        observe('damageDealt', (g, ctx, o) => { if (ctx.target === o) counter(g, 'jilix_hit', o, phaseKey(g)).n++; }),
        on('cardsMoved', (g, ctx, o) => ctx.from.kind === 'processing' && !!store(g)[`jilix:${o}`]
          && ctx.cardIds.some((id) => store(g)[`jilix:${o}`].has(id)),
          async (g, ctx, o) => {
            const m = store(g)[`jilix:${o}`];
            const id = ctx.cardIds.find((x) => m.has(x));
            const { user, as } = m.get(id);
            m.delete(id);
            if (!g.player(user).alive || !g.player(o).alive) return;
            if (as === 'sha' && !g.canBeSlashTarget(user, o)) return;
            if (['guohe', 'shunshou'].includes(as) && g.cardCount(o, true) === 0) return;
            if (as === 'huogong' && hand(g, o).length === 0) return;
            if (as === 'jiu' && user !== o) return;
            g.say(`Ký Li: ${name(g, user)} xem như dùng thêm 1 ${g.cardInfo(as).label} với ${name(g, o)}.`);
            await g.useCardAs(user, as, [o], [], { label: 'Ký Li' });
          }, { compulsory: true }),
        on('beforeDamage', (g, ctx, o) => ctx.target === o && !ctx.cancelled && counter(g, 'jilix_hit', o, phaseKey(g)).n === 1,
          async (g, ctx, o) => {
            ctx.cancelled = true;
            g.say(`${name(g, o)} chặn sát thương lần thứ 2 trong giai đoạn này.`);
            const slot = slotOf(g, o, 'yanbaihu');
            if (slot) await g.removeGeneral(o, slot);
          }, { compulsory: true }),
      ],
    },

    // ================= Tư Mã Chiêu =================
    {
      id: 'suzhi', name: 'Túc Trí',
      desc: 'Tỏa định kỹ: Giới hạn ba lần trong lượt của bạn đối với các mục sau: khi bạn gây sát thương cho mục tiêu của [Sát] hoặc [Quyết Đấu], '
        + 'số sát thương +1; khi bạn sử dụng công cụ phi chuyển hóa, bạn rút 1 lá; sau khi bài của người khác tiến vào chồng bài bỏ do bỏ đi, '
        + 'bạn thu lấy 1 lá của họ. Nếu chưa phát động »Túc Trí« 3 lần trong lượt: khi bạn kết thúc lượt, bạn nhận kỹ năng »Phản Quỹ« '
        + 'đến khi bắt đầu lượt tiếp theo của bạn. (đơn giản hóa: chưa có hiệu ứng "công cụ không giới hạn khoảng cách".)',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.source === o && ctx.target !== o && !ctx.cancelled && g.state.currentSeat === o
          && (ctx.cardAs === 'sha' || ctx.cardAs === 'juedou') && counter(g, 'suzhi', o, turnKey(g)).n < 3,
          (g, ctx, o) => { counter(g, 'suzhi', o, turnKey(g)).n++; ctx.amount += 1; }, { compulsory: true }),
        on('cardUsed', (g, ctx, o) => ctx.seat === o && g.state.currentSeat === o && !ctx.card.converted && ctx.as === ctx.card.name
          && ['trick', 'delayed'].includes(g.cardInfo(ctx.as)?.type) && counter(g, 'suzhi', o, turnKey(g)).n < 3,
          async (g, _ctx, o) => { counter(g, 'suzhi', o, turnKey(g)).n++; await g.draw(o, 1); }, { compulsory: true }),
        on('cardsMoved', (g, ctx, o) => g.state.currentSeat === o && isDiscardMove(ctx) && ctx.from.seat !== o
          && g.player(ctx.from.seat).alive && g.cardCount(ctx.from.seat) > 0 && counter(g, 'suzhi', o, turnKey(g)).n < 3,
          async (g, ctx, o) => {
            counter(g, 'suzhi', o, turnKey(g)).n++;
            await takeFrom(g, o, ctx.from.seat, 'Túc Trí: chọn lá để lấy');
          }, { compulsory: true }),
        on('turnEnd', (g, ctx, o) => ctx.seat === o && g.player(o).alive && counter(g, 'suzhi', o, turnKey(g)).n < 3
          && !g.grantedSkills(o).includes('phanquy'),
          (g, _ctx, o) => { g.grantSkill(o, 'phanquy'); store(g)[`suzhi_fq:${o}`] = true; }, { compulsory: true }),
        observe('turnStart', (g, ctx, o) => {
          if (ctx.seat === o && store(g)[`suzhi_fq:${o}`]) { g.revokeSkill(o, 'phanquy'); store(g)[`suzhi_fq:${o}`] = false; }
        }),
      ],
    },
    {
      id: 'zhaoxin', name: 'Chiêu Tâm',
      desc: 'Sau khi bạn nhận sát thương, bạn có thể mở tất cả bài trên tay, sau đó hoán đổi bài trên tay với 1 người khác có số lá trên tay ≤ bạn.',
      bot: { confirm: false },
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && others(g, o, (s) => hand(g, s).length <= hand(g, o).length).length > 0,
          async (g, _ctx, o) => {
            g.say(`${name(g, o)} mở bài trên tay: ${hand(g, o).map((id) => label(g, id)).join(', ') || '(không có)'}.`);
            const cands = others(g, o, (s) => hand(g, s).length <= hand(g, o).length);
            const [t] = await g.chooseTargets(o, 'Chiêu Tâm: chọn người để đổi bài trên tay', cands, 1, 1);
            if (t === undefined) return;
            const mine = [...hand(g, o)];
            const theirs = [...hand(g, t)];
            if (mine.length) await g.moveCards(mine, { kind: 'hand', seat: o }, { kind: 'processing' }, 'zhaoxin');
            if (theirs.length) await g.moveCards(theirs, { kind: 'hand', seat: t }, { kind: 'hand', seat: o }, 'zhaoxin');
            if (mine.length) await g.moveCards(mine, { kind: 'processing' }, { kind: 'hand', seat: t }, 'zhaoxin');
            g.say(`${name(g, o)} đổi bài trên tay với ${name(g, t)}.`);
          }),
      ],
    },

    // ================= Tôn Lâm (Tôn Sâm) =================
    {
      id: 'shilu', name: 'Thị Lực',
      desc: 'Sau khi có người trận vong, nếu họ có tướng, bạn có thể đặt tất cả tướng của họ lên tướng này, gọi là [Lục]; nếu họ bị bạn giết, '
        + 'bạn nhận thêm 2 lá từ chồng bài tướng làm [Lục]. Khi bắt đầu giai đoạn chuẩn bị, nếu bạn có [Lục], bạn có thể bỏ tối đa X lá (X là số [Lục]), '
        + 'sau đó rút số lá tương ứng.',
      triggers: [
        on('death', (g, ctx, o) => ctx.seat !== o && g.player(o).alive && !!g.heroes[ctx.seat], (g, ctx, o) => {
          const h = g.hero(ctx.seat);
          const ids = [h.main, h.deputy].filter((x) => !x.removed && !g.generalPile(o, 'Lục').includes(x.generalId)).map((x) => x.generalId);
          g.addGeneralPile(o, 'Lục', ids, true);
          if (ctx.killer === o) g.addGeneralPile(o, 'Lục', g.takeGeneralsFromDeck(2), true);
        }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && g.generalPile(o, 'Lục').length > 0 && allCards(g, o).length > 0,
          async (g, _ctx, o) => {
            const x = g.generalPile(o, 'Lục').length;
            const ids = await chooseOwn(g, o, `Thị Lực: bỏ tối đa ${x} lá rồi rút lại bằng số đó`, 0, x);
            if (!ids?.length) return;
            await discardOwn(g, o, ids);
            await g.draw(o, ids.length);
          }),
      ],
    },
    {
      id: 'xiongnve', name: 'Hung Ngược',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể bỏ 1 [Lục], chọn 1 mục có hiệu quả trong lượt này: 1. khi bạn gây sát thương cho người cùng thế lực '
        + 'với [Lục] đã bỏ, sát thương +1; 2. khi bạn gây sát thương cho người cùng thế lực với [Lục] đã bỏ, thu lấy 1 lá của họ; 3. bạn sử dụng bài với '
        + 'mục tiêu cùng thế lực với [Lục] đã bỏ không giới hạn số lần. Khi kết thúc giai đoạn ra bài, bạn có thể bỏ 2 [Lục]: đến khi bắt đầu lượt tiếp theo '
        + 'của bạn, sát thương bạn phải nhận từ người khác −1. (đơn giản hóa: mục 3 chỉ áp dụng cho số lần dùng Sát.)',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && g.generalPile(o, 'Lục').length > 0,
          async (g, _ctx, o) => {
            const pile = g.generalPile(o, 'Lục');
            const i = pile.length > 1 ? await g.choose(o, 'Hung Ngược: chọn 1 [Lục] để bỏ',
              pile.map((id) => `${g.generalName(id)} (${({ wei: 'Ngụy', shu: 'Thục', wu: 'Ngô', qun: 'Quần', ye: 'Dã tâm gia' })[g.generalKingdom(id)] ?? '?'})`)) : 0;
            const gid = pile[i];
            g.removeFromGeneralPile(o, 'Lục', [gid], true);
            const m = await g.choose(o, 'Hung Ngược: chọn hiệu quả trong lượt này',
              ['Sát thương gây cho họ +1', 'Gây sát thương cho họ thì lấy 1 lá của họ', 'Dùng Sát vào họ không giới hạn số lần']);
            store(g)[`xiongnve:${o}`] = { turn: g.state.turnCount, gid, mode: m };
          }),
        on('beforeDamage', (g, ctx, o) => {
          const r = store(g)[`xiongnve:${o}`];
          return !!r && r.turn === g.state.turnCount && r.mode === 0 && ctx.source === o && ctx.target !== o && !ctx.cancelled
            && matchesGeneralKingdom(g, ctx.target, r.gid);
        }, (_g, ctx) => { ctx.amount += 1; }, { compulsory: true }),
        on('damaged', (g, ctx, o) => {
          const r = store(g)[`xiongnve:${o}`];
          return !!r && r.turn === g.state.turnCount && r.mode === 1 && ctx.source === o && ctx.target !== o
            && g.player(ctx.target).alive && g.cardCount(ctx.target) > 0 && matchesGeneralKingdom(g, ctx.target, r.gid);
        }, async (g, ctx, o) => { await takeFrom(g, o, ctx.target, 'Hung Ngược: chọn lá để lấy'); }, { compulsory: true }),
        on('cardUsed', (g, ctx, o) => {
          const r = store(g)[`xiongnve:${o}`];
          return !!r && r.turn === g.state.turnCount && r.mode === 2 && ctx.seat === o && ctx.as === 'sha' && g.state.currentSeat === o
            && ctx.targets.length > 0 && ctx.targets.every((t) => matchesGeneralKingdom(g, t, r.gid)) && (g.player(o).flags.shaUsed ?? 0) > 0;
        }, (g, _ctx, o) => {
          // cardUsed phát ra trước khi engine cộng lượt Sát -> trừ trước 1 để Sát này không bị tính
          g.player(o).flags.shaUsed -= 1;
        }, { compulsory: true }),
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && g.generalPile(o, 'Lục').length >= 2,
          async (g, _ctx, o) => {
            const pile = g.generalPile(o, 'Lục');
            g.removeFromGeneralPile(o, 'Lục', pile.slice(0, 2), true);
            store(g)[`xiongnve_def:${o}`] = true;
            g.say(`${name(g, o)}: đến đầu lượt sau, sát thương phải nhận từ người khác −1.`);
          }),
        on('beforeDamage', (g, ctx, o) => !!store(g)[`xiongnve_def:${o}`] && ctx.target === o && ctx.source !== null && ctx.source !== o
          && !ctx.cancelled && ctx.amount > 0,
          (g, ctx, o) => { ctx.amount -= 1; g.say(`Hung Ngược: sát thương ${name(g, o)} phải nhận giảm 1.`); }, { compulsory: true }),
        observe('turnStart', (g, ctx, o) => { if (ctx.seat === o) store(g)[`xiongnve_def:${o}`] = false; }),
      ],
    },

    // ================= Văn Khâm =================
    {
      id: 'jinfa', name: 'Căng Phạt',
      desc: 'Một lần trong giai đoạn ra bài, có thể bỏ 1 lá và chọn 1 người khác có bài, họ chọn 1 mục: 1. lệnh bạn lấy 1 lá của họ; '
        + '2. họ giao 1 lá trang bị cho bạn, nếu bạn nhận được lá ♠ và lá đó còn trên tay bạn, xem như họ sử dụng 1 [Sát] với bạn. '
        + '(đơn giản hóa: lá bỏ đi lấy từ trên tay.)',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'one', target: 'one',
        available: (g, s) => !g.player(s).flags.jinfa && hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && g.isAliveSeat(t) && g.cardCount(t) > 0,
        run: async (g, s, [cid], [t]) => {
          g.player(s).flags.jinfa = 1;
          await discardOwn(g, s, [cid]);
          const eqs = allCards(g, t).filter((id) => isEquip(g.card(id)));
          const opts = [`Để ${name(g, s)} lấy 1 lá của bạn`];
          if (eqs.length) opts.push(`Giao 1 lá trang bị cho ${name(g, s)}`);
          const i = opts.length > 1 ? await g.choose(t, `Căng Phạt của ${name(g, s)}: chọn 1 mục`, opts) : 0;
          if (i === 0) { await takeFrom(g, s, t, 'Căng Phạt: chọn lá để lấy'); return; }
          const [e] = await g.chooseCards(t, `Căng Phạt: chọn 1 lá trang bị giao cho ${name(g, s)}`, eqs, 1, 1, true);
          const z = zoneOf(g, t, e);
          if (!z) return;
          await g.moveCards([e], z, { kind: 'hand', seat: s }, 'jinfa');
          g.say(`${name(g, t)} giao ${label(g, e)} cho ${name(g, s)}.`);
          if (g.card(e).suit === 'spade' && hand(g, s).includes(e) && g.player(t).alive && g.canBeSlashTarget(t, s)) {
            await g.useCardAs(t, 'sha', [s], [], { label: 'Căng Phạt' });
          }
        },
      },
    },

    // ================= Công Tôn Uyên =================
    {
      id: 'huaiyi', name: 'Hoài Dị',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể mở toàn bộ bài trên tay, nếu có đủ 2 màu, bạn: chọn 1 màu và bỏ những lá trên tay có màu này; '
        + 'chọn tối đa X người có bài, thu lấy 1 lá của họ (X là số lá bạn vừa bỏ), nếu lá được thu lấy là trang bị thì đặt lá đó lên tướng này thay vì thu lấy, '
        + 'gọi là [Dị]. Bạn có thể sử dụng [Dị] như bài trên tay (xem kỹ năng »Hoài Dị (dùng [Dị])«).',
      bot: { use: 'always', target: 'any' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !g.player(s).flags.huaiyi && hand(g, s).length > 0,
        run: async (g, s) => {
          g.player(s).flags.huaiyi = 1;
          const h = [...hand(g, s)];
          g.say(`${name(g, s)} mở bài trên tay: ${h.map((id) => label(g, id)).join(', ')}.`);
          const red = h.filter((id) => isRed(g.card(id)));
          const black = h.filter((id) => !isRed(g.card(id)));
          if (!red.length || !black.length) { g.say('Bài trên tay chỉ có 1 màu, Hoài Dị không có hiệu quả.'); return; }
          // Màu ít lá hơn đứng trước (bot chọn mục đầu)
          const choices = red.length <= black.length ? [['đỏ', red], ['đen', black]] : [['đen', black], ['đỏ', red]];
          const i = await g.choose(s, 'Hoài Dị: chọn màu để bỏ', choices.map(([c, ids]) => `Bỏ ${ids.length} lá ${c}`));
          const ids = choices[i][1];
          await g.moveCards(ids, { kind: 'hand', seat: s }, { kind: 'discard' }, 'huaiyi');
          g.say(`${name(g, s)} bỏ ${ids.map((id) => label(g, id)).join(', ')}.`);
          const cands = others(g, s, (t) => g.cardCount(t) > 0);
          const ts = await g.chooseTargets(s, `Hoài Dị: chọn tối đa ${ids.length} người để lấy bài`, cands, 0, ids.length, 'enemy');
          for (const t of ts) {
            if (!g.player(s).alive) return;
            const id = await takeFrom(g, s, t, 'Hoài Dị: chọn lá để lấy');
            if (id !== null && isEquip(g.card(id)) && hand(g, s).includes(id)) await toPile(g, s, 'Dị', [id], 'huaiyi');
          }
        },
      },
    },
    {
      id: 'huaiyi_di', name: 'Hoài Dị (dùng [Dị])',
      desc: 'Giai đoạn ra bài, bạn có thể sử dụng 1 [Dị] (lắp trang bị đó vào khu vực trang bị của bạn). '
        + '(đơn giản hóa: [Dị] luôn là trang bị nên chỉ có thể "sử dụng" để lắp, không đánh ra.)',
      bot: { use: 'always' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => pileOf(g, s, 'Dị').length > 0,
        run: async (g, s) => {
          const [id] = await g.chooseCards(s, 'Hoài Dị: chọn 1 [Dị] để sử dụng', pileOf(g, s, 'Dị'), 1, 1, true);
          if (id === undefined) return;
          tags(g, 'Dị').delete(id);
          await putEquip(g, id, { kind: 'special', seat: s }, s);
        },
      },
    },
    {
      id: 'zisui', name: 'Tứ Tuy',
      desc: 'Tỏa định kỹ: Giai đoạn rút bài, nếu có [Dị], bạn rút thêm X lá (X là số [Dị]). Khi bắt đầu giai đoạn kết thúc, nếu số [Dị] > giới hạn máu của bạn, bạn trận vong.',
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o && pileOf(g, o, 'Dị').length > 0,
          (g, ctx, o) => { ctx.count += pileOf(g, o, 'Dị').length; }, { compulsory: true }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && pileOf(g, o, 'Dị').length > g.player(o).maxHp,
          async (g, _ctx, o) => {
            g.say(`${name(g, o)} có quá nhiều [Dị], trận vong!`);
            g.player(o).hp = 0;
            await g.die(o, null);
          }, { compulsory: true }),
      ],
    },

    // ================= Lưu Ba =================
    {
      id: 'tongdu', name: 'Trù Độ',
      desc: 'Khi bắt đầu giai đoạn kết thúc của người cùng thế lực với bạn, họ có thể rút X lá (X là số bài họ đã bỏ trong giai đoạn bỏ bài ở lượt này, tối đa 3).',
      triggers: [
        on('phaseStart', (g, ctx, o) => {
          if (ctx.phase !== 'end' || !(ctx.seat === o || g.isSameFaction(ctx.seat, o)) || !g.player(ctx.seat).alive) return false;
          const d = g.lastDiscardPhase;
          return !!d && d.seat === ctx.seat && d.turn === g.state.turnCount && d.ids.length > 0;
        }, async (g, ctx) => {
          await g.draw(ctx.seat, Math.min(3, g.lastDiscardPhase.ids.length));
        }),
      ],
    },
    {
      id: 'qingyin', name: 'Quy Ẩn',
      desc: 'Hạn định kỹ: Giai đoạn ra bài, bạn có thể phát động kỹ năng này: lệnh tất cả người cùng thế lực với bạn hồi đầy máu; sau đó bạn loại bỏ tướng này.',
      bot: { use: 'wounded' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !limitedUsed(g, s, 'qingyin') && slotOf(g, s, 'liuba') !== null
          && sameFactionSeats(g, s).concat(g.isRevealedAny(s) ? [] : [s]).some((t) => g.player(t).hp < g.player(t).maxHp),
        run: async (g, s) => {
          markLimited(g, s, 'qingyin');
          for (const t of sameFactionSeats(g, s)) {
            const p = g.player(t);
            if (p.alive && p.hp < p.maxHp) await g.recover(t, p.maxHp - p.hp, s);
          }
          const slot = slotOf(g, s, 'liuba');
          if (slot && g.player(s).alive) await g.removeGeneral(s, slot);
        },
      },
    },

    // ================= Chu Linh =================
    {
      id: 'juejue', name: 'Trấn Vệ',
      desc: 'Khi bắt đầu giai đoạn bỏ bài, bạn có thể mất 1 máu; nếu làm vậy, khi kết thúc giai đoạn này, nếu trong giai đoạn này bạn có bỏ bài, '
        + 'bạn lệnh tất cả người khác chọn 1 mục: 1. đưa X lá trên tay vào chồng bài bỏ (X là số lá bạn đã bỏ trong giai đoạn này); 2. bạn gây 1 sát thương cho họ. '
        + 'Khi bạn giết người cùng thế lực với bạn, bạn bỏ qua chấp hành thưởng phạt.',
      bot: { confirm: (v) => v.players[v.me].hp >= 3 && v.myHand.length >= v.players[v.me].hp },
      skipRewardPunish: (g, o, victim) => g.isSameFaction(o, victim),
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'discard' && g.player(o).hp > 0,
          async (g, _ctx, o) => {
            await g.loseHp(o, 1);
            if (g.player(o).alive) g.player(o).flags.turn_juejue = 1;
          }),
        on('phaseEnd', (g, ctx, o) => {
          if (ctx.seat !== o || ctx.phase !== 'discard' || !g.player(o).flags.turn_juejue) return false;
          const d = g.lastDiscardPhase;
          return !!d && d.seat === o && d.turn === g.state.turnCount && d.ids.length > 0;
        }, async (g, _ctx, o) => {
          g.player(o).flags.turn_juejue = 0;
          const x = g.lastDiscardPhase.ids.length;
          for (const t of g.aliveSeatsFrom(o)) {
            if (t === o || !g.player(t).alive || !g.player(o).alive) continue;
            const can = hand(g, t).length >= x;
            const i = can ? await g.choose(t, `Trấn Vệ của ${name(g, o)}: chọn 1 mục`, [`Bỏ ${x} lá trên tay`, `Chịu 1 sát thương từ ${name(g, o)}`]) : 1;
            if (i === 0) await g.forceDiscard(t, x, 'juejue');
            else await dmg(g, o, t);
          }
        }, { compulsory: true }),
      ],
    },
    {
      id: 'fangyuan', name: 'Ngư Lân',
      desc: 'Trận pháp kỹ: Quan hệ vây công: nếu bạn là người vây công, giới hạn trữ bài của người vây công +1, giới hạn trữ bài của người bị vây công −1. '
        + 'Khi bắt đầu giai đoạn kết thúc, nếu bạn là người bị vây công trong quan hệ vây công, bạn xem như sử dụng [Sát] với 1 người vây công.',
      triggers: [
        on('phaseStart', (g, ctx, o) => {
          if (ctx.phase !== 'discard' || !g.player(ctx.seat).alive) return false;
          const slot = slotOf(g, o, 'zhuling');
          if (!slot || !g.hero(o)[slot].revealed) return false;
          const s = ctx.seat;
          const plus = g.alivePlayers().some((p) => { const b = g.besiegers(p.seat); return !!b && b.includes(o) && b.includes(s); });
          const minus = !!g.besiegers(s)?.includes(o);
          return plus || minus;
        }, (g, ctx, o) => {
          const s = ctx.seat;
          const plus = g.alivePlayers().some((p) => { const b = g.besiegers(p.seat); return !!b && b.includes(o) && b.includes(s); });
          const minus = !!g.besiegers(s)?.includes(o);
          const f = g.player(s).flags;
          const d = (plus ? 1 : 0) - (minus ? 1 : 0);
          f.turn_handLimitDelta = (f.turn_handLimitDelta ?? 0) + d;
          if (d) g.say(`Ngư Lân: giới hạn trữ bài của ${name(g, s)} ${d > 0 ? '+1' : '−1'} lượt này.`);
        }, { compulsory: true }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && !!g.besiegers(o)
          && g.besiegers(o).some((t) => g.player(t).alive && g.canTargetWithCard(o, t) && g.canBeSlashTarget(o, t)),
          async (g, _ctx, o) => {
            const cands = g.besiegers(o).filter((t) => g.player(t).alive && g.canTargetWithCard(o, t) && g.canBeSlashTarget(o, t));
            const [t] = await g.chooseTargets(o, 'Ngư Lân: chọn người vây công để xem như dùng Sát', cands, 1, 1, 'enemy');
            if (t !== undefined) await g.useCardAs(o, 'sha', [t], [], { label: 'Ngư Lân' });
          }, { compulsory: true }),
      ],
    },

    // ================= Thôi Diễm & Mao Giới =================
    {
      id: 'zhengbi', name: 'Chinh Tịch',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể chọn 1 mục: 1. chọn 1 người khác không có thế lực, bạn sử dụng bài với họ không giới hạn khoảng cách và số lần '
        + 'đến khi kết thúc lượt này hoặc sau khi họ lật tướng; 2. chọn 1 người khác đã có thế lực, bạn giao cho họ 1 lá cơ bản, lệnh họ giao cho bạn 2 lá cơ bản '
        + 'hoặc 1 lá phi cơ bản. (đơn giản hóa: "không giới hạn khoảng cách" = khoảng cách đến họ là 1; "không giới hạn số lần" chỉ áp dụng cho Sát.)',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play'
          && (others(g, o, (t) => !g.isRevealedAny(t)).length > 0
            || (others(g, o, (t) => g.isRevealedAny(t)).length > 0 && hand(g, o).some((id) => isBasic(g.card(id))))),
          async (g, _ctx, o) => {
            const unknown = others(g, o, (t) => !g.isRevealedAny(t));
            const known = hand(g, o).some((id) => isBasic(g.card(id))) ? others(g, o, (t) => g.isRevealedAny(t)) : [];
            const opts = [];
            if (unknown.length) opts.push('Chọn người chưa có thế lực: dùng bài với họ không giới hạn');
            if (known.length) opts.push('Chọn người đã có thế lực: giao 1 lá cơ bản, đổi lấy bài của họ');
            const i = opts.length > 1 ? await g.choose(o, 'Chinh Tịch: chọn 1 mục', opts) : 0;
            if (unknown.length && i === 0) {
              const [t] = await g.chooseTargets(o, 'Chinh Tịch: chọn người chưa có thế lực', unknown, 1, 1, 'enemy');
              if (t === undefined) return;
              const f = g.player(o).flags;
              f.zhengbiTarget = t + 1;
              f.fenxunTarget = t + 1;
              g.say(`${name(g, o)} chọn ${name(g, t)}: lượt này dùng bài với họ không giới hạn khoảng cách và số lần.`);
              return;
            }
            const [t] = await g.chooseTargets(o, 'Chinh Tịch: chọn người đã có thế lực', known, 1, 1, 'enemy');
            if (t === undefined) return;
            const basics = hand(g, o).filter((id) => isBasic(g.card(id)));
            const [b] = await g.chooseCards(o, `Chinh Tịch: chọn 1 lá cơ bản giao cho ${name(g, t)}`, basics, 1, 1);
            await g.moveCards([b], { kind: 'hand', seat: o }, { kind: 'hand', seat: t }, 'zhengbi');
            g.say(`${name(g, o)} giao 1 lá cơ bản cho ${name(g, t)}.`);
            const tb = hand(g, t).filter((id) => isBasic(g.card(id)));
            const tn = allCards(g, t).filter((id) => !isBasic(g.card(id)));
            const back = [];
            if (tb.length >= 2) back.push('2 lá cơ bản');
            if (tn.length) back.push('1 lá phi cơ bản');
            let ids;
            if (!back.length) ids = tb; // không đủ: giao hết những gì có
            else {
              const j = back.length > 1 ? await g.choose(t, `Chinh Tịch: giao cho ${name(g, o)}`, back) : 0;
              ids = back[j] === '2 lá cơ bản'
                ? await g.chooseCards(t, `Chinh Tịch: chọn 2 lá cơ bản giao cho ${name(g, o)}`, tb, 2, 2)
                : await g.chooseCards(t, `Chinh Tịch: chọn 1 lá phi cơ bản giao cho ${name(g, o)}`, tn, 1, 1, true);
            }
            for (const id of ids) {
              const z = zoneOf(g, t, id);
              if (z) await g.moveCards([id], z, { kind: 'hand', seat: o }, 'zhengbi');
            }
            if (ids.length) g.say(`${name(g, t)} giao ${ids.length} lá cho ${name(g, o)}.`);
          }),
        on('cardUsed', (g, ctx, o) => {
          const z = g.player(o).flags.zhengbiTarget ?? 0;
          return z > 0 && ctx.seat === o && g.state.currentSeat === o && ctx.as === 'sha' && ctx.targets.length > 0
            && ctx.targets.every((t) => t === z - 1) && (g.player(o).flags.shaUsed ?? 0) > 0;
        }, (g, _ctx, o) => { g.player(o).flags.shaUsed -= 1; }, { compulsory: true }),
        observe('generalRevealed', (g, ctx, o) => {
          const f = g.player(o).flags;
          if ((f.zhengbiTarget ?? 0) === ctx.seat + 1) {
            f.zhengbiTarget = 0;
            if (f.fenxunTarget === ctx.seat + 1) f.fenxunTarget = 0;
          }
        }),
        observe('turnEnd', (g, ctx, o) => {
          const f = g.player(o).flags;
          if (ctx.seat === o && f.zhengbiTarget) { if (f.fenxunTarget === f.zhengbiTarget) f.fenxunTarget = 0; f.zhengbiTarget = 0; }
        }),
      ],
    },
    {
      id: 'fengying', name: 'Phụng Nghênh',
      desc: 'Hạn định kỹ: Bạn có thể chuyển hóa sử dụng tất cả bài trên tay thành [Hiệp Thiên Tử Dĩ Lệnh Chư Hầu] (bỏ qua yêu cầu Đại thế lực); '
        + 'khi bạn sử dụng lá này, bạn lệnh tất cả người cùng thế lực với bạn bổ sung bài trên tay đến giới hạn máu.',
      bot: { use: 'never' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !limitedUsed(g, s, 'fengying') && hand(g, s).length > 0 && g.state.currentSeat === s && g.state.phase === 'play'
          && !hand(g, s).some((id) => g.cardBlocked(s, g.card(id))),
        run: async (g, s) => {
          markLimited(g, s, 'fengying');
          await g.useCardAs(s, 'xietianzi', [], [...hand(g, s)], { label: 'Phụng Nghênh' });
          for (const t of sameFactionSeats(g, s)) {
            const p = g.player(t);
            if (p.alive && p.hand.length < p.maxHp) await g.draw(t, p.maxHp - p.hand.length);
          }
        },
      },
    },

    // ================= Lý Phong =================
    {
      id: 'tunchu', name: 'Truân Trữ',
      desc: 'Giai đoạn rút bài, bạn có thể rút thêm 2 lá; nếu vậy, bạn không thể sử dụng [Sát] trong lượt này, và khi kết thúc giai đoạn rút bài, '
        + 'bạn đặt từ 1 đến 2 lá trên tay lên tướng này, gọi là [Lương].',
      bot: { confirm: (v) => v.myHand.filter((c) => c.name === 'sha').length === 0 || v.myHand.length <= 2 },
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o, (g, ctx, o) => {
          ctx.count += 2;
          const f = g.player(o).flags;
          f.tunchu = 1;
          f.turn_banSha = 1; // không thể sử dụng Sát trong lượt này (cờ tự xóa cuối lượt)
          g.say(`${name(g, o)} không thể sử dụng Sát trong lượt này.`);
        }),
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'draw' && !!g.player(o).flags.tunchu && hand(g, o).length > 0,
          async (g, _ctx, o) => {
            g.player(o).flags.tunchu = 0;
            const ids = await g.chooseCards(o, 'Truân Trữ: chọn 1–2 lá đặt lên tướng làm [Lương]', [...hand(g, o)], 1, Math.min(2, hand(g, o).length));
            await toPile(g, o, 'Lương', ids, 'tunchu');
          }, { compulsory: true }),
      ],
    },
    {
      id: 'shuliang', name: 'Thâu Lương',
      desc: 'Khi bắt đầu giai đoạn kết thúc của 1 người cùng thế lực với bạn, nếu khoảng cách từ bạn đến họ ≤ số [Lương], bạn có thể đưa 1 [Lương] vào chồng bài bỏ, lệnh họ rút 2 lá.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.phase === 'end' && g.player(ctx.seat).alive && (ctx.seat === o || g.isSameFaction(ctx.seat, o))
          && pileOf(g, o, 'Lương').length > 0 && g.distance(o, ctx.seat) <= pileOf(g, o, 'Lương').length,
          async (g, ctx, o) => {
            const [id] = await g.chooseCards(o, 'Thâu Lương: chọn 1 [Lương] để bỏ', pileOf(g, o, 'Lương'), 1, 1, true);
            if (id === undefined) return;
            await fromPile(g, o, 'Lương', [id], { kind: 'discard' }, 'shuliang');
            await g.draw(ctx.seat, 2);
          }),
      ],
    },

    // ================= Dương Uyển =================
    {
      id: 'youyan', name: 'Dụ Ngôn',
      desc: 'Một lần trong lượt của bạn, sau khi bài của bạn tiến vào chồng bài bỏ do bỏ bài, bạn có thể lật ra 4 lá trên đầu chồng bài '
        + 'và thu lấy những lá khác chất với những lá bạn đã bỏ trong lần này.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => g.state.currentSeat === o && isDiscardMove(ctx) && ctx.from.seat === o && g.player(o).alive
          && counter(g, 'youyan', o, turnKey(g)).n === 0,
          async (g, ctx, o) => {
            counter(g, 'youyan', o, turnKey(g)).n++;
            const suits = new Set(ctx.cardIds.map((id) => g.card(id).suit));
            const shown = [];
            for (let i = 0; i < 4; i++) shown.push((await g.takeTop({ kind: 'processing' }, 'reveal')).id);
            g.say(`${name(g, o)} lật ${shown.map((id) => label(g, id)).join(', ')}.`);
            const keep = shown.filter((id) => !suits.has(g.card(id).suit));
            if (keep.length) await g.moveCards(keep, { kind: 'processing' }, { kind: 'hand', seat: o }, 'youyan');
            if (keep.length) g.say(`${name(g, o)} thu lấy ${keep.length} lá khác chất.`);
            const rest = shown.filter((id) => g.state.processing.includes(id));
            if (rest.length) await g.moveCards(rest, { kind: 'processing' }, { kind: 'discard' }, 'settle');
          }),
      ],
    },
    {
      id: 'zhuihuan', name: 'Truy Hoàn',
      desc: 'Khi bạn kết thúc lượt, bạn có thể chọn tối đa 2 người, lệnh mỗi người nhận 1 [Truy Hoàn] khác nhau đến khi bắt đầu lượt tiếp theo của bạn '
        + '(không ai được biết loại đã nhận). Sau khi họ nhận sát thương, họ bỏ đi [Truy Hoàn]: [Sát thương]: họ gây 1 sát thương cho nguồn sát thương; '
        + '[Bỏ bài]: nguồn sát thương bỏ 2 lá trên tay.',
      triggers: [
        on('turnEnd', (g, ctx, o) => ctx.seat === o && g.player(o).alive, async (g, _ctx, o) => {
          const cands = g.alivePlayers().map((p) => p.seat).filter((s) => s === o || g.canTarget(o, s));
          const ts = await g.chooseTargets(o, 'Truy Hoàn: chọn tối đa 2 người nhận [Truy Hoàn]', cands, 0, 2, 'ally');
          if (!ts.length) return;
          const kinds = ['Sát thương', 'Bỏ bài'];
          const first = await g.choose(o, `Truy Hoàn: loại [Truy Hoàn] cho ${name(g, ts[0])}`, kinds);
          const m = new Map();
          m.set(ts[0], first);
          if (ts[1] !== undefined) m.set(ts[1], 1 - first);
          store(g)[`zhuihuan:${o}`] = m;
          g.say(`${ts.map((t) => name(g, t)).join(', ')} nhận 1 [Truy Hoàn] (úp).`);
          for (const [t, k] of m) g.tell(o, `[Truy Hoàn] của ${name(g, t)}: ${kinds[k]}.`);
        }),
        observe('turnStart', (g, ctx, o) => { if (ctx.seat === o) store(g)[`zhuihuan:${o}`] = null; }),
        on('damaged', (g, ctx, o) => !!store(g)[`zhuihuan:${o}`]?.has(ctx.target) && ctx.source !== null && ctx.source !== ctx.target,
          async (g, ctx, o) => {
            const m = store(g)[`zhuihuan:${o}`];
            const k = m.get(ctx.target);
            m.delete(ctx.target);
            const src = ctx.source;
            g.say(`${name(g, ctx.target)} lật [Truy Hoàn]: ${k === 0 ? 'Sát thương' : 'Bỏ bài'}.`);
            if (!g.player(src).alive) return;
            if (k === 0) await dmg(g, ctx.target, src);
            else await g.forceDiscard(src, 2, 'zhuihuan');
          }, { compulsory: true }),
      ],
    },

    // ================= Tông Dự =================
    {
      id: 'qiao', name: 'Khí Ngạo',
      desc: 'Hai lần trong giai đoạn ra bài của mỗi người, sau khi bạn trở thành mục tiêu của bài do người thế lực khác bạn sử dụng, bạn có thể bỏ 1 lá của họ, sau đó bạn bỏ 1 lá.',
      triggers: [
        on('cardUsed', (g, ctx, o) => g.state.phase === 'play' && ctx.seat !== o && ctx.targets.includes(o) && g.player(ctx.seat).alive
          && diffFaction(g, o, ctx.seat) && g.cardCount(ctx.seat) > 0 && counter(g, 'qiao', o, phaseKey(g)).n < 2,
          async (g, ctx, o) => {
            counter(g, 'qiao', o, phaseKey(g)).n++;
            await discardFrom(g, o, ctx.seat, 'Khí Ngạo: chọn lá để bỏ');
            const mine = allCards(g, o);
            if (mine.length) {
              const ids = await chooseOwn(g, o, 'Khí Ngạo: bỏ 1 lá của bạn', 1, 1);
              if (ids?.length) await discardOwn(g, o, ids);
            }
          }),
      ],
    },
    {
      id: 'chengshang', name: 'Thừa Thưởng',
      desc: 'Một lần trong giai đoạn ra bài, sau khi bài do bạn sử dụng kết toán xong, nếu: số lá được đem sử dụng là 1; lá này có chỉ định người thế lực khác '
        + 'làm mục tiêu; lá này không gây sát thương — bạn có thể thu lấy những lá có cùng chất và điểm với lá đó trong chồng bài rút; '
        + 'nếu không thu được bài, bạn thêm 1 lần phát động kỹ năng này trong giai đoạn này.',
      triggers: [
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.seat !== o || g.state.currentSeat !== o || g.state.phase !== 'play' || ctx.card.id < 0) return;
          if (!ctx.targets.some((t) => t !== o && diffFaction(g, o, t))) return;
          const s = store(g);
          (s[`chengshang:${o}`] ??= new Map()).set(ctx.card.id, { dmg: false, key: phaseKey(g) });
        }),
        observe('damageDealt', (g, ctx, o) => {
          const m = store(g)[`chengshang:${o}`];
          if (ctx.card && m?.has(ctx.card.id)) m.get(ctx.card.id).dmg = true;
        }),
        on('cardsMoved', (g, ctx, o) => {
          const m = store(g)[`chengshang:${o}`];
          if (ctx.from.kind !== 'processing' || !m) return false;
          const id = ctx.cardIds.find((x) => m.has(x));
          if (id === undefined) return false;
          const r = m.get(id);
          if (r.dmg || r.key !== phaseKey(g)) { m.delete(id); return false; }
          const c = counter(g, 'chengshang', o, phaseKey(g));
          return c.n < 1 + (c.extra ?? 0);
        }, async (g, ctx, o) => {
          const m = store(g)[`chengshang:${o}`];
          const id = ctx.cardIds.find((x) => m.has(x));
          m.delete(id);
          const c = counter(g, 'chengshang', o, phaseKey(g));
          c.n++;
          const card = g.card(id);
          const got = g.state.drawPile.filter((x) => x !== id && g.card(x).suit === card.suit && g.card(x).rank === card.rank);
          if (got.length) {
            await g.moveCards(got, { kind: 'draw' }, { kind: 'hand', seat: o }, 'chengshang');
            g.say(`${name(g, o)} thu lấy ${got.length} lá cùng chất và điểm với ${label(g, id)} từ chồng bài.`);
          } else {
            c.extra = (c.extra ?? 0) + 1;
            g.say(`${name(g, o)} không thu được bài, được phát động Thừa Thưởng thêm 1 lần trong giai đoạn này.`);
          }
        }),
      ],
    },

    // ================= Phùng Hy =================
    {
      id: 'yusui', name: 'Ngọc Toái',
      desc: 'Một lần trong lượt của mỗi người, sau khi bạn trở thành mục tiêu của bài Đen do người thế lực xác định khác bạn sử dụng, bạn có thể mất 1 máu, '
        + 'sau đó lựa chọn 1 mục: 1. lệnh họ bỏ X lá trên tay (X là giới hạn máu của họ); 2. lệnh họ mất máu đến khi bằng với số máu của bạn.',
      bot: { confirm: (v) => v.players[v.me].hp >= 3 },
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && ctx.targets.includes(o) && isBlackCard(ctx.card) && g.player(ctx.seat).alive
          && diffFaction(g, o, ctx.seat) && g.player(o).hp > 0 && counter(g, 'yusui', o, turnKey(g)).n === 0,
          async (g, ctx, o) => {
            counter(g, 'yusui', o, turnKey(g)).n++;
            const t = ctx.seat;
            await g.loseHp(o, 1);
            if (!g.player(o).alive || !g.player(t).alive) return;
            const opts = [`${name(g, t)} bỏ ${g.player(t).maxHp} lá trên tay`];
            if (g.player(t).hp > g.player(o).hp) opts.push(`${name(g, t)} mất máu đến khi bằng ${name(g, o)} (${g.player(o).hp})`);
            const i = opts.length > 1 ? await g.choose(o, 'Ngọc Toái: chọn 1 mục', opts) : 0;
            if (i === 0) await g.forceDiscard(t, g.player(t).maxHp, 'yusui');
            else await g.loseHp(t, g.player(t).hp - g.player(o).hp);
          }),
      ],
    },
    {
      id: 'boyan', name: 'Bác Ngôn',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác: họ bổ sung bài trên tay đến giới hạn máu của họ; trong lượt này họ không thể sử dụng '
        + 'hoặc đánh ra bài trên tay. Tung Hoành: bạn có thể lệnh họ nhận kỹ năng »Bác Ngôn (Tung Hoành)« cho đến sau khi kết thúc lượt chơi tiếp theo của họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.boyan,
        validTarget: (g, s, t) => t !== s && g.isAliveSeat(t),
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.boyan = 1;
          const p = g.player(t);
          if (p.hand.length < p.maxHp) await g.draw(t, p.maxHp - p.hand.length);
          p.flags.turn_banHand = 1;
          g.say(`${p.name} không thể sử dụng hoặc đánh ra bài trên tay trong lượt này.`);
          if (g.grantedSkills(t).includes('boyanzongheng')) return;
          const z = await g.choose(s, `Bác Ngôn (Tung Hoành): cho ${p.name} nhận kỹ năng Bác Ngôn (Tung Hoành)?`, ['Không', 'Có']);
          if (z !== 1) return;
          g.grantSkill(t, 'boyanzongheng');
          const since = g.state.turnCount;
          const off = g.bus.on('turnEnd', ({ seat }) => {
            if (seat === t && g.state.turnCount > since) { g.revokeSkill(t, 'boyanzongheng'); off(); }
          });
        },
      },
    },
    {
      id: 'boyanzongheng', name: 'Bác Ngôn (Tung Hoành)',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác, lệnh họ trong lượt này không thể sử dụng hoặc đánh ra bài trên tay của họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.boyanzh,
        validTarget: (g, s, t) => t !== s && g.isAliveSeat(t),
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.boyanzh = 1;
          g.player(t).flags.turn_banHand = 1;
          g.say(`${name(g, t)} không thể sử dụng hoặc đánh ra bài trên tay trong lượt này.`);
        },
      },
    },

    // ================= Dương Hỗ =================
    {
      id: 'deshao', name: 'Đức Thiệu',
      desc: 'X lần trong lượt của mỗi người (X là số máu của bạn), sau khi bạn trở thành mục tiêu duy nhất của bài Đen do người khác sử dụng, '
        + 'nếu họ đã mở số tướng ≤ bạn, bạn có thể bỏ 1 lá của họ.',
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && ctx.targets.length === 1 && ctx.targets[0] === o && isBlackCard(ctx.card)
          && g.player(ctx.seat).alive && g.cardCount(ctx.seat) > 0 && !!g.heroes[ctx.seat]
          && revealedCount(g, ctx.seat) <= revealedCount(g, o) + (g.isRevealedAny(o) ? 0 : 1)
          && counter(g, 'deshao', o, turnKey(g)).n < g.player(o).hp,
          async (g, ctx, o) => {
            if (revealedCount(g, ctx.seat) > revealedCount(g, o)) return;
            counter(g, 'deshao', o, turnKey(g)).n++;
            await discardFrom(g, o, ctx.seat, 'Đức Thiệu: chọn lá để bỏ');
          }),
      ],
    },
    {
      id: 'mingfa', name: 'Minh Phạt',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác thế lực; khi kết thúc lượt tiếp theo của họ, nếu số lá trên tay họ so với bạn: '
        + 'ít hơn: bạn gây 1 sát thương cho họ và thu lấy 1 lá trên tay họ; nhiều hơn: bạn bổ sung bài trên tay đến khi bằng họ, tối đa rút thêm 5 lá.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.mingfa,
        validTarget: (g, s, t) => g.isAliveSeat(t) && diffFaction(g, s, t),
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.mingfa = 1;
          const st = store(g);
          (st[`mingfa:${s}`] ??= []).push({ t, since: g.state.turnCount });
          g.say(`${name(g, s)} chọn ${name(g, t)} cho Minh Phạt.`);
        },
      },
      triggers: [
        on('turnEnd', (g, ctx, o) => (store(g)[`mingfa:${o}`] ?? []).some((r) => r.t === ctx.seat && g.state.turnCount > r.since),
          async (g, ctx, o) => {
            const list = store(g)[`mingfa:${o}`];
            store(g)[`mingfa:${o}`] = list.filter((r) => !(r.t === ctx.seat && g.state.turnCount > r.since));
            const t = ctx.seat;
            if (!g.player(t).alive) return;
            const a = hand(g, t).length, b = hand(g, o).length;
            if (a < b) {
              await dmg(g, o, t);
              if (g.player(t).alive && hand(g, t).length) await takeFrom(g, o, t, 'Minh Phạt', { equip: false });
            } else if (a > b) {
              await g.draw(o, Math.min(5, a - b));
            }
          }, { compulsory: true }),
      ],
    },
  ],
};

