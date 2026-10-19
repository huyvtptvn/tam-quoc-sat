// ============================================================
// Dữ liệu tướng Quốc Chiến (32 tướng, 8 tướng mỗi thế lực).
// Kỹ năng theo bản Việt hóa QSanguosha-Hegemony (content/import/qsgs-viet.json), giai đoạn 12.
// Số âm dương ngư (halfHp) mang tính tham khảo: hãy chỉnh theo bộ luật bạn chọn.
// Các dòng ghi "cân bằng" đã được chỉnh dựa trên mô phỏng với bộ bài đầy đủ (giai đoạn 4, xem README).
// ============================================================

/**
 * Thế lực. 'ye' = tướng Dã tâm gia (野): chỉ làm CHỦ tướng, ghép với phó tướng thế lực bất kỳ;
 * lật tướng là trở thành dã tâm gia (một phe riêng).
 */
export type Kingdom = 'wei' | 'shu' | 'wu' | 'qun' | 'ye';

/** Bốn thế lực chính (không gồm Dã tâm gia). */
export const KINGDOMS: Kingdom[] = ['wei', 'shu', 'wu', 'qun'];

export const KINGDOM_LABEL: Record<Kingdom, string> = {
  wei: 'Ngụy', shu: 'Thục', wu: 'Ngô', qun: 'Quần', ye: 'Dã tâm gia',
};

export interface General {
  id: string;
  name: string;
  kingdom: Kingdom;
  /** Số âm dương ngư. Mỗi con cá = nửa máu. Máu tối đa = (cá chủ tướng + cá phó tướng) / 2, làm tròn xuống. */
  halfHp: number;
  skills: string[];
  /** Tướng nữ (Thư Hùng Song Cổ Kiếm, Kết Nhân...). Bỏ trống = nam, trừ khi có trong FEMALE_GENERALS. */
  female?: boolean;
  /**
   * Quân chủ (君主), id dạng "lord_<id tướng thường>". Không được chia khi chọn tướng; người chọn tướng thường tương ứng
   * làm chủ tướng được hỏi có đổi thành quân chủ không.
   */
  lord?: boolean;
  /**
   * Tướng 2 thế lực (双势力), ví dụ ['wei', 'shu']. Chỉ được làm PHÓ tướng; chủ tướng phải thuộc 1 trong 2 thế lực này
   * và chủ tướng quyết định phe. `kingdom` = thế lực đầu tiên (để hiển thị / tương thích).
   */
  kingdoms?: Kingdom[];
}

/** Các thế lực in trên tướng (2 nếu là tướng 2 thế lực). */
export function kingdomsOf(id: string): Kingdom[] {
  const g = getGeneral(id);
  return g.kingdoms && g.kingdoms.length > 1 ? g.kingdoms : [g.kingdom];
}

/** Tướng 2 thế lực. */
export function isDualGeneral(id: string): boolean {
  return isGeneralId(id) && kingdomsOf(id).length > 1;
}

/** Tướng nữ có sẵn (kể cả gói tướng mới). Tướng thêm bằng JSON có thể ghi "gender": "female". */
export const FEMALE_GENERALS = new Set([
  'zhenji', 'diaochan', 'sunshangxiang', 'daqiao', 'xiaoqiao', 'huangyueying', 'zhurong', 'ganfuren', 'mifuren',
  'caiwenji', 'zoushi', 'hetaihou', 'bianhuanghou', 'zhangchunhua', 'wuguotai', 'luyusheng', 'lvlingqi', 'beimihu',
]);

export const GENERALS: General[] = [
  // ---- Ngụy ----
  { id: 'caocao', name: 'Tào Tháo', kingdom: 'wei', halfHp: 5, skills: ['gianhung'] }, // cân bằng: 4 -> 5
  { id: 'simayi', name: 'Tư Mã Ý', kingdom: 'wei', halfHp: 3, skills: ['phanquy', 'guicai'] },
  { id: 'guojia', name: 'Quách Gia', kingdom: 'wei', halfHp: 3, skills: ['tiandu', 'dike'] },
  { id: 'xuchu', name: 'Hứa Chử', kingdom: 'wei', halfHp: 4, skills: ['loay'] },
  { id: 'xiahoudun', name: 'Hạ Hầu Đôn', kingdom: 'wei', halfHp: 4, skills: ['cuonglie'] },
  { id: 'zhangliao', name: 'Trương Liêu', kingdom: 'wei', halfHp: 4, skills: ['dottap'] },
  { id: 'dianwei', name: 'Điển Vi', kingdom: 'wei', halfHp: 4, skills: ['cuongtap'] },
  { id: 'zhenji', name: 'Chân Cơ', kingdom: 'wei', halfHp: 3, skills: ['lacthan', 'khuynhquoc'] },
  // ---- Thục ----
  { id: 'zhangfei', name: 'Trương Phi', kingdom: 'shu', halfHp: 4, skills: ['baohao'] },
  { id: 'zhaoyun', name: 'Triệu Vân', kingdom: 'shu', halfHp: 4, skills: ['longdam'] },
  { id: 'guanyu', name: 'Quan Vũ', kingdom: 'shu', halfHp: 5, skills: ['vothanh'] },
  { id: 'zhugeliang', name: 'Gia Cát Lượng', kingdom: 'shu', halfHp: 3, skills: ['guanxing', 'khongthanh'] },
  { id: 'liubei', name: 'Lưu Bị', kingdom: 'shu', halfHp: 4, skills: ['nhanduc'] },
  { id: 'machao', name: 'Mã Siêu', kingdom: 'shu', halfHp: 4, skills: ['mathuat', 'thietky'] },
  { id: 'huangzhong', name: 'Hoàng Trung', kingdom: 'shu', halfHp: 4, skills: ['lietcung'] },
  { id: 'jiangwei', name: 'Khương Duy', kingdom: 'shu', halfHp: 4, skills: ['khieuhan', 'yizhi', 'thienphu'] },
  // ---- Ngô ----
  { id: 'lvmeng', name: 'Lữ Mông', kingdom: 'wu', halfHp: 4, skills: ['khacky', 'mouduan'] },
  { id: 'huanggai', name: 'Hoàng Cái', kingdom: 'wu', halfHp: 4, skills: ['khonhuc'] },
  { id: 'sunquan', name: 'Tôn Quyền', kingdom: 'wu', halfHp: 4, skills: ['chehoanh'] },
  { id: 'luxun', name: 'Lục Tốn', kingdom: 'wu', halfHp: 3, skills: ['qianxun', 'duoshi'] },
  { id: 'zhouyu', name: 'Chu Du', kingdom: 'wu', halfHp: 3, skills: ['anhtu', 'phangian'] },
  { id: 'sunce', name: 'Tôn Sách', kingdom: 'wu', halfHp: 4, skills: ['kichngang', 'yingyang', 'hunshang'] },
  { id: 'dingfeng', name: 'Đinh Phụng', kingdom: 'wu', halfHp: 4, skills: ['doanbinh', 'phantan'] },
  { id: 'zhoutai', name: 'Chu Thái', kingdom: 'wu', halfHp: 4, skills: ['batkhuat', 'fenji'] },
  // ---- Quần ----
  { id: 'lvbu', name: 'Lữ Bố', kingdom: 'qun', halfHp: 5, skills: ['vosong'] },
  { id: 'huatuo', name: 'Hoa Đà', kingdom: 'qun', halfHp: 3, skills: ['chuli', 'capcuu'] },
  { id: 'pangde', name: 'Bàng Đức', kingdom: 'qun', halfHp: 4, skills: ['jianchu'] },
  { id: 'jiaxu', name: 'Giả Hủ', kingdom: 'qun', halfHp: 3, skills: ['hoansat', 'weimu', 'luanwu'] },
  { id: 'diaochan', name: 'Điêu Thuyền', kingdom: 'qun', halfHp: 3, skills: ['lijian', 'benguyet'] },
  { id: 'zhangjiao', name: 'Trương Giác', kingdom: 'qun', halfHp: 3, skills: ['loikich', 'guidao'] },
  { id: 'gongsunzan', name: 'Công Tôn Toản', kingdom: 'qun', halfHp: 4, skills: ['qushi', 'yanxing', 'yicong'] },
  { id: 'liubiao', name: 'Lưu Biểu', kingdom: 'qun', halfHp: 3, skills: ['tuthu', 'tongthat'] },
];

/**
 * Các cặp "Châu Liên Bích Hợp": lật đủ 2 tướng là một cặp thì nhận ký hiệu.
 * Danh sách mang tính tham khảo, hãy chỉnh theo bộ luật bạn chọn.
 */
export const PAIRS: [string, string][] = [
  ['caocao', 'dianwei'], ['caocao', 'xuchu'],
  ['liubei', 'guanyu'], ['liubei', 'zhangfei'], ['liubei', 'zhugeliang'], ['zhugeliang', 'jiangwei'],
  ['sunce', 'zhouyu'], ['sunquan', 'zhoutai'],
  ['lvbu', 'diaochan'],
];

export function isPair(a: string, b: string): boolean {
  return PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

const BY_ID = new Map(GENERALS.map((g) => [g.id, g]));

/** Gọi sau khi thêm/sửa/xóa tướng trong GENERALS (bộ nạp nội dung dùng). */
export function reindexGenerals(): void {
  BY_ID.clear();
  for (const g of GENERALS) BY_ID.set(g.id, g);
}

export function getGeneral(id: string): General {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`Tướng ${id} không tồn tại`);
  return g;
}

export function isGeneralId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** `id` là tướng quân chủ. */
export function isLordId(id: unknown): boolean {
  return typeof id === 'string' && !!BY_ID.get(id)?.lord;
}

/** Id quân chủ tương ứng với tướng thường (nếu có), ví dụ liubei -> lord_liubei. */
export function lordVersionOf(id: string): string | null {
  const l = `lord_${id}`;
  return isLordId(l) ? l : null;
}
