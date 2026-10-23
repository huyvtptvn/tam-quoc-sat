// ============================================================
// Gói bổ sung (nhóm A): Mã Lương, Đặng Chi, Bành Dạng, Ngô Cảnh, Chu Di, Viên Thuật,
// Tả Từ, Nam Hoa Lão Tiên (+ các kỹ năng Thiên Thư của Kinh Hợp), Lữ Linh Khởi, Nễ Hành, Himiko.
// Mô tả chuẩn: content/import/qsgs-viet.json.
// ============================================================
import {
  allCards, chooseOwn, discardFrom, discardOwn, give, hand, inMyPlay, label, name, observe, on, others,
  sameFactionSeats, slotOf, store, usedThisTurn, oncePerTurn,
} from './lib/tro-giup.mjs';

/** Cận Hãm: mọi người ở khoảng cách ≤1 tính từ Bành Dạng (gồm cả Bành Dạng). */
async function jinxianRun(g, o) {
  // Xét người khác trước (theo thứ tự ghế), chính Bành Dạng sau cùng: việc Bành Dạng úp lại tướng không làm mất hiệu lực với người khác
  const order = [...g.aliveSeatsFrom(o).filter((t) => t !== o), o];
  const affected = order.filter((t) => t === o || g.distance(o, t) <= 1);
  g.say(`Cận Hãm tác động: ${affected.map((t) => name(g, t)).join(', ')}.`);
  for (const t of affected) {
    if (!g.player(t).alive) continue;
    const h = g.hero(t);
    const live = ['main', 'deputy'].filter((w) => !h[w].removed);
    if (live.some((w) => !h[w].revealed)) {
      await discardN(g, t, 2, 'Cận Hãm: bỏ 2 lá');
    } else {
      let can = live.filter((w) => !(w === 'main' && g.isLord(t)));
      if (!can.length) continue;
      // Chính Bành Dạng: đưa Bành Dạng lên đầu danh sách (úp lại để lần sau mở ra phát động tiếp)
      if (t === o) can = [...can].sort((a, b) => (h[b].generalId === 'pengyang') - (h[a].generalId === 'pengyang'));
      const i = can.length > 1 ? await g.choose(t, 'Cận Hãm: úp 1 tướng', can.map((w) => g.generalName(h[w].generalId))) : 0;
      g.hideGeneral(t, can[i]);
    }
  }
}

// ---------------- Hàm trợ giúp riêng ----------------

const isBlackCard = (c) => (c.suit === 'spade' || c.suit === 'club') && !(c.virtual && !c.rank);
const typeOf = (c) => (c.type === 'delayed' ? 'trick' : c.type);
const isTrickCard = (c) => c.type === 'trick' || c.type === 'delayed';

/** `seat` bỏ đúng min(n, số lá) lá của mình (tay + trang bị), tự chọn. */
async function discardN(g, seat, n, prompt) {
  const k = Math.min(n, allCards(g, seat).length);
  if (k <= 0) return [];
  const ids = await chooseOwn(g, seat, prompt, k, k);
  if (ids?.length) await discardOwn(g, seat, ids);
  return ids ?? [];
}

/** Đăng ký listener trên bus, tự hủy khi `fn` trả true. */
function busOnce(g, event, fn) {
  const off = g.bus.on(event, (ctx) => { if (fn(ctx)) off(); });
  return off;
}

/** Thu hồi kỹ năng đã trao cho `seat` sau khi kết thúc lượt kế tiếp của họ. */
function revokeAfterTheirTurn(g, seat, skillId) {
  busOnce(g, 'turnEnd', (ctx) => {
    if (ctx.seat !== seat) return false;
    g.revokeSkill(seat, skillId);
    g.say(`${name(g, seat)} mất kỹ năng ${g.skillName(skillId)}.`);
    return true;
  });
}

/** Mục tiêu thực tế của một lá vừa được dùng (sự kiện cardUsed). */
function effectiveTargets(g, ctx) {
  if (ctx.as === 'sha') return [...ctx.targets];
  const info = g.cardInfo(ctx.as);
  if (!info || info.type !== 'trick') return [];
  const def = g.trickDef(ctx.as);
  if (!def) return [];
  if (def.targeting === 'one') return def.expandTargets ? def.expandTargets(g, ctx.seat, ctx.targets) : [...ctx.targets];
  return g.autoTargetsOf(ctx.seat, ctx.as);
}

/** Lá có hại cho mục tiêu không. */
function harmfulAs(g, as) {
  if (as === 'sha') return true;
  return g.trickDef(as)?.harmful ?? false;
}

/** Thế lực của một tướng (theo id). */
const kingdomOf = (g, id) => g.generalInfo(id)?.kingdom ?? null;

/** Đội hình nhưng không tính người bị Điệu Hổ Ly Sơn (họ "rời bàn"). */
function formationEx(g, seat) {
  const ring = g.alivePlayers().map((p) => p.seat).filter((s) => !g.isLured(s));
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
  return [...out].sort((a, b) => a - b);
}
function factionFormations(g, seat) {
  const seats = g.alivePlayers().map((p) => p.seat).filter((s) => s === seat || g.isSameFaction(s, seat));
  return new Set(seats.map((s) => formationEx(g, s).join(',')));
}

/** Các cách `user` có thể dùng 1 lá trên tay nhắm vào `target` (Thông Linh). */
function usableVs(g, user, target) {
  const out = [];
  for (const id of hand(g, user)) {
    const card = g.card(id);
    if (g.cardBlocked(user, card)) continue;
    for (const as of new Set(g.cardCountsAs(user, card))) {
      if (as === 'sha') {
        if (target !== user && g.canTargetWithCard(user, target) && g.canBeSlashTarget(user, target)
          && g.distance(user, target) <= g.attackRange(user)) out.push({ id, as });
        continue;
      }
      if (g.cardInfo(as)?.type !== 'trick') continue;
      const def = g.trickDef(as);
      if (!def || def.targeting !== 'one' || def.expandTargets || def.canUse?.(g, user)) continue;
      if (def.validTarget?.(g, user, target, card) && (target === user || g.canTargetWithCard(user, target))) out.push({ id, as });
    }
  }
  return out;
}

// ---------------- Tả Từ: Dịch Quỷ ----------------

const YIGUI_NAMES = ['tao', 'jiu', 'sha', 'wuzhong', 'shunshou', 'guohe', 'juedou', 'huogong', 'shuiyan', 'jiedao', 'tiesuo', 'zhiji', 'yuanjiao', 'diaohu'];

/** Các thế lực của một [Hồn] (tướng 2 thế lực có 2). */
function hunKingdoms(g, id) {
  const info = g.generalInfo(id);
  if (!info) return [];
  return Array.isArray(info.kingdoms) && info.kingdoms.length > 1 ? [...info.kingdoms] : [info.kingdom];
}
/** Người `t` là mục tiêu hợp lệ của [Hồn] thế lực `kingdom`: cùng thế lực với [Hồn], hoặc CHƯA xác định thế lực. */
function hunAllows(g, kingdom, t) {
  const k = g.shownKingdom(t);
  if (k === null) return true;
  return k === kingdom || (k === 'careerist' && kingdom === 'ye');
}
/** [Hồn] `id` (theo 1 trong các thế lực của nó) cho phép chọn `t`. */
const hunAllowsAny = (g, id, t) => hunKingdoms(g, id).some((k) => hunAllows(g, k, t));
function yiguiUsed(g, s) {
  const st = store(g);
  const k = `yigui:used:${s}`;
  if (!st[k] || st[k].turn !== g.state.turnCount) st[k] = { turn: g.state.turnCount, names: [] };
  return st[k].names;
}
/** Mục tiêu có thể chọn nếu coi như dùng lá `n` (chưa xét thế lực [Hồn]). */
function yiguiCandidates(g, s, n) {
  const p = g.player(s);
  if (n === 'sha') return (p.flags.shaUsed ?? 0) < g.slashLimit(s) ? g.targetsAs(s, 'sha') : [];
  if (n === 'tao') return p.hp < p.maxHp ? [s] : [];
  if (n === 'jiu') return p.flags.jiuUsed ? [] : [s];
  const def = g.trickDef(n);
  if (!def || def.canUse?.(g, s)) return [];
  if (def.targeting === 'self') return [s];
  if (def.targeting === 'one' && !def.expandTargets) return g.targetsAs(s, n);
  return [];
}
function yiguiCombos(g, s) {
  const pile = g.generalPile(s, 'Hồn');
  if (!pile.length) return [];
  const used = yiguiUsed(g, s);
  const out = [];
  for (const n of YIGUI_NAMES) {
    if (used.includes(n) || !g.cardInfo(n)) continue;
    const cands = yiguiCandidates(g, s, n);
    if (!cands.length) continue;
    const huns = pile.filter((id) => cands.some((t) => hunAllowsAny(g, id, t)));
    if (huns.length) out.push({ n, huns, cands });
  }
  return out;
}
async function gainHun(g, s, n) {
  const ids = g.takeGeneralsFromDeck(n);
  if (!ids.length) { g.say('Chồng bài tướng đã hết.'); return; }
  g.addGeneralPile(s, 'Hồn', ids);
}
const KD_LABEL = { wei: 'Ngụy', shu: 'Thục', wu: 'Ngô', qun: 'Quần', ye: 'Dã tâm' };
const hunLabel = (g, id) => `${g.generalName(id)} (${hunKingdoms(g, id).map((k) => KD_LABEL[k] ?? '?').join('/')})`;

// ---------------- Nam Hoa Lão Tiên: Kinh Hợp ----------------

const JINGHE_POOL = ['leiji_tianshu', 'yinbing', 'huoqi', 'guizhu', 'xianshou', 'lundao', 'guanyue', 'yanzheng'];
const jingheTargets = (g) => g.alivePlayers().map((p) => p.seat).filter((t) => g.isRevealedAny(t));

export default {
  skills: [
    // ================= Mã Lương =================
    {
      id: 'mumeng', name: 'Mục Minh',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chuyển hóa sử dụng 1 lá CƠ trên tay thành [Viễn Giao Cận Công]/[Lục Lực Đồng Tâm].',
      convert: (g, s, c) => {
        if (c.suit !== 'heart' || !g.player(s).hand.includes(c.id) || !inMyPlay(g, s) || g.player(s).flags.mumeng) return [];
        return ['yuanjiao', 'lulitongxin'];
      },
      triggers: [
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.seat === o && inMyPlay(g, o) && ctx.card.suit === 'heart' && ctx.card.name !== ctx.as
            && (ctx.as === 'yuanjiao' || ctx.as === 'lulitongxin')) g.player(o).flags.mumeng = 1;
        }),
        // Trùng chú lá Cơ như Lục Lực Đồng Tâm cũng tính là đã dùng Mục Minh
        observe('cardsMoved', (g, ctx, o) => {
          if (ctx.reason === 'recast' && inMyPlay(g, o)
            && ctx.cardIds.some((id) => g.card(id).suit === 'heart' && !['lulitongxin', 'tiesuo', 'zhiji'].includes(g.card(id).name))) {
            g.player(o).flags.mumeng = 1;
          }
        }),
      ],
    },
    {
      id: 'naman', name: 'Nạp Man',
      desc: 'Khi người khác sử dụng bài Đen có chỉ định nhiều mục tiêu, bạn có thể tiến hành phán xét, nếu kết quả phán xét không phải BÍCH, bạn chọn 1 mục: '
        + '1. Lệnh 1 người khác trở thành mục tiêu của bài (không bị giới hạn khoảng cách); 2. Hủy bỏ mục tiêu đối với 1 mục tiêu của lá đó. '
        + '(Đơn giản hóa: chỉ thêm được mục tiêu cho Sát và cẩm nang chọn mục tiêu trực tiếp.)',
      triggers: [
        // Một lá được dùng lại lần sau: xóa dấu hủy cũ còn sót (chạy trước khi Nạp Man ghi dấu mới)
        observe('cardUsed', (g, ctx) => { store(g).namanCancel?.delete(ctx.card.id); }),
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && g.player(ctx.seat).alive && isBlackCard(ctx.card) && effectiveTargets(g, ctx).length >= 2,
          async (g, ctx, o) => {
            const j = await g.judge(o, 'Nạp Man');
            const spade = j.suit === 'spade';
            await g.finishJudge(j);
            if (spade) { g.say('Nạp Man không có hiệu lực.'); return; }
            const user = ctx.seat;
            const def = ctx.as === 'sha' ? null : g.trickDef(ctx.as);
            const current = effectiveTargets(g, ctx);
            const canAdd = ctx.as === 'sha' || (def && def.targeting === 'one' && !def.expandTargets);
            const addCands = !canAdd ? [] : g.alivePlayers().map((p) => p.seat).filter((t) => t !== user && t !== o && !current.includes(t)
              && g.canTargetWithCard(user, t) && (ctx.as === 'sha' ? g.canBeSlashTarget(user, t) : (def.validTarget ? def.validTarget(g, user, t, ctx.card) : true)));
            const harmful = harmfulAs(g, ctx.as);
            const friendly = (t) => t === o || g.isSameFaction(t, o);
            const opts = [];
            const add = addCands.length ? { label: 'Thêm 1 người làm mục tiêu', kind: 'add', aim: harmful ? 'enemy' : 'ally' } : null;
            const cancel = { label: 'Hủy 1 mục tiêu của lá này', kind: 'cancel', aim: harmful ? 'ally' : 'enemy' };
            // Phương án có lợi hơn đặt trước (bot chọn phương án đầu)
            const preferCancel = harmful ? current.some(friendly) : !friendly(user);
            if (preferCancel || !add) opts.push(cancel, ...(add ? [add] : []));
            else opts.push(add, cancel);
            const i = opts.length > 1 ? await g.choose(o, `Nạp Man (${g.cardInfo(ctx.as).label} của ${name(g, user)})`, opts.map((x) => x.label)) : 0;
            const pick = opts[i];
            if (pick.kind === 'add') {
              const [t] = await g.chooseTargets(o, 'Nạp Man: chọn người trở thành mục tiêu', addCands, 1, 1, pick.aim);
              if (t === undefined) return;
              ctx.targets.push(t);
              g.say(`Nạp Man: ${name(g, t)} trở thành mục tiêu của lá này.`);
              return;
            }
            const [t] = await g.chooseTargets(o, 'Nạp Man: chọn mục tiêu bị hủy', current, 1, 1, pick.aim);
            if (t === undefined) return;
            if (ctx.as === 'sha') {
              const k = ctx.targets.indexOf(t);
              if (k >= 0) ctx.targets.splice(k, 1);
            } else {
              const st = store(g);
              st.namanCancel ??= new Map();
              if (!st.namanCancel.has(ctx.card.id)) st.namanCancel.set(ctx.card.id, new Set());
              st.namanCancel.get(ctx.card.id).add(t);
            }
            g.say(`Nạp Man: hủy mục tiêu ${name(g, t)}.`);
          }),
        observe('trickTargeted', (g, ctx) => {
          const set = store(g).namanCancel?.get(ctx.card.id);
          if (!set?.has(ctx.target)) return;
          set.delete(ctx.target);
          if (!set.size) store(g).namanCancel.delete(ctx.card.id);
          ctx.cancelled = true;
          g.say(`${g.cardInfo(ctx.name).label} không có hiệu lực với ${name(g, ctx.target)} (Nạp Man).`);
        }),
      ],
    },

    // ================= Đặng Chi =================
    {
      id: 'jianliang', name: 'Giản Lượng',
      desc: 'Đầu giai đoạn rút bài, nếu bạn là người có ít bài trên tay nhất, bạn có thể lệnh người cùng thế lực bạn lần lượt rút 1 lá.',
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o && g.alivePlayers().every((p) => p.hand.length >= hand(g, o).length),
          async (g, _ctx, o) => {
            for (const s of g.aliveSeatsFrom(o)) if (s === o || g.isSameFaction(s, o)) await g.draw(s, 1);
          }),
      ],
    },
    {
      id: 'weimeng', name: 'Ngụy Minh',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác có bài trên tay, bạn thu lấy tối đa X lá trên tay của họ (X là số máu của bạn), '
        + 'sau đó bạn giao lượng bài tương đương cho họ. Tung Hoành: Bạn có thể lệnh họ nhận kỹ năng »Ngụy Minh (Tung Hoành)« '
        + '(thay "X" thành "1" và bỏ qua hiệu ứng Tung Hoành) cho đến sau khi kết thúc lượt tiếp theo của họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.weimeng && g.player(s).hp > 0,
        validTarget: (g, s, t) => t !== s && hand(g, t).length > 0,
        run: async (g, s, _ids, [t]) => {
          g.player(s).flags.weimeng = 1;
          const x = Math.min(g.player(s).hp, hand(g, t).length);
          const counts = Array.from({ length: x }, (_, i) => x - i);
          const n = counts[x > 1 ? await g.choose(s, `Ngụy Minh: lấy bao nhiêu lá của ${name(g, t)}`, counts.map((k) => `Lấy ${k} lá`)) : 0];
          for (let i = 0; i < n && hand(g, t).length; i++) {
            const h = hand(g, t);
            await g.moveCards([h[g.randomInt(h.length)]], { kind: 'hand', seat: t }, { kind: 'hand', seat: s }, 'weimeng');
          }
          g.say(`${name(g, s)} lấy ${n} lá trên tay của ${name(g, t)}.`);
          const k = Math.min(n, allCards(g, s).length);
          if (k > 0) {
            const ids = await g.chooseCards(s, `Ngụy Minh: giao ${k} lá cho ${name(g, t)}`, allCards(g, s), k, k, true);
            await give(g, s, t, ids, 'weimeng');
          }
          if (!g.player(t).alive) return;
          const z = await g.choose(s, `Ngụy Minh — Tung Hoành: cho ${name(g, t)} nhận »Ngụy Minh (Tung Hoành)« đến hết lượt kế tiếp của họ?`, ['Không', 'Có']);
          if (z === 1) {
            g.grantSkill(t, 'weimengzongheng');
            revokeAfterTheirTurn(g, t, 'weimengzongheng');
          }
        },
      },
    },
    {
      id: 'weimengzongheng', name: 'Ngụy Minh (Tung Hoành)',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác có bài trên tay, bạn thu lấy 1 lá trên tay của họ, sau đó giao 1 lá cho họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.weimengzh,
        validTarget: (g, s, t) => t !== s && hand(g, t).length > 0,
        run: async (g, s, _ids, [t]) => {
          g.player(s).flags.weimengzh = 1;
          const h = hand(g, t);
          await g.moveCards([h[g.randomInt(h.length)]], { kind: 'hand', seat: t }, { kind: 'hand', seat: s }, 'weimeng');
          g.say(`${name(g, s)} lấy 1 lá trên tay của ${name(g, t)}.`);
          const ids = await g.chooseCards(s, `Ngụy Minh: giao 1 lá cho ${name(g, t)}`, allCards(g, s), 1, 1, true);
          await give(g, s, t, ids, 'weimeng');
        },
      },
    },

    // ================= Bành Dạng =================
    {
      id: 'tongling', name: 'Thông Linh',
      desc: 'Một lần trong giai đoạn ra bài, sau khi bạn gây sát thương cho 1 người thế lực xác định khác bạn (A), bạn có thể chọn 1 người cùng thế lực với bạn (B), '
        + 'B có thể sử dụng 1 lá có bao gồm A là mục tiêu; nếu lá này gây sát thương, bạn và B rút 2 lá; nếu không, bạn lệnh A thu lấy lá bạn đã sử dụng để gây sát thương cho A. '
        + '(Đơn giản hóa: B chỉ dùng được Sát hoặc cẩm nang chọn đúng A làm mục tiêu.)',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.source === o && ctx.target !== o && inMyPlay(g, o) && !g.player(o).flags.tongling
          && g.player(ctx.target).alive && g.shownKingdom(ctx.target) !== null && !g.isSameFaction(o, ctx.target),
          async (g, ctx, o) => {
            g.player(o).flags.tongling = 1;
            const a = ctx.target;
            const cands = sameFactionSeats(g, o).filter((b) => usableVs(g, b, a).length > 0);
            if (!cands.length) { g.say('Thông Linh: không ai cùng thế lực có thể dùng bài vào mục tiêu.'); return; }
            const [b] = await g.chooseTargets(o, `Thông Linh: chọn người cùng thế lực dùng 1 lá vào ${name(g, a)}`, cands, 1, 1, 'ally');
            if (b === undefined) return;
            const uses = usableVs(g, b, a);
            const opts = [...uses.map((u) => `${g.labelAs(g.card(u.id), u.as)}`), 'Không dùng'];
            const i = await g.choose(b, `Thông Linh: dùng 1 lá vào ${name(g, a)}?`, opts);
            if (i >= uses.length) { g.say(`${name(g, b)} không dùng bài.`); return; }
            let hit = false;
            const off = g.bus.on('damageDealt', (d) => { if (d.source === b && d.target === a) hit = true; });
            try {
              await g.useCardAs(b, uses[i].as, [a], [uses[i].id], { label: 'Thông Linh' });
            } finally { off(); }
            if (hit) {
              await g.draw(o, 2);
              if (b !== o) await g.draw(b, 2);
              return;
            }
            const c = ctx.card;
            if (c && !c.virtual && g.player(a).alive) {
              const from = g.state.processing.includes(c.id) ? { kind: 'processing' } : g.state.discardPile.includes(c.id) ? { kind: 'discard' } : null;
              if (from) {
                await g.moveCards([c.id], from, { kind: 'hand', seat: a }, 'tongling');
                g.say(`${name(g, a)} thu lấy ${label(g, c.id)}.`);
              }
            }
          }),
      ],
    },
    {
      id: 'jinxian', name: 'Cận Hãm',
      desc: 'Sau khi bạn mở tướng này, bạn lệnh tất cả người ở khoảng cách ≤1 (KỂ CẢ BẠN — khoảng cách tới chính mình là 0) thực hiện: '
        + 'nếu họ đã mở tất cả tướng: họ úp 1 tướng; nếu có tướng úp: họ bỏ 2 lá. '
        + '(Mẹo: mở cả 2 tướng cùng lúc, hoặc mở tướng kia trước, rồi chọn úp lại Bành Dạng để lần sau mở ra phát động tiếp.)',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'pengyang' && g.player(o).alive, async (g, _ctx, o) => {
          // Đang mở cả 2 tướng cùng lúc mà tướng kia chưa kịp lật: chờ lật xong cả hai rồi mới phát động
          const h = g.hero(o);
          if (g.isRevealBatch(o) && ['main', 'deputy'].some((w) => !h[w].removed && !h[w].revealed)) { store(g)[`jinxian:${o}`] = 1; return; }
          await jinxianRun(g, o);
        }, { compulsory: true }),
        on('revealBatchDone', (g, ctx, o) => ctx.seat === o && !!store(g)[`jinxian:${o}`] && g.player(o).alive, async (g, _ctx, o) => {
          store(g)[`jinxian:${o}`] = 0;
          await jinxianRun(g, o);
        }, { compulsory: true }),
      ],
    },

    // ================= Ngô Cảnh =================
    {
      id: 'diaogui', name: 'Điều Quy',
      desc: 'Một lần trong giai đoạn ra bài, có thể sử dụng 1 lá trang bị như [Điệu Hổ Ly Sơn]; nếu thế lực của bạn có sự thay đổi về đội hình do phát động kỹ năng này, '
        + 'bạn rút X lá (X là số người của đội hình đông nhất trong những quan hệ đội hình ở thế lực của bạn có sự thay đổi).',
      bot: { use: 'always' },
      active: {
        cards: 'one', target: 'none',
        available: (g, s) => !g.player(s).flags.diaogui && g.targetsAs(s, 'diaohu').length > 0,
        cardOk: (g, s, id) => g.card(id).type === 'equip' && !g.cardBlocked(s, g.card(id)),
        checkCards: (g, _s, ids) => (g.card(ids[0]).type === 'equip' ? null : 'Cần chọn 1 lá trang bị'),
        run: async (g, s, [id]) => {
          g.player(s).flags.diaogui = 1;
          const cands = g.targetsAs(s, 'diaohu');
          const ts = await g.chooseTargets(s, 'Điều Quy: chọn 1–2 người làm mục tiêu của Điệu Hổ Ly Sơn', cands, 1, Math.min(2, cands.length), 'enemy');
          if (!ts.length) return;
          const before = factionFormations(g, s);
          await g.useCardAs(s, 'diaohu', ts, [id], { label: 'Điều Quy' });
          if (!g.player(s).alive) return;
          const after = factionFormations(g, s);
          const changed = [...before].filter((k) => !after.has(k)).concat([...after].filter((k) => !before.has(k)));
          const x = Math.max(0, ...changed.map((k) => k.split(',').length).filter((n) => n >= 2));
          if (x > 0) { g.say(`Điều Quy: đội hình thay đổi, ${name(g, s)} rút ${x} lá.`); await g.draw(s, x); }
        },
      },
    },
    {
      id: 'fengyang', name: 'Phong Dương',
      desc: 'Trận pháp kỹ. Quan hệ đội hình: người thế lực xác định khác bạn không thể thu lấy hoặc bỏ trang bị của người cùng đội hình với bạn. '
        + '(Đơn giản hóa: áp dụng cho Quá Hà Sách Kiều, Thuận Thủ Khiên Dương và các hiệu ứng chọn lá dùng chung của engine.)',
      protectEquip: (g, owner, chooser, target) => {
        if (chooser === owner || g.shownKingdom(chooser) === null || g.isSameFaction(chooser, owner)) return false;
        const f = g.formation(owner);
        return f.length >= 2 && f.includes(target);
      },
    },

    // ================= Chu Di =================
    {
      id: 'zhukou_zy', name: 'Trục Khấu',
      desc: 'Trong lượt của mỗi người, sau khi bạn gây sát thương lần đầu tiên trong giai đoạn ra bài của họ, bạn có thể rút X lá (X là số lá bạn đã sử dụng trong lượt này, tối đa 5).',
      triggers: [
        on('damageDealt', (g, ctx, o) => {
          if (ctx.source !== o || g.state.phase !== 'play' || !g.player(o).alive) return false;
          const st = store(g);
          if (st[`zhukou:dmg:${o}`] === g.state.turnCount) return false;
          const u = st[`zhukou:used:${o}`];
          return !!u && u.turn === g.state.turnCount && u.n > 0;
        }, async (g, _ctx, o) => {
          await g.draw(o, Math.min(5, store(g)[`zhukou:used:${o}`].n));
        }),
        observe('damageDealt', (g, ctx, o) => {
          if (ctx.source === o && g.state.phase === 'play') store(g)[`zhukou:dmg:${o}`] = g.state.turnCount;
        }),
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.seat !== o) return;
          const st = store(g);
          const k = `zhukou:used:${o}`;
          if (!st[k] || st[k].turn !== g.state.turnCount) st[k] = { turn: g.state.turnCount, n: 0 };
          st[k].n++;
        }),
      ],
    },
    {
      id: 'duannian', name: 'Đoạn Niệm',
      desc: 'Khi kết thúc giai đoạn ra bài, nếu bạn có bài trên tay, bạn có thể bỏ tất cả bài trên tay, sau đó bổ sung bài đến giới hạn máu.',
      bot: { confirm: (v) => v.myHand.length < v.players[v.me].maxHp },
      triggers: [
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && hand(g, o).length > 0, async (g, _ctx, o) => {
          await discardOwn(g, o, [...hand(g, o)], 'duannian');
          const n = g.player(o).maxHp - hand(g, o).length;
          if (n > 0) await g.draw(o, n);
        }),
      ],
    },
    {
      id: 'lianyou', name: 'Liên Hựu',
      desc: 'Khi bạn trận vong, bạn có thể lệnh cho 1 người khác nhận kỹ năng »Hưng Hỏa«.',
      triggers: [
        on('death', (g, ctx, o) => ctx.seat === o && g.alivePlayers().length > 0, async (g, _ctx, o) => {
          const cands = g.alivePlayers().map((p) => p.seat);
          const [t] = await g.chooseTargets(o, 'Liên Hựu: chọn người nhận »Hưng Hỏa«', cands, 0, 1, 'ally');
          if (t !== undefined) g.grantSkill(t, 'xinghuo');
        }),
      ],
    },
    {
      id: 'xinghuo', name: 'Hưng Hỏa',
      desc: 'Tỏa định kỹ: Khi bạn gây sát thương Hỏa, sát thương này +1.',
      triggers: [
        on('beforeDamage', (_g, ctx, o) => ctx.source === o && ctx.nature === 'fire' && ctx.amount > 0,
          (g, ctx) => { ctx.amount += 1; g.say('Hưng Hỏa: sát thương Hỏa +1.'); }, { compulsory: true }),
      ],
    },

    // ================= Viên Thuật =================
    {
      id: 'weidi', name: 'Ngụy Đế',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người khác đã nhận bài từ chồng bài rút trong lượt này, yêu cầu họ chấp hành 1 [Quân Lệnh], '
        + 'nếu họ không chấp hành, bạn thu lấy toàn bộ bài trên tay họ, sau đó giao cho họ lượng bài tương đương.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.weidi,
        validTarget: (g, s, t) => t !== s && store(g)[`drew:${t}`] === g.state.turnCount,
        run: async (g, s, _ids, [t]) => {
          g.player(s).flags.weidi = 1;
          const order = await g.drawOrder(s);
          if (await g.askOrder(s, t, order)) return;
          if (!g.player(t).alive || !g.player(s).alive) return;
          const n = hand(g, t).length;
          if (!n) return;
          await g.moveCards([...hand(g, t)], { kind: 'hand', seat: t }, { kind: 'hand', seat: s }, 'weidi');
          g.say(`${name(g, s)} thu lấy ${n} lá trên tay của ${name(g, t)}.`);
          const k = Math.min(n, allCards(g, s).length);
          const ids = await g.chooseCards(s, `Ngụy Đế: giao ${k} lá cho ${name(g, t)}`, allCards(g, s), k, k, true);
          await give(g, s, t, ids, 'weidi');
        },
      },
      triggers: [
        observe('cardsMoved', (g, ctx) => {
          if (ctx.from.kind === 'draw' && ctx.to.kind === 'hand' && ctx.reason !== 'deal') store(g)[`drew:${ctx.to.seat}`] = g.state.turnCount;
        }),
      ],
    },
    {
      id: 'yongsi', name: 'Dong Tứ',
      desc: 'Tỏa định kỹ: Nếu không có [Ngọc Tỷ] trong vùng trang bị của tất cả mọi người, bạn xem như có [Ngọc Tỷ] '
        + '(thế lực của bạn là đại thế lực duy nhất; giai đoạn bốc bài bốc thêm 1 lá; đầu giai đoạn ra bài coi như dùng 1 lá Tri Bỉ Tri Kỷ). '
        + 'Sau khi bạn trở thành mục tiêu của lá [Tri Bỉ Tri Kỷ], bạn mở ra tất cả bài trên tay.',
      virtualTreasure: (g) => (noJade(g) ? 'yuxi' : null),
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o && noJade(g), (g, ctx, o) => {
          ctx.count += 1; g.say(`Dong Tứ (Ngọc Tỷ): ${name(g, o)} bốc thêm 1 lá.`);
        }, { compulsory: true }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && noJade(g) && g.targetsAs(o, 'zhiji').length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Dong Tứ (Ngọc Tỷ): coi như dùng Tri Bỉ Tri Kỷ — chọn mục tiêu', g.targetsAs(o, 'zhiji'), 1, 1, 'enemy');
            if (t !== undefined) await g.useCardAs(o, 'zhiji', [t], [], { label: 'Dong Tứ' });
          }, { compulsory: true }),
        on('trickTargeted', (_g, ctx, o) => ctx.target === o && ctx.name === 'zhiji', (g, _ctx, o) => {
          const h = hand(g, o);
          g.say(`Dong Tứ: ${name(g, o)} mở bài trên tay: ${h.length ? h.map((id) => label(g, id)).join(', ') : '(không có)'}.`);
        }, { compulsory: true }),
      ],
    },

    // ================= Tả Từ =================
    {
      id: 'yigui', name: 'Dịch Quỷ',
      desc: '• Sau khi bạn mở tướng này lần đầu tiên, bạn nhận 2 lá từ chồng bài tướng đặt lên tướng này, gọi là [Hồn]. '
        + '• Khi bạn cần sử dụng lá cơ bản hoặc công cụ phổ thông có mục tiêu, nếu bạn chưa sử dụng lá đó bằng kỹ năng này trong lượt này, '
        + 'bạn có thể bỏ 1 [Hồn], xem như bạn sử dụng lá đó; mục tiêu của lá này chỉ có thể là người cùng thế lực với [Hồn] vừa bỏ '
        + 'hoặc người chưa xác định thế lực ([Hồn] là tướng 2 thế lực: chọn 1 trong 2 thế lực). '
        + '(Dùng chủ động trong giai đoạn ra bài; dùng như Đào khi có người hấp hối; khi cần đáp lại có thể bỏ 1 [Hồn] bất kỳ để xem như dùng [Thiểm] hoặc [Vô Giải].)',
      bot: {
        use: 'always',
        confirm: (v, h, req) => {
          const r = req?.respond;
          if (!r) return v.players.some((p) => p.alive && p.hp <= 0 && h.isAlly(p.seat));
          if (r.accept.includes('shan')) return true;
          const c = r.context;
          if (!c || c.kind !== 'nullify') return false;
          return !c.cancelled ? h.isAlly(c.target) && !h.isAlly(c.user) : h.isAlly(c.user) && !h.isAlly(c.target);
        },
      },
      // Cần Thiểm / Vô Giải: bỏ 1 [Hồn] bất kỳ (không xét thế lực), mỗi loại 1 lần mỗi lượt
      virtualRespond: (g, s, accept) => {
        if (!g.generalPile(s, 'Hồn').length) return [];
        return ['shan', 'wuxie'].filter((n) => accept.includes(n) && !yiguiUsed(g, s).includes(n));
      },
      payVirtual: async (g, s, as) => {
        const huns = g.generalPile(s, 'Hồn');
        if (!huns.length) return false;
        const hi = huns.length > 1 ? await g.choose(s, `Dịch Quỷ: bỏ 1 [Hồn] để xem như dùng ${g.cardInfo(as).label}`, huns.map((id) => hunLabel(g, id))) : 0;
        yiguiUsed(g, s).push(as);
        g.removeFromGeneralPile(s, 'Hồn', [huns[hi]]);
        return true;
      },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => inMyPlay(g, s) && yiguiCombos(g, s).length > 0,
        run: async (g, s) => {
          const combos = yiguiCombos(g, s);
          if (!combos.length) return;
          const ci = combos.length > 1 ? await g.choose(s, 'Dịch Quỷ: xem như dùng lá nào', combos.map((c) => g.cardInfo(c.n).label)) : 0;
          const { n, huns, cands } = combos[ci];
          const hi = huns.length > 1 ? await g.choose(s, 'Dịch Quỷ: bỏ 1 [Hồn]', huns.map((id) => hunLabel(g, id))) : 0;
          const hun = huns[hi];
          // [Hồn] 2 thế lực: hỏi dùng theo thế lực nào (mục tiêu: người thế lực đó hoặc chưa xác định thế lực)
          let kds = hunKingdoms(g, hun).filter((k) => cands.some((t) => hunAllows(g, k, t)));
          let k = kds[0];
          if (kds.length > 1 && n !== 'tao' && n !== 'jiu') {
            const ki = await g.choose(s, `Dịch Quỷ: [Hồn] ${g.generalName(hun)} có 2 thế lực — tác động lên thế lực nào? (kèm người chưa xác định thế lực)`,
              kds.map((x) => `${KD_LABEL[x] ?? x} (${cands.filter((t) => hunAllows(g, x, t)).map((t) => name(g, t)).join(', ')})`));
            k = kds[ki] ?? kds[0];
          }
          const ok = cands.filter((t) => hunAllows(g, k, t));
          let targets;
          const def = g.trickDef(n);
          if (n === 'tao' || n === 'jiu' || def?.targeting === 'self') targets = [s];
          else {
            const max = n === 'sha' ? 1 : Math.min(def?.max ?? 1, ok.length);
            targets = await g.chooseTargets(s, `Dịch Quỷ: chọn mục tiêu của ${g.cardInfo(n).label}`, ok, 1, max, harmfulAs(g, n) ? 'enemy' : 'ally');
            if (!targets.length) return;
          }
          yiguiUsed(g, s).push(n);
          g.removeFromGeneralPile(s, 'Hồn', [hun]);
          await g.useCardAs(s, n, targets, [], { countSlash: true, label: 'Dịch Quỷ' });
        },
      },
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'new_zuoci' && !store(g)[`yigui:first:${o}`],
          async (g, _ctx, o) => {
            store(g)[`yigui:first:${o}`] = true;
            await gainHun(g, o, 2);
          }, { compulsory: true }),
        on('dying', (g, ctx, o) => g.player(ctx.seat).alive && g.player(ctx.seat).hp <= 0 && g.player(o).alive && g.canSave(o, ctx.seat)
          && !yiguiUsed(g, o).includes('tao') && g.generalPile(o, 'Hồn').some((id) => hunAllowsAny(g, id, ctx.seat)),
          async (g, ctx, o) => {
            const huns = g.generalPile(o, 'Hồn').filter((id) => hunAllowsAny(g, id, ctx.seat));
            if (!huns.length) return;
            const hi = huns.length > 1 ? await g.choose(o, 'Dịch Quỷ: bỏ 1 [Hồn] để dùng như Đào', huns.map((id) => hunLabel(g, id))) : 0;
            yiguiUsed(g, o).push('tao');
            g.removeFromGeneralPile(o, 'Hồn', [huns[hi]]);
            g.say(`${name(g, o)} dùng Dịch Quỷ như Đào cứu ${name(g, ctx.seat)}.`);
            await g.recover(ctx.seat, 1, o);
          }),
      ],
    },
    {
      id: 'jihun', name: 'Cấp Hồn',
      desc: 'Sau khi bạn nhận sát thương hoặc sau khi 1 người thế lực xác định khác với bạn thoát khỏi trạng thái hấp hối, bạn có thể nhận 1 lá từ chồng bài tướng đặt lên tướng này, gọi là [Hồn].',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && g.generalDeck().length > 0, async (g, _ctx, o) => { await gainHun(g, o, 1); }),
        on('recovered', (g, ctx, o) => ctx.seat !== o && g.player(ctx.seat).hp > 0 && store(g)[`jihun:dying:${o}`]?.has(ctx.seat)
          && g.shownKingdom(ctx.seat) !== null && !g.isSameFaction(o, ctx.seat) && g.generalDeck().length > 0,
          async (g, _ctx, o) => { await gainHun(g, o, 1); }),
        observe('dying', (g, ctx, o) => {
          const k = `jihun:dying:${o}`;
          (store(g)[k] ??= new Set()).add(ctx.seat);
        }),
        observe('recovered', (g, ctx, o) => { if (g.player(ctx.seat).hp > 0) store(g)[`jihun:dying:${o}`]?.delete(ctx.seat); }),
        observe('death', (g, ctx, o) => { store(g)[`jihun:dying:${o}`]?.delete(ctx.seat); }),
      ],
    },

    // ================= Nam Hoa Lão Tiên =================
    {
      id: 'gongxiu', name: 'Cộng Tu',
      desc: 'Giai đoạn rút bài, bạn có thể rút ít đi 1 lá, sau đó lựa chọn tối đa X người (X là giới hạn máu của bạn), bạn chọn 1 mục: '
        + '1. Họ rút 1 lá; 2. Họ bỏ 1 lá. Không thể liên tiếp lựa chọn cùng 1 mục.',
      triggers: [
        on('drawPhase', (_g, ctx, o) => ctx.seat === o && ctx.count > 0, async (g, ctx, o) => {
          ctx.count -= 1;
          const last = store(g)[`gongxiu:last:${o}`];
          const opts = [{ k: 0, label: 'Họ rút 1 lá' }, { k: 1, label: 'Họ bỏ 1 lá' }].filter((x) => x.k !== last);
          const i = opts.length > 1 ? await g.choose(o, 'Cộng Tu: chọn 1 mục', opts.map((x) => x.label)) : 0;
          const k = opts[i].k;
          store(g)[`gongxiu:last:${o}`] = k;
          const x = g.player(o).maxHp;
          const cands = g.alivePlayers().map((p) => p.seat).filter((t) => (t === o || g.canTarget(o, t)) && (k === 0 || allCards(g, t).length > 0));
          const ts = await g.chooseTargets(o, `Cộng Tu: chọn tối đa ${x} người ${k === 0 ? 'rút 1 lá' : 'bỏ 1 lá'}`, cands, 1, Math.min(x, cands.length), k === 0 ? 'ally' : 'enemy');
          for (const t of ts) {
            if (!g.player(t).alive) continue;
            if (k === 0) await g.draw(t, 1);
            else await discardN(g, t, 1, 'Cộng Tu: bỏ 1 lá');
          }
        }),
      ],
    },
    {
      id: 'jinghe', name: 'Kinh Hợp',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể mở tối đa X lá trên tay (X là giới hạn máu của bạn) và chọn số người tương đương có tướng đã mở; '
        + 'bạn mở ra ngẫu nhiên số kỹ năng bằng số người đã chọn, mỗi người có thể chọn và nhận 1 kỹ năng trong đó đến khi bắt đầu lượt tiếp theo của bạn. '
        + '(Các kỹ năng Thiên Thư: Lôi Kích, Âm Binh, Hoạt Khí, Quỷ Trợ, Tiên Thụ, Luận Đạo, Quan Nguyệt, Ngôn Chính.)',
      bot: { use: 'always' },
      active: {
        cards: 'any', target: 'none', minCards: 1,
        available: (g, s) => !g.player(s).flags.jinghe && jingheTargets(g).length > 0,
        checkCards: (g, s, ids) => (ids.length <= Math.min(g.player(s).maxHp, jingheTargets(g).length, JINGHE_POOL.length) ? null
          : `Chỉ được mở tối đa ${Math.min(g.player(s).maxHp, jingheTargets(g).length)} lá`),
        run: async (g, s, ids) => {
          g.player(s).flags.jinghe = 1;
          g.say(`${name(g, s)} mở ${ids.map((id) => label(g, id)).join(', ')}.`);
          const n = ids.length;
          const ts = await g.chooseTargets(s, `Kinh Hợp: chọn ${n} người có tướng đã mở`, jingheTargets(g), n, n, 'ally');
          const pool = [...JINGHE_POOL];
          const shown = [];
          for (let i = 0; i < ts.length && pool.length; i++) shown.push(pool.splice(g.randomInt(pool.length), 1)[0]);
          g.say(`Kinh Hợp mở ra các kỹ năng: ${shown.map((k) => g.skillName(k)).join(', ')}.`);
          const granted = [];
          for (const t of ts) {
            if (!shown.length || !g.player(t).alive) continue;
            const opts = [...shown.map((k) => g.skillName(k)), 'Không nhận'];
            const i = await g.choose(t, 'Kinh Hợp: chọn 1 kỹ năng để nhận', opts);
            if (i >= shown.length) continue;
            const k = shown.splice(i, 1)[0];
            g.grantSkill(t, k);
            granted.push([t, k]);
          }
          if (!granted.length) return;
          const off = () => {
            for (const [t, k] of granted) g.revokeSkill(t, k);
            g.say('Hiệu lực Kinh Hợp kết thúc.');
          };
          busOnce(g, 'turnStart', (c) => { if (c.seat !== s) return false; off(); return true; });
        },
      },
    },
    {
      id: 'leiji_tianshu', name: 'Lôi Kích',
      desc: 'Khi bạn sử dụng/đánh ra [Thiểm], bạn có thể lệnh 1 người khác tiến hành phán xét, nếu kết quả phán xét có chất BÍCH, bạn gây 2 sát thương Lôi cho họ.',
      triggers: [
        on('cardResponded', (g, ctx, o) => ctx.seat === o && ctx.as === 'shan' && others(g, o).length > 0, async (g, _ctx, o) => {
          const [t] = await g.chooseTargets(o, 'Lôi Kích: chọn 1 người phải phán xét', others(g, o), 0, 1, 'enemy');
          if (t === undefined) return;
          const j = await g.judge(t, 'Lôi Kích');
          const spade = j.suit === 'spade';
          await g.finishJudge(j);
          if (spade) await g.damage({ source: o, target: t, amount: 2, card: null, nature: 'thunder', cancelled: false });
        }),
      ],
    },
    {
      id: 'yinbing', name: 'Âm Binh',
      desc: 'Tỏa định kỹ: • Khi bắt đầu kết toán hiệu quả của [Sát] (do bạn sử dụng), sửa hiệu quả thành mục tiêu mất X máu (X là số sát thương). • Sau khi người khác mất máu, bạn rút 1 lá.',
      triggers: [
        on('beforeDamage', (_g, ctx, o) => ctx.source === o && ctx.cardAs === 'sha' && !ctx.cancelled && ctx.amount > 0, async (g, ctx) => {
          ctx.cancelled = true;
          g.say(`Âm Binh: Sát khiến ${name(g, ctx.target)} mất máu thay vì chịu sát thương.`);
          await g.loseHp(ctx.target, ctx.amount);
        }, { compulsory: true }),
        on('hpLost', (g, ctx, o) => ctx.seat !== o && g.player(o).alive, async (g, _ctx, o) => { await g.draw(o, 1); }, { compulsory: true }),
      ],
    },
    {
      id: 'huoqi', name: 'Hoạt Khí',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá và chọn 1 người có ít máu nhất, lệnh họ hồi 1 máu và rút 1 lá.',
      bot: { use: 'always', target: 'ally' },
      active: {
        cards: 'one', target: 'one',
        available: (g, s) => !g.player(s).flags.huoqi,
        validTarget: (g, _s, t) => g.player(t).hp === Math.min(...g.alivePlayers().map((p) => p.hp)),
        run: async (g, s, ids, [t]) => {
          g.player(s).flags.huoqi = 1;
          await discardOwn(g, s, ids);
          await g.recover(t, 1, s);
          await g.draw(t, 1);
        },
      },
    },
    {
      id: 'guizhu', name: 'Quỷ Trợ',
      desc: 'Một lần trong lượt của mỗi người, khi 1 người tiến vào trạng thái hấp hối, bạn có thể rút 2 lá.',
      triggers: [
        on('dying', (g, _ctx, o) => g.player(o).alive && !usedThisTurn(g, o, 'guizhu'), async (g, _ctx, o) => {
          oncePerTurn(g, o, 'guizhu');
          await g.draw(o, 2);
        }),
      ],
    },
    {
      id: 'xianshou', name: 'Tiên Thụ',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 1 người: nếu họ đã bị thương, họ rút 1 lá; nếu không, họ rút 2 lá.',
      bot: { use: 'always', target: 'ally' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.xianshou,
        validTarget: () => true,
        run: async (g, s, _ids, [t]) => {
          g.player(s).flags.xianshou = 1;
          const p = g.player(t);
          await g.draw(t, p.hp < p.maxHp ? 1 : 2);
        },
      },
    },
    {
      id: 'lundao', name: 'Luận Đạo',
      desc: 'Sau khi nhận sát thương, nếu số bài trên tay nguồn sát thương so với bạn: nhiều hơn: bạn có thể bỏ 1 lá của họ; ít hơn: bạn có thể rút 1 lá.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive
          && hand(g, ctx.source).length !== hand(g, o).length, async (g, ctx, o) => {
          const src = ctx.source;
          if (hand(g, src).length > hand(g, o).length) await discardFrom(g, o, src, 'Luận Đạo: chọn lá để bỏ');
          else if (hand(g, src).length < hand(g, o).length) await g.draw(o, 1);
        }),
      ],
    },
    {
      id: 'guanyue', name: 'Quan Nguyệt',
      desc: 'Khi bắt đầu giai đoạn kết thúc, bạn có thể xem 2 lá trên đầu chồng bài rút, thu lấy 1 lá trong số đó.',
      triggers: [
        on('phaseStart', (_g, ctx, o) => ctx.seat === o && ctx.phase === 'end', async (g, _ctx, o) => {
          const top = g.state.drawPile.slice(-2).reverse();
          if (!top.length) return;
          const [id] = await g.chooseCards(o, 'Quan Nguyệt: chọn 1 lá để thu lấy', top, 1, 1, true);
          await g.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat: o }, 'guanyue');
          g.say(`${name(g, o)} thu lấy 1 lá từ đầu chồng bài.`);
        }),
      ],
    },
    {
      id: 'yanzheng', name: 'Ngôn Chính',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, nếu số bài trên tay bạn > 1, bạn có thể giữ lại 1 lá và bỏ đi số lá còn lại và chọn tối đa X người (X là số lá đã bỏ), bạn gây 1 sát thương cho họ.',
      bot: { confirm: (v) => v.myHand.length >= 2 && v.myHand.length <= 3 },
      triggers: [
        on('phaseStart', (_g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && _g.player(o).hand.length > 1, async (g, _ctx, o) => {
          const [keep] = await g.chooseCards(o, 'Ngôn Chính: giữ lại 1 lá', [...hand(g, o)], 1, 1);
          const drop = hand(g, o).filter((id) => id !== keep);
          await discardOwn(g, o, drop, 'yanzheng');
          const cands = others(g, o);
          const ts = await g.chooseTargets(o, `Ngôn Chính: chọn tối đa ${drop.length} người chịu 1 sát thương`, cands, 0, Math.min(drop.length, cands.length), 'enemy');
          for (const t of ts) if (g.player(t).alive) await g.damage({ source: o, target: t, amount: 1, card: null, cancelled: false });
        }),
      ],
    },

    // ================= Lữ Linh Khởi =================
    {
      id: 'guowu', name: 'Quắc Vũ',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể mở tất cả bài trên tay, căn cứ vào số loại bài bạn có mà bạn nhận hiệu quả tương ứng: '
        + '1+: bạn thu lấy 1 lá [Sát] ngẫu nhiên từ chồng bài bỏ; 2+: trong giai đoạn này, bạn sử dụng bài không giới hạn khoảng cách; '
        + '3+: một lần trong giai đoạn này, sau khi bạn chỉ định mục tiêu của [Sát], bạn có thể chỉ định thêm tối đa 2 mục tiêu.',
      offenseBonus: (g, o) => (g.state.currentSeat === o && g.state.phase === 'play' && (g.player(o).flags.guowu ?? 0) >= 2 ? 99 : 0),
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && hand(g, o).length > 0, async (g, _ctx, o) => {
          const h = hand(g, o);
          const types = new Set(h.map((id) => typeOf(g.card(id)))).size;
          g.say(`${name(g, o)} mở bài trên tay: ${h.map((id) => label(g, id)).join(', ')} — ${types} loại bài.`);
          g.player(o).flags.guowu = types;
          const shas = g.state.discardPile.filter((id) => g.card(id).name === 'sha');
          if (shas.length) {
            const id = shas[g.randomInt(shas.length)];
            await g.moveCards([id], { kind: 'discard' }, { kind: 'hand', seat: o }, 'guowu');
            g.say(`${name(g, o)} thu lấy ${label(g, id)} từ chồng bài bỏ.`);
          }
          if (types >= 2) g.say('Quắc Vũ: giai đoạn này dùng bài không giới hạn khoảng cách.');
        }),
        on('cardUsed', (g, ctx, o) => ctx.seat === o && ctx.as === 'sha' && inMyPlay(g, o) && (g.player(o).flags.guowu ?? 0) >= 3
          && !g.player(o).flags.guowu3 && guowuExtra(g, o, ctx.targets).length > 0, async (g, ctx, o) => {
          g.player(o).flags.guowu3 = 1;
          const cands = guowuExtra(g, o, ctx.targets);
          const extra = await g.chooseTargets(o, 'Quắc Vũ: chỉ định thêm tối đa 2 mục tiêu cho Sát', cands, 0, Math.min(2, cands.length), 'enemy');
          for (const t of extra) if (!ctx.targets.includes(t)) ctx.targets.push(t);
          if (extra.length) g.say(`Quắc Vũ: Sát có thêm mục tiêu ${extra.map((t) => name(g, t)).join(', ')}.`);
        }),
      ],
    },
    {
      id: 'zhuangrong', name: 'Trang Nhung',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá công cụ, bạn nhận kỹ năng »Vô Song« trong giai đoạn này.',
      bot: { use: 'always' },
      active: {
        cards: 'one', target: 'none',
        available: (g, s) => !g.player(s).flags.zhuangrong && inMyPlay(g, s),
        cardOk: (g, _s, id) => isTrickCard(g.card(id)),
        checkCards: (g, _s, ids) => (isTrickCard(g.card(ids[0])) ? null : 'Cần bỏ 1 lá công cụ'),
        run: async (g, s, ids) => {
          g.player(s).flags.zhuangrong = 1;
          await discardOwn(g, s, ids);
          const had = g.grantedSkills(s).includes('vosong');
          g.grantSkill(s, 'vosong', true);
          if (had) return;
          busOnce(g, 'phaseEnd', (c) => {
            if (c.seat !== s || c.phase !== 'play') return false;
            g.revokeSkill(s, 'vosong');
            return true;
          });
        },
      },
    },
    {
      id: 'shenwei', name: 'Thần Uy',
      desc: 'Chủ tướng kỹ, Tỏa định kỹ, giảm 0.5 máu gốc: • Giới hạn trữ bài trên tay bạn +2; • Giai đoạn rút bài, nếu bạn là người có số máu lớn nhất, số lá bạn rút +2.',
      position: 'main',
      handLimitBonus: () => 2,
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o && g.alivePlayers().every((p) => p.hp <= g.player(o).hp), (g, ctx, o) => {
          ctx.count += 2; g.say(`Thần Uy: ${name(g, o)} rút thêm 2 lá.`);
        }, { compulsory: true }),
        // Giảm 0.5 máu gốc khi là chủ tướng (âm dương ngư của tướng này −1)
        observe('gameStart', (g, _ctx, o) => {
          const st = store(g);
          if (st[`shenwei:hp:${o}`] || slotOf(g, o, 'lvlingqi') !== 'main') return;
          st[`shenwei:hp:${o}`] = true;
          const h = g.hero(o);
          const fish = (g.generalInfo(h.main.generalId)?.halfHp ?? 0) - 1 + (g.generalInfo(h.deputy.generalId)?.halfHp ?? 0);
          const p = g.player(o);
          p.maxHp = Math.max(1, Math.floor(fish / 2));
          p.hp = Math.min(p.hp, p.maxHp);
        }),
      ],
    },

    // ================= Nễ Hành =================
    {
      id: 'kuangcai', name: 'Cuồng Tài',
      desc: 'Tỏa định kỹ: • Bài bạn sử dụng trong lượt không bị giới hạn khoảng cách và số lần sử dụng; • Khi bắt đầu giai đoạn bỏ bài, nếu trong lượt này: '
        + 'bạn có sử dụng bài và không gây sát thương: giới hạn trữ bài của bạn từ nay về sau −1; bạn không sử dụng bài: giới hạn trữ bài của bạn từ nay về sau +1. '
        + '(Đơn giản hóa: "không giới hạn số lần" áp dụng cho Sát; Rượu vẫn 1 lần mỗi lượt.)',
      slashLimit: Infinity,
      offenseBonus: (g, o) => (g.state.currentSeat === o ? 99 : 0),
      handLimitBonus: (g, o) => store(g)[`kuangcai:${o}`] ?? 0,
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'discard'
          && !((g.player(o).flags.stat_used ?? 0) > 0 && (g.player(o).flags.stat_dmg ?? 0) > 0), (g, _ctx, o) => {
          const used = (g.player(o).flags.stat_used ?? 0) > 0;
          const d = used ? -1 : 1;
          const k = `kuangcai:${o}`;
          store(g)[k] = (store(g)[k] ?? 0) + d;
          g.say(`Cuồng Tài: giới hạn trữ bài của ${name(g, o)} ${d > 0 ? '+1' : '−1'} (tổng ${store(g)[k] >= 0 ? '+' : ''}${store(g)[k]}).`);
        }, { compulsory: true }),
      ],
    },
    {
      id: 'shejian', name: 'Thiệt Kiếm',
      desc: 'Sau khi bạn trở thành mục tiêu duy nhất của bài do người khác sử dụng, nếu không có ai đang giải quyết hấp hối, bạn có thể bỏ tất cả bài trên tay (tối thiểu 1), '
        + 'sau đó chọn 1 mục: 1. Bạn bỏ X lá của người sử dụng bài (X là số lá bạn đã bỏ); 2. Bạn gây 1 sát thương cho người sử dụng bài.',
      bot: { confirm: (v, h) => v.myHand.length >= 1 && v.myHand.length <= 2 && !h.isAlly(v.currentSeat) },
      triggers: [
        on('cardUsed', (g, ctx, o) => {
          if (ctx.seat === o || !g.player(ctx.seat).alive || hand(g, o).length === 0) return false;
          if (g.alivePlayers().some((p) => p.hp <= 0)) return false;
          const info = g.cardInfo(ctx.as);
          const ts = info?.type === 'delayed' ? ctx.targets : info?.type === 'equip' ? [] : effectiveTargets(g, ctx);
          return ts.length === 1 && ts[0] === o;
        }, async (g, ctx, o) => {
          const u = ctx.seat;
          const ids = [...hand(g, o)];
          await discardOwn(g, o, ids, 'shejian');
          const x = ids.length;
          const opts = [`Bỏ ${x} lá của ${name(g, u)}`, `Gây 1 sát thương cho ${name(g, u)}`];
          const i = allCards(g, u).length ? await g.choose(o, 'Thiệt Kiếm: chọn 1 mục', opts) : 1;
          if (i === 0) {
            for (let k = 0; k < x && allCards(g, u).length && g.player(u).alive; k++) await discardFrom(g, o, u, 'Thiệt Kiếm: chọn lá để bỏ');
          } else if (g.player(u).alive) {
            await g.damage({ source: o, target: u, amount: 1, card: null, cancelled: false });
          }
        }),
      ],
    },

    // ================= Himiko =================
    {
      id: 'guishu', name: 'Quỷ Thuật',
      desc: 'Bạn có thể chuyển hóa sử dụng 1 lá BÍCH trên tay thành [Tri Bỉ Tri Kỷ]/[Viễn Giao Cận Công]; bạn cần sử dụng xen kẽ 2 lá trên theo cách này trong cùng 1 lượt.',
      convert: (g, s, c) => {
        if (c.suit !== 'spade' || !g.player(s).hand.includes(c.id) || !inMyPlay(g, s)) return [];
        const last = g.player(s).flags.guishuLast;
        return last === 1 ? ['yuanjiao'] : last === 2 ? ['zhiji'] : ['zhiji', 'yuanjiao'];
      },
      triggers: [
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.seat === o && inMyPlay(g, o) && ctx.card.suit === 'spade' && ctx.card.name !== ctx.as) {
            if (ctx.as === 'zhiji') g.player(o).flags.guishuLast = 1;
            else if (ctx.as === 'yuanjiao') g.player(o).flags.guishuLast = 2;
          }
        }),
        // Trùng chú lá Bích như Tri Bỉ Tri Kỷ cũng tính là lần dùng [Tri Bỉ Tri Kỷ]
        observe('cardsMoved', (g, ctx, o) => {
          if (ctx.reason === 'recast' && inMyPlay(g, o)
            && ctx.cardIds.some((id) => g.card(id).suit === 'spade' && !['zhiji', 'tiesuo', 'lulitongxin'].includes(g.card(id).name))) {
            g.player(o).flags.guishuLast = 1;
          }
        }),
      ],
    },
    {
      id: 'yuanyu', name: 'Viễn Vực',
      desc: 'Tỏa định kỹ: Khi bạn tính toán sát thương phải nhận, nếu bạn không thuộc tầm đánh của nguồn sát thương, sát thương này −1.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive && ctx.amount > 0
          && g.distance(ctx.source, o) > g.attackRange(ctx.source), (g, ctx, o) => {
          ctx.amount -= 1; g.say(`Viễn Vực: sát thương lên ${name(g, o)} −1.`);
        }, { compulsory: true }),
      ],
    },
  ],
};

function noJade(g) {
  return !g.alivePlayers().some((p) => g.equipOf(p.seat, 'treasure')?.name === 'yuxi');
}

function guowuExtra(g, o, current) {
  return g.alivePlayers().map((p) => p.seat).filter((t) => t !== o && !current.includes(t) && g.canTargetWithCard(o, t) && g.canBeSlashTarget(o, t));
}
