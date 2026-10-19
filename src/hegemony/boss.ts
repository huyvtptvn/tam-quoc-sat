// ============================================================
// Chế độ Thảo Phạt (đánh boss): 2–5 người chơi cùng phe "Liên quân" đánh 1 boss do máy điều khiển.
//
// - Mọi người lật tướng từ đầu; không có ẩn phe. Ghép tướng tự do (như Loạn tướng).
// - Boss ngồi ghế cuối, đi lượt chen giữa: sau mỗi người (bàn ≤ 3 người) hoặc mỗi 2 người (bàn 4–5 người).
// - Boss có nhiều giai đoạn: máu xuống ngưỡng thì đổi tướng (kỹ năng mạnh hơn), hồi một phần máu, bỏ khu vực phán định.
// - Người chơi chết: sau 2 lượt của boss thì sống lại (2 máu, 2 lá), mỗi lần tốn 1 Quân lương.
// - Thắng: hạ boss ở giai đoạn cuối. Thua: tất cả người chơi cùng chết, hoặc quá số vòng giới hạn.
// - Boss đánh theo bảng "thù hận": ai gây sát thương / hồi máu / chặn boss nhiều nhất bị nhắm trước.
// ============================================================
import type { PlayerView, PublicPlayer } from '../core/view.js';
import { GENERALS, type General } from './generals.js';
import { HegemonyBot } from './bot.js';
import { SKILLS, type Skill } from './skills.js';

export type BossDifficulty = 'normal' | 'hard' | 'nightmare';

export const BOSS_DIFFICULTY: Record<BossDifficulty, { label: string; hpMul: number; drawBonus: number; food: number; winBonus: number }> = {
  normal: { label: 'Thường', hpMul: 1, drawBonus: 0, food: 3, winBonus: 30 },
  hard: { label: 'Khó', hpMul: 1.2, drawBonus: 1, food: 3, winBonus: 50 },
  nightmare: { label: 'Ác mộng', hpMul: 1.4, drawBonus: 1, food: 2, winBonus: 80 },
};

export interface BossPhase {
  /** Tướng boss dùng ở giai đoạn này (chủ tướng). */
  general: string;
  /** Tên giai đoạn. */
  name: string;
  /** Vào giai đoạn này khi máu boss ≤ tỉ lệ này của máu tối đa (giai đoạn đầu: 1). */
  at: number;
  /** Máu hồi khi vào giai đoạn. */
  heal: number;
}

export interface BossDef {
  id: string;
  name: string;
  desc: string;
  /** Phó tướng cố định của boss. */
  deputy: string;
  baseHp: number;
  hpPerPlayer: number;
  roundLimit: number;
  phases: BossPhase[];
}

// ---------- Tướng boss (không bao giờ được chia cho người chơi: id bắt đầu bằng "boss_") ----------

const BOSS_GENERALS: General[] = [
  { id: 'boss_lvbu', name: 'Lữ Bố – Thần Uy', kingdom: 'qun', halfHp: 8, skills: ['vosong', 'boss_thankich'], art: 'lvbu' },
  { id: 'boss_lvbu2', name: 'Lữ Bố – Bạo Nộ', kingdom: 'qun', halfHp: 8, skills: ['vosong', 'boss_thankich', 'boss_tula', 'boss_thanphan'], art: 'lvbu' },
  { id: 'boss_chitu', name: 'Xích Thố', kingdom: 'qun', halfHp: 0, skills: ['mathuat'] },
];

export const BOSSES: Record<string, BossDef> = {
  lubu: {
    id: 'lubu',
    name: 'Lữ Bố – Hổ Lao Quan',
    desc: 'Giai đoạn 1: Vô Song, Thần Kích, Mã Thuật. Còn nửa máu: Bạo Nộ — hồi 3 máu, thêm Tu La và Thần Phẫn.',
    deputy: 'boss_chitu',
    baseHp: 4,
    hpPerPlayer: 4,
    roundLimit: 15,
    phases: [
      { general: 'boss_lvbu', name: 'Thần Uy', at: 1, heal: 0 },
      { general: 'boss_lvbu2', name: 'Bạo Nộ', at: 0.5, heal: 3 },
    ],
  },
};

export const isBossId = (id: string) => id.startsWith('boss_');

// ---------- Kỹ năng boss ----------

const BOSS_SKILLS: Skill[] = [
  {
    id: 'boss_thankich',
    name: 'Thần Kích',
    desc: 'Tỏa định kỹ: Khi bạn dùng [Sát] là lá bài cuối cùng trên tay, [Sát] này được chọn thêm tối đa 2 mục tiêu.',
  },
  {
    id: 'boss_tula',
    name: 'Tu La',
    desc: 'Tỏa định kỹ: Khi bắt đầu lượt, bạn bỏ 1 lá trong khu vực phán định của bạn (nếu có).',
    triggers: [{
      event: 'turnStart',
      compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && g.player(owner).judgeArea.length > 0,
      run: async (g, _ctx, owner) => {
        const id = g.player(owner).judgeArea[g.player(owner).judgeArea.length - 1];
        await g.moveCards([id], { kind: 'judge', seat: owner }, { kind: 'discard' }, 'boss_tula');
        g.say(`Tu La: ${g.player(owner).name} bỏ 1 lá khỏi khu vực phán định.`);
      },
    }],
  },
  {
    id: 'boss_thanphan',
    name: 'Thần Phẫn',
    desc: 'Một lần trong lượt, bạn có thể bỏ 2 lá: gây 1 sát thương cho mỗi người khác, sau đó mỗi người đó bỏ 1 lá trang bị (nếu có).',
    active: {
      cards: 'any', target: 'none', minCards: 2, maxCards: 2,
      available: (g, seat) => !g.player(seat).flags.boss_thanphan && g.player(seat).hand.length >= 2,
      checkCards: (_g, _seat, ids) => (ids.length === 2 ? null : 'Cần bỏ đúng 2 lá'),
      run: async (g, seat, ids) => {
        g.player(seat).flags.boss_thanphan = 1;
        await g.moveCards(ids, { kind: 'hand', seat }, { kind: 'discard' }, 'boss_thanphan');
        for (const t of g.aliveSeatsFrom(seat).filter((s) => s !== seat)) {
          if (!g.player(t).alive) continue;
          await g.damage({ source: seat, target: t, amount: 1, card: null, cancelled: false });
          if (!g.player(t).alive) continue;
          const eq = Object.entries(g.player(t).equips).flatMap(([slot, list]) => list.map((id) => ({ slot, id })));
          if (eq.length) {
            const { slot, id } = eq[0];
            await g.moveCards([id], { kind: 'equip', seat: t, slot: slot as never }, { kind: 'discard' }, 'boss_thanphan');
            g.say(`${g.player(t).name} bỏ trang bị vì Thần Phẫn.`);
          }
        }
      },
    },
    bot: { use: 'always' },
  },
  {
    id: 'khieuchien',
    name: 'Khiêu Chiến',
    desc: 'Chế độ Thảo Phạt. Một lần trong lượt, bạn có thể bỏ 1 lá: thù hận của boss với bạn trở thành cao nhất (boss sẽ nhắm bạn trước).',
    active: {
      cards: 'one', target: 'none', minCards: 1, maxCards: 1,
      available: (g, seat) => g.bossSeat !== null && seat !== g.bossSeat && !g.player(seat).flags.khieuchien,
      run: async (g, seat, ids) => {
        g.player(seat).flags.khieuchien = 1;
        await g.moveCards(ids, { kind: 'hand', seat }, { kind: 'discard' }, 'khieuchien');
        g.tauntBoss(seat);
      },
    },
    bot: { use: 'never' },
  },
];

for (const g of BOSS_GENERALS) if (!GENERALS.some((x) => x.id === g.id)) GENERALS.push(g);
for (const s of BOSS_SKILLS) SKILLS[s.id] = { ...s, origin: 'builtin' };

// ---------- Bot ----------

/** Thông tin boss trong view (công khai cho mọi người). */
export interface BossView {
  seat: number;
  id: string;
  name: string;
  difficulty: BossDifficulty;
  difficultyLabel: string;
  phase: number;
  phases: string[];
  round: number;
  roundLimit: number;
  food: number;
  foodMax: number;
  threat: number[];
  /** Ghế -> số lượt boss còn lại trước khi sống lại. */
  reviving: Record<number, number>;
}

/** Bot của boss: nhắm người có thù hận cao nhất. */
export class BossBot extends HegemonyBot {
  protected override isAlly(v: PlayerView, p: PublicPlayer): boolean {
    return p.seat === v.me;
  }

  protected override targetScore(v: PlayerView, p: PublicPlayer): number {
    const threat = v.boss?.threat[p.seat] ?? 0;
    return -threat * 10 + p.hp;
  }
}
