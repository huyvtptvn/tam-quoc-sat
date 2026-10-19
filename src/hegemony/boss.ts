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
  /** (Boss nhiều mạng) Vào giai đoạn này khi đã bị bắt ít nhất số lần này (thay cho `at`). */
  capture?: number;
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
  /**
   * Boss nhiều mạng (Mạnh Hoạch – Thất Cầm): phải hạ `lives` lần. Mỗi lần về 0 máu thì "bị bắt" rồi thả ra với đầy máu.
   * Khi đó máu tối đa (baseHp + hpPerPlayer × số người) là máu MỖI MẠNG. Hạ bằng sát thương Hỏa tính 2 lần bắt.
   */
  lives?: number;
  /** Tên ký hiệu riêng của boss (Trương Giác: Hoàng Cân). */
  tokenName?: string;
}

// ---------- Tướng boss (không bao giờ được chia cho người chơi: id bắt đầu bằng "boss_") ----------

const BOSS_GENERALS: General[] = [
  { id: 'boss_lvbu', name: 'Lữ Bố – Thần Uy', kingdom: 'qun', halfHp: 8, skills: ['vosong', 'boss_thankich'], art: 'lvbu' },
  { id: 'boss_lvbu2', name: 'Lữ Bố – Bạo Nộ', kingdom: 'qun', halfHp: 8, skills: ['vosong', 'boss_thankich', 'boss_tula', 'boss_thanphan'], art: 'lvbu' },
  { id: 'boss_chitu', name: 'Xích Thố', kingdom: 'qun', halfHp: 0, skills: ['mathuat'] },
  { id: 'boss_dongzhuo', name: 'Đổng Trác – Bạo Chúa', kingdom: 'qun', halfHp: 8, skills: ['boss_tuutri', 'boss_baonguoc'], art: 'dongzhuo' },
  { id: 'boss_dongzhuo2', name: 'Đổng Trác – Hỏa Thiêu Lạc Dương', kingdom: 'qun', halfHp: 8, skills: ['boss_tuutri', 'boss_baonguoc', 'boss_phonghoa'], art: 'dongzhuo' },
  { id: 'boss_tayluong', name: 'Tây Lương Thiết Kỵ', kingdom: 'qun', halfHp: 0, skills: ['mathuat'] },
  { id: 'boss_zhangjiao', name: 'Trương Giác – Thái Bình Đạo', kingdom: 'qun', halfHp: 8, skills: ['boss_loikich', 'guidao', 'boss_hoangcan'], art: 'zhangjiao' },
  { id: 'boss_zhangjiao2', name: 'Trương Giác – Thiên Công Tướng Quân', kingdom: 'qun', halfHp: 8, skills: ['boss_loikich', 'guidao', 'boss_hoangcan', 'boss_thienloi'], art: 'lord_zhangjiao' },
  { id: 'boss_hoangcanquan', name: 'Hoàng Cân Quân', kingdom: 'qun', halfHp: 0, skills: [] },
  { id: 'boss_menghuo', name: 'Mạnh Hoạch – Nam Man Vương', kingdom: 'qun', halfHp: 8, skills: ['boss_hoathu', 'boss_taikhoi'], art: 'menghuo' },
  { id: 'boss_menghuo2', name: 'Mạnh Hoạch – Liều Chết', kingdom: 'qun', halfHp: 8, skills: ['boss_hoathu', 'boss_taikhoi', 'boss_phidao'], art: 'menghuo' },
  { id: 'boss_zhurong', name: 'Chúc Dung', kingdom: 'qun', halfHp: 0, skills: [], art: 'zhurong' },
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
  dongzhuo: {
    id: 'dongzhuo',
    name: 'Đổng Trác – Loạn Lạc Dương',
    desc: 'Giai đoạn 1: Tửu Trì (lá ♠ dùng như Rượu), Bạo Ngược (gây sát thương thì hồi 1 máu, mỗi lượt 1 lần), Tây Lương Thiết Kỵ (−1 khoảng cách). '
      + 'Còn nửa máu: Hỏa Thiêu Lạc Dương — hồi 3 máu, đầu mỗi lượt mọi người phán xét, ra Cơ/Rô thì chịu 1 sát thương Hỏa.',
    deputy: 'boss_tayluong',
    baseHp: 3,
    hpPerPlayer: 3.5,
    roundLimit: 15,
    phases: [
      { general: 'boss_dongzhuo', name: 'Bạo Chúa', at: 1, heal: 0 },
      { general: 'boss_dongzhuo2', name: 'Hỏa Thiêu Lạc Dương', at: 0.5, heal: 3 },
    ],
  },
  zhangjiao: {
    id: 'zhangjiao',
    name: 'Trương Giác – Hoàng Cân Khởi Nghĩa',
    desc: 'Giai đoạn 1: Lôi Kích (đánh Thiểm thì người bị nhắm phán xét, ra Bích chịu 1 sát thương Lôi), Quỷ Đạo, Hoàng Cân (cứ 2 vòng nhận 1 [Hoàng Cân], tối đa 2; mỗi [Hoàng Cân] chặn 1 điểm sát thương). '
      + 'Còn nửa máu: Thiên Công Tướng Quân — hồi 2 máu, nhận 1 [Hoàng Cân] mỗi vòng (tối đa 3), cuối lượt giáng 1 sát thương Lôi vào người bị nhắm.',
    deputy: 'boss_hoangcanquan',
    baseHp: 2,
    hpPerPlayer: 3.5,
    roundLimit: 15,
    tokenName: 'Hoàng Cân',
    phases: [
      { general: 'boss_zhangjiao', name: 'Thái Bình Đạo', at: 1, heal: 0 },
      { general: 'boss_zhangjiao2', name: 'Thiên Công Tướng Quân', at: 0.5, heal: 2 },
    ],
  },
  menghuo: {
    id: 'menghuo',
    name: 'Mạnh Hoạch – Thất Cầm Thất Túng',
    desc: 'Phải bắt Mạnh Hoạch 7 lần: mỗi lần về 0 máu thì bị bắt rồi thả ra đầy máu (Tái Khởi: bốc 2 lá). Hạ bằng sát thương Hỏa tính 2 lần bắt. '
      + 'Họa Thủ: miễn Nam Man Nhập Xâm và Vạn Tiễn Tề Phát. Từ lần bắt thứ 4: Chúc Dung trợ chiến — Phi Đao (Sát gây sát thương thì lấy 1 lá trên tay mục tiêu).',
    deputy: 'boss_zhurong',
    baseHp: 2,
    hpPerPlayer: 0.7,
    roundLimit: 18,
    lives: 7,
    phases: [
      { general: 'boss_menghuo', name: 'Nam Man Vương', at: 1, heal: 0 },
      { general: 'boss_menghuo2', name: 'Chúc Dung trợ chiến', at: 0, capture: 4, heal: 0 },
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
  // ----- Đổng Trác -----
  {
    id: 'boss_tuutri',
    name: 'Tửu Trì',
    desc: 'Lá BÍCH trên tay bạn có thể dùng như [Rượu].',
    convert: (_g, _seat, card) => (card.suit === 'spade' ? ['jiu'] : []),
  },
  {
    id: 'boss_baonguoc',
    name: 'Bạo Ngược',
    desc: 'Tỏa định kỹ: Sau khi bạn gây sát thương cho người khác, bạn hồi 1 máu (mỗi lượt 1 lần).',
    triggers: [{
      event: 'damageDealt',
      compulsory: true,
      can: (g, ctx, owner) => ctx.source === owner && ctx.target !== owner && g.player(owner).alive && (g.bossCounter('baonguoc') < 1),
      run: async (g, _ctx, owner) => { g.bossCount('baonguoc'); await g.recover(owner, 1, owner); },
    }],
  },
  {
    id: 'boss_phonghoa',
    name: 'Hỏa Thiêu Lạc Dương',
    desc: 'Tỏa định kỹ: Khi bắt đầu lượt, mỗi người chơi phán xét: Cơ hoặc Rô thì chịu 1 sát thương Hỏa do bạn gây ra.',
    triggers: [{
      event: 'turnStart',
      compulsory: true,
      can: (_g, ctx, owner) => ctx.seat === owner,
      run: async (g, _ctx, owner) => {
        for (const t of g.aliveSeatsFrom(owner).filter((s) => s !== owner)) {
          if (!g.player(t).alive || !g.player(owner).alive) continue;
          const j = await g.judge(t, 'Hỏa Thiêu Lạc Dương');
          const hit = j.suit === 'heart' || j.suit === 'diamond';
          await g.finishJudge(j);
          if (hit) await g.damage({ source: owner, target: t, amount: 1, card: null, nature: 'fire', cancelled: false });
        }
      },
    }],
  },
  // ----- Trương Giác -----
  {
    id: 'boss_loikich',
    name: 'Lôi Kích',
    desc: 'Tỏa định kỹ: Khi bạn đánh ra [Thiểm], người có thù hận cao nhất phán xét: BÍCH thì chịu 1 sát thương Lôi do bạn gây ra.',
    triggers: [{
      event: 'cardResponded',
      compulsory: true,
      can: (g, ctx, owner) => ctx.seat === owner && ctx.as === 'shan' && g.bossTarget() !== null,
      run: async (g, _ctx, owner) => {
        const t = g.bossTarget()!;
        const j = await g.judge(t, 'Lôi Kích');
        const hit = j.suit === 'spade';
        await g.finishJudge(j);
        if (hit) await g.damage({ source: owner, target: t, amount: 1, card: null, nature: 'thunder', cancelled: false });
      },
    }],
  },
  {
    id: 'boss_hoangcan',
    name: 'Hoàng Cân',
    desc: 'Tỏa định kỹ: Khi bắt đầu lượt, cứ 2 vòng bạn nhận 1 ký hiệu [Hoàng Cân], tối đa 2 (giai đoạn 2: mỗi vòng 1, tối đa 3). Khi bạn chịu sát thương, mỗi [Hoàng Cân] chặn 1 điểm (bỏ ký hiệu đó).',
    triggers: [{
      event: 'turnStart',
      compulsory: true,
      can: (_g, ctx, owner) => ctx.seat === owner,
      run: (g, _ctx, owner) => {
        const p2 = g.hasSkill(owner, 'boss_thienloi', true);
        // Giai đoạn 1: cứ 2 vòng nhận 1; giai đoạn 2: mỗi vòng nhận 1
        if (!p2 && g.bossRound % 2 === 1) return;
        const before = g.bossTokens;
        g.bossTokens = Math.min(p2 ? 3 : 2, g.bossTokens + 1);
        if (g.bossTokens > before) g.say(`Hoàng Cân: ${g.player(owner).name} có ${g.bossTokens} [Hoàng Cân].`);
      },
    }, {
      event: 'beforeDamage',
      compulsory: true,
      can: (g, ctx, owner) => ctx.target === owner && g.bossTokens > 0 && ctx.amount > 0,
      run: (g, ctx, owner) => {
        const block = Math.min(g.bossTokens, ctx.amount);
        g.bossTokens -= block;
        ctx.amount -= block;
        if (ctx.amount <= 0) ctx.cancelled = true;
        g.say(`Hoàng Cân chặn ${block} điểm sát thương cho ${g.player(owner).name} (còn ${g.bossTokens} [Hoàng Cân]).`);
      },
    }],
  },
  {
    id: 'boss_thienloi',
    name: 'Thiên Lôi',
    desc: 'Tỏa định kỹ: Khi kết thúc lượt, bạn gây 1 sát thương Lôi cho người có thù hận cao nhất.',
    triggers: [{
      event: 'turnEnd',
      compulsory: true,
      can: (_g, ctx, owner) => ctx.seat === owner,
      run: async (g, _ctx, owner) => {
        const t = g.bossTarget();
        if (t !== null) await g.damage({ source: owner, target: t, amount: 1, card: null, nature: 'thunder', cancelled: false });
      },
    }],
  },
  // ----- Mạnh Hoạch -----
  {
    id: 'boss_hoathu',
    name: 'Họa Thủ',
    desc: 'Tỏa định kỹ: [Nam Man Nhập Xâm] và [Vạn Tiễn Tề Phát] không có hiệu quả với bạn.',
    triggers: [{
      event: 'trickTargeted',
      compulsory: true,
      can: (_g, ctx, owner) => ctx.target === owner && (ctx.name === 'nanman' || ctx.name === 'wanjian'),
      run: (g, ctx, owner) => { ctx.cancelled = true; g.say(`Họa Thủ: ${g.player(owner).name} miễn nhiễm.`); },
    }],
  },
  {
    id: 'boss_taikhoi',
    name: 'Tái Khởi',
    desc: 'Mỗi lần bị bắt (về 0 máu) mà chưa đủ số lần, bạn được thả ra với đầy máu, bỏ khu vực phán định và bốc 2 lá.',
  },
  {
    id: 'boss_phidao',
    name: 'Phi Đao',
    desc: 'Tỏa định kỹ: Sau khi [Sát] của bạn gây sát thương, bạn thu lấy 1 lá ngẫu nhiên trên tay mục tiêu.',
    triggers: [{
      event: 'damageDealt',
      compulsory: true,
      can: (g, ctx, owner) => ctx.source === owner && ctx.cardAs === 'sha' && g.player(ctx.target).alive && g.player(ctx.target).hand.length > 0,
      run: async (g, ctx, owner) => {
        const hand = g.player(ctx.target).hand;
        const id = hand[g.randomInt(hand.length)];
        await g.moveCards([id], { kind: 'hand', seat: ctx.target }, { kind: 'hand', seat: owner }, 'boss_phidao');
        g.say(`Phi Đao: ${g.player(owner).name} lấy 1 lá của ${g.player(ctx.target).name}.`);
      },
    }],
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
  /** Boss nhiều mạng: số lần đã bắt / cần bắt. */
  captures?: number;
  lives?: number;
  /** Ký hiệu riêng của boss (Hoàng Cân). */
  tokens?: number;
  tokenName?: string;
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
