// ============================================================
// Gói tướng tiêu chuẩn (thay cho tướng mẫu cũ trong content/generals/vi-du.json):
// Bàng Thống (Liên Hoàn, Niết Bàn), Từ Hoảng (Đoạn Lương), Thái Sử Từ (Thiên Nghĩa).
// Mô tả theo bản Việt hóa QSanguosha-Hegemony (content/import/qsgs-viet.json).
// ============================================================
import { allCards, discardOwn, hand, inMyPlay, limitedUsed, markLimited, name, pindian, zoneOf, SLOTS } from './lib/tro-giup.mjs';

const isBlack = (c) => c.suit === 'spade' || c.suit === 'club';
const isTrick = (c) => c.type === 'trick' || c.type === 'delayed';
const hasBingliang = (g, t) => g.player(t).judgeArea.some((id) => g.delayedName(id) === 'bingliang');

/** Các lá (trên tay hoặc trang bị) Đoạn Lương có thể dùng như Binh Lương Thốn Đoạn. */
function duanliangCards(g, s) {
  return allCards(g, s).filter((id) => {
    const c = g.card(id);
    if (!isBlack(c) || isTrick(c)) return false;
    return !(hand(g, s).includes(id) && g.cardBlocked(s, c));
  });
}

export default {
  skills: [
    // ---------------- Bàng Thống ----------------
    {
      id: 'lianhuan', name: 'Liên Hoàn',
      desc: 'Giai đoạn ra bài, bạn có thể chuyển hóa sử dụng lá TÉP trên tay thành [Thiết Tác Liên Hoàn] hoặc Trùng Chú lá TÉP trên tay.',
      // Chỉ lá trên tay (khi đang dùng, lá đã sang vùng xử lý nên kiểm tra "không phải trang bị")
      convert: (g, s, c) => (c.suit === 'club' && inMyPlay(g, s) && !SLOTS.some((sl) => g.player(s).equips[sl].includes(c.id)) ? ['tiesuo'] : []),
    },
    {
      id: 'niepan', name: 'Niết Bàn',
      desc: 'Hạn định kỹ: Khi bạn trong trạng thái hấp hối, bạn có thể phát động kỹ năng này, thực hiện lần lượt: '
        + 'bạn bỏ toàn bộ bài trong vùng chơi; bạn hồi máu đến 3 và rút 3 lá; bạn loại bỏ trạng thái xích và chồng tướng.',
      triggers: [{
        event: 'dying',
        can: (g, ctx, o) => ctx.seat === o && g.player(o).alive && g.player(o).hp <= 0 && !limitedUsed(g, o, 'niepan'),
        run: async (g, _ctx, o) => {
          markLimited(g, o, 'niepan');
          const p = g.player(o);
          g.say(`${name(g, o)} phát động Niết Bàn.`);
          await discardOwn(g, o, allCards(g, o, true), 'niepan');
          if (p.hp < 3) await g.recover(o, 3 - p.hp, o);
          await g.draw(o, 3);
          if (p.chained) { p.chained = false; g.say(`${name(g, o)} được gỡ xích.`); }
          if (p.faceDown) g.turnOver(o);
        },
      }],
    },

    // ---------------- Từ Hoảng ----------------
    {
      id: 'duanliang', name: 'Đoạn Lương',
      desc: 'Bạn có thể chuyển hóa sử dụng lá Đen không phải Công cụ thành [Binh Lương Thốn Đoạn] không giới hạn khoảng cách; '
        + '▷ Nếu khoảng cách giữa bạn và mục tiêu > 2, bạn không thể phát động kỹ năng này trong giai đoạn này.',
      bot: { use: 'always', target: 'enemy' },
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => inMyPlay(g, s) && !g.player(s).flags.turn_duanliangOff && duanliangCards(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && g.player(t).alive && !hasBingliang(g, t),
        run: async (g, s, _c, [t]) => {
          const ids = duanliangCards(g, s);
          if (!ids.length || hasBingliang(g, t)) return;
          const [id] = await g.chooseCards(s, `Đoạn Lương: chọn lá Đen (không phải công cụ) dùng như Binh Lương Thốn Đoạn lên ${name(g, t)}`, ids, 1, 1);
          const z = id === undefined ? null : zoneOf(g, s, id);
          if (!z) return;
          if (g.distance(s, t) > 2) {
            g.player(s).flags.turn_duanliangOff = 1;
            g.say(`Khoảng cách đến ${name(g, t)} lớn hơn 2: ${name(g, s)} không thể dùng Đoạn Lương nữa trong giai đoạn này.`);
          }
          await g.moveCards([id], z, { kind: 'judge', seat: t }, 'delayed');
          g.markDelayedAs(id, 'bingliang');
          g.say(`${name(g, s)} đặt ${g.labelAs(g.card(id), 'bingliang')} vào khu vực phán định của ${name(g, t)} (Đoạn Lương).`);
          await g.bus.emit('cardUsed', { seat: s, card: g.card(id), as: 'bingliang', targets: [t] });
        },
      },
    },

    // ---------------- Thái Sử Từ ----------------
    {
      id: 'tianyi', name: 'Thiên Nghĩa',
      desc: 'Một lần trong giai đoạn ra bài, bạn có thể đấu điểm với 1 người: nếu bạn thắng: trong lượt này, bạn sử dụng [Sát] không giới hạn khoảng cách; '
        + 'giới hạn sử dụng [Sát] và số mục tiêu của [Sát] +1; nếu bạn không thắng: bạn không thể sử dụng [Sát] trong lượt này.',
      bot: { use: 'always', target: 'enemy' },
      slashNoRange: (g, o) => !!g.player(o).flags.turn_tianyiWin,
      active: {
        cards: 'none', target: 'one',
        available: (g, s) => inMyPlay(g, s) && !g.player(s).flags.turn_tianyiUsed && hand(g, s).length > 0,
        validTarget: (g, s, t) => t !== s && hand(g, t).length > 0,
        run: async (g, s, _c, [t]) => {
          const f = g.player(s).flags;
          f.turn_tianyiUsed = 1;
          const r = await pindian(g, s, t, 'Thiên Nghĩa');
          if (!r) return;
          if (r.win) {
            f.turn_tianyiWin = 1;
            f.turn_extraSlash = (f.turn_extraSlash ?? 0) + 1;
            f.turn_extraSlashTargets = (f.turn_extraSlashTargets ?? 0) + 1;
            g.say(`Thiên Nghĩa: lượt này ${name(g, s)} dùng Sát không giới hạn khoảng cách, thêm 1 lần và thêm 1 mục tiêu.`);
          } else {
            f.turn_banSha = 1;
            g.say(`Thiên Nghĩa: ${name(g, s)} không thể dùng Sát trong lượt này.`);
          }
        },
      },
    },
  ],
};
