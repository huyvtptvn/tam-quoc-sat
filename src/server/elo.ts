// ============================================================
// Elo cho ván nhiều người (Quốc Chiến có nhiều phe).
//
// Mỗi người được so với từng người còn lại (từng cặp):
//   - Khác phe: kết quả cặp = 70% thắng/thua ván + 30% so điểm cá nhân trong ván.
//   - Cùng phe: chỉ so điểm cá nhân, và cặp này chỉ nặng bằng 30% cặp khác phe.
// Thay đổi = K × (thực tế − kỳ vọng), lấy trung bình có trọng số trên mọi cặp,
// nên một ván thay đổi tối đa K điểm dù bàn có 3 hay 10 người.
// ============================================================

export const ELO_START = 1200;
/** Bot và khách (không có tài khoản) được tính như một đối thủ có Elo cố định, không bị thay đổi. */
export const ELO_FIXED_OPPONENT = 1200;
/** 10 ván đầu (đang xếp hạng): K lớn để nhanh về đúng trình. */
export const K_PROVISIONAL = 40;
export const K_NORMAL = 24;
export const PROVISIONAL_GAMES = 10;
/** Ván chỉ có 1 người có tài khoản (còn lại là bot/khách): Elo thay đổi một nửa, tránh "cày" với bot. */
export const SOLO_FACTOR = 0.5;

export interface EloInput {
  rating: number;
  games: number;
  /** false = bot hoặc khách: tham gia làm đối thủ nhưng không được cập nhật. */
  rated: boolean;
  winner: boolean;
  score: number;
  /** Khóa phe cuối ván (dã tâm gia mỗi người một khóa riêng). */
  faction: string;
}

export const expected = (ra: number, rb: number) => 1 / (1 + 10 ** ((rb - ra) / 400));

/** Trả về mức thay đổi Elo (đã làm tròn) cho từng người; người không được tính trả 0. */
export function eloDeltas(players: EloInput[]): number[] {
  const ratedCount = players.filter((p) => p.rated).length;
  return players.map((me, i) => {
    if (!me.rated) return 0;
    let sum = 0;
    let weight = 0;
    players.forEach((op, j) => {
      if (i === j) return;
      const sc = me.score > op.score ? 1 : me.score < op.score ? 0 : 0.5;
      const allies = me.faction === op.faction;
      const w = allies ? 0.3 : 1;
      const actual = allies ? sc : 0.7 * (me.winner === op.winner ? 0.5 : me.winner ? 1 : 0) + 0.3 * sc;
      const opRating = op.rated ? op.rating : ELO_FIXED_OPPONENT;
      sum += w * (actual - expected(me.rating, opRating));
      weight += w;
    });
    if (weight === 0) return 0;
    const k = (me.games < PROVISIONAL_GAMES ? K_PROVISIONAL : K_NORMAL) * (ratedCount < 2 ? SOLO_FACTOR : 1);
    return Math.round((k * sum) / weight);
  });
}

/** Cấp bậc theo Elo. */
export const RANKS: { min: number; name: string }[] = [
  { min: 1800, name: 'Vương' },
  { min: 1600, name: 'Đại Đô Đốc' },
  { min: 1450, name: 'Đại Tướng Quân' },
  { min: 1300, name: 'Tướng Quân' },
  { min: 1200, name: 'Hiệu Úy' },
  { min: 1100, name: 'Đô Úy' },
  { min: 1000, name: 'Ngũ Trưởng' },
  { min: -Infinity, name: 'Binh Sĩ' },
];

export function rankOf(rating: number, games: number): string {
  if (games < PROVISIONAL_GAMES) return `Đang xếp hạng (${games}/${PROVISIONAL_GAMES})`;
  return RANKS.find((r) => rating >= r.min)!.name;
}
