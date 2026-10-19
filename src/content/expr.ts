// ============================================================
// Ngôn ngữ biểu thức cho kỹ năng JSON.
// Ví dụ: "target == self and self.hp <= 2", "amount * 2", "min(3, self.lostHp + 1)", "self.lostHp > 0 ? 2 : 0",
//        "card.color == 'red'", "self.flags.daDung < 1".
// Tự viết bộ phân tích cú pháp, KHÔNG dùng eval -> an toàn khi nhận nội dung từ trang quản trị.
// ============================================================

export type Value = number | string | boolean | null | Value[] | { [k: string]: Value };

/** Môi trường khi tính biểu thức: biến + cách đọc thuộc tính người chơi + hàm có sẵn. */
export interface Env {
  vars: Record<string, Value>;
  /** Đọc thuộc tính của người chơi ở ghế `seat` (ví dụ 'hp'). */
  player(seat: number, prop: string): Value;
  /** Hàm có sẵn: min, max, distance... */
  call(fn: string, args: Value[]): Value;
}

export class ExprError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(message);
  }
}

// ---------- Tách từ ----------

type Tok =
  | { k: 'num'; v: number; p: number }
  | { k: 'str'; v: string; p: number }
  | { k: 'id'; v: string; p: number }
  | { k: 'op'; v: string; p: number }
  | { k: 'end'; p: number };

const OPS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '(', ')', '.', ',', '!', '?', ':'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ k: 'num', v: Number(src.slice(i, j)), p: i });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = src.indexOf(c, i + 1);
      if (j < 0) throw new ExprError('Thiếu dấu đóng chuỗi', i);
      out.push({ k: 'str', v: src.slice(i + 1, j), p: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ k: 'id', v: src.slice(i, j), p: i });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Ký tự không hợp lệ '${c}'`, i);
    out.push({ k: 'op', v: op, p: i });
    i += op.length;
  }
  out.push({ k: 'end', p: src.length });
  return out;
}

// ---------- Phân tích cú pháp -> hàm tính ----------

type Fn = (env: Env) => Value;

export interface Compiled {
  fn: Fn;
  /** Các biến gốc được dùng (để kiểm tra lúc nạp). */
  vars: Set<string>;
  source: string;
}

const KEYWORDS: Record<string, Value> = { true: true, false: false, null: null, inf: Infinity };
export const FUNCTIONS = ['min', 'max', 'abs', 'floor', 'distance', 'inRange', 'sameFaction', 'differentFaction', 'random', 'besieged', 'besieging', 'bigFaction', 'smallFaction'];

const num = (v: Value): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0);
const truthy = (v: Value): boolean => v !== null && v !== false && v !== 0 && v !== '';

export function compileExpr(source: string): Compiled {
  const toks = tokenize(String(source));
  let i = 0;
  const vars = new Set<string>();
  const peek = () => toks[i];
  const isOp = (v: string) => { const t = toks[i]; return t.k === 'op' && t.v === v; };
  const isWord = (v: string) => { const t = toks[i]; return t.k === 'id' && t.v === v; };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Thiếu '${v}'`, peek().p);
    i++;
  };

  /** a ? b : c  (độ ưu tiên thấp nhất) */
  function ternary(): Fn {
    const cond = orExpr();
    if (!isOp('?')) return cond;
    i++;
    const a = ternary();
    expect(':');
    const b = ternary();
    return (e) => (truthy(cond(e)) ? a(e) : b(e));
  }
  function orExpr(): Fn {
    let left = andExpr();
    while (isOp('||') || isWord('or')) {
      i++;
      const l = left, r = andExpr();
      left = (e) => truthy(l(e)) || truthy(r(e));
    }
    return left;
  }
  function andExpr(): Fn {
    let left = notExpr();
    while (isOp('&&') || isWord('and')) {
      i++;
      const l = left, r = notExpr();
      left = (e) => truthy(l(e)) && truthy(r(e));
    }
    return left;
  }
  function notExpr(): Fn {
    if (isOp('!') || isWord('not')) {
      i++;
      const x = notExpr();
      return (e) => !truthy(x(e));
    }
    return cmpExpr();
  }
  function cmpExpr(): Fn {
    const left = addExpr();
    const t = peek();
    if (t.k === 'op' && ['==', '!=', '>=', '<=', '>', '<'].includes(t.v)) {
      i++;
      const right = addExpr();
      switch (t.v) {
        case '==': return (e) => left(e) === right(e);
        case '!=': return (e) => left(e) !== right(e);
        case '>=': return (e) => num(left(e)) >= num(right(e));
        case '<=': return (e) => num(left(e)) <= num(right(e));
        case '>': return (e) => num(left(e)) > num(right(e));
        default: return (e) => num(left(e)) < num(right(e));
      }
    }
    return left;
  }
  function addExpr(): Fn {
    let left = mulExpr();
    while (isOp('+') || isOp('-')) {
      const op = peek() as { v: string };
      i++;
      const l = left, r = mulExpr();
      left = op.v === '+' ? (e) => num(l(e)) + num(r(e)) : (e) => num(l(e)) - num(r(e));
    }
    return left;
  }
  function mulExpr(): Fn {
    let left = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (peek() as { v: string }).v;
      i++;
      const l = left, r = unary();
      left = op === '*' ? (e) => num(l(e)) * num(r(e))
        : op === '/' ? (e) => { const d = num(r(e)); return d === 0 ? 0 : Math.floor(num(l(e)) / d); }
        : (e) => { const d = num(r(e)); return d === 0 ? 0 : num(l(e)) % d; };
    }
    return left;
  }
  function unary(): Fn {
    if (isOp('-')) {
      i++;
      const x = unary();
      return (e) => -num(x(e));
    }
    return postfix();
  }
  function postfix(): Fn {
    let base = primary();
    while (isOp('.')) {
      i++;
      const t = peek();
      if (t.k !== 'id') throw new ExprError('Thiếu tên thuộc tính sau dấu chấm', t.p);
      i++;
      const prop = t.v;
      const obj = base;
      base = (e) => member(e, obj(e), prop);
    }
    return base;
  }
  function primary(): Fn {
    const t = peek();
    if (t.k === 'num') { i++; return () => t.v; }
    if (t.k === 'str') { i++; return () => t.v; }
    if (t.k === 'op' && t.v === '(') {
      i++;
      const x = ternary();
      expect(')');
      return x;
    }
    if (t.k === 'id') {
      i++;
      if (Object.hasOwn(KEYWORDS, t.v)) { const v = KEYWORDS[t.v]; return () => v; }
      if (isOp('(')) {
        if (!FUNCTIONS.includes(t.v)) throw new ExprError(`Hàm không tồn tại: ${t.v}. Các hàm có: ${FUNCTIONS.join(', ')}`, t.p);
        i++;
        const args: Fn[] = [];
        if (!isOp(')')) {
          args.push(ternary());
          while (isOp(',')) { i++; args.push(ternary()); }
        }
        expect(')');
        return (e) => e.call(t.v, args.map((a) => a(e)));
      }
      vars.add(t.v);
      return (e) => (Object.hasOwn(e.vars, t.v) ? e.vars[t.v] : null);
    }
    throw new ExprError('Biểu thức không hợp lệ', t.p);
  }

  const fn = ternary();
  if (peek().k !== 'end') throw new ExprError('Thừa ký tự ở cuối biểu thức', peek().p);
  return { fn, vars, source: String(source) };
}

/** Đọc thuộc tính: ghế người chơi (số) -> thuộc tính người chơi; object -> trường; mảng -> length. */
function member(env: Env, obj: Value, prop: string): Value {
  if (typeof obj === 'number') return env.player(obj, prop);
  if (Array.isArray(obj)) return prop === 'count' || prop === 'length' ? obj.length : null;
  if (obj && typeof obj === 'object') return Object.hasOwn(obj, prop) ? obj[prop] : null;
  return null;
}

export function evalNum(c: Compiled, env: Env): number {
  return num(c.fn(env));
}

export function evalBool(c: Compiled, env: Env): boolean {
  return truthy(c.fn(env));
}

/** Gói lỗi biểu thức thành thông báo dễ đọc, có mũi tên chỉ vị trí lỗi. */
export function describeExprError(source: string, err: unknown): string {
  if (err instanceof ExprError) {
    return `${err.message}\n      ${source}\n      ${' '.repeat(err.pos)}^`;
  }
  return String(err);
}
