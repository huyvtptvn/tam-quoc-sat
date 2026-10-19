// ============================================================
// Biên dịch nội dung JSON (kỹ năng, lá bài, tướng) thành object mà engine dùng.
// Mọi lỗi được gom lại kèm đường dẫn: "skills/vi-du.json > phanhoi > actions[0].count: ..."
// ============================================================
import type { Game } from '../core/game.js';
import type { DelayedDef, Targeting, TrickDef } from '../core/tricks.js';
import type { Card, CardName, EquipSlot } from '../core/types.js';
import type { HegemonyGame } from '../hegemony/game.js';
import type { ActiveSkill, AnyTrigger, BotHint, Skill } from '../hegemony/skills.js';
import { EVENT_SPECS, cardVars } from './events.js';
import { compileExpr, describeExprError, evalBool, evalNum, type Compiled, type Value } from './expr.js';
import { compileActions, GLOBAL_VARS, makeEnv, runActions, type CompileCtx } from './runtime.js';

// ------------------------------------------------------------
// Kiểu dữ liệu JSON
// ------------------------------------------------------------

export interface SkillJson {
  id: string;
  name: string;
  desc?: string;
  type: 'trigger' | 'active' | 'passive';
  position?: 'main' | 'deputy';
  bot?: BotHint;
  // trigger
  event?: string;
  role?: string;
  if?: string;
  optional?: boolean;
  limit?: { perTurn?: number; perGame?: number };
  actions?: unknown[];
  // active
  cards?: { min?: number; max?: number; filter?: string };
  target?: { filter?: string } | null;
  cost?: 'discard' | 'give' | 'none';
  // passive
  attackRange?: string;
  distanceFromOthers?: string;
  handLimit?: string;
  slashLimit?: number | 'inf';
  convert?: { from: string; as: string; if?: string }[];
  cannotBeTargetOfSha?: string;
  cannotTarget?: string;
  virtualArmor?: string;
  reach?: string;
  extraSlash?: string;
}

export interface CardJson {
  id: string;
  label: string;
  /** Mô tả hiển thị trên lá bài (tùy chọn). */
  desc?: string;
  /** Chữ lớn in giữa mặt bài mặc định khi chưa có ảnh (tùy chọn, 1–2 ký tự). */
  glyph?: string;
  type: 'trick' | 'delayed' | 'equip';
  // trick
  targeting?: Exclude<Targeting, 'custom'>;
  min?: number;
  max?: number;
  filter?: string;
  harmful?: boolean;
  recast?: boolean;
  actions?: unknown[];
  // delayed
  success?: string;
  // equip
  slot?: EquipSlot;
  range?: number;
  skill?: Omit<SkillJson, 'id' | 'name'> & { id?: string; name?: string };
}

export interface GeneralJson {
  id: string;
  name?: string;
  kingdom?: string;
  halfHp?: number;
  skills?: string[];
  pairs?: string[];
  /** "female" = tướng nữ (Thư Hùng Song Cổ Kiếm, Kết Nhân...). */
  gender?: string;
  /** Quân chủ (id dạng lord_<tướng thường>): không được chia, chỉ đổi từ tướng thường lúc đầu ván. */
  lord?: boolean;
  disabled?: boolean;
}

// ------------------------------------------------------------
// Tiện ích
// ------------------------------------------------------------

const ID_RE = /^[a-z][a-z0-9_]*$/;

function expr(src: unknown, cc: CompileCtx, where: string, extra: string[] = []): Compiled | undefined {
  try {
    const c = compileExpr(String(src));
    for (const v of c.vars) {
      if (!cc.vars.has(v) && !extra.includes(v)) {
        cc.errors.push(`${cc.path} > ${where}: biến "${v}" không dùng được ở đây. Các biến có: ${[...cc.vars, ...extra].sort().join(', ')}`);
      }
    }
    return c;
  } catch (e) {
    cc.errors.push(`${cc.path} > ${where}: ${describeExprError(String(src), e)}`);
    return undefined;
  }
}

/** Đếm số lần dùng kỹ năng: theo lượt và theo cả ván, tách riêng từng ván/từng người. */
const usage = new WeakMap<Game, Map<string, { turn: number; inTurn: number; total: number }>>();
function usageOf(g: Game, key: string) {
  let m = usage.get(g);
  if (!m) { m = new Map(); usage.set(g, m); }
  let u = m.get(key);
  if (!u) { u = { turn: -1, inTurn: 0, total: 0 }; m.set(key, u); }
  if (u.turn !== g.state.turnCount) { u.turn = g.state.turnCount; u.inTurn = 0; }
  return u;
}
function withinLimit(g: Game, key: string, limit?: { perTurn?: number; perGame?: number }): boolean {
  if (!limit) return true;
  const u = usageOf(g, key);
  return (limit.perTurn === undefined || u.inTurn < limit.perTurn) && (limit.perGame === undefined || u.total < limit.perGame);
}
function countUse(g: Game, key: string): void {
  const u = usageOf(g, key);
  u.inTurn++;
  u.total++;
}

const hg = (g: Game) => g as HegemonyGame;

// ------------------------------------------------------------
// Kỹ năng
// ------------------------------------------------------------

export function compileSkill(json: SkillJson, path: string, knownCards: Set<string>): { skill?: Skill; errors: string[] } {
  const errors: string[] = [];
  const p = `${path} > ${json?.id ?? '(thiếu id)'}`;
  if (!json || typeof json !== 'object') return { errors: [`${path}: kỹ năng phải là object`] };
  if (!ID_RE.test(String(json.id ?? ''))) errors.push(`${p}: "id" phải viết thường, không dấu, chỉ gồm a-z 0-9 _ (ví dụ "phan_hoi")`);
  if (!json.name) errors.push(`${p}: thiếu "name"`);
  if (json.position && !['main', 'deputy'].includes(json.position)) errors.push(`${p}: "position" chỉ nhận "main" hoặc "deputy"`);

  const skill: Skill = { id: json.id, name: json.name, desc: json.desc ?? '', origin: 'content' };
  if (json.position) skill.position = json.position;
  if (json.bot) skill.bot = json.bot;
  const base = new Set(['self', ...Object.keys(GLOBAL_VARS)]);
  const key = `skill:${json.id}`;

  switch (json.type) {
    case 'trigger': {
      const spec = EVENT_SPECS[json.event ?? ''];
      if (!spec) {
        errors.push(`${p}: "event" không hợp lệ: "${json.event}". Các sự kiện: ${Object.keys(EVENT_SPECS).join(', ')}`);
        break;
      }
      const cc: CompileCtx = { path: p, vars: new Set([...base, ...Object.keys(spec.vars)]), mods: spec.mods, errors };
      if (json.role && !spec.vars[json.role]) errors.push(`${p}: "role" phải là một biến của sự kiện: ${Object.keys(spec.vars).join(', ')}`);
      const cond = json.if !== undefined ? expr(json.if, cc, 'if') : undefined;
      const actions = compileActions(json.actions ?? [], cc, 'actions');
      if (!json.actions?.length) errors.push(`${p}: kỹ năng kích hoạt cần ít nhất 1 hành động trong "actions"`);
      const vars = (g: Game, ctx: unknown, owner: number): Record<string, Value> => ({ self: owner, ...spec.read(ctx, g) });
      const trig = {
        event: spec.engine,
        compulsory: json.optional === false,
        can: (g: HegemonyGame, ctx: unknown, owner: number) => {
          if (spec.filter && !spec.filter(ctx, g)) return false;
          const v = vars(g, ctx, owner);
          if (json.role && v[json.role] !== owner) return false;
          if (!withinLimit(g, `${key}:${owner}`, json.limit)) return false;
          return !cond || evalBool(cond, makeEnv(g, v));
        },
        run: async (g: HegemonyGame, ctx: unknown, owner: number) => {
          countUse(g, `${key}:${owner}`);
          await runActions(actions, { g, vars: vars(g, ctx, owner), ctx, label: json.name });
        },
      };
      skill.triggers = [trig as unknown as AnyTrigger];
      break;
    }

    case 'active': {
      const minC = json.cards?.min ?? 0;
      const maxC = json.cards?.max ?? minC;
      if (minC < 0 || maxC < minC) errors.push(`${p}: "cards" cần 0 <= min <= max`);
      const cc: CompileCtx = { path: p, vars: new Set([...base, 'cards', 'target']), mods: [], errors };
      const cardFilter = json.cards?.filter ? expr(json.cards.filter, { ...cc, vars: new Set([...base, 'card']) }, 'cards.filter') : undefined;
      const needTarget = !!json.target;
      const tFilter = needTarget ? expr(json.target!.filter ?? 't != self', { ...cc, vars: new Set([...base, 't']) }, 'target.filter') : undefined;
      const avail = json.if !== undefined ? expr(json.if, { ...cc, vars: base }, 'if') : undefined;
      const cost = json.cost ?? (maxC > 0 ? 'discard' : 'none');
      if (!['discard', 'give', 'none'].includes(cost)) errors.push(`${p}: "cost" chỉ nhận discard | give | none`);
      if (cost === 'give' && !needTarget) errors.push(`${p}: cost "give" cần có "target"`);
      const actions = compileActions(json.actions ?? [], cc, 'actions');
      const active: ActiveSkill = {
        cards: maxC === 0 ? 'none' : minC === 1 && maxC === 1 ? 'one' : 'any',
        target: needTarget ? 'one' : 'none',
        available: (g, seat) => withinLimit(g, `${key}:${seat}`, json.limit)
          && (minC === 0 || g.player(seat).hand.length >= minC)
          && (!avail || evalBool(avail, makeEnv(g, { self: seat }))),
        validTarget: tFilter ? (g, seat, t) => evalBool(tFilter, makeEnv(g, { self: seat, t })) : undefined,
        minCards: minC,
        maxCards: maxC,
        cardOk: (g, seat, id) => !cardFilter || evalBool(cardFilter, makeEnv(g, { self: seat, card: cardVars(g.card(id)) })),
        checkCards: (g, seat, ids) => {
          if (ids.length < minC || ids.length > maxC) return minC === maxC ? `Cần chọn đúng ${minC} lá` : `Cần chọn ${minC}–${maxC} lá`;
          if (cardFilter && !ids.every((id) => evalBool(cardFilter, makeEnv(g, { self: seat, card: cardVars(g.card(id)) })))) return 'Lá được chọn không hợp lệ';
          return null;
        },
        run: async (g, seat, ids, targets) => {
          countUse(g, `${key}:${seat}`);
          const cards = ids.map((id) => cardVars(g.card(id)));
          if (ids.length && cost === 'discard') await g.moveCards(ids, { kind: 'hand', seat }, { kind: 'discard' }, json.id);
          if (ids.length && cost === 'give') await g.moveCards(ids, { kind: 'hand', seat }, { kind: 'hand', seat: targets[0] }, json.id);
          await runActions(actions, { g, vars: { self: seat, cards, target: targets[0] ?? null }, ctx: null, label: json.name });
        },
      };
      skill.active = active;
      break;
    }

    case 'passive': {
      const cc: CompileCtx = { path: p, vars: base, mods: [], errors };
      const num = (field: keyof SkillJson) => {
        const c = expr(json[field], cc, String(field));
        return c ? (g: HegemonyGame, owner: number) => evalNum(c, makeEnv(g, { self: owner })) : undefined;
      };
      if (json.attackRange !== undefined) skill.rangeBonus = num('attackRange');
      if (json.distanceFromOthers !== undefined) skill.defenseBonus = num('distanceFromOthers');
      if (json.handLimit !== undefined) skill.handLimitBonus = num('handLimit');
      if (json.slashLimit !== undefined) {
        if (json.slashLimit === 'inf') skill.slashLimit = Infinity;
        else if (typeof json.slashLimit === 'number' && json.slashLimit >= 1) skill.slashLimit = json.slashLimit;
        else errors.push(`${p}: "slashLimit" là số >= 1 hoặc "inf"`);
      }
      if (json.convert !== undefined) {
        if (!Array.isArray(json.convert)) errors.push(`${p}: "convert" phải là danh sách`);
        const rules = (Array.isArray(json.convert) ? json.convert : []).map((r, i) => {
          if (!knownCards.has(r.as)) errors.push(`${p} > convert[${i}].as: không có loại bài "${r.as}"`);
          return {
            as: r.as as CardName,
            from: expr(r.from ?? 'true', { ...cc, vars: new Set([...base, 'card']) }, `convert[${i}].from`),
            when: r.if !== undefined ? expr(r.if, cc, `convert[${i}].if`) : undefined,
          };
        });
        skill.convert = (g, seat, card) => rules
          .filter((r) => r.from && evalBool(r.from, makeEnv(g, { self: seat, card: cardVars(card) }))
            && (!r.when || evalBool(r.when, makeEnv(g, { self: seat }))))
          .map((r) => r.as);
      }
      if (json.cannotBeTargetOfSha !== undefined) {
        const c = expr(json.cannotBeTargetOfSha, cc, 'cannotBeTargetOfSha');
        if (c) skill.slashImmune = (g, owner) => evalBool(c, makeEnv(g, { self: owner }));
      }
      if (json.cannotTarget !== undefined) {
        const c = expr(json.cannotTarget, { ...cc, vars: new Set([...base, 't']) }, 'cannotTarget');
        if (c) skill.restrictTarget = (g, owner, t) => evalBool(c, makeEnv(g, { self: owner, t }));
      }
      if (json.virtualArmor !== undefined) {
        const armor = String(json.virtualArmor);
        if (!['bagua', 'renwang', 'tengjia', 'baiyin'].includes(armor) && !(knownCards.has(armor))) errors.push(`${p}: "virtualArmor" không có giáp "${armor}"`);
        skill.virtualArmor = () => armor as CardName;
      }
      if (json.reach !== undefined) skill.offenseBonus = num('reach');
      if (json.extraSlash !== undefined) skill.slashBonus = num('extraSlash');
      const fields = ['attackRange', 'distanceFromOthers', 'handLimit', 'slashLimit', 'convert', 'cannotBeTargetOfSha', 'cannotTarget', 'virtualArmor', 'reach', 'extraSlash'];
      if (!fields.some((f) => (json as unknown as Record<string, unknown>)[f] !== undefined)) {
        errors.push(`${p}: kỹ năng bị động cần ít nhất một trong: ${fields.join(', ')}`);
      }
      break;
    }

    default:
      errors.push(`${p}: "type" phải là "trigger" (kích hoạt), "active" (chủ động) hoặc "passive" (bị động)`);
  }
  return errors.length ? { errors } : { skill, errors };
}

// ------------------------------------------------------------
// Lá bài
// ------------------------------------------------------------

export interface CompiledCard {
  id: string;
  label: string;
  desc?: string;
  glyph?: string;
  type: 'trick' | 'delayed' | 'equip';
  slot?: EquipSlot;
  range?: number;
  trick?: TrickDef;
  delayed?: DelayedDef;
  equipSkill?: Skill;
}

export function compileCard(json: CardJson, path: string, knownCards: Set<string>): { card?: CompiledCard; errors: string[] } {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') return { errors: [`${path}: lá bài phải là object`] };
  const p = `${path} > ${json.id ?? '(thiếu id)'}`;
  if (!ID_RE.test(String(json.id ?? ''))) errors.push(`${p}: "id" phải viết thường, không dấu, chỉ gồm a-z 0-9 _`);
  if (!json.label) errors.push(`${p}: thiếu "label" (tên hiển thị)`);
  const base = new Set(['self', ...Object.keys(GLOBAL_VARS)]);
  const out: CompiledCard = { id: json.id, label: json.label, type: json.type, ...(json.desc ? { desc: String(json.desc) } : {}), ...(json.glyph ? { glyph: String(json.glyph).slice(0, 2) } : {}) };

  switch (json.type) {
    case 'trick': {
      const targeting = json.targeting ?? 'one';
      if (!['one', 'allOthers', 'all', 'self'].includes(targeting)) errors.push(`${p}: "targeting" chỉ nhận one | allOthers | all | self`);
      const cc: CompileCtx = { path: p, vars: new Set([...base, 'user', 'target', 'card']), mods: [], errors };
      const filter = targeting === 'one' ? expr(json.filter ?? 't != self', { ...cc, vars: new Set([...base, 't']) }, 'filter') : undefined;
      const actions = compileActions(json.actions ?? [], cc, 'actions');
      if (!json.actions?.length) errors.push(`${p}: cẩm nang cần ít nhất 1 hành động trong "actions"`);
      out.trick = {
        name: json.id as CardName,
        targeting,
        min: json.min ?? 1,
        max: json.max ?? 1,
        recast: json.recast ?? false,
        harmful: json.harmful ?? true,
        validTarget: filter ? (g, user, t) => evalBool(filter, makeEnv(hg(g), { self: user, t })) : undefined,
        effect: async (g: Game, user: number, target: number, card: Card) => {
          await runActions(actions, { g: hg(g), vars: { self: user, user, target, card: cardVars(card) }, ctx: null, label: json.label });
        },
      };
      break;
    }
    case 'delayed': {
      const cc: CompileCtx = { path: p, vars: new Set([...base, 'target', 'judge']), mods: [], errors };
      const filter = expr(json.filter ?? 't != self', { ...cc, vars: new Set([...base, 't']) }, 'filter');
      const success = expr(json.success ?? '', { ...cc, vars: new Set([...base, 'judge', 'target']) }, 'success');
      const actions = compileActions(json.actions ?? [], cc, 'actions');
      if (!json.success) errors.push(`${p}: cẩm nang trì hoãn cần "success" (điều kiện phán định trúng)`);
      out.delayed = {
        name: json.id as CardName,
        harmful: true,
        validTarget: (g, user, t) => !!filter && evalBool(filter, makeEnv(hg(g), { self: user, t })),
        hits: (j, g, seat) => !!success && evalBool(success, makeEnv(hg(g), { self: seat, target: seat, judge: cardVars(j) })),
        onHit: async (g, seat, card) => {
          await runActions(actions, { g: hg(g), vars: { self: seat, target: seat, card: cardVars(card) }, ctx: null, label: json.label });
        },
      };
      break;
    }
    case 'equip': {
      if (!['weapon', 'armor', 'defHorse', 'offHorse', 'treasure'].includes(json.slot ?? '')) errors.push(`${p}: "slot" chỉ nhận weapon | armor | defHorse | offHorse | treasure`);
      out.slot = json.slot;
      if (json.slot === 'weapon') {
        out.range = json.range ?? 1;
        if (!Number.isInteger(out.range) || out.range < 1) errors.push(`${p}: "range" là số nguyên >= 1`);
      }
      if (json.skill) {
        const r = compileSkill({ id: `equip_${json.id}`, name: json.label, ...json.skill } as SkillJson, `${path} > ${json.id} > skill`, knownCards);
        errors.push(...r.errors);
        out.equipSkill = r.skill;
      }
      break;
    }
    default:
      errors.push(`${p}: "type" chỉ nhận trick | delayed | equip (bài cơ bản như Sát/Thiểm cần sửa code engine)`);
  }
  return errors.length ? { errors } : { card: out, errors };
}

// ------------------------------------------------------------
// Tướng
// ------------------------------------------------------------

export function checkGeneral(json: GeneralJson, path: string, isNew: boolean, knownSkills: Set<string>, knownGenerals: Set<string>): string[] {
  const errors: string[] = [];
  const p = `${path} > ${json?.id ?? '(thiếu id)'}`;
  if (!json || !ID_RE.test(String(json.id ?? ''))) return [`${p}: "id" phải viết thường, không dấu, chỉ gồm a-z 0-9 _`];
  if (isNew) {
    if (!json.name) errors.push(`${p}: tướng mới cần "name"`);
    if (!json.kingdom) errors.push(`${p}: tướng mới cần "kingdom"`);
    if (json.halfHp === undefined) errors.push(`${p}: tướng mới cần "halfHp"`);
  }
  if (json.kingdom !== undefined && !['wei', 'shu', 'wu', 'qun', 'ye'].includes(json.kingdom)) errors.push(`${p}: "kingdom" chỉ nhận wei | shu | wu | qun | ye (Dã tâm gia)`);
  if (json.halfHp !== undefined && (!Number.isInteger(json.halfHp) || json.halfHp < 1 || json.halfHp > 10)) errors.push(`${p}: "halfHp" là số nguyên 1–10`);
  if (json.gender !== undefined && !['male', 'female'].includes(json.gender)) errors.push(`${p}: "gender" chỉ nhận male | female`);
  for (const s of json.skills ?? []) if (!knownSkills.has(s)) errors.push(`${p}: không có kỹ năng "${s}"`);
  for (const g of json.pairs ?? []) if (!knownGenerals.has(g)) errors.push(`${p} > pairs: không có tướng "${g}"`);
  return errors;
}
