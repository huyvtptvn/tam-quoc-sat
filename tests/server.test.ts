// Test tích hợp server: WebSocket thật, phòng chơi, kết nối lại, API quản trị, nạp nội dung nóng.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { HegemonyBot } from '../src/hegemony/bot.js';
import type { ServerMsg } from '../src/server/protocol.js';
import { PlayerSession, SocketController } from '../src/server/rooms.js';
import { startServer } from '../src/server/server.js';

type Srv = Awaited<ReturnType<typeof startServer>>;
let srv: Srv;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tqs-content-'));
  cpSync('content', dir, { recursive: true });
  srv = await startServer({ port: 0, contentDir: dir, adminToken: 'test', watch: false, quiet: true, botDelayMs: 0, dataDir: join(dir, '_data') });
});
after(async () => {
  await srv.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Client thử nghiệm: nhận mọi tin nhắn, tự trả lời câu hỏi bằng bot (nếu autoplay). */
class Client {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  token = '';
  autoplay = true;
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private bot = new HegemonyBot();

  async connect(name: string, token?: string): Promise<this> {
    this.ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    this.ws.on('message', (raw) => this.onMsg(JSON.parse(String(raw))));
    await new Promise((r) => this.ws.once('open', r));
    this.send({ t: 'hello', name, token });
    const w = await this.wait((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    this.token = w.token;
    return this;
  }

  private async onMsg(m: ServerMsg) {
    this.msgs.push(m);
    for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
    if (m.t === 'request' && this.autoplay) {
      const response = await this.bot.decide(m.request, m.view);
      this.send({ t: 'answer', reqId: m.reqId, response });
    }
  }

  send(msg: unknown) { this.ws.send(JSON.stringify(msg)); }

  wait(pred: (m: ServerMsg) => boolean, ms = 30000): Promise<ServerMsg> {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết thời gian chờ tin nhắn')), ms);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    });
  }

  close() { this.ws.close(); }
}

const api = async (path: string, init: RequestInit & { admin?: boolean } = {}) => {
  const res = await fetch(`${srv.url}${path}`, {
    ...init, headers: { ...(init.admin === false ? {} : { 'x-admin-token': 'test' }), ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.json() };
};

// ============================================================

test('nội dung mẫu được nạp khi khởi động: tướng và kỹ năng mới có trong danh mục', async () => {
  const { body } = await api('/api/catalog', { admin: false });
  assert.ok(body.generals.some((g: { id: string }) => g.id === 'pang_tong'));
  assert.equal(body.skills.lianhuan.name, 'Liên Hoàn');
  assert.equal(body.skills.phan_hoi.name, 'Phản Hồi', 'kỹ năng JSON mẫu vẫn có trong danh mục');
  assert.ok(body.disabledGenerals.some((g: { id: string }) => g.id === 'chen_gong'), 'tướng không có trong file lua bị tắt');
  assert.equal(body.generals.some((g: { id: string }) => g.id === 'chen_gong'), false);
  assert.ok(body.cards.binh_phap);
  assert.ok(body.dsl.events.damaged && body.dsl.actions.draw, 'danh mục DSL cho trang quản trị');
});

test('2 người + 2 bot chơi trọn một ván qua WebSocket', async () => {
  const a = await new Client().connect('An');
  const b = await new Client().connect('Bình');
  a.send({ t: 'createRoom', name: 'Phòng test', seats: 4, timeoutSec: 30 });
  const room = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  b.send({ t: 'joinRoom', roomId: room.room!.id });
  await b.wait((m) => m.t === 'room' && !!m.room);
  a.send({ t: 'addBot' });
  a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room?.seats.length === 4);
  b.send({ t: 'start' });
  await b.wait((m) => m.t === 'error'); // chỉ chủ phòng mới bắt đầu được
  a.send({ t: 'start' });
  const [ga, gb] = await Promise.all([a.wait((m) => m.t === 'gameOver', 60000), b.wait((m) => m.t === 'gameOver', 60000)]);
  assert.deepEqual(ga, gb);
  assert.ok(a.msgs.some((m) => m.t === 'state'), 'nhận được trạng thái bàn chơi');
  // Không bao giờ lộ bài trên tay người khác
  const st = a.msgs.find((m) => m.t === 'state') as Extract<ServerMsg, { t: 'state' }>;
  assert.equal(st.view.players[1].handCount >= 0, true);
  assert.equal(JSON.stringify(st.view).includes('"hand":['), false);
  a.close(); b.close();
});

test('rớt mạng rồi kết nối lại bằng token: nhận lại phòng, trạng thái và câu hỏi đang chờ', async () => {
  const a = await new Client().connect('Cường');
  a.autoplay = false;
  a.send({ t: 'createRoom', seats: 3 });
  await a.wait((m) => m.t === 'room' && !!m.room);
  a.send({ t: 'addBot' });
  a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room?.seats.length === 3);
  a.send({ t: 'start' });
  const req = await a.wait((m) => m.t === 'request') as Extract<ServerMsg, { t: 'request' }>;
  a.close();
  await new Promise((r) => setTimeout(r, 100));

  const a2 = new Client();
  a2.autoplay = false;
  await a2.connect('Cường', a.token);
  const resent = await a2.wait((m) => m.t === 'request') as Extract<ServerMsg, { t: 'request' }>;
  assert.equal(resent.reqId, req.reqId, 'câu hỏi cũ được gửi lại');
  assert.ok(a2.msgs.some((m) => m.t === 'room' && typeof m.yourSeat === 'number'), 'vẫn có ghế');
  a2.autoplay = true;
  const response = await new HegemonyBot().decide(resent.request, resent.view);
  a2.send({ t: 'answer', reqId: resent.reqId, response });
  await a2.wait((m) => m.t === 'gameOver', 60000);
  a2.close();
});

test('rời phòng giữa ván: bot điều khiển ghế đó đến hết ván', async () => {
  const a = await new Client().connect('Dũng');
  a.autoplay = false;
  a.send({ t: 'createRoom', seats: 3 });
  await a.wait((m) => m.t === 'room' && !!m.room);
  a.send({ t: 'addBot' });
  a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room?.seats.length === 3);
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'request');
  a.send({ t: 'leaveRoom' });
  await a.wait((m) => m.t === 'room' && m.room === null);
  // Ván vẫn tiếp tục và kết thúc trên server
  const deadline = Date.now() + 60000;
  while (srv.lobby.activeGames() > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  assert.equal(srv.lobby.activeGames(), 0);
  a.close();
});

test('SocketController: hết giờ thì bot trả lời thay và báo requestClosed', async () => {
  const sent: ServerMsg[] = [];
  const s = new PlayerSession('Ẩn');
  s.send = (m) => { sent.push(m); };
  const c = new SocketController(s, 30);
  const view = { me: 0, myHand: [], players: [], responseOptions: [], hints: [], notes: [], recentLog: [] } as never;
  const res = await c.decide({ type: 'respond', seat: 0, accept: ['shan'], reason: 'x', source: 1 }, view);
  assert.equal(res.kind, 'pass');
  assert.ok(sent.some((m) => m.t === 'requestClosed' && m.reason === 'timeout'));
});

// ============================================================ API quản trị

test('API quản trị: thiếu mã thì bị từ chối', async () => {
  const r = await api('/api/admin/files', { admin: false });
  assert.equal(r.status, 401);
});

test('API quản trị: không cho ghi hay xóa script .mjs (tránh chạy mã tùy ý trên server)', async () => {
  const w = await api('/api/admin/file?path=scripts/hack.mjs', { method: 'PUT', body: 'export default {}' });
  assert.equal(w.body.ok, false);
  assert.ok(w.body.errors[0].includes('script'));
  const d = await api('/api/admin/file?path=scripts/vi-du.mjs', { method: 'DELETE' });
  assert.equal(d.body.ok, false);
  const files = await api('/api/admin/files');
  assert.equal(files.body.files.includes('scripts/hack.mjs'), false);
});

test('API quản trị: lưu kỹ năng lỗi bị từ chối kèm thông báo rõ ràng, file không bị ghi', async () => {
  const bad = JSON.stringify([{ id: 'loi', name: 'Lỗi', type: 'trigger', event: 'damagedd', actions: [{ do: 'draw' }] }]);
  const r = await api('/api/admin/file?path=skills/loi.json', { method: 'PUT', body: bad });
  assert.equal(r.body.ok, false);
  assert.ok(r.body.errors.some((e: string) => e.includes('"event" không hợp lệ') && e.includes('damaged')));
  const files = await api('/api/admin/files');
  assert.equal(files.body.files.includes('skills/loi.json'), false);

  const syntax = await api('/api/admin/file?path=skills/loi.json', { method: 'PUT', body: '[{ "id": "x", }' });
  assert.ok(syntax.body.errors[0].includes('JSON không hợp lệ'));

  const badVar = JSON.stringify([{ id: 'loi2', name: 'Lỗi 2', type: 'trigger', event: 'damaged', if: 'amout > 1', actions: [{ do: 'draw' }] }]);
  const r2 = await api('/api/admin/file?path=skills/loi2.json', { method: 'PUT', body: badVar });
  assert.ok(r2.body.errors.some((e: string) => e.includes('biến "amout"')));
});

test('API quản trị: thêm tướng + kỹ năng mới, áp dụng ngay khi không có ván; xóa file thì biến mất', async () => {
  const skill = JSON.stringify([{ id: 'test_rut', name: 'Thử Rút', type: 'trigger', event: 'turnStart', role: 'current', actions: [{ do: 'draw', count: '1' }] }]);
  const r1 = await api('/api/admin/file?path=skills/test.json', { method: 'PUT', body: skill });
  assert.equal(r1.body.ok, true);
  assert.equal(r1.body.status, 'applied');
  const gen = JSON.stringify([{ id: 'test_tuong', name: 'Tướng Thử', kingdom: 'wu', halfHp: 4, skills: ['test_rut'] }]);
  const r2 = await api('/api/admin/file?path=generals/test.json', { method: 'PUT', body: gen });
  assert.equal(r2.body.ok, true);
  let cat = (await api('/api/catalog')).body;
  assert.ok(cat.generals.some((g: { id: string }) => g.id === 'test_tuong'));

  // Xóa kỹ năng đang được tướng dùng -> bị chặn
  const blocked = await api('/api/admin/file?path=skills/test.json', { method: 'DELETE' });
  assert.equal(blocked.body.ok, false);
  assert.ok(blocked.body.errors.some((e: string) => e.includes('không có kỹ năng "test_rut"')));

  await api('/api/admin/file?path=generals/test.json', { method: 'DELETE' });
  await api('/api/admin/file?path=skills/test.json', { method: 'DELETE' });
  cat = (await api('/api/catalog')).body;
  assert.equal(cat.generals.some((g: { id: string }) => g.id === 'test_tuong'), false);
  assert.equal(cat.skills.test_rut, undefined);
});

test('nội dung mới chỉ áp dụng khi các ván đang chơi kết thúc', async () => {
  const a = await new Client().connect('Em');
  a.autoplay = false;
  a.send({ t: 'createRoom', seats: 2 });
  await a.wait((m) => m.t === 'room' && !!m.room);
  a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room?.seats.length === 2);
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'request');
  const before = srv.content.summary!.version;
  const r = await api('/api/admin/file?path=skills/cho.json', { method: 'PUT', body: JSON.stringify([{ id: 'cho_ap_dung', name: 'Chờ', type: 'passive', handLimit: '1' }]) });
  assert.equal(r.body.status, 'pending');
  assert.equal(srv.content.summary!.version, before, 'chưa áp dụng khi ván đang chạy');
  a.send({ t: 'leaveRoom' }); // ván do bot đánh nốt
  const deadline = Date.now() + 60000;
  while (srv.content.summary!.version === before && Date.now() < deadline) await new Promise((x) => setTimeout(x, 50));
  assert.equal(srv.content.summary!.version, before + 1);
  await api('/api/admin/file?path=skills/cho.json', { method: 'DELETE' });
  a.close();
});

test('API quản trị: mô phỏng chạy trong tiến trình riêng và trả về thống kê', async () => {
  const r = await api('/api/admin/simulate', { method: 'POST', body: JSON.stringify({ games: 6, players: 4, focus: 'pang_tong' }) });
  assert.equal(r.body.ok, true, JSON.stringify(r.body.errors ?? r.body));
  assert.equal(r.body.games + r.body.crashes.length, 6);
  assert.ok(r.body.generals.find((g: { id: string }) => g.id === 'pang_tong').picked >= 5);
});

test('ảnh: tải lên PNG cho lá bài, xuất hiện trong danh mục và tải về được; chặn file không phải ảnh và tên sai', async () => {
  // PNG 1x1 hợp lệ
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await fetch(`${srv.url}/api/admin/image?kind=cards&key=sha`, { method: 'PUT', headers: { 'x-admin-token': 'test' }, body: png });
  const upBody = await up.json();
  assert.equal(upBody.ok, true);

  const cat = await (await fetch(`${srv.url}/api/catalog`)).json();
  const url: string = cat.images.cards.sha;
  assert.match(url, /^\/images\/cards\/sha\.png\?v=\d+$/);
  const img = await fetch(srv.url + url);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await img.arrayBuffer()).length, png.length);

  const html = await fetch(`${srv.url}/api/admin/image?kind=cards&key=tao`, { method: 'PUT', headers: { 'x-admin-token': 'test' }, body: '<svg onload="alert(1)"></svg>' });
  assert.equal(html.status, 400);
  const badKey = await fetch(`${srv.url}/api/admin/image?kind=cards&key=../x`, { method: 'PUT', headers: { 'x-admin-token': 'test' }, body: png });
  assert.equal(badKey.status, 400);
  const noAuth = await fetch(`${srv.url}/api/admin/image?kind=cards&key=tao`, { method: 'PUT', body: png });
  assert.equal(noAuth.status, 401);
  assert.equal((await fetch(`${srv.url}/images/cards/..%2F..%2Fpackage.json`)).status, 404);

  const del = await api('/api/admin/image?kind=cards&key=sha', { method: 'DELETE' });
  assert.equal(del.body.ok, true);
  const cat2 = await (await fetch(`${srv.url}/api/catalog`)).json();
  assert.equal(cat2.images.cards.sha, undefined);
});

test('danh mục: lá bài thêm từ content/ mang theo mô tả và chữ in giữa mặt bài', async () => {
  const cat = await (await fetch(`${srv.url}/api/catalog`)).json();
  assert.equal(cat.cards.hoa_hoan.glyph, '火');
  assert.match(cat.cards.binh_phap.desc, /bốc 1 lá/);
  assert.deepEqual(Object.keys(cat.images).sort(), ['cards', 'generals']);
});

test('tin "state" gửi sau câu hỏi ra bài vẫn giữ gợi ý lá dùng được (lỗi bấm lá bài không có tác dụng)', async () => {
  const a = await new Client().connect('Huy');
  a.autoplay = false;
  a.send({ t: 'createRoom', seats: 3, deck: 'ungbien' });
  const room = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  assert.equal(room.room!.deck, 'ungbien');
  a.send({ t: 'addBot' });
  a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room?.seats.length === 3);
  a.send({ t: 'start' });
  const bot = new HegemonyBot();
  let play: Extract<ServerMsg, { t: 'request' }> | null = null;
  for (let i = 0; i < 200 && !play; i++) {
    const r = await a.wait((m) => m.t === 'request' && !(m as { seen?: boolean }).seen) as Extract<ServerMsg, { t: 'request' }> & { seen?: boolean };
    r.seen = true;
    if (r.request.type === 'play' && r.view.hints.length) { play = r; break; }
    a.send({ t: 'answer', reqId: r.reqId, response: await bot.decide(r.request, r.view) });
  }
  assert.ok(play, 'có câu hỏi ra bài với lá dùng được');
  await new Promise((r) => setTimeout(r, 150));
  const after = a.msgs.slice(a.msgs.indexOf(play!) + 1).filter((m) => m.t === 'state') as Extract<ServerMsg, { t: 'state' }>[];
  for (const s of after) assert.equal(s.view.hints.length, play!.view.hints.length, 'view trong "state" vẫn có gợi ý');
  assert.ok(after.length > 0, 'có tin "state" (nhật ký) đến sau câu hỏi');
  a.autoplay = true;
  a.send({ t: 'answer', reqId: play!.reqId, response: { kind: 'endPlay' } });
  await a.wait((m) => m.t === 'gameOver', 60000);
  a.close();
});

test('tài khoản: đăng ký, đăng nhập, sai mật khẩu bị từ chối, mật khẩu không lưu dạng rõ', async () => {
  const post = (p: string, body: object) => api(p, { method: 'POST', body: JSON.stringify(body), admin: false });
  const reg = await post('/api/account/register', { username: 'tester1', password: 'matkhau1', displayName: 'Thử Nghiệm' });
  assert.equal(reg.status, 200);
  assert.ok(reg.body.token && reg.body.profile.rating === 1200);
  assert.equal((await post('/api/account/register', { username: 'TESTER1', password: 'xxxxxx' })).status, 400, 'trùng tên (không phân biệt hoa thường)');
  assert.equal((await post('/api/account/login', { username: 'tester1', password: 'sai-mat-khau' })).status, 400);
  const ok = await post('/api/account/login', { username: 'tester1', password: 'matkhau1' });
  assert.equal(ok.status, 200);
  const me = await api('/api/account/me', { admin: false, headers: { 'x-account-token': ok.body.token } });
  assert.equal(me.body.displayName, 'Thử Nghiệm');
  const { readFileSync } = await import('node:fs');
  assert.ok(!readFileSync(join(dir, '_data', 'accounts.json'), 'utf8').includes('matkhau1'));
});

test('ván có tài khoản: gửi bảng điểm + Elo, lưu lịch sử, lên bảng xếp hạng', async () => {
  const post = (p: string, body: object) => api(p, { method: 'POST', body: JSON.stringify(body), admin: false });
  const r1 = await post('/api/account/register', { username: 'xephang1', password: 'matkhau1' });
  const r2 = await post('/api/account/register', { username: 'xephang2', password: 'matkhau2' });
  const a = new Client(); const b = new Client();
  await a.connect('A'); await b.connect('B');
  a.send({ t: 'hello', name: 'A', token: a.token, auth: r1.body.token });
  b.send({ t: 'hello', name: 'B', token: b.token, auth: r2.body.token });
  await a.wait((m) => m.t === 'welcome' && !!m.account);
  await b.wait((m) => m.t === 'welcome' && !!m.account);
  a.send({ t: 'createRoom', name: 'Xếp hạng', seats: 4, timeoutSec: 30 });
  const room = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  b.send({ t: 'joinRoom', roomId: room.room!.id });
  await b.wait((m) => m.t === 'room' && !!m.room);
  a.send({ t: 'addBot' }); a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room!.seats.length === 4);
  a.send({ t: 'start' });
  const over = await a.wait((m) => m.t === 'gameOver', 120000) as Extract<ServerMsg, { t: 'gameOver' }>;
  await b.wait((m) => m.t === 'gameOver', 120000);
  assert.equal(over.scores!.players.length, 4);
  assert.ok(over.scores!.players.every((p) => typeof p.total === 'number'));
  assert.ok(over.match?.id);
  const prof = await api('/api/profile?u=xephang1', { admin: false });
  assert.equal(prof.body.profile.games, 1);
  assert.equal(prof.body.matches[0].id, over.match!.id);
  if (over.result.winner) {
    assert.ok(over.match!.ranked);
    const lb = await api('/api/leaderboard', { admin: false });
    assert.ok(lb.body.players.some((p: { username: string }) => p.username === 'xephang1'));
    const r = over.match!.ratings.filter((x) => x.before !== null);
    assert.equal(r.length, 2, 'chỉ 2 người có tài khoản được tính Elo');
  }
  a.close(); b.close();
});

// ---------- Theo dõi / giải tán / đầu hàng ----------
async function roomWithBots(name: string, seats = 3, bots = seats - 1) {
  const a = await new Client().connect(name);
  a.autoplay = false;
  a.send({ t: 'createRoom', name: `Phòng ${name}`, seats });
  const r = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  for (let i = 0; i < bots; i++) a.send({ t: 'addBot' });
  await a.wait((m) => m.t === 'room' && m.room?.seats.length === bots + 1);
  return { a, roomId: r.room!.id };
}

test('theo dõi: vào xem ván đang chơi, chỉ thấy thông tin công khai, thoát ra khi muốn', async () => {
  const { a, roomId } = await roomWithBots('Xuân');
  a.autoplay = true;
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'state');
  const w = await new Client().connect('Người xem');
  w.send({ t: 'spectate', roomId });
  const rm = await w.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  assert.equal(rm.yourSeat, null);
  assert.equal(rm.spectating, true);
  assert.deepEqual(rm.room!.spectators, ['Người xem']);
  const st = await w.wait((m) => m.t === 'state') as Extract<ServerMsg, { t: 'state' }>;
  assert.equal(st.view.spectator, true);
  assert.equal(st.view.myHand.length, 0, 'người xem không thấy bài trên tay');
  assert.ok(st.view.players.every((p) => p.handCount >= 0));
  // Người xem không trả lời / bắt đầu / giải tán được
  w.send({ t: 'dissolveRoom' });
  await w.wait((m) => m.t === 'error');
  w.send({ t: 'chat', text: 'xin chào' });
  await a.wait((m) => m.t === 'chat' && m.from === 'Người xem (xem)');
  w.send({ t: 'leaveRoom' });
  await w.wait((m) => m.t === 'room' && m.room === null);
  assert.ok(!srv.lobby.rooms.get(roomId)?.info().spectators.length);
  await a.wait((m) => m.t === 'gameOver', 60000);
  a.close(); w.close();
});

test('giải tán phòng: chủ phòng hủy ván đang chơi, mọi người (cả người xem) về sảnh, không tính kết quả', async () => {
  const { a, roomId } = await roomWithBots('Hạ', 4, 1);
  const b = await new Client().connect('Bé');
  b.send({ t: 'joinRoom', roomId });
  await b.wait((m) => m.t === 'room' && !!m.room);
  a.send({ t: 'addBot' });
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'request');
  const w = await new Client().connect('Khán giả');
  w.send({ t: 'spectate', roomId });
  await w.wait((m) => m.t === 'state');
  b.send({ t: 'dissolveRoom' });
  await b.wait((m) => m.t === 'error' && /chủ phòng/.test(m.message));
  a.send({ t: 'dissolveRoom' });
  for (const c of [a, b, w]) {
    await c.wait((m) => m.t === 'notice' && /giải tán/.test(m.text));
    await c.wait((m) => m.t === 'room' && m.room === null);
  }
  assert.equal(srv.lobby.rooms.get(roomId), undefined);
  const deadline = Date.now() + 5000;
  while (srv.lobby.activeGames() > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(srv.lobby.activeGames(), 0, 'ván bị hủy');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!a.msgs.some((m) => m.t === 'gameOver'), 'không có kết quả ván');
  a.close(); b.close(); w.close();
});

test('giải tán phòng qua API quản trị', async () => {
  const { a, roomId } = await roomWithBots('Thu');
  assert.equal((await api('/api/admin/rooms')).body.rooms.some((r: { id: string }) => r.id === roomId), true);
  assert.equal((await api(`/api/admin/dissolve?id=${roomId}`, { method: 'POST', admin: false })).status, 401);
  assert.equal((await api(`/api/admin/dissolve?id=${roomId}`, { method: 'POST' })).status, 200);
  await a.wait((m) => m.t === 'notice' && /quản trị viên/.test(m.text));
  assert.equal(srv.lobby.rooms.get(roomId), undefined);
  assert.equal((await api('/api/admin/dissolve?id=khongco', { method: 'POST' })).status, 404);
  a.close();
});

test('đầu hàng: tướng chết ngay, ván vẫn tiếp tục bằng bot, người đầu hàng không thắng', async () => {
  const { a } = await roomWithBots('Đông', 4);
  a.autoplay = true;
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'request' && m.request.type === 'play', 30000);
  a.send({ t: 'surrender' });
  await a.wait((m) => m.t === 'notice' && /đầu hàng/.test(m.text));
  const over = await a.wait((m) => m.t === 'gameOver', 60000) as Extract<ServerMsg, { t: 'gameOver' }>;
  const st = [...a.msgs].reverse().find((m) => m.t === 'state') as Extract<ServerMsg, { t: 'state' }>;
  const me = st.view.me; // chỗ ngồi được xếp ngẫu nhiên mỗi ván
  // Hiếm khi ván vừa kết thúc ngay trước khi lượt đầu hàng được xử lý: khi đó không có dòng "đầu hàng"
  const done = a.msgs.some((m) => m.t === 'state' && m.log.some((l) => /đầu hàng/.test(l)));
  if (done) assert.equal(st.view.players[me].alive, false);
  if (over.scores) assert.equal(over.scores.players.find((p) => p.seat === me)?.winner, false);
  a.close();
});

test('API quản trị: danh sách tài khoản (không lộ mật khẩu/mã), online, đặt mật khẩu tạm, đăng xuất mọi nơi', async () => {
  const reg = await api('/api/account/register', { method: 'POST', admin: false, body: JSON.stringify({ username: 'qtv_xem', password: 'matkhau1' }), headers: { 'content-type': 'application/json' } });
  assert.equal(reg.status, 200);
  assert.equal((await api('/api/admin/accounts', { admin: false })).status, 401);
  const c = await new Client().connect('x');
  c.send({ t: 'hello', name: 'x', token: c.token, auth: reg.body.token });
  await c.wait((m) => m.t === 'welcome' && !!m.account);
  const list = await api('/api/admin/accounts');
  const me = list.body.accounts.find((a: { username: string }) => a.username === 'qtv_xem');
  assert.ok(me && me.online && me.devices === 1);
  const raw = JSON.stringify(list.body);
  assert.ok(!/"hash"|"salt"|"tokens"|"id"/.test(raw), 'không lộ dữ liệu nhạy cảm');
  const rs = await api('/api/admin/account/reset-password?username=qtv_xem', { method: 'POST' });
  assert.ok(rs.body.password?.length >= 6);
  const old = await api('/api/account/login', { method: 'POST', admin: false, body: JSON.stringify({ username: 'qtv_xem', password: 'matkhau1' }), headers: { 'content-type': 'application/json' } });
  assert.equal(old.status, 400);
  const nw = await api('/api/account/login', { method: 'POST', admin: false, body: JSON.stringify({ username: 'qtv_xem', password: rs.body.password }), headers: { 'content-type': 'application/json' } });
  assert.equal(nw.status, 200);
  assert.equal((await api('/api/admin/account/logout-all?username=qtv_xem', { method: 'POST' })).status, 200);
  assert.equal((await api('/api/account/me', { admin: false, headers: { 'x-account-token': nw.body.token } })).status, 401);
  assert.equal((await api('/api/admin/account/reset-password?username=khongco', { method: 'POST' })).status, 400);
  c.close();
});

// ---------- Tắt trang: tự đăng xuất, rời phòng ----------
const regAcc = async (username: string) => (await api('/api/account/register', { method: 'POST', admin: false, body: JSON.stringify({ username, password: 'matkhau1' }), headers: { 'content-type': 'application/json' } })).body as { token: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('tắt trang: sau khoảng chờ thì rời phòng chờ nhưng VẪN đăng nhập (nhớ đăng nhập); tải lại kịp thì giữ nguyên', async () => {
  const old = [srv.lobby.graceMs, srv.lobby.gracePlayingMs];
  srv.lobby.graceMs = 300; srv.lobby.gracePlayingMs = 300;
  try {
    const { token: auth } = await regAcc('tat_trang');
    const a = await new Client().connect('A');
    a.send({ t: 'hello', name: 'A', token: a.token, auth });
    await a.wait((m) => m.t === 'welcome' && !!m.account);
    a.send({ t: 'createRoom', name: 'Phòng tắt trang', seats: 4 });
    const r = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
    const b = await new Client().connect('B');
    b.send({ t: 'joinRoom', roomId: r.room!.id });
    await b.wait((m) => m.t === 'room' && !!m.room);

    // Tải lại trang (kết nối lại ngay bằng mã phiên): vẫn đăng nhập, vẫn trong phòng
    a.close();
    await sleep(50);
    const a2 = await new Client().connect('A', a.token);
    a2.send({ t: 'hello', name: 'A', token: a.token, auth });
    await a2.wait((m) => m.t === 'welcome' && !!m.account);
    await a2.wait((m) => m.t === 'room' && m.room?.id === r.room!.id);
    await sleep(500);
    assert.ok(srv.lobby.rooms.get(r.room!.id)?.humans().length === 2, 'vẫn ngồi trong phòng');

    // Tắt trang: quá khoảng chờ thì rời phòng (B thành chủ phòng) nhưng tài khoản vẫn đăng nhập
    a2.close();
    await sleep(600);
    const room = srv.lobby.rooms.get(r.room!.id)!;
    assert.equal(room.humans().length, 1);
    assert.equal(room.host.name, 'B');
    assert.equal((await api('/api/account/me', { admin: false, headers: { 'x-account-token': auth } })).status, 200, 'mã đăng nhập vẫn còn hiệu lực');
    // Mở trang lại bằng mã phiên cũ: là phiên mới, không còn trong phòng
    const a3 = await new Client().connect('A', a.token);
    const w = a3.msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    assert.notEqual(w.token, a.token);
    b.send({ t: 'leaveRoom' });
    await b.wait((m) => m.t === 'room' && m.room === null);
    assert.equal(srv.lobby.rooms.get(r.room!.id), undefined, 'phòng trống thì bị xóa');
    a3.close(); b.close();
  } finally {
    [srv.lobby.graceMs, srv.lobby.gracePlayingMs] = old;
  }
});

test('một tài khoản chỉ ngồi được một phòng (mở 2 tab)', async () => {
  const { token: auth } = await regAcc('hai_tab');
  const t1 = await new Client().connect('T1');
  t1.send({ t: 'hello', name: 'T1', token: t1.token, auth });
  await t1.wait((m) => m.t === 'welcome' && !!m.account);
  const t2 = await new Client().connect('T2');
  t2.send({ t: 'hello', name: 'T2', token: t2.token, auth });
  await t2.wait((m) => m.t === 'welcome' && !!m.account);
  t1.send({ t: 'createRoom', name: 'Tab 1', seats: 3 });
  const r = await t1.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  t2.send({ t: 'createRoom', name: 'Tab 2', seats: 3 });
  await t2.wait((m) => m.t === 'error' && /đang ngồi ở phòng "Tab 1"/.test(m.message));
  t2.send({ t: 'joinRoom', roomId: r.room!.id });
  await t2.wait((m) => m.t === 'error' && /đã ngồi trong phòng/.test(m.message));
  t2.send({ t: 'spectate', roomId: r.room!.id });
  await t2.wait((m) => m.t === 'room' && m.spectating === true);
  t1.send({ t: 'leaveRoom' }); t2.send({ t: 'leaveRoom' });
  await t1.wait((m) => m.t === 'room' && m.room === null);
  t1.close(); t2.close();
});

test('phòng chỉ còn bot quá 5 phút thì tự đóng (người xem được báo, ván bị hủy)', async () => {
  const { a, roomId } = await roomWithBots('Bot', 3);
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'request');
  const w = await new Client().connect('Xem bot');
  w.send({ t: 'spectate', roomId });
  await w.wait((m) => m.t === 'room' && m.spectating === true);
  a.send({ t: 'leaveRoom' });
  await a.wait((m) => m.t === 'room' && m.room === null);
  const t0 = Date.now();
  srv.lobby.sweepBotOnlyRooms(t0);
  assert.ok(srv.lobby.rooms.get(roomId), 'chưa đủ 5 phút: phòng còn');
  srv.lobby.sweepBotOnlyRooms(t0 + srv.lobby.botOnlyCloseMs - 1000);
  assert.ok(srv.lobby.rooms.get(roomId));
  srv.lobby.sweepBotOnlyRooms(t0 + srv.lobby.botOnlyCloseMs);
  assert.equal(srv.lobby.rooms.get(roomId), undefined, 'đủ 5 phút: phòng bị đóng');
  await w.wait((m) => m.t === 'notice' && /chỉ còn bot/.test(m.text));
  a.close(); w.close();
});

test('phòng có mật khẩu: hỏi mật khẩu, sai thì báo lại, đúng thì vào được; /api/status có số người online', async () => {
  const a = await new Client().connect('Chủ');
  const b = await new Client().connect('Khách');
  a.send({ t: 'createRoom', name: 'Phòng khóa', seats: 4, timeoutSec: 30, password: 'bimat' });
  const r = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  assert.equal(r.room!.locked, true);
  b.send({ t: 'joinRoom', roomId: r.room!.id });
  const ask = await b.wait((m) => m.t === 'needPassword') as Extract<ServerMsg, { t: 'needPassword' }>;
  assert.equal(ask.wrong, false);
  b.send({ t: 'joinRoom', roomId: r.room!.id, password: 'sai' });
  await b.wait((m) => m.t === 'needPassword' && m.wrong);
  b.send({ t: 'joinRoom', roomId: r.room!.id, password: 'bimat' });
  await b.wait((m) => m.t === 'room' && !!m.room);
  const st = await api('/api/status', { admin: false });
  assert.ok(st.body.online >= 2);
  a.send({ t: 'dissolveRoom' });
  a.close(); b.close();
});

test('nhớ đăng nhập: mã đăng nhập hết hạn sau 30 ngày không dùng, dùng lại thì gia hạn', async () => {
  const { AccountStore, LOGIN_TTL_MS } = await import('../src/server/accounts.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const st = new AccountStore(mkdtempSync(join(tmpdir(), 'tqs-acc-')));
  const { token } = st.register('nho_dn', 'matkhau123');
  const t0 = Date.now();
  assert.ok(st.byAuthToken(token, t0 + LOGIN_TTL_MS - 5000), '29 ngày: vẫn còn (và được gia hạn)');
  assert.ok(st.byAuthToken(token, t0 + 2 * LOGIN_TTL_MS - 10_000), 'gia hạn từ lần dùng trước');
  assert.equal(st.byAuthToken(token, t0 + 4 * LOGIN_TTL_MS), null, 'quá 30 ngày không dùng: hết hạn');
  assert.equal(st.byAuthToken(token, t0 + 4 * LOGIN_TTL_MS + 1), null, 'đã bị xóa');
});

test('mất kết nối giữa ván: bot trả lời thay sau vài giây, đăng nhập lại từ tab mới thì nhận lại ghế', async () => {
  const { token: auth } = await regAcc('giu_ghe');
  const a = await new Client().connect('A');
  a.autoplay = false;
  a.send({ t: 'hello', name: 'A', token: a.token, auth });
  await a.wait((m) => m.t === 'welcome' && !!m.account);
  a.send({ t: 'createRoom', name: 'Phòng giữ ghế', seats: 3 });
  const r = await a.wait((m) => m.t === 'room' && !!m.room) as Extract<ServerMsg, { t: 'room' }>;
  a.send({ t: 'addBot' }); a.send({ t: 'addBot' });
  await sleep(200);
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'request');
  a.close(); // tắt trang giữa lúc đang được hỏi
  await sleep(3500);
  const room = srv.lobby.rooms.get(r.room!.id)!;
  assert.equal(room.humans().length, 1, 'ghế vẫn giữ cho người chơi');
  // Mở tab mới (không có mã phiên cũ), chỉ có mã đăng nhập: nhận lại đúng ghế đang giữ
  const a2 = await new Client().connect('A');
  a2.autoplay = false;
  a2.send({ t: 'hello', name: 'A', auth });
  const w = await a2.wait((m) => m.t === 'welcome' && !!m.account) as Extract<ServerMsg, { t: 'welcome' }>;
  assert.equal(w.token, a.token, 'nhận lại phiên cũ');
  await a2.wait((m) => m.t === 'room' && m.room?.id === r.room!.id);
  a2.send({ t: 'dissolveRoom' }); await sleep(200);
  a2.close();
});
