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
  assert.ok(body.generals.some((g: { id: string }) => g.id === 'chen_gong'));
  assert.equal(body.skills.phan_hoi.name, 'Phản Hồi');
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
  assert.ok(a2.msgs.some((m) => m.t === 'room' && m.yourSeat === 0));
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
  const r = await api('/api/admin/simulate', { method: 'POST', body: JSON.stringify({ games: 6, players: 4, focus: 'chen_gong' }) });
  assert.equal(r.body.ok, true, JSON.stringify(r.body.errors ?? r.body));
  assert.equal(r.body.games + r.body.crashes.length, 6);
  assert.ok(r.body.generals.find((g: { id: string }) => g.id === 'chen_gong').picked >= 5);
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
