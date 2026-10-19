// ============================================================
// Server: HTTP (trang web, API danh mục, API quản trị) + WebSocket (chơi game).
//
//   npm run server                       -> http://localhost:3000
//   PORT=8080 ADMIN_TOKEN=bimat CONTENT_DIR=./content npm run server
// ============================================================
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { CARD_INFO, DECKS, deckLabel, deckSize } from '../core/cards.js';
import { EVENT_SPECS } from '../content/events.js';
import { DISABLED_GENERALS } from '../content/loader.js';
import { FUNCTIONS } from '../content/expr.js';
import { ACTION_SPECS, GLOBAL_VARS, PLAYER_PROPS } from '../content/runtime.js';
import { GENERALS, KINGDOM_LABEL, PAIRS } from '../hegemony/generals.js';
import { SKILLS } from '../hegemony/skills.js';
import { AccountStore } from './accounts.js';
import { RANKS } from './elo.js';
import { BOSS_DIFFICULTY, BOSSES } from '../hegemony/boss.js';

/** Danh sách boss cho giao diện (tạo phòng, bảng xếp hạng). */
const bossCatalog = () => ({
  list: Object.values(BOSSES).map((b) => ({ id: b.id, name: b.name, desc: b.desc, roundLimit: b.roundLimit, phases: b.phases.map((p) => p.name) })),
  difficulties: Object.entries(BOSS_DIFFICULTY).map(([id, d]) => ({ id, label: d.label, winBonus: d.winBonus })),
});
import { ContentManager } from './content-manager.js';
import { SKIN_MIME, SkinStore, skinCoverage } from './skins.js';
import { IMAGE_MIME, ImageStore, MAX_IMAGE_BYTES } from './images.js';
import type { ClientMsg } from './protocol.js';
import { Lobby, type PlayerSession } from './rooms.js';

export interface ServerOptions {
  port?: number;
  contentDir?: string;
  adminToken?: string;
  publicDir?: string;
  watch?: boolean;
  quiet?: boolean;
  /** Bot chờ bao lâu trước khi đánh (ms). Mặc định 700, đặt 0 khi chạy test. */
  botDelayMs?: number;
  /** Thư mục lưu tài khoản và lịch sử ván. Mặc định ./data (biến môi trường DATA_DIR). */
  dataDir?: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

/** Danh mục công khai: client hiển thị tên tướng/kỹ năng/lá bài, trang quản trị hiển thị tài liệu. */
function catalog(images: ImageStore) {
  return {
    images: images.index(),
    generals: GENERALS.map((g) => ({ id: g.id, name: g.name, kingdom: g.kingdom, kingdomLabel: KINGDOM_LABEL[g.kingdom], halfHp: g.halfHp, skills: g.skills, ...(g.kingdoms && g.kingdoms.length > 1 ? { kingdoms: g.kingdoms, kingdomLabel: g.kingdoms.map((k) => KINGDOM_LABEL[k]).join('/') } : {}), ...(g.lord ? { lord: true } : {}), ...(g.art ? { art: g.art } : {}) })),
    disabledGenerals: DISABLED_GENERALS.map((g) => ({ id: g.id, name: g.name, kingdom: g.kingdom, kingdomLabel: KINGDOM_LABEL[g.kingdom], halfHp: g.halfHp, skills: g.skills })),
    pairs: PAIRS,
    bosses: bossCatalog(),
    decks: Object.values(DECKS).map((d) => ({ id: d.id, label: deckLabel(d.id), desc: d.desc, size: deckSize(d.id) })),
    skills: Object.fromEntries(Object.values(SKILLS).map((s) => [s.id, { name: s.name, desc: s.desc, origin: s.origin ?? 'builtin' }])),
    cards: Object.fromEntries(Object.entries(CARD_INFO).map(([k, v]) => [k, { label: v.label, type: v.type, slot: v.slot, range: v.range, desc: v.desc, glyph: v.glyph }])),
    dsl: {
      events: Object.fromEntries(Object.entries(EVENT_SPECS).map(([k, v]) => [k, { desc: v.desc, vars: v.vars, mods: v.mods }])),
      actions: Object.fromEntries(Object.entries(ACTION_SPECS).map(([k, v]) => [k, { desc: v.desc, mod: !!v.mod, params: v.params }])),
      globals: GLOBAL_VARS,
      playerProps: PLAYER_PROPS,
      functions: FUNCTIONS,
    },
  };
}

async function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  return (await readBuffer(req, limit)).toString('utf8');
}

async function readBuffer(req: IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('Nội dung quá lớn');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Địa chỉ IPv4 trong mạng LAN (để bạn bè cùng wifi vào chơi). */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

export async function startServer(opts: ServerOptions = {}) {
  const log = opts.quiet ? () => {} : console.log;
  const contentDir = resolve(opts.contentDir ?? process.env.CONTENT_DIR ?? join(ROOT, 'content'));
  const publicDir = resolve(opts.publicDir ?? join(ROOT, 'public'));
  const adminToken = opts.adminToken ?? process.env.ADMIN_TOKEN ?? randomBytes(9).toString('base64url');

  const images = new ImageStore(join(contentDir, 'images'));
  const skins = new SkinStore(join(contentDir, 'images', 'hero-skin'), join(contentDir, 'import', 'qsgs-viet.json'));
  let skinsVersion = -1;
  const lobby = new Lobby();
  lobby.botDelayMs = opts.botDelayMs ?? Number(process.env.BOT_DELAY_MS ?? 700);
  const dataDir = resolve(opts.dataDir ?? process.env.DATA_DIR ?? join(ROOT, 'data'));
  const accounts = new AccountStore(dataDir);
  lobby.accounts = accounts;
  const content = new ContentManager(contentDir, lobby, log);
  const first = await content.reload('khởi động');
  if (!first.ok) log('[nội dung] Server vẫn chạy với nội dung có sẵn. Sửa lỗi rồi lưu lại để áp dụng.');
  if (opts.watch ?? true) content.watch();

  let port = 0;
  const isAdmin = (req: IncomingMessage, url: URL) => (req.headers['x-admin-token'] ?? url.searchParams.get('token')) === adminToken;

  const http = createHttp(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    try {
      // ---------- API công khai ----------
      if (path === '/api/status') {
        return json(res, 200, {
          contentVersion: content.summary?.version ?? 0, pendingContent: content.hasPending,
          rooms: lobby.rooms.size, activeGames: lobby.activeGames(),
          contentErrors: content.lastErrors, contentWarnings: content.lastWarnings, content: content.summary,
          port, lan: lanAddresses(),
        });
      }
      if (path === '/api/catalog') return json(res, 200, catalog(images));
      if (path.startsWith('/images/')) {
        const [, , kind, file] = path.split('/');
        const full = images.resolve(kind ?? '', decodeURIComponent(file ?? ''));
        if (!full) return json(res, 404, { error: 'Không có ảnh này' });
        res.writeHead(200, { 'content-type': IMAGE_MIME[extname(full).toLowerCase()], 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
        return res.end(readFileSync(full));
      }
      if (path === '/api/rooms') return json(res, 200, lobby.roomList());
      // Skin tướng (ảnh + lồng tiếng) từ content/images/hero-skin
      if (path === '/api/skins') {
        const v = content.summary?.version ?? 0;
        if (v !== skinsVersion) { skins.invalidate(); skinsVersion = v; }
        const index = skins.index();
        return json(res, 200, { skins: index, coverage: skinCoverage(index) });
      }
      if (path.startsWith('/skins/')) {
        const full = skins.resolve(decodeURIComponent(path.slice('/skins/'.length)));
        if (!full) return json(res, 404, { error: 'Không có file này' });
        res.writeHead(200, { 'content-type': SKIN_MIME[extname(full).toLowerCase()], 'cache-control': 'public, max-age=604800', 'x-content-type-options': 'nosniff' });
        return res.end(readFileSync(full));
      }

      // ---------- Tài khoản, xếp hạng ----------
      const authOf = () => String(req.headers['x-account-token'] ?? '');
      if (path === '/api/account/register' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req, 10_000)) || '{}');
        return json(res, 200, accounts.register(b.username, b.password, b.displayName));
      }
      if (path === '/api/account/login' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req, 10_000)) || '{}');
        return json(res, 200, accounts.login(b.username, b.password));
      }
      if (path === '/api/account/logout' && req.method === 'POST') { accounts.logout(authOf()); return json(res, 200, { ok: true }); }
      if (path === '/api/account/me') {
        const a = accounts.byAuthToken(authOf());
        return a ? json(res, 200, accounts.publicProfile(a)) : json(res, 401, { error: 'Chưa đăng nhập' });
      }
      if (path === '/api/leaderboard') {
        return json(res, 200, { ranks: RANKS.filter((r) => Number.isFinite(r.min)), players: accounts.leaderboard(url.searchParams.get('sort') ?? 'rating', Number(url.searchParams.get('limit')) || 100) });
      }
      if (path === '/api/leaderboard/boss') {
        const boss = url.searchParams.get('boss') ?? Object.keys(BOSSES)[0];
        return json(res, 200, { bosses: bossCatalog(), ...accounts.bossLeaderboard(boss, url.searchParams.get('diff') ?? 'all') });
      }
      if (path === '/api/profile') {
        const p = accounts.profile(url.searchParams.get('u') ?? '');
        return p ? json(res, 200, p) : json(res, 404, { error: 'Không có người chơi này' });
      }
      if (path === '/api/match') {
        const m = accounts.match(url.searchParams.get('id') ?? '');
        return m ? json(res, 200, m) : json(res, 404, { error: 'Không có ván này' });
      }

      // ---------- API quản trị (cần ADMIN_TOKEN) ----------
      if (path.startsWith('/api/admin/')) {
        if (!isAdmin(req, url)) return json(res, 401, { error: 'Sai hoặc thiếu mã quản trị (x-admin-token)' });
        const action = path.slice('/api/admin/'.length);
        const rel = url.searchParams.get('path') ?? '';
        if (action === 'files' && req.method === 'GET') return json(res, 200, { dir: contentDir, files: content.files() });
        if (action === 'file' && req.method === 'GET') return json(res, 200, { path: rel, text: content.read(rel) });
        if (action === 'file' && req.method === 'PUT') return json(res, 200, await content.save(rel, await readBody(req)));
        if (action === 'file' && req.method === 'DELETE') return json(res, 200, await content.remove(rel));
        if (action === 'validate' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const p = await content.validate(body.path ? { [body.path]: body.text ?? null } : {});
          return json(res, 200, { ok: p.ok, errors: p.errors, warnings: p.warnings, summary: p.summary });
        }
        if (action === 'images' && req.method === 'GET') return json(res, 200, images.index());
        if (action === 'image' && (req.method === 'PUT' || req.method === 'DELETE')) {
          const kind = url.searchParams.get('kind') ?? '';
          const key = url.searchParams.get('key') ?? '';
          if (req.method === 'DELETE') return json(res, 200, { ok: images.remove(kind, key) });
          const buf = await readBuffer(req, MAX_IMAGE_BYTES + 1);
          return json(res, 200, { ok: true, url: images.save(kind, key, buf) });
        }
        if (action === 'reload' && req.method === 'POST') return json(res, 200, await content.reload('quản trị bấm nạp lại'));
        if (action === 'simulate' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const games = Math.min(1000, Math.max(1, Number(body.games) || 100));
          const players = Math.min(8, Math.max(2, Number(body.players) || 6));
          return json(res, 200, await content.simulate(games, players, body.focus || undefined));
        }
        return json(res, 404, { error: 'Không có API này' });
      }

      // ---------- File tĩnh ----------
      const file = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
      const full = resolve(publicDir, file);
      if (full.startsWith(publicDir) && existsSync(full) && statSync(full).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' });
        return res.end(readFileSync(full));
      }
      if (path === '/docs/ky-nang') {
        res.writeHead(200, { 'content-type': MIME['.md'] });
        return res.end(readFileSync(join(contentDir, 'HUONG-DAN-KY-NANG.md')));
      }
      json(res, 404, { error: 'Không tìm thấy' });
    } catch (e) {
      json(res, 400, { error: (e as Error).message });
    }
  });

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ server: http, path: '/ws' });
  wss.on('connection', (ws: WebSocket) => {
    let session: PlayerSession | null = null;
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        ws.send(JSON.stringify({ t: 'error', message: 'Tin nhắn không phải JSON' }));
        return;
      }
      if (msg.t === 'hello') {
        session = lobby.attach(ws, msg);
        return;
      }
      if (!session) {
        ws.send(JSON.stringify({ t: 'error', message: 'Cần gửi "hello" trước' }));
        return;
      }
      try {
        lobby.handle(session, msg);
      } catch (e) {
        session.send({ t: 'error', message: (e as Error).message });
      }
    });
    ws.on('close', () => { if (session) lobby.detachSocket(session, ws); });
  });

  port = await new Promise<number>((resolveP) => {
    http.listen(opts.port ?? Number(process.env.PORT ?? 3000), () => {
      const a = http.address();
      resolveP(typeof a === 'object' && a ? a.port : 0);
    });
  });

  log(`\nServer Tam Quốc Sát đang chạy: http://localhost:${port}`);
  log(`  Chơi:       http://localhost:${port}/game.html`);
  log(`  Kiểm thử:   http://localhost:${port}/play.html`);
  log(`  Quản trị:   http://localhost:${port}/admin.html   (mã quản trị: ${adminToken})`);
  log(`  Nội dung:   ${contentDir}\n`);

  return {
    port,
    url: `http://localhost:${port}`,
    adminToken,
    lobby,
    content,
    accounts,
    close: () => new Promise<void>((r) => {
      content.close();
      for (const c of wss.clients) c.terminate();
      wss.close();
      http.close(() => r());
    }),
  };
}

// ---------- Chạy trực tiếp ----------
if (process.argv[1] && /server\.(ts|js)$/.test(process.argv[1])) {
  await startServer();
}
