// Sự kiện đua top: bảng xếp hạng tính từ lịch sử ván, trao danh hiệu đúng 1 lần khi hết hạn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../src/server/accounts.js';
import { EVENTS, EventAwards, eventStandings } from '../src/server/events.js';

function play(st: AccountStore, accs: { id: string }[], scores: number[], winner: number, n = 6) {
  const players = scores.map((total, i) => ({ seat: i, name: `P${i}`, faction: i === winner ? 'wei' : 'shu', generals: ['caocao', 'xuchu'], alive: true,
    winner: i === winner, total, breakdown: {}, stats: {}, titles: [] }));
  while (players.length < n) players.push({ seat: players.length, name: 'Bot', faction: 'wu', generals: ['sunquan', 'zhouyu'], alive: true, winner: false, total: 1, breakdown: {}, stats: {}, titles: [] });
  const rec = st.recordMatch({ room: 'R', deck: 'quocchien', mode: 'normal', turns: 10, winner: 'Ngụy' },
    players.map((_, i) => ({ accountId: accs[i]?.id ?? null, bot: !accs[i] })), { players, mvp: winner } as never, players.map((p) => p.faction));
  // Giả như ván chơi trong thời gian sự kiện (test không phụ thuộc ngày chạy)
  rec.at = new Date(Date.parse(EVENTS[0].start) + 3600_000 + rec.players[0].score).toISOString();
  return rec;
}

test('Sự kiện: Elo cần đủ 5 ván; điểm ván giữ ván cao nhất; hết hạn thì trao danh hiệu 1 lần', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tqs-ev-'));
  const st = new AccountStore(dir);
  const names = ['an', 'binh', 'chi'];
  for (const u of names) st.register(`${u}_ev`, 'matkhau123');
  const accs = names.map((u) => (st as unknown as { byName: Map<string, { id: string }> }).byName.get(`${u}_ev`)!);
  const [elo, best] = EVENTS;
  for (let i = 0; i < 4; i++) play(st, accs, [30, 10 + i, 5], 0);
  play(st, accs.slice(0, 2), [12, 60], 1); // chi chỉ có 4 ván
  const e = eventStandings(elo, st.allMatches(), st);
  assert.deepEqual(e.map((r) => r.username), ['an_ev', 'binh_ev'], 'chưa đủ 5 ván thì không lên bảng Elo');
  const b = eventStandings(best, st.allMatches(), st);
  assert.equal(b[0].username, 'binh_ev');
  assert.equal(b[0].value, 60, 'giữ ván điểm cao nhất');
  assert.equal(b.length, 3, 'bảng điểm ván không cần đủ 5 ván');
  const aw = new EventAwards(dir);
  assert.deepEqual(aw.tick(st, Date.parse(elo.end) - 1000), [], 'chưa hết hạn: chưa trao');
  assert.equal(aw.tick(st, Date.parse(elo.end) + 1000).length, 2);
  assert.equal(aw.tick(st, Date.parse(elo.end) + 2000).length, 0, 'chỉ trao 1 lần');
  assert.equal(st.profile('an_ev')!.profile.titles[elo.rewards[0].title], 1);
  assert.equal(st.profile('binh_ev')!.profile.titles[best.rewards[0].title], 1);
});
