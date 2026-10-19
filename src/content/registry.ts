// ============================================================
// Ảnh chụp "trạng thái gốc" của mọi bảng dữ liệu trong engine (tướng, kỹ năng, lá bài, bộ bài).
// Mỗi lần nạp nội dung: khôi phục về gốc rồi mới áp dụng nội dung mới,
// nên xóa một file trong content/ là nội dung đó biến mất hoàn toàn, không để lại rác.
// ============================================================
import '../hegemony/game.js'; // bảo đảm các cẩm nang Quốc Chiến đã được đăng ký trước khi chụp
import { CARD_INFO, STANDARD_DECK } from '../core/cards.js';
import { DELAYED_DEFS, TRICK_DEFS } from '../core/tricks.js';
import { GENERALS, PAIRS, reindexGenerals, type General } from '../hegemony/generals.js';
import { EQUIP_SKILLS, SKILLS } from '../hegemony/skills.js';

interface Snapshot {
  generals: General[];
  pairs: [string, string][];
  skills: Record<string, unknown>;
  tricks: Record<string, unknown>;
  delayed: Record<string, unknown>;
  cardInfo: Record<string, unknown>;
  deck: unknown[][];
  equipSkills: Record<string, string>;
}

let base: Snapshot | null = null;

/** Chụp trạng thái gốc (chỉ chụp lần đầu). */
export function captureBaseline(): void {
  if (base) return;
  base = {
    generals: GENERALS.map((g) => ({ ...g, skills: [...g.skills] })),
    pairs: PAIRS.map(([a, b]) => [a, b]),
    skills: { ...SKILLS },
    tricks: { ...TRICK_DEFS },
    delayed: { ...DELAYED_DEFS },
    cardInfo: { ...CARD_INFO },
    deck: STANDARD_DECK.map((e) => [...e]),
    equipSkills: { ...EQUIP_SKILLS },
  };
}

function restore(target: Record<string, unknown>, snap: Record<string, unknown>): void {
  for (const k of Object.keys(target)) if (!(k in snap)) delete target[k];
  Object.assign(target, snap);
}

/** Khôi phục mọi bảng dữ liệu về trạng thái gốc. */
export function resetToBaseline(): void {
  captureBaseline();
  const b = base!;
  GENERALS.length = 0;
  GENERALS.push(...b.generals.map((g) => ({ ...g, skills: [...g.skills] })));
  reindexGenerals();
  PAIRS.length = 0;
  PAIRS.push(...b.pairs.map(([x, y]) => [x, y] as [string, string]));
  restore(SKILLS as Record<string, unknown>, b.skills);
  restore(TRICK_DEFS as Record<string, unknown>, b.tricks);
  restore(DELAYED_DEFS as Record<string, unknown>, b.delayed);
  restore(CARD_INFO as Record<string, unknown>, b.cardInfo);
  restore(EQUIP_SKILLS, b.equipSkills);
  STANDARD_DECK.length = 0;
  STANDARD_DECK.push(...(b.deck.map((e) => [...e]) as typeof STANDARD_DECK));
}

/** Dữ liệu gốc (chỉ đọc) để bộ nạp kiểm tra tham chiếu. */
export function baseline(): Readonly<Snapshot> {
  captureBaseline();
  return base!;
}
