// ============================================================
// Gói tướng SP (nhóm C1): Liêu Hóa, Gia Cát Cẩn, Toàn Tông, Quách Hoài, Dương Tu, Tổ Mậu,
// Phục Hoàn, Trần Đáo, Điền Dự, Hoa Hùng, Lưu Phu Nhân, Y Tịch.
// ============================================================
import {
  allCards, chooseOwn, discardFrom, discardOwn, give, hand, inMyPlay, isRed, label, limitedUsed, markLimited, name,
  observe, on, oncePerTurn, others, slotOf, store, usedThisTurn, zoneOf, SLOTS,
} from './lib/tro-giup.mjs';

// ---------- Hàm riêng của gói ----------

/**
 * Lời khuyên cho bot: kỹ năng tính trong `can` xem có nên kích hoạt không (bot chỉ thấy view, không thấy ngữ cảnh sự kiện).
 * Hàm bot.confirm đọc lại ngay sau đó.
 */
const ADVICE = new Map();
const advise = (key, seat, val) => { ADVICE.set(`${key}:${seat}`, !!val); };
const advised = (key) => (v) => ADVICE.get(`${key}:${v.me}`) === true;

const sameOrAlly = (g, o, s) => s === o || g.isSameFaction(o, s);
const equipsOf = (g, s) => SLOTS.flatMap((sl) => g.player(s).equips[sl]);
const isBlackCard = (c) => c.suit === 'spade' || c.suit === 'club';
const anyDying = (g) => g.alivePlayers().some((p) => p.hp <= 0);

/** Kết quả phán định "tốt" cho người bị phán định, theo lý do phán định (để bot/Hoãn Thích chọn lá). */
const JUDGE_GOOD = {
  'Lạc Bất Tư Thục': (c) => c.suit === 'heart',
  'Binh Lương Thốn Đoạn': (c) => c.suit === 'club',
  'Thiểm Điện': (c) => !(c.suit === 'spade' && c.rank >= 2 && c.rank <= 9),
  'Bát Quái Trận': (c) => isRed(c),
};

// ---------- [Thưởng] của Toàn Tông ----------
const shang = (g) => (store(g).zhaofuShang ??= {});
const shangOthers = (g, o) => Object.entries(shang(g)).reduce((n, [s, k]) => n + (Number(s) !== o && g.player(Number(s)).alive ? k : 0), 0);

/** Toàn Tông "xem như dùng" lá `as`: các mục tiêu có thể chọn, hoặc 'auto' nếu lá tự chọn mục tiêu, hoặc null nếu không dùng được. */
function zhaofuSpec(g, o, as) {
  const info = g.cardInfo(as);
  if (!info) return null;
  if (as === 'sha') { const t = g.targetsAs(o, 'sha'); return t.length ? { targets: t, min: 1, max: 1, aim: 'enemy' } : null; }
  if (as === 'tao') return g.player(o).hp < g.player(o).maxHp ? 'self' : null;
  if (as === 'jiu') return g.player(o).flags.jiuUsed ? null : 'self';
  if (info.type !== 'trick') return null;
  const def = g.trickDef(as);
  if (!def || as === 'wuxie' || as === 'wuxie_guo') return null;
  if (def.targeting === 'one') {
    const t = g.targetsAs(o, as);
    const min = def.min ?? 1;
    return t.length >= min ? { targets: t, min, max: Math.min(def.max ?? 1, t.length), aim: def.harmful ? 'enemy' : 'ally' } : null;
  }
  return 'auto';
}

// ---------- [Trách] của Tổ Mậu, [Kim] của Điền Dự ----------
const trachSet = (g, o) => (store(g)[`trach:${o}`] ??= new Set());
const trach = (g, o) => g.player(o).special.filter((id) => trachSet(g, o).has(id));
const kimSet = (g, o) => (store(g)[`kim:${o}`] ??= new Set());
const kim = (g, o) => hand(g, o).filter((id) => kimSet(g, o).has(id));

// ---------- Chấn Tập ----------
function zhenxiCards(g, o, t) {
  const has = (n) => g.player(t).judgeArea.some((x) => g.delayedName(x) === n);
  return allCards(g, o).filter((id) => {
    const c = g.card(id);
    if (c.type === 'trick' || c.type === 'delayed') return false;
    if (hand(g, o).includes(id) && g.cardBlocked(o, c)) return false;
    return (c.suit === 'spade' && !has('bingliang')) || (c.suit === 'diamond' && !has('lebu'));
  });
}
async function zhenxiPlace(g, o, t) {
  const ids = zhenxiCards(g, o, t);
  if (!ids.length) return;
  const [id] = await g.chooseCards(o, `Chấn Tập: chọn lá ♠ (Binh Lương) hoặc ♦ (Lạc Bất) đặt lên ${name(g, t)}`, ids, 1, 1);
  const z = zoneOf(g, o, id);
  if (!z) return;
  const as = g.card(id).suit === 'spade' ? 'bingliang' : 'lebu';
  await g.moveCards([id], z, { kind: 'judge', seat: t }, 'delayed');
  g.markDelayedAs(id, as);
  g.say(`${name(g, o)} dùng ${g.labelAs(g.card(id), as)} lên ${name(g, t)} (Chấn Tập).`);
  await g.bus.emit('cardUsed', { seat: o, card: g.card(id), as, targets: [t] });
}
const hasHiddenGeneral = (g, t) => ['main', 'deputy'].some((w) => !g.hero(t)[w].revealed && !g.hero(t)[w].removed);
const bothRevealed = (g, o) => g.hero(o).main.revealed && g.hero(o).deputy.revealed;

// ---------- Kỹ Cung: kỹ năng "không phân loại" ----------
const LOCKED_FIELDS = ['slashLimit', 'slashImmune', 'blockSave', 'rangeBonus', 'defenseBonus', 'handLimitBonus', 'restrictTarget',
  'virtualArmor', 'offenseBonus', 'factionSizeBonus', 'slashBonus', 'blockReveal', 'trickNoDistance'];
function plainSkill(s) {
  if (!s || s.position) return false;
  if (/(Tỏa định|Hạn định|Trận pháp|Quân chủ|Chủ tướng kỹ|Phó tướng kỹ|Giác tỉnh)/i.test(s.desc ?? '')) return false;
  if ((s.triggers ?? []).some((t) => t.compulsory)) return false;
  if (LOCKED_FIELDS.some((f) => s[f])) return false;
  return !!(s.active || s.convert || (s.triggers ?? []).length);
}

// Lý do di chuyển bài là do dùng / đánh ra (Định Khoa không tính)
const USE_REASONS = new Set(['use', 'respond', 'save', 'delayed', 'equip', 'recast', 'death', 'deal', 'reshuffle', 'mulligan', 'replace']);

export default {
  skills: [
    // ================= Liêu Hóa =================
    {
      id: 'dangxian', name: 'Đương Tiên',
      desc: 'Tỏa định kỹ: Sau khi bạn mở tướng này lần đầu tiên, bạn nhận 1 tiêu ký [Tiên Khu]. Sau khi bắt đầu lượt, bạn nhận 1 giai đoạn ra bài.'
        + ' (Đơn giản hóa: kỹ năng "mỗi giai đoạn ra bài một lần" dùng chung cờ cho cả giai đoạn thêm; số lần Sát được tính lại riêng.)',
      triggers: [
        on('generalRevealed', (g, ctx, o) => ctx.seat === o && ctx.generalId === 'liaohua' && !store(g)[`dangxian:${o}`],
          (g, _ctx, o) => {
            store(g)[`dangxian:${o}`] = 1;
            g.hero(o).marks.pioneer++;
            g.say(`${name(g, o)} nhận 1 ký hiệu Tiên Khu (Đương Tiên).`);
          }, { compulsory: true }),
        on('turnStart', (g, ctx, o) => ctx.seat === o && g.player(o).alive, async (g, _ctx, o) => {
          await g.runExtraPhase(o, 'play');
          const f = g.player(o).flags;
          f.shaUsed = 0; f.turn_transferUsed = 0; // giai đoạn ra bài chính vẫn được Sát / Hợp Tung như thường
        }, { compulsory: true }),
      ],
    },

    // ================= Gia Cát Cẩn =================
    {
      id: 'huanshi', name: 'Hoãn Thích',
      desc: 'Khi phán xét của người cùng thế lực với bạn (kể cả bạn) có hiệu lực, bạn có thể đánh ra 1 lá (trên tay hoặc trang bị) để thay thế kết quả phán xét đó.',
      bot: { confirm: advised('huanshi') },
      triggers: [
        on('judged', (g, ctx, o) => {
          if (!sameOrAlly(g, o, ctx.seat) || !g.state.processing.includes(ctx.card.id)) return false;
          const ids = allCards(g, o).filter((id) => !(hand(g, o).includes(id) && g.cardBlocked(o, g.card(id))));
          if (!ids.length) return false;
          const good = JUDGE_GOOD[ctx.reason];
          advise('huanshi', o, good && !good(ctx.card) && ids.some((id) => good(g.card(id))));
          return true;
        }, async (g, ctx, o) => {
          const good = JUDGE_GOOD[ctx.reason];
          const all = allCards(g, o).filter((id) => !(hand(g, o).includes(id) && g.cardBlocked(o, g.card(id))));
          const better = good ? all.filter((id) => good(g.card(id))) : [];
          const ids = better.length ? better : all;
          const [id] = await g.chooseCards(o, `Hoãn Thích: đánh ra 1 lá thay cho lá phán định ${label(g, ctx.card.id)}`, ids, 1, 1);
          const z = id === undefined ? null : zoneOf(g, o, id);
          if (!z) return;
          const old = ctx.card;
          await g.moveCards([old.id], { kind: 'processing' }, { kind: 'discard' }, 'judge');
          await g.moveCards([id], z, { kind: 'processing' }, 'respond');
          ctx.card = g.card(id);
          g.say(`${name(g, o)} đánh ${label(g, id)} thay cho lá phán định ${label(g, old.id)}.`);
          await g.bus.emit('cardResponded', { seat: o, card: ctx.card, as: ctx.card.name, reason: 'huanshi' });
        }),
      ],
    },
    {
      id: 'hongyuan', name: 'Hoằng Viện',
      desc: 'Khi bạn rút bài vì hiệu quả của »Hợp Tung«, bạn có thể lệnh 1 người khác cùng thế lực với bạn rút bài thay bạn. '
        + 'Một lần trong giai đoạn ra bài, bạn có thể mở 1 lá trên tay, lá đó khi ở trên tay bạn trong lượt này xem như có ký hiệu »Hợp Tung«.',
      bot: { use: 'never' },
      triggers: [
        on('transferDraw', (g, ctx, o) => ctx.seat === o && ctx.drawer === o && others(g, o, (s) => g.isSameFaction(o, s)).length > 0,
          async (g, ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Hoằng Viện: chọn người bốc thay bạn', others(g, o, (s) => g.isSameFaction(o, s)), 1, 1, 'ally');
            if (t === undefined) return;
            ctx.drawer = t;
            g.say(`${name(g, t)} bốc bài thay ${name(g, o)} (Hoằng Viện).`);
          }),
      ],
      active: {
        cards: 'one', target: 'none',
        available: (g, s) => inMyPlay(g, s) && !g.player(s).flags.hongyuan && hand(g, s).some((id) => !g.isTransferable(s, id)),
        cardOk: (g, s, id) => !g.isTransferable(s, id),
        run: async (g, s, [id]) => {
          g.player(s).flags.hongyuan = 1;
          g.player(s).flags[`turn_transfer_${id}`] = 1;
          g.say(`${name(g, s)} mở ${label(g, id)}: lá này có dấu Hợp trong lượt này.`);
        },
      },
    },
    {
      id: 'mingzhe', name: 'Minh Triết',
      desc: 'Ngoài lượt của bạn: khi bạn sử dụng/đánh ra lá Đỏ, bạn có thể rút 1 lá; khi bạn mất đi bài trong vùng trang bị, nếu trong đó có lá Đỏ, bạn có thể rút 1 lá.',
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat === o && g.state.currentSeat !== o && isRed(ctx.card) && !(ctx.card.virtual && !ctx.card.rank),
          async (g, _ctx, o) => { await g.draw(o, 1); }),
        on('cardResponded', (g, ctx, o) => ctx.seat === o && g.state.currentSeat !== o && isRed(ctx.card) && ctx.reason !== 'bagua',
          async (g, _ctx, o) => { await g.draw(o, 1); }),
        on('cardsMoved', (g, ctx, o) => g.state.currentSeat !== o && g.player(o).alive && ctx.from.seat === o
          && ((ctx.from.kind === 'hand' && ctx.reason === 'save') || ctx.from.kind === 'equip')
          && ctx.cardIds.some((id) => isRed(g.card(id))),
          async (g, _ctx, o) => { await g.draw(o, 1); }),
      ],
    },

    // ================= Toàn Tông =================
    {
      id: 'qinzhong', name: 'Thân Trùng', position: 'deputy',
      desc: 'Phó tướng kỹ: Sau khi bắt đầu lượt, bạn có thể hoán đổi phó tướng của bạn với 1 người cùng thế lực với bạn.',
      bot: { confirm: false },
      triggers: [
        on('turnStart', (g, ctx, o) => ctx.seat === o && !g.hero(o).deputy.removed
          && others(g, o, (s) => g.isSameFaction(o, s) && !g.hero(s).deputy.removed).length > 0,
          async (g, _ctx, o) => {
            const cands = others(g, o, (s) => g.isSameFaction(o, s) && !g.hero(s).deputy.removed);
            const [t] = await g.chooseTargets(o, 'Thân Trùng: hoán đổi phó tướng với ai', cands, 1, 1, 'ally');
            if (t === undefined) return;
            const a = g.hero(o), b = g.hero(t);
            [a.deputy, b.deputy] = [b.deputy, a.deputy];
            g.say(`${name(g, o)} và ${name(g, t)} hoán đổi phó tướng.`);
            g.tell(o, `Phó tướng mới của bạn: ${g.generalName(a.deputy.generalId)}.`);
            g.tell(t, `Phó tướng mới của bạn: ${g.generalName(b.deputy.generalId)}.`);
          }),
      ],
    },
    {
      id: 'zhaofu', name: 'Chiêu Phụ',
      desc: 'Khi bắt đầu giai đoạn ra bài, nếu tổng số [Thưởng] của tất cả người khác < 3, bạn có thể bỏ 1 lá và chọn 1 người khác, họ tăng 1 [Thưởng]. '
        + 'Sau khi lá cơ bản/công cụ phổ thông do người có [Thưởng] sử dụng kết toán xong, bạn có thể lệnh họ giảm 1 [Thưởng], xem như bạn sử dụng lá đó. '
        + '(Đơn giản hóa: số [Thưởng] chỉ hiện trong nhật ký; lá được tính là "kết toán xong" khi lá thật vào chồng bỏ.)',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && shangOthers(g, o) < 3 && allCards(g, o).length > 0
          && others(g, o).length > 0,
          async (g, _ctx, o) => {
            const [t] = await g.chooseTargets(o, 'Chiêu Phụ: chọn người nhận 1 [Thưởng]', others(g, o), 1, 1, 'ally');
            if (t === undefined) return;
            const ids = await chooseOwn(g, o, 'Chiêu Phụ: bỏ 1 lá', 1, 1);
            if (!ids?.length) return;
            await discardOwn(g, o, ids);
            shang(g)[t] = (shang(g)[t] ?? 0) + 1;
            g.say(`${name(g, t)} nhận 1 [Thưởng] (có ${shang(g)[t]}).`);
          }),
        observe('cardUsed', (g, ctx) => { if (ctx.card.id >= 0) (store(g).zhaofuUser ??= {})[ctx.card.id] = ctx.seat; }),
        on('cardsMoved', (g, ctx, o) => {
          if (g.state.finished || ctx.reason !== 'settle' || ctx.from.kind !== 'processing' || ctx.cardIds.length !== 1) return false;
          const id = ctx.cardIds[0];
          const user = store(g).zhaofuUser?.[id];
          if (user === undefined || user === o || !g.player(user).alive || !(shang(g)[user] > 0)) return false;
          const as = g.usedAsOf(id);
          if (!as || as === 'shan') return false;
          const t = g.cardInfo(as)?.type;
          return (t === 'basic' || t === 'trick') && zhaofuSpec(g, o, as) !== null;
        }, async (g, ctx, o) => {
          const id = ctx.cardIds[0];
          const user = store(g).zhaofuUser[id];
          delete store(g).zhaofuUser[id];
          const as = g.usedAsOf(id);
          shang(g)[user]--;
          g.say(`${name(g, user)} mất 1 [Thưởng] (còn ${shang(g)[user]}).`);
          const spec = zhaofuSpec(g, o, as);
          if (!spec) return;
          if (spec === 'self') { await g.useCardAs(o, as, as === 'tao' ? [o] : [], [], { label: 'Chiêu Phụ' }); return; }
          if (spec === 'auto') { await g.useCardAs(o, as, [], [], { label: 'Chiêu Phụ' }); return; }
          const ts = await g.chooseTargets(o, `Chiêu Phụ: chọn mục tiêu cho ${g.cardInfo(as).label}`, spec.targets, spec.min, spec.max, spec.aim);
          if (ts.length < spec.min) return;
          await g.useCardAs(o, as, ts, [], { label: 'Chiêu Phụ' });
        }),
      ],
    },

    // ================= Quách Hoài =================
    {
      id: 'jingce', name: 'Tinh Sách',
      desc: 'Giai đoạn ra bài, sau khi lá thứ X do bạn sử dụng kết toán xong (X là số máu hiện tại của bạn), nếu không có ai đang hấp hối, '
        + 'bạn có thể yêu cầu 1 người thế lực xác định khác bạn chấp hành 1 [Quân Lệnh]; nếu họ không chấp hành, bạn rút 2 lá. '
        + '(X so với số máu lúc lá kết toán xong, ví dụ dùng Đào hồi máu thì tính theo máu sau khi hồi. '
        + 'Đơn giản hóa: lá "coi như dùng" do kỹ năng tạo ra không được tính thời điểm kết toán.)',
      triggers: [
        // Lá thứ X: trang bị / cẩm nang trì hoãn kết toán ngay; lá khác chờ tới khi vào chồng bỏ rồi mới so với máu lúc đó
        on('cardUsed', (g, ctx, o) => {
          if (ctx.seat !== o || !inMyPlay(g, o)) return false;
          const nth = g.player(o).flags.stat_usedPlay ?? 0;
          const t = g.cardInfo(ctx.as)?.type;
          if (t === 'equip' || t === 'delayed') return nth === g.player(o).hp && !anyDying(g) && jingceTargets(g, o).length > 0;
          if (ctx.card.id >= 0) (store(g)[`jingce:${o}`] ??= {})[ctx.card.id] = nth;
          return false;
        }, (g, _ctx, o) => jingceRun(g, o)),
        on('cardsMoved', (g, ctx, o) => ctx.reason === 'settle' && ctx.from.kind === 'processing' && inMyPlay(g, o)
          && ctx.cardIds.some((id) => store(g)[`jingce:${o}`]?.[id] === g.player(o).hp)
          && !anyDying(g) && jingceTargets(g, o).length > 0,
          (g, _ctx, o) => jingceRun(g, o)),
        observe('cardsMoved', (g, ctx, o) => {
          const m = store(g)[`jingce:${o}`];
          if (m && ctx.from.kind === 'processing') for (const id of ctx.cardIds) delete m[id];
        }),
        observe('phaseEnd', (g, ctx, o) => { if (ctx.seat === o) delete store(g)[`jingce:${o}`]; }),
      ],
    },

    // ================= Dương Tu =================
    {
      id: 'danlao', name: 'Đạm Lạc',
      desc: 'Sau khi bạn trở thành mục tiêu của lá công cụ, nếu số mục tiêu của lá này > 1, bạn có thể rút 1 lá, sau đó lệnh lá này không có hiệu quả với bạn.',
      bot: { confirm: advised('danlao') },
      triggers: [
        observe('cardUsed', (g, ctx) => { (store(g).danlaoN ??= {})[ctx.card.id] = ctx.targets.length; }),
        on('trickTargeted', (g, ctx, o) => {
          if (ctx.target !== o || ctx.cancelled) return false;
          const def = g.trickDef(ctx.name);
          if (!def) return false;
          const n = def.targeting === 'one' ? (store(g).danlaoN?.[ctx.card.id] ?? 1) : g.autoTargetsOf(ctx.user, ctx.name).length;
          if (n <= 1) return false;
          advise('danlao', o, def.harmful !== false);
          return true;
        }, async (g, ctx, o) => {
          await g.draw(o, 1);
          ctx.cancelled = true;
          g.say(`${g.cardInfo(ctx.name).label} không có hiệu quả với ${name(g, o)} (Đạm Lạc).`);
        }),
      ],
    },
    {
      id: 'jilei', name: 'Kê Lặc',
      desc: 'Sau khi bạn nhận sát thương, nếu sát thương này có nguồn, bạn có thể chọn 1 loại bài, lệnh nguồn sát thương trong lượt này không thể sử dụng, '
        + 'đánh ra hoặc bỏ lá trên tay thuộc loại bài này. (Đơn giản hóa: lệnh cấm bỏ bài chỉ áp dụng cho việc bị buộc bỏ bài, ví dụ giai đoạn bỏ bài.)',
      triggers: [
        on('damaged', (g, ctx, o) => ctx.target === o && ctx.source !== null && ctx.source !== o && g.player(ctx.source).alive,
          async (g, ctx, o) => {
            const types = [['basic'], ['trick', 'delayed'], ['equip']];
            const i = await g.choose(o, `Kê Lặc: cấm ${name(g, ctx.source)} dùng/đánh/bỏ loại bài nào trong lượt này`, ['Cơ bản', 'Cẩm nang (công cụ)', 'Trang bị']);
            const f = g.player(ctx.source).flags;
            for (const t of types[i]) { f[`turn_banType_${t}`] = 1; f[`turn_banDiscardType_${t}`] = 1; }
            g.say(`${name(g, ctx.source)} không thể dùng, đánh ra hay bỏ lá ${['cơ bản', 'cẩm nang', 'trang bị'][i]} trên tay trong lượt này.`);
          }),
      ],
    },

    // ================= Tổ Mậu =================
    {
      id: 'yinbingx', name: 'Dẫn Binh',
      desc: 'Khi bắt đầu giai đoạn kết thúc, bạn có thể đặt tùy ý lá phi cơ bản (trên tay hoặc trang bị) lên tướng này, gọi là [Trách]. '
        + 'Sau khi bạn nhận sát thương từ [Sát] hoặc [Quyết Đấu], bạn bỏ 1 [Trách].',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'end' && allCards(g, o).some((id) => g.card(id).type !== 'basic'),
          async (g, _ctx, o) => {
            const ids = await chooseOwn(g, o, 'Dẫn Binh: đặt lá phi cơ bản làm [Trách]', 1, 99, { filter: (c) => c.type !== 'basic' });
            for (const id of ids ?? []) {
              const z = zoneOf(g, o, id);
              if (!z) continue;
              await g.moveCards([id], z, { kind: 'special', seat: o }, 'yinbing');
              trachSet(g, o).add(id);
            }
            if (ids?.length) g.say(`${name(g, o)} đặt ${ids.map((id) => label(g, id)).join(', ')} làm [Trách] (có ${trach(g, o).length}).`);
          }),
        on('damaged', (g, ctx, o) => {
          if (ctx.target !== o || !trach(g, o).length || !ctx.card) return false;
          const as = ctx.cardAs ?? g.usedAsOf(ctx.card.id) ?? ctx.card.name;
          return as === 'sha' || as === 'juedou';
        }, async (g, _ctx, o) => {
          const list = trach(g, o);
          const [id] = await g.chooseCards(o, 'Dẫn Binh: bỏ 1 [Trách]', list, 1, 1, true);
          await g.moveCards([id], { kind: 'special', seat: o }, { kind: 'discard' }, 'yinbing');
          trachSet(g, o).delete(id);
          g.say(`${name(g, o)} bỏ 1 [Trách] ${label(g, id)}.`);
        }, { compulsory: true }),
      ],
    },
    {
      id: 'juedi', name: 'Tuyệt Địa',
      desc: 'Tỏa định kỹ: Khi bắt đầu giai đoạn chuẩn bị, nếu bạn có [Trách], bạn chọn 1 mục: 1. Bỏ tất cả [Trách], bổ sung bài trên tay tới giới hạn máu; '
        + '2. Giao tất cả [Trách] cho 1 người khác có số máu ≤ bạn, lệnh họ hồi 1 máu và rút bài bằng số [Trách] đã giao.',
      triggers: [
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'start' && trach(g, o).length > 0, async (g, _ctx, o) => {
          const list = trach(g, o);
          const cands = others(g, o, (s) => g.player(s).hp <= g.player(o).hp);
          const opts = ['Bỏ hết [Trách], bổ sung bài trên tay tới giới hạn máu'];
          if (cands.length) opts.push('Giao hết [Trách] cho 1 người khác có máu ≤ bạn: họ hồi 1 máu và bốc bằng số lá đã giao');
          const i = opts.length > 1 ? await g.choose(o, 'Tuyệt Địa: chọn 1 mục', opts) : 0;
          for (const id of list) trachSet(g, o).delete(id);
          if (i === 0) {
            await g.moveCards(list, { kind: 'special', seat: o }, { kind: 'discard' }, 'juedi');
            g.say(`${name(g, o)} bỏ hết [Trách].`);
            const n = g.player(o).maxHp - hand(g, o).length;
            if (n > 0) await g.draw(o, n);
            return;
          }
          const [t] = await g.chooseTargets(o, 'Tuyệt Địa: giao hết [Trách] cho ai', cands, 1, 1, 'ally');
          await g.moveCards(list, { kind: 'special', seat: o }, { kind: 'hand', seat: t }, 'juedi');
          g.say(`${name(g, o)} giao ${list.length} [Trách] cho ${name(g, t)}.`);
          await g.recover(t, 1, o);
          if (g.player(t).alive) await g.draw(t, list.length);
        }, { compulsory: true }),
      ],
    },

    // ================= Phục Hoàn =================
    {
      id: 'moukui', name: 'Mưu Hội',
      desc: 'Sau khi bạn xác định mục tiêu của [Sát], ứng với mỗi mục tiêu, bạn có thể chọn 1 mục: 1. Rút 1 lá; 2. Bỏ 1 lá của mục tiêu; '
        + 'sau khi [Sát] này bị triệt tiêu bởi [Thiểm] của mục tiêu, họ bỏ 1 lá của bạn.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.source === o && !ctx.cancelled && g.player(ctx.target).alive, async (g, ctx, o) => {
          const t = ctx.target;
          const opts = ['Rút 1 lá'];
          if (allCards(g, t).length) opts.push(`Bỏ 1 lá của ${name(g, t)}`);
          const i = opts.length > 1 ? await g.choose(o, 'Mưu Hội: chọn 1 mục', opts) : 0;
          if (i === 0) await g.draw(o, 1);
          else await discardFrom(g, o, t, `Mưu Hội: bỏ 1 lá của ${name(g, t)}`);
          (store(g).moukui ??= new Set()).add(`${ctx.card.id}:${t}`);
        }),
        on('slashDodged', (g, ctx, o) => ctx.source === o && !!store(g).moukui?.has(`${ctx.card.id}:${ctx.target}`),
          async (g, ctx, o) => {
            store(g).moukui.delete(`${ctx.card.id}:${ctx.target}`);
            if (g.player(ctx.target).alive && allCards(g, o).length) await discardFrom(g, ctx.target, o, `Mưu Hội: bỏ 1 lá của ${name(g, o)}`);
          }, { compulsory: true }),
        observe('slashEnd', (g, ctx) => { store(g).moukui?.delete(`${ctx.card.id}:${ctx.target}`); }),
      ],
    },

    // ================= Trần Đáo =================
    {
      id: 'wanglie', name: 'Vãng Liệt',
      desc: 'Lá đầu tiên bạn sử dụng trong giai đoạn ra bài không giới hạn khoảng cách. Giai đoạn ra bài, khi bạn sử dụng [Sát] hoặc công cụ phổ thông, '
        + 'bạn có thể lệnh cho tất cả mọi người không được hưởng ứng với lá này; nếu làm vậy, bạn không thể sử dụng bài trong giai đoạn này.',
      offenseBonus: (g, o) => (inMyPlay(g, o) && !g.player(o).flags.stat_usedPlay ? 99 : 0),
      trickNoDistance: (g, o) => inMyPlay(g, o) && !g.player(o).flags.stat_usedPlay,
      bot: { confirm: (v) => v.myHand.length <= 1 },
      triggers: [
        on('cardUsed', (g, ctx, o) => ctx.seat === o && inMyPlay(g, o) && ctx.card.id >= 0 && g.state.processing.includes(ctx.card.id)
          && (ctx.as === 'sha' || g.cardInfo(ctx.as)?.type === 'trick'),
          (g, ctx, o) => {
            g.noResponseCard = ctx.card.id;
            const f = g.player(o).flags;
            if (!f.turn_banHand) { f.turn_banHand = 1; f.wanglieBan = 1; }
            g.say(`Không ai được hưởng ứng ${label(g, ctx.card.id)}; ${name(g, o)} không thể dùng bài trong giai đoạn này.`);
          }),
        observe('cardsMoved', (g, ctx) => {
          if (ctx.from.kind === 'processing' && g.noResponseCard !== null && ctx.cardIds.includes(g.noResponseCard)) g.noResponseCard = null;
        }),
        observe('phaseEnd', (g, ctx, o) => {
          const f = g.player(o).flags;
          if (ctx.seat === o && ctx.phase === 'play' && f.wanglieBan) { delete f.turn_banHand; delete f.wanglieBan; }
        }),
      ],
    },
    {
      id: 'dizai', name: 'Địa Tải',
      desc: 'Trận pháp kỹ: Quan hệ vây công: Nếu bạn là người vây công, khi người vây công gây sát thương cho mục tiêu bị vây công của lá [Sát], '
        + 'người vây công còn lại có thể bỏ 1 lá để lệnh sát thương này +1.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => {
          if (ctx.cardAs !== 'sha' || ctx.source === null || ctx.cancelled) return false;
          const b = g.besiegers(ctx.target);
          if (!b || !b.includes(o) || !b.includes(ctx.source)) return false;
          const other = b.find((x) => x !== ctx.source);
          return other !== undefined && allCards(g, other).length > 0;
        }, async (g, ctx, o) => {
          const other = g.besiegers(ctx.target)?.find((x) => x !== ctx.source);
          if (other === undefined) return;
          if (other !== o) {
            const ok = await g.choose(other, `Địa Tải: bỏ 1 lá để sát thương lên ${name(g, ctx.target)} +1?`, ['Bỏ 1 lá: +1 sát thương', 'Không']);
            if (ok !== 0) return;
          }
          const ids = await chooseOwn(g, other, 'Địa Tải: bỏ 1 lá', 1, 1);
          if (!ids?.length) return;
          await discardOwn(g, other, ids);
          ctx.amount += 1;
          g.say(`Sát thương lên ${name(g, ctx.target)} +1 (Địa Tải).`);
        }),
      ],
    },

    // ================= Điền Dự =================
    {
      id: 'zhenxi', name: 'Chấn Tập',
      desc: 'Sau khi bạn xác định mục tiêu của [Sát], ứng với mỗi mục tiêu, bạn có thể chọn 1 mục: 1. Bỏ 1 lá của họ; '
        + '2. Chuyển hóa sử dụng 1 lá ♠ phi công cụ thành [Binh Lương Thốn Đoạn] hoặc 1 lá ♦ phi công cụ thành [Lạc Bất Tư Thục] không giới hạn khoảng cách với họ. '
        + 'Nếu bạn đã mở 2 tướng và họ có tướng đang úp, bạn có thể chấp hành cả 2 mục với thứ tự tùy ý.',
      triggers: [
        on('slashTargeted', (g, ctx, o) => ctx.source === o && !ctx.cancelled && ctx.target !== o && g.player(ctx.target).alive
          && (allCards(g, ctx.target).length > 0 || zhenxiCards(g, o, ctx.target).length > 0),
          async (g, ctx, o) => {
            const t = ctx.target;
            const canD = allCards(g, t).length > 0, canP = zhenxiCards(g, o, t).length > 0;
            const opts = [];
            if (canD) opts.push(['Bỏ 1 lá của họ', ['d']]);
            if (canP) opts.push(['Đặt Binh Lương / Lạc Bất lên họ', ['p']]);
            if (canD && canP && bothRevealed(g, o) && hasHiddenGeneral(g, t)) {
              opts.push(['Cả hai: bỏ bài trước', ['d', 'p']], ['Cả hai: đặt cẩm nang trước', ['p', 'd']]);
            }
            const i = opts.length > 1 ? await g.choose(o, `Chấn Tập với ${name(g, t)}`, opts.map((x) => x[0])) : 0;
            for (const step of opts[i][1]) {
              if (!g.player(t).alive) break;
              if (step === 'd') await discardFrom(g, o, t, `Chấn Tập: bỏ 1 lá của ${name(g, t)}`);
              else await zhenxiPlace(g, o, t);
            }
          }),
      ],
    },
    {
      id: 'jiansu', name: 'Kiệm Tố', position: 'deputy',
      desc: 'Phó tướng kỹ, giảm 0.5 máu gốc: Khi bạn nhận bài ngoài lượt, bạn có thể gọi những lá này trên tay bạn là [Kim] chừng nào lá đó còn trên tay bạn '
        + '([Kim] công khai). Khi bắt đầu giai đoạn ra bài, bạn có thể bỏ đi tùy ý [Kim], sau đó chọn 1 người đã bị thương có số máu ≤ số [Kim] đã bỏ, lệnh họ hồi 1 máu. '
        + '(Đơn giản hóa: Điền Dự luôn tính 3 cá; [Kim] được công bố trong nhật ký; chọn người hồi máu trước rồi bỏ đủ số [Kim].)',
      triggers: [
        observe('cardsMoved', (g, ctx, o) => {
          if (ctx.from.kind === 'hand' && ctx.from.seat === o) for (const id of ctx.cardIds) kimSet(g, o).delete(id);
        }),
        on('cardsMoved', (g, ctx, o) => ctx.to.kind === 'hand' && ctx.to.seat === o && g.state.currentSeat !== o && ctx.reason !== 'deal'
          && ctx.reason !== 'mulligan' && ctx.cardIds.some((id) => hand(g, o).includes(id)),
          (g, ctx, o) => {
            const ids = ctx.cardIds.filter((id) => hand(g, o).includes(id));
            for (const id of ids) kimSet(g, o).add(id);
            g.say(`${name(g, o)} gọi ${ids.map((id) => label(g, id)).join(', ')} là [Kim] (công khai).`);
          }),
        on('phaseStart', (g, ctx, o) => ctx.seat === o && ctx.phase === 'play' && kim(g, o).length > 0
          && g.alivePlayers().some((p) => p.hp < p.maxHp && p.hp <= kim(g, o).length && (p.seat === o || g.canTarget(o, p.seat))),
          async (g, _ctx, o) => {
            const k = kim(g, o);
            const cands = g.alivePlayers().filter((p) => p.hp < p.maxHp && p.hp <= k.length && (p.seat === o || g.canTarget(o, p.seat))).map((p) => p.seat);
            const [t] = await g.chooseTargets(o, 'Kiệm Tố: chọn người hồi 1 máu', cands, 1, 1, 'ally');
            if (t === undefined) return;
            const need = Math.max(1, g.player(t).hp);
            const ids = await g.chooseCards(o, `Kiệm Tố: bỏ ít nhất ${need} [Kim]`, k, need, k.length);
            if (ids.length < need) return;
            await discardOwn(g, o, ids);
            await g.recover(t, 1, o);
          }),
      ],
    },

    // ================= Hoa Hùng =================
    {
      id: 'yaowu', name: 'Diệu Võ',
      desc: 'Hạn định kỹ: Sau khi bạn gây sát thương, nếu tướng này đang úp, bạn có thể phát động: tăng 2 giới hạn máu, hồi 2 máu. '
        + 'Sau khi bạn trận vong (đã phát động), tất cả người cùng thế lực với bạn mất 1 máu.',
      triggers: [
        on('damageDealt', (g, ctx, o) => {
          if (ctx.source !== o || !g.player(o).alive || limitedUsed(g, o, 'yaowu')) return false;
          const w = slotOf(g, o, 'huaxiong');
          return w !== null && !g.hero(o)[w].revealed;
        }, async (g, _ctx, o) => {
          markLimited(g, o, 'yaowu');
          g.player(o).maxHp += 2;
          g.say(`${name(g, o)} tăng 2 giới hạn máu (${g.player(o).maxHp}).`);
          await g.recover(o, 2, o);
        }),
        on('death', (g, ctx, o) => ctx.seat === o && limitedUsed(g, o, 'yaowu'), async (g, _ctx, o) => {
          for (const p of g.alivePlayers()) {
            if (p.seat !== o && g.isSameFaction(o, p.seat)) await g.loseHp(p.seat, 1);
          }
        }, { compulsory: true }),
      ],
    },
    {
      id: 'shiyong', name: 'Thị Dũng',
      desc: 'Tỏa định kỹ: Khi bạn chịu sát thương từ lá bài: nếu bạn chưa phát động »Diệu Võ« và lá đó không phải màu Đỏ, bạn rút 1 lá; '
        + 'nếu đã phát động »Diệu Võ« và lá đó không phải màu Đen, nguồn sát thương rút 1 lá.',
      triggers: [
        on('damageDealt', (g, ctx, o) => {
          if (ctx.target !== o || !ctx.card) return false;
          if (!limitedUsed(g, o, 'yaowu')) return !isRed(ctx.card);
          return !isBlackCard(ctx.card) && ctx.source !== null && g.player(ctx.source).alive;
        }, async (g, ctx, o) => {
          if (!limitedUsed(g, o, 'yaowu')) await g.draw(o, 1);
          else await g.draw(ctx.source, 1);
        }, { compulsory: true }),
      ],
    },

    // ================= Lưu Phu Nhân =================
    {
      id: 'zhuidu', name: 'Truy Đố',
      desc: 'Một lần trong giai đoạn ra bài, khi bạn gây sát thương, bạn có thể lệnh người nhận sát thương chọn 1 mục: 1. Sát thương này +1; '
        + '2. Nếu họ có lá trong vùng trang bị, bỏ đi tất cả bài trong vùng trang bị. Nếu họ là nữ, bạn có thể bỏ 1 lá, lệnh họ thực hiện cả 2 mục.',
      triggers: [
        on('beforeDamage', (g, ctx, o) => ctx.source === o && ctx.target !== o && !ctx.cancelled && inMyPlay(g, o) && !g.player(o).flags.zhuidu
          && g.player(ctx.target).alive,
          async (g, ctx, o) => {
            g.player(o).flags.zhuidu = 1;
            const t = ctx.target;
            let both = false;
            if (g.isFemale(t) && allCards(g, o).length) {
              const c = await g.choose(o, `Truy Đố: bỏ 1 lá để ${name(g, t)} thực hiện cả 2 mục?`, ['Bỏ 1 lá: cả 2 mục', 'Không']);
              if (c === 0) {
                const ids = await chooseOwn(g, o, 'Truy Đố: bỏ 1 lá', 1, 1);
                if (ids?.length) { await discardOwn(g, o, ids); both = true; }
              }
            }
            const pick = both ? -1 : await g.choose(t, `Truy Đố của ${name(g, o)}: chọn 1 mục`, ['Bỏ tất cả trang bị (nếu có)', 'Sát thương này +1']);
            if (pick !== 1) {
              const eq = equipsOf(g, t);
              if (eq.length) await discardOwn(g, t, eq);
            }
            if (pick !== 0) { ctx.amount += 1; g.say(`Sát thương lên ${name(g, t)} +1 (Truy Đố).`); }
          }),
      ],
    },
    {
      id: 'shigong', name: 'Kỳ Cung',
      desc: 'Hạn định kỹ: Ngoài lượt của bạn, khi bạn tiến vào trạng thái hấp hối, bạn có thể loại bỏ Phó tướng của bạn, sau đó lệnh người đang có lượt chọn 1 mục: '
        + '1. Họ nhận 1 kỹ năng không phân loại từ lá tướng vừa bị loại bỏ, lệnh bạn hồi đầy máu; 2. Lệnh bạn hồi đến 1 máu.',
      triggers: [
        on('dying', (g, ctx, o) => ctx.seat === o && g.state.currentSeat !== o && !limitedUsed(g, o, 'shigong') && !g.hero(o).deputy.removed
          && g.player(o).hp <= 0,
          async (g, _ctx, o) => {
            markLimited(g, o, 'shigong');
            const dep = g.hero(o).deputy;
            const skills = g.skillEntries(o).filter((e) => e.which === 'deputy' && e.slot === dep).map((e) => e.skill).filter(plainSkill);
            await g.removeGeneral(o, 'deputy');
            const cur = g.state.currentSeat;
            const p = g.player(o);
            const opts = [`Lệnh ${name(g, o)} hồi đến 1 máu`];
            if (skills.length && g.player(cur).alive && cur !== o) opts.push(`Nhận 1 kỹ năng của tướng bị loại bỏ, lệnh ${name(g, o)} hồi đầy máu`);
            const i = opts.length > 1 ? await g.choose(cur, 'Kỳ Cung: chọn 1 mục', opts) : 0;
            if (i === 1) {
              const k = skills.length === 1 ? 0 : await g.choose(cur, 'Kỳ Cung: chọn kỹ năng', skills.map((s) => s.name));
              g.grantSkill(cur, skills[k].id);
              await g.recover(o, p.maxHp - p.hp, o);
            } else if (p.hp < 1) {
              await g.recover(o, 1 - p.hp, o);
            }
          }),
      ],
    },

    // ================= Y Tịch =================
    {
      id: 'dingke', name: 'Định Khoa',
      desc: 'Một lần trong lượt của mỗi người, sau khi 1 người cùng thế lực với bạn mất bài ngoài lượt của họ không vì sử dụng/đánh ra, bạn có thể chọn 1 mục: '
        + '1. Giao 1 lá trên tay cho họ; 2. Lệnh người đang có lượt bỏ 1 lá trên tay. Sau đó nếu số [Âm dương ngư] của bạn nhỏ hơn giới hạn máu, bạn nhận 1 [Âm dương ngư].',
      bot: { confirm: advised('dingke') },
      triggers: [
        on('cardsMoved', (g, ctx, o) => {
          const s = ctx.from.seat;
          if (s === undefined || (ctx.from.kind !== 'hand' && ctx.from.kind !== 'equip') || USE_REASONS.has(ctx.reason)) return false;
          if (!g.player(s).alive || s === g.state.currentSeat || !sameOrAlly(g, o, s) || usedThisTurn(g, o, 'dingke')) return false;
          if (ctx.to.kind === 'hand' && ctx.to.seat === s) return false;
          const cur = g.state.currentSeat;
          const giveOk = s !== o && hand(g, o).length > 0;
          const discOk = g.player(cur).alive && hand(g, cur).length > 0;
          advise('dingke', o, giveOk || (discOk && !sameOrAlly(g, o, cur)));
          return giveOk || discOk;
        }, async (g, ctx, o) => {
          oncePerTurn(g, o, 'dingke');
          const s = ctx.from.seat, cur = g.state.currentSeat;
          const opts = [];
          if (s !== o && hand(g, o).length) opts.push(['give', `Giao 1 lá trên tay cho ${name(g, s)}`]);
          if (g.player(cur).alive && hand(g, cur).length) opts.push(['disc', `Lệnh ${name(g, cur)} bỏ 1 lá trên tay`]);
          if (!opts.length) return;
          const i = opts.length > 1 ? await g.choose(o, 'Định Khoa: chọn 1 mục', opts.map((x) => x[1])) : 0;
          if (opts[i][0] === 'give') {
            const [id] = await g.chooseCards(o, `Định Khoa: giao 1 lá cho ${name(g, s)}`, [...hand(g, o)], 1, 1);
            if (id !== undefined) {
              await give(g, o, s, [id]);
              // Cấp Viện: người được giao bài có thể được bốc 1 lá
              if (g.hasSkill(o, 'jiyuan', false) && g.player(s).alive
                && (await g.choose(o, `Cấp Viện: lệnh ${name(g, s)} bốc 1 lá?`, ['Có', 'Không'])) === 0) {
                g.say(`${name(g, o)} kích hoạt Cấp Viện.`);
                await g.draw(s, 1);
              }
            }
          } else {
            await g.forceDiscard(cur, 1, 'dingke');
          }
          const h = g.hero(o);
          if (h.marks.yinyang < g.player(o).maxHp) {
            h.marks.yinyang++;
            g.say(`${name(g, o)} nhận 1 ký hiệu Âm Dương Ngư (Định Khoa).`);
          }
        }),
      ],
    },
    {
      id: 'jiyuan', name: 'Cấp Viện',
      desc: 'Khi có người tiến vào trạng thái hấp hối hoặc sau khi có người được bạn giao bài do phát động »Định Khoa«, bạn có thể lệnh họ rút 1 lá.',
      bot: { confirm: advised('jiyuan') },
      triggers: [
        on('dying', (g, ctx, o) => {
          if (!g.player(ctx.seat).alive) return false;
          advise('jiyuan', o, sameOrAlly(g, o, ctx.seat));
          return true;
        }, async (g, ctx) => { await g.draw(ctx.seat, 1); }),
      ],
    },
  ],
};

// ---------- Tinh Sách ----------
function jingceTargets(g, o) {
  return others(g, o, (s) => g.isRevealedAny(s));
}
async function jingceRun(g, o) {
  const cands = jingceTargets(g, o);
  if (!cands.length) return;
  const [t] = await g.chooseTargets(o, 'Tinh Sách: chọn người chấp hành quân lệnh', cands, 1, 1, 'enemy');
  if (t === undefined) return;
  const order = await g.drawOrder(o);
  const done = await g.askOrder(o, t, order);
  if (!done && g.player(o).alive) await g.draw(o, 2);
}
