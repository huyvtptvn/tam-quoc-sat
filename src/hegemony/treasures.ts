// ============================================================
// Bảo vật (ô trang bị thứ 5): Ngọc Tỷ, Mộc Ngưu Lưu Mã, Định Lan Dạ Minh Châu.
// Mỗi bảo vật trao một kỹ năng cho người đang lắp (qua EQUIP_SKILLS).
// Luật theo bản Quốc Chiến (QSanguosha-For-Hegemony), có ghi chú chỗ đơn giản hóa.
// ============================================================
import type { Game } from '../core/game.js';
import type { HegemonyGame } from './game.js';
import { getGeneral } from './generals.js';
import { discardOwnCards, EQUIP_SKILLS, SKILLS, type AnyTrigger, type SkillTrigger } from './skills.js';
import type { EventName } from '../core/events.js';

const on = <K extends EventName>(t: SkillTrigger<K>) => t as unknown as AnyTrigger;
const nameOf = (g: Game, s: number) => g.player(s).name;

// ------------------------------------------------------------ Mộc Ngưu Lưu Mã

/** Tối đa số lá đặt dưới Mộc Ngưu Lưu Mã. */
export const MUNIU_MAX = 5;

/** Các lá đang nằm dưới Mộc Ngưu (lưu theo ván). Lá nằm trong khu vực riêng (special) của người lắp. */
const MUNIU = new WeakMap<Game, Set<number>>();
function tagSet(g: Game): Set<number> {
  let s = MUNIU.get(g);
  if (!s) MUNIU.set(g, (s = new Set()));
  return s;
}

/** Các lá dưới Mộc Ngưu của `seat`. */
export function muniuPile(g: Game, seat: number): number[] {
  const tags = tagSet(g);
  return g.player(seat).special.filter((id) => tags.has(id));
}


/** Lấy 1 lá dưới Mộc Ngưu lên tay (để dùng/đánh như bài trên tay). */
async function pullFromMuniu(g: Game, seat: number, fit: number[], prompt: string, optional: boolean): Promise<number | null> {
  if (!fit.length) return null;
  const [id] = await g.chooseCards(seat, prompt, fit, optional ? 0 : 1, 1, true);
  if (id === undefined) return null;
  tagSet(g).delete(id);
  await g.moveCards([id], { kind: 'special', seat }, { kind: 'hand', seat }, 'muniu');
  g.say(`${nameOf(g, seat)} lấy 1 lá từ Mộc Ngưu Lưu Mã.`);
  return id;
}

/**
 * Khi Mộc Ngưu rời khu vực trang bị mà KHÔNG sang khu vực trang bị người khác: các lá bên dưới vào chồng bỏ.
 * Sang khu vực trang bị người khác (kỹ năng của Mộc Ngưu, Cuồng Phủ, Điều Độ...): các lá đi theo.
 */
export function installTreasures(g: HegemonyGame): void {
  g.bus.on('cardsMoved', async (ctx) => {
    if (ctx.from.kind !== 'equip' || ctx.from.slot !== 'treasure') return;
    if (!ctx.cardIds.some((id) => g.card(id).name === 'muniu')) return;
    const from = ctx.from.seat;
    const pile = muniuPile(g, from);
    if (!pile.length) return;
    if (ctx.to.kind === 'equip' && ctx.to.seat !== from) {
      await g.moveCards(pile, { kind: 'special', seat: from }, { kind: 'special', seat: ctx.to.seat }, 'muniu');
      return;
    }
    for (const id of pile) tagSet(g).delete(id);
    await g.moveCards(pile, { kind: 'special', seat: from }, { kind: 'discard' }, 'muniu');
    g.say(`Các lá dưới Mộc Ngưu Lưu Mã của ${nameOf(g, from)} vào chồng bỏ.`);
  });
}

// ------------------------------------------------------------ Kỹ năng của bảo vật

SKILLS.yuxi = {
  id: 'yuxi',
  name: 'Ngọc Tỷ',
  desc: 'Bảo vật. Tỏa định, khi bạn đã có thế lực: thế lực của bạn là đại thế lực duy nhất (thế lực khác là tiểu thế lực); '
    + 'giai đoạn bốc bài bốc thêm 1 lá; đầu giai đoạn ra bài, bạn coi như dùng một lá Tri Bỉ Tri Kỷ.',
  triggers: [
    on({
      event: 'drawPhase', compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && g.isRevealedAny(owner),
      run: (g, ctx) => { ctx.count += 1; g.say(`Ngọc Tỷ: ${nameOf(g, ctx.seat)} bốc thêm 1 lá.`); },
    }),
    on({
      event: 'phaseStart', compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && ctx.phase === 'play' && g.isRevealedAny(owner) && g.targetsAs(owner, 'zhiji').length > 0,
      run: async (g, _ctx, owner) => {
        const [t] = await g.chooseTargets(owner, 'Ngọc Tỷ: coi như dùng Tri Kỷ Tri Bỉ — chọn mục tiêu', g.targetsAs(owner, 'zhiji'), 1, 1, 'enemy');
        if (t !== undefined) await g.useCardAs(owner, 'zhiji', [t], [], { label: 'Ngọc Tỷ' });
      },
    }),
  ],
};

const canPut = (g: Game, seat: number) =>
  !g.player(seat).flags.muniu && g.player(seat).hand.length > 0 && muniuPile(g, seat).length < MUNIU_MAX;

SKILLS.muniu = {
  id: 'muniu',
  name: 'Mộc Ngưu Lưu Mã',
  desc: `Bảo vật. Mỗi giai đoạn ra bài một lần, bạn có thể đặt 1 lá trên tay xuống dưới Mộc Ngưu (tối đa ${MUNIU_MAX} lá), `
    + 'rồi có thể chuyển Mộc Ngưu sang ô bảo vật trống của người khác (các lá đi theo). '
    + 'Bạn có thể dùng hoặc đánh các lá dưới Mộc Ngưu như bài trên tay (game lấy lá đó lên tay ngay trước khi dùng).',
  active: {
    cards: 'one',
    target: 'none',
    available: canPut,
    run: async (g, seat, [id]) => {
      const p = g.player(seat);
      p.flags.muniu = 1;
      tagSet(g).add(id);
      await g.moveCards([id], { kind: 'hand', seat }, { kind: 'special', seat }, 'muniu');
      g.say(`${p.name} đặt 1 lá xuống Mộc Ngưu Lưu Mã (${muniuPile(g, seat).length}/${MUNIU_MAX}).`);
      const cands = g.alivePlayers().map((x) => x.seat).filter((s) => s !== seat && !g.equipOf(s, 'treasure'));
      const [to] = await g.chooseTargets(seat, 'Mộc Ngưu: chuyển Mộc Ngưu sang người khác? (bỏ qua để giữ)', cands, 0, 1, 'ally');
      const ox = p.equips.treasure[0];
      if (to === undefined || ox === undefined) return;
      await g.moveCards([ox], { kind: 'equip', seat, slot: 'treasure' }, { kind: 'equip', seat: to, slot: 'treasure' }, 'muniu');
      g.say(`${p.name} chuyển Mộc Ngưu Lưu Mã cho ${nameOf(g, to)}.`);
    },
  },
  triggers: [
    // Cần đánh một lá (Thiểm, Sát...): có thể lấy lá phù hợp từ Mộc Ngưu
    on({
      event: 'beforeRespond',
      can: (g, ctx, owner) => ctx.seat === owner
        && muniuPile(g, owner).some((id) => ctx.accept.some((n) => g.cardCountsAs(owner, g.card(id)).includes(n))),
      run: async (g, ctx, owner) => {
        const fit = muniuPile(g, owner).filter((id) => ctx.accept.some((n) => g.cardCountsAs(owner, g.card(id)).includes(n)));
        await pullFromMuniu(g, owner, fit, 'Mộc Ngưu: lấy lá nào lên tay để đánh?', true);
      },
    }),
    // Có người hấp hối: có thể lấy Đào (hoặc Rượu nếu chính mình hấp hối) từ Mộc Ngưu
    on({
      event: 'dying',
      can: (g, ctx, owner) => muniuPile(g, owner).some((id) => {
        const n = g.cardCountsAs(owner, g.card(id));
        return n.includes('tao') || (ctx.seat === owner && n.includes('jiu'));
      }),
      run: async (g, ctx, owner) => {
        const fit = muniuPile(g, owner).filter((id) => {
          const n = g.cardCountsAs(owner, g.card(id));
          return n.includes('tao') || (ctx.seat === owner && n.includes('jiu'));
        });
        await pullFromMuniu(g, owner, fit, `Mộc Ngưu: ${nameOf(g, ctx.seat)} hấp hối — lấy lá nào lên tay để cứu?`, true);
      },
    }),
  ],
};

/** Giai đoạn ra bài: lấy 1 lá dưới Mộc Ngưu lên tay để dùng (Sát, cẩm nang, trang bị...). */
SKILLS.muniu_lay = {
  id: 'muniu_lay',
  name: 'Mộc Ngưu: lấy bài',
  desc: 'Lấy 1 lá dưới Mộc Ngưu Lưu Mã lên tay để dùng ngay.',
  active: {
    cards: 'none',
    target: 'none',
    available: (g, seat) => muniuPile(g, seat).length > 0,
    run: async (g, seat) => { await pullFromMuniu(g, seat, muniuPile(g, seat), 'Mộc Ngưu: chọn lá lấy lên tay', false); },
  },
};

/** Chủ tướng / phó tướng có kỹ năng Chế Hoành (dù đang úp). */
export function ownsZhiheng(g: HegemonyGame, seat: number): boolean {
  const h = g.heroes[seat];
  if (!h) return false;
  return [h.main, h.deputy].some((slot) => !slot.removed && getGeneral(slot.generalId).skills.includes('chehoanh'));
}

SKILLS.mingzhu = {
  id: 'mingzhu',
  name: 'Chế Hoành (Minh Châu)',
  desc: 'Bảo vật Định Lan Dạ Minh Châu. Bạn coi như có Chế Hoành (bỏ tối đa số lá bằng máu tối đa rồi bốc lại bấy nhiêu). '
    + 'Nếu tướng của bạn đã có Chế Hoành thì Chế Hoành không còn giới hạn số lá.',
  active: {
    cards: 'any',
    target: 'none',
    minCards: 1,
    equipCards: true,
    available: (g, seat) => !ownsZhiheng(g as HegemonyGame, seat) && !g.player(seat).flags.chehoanh && g.cardCount(seat) > 0,
    checkCards: (g, seat, ids) => (ids.length <= g.player(seat).maxHp ? null : `Chỉ được bỏ tối đa ${g.player(seat).maxHp} lá`),
    run: async (g, seat, cardIds) => {
      g.player(seat).flags.chehoanh = 1;
      await discardOwnCards(g as HegemonyGame, seat, cardIds, 'chehoanh');
      await g.draw(seat, cardIds.length);
    },
  },
};

EQUIP_SKILLS.yuxi = 'yuxi';
EQUIP_SKILLS.muniu = 'muniu';
EQUIP_SKILLS['muniu#2'] = 'muniu_lay';
EQUIP_SKILLS.mingzhu = 'mingzhu';
