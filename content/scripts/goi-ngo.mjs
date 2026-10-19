// ============================================================
// Gói tướng mới — NGÔ.
// ============================================================
import {
  allCards, askOrder, besiegers, chooseOwn, discardFrom, discardOwn, drawOrder, give, hand, isBasic, isEquip, isFemale, isRed,
  label, limitedUsed, lostHp, markLimited, name, observe, on, oncePerTurn, others, pickCard, putEquip, sameFactionSeats,
  slotOf, store, zoneOf, SLOTS,
} from './lib/tro-giup.mjs';

const equipsOf = (g, s) => SLOTS.flatMap((sl) => g.player(s).equips[sl]);
const emptySlot = (g, s, slot) => g.player(s).equips[slot].length === 0;
/** Lá có khả năng gây sát thương (Trúc Vi, Phong Thế). */
const DAMAGE_CARDS = new Set(['sha', 'juedou', 'nanman', 'wanjian', 'huogong', 'shandian', 'huoshao', 'shuiyan', 'wenhe']);
/** Lý do di chuyển bài KHÔNG phải "bị bỏ" (dùng, đánh ra, phán định...). */
const NOT_DISCARD = new Set(['use', 'settle', 'respond', 'save', 'judge', 'death', 'recast', 'replace', 'reshuffle', 'pindian', 'delayed', 'judgePhase']);

export default {
  skills: [
    // ---------------- Cam Ninh ----------------
    {
      id: 'qixi', name: 'Kỳ Tập',
      desc: 'Giai đoạn ra bài, bạn có thể chuyển hóa sử dụng lá Đen thành [Quá Hà Sách Kiều].',
      convert: (_g, _s, c) => (!isRed(c) ? ['guohe'] : []),
    },

    // ---------------- Đại Kiều ----------------
    {
      id: 'guose', name: 'Quốc Sắc',
      desc: 'Giai đoạn ra bài, bạn có thể chuyển hóa sử dụng lá RÔ thành [Lạc Bất Tư Thục].',
      convert: (_g, _s, c) => (c.suit === 'diamond' ? ['lebu'] : []),
    },
    {
      id: 'liuli', name: 'Lưu Ly',
      desc: 'Khi bạn trở thành mục tiêu của [Sát], bạn có thể bỏ đi 1 lá, thay đổi mục tiêu của [Sát] này thành người khác trong tầm đánh của bạn '
        + '(không thể là người sử dụng [Sát] và người đã là mục tiêu của [Sát] này).',
      triggers: [
        observe('cardUsed', (g, ctx) => { if (ctx.as === 'sha') store(g).liuliTargets = [...ctx.targets]; }),
        on('slashTargeted', (g, ctx, o) => ctx.target === o && ctx.source !== o && !ctx.cancelled && allCards(g, o).length > 0
          && liuliTargets(g, ctx, o).length > 0,
          async (g, ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Lưu Ly: chuyển Sát sang ai', liuliTargets(g, ctx, o), 1, 1, 'enemy');
            if (t === undefined) return;
            const ids = await chooseOwn(g, o, 'Lưu Ly: bỏ 1 lá', 1, 1);
            if (!ids?.length) return;
            await discardOwn(g, o, ids);
            ctx.cancelled = true;
            g.say(`Sát được chuyển sang ${name(g, t)}.`);
            await g.resolveSlash(ctx.source, t, ctx.card);
          }),
      ],
    },

    // ---------------- Tôn Thượng Hương ----------------
    {
      id: 'jieyin', name: 'Kết Nhân',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 2 lá trên tay và chọn 1 người có giới tính nam đang bị thương, bạn và họ hồi 1 máu.',
      bot: { use: 'always', target: 'ally' },
      active: {
        cards: 'any', target: 'one', minCards: 2, maxCards: 2,
        checkCards: (_g, _s, ids) => (ids.length === 2 ? null : 'Cần chọn đúng 2 lá'),
        available: (g, s) => !g.player(s).flags.jieyin && hand(g, s).length >= 2,
        validTarget: (g, s, t) => t !== s && !isFemale(g, t) && g.player(t).hp < g.player(t).maxHp,
        run: async (g, s, ids, [t]) => {
          g.player(s).flags.jieyin = 1;
          await discardOwn(g, s, ids);
          await g.recover(s, 1, s);
          await g.recover(t, 1, s);
        },
      },
    },
    {
      id: 'xiaoji', name: 'Kiêu Cơ',
      desc: 'Sau khi bạn mất bài trong vùng trang bị, bạn có thể: nếu đang là lượt của bạn, bạn rút 1 lá; nếu không phải lượt của bạn, bạn rút 3 lá.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => ctx.from.kind === 'equip' && ctx.from.seat === o && g.player(o).alive
          && !(ctx.to.kind === 'equip' && ctx.to.seat === o),
          async (g, _ctx, o) => { await g.draw(o, g.state.currentSeat === o ? 1 : 3); }),
      ],
    },

    // ---------------- Tôn Kiên ----------------
    {
      id: 'yinghun_sunjian', name: 'Anh Hồn',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể chọn 1 người khác và chọn 1 mục: 1. Lệnh họ rút X lá sau đó bỏ 1 lá; '
        + '2. Lệnh họ rút 1 lá sau đó bỏ X lá (X là số máu bạn đã mất).',
      bot: { confirm: (v) => v.players[v.me].hp < v.players[v.me].maxHp || v.players.some((p) => p.alive && p.seat !== v.me && p.kingdom && p.kingdom === v.players[v.me].kingdom) },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && others(g, o).length > 0,
          async (g, _ctx, o) => {
            const x = lostHp(g, o);
            const [t] = await g.chooseTargets(o, 'Anh Hồn: chọn một người', others(g, o), 1, 1, 'ally');
            if (t === undefined) return;
            const pick = x === 0 ? 1 : x === 1 ? 0 : await g.choose(o, `Anh Hồn với ${name(g, t)}`, [`Rút ${x} lá, bỏ 1 lá`, `Rút 1 lá, bỏ ${x} lá`]);
            if (pick === 0) { await g.draw(t, x); await g.forceDiscard(t, 1, 'yinghun'); }
            else { await g.draw(t, 1); if (x > 0) await g.forceDiscard(t, x, 'yinghun'); }
          }),
      ],
    },

    // ---------------- Tiểu Kiều ----------------
    {
      id: 'tianxiang', name: 'Thiên Hương',
      desc: 'Hai lần trong lượt của mỗi người, khi bạn nhận sát thương, bạn có thể bỏ 1 lá CƠ trên tay và lựa chọn 1 người khác, bạn chặn sát thương này, '
        + 'sau đó bạn chọn 1 mục mà chưa chọn trong lượt này: 1. Nếu sát thương này có nguồn, bạn lệnh nguồn sát thương gây 1 sát thương cho họ, '
        + 'sau đó họ rút X lá (X là số máu họ đã mất, tối đa 5); 2. Lệnh họ mất 1 máu, sau đó họ thu lấy lá bạn vừa bỏ.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.target === o && ctx.amount > 0 && tianxiangOpts(g, ctx, o).length > 0
          && hand(g, o).some((id) => heartFor(g, o, g.card(id))) && others(g, o).length > 0,
          async (g, ctx, o) => {
            const hearts = hand(g, o).filter((id) => heartFor(g, o, g.card(id)));
            const [id] = await g.chooseCards(o, 'Thiên Hương: bỏ 1 lá Cơ', hearts, 1, 1);
            const [t] = await g.chooseTargets(o, 'Thiên Hương: chọn 1 người khác', others(g, o), 1, 1, 'enemy');
            if (t === undefined) return;
            const opts = tianxiangOpts(g, ctx, o);
            await discardOwn(g, o, [id]);
            ctx.cancelled = true;
            g.say(`${name(g, o)} chặn sát thương.`);
            const LABEL = {
              1: `${ctx.source !== null ? name(g, ctx.source) : ''} gây 1 sát thương cho ${name(g, t)}, rồi họ rút số lá bằng số máu đã mất`,
              2: `${name(g, t)} mất 1 máu, rồi thu lấy lá vừa bỏ`,
            };
            const i = opts.length > 1 ? await g.choose(o, 'Thiên Hương: chọn 1 mục', opts.map((x) => LABEL[x])) : 0;
            const k = `tianxiang:${o}`;
            const rec = store(g)[k]?.turn === g.state.turnCount ? store(g)[k] : { turn: g.state.turnCount, used: [] };
            rec.used.push(opts[i]);
            store(g)[k] = rec;
            if (opts[i] === 1) {
              await g.damage({ source: ctx.source, target: t, amount: 1, card: null, cancelled: false });
              if (g.player(t).alive && lostHp(g, t) > 0) await g.draw(t, Math.min(5, lostHp(g, t)));
            } else {
              await g.loseHp(t, 1);
              if (g.player(t).alive && g.state.discardPile.includes(id)) {
                await g.moveCards([id], { kind: 'discard' }, { kind: 'hand', seat: t }, 'tianxiang');
                g.say(`${name(g, t)} thu lấy ${label(g, id)}.`);
              }
            }
          }),
      ],
    },
    {
      id: 'hongyan', name: 'Hồng Nhan',
      desc: 'Tỏa định kỹ: lá BÍCH của bạn và kết quả phán xét BÍCH của bạn xem như CƠ; nếu bạn có lá CƠ trong vùng trang bị, giới hạn trữ bài của bạn +1. '
        + '(Đơn giản hóa: lá Bích chỉ được xem như Cơ khi dùng Thiên Hương và khi xét vùng trang bị; kết quả phán xét không đổi.)',
      handLimitBonus: (g, o) => (equipsOf(g, o).some((id) => ['heart', 'spade'].includes(g.card(id).suit)) ? 1 : 0),
    },

    // ---------------- Lỗ Túc ----------------
    {
      id: 'haoshi', name: 'Hảo Thí',
      desc: 'Giai đoạn rút bài, bạn có thể rút thêm 2 lá; ▶ Sau khi bạn rút bài, nếu số bài trên tay bạn > 5, bạn giao một nửa bài trên tay '
        + '(làm tròn xuống) cho 1 người khác có số bài trên tay ít nhất.',
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o, (g, ctx, o) => { ctx.count += 2; g.player(o).flags.haoshi = 1; }),
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'draw' && g.player(o).flags.haoshi === 1 && hand(g, o).length > 5,
          async (g, _ctx, o) => {
            g.player(o).flags.haoshi = 0;
            const least = Math.min(...others(g, o).map((s) => hand(g, s).length));
            const cands = others(g, o, (s) => hand(g, s).length === least);
            const [t] = await g.chooseTargets(o, 'Hảo Thí: giao bài cho ai', cands, 1, 1, 'ally');
            if (t === undefined) return;
            const n = Math.floor(hand(g, o).length / 2);
            const ids = await g.chooseCards(o, `Hảo Thí: chọn ${n} lá giao cho ${name(g, t)}`, [...hand(g, o)], n, n);
            await give(g, o, t, ids);
          }, { compulsory: true }),
      ],
    },
    {
      id: 'dimeng', name: 'Địch Minh',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 2 người khác và bỏ đi X lá (X là số bài chênh lệch trên tay giữa 2 người), lệnh họ hoán đổi bài trên tay.',
      bot: { use: 'never' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.dimeng && others(g, s).length >= 2,
        validTarget: (g, s, t) => t !== s,
        run: async (g, s, _c, [a]) => {
          const cands = others(g, s, (x) => x !== a && Math.abs(hand(g, x).length - hand(g, a).length) <= allCards(g, s).length);
          const [b] = await g.chooseTargets(s, `Địch Minh: chọn người đổi bài với ${name(g, a)}`, cands, 1, 1);
          if (b === undefined) return;
          g.player(s).flags.dimeng = 1;
          const x = Math.abs(hand(g, a).length - hand(g, b).length);
          if (x > 0) {
            const ids = await chooseOwn(g, s, `Địch Minh: bỏ ${x} lá`, x, x);
            await discardOwn(g, s, ids ?? []);
          }
          const ha = [...hand(g, a)], hb = [...hand(g, b)];
          await g.moveCards(ha, { kind: 'hand', seat: a }, { kind: 'processing' }, 'dimeng');
          await g.moveCards(hb, { kind: 'hand', seat: b }, { kind: 'hand', seat: a }, 'dimeng');
          await g.moveCards(ha, { kind: 'processing' }, { kind: 'hand', seat: b }, 'dimeng');
          g.say(`${name(g, a)} và ${name(g, b)} đổi bài trên tay cho nhau.`);
        },
      },
    },

    // ---------------- Nhị Trương ----------------
    {
      id: 'zhijian', name: 'Trực Gián',
      desc: 'Giai đoạn ra bài, bạn có thể đặt 1 trang bị trên tay vào vùng trang bị trống tương ứng của người khác, sau đó bạn rút 1 lá.',
      bot: { use: 'never' },
      active: {
        cards: 'one', target: 'one',
        cardOk: (g, _s, id) => isEquip(g.card(id)),
        checkCards: (g, _s, ids) => (ids.every((id) => isEquip(g.card(id))) ? null : 'Cần chọn lá trang bị'),
        available: (g, s) => hand(g, s).some((id) => isEquip(g.card(id))),
        validTarget: (g, s, t) => t !== s && SLOTS.some((sl) => emptySlot(g, t, sl)),
        run: async (g, s, [id], [t]) => {
          const slot = g.cardInfo(g.card(id).name).slot;
          if (!emptySlot(g, t, slot)) { g.say(`${name(g, t)} đã có trang bị ở ô đó.`); return; }
          await putEquip(g, id, { kind: 'hand', seat: s }, t);
          await g.draw(s, 1);
        },
      },
    },
    {
      id: 'guzheng', name: 'Cố Chính',
      desc: 'Khi kết thúc giai đoạn bỏ bài của người khác, bạn có thể giao cho họ 1 lá trong những lá đã bỏ đi trong giai đoạn này; ▷ Bạn có thể thu lấy những lá còn lại.',
      triggers: [
        on('phaseEnd', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'discard' && g.player(ctx.seat).alive && guzhengCards(g, ctx.seat).length > 0,
          async (g, ctx, o) => {
            const ids = guzhengCards(g, ctx.seat);
            const [back] = await g.chooseCards(o, `Cố Chính: trả lại 1 lá cho ${name(g, ctx.seat)}`, ids, 1, 1, true);
            await g.moveCards([back], { kind: 'discard' }, { kind: 'hand', seat: ctx.seat }, 'guzheng');
            const rest = ids.filter((id) => id !== back);
            if (rest.length) {
              await g.moveCards(rest, { kind: 'discard' }, { kind: 'hand', seat: o }, 'guzheng');
              g.say(`${name(g, o)} nhận ${rest.length} lá.`);
            }
          }),
      ],
    },

    // ---------------- Trần Vũ & Đổng Tập ----------------
    {
      id: 'duanxie', name: 'Đoạn Tiết',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể lệnh X người không trong trạng thái xích nhận trạng thái xích (X là số máu đã mất của bạn, tối thiểu 1), '
        + 'sau đó bạn nhận trạng thái xích.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.duanxie,
        validTarget: (g, s, t) => t !== s && !g.player(t).chained,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.duanxie = 1;
          const x = Math.max(1, lostHp(g, s));
          const more = x > 1 ? await g.chooseTargets(s, `Đoạn Tiết: chọn thêm tối đa ${x - 1} người`, others(g, s, (q) => q !== t && !g.player(q).chained), 0, x - 1, 'enemy') : [];
          for (const q of [t, ...more]) { g.player(q).chained = true; g.say(`${name(g, q)} bị xích.`); }
          if (!g.player(s).chained) { g.player(s).chained = true; g.say(`${name(g, s)} bị xích.`); }
        },
      },
    },
    {
      id: 'fenming', name: 'Phấn Mệnh',
      desc: 'Khi bắt đầu giai đoạn kết thúc, nếu bạn trong trạng thái xích, bạn có thể bỏ đi 1 lá của những người trong trạng thái xích.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && g.player(o).chained, async (g, _ctx, o) => {
          for (const s of g.aliveSeatsFrom(o)) {
            if (g.player(s).chained && allCards(g, s).length) await discardFrom(g, o, s, `Phấn Mệnh: bỏ 1 lá của ${name(g, s)}`);
          }
        }),
      ],
    },

    // ---------------- Lăng Thống ----------------
    {
      id: 'xuanlve', name: 'Toàn Lược',
      desc: 'Sau khi bạn mất bài trong vùng trang bị, bạn có thể bỏ 1 lá của người khác.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => ctx.from.kind === 'equip' && ctx.from.seat === o && g.player(o).alive
          && !(ctx.to.kind === 'equip' && ctx.to.seat === o)
          && others(g, o, (s) => allCards(g, s).length > 0).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Toàn Lược: bỏ 1 lá của ai', others(g, o, (s) => allCards(g, s).length > 0), 0, 1, 'enemy');
            if (t !== undefined) await discardFrom(g, o, t, 'Toàn Lược: chọn lá để bỏ');
          }),
      ],
    },
    {
      id: 'yongjin', name: 'Dũng Tiến',
      desc: 'Hạn định kỹ: giai đoạn ra bài, bạn có thể phát động kỹ năng này: tối đa 3 lần, bạn có thể di chuyển 1 trang bị trên bàn chơi.',
      bot: { use: 'never' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !limitedUsed(g, s, 'yongjin'),
        run: async (g, s) => {
          markLimited(g, s, 'yongjin');
          for (let i = 0; i < 3; i++) {
            const srcs = g.alivePlayers().map((p) => p.seat).filter((x) => equipsOf(g, x).length);
            const [from] = await g.chooseTargets(s, `Dũng Tiến (${i + 1}/3): lấy trang bị của ai (bỏ trống = dừng)`, srcs, 0, 1);
            if (from === undefined) return;
            const [id] = await g.chooseCards(s, 'Dũng Tiến: chọn trang bị', equipsOf(g, from), 1, 1, true);
            const z = zoneOf(g, from, id);
            const dests = g.alivePlayers().map((p) => p.seat).filter((x) => x !== from && emptySlot(g, x, z.slot));
            const [to] = await g.chooseTargets(s, `Dũng Tiến: chuyển ${label(g, id)} cho ai`, dests, 1, 1);
            if (to === undefined) return;
            await g.moveCards([id], z, { kind: 'equip', seat: to, slot: z.slot }, 'yongjin');
            g.say(`${label(g, id)} chuyển từ ${name(g, from)} sang ${name(g, to)}.`);
          }
        },
      },
    },

    // ---------------- Lã Phạm ----------------
    {
      id: 'diaodu', name: 'Điều Độ',
      desc: 'Khi 1 người cùng thế lực với bạn sử dụng trang bị, họ có thể rút 1 lá. Đầu giai đoạn ra bài, bạn có thể thu lấy 1 lá trong vùng trang bị '
        + 'của 1 người cùng thế lực, sau đó, nếu người bị thu lấy là: bạn: bạn giao lá đó cho 1 người khác; không phải bạn: bạn có thể giao lá đó '
        + 'cho 1 người khác ngoại trừ họ.',
      bot: { confirm: (v) => !(v.currentSeat === v.me && v.phase === 'play') },
      triggers: [
        on('cardUsed', (g, ctx, o) => g.cardInfo(ctx.as)?.type === 'equip' && ctx.card.name === ctx.as
          && (ctx.seat === o || g.isSameFaction(ctx.seat, o)) && g.player(ctx.seat).alive,
          async (g, ctx) => { await g.draw(ctx.seat, 1); }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && sameFactionSeats(g, o).some((s) => equipsOf(g, s).length > 0),
          async (g, _ctx, o) => {
            const srcs = sameFactionSeats(g, o).filter((s) => equipsOf(g, s).length > 0);
            const [from] = await g.chooseTargets(o, 'Điều Độ: thu lấy 1 trang bị của ai', srcs, 1, 1, 'ally');
            if (from === undefined) return;
            const [id] = await g.chooseCards(o, 'Điều Độ: chọn trang bị', equipsOf(g, from), 1, 1, true);
            await g.moveCards([id], zoneOf(g, from, id), { kind: 'hand', seat: o }, 'diaodu');
            g.say(`${name(g, o)} thu lấy ${label(g, id)} của ${name(g, from)}.`);
            const cands = others(g, o, (s) => s !== from);
            const [t] = await g.chooseTargets(o, `Điều Độ: giao ${label(g, id)} cho 1 người khác${from === o ? '' : ' (có thể bỏ qua)'}`, cands, from === o ? 1 : 0, 1, 'ally');
            if (t !== undefined && hand(g, o).includes(id)) await give(g, o, t, [id]);
          }),
      ],
    },
    {
      id: 'diancai', name: 'Điển Tài',
      desc: 'Khi kết thúc giai đoạn ra bài của người khác, nếu bạn đã mất ít nhất X lá trong giai đoạn này (X là số máu của bạn, tối thiểu 1), '
        + 'bạn có thể bổ sung bài trên tay tới giới hạn máu; ▷ Bạn có thể đổi Phó tướng.',
      triggers: [
        observe('cardsMoved', (g, ctx, o) => {
          if (g.state.currentSeat === o || g.state.phase !== 'play') return;
          if ((ctx.from.kind === 'hand' || ctx.from.kind === 'equip') && ctx.from.seat === o && !(ctx.to.kind === 'hand' && ctx.to.seat === o)
            && !(ctx.to.kind === 'equip' && ctx.to.seat === o)) {
            const k = `diancai:${o}`;
            const cur = store(g)[k];
            store(g)[k] = { turn: g.state.turnCount, n: (cur?.turn === g.state.turnCount ? cur.n : 0) + ctx.cardIds.length };
          }
        }),
        on('phaseEnd', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'play' && store(g)[`diancai:${o}`]?.turn === g.state.turnCount
          && store(g)[`diancai:${o}`].n >= Math.max(1, g.player(o).hp) && hand(g, o).length < g.player(o).maxHp,
          async (g, _ctx, o) => {
            await g.draw(o, g.player(o).maxHp - hand(g, o).length);
            await g.askTransform(o, 'Điển Tài');
          }),
      ],
    },

    // ---------------- Từ Thịnh ----------------
    {
      id: 'yicheng', name: 'Nghi Thành',
      desc: 'Sau khi người cùng đội hình với bạn xác định mục tiêu của [Sát] hoặc trở thành mục tiêu của [Sát], họ có thể rút 1 lá, sau đó bỏ 1 lá.',
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.as === 'sha' && g.player(ctx.seat).alive && g.formation(o).includes(ctx.seat), async (g, ctx) => {
          await g.draw(ctx.seat, 1);
          await g.forceDiscard(ctx.seat, 1, 'yicheng');
        }),
        on('slashTargeted', (g, ctx, o) => !ctx.cancelled && g.player(ctx.target).alive && g.formation(o).includes(ctx.target), async (g, ctx) => {
          await g.draw(ctx.target, 1);
          await g.forceDiscard(ctx.target, 1, 'yicheng');
        }),
      ],
    },

    // ---------------- Tưởng Khâm ----------------
    {
      id: 'shangyi', name: 'Thượng Nghĩa',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể lệnh cho 1 người khác xem bài trên tay của bạn, sau đó bạn lựa chọn 1 mục: '
        + '1. Bạn xem bài trên tay họ và bỏ 1 lá màu Đen trong đó. 2. Bạn xem tất cả tướng ẩn của họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.shangyi,
        validTarget: (g, s, t) => t !== s,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.shangyi = 1;
          g.tell(t, `Bài trên tay ${name(g, s)}: ${hand(g, s).map((id) => label(g, id)).join(', ') || '(không có)'}`);
          const h = g.hero(t);
          const hidden = ['main', 'deputy'].filter((w) => !h[w].revealed && !h[w].removed);
          const opts = ['Xem bài trên tay và bỏ 1 lá đen', ...(hidden.length ? ['Xem các tướng đang úp'] : [])];
          const i = opts.length > 1 ? await g.choose(s, `Thượng Nghĩa với ${name(g, t)}`, opts) : 0;
          if (i === 0) {
            const blacks = hand(g, t).filter((id) => !isRed(g.card(id)));
            g.tell(s, `Bài trên tay ${name(g, t)}: ${hand(g, t).map((id) => label(g, id)).join(', ') || '(không có)'}`);
            if (blacks.length) {
              const [id] = await g.chooseCards(s, `Thượng Nghĩa: bỏ 1 lá đen của ${name(g, t)}`, blacks, 1, 1, true);
              if (id !== undefined) {
                await g.moveCards([id], { kind: 'hand', seat: t }, { kind: 'discard' }, 'shangyi');
                g.say(`${name(g, t)} mất ${label(g, id)}.`);
              }
            }
          } else {
            for (const w of hidden) {
              g.learnGeneral(s, h[w].generalId);
              g.tell(s, `Tướng úp của ${name(g, t)}: ${g.generalName(h[w].generalId)}`);
            }
          }
        },
      },
    },
    {
      id: 'niaoxiang', name: 'Điểu Tường',
      desc: 'Trận pháp kỹ: Quan hệ vây công: sau khi bạn xác định mục tiêu của [Sát], ứng với mỗi mục tiêu, nếu mục tiêu đó là người bên cạnh bạn '
        + 'và họ không nằm trong quan hệ đội hình, lệnh họ cần sử dụng 2 [Thiểm] để triệt tiêu [Sát] này. Nếu bạn là người vây công, sau khi người vây công '
        + 'xác định mục tiêu của lá [Sát], ứng với mỗi mục tiêu, nếu mục tiêu này là người bị vây công, lệnh họ cần sử dụng 2 [Thiểm] để triệt tiêu [Sát] này.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => {
          if (ctx.source === o && g.neighbors(o).includes(ctx.target) && g.formation(ctx.target).length <= 1) return true;
          const b = besiegers(g, ctx.target);
          return !!b && b.includes(o) && b.includes(ctx.source);
        }, (_g, ctx) => { ctx.shanNeeded = Math.max(ctx.shanNeeded, 2); }, { compulsory: true }),
      ],
    },

    // ---------------- Ngô Quốc Thái ----------------
    {
      id: 'ganlu', name: 'Cam Lộ',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể chọn 2 người có số bài trong vùng trang bị không cùng bằng 0 và số chênh lệch ≤ số máu bạn đã mất, '
        + 'hoán đổi bài trong vùng trang bị của 2 người này.',
      bot: { use: 'never' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.ganlu,
        validTarget: (g, _s, t) => g.isAliveSeat(t),
        run: async (g, s, _c, [a]) => {
          const cands = g.alivePlayers().map((p) => p.seat).filter((x) => x !== a
            && Math.abs(equipsOf(g, x).length - equipsOf(g, a).length) <= lostHp(g, s) && (equipsOf(g, x).length + equipsOf(g, a).length) > 0);
          const [b] = await g.chooseTargets(s, `Cam Lộ: đổi trang bị của ${name(g, a)} với ai`, cands, 1, 1);
          if (b === undefined) return;
          g.player(s).flags.ganlu = 1;
          const take = (x) => SLOTS.flatMap((sl) => g.player(x).equips[sl].map((id) => ({ id, sl })));
          const ea = take(a), eb = take(b);
          for (const e of ea) await g.moveCards([e.id], { kind: 'equip', seat: a, slot: e.sl }, { kind: 'processing' }, 'ganlu');
          for (const e of eb) await g.moveCards([e.id], { kind: 'equip', seat: b, slot: e.sl }, { kind: 'equip', seat: a, slot: e.sl }, 'ganlu');
          for (const e of ea) await g.moveCards([e.id], { kind: 'processing' }, { kind: 'equip', seat: b, slot: e.sl }, 'ganlu');
          g.say(`${name(g, a)} và ${name(g, b)} đổi trang bị cho nhau.`);
        },
      },
    },
    {
      id: 'buyi', name: 'Bổ Ích',
      desc: 'Một lần trong lượt của mỗi người, sau khi người cùng thế lực với bạn thoát khỏi trạng thái hấp hối, bạn có thể yêu cầu nguồn sát thương '
        + 'chấp hành 1 [Quân Lệnh], nếu họ không chấp hành, người vừa thoát khỏi trạng thái hấp hối hồi 1 máu.',
      triggers: [
        observe('damageDealt', (g, ctx) => { delete store(g)[`buyi:dying:${ctx.target}`]; }),
        observe('dying', (g, ctx) => { store(g)[`buyi:dying:${ctx.seat}`] = { turn: g.state.turnCount, source: ctx.source }; }),
        on('damaged', (g, ctx, o) => {
          const d = store(g)[`buyi:dying:${ctx.target}`];
          return !!d && d.turn === g.state.turnCount && (ctx.target === o || g.isSameFaction(ctx.target, o)) && d.source !== null
            && d.source !== ctx.target && g.player(d.source).alive && g.player(ctx.target).alive && store(g)[`buyi:${o}`] !== g.state.turnCount;
        }, async (g, ctx, o) => {
          const d = store(g)[`buyi:dying:${ctx.target}`];
          delete store(g)[`buyi:dying:${ctx.target}`];
          store(g)[`buyi:${o}`] = g.state.turnCount;
          const order = await drawOrder(g, o);
          if (!(await askOrder(g, o, d.source, order)) && g.player(ctx.target).alive) await g.recover(ctx.target, 1, o);
        }),
      ],
    },

    // ---------------- Lục Kháng ----------------
    {
      id: 'keshou', name: 'Khắc Thủ',
      desc: 'Khi bạn tính toán sát thương phải nhận, bạn có thể bỏ 2 lá có cùng màu, lệnh sát thương này -1; ▷ Nếu không có người khác có cùng thế lực với bạn, '
        + 'bạn tiến hành phán xét, nếu kết quả phán xét có màu Đỏ, bạn rút 1 lá.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.target === o && ctx.amount > 0 && ['red', 'black'].some((c) => allCards(g, o).filter((id) => isRed(g.card(id)) === (c === 'red')).length >= 2),
          async (g, ctx, o) => {
            const colors = ['red', 'black'].filter((c) => allCards(g, o).filter((id) => isRed(g.card(id)) === (c === 'red')).length >= 2);
            const ci = colors.length > 1 ? await g.choose(o, 'Khắc Thủ: bỏ 2 lá màu nào', ['Đỏ', 'Đen']) : 0;
            const red = colors[ci] === 'red';
            const ids = await chooseOwn(g, o, `Khắc Thủ: bỏ 2 lá ${red ? 'đỏ' : 'đen'}`, 2, 2, { filter: (c) => isRed(c) === red });
            if (!ids || ids.length < 2) return;
            await discardOwn(g, o, ids);
            ctx.amount -= 1;
            g.say(`Sát thương lên ${name(g, o)} giảm 1.`);
            if (others(g, o, (s) => g.isSameFaction(s, o)).length === 0) {
              const j = await g.judge(o, 'Khắc Thủ');
              const ok = isRed(j);
              await g.finishJudge(j);
              if (ok) await g.draw(o, 1);
            }
          }),
      ],
    },
    {
      id: 'zhuwei', name: 'Trúc Vi',
      desc: 'Sau khi phán xét của bạn có hiệu lực, nếu kết quả là 1 lá có khả năng gây sát thương cho mục tiêu, bạn có thể thu lấy lá đó; '
        + '▷ Bạn có thể lệnh cho người đang có lượt +1 giới hạn sử dụng [Sát] và +1 giới hạn trữ bài.',
      triggers: [
        on('judged', (g, ctx, o) => ctx.seat === o && g.state.processing.includes(ctx.card.id) && DAMAGE_CARDS.has(ctx.card.name), async (g, ctx, o) => {
          await g.moveCards([ctx.card.id], { kind: 'processing' }, { kind: 'hand', seat: o }, 'zhuwei');
          g.say(`${name(g, o)} nhận lá phán định.`);
          const cur = g.state.currentSeat;
          const ok = await g.choose(o, `Trúc Vi: cho ${name(g, cur)} +1 lần dùng Sát và +1 giới hạn trữ bài lượt này?`, ['Có', 'Không']);
          if (ok === 0) {
            const f = g.player(cur).flags;
            f.turn_extraSlash = (f.turn_extraSlash ?? 0) + 1;
            f.turn_handLimitDelta = (f.turn_handLimitDelta ?? 0) + 1;
          }
        }),
      ],
    },

    // ---------------- Gia Cát Khác ----------------
    {
      id: 'aocai', name: 'Ngạo Tài',
      desc: 'Ngoài lượt của bạn, khi bạn cần sử dụng/đánh ra bài cơ bản, bạn có thể xem hai lá trên đầu chồng bài, bạn có thể sử dụng/đánh ra lá cơ bản '
        + 'có tên tương ứng trong đó.',
      triggers: [
        on('beforeRespond', (g, ctx, o) => ctx.seat === o && g.state.currentSeat !== o && g.state.drawPile.length >= 2
          && ctx.accept.some((n) => ['sha', 'shan', 'tao', 'jiu'].includes(n)),
          async (g, ctx, o) => {
            const top = g.state.drawPile.slice(-2).reverse();
            const fit = top.filter((id) => ctx.accept.some((n) => g.cardCountsAs(o, g.card(id)).includes(n)));
            g.tell(o, `Ngạo Tài: 2 lá trên cùng là ${top.map((id) => label(g, id)).join(', ')}`);
            if (!fit.length) { g.say(`${name(g, o)} không tìm được lá phù hợp.`); return; }
            const [id] = await g.chooseCards(o, 'Ngạo Tài: lấy lá nào để dùng', fit, 0, 1, true);
            if (id !== undefined) await g.moveCards([id], { kind: 'draw' }, { kind: 'hand', seat: o }, 'aocai');
          }),
      ],
    },
    {
      id: 'duwu', name: 'Độc Vũ',
      desc: 'Hạn định kỹ: giai đoạn ra bài, bạn có thể phát động kỹ năng này, thực hiện lần lượt: bạn chọn 1 [Quân Lệnh], yêu cầu tất cả người thế lực khác bạn '
        + 'chấp hành [Quân Lệnh] này; nếu họ không chấp hành, bạn gây 1 sát thương cho họ và rút một lá; nếu trong những người còn sống có người đã '
        + 'tiến vào trạng thái hấp hối trong quá trình trên, bạn mất 1 máu.',
      bot: { use: 'always' },
      triggers: [observe('dying', (g, ctx, o) => { const a = store(g)[`duwu:${o}`]; if (a) a.push(ctx.seat); })],
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !limitedUsed(g, s, 'duwu') && others(g, s, (t) => !g.isSameFaction(t, s)).length > 0,
        run: async (g, s) => {
          markLimited(g, s, 'duwu');
          const order = await drawOrder(g, s);
          store(g)[`duwu:${s}`] = [];
          try {
            for (const t of others(g, s, (x) => !g.isSameFaction(x, s))) {
              if (!g.player(s).alive) return;
              if (!g.player(t).alive) continue;
              if (!(await askOrder(g, s, t, order))) {
                await g.damage({ source: s, target: t, amount: 1, card: null, cancelled: false });
                if (g.player(s).alive) await g.draw(s, 1);
              }
            }
          } finally {
            const dying = store(g)[`duwu:${s}`] ?? [];
            delete store(g)[`duwu:${s}`];
            if (!g.state.finished && g.player(s).alive && dying.some((x) => g.player(x).alive)) await g.loseHp(s, 1);
          }
        },
      },
    },

    // ---------------- Lục Úc Sinh ----------------
    {
      id: 'zhente', name: 'Trinh Đặc',
      desc: 'Một lần trong lượt của mỗi người, sau khi trở thành mục tiêu của lá cơ bản Đen hoặc công cụ phổ thông Đen do người khác sử dụng, '
        + 'có thể lệnh cho họ chọn 1 mục: 1. Lượt này họ không thể sử dụng bài Đen; 2. Lá này không có hiệu quả với bạn.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.target === o && ctx.source !== o && !isRed(ctx.card) && !ctx.cancelled
          && store(g)[`zhente:${o}`] !== g.state.turnCount, async (g, ctx, o) => {
          store(g)[`zhente:${o}`] = g.state.turnCount;
          if (await zhenteChoice(g, ctx.source, o) === 1) { ctx.cancelled = true; g.say(`Sát không có hiệu lực với ${name(g, o)}.`); }
        }),
        on('trickTargeted', (g, ctx, o) => ctx.target === o && ctx.user !== o && !isRed(ctx.card)
          && store(g)[`zhente:${o}`] !== g.state.turnCount, async (g, ctx, o) => {
          store(g)[`zhente:${o}`] = g.state.turnCount;
          if (await zhenteChoice(g, ctx.user, o) === 1) { ctx.cancelled = true; g.say(`${g.cardInfo(ctx.name).label} không có hiệu lực với ${name(g, o)}.`); }
        }),
      ],
    },
    {
      id: 'zhiwei', name: 'Chí Vi',
      desc: 'Sau khi bạn mở tướng này, bạn có thể chọn 1 người khác, đến khi tướng này bị úp hoặc loại bỏ: ▶ Sau khi họ gây sát thương, bạn rút 1 lá; '
        + '▶ Sau khi họ nhận sát thương, bạn bỏ 1 lá ngẫu nhiên trên tay; ▶ Khi kết thúc giai đoạn bỏ bài, bạn lệnh họ thu lấy tất cả bài bỏ trong giai đoạn này '
        + 'của bạn; ▶ Khi họ trận vong, nếu bạn đã mở tất cả tướng, bạn úp tướng này.',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'luyusheng' && others(g, o).length > 0, async (g, _ctx, o) => {
          const [t] = await g.chooseTargets(o, 'Chí Vi: chọn một người', others(g, o), 1, 1, 'ally');
          if (t === undefined) return;
          store(g)[`zhiwei:${o}`] = t;
          g.say(`${name(g, o)} chọn ${name(g, t)} (Chí Vi).`);
        }),
        on('damageDealt', (g, ctx, o) => zhiweiOn(g, o) && store(g)[`zhiwei:${o}`] === ctx.source && ctx.source !== null,
          async (g, _ctx, o) => { await g.draw(o, 1); }, { compulsory: true }),
        on('damaged', (g, ctx, o) => zhiweiOn(g, o) && store(g)[`zhiwei:${o}`] === ctx.target && hand(g, o).length > 0, async (g, _ctx, o) => {
          const h = hand(g, o);
          const id = h[g.randomInt(h.length)];
          await discardOwn(g, o, [id]);
        }, { compulsory: true }),
        on('phaseEnd', (g, ctx, o) => zhiweiOn(g, o) && ctx.seat === o && ctx.phase === 'discard' && g.player(store(g)[`zhiwei:${o}`]).alive
          && guzhengCards(g, o).length > 0, async (g, _ctx, o) => {
          const t = store(g)[`zhiwei:${o}`];
          const ids = guzhengCards(g, o);
          await g.moveCards(ids, { kind: 'discard' }, { kind: 'hand', seat: t }, 'zhiwei');
          g.say(`${name(g, t)} thu lấy ${ids.length} lá ${name(g, o)} vừa bỏ.`);
        }, { compulsory: true }),
        on('death', (g, ctx, o) => zhiweiOn(g, o) && store(g)[`zhiwei:${o}`] === ctx.seat && g.player(o).alive
          && ['main', 'deputy'].every((w) => g.hero(o)[w].revealed || g.hero(o)[w].removed), async (g, _ctx, o) => {
          delete store(g)[`zhiwei:${o}`];
          const w = slotOf(g, o, 'luyusheng');
          if (w) g.hideGeneral(o, w);
        }, { compulsory: true }),
      ],
    },

    // ---------------- Phan Tuấn ----------------
    {
      id: 'congcha', name: 'Thông Sát',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể chọn 1 người không có thế lực; ▶ cho đến khi bắt đầu lượt tiếp theo của bạn, khi họ mở tướng và trở thành '
        + 'có thế lực, nếu của họ và bạn: cùng thế lực: bạn và họ rút 2 lá; khác thế lực: họ mất 1 máu. Giai đoạn rút bài, nếu không có người không có thế lực, '
        + 'bạn có thể lệnh số lá rút +2.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && others(g, o, (s) => g.shownKingdom(s) === null).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Thông Sát: chọn người chưa lộ thế lực', others(g, o, (s) => g.shownKingdom(s) === null), 1, 1);
            if (t !== undefined) store(g)[`congcha:${o}`] = t;
          }),
        on('turnStart', (g, ctx, o) => ctx.seat === o && store(g)[`congcha:${o}`] !== undefined,
          (g, _ctx, o) => { delete store(g)[`congcha:${o}`]; }, { compulsory: true }),
        on('generalRevealed', (g, ctx, o) => ctx.first && store(g)[`congcha:${o}`] === ctx.seat, async (g, ctx, o) => {
          delete store(g)[`congcha:${o}`];
          if (g.isSameFaction(ctx.seat, o)) { await g.draw(o, 2); await g.draw(ctx.seat, 2); }
          else await g.loseHp(ctx.seat, 1);
        }, { compulsory: true }),
        on('drawPhase', (g, ctx, o) => ctx.seat === o && g.alivePlayers().every((p) => g.shownKingdom(p.seat) !== null),
          (_g, ctx) => { ctx.count += 2; }),
      ],
    },
    {
      id: 'gongqing', name: 'Công Thanh',
      desc: 'Tỏa định kỹ: khi bạn tính toán sát thương phải nhận, nếu tầm đánh của nguồn sát thương lớn hơn 3, sát thương này +1; '
        + 'khi bạn nhận sát thương, nếu tầm đánh của nguồn sát thương nhỏ hơn 3 và sát thương lớn hơn 1, sát thương này trở thành 1.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.target === o && ctx.source !== null && g.player(ctx.source).alive
          && ((g.attackRange(ctx.source) < 3 && ctx.amount > 1) || g.attackRange(ctx.source) > 3),
          (g, ctx) => { ctx.amount = g.attackRange(ctx.source) < 3 ? 1 : ctx.amount + 1; }, { compulsory: true }),
      ],
    },

    // ---------------- Tô Phi ----------------
    {
      id: 'lianpian', name: 'Liên Phiên',
      desc: 'Khi bắt đầu giai đoạn kết thúc của 1 người, nếu trong lượt này tổng số lá tiến vào chồng bài bỏ do bạn chỉ định bỏ đi > số máu của bạn, '
        + 'nếu lượt này là lượt của: bạn: bạn có thể lệnh 1 người cùng thế lực với bạn bổ sung bài trên tay đến giới hạn máu của họ; người khác: họ có thể '
        + 'chọn bỏ 1 lá của bạn hoặc lệnh bạn hồi 1 máu. (Đơn giản hóa: chỉ đếm các lá của chính bạn bị bỏ vào chồng bài bỏ.)',
      triggers: [
        observe('cardsMoved', (g, ctx, o) => {
          if (ctx.to.kind !== 'discard' || NOT_DISCARD.has(ctx.reason)) return;
          if (!((ctx.from.kind === 'hand' || ctx.from.kind === 'equip') && ctx.from.seat === o)) return;
          const k = `lianpian:${o}`;
          const prev = store(g)[k];
          store(g)[k] = { turn: g.state.turnCount, n: (prev?.turn === g.state.turnCount ? prev.n : 0) + ctx.cardIds.length };
        }),
        on('phaseStart', (g, ctx, o) => ctx.phase === 'end' && ctx.seat === o && lianpianReady(g, o)
          && sameFactionSeats(g, o).some((s) => hand(g, s).length < g.player(s).maxHp),
          async (g, _ctx, o) => {
            const cands = sameFactionSeats(g, o).filter((s) => hand(g, s).length < g.player(s).maxHp);
            const [t] = await g.chooseTargets(o, 'Liên Phiên: người bổ sung bài đến giới hạn máu', cands, 0, 1, 'ally');
            if (t !== undefined) await g.draw(t, g.player(t).maxHp - hand(g, t).length);
          }),
        on('phaseStart', (g, ctx, o) => ctx.phase === 'end' && ctx.seat !== o && g.player(ctx.seat).alive && lianpianReady(g, o),
          async (g, ctx, o) => {
            const cur = ctx.seat;
            const me = g.player(o);
            const dis = allCards(g, o).length ? [`Bỏ 1 lá của ${me.name}`] : [];
            const heal = me.hp < me.maxHp ? [`Để ${me.name} hồi 1 máu`] : [];
            const opts = g.isSameFaction(cur, o) ? [...heal, ...dis, 'Không làm gì'] : [...dis, ...heal, 'Không làm gì'];
            const i = await g.choose(cur, `Liên Phiên của ${me.name}: bạn chọn`, opts);
            if (opts[i].startsWith('Bỏ')) await discardFrom(g, cur, o, `Liên Phiên: chọn lá của ${me.name} để bỏ`);
            else if (opts[i].startsWith('Để')) await g.recover(o, 1, cur);
          }, { compulsory: true }),
      ],
    },

    // ---------------- Lăng Thao ----------------
    {
      id: 'dujin', name: 'Độc Tiến',
      desc: 'Sau khi bạn mở tướng này lần đầu, nếu không có người nào khác có cùng thế lực với bạn (bao gồm cả người đã trận vong), bạn nhận 1 tiêu ký [Tiên Khu]. '
        + 'Giai đoạn rút bài, bạn có thể rút thêm X lá (X là 1 nửa số lá trong vùng trang bị của bạn, làm tròn lên).',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'lingcao' && !store(g)[`dujin:${o}`]
          && !g.state.players.some((p) => p.seat !== o && g.isSameFaction(p.seat, o)),
          (g, _ctx, o) => {
            store(g)[`dujin:${o}`] = 1;
            g.hero(o).marks.pioneer++;
            g.say(`${name(g, o)} nhận 1 tiêu ký Tiên Khu.`);
          }, { compulsory: true }),
        observe('generalRevealed', (g, ctx, o) => { if (ctx.seat === o && ctx.generalId === 'lingcao') store(g)[`dujin:${o}`] = 1; }),
        on('drawPhase', (g, ctx, o) => ctx.seat === o && equipsOf(g, o).length > 0, (g, ctx, o) => { ctx.count += Math.ceil(equipsOf(g, o).length / 2); }),
      ],
    },

    // ---------------- Chu Di ----------------
    {
      id: 'zhukou', name: 'Trục Khấu',
      desc: '(Phỏng theo, cần đối chiếu.) Mỗi lượt một lần, sau khi bạn gây sát thương lần đầu trong giai đoạn ra bài, bạn có thể bốc X lá (X = số lá bạn đã dùng trong lượt).',
      triggers: [
        on('damageDealt', (g, ctx, o) => ctx.source === o && g.state.currentSeat === o && g.state.phase === 'play'
          && g.player(o).flags.stat_dmgPlay === ctx.amount && (g.player(o).flags.stat_used ?? 0) > 0,
          async (g, _ctx, o) => { await g.draw(o, Math.min(5, g.player(o).flags.stat_used)); }),
      ],
    },

    // ---------------- My Phương & Phó Sĩ Nhân ----------------
    {
      id: 'fengshix', name: 'Phong Thế',
      desc: 'Sau khi bài bạn sử dụng xác định 1 mục tiêu duy nhất, nếu số bài trên tay họ < bạn, bạn có thể bỏ 1 lá của bạn và họ, lệnh sát thương từ lá này +1. '
        + 'Sau khi bạn trở thành mục tiêu duy nhất của bài do người khác sử dụng, nếu số lá trên tay bạn < họ, họ có thể lệnh bạn bỏ 1 lá của bạn và họ, '
        + 'lệnh sát thương từ lá này +1.',
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat === o && ctx.targets.length === 1 && ctx.targets[0] !== o && DAMAGE_CARDS.has(ctx.as)
          && g.player(ctx.targets[0]).alive && hand(g, ctx.targets[0]).length < hand(g, o).length && allCards(g, o).length > 0,
          async (g, ctx, o) => {
            const t = ctx.targets[0];
            await fengshiDiscard(g, o, o, t, ctx);
          }),
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && ctx.targets.length === 1 && ctx.targets[0] === o && DAMAGE_CARDS.has(ctx.as)
          && g.player(ctx.seat).alive && hand(g, o).length < hand(g, ctx.seat).length && allCards(g, o).length > 0,
          async (g, ctx, o) => {
            const ok = await g.choose(ctx.seat, `Phong Thế của ${name(g, o)}: lệnh ${name(g, o)} bỏ 1 lá của họ và của bạn, sát thương từ lá này +1?`, ['Có', 'Không']);
            if (ok === 0) await fengshiDiscard(g, o, ctx.seat, o, ctx);
          }, { compulsory: true }),
        on('beforeDamage', (g, ctx, o) => {
          const f = store(g)[`fengshix:${o}`];
          return !!f && f.turn === g.state.turnCount && ctx.card && ctx.card.id === f.cardId && ctx.source === f.user && ctx.target === f.target;
        }, (g, ctx, o) => { delete store(g)[`fengshix:${o}`]; ctx.amount += 1; g.say('Phong Thế: sát thương +1.'); }, { compulsory: true }),
      ],
    },
  ],
};

function liuliTargets(g, ctx, o) {
  const used = store(g).liuliTargets ?? [];
  return g.alivePlayers().map((p) => p.seat).filter((x) => x !== o && x !== ctx.source && !used.includes(x)
    && g.distance(o, x) <= g.attackRange(o) && g.canTarget(ctx.source, x) && g.canBeSlashTarget(ctx.source, x));
}

function guzhengCards(g, seat) {
  const d = g.lastDiscardPhase;
  if (!d || d.seat !== seat || d.turn !== g.state.turnCount) return [];
  return d.ids.filter((id) => g.state.discardPile.includes(id));
}

async function zhenteChoice(g, user, o) {
  return g.choose(user, `Trinh Đặc của ${name(g, o)}: bạn chọn`, ['Lượt này không dùng lá đen nữa', `Lá này không có hiệu lực với ${name(g, o)}`])
    .then((i) => {
      if (i === 0) { g.player(user).flags.turn_banBlack = 1; g.say(`${name(g, user)} lượt này không thể dùng lá đen.`); }
      return i;
    });
}

void pickCard;

/** Lá Cơ (Hồng Nhan: lá Bích của chủ kỹ năng cũng được xem như Cơ). */
function heartFor(g, o, c) {
  return c.suit === 'heart' || (c.suit === 'spade' && g.hasSkill(o, 'hongyan', true));
}

/** Các mục Thiên Hương còn chọn được trong lượt này (mục 2 xếp trước). */
function tianxiangOpts(g, ctx, o) {
  const rec = store(g)[`tianxiang:${o}`];
  const used = rec?.turn === g.state.turnCount ? rec.used : [];
  if (used.length >= 2) return [];
  const out = [];
  if (!used.includes(2)) out.push(2);
  if (!used.includes(1) && ctx.source !== null && g.player(ctx.source).alive) out.push(1);
  return out;
}

const zhiweiOn = (g, o) => {
  const w = slotOf(g, o, 'luyusheng');
  return !!w && g.hero(o)[w].revealed && store(g)[`zhiwei:${o}`] !== undefined;
};

const lianpianReady = (g, o) => store(g)[`lianpian:${o}`]?.turn === g.state.turnCount && store(g)[`lianpian:${o}`].n > g.player(o).hp;

/** Phong Thế: chủ kỹ năng bỏ 1 lá của mình và 1 lá của người kia; lá này gây thêm 1 sát thương. */
async function fengshiDiscard(g, o, user, target, ctx) {
  const other = user === o ? target : user;
  const [mine] = await g.chooseCards(o, 'Phong Thế: bỏ 1 lá của bạn', allCards(g, o), 1, 1);
  if (mine === undefined) return;
  await discardOwn(g, o, [mine]);
  if (allCards(g, other).length) await discardFrom(g, o, other, `Phong Thế: bỏ 1 lá của ${name(g, other)}`);
  store(g)[`fengshix:${o}`] = { turn: g.state.turnCount, cardId: ctx.card.id, user, target };
}
