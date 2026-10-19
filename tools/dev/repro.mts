import { loadContent } from '../../src/content/loader.ts';
import { HegemonyGame } from '../../src/hegemony/game.ts';
import { HegemonyBot } from '../../src/hegemony/bot.ts';
import { GENERALS } from '../../src/hegemony/generals.ts';
const [focus, seedS, players = '6'] = process.argv.slice(2);
await loadContent(new URL('../../content', import.meta.url).pathname);
const { focusPresets } = await import('../../src/content/check.ts') as any;
const log: string[] = [];
const g = new HegemonyGame(Array.from({ length: +players }, (_, i) => ({ name: `Bot ${i}`, controller: new HegemonyBot() })),
  { seed: +seedS, maxTurns: 800, candidates: Math.min(7, Math.floor(GENERALS.length / +players)),
    ...(focus !== '-' ? { presetGenerals: focusPresets(focus, +players, +seedS) } : {}), onLog: (l) => log.push(l) });
try { await g.run(); console.log('OK', g.result); } catch (e) { console.log(log.slice(-25).join('\n')); console.log(e); }
