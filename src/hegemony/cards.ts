// ============================================================
// Cẩm nang riêng của Quốc Chiến (cần khái niệm thế lực và tướng úp).
// Được đăng ký vào TRICK_DEFS khi import module này.
// ============================================================
import { cardLabel } from '../core/cards.js';
import type { Game } from '../core/game.js';
import { registerTrick } from '../core/tricks.js';
import type { HegemonyGame } from './game.js';
import { getGeneral } from './generals.js';

const hg = (g: Game) => g as HegemonyGame;
const name = (g: Game, seat: number) => g.player(seat).name;

// Tri Kỷ Tri Bỉ: xem bài trên tay hoặc 1 tướng úp của người khác. Có thể trùng chú.
registerTrick({
  name: 'zhiji',
  targeting: 'one', min: 1, max: 1, recast: true, harmful: true,
  validTarget: (g, user, t) => {
    if (t === user) return false;
    const h = hg(g).heroes[t];
    const hidden = !!h && (!h.main.revealed || !h.deputy.revealed);
    return g.player(t).hand.length > 0 || hidden;
  },
  effect: async (g, user, t) => {
    const h = hg(g).heroes[t];
    const options: { label: string; run: () => void }[] = [];
    if (g.player(t).hand.length > 0) {
      options.push({
        label: 'Xem bài trên tay',
        run: () => g.tell(user, `Bài trên tay của ${name(g, t)}: ${g.player(t).hand.map((id) => cardLabel(g.card(id))).join(', ')}.`),
      });
    }
    for (const which of ['main', 'deputy'] as const) {
      const slot = h?.[which];
      if (slot && !slot.revealed) {
        options.push({
          label: which === 'main' ? 'Xem chủ tướng đang úp' : 'Xem phó tướng đang úp',
          run: () => {
            hg(g).learnGeneral(user, slot.generalId);
            g.tell(user, `${which === 'main' ? 'Chủ tướng' : 'Phó tướng'} của ${name(g, t)} là ${getGeneral(slot.generalId).name}.`);
          },
        });
      }
    }
    if (options.length === 0) return;
    const i = options.length === 1 ? 0 : await g.choose(user, `Tri Kỷ Tri Bỉ: xem gì của ${name(g, t)}?`, options.map((o) => o.label));
    options[i].run();
    g.say(`${name(g, user)} đã xem thông tin của ${name(g, t)}.`);
  },
});

// Viễn Giao Cận Công: chọn một người khác phe (cả hai đã lộ). Họ bốc 1, bạn bốc 3.
registerTrick({
  name: 'yuanjiao',
  targeting: 'one', min: 1, max: 1, harmful: false,
  validTarget: (g, user, t) => t !== user && hg(g).isDifferentFaction(user, t),
  effect: async (g, user, t) => {
    await g.draw(t, 1);
    await g.draw(user, 3);
  },
});

// Dĩ Dật Đãi Lao: bạn và mọi người cùng phe với bạn mỗi người bốc 2 lá rồi bỏ 2 lá.
registerTrick({
  name: 'yiyi',
  targeting: 'custom', harmful: false,
  autoTargets: (g, user) => g.aliveSeatsFrom(user).filter((s) => s === user || hg(g).isSameFaction(user, s)),
  effect: async (g, _user, t) => {
    await g.draw(t, 2);
    await g.forceDiscard(t, 2, 'yiyi');
  },
});
