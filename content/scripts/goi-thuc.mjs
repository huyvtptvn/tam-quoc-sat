// ============================================================
// Gói tướng mới — THỤC.
// ============================================================
import {
  allCards, askOrder, chooseOwn, clearProcessing, discardFrom, discardOwn, drawOrder, give, hand, isBasic, isRed, label,
  limitedUsed, lostHp, markLimited, maxHp, name, observe, on, others, pindian, revealTop, sameFactionSeats, slotOf, store, takeFrom,
} from './lib/tro-giup.mjs';

const isHand = (g, s, c) => g.player(s).hand.includes(c.id);

/** Kỹ năng Huyễn Hoặc có thể trao. */
const XUANHUO_SKILLS = ['vothanh', 'baohao', 'longdam', 'thietky', 'lietcung', 'kuanggu'];

export default {
  skills: [
    // ---------------- Hoàng Nguyệt Anh ----------------
    {
      id: 'jizhi', name: 'Tập Trí',
      desc: 'Khi bạn sử dụng công cụ phổ thông không phải chuyển hóa, bạn có thể rút 1 lá.',
      triggers: [
        // Công cụ phi chuyển hóa: lá thật dùng đúng tên, hoặc lá ảo không dùng lá thật nào (Ngọc Tỷ coi như dùng Tri Kỷ Tri Bỉ)
        on('cardUsed', (g, ctx, o) => ctx.seat === o && !ctx.card.converted && ctx.as === ctx.card.name && g.cardInfo(ctx.as)?.type === 'trick',
          async (g, _ctx, o) => { await g.draw(o, 1); }),
      ],
    },
    {
      id: 'qicai', name: 'Kỳ Tài',
      desc: 'Tỏa định kỹ: công cụ bạn sử dụng không giới hạn khoảng cách.',
      trickNoDistance: () => true,
    },

    // ---------------- Khổng Minh (Ngọa Long) ----------------
    {
      id: 'bazhen', name: 'Bát Trận',
      desc: 'Tỏa định kỹ: nếu vùng trang bị của bạn không có phòng cụ, bạn xem như có [Bát Quái Trận].',
      virtualArmor: () => 'bagua',
    },
    {
      id: 'huoji', name: 'Hỏa Kế',
      desc: 'Bạn có thể chuyển hóa sử dụng lá Đỏ trên tay thành [Hỏa Công].',
      convert: (g, s, c) => (isHand(g, s, c) && isRed(c) ? ['huogong'] : []),
    },
    {
      id: 'kanpo', name: 'Khán Phá',
      desc: 'Bạn có thể chuyển hóa sử dụng lá Đen trên tay thành [Vô Giải Khả Kích].',
      convert: (g, s, c) => (isHand(g, s, c) && !isRed(c) ? ['wuxie'] : []),
    },

    // ---------------- Ngụy Diên ----------------
    {
      id: 'kuanggu', name: 'Cuồng Cốt',
      desc: 'Sau khi bạn gây sát thương cho 1 người, nếu khoảng cách từ bạn tới họ ≤1 trước khi máu giảm, ứng với mỗi sát thương, '
        + 'bạn có thể chọn 1 mục: 1. Hồi 1 máu; 2. Rút 1 lá.',
      triggers: [
        observe('beforeDamage', (g, ctx, o) => {
          if (ctx.source === o && ctx.target !== o) store(g)[`kuanggu:${o}`] = { target: ctx.target, near: g.distance(o, ctx.target) <= 1 };
        }),
        on('damageDealt', (g, ctx, o) => ctx.source === o && ctx.target !== o && g.player(o).alive
          && store(g)[`kuanggu:${o}`]?.target === ctx.target && store(g)[`kuanggu:${o}`].near,
          async (g, ctx, o) => {
            delete store(g)[`kuanggu:${o}`];
            for (let i = 0; i < ctx.amount && g.player(o).alive; i++) {
              const opts = [...(g.player(o).hp < g.player(o).maxHp ? ['Hồi 1 máu'] : []), 'Rút 1 lá'];
              const k = opts.length > 1 ? await g.choose(o, `Cuồng Cốt (${i + 1}/${ctx.amount}): bạn chọn`, opts) : 0;
              if (opts[k] === 'Hồi 1 máu') await g.recover(o, 1, o);
              else await g.draw(o, 1);
            }
          }),
      ],
    },

    // ---------------- Lưu Thiện ----------------
    {
      id: 'xiangle', name: 'Hưởng Lạc',
      desc: 'Tỏa định kỹ: sau khi bạn trở thành mục tiêu của [Sát], người sử dụng [Sát] chọn 1 mục: 1. Họ bỏ 1 lá cơ bản; 2. Lệnh [Sát] đó không có hiệu quả với bạn.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.target === o && ctx.source !== o, async (g, ctx, o) => {
          const src = ctx.source;
          const basics = g.player(src).alive ? hand(g, src).filter((id) => isBasic(g.card(id))) : [];
          const pick = basics.length ? await g.choose(src, `Hưởng Lạc của ${name(g, o)}: bỏ 1 lá cơ bản để Sát có hiệu lực?`, ['Bỏ 1 lá cơ bản', 'Không bỏ']) : 1;
          if (pick === 0) {
            const [id] = await g.chooseCards(src, 'Hưởng Lạc: chọn lá cơ bản để bỏ', basics, 1, 1);
            await discardOwn(g, src, [id]);
          } else {
            ctx.cancelled = true;
            g.say(`Sát không có hiệu lực với ${name(g, o)}.`);
          }
        }, { compulsory: true }),
      ],
    },
    {
      id: 'fangquan', name: 'Ủy Quyền',
      desc: 'Khi tiến vào giai đoạn ra bài, bạn có thể bỏ qua giai đoạn này; ▶ Khi kết thúc lượt này, bạn có thể bỏ 1 lá bài trên tay, lệnh 1 người có 1 lượt sau lượt này.',
      bot: { confirm: false },
      triggers: [
        on('phaseBefore', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play', async (g, ctx, o) => {
          ctx.skip = true;
          g.player(o).flags.fangquan = 1;
          g.say(`${name(g, o)} bỏ qua giai đoạn ra bài.`);
        }),
        on('turnEnd', (g, ctx, o) => ctx.seat === o && g.player(o).flags.fangquan === 1 && hand(g, o).length > 0 && others(g, o).length > 0,
          async (g, _ctx, o) => {
            g.player(o).flags.fangquan = 0;
            const [t] = await g.chooseTargets(o, 'Ủy Quyền: chọn người được thêm một lượt', others(g, o), 1, 1, 'ally');
            if (t === undefined) return;
            const [id] = await g.chooseCards(o, 'Ủy Quyền: bỏ 1 lá trên tay', [...hand(g, o)], 1, 1);
            await discardOwn(g, o, [id]);
            g.grantExtraTurn(t);
          }),
      ],
    },

    // ---------------- Mạnh Hoạch ----------------
    {
      id: 'huoshou', name: 'Họa Thủ',
      desc: 'Tỏa định kỹ: [Nam Man Nhập Xâm] không có hiệu quả với bạn. Sau khi 1 người khác xác định mục tiêu của [Nam Man Nhập Xâm], '
        + 'bạn trở thành nguồn sát thương của [Nam Man Nhập Xâm] này.',
      triggers: [
        on('trickTargeted', (g, ctx, o) => ctx.target === o && ctx.name === 'nanman', (g, ctx, o) => {
          ctx.cancelled = true;
          g.say(`Nam Man không có hiệu lực với ${name(g, o)}.`);
        }, { compulsory: true }),
        on('beforeDamage', (g, ctx, o) => ctx.cardAs === 'nanman' && ctx.source !== o && ctx.source !== null && g.player(o).alive,
          (g, ctx, o) => { ctx.source = o; }, { compulsory: true }),
      ],
    },
    {
      id: 'zaiqi', name: 'Tái Khởi',
      desc: 'Khi kết thúc giai đoạn bỏ bài, bạn có thể chọn tối đa X người cùng thế lực (X là số lá Đỏ đã đi vào chồng bài bỏ trong lượt này), '
        + 'họ lựa chọn 1 mục: 1. Họ rút 1 lá; 2. Lệnh bạn hồi 1 máu.',
      triggers: [
        observe('cardsMoved', (g, ctx, o) => {
          if (ctx.to.kind !== 'discard') return;
          const n = ctx.cardIds.filter((id) => isRed(g.card(id))).length;
          if (!n) return;
          const k = `zaiqi:${o}`;
          const prev = store(g)[k];
          store(g)[k] = { turn: g.state.turnCount, n: (prev?.turn === g.state.turnCount ? prev.n : 0) + n };
        }),
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'discard' && store(g)[`zaiqi:${o}`]?.turn === g.state.turnCount
          && store(g)[`zaiqi:${o}`].n > 0,
          async (g, _ctx, o) => {
            const x = store(g)[`zaiqi:${o}`].n;
            const team = sameFactionSeats(g, o);
            const ts = await g.chooseTargets(o, `Tái Khởi: chọn tối đa ${x} người cùng thế lực`, team, 1, Math.min(x, team.length), 'ally');
            for (const t of ts) {
              if (!g.player(t).alive || !g.player(o).alive) continue;
              const me = g.player(o);
              const heal = me.hp < me.maxHp ? [`Để ${me.name} hồi 1 máu`] : [];
              const opts = me.hp * 2 <= me.maxHp ? [...heal, 'Rút 1 lá'] : ['Rút 1 lá', ...heal];
              const i = opts.length > 1 ? await g.choose(t, `Tái Khởi của ${me.name}: bạn chọn`, opts) : 0;
              if (opts[i] === 'Rút 1 lá') await g.draw(t, 1);
              else await g.recover(o, 1, t);
            }
          }),
      ],
    },

    // ---------------- Chúc Dung ----------------
    {
      id: 'juxiang', name: 'Cự Tượng',
      desc: 'Tỏa định kỹ: [Nam Man Nhập Xâm] không có hiệu quả với bạn. Sau khi [Nam Man Nhập Xâm] do người khác sử dụng kết toán xong, bạn thu lấy lá này.',
      triggers: [
        on('trickTargeted', (g, ctx, o) => ctx.target === o && ctx.name === 'nanman', (g, ctx, o) => {
          ctx.cancelled = true;
          g.say(`Nam Man không có hiệu lực với ${name(g, o)}.`);
        }, { compulsory: true }),
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.as === 'nanman' && ctx.seat !== o && !ctx.card.virtual) store(g)[`juxiang:${o}`] = ctx.card.id;
        }),
        on('cardsMoved', (g, ctx, o) => ctx.to.kind === 'discard' && ctx.reason === 'settle' && ctx.cardIds.includes(store(g)[`juxiang:${o}`])
          && g.state.discardPile.includes(store(g)[`juxiang:${o}`]),
          async (g, _ctx, o) => {
            const id = store(g)[`juxiang:${o}`];
            delete store(g)[`juxiang:${o}`];
            await g.moveCards([id], { kind: 'discard' }, { kind: 'hand', seat: o }, 'juxiang');
            g.say(`${name(g, o)} nhận ${label(g, id)}.`);
          }, { compulsory: true }),
      ],
    },
    {
      id: 'lieren', name: 'Liệt Nhận',
      desc: 'Sau khi bạn gây sát thương cho mục tiêu của [Sát], bạn có thể tiến hành đấu điểm với họ, nếu bạn thắng, bạn thu lấy 1 lá của mục tiêu.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.source === o && ctx.target !== o && ctx.cardAs === 'sha' && hand(g, o).length > 0 && hand(g, ctx.target).length > 0,
          async (g, ctx, o) => {
            const r = await pindian(g, o, ctx.target, 'Liệt Nhận');
            if (r?.win && g.player(ctx.target).alive) await takeFrom(g, o, ctx.target, 'Liệt Nhận: chọn lá để lấy');
          }),
      ],
    },

    // ---------------- Cam phu nhân ----------------
    {
      id: 'shushen', name: 'Thục Thận',
      desc: 'Sau khi bạn hồi máu, ứng với mỗi máu bạn đã hồi, bạn có thể lệnh 1 người khác rút 1 lá.',
      triggers: [
        on('recovered', (g, ctx, o) => ctx.seat === o && others(g, o).length > 0, async (g, ctx, o) => {
          for (let i = 0; i < ctx.amount; i++) {
            const [t] = await g.chooseTargets(o, `Thục Thận (${i + 1}/${ctx.amount}): chọn người rút 1 lá`, others(g, o), 0, 1, 'ally');
            if (t === undefined) return;
            await g.draw(t, 1);
          }
        }),
      ],
    },
    {
      id: 'shenzhi', name: 'Thần Trí',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể bỏ tất cả bài trên tay, nếu số lá đã bỏ ≥ số máu hiện tại của bạn, bạn hồi 1 máu.',
      bot: { confirm: (v) => { const me = v.players[v.me]; return me.hp < me.maxHp && v.myHand.length >= me.hp && v.myHand.length <= 2; } },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && hand(g, o).length > 0, async (g, _ctx, o) => {
          const ids = [...hand(g, o)];
          await discardOwn(g, o, ids);
          if (ids.length >= g.player(o).hp) await g.recover(o, 1, o);
        }),
      ],
    },

    // ---------------- Tưởng Uyển & Phí Y ----------------
    {
      id: 'shengxi', name: 'Sinh Tức',
      desc: 'Khi bắt đầu giai đoạn kết thúc, nếu trong lượt này bạn không gây sát thương, bạn có thể rút 2 lá.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && !(g.player(o).flags.stat_dmg > 0),
          async (g, _ctx, o) => { await g.draw(o, 2); }),
      ],
    },
    {
      id: 'shoucheng', name: 'Thủ Thành',
      desc: 'Sau khi người cùng thế lực với bạn mất đi lá cuối cùng trên tay họ nếu ở ngoài lượt của họ, bạn có thể lệnh họ rút 1 lá.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => {
          if (ctx.from.kind !== 'hand') return false;
          const s = ctx.from.seat;
          return (s === o || g.isSameFaction(s, o)) && s !== g.state.currentSeat && g.player(s).alive && hand(g, s).length === 0;
        }, async (g, ctx) => { await g.draw(ctx.from.seat, 1); }),
      ],
    },

    // ---------------- My phu nhân ----------------
    {
      id: 'guixiu', name: 'Khuê Tú',
      desc: 'Sau khi mở tướng này, bạn có thể rút 2 lá. Sau khi tướng này bị loại bỏ, bạn có thể hồi 1 máu. '
        + '(Đơn giản hóa: phần hồi máu chỉ áp dụng khi loại bỏ tướng này bằng Tồn Tự.)',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'mifuren', async (g, _ctx, o) => { await g.draw(o, 2); }),
      ],
    },
    {
      id: 'cunsi', name: 'Tồn Tự',
      desc: 'Giai đoạn ra bài, nếu bạn đã mở tướng này, bạn có thể chọn 1 người, thực hiện lần lượt: bạn loại bỏ tướng này; '
        + 'họ nhận kỹ năng »Dũng Quyết«; nếu họ không phải bạn, họ rút 2 lá bài.',
      bot: { use: 'wounded', target: 'ally' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => { const w = slotOf(g, s, 'mifuren'); return w !== null && !g.hero(s)[w].removed && g.hero(s)[w].revealed; },
        validTarget: (g, _s, t) => g.isAliveSeat(t),
        run: async (g, s, _c, [t]) => {
          await g.removeGeneral(s, slotOf(g, s, 'mifuren'));
          if (g.player(s).hp < g.player(s).maxHp) { g.say('Khuê Tú: hồi 1 máu.'); await g.recover(s, 1, s); }
          g.grantSkill(t, 'yongjue');
          if (t !== s) await g.draw(t, 2);
        },
      },
    },
    {
      id: 'yongjue', name: 'Dũng Quyết',
      desc: 'Sau khi kết toán xong [Sát] do người cùng thế lực với bạn sử dụng trong giai đoạn ra bài của họ, nếu lá này là lá đầu tiên họ sử dụng '
        + 'trong giai đoạn này, bạn có thể lệnh họ thu lấy lá [Sát] này.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => {
          const cur = g.state.currentSeat;
          if (ctx.to.kind !== 'discard' || ctx.reason !== 'settle' || g.state.phase !== 'play') return false;
          if (!(cur === o || g.isSameFaction(cur, o)) || g.player(cur).flags.stat_usedPlay !== 1) return false;
          return ctx.cardIds.some((id) => g.usedAsOf(id) === 'sha' && g.state.discardPile.includes(id));
        }, async (g, ctx) => {
          const cur = g.state.currentSeat;
          const ids = ctx.cardIds.filter((id) => g.usedAsOf(id) === 'sha' && g.state.discardPile.includes(id));
          const ok = await g.choose(cur, 'Dũng Quyết: nhận lại lá Sát vừa dùng?', ['Nhận lại', 'Không']);
          if (ok === 0) {
            await g.moveCards(ids, { kind: 'discard' }, { kind: 'hand', seat: cur }, 'yongjue');
            g.say(`${name(g, cur)} nhận lại ${ids.map((id) => label(g, id)).join(', ')}.`);
          }
        }, { compulsory: true }),
      ],
    },

    // ---------------- Mã Đại ----------------
    {
      id: 'qianxi', name: 'Tiềm Tập',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị, bạn có thể rút 1 lá, sau đó bỏ 1 lá và chọn 1 người khác ở khoảng cách 1; '
        + '▶ Trong lượt này, họ không thể sử dụng/đánh ra lá trên tay cùng màu với lá bạn đã bỏ.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start', async (g, _ctx, o) => {
          await g.draw(o, 1);
          const pool = allCards(g, o);
          if (!pool.length) return;
          const [id] = await g.chooseCards(o, 'Tiềm Tập: bỏ 1 lá', pool, 1, 1);
          const red = isRed(g.card(id));
          await discardOwn(g, o, [id]);
          const near = others(g, o, (s) => g.distance(o, s) <= 1);
          const [t] = await g.chooseTargets(o, `Tiềm Tập: người không thể dùng bài màu ${red ? 'đỏ' : 'đen'} lượt này`, near, 1, 1, 'enemy');
          if (t === undefined) return;
          g.player(t).flags[red ? 'turn_banRed' : 'turn_banBlack'] = 1;
          g.say(`${name(g, t)} lượt này không thể dùng hoặc đánh bài màu ${red ? 'đỏ' : 'đen'}.`);
        }),
      ],
    },

    // ---------------- Pháp Chính ----------------
    {
      id: 'enyuan', name: 'Ân Oán',
      desc: 'Tỏa định kỹ: sau khi bạn trở thành mục tiêu của [Đào] do người chơi khác sử dụng, họ rút 1 lá. '
        + 'Sau khi bạn nhận sát thương, nguồn gây sát thương chọn giao 1 lá trên tay cho bạn hoặc mất 1 máu.',
      triggers: [
        observe('cardsMoved', (g, ctx) => {
          if (ctx.reason === 'save' && ctx.from.kind === 'hand' && ctx.to.kind === 'processing') store(g)['enyuan:save'] = ctx.from.seat;
        }),
        on('recovered', (g, ctx, o) => {
          if (ctx.seat !== o) return false;
          const saver = store(g)['enyuan:save'];
          delete store(g)['enyuan:save'];
          return saver === ctx.source && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive;
        }, async (g, ctx) => { await g.draw(ctx.source, 1); }, { compulsory: true }),
        on('damaged', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive,
          async (g, ctx, o) => {
            const src = ctx.source;
            const pick = hand(g, src).length ? await g.choose(src, `Ân Oán của ${name(g, o)}: bạn chọn`, ['Giao 1 lá trên tay', 'Mất 1 máu']) : 1;
            if (pick === 0) {
              const [id] = await g.chooseCards(src, `Giao 1 lá cho ${name(g, o)}`, [...hand(g, src)], 1, 1);
              await give(g, src, o, [id]);
            } else {
              await g.loseHp(src, 1);
            }
          }, { compulsory: true }),
      ],
    },
    {
      id: 'xuanhuo', name: 'Huyễn Hoặc',
      desc: 'Một lần trong giai đoạn ra bài của người khác có cùng thế lực với bạn, họ có thể giao cho bạn 1 lá trên tay, sau đó họ có thể bỏ 1 lá '
        + 'và lựa chọn nhận 1 trong các kỹ năng sau mà chưa có trên bàn cho đến hết lượt: »Võ Thánh«, »Bào Hao«, »Long Đảm«, »Thiết Kỵ«, '
        + '»Liệt Cung«, »Cuồng Cốt«.',
      triggers: [
        on('turnStart', (g, ctx, o) => ctx.seat !== o && g.isSameFaction(ctx.seat, o)
          && slotOf(g, o, 'fazheng') !== null && g.hero(o)[slotOf(g, o, 'fazheng')].revealed, (g, ctx, o) => {
          store(g)[`xuanhuo:${ctx.seat}`] = o;
          g.grantSkill(ctx.seat, 'xuanhuo_su', true);
        }, { compulsory: true }),
      ],
    },
    {
      id: 'xuanhuo_su', name: 'Huyễn Hoặc (nhận)',
      desc: 'Một lần trong lượt: giao 1 lá trên tay cho Pháp Chính, bỏ 1 lá, rồi chọn một kỹ năng để có trong lượt này.',
      bot: { use: 'always' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !g.player(s).flags.xuanhuo && hand(g, s).length >= 2 && g.player(store(g)[`xuanhuo:${s}`] ?? s)?.alive,
        run: async (g, s) => {
          g.player(s).flags.xuanhuo = 1;
          const fz = store(g)[`xuanhuo:${s}`];
          const [id] = await g.chooseCards(s, `Huyễn Hoặc: giao 1 lá cho ${name(g, fz)}`, [...hand(g, s)], 1, 1);
          await give(g, s, fz, [id]);
          const d = await chooseOwn(g, s, 'Huyễn Hoặc: bỏ 1 lá', 1, 1);
          if (d?.length) await discardOwn(g, s, d);
          const onField = new Set(g.alivePlayers().flatMap((p) => g.skillEntries(p.seat, true).map((e) => e.skill.id)));
          const pool = XUANHUO_SKILLS.filter((k) => !onField.has(k));
          if (!pool.length) return;
          const i = await g.choose(s, 'Huyễn Hoặc: chọn kỹ năng cho lượt này', pool.map((k) => g.skillName(k)));
          g.grantSkill(s, pool[i], true);
        },
      },
    },

    // ---------------- Vương Bình ----------------
    {
      id: 'jianglve', name: 'Tướng Lược',
      desc: 'Hạn định kỹ: giai đoạn ra bài, bạn có thể phát động kỹ năng này, thực hiện lần lượt: bạn chọn 1 [Quân Lệnh], yêu cầu tất cả người khác '
        + 'có cùng thế lực với bạn chấp hành [Quân Lệnh] này; bạn và những người đã chọn chấp hành [Quân Lệnh] tăng 1 giới hạn máu, hồi 1 máu; '
        + 'bạn rút X lá (X là số người đã hồi máu từ kỹ năng này).',
      bot: { use: 'always' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !limitedUsed(g, s, 'jianglve') && g.shownKingdom(s) !== null,
        run: async (g, s) => {
          markLimited(g, s, 'jianglve');
          const order = await drawOrder(g, s);
          const done = [s];
          for (const t of sameFactionSeats(g, s)) if (t !== s && await askOrder(g, s, t, order)) done.push(t);
          let healed = 0;
          for (const t of done) {
            if (!g.player(t).alive) continue;
            g.player(t).maxHp += 1;
            g.say(`${name(g, t)} +1 giới hạn máu.`);
            if (await g.recover(t, 1, s) > 0) healed++;
          }
          if (healed) await g.draw(s, healed);
        },
      },
    },

    // ---------------- Từ Thứ ----------------
    {
      id: 'zhuhai', name: 'Tru Hại',
      desc: 'Giai đoạn kết thúc của người khác, nếu lượt này họ đã gây sát thương, bạn có thể dùng một lá Sát vào họ (không giới hạn khoảng cách).',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'end' && g.player(ctx.seat).alive
          && (g.player(ctx.seat).flags.stat_dmg ?? 0) > 0 && g.canTarget(o, ctx.seat) && g.canBeSlashTarget(o, ctx.seat)
          && hand(g, o).some((id) => g.cardCountsAs(o, g.card(id)).includes('sha')),
          async (g, ctx, o) => {
            const picked = await g.pickResponse(o, ['sha'], `Tru Hại: dùng Sát vào ${name(g, ctx.seat)}`, ctx.seat);
            if (picked) await g.slashOutOfTurn(o, ctx.seat, picked.card, picked.as);
          }),
      ],
    },
    {
      id: 'pozhen', name: 'Phá Trận',
      desc: '(Phỏng theo bản Quốc Chiến.) Hạn định. Đầu lượt của người khác, bạn có thể khiến lượt này họ không thể dùng hoặc đánh bài trên tay.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) && v.players[v.currentSeat].handCount >= 4 },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'start' && !limitedUsed(g, o, 'pozhen'), (g, ctx, o) => {
          markLimited(g, o, 'pozhen');
          g.player(ctx.seat).flags.turn_banHand = 1;
          g.say(`${name(g, ctx.seat)} lượt này không thể dùng hoặc đánh bài trên tay.`);
        }),
      ],
    },
    {
      id: 'jiancai', name: 'Tiến Tài',
      desc: '(Phỏng theo bản Quốc Chiến.) Khi một người cùng thế lực với bạn sắp chịu sát thương khiến họ hấp hối, bạn có thể ngăn sát thương đó và loại bỏ tướng này.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => (ctx.target === o || g.isSameFaction(ctx.target, o)) && ctx.amount >= g.player(ctx.target).hp
          && slotOf(g, o, 'xushu') !== null, async (g, ctx, o) => {
          ctx.cancelled = true;
          g.say(`Sát thương lên ${name(g, ctx.target)} bị ngăn lại.`);
          await g.removeGeneral(o, slotOf(g, o, 'xushu'));
        }),
      ],
    },
    {
      id: 'qiance', name: 'Khiêm Sách',
      desc: 'Sau khi người cùng thế lực với bạn xác định mục tiêu của lá công cụ, họ có thể lệnh những mục tiêu thuộc Đại thế lực không thể hướng ứng với lá này.',
      blockResponse: (g, o, seat, _accept, _src, ctx) => {
        const a = store(g)[`qiance:${o}`];
        if (!a || a.turn !== g.state.turnCount || !a.seats.includes(seat) || !ctx) return false;
        if (ctx.kind === 'nullify') return ctx.user === a.user && ctx.trick === a.as;
        if (ctx.kind === 'aoe') return ctx.user === a.user && ctx.trick === a.as;
        if (ctx.kind === 'duel') return a.as === 'juedou' && ctx.opponent === a.user;
        return false;
      },
      triggers: [
        observe('cardUsed', (g, _ctx, o) => { delete store(g)[`qiance:${o}`]; }),
        on('cardUsed', (g, ctx, o) => (ctx.seat === o || g.isSameFaction(ctx.seat, o)) && g.cardInfo(ctx.as)?.type === 'trick'
          && qianceTargets(g, ctx).length > 0,
          async (g, ctx, o) => {
            const seats = qianceTargets(g, ctx);
            if (ctx.seat !== o) {
              const ok = await g.choose(ctx.seat, `Khiêm Sách của ${name(g, o)}: lệnh ${seats.map((s) => name(g, s)).join(', ')} không thể hưởng ứng lá này?`, ['Có', 'Không']);
              if (ok !== 0) return;
            }
            store(g)[`qiance:${o}`] = { turn: g.state.turnCount, user: ctx.seat, as: ctx.as, seats };
            g.say(`${seats.map((s) => name(g, s)).join(', ')} không thể hưởng ứng ${g.cardInfo(ctx.as).label} này.`);
          }),
      ],
    },
    {
      id: 'jujian', name: 'Cử Tiến', position: 'deputy',
      desc: 'Phó tướng kỹ, giảm 0.5 máu gốc: khi 1 người cùng thế lực với bạn tiến vào trạng thái hấp hối, bạn có thể lệnh họ hồi đến 1 máu, sau đó bạn đổi Phó tướng.',
      triggers: [
        observe('gameStart', (g, _ctx, o) => fishPenalty(g, o, 'deputy')),
        on('dying', (g, ctx, o) => (ctx.seat === o || g.isSameFaction(ctx.seat, o)) && g.player(ctx.seat).alive && g.player(ctx.seat).hp < 1
          && g.player(o).alive, async (g, ctx, o) => {
          const p = g.player(ctx.seat);
          if (p.hp < 1) await g.recover(ctx.seat, 1 - p.hp, o);
          if (g.player(o).alive) await g.transformDeputy(o);
        }),
      ],
    },

    // ---------------- Mã Tắc ----------------
    {
      id: 'sanyao', name: 'Tán Dao',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể bỏ 1 lá và chọn 1 người nhiều máu nhất, bạn gây 1 sát thương cho họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'one', target: 'one',
        available: (g, s) => !g.player(s).flags.sanyao,
        validTarget: (g, s, t) => t !== s && g.player(t).hp === maxHp(g),
        run: async (g, s, [id], [t]) => {
          g.player(s).flags.sanyao = 1;
          await discardOwn(g, s, [id]);
          await g.damage({ source: s, target: t, amount: 1, card: null, cancelled: false });
        },
      },
    },
    {
      id: 'zhiman', name: 'Chế Man',
      desc: 'Khi bạn gây sát thương cho người khác, bạn có thể chặn sát thương này lại, thực hiện lần lượt: bạn thu lấy 1 lá trong vùng trang bị '
        + 'hoặc phán xét của họ; nếu họ cùng thế lực với bạn, bạn có thể lệnh họ đổi Phó tướng.',
      bot: { confirm: false },
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.source === o && ctx.target !== o && g.player(ctx.target).alive, async (g, ctx, o) => {
          ctx.cancelled = true;
          g.say(`${name(g, o)} ngăn sát thương lên ${name(g, ctx.target)}.`);
          await takeFrom(g, o, ctx.target, 'Chế Man: chọn lá để lấy', { hand: false, equip: true, judge: true });
          const t = ctx.target;
          if (g.player(t).alive && g.isSameFaction(t, o) && g.transformCandidates(t).length && !g.hero(t).deputy.removed) {
            const ok = await g.choose(o, `Chế Man: lệnh ${name(g, t)} đổi phó tướng?`, ['Không', 'Có']);
            if (ok === 1) await g.transformDeputy(t);
          }
        }),
      ],
    },

    // ---------------- Sa Ma Kha ----------------
    {
      id: 'jili', name: 'Tật Lê',
      desc: 'Khi bạn sử dụng/đánh ra bài, nếu lá này là lá thứ X mà bạn sử dụng/đánh ra trong lượt này, bạn có thể rút X lá (X là tầm đánh của bạn).',
      triggers: [
        ...['cardUsed', 'cardResponded'].map((ev) => observe(ev, (g, ctx, o) => {
          if (ctx.seat !== o) return;
          const k = `jili:${o}`;
          const prev = store(g)[k];
          store(g)[k] = { turn: g.state.turnCount, n: (prev?.turn === g.state.turnCount ? prev.n : 0) + 1 };
        })),
        ...['cardUsed', 'cardResponded'].map((ev) => on(ev, (g, ctx, o) => ctx.seat === o && g.player(o).alive
          && store(g)[`jili:${o}`]?.turn === g.state.turnCount && store(g)[`jili:${o}`].n === g.attackRange(o),
          async (g, _ctx, o) => { await g.draw(o, g.attackRange(o)); })),
      ],
    },

    // ---------------- Hạ Hầu Bá ----------------
    {
      id: 'baolie', name: 'Báo Liệt',
      desc: 'Tỏa định kỹ: khi bắt đầu giai đoạn ra bài, lệnh những người thế lực xác định khác bạn có tầm đánh đến bạn sử dụng [Sát] với bạn, '
        + 'nếu không, bạn bỏ 1 lá của họ. Bạn sử dụng [Sát] với người có máu ≥ bạn không giới hạn khoảng cách và số lần. '
        + '(Đơn giản hóa: phần sau là kỹ năng chủ động "Báo Liệt" — chọn 1 lá dùng được như Sát và 1 người có máu ≥ bạn.)',
      bot: { use: 'always', target: 'enemy' },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play'
          && others(g, o, (s) => g.isDifferentFaction(s, o) && g.distance(s, o) <= g.attackRange(s)).length > 0,
          async (g, _ctx, o) => {
            for (const s of others(g, o, (x) => g.isDifferentFaction(x, o) && g.distance(x, o) <= g.attackRange(x))) {
              if (!g.player(o).alive) return;
              const picked = await g.pickResponse(s, ['sha'], `Báo Liệt của ${name(g, o)}: dùng Sát vào ${name(g, o)}? (không thì bị bỏ 1 lá)`, o);
              if (picked && g.canTarget(s, o)) await g.slashOutOfTurn(s, o, picked.card, picked.as);
              else if (allCards(g, s).length) await discardFrom(g, o, s, 'Báo Liệt: chọn lá để bỏ');
            }
          }, { compulsory: true }),
      ],
      active: {
        cards: 'one', target: 'one', minCards: 1, maxCards: 1,
        cardOk: (g, s, id) => baolieCard(g, s, id),
        checkCards: (g, s, ids) => (ids.length === 1 && baolieCard(g, s, ids[0]) ? null : 'Cần chọn 1 lá dùng được như Sát'),
        available: (g, s) => g.state.currentSeat === s && g.state.phase === 'play' && hand(g, s).some((id) => baolieCard(g, s, id)),
        validTarget: (g, s, t) => t !== s && g.player(t).hp >= g.player(s).hp && g.canBeSlashTarget(s, t),
        run: async (g, s, [id], [t]) => { await g.useCardAs(s, 'sha', [t], [id], { label: 'Báo Liệt' }); },
      },
    },
  ],
};

// ---------------- Hàm riêng ----------------

/** "Giảm 0.5 máu gốc": tướng ở vị trí `which` bớt 1 âm dương ngư khi tính máu đầu ván (chỉ áp dụng một lần). */
function fishPenalty(g, o, which) {
  const k = `fishPenalty:${o}:${which}`;
  if (store(g)[k]) return;
  store(g)[k] = 1;
  const h = g.hero(o);
  const p = g.player(o);
  const sum = g.generalHalfHp(h.main.generalId) + g.generalHalfHp(h.deputy.generalId);
  if (p.maxHp !== Math.floor(sum / 2)) return;
  const v = Math.max(1, Math.floor((sum - 1) / 2));
  if (v < p.maxHp) {
    p.maxHp = v;
    p.hp = Math.min(p.hp, v);
  }
}

/** Khiêm Sách: các mục tiêu thuộc Đại thế lực của lá công cụ vừa dùng. */
function qianceTargets(g, ctx) {
  const def = g.trickDef(ctx.as);
  const tg = def && def.targeting !== 'one' ? g.autoTargetsOf(ctx.seat, ctx.as) : ctx.targets;
  return tg.filter((t) => t !== ctx.seat && g.player(t).alive && g.isBig(t));
}

/** Lá trên tay dùng được như Sát (cho phần chủ động của Báo Liệt). */
function baolieCard(g, s, id) {
  const c = g.card(id);
  return g.player(s).hand.includes(id) && !g.cardBlocked(s, c) && g.cardCountsAs(s, c).includes('sha');
}
