// ============================================================
// Hình ảnh lá bài và tướng.
//
//   content/images/cards/<loại bài>.webp|png|jpg|gif     ví dụ: sha.png, tao.webp, binh_phap.jpg
//   content/images/cards/sha_fire.png, sha_thunder.png    (tùy chọn) ảnh riêng cho Hỏa Sát / Lôi Sát
//   content/images/cards/back.png                         (tùy chọn) mặt sau lá bài
//   content/images/generals/<id tướng>.webp|png|jpg|gif   ví dụ: caocao.jpg, chen_gong.png
//
// Không có ảnh -> client tự vẽ mặt bài / chân dung mặc định.
// Không nhận SVG (SVG có thể chứa script).
// ============================================================
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export const IMAGE_KINDS = ['cards', 'generals'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

const EXT_OF: Record<string, string> = { png: '.png', jpeg: '.jpg', webp: '.webp', gif: '.gif' };
export const IMAGE_EXTS = ['.webp', '.png', '.jpg', '.jpeg', '.gif'];
export const IMAGE_MIME: Record<string, string> = {
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const KEY_RE = /^[a-z][a-z0-9_]*$/;

/** Nhận dạng ảnh theo "chữ ký" đầu file, không tin vào đuôi file hay content-type. */
export function detectImage(buf: Buffer): keyof typeof EXT_OF | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}

export class ImageStore {
  constructor(private readonly root: string) {}

  dir(kind: ImageKind): string {
    return join(this.root, kind);
  }

  private check(kind: string, key: string): asserts kind is ImageKind {
    if (!(IMAGE_KINDS as readonly string[]).includes(kind)) throw new Error('Loại ảnh chỉ nhận "cards" hoặc "generals"');
    if (!KEY_RE.test(key)) throw new Error('Tên ảnh phải viết thường, không dấu, chỉ gồm a-z 0-9 _ (trùng id lá bài / id tướng)');
  }

  /** Bảng { id -> url } cho mỗi loại; url kèm ?v=thời-gian-sửa để trình duyệt không giữ ảnh cũ. */
  index(): Record<ImageKind, Record<string, string>> {
    const out = { cards: {}, generals: {} } as Record<ImageKind, Record<string, string>>;
    for (const kind of IMAGE_KINDS) {
      const d = this.dir(kind);
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d)) {
        const ext = extname(f).toLowerCase();
        const key = f.slice(0, -ext.length);
        if (!IMAGE_EXTS.includes(ext) || !KEY_RE.test(key)) continue;
        out[kind][key] = `/images/${kind}/${f}?v=${Math.round(statSync(join(d, f)).mtimeMs)}`;
      }
    }
    return out;
  }

  /** Lưu ảnh; xóa các bản cùng tên khác đuôi. Trả về url mới. */
  save(kind: string, key: string, buf: Buffer): string {
    this.check(kind, key);
    if (buf.length > MAX_IMAGE_BYTES) throw new Error(`Ảnh quá lớn (tối đa ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
    const type = detectImage(buf);
    if (!type) throw new Error('File không phải ảnh PNG, JPG, WEBP hoặc GIF');
    const d = this.dir(kind);
    mkdirSync(d, { recursive: true });
    this.remove(kind, key);
    const file = `${key}${EXT_OF[type]}`;
    writeFileSync(join(d, file), buf);
    return `/images/${kind}/${file}?v=${Date.now()}`;
  }

  remove(kind: string, key: string): boolean {
    this.check(kind, key);
    let removed = false;
    for (const ext of IMAGE_EXTS) {
      const f = join(this.dir(kind), key + ext);
      if (existsSync(f)) { unlinkSync(f); removed = true; }
    }
    return removed;
  }

  /** Đường dẫn file thật cho url /images/<kind>/<file>, hoặc null nếu không hợp lệ. */
  resolve(kind: string, file: string): string | null {
    const ext = extname(file).toLowerCase();
    if (!(IMAGE_KINDS as readonly string[]).includes(kind) || !IMAGE_EXTS.includes(ext) || !KEY_RE.test(file.slice(0, -ext.length))) return null;
    const full = join(this.dir(kind as ImageKind), file);
    return existsSync(full) ? full : null;
  }
}
