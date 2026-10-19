// ============================================================
// Bộ nạp nội dung: đọc thư mục content/, kiểm tra, rồi áp dụng vào engine.
//
//   content/
//   ├── skills/*.json     kỹ năng (mỗi file: 1 object hoặc danh sách)
//   ├── generals/*.json   tướng mới hoặc chỉnh tướng có sẵn
//   ├── cards/*.json      lá bài mới (cẩm nang, cẩm nang trì hoãn, trang bị)
//   ├── deck.json         chỉnh bộ bài (thêm/bớt/thay thế)
//   └── scripts/*.mjs     (nâng cao) kỹ năng viết bằng JavaScript
// ============================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARD_INFO, STANDARD_DECK } from '../core/cards.js';
import { DELAYED_DEFS, TRICK_DEFS, type TrickDef } from '../core/tricks.js';
import type { CardName } from '../core/types.js';
import { GENERALS, PAIRS, reindexGenerals, type General, type Kingdom } from '../hegemony/generals.js';
import { EQUIP_SKILLS, SKILLS, type Skill } from '../hegemony/skills.js';
import { checkGeneral, compileCard, compileSkill, type CardJson, type CompiledCard, type GeneralJson, type SkillJson } from './dsl.js';
import { baseline, resetToBaseline } from './registry.js';

export interface DeckJson {
  /** add: thêm vào bộ bài gốc (mặc định) | replace: thay toàn bộ. */
  mode?: 'add' | 'replace';
  /** Danh sách [loại bài, "S7 H8 ...", thuộc tính?]. S=Bích H=Cơ C=Chuồn D=Rô, điểm 1–13. */
  cards?: [string, string, ('fire' | 'thunder')?][];
  /** Bỏ hẳn các loại bài này khỏi bộ bài. */
  remove?: string[];
}

export interface ContentSummary {
  version: number;
  skills: string[];
  generals: string[];
  patchedGenerals: string[];
  disabledGenerals: string[];
  cards: string[];
  deckSize: number;
  scripts: string[];
}

export interface Prepared {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: Omit<ContentSummary, 'version'>;
  /** Áp dụng vào engine (chỉ gọi khi ok). */
  apply: () => ContentSummary;
}

let version = 0;
let current: ContentSummary | null = null;
/** Tướng đang tắt (ví dụ tướng mới chưa có kỹ năng): không vào ván, nhưng vẫn hiện trong danh mục / trang quản trị. */
export const DISABLED_GENERALS: General[] = [];
export const currentContent = () => current;

/** Đọc toàn bộ file (đường dẫn tương đối dùng dấu /) trong thư mục, kèm nội dung ghi đè (để kiểm tra trước khi lưu). */
export function listContentFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      if (name.startsWith('.')) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(json|mjs|js|md)$/.test(name)) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

function parseJsonFile(rel: string, text: string, errors: string[]): unknown[] {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : [data];
    // Phần tử chỉ có các khóa bắt đầu bằng "_" là ghi chú, bỏ qua.
    const isNote = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every((k) => k.startsWith('_'));
    return rel === 'deck.json' ? list : list.filter((x) => !isNote(x));
  } catch (e) {
    const m = /position (\d+)/.exec(String(e));
    let where = '';
    if (m) {
      const pos = Number(m[1]);
      const line = text.slice(0, pos).split('\n').length;
      where = ` (dòng ${line})`;
    }
    errors.push(`${rel}: JSON không hợp lệ${where}: ${(e as Error).message}`);
    return [];
  }
}

const DECK_CODE = /^[SHCD](1[0-3]|[1-9])[*!]*$/;

/**
 * Đọc và kiểm tra toàn bộ nội dung. KHÔNG thay đổi engine cho đến khi gọi `apply()`.
 * `overrides`: { "skills/x.json": "nội dung mới" | null (= xóa) } để kiểm tra trước khi lưu file.
 */
export async function prepareContent(dir: string, overrides: Record<string, string | null> = {}): Promise<Prepared> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = baseline();

  // ---- Đọc file ----
  const files = new Set(listContentFiles(dir));
  for (const [k, v] of Object.entries(overrides)) { if (v === null) files.delete(k); else files.add(k); }
  const read = (rel: string) => (rel in overrides ? overrides[rel] as string : readFileSync(join(dir, rel), 'utf8'));
  const inDir = (sub: string) => [...files].filter((f) => f.startsWith(`${sub}/`) && f.endsWith('.json'));

  const skillJson: { rel: string; data: SkillJson }[] = [];
  for (const rel of inDir('skills')) for (const d of parseJsonFile(rel, read(rel), errors)) skillJson.push({ rel, data: d as SkillJson });
  const generalJson: { rel: string; data: GeneralJson }[] = [];
  for (const rel of inDir('generals')) for (const d of parseJsonFile(rel, read(rel), errors)) generalJson.push({ rel, data: d as GeneralJson });
  const cardJson: { rel: string; data: CardJson }[] = [];
  for (const rel of inDir('cards')) for (const d of parseJsonFile(rel, read(rel), errors)) cardJson.push({ rel, data: d as CardJson });
  let deck: DeckJson | null = null;
  if (files.has('deck.json')) deck = (parseJsonFile('deck.json', read('deck.json'), errors)[0] as DeckJson) ?? null;

  // ---- Script nâng cao (.mjs) ----
  const scriptSkills: Skill[] = [];
  const scriptTricks: TrickDef[] = [];
  const scripts = [...files].filter((f) => f.startsWith('scripts/') && /\.(mjs|js)$/.test(f));
  for (const rel of scripts) {
    try {
      const mod = await import(`${pathToFileURL(join(dir, rel)).href}?v=${Date.now()}`);
      const def = mod.default ?? {};
      for (const s of def.skills ?? []) {
        if (!s?.id || !s?.name) { errors.push(`${rel}: kỹ năng trong script cần "id" và "name"`); continue; }
        scriptSkills.push({ ...s, origin: 'content' });
      }
      for (const t of def.tricks ?? []) scriptTricks.push(t);
    } catch (e) {
      errors.push(`${rel}: lỗi khi chạy script: ${(e as Error).message}`);
    }
  }

  // ---- Lá bài ----
  const knownCards = new Set<string>([...Object.keys(base.cardInfo), ...cardJson.map((c) => c.data?.id)]);
  const compiledCards: CompiledCard[] = [];
  const seenCards = new Set<string>();
  for (const { rel, data } of cardJson) {
    if (data?.id && seenCards.has(data.id)) errors.push(`${rel} > ${data.id}: trùng id lá bài`);
    if (data?.id && data.id in base.cardInfo) errors.push(`${rel} > ${data.id}: trùng với lá bài có sẵn, hãy đặt id khác`);
    seenCards.add(data?.id);
    const r = compileCard(data, rel, knownCards);
    errors.push(...r.errors);
    if (r.card) compiledCards.push(r.card);
  }

  // ---- Kỹ năng ----
  const compiledSkills: Skill[] = [];
  const seenSkills = new Set<string>();
  for (const { rel, data } of skillJson) {
    if (data?.id && seenSkills.has(data.id)) errors.push(`${rel} > ${data.id}: trùng id kỹ năng`);
    seenSkills.add(data?.id);
    if (data?.id && data.id in base.skills) warnings.push(`${rel} > ${data.id}: ghi đè kỹ năng có sẵn "${(base.skills[data.id] as Skill).name}"`);
    const r = compileSkill(data, rel, knownCards);
    errors.push(...r.errors);
    if (r.skill) compiledSkills.push(r.skill);
  }
  for (const s of scriptSkills) {
    if (seenSkills.has(s.id)) errors.push(`scripts: kỹ năng "${s.id}" trùng id với kỹ năng JSON`);
    seenSkills.add(s.id);
    compiledSkills.push(s);
  }
  const knownSkills = new Set([...Object.keys(base.skills), ...seenSkills]);

  // ---- Tướng (thêm mới hoặc chỉnh tướng có sẵn) ----
  const merged = new Map<string, General & { disabled?: boolean }>(base.generals.map((g) => [g.id, { ...g, skills: [...g.skills] }]));
  const newIds: string[] = [];
  const patched: string[] = [];
  const disabled: string[] = [];
  const pairs: [string, string][] = [];
  const allIds = new Set([...merged.keys(), ...generalJson.map((g) => g.data?.id)]);
  for (const { rel, data } of generalJson) {
    const exists = merged.has(data?.id);
    errors.push(...checkGeneral(data, rel, !exists, knownSkills, allIds));
    if (!data?.id) continue;
    const prev = merged.get(data.id);
    const g = {
      id: data.id,
      name: data.name ?? prev?.name ?? data.id,
      kingdom: (data.kingdoms?.[0] ?? data.kingdom ?? prev?.kingdom ?? 'wei') as Kingdom,
      kingdoms: (data.kingdoms ?? prev?.kingdoms) as Kingdom[] | undefined,
      halfHp: data.halfHp ?? prev?.halfHp ?? 4,
      skills: data.skills ?? prev?.skills ?? [],
      disabled: data.disabled ?? prev?.disabled ?? false,
      female: data.gender === undefined ? prev?.female : data.gender === 'female',
      lord: data.lord === undefined ? prev?.lord : !!data.lord,
    };
    merged.set(data.id, g);
    if (g.disabled) disabled.push(data.id);
    else if (exists) patched.push(data.id);
    else newIds.push(data.id);
    for (const other of data.pairs ?? []) pairs.push([data.id, other]);
  }
  for (const k of ['wei', 'shu', 'wu', 'qun']) {
    const n = [...merged.values()].filter((g) => g.kingdom === k && !g.disabled).length;
    if (n < 2) errors.push(`Thế lực ${k} chỉ còn ${n} tướng, cần ít nhất 2 để chia tướng`);
  }

  // ---- Bộ bài ----
  let deckSize = base.deck.reduce((n, e) => n + String(e[1]).trim().split(/\s+/).length, 0);
  if (deck) {
    if (deck.mode && !['add', 'replace'].includes(deck.mode)) errors.push('deck.json: "mode" chỉ nhận add | replace');
    for (const [i, entry] of (deck.cards ?? []).entries()) {
      const [name, spec, nature] = entry ?? [];
      if (!knownCards.has(name)) errors.push(`deck.json > cards[${i}]: không có loại bài "${name}"`);
      const codes = String(spec ?? '').trim().split(/\s+/).filter(Boolean);
      if (codes.length === 0) errors.push(`deck.json > cards[${i}]: thiếu danh sách lá, ví dụ "S7 H10 D1"`);
      for (const c of codes) if (!DECK_CODE.test(c)) errors.push(`deck.json > cards[${i}]: "${c}" sai định dạng (chất S/H/C/D + điểm 1–13, ví dụ S7, H13)`);
      if (nature !== undefined && name !== 'sha') errors.push(`deck.json > cards[${i}]: chỉ Sát mới có thuộc tính fire/thunder`);
    }
    for (const r of deck.remove ?? []) if (!knownCards.has(r)) errors.push(`deck.json > remove: không có loại bài "${r}"`);
    const kept = deck.mode === 'replace' ? [] : base.deck.filter((e) => !(deck!.remove ?? []).includes(String(e[0])));
    deckSize = [...kept, ...(deck.cards ?? [])].reduce((n, e) => n + String(e[1] ?? '').trim().split(/\s+/).filter(Boolean).length, 0);
    if (deckSize < 40) errors.push(`deck.json: bộ bài chỉ còn ${deckSize} lá, cần ít nhất 40`);
  }
  const contentCardIds = compiledCards.map((c) => c.id);
  const inDeck = new Set((deck?.cards ?? []).map((e) => e[0]));
  for (const id of contentCardIds) if (!inDeck.has(id)) warnings.push(`cards > ${id}: lá bài chưa có trong deck.json nên sẽ không xuất hiện trong ván`);

  const summary = {
    skills: compiledSkills.map((s) => s.id),
    generals: newIds,
    patchedGenerals: patched,
    disabledGenerals: disabled,
    cards: contentCardIds,
    deckSize,
    scripts,
  };

  const apply = (): ContentSummary => {
    if (errors.length) throw new Error('Nội dung còn lỗi, không thể áp dụng');
    resetToBaseline();
    for (const c of compiledCards) {
      (CARD_INFO as Record<string, unknown>)[c.id] = { label: c.label, type: c.type, ...(c.desc ? { desc: c.desc } : {}), ...(c.glyph ? { glyph: c.glyph } : {}), ...(c.slot ? { slot: c.slot } : {}), ...(c.range ? { range: c.range } : {}) };
      if (c.trick) TRICK_DEFS[c.id as CardName] = c.trick;
      if (c.delayed) DELAYED_DEFS[c.id as CardName] = c.delayed;
      if (c.equipSkill) { SKILLS[c.equipSkill.id] = c.equipSkill; EQUIP_SKILLS[c.id] = c.equipSkill.id; }
    }
    for (const t of scriptTricks) TRICK_DEFS[t.name] = t;
    for (const s of compiledSkills) SKILLS[s.id] = s;
    GENERALS.length = 0;
    DISABLED_GENERALS.length = 0;
    for (const g of merged.values()) {
      const plain = { id: g.id, name: g.name, kingdom: g.kingdom, halfHp: g.halfHp, skills: g.skills, ...(g.female ? { female: true } : {}), ...(g.lord ? { lord: true } : {}), ...(g.kingdoms && g.kingdoms.length > 1 ? { kingdoms: g.kingdoms } : {}) };
      (g.disabled ? DISABLED_GENERALS : GENERALS).push(plain);
    }
    reindexGenerals();
    PAIRS.push(...pairs);
    if (deck) {
      if (deck.mode === 'replace') STANDARD_DECK.length = 0;
      const removed = new Set(deck.remove ?? []);
      const kept = STANDARD_DECK.filter((e) => !removed.has(e[0]));
      STANDARD_DECK.length = 0;
      STANDARD_DECK.push(...kept, ...((deck.cards ?? []) as typeof STANDARD_DECK));
    }
    current = { version: ++version, ...summary };
    return current;
  };

  return { ok: errors.length === 0, errors, warnings, summary, apply };
}

/** Đọc + kiểm tra + áp dụng ngay (dùng khi khởi động server hoặc trong script). */
export async function loadContent(dir: string): Promise<Prepared & { applied?: ContentSummary }> {
  const p = await prepareContent(dir);
  return p.ok ? { ...p, applied: p.apply() } : p;
}
