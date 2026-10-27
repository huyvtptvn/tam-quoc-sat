// ============================================================
// Chơi thử Quốc Chiến trên terminal: bạn (ghế 0) + 4 bot.
// Chạy: npm run play:qc           (hoặc: npm run play:qc -- 12345 để cố định seed)
// ============================================================
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { CARD_INFO, cardLabel } from '../core/cards.js';
import type { Controller, Request, Response } from '../core/types.js';
import type { PlayerView, SlotView } from '../core/view.js';
import { HegemonyGame } from '../hegemony/game.js';
import { HegemonyBot } from '../hegemony/bot.js';
import { getGeneral, KINGDOM_LABEL } from '../hegemony/generals.js';
import { SKILLS } from '../hegemony/skills.js';

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q: string) => (await rl.question(q)).trim();

function genText(s: SlotView): string {
  if (!s.generalId) return '[úp]';
  const g = getGeneral(s.generalId);
  return `${g.name}${s.revealed ? '' : '(úp)'}`;
}

function describeGeneral(id: string): string {
  const g = getGeneral(id);
  const skills = g.skills.map((s) => `${SKILLS[s].name}: ${SKILLS[s].desc}`).join('\n      ');
  return `${g.name} · ${KINGDOM_LABEL[g.kingdom]} · ${g.halfHp} âm dương ngư\n      ${skills}`;
}

function showTable(v: PlayerView): void {
  console.log('\n┌─ Bàn chơi ───────────────────────────────────────────');
  for (const p of v.players) {
    const hp = p.alive ? '♥'.repeat(Math.max(0, p.hp)) + '·'.repeat(Math.max(0, p.maxHp - Math.max(0, p.hp))) : '☠';
    const mark = p.seat === v.currentSeat ? '▶' : ' ';
    const you = p.seat === v.me ? ' (bạn)' : '';
    const gens = p.generals ? `${genText(p.generals.main)} + ${genText(p.generals.deputy)}` : '';
    const m = p.marks;
    const marks = m && (m.yinyang || m.pioneer || m.pair)
      ? ` · ký hiệu: ${m.yinyang ? `ÂDN×${m.yinyang} ` : ''}${m.pioneer ? `TK×${m.pioneer} ` : ''}${m.pair ? `CLBH×${m.pair}` : ''}` : '';
    const scars = p.special.length ? ` · Sẹo: ${p.special.map(cardLabel).join(' ')}` : '';
    const chain = p.chained ? ' · ⛓ xích' : '';
    console.log(`│ ${mark} [${p.seat}] ${p.name}${you} · ${p.team ?? '?'} · ${gens} · ${hp} · ${p.handCount} lá${marks}${scars}${chain}`);
    const eq = Object.values(p.equips).map((c) => cardLabel(c!));
    if (eq.length) console.log(`│        Trang bị: ${eq.join(' | ')}`);
    if (p.judgeArea.length) console.log(`│        Phán định: ${p.judgeArea.map(cardLabel).join(' | ')}`);
  }
  console.log(`│ Chồng bốc: ${v.drawPileCount} · Chồng bỏ: ${v.discardPileCount}`);
  console.log('└──────────────────────────────────────────────────────');
  if (v.notes.length) console.log(`Ghi chú riêng: ${v.notes.slice(-3).join(' / ')}`);
  console.log('Bài trên tay:');
  v.myHand.forEach((c, i) => console.log(`  ${i + 1}. ${cardLabel(c)}`));
}

const seatsOf = (ans: string) => (ans ? ans.split(/\s+/).map(Number) : []);

class HumanController implements Controller {
  async decide(req: Request, v: PlayerView): Promise<Response> {
    switch (req.type) {
      case 'chooseGenerals': {
        console.log('\n=== CHỌN TƯỚNG: chọn 2 tướng CÙNG thế lực (tướng đầu tiên là chủ tướng) ===');
        req.candidates.forEach((id, i) => console.log(`  ${i + 1}. ${describeGeneral(id)}`));
        const ans = await ask('Nhập 2 số, ví dụ "1 3": ');
        const [a, b] = ans.split(/\s+/).map((x) => req.candidates[Number(x) - 1]);
        return { kind: 'generals', main: a ?? '', deputy: b ?? '' };
      }
      case 'reveal': {
        showTable(v);
        const ans = await ask('Lật tướng? (1 = chủ tướng, 2 = phó tướng, 12 = cả hai, Enter = không): ');
        return { kind: 'reveal', main: ans.includes('1'), deputy: ans.includes('2') };
      }
      case 'confirm': {
        const ans = await ask(`✦ ${req.prompt} (y/N): `);
        return ans.toLowerCase().startsWith('y') ? { kind: 'yes' } : { kind: 'no' };
      }
      case 'play': return this.play(v);
      case 'choose': {
        console.log(`\n✦ ${req.prompt}`);
        req.options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
        return { kind: 'choice', index: Number(await ask('  Chọn: ')) - 1 };
      }
      case 'chooseTargets': {
        const list = req.candidates.map((s) => `${s}=${v.players[s].name}`).join(', ');
        const range = req.min === req.max ? `${req.min}` : `${req.min}–${req.max}`;
        const ans = await ask(`\n✦ ${req.prompt} — chọn ${range} người (${list}), nhập số ghế cách nhau bởi dấu cách: `);
        return { kind: 'targets', targets: ans ? ans.split(/\s+/).map(Number) : [] };
      }
      case 'respond':
      case 'save': {
        const title = req.type === 'respond' ? `⚔ ${req.reason}!` : `💀 ${req.dying === v.me ? 'Bạn' : v.players[req.dying].name} đang hấp hối (cần ${req.need} Đào).`;
        console.log(`\n${title}`);
        const specials = req.type === 'save' ? v.specialSaves ?? []
          : (req.virtuals ?? []).map((o) => ({ skill: `virtual:${o.skill}:${o.as}`, name: `${o.name} → ${o.label}` }));
        if (!v.responseOptions.length && !specials.length) { console.log('  Bạn không có lá phù hợp.'); return { kind: 'pass' }; }
        v.responseOptions.forEach((o, i) => {
          const c = v.myHand.find((x) => x.id === o.cardId)!;
          console.log(`  ${i + 1}. ${cardLabel(c)}${o.as !== c.name ? ` (như ${CARD_INFO[o.as].label})` : ''}`);
        });
        specials.forEach((sp, i) => console.log(`  ${v.responseOptions.length + i + 1}. ${sp.name}`));
        const idx = Number(await ask('  Chọn (Enter = không đánh): ')) - 1;
        const opt = v.responseOptions[idx];
        if (opt) return { kind: 'card', cardId: opt.cardId };
        const sp = specials[idx - v.responseOptions.length];
        return sp ? { kind: 'useSkill', skill: sp.skill, cardIds: [], targets: [] } : { kind: 'pass' };
      }
      case 'discard': {
        showTable(v);
        const ans = await ask(`Bạn phải bỏ ${req.count} lá. Nhập số thứ tự, cách nhau bởi dấu cách: `);
        const ids = ans.split(/\s+/).map((x) => v.myHand[Number(x) - 1]?.id).filter((x) => x !== undefined);
        return { kind: 'discard', cardIds: ids };
      }
      case 'chooseCards': {
        const cards = req.cardIds.map((id) => v.myHand.find((c) => c.id === id)!);
        console.log(`\n✦ ${req.prompt}`);
        cards.forEach((c, i) => console.log(`  ${i + 1}. ${cardLabel(c)}`));
        const range = req.min === req.max ? `${req.min}` : `${req.min}–${req.max}`;
        const ans = await ask(`  Chọn ${range} lá (số thứ tự, Enter = không chọn): `);
        return { kind: 'cards', cardIds: ans ? ans.split(/\s+/).map((x) => cards[Number(x) - 1]?.id).filter((x) => x !== undefined) : [] };
      }
    }
  }

  private async play(v: PlayerView): Promise<Response> {
    showTable(v);
    type Opt = { label: string; go: () => Promise<Response> };
    const opts: Opt[] = [];
    for (const h of v.hints) {
      const c = v.myHand.find((x) => x.id === h.cardId)!;
      const label = `Dùng ${cardLabel(c)}${h.as ? ` (như ${CARD_INFO[h.as].label})` : ''}`;
      opts.push({
        label,
        go: async () => {
          if (!h.needsTarget) return { kind: 'useCard', cardId: h.cardId, targets: [], as: h.as };
          const list = h.targets.map((s) => `${s}=${v.players[s].name}`).join(', ');
          const range = h.minTargets === h.maxTargets ? `${h.maxTargets}` : `${h.minTargets}–${h.maxTargets}`;
          const recast = h.minTargets === 0 ? ', Enter = trùng chú (bỏ lá này, bốc 1 lá)' : '';
          const t = await ask(`  Chọn ${range} mục tiêu (${list})${recast}: `);
          return { kind: 'useCard', cardId: h.cardId, targets: seatsOf(t), as: h.as };
        },
      });
    }
    for (const s of v.skillHints ?? []) {
      opts.push({
        label: `Kỹ năng: ${s.name}${s.reveals ? ' (sẽ lật tướng)' : ''}`,
        go: async () => {
          let cardIds: number[] = [];
          if (s.cards !== 'none') {
            const ans = await ask(`  Chọn ${s.cards === 'one' ? '1 lá' : 'các lá'} trên tay (số thứ tự): `);
            cardIds = ans.split(/\s+/).map((x) => v.myHand[Number(x) - 1]?.id).filter((x) => x !== undefined);
          }
          let targets: number[] = [];
          if (s.needsTarget) {
            const t = await ask(`  Mục tiêu (${s.targets.map((x) => `${x}=${v.players[x].name}`).join(', ')}): `);
            targets = [Number(t)];
          }
          return { kind: 'useSkill', skill: s.skill, cardIds, targets };
        },
      });
    }
    console.log('Hành động:');
    opts.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}`));
    const pick = opts[Number(await ask('Chọn (Enter = kết thúc giai đoạn ra bài): ')) - 1];
    return pick ? pick.go() : { kind: 'endPlay' };
  }
}

const seed = Number(process.argv[2]) || Date.now();
const names = ['Bạn', 'Bot Đông', 'Bot Tây', 'Bot Nam', 'Bot Bắc'];
const game = new HegemonyGame(
  names.map((name, i) => ({ name, controller: i === 0 ? new HumanController() : new HegemonyBot() })),
  { seed, candidates: 5, onLog: (line) => console.log(`  · ${line}`) },
);

const result = await game.run();
console.log(`\nKết thúc sau ${result.turns} lượt. Người thắng: ${result.winner ?? 'không có (hòa)'}`);
rl.close();
