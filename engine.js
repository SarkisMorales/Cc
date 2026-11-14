// Motor de cálculo puro (sin DOM). Cada calculadora tiene su propio "state".
// mode: 'ios'  -> respeta precedencia (2 + 3 × 4 = 14), como el iPhone
//       'win'  -> ejecución inmediata (2 + 3 × 4 = 20), como Windows Estándar

export const OPS = ['+', '−', '×', '÷'];

export class CalcError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function newState() {
  return {
    cur: '0',        // número visible (string)
    typing: false,   // true mientras el usuario escribe dígitos en cur
    tokens: [],      // [{v,l}, op, {v,l}, op, ...] siempre termina en op si no está vacío
    label: null,     // etiqueta de la entrada actual (ej: "√(9)") para la línea de expresión
    opPending: false,// recién se apretó un operador
    lastOp: null,    // para repetir "=" (2 + 3 = = = )
    lastArg: null,
    done: null,      // texto de la expresión ya resuelta ("2 + 3 =")
    error: null,     // 'div0' | 'invalid' | 'overflow'
    memory: null,
    history: [],
  };
}

export function clean(n) {
  if (!Number.isFinite(n)) throw new CalcError('overflow');
  const r = parseFloat(n.toPrecision(15));
  return Object.is(r, -0) ? 0 : r;
}

function apply(a, op, b) {
  switch (op) {
    case '+': return clean(a + b);
    case '−': return clean(a - b);
    case '×': return clean(a * b);
    case '÷':
      if (b === 0) throw new CalcError(a === 0 ? 'invalid' : 'div0');
      return clean(a / b);
  }
  throw new Error('op desconocido ' + op);
}

// t: [num, op, num, op, num] (números planos)
export function evalLTR(t) {
  let acc = t[0];
  for (let i = 1; i < t.length; i += 2) acc = apply(acc, t[i], t[i + 1]);
  return acc;
}

export function evalPrec(t) {
  let sum = 0, sign = '+', term = t[0];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], b = t[i + 1];
    if (op === '×' || op === '÷') term = apply(term, op, b);
    else { sum = apply(sum, sign, term); sign = op; term = b; }
  }
  return apply(sum, sign, term);
}

export function evaluate(t, mode) {
  return mode === 'ios' ? evalPrec(t) : evalLTR(t);
}

const plain = (tokens) => tokens.map((x) => (typeof x === 'string' ? x : x.v));
const entry = (s) => Number(s.cur);

function maxDigits(mode) { return mode === 'ios' ? 9 : 16; }

function reset(s) {
  const keep = { memory: s.memory, history: s.history };
  Object.assign(s, newState(), keep);
}

function setResult(s, n) {
  s.cur = String(n);
  s.typing = false;
}

export function tokensText(s, fmt) {
  return s.tokens.map((x) => (typeof x === 'string' ? x : x.l || fmt(x.v))).join(' ');
}

// Valor parcial que se muestra al apretar un operador.
function partial(s, op, mode) {
  const t = plain(s.tokens.slice(0, -1));
  if (mode !== 'ios' || op === '+' || op === '−') return evaluate(t, mode);
  // iOS con × o ÷: solo el último término multiplicativo
  let i = t.length - 2;
  while (i > 0 && (t[i] === '×' || t[i] === '÷')) i -= 2;
  return evalLTR(t.slice(i < 0 ? 0 : i + 1));
}

function digit(s, d, mode) {
  if (s.done !== null) s.done = null;
  if (!s.typing) {
    s.cur = d === '.' ? '0.' : d;
    s.typing = true;
    s.label = null;
    return;
  }
  if (d === '.') { if (!s.cur.includes('.')) s.cur += '.'; return; }
  const digits = s.cur.replace(/[-.]/g, '').length;
  if (digits >= maxDigits(mode)) return;
  if (s.cur === '0') s.cur = d;
  else if (s.cur === '-0') s.cur = '-' + d;
  else s.cur += d;
}

function operator(s, op, mode, wasPending) {
  s.done = null;
  s.lastOp = null;
  const last = s.tokens[s.tokens.length - 1];
  if (wasPending && typeof last === 'string') {
    s.tokens[s.tokens.length - 1] = op; // cambió de idea
  } else {
    s.tokens.push({ v: entry(s), l: s.label }, op);
  }
  s.label = null;
  setResult(s, partial(s, op, mode));
  s.opPending = true;
}

function equals(s, mode, fmt) {
  if (s.tokens.length) {
    const full = [...s.tokens, { v: entry(s), l: s.label }];
    const nums = plain(full);
    const result = evaluate(nums, mode);
    s.lastOp = nums[nums.length - 2];
    s.lastArg = nums[nums.length - 1];
    s.done = tokensText({ tokens: full }, fmt) + ' =';
    s.tokens = [];
    s.label = null;
    pushHistory(s, s.done, result);
    setResult(s, result);
  } else if (s.lastOp) {
    const a = entry(s);
    const result = apply(a, s.lastOp, s.lastArg);
    s.done = `${s.label || fmt(a)} ${s.lastOp} ${fmt(s.lastArg)} =`;
    s.label = null;
    pushHistory(s, s.done, result);
    setResult(s, result);
  } else {
    s.done = `${s.label || fmt(entry(s))} =`;
    s.label = null;
    s.typing = false;
  }
}

function pushHistory(s, expr, result) {
  s.history.unshift({ expr, result });
  if (s.history.length > 50) s.history.length = 50;
}

function unary(s, key, fmt) {
  const x = entry(s);
  const inner = s.label || fmt(x);
  let r, l;
  if (key === 'inv') { if (x === 0) throw new CalcError('div0'); r = clean(1 / x); l = `1/(${inner})`; }
  if (key === 'sq') { r = clean(x * x); l = `sqr(${inner})`; }
  if (key === 'sqrt') { if (x < 0) throw new CalcError('invalid'); r = clean(Math.sqrt(x)); l = `√(${inner})`; }
  if (s.done !== null) s.done = null;
  setResult(s, r);
  s.label = l;
}

function percent(s, mode) {
  const x = entry(s);
  const n = s.tokens.length;
  const op = n ? s.tokens[n - 1] : null;
  if (op === '+' || op === '−') {
    const base = mode === 'ios' ? partial(s, '+', mode) : evaluate(plain(s.tokens.slice(0, -1)), mode);
    setResult(s, clean((base * x) / 100));
  } else {
    setResult(s, clean(x / 100));
  }
  s.label = null;
  if (s.done !== null) s.done = null;
}

function negate(s) {
  if (s.typing) {
    s.cur = s.cur.startsWith('-') ? s.cur.slice(1) : '-' + s.cur;
    return;
  }
  if (s.opPending) { s.cur = '-0'; s.typing = true; s.label = null; return; }
  setResult(s, clean(-entry(s)));
  if (s.label) s.label = `negate(${s.label})`;
}

function backspace(s) {
  if (s.typing) {
    s.cur = s.cur.slice(0, -1);
    if (s.cur === '' || s.cur === '-') s.cur = '0';
  } else if (s.done !== null) {
    s.done = null;
  }
}

function memory(s, key) {
  const x = entry(s);
  if (key === 'mc') s.memory = null;
  if (key === 'mr') { if (s.memory !== null) { setResult(s, s.memory); s.label = null; } return; }
  if (key === 'ms') s.memory = x;
  if (key === 'm+') s.memory = clean((s.memory ?? 0) + x);
  if (key === 'm-') s.memory = clean((s.memory ?? 0) - x);
  s.typing = false;
}

const RESETTING = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'ac', 'ce', 'back']);

// Aplica una tecla al estado. opts = { mode, fmt }
export function press(s, key, { mode = 'ios', fmt = String } = {}) {
  if (s.error) {
    if (!RESETTING.has(key)) return s;
    reset(s);
    if (key === 'ac' || key === 'ce' || key === 'back') return s;
  }
  const wasPending = s.opPending;
  s.opPending = false;
  try {
    if (/^[0-9.]$/.test(key)) digit(s, key, mode);
    else if (OPS.includes(key)) operator(s, key, mode, wasPending);
    else switch (key) {
      case '=': equals(s, mode, fmt); break;
      case '%': percent(s, mode); break;
      case 'neg': s.opPending = wasPending; negate(s); if (s.typing) s.opPending = false; break;
      case 'back': backspace(s); s.opPending = wasPending && !s.typing; break;
      case 'ac': reset(s); break;
      case 'ce':
        if (s.done !== null) reset(s);
        else { s.cur = '0'; s.typing = false; s.label = null; }
        break;
      case 'inv': case 'sq': case 'sqrt': unary(s, key, fmt); break;
      case 'mc': case 'mr': case 'ms': case 'm+': case 'm-':
        memory(s, key); s.opPending = wasPending && key !== 'mr'; break;
      default: s.opPending = wasPending;
    }
  } catch (e) {
    if (!(e instanceof CalcError)) throw e;
    const keep = { memory: s.memory, history: s.history };
    Object.assign(s, newState(), keep, { error: e.code });
  }
  return s;
}

// Aplica una cadena de teclas (útil para tests)
export function run(keys, opts) {
  const s = newState();
  for (const k of keys) press(s, k, opts);
  return s;
}
