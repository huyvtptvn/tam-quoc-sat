// ============================================================
// Gói tướng mới — NGỤY. Kỹ năng dịch từ mô tả Quốc Chiến (QSanguosha Hegemony, tiếng Trung)
// hoặc theo trí nhớ khi không có nguồn (ghi rõ "phỏng theo" trong mô tả).
// id kỹ năng = tên pinyin trùng tên file âm thanh trong gói (để sau này gắn âm thanh).
// ============================================================
import {
  allCards, chooseOwn, discardFrom, discardOwn, drawOrder, askOrder, give, hand, isBasic, isEquip, isRed, label,
  limitedUsed, lostHp, markLimited, moveToBottom, name, observe, on, oncePerTurn, others, pindian, putEquip,
  sameFactionSeats, slotOf, store, takeFrom, zoneOf, SUIT_LABEL, SLOTS,
} from './lib/tro-giup.mjs';

const SUITS = ['spade', 'heart', 'club', 'diamond'];

export default {
  skills: [
    // ---------------- Hạ Hầu Uyên ----------------
    {
      id: 'shensu', name: 'Thần Tốc',
      desc: 'Nếu bạn thỏa mãn điều kiện sử dụng [Sát] (bỏ qua giới hạn khoảng cách), khi bạn tiến vào giai đoạn: '
        + 'Phán xét: bạn có thể bỏ qua giai đoạn này và giai đoạn rút bài; Ra bài: bạn có thể bỏ qua giai đoạn này và bỏ 1 lá trang bị; '
        + 'Bỏ bài: bạn có thể bỏ qua giai đoạn này và mất 1 máu. ▷ Bạn xem như sử dụng [Sát] không giới hạn khoảng cách.',
      bot: {
        confirm: (v) => {
          const me = v.players[v.me];
          if (v.phase === 'start') return v.myHand.length >= 4 && me.judgeArea.length === 0;
          if (v.phase === 'draw') return v.myHand.filter((c) => c.type === 'equip').length > 0;
          return me.hp >= 3 && v.myHand.length > me.hp;
        },
      },
      triggers: [
        on('phaseBefore', (g, ctx, o) => ctx.seat === o && ctx.phase === 'judge' && g.targetsAs(o, 'sha', true).length > 0,
          async (g, ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Thần Tốc: chọn mục tiêu của Sát', g.targetsAs(o, 'sha', true), 1, 1, 'enemy');
            ctx.skip = true;
            g.player(o).flags.skipDraw = 1;
            g.say(`${name(g, o)} bỏ qua giai đoạn phán định và bốc bài.`);
            if (t !== undefined) await g.useCardAs(o, 'sha', [t], [], { label: 'Thần Tốc' });
          }),
        on('phaseBefore', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && g.targetsAs(o, 'sha', true).length > 0
          && allCards(g, o).some((id) => isEquip(g.card(id))),
          async (g, ctx, o) => {
            const ids = await chooseOwn(g, o, 'Thần Tốc: bỏ 1 lá trang bị', 1, 1, { filter: isEquip });
            if (!ids?.length) return;
            await discardOwn(g, o, ids);
            ctx.skip = true;
            g.say(`${name(g, o)} bỏ qua giai đoạn ra bài.`);
            const [t] = await g.chooseTargets(o, 'Thần Tốc: chọn mục tiêu của Sát', g.targetsAs(o, 'sha', true), 1, 1, 'enemy');
            if (t !== undefined) await g.useCardAs(o, 'sha', [t], [], { label: 'Thần Tốc' });
          }),
        on('phaseBefore', (g, ctx, o) => ctx.seat === o && ctx.phase === 'discard' && g.targetsAs(o, 'sha', true).length > 0,
          async (g, ctx, o) => {
            ctx.skip = true;
            g.say(`${name(g, o)} bỏ qua giai đoạn bỏ bài.`);
            await g.loseHp(o, 1);
            if (!g.player(o).alive) return;
            const [t] = await g.chooseTargets(o, 'Thần Tốc: chọn mục tiêu của Sát', g.targetsAs(o, 'sha', true), 1, 1, 'enemy');
            if (t !== undefined) await g.useCardAs(o, 'sha', [t], [], { label: 'Thần Tốc' });
          }),
      ],
    },

    // ---------------- Trương Cáp ----------------
    {
      id: 'qiaobian', name: 'Xảo Biến',
      desc: 'Khi tiến vào 1 giai đoạn trong lượt của bạn (ngoại trừ giai đoạn chuẩn bị và kết thúc), bạn có thể bỏ 1 lá bài trên tay để bỏ qua giai đoạn này; '
        + 'sau đó nếu giai đoạn đã bỏ qua là: Rút bài: bạn có thể chọn tối đa 2 người có bài trên tay, bạn thu lấy 1 lá trên tay mỗi người; '
        + 'Ra bài: bạn có thể di chuyển 1 lá trên bàn chơi.',
      bot: { confirm: (v) => (v.phase === 'start' ? v.players[v.me].judgeArea.length > 0 : v.phase === 'play' ? v.myHand.length > v.players[v.me].hp + 1 : false) },
      triggers: [
        on('phaseBefore', (g, ctx, o) => ctx.seat === o && ['judge', 'draw', 'play', 'discard'].includes(ctx.phase) && hand(g, o).length > 0
          && (ctx.phase !== 'judge' || g.player(o).judgeArea.length > 0),
          async (g, ctx, o) => {
            const [id] = await g.chooseCards(o, 'Xảo Biến: bỏ 1 lá trên tay', [...hand(g, o)], 1, 1);
            await discardOwn(g, o, [id]);
            ctx.skip = true;
            g.say(`${name(g, o)} bỏ qua giai đoạn ${{ judge: 'phán định', draw: 'bốc bài', play: 'ra bài', discard: 'bỏ bài' }[ctx.phase]}.`);
            if (ctx.phase === 'draw') {
              const ts = await g.chooseTargets(o, 'Xảo Biến: lấy 1 lá trên tay của tối đa 2 người', others(g, o, (s) => hand(g, s).length > 0), 0, 2, 'enemy');
              for (const t of ts) await takeFrom(g, o, t, 'Xảo Biến', { equip: false });
            }
            if (ctx.phase === 'play') {
              const srcs = g.alivePlayers().map((p) => p.seat).filter((s) => SLOTS.some((sl) => g.player(s).equips[sl].length) || g.player(s).judgeArea.length);
              const [from] = await g.chooseTargets(o, 'Xảo Biến: chọn người có lá trang bị/phán định để chuyển đi', srcs, 0, 1);
              if (from === undefined) return;
              const ids = [...SLOTS.flatMap((sl) => g.player(from).equips[sl]), ...g.player(from).judgeArea];
              const [cid] = await g.chooseCards(o, 'Xảo Biến: chọn lá để chuyển', ids, 1, 1, true);
              const z = zoneOf(g, from, cid);
              const dests = g.alivePlayers().map((p) => p.seat).filter((s) => s !== from && (z.kind === 'equip'
                ? g.player(s).equips[z.slot].length === 0
                : !g.player(s).judgeArea.some((x) => g.delayedName(x) === g.delayedName(cid))));
              const [to] = await g.chooseTargets(o, `Xảo Biến: chuyển ${label(g, cid)} cho ai`, dests, 1, 1);
              if (to === undefined) return;
              await g.moveCards([cid], z, z.kind === 'equip' ? { kind: 'equip', seat: to, slot: z.slot } : { kind: 'judge', seat: to }, 'qiaobian');
              g.say(`${label(g, cid)} được chuyển từ ${name(g, from)} sang ${name(g, to)}.`);
            }
          }),
      ],
    },

    // ---------------- Tào Nhân ----------------
    {
      id: 'jushou', name: 'Chiếm Thủ',
      desc: 'Khi bắt đầu giai đoạn kết thúc, bạn có thể rút X lá (X là số thế lực còn sống), thực hiện lần lượt: '
        + 'bạn sử dụng 1 trang bị trên tay hoặc bỏ 1 lá phi trang bị; nếu bạn rút > 2 lá, bạn thay đổi trạng thái chồng tướng.',
      bot: { confirm: (v) => viewFactions(v) <= 2 || v.players[v.me].hp <= 2 },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end', async (g, _ctx, o) => {
          const x = Math.max(1, g.revealedFactionCount());
          await g.draw(o, x);
          const eqs = hand(g, o).filter((id) => isEquip(g.card(id)) && !g.cardBlocked(o, g.card(id)));
          const non = hand(g, o).filter((id) => !isEquip(g.card(id)));
          const opts = [...(eqs.length ? ['Sử dụng 1 trang bị trên tay'] : []), ...(non.length ? ['Bỏ 1 lá phi trang bị'] : [])];
          if (opts.length) {
            const i = opts.length > 1 ? await g.choose(o, 'Chiếm Thủ: bạn chọn', opts) : 0;
            if (opts[i] === 'Sử dụng 1 trang bị trên tay') {
              const [id] = await g.chooseCards(o, 'Chiếm Thủ: chọn trang bị để sử dụng', eqs, 1, 1);
              await g.equip(o, g.card(id));
            } else {
              const [id] = await g.chooseCards(o, 'Chiếm Thủ: bỏ 1 lá phi trang bị', non, 1, 1);
              await discardOwn(g, o, [id]);
            }
          }
          if (x > 2) g.turnOver(o);
        }),
      ],
    },

    // ---------------- Tuân Úc ----------------
    {
      id: 'quhu', name: 'Vờn Hổ',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể tiến hành đấu điểm với 1 người có số máu > bạn: nếu bạn thắng: họ gây 1 sát thương '
        + 'cho 1 người trong tầm đánh của họ do bạn chỉ định; nếu bạn không thắng: họ gây 1 sát thương cho bạn.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.quhu && hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && g.player(t).hp > g.player(s).hp && hand(g, t).length > 0,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.quhu = 1;
          const r = await pindian(g, s, t, 'Vờn Hổ');
          if (!r) return;
          if (r.win) {
            const vic = g.alivePlayers().map((p) => p.seat).filter((x) => x !== t && g.distance(t, x) <= g.attackRange(t));
            const [x] = await g.chooseTargets(s, `Vờn Hổ: chọn người để ${name(g, t)} gây 1 sát thương`, vic, 1, 1, 'enemy');
            if (x !== undefined) await g.damage({ source: t, target: x, amount: 1, card: null, cancelled: false });
          } else {
            await g.damage({ source: t, target: s, amount: 1, card: null, cancelled: false });
          }
        },
      },
    },
    {
      id: 'jieming', name: 'Tiết Mệnh',
      desc: 'Sau khi bạn nhận sát thương, bạn có thể chọn 1 người, lệnh họ bổ sung bài trên tay đến giới hạn máu (tối đa 5).',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o, async (g, _ctx, o) => {
          const need = (s) => Math.min(5, g.player(s).maxHp) - hand(g, s).length;
          const cands = g.alivePlayers().map((p) => p.seat).filter((s) => need(s) > 0);
          const [t] = await g.chooseTargets(o, 'Tiết Mệnh: chọn người được bổ sung bài', cands, 0, 1, 'ally');
          if (t === undefined) return;
          await g.draw(t, need(t));
        }),
      ],
    },

    // ---------------- Tào Phi ----------------
    {
      id: 'xingshang', name: 'Hành Thương',
      desc: 'Khi 1 người khác trận vong, bạn có thể thu lấy tất cả bài của họ.',
      triggers: [
        on('death', (g, ctx, o) => ctx.seat !== o && g.player(o).alive && ctx.cards.some((id) => g.state.discardPile.includes(id)),
          async (g, ctx, o) => {
            const ids = ctx.cards.filter((id) => g.state.discardPile.includes(id));
            await g.moveCards(ids, { kind: 'discard' }, { kind: 'hand', seat: o }, 'xingshang');
            g.say(`${name(g, o)} nhận ${ids.length} lá của ${name(g, ctx.seat)}.`);
          }),
      ],
    },
    {
      id: 'fangzhu', name: 'Lưu Đày',
      desc: 'Sau khi bạn nhận sát thương, bạn có thể lệnh 1 người khác lựa chọn 1 mục: 1. Họ rút X lá, sau đó thay đổi trạng thái chồng tướng; '
        + '2. Họ bỏ X lá, sau đó mất 1 máu (X là số máu đã mất của bạn).',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && others(g, o).length > 0, async (g, _ctx, o) => {
          const [t] = await g.chooseTargets(o, 'Lưu Đày: chọn 1 người khác', others(g, o), 1, 1, 'enemy');
          if (t === undefined) return;
          const x = lostHp(g, o);
          const opts = [`Rút ${x} lá rồi thay đổi trạng thái chồng tướng`, ...(x > 0 && allCards(g, t).length >= x ? [`Bỏ ${x} lá rồi mất 1 máu`] : [])];
          const i = opts.length > 1 ? await g.choose(t, `Lưu Đày của ${name(g, o)}: bạn chọn`, opts) : 0;
          if (i === 0) {
            await g.draw(t, x);
            g.turnOver(t);
          } else {
            const ids = await chooseOwn(g, t, `Lưu Đày: bỏ ${x} lá`, x, x);
            await discardOwn(g, t, ids ?? []);
            await g.loseHp(t, 1);
          }
        }),
      ],
    },

    // ---------------- Nhạc Tiến ----------------
    {
      id: 'xiaoguo', name: 'Dũng Mãnh',
      desc: 'Khi bắt đầu giai đoạn kết thúc của 1 người khác, bạn có thể bỏ 1 lá cơ bản, lệnh họ chọn 1 mục: '
        + '1. Họ bỏ 1 trang bị và lệnh bạn rút 1 lá; 2. Bạn gây 1 sát thương cho họ.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'end' && g.player(ctx.seat).alive
          && hand(g, o).some((id) => isBasic(g.card(id))),
          async (g, ctx, o) => {
            const basics = hand(g, o).filter((id) => isBasic(g.card(id)));
            const [id] = await g.chooseCards(o, 'Dũng Mãnh: bỏ 1 lá cơ bản', basics, 1, 1);
            await discardOwn(g, o, [id]);
            const t = ctx.seat;
            const eqs = SLOTS.flatMap((s) => g.player(t).equips[s]);
            const pick = eqs.length ? await g.choose(t, `Dũng Mãnh của ${name(g, o)}: bạn chọn`, [`Bỏ 1 trang bị (${name(g, o)} rút 1 lá)`, 'Chịu 1 sát thương']) : 1;
            if (pick === 0) {
              const [e] = await g.chooseCards(t, 'Bỏ 1 lá trang bị', eqs, 1, 1, true);
              await discardOwn(g, t, [e]);
              if (g.player(o).alive) await g.draw(o, 1);
            } else {
              await g.damage({ source: o, target: t, amount: 1, card: null, cancelled: false });
            }
          }),
      ],
    },

    // ---------------- Đặng Ngải ----------------
    {
      id: 'tuntian', name: 'Đồn Điền',
      desc: 'Sau khi bạn mất đi bài ngoài lượt, bạn có thể tiến hành phán xét, nếu kết quả phán xét không phải là chất CƠ, bạn có thể đặt kết quả '
        + 'phán xét này từ chồng bài bỏ lên tướng này, gọi là [Điền]. Khoảng cách từ bạn tới người khác -X (X là số [Điền] bạn có).',
      offenseBonus: (g, o) => g.player(o).special.length,
      triggers: [
        on('cardsMoved', (g, ctx, o) => g.state.currentSeat !== o && g.player(o).alive
          && (ctx.from.kind === 'hand' || ctx.from.kind === 'equip') && ctx.from.seat === o
          && !(ctx.to.kind === 'equip' && ctx.to.seat === o) && !(ctx.to.kind === 'hand' && ctx.to.seat === o),
          async (g, _ctx, o) => {
            const j = await g.judge(o, 'Đồn Điền');
            try {
              if (j.suit !== 'heart' && g.state.processing.includes(j.id)) {
                await g.moveCards([j.id], { kind: 'processing' }, { kind: 'special', seat: o }, 'tuntian');
                g.say(`${name(g, o)} đặt ${label(g, j.id)} làm Điền (${g.player(o).special.length} Điền).`);
              }
            } finally {
              await g.finishJudge(j);
            }
          }),
      ],
    },
    {
      id: 'jixi', name: 'Cấp Tập', position: 'main',
      desc: 'Chủ tướng kỹ, giảm 0.5 máu gốc: bạn có thể chuyển hóa sử dụng [Điền] thành [Thuận Thủ Khiên Dương].',
      bot: { use: 'always', target: 'enemy' },
      triggers: [observe('gameStart', (g, _ctx, o) => fishPenalty(g, o, 'main'))],
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => g.player(s).special.length > 0,
        validTarget: (g, s, t) => g.targetsAs(s, 'shunshou').includes(t),
        run: async (g, s, _c, [t]) => {
          const fields = [...g.player(s).special];
          const [id] = await g.chooseCards(s, 'Cấp Tập: chọn 1 Điền', fields, 1, 1, true);
          await g.useCardAs(s, 'shunshou', [t], [id], { from: { kind: 'special', seat: s }, label: 'Cấp Tập' });
        },
      },
    },
    {
      id: 'ziliang', name: 'Tư Lương', position: 'deputy',
      desc: 'Phó tướng kỹ: sau khi 1 người cùng thế lực với bạn nhận sát thương, bạn có thể giao cho họ 1 [Điền].',
      triggers: [
        on('damaged', (g, ctx, o) => g.player(o).special.length > 0 && (ctx.target === o || g.isSameFaction(ctx.target, o)),
          async (g, ctx, o) => {
            const [id] = await g.chooseCards(o, `Tư Lương: giao 1 Điền cho ${name(g, ctx.target)}`, [...g.player(o).special], 1, 1, true);
            await g.moveCards([id], { kind: 'special', seat: o }, { kind: 'hand', seat: ctx.target }, 'ziliang');
            g.say(`${name(g, ctx.target)} nhận 1 Điền.`);
          }),
      ],
    },

    // ---------------- Tào Hồng ----------------
    {
      id: 'huyuan', name: 'Hộ Viện',
      desc: 'Khi bắt đầu giai đoạn kết thúc, bạn có thể chọn 1 mục: 1. Giao 1 lá phi trang bị cho 1 người; '
        + '2. Đặt 1 lá trang bị vào vùng trang bị của 1 người, sau đó bạn có thể bỏ 1 lá trên bàn chơi.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && hand(g, o).length > 0,
          async (g, _ctx, o) => {
            const eqs = hand(g, o).filter((x) => isEquip(g.card(x)));
            const non = hand(g, o).filter((x) => !isEquip(g.card(x)));
            const opts = [...(eqs.length ? ['Đặt 1 trang bị vào vùng trang bị của 1 người'] : []), ...(non.length && others(g, o).length ? ['Giao 1 lá phi trang bị cho 1 người'] : [])];
            if (!opts.length) return;
            const i = opts.length > 1 ? await g.choose(o, 'Hộ Viện: bạn chọn', opts) : 0;
            if (opts[i].startsWith('Giao')) {
              const [id] = await g.chooseCards(o, 'Hộ Viện: chọn 1 lá phi trang bị', non, 1, 1);
              const [t] = await g.chooseTargets(o, 'Hộ Viện: giao cho ai', others(g, o), 1, 1, 'ally');
              if (t !== undefined) await give(g, o, t, [id]);
              return;
            }
            const [id] = await g.chooseCards(o, 'Hộ Viện: chọn 1 lá trang bị', eqs, 1, 1);
            const [t] = await g.chooseTargets(o, `Hộ Viện: đặt ${label(g, id)} cho ai`, g.alivePlayers().map((p) => p.seat), 1, 1, 'ally');
            if (t === undefined) return;
            await putEquip(g, id, { kind: 'hand', seat: o }, t);
            const field = g.alivePlayers().map((p) => p.seat).filter((x) => SLOTS.some((sl) => g.player(x).equips[sl].length) || g.player(x).judgeArea.length);
            const [v] = await g.chooseTargets(o, 'Hộ Viện: bỏ 1 lá trên bàn chơi của ai (có thể bỏ qua)', field, 0, 1, 'enemy');
            if (v !== undefined) await discardFrom(g, o, v, 'Hộ Viện: chọn lá để bỏ', { hand: false, judge: true });
          }),
      ],
    },
    {
      id: 'heyi', name: 'Hạc Dực',
      desc: 'Trận pháp kỹ: Quan hệ đội hình: nếu bạn có trong quan hệ đội hình, người cùng đội hình với bạn nhận kỹ năng »Phi Ảnh«.',
      triggers: ['turnStart', 'turnEnd', 'generalRevealed', 'generalRemoved', 'death', 'deputyTransformed'].map((ev) => observe(ev, (g, _ctx, o) => syncHeyi(g, o))),
    },
    {
      id: 'feiying', name: 'Phi Ảnh',
      desc: 'Tỏa định kỹ: khoảng cách từ người khác đến bạn +1.',
      defenseBonus: () => 1,
    },

    // ---------------- Lý Điển ----------------
    {
      id: 'xunxun', name: 'Tuân Tuân',
      desc: 'Khi bắt đầu giai đoạn rút bài, bạn có thể xem 4 lá trên đầu chồng bài rút, sau đó đặt 2 lá trong số đó lên đầu chồng bài rút, '
        + 'còn lại đặt xuống đáy chồng bài rút.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'draw' && g.state.drawPile.length >= 4, async (g, _ctx, o) => {
          const top = g.state.drawPile.slice(-4).reverse();
          const keep = await g.chooseCards(o, 'Tuân Tuân: chọn 2 lá đặt lên đầu chồng bài', top, 2, 2, true);
          moveToBottom(g, top.filter((id) => !keep.includes(id)));
          // đặt 2 lá đã chọn lên trên cùng (lá chọn trước nằm trên cùng)
          const pile = g.state.drawPile;
          for (const id of [...keep].reverse()) {
            const i = pile.indexOf(id);
            if (i >= 0) { pile.splice(i, 1); pile.push(id); }
          }
          g.say(`${name(g, o)} đặt 2 lá lên đầu, 2 lá xuống đáy chồng bài.`);
        }),
      ],
    },
    {
      id: 'wangxi', name: 'Vong Khích',
      desc: 'Sau khi bạn gây/nhận sát thương cho/từ người khác, ứng với mỗi sát thương, bạn có thể lệnh bạn và họ rút 1 lá.',
      triggers: [
        on('damaged', (g, ctx, o) => {
          const other = ctx.source === o ? ctx.target : ctx.target === o ? ctx.source : null;
          return other !== null && other !== o && g.player(other).alive;
        }, async (g, ctx, o) => {
          const other = ctx.source === o ? ctx.target : ctx.source;
          for (let i = 0; i < ctx.amount; i++) {
            if (!g.player(o).alive || !g.player(other).alive) return;
            if (i > 0 && (await g.choose(o, `Vong Khích: tiếp tục (${i + 1}/${ctx.amount})?`, ['Có', 'Không'])) !== 0) return;
            await g.draw(o, 1);
            await g.draw(other, 1);
          }
        }),
      ],
    },

    // ---------------- Tang Bá ----------------
    {
      id: 'hengjiang', name: 'Hoành Giang',
      desc: 'Sau khi bạn nhận sát thương, ứng với mỗi sát thương, nếu giới hạn trữ bài của người đang có lượt > 0, bạn có thể lệnh người đang có lượt '
        + 'giảm 1 giới hạn trữ bài. ▶ Khi kết thúc lượt này, nếu ở giai đoạn bỏ bài họ không bỏ lá nào, bạn rút X lá bài '
        + '(X là số lần bạn đã phát động kỹ năng này trong lượt này).',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && g.player(g.state.currentSeat).alive && g.handLimit(g.state.currentSeat) > 0,
          async (g, ctx, o) => {
            const cur = g.player(g.state.currentSeat);
            const n = Math.min(ctx.amount, g.handLimit(cur.seat));
            cur.flags.turn_handLimitDelta = (cur.flags.turn_handLimitDelta ?? 0) - n;
            const k = `hengjiang:${o}`;
            const prev = store(g)[k];
            store(g)[k] = { turn: g.state.turnCount, n: (prev?.turn === g.state.turnCount ? prev.n : 0) + n };
            g.say(`Giới hạn trữ bài của ${cur.name} giảm ${n} trong lượt này.`);
          }),
        on('turnEnd', (g, ctx, o) => store(g)[`hengjiang:${o}`]?.turn === g.state.turnCount && g.player(o).alive
          && !(g.lastDiscardPhase && g.lastDiscardPhase.turn === g.state.turnCount && g.lastDiscardPhase.seat === ctx.seat),
          async (g, _ctx, o) => {
            const n = store(g)[`hengjiang:${o}`].n;
            delete store(g)[`hengjiang:${o}`];
            await g.draw(o, n);
          }, { compulsory: true }),
      ],
    },

    // ---------------- Vu Cấm ----------------
    {
      id: 'jieyue', name: 'Tiết Viện',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể giao 1 lá trên tay cho 1 người không phải thế lực Ngụy, sau đó yêu cầu họ chấp hành 1 [Quân Lệnh]: '
        + 'nếu họ chấp hành, bạn rút 1 lá; nếu không, giai đoạn rút bài lượt này, bạn rút thêm 3 lá.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && hand(g, o).length > 0
          && others(g, o, (s) => g.shownKingdom(s) !== 'wei').length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Tiết Viện: chọn người nhận bài', others(g, o, (s) => g.shownKingdom(s) !== 'wei'), 1, 1, 'enemy');
            if (t === undefined) return;
            const [id] = await g.chooseCards(o, `Tiết Viện: giao 1 lá cho ${name(g, t)}`, [...hand(g, o)], 1, 1);
            await give(g, o, t, [id]);
            const order = await drawOrder(g, o);
            if (await askOrder(g, o, t, order)) await g.draw(o, 1);
            else g.player(o).flags.jieyueBonus = 3;
          }),
        on('drawPhase', (g, ctx, o) => ctx.seat === o && (g.player(o).flags.jieyueBonus ?? 0) > 0, (g, ctx, o) => {
          ctx.count += g.player(o).flags.jieyueBonus;
          g.player(o).flags.jieyueBonus = 0;
        }, { compulsory: true }),
      ],
    },

    // ---------------- Tuân Du ----------------
    {
      id: 'qice', name: 'Kỳ Sách',
      desc: 'Mỗi giai đoạn ra bài một lần, bạn có thể dùng toàn bộ bài trên tay như một lá cẩm nang (không trì hoãn) có số mục tiêu '
        + 'không quá số bài trên tay; sau khi lá đó xử lý xong, bạn có thể đổi phó tướng.',
      bot: { use: 'never' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !g.player(s).flags.qice && hand(g, s).length > 0,
        run: async (g, s) => {
          g.player(s).flags.qice = 1;
          const x = hand(g, s).length;
          const names = g.allCardNames().filter((n) => {
            const def = g.trickDef(n);
            if (!def || n === 'wuxie' || n === 'wuxie_guo' || def.canUse?.(g, s)) return false;
            if (def.targeting === 'one') return g.targetsAs(s, n).length > 0 && (def.min ?? 1) <= x;
            const auto = g.autoTargetsOf(s, n);
            return auto.length > 0 && auto.length <= x;
          });
          if (!names.length) { g.say('Không có cẩm nang nào dùng được.'); return; }
          const i = await g.choose(s, `Kỳ Sách: dùng ${x} lá trên tay như lá nào?`, names.map((n) => g.cardInfo(n).label));
          const n = names[i];
          const def = g.trickDef(n);
          let targets = [];
          if (def.targeting === 'one') {
            targets = await g.chooseTargets(s, `Kỳ Sách (${g.cardInfo(n).label}): chọn mục tiêu`, g.targetsAs(s, n),
              Math.max(1, def.min ?? 1), Math.min(x, def.max ?? 1));
            if (!targets.length) return;
          }
          await g.useCardAs(s, n, targets, [...hand(g, s)], { label: 'Kỳ Sách' });
          if (g.player(s).alive) await g.askTransform(s, 'Kỳ Sách');
        },
      },
    },
    {
      id: 'zhiyu', name: 'Trí Ngu',
      desc: 'Sau khi bạn nhận sát thương, bạn có thể rút 1 lá và mở tất cả bài trên tay, nếu tất cả đều cùng màu, nguồn sát thương bỏ 1 lá trên tay.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o, async (g, ctx, o) => {
          await g.draw(o, 1);
          const h = hand(g, o);
          g.say(`${name(g, o)} cho xem: ${h.map((id) => label(g, id)).join(', ') || '(không có)'}.`);
          const same = h.length > 0 && h.every((id) => isRed(g.card(id)) === isRed(g.card(h[0])));
          if (same && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive) await g.forceDiscard(ctx.source, 1, 'zhiyu');
        }),
      ],
    },

    // ---------------- Biện Phu Nhân ----------------
    {
      id: 'wanwei', name: 'Văn Ngụy',
      desc: 'Khi bài của bạn bị người khác chỉ định để thu lấy hoặc bỏ, bạn có thể đổi thành tự chọn lá của bạn. '
        + '(Đơn giản hóa: áp dụng khi người khác chọn 1 lá của bạn bằng Quá Hà Sách Kiều, Thuận Thủ Khiên Dương, Hàn Băng Kiếm và các kỹ năng dùng cách chọn bài chung của engine.)',
      redirectPick: async (g, o, chooser, includeJudge) => {
        const w = slotOf(g, o, 'bianhuanghou');
        if (!w || g.hero(o)[w].removed || g.hero(o)[w].noSkills) return null;
        const p = g.player(o);
        const ids = [...p.hand, ...SLOTS.flatMap((sl) => p.equips[sl]), ...(includeJudge ? p.judgeArea : [])];
        if (ids.length < 2) return null;
        const slot = g.hero(o)[w];
        const ok = await g.ask({ type: 'confirm', seat: o, skill: 'wanwei', reveal: !slot.revealed,
          prompt: `${slot.revealed ? '' : 'Lật Biện Phu Nhân để '}Văn Ngụy: tự chọn lá bị ${name(g, chooser)} lấy/bỏ?` });
        if (ok.kind !== 'yes' || !g.player(o).alive) return null;
        if (!slot.revealed) await g.reveal(o, w);
        g.say(`${name(g, o)} kích hoạt Văn Ngụy.`);
        const [id] = await g.chooseCards(o, 'Văn Ngụy: chọn lá của bạn', ids, 1, 1);
        return { id, from: zoneOf(g, o, id) };
      },
    },
    {
      id: 'yuejian', name: 'Ước Kiệm',
      desc: 'Tỏa định kỹ: khi bắt đầu giai đoạn bỏ bài của người cùng thế lực, nếu lượt này họ không sử dụng bài chọn người thế lực khác làm mục tiêu, '
        + 'bạn lệnh giới hạn trữ bài của họ bằng với giới hạn máu.',
      triggers: [
        observe('cardUsed', (g, ctx) => {
          if (ctx.seat !== g.state.currentSeat) return;
          const def = g.trickDef(ctx.as);
          const tg = def && ['allOthers', 'all'].includes(def.targeting) ? g.autoTargetsOf(ctx.seat, ctx.as) : ctx.targets;
          if (tg.some((t) => t !== ctx.seat && !g.isSameFaction(t, ctx.seat))) store(g)[`yuejian:${ctx.seat}`] = g.state.turnCount;
        }),
        on('phaseStart', (g, ctx, o) => ctx.phase === 'discard' && (ctx.seat === o || g.isSameFaction(ctx.seat, o))
          && store(g)[`yuejian:${ctx.seat}`] !== g.state.turnCount
          && hand(g, ctx.seat).length > g.handLimit(ctx.seat) && g.player(ctx.seat).maxHp > g.handLimit(ctx.seat),
          async (g, ctx) => {
            g.player(ctx.seat).flags.turn_handLimitFixed = g.player(ctx.seat).maxHp;
            g.say(`Giới hạn trữ bài của ${name(g, ctx.seat)} lượt này là ${g.player(ctx.seat).maxHp}.`);
          }, { compulsory: true }),
      ],
    },

    // ---------------- Tào Chân ----------------
    {
      id: 'sidi', name: 'Ty Địch',
      desc: 'Sau khi người cùng thế lực với bạn nhận sát thương, nếu họ có bài và số loại [Ngự] của bạn < 3, bạn có thể phát động kỹ năng, '
        + 'họ có thể đặt 1 lá của họ lên tướng của bạn, gọi là [Ngự] (không thể chọn lá cùng loại với những [Ngự] đã có). '
        + 'Sau khi bắt đầu lượt của người thế lực khác bạn, bạn có thể đưa tối đa 3 [Ngự] vào chồng bài bỏ, đưa ra số lựa chọn khác nhau tương ứng với mỗi [Ngự]: '
        + '1. Bạn chọn 1 loại bài có cùng loại với 1 trong số [Ngự] vừa bỏ, họ không thể sử dụng loại bài này trong lượt này; '
        + '2. Bạn chọn 1 kỹ năng của tướng đã mở của họ, vô hiệu kỹ năng đó trong lượt này; '
        + '3. Bạn lệnh họ chọn 1 người khác có cùng thế lực với bạn, người này hồi 1 máu.',
      bot: { confirm: (v, h) => v.currentSeat === v.me || !h.isAlly(v.currentSeat) },
      triggers: [
        on('damaged', (g, ctx, o) => g.player(ctx.target).alive && (ctx.target === o || g.isSameFaction(ctx.target, o))
          && yuTypes(g, o).size < 3 && allCards(g, ctx.target).some((id) => !yuTypes(g, o).has(typeOf(g.card(id)))),
          async (g, ctx, o) => {
            const t = ctx.target;
            const have = yuTypes(g, o);
            const ids = allCards(g, t).filter((id) => !have.has(typeOf(g.card(id))));
            const [id] = await g.chooseCards(t, `Ty Địch: đặt 1 lá lên tướng của ${name(g, o)} làm [Ngự]? (có thể bỏ qua)`, ids, t === o ? 1 : 0, 1);
            if (id === undefined) return;
            await g.moveCards([id], zoneOf(g, t, id), { kind: 'special', seat: o }, 'sidi');
            g.say(`${name(g, t)} đặt ${label(g, id)} lên tướng của ${name(g, o)} làm Ngự.`);
          }),
        on('turnStart', (g, ctx, o) => ctx.seat !== o && g.isDifferentFaction(ctx.seat, o) && g.player(o).special.length > 0,
          async (g, ctx, o) => {
            const t = ctx.seat;
            const ids = await g.chooseCards(o, `Ty Địch: đưa tối đa 3 Ngự vào chồng bài bỏ (kiềm chế ${name(g, t)})`, [...g.player(o).special], 1, Math.min(3, g.player(o).special.length), true);
            if (!ids.length) return;
            const types = [...new Set(ids.map((id) => typeOf(g.card(id))))];
            await g.moveCards(ids, { kind: 'special', seat: o }, { kind: 'discard' }, 'sidi');
            const left = ['ban', 'skill', 'heal'];
            for (let k = 0; k < ids.length && g.player(t).alive; k++) {
              const avail = left.filter((x) => x !== 'skill' || sidiSkills(g, t).length > 0)
                .filter((x) => x !== 'heal' || g.alivePlayers().some((p) => p.seat !== t && (p.seat === o || g.isSameFaction(p.seat, o)) && p.hp < p.maxHp));
              if (!avail.length) break;
              const LABEL = { ban: 'Cấm một loại bài trong lượt', skill: 'Vô hiệu 1 kỹ năng trong lượt', heal: 'Họ chọn 1 người cùng thế lực với bạn hồi 1 máu' };
              const i = avail.length > 1 ? await g.choose(o, `Ty Địch (${k + 1}/${ids.length}): chọn hiệu quả`, avail.map((x) => LABEL[x])) : 0;
              const pick = avail[i];
              left.splice(left.indexOf(pick), 1);
              if (pick === 'ban') {
                const TL = { basic: 'Cơ bản', trick: 'Công cụ', equip: 'Trang bị' };
                const ti = types.length > 1 ? await g.choose(o, 'Ty Địch: cấm loại bài nào', types.map((x) => TL[x])) : 0;
                const ty = types[ti];
                const f = g.player(t).flags;
                f[`turn_banType_${ty}`] = 1;
                if (ty === 'trick') f.turn_banType_delayed = 1;
                g.say(`${name(g, t)} lượt này không thể sử dụng bài loại ${TL[ty]}.`);
              } else if (pick === 'skill') {
                const sk = sidiSkills(g, t);
                const si = sk.length > 1 ? await g.choose(o, `Ty Địch: vô hiệu kỹ năng nào của ${name(g, t)}`, sk.map((x) => g.skillName(x))) : 0;
                g.player(t).flags[`turn_noSkill_${sk[si]}`] = 1;
                g.say(`Kỹ năng ${g.skillName(sk[si])} của ${name(g, t)} bị vô hiệu trong lượt này.`);
              } else {
                const cands = g.alivePlayers().map((p) => p.seat).filter((s) => s !== t && (s === o || g.isSameFaction(s, o)) && g.player(s).hp < g.player(s).maxHp);
                const [x] = await g.chooseTargets(t, `Ty Địch: chọn 1 người cùng thế lực với ${name(g, o)} để hồi 1 máu`, cands, 1, 1);
                if (x !== undefined) await g.recover(x, 1, o);
              }
            }
          }),
      ],
    },

    // ---------------- Trương Xuân Hoa ----------------
    {
      id: 'shangshi', name: 'Thương Thệ',
      desc: 'Sau khi bạn nhận sát thương, bạn có thể chọn bỏ 1 lá hoặc giao X lá trên tay bạn cho 1 người khác; nếu làm vậy, bạn rút X lá '
        + '(X là số máu bạn đã mất).',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && g.player(o).alive && allCards(g, o).length > 0, async (g, _ctx, o) => {
          const x = lostHp(g, o);
          const canGive = x > 0 && hand(g, o).length >= x && others(g, o).length > 0;
          const opts = ['Bỏ 1 lá', ...(canGive ? [`Giao ${x} lá trên tay cho 1 người khác`] : [])];
          const i = opts.length > 1 ? await g.choose(o, 'Thương Thệ: bạn chọn', opts) : 0;
          if (i === 0) {
            const ids = await chooseOwn(g, o, 'Thương Thệ: bỏ 1 lá', 1, 1);
            if (!ids?.length) return;
            await discardOwn(g, o, ids);
          } else {
            const [t] = await g.chooseTargets(o, `Thương Thệ: giao ${x} lá cho ai`, others(g, o), 1, 1, 'ally');
            if (t === undefined) return;
            const ids = await g.chooseCards(o, `Thương Thệ: chọn ${x} lá giao cho ${name(g, t)}`, [...hand(g, o)], x, x);
            await give(g, o, t, ids);
          }
          if (g.player(o).alive && x > 0) await g.draw(o, x);
        }),
      ],
    },
    {
      id: 'guojue', name: 'Quả Quyết',
      desc: 'Sau khi bạn mở tướng này lần đầu tiên, bạn gây 1 sát thương cho 1 người khác. '
        + 'Khi 1 người khác tiến vào trạng thái hấp hối do bạn gây sát thương, bạn có thể bỏ 1 lá của họ.',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'zhangchunhua' && !store(g)[`guojue:${o}`] && others(g, o).length > 0,
          async (g, _ctx, o) => {
            store(g)[`guojue:${o}`] = 1;
            const [t] = await g.chooseTargets(o, 'Quả Quyết: gây 1 sát thương cho 1 người khác', others(g, o), 1, 1, 'enemy');
            if (t !== undefined) await g.damage({ source: o, target: t, amount: 1, card: null, cancelled: false });
          }, { compulsory: true }),
        on('dying', (g, ctx, o) => ctx.seat !== o && ctx.source === o && g.player(o).alive && allCards(g, ctx.seat, true).length > 0,
          async (g, ctx, o) => { await discardFrom(g, o, ctx.seat, `Quả Quyết: bỏ 1 lá của ${name(g, ctx.seat)}`, { judge: true }); }),
      ],
    },

    // ---------------- Tưởng Cán ----------------
    {
      id: 'weicheng', name: 'Ngụy Thành',
      desc: 'Sau khi bạn giao bài cho người khác hoặc người khác lấy bài trên tay bạn, nếu số bài trên tay ít hơn máu, bạn có thể bốc 1 lá.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => ctx.from.kind === 'hand' && ctx.from.seat === o && ctx.to.kind === 'hand' && ctx.to.seat !== o
          && g.player(o).alive && hand(g, o).length < g.player(o).hp,
          async (g, _ctx, o) => { await g.draw(o, 1); }),
      ],
    },
    {
      id: 'daoshu', name: 'Đạo Thư',
      desc: 'Mỗi giai đoạn ra bài một lần, bạn có thể chọn một chất và lấy 1 lá trên tay của một người khác: nếu đúng chất, bạn gây 1 sát thương '
        + 'cho họ và kỹ năng coi như chưa dùng; nếu sai, bạn giao cho họ 1 lá khác chất trên tay (không có thì cho xem toàn bộ bài trên tay).',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.daoshu,
        validTarget: (g, s, t) => t !== s && hand(g, t).length > 0,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.daoshu = 1;
          const si = await g.choose(s, 'Đạo Thư: đoán chất', SUITS.map((x) => SUIT_LABEL[x]));
          const suit = SUITS[si];
          const h = hand(g, t);
          const id = h[g.randomInt(h.length)];
          await g.moveCards([id], { kind: 'hand', seat: t }, { kind: 'hand', seat: s }, 'daoshu');
          g.say(`${name(g, s)} đoán ${SUIT_LABEL[suit]}, lấy được ${label(g, id)}.`);
          if (g.card(id).suit === suit) {
            await g.damage({ source: s, target: t, amount: 1, card: null, cancelled: false });
            g.player(s).flags.daoshu = 0;
          } else {
            const diff = hand(g, s).filter((x) => g.card(x).suit !== suit);
            if (diff.length) {
              const [b] = await g.chooseCards(s, `Đạo Thư: giao cho ${name(g, t)} 1 lá khác chất ${SUIT_LABEL[suit]}`, diff, 1, 1);
              await give(g, s, t, [b]);
            } else {
              g.say(`${name(g, s)} cho xem bài trên tay: ${hand(g, s).map((x) => label(g, x)).join(', ')}.`);
            }
          }
        },
      },
    },

    // ---------------- Hoa Hâm ----------------
    {
      id: 'wanggui', name: 'Vong Quy',
      desc: 'Một lần trong lượt của mỗi người, sau khi bạn gây hoặc nhận sát thương và bạn đã mở tướng này, nếu tướng còn lại của bạn: '
        + 'chưa mở: bạn có thể gây 1 sát thương cho người thế lực xác định khác bạn; đã mở: bạn có thể lệnh những người cùng thế lực rút 1 lá.',
      triggers: [
        on('damaged', (g, ctx, o) => (ctx.source === o || ctx.target === o) && g.player(o).alive
          && !(store(g)[`wanggui:${o}`] === g.state.turnCount), async (g, _ctx, o) => {
          store(g)[`wanggui:${o}`] = g.state.turnCount;
          const h = g.hero(o);
          const which = slotOf(g, o, 'huaxin') ?? 'main';
          const other = which === 'main' ? h.deputy : h.main;
          if (other.revealed) {
            for (const s of sameFactionSeats(g, o)) await g.draw(s, 1);
          } else {
            const cands = others(g, o, (s) => g.isDifferentFaction(s, o));
            const [t] = await g.chooseTargets(o, 'Vong Quy: gây 1 sát thương cho người thế lực xác định khác bạn', cands, 0, 1, 'enemy');
            if (t !== undefined) await g.damage({ source: o, target: t, amount: 1, card: null, cancelled: false });
          }
        }),
      ],
    },
    {
      id: 'xibing', name: 'Tức Binh',
      desc: 'Sau khi 1 người khác lần đầu trong giai đoạn ra bài của họ xác định 1 mục tiêu duy nhất của lá [Sát] Đen hoặc công cụ phổ thông Đen, '
        + 'bạn có thể phát động kỹ năng này, thực hiện lần lượt: nếu số lá trên tay họ < số máu của họ, bạn lệnh họ bổ sung bài trên tay đến số máu của họ '
        + 'và không thể tiếp tục sử dụng bài trên tay trong lượt này; nếu bạn và họ đã mở tất cả tướng, bạn có thể úp 1 tướng của bạn và họ, '
        + 'trong lượt này không thể mở lại tướng đó. (Đơn giản hóa: người bị úp tướng không thể mở bất kỳ tướng nào trong lượt này.)',
      bot: { confirm: (v, h) => h.isAlly(v.currentSeat) },
      blockReveal: (g, _o, seat) => !!g.player(seat).flags.turn_xibingLock,
      triggers: [
        observe('cardUsed', (g, ctx) => {
          if (isXibingCard(g, ctx) && store(g)[`xibing:first:${ctx.seat}`] !== g.state.turnCount) {
            store(g)[`xibing:first:${ctx.seat}`] = g.state.turnCount;
            store(g)[`xibing:card:${ctx.seat}`] = { turn: g.state.turnCount, card: ctx.card };
          }
        }),
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && isXibingCard(g, ctx) && store(g)[`xibing:card:${ctx.seat}`]?.card === ctx.card
          && store(g)[`xibing:card:${ctx.seat}`]?.turn === g.state.turnCount
          && (hand(g, ctx.seat).length < g.player(ctx.seat).hp || (allRevealed(g, o) && allRevealed(g, ctx.seat))),
          async (g, ctx, o) => {
            const t = ctx.seat;
            delete store(g)[`xibing:card:${t}`];
            if (hand(g, t).length < g.player(t).hp) {
              await g.draw(t, g.player(t).hp - hand(g, t).length);
              g.player(t).flags.turn_banHand = 1;
              g.say(`${name(g, t)} không thể tiếp tục sử dụng bài trên tay trong lượt này.`);
            }
            if (allRevealed(g, o) && allRevealed(g, t) && g.player(o).alive && g.player(t).alive) {
              if ((await g.choose(o, `Tức Binh: úp 1 tướng của bạn và của ${name(g, t)}?`, ['Không', 'Có'])) !== 1) return;
              for (const s of [o, t]) {
                const h = g.hero(s);
                const ws = ['main', 'deputy'].filter((w) => !h[w].removed && h[w].revealed);
                if (!ws.length) continue;
                const i = ws.length > 1 ? await g.choose(o, `Tức Binh: úp tướng nào của ${name(g, s)}`, ws.map((w) => g.generalName(h[w].generalId))) : 0;
                g.hideGeneral(s, ws[i]);
                g.player(s).flags.turn_xibingLock = 1;
              }
            }
          }),
      ],
    },

    // ---------------- Đỗ Dự ----------------
    {
      id: 'wuku', name: 'Vũ Khố',
      desc: 'Tỏa định kỹ: khi 1 người thế lực xác định khác bạn sử dụng 1 trang bị, bạn tăng 1 [Võ Khố] (tối đa 2).',
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat !== o && g.cardInfo(ctx.as)?.type === 'equip' && g.isDifferentFaction(ctx.seat, o)
          && (store(g)[`wuku:${o}`] ?? 0) < 2, async (g, _ctx, o) => {
          store(g)[`wuku:${o}`] = (store(g)[`wuku:${o}`] ?? 0) + 1;
          g.say(`${name(g, o)} có ${store(g)[`wuku:${o}`]} dấu Võ Khố.`);
        }, { compulsory: true }),
      ],
    },
    {
      id: 'miewu', name: 'Diệt Ngô',
      desc: 'Một lần trong lượt của mỗi người, khi bạn cần sử dụng/đánh ra 1 lá cơ bản/công cụ, bạn có thể giảm 1 [Võ Khố] để chuyển hóa '
        + 'sử dụng/đánh ra 1 lá thành 1 lá cơ bản/công cụ đó, sau đó bạn rút 1 lá. (Đơn giản hóa: chỉ chuyển hóa lá trên tay.)',
      convert: (g, s, c) => ((store(g)[`wuku:${s}`] ?? 0) > 0 && store(g)[`miewu:${s}`] !== g.state.turnCount && g.player(s).hand.includes(c.id)
        ? miewuNames(g).filter((n) => n !== c.name) : []),
      triggers: ['cardUsed', 'cardResponded'].map((ev) => on(ev, (g, ctx, o) => ctx.seat === o && ctx.as !== ctx.card.name && ctx.card.id >= 0
        && (store(g)[`wuku:${o}`] ?? 0) > 0 && store(g)[`miewu:${o}`] !== g.state.turnCount && miewuNames(g).includes(ctx.as)
        && !otherConverts(g, o, ctx.card, ctx.as),
        async (g, _ctx, o) => {
          store(g)[`miewu:${o}`] = g.state.turnCount;
          store(g)[`wuku:${o}`]--;
          g.say(`${name(g, o)} dùng 1 Võ Khố (còn ${store(g)[`wuku:${o}`]}).`);
          await g.draw(o, 1);
        }, { compulsory: true })),
    },
  ],
};

// tránh cảnh báo biến không dùng
void limitedUsed; void markLimited;

// ---------------- Hàm riêng ----------------

/** Số thế lực đã lộ nhìn từ view của bot. */
function viewFactions(v) {
  return new Set(v.players.filter((p) => p.alive && p.kingdom).map((p) => (p.kingdom === 'careerist' ? `c${p.seat}` : p.kingdom))).size;
}

/** "Giảm 0.5 máu gốc": tướng ở vị trí `which` bớt 1 âm dương ngư khi tính máu đầu ván (chỉ áp dụng một lần). */
function fishPenalty(g, o, which) {
  const k = `fishPenalty:${o}:${which}`;
  if (store(g)[k]) return;
  store(g)[k] = 1;
  const h = g.hero(o);
  const p = g.player(o);
  const sum = g.generalHalfHp(h.main.generalId) + g.generalHalfHp(h.deputy.generalId);
  if (p.maxHp !== Math.floor(sum / 2)) return; // máu đã được tính theo cách khác (quân chủ, engine đã trừ...)
  const v = Math.max(1, Math.floor((sum - 1) / 2));
  if (v < p.maxHp) {
    p.maxHp = v;
    p.hp = Math.min(p.hp, v);
  }
}

/** Hạc Dực: trao/thu Phi Ảnh cho những người cùng đội hình. */
function syncHeyi(g, o) {
  const key = `heyi:${o}`;
  const prev = store(g)[key] ?? [];
  const active = g.player(o).alive && g.hasSkill(o, 'heyi', true);
  const team = active ? g.formation(o).filter((s) => s !== o && g.player(s).alive) : [];
  for (const s of prev) if (!team.includes(s)) g.revokeSkill(s, 'feiying');
  for (const s of team) if (!prev.includes(s)) g.grantSkill(s, 'feiying');
  store(g)[key] = team;
}

const typeOf = (c) => (c.type === 'delayed' ? 'trick' : c.type);
const yuTypes = (g, o) => new Set(g.player(o).special.map((id) => typeOf(g.card(id))));

/** Kỹ năng của các tướng đã mở của `t`. */
function sidiSkills(g, t) {
  const h = g.hero(t);
  return [...new Set(g.skillEntries(t, true).filter((e) => e.slot === h.main || e.slot === h.deputy).map((e) => e.skill.id))];
}

const allRevealed = (g, s) => ['main', 'deputy'].every((w) => g.hero(s)[w].revealed || g.hero(s)[w].removed);

function isXibingCard(g, ctx) {
  return ctx.seat === g.state.currentSeat && g.state.phase === 'play' && !isRed(ctx.card) && ctx.targets.length === 1
    && (ctx.as === 'sha' || g.cardInfo(ctx.as)?.type === 'trick');
}

/** Các lá cơ bản / công cụ thường mà Diệt Ngô có thể chuyển hóa thành. */
function miewuNames(g) {
  const s = store(g);
  if (!s.miewuNames) s.miewuNames = g.allCardNames().filter((n) => ['basic', 'trick'].includes(g.cardInfo(n)?.type));
  return s.miewuNames;
}

/** Lá này đã có thể được tính là `as` nhờ kỹ năng khác (để không tính nhầm là Diệt Ngô). */
function otherConverts(g, o, card, as) {
  if (card.name === 'wuxie_guo' && as === 'wuxie') return true;
  return g.skillEntries(o).some((e) => e.skill.id !== 'miewu' && (e.skill.convert?.(g, o, card) ?? []).includes(as));
}
