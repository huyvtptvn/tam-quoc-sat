// ============================================================
// Trình khởi động: bấm đúp Chay-Game.bat (Windows) / chay-game.command (macOS) / chay-game.sh (Linux).
//
//   1. Kiểm tra Node.js (cần bản 20 trở lên)
//   2. Lần đầu: tự chạy "npm install"
//   3. Tìm cổng trống (mặc định 3000), tạo mã quản trị cố định lưu ở file .admin-token
//   4. Bật server, chờ sẵn sàng rồi mở trình duyệt vào trang chính
//   5. Đóng cửa sổ này (hoặc Ctrl+C) là tắt server
//
// Không dùng thư viện ngoài để chạy được ngay cả khi chưa "npm install".
// ============================================================
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const say = (s = '') => console.log(s);
const line = () => say('─'.repeat(60));

function fail(msg) {
  say(`\n✗ ${msg}`);
  process.exitCode = 1;
}

/** Chạy lệnh, hiện kết quả ra màn hình, trả về mã thoát. */
function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin });
    p.on('exit', (code) => resolve(code ?? 1));
    p.on('error', () => resolve(1));
  });
}

/** Cổng có đang trống không. */
function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port);
  });
}

async function findPort(start) {
  for (let p = start; p < start + 20; p++) if (await portFree(p)) return p;
  return 0;
}

/** Mã quản trị: dùng ADMIN_TOKEN nếu có, không thì đọc/tạo file .admin-token để lần sau giữ nguyên. */
function adminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const f = join(ROOT, '.admin-token');
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8').trim();
    if (t) return t;
  }
  const t = randomBytes(9).toString('base64url');
  writeFileSync(f, t + '\n');
  return t;
}

function openBrowser(url) {
  const [cmd, args] = isWin ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: isWin }).unref();
  } catch {
    say(`(Không tự mở được trình duyệt, hãy mở: ${url})`);
  }
}

async function waitReady(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${url}/api/status`);
      if (r.ok) return await r.json();
    } catch { /* server chưa lên */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function main() {
  line();
  say(' Tam Quốc Sát · Quốc Chiến — trình khởi động');
  line();

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) return fail(`Cần Node.js 20 trở lên (máy đang có ${process.versions.node}). Tải tại https://nodejs.org (bản LTS).`);

  if (!existsSync(join(ROOT, 'node_modules', 'tsx')) || !existsSync(join(ROOT, 'node_modules', 'ws'))) {
    say('Lần chạy đầu: đang cài thư viện (npm install), mất khoảng 1 phút…\n');
    const code = await run('npm', ['install', '--no-audit', '--no-fund']);
    if (code !== 0) return fail('npm install thất bại. Kiểm tra kết nối mạng rồi chạy lại.');
  }

  const want = Number(process.env.PORT || 3000);
  const port = await findPort(want);
  if (!port) return fail(`Không tìm được cổng trống từ ${want} đến ${want + 19}.`);
  if (port !== want) say(`Cổng ${want} đang bận, dùng cổng ${port}.`);

  const token = adminToken();
  const url = `http://localhost:${port}`;
  say('Đang bật server…');

  const server = spawn(process.execPath, ['--import', 'tsx', 'src/server/server.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ADMIN_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Chỉ hiện nhật ký nội dung và lỗi; banner của server đã được thay bằng phần tóm tắt bên dưới.
  const relay = (buf) => {
    for (const l of String(buf).split(/\r?\n/)) {
      if (!l.trim() || /^\s+(Chơi|Kiểm thử|Quản trị|Nội dung):|^Server Tam Quốc Sát đang chạy/.test(l)) continue;
      say(l);
    }
  };
  server.stdout.on('data', relay);
  server.stderr.on('data', relay);
  server.on('exit', (code) => {
    say(`\nServer đã dừng${code ? ` (mã ${code})` : ''}.`);
    process.exit(code ?? 0);
  });
  const stop = () => { server.kill(); setTimeout(() => process.exit(0), 1500); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);

  const status = await waitReady(url);
  if (!status) {
    server.kill();
    return fail('Server không khởi động được. Xem thông báo lỗi phía trên.');
  }

  const lan = (status.lan || []).map((ip) => `http://${ip}:${port}/game.html`);
  say('');
  line();
  say(` Trang chính:     ${url}`);
  say(` Vào chơi:        ${url}/game.html`);
  say(` Quản trị:        ${url}/admin.html`);
  say(` Mã quản trị:     ${token}   (lưu trong file .admin-token)`);
  if (lan.length) say(` Bạn bè cùng wifi: ${lan.join('  hoặc  ')}`);
  line();
  say(' Giữ cửa sổ này mở trong lúc chơi. Đóng cửa sổ hoặc bấm Ctrl+C để tắt server.');
  say('');

  if (!process.env.NO_BROWSER) openBrowser(`${url}/#admin=${encodeURIComponent(token)}`);
}

main().catch((e) => fail(e?.stack || String(e)));
