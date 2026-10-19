// ============================================================
// Gói tướng mới — QUẦN.
// ============================================================
import {
  allCards, besiegers, chooseOwn, discardFrom, discardOwn, give, hand, isEquip, isRed, label, limitedUsed, markLimited,
  minHp, name, observe, on, others, pindian, putEquip, resetLimited, sameFactionSeats, slotOf, store, takeFrom, zoneOf, SLOTS, SUIT_LABEL,
} from './lib/tro-giup.mjs';

const equipsOf = (g, s) => SLOTS.flatMap((sl) => g.player(s).equips[sl]);
const SUITS = ['spade', 'heart', 'club', 'diamond'];
/** Lý do di chuyển bài KHÔNG phải "bị bỏ" (dùng, đánh ra, phán định...). */
const NOT_DISCARD = new Set(['use', 'settle', 'respond', 'save', 'judge', 'death', 'recast', 'replace', 'reshuffle', 'pindian', 'delayed', 'judgePhase']);

export default {
  skills: [
    // ---------------- Viên Thiệu ----------------
    {
      id: 'luanji', name: 'Loạn Kích',
      desc: 'Giai đoạn ra bài, bạn có thể chuyển hóa sử dụng 2 lá trên tay thành [Vạn Tiễn Tề Phát]; ▷ Bạn không thể sử dụng [Vạn Tiễn Tề Phát] bằng cách này '
        + 'với lá thành phần cùng chất với những lá bạn đã sử dụng theo cách này trong lượt này; ▶ Sau khi người cùng thế lực với bạn đánh ra [Thiểm] '
        + 'để hưởng ứng, họ có thể rút 1 lá.',
      bot: { use: 'always' },
      active: {
        cards: 'any', target: 'none', minCards: 2, maxCards: 2,
        cardOk: (g, s, id) => !luanjiSuits(g, s).includes(g.card(id).suit),
        checkCards: (g, s, ids) => (ids.length !== 2 ? 'Cần chọn đúng 2 lá'
          : ids.some((id) => luanjiSuits(g, s).includes(g.card(id).suit)) ? 'Không thể dùng lá cùng chất với lá đã dùng cho Loạn Kích trong lượt này' : null),
        available: (g, s) => g.state.currentSeat === s && g.state.phase === 'play' && others(g, s).length > 0
          && hand(g, s).filter((id) => !luanjiSuits(g, s).includes(g.card(id).suit)).length >= 2,
        run: async (g, s, ids) => {
          const k = `luanji:suits:${s}`;
          store(g)[k] = { turn: g.state.turnCount, suits: [...luanjiSuits(g, s), ...ids.map((id) => g.card(id).suit)] };
          store(g)[`luanji:active:${s}`] = true;
          try {
            await g.useCardAs(s, 'wanjian', [], ids, { label: 'Loạn Kích' });
          } finally {
            delete store(g)[`luanji:active:${s}`];
          }
        },
      },
      triggers: [
        on('cardResponded', (g, ctx, o) => !!store(g)[`luanji:active:${o}`] && ctx.as === 'shan' && ctx.seat !== o && g.isSameFaction(ctx.seat, o)
          && g.player(ctx.seat).alive, async (g, ctx) => { await g.draw(ctx.seat, 1); }, { compulsory: true }),
      ],
    },

    // ---------------- Nhan Lương & Văn Xú ----------------
    {
      id: 'shuangxiong', name: 'Song Hùng',
      desc: 'Giai đoạn rút bài, bạn có thể chọn không rút bài, bạn tiến hành phán xét; ▶ Sau khi phán xét trên có hiệu lực, bạn thu lấy kết quả phán xét; '
        + '▶ Trong lượt này, bạn có thể chuyển hóa sử dụng bài trên tay khác màu với kết quả phán xét trên thành [Quyết Đấu].',
      bot: { confirm: (v) => v.myHand.length >= 2 },
      convert: (g, s, c) => {
        const f = g.player(s).flags.shuangxiong;
        if (!f || g.state.currentSeat !== s || !g.player(s).hand.includes(c.id)) return [];
        return (isRed(c) ? 1 : 2) !== f ? ['juedou'] : [];
      },
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o && ctx.count > 0, async (g, ctx, o) => {
          ctx.count = 0;
          const j = await g.judge(o, 'Song Hùng');
          g.player(o).flags.shuangxiong = isRed(j) ? 1 : 2;
          if (g.state.processing.includes(j.id)) await g.moveCards([j.id], { kind: 'processing' }, { kind: 'hand', seat: o }, 'shuangxiong');
          g.say(`${name(g, o)} nhận ${label(g, j.id)}; lượt này có thể dùng lá ${isRed(j) ? 'đen' : 'đỏ'} như Quyết Đấu.`);
        }),
      ],
    },

    // ---------------- Thái Văn Cơ ----------------
    {
      id: 'beige', name: 'Bi Ca',
      desc: 'Sau khi 1 người nhận sát thương từ lá [Sát], bạn có thể bỏ 1 lá, lệnh họ tiến hành phán xét, nếu kết quả phán xét có chất: '
        + 'CƠ: họ hồi 1 máu; RÔ: họ rút 2 lá; TÉP: nguồn sát thương bỏ 2 lá; BÍCH: nguồn sát thương thay đổi trạng thái chồng tướng.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.cardAs === 'sha' && g.player(ctx.target).alive && allCards(g, o).length > 0, async (g, ctx, o) => {
          const ids = await chooseOwn(g, o, 'Bi Ca: bỏ 1 lá', 1, 1);
          if (!ids?.length) return;
          await discardOwn(g, o, ids);
          const t = ctx.target;
          const src = ctx.source;
          const j = await g.judge(t, 'Bi Ca');
          const suit = j.suit;
          await g.finishJudge(j);
          if (suit === 'heart') await g.recover(t, 1, o);
          else if (suit === 'diamond') await g.draw(t, 2);
          else if (src !== null && g.player(src).alive) {
            if (suit === 'club') await g.forceDiscard(src, 2, 'beige');
            else g.turnOver(src);
          }
        }),
      ],
    },
    {
      id: 'duanchang', name: 'Đoạn Trường',
      desc: 'Tỏa định kỹ: khi bạn trận vong do người khác gây sát thương, bạn chọn 1 tướng của họ, lệnh họ mất đi kỹ năng của tướng đó.',
      triggers: [
        on('death', (g, ctx, o) => ctx.seat === o && ctx.killer !== null && ctx.killer !== o && g.player(ctx.killer).alive,
          async (g, ctx, o) => {
            const k = ctx.killer;
            const h = g.hero(k);
            const slots = ['main', 'deputy'].filter((w) => !h[w].removed && !h[w].noSkills);
            if (!slots.length) return;
            const i = slots.length > 1 ? await g.choose(o, `Đoạn Trường: ${name(g, k)} mất kỹ năng của tướng nào`,
              slots.map((w) => g.generalName(h[w].generalId))) : 0;
            h[slots[i]].noSkills = true;
            g.say(`${name(g, k)} mất toàn bộ kỹ năng của ${g.generalName(h[slots[i]].generalId)}.`);
          }, { compulsory: true }),
      ],
    },

    // ---------------- Mã Đằng ----------------
    {
      id: 'xiongyi', name: 'Hùng Dị',
      desc: 'Hạn định kỹ: giai đoạn ra bài, bạn có thể phát động kỹ năng này, thực hiện lần lượt: lệnh tất cả người cùng thế lực với bạn rút 3 lá; '
        + 'nếu thế lực của bạn là một trong những thế lực ít người nhất, bạn hồi 1 máu.',
      bot: { use: 'always' },
      active: {
        cards: 'none', target: 'none',
        available: (g, s) => !limitedUsed(g, s, 'xiongyi'),
        run: async (g, s) => {
          markLimited(g, s, 'xiongyi');
          for (const t of sameFactionSeats(g, s)) await g.draw(t, 3);
          const counts = new Map();
          for (const p of g.alivePlayers()) {
            const k = g.shownKingdom(p.seat);
            if (k) counts.set(k === 'careerist' ? `c${p.seat}` : k, (counts.get(k === 'careerist' ? `c${p.seat}` : k) ?? 0) + 1);
          }
          const mine = g.shownKingdom(s) === 'careerist' ? `c${s}` : g.shownKingdom(s);
          if (counts.get(mine) === Math.min(...counts.values())) await g.recover(s, 1, s);
        },
      },
    },

    // ---------------- Khổng Dung ----------------
    {
      id: 'mingshi', name: 'Danh Sĩ',
      desc: 'Tỏa định kỹ: khi bạn tính toán sát thương phải nhận, nếu nguồn sát thương có tướng chưa mở, lệnh sát thương này -1.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && ctx.amount > 0
          && ['main', 'deputy'].some((w) => { const sl = g.hero(ctx.source)[w]; return !sl.revealed && !sl.removed; }),
          (g, ctx, o) => { ctx.amount -= 1; g.say(`Danh Sĩ: sát thương lên ${name(g, o)} giảm 1.`); }, { compulsory: true }),
      ],
    },
    {
      id: 'lirang', name: 'Lễ Nhượng',
      desc: 'Khi bài của bạn tiến vào chồng bài bỏ do bỏ bài, bạn có thể giao tùy ý cho những người khác.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => ctx.to.kind === 'discard' && (ctx.from.kind === 'hand' || ctx.from.kind === 'equip')
          && ctx.from.seat === o && !NOT_DISCARD.has(ctx.reason) && g.player(o).alive && others(g, o).length > 0
          && ctx.cardIds.some((id) => g.state.discardPile.includes(id)),
          async (g, ctx, o) => {
            let ids = ctx.cardIds.filter((id) => g.state.discardPile.includes(id));
            for (let round = 0; round < 8 && ids.length; round++) {
              const [t] = await g.chooseTargets(o, `Lễ Nhượng: giao lá vừa bỏ cho ai (còn ${ids.length} lá, bỏ trống = dừng)`, others(g, o), 0, 1, 'ally');
              if (t === undefined) return;
              const pick = ids.length === 1 ? ids : await g.chooseCards(o, `Lễ Nhượng: chọn lá giao cho ${name(g, t)}`, ids, 1, ids.length, true);
              const ok = pick.filter((id) => g.state.discardPile.includes(id));
              if (!ok.length) return;
              await g.moveCards(ok, { kind: 'discard' }, { kind: 'hand', seat: t }, 'lirang');
              g.say(`${name(g, t)} nhận ${ok.length} lá từ Lễ Nhượng.`);
              ids = ids.filter((id) => !ok.includes(id) && g.state.discardPile.includes(id));
            }
          }),
      ],
    },

    // ---------------- Kỷ Linh ----------------
    {
      id: 'shuangren', name: 'Song Nhận',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể đấu điểm với 1 người: nếu bạn thắng: bạn xem như sử dụng [Sát] với 1 người cùng thế lực với họ; '
        + 'nếu bạn không thắng: bạn không thể chỉ định người khác làm mục tiêu sử dụng bài (trong lượt này).',
      bot: { confirm: (v) => v.myHand.some((c) => c.rank >= 11) },
      restrictTarget: (g, o, t) => t !== o && store(g)[`shuangren:${o}`] === g.state.turnCount && g.state.currentSeat === o,
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && hand(g, o).length > 0
          && others(g, o, (s) => hand(g, s).length > 0).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Song Nhận: đấu điểm với ai', others(g, o, (s) => hand(g, s).length > 0), 1, 1, 'enemy');
            if (t === undefined) return;
            const r = await pindian(g, o, t, 'Song Nhận');
            if (!r) return;
            if (!r.win) {
              store(g)[`shuangren:${o}`] = g.state.turnCount;
              g.say(`${name(g, o)} lượt này không thể chỉ định người khác làm mục tiêu.`);
              return;
            }
            const cands = [t, ...others(g, o, (s) => s !== t && g.isSameFaction(s, t))]
              .filter((x) => x !== o && g.player(x).alive && g.canTarget(o, x) && g.canBeSlashTarget(o, x));
            const [x] = await g.chooseTargets(o, 'Song Nhận: coi như dùng Sát vào ai', cands, 1, 1, 'enemy');
            if (x !== undefined) await g.useCardAs(o, 'sha', [x], [], { label: 'Song Nhận' });
          }),
      ],
    },

    // ---------------- Điền Phong ----------------
    {
      id: 'sijian', name: 'Tử Gián',
      desc: 'Sau khi bạn mất đi lá cuối cùng trên tay, bạn có thể bỏ 1 lá của 1 người khác.',
      triggers: [
        on('cardsMoved', (g, ctx, o) => ctx.from.kind === 'hand' && ctx.from.seat === o && g.player(o).alive && hand(g, o).length === 0
          && others(g, o, (s) => allCards(g, s).length > 0).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Tử Gián: bỏ 1 lá của ai', others(g, o, (s) => allCards(g, s).length > 0), 0, 1, 'enemy');
            if (t !== undefined) await discardFrom(g, o, t, 'Tử Gián: chọn lá để bỏ');
          }),
      ],
    },
    {
      id: 'suishi', name: 'Tùy Thế',
      desc: 'Tỏa định kỹ: khi người khác tiến vào trạng thái hấp hối, nếu nguồn sát thương có cùng thế lực với bạn, bạn rút 1 lá. '
        + 'Khi người khác có cùng thế lực với bạn trận vong, bạn mất 1 máu.',
      triggers: [
        on('dying', (g, ctx, o) => ctx.seat !== o && ctx.source !== null && (ctx.source === o || g.isSameFaction(ctx.source, o)),
          async (g, _ctx, o) => { await g.draw(o, 1); }, { compulsory: true }),
        on('death', (g, ctx, o) => ctx.seat !== o && g.player(o).alive && g.isSameFaction(ctx.seat, o),
          async (g, _ctx, o) => { await g.loseHp(o, 1); }, { compulsory: true }),
      ],
    },

    // ---------------- Phan Phụng ----------------
    {
      id: 'kuangfu', name: 'Cuồng Phủ',
      desc: 'Một lần trong giai đoạn ra bài, sau khi bạn xác định mục tiêu của [Sát], bạn có thể thu lấy 1 trang bị của 1 trong các mục tiêu; '
        + '▶ Sau khi kết toán xong [Sát] này, nếu [Sát] này không gây sát thương, bạn bỏ 2 lá trên tay.',
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat === o && ctx.as === 'sha' && g.state.currentSeat === o && g.state.phase === 'play'
          && !g.player(o).flags.kuangfu && ctx.targets.some((t) => t !== o && equipsOf(g, t).length > 0),
          async (g, ctx, o) => {
            g.player(o).flags.kuangfu = 1;
            const cands = ctx.targets.filter((t) => t !== o && equipsOf(g, t).length > 0);
            const [t] = cands.length > 1 ? await g.chooseTargets(o, 'Cuồng Phủ: thu lấy trang bị của ai', cands, 1, 1, 'enemy') : cands;
            if (t === undefined) return;
            const [id] = await g.chooseCards(o, 'Cuồng Phủ: chọn trang bị', equipsOf(g, t), 1, 1, true);
            await g.moveCards([id], zoneOf(g, t, id), { kind: 'hand', seat: o }, 'kuangfu');
            g.say(`${name(g, o)} thu lấy ${label(g, id)} của ${name(g, t)}.`);
            store(g)[`kuangfu:${o}`] = { cardId: ctx.card.id, left: ctx.targets.length, dmg: false };
          }),
        observe('damageDealt', (g, ctx, o) => {
          const k = store(g)[`kuangfu:${o}`];
          if (k && ctx.source === o && ctx.cardAs === 'sha' && ctx.card?.id === k.cardId) k.dmg = true;
        }),
        observe('slashEnd', (g, ctx, o) => {
          const k = store(g)[`kuangfu:${o}`];
          if (k && ctx.source === o && ctx.card.id === k.cardId) k.left--;
        }),
        on('slashEnd', (g, ctx, o) => {
          const k = store(g)[`kuangfu:${o}`];
          return !!k && ctx.source === o && ctx.card.id === k.cardId && k.left <= 0;
        }, async (g, _ctx, o) => {
          const k = store(g)[`kuangfu:${o}`];
          delete store(g)[`kuangfu:${o}`];
          if (!k.dmg && g.player(o).alive && hand(g, o).length) await g.forceDiscard(o, 2, 'kuangfu');
        }, { compulsory: true }),
      ],
    },

    // ---------------- Trâu thị ----------------
    {
      id: 'huoshui', name: 'Họa Thủy',
      desc: 'Tỏa định kỹ: trong lượt của bạn: người khác không thể mở tướng; khi bạn sử dụng [Sát] hoặc [Vạn Tiễn Tề Phát], mục tiêu của lá này '
        + 'không thể sử dụng hoặc đánh ra [Thiểm] để hưởng ứng.',
      blockReveal: (g, o) => g.state.currentSeat === o,
      blockResponse: (g, o, seat, accept, _src, ctx) => g.state.currentSeat === o && seat !== o && accept.includes('shan')
        && ctx?.kind === 'aoe' && ctx.trick === 'wanjian' && ctx.user === o,
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.source === o && g.state.currentSeat === o && !ctx.noDodge,
          (_g, ctx) => { ctx.noDodge = true; }, { compulsory: true }),
      ],
    },
    {
      id: 'qingcheng', name: 'Khuynh Thành',
      desc: 'Giai đoạn ra bài, bạn có thể bỏ 1 lá Đen và chọn 1 người khác đã mở tất cả tướng, bạn úp 1 tướng của họ; '
        + '▷ Nếu lá bạn bỏ là trang bị, bạn có thể chọn 1 người khác đã mở tất cả tướng, bạn úp 1 tướng của họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => allCards(g, s).some((id) => !isRed(g.card(id))),
        validTarget: (g, s, t) => t !== s && qingchengOk(g, t),
        run: async (g, s, _c, [t]) => {
          const blacks = allCards(g, s).filter((id) => !isRed(g.card(id)));
          const [id] = await g.chooseCards(s, 'Khuynh Thành: bỏ 1 lá Đen', blacks, 1, 1);
          if (id === undefined) return;
          const wasEquip = isEquip(g.card(id));
          await discardOwn(g, s, [id]);
          await qingchengHide(g, s, t);
          if (wasEquip) {
            const more = others(g, s, (x) => x !== t && qingchengOk(g, x));
            const [u] = await g.chooseTargets(s, 'Khuynh Thành: úp 1 tướng của 1 người khác nữa (có thể bỏ qua)', more, 0, 1, 'enemy');
            if (u !== undefined) await qingchengHide(g, s, u);
          }
        },
      },
    },

    // ---------------- Đổng Trác ----------------
    {
      id: 'hengzheng', name: 'Hoành Chinh',
      desc: 'Khi bắt đầu giai đoạn rút bài, nếu số máu của bạn là 1 hoặc không có bài trên tay, bạn có thể không rút bài, thu lấy từ mỗi người khác 1 lá trong vùng chơi.',
      triggers: [
        on('drawPhase', (g, ctx, o) => ctx.seat === o && ctx.count > 0 && (g.player(o).hp === 1 || hand(g, o).length === 0)
          && others(g, o, (s) => allCards(g, s, true).length > 0).length > 0,
          async (g, ctx, o) => {
            ctx.count = 0;
            for (const s of g.aliveSeatsFrom(o)) {
              if (s !== o && allCards(g, s, true).length) await takeFrom(g, o, s, `Hoành Chinh: lấy 1 lá của ${name(g, s)}`, { judge: true });
            }
          }),
      ],
    },
    {
      id: 'baoling', name: 'Bạo Lăng', position: 'main',
      desc: 'Chủ tướng kỹ, tỏa định kỹ: khi bạn kết thúc giai đoạn ra bài, nếu bạn đã mở tướng này và có phó tướng, bạn thực hiện lần lượt: '
        + 'bạn loại bỏ phó tướng; bạn tăng giới hạn máu thêm 3, hồi 3 máu; bạn mất kỹ năng này và nhận kỹ năng »Băng Hoại«.',
      triggers: [
        on('phaseEnd', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && g.hero(o).main.revealed && !g.hero(o).deputy.removed,
          async (g, _ctx, o) => {
            await g.removeGeneral(o, 'deputy');
            g.player(o).maxHp += 3;
            g.say(`${name(g, o)} +3 giới hạn máu.`);
            await g.recover(o, 3, o);
            g.grantSkill(o, 'benghuai');
          }, { compulsory: true }),
      ],
    },
    {
      id: 'benghuai', name: 'Băng Hoại',
      desc: 'Tỏa định kỹ: khi bắt đầu giai đoạn kết thúc, nếu bạn không phải là người có số máu thấp nhất, bạn chọn mất 1 máu hoặc giảm 1 giới hạn máu.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && g.player(o).hp > minHp(g), async (g, _ctx, o) => {
          const p = g.player(o);
          const i = await g.choose(o, 'Băng Hoại: bạn chọn', ['Mất 1 máu', 'Giảm 1 giới hạn máu']);
          if (i === 0) { await g.loseHp(o, 1); return; }
          p.maxHp -= 1;
          g.say(`${p.name} −1 giới hạn máu (còn ${p.maxHp}).`);
          if (p.hp > p.maxHp) p.hp = p.maxHp;
          if (p.maxHp <= 0) await g.loseHp(o, Math.max(1, p.hp));
        }, { compulsory: true }),
      ],
    },

    // ---------------- Trương Tú ----------------
    {
      id: 'fudi', name: 'Phụ Địch',
      desc: 'Sau khi bạn nhận sát thương, bạn có thể giao cho nguồn sát thương 1 lá bài trên tay; ▷ Bạn gây 1 sát thương cho 1 người cùng thế lực với nguồn sát thương '
        + 'mà có số máu nhiều nhất trong thế lực đó và ≥ bạn.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive && hand(g, o).length > 0,
          async (g, ctx, o) => {
            const src = ctx.source;
            const [id] = await g.chooseCards(o, `Phụ Địch: giao 1 lá cho ${name(g, src)}`, [...hand(g, o)], 1, 1);
            await give(g, o, src, [id]);
            const team = [src, ...others(g, src, (s) => g.isSameFaction(s, src))].filter((s) => s !== o);
            const top = Math.max(...team.map((s) => g.player(s).hp));
            if (top < g.player(o).hp) return;
            const [t] = await g.chooseTargets(o, 'Phụ Địch: gây 1 sát thương cho ai', team.filter((s) => g.player(s).hp === top), 1, 1, 'enemy');
            if (t !== undefined) await g.damage({ source: o, target: t, amount: 1, card: null, cancelled: false });
          }),
      ],
    },
    {
      id: 'congjian', name: 'Tòng Gián',
      desc: 'Tỏa định kỹ: khi bạn gây sát thương ngoài lượt hoặc khi bạn tính toán sát thương phải nhận trong lượt, sát thương này +1.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.amount > 0 && ((ctx.source === o && ctx.target !== o && g.state.currentSeat !== o)
          || (ctx.target === o && g.state.currentSeat === o)),
          (_g, ctx) => { ctx.amount += 1; }, { compulsory: true }),
      ],
    },

    // ---------------- Hà Thái Hậu ----------------
    {
      id: 'zhendu', name: 'Trậm Độc',
      desc: 'Khi bắt đầu giai đoạn ra bài của người khác, bạn có thể bỏ 1 lá bài trên tay, nếu họ thỏa mãn điều kiện sử dụng [Tửu], thực hiện lần lượt: '
        + 'họ xem như sử dụng [Tửu]; bạn gây 1 sát thương cho họ.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) && v.players[v.currentSeat].hp <= 2 },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'play' && hand(g, o).length > 0 && g.player(ctx.seat).alive
          && !g.player(ctx.seat).flags.jiuUsed,
          async (g, ctx, o) => {
            const [id] = await g.chooseCards(o, 'Trậm Độc: bỏ 1 lá trên tay', [...hand(g, o)], 1, 1);
            await discardOwn(g, o, [id]);
            const p = g.player(ctx.seat);
            p.flags.jiuUsed = 1;
            p.flags.jiuBuff = 1;
            g.say(`${p.name} xem như sử dụng Rượu.`);
            await g.damage({ source: o, target: ctx.seat, amount: 1, card: null, cancelled: false });
          }),
      ],
    },
    {
      id: 'qiluan', name: 'Thích Loạn',
      desc: 'Khi kết thúc lượt của 1 người, nếu trong lượt này bạn đã giết người, bạn có thể rút 3 lá.',
      triggers: [
        observe('death', (g, ctx, o) => { if (ctx.killer === o) store(g)[`qiluan:${o}`] = g.state.turnCount; }),
        on('turnEnd', (g, _ctx, o) => store(g)[`qiluan:${o}`] === g.state.turnCount, async (g, _ctx, o) => {
          delete store(g)[`qiluan:${o}`];
          await g.draw(o, 3);
        }),
      ],
    },

    // ---------------- Lý Thôi & Quách Dĩ ----------------
    {
      id: 'xiongsuan', name: 'Hung Toán',
      desc: 'Hạn định kỹ: giai đoạn ra bài, bạn có thể bỏ 1 lá bài trên tay và chọn 1 người cùng thế lực, thực hiện lần lượt: bạn gây 1 sát thương cho họ; '
        + 'bạn rút 3 lá; bạn chọn 1 Hạn định kỹ đã phát động của họ; ▶ Khi kết thúc lượt này, thêm 1 giới hạn phát động Hạn định kỹ đó.',
      bot: { use: 'never' },
      triggers: [
        observe('turnEnd', (g, _ctx, o) => {
          const p = store(g)[`xiongsuan:pending:${o}`];
          if (!p) return;
          delete store(g)[`xiongsuan:pending:${o}`];
          if (!g.player(p.seat).alive) return;
          resetLimited(g, p.seat, p.skill);
          g.say(`${name(g, p.seat)} được dùng lại ${g.skillName(p.skill)}.`);
        }),
      ],
      active: {
        cards: 'one', target: 'one',
        available: (g, s) => !limitedUsed(g, s, 'xiongsuan'),
        validTarget: (g, s, t) => t === s || g.isSameFaction(t, s),
        run: async (g, s, [id], [t]) => {
          markLimited(g, s, 'xiongsuan');
          await discardOwn(g, s, [id]);
          await g.damage({ source: s, target: t, amount: 1, card: null, cancelled: false });
          await g.draw(s, 3);
          if (!g.player(t).alive) return;
          const used = Object.keys(store(g)).filter((k) => k.startsWith('limited:') && k.endsWith(`:${t}`)).map((k) => k.split(':')[1]);
          if (!used.length) return;
          const i = await g.choose(s, 'Hung Toán: kỹ năng hạn định nào được dùng lại (khi kết thúc lượt này)', used.map((k) => g.skillName(k)));
          store(g)[`xiongsuan:pending:${s}`] = { seat: t, skill: used[i] };
        },
      },
    },

    // ---------------- Vu Cát ----------------
    {
      id: 'qianhuan', name: 'Thiên Huyễn',
      desc: 'Sau khi 1 người cùng thế lực nhận sát thương, bạn có thể đem 1 lá của bạn đặt lên tướng này, gọi là [Huyễn] (không thể đặt lá trùng chất với những [Huyễn] đã có). '
        + 'Khi 1 người cùng thế lực trở thành mục tiêu duy nhất của lá cơ bản/công cụ phổ thông, bạn có thể đưa 1 [Huyễn] vào chồng bài bỏ, hủy bỏ mục tiêu này. '
        + 'Khi có lá tiến vào vùng phán xét của người cùng thế lực với bạn, bạn có thể đưa 1 [Huyễn] vào chồng bài bỏ, đưa lá đó vào chồng bài bỏ.',
      triggers: [
        on('damaged', (g, ctx, o) => g.player(o).alive && (ctx.target === o || g.isSameFaction(ctx.target, o)) && huanCandidates(g, o).length > 0,
          async (g, _ctx, o) => {
            const [id] = await g.chooseCards(o, 'Thiên Huyễn: đặt 1 lá lên tướng làm Huyễn', huanCandidates(g, o), 1, 1);
            if (id === undefined) return;
            await g.moveCards([id], zoneOf(g, o, id), { kind: 'special', seat: o }, 'qianhuan');
            g.say(`${name(g, o)} đặt ${label(g, id)} làm Huyễn.`);
          }),
        observe('cardUsed', (g, _ctx, o) => { delete store(g)[`qianhuan:cancel:${o}`]; }),
        on('cardUsed', (g, ctx, o) => {
          const t = ctx.targets[0];
          return ctx.targets.length === 1 && t !== ctx.seat && g.player(t).alive && (t === o || g.isSameFaction(t, o)) && g.player(o).special.length > 0
            && (ctx.as === 'sha' || g.cardInfo(ctx.as)?.type === 'trick');
        }, async (g, ctx, o) => {
          const [id] = await g.chooseCards(o, 'Thiên Huyễn: đưa 1 Huyễn vào chồng bài bỏ', [...g.player(o).special], 1, 1, true);
          if (id === undefined) return;
          await g.moveCards([id], { kind: 'special', seat: o }, { kind: 'discard' }, 'qianhuan');
          store(g)[`qianhuan:cancel:${o}`] = { target: ctx.targets[0], cardId: ctx.card.id };
        }),
        on('slashTargeted', (g, ctx, o) => qianhuanHit(g, o, ctx.target, ctx.card), (g, ctx, o) => {
          delete store(g)[`qianhuan:cancel:${o}`];
          ctx.cancelled = true;
          g.say(`Thiên Huyễn: Sát không có hiệu lực với ${name(g, ctx.target)}.`);
        }, { compulsory: true }),
        on('trickTargeted', (g, ctx, o) => qianhuanHit(g, o, ctx.target, ctx.card), (g, ctx, o) => {
          delete store(g)[`qianhuan:cancel:${o}`];
          ctx.cancelled = true;
          g.say(`Thiên Huyễn: ${g.cardInfo(ctx.name).label} không có hiệu lực với ${name(g, ctx.target)}.`);
        }, { compulsory: true }),
        on('cardsMoved', (g, ctx, o) => ctx.to.kind === 'judge' && g.player(o).special.length > 0 && g.player(ctx.to.seat).alive
          && (ctx.to.seat === o || g.isSameFaction(ctx.to.seat, o)) && ctx.cardIds.some((id) => g.player(ctx.to.seat).judgeArea.includes(id)),
          async (g, ctx, o) => {
            const [h] = await g.chooseCards(o, 'Thiên Huyễn: đưa 1 Huyễn vào chồng bài bỏ', [...g.player(o).special], 1, 1, true);
            if (h === undefined) return;
            await g.moveCards([h], { kind: 'special', seat: o }, { kind: 'discard' }, 'qianhuan');
            const s = ctx.to.seat;
            const ids = ctx.cardIds.filter((id) => g.player(s).judgeArea.includes(id));
            if (ids.length) {
              await g.moveCards(ids, { kind: 'judge', seat: s }, { kind: 'discard' }, 'qianhuan');
              g.say(`Thiên Huyễn: ${ids.map((id) => label(g, id)).join(', ')} bị đưa vào chồng bài bỏ.`);
            }
          }),
      ],
    },

    // ---------------- Trương Nhậm ----------------
    {
      id: 'chuanxin', name: 'Xuyên Tâm',
      desc: 'Giai đoạn ra bài của bạn, khi bạn gây sát thương cho mục tiêu của [Sát] hoặc [Quyết Đấu], nếu họ có thế lực xác định khác với bạn '
        + '(bạn có thể mở tướng này để xác định thế lực) và có Phó tướng, bạn có thể chặn sát thương này, lệnh mục tiêu chọn 1 mục: '
        + '1. Nếu họ có trang bị, họ bỏ toàn bộ bài trong vùng Trang Bị và mất 1 máu. 2. Họ loại bỏ Phó tướng.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.source === o && ctx.target !== o && g.state.currentSeat === o && g.state.phase === 'play'
          && ['sha', 'juedou'].includes(ctx.cardAs) && wouldDiffer(g, ctx.target, o) && !g.hero(ctx.target).deputy.removed,
          async (g, ctx, o) => {
            ctx.cancelled = true;
            const t = ctx.target;
            const opts = [...(equipsOf(g, t).length ? ['Bỏ toàn bộ trang bị và mất 1 máu'] : []), 'Loại bỏ phó tướng'];
            const i = opts.length > 1 ? await g.choose(t, `Xuyên Tâm của ${name(g, o)}: bạn chọn`, opts) : 0;
            if (opts[i] === 'Loại bỏ phó tướng') await g.removeGeneral(t, 'deputy');
            else { await discardOwn(g, t, equipsOf(g, t)); await g.loseHp(t, 1); }
          }),
      ],
    },
    {
      id: 'fengshi', name: 'Phong Thỉ',
      desc: 'Trận pháp kỹ: Quan hệ vây công: nếu bạn là người vây công, sau khi người vây công xác định mục tiêu của lá [Sát], ứng với mỗi mục tiêu, '
        + 'nếu mục tiêu này là người bị vây công, bạn lệnh họ bỏ 1 lá trong vùng trang bị.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => {
          const b = besiegers(g, ctx.target);
          return !!b && b.includes(o) && b.includes(ctx.source) && equipsOf(g, ctx.target).length > 0;
        }, async (g, ctx) => {
          const [id] = await g.chooseCards(ctx.target, 'Phong Thỉ: bỏ 1 trang bị', equipsOf(g, ctx.target), 1, 1, true);
          await discardOwn(g, ctx.target, [id]);
        }, { compulsory: true }),
      ],
    },

    // ---------------- Tuân Kham ----------------
    {
      id: 'fenglve', name: 'Phong Lược',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể đấu điểm với 1 người khác: nếu bạn thắng, họ giao 2 lá trong vùng chơi của họ cho bạn; '
        + 'nếu bạn thua, bạn giao 1 lá cho họ; ▷ Tung Hoành: bạn có thể lệnh họ nhận kỹ năng »Phong Lược (Tung Hoành)« (thay mô tả "2" thành "1" '
        + 'và bỏ qua hiệu ứng Tung Hoành) cho đến sau khi kết thúc lượt tiếp theo của họ.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.fenglve && hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && hand(g, t).length > 0,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.fenglve = 1;
          await fenglveDuel(g, s, t, 2);
          if (g.player(t).alive && g.player(s).alive && !g.hasSkill(t, 'fenglvezongheng', false) && !g.hasSkill(t, 'fenglve', false)) {
            const ok = await g.choose(s, `Tung Hoành: cho ${name(g, t)} nhận »Phong Lược (Tung Hoành)« đến hết lượt kế tiếp của họ?`, ['Không', 'Có']);
            if (ok === 1) {
              g.grantSkill(t, 'fenglvezongheng');
              store(g)[`zongheng:fenglve:${t}`] = g.state.turnCount;
              g.say(`${name(g, t)} nhận Phong Lược (Tung Hoành).`);
            }
          }
        },
      },
    },
    {
      id: 'fenglvezongheng', name: 'Phong Lược (Tung Hoành)',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể đấu điểm với 1 người khác. Nếu thắng, họ giao 1 lá trong vùng chơi của họ cho bạn; nếu thua, bạn giao 1 lá cho họ.',
      bot: { use: 'always', target: 'enemy' },
      triggers: [
        observe('turnEnd', (g, ctx, o) => {
          const k = `zongheng:fenglve:${o}`;
          if (ctx.seat === o && store(g)[k] !== undefined && store(g)[k] < g.state.turnCount) {
            delete store(g)[k];
            g.revokeSkill(o, 'fenglvezongheng');
          }
        }),
      ],
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => !g.player(s).flags.fenglvezh && hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && hand(g, t).length > 0,
        run: async (g, s, _c, [t]) => {
          g.player(s).flags.fenglvezh = 1;
          await fenglveDuel(g, s, t, 1);
        },
      },
    },
    {
      id: 'anyong', name: 'Ám Dũng',
      desc: 'Một lần trong lượt của mỗi người, khi 1 người cùng thế lực với bạn gây sát thương cho 1 người khác ngoài họ, có thể lệnh cho sát thương này gấp đôi; '
        + 'sau đó, nếu người nhận sát thương đã: mở tất cả tướng: bạn tự mất 1 máu và mất kỹ năng này; mở 1 tướng và không phải tất cả: bạn bỏ 2 lá trên tay.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.source !== null && ctx.source !== ctx.target && ctx.amount > 0 && !store(g)[`anyong:lost:${o}`]
          && (ctx.source === o || g.isSameFaction(ctx.source, o)) && !g.isSameFaction(ctx.target, o) && ctx.target !== o
          && store(g)[`anyong:${o}`] !== g.state.turnCount,
          async (g, ctx, o) => {
            store(g)[`anyong:${o}`] = g.state.turnCount;
            ctx.amount *= 2;
            g.say(`Ám Dũng: sát thương nhân đôi (${ctx.amount}).`);
            const h = g.hero(ctx.target);
            const shown = ['main', 'deputy'].filter((w) => h[w].revealed).length;
            const all = ['main', 'deputy'].every((w) => h[w].revealed || h[w].removed);
            if (all) {
              store(g)[`anyong:lost:${o}`] = 1;
              g.say(`${name(g, o)} mất kỹ năng Ám Dũng.`);
              await g.loseHp(o, 1);
            } else if (shown >= 1 && hand(g, o).length) {
              await g.forceDiscard(o, 2, 'anyong');
            }
          }),
      ],
    },

    // ---------------- Hứa Du ----------------
    {
      id: 'chenglve', name: 'Thành Lược',
      desc: 'Sau khi kết toán bài do 1 người cùng thế lực với bạn sử dụng, nếu số mục tiêu > 1, bạn có thể lệnh họ rút 1 lá; ▷ Nếu bạn đã nhận sát thương từ lá này, '
        + 'bạn có thể lệnh 1 người cùng thế lực với bạn không có tướng úp và không có tiêu ký nào nhận được 1 tiêu ký [Âm Dương Ngư].',
      triggers: [
        observe('cardUsed', (g, ctx, o) => {
          if (!(ctx.seat === o || g.isSameFaction(ctx.seat, o)) || ctx.card.id < 0) return;
          const def = g.trickDef(ctx.as);
          const tg = def && def.targeting !== 'one' ? g.autoTargetsOf(ctx.seat, ctx.as) : ctx.targets;
          if (tg.length > 1) store(g)[`chenglve:${o}`] = { cardId: ctx.card.id, user: ctx.seat, hurt: false };
        }),
        observe('damageDealt', (g, ctx, o) => {
          const a = store(g)[`chenglve:${o}`];
          if (a && ctx.target === o && ctx.card?.id === a.cardId) a.hurt = true;
        }),
        on('cardsMoved', (g, ctx, o) => {
          const a = store(g)[`chenglve:${o}`];
          return !!a && ctx.reason === 'settle' && ctx.to.kind === 'discard' && ctx.cardIds.includes(a.cardId) && g.player(a.user).alive && g.player(o).alive;
        }, async (g, _ctx, o) => {
          const a = store(g)[`chenglve:${o}`];
          delete store(g)[`chenglve:${o}`];
          await g.draw(a.user, 1);
          if (!a.hurt || !g.player(o).alive) return;
          const noMarks = (s) => { const m = g.hero(s).marks; return !m.yinyang && !m.pioneer && !m.pair; };
          const allShown = (s) => ['main', 'deputy'].every((w) => g.hero(s)[w].revealed || g.hero(s)[w].removed);
          const cands = sameFactionSeats(g, o).filter((s) => allShown(s) && noMarks(s));
          const [t] = await g.chooseTargets(o, 'Thành Lược: ai nhận 1 tiêu ký Âm Dương Ngư (có thể bỏ qua)', cands, 0, 1, 'ally');
          if (t !== undefined) { g.hero(t).marks.yinyang++; g.say(`${name(g, t)} nhận 1 tiêu ký Âm Dương Ngư.`); }
        }),
        observe('cardsMoved', (g, ctx, o) => {
          const a = store(g)[`chenglve:${o}`];
          if (a && ctx.reason === 'settle' && ctx.cardIds.includes(a.cardId)) delete store(g)[`chenglve:${o}`];
        }),
      ],
    },
    {
      id: 'shicai', name: 'Thị Tài',
      desc: 'Tỏa định kỹ: sau khi bạn nhận sát thương, nếu số sát thương là: 1: bạn rút 1 lá; 2+: bạn bỏ 2 lá.',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o, async (g, ctx, o) => {
          if (ctx.amount === 1) await g.draw(o, 1);
          else await g.forceDiscard(o, 2, 'shicai');
        }, { compulsory: true }),
      ],
    },

    // ---------------- Hoàng Tổ ----------------
    {
      id: 'xishe', name: 'Tập Xạ',
      desc: 'Khi bắt đầu giai đoạn chuẩn bị của người khác, bạn có thể bỏ 1 lá trong vùng trang bị và xem như sử dụng 1 [Sát] với họ, nếu số máu của họ nhỏ hơn '
        + 'của bạn, bạn lệnh cho [Sát] này không thể hưởng ứng; bạn có thể lặp lại quá trình này. Khi kết thúc lượt này, nếu trong lượt người trận vong và nguồn '
        + 'là [Sát] từ kỹ năng này của bạn, bạn có thể đổi phó tướng, tướng sau khi đổi được úp xuống.',
      bot: { confirm: (v, h) => !h.isAlly(v.currentSeat) },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat !== o && ctx.phase === 'start' && equipsOf(g, o).length > 0
          && g.canTarget(o, ctx.seat) && g.canBeSlashTarget(o, ctx.seat),
          async (g, ctx, o) => {
            const t = ctx.seat;
            for (let i = 0; i < 6; i++) {
              if (!g.player(o).alive || !g.player(t).alive || !equipsOf(g, o).length || g.state.finished) break;
              if (i > 0 && (await g.choose(o, `Tập Xạ: tiếp tục bỏ 1 trang bị để Sát ${name(g, t)}?`, ['Không', 'Có'])) !== 1) break;
              const [id] = await g.chooseCards(o, 'Tập Xạ: bỏ 1 trang bị', equipsOf(g, o), 1, 1, true);
              await discardOwn(g, o, [id]);
              if (!g.player(o).alive || !g.player(t).alive) break;
              store(g)[`xishe:${o}`] = { target: t, noDodge: g.player(t).hp < g.player(o).hp };
              try {
                await g.useCardAs(o, 'sha', [t], [], { label: 'Tập Xạ' });
              } finally {
                delete store(g)[`xishe:${o}`];
              }
            }
          }),
        on('slashTargeted', (g, ctx, o) => ctx.source === o && store(g)[`xishe:${o}`]?.target === ctx.target && store(g)[`xishe:${o}`].noDodge,
          (_g, ctx) => { ctx.noDodge = true; }, { compulsory: true }),
        observe('death', (g, ctx, o) => { if (ctx.killer === o && store(g)[`xishe:${o}`]) store(g)[`xishe:kill:${o}`] = g.state.turnCount; }),
        on('turnEnd', (g, _ctx, o) => store(g)[`xishe:kill:${o}`] === g.state.turnCount && g.player(o).alive && !g.hero(o).deputy.removed
          && g.transformCandidates(o).length > 0,
          async (g, _ctx, o) => {
            delete store(g)[`xishe:kill:${o}`];
            await g.transformDeputy(o);
          }),
      ],
    },

    // ---------------- Lưu Kỳ ----------------
    {
      id: 'wenji', name: 'Vấn Kế',
      desc: 'Khi bắt đầu giai đoạn ra bài, bạn có thể lệnh 1 người khác giao cho bạn 1 lá ngửa mặt: nếu họ cùng thế lực với bạn hoặc không có thế lực, '
        + 'lượt này bạn sử dụng lá này không giới hạn khoảng cách và số lần và không thể hưởng ứng; nếu họ thế lực xác định khác bạn, bạn giao cho họ '
        + '1 lá bài khác ngửa mặt. (Đơn giản hóa: lá Sát nhận được cho thêm 1 lần dùng Sát nhưng vẫn tính khoảng cách.)',
      blockResponse: (g, o, seat, _accept, _src, ctx) => {
        const a = store(g)[`wenji:${o}`];
        if (!a || a.turn !== g.state.turnCount || seat === o || !g.state.processing.includes(a.id) || !ctx) return false;
        if (ctx.kind === 'slash') return ctx.source === o && ctx.card.id === a.id;
        if (ctx.kind === 'aoe' || ctx.kind === 'nullify') return ctx.user === o;
        if (ctx.kind === 'duel') return ctx.opponent === o;
        return false;
      },
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && others(g, o, (s) => allCards(g, s).length > 0).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Vấn Kế: ai giao bài cho bạn', others(g, o, (s) => allCards(g, s).length > 0), 1, 1, 'ally');
            if (t === undefined) return;
            const [id] = await g.chooseCards(t, `Vấn Kế: giao 1 lá (ngửa mặt) cho ${name(g, o)}`, allCards(g, t), 1, 1);
            if (id === undefined) return;
            await give(g, t, o, [id]);
            g.say(`${name(g, t)} giao ${label(g, id)} cho ${name(g, o)}.`);
            if (g.shownKingdom(t) === null || g.isSameFaction(t, o)) {
              store(g)[`wenji:${o}`] = { turn: g.state.turnCount, id };
              if (g.cardCountsAs(o, g.card(id)).includes('sha')) {
                g.player(o).flags.turn_extraSlash = (g.player(o).flags.turn_extraSlash ?? 0) + 1;
              }
            } else {
              const back = hand(g, o).filter((x) => x !== id);
              if (back.length) {
                const [b] = await g.chooseCards(o, `Vấn Kế: giao lại cho ${name(g, t)} 1 lá khác (ngửa mặt)`, back, 1, 1);
                await give(g, o, t, [b]);
                g.say(`${name(g, o)} giao ${label(g, b)} cho ${name(g, t)}.`);
              }
            }
          }),
      ],
    },
    {
      id: 'tunjiang', name: 'Đồn Giang',
      desc: 'Khi bắt đầu giai đoạn kết thúc, nếu bạn trong giai đoạn ra bài đã sử dụng ít nhất 1 lá và không chỉ định người khác làm mục tiêu, '
        + 'bạn có thể rút X lá (X là số thế lực trên bàn chơi).',
      triggers: [
        observe('cardUsed', (g, ctx, o) => {
          if (ctx.seat !== o || g.state.currentSeat !== o) return;
          const hitsOthers = ctx.targets.some((t) => t !== o) || g.autoTargetsOf(o, ctx.as).some((t) => t !== o);
          if (hitsOthers) store(g)[`tunjiang:${o}`] = g.state.turnCount;
        }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && (g.player(o).flags.stat_usedPlay ?? 0) > 0
          && store(g)[`tunjiang:${o}`] !== g.state.turnCount && g.revealedFactionCount() > 0,
          async (g, _ctx, o) => { await g.draw(o, g.revealedFactionCount()); }),
      ],
    },
  ],
};

/** Các chất đã dùng cho Loạn Kích trong lượt này. */
function luanjiSuits(g, s) {
  const rec = store(g)[`luanji:suits:${s}`];
  return rec?.turn === g.state.turnCount ? rec.suits : [];
}

/** Đã mở tất cả tướng (Khuynh Thành). */
function qingchengOk(g, t) {
  const h = g.hero(t);
  return ['main', 'deputy'].every((w) => h[w].revealed) && ['main', 'deputy'].some((w) => !h[w].removed);
}

async function qingchengHide(g, s, t) {
  const h = g.hero(t);
  const opts = ['main', 'deputy'].filter((w) => !h[w].removed && h[w].revealed);
  if (!opts.length) return;
  const i = opts.length > 1 ? await g.choose(s, `Khuynh Thành: úp tướng nào của ${name(g, t)}`, opts.map((w) => g.generalName(h[w].generalId))) : 0;
  g.hideGeneral(t, opts[i]);
}

/** Thế lực của `t` (đã xác định) khác với thế lực của `o` (kể cả khi `o` còn úp tướng: tính theo thế lực thật). */
function wouldDiffer(g, t, o) {
  const kt = g.shownKingdom(t);
  if (kt === null) return false;
  const ko = g.shownKingdom(o) ?? g.realKingdom(o);
  return kt === 'careerist' || ko === 'careerist' || kt !== ko;
}

/** Lá có thể đặt làm Huyễn (không trùng chất với Huyễn đã có). */
function huanCandidates(g, o) {
  const suits = new Set(g.player(o).special.map((id) => g.card(id).suit));
  return allCards(g, o).filter((id) => !suits.has(g.card(id).suit));
}

function qianhuanHit(g, o, target, card) {
  const a = store(g)[`qianhuan:cancel:${o}`];
  return !!a && a.target === target && a.cardId === card.id;
}

/** Đấu điểm của Phong Lược: thắng thì người kia giao `n` lá trong vùng chơi, thua thì giao cho họ 1 lá. */
async function fenglveDuel(g, s, t, n) {
  const r = await pindian(g, s, t, 'Phong Lược');
  if (!r) return;
  if (r.win) {
    const pool = allCards(g, t, true);
    const k = Math.min(n, pool.length);
    if (!k) return;
    const ids = await g.chooseCards(t, `Phong Lược: giao ${k} lá cho ${name(g, s)}`, pool, k, k);
    await give(g, t, s, ids);
  } else if (allCards(g, s).length && g.player(t).alive) {
    const [id] = await g.chooseCards(s, `Phong Lược: giao 1 lá cho ${name(g, t)}`, allCards(g, s), 1, 1);
    if (id !== undefined) await give(g, s, t, [id]);
  }
}
