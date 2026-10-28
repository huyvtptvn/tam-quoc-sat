// Service worker của Tam Quốc Sát (PWA).
// - Giao diện (HTML/JS/CSS): lấy bản mới từ mạng trước, mất mạng thì dùng bản đã lưu -> push lên server là người chơi có bản mới.
// - Ảnh tướng, ảnh bài, font, biểu tượng: lưu trên máy sau lần tải đầu (mở nhanh, đỡ tốn 4G).
// - Không đụng tới API, WebSocket, trang quản trị, âm thanh tải từng đoạn.
const VERSION = 'v1';
const SHELL = `tqs-shell-${VERSION}`;
const MEDIA = `tqs-media-${VERSION}`;
const MEDIA_MAX = 1500; // số file ảnh tối đa giữ trên máy

const SHELL_FILES = [
  '/game.html', '/ui/fonts.css', '/ui/cards.css', '/ui/game.css', '/ui/home.css', '/ui/theme.css',
  '/ui/cards.js', '/ui/game.js', '/ui/pwa.js', '/manifest.webmanifest', '/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== MEDIA) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isMedia = (p) => /^\/(skins|images|fonts|icons)\//.test(p) && !/\.(mp3|ogg|m4a|wav)$/i.test(p);
const isShell = (p) => p === '/' || /\.(html|js|css|webmanifest)$/.test(p) || p.startsWith('/ui/');

async function trim() {
  const c = await caches.open(MEDIA);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MEDIA_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/ws') || p.startsWith('/admin') || p === '/sw.js') return;

  if (isMedia(p)) {
    e.respondWith((async () => {
      const c = await caches.open(MEDIA);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) { c.put(req, res.clone()).then(trim).catch(() => {}); }
      return res;
    })());
    return;
  }

  if (req.mode === 'navigate' || isShell(p)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) { const c = await caches.open(SHELL); c.put(req, res.clone()).catch(() => {}); }
        return res;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('/game.html') : undefined)
          || new Response('Không có mạng', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
  }
});
