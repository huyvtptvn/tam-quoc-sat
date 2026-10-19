// ============================================================
// Nhập ảnh tướng từ gói ảnh tham khảo vào game.
//
//   Kéo thư mục gói ảnh thả vào Nhap-Anh-Tuong.bat
//   hoặc: node tools/nhap-anh-tuong.mjs "D:\goi-anh\generals" [--ghi-de] [--chi-co-san]
//
// Gói ảnh có dạng <tên tướng>/<số bộ ảnh>/full.png (ví dụ caocao/1/full.png).
// Danh sách ánh xạ "thư mục gói -> id tướng trong game" nằm ở content/import/danh-sach-tuong.json.
// Mỗi tướng lấy 1 ảnh: bộ ảnh ghi trong "skin", không ghi thì lấy bộ có số nhỏ nhất có full.png.
// Ảnh được chép thành content/images/generals/<id>.png (hoặc .jpg).
//
//   --ghi-de      chép đè cả những tướng đã có ảnh (mặc định: giữ ảnh cũ)
//   --chi-co-san  chỉ nhập ảnh cho tướng đã có trong game
// ============================================================
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = join(ROOT, 'content', 'import', 'danh-sach-tuong.json');
const OUT = join(ROOT, 'content', 'images', 'generals');
const EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
let packDir = args.find((a) => !a.startsWith('--'));

/** Đọc 12 byte đầu để biết đúng là PNG / JPG không. */
function imageExt(file) {
  const buf = Buffer.alloc(12);
  const fd = openSync(file, 'r');
  readSync(fd, buf, 0, 12, 0);
  closeSync(fd);
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

/** Tìm thư mục chứa các thư mục tướng (cho phép người dùng kéo nhầm thư mục cha). */
function findPackRoot(dir, depth = 0) {
  if (existsSync(join(dir, 'caocao')) || existsSync(join(dir, 'liubei')) || existsSync(join(dir, 'sunquan'))) return dir;
  if (depth >= 3) return null;
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name);
    try { if (statSync(sub).isDirectory()) { const r = findPackRoot(sub, depth + 1); if (r) return r; } } catch { /* bỏ qua */ }
  }
  return null;
}

/** Chọn file ảnh cho một tướng. */
function pickImage(genDir, skin) {
  const skins = readdirSync(genDir).filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(a) - Number(b));
  const order = skin != null ? [String(skin), ...skins.filter((s) => s !== String(skin))] : skins;
  for (const s of order) {
    for (const f of ['full.png', 'full.jpg', 'card.jpg', 'avatar.png']) {
      const p = join(genDir, s, f);
      if (existsSync(p)) return { file: p, skin: s };
    }
  }
  for (const f of ['full.png', 'card.jpg', 'avatar.png']) if (existsSync(join(genDir, f))) return { file: join(genDir, f), skin: '-' };
  return null;
}

async function main() {
  console.log('Nhập ảnh tướng từ gói tham khảo\n');
  if (!packDir) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    packDir = (await rl.question('Kéo thư mục gói ảnh vào đây (hoặc gõ đường dẫn) rồi Enter:\n> ')).trim().replace(/^["']|["']$/g, '');
    rl.close();
  }
  if (!packDir || !existsSync(packDir)) { console.log(`✗ Không thấy thư mục: ${packDir || '(trống)'}`); process.exitCode = 1; return; }
  const root = findPackRoot(resolve(packDir));
  if (!root) { console.log('✗ Trong thư mục này không thấy các thư mục tướng (caocao, liubei, ...).'); process.exitCode = 1; return; }
  console.log(`Gói ảnh: ${root}`);

  const list = JSON.parse(readFileSync(LIST, 'utf8')).tuong;
  mkdirSync(OUT, { recursive: true });
  const done = [], kept = [], missing = [], big = [];

  for (const e of list) {
    if (flag('--chi-co-san') && e.status !== 'co-san') continue;
    const genDir = join(root, e.pack);
    if (!existsSync(genDir)) { missing.push(`${e.pack} (không có thư mục)`); continue; }
    const pick = pickImage(genDir, e.skin);
    if (!pick) { missing.push(`${e.pack} (không có full.png / card.jpg)`); continue; }
    const ext = imageExt(pick.file);
    if (!ext) { missing.push(`${e.pack} (file không phải ảnh)`); continue; }
    const existing = EXTS.map((x) => join(OUT, e.id + x)).filter(existsSync);
    if (existing.length && !flag('--ghi-de')) { kept.push(e.id); continue; }
    for (const f of existing) unlinkSync(f);
    copyFileSync(pick.file, join(OUT, e.id + ext));
    const mb = statSync(pick.file).size / 1024 / 1024;
    if (mb > 1.5) big.push(`${e.id} (${mb.toFixed(1)} MB)`);
    done.push(`${e.name} ← ${e.pack}/${pick.skin}`);
  }

  console.log(`\n✓ Đã nhập ${done.length} ảnh vào content/images/generals/`);
  for (const d of done) console.log(`   ${d}`);
  if (kept.length) console.log(`\n• Giữ nguyên ${kept.length} tướng đã có ảnh (thêm --ghi-de để chép đè): ${kept.join(', ')}`);
  if (missing.length) console.log(`\n! Không lấy được ${missing.length}: ${missing.join('; ')}`);
  if (big.length) console.log(`\n! ${big.length} ảnh lớn hơn 1,5 MB, trang game sẽ tải chậm hơn. Có thể thu nhỏ còn khoảng 600×800: ${big.join(', ')}`);
  console.log('\nXong. Nếu server đang chạy, chỉ cần tải lại trang game (F5).');
  console.log('Muốn đổi sang bộ ảnh khác của một tướng: sửa "skin" của tướng đó trong content/import/danh-sach-tuong.json rồi chạy lại với --ghi-de.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
