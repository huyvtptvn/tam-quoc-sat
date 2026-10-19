// ============================================================
// Hành động (phần "THÌ") của kỹ năng JSON: biên dịch + chạy.
// ============================================================
import { cardLabel } from '../core/cards.js';
import { pickCardFrom } from '../core/tricks.js';
import { EQUIP_SLOTS, type CardName, type Nature } from '../core/types.js';
import type { HegemonyGame } from '../hegemony/game.js';
import { cardVars } from './events.js';
import { compileExpr, describeExprError, evalBool, evalNum, type Compiled, type Env, type Value } from './expr.js';

// ------------------------------------------------------------
// Môi trường biểu thức
// ------------------------------------------------------------

/** Biến luôn có ở mọi nơi. */
export const GLOBAL_VARS: Record<string, string> = {
  self: 'Chủ kỹ năng (ghế của bạn)',
  turnOwner: 'Người đang trong lượt',
  aliveCount: 'Số người còn sống',
  turn: 'Số thứ tự lượt hiện tại',
  revealedFactions: 'Số thế lực đã lộ diện',
};

/** Thuộc tính đọc được từ một người chơi, ví dụ target.hp. */
export const PLAYER_PROPS: Record<string, string> = {
  hp: 'Máu hiện tại', maxHp: 'Máu tối đa', lostHp: 'Số máu đã mất',
  hand: 'Số bài trên tay', cards: 'Số bài trên tay + trang bị', equips: 'Số trang bị', judges: 'Số lá trong khu vực phán định',
  alive: 'Còn sống không', chained: 'Đang bị xích không', seat: 'Số ghế', name: 'Tên',
  kingdom: "Thế lực đã lộ: 'wei' | 'shu' | 'wu' | 'qun' | 'careerist' | 'unknown'", revealed: 'Đã lật ít nhất 1 tướng chưa',
  weapon: "Tên vũ khí đang cầm ('' nếu không có)", armor: "Tên giáp ('' nếu không có)",
  range: 'Tầm đánh', isTurnOwner: 'Có đang trong lượt của mình không',
  faceDown: 'Đang bị lật úp không (sẽ bỏ qua lượt kế tiếp)',
  flags: 'Các cờ do kỹ năng đặt (self.flags.tenCo), tự xóa đầu lượt của người đó',
};

export function makeEnv(g: HegemonyGame, vars: Record<string, Value>): Env {
  return {
    vars: {
      turnOwner: g.state.currentSeat,
      aliveCount: g.alivePlayers().length,
      turn: g.state.turnCount + 1,
      revealedFactions: g.revealedFactionCount(),
      ...vars,
    },
    player(seat, prop) {
      if (!Number.isInteger(seat) || seat < 0 || seat >= g.state.players.length) return null;
      const p = g.player(seat);
      switch (prop) {
        case 'hp': return p.hp;
        case 'maxHp': return p.maxHp;
        case 'lostHp': return p.maxHp - p.hp;
        case 'hand': return p.hand.length;
        case 'cards': return g.cardCount(seat);
        case 'equips': return EQUIP_SLOTS.reduce((n, s) => n + p.equips[s].length, 0);
        case 'judges': return p.judgeArea.length;
        case 'alive': return p.alive;
        case 'chained': return p.chained;
        case 'seat': return seat;
        case 'name': return p.name;
        case 'kingdom': return g.heroes[seat] ? g.shownKingdom(seat) ?? 'unknown' : 'unknown';
        case 'revealed': return g.heroes[seat] ? g.isRevealedAny(seat) : false;
        case 'weapon': return g.weaponName(seat) ?? '';
        case 'armor': return g.equipOf(seat, 'armor')?.name ?? '';
        case 'range': return g.attackRange(seat);
        case 'isTurnOwner': return g.state.currentSeat === seat;
        case 'faceDown': return !!p.faceDown;
        case 'flags': {
          const out: Record<string, Value> = {};
          for (const [k, v] of Object.entries(p.flags)) if (k.startsWith('u_')) out[k.slice(2)] = v;
          return out;
        }
        default: return null;
      }
    },
    call(fn, args) {
      const n = (i: number) => (typeof args[i] === 'number' ? (args[i] as number) : 0);
      switch (fn) {
        case 'min': return Math.min(...args.map((_, i) => n(i)));
        case 'max': return Math.max(...args.map((_, i) => n(i)));
        case 'abs': return Math.abs(n(0));
        case 'floor': return Math.floor(n(0));
        case 'distance': return g.isAliveSeat(n(0)) && g.isAliveSeat(n(1)) ? g.distance(n(0), n(1)) : 99;
        case 'inRange': return g.isAliveSeat(n(0)) && g.isAliveSeat(n(1)) && g.distance(n(0), n(1)) <= g.attackRange(n(0));
        case 'sameFaction': return g.isSameFaction(n(0), n(1));
        case 'differentFaction': return g.isDifferentFaction(n(0), n(1));
        case 'random': return g.randomInt(Math.max(1, n(0)));
        case 'besieged': return g.isAliveSeat(n(0)) && g.besiegers(n(0)) !== null;
        case 'besieging': { const b = g.isAliveSeat(n(1)) ? g.besiegers(n(1)) : null; return !!b && b.includes(n(0)); }
        case 'bigFaction': return g.isAliveSeat(n(0)) && g.isBig(n(0));
        case 'smallFaction': return g.isAliveSeat(n(0)) && g.isSmall(n(0));
        default: return null;
      }
    },
  };
}

// ------------------------------------------------------------
// Biên dịch
// ------------------------------------------------------------

/** Ngữ cảnh khi biên dịch: đường dẫn để báo lỗi, biến dùng được, hành động sửa sự kiện được phép. */
export interface CompileCtx {
  path: string;
  vars: Set<string>;
  mods: string[];
  errors: string[];
}

export interface CompiledAction {
  do: string;
  cond?: Compiled;
  exprs: Record<string, Compiled>;
  texts: Record<string, string>;
  blocks: Record<string, CompiledAction[]>;
  options: { label: string; cond?: Compiled; actions: CompiledAction[] }[];
}

type ParamType = 'expr' | 'text' | 'actions' | 'options';
interface ParamSpec { type: ParamType; required?: boolean; default?: string; desc: string; values?: string[] }
export interface ActionSpec {
  desc: string;
  params: Record<string, ParamSpec>;
  /** Hành động sửa sự kiện: chỉ dùng được ở sự kiện cho phép. */
  mod?: boolean;
  /** Biến mới mà khối con (then) được dùng. */
  adds?: (raw: Record<string, unknown>) => string[];
}

const who = (def = 'self'): ParamSpec => ({ type: 'expr', default: def, desc: `Người chịu tác động (mặc định ${def})` });
const count = (def = '1'): ParamSpec => ({ type: 'expr', default: def, desc: `Số lượng (mặc định ${def})` });

export const ACTION_SPECS: Record<string, ActionSpec> = {
  draw: { desc: 'Bốc bài.', params: { who: who(), count: count() } },
  discard: { desc: 'Bắt một người tự chọn bỏ bài trên tay.', params: { who: who(), count: count() } },
  discardRandom: { desc: 'Bỏ ngẫu nhiên bài trên tay của một người.', params: { from: { type: 'expr', required: true, desc: 'Người bị bỏ bài' }, count: count() } },
  takeRandom: { desc: 'Lấy ngẫu nhiên bài trên tay của một người.', params: { from: { type: 'expr', required: true, desc: 'Người bị lấy' }, to: who(), count: count() } },
  takeCard: { desc: 'Chọn 1 lá của một người (trang bị chọn đích danh, bài tay ngẫu nhiên) để lấy về.', params: { from: { type: 'expr', required: true, desc: 'Người bị lấy' }, to: who() } },
  discardCard: { desc: 'Chọn 1 lá của một người (trang bị/phán định/bài tay) để bỏ.', params: { from: { type: 'expr', required: true, desc: 'Người bị bỏ' }, by: who() } },
  give: { desc: 'Một người chọn bài trên tay để đưa cho người khác.', params: { from: who(), to: { type: 'expr', required: true, desc: 'Người nhận' }, count: count() } },
  recover: { desc: 'Hồi máu.', params: { who: who(), count: count() } },
  loseHp: { desc: 'Mất máu (không phải sát thương).', params: { who: who(), count: count() } },
  damage: {
    desc: 'Gây sát thương.',
    params: {
      who: { type: 'expr', required: true, desc: 'Người chịu sát thương' }, count: count(),
      source: { type: 'expr', default: 'self', desc: 'Người gây sát thương (null = không nguồn)' },
      nature: { type: 'text', default: 'normal', desc: 'Thuộc tính', values: ['normal', 'fire', 'thunder'] },
    },
  },
  chain: { desc: 'Xích hoặc gỡ xích một người.', params: { who: who(), value: { type: 'expr', default: 'not who.chained', desc: 'true = xích, false = gỡ (mặc định: đảo trạng thái)' } } },
  judge: {
    desc: 'Phán định. Trong "success", "then", "else" dùng được biến judge (judge.color, judge.suit, judge.rank, judge.name).',
    params: {
      who: who(), success: { type: 'expr', required: true, desc: "Điều kiện thành công, ví dụ \"judge.color == 'red'\"" },
      then: { type: 'actions', desc: 'Hành động khi thành công' }, else: { type: 'actions', desc: 'Hành động khi thất bại' },
    },
    adds: () => ['judge'],
  },
  choose: {
    desc: 'Một người chọn 1 trong các phương án. Mỗi phương án: { "label": "...", "if": "...", "actions": [...] }.',
    params: { who: who(), prompt: { type: 'text', default: 'Chọn một phương án', desc: 'Câu hỏi' }, options: { type: 'options', required: true, desc: 'Các phương án' } },
  },
  chooseTarget: {
    desc: 'Một người chọn mục tiêu. Trong "filter" dùng biến t (người đang xét). Khối "then" chạy cho mỗi người được chọn, với biến tên theo "as".',
    params: {
      who: who(), prompt: { type: 'text', default: 'Chọn mục tiêu', desc: 'Câu hỏi' },
      filter: { type: 'expr', default: 't != self', desc: 'Điều kiện mục tiêu hợp lệ, biến t' },
      min: { type: 'expr', default: '1', desc: 'Tối thiểu (0 = có thể không chọn)' }, max: { type: 'expr', default: '1', desc: 'Tối đa' },
      as: { type: 'text', default: 'chosen', desc: 'Tên biến cho người được chọn' },
      then: { type: 'actions', required: true, desc: 'Hành động với từng người được chọn' },
    },
    adds: (raw) => [String(raw.as ?? 'chosen')],
  },
  if: {
    desc: 'Rẽ nhánh theo điều kiện.',
    params: { cond: { type: 'expr', required: true, desc: 'Điều kiện' }, then: { type: 'actions', desc: 'Khi đúng' }, else: { type: 'actions', desc: 'Khi sai' } },
  },
  setFlag: { desc: 'Đặt cờ (đọc lại bằng self.flags.ten). Cờ tự xóa đầu lượt của người đó.', params: { who: who(), name: { type: 'text', required: true, desc: 'Tên cờ' }, value: { type: 'expr', default: '1', desc: 'Giá trị' } } },
  addFlag: { desc: 'Cộng thêm vào cờ.', params: { who: who(), name: { type: 'text', required: true, desc: 'Tên cờ' }, value: { type: 'expr', default: '1', desc: 'Giá trị cộng thêm' } } },
  say: { desc: 'Ghi một dòng vào nhật ký. Có thể chèn biểu thức trong ngoặc nhọn: "{self.name} bốc {amount} lá".', params: { text: { type: 'text', required: true, desc: 'Nội dung' } } },
  stop: { desc: 'Dừng, không chạy các hành động phía sau.', params: {} },
  // ----- Cơ chế mở rộng (giai đoạn 7) -----
  turnOver: { desc: 'Lật úp tướng của một người: họ bỏ qua lượt kế tiếp rồi lật lại (Chiếm Thủ, Lưu Đày). Gọi lần nữa khi đang úp thì lật lại ngay.', params: { who: who() } },
  extraTurn: { desc: 'Cho một người thêm một lượt ngay sau lượt hiện tại (Ủy Quyền).', params: { who: who() } },
  useAs: {
    desc: 'Coi như dùng một lá bài mà không cần lá thật (Thần Tốc: coi như dùng Sát). Sát ảo không bị giới hạn khoảng cách và không tính vào số lần Sát.',
    params: {
      card: { type: 'text', required: true, desc: "Loại bài: 'sha', 'juedou', 'wuzhong', 'nanman'..." },
      target: { type: 'expr', desc: 'Mục tiêu (bắt buộc với Sát và cẩm nang chọn mục tiêu)' },
      by: who(),
    },
  },
  banCards: {
    desc: 'Lượt này một người không thể dùng hoặc đánh bài trên tay theo màu (Tiềm Tập). Tự hết hiệu lực cuối lượt.',
    params: { who: who(), color: { type: 'text', default: 'all', desc: 'Màu bị cấm', values: ['red', 'black', 'all'] } },
  },
  turnBonus: {
    desc: 'Trong lượt này: cộng giới hạn bài trên tay và số lần được dùng Sát của một người (số âm để trừ).',
    params: { who: who(), handLimit: { type: 'expr', default: '0', desc: 'Cộng giới hạn bài trên tay' }, slash: { type: 'expr', default: '0', desc: 'Cộng số lần Sát' } },
  },
  grantSkill: {
    desc: 'Trao một kỹ năng cho người khác (Tồn Tự). turnOnly = true: chỉ trong lượt này.',
    params: { who: who(), skill: { type: 'text', required: true, desc: 'id kỹ năng' }, turnOnly: { type: 'expr', default: 'false', desc: 'Chỉ trong lượt này' } },
  },
  removeGeneral: {
    desc: 'Loại bỏ một tướng của một người khỏi ván (mất kỹ năng của tướng đó, máu giữ nguyên).',
    params: { who: who(), which: { type: 'text', default: 'deputy', desc: 'Tướng nào', values: ['main', 'deputy', 'ask'] } },
  },
  transformDeputy: {
    desc: 'Đổi phó tướng (变更副将): lật phó tướng, bỏ nó ra khỏi ván, nhận ngẫu nhiên một tướng cùng thế lực làm phó tướng mới (úp). '
      + 'ask = true: hỏi người đó có muốn đổi không. Trong "done" chạy tiếp khi đã đổi.',
    params: { who: who(), ask: { type: 'expr', default: 'true', desc: 'Hỏi trước khi đổi' }, done: { type: 'actions', desc: 'Khi đã đổi xong' } },
  },
  hideGeneral: {
    desc: 'Úp lại một tướng đã lật của một người (Khuynh Thành). "ask": người dùng kỹ năng chọn.',
    params: { who: who(), which: { type: 'text', default: 'ask', desc: 'Tướng nào', values: ['main', 'deputy', 'ask'] }, by: who() },
  },
  pindian: {
    desc: 'Đấu điểm: mỗi bên chọn 1 lá trên tay, so điểm. Trong "win"/"lose" dùng được biến pindian (pindian.mine, pindian.theirs là lá bài).',
    params: {
      who: who(), with: { type: 'expr', required: true, desc: 'Người đấu điểm cùng' },
      win: { type: 'actions', desc: 'Khi thắng (điểm lớn hơn hẳn)' }, lose: { type: 'actions', desc: 'Khi hòa hoặc thua' },
    },
    adds: () => ['pindian'],
  },
  order: {
    desc: 'Quân lệnh: người ra lệnh rút 2 quân lệnh ngẫu nhiên, chọn 1, người nhận chọn thực hiện hay không.',
    params: {
      to: { type: 'expr', required: true, desc: 'Người nhận quân lệnh' }, by: who(),
      done: { type: 'actions', desc: 'Khi người nhận thực hiện' }, refused: { type: 'actions', desc: 'Khi người nhận không thực hiện' },
    },
  },
  // ----- Sửa sự kiện -----
  modifyDamage: { desc: 'Cộng thêm (hoặc trừ, nếu âm) vào sát thương.', mod: true, params: { add: { type: 'expr', required: true, desc: 'Lượng cộng thêm' } } },
  setDamage: { desc: 'Đặt sát thương bằng một giá trị.', mod: true, params: { value: { type: 'expr', required: true, desc: 'Giá trị mới' } } },
  cancel: { desc: 'Chặn sự kiện (sát thương không gây ra / Sát không có hiệu lực).', mod: true, params: {} },
  noDodge: { desc: 'Mục tiêu của Sát không thể đánh Thiểm.', mod: true, params: {} },
  needShan: { desc: 'Mục tiêu của Sát phải đánh nhiều Thiểm.', mod: true, params: { count: count('2') } },
  skipPhase: { desc: 'Bỏ qua giai đoạn sắp diễn ra.', mod: true, params: {} },
  drawCount: { desc: 'Đổi số lá bốc trong giai đoạn bốc bài.', mod: true, params: { add: { type: 'expr', required: true, desc: 'Lượng cộng thêm (âm để bốc ít đi)' } } },
  needSha: { desc: 'Quyết Đấu: người này mỗi lần phải đánh nhiều Sát.', mod: true, params: { who: { type: 'expr', required: true, desc: 'Người phải đánh' }, count: count('2') } },
};

function compileOneExpr(src: unknown, cc: CompileCtx, where: string, extra: string[] = []): Compiled | undefined {
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

/** Biên dịch danh sách hành động. Lỗi được thêm vào cc.errors (không ném). */
export function compileActions(raw: unknown, cc: CompileCtx, where: string): CompiledAction[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    cc.errors.push(`${cc.path} > ${where}: phải là danh sách hành động [ ... ]`);
    return [];
  }
  return raw.map((a, i) => compileAction(a, cc, `${where}[${i}]`)).filter((x): x is CompiledAction => !!x);
}

function compileAction(raw: unknown, cc: CompileCtx, where: string): CompiledAction | null {
  if (!raw || typeof raw !== 'object') { cc.errors.push(`${cc.path} > ${where}: hành động phải là object { "do": ... }`); return null; }
  const a = raw as Record<string, unknown>;
  const name = String(a.do ?? '');
  const spec = ACTION_SPECS[name];
  if (!spec) {
    cc.errors.push(`${cc.path} > ${where}: không có hành động "${name}". Các hành động: ${Object.keys(ACTION_SPECS).join(', ')}`);
    return null;
  }
  if (spec.mod && !cc.mods.includes(name)) {
    cc.errors.push(`${cc.path} > ${where}: "${name}" chỉ dùng được ở sự kiện cho phép (${cc.mods.length ? `sự kiện này cho phép: ${cc.mods.join(', ')}` : 'sự kiện này không cho phép sửa'})`);
  }
  for (const key of Object.keys(a)) {
    if (key !== 'do' && key !== 'if' && !key.startsWith('_') && !spec.params[key]) {
      cc.errors.push(`${cc.path} > ${where}: "${name}" không có tham số "${key}". Tham số: ${Object.keys(spec.params).join(', ') || '(không có)'}`);
    }
  }
  const out: CompiledAction = { do: name, exprs: {}, texts: {}, blocks: {}, options: [] };
  if (a.if !== undefined) out.cond = compileOneExpr(a.if, cc, `${where}.if`);
  const added = spec.adds?.(a) ?? [];
  for (const [key, ps] of Object.entries(spec.params)) {
    const v = a[key] ?? ps.default;
    if (v === undefined) {
      if (ps.required) cc.errors.push(`${cc.path} > ${where}: "${name}" thiếu tham số bắt buộc "${key}"`);
      continue;
    }
    const at = `${where}.${key}`;
    switch (ps.type) {
      case 'expr': {
        const extra = key === 'filter' ? ['t'] : key === 'success' ? added : key === 'value' && name === 'chain' ? ['who'] : [];
        // chain.value mặc định dùng "who": thay bằng biểu thức của who
        const src = key === 'value' && name === 'chain' && a.value === undefined ? `not (${String(a.who ?? 'self')}).chained` : v;
        const c = compileOneExpr(src, cc, at, extra.filter((x) => x !== 'who'));
        if (c) out.exprs[key] = c;
        break;
      }
      case 'text':
        if (ps.values && !ps.values.includes(String(v))) cc.errors.push(`${cc.path} > ${at}: giá trị "${v}" không hợp lệ. Chọn: ${ps.values.join(', ')}`);
        out.texts[key] = String(v);
        break;
      case 'actions': {
        const child: CompileCtx = { ...cc, vars: new Set([...cc.vars, ...added]) };
        out.blocks[key] = compileActions(v, child, at);
        break;
      }
      case 'options':
        if (!Array.isArray(v) || v.length === 0) { cc.errors.push(`${cc.path} > ${at}: cần danh sách phương án`); break; }
        v.forEach((o: Record<string, unknown>, i: number) => {
          if (!o || typeof o.label !== 'string') { cc.errors.push(`${cc.path} > ${at}[${i}]: phương án cần "label"`); return; }
          out.options.push({
            label: o.label,
            cond: o.if !== undefined ? compileOneExpr(o.if, cc, `${at}[${i}].if`) : undefined,
            actions: compileActions(o.actions ?? [], cc, `${at}[${i}].actions`),
          });
        });
        break;
    }
  }
  return out;
}

// ------------------------------------------------------------
// Chạy
// ------------------------------------------------------------

export interface Runtime {
  g: HegemonyGame;
  vars: Record<string, Value>;
  /** Dữ liệu sự kiện của engine (để các hành động sửa sự kiện thay đổi). */
  ctx: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  label: string;
}

const STOP = Symbol('stop');

function env(rt: Runtime): Env {
  return makeEnv(rt.g, rt.vars);
}

/** Tính một tham số thành ghế người chơi còn sống, hoặc null. */
function seatOf(rt: Runtime, c: Compiled | undefined): number | null {
  if (!c) return null;
  const v = c.fn(env(rt));
  return typeof v === 'number' && rt.g.isAliveSeat(v) ? v : null;
}
const n = (rt: Runtime, c: Compiled | undefined, def = 0) => (c ? Math.max(0, Math.floor(evalNum(c, env(rt)))) : def);

function interpolate(rt: Runtime, text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_, src) => {
    try {
      const v = compileExpr(src).fn(env(rt));
      return v === null ? '' : String(v);
    } catch {
      return `{${src}}`;
    }
  });
}

export async function runActions(actions: CompiledAction[], rt: Runtime): Promise<boolean> {
  for (const a of actions) {
    if (a.cond && !evalBool(a.cond, env(rt))) continue;
    if ((await runAction(a, rt)) === STOP) return false;
  }
  return true;
}

async function runAction(a: CompiledAction, rt: Runtime): Promise<typeof STOP | void> {
  const { g } = rt;
  const e = a.exprs;
  switch (a.do) {
    case 'draw': { const s = seatOf(rt, e.who); if (s !== null) await g.draw(s, n(rt, e.count)); return; }
    case 'discard': { const s = seatOf(rt, e.who); if (s !== null) await g.forceDiscard(s, n(rt, e.count), rt.label); return; }
    case 'discardRandom':
    case 'takeRandom': {
      const from = seatOf(rt, e.from);
      const to = a.do === 'takeRandom' ? seatOf(rt, e.to) : null;
      if (from === null || (a.do === 'takeRandom' && to === null)) return;
      for (let i = 0; i < n(rt, e.count); i++) {
        const hand = g.player(from).hand;
        if (hand.length === 0) break;
        const id = hand[g.randomInt(hand.length)];
        await g.moveCards([id], { kind: 'hand', seat: from }, to === null ? { kind: 'discard' } : { kind: 'hand', seat: to }, rt.label);
      }
      return;
    }
    case 'takeCard':
    case 'discardCard': {
      const from = seatOf(rt, e.from);
      const by = seatOf(rt, a.do === 'takeCard' ? e.to : e.by);
      if (from === null || by === null) return;
      const pick = await pickCardFrom(g, by, from, a.do === 'discardCard', `${rt.label}: chọn lá của ${g.player(from).name}`);
      if (!pick) return;
      await g.moveCards([pick.id], pick.from, a.do === 'takeCard' ? { kind: 'hand', seat: by } : { kind: 'discard' }, rt.label);
      if (a.do === 'discardCard') g.say(`${g.player(from).name} mất ${cardLabel(g.card(pick.id))}.`);
      return;
    }
    case 'give': {
      const from = seatOf(rt, e.from), to = seatOf(rt, e.to);
      if (from === null || to === null || from === to) return;
      const hand = [...g.player(from).hand];
      const k = Math.min(n(rt, e.count), hand.length);
      if (k === 0) return;
      const ids = await g.chooseCards(from, `${rt.label}: chọn ${k} lá đưa cho ${g.player(to).name}`, hand, k, k);
      await g.moveCards(ids, { kind: 'hand', seat: from }, { kind: 'hand', seat: to }, rt.label);
      g.say(`${g.player(from).name} đưa ${k} lá cho ${g.player(to).name}.`);
      return;
    }
    case 'recover': { const s = seatOf(rt, e.who); if (s !== null) await g.recover(s, n(rt, e.count), null); return; }
    case 'loseHp': { const s = seatOf(rt, e.who); if (s !== null) await g.loseHp(s, n(rt, e.count)); return; }
    case 'damage': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const src = e.source ? e.source.fn(env(rt)) : null;
      const source = typeof src === 'number' && g.isAliveSeat(src) ? src : null;
      await g.damage({ source, target: s, amount: n(rt, e.count, 1), card: null, nature: a.texts.nature as Nature, cancelled: false });
      return;
    }
    case 'chain': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const v = e.value ? evalBool(e.value, env(rt)) : !g.player(s).chained;
      g.player(s).chained = v;
      g.say(v ? `${g.player(s).name} bị xích.` : `${g.player(s).name} được gỡ xích.`);
      return;
    }
    case 'judge': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const card = await g.judge(s, rt.label);
      try {
        const child: Runtime = { ...rt, vars: { ...rt.vars, judge: cardVars(card) } };
        const ok = evalBool(e.success, env(child));
        g.say(ok ? `${rt.label}: phán định thành công.` : `${rt.label}: phán định thất bại.`);
        if (!(await runActions(a.blocks[ok ? 'then' : 'else'] ?? [], child))) return STOP;
      } finally {
        await g.finishJudge(card);
      }
      return;
    }
    case 'choose': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const valid = a.options.filter((o) => !o.cond || evalBool(o.cond, env(rt)));
      if (valid.length === 0) return;
      const i = valid.length === 1 ? 0 : await g.choose(s, interpolate(rt, a.texts.prompt), valid.map((o) => interpolate(rt, o.label)));
      if (!(await runActions(valid[i].actions, rt))) return STOP;
      return;
    }
    case 'chooseTarget': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const cands = g.alivePlayers().map((p) => p.seat).filter((t) => {
        const ev = makeEnv(g, { ...rt.vars, t });
        return evalBool(e.filter, ev) && (t === s || g.canTarget(s, t));
      });
      const min = Math.min(n(rt, e.min), cands.length);
      const max = Math.min(n(rt, e.max, 1), cands.length);
      const picked = await g.chooseTargets(s, interpolate(rt, a.texts.prompt), cands, min, max);
      for (const t of picked) {
        if (!g.player(t).alive) continue;
        const child: Runtime = { ...rt, vars: { ...rt.vars, [a.texts.as]: t } };
        if (!(await runActions(a.blocks.then ?? [], child))) return STOP;
      }
      return;
    }
    case 'if': {
      const ok = evalBool(e.cond, env(rt));
      if (!(await runActions(a.blocks[ok ? 'then' : 'else'] ?? [], rt))) return STOP;
      return;
    }
    case 'setFlag':
    case 'addFlag': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const key = `u_${a.texts.name}`;
      const v = evalNum(e.value, env(rt));
      const p = g.player(s);
      p.flags[key] = a.do === 'setFlag' ? v : (p.flags[key] ?? 0) + v;
      return;
    }
    case 'say': g.say(interpolate(rt, a.texts.text)); return;
    case 'turnOver': { const s = seatOf(rt, e.who); if (s !== null) g.turnOver(s); return; }
    case 'extraTurn': { const s = seatOf(rt, e.who); if (s !== null) { g.grantExtraTurn(s); g.say(`${g.player(s).name} sẽ được thêm một lượt.`); } return; }
    case 'useAs': {
      const by = seatOf(rt, e.by);
      const name = a.texts.card as CardName;
      const info = g.cardInfo(name);
      if (by === null || !info) { if (!info) g.say(`(${rt.label}: không có loại bài "${name}")`); return; }
      const t = e.target ? seatOf(rt, e.target) : null;
      const def = g.trickDef(name);
      const needsTarget = name === 'sha' || def?.targeting === 'one';
      if (needsTarget) {
        if (t === null) return;
        const ok = name === 'sha' ? t !== by && g.canBeSlashTarget(by, t) && g.canTarget(by, t) : g.targetsAs(by, name).includes(t);
        if (!ok) { g.say(`(${rt.label}: ${g.player(t).name} không phải mục tiêu hợp lệ)`); return; }
      }
      if (info.type === 'delayed' || info.type === 'equip') return;
      await g.useCardAs(by, name, needsTarget ? [t!] : name === 'tao' && t !== null ? [t] : [], [], { label: rt.label });
      return;
    }
    case 'banCards': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const c = a.texts.color;
      g.player(s).flags[c === 'red' ? 'turn_banRed' : c === 'black' ? 'turn_banBlack' : 'turn_banHand'] = 1;
      g.say(`${g.player(s).name} lượt này không thể dùng hoặc đánh ${c === 'all' ? 'bài trên tay' : `bài màu ${c === 'red' ? 'đỏ' : 'đen'}`}.`);
      return;
    }
    case 'turnBonus': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      const f = g.player(s).flags;
      const h = Math.floor(evalNum(e.handLimit, env(rt))), k = Math.floor(evalNum(e.slash, env(rt)));
      if (h) f.turn_handLimitDelta = (f.turn_handLimitDelta ?? 0) + h;
      if (k) f.turn_extraSlash = (f.turn_extraSlash ?? 0) + k;
      return;
    }
    case 'grantSkill': {
      const s = seatOf(rt, e.who);
      if (s === null) return;
      try { g.grantSkill(s, a.texts.skill, evalBool(e.turnOnly, env(rt))); } catch { g.say(`(${rt.label}: không có kỹ năng "${a.texts.skill}")`); }
      return;
    }
    case 'transformDeputy': {
      const s = seatOf(rt, e.who);
      if (s === null || !g.heroes[s]) return;
      const done = evalBool(e.ask, env(rt)) ? await g.askTransform(s, rt.label) : await g.transformDeputy(s);
      if (done && !(await runActions(a.blocks.done ?? [], rt))) return STOP;
      return;
    }
    case 'removeGeneral':
    case 'hideGeneral': {
      const s = seatOf(rt, e.who);
      if (s === null || !g.heroes[s]) return;
      const h = g.hero(s);
      const ok = (w: 'main' | 'deputy') => !h[w].removed && (a.do === 'removeGeneral' || h[w].revealed);
      let which = a.texts.which as 'main' | 'deputy' | 'ask';
      if (which === 'ask') {
        const opts = (['main', 'deputy'] as const).filter(ok);
        if (!opts.length) return;
        const chooser = a.do === 'hideGeneral' ? seatOf(rt, e.by) ?? s : s;
        const i = opts.length === 1 ? 0 : await g.choose(chooser, `${rt.label}: chọn tướng của ${g.player(s).name}`, opts.map((w) => g.generalName(h[w].generalId)));
        which = opts[i];
      }
      if (!ok(which)) return;
      if (a.do === 'removeGeneral') await g.removeGeneral(s, which); else g.hideGeneral(s, which);
      return;
    }
    case 'pindian': {
      const me = seatOf(rt, e.who), other = seatOf(rt, e.with);
      if (me === null || other === null) return;
      const r = await g.pindian(me, other, rt.label);
      if (!r) return;
      const child: Runtime = { ...rt, vars: { ...rt.vars, pindian: { win: r.win, mine: cardVars(r.mine), theirs: cardVars(r.theirs) } } };
      if (!(await runActions(a.blocks[r.win ? 'win' : 'lose'] ?? [], child))) return STOP;
      return;
    }
    case 'order': {
      const by = seatOf(rt, e.by), to = seatOf(rt, e.to);
      if (by === null || to === null) return;
      const ord = await g.drawOrder(by);
      const done = await g.askOrder(by, to, ord);
      if (!(await runActions(a.blocks[done ? 'done' : 'refused'] ?? [], rt))) return STOP;
      return;
    }
    case 'stop': return STOP;
    // ----- Sửa sự kiện -----
    case 'modifyDamage': rt.ctx.amount = Math.max(0, rt.ctx.amount + Math.floor(evalNum(e.add, env(rt)))); return;
    case 'setDamage': rt.ctx.amount = n(rt, e.value); return;
    case 'cancel': rt.ctx.cancelled = true; return;
    case 'noDodge': rt.ctx.noDodge = true; return;
    case 'needShan': rt.ctx.shanNeeded = Math.max(rt.ctx.shanNeeded, n(rt, e.count, 2)); return;
    case 'skipPhase': rt.ctx.skip = true; return;
    case 'drawCount': rt.ctx.count = Math.max(0, rt.ctx.count + Math.floor(evalNum(e.add, env(rt)))); return;
    case 'needSha': { const s = seatOf(rt, e.who); if (s !== null) rt.ctx.need[s] = Math.max(rt.ctx.need[s] ?? 1, n(rt, e.count, 2)); return; }
  }
}
