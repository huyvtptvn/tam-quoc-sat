// ============================================================
// Hiệu ứng trang bị: cài vào event bus khi tạo ván.
// (Tầm đánh, khoảng cách ngựa, Gia Cát Liên Nỏ, Phương Thiên Họa Kích, Thanh Công Kiếm
//  và Bát Quái Trận nằm trực tiếp trong Game vì chúng là luật tính toán, không phải sự kiện.)
// ============================================================
import { cardLabel, isBlack, isRed } from './cards.js';
import type { Game } from './game.js';
import type { Card } from './types.js';
import { pickCardFrom } from './tricks.js';

async function confirm(g: Game, seat: number, skill: string, prompt: string): Promise<boolean> {
  const res = await g.ask({ type: 'confirm', seat, skill, prompt, reveal: false });
  return res.kind === 'yes';
}

export function installEquipment(g: Game): void {
  const name = (seat: number) => g.player(seat).name;

  // ---------- Thư Hùng Song Cổ Kiếm: Sát người khác giới -> họ bỏ 1 lá trên tay hoặc bạn bốc 1 lá ----------
  g.bus.on('slashTargeted', async (ctx) => {
    const src = ctx.source, t = ctx.target;
    if (ctx.cancelled || !g.player(src).alive || g.weaponName(src) !== 'cixiong') return;
    if (g.isFemale(src) === g.isFemale(t)) return;
    if (!await confirm(g, src, 'cixiong', `Thư Hùng Song Cổ Kiếm: buộc ${name(t)} bỏ 1 lá trên tay hoặc để bạn bốc 1 lá?`)) return;
    g.say(`${name(src)} dùng Thư Hùng Song Cổ Kiếm.`);
    const hand = g.player(t).hand;
    const i = hand.length === 0 ? 1
      : await g.choose(t, `Thư Hùng Song Cổ Kiếm của ${name(src)}`, ['Bỏ 1 lá trên tay', `Để ${name(src)} bốc 1 lá`]);
    if (i === 0) await g.forceDiscard(t, 1, 'cixiong');
    else await g.draw(src, 1);
  }, 110);

  // ---------- Giáp khi trở thành mục tiêu của Sát (chạy trước kỹ năng) ----------
  g.bus.on('slashTargeted', (ctx) => {
    if (ctx.cancelled) return;
    const armor = g.armorOf(ctx.target, ctx.source, true);
    if (armor === 'renwang' && isBlack(ctx.card)) {
      ctx.cancelled = true;
      g.say(`Nhân Vương Thuẫn của ${name(ctx.target)}: Sát đen không có hiệu lực.`);
    } else if (armor === 'tengjia' && !ctx.card.nature) {
      ctx.cancelled = true;
      g.say(`Đằng Giáp của ${name(ctx.target)}: Sát thường không có hiệu lực.`);
    }
  }, 100);

  // ---------- Hàn Băng Kiếm: thay vì gây sát thương, bỏ 2 lá của mục tiêu ----------
  g.bus.on('beforeDamage', async (ctx) => {
    const src = ctx.source;
    if (ctx.cancelled || src === null || ctx.cardAs !== 'sha' || ctx.chainTransmit) return;
    if (!g.player(src).alive || g.weaponName(src) !== 'hanbing' || g.cardCount(ctx.target) === 0) return;
    if (!await confirm(g, src, 'hanbing', `Hàn Băng Kiếm: không gây sát thương mà bỏ 2 lá của ${name(ctx.target)}?`)) return;
    ctx.cancelled = true;
    g.say(`${name(src)} dùng Hàn Băng Kiếm.`);
    for (let i = 0; i < 2 && g.cardCount(ctx.target) > 0; i++) {
      const pick = await pickCardFrom(g, src, ctx.target, false, 'Hàn Băng Kiếm: chọn lá để bỏ');
      if (pick) await g.moveCards([pick.id], pick.from, { kind: 'discard' }, 'hanbing');
    }
  }, 50);

  // ---------- Cổ Đĩnh Đao, Đằng Giáp (hỏa +1) ----------
  g.bus.on('beforeDamage', (ctx) => {
    if (ctx.cancelled) return;
    const src = ctx.source;
    if (src !== null && ctx.cardAs === 'sha' && g.player(src).alive && g.weaponName(src) === 'guding'
      && g.player(ctx.target).hand.length === 0) {
      ctx.amount += 1;
      g.say(`Cổ Đĩnh Đao: ${name(ctx.target)} không có bài trên tay, sát thương +1.`);
    }
    if (ctx.nature === 'fire' && g.armorOf(ctx.target, src, ctx.cardAs === 'sha') === 'tengjia') {
      ctx.amount += 1;
      g.say(`Đằng Giáp bắt lửa: sát thương hỏa +1.`);
    }
  }, 40);

  // ---------- Bạch Ngân Sư Tử: sát thương lớn hơn 1 giảm còn 1 (chạy sau mọi hiệu ứng cộng thêm) ----------
  g.bus.on('beforeDamage', (ctx) => {
    if (ctx.cancelled || ctx.amount <= 1) return;
    if (g.armorOf(ctx.target, ctx.source, ctx.cardAs === 'sha') !== 'baiyin') return;
    ctx.amount = 1;
    g.say(`Bạch Ngân Sư Tử của ${name(ctx.target)}: sát thương giảm còn 1.`);
  }, -100);

  // ---------- Kỳ Lân Cung: Sát gây sát thương thì bỏ 1 ngựa của mục tiêu ----------
  g.bus.on('damaged', async (ctx) => {
    const src = ctx.source;
    if (src === null || ctx.cardAs !== 'sha' || !g.player(src).alive || g.weaponName(src) !== 'qilin') return;
    const horses = (['defHorse', 'offHorse'] as const).filter((slot) => g.equipOf(ctx.target, slot));
    if (horses.length === 0) return;
    if (!await confirm(g, src, 'qilin', `Kỳ Lân Cung: bỏ 1 ngựa của ${name(ctx.target)}?`)) return;
    const i = horses.length === 1 ? 0
      : await g.choose(src, 'Kỳ Lân Cung: chọn ngựa để bỏ', horses.map((slot) => cardLabel(g.equipOf(ctx.target, slot)!)));
    const slot = horses[i];
    await g.moveCards([g.player(ctx.target).equips[slot][0]], { kind: 'equip', seat: ctx.target, slot }, { kind: 'discard' }, 'qilin');
    g.say(`${name(src)} dùng Kỳ Lân Cung bắn rơi ngựa của ${name(ctx.target)}.`);
  });

  // ---------- Bạch Ngân Sư Tử: khi rời khỏi khu vực trang bị thì hồi 1 máu ----------
  g.bus.on('cardsMoved', async (ctx) => {
    if (ctx.from.kind !== 'equip' || ctx.from.slot !== 'armor') return;
    const seat = ctx.from.seat;
    const p = g.player(seat);
    if (!p.alive || !ctx.cardIds.some((id) => g.card(id).name === 'baiyin')) return;
    if (p.hp < p.maxHp) {
      g.say(`Bạch Ngân Sư Tử rời khỏi ${p.name}.`);
      await g.recover(seat, 1, seat);
    }
  });
}

/** Quán Thạch Phủ: Sát bị né, có thể bỏ 2 lá trên tay để Sát vẫn trúng. Trả về true nếu dùng. */
export async function tryGuanshi(g: Game, source: number, target: number): Promise<boolean> {
  const p = g.player(source);
  if (!p.alive || !g.player(target).alive || g.weaponName(source) !== 'guanshi' || p.hand.length < 2) return false;
  if (!await confirm(g, source, 'guanshi', `Quán Thạch Phủ: bỏ 2 lá để Sát vẫn trúng ${g.player(target).name}?`)) return false;
  g.say(`${p.name} dùng Quán Thạch Phủ.`);
  await g.forceDiscard(source, 2, 'guanshi');
  return true;
}

/** Thanh Long Yển Nguyệt Đao: Sát bị né, có thể dùng thêm 1 Sát vào mục tiêu đó. */
export async function tryQinglong(g: Game, source: number, target: number): Promise<void> {
  if (!g.player(source).alive || !g.player(target).alive || g.weaponName(source) !== 'qinglong') return;
  if (!g.canBeSlashTarget(source, target)) return;
  const picked = await g.pickResponse(source, ['sha'], `Thanh Long Yển Nguyệt Đao: Sát tiếp ${g.player(target).name}?`,
    target, { kind: 'extraSlash', target });
  if (picked) await g.slashOutOfTurn(source, target, picked.card, picked.as);
}

/**
 * Trượng Bát Xà Mâu (khi cần đánh Sát): bỏ 2 lá trên tay coi như đánh 1 Sát.
 * Gọi khi người chơi không đánh lá Sát thật. Trả về lá Sát ảo đã đánh, hoặc null.
 */
export async function tryZhangbaResponse(g: Game, seat: number, reason: string): Promise<Card | null> {
  const p = g.player(seat);
  const usable = p.hand.filter((id) => !g.cardBlocked(seat, g.card(id)));
  if (!p.alive || g.weaponName(seat) !== 'zhangba' || usable.length < 2) return null;
  if (!await confirm(g, seat, 'zhangba', `Trượng Bát Xà Mâu: dùng 2 lá trên tay như 1 lá Sát (${reason})?`)) return null;
  const ids = await g.chooseCards(seat, 'Trượng Bát Xà Mâu: chọn 2 lá', usable, 2, 2);
  const card = zhangbaCard(g, ids);
  await g.moveCards(ids, { kind: 'hand', seat }, { kind: 'processing' }, 'respond');
  try {
    g.say(`${p.name} đánh ${ids.map((id) => cardLabel(g.card(id))).join(' + ')} (Trượng Bát Xà Mâu, như Sát).`);
    await g.bus.emit('cardResponded', { seat, card, as: 'sha', reason });
  } finally {
    const left = ids.filter((id) => g.state.processing.includes(id));
    if (left.length) await g.moveCards(left, { kind: 'processing' }, { kind: 'discard' }, 'respond');
  }
  return card;
}

/**
 * Lá Sát ảo ghép từ 2 lá: cùng màu thì mang chất lá đầu.
 * Khác màu thì theo luật là "không màu" — engine chưa có khái niệm này nên coi như đỏ (Nhân Vương Thuẫn không chặn).
 */
export function zhangbaCard(g: Game, ids: number[]): Card {
  const [a, b] = ids.map((id) => g.card(id));
  return g.virtualCard('sha', isRed(a) === isRed(b) ? a : { ...a, suit: 'heart' });
}
