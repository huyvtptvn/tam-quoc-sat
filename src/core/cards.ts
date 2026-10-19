// ============================================================
// Thông tin lá bài và bộ bài.
// ============================================================
import type { Card, CardName, CardType, EquipSlot, Suit } from './types.js';
import { CARD_DESC } from './card-desc.js';

export interface CardInfo {
  label: string;
  type: CardType;
  /** Trang bị: nằm ở ô nào. */
  slot?: EquipSlot;
  /** Vũ khí: tầm đánh. */
  range?: number;
  /** Lá bài thêm từ content/: mô tả và chữ in giữa mặt bài. */
  desc?: string;
  glyph?: string;
}

export const CARD_INFO: Record<CardName, CardInfo> = {
  // ----- Cơ bản -----
  sha: { label: 'Sát', type: 'basic' },
  shan: { label: 'Thiểm', type: 'basic' },
  tao: { label: 'Đào', type: 'basic' },
  jiu: { label: 'Rượu', type: 'basic' },
  // ----- Cẩm nang -----
  wuxie: { label: 'Vô Giải Khả Kích', type: 'trick' },
  wuxie_guo: { label: 'Vô Giải Khả Kích·Quốc', type: 'trick' },
  juedou: { label: 'Quyết Đấu', type: 'trick' },
  nanman: { label: 'Nam Man Nhập Xâm', type: 'trick' },
  wanjian: { label: 'Vạn Tiễn Tề Phát', type: 'trick' },
  wuzhong: { label: 'Vô Trung Sinh Hữu', type: 'trick' },
  guohe: { label: 'Quá Hà Sách Kiều', type: 'trick' },
  shunshou: { label: 'Thuận Thủ Khiên Dương', type: 'trick' },
  taoyuan: { label: 'Đào Viên Kết Nghĩa', type: 'trick' },
  huogong: { label: 'Hỏa Công', type: 'trick' },
  tiesuo: { label: 'Thiết Tác Liên Hoàn', type: 'trick' },
  zhiji: { label: 'Tri Kỷ Tri Bỉ', type: 'trick' },
  yuanjiao: { label: 'Viễn Giao Cận Công', type: 'trick' },
  yiyi: { label: 'Dĩ Dật Đãi Lao', type: 'trick' },
  // ----- Cẩm nang Thế Bị Thiên -----
  huoshao: { label: 'Hỏa Thiêu Liên Doanh', type: 'trick', glyph: '火烧' },
  diaohu: { label: 'Điệu Hổ Ly Sơn', type: 'trick', glyph: '调虎' },
  lulitongxin: { label: 'Lục Lực Đồng Tâm', type: 'trick', glyph: '同心' },
  lianjun: { label: 'Liên Quân Thịnh Yến', type: 'trick', glyph: '联军' },
  xietianzi: { label: 'Hiệp Thiên Tử Dĩ Lệnh Chư Hầu', type: 'trick', glyph: '挟天' },
  chiling: { label: 'Sắc Lệnh', type: 'trick', glyph: '敕令' },
  // ----- Cẩm nang thế lực (nhận qua Chiếu Thư) -----
  haoling: { label: 'Hiệu Lệnh Thiên Hạ', type: 'trick', glyph: '号令' },
  kefu: { label: 'Khắc Phục Trung Nguyên', type: 'trick', glyph: '克复' },
  guguo: { label: 'Cố Quốc An Bang', type: 'trick', glyph: '固国' },
  wenhe: { label: 'Văn Hòa Loạn Võ', type: 'trick', glyph: '文和' },
  jiedao: { label: 'Tá Đao Sát Nhân', type: 'trick' },
  wugu: { label: 'Ngũ Cốc Phong Đăng', type: 'trick' },
  shuiyan: { label: 'Thủy Yêm Thất Quân', type: 'trick' },
  // ----- Cẩm nang trì hoãn -----
  lebu: { label: 'Lạc Bất Tư Thục', type: 'delayed' },
  bingliang: { label: 'Binh Lương Thốn Đoạn', type: 'delayed' },
  shandian: { label: 'Thiểm Điện', type: 'delayed' },
  // ----- Vũ khí -----
  zhuge: { label: 'Gia Cát Liên Nỏ', type: 'equip', slot: 'weapon', range: 1 },
  qinggang: { label: 'Thanh Công Kiếm', type: 'equip', slot: 'weapon', range: 2 },
  hanbing: { label: 'Hàn Băng Kiếm', type: 'equip', slot: 'weapon', range: 2 },
  guding: { label: 'Cổ Đĩnh Đao', type: 'equip', slot: 'weapon', range: 2 },
  qinglong: { label: 'Thanh Long Yển Nguyệt Đao', type: 'equip', slot: 'weapon', range: 3 },
  guanshi: { label: 'Quán Thạch Phủ', type: 'equip', slot: 'weapon', range: 3 },
  fangtian: { label: 'Phương Thiên Họa Kích', type: 'equip', slot: 'weapon', range: 4 },
  qilin: { label: 'Kỳ Lân Cung', type: 'equip', slot: 'weapon', range: 5 },
  cixiong: { label: 'Thư Hùng Song Cổ Kiếm', type: 'equip', slot: 'weapon', range: 2 },
  zhangba: { label: 'Trượng Bát Xà Mâu', type: 'equip', slot: 'weapon', range: 3 },
  zhuque: { label: 'Chu Tước Vũ Phiến', type: 'equip', slot: 'weapon', range: 4 },
  liujian: { label: 'Ngô Lục Kiếm', type: 'equip', slot: 'weapon', range: 2, glyph: '六剑' },
  sanjian: { label: 'Tam Tiêm Lưỡng Nhận Đao', type: 'equip', slot: 'weapon', range: 3, glyph: '三尖' },
  qinglong_qc: { label: 'Thanh Long Yển Nguyệt Đao', type: 'equip', slot: 'weapon', range: 3, glyph: '青龙' },
  fangtian_qc: { label: 'Phương Thiên Họa Kích', type: 'equip', slot: 'weapon', range: 4, glyph: '方天' },
  feilong: { label: 'Phi Long Đoạt Phượng', type: 'equip', slot: 'weapon', range: 2, glyph: '飞龙' },
  // ----- Giáp -----
  bagua: { label: 'Bát Quái Trận', type: 'equip', slot: 'armor' },
  renwang: { label: 'Nhân Vương Thuẫn', type: 'equip', slot: 'armor' },
  tengjia: { label: 'Đằng Giáp', type: 'equip', slot: 'armor' },
  baiyin: { label: 'Bạch Ngân Sư Tử', type: 'equip', slot: 'armor' },
  huxinjing: { label: 'Hộ Tâm Kính', type: 'equip', slot: 'armor', glyph: '护心' },
  mingguang: { label: 'Minh Quang Khải', type: 'equip', slot: 'armor', glyph: '明光' },
  taiping: { label: 'Thái Bình Yêu Thuật', type: 'equip', slot: 'armor', glyph: '太平' },
  // ----- Ngựa -----
  jueying: { label: 'Tuyệt Ảnh (+1)', type: 'equip', slot: 'defHorse' },
  dilu: { label: 'Đích Lư (+1)', type: 'equip', slot: 'defHorse' },
  zhuahuang: { label: 'Trảo Hoàng Phi Điện (+1)', type: 'equip', slot: 'defHorse' },
  hualiu: { label: 'Hoa Lưu (+1)', type: 'equip', slot: 'defHorse' },
  chitu: { label: 'Xích Thố (-1)', type: 'equip', slot: 'offHorse' },
  dayuan: { label: 'Đại Uyển (-1)', type: 'equip', slot: 'offHorse' },
  zixing: { label: 'Tử Tinh (-1)', type: 'equip', slot: 'offHorse' },
  jingfan: { label: 'Kinh Phàm (-1)', type: 'equip', slot: 'offHorse', glyph: '惊帆' },
  liulong: { label: 'Lục Long Tham Giá', type: 'equip', slot: 'offHorse', glyph: '六龙' },
  // ----- Bảo vật -----
  yuxi: { label: 'Ngọc Tỷ', type: 'equip', slot: 'treasure' },
  muniu: { label: 'Mộc Ngưu Lưu Mã', type: 'equip', slot: 'treasure' },
  mingzhu: { label: 'Định Lan Dạ Minh Châu', type: 'equip', slot: 'treasure' },
  zhaoshu: { label: 'Chiếu Thư', type: 'equip', slot: 'treasure', glyph: '诏书' },
};

// Mô tả theo bản Việt hóa QSanguosha-Hegemony
for (const [k, v] of Object.entries(CARD_DESC)) {
  const info = (CARD_INFO as Record<string, CardInfo>)[k];
  if (info && !info.desc) info.desc = v;
}

export const EQUIP_SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: 'Vũ khí', armor: 'Giáp', defHorse: 'Ngựa +1', offHorse: 'Ngựa -1', treasure: 'Bảo vật',
};

const SUIT_SYMBOL: Record<Suit, string> = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_CODE: Record<string, Suit> = { S: 'spade', H: 'heart', C: 'club', D: 'diamond' };

/** Đọc chuỗi kiểu "S7 H10 D1" thành danh sách [chất, điểm]. */
/**
 * Đọc chuỗi kiểu "S7 H10 D1" thành danh sách [chất, điểm, cờ].
 * Hậu tố "*" = lá có dấu Hợp (Hợp Tung), "!" = lá để riêng ngoài ván lúc đầu.
 */
function parseCards(spec: string): [Suit, number, { transferable?: boolean; setAside?: boolean }][] {
  return spec.trim().split(/\s+/).map((code) => {
    const m = /^([SHCD])(\d+)([*!]*)$/.exec(code);
    if (!m) throw new Error(`Mã lá bài sai: ${code}`);
    return [SUIT_CODE[m[1]], Number(m[2]), { ...(m[3].includes('*') ? { transferable: true } : {}), ...(m[3].includes('!') ? { setAside: true } : {}) }];
  });
}

export type DeckEntry = [CardName, string, ('fire' | 'thunder')?];

export function build(entries: DeckEntry[]): Card[] {
  const deck: Card[] = [];
  let id = 1;
  for (const [name, spec, nature] of entries) {
    for (const [suit, rank, flags] of parseCards(spec)) {
      deck.push({ id: id++, name, suit, rank, type: CARD_INFO[name].type, ...(nature ? { nature } : {}), ...flags });
    }
  }
  return deck;
}

/** Bộ bài giai đoạn 1: 30 Sát, 15 Thiểm, 8 Đào (53 lá). Giữ nguyên để test cũ không đổi. */
export function buildDeck(): Card[] {
  return build([
    ['sha', 'S7 S8 S8 S9 S9 S10 S10 C2 C3 C4 C5 C6 C7 C8 C8 C9 C9 C10 C10 C11 C11 H10 H10 H11 D6 D7 D8 D9 D10 D13'],
    ['shan', 'H2 H2 H13 D2 D2 D3 D4 D5 D6 D7 D8 D9 D10 D11 D11'],
    ['tao', 'H3 H4 H6 H7 H8 H9 H12 D12'],
  ]);
}

/**
 * Bộ bài Quốc Chiến TIÊU CHUẨN 108 lá — đúng theo mã nguồn QSanguosha-Hegemony (standard-basics/equips/tricks).
 */
export const QUOCCHIEN_BASE: DeckEntry[] = [
  // ----- Cơ bản (54) -----
  ['sha', 'S5 S7 S8 S8 S9 S10 S11 C2 C3 C4 C5 C8 C9 C10 C11 C11 H10 H12 D10 D11 D12'],
  ['sha', 'H4 D4 D5', 'fire'],
  ['sha', 'S6 S7 C6 C7 C8', 'thunder'],
  ['shan', 'H2 H11 H13 D2 D3 D6 D7 D7 D8 D8 D9 D10 D11 D13'],
  ['tao', 'H4 H6 H7 H8 H9 H10 H12 D2'],
  ['jiu', 'S9 C9 D9'],
  // ----- Trang bị (20) -----
  ['zhuge', 'D1'], ['cixiong', 'S2'], ['qinggang', 'S6'], ['hanbing', 'S2'], ['zhangba', 'S12'], ['zhuque', 'D1'],
  ['guanshi', 'D5'], ['qilin', 'H5'], ['liujian', 'D6'], ['sanjian', 'D12'],
  ['bagua', 'S2'], ['renwang', 'C2'], ['tengjia', 'C2'], ['baiyin', 'C1'],
  ['jueying', 'S5'], ['dilu', 'C5'], ['zhuahuang', 'H13'], ['chitu', 'H5'], ['dayuan', 'S13'], ['zixing', 'D13'],
  // ----- Cẩm nang (34) -----
  ['wugu', 'H3'], ['taoyuan', 'H1'], ['nanman', 'S13 C7'], ['wanjian', 'H1'], ['juedou', 'S1 C1'], ['wuzhong', 'H7 H8'],
  ['shunshou', 'S3 S4 D3'], ['guohe', 'S3 S4 H12'], ['tiesuo', 'S12 C12 C13'], ['huogong', 'H2 H3'], ['jiedao', 'C12'],
  ['wuxie', 'S11'], ['wuxie_guo', 'C13 D12'], ['yiyi', 'H11 D4'], ['zhiji', 'C3 C4'], ['yuanjiao', 'H9'],
  ['lebu', 'C6 H6'], ['bingliang', 'S10 C10'], ['shandian', 'S1'],
];

/**
 * Bộ mở rộng Thế Bị Thiên (势备篇) — theo strategic-advantage.cpp. Dấu "*" = lá có dấu Hợp (Hợp Tung).
 */
export const THEBI_EXPANSION: DeckEntry[] = [
  ['sha', 'S4 S7 S8 H10 H11 C4 C6 C7 C8'],
  ['sha', 'S9 S10 S11* C5*', 'thunder'],
  ['sha', 'D8 D9', 'fire'],
  ['jiu', 'S6* C9'],
  ['shan', 'H4 H5 H6 H7 D6 D7 D13'],
  ['tao', 'H8 H9 D2 D3*'],
  ['xietianzi', 'S1* D1* D4*'], ['huoshao', 'S3* H12* C11*'], ['lulitongxin', 'S12 C10'], ['wuxie', 'S13'],
  ['lianjun', 'H1'], ['diaohu', 'H2 D10*'], ['shuiyan', 'H13 C12'], ['chiling', 'C3'], ['wuxie_guo', 'C13 D11'],
  ['mingguang', 'S2'], ['qinglong_qc', 'S5'], ['jingfan', 'H3*'], ['yuxi', 'C1'], ['huxinjing', 'C2*'], ['muniu', 'D5'],
  ['fangtian_qc', 'D12'],
];

/**
 * Lá của quân chủ và Bất Thần. Phi Long Đoạt Phượng, Thái Bình Yêu Thuật, Định Lan Dạ Minh Châu theo mã nguồn;
 * Lục Long Tham Giá: chất/điểm tạm đặt. Dấu "!" = để riêng ngoài ván lúc đầu (Chiếu Thư vào chồng bài nhờ Sắc Lệnh;
 * 4 cẩm nang thế lực chỉ nhận được qua Chiếu Thư).
 */
export const QUAN_EXPANSION: DeckEntry[] = [
  ['feilong', 'S2'], ['taiping', 'H3'], ['mingzhu', 'D13'], ['liulong', 'C13'],
  ['zhaoshu', 'C1!'], ['haoling', 'S12!'], ['kefu', 'H12!'], ['guguo', 'D12!'], ['wenhe', 'C12!'],
];

/** Bộ Quốc Chiến đầy đủ (mặc định): tiêu chuẩn + Thế Bị Thiên + lá quân chủ / Bất Thần. deck.json trong content/ sửa bộ này. */
export const STANDARD_DECK: DeckEntry[] = [...QUOCCHIEN_BASE, ...THEBI_EXPANSION, ...QUAN_EXPANSION];

export function buildStandardDeck(): Card[] {
  return build(STANDARD_DECK);
}

/**
 * Bộ bài Quân Tranh (军争) 160 lá — theo bảng chất/điểm trên wiki Tam Quốc Sát (người dùng cung cấp).
 * Không có các cẩm nang riêng của Quốc Chiến (Tri Kỷ, Viễn Giao, Dĩ Dật, Vô Giải·Quốc).
 */
export const QUANTRANH_DECK: DeckEntry[] = [
  ['taoyuan', 'H1'],
  ['zhuge', 'D1 C1'],
  ['shandian', 'S1 H12'],
  ['wanjian', 'H1'],
  ['juedou', 'D1 C1 S1'],
  ['wuxie', 'H1 S11 C12 D12 C13 H13 S13'],
  ['zhuque', 'D1'],
  ['baiyin', 'C1'],
  ['guding', 'S1'],
  ['shan', 'H2 D2 H2 D2 D3 D4 D5 D6 D6 D7 D7 D8 H8 D8 D9 H9 D10 D10 D11 D11 H11 D11 H12 H13'],
  ['sha', 'C2 C3 C4 C5 D6 C6 D7 C7 S7 D8 C8 S8 C8 S8 D9 C9 S9 C9 S9 H10 D10 C10 S10 H10 C10 S10 H11 C11 C11 D13'],
  ['cixiong', 'S2'],
  ['bagua', 'C2 S2'],
  ['huogong', 'H2 H3 D12'],
  ['tao', 'D2 H3 D3 H4 H5 H6 H6 H7 H8 H9 H12 D12'],
  ['tengjia', 'C2 S2'],
  ['renwang', 'C2'],
  ['hanbing', 'S2'],
  ['shunshou', 'S3 D3 S4 D4 S11'],
  ['wugu', 'H3 H4'],
  ['guohe', 'C3 S3 C4 S4 H12 S12'],
  ['jiu', 'C3 S3 D9 C9 S9'],
  ['sha', 'H4 D4 D5 H7 H10', 'fire'],
  ['bingliang', 'C4 S10'],
  ['sha', 'S4 C5 S5 C6 S6 C7 S7 C8 S8', 'thunder'],
  ['chitu', 'H5'],
  ['dilu', 'C5'],
  ['jueying', 'S5'],
  ['qilin', 'H5'],
  ['guanshi', 'D5'],
  ['qinglong', 'S5'],
  ['qinggang', 'S6'],
  ['lebu', 'H6 C6 S6'],
  ['wuzhong', 'H7 H8 H9 H11'],
  ['nanman', 'C7 S7 S13'],
  ['tiesuo', 'C10 C11 S11 C12 S12 C13'],
  ['jiedao', 'C12 C13'],
  ['zhangba', 'S12'],
  ['fangtian', 'D12'],
  ['zhuahuang', 'H13'],
  ['zixing', 'D13'],
  ['dayuan', 'S13'],
  ['hualiu', 'D13'],
];

/**
 * Bộ bài Ứng Biến — theo bảng chất/điểm người dùng cung cấp (161 lá), đã bỏ 18 lá chưa dùng:
 * Thái Công Âm Phù, Tùy Cơ Ứng Biến, Trục Cận Khí Viễn ×4, Xuất Kỳ Bất Ý ×2, Động Chúc Tiên Cơ ×4,
 * Hộ Tâm Kính, Hắc Quang Khải, Thiên Cơ Đồ, Đồng Tước, Ngũ Hành Hạc Linh Phiến, Ô Thiết Tỏa Liên.
 * Không có hiệu ứng "ứng biến"; Băng Sát tính là Sát thường; Bát Quái Đồ = Bát Quái Trận.
 */
export const UNGBIEN_DECK: DeckEntry[] = [
  ['juedou', 'S1 C1 D1'],
  ['guding', 'S1'],
  ['cixiong', 'S2'],
  ['bagua', 'S2'],
  ['tengjia', 'S2 C2'],
  ['jiu', 'S3 S9 C3 C9 D9'],
  ['shuiyan', 'S3 S4'],
  ['sha', 'S4 S5 S6 C5 C6 C7 C8 C9 C9 C10 C10', 'thunder'],
  ['guohe', 'S4 H2 H12'],
  ['qinglong', 'S5'],
  ['jueying', 'S5'],
  ['lebu', 'S6 H6 C6'],
  ['qinggang', 'S6'],
  ['sha', 'S7 S7 S8 S8 S8 S9 S9 S10 S10 H10 H10 H11 C2 C3 C4 C5 C6 C7 C8 C8 C11 C11 D6 D7 D8 D9 D13'],
  ['nanman', 'S7 S13 C7'],
  ['bingliang', 'S10 C4'],
  ['wuxie', 'S11 S13 H1 H13 C12 C13 D12'],
  ['shunshou', 'S11 D3 D4'],
  ['tiesuo', 'S11 S12 C10 C11 C12 C13'],
  ['zhangba', 'S12'],
  ['dayuan', 'S13'],
  ['taoyuan', 'H1'],
  ['wanjian', 'H1'],
  ['shan', 'H2 H2 H8 H9 H11 H12 H13 D2 D2 D3 D4 D5 D6 D6 D7 D7 D8 D8 D9 D10 D10 D11 D11 D11'],
  ['wugu', 'H3 H4'],
  ['tao', 'H3 H4 H5 H6 H6 H7 H8 H9 H12 D2 D3 D12'],
  ['sha', 'H4 H7 H10 D4 D5 D10', 'fire'],
  ['chitu', 'H5'],
  ['qilin', 'H5'],
  ['shandian', 'H12'],
  ['zhuahuang', 'H13'],
  ['zhuge', 'C1 D1'],
  ['renwang', 'C2'],
  ['dilu', 'C5'],
  ['guanshi', 'D5'],
  ['muniu', 'D5'],
  ['zixing', 'D13'],
  ['hualiu', 'D13'],
];

export interface DeckDef {
  id: string;
  label: string;
  desc: string;
  entries: DeckEntry[];
}

/** Các bộ bài chọn được khi tạo phòng. `quocchien` dùng chung mảng STANDARD_DECK nên deck.json trong content/ vẫn áp dụng. */
export const DECKS: Record<string, DeckDef> = {
  quocchien: { id: 'quocchien', label: 'Quốc Chiến đầy đủ', desc: 'Bộ mặc định: Quốc Chiến tiêu chuẩn + Thế Bị Thiên (bảo vật, Hợp Tung, Hỏa Thiêu Liên Doanh...) + lá quân chủ / Bất Thần.', entries: STANDARD_DECK },
  quocchien_coban: { id: 'quocchien_coban', label: 'Quốc Chiến tiêu chuẩn', desc: 'Chỉ 108 lá tiêu chuẩn của Quốc Chiến (không có Thế Bị Thiên).', entries: QUOCCHIEN_BASE },
  ungbien: { id: 'ungbien', label: 'Ứng Biến', desc: 'Bộ Ứng Biến (bỏ các lá chưa hỗ trợ). Có Thủy Yêm Thất Quân, Mộc Ngưu Lưu Mã; Băng Sát tính là Sát thường.', entries: UNGBIEN_DECK },
  quantranh: { id: 'quantranh', label: 'Quân Tranh', desc: 'Bộ Quân Tranh: thêm Hỏa/Lôi Sát, Rượu, Tá Đao Sát Nhân, Ngũ Cốc Phong Đăng, Thư Hùng, Trượng Bát, Chu Tước, Hoa Lưu.', entries: QUANTRANH_DECK },
};

export const DEFAULT_DECK = 'quocchien';

/** Tạo bộ bài theo id (id lạ -> bộ mặc định). */
export function buildDeckById(id: string | undefined): Card[] {
  return build((DECKS[id ?? ''] ?? DECKS[DEFAULT_DECK]).entries);
}

/** Số lá của một bộ (Quốc Chiến có thể thay đổi theo content/deck.json). */
export function deckSize(id: string): number {
  return build(DECKS[id]?.entries ?? []).length;
}

/** "Quân Tranh (160 lá)" */
export function deckLabel(id: string): string {
  const d = DECKS[id];
  return d ? `${d.label} (${deckSize(id)} lá)` : id;
}

/** Ví dụ: "Sát ♠7", "Hỏa Sát ♥4" */
export function cardLabel(card: Card): string {
  if (card.virtual) return `${CARD_INFO[card.name]?.label ?? card.name} (ảo)`;
  const prefix = card.nature === 'fire' ? 'Hỏa ' : card.nature === 'thunder' ? 'Lôi ' : '';
  return `${prefix}${CARD_INFO[card.name].label} ${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`;
}

export function isRed(card: Card): boolean {
  return card.suit === 'heart' || card.suit === 'diamond';
}

export function isBlack(card: Card): boolean {
  return !isRed(card);
}

/**
 * Giá trị giữ lại của một lá (cao = quý, bỏ sau cùng). Dùng cho bot và khi người chơi hết giờ bỏ bài.
 * Ưu tiên giữ: Đào > Vô Giải Khả Kích > Thiểm > Rượu; sau đó mới đến cẩm nang, Sát, trang bị.
 */
export function keepValue(card: Card): number {
  switch (card.name) {
    case 'tao': return 10;
    case 'wuxie': case 'wuxie_guo': return 9;
    case 'shan': return 8;
    case 'jiu': return 7;
    case 'wuzhong': case 'yiyi': return 5;
    case 'sha': return card.nature ? 4.5 : 4;
    default: {
      const t = CARD_INFO[card.name]?.type;
      return t === 'trick' ? 4.2 : t === 'delayed' ? 3 : t === 'equip' ? 2 : 3;
    }
  }
}

/** Chọn `count` lá nên bỏ trong `ids` (giữ lá quý; cùng giá trị thì bỏ lá đến sau). */
export function pickDiscards(ids: number[], count: number, cardOf: (id: number) => Card): number[] {
  return ids.map((id, i) => ({ id, i, v: keepValue(cardOf(id)) }))
    .sort((a, b) => a.v - b.v || b.i - a.i)
    .slice(0, Math.max(0, count)).map((x) => x.id);
}
