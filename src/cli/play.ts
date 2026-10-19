// ============================================================
// Chơi thử trên terminal: bạn (ghế 0) + 3 bot, 2 phe Thục vs Ngụy.
// Chạy: npm run play           (hoặc: npm run play -- 12345 để cố định seed)
// ============================================================
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { cardLabel } from '../core/cards.js';
import { Game } from '../core/game.js';
import type { Controller, Request, Response } from '../core/types.js';
import type { PlayerView } from '../core/view.js';
import { SimpleBot } from '../agents/bot.js';

const rl = createInterface({ input: stdin, output: stdout });

function showTable(v: PlayerView): void {
  console.log('\n┌─ Bàn chơi ─────────────────────────────');
  for (const p of v.players) {
    const hearts = p.alive ? '♥'.repeat(Math.max(0, p.hp)) + '·'.repeat(p.maxHp - Math.max(0, p.hp)) : '☠';
    const mark = p.seat === v.currentSeat ? '▶' : ' ';
    const you = p.seat === v.me ? ' (bạn)' : '';
    console.log(`│ ${mark} [${p.seat}] ${p.name}${you} · phe ${p.team ?? '?'} · ${hearts} · ${p.handCount} lá`);
  }
  console.log(`│ Chồng bốc: ${v.drawPileCount} · Chồng bỏ: ${v.discardPileCount}`);
  console.log('└────────────────────────────────────────');
  console.log('Bài trên tay:');
  v.myHand.forEach((c, i) => console.log(`  ${i + 1}. ${cardLabel(c)}`));
}

class HumanController implements Controller {
  async decide(req: Request, v: PlayerView): Promise<Response> {
    switch (req.type) {
      case 'play': {
        showTable(v);
        const usable = v.hints.map((h) => v.myHand.findIndex((c) => c.id === h.cardId) + 1);
        console.log(`Dùng được: ${usable.length ? usable.join(', ') : '(không có)'}  · Đã Sát ${v.shaUsed} lần`);
        const ans = (await rl.question('Chọn số lá để dùng (Enter = kết thúc giai đoạn ra bài): ')).trim();
        if (!ans) return { kind: 'endPlay' };
        const card = v.myHand[Number(ans) - 1];
        if (!card) return { kind: 'useCard', cardId: -1, targets: [] };
        const hint = v.hints.find((h) => h.cardId === card.id);
        if (!hint?.needsTarget) return { kind: 'useCard', cardId: card.id, targets: [] };
        const names = hint.targets.map((t) => `${t}=${v.players[t].name}`).join(', ');
        const t = (await rl.question(`Chọn mục tiêu (${names}): `)).trim();
        return { kind: 'useCard', cardId: card.id, targets: [Number(t)] };
      }
      case 'respond': {
        const options = v.myHand.map((c, i) => ({ c, i })).filter(({ c }) => req.accept.includes(c.name));
        console.log(`\n⚔ ${req.reason}!`);
        if (!options.length) { console.log('  Bạn không có lá phù hợp.'); return { kind: 'pass' }; }
        const list = options.map(({ c, i }) => `${i + 1}. ${cardLabel(c)}`).join('  ');
        const ans = (await rl.question(`  Đáp lại bằng (${list}), Enter = không đánh: `)).trim();
        const card = v.myHand[Number(ans) - 1];
        return card ? { kind: 'card', cardId: card.id } : { kind: 'pass' };
      }
      case 'save': {
        const taos = v.myHand.map((c, i) => ({ c, i })).filter(({ c }) => c.name === 'tao');
        const who = req.dying === v.me ? 'Bạn' : v.players[req.dying].name;
        console.log(`\n💀 ${who} đang hấp hối (cần ${req.need} Đào).`);
        if (!taos.length) return { kind: 'pass' };
        const list = taos.map(({ c, i }) => `${i + 1}. ${cardLabel(c)}`).join('  ');
        const ans = (await rl.question(`  Dùng Đào (${list}), Enter = không cứu: `)).trim();
        const card = v.myHand[Number(ans) - 1];
        return card ? { kind: 'card', cardId: card.id } : { kind: 'pass' };
      }
      case 'discard': {
        showTable(v);
        const ans = await rl.question(`Bạn phải bỏ ${req.count} lá. Nhập số thứ tự, cách nhau bởi dấu cách: `);
        const ids = ans.trim().split(/\s+/).map((x) => v.myHand[Number(x) - 1]?.id).filter((x) => x !== undefined);
        return { kind: 'discard', cardIds: ids };
      }
      default:
        return { kind: 'pass' };
    }
  }
}

const seed = Number(process.argv[2]) || Date.now();
const game = new Game(
  [
    { name: 'Bạn', team: 'Thục', controller: new HumanController() },
    { name: 'Tào Tháo', team: 'Ngụy', controller: new SimpleBot() },
    { name: 'Quan Vũ', team: 'Thục', controller: new SimpleBot() },
    { name: 'Hạ Hầu Đôn', team: 'Ngụy', controller: new SimpleBot() },
  ],
  { seed, onLog: (line) => console.log(`  · ${line}`) },
);

const result = await game.run();
console.log(`\nKết thúc sau ${result.turns} lượt.`);
rl.close();
