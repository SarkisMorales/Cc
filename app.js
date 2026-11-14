import { newState, press, tokensText } from './engine.js';

const STORE_KEY = 'multicalc:v1';
const MAX_CALCS = 12;
const $ = (sel, root = document) => root.querySelector(sel);
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

/* ================= Formato de números (según idioma del teléfono) ================= */
const parts = new Intl.NumberFormat(navigator.language || 'es-AR').formatToParts(12345.6);
const DEC = parts.find((p) => p.type === 'decimal')?.value || ',';
const GRP = parts.find((p) => p.type === 'group')?.value || '.';

const group = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, GRP);
const maxDigits = () => (store.style === 'ios' ? 9 : 16);

function fmt(n, digits = maxDigits()) {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10 ** digits || abs < 10 ** -(digits - 1)) {
    let [m, e] = abs.toExponential(digits - 4).split('e');
    m = m.replace(/\.?0+$/, '').replace('.', DEC);
    e = e.replace('+', '');
    return `${sign}${m}e${store.style === 'ios' || e.startsWith('-') ? e : '+' + e}`;
  }
  const intDigits = Math.max(1, Math.floor(Math.log10(abs)) + 1);
  const decimals = Math.max(0, Math.min(digits - intDigits, 15));
  let s = abs.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  const [i, d] = s.split('.');
  return sign + group(i) + (d ? DEC + d : '');
}

function fmtEntry(cur) {
  const sign = cur.startsWith('-') ? '-' : '';
  const body = sign ? cur.slice(1) : cur;
  const [i, d] = body.split('.');
  return sign + group(i) + (body.includes('.') ? DEC + d : '');
}

const ERR_TEXT = { div0: 'No se puede dividir entre cero', invalid: 'Entrada no válida', overflow: 'Desbordamiento' };
function displayValue(s, short = false) {
  if (s.error) return store.style === 'ios' || short ? 'Error' : ERR_TEXT[s.error];
  return s.typing ? fmtEntry(s.cur) : fmt(Number(s.cur));
}

function exprLine(s) {
  if (s.error) return '';
  if (s.done !== null && !s.tokens.length) return s.done;
  let t = tokensText(s, (n) => fmt(n));
  if (store.style === 'ios' && s.tokens.length && !s.opPending) t += ' ' + (s.typing ? fmtEntry(s.cur) : (s.label || fmt(Number(s.cur))));
  else if (s.label) t += ' ' + s.label;
  return t;
}

// Texto pegado ("1.234,5", "1,234.5", "$ 12") -> número
function parseNumber(text) {
  let t = String(text).trim().replace(/[^\d.,\-−eE+]/g, '').replace('−', '-');
  if (!t) return NaN;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    t = t.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (sep) {
      const chunks = t.split(sep);
      const looksGrouped = chunks.length > 2 || (sep === GRP && chunks[1].length === 3);
      t = looksGrouped ? chunks.join('') : chunks.join('.');
    }
  }
  return Number(t);
}

/* ================= Persistencia ================= */
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.calcs) && data.calcs.length) {
      data.calcs.forEach((c) => { c.s = Object.assign(newState(), c.s); });
      if (!data.calcs.some((c) => c.id === data.active)) data.active = data.calcs[0].id;
      if (data.style !== 'win') data.style = 'ios';
      if (!['auto', 'light', 'dark'].includes(data.winTheme)) data.winTheme = 'auto';
      if (typeof data.haptics !== 'boolean') data.haptics = true;
      return data;
    }
  } catch { /* datos corruptos o almacenamiento bloqueado */ }
  return null;
}

let store = load();
function nextName() {
  const used = new Set(store.calcs.map((c) => c.name));
  let n = 1;
  while (used.has(`Calc ${n}`)) n++;
  return `Calc ${n}`;
}
function makeCalc(name) {
  store.seq = (store.seq || 0) + 1;
  return { id: 'c' + Date.now().toString(36) + store.seq, name: name || nextName(), s: newState() };
}
if (!store) {
  store = { style: 'ios', winTheme: 'auto', haptics: true, seq: 0, calcs: [], active: null };
  const c = makeCalc();
  store.calcs.push(c);
  store.active = c.id;
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* sin espacio / modo privado */ }
}

const active = () => store.calcs.find((c) => c.id === store.active);
const calcIndex = (id) => store.calcs.findIndex((c) => c.id === id);

/* ================= Vibración ================= */
const hapticInput = $('#haptic-input');
function haptic() {
  if (!store.haptics) return;
  if (navigator.vibrate) { navigator.vibrate(6); return; }
  // iOS 18+: tocar un interruptor nativo produce un "tic" del motor háptico
  hapticInput.parentElement.click();
}

/* ================= Render ================= */
const el = {
  tabs: $('#tabs'), expr: $('#expr'), value: $('#value'), valueWrap: $('#value-wrap'),
  readout: $('#readout'), screen: $('#screen'), mem: $('#mem-ind'), iosAc: $('#ios-ac'),
  theme: document.querySelector('meta[name="theme-color"]'),
};

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="m12 9 6 6M18 9l-6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
  vib: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 8v8M21 8v8"/></svg>',
};

function isDark() {
  return store.winTheme === 'dark' || (store.winTheme === 'auto' && darkMQ.matches);
}

function applyTheme() {
  const cls = store.style === 'ios' ? 'style-ios' : 'style-win' + (isDark() ? ' dark' : '');
  if (document.body.className !== cls) document.body.className = cls;
  el.theme.content = store.style === 'ios' ? '#000000' : isDark() ? '#202020' : '#f0f0f0';
}

const BASE_FONT = { ios: 92, win: 58 };
function fitValue() {
  const v = el.value;
  // tamaño base, limitado por el alto libre de la pantalla (Safari con barras ocupa más)
  const cs = getComputedStyle(el.screen);
  const freeH = el.screen.clientHeight - parseFloat(cs.paddingBottom) - el.expr.offsetHeight - 2;
  const base = Math.max(30, Math.min(BASE_FONT[store.style], Math.floor(freeH / 1.12)));
  v.style.fontSize = base + 'px';
  const avail = el.valueWrap.clientWidth;
  const w = v.scrollWidth;
  if (w > avail && avail > 0) v.style.fontSize = Math.max(18, Math.floor(base * (avail / w) * 0.98)) + 'px';
}

function tabEl(c) {
  const b = document.createElement('button');
  b.className = 'tab enter';
  b.setAttribute('role', 'tab');
  b.dataset.id = c.id;
  b.innerHTML = '<span class="tab-name"></span><span class="tab-val"></span>';
  b.addEventListener('animationend', () => b.classList.remove('enter'), { once: true });
  return b;
}

function renderTabs(scroll) {
  const ids = new Set(store.calcs.map((c) => c.id));
  [...el.tabs.children].forEach((t) => { if (!ids.has(t.dataset.id)) t.remove(); });
  store.calcs.forEach((c, i) => {
    let t = el.tabs.querySelector(`[data-id="${c.id}"]`);
    if (!t) t = tabEl(c);
    if (el.tabs.children[i] !== t) el.tabs.insertBefore(t, el.tabs.children[i] || null);
    const isActive = c.id === store.active;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
    t.firstChild.textContent = c.name;
    t.lastChild.textContent = displayValue(c.s, true);
  });
  if (scroll) {
    const act = el.tabs.querySelector('.tab.active');
    if (act) {
      const l = act.offsetLeft - el.tabs.offsetLeft, r = l + act.offsetWidth;
      if (l < el.tabs.scrollLeft) el.tabs.scrollLeft = l - 8;
      else if (r > el.tabs.scrollLeft + el.tabs.clientWidth - 18) el.tabs.scrollLeft = r - el.tabs.clientWidth + 26;
    }
  }
}

let lastAc = '';
function render({ scrollTabs = false } = {}) {
  const c = active();
  const s = c.s;
  applyTheme();

  const txt = displayValue(s);
  if (el.value.textContent !== txt) el.value.textContent = txt;
  el.value.classList.toggle('error', !!s.error);
  el.expr.textContent = exprLine(s);
  el.mem.classList.toggle('on', s.memory !== null);
  fitValue();

  // iPhone: AC ↔ borrar
  const canDelete = s.typing && s.cur !== '0' && s.cur !== '-0' && !s.error;
  const ac = canDelete ? 'back' : 'ac';
  if (ac !== lastAc) {
    lastAc = ac;
    el.iosAc.dataset.key = ac;
    el.iosAc.innerHTML = canDelete ? ICON.back : 'AC';
    el.iosAc.setAttribute('aria-label', canDelete ? 'Borrar' : 'Borrar todo');
  }

  // Operador activo (iPhone)
  const pendingOp = s.opPending ? s.tokens[s.tokens.length - 1] : null;
  document.querySelectorAll('.keypad-ios .k.op').forEach((b) => b.classList.toggle('active', b.dataset.key === pendingOp));

  // Memoria (Windows)
  const noMem = s.memory === null;
  document.querySelectorAll('.memrow [data-key="mc"], .memrow [data-key="mr"]').forEach((b) => { b.disabled = noMem; });

  renderTabs(scrollTabs);
}

function slideReadout(dir) {
  const r = el.readout;
  r.classList.remove('from-right', 'from-left');
  void r.offsetWidth; // reinicia la animación
  r.classList.add(dir > 0 ? 'from-right' : 'from-left');
}
el.readout.addEventListener('animationend', () => el.readout.classList.remove('from-right', 'from-left'));

/* ================= Toques: respuesta visual inmediata ================= */
// Cualquier elemento "tocable" se hunde al apoyar el dedo y vuelve con rebote al soltar.
const PRESSABLE = '.k, .m, .tab, .icon-btn, .hist-btn, .list-item, .card, .seg button, .pills button, .btn-primary, .popover button, .sheet-close';
let pressedEl = null, pressX = 0, pressY = 0;
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest(PRESSABLE);
  if (!t || t.disabled) return;
  pressedEl = t; pressX = e.clientX; pressY = e.clientY;
  t.classList.add('pressed');
}, { passive: true });
document.addEventListener('pointermove', (e) => {
  if (pressedEl && !pressedEl.classList.contains('k') && Math.hypot(e.clientX - pressX, e.clientY - pressY) > 10) {
    pressedEl.classList.remove('pressed');
    pressedEl = null;
  }
}, { passive: true });
const release = () => {
  if (!pressedEl) return;
  const t = pressedEl;
  pressedEl = null;
  // un instante mínimo para que se vea el toque aunque sea rapidísimo
  setTimeout(() => t.classList.remove('pressed'), 40);
};
document.addEventListener('pointerup', release, { passive: true });
document.addEventListener('pointercancel', release, { passive: true });
document.addEventListener('contextmenu', (e) => { if (!e.target.matches('input')) e.preventDefault(); });

/* ================= Teclas ================= */
function doKey(key) {
  const c = active();
  press(c.s, key, { mode: store.style, fmt: (n) => fmt(n) });
  save();
  render();
}

// Las teclas responden al apoyar el dedo (no al soltar): se siente instantáneo
document.querySelectorAll('.keypad .k[data-key], .memrow .m').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || btn.disabled) return;
    hidePopover();
    haptic();
    doKey(btn.dataset.key);
  });
  btn.addEventListener('click', (e) => { if (e.detail === 0) doKey(btn.dataset.key); }); // teclado / VoiceOver
});
document.querySelector('[data-action="overview"]').addEventListener('click', () => { haptic(); openOverview(); });

document.querySelectorAll('.k.dec').forEach((b) => { b.textContent = DEC; });

// Teclado físico (compu)
const KEYMAP = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', Enter: '=', '=': '=', '%': '%',
  Backspace: 'back', Escape: 'ac', Delete: 'ce', ',': '.', '.': '.', F9: 'neg', r: 'inv', q: 'sq', '@': 'sqrt' };
document.addEventListener('keydown', (e) => {
  if (!sheet.root.hidden) { if (e.key === 'Escape') closeSheet(); return; }
  if (e.target.matches('input')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'c') { copyValue(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === 'v') { pasteValue(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
  if (!key) return;
  if (store.style === 'ios' && ['inv', 'sq', 'sqrt', 'ce'].includes(key)) return;
  e.preventDefault();
  const btn = document.querySelector(`.style-${store.style === 'ios' ? 'ios .keypad-ios' : 'win .keypad-win'} [data-key="${key}"]`);
  if (btn) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 90); }
  doKey(key);
});

/* ================= Gestos en la pantalla ================= */
// Deslizar el número = borrar un dígito · Mantener apretado = Copiar / Pegar / Enviar
let gx = null, gy = null, longTimer = null, longFired = false;
el.screen.addEventListener('touchstart', (e) => {
  if (e.target.closest('.hist-btn')) return;
  const t = e.touches[0];
  gx = t.clientX; gy = t.clientY; longFired = false;
  clearTimeout(longTimer);
  longTimer = setTimeout(() => { longFired = true; haptic(); showPopover(); }, 450);
}, { passive: true });
el.screen.addEventListener('touchmove', (e) => {
  if (gx === null) return;
  const t = e.touches[0];
  if (Math.abs(t.clientX - gx) > 10 || Math.abs(t.clientY - gy) > 10) clearTimeout(longTimer);
}, { passive: true });
el.screen.addEventListener('touchend', (e) => {
  clearTimeout(longTimer);
  if (gx === null || longFired) { gx = null; return; }
  const t = e.changedTouches[0];
  const dx = t.clientX - gx, dy = t.clientY - gy;
  if (Math.abs(dx) > 36 && Math.abs(dy) < 40) { haptic(); doKey('back'); }
  gx = null;
});
// Con mouse (compu): clic derecho o mantener
el.screen.addEventListener('mousedown', (e) => {
  if (e.target.closest('.hist-btn')) return;
  if (e.button === 2) { showPopover(); return; }
  clearTimeout(longTimer);
  longTimer = setTimeout(showPopover, 500);
});
el.screen.addEventListener('mouseup', () => clearTimeout(longTimer));

const popover = $('#popover');
function showPopover() {
  const s = active().s;
  popover.querySelector('[data-pop="copy"]').hidden = !!s.error;
  popover.querySelector('[data-pop="send"]').hidden = !!s.error;
  popover.hidden = false;
  el.value.classList.add('held');
  const r = el.value.getBoundingClientRect();
  const pw = popover.offsetWidth;
  const left = Math.max(10, Math.min(r.right - pw, window.innerWidth - pw - 10));
  popover.style.left = left + 'px';
  popover.style.top = Math.max(10, r.top - popover.offsetHeight - 8) + 'px';
}
function hidePopover() {
  if (popover.hidden) return;
  popover.hidden = true;
  el.value.classList.remove('held');
}
document.addEventListener('pointerdown', (e) => {
  if (!popover.hidden && !e.target.closest('#popover')) hidePopover();
}, { capture: true, passive: true });
popover.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.pop;
  hidePopover();
  if (act === 'copy') copyValue();
  if (act === 'paste') pasteValue();
  if (act === 'send') openSendTo();
});

function currentNumber() {
  const s = active().s;
  return s.error ? null : Number(s.cur);
}

async function copyValue() {
  const n = currentNumber();
  if (n === null) return;
  const s = active().s;
  const text = (s.typing ? s.cur : String(n)).replace('.', DEC);
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado: ' + displayValue(s));
  } catch { toast('No se pudo copiar'); }
}

async function pasteValue() {
  try {
    const text = await navigator.clipboard.readText();
    const n = parseNumber(text);
    if (!Number.isFinite(n)) { toast('No hay un número para pegar'); return; }
    setEntry(active(), n);
    render();
  } catch { toast('No se pudo pegar'); }
}

// Pone un número como entrada actual (sin romper una operación pendiente)
function setEntry(c, n) {
  Object.assign(c.s, { cur: String(n), typing: false, error: null, label: null, done: null, opPending: false });
  save();
}

/* ================= Calculadoras múltiples ================= */
function switchTo(id) {
  if (id === store.active) return;
  const dir = calcIndex(id) > calcIndex(store.active) ? 1 : -1;
  store.active = id;
  save();
  render({ scrollTabs: true });
  slideReadout(dir);
}

function addCalc() {
  if (store.calcs.length >= MAX_CALCS) { toast(`Máximo ${MAX_CALCS} calculadoras`); return null; }
  const c = makeCalc();
  store.calcs.push(c);
  store.active = c.id;
  save();
  render({ scrollTabs: true });
  slideReadout(1);
  return c;
}

function duplicateCalc(id) {
  if (store.calcs.length >= MAX_CALCS) { toast(`Máximo ${MAX_CALCS} calculadoras`); return; }
  const src = store.calcs.find((c) => c.id === id);
  const c = makeCalc(src.name + ' (copia)');
  c.s = JSON.parse(JSON.stringify(src.s));
  store.calcs.splice(calcIndex(id) + 1, 0, c);
  store.active = c.id;
  save();
  render({ scrollTabs: true });
  slideReadout(1);
}

function deleteCalc(id) {
  const i = calcIndex(id);
  if (i < 0) return;
  const removed = store.calcs[i];
  const wasActive = store.active === id;
  if (store.calcs.length === 1) {
    const prev = removed.s;
    removed.s = newState();
    save(); render();
    toast(`Reiniciaste "${removed.name}"`, { label: 'Deshacer', fn: () => { removed.s = prev; save(); render(); } });
    return;
  }
  store.calcs.splice(i, 1);
  if (wasActive) store.active = store.calcs[Math.max(0, i - 1)].id;
  save();
  render({ scrollTabs: true });
  if (wasActive) slideReadout(-1);
  toast(`Borraste "${removed.name}"`, { label: 'Deshacer', fn: () => {
    store.calcs.splice(i, 0, removed);
    if (wasActive) store.active = removed.id;
    save(); render({ scrollTabs: true });
    if (!sheet.root.hidden && sheet.kind === 'overview') openOverview();
  } });
}

// Tocar una pestaña: cambia. Tocar la activa o mantenerla apretada: opciones.
let tabTimer = null, tabLong = false;
el.tabs.addEventListener('pointerdown', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  tabLong = false;
  clearTimeout(tabTimer);
  tabTimer = setTimeout(() => {
    tabLong = true;
    tab.classList.remove('pressed');
    haptic();
    if (tab.dataset.id !== store.active) switchTo(tab.dataset.id);
    openCalcMenu(tab.dataset.id);
  }, 480);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.tabs.addEventListener(ev, () => clearTimeout(tabTimer)));
el.tabs.addEventListener('scroll', () => clearTimeout(tabTimer), { passive: true });
el.tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab || tabLong) return;
  if (tab.dataset.id === store.active) openCalcMenu(tab.dataset.id);
  else { haptic(); switchTo(tab.dataset.id); }
});

$('#btn-add').addEventListener('click', () => { haptic(); addCalc(); });
$('#btn-menu').addEventListener('click', openSettings);
$('#btn-history').addEventListener('click', openHistory);

/* ================= Aviso con "Deshacer" ================= */
const toastEl = $('#toast'), toastMsg = $('#toast-msg'), toastBtn = $('#toast-btn');
let toastTimer, toastAction = null;
function toast(msg, action = null) {
  toastMsg.textContent = msg;
  toastAction = action;
  toastBtn.hidden = !action;
  if (action) toastBtn.textContent = action.label;
  toastEl.classList.remove('out');
  toastEl.hidden = false;
  toastEl.style.animation = 'none'; void toastEl.offsetWidth; toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 4000 : 1600);
}
function hideToast() {
  toastEl.classList.add('out');
  setTimeout(() => { if (toastEl.classList.contains('out')) toastEl.hidden = true; }, 200);
}
toastBtn.addEventListener('click', () => {
  const a = toastAction;
  toastAction = null;
  hideToast();
  a?.fn();
});

/* ================= Hoja inferior (se cierra deslizando hacia abajo) ================= */
const sheet = { root: $('#sheet-backdrop'), panel: $('#sheet'), title: $('#sheet-title'), body: $('#sheet-body'), kind: null };

function openSheet(kind, title, build) {
  const wasOpen = !sheet.root.hidden && !sheet.root.classList.contains('closing');
  const scroll = wasOpen && sheet.kind === kind ? sheet.body.scrollTop : 0;
  sheet.kind = kind;
  sheet.title.textContent = title;
  sheet.body.innerHTML = '';
  build(sheet.body);
  sheet.body.scrollTop = scroll;
  if (!wasOpen) {
    sheet.root.classList.remove('closing');
    sheet.panel.style.transform = '';
    sheet.root.hidden = false;
  }
}

function closeSheet() {
  if (sheet.root.hidden || sheet.root.classList.contains('closing')) return;
  document.activeElement?.blur?.();
  sheet.root.classList.add('closing');
  const done = () => {
    sheet.root.hidden = true;
    sheet.root.classList.remove('closing');
    sheet.panel.style.transform = '';
    sheet.panel.classList.remove('settle');
  };
  setTimeout(done, 240);
}
$('#sheet-close').addEventListener('click', closeSheet);
sheet.root.addEventListener('click', (e) => { if (e.target === sheet.root) closeSheet(); });

// Arrastrar para cerrar
(() => {
  const handle = $('#sheet-drag');
  let startY = null, lastY = 0, lastT = 0, vel = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sheet-close')) return;
    startY = e.clientY; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
    sheet.panel.classList.add('dragging');
    sheet.panel.classList.remove('settle');
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY);
    vel = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY; lastT = e.timeStamp;
    sheet.panel.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY);
    startY = null;
    sheet.panel.classList.remove('dragging');
    if (dy > 110 || vel > 0.6) {
      sheet.panel.classList.add('settle');
      sheet.panel.style.transform = 'translateY(100%)';
      sheet.root.classList.add('closing');
      setTimeout(() => {
        sheet.root.hidden = true;
        sheet.root.classList.remove('closing');
        sheet.panel.classList.remove('settle');
        sheet.panel.style.transform = '';
      }, 260);
    } else {
      sheet.panel.classList.add('settle');
      sheet.panel.style.transform = '';
    }
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
})();

function h(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  n.append(...children.filter((c) => c != null && c !== false));
  return n;
}
const item = (icon, label, onclick, extra = {}) =>
  h('button', { class: 'list-item' + (extra.danger ? ' danger' : ''), onclick },
    icon ? h('span', { html: icon, style: 'display:contents' }) : null,
    h('span', { class: 'grow' }, label),
    extra.meta != null ? h('span', { class: 'meta' }, extra.meta) : null);

/* ---------- Vista general ---------- */
function openOverview() {
  openSheet('overview', 'Calculadoras', (body) => {
    body.append(h('p', { class: 'hint' }, 'Cada una guarda sus cuentas, aunque estén a medio hacer. Tocá una para seguir donde la dejaste.'));
    const grid = h('div', { class: 'cards' });
    store.calcs.forEach((c, i) => {
      grid.append(h('button', {
        class: 'card' + (c.id === store.active ? ' active' : ''),
        style: `animation-delay:${Math.min(i, 8) * 25}ms`,
        onclick: () => { closeSheet(); haptic(); switchTo(c.id); },
      },
      h('div', { class: 'c-name' }, c.name),
      h('div', {},
        h('div', { class: 'c-expr' }, exprLine(c.s)),
        h('div', { class: 'c-val' }, displayValue(c.s, true))),
      h('span', { class: 'c-del', html: ICON.x, role: 'button', 'aria-label': `Borrar ${c.name}`,
        onclick: (e) => { e.stopPropagation(); haptic(); deleteCalc(c.id); openOverview(); } })));
    });
    if (store.calcs.length < MAX_CALCS) {
      grid.append(h('button', { class: 'card new', style: `animation-delay:${Math.min(store.calcs.length, 8) * 25}ms`,
        onclick: () => { closeSheet(); haptic(); addCalc(); } },
      h('span', { html: ICON.plus }), 'Nueva'));
    }
    body.append(grid);
  });
}

/* ---------- Opciones de una calculadora ---------- */
function openCalcMenu(id) {
  const c = store.calcs.find((x) => x.id === id);
  if (!c) return;
  openSheet('calc', c.name, (body) => {
    const input = h('input', { class: 'field', value: c.name, maxlength: '24', 'aria-label': 'Nombre',
      enterkeyhint: 'done', autocomplete: 'off', autocapitalize: 'sentences' });
    const saveName = () => {
      const v = input.value.trim();
      if (v && v !== c.name) { c.name = v; save(); render(); toast('Nombre guardado'); }
      closeSheet();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
    body.append(
      h('div', { class: 'section-label' }, 'Nombre'),
      h('div', { style: 'margin:6px 0 0' }, input),
      h('button', { class: 'btn-primary', onclick: saveName }, 'Guardar nombre'),
      h('div', { class: 'list', style: 'margin-top:18px' },
        item(ICON.send, 'Enviar resultado a otra', () => openSendTo()),
        item(ICON.dup, 'Duplicar', () => { closeSheet(); duplicateCalc(id); }),
        item(ICON.clock, 'Ver historial', () => openHistory())),
      h('div', { class: 'list' },
        item(ICON.trash, store.calcs.length > 1 ? 'Borrar calculadora' : 'Reiniciar calculadora',
          () => { closeSheet(); deleteCalc(id); }, { danger: true })),
    );
  });
}

/* ---------- Enviar resultado ---------- */
function openSendTo() {
  const src = active();
  const n = currentNumber();
  if (n === null) return;
  openSheet('send', `Enviar ${fmt(n)}`, (body) => {
    body.append(h('p', { class: 'hint' }, 'El número entra como valor actual en la otra calculadora. Si ahí había una cuenta a medio hacer (por ejemplo "100 +"), la continúa.'));
    const list = h('div', { class: 'list' });
    for (const c of store.calcs) {
      if (c.id === src.id) continue;
      list.append(item(null, c.name, () => {
        setEntry(c, n);
        closeSheet(); haptic(); switchTo(c.id);
        toast(`Enviado a "${c.name}"`);
      }, { meta: c.s.tokens.length ? exprLine(c.s) : displayValue(c.s, true) }));
    }
    if (store.calcs.length < MAX_CALCS) {
      list.append(item(ICON.plus, 'Nueva calculadora', () => {
        closeSheet();
        const c = addCalc();
        if (c) { setEntry(c, n); render(); toast(`Enviado a "${c.name}"`); }
      }));
    }
    body.append(list);
  });
}

/* ---------- Historial ---------- */
function openHistory() {
  const c = active();
  openSheet('history', 'Historial', (body) => {
    if (!c.s.history.length) {
      body.append(h('div', { class: 'empty' }, h('span', { html: ICON.clock }), `Todavía no hay cuentas en "${c.name}"`));
      return;
    }
    body.append(h('p', { class: 'hint' }, `${c.name} · Tocá un resultado para usarlo.`));
    const list = h('div', { class: 'list' });
    for (const it of c.s.history) {
      list.append(h('button', { class: 'list-item hist-item', onclick: () => {
        setEntry(c, it.result); render(); closeSheet();
      } },
      h('span', { class: 'h-expr' }, it.expr),
      h('span', { class: 'h-res' }, fmt(it.result))));
    }
    body.append(list, h('div', { class: 'list' },
      item(ICON.trash, 'Borrar historial', () => {
        const prev = c.s.history;
        c.s.history = []; save(); openHistory();
        toast('Historial borrado', { label: 'Deshacer', fn: () => { c.s.history = prev; save(); if (sheet.kind === 'history' && !sheet.root.hidden) openHistory(); } });
      }, { danger: true })));
  });
}

/* ---------- Ajustes ---------- */
function openSettings() {
  openSheet('settings', 'Ajustes', (body) => {
    const mini = (kind) => {
      const m = h('div', { class: 'mini ' + kind });
      const pattern = kind === 'ios'
        ? ['f', 'f', 'f', 'o', '', '', '', 'o', '', '', '', 'o', '', '', '', 'o', '', '', '', 'o']
        : ['f', 'f', 'f', 'f', 'f', 'f', 'f', 'f', '', '', '', 'f', '', '', '', 'f', '', '', '', 'f', '', '', '', 'o'];
      pattern.forEach((p) => m.append(h('i', p ? { class: p } : {})));
      return m;
    };
    const setStyle = (style) => {
      if (store.style === style) return;
      haptic();
      store.style = style; save(); render(); openSettings();
    };
    const opt = (style, label) => h('button', { class: store.style === style ? 'on' : '', onclick: () => setStyle(style) }, mini(style), label);
    const themeBtn = (val, label) => h('button', { class: store.winTheme === val ? 'on' : '',
      onclick: () => { store.winTheme = val; save(); render(); openSettings(); } }, label);
    const vib = h('span', { class: 'switch' + (store.haptics ? ' on' : '') });

    body.append(
      h('div', { class: 'section-label' }, 'Estilo'),
      h('div', { class: 'seg' }, opt('ios', 'iPhone'), opt('win', 'Windows')),
      store.style === 'win' ? h('div', { class: 'pills' }, themeBtn('auto', 'Automático'), themeBtn('light', 'Claro'), themeBtn('dark', 'Oscuro')) : null,
      h('p', { class: 'hint' }, store.style === 'ios'
        ? 'Respeta el orden de las operaciones: 2 + 3 × 4 = 14. Deslizá el número para borrar un dígito; mantenelo apretado para copiar, pegar o enviarlo a otra calculadora.'
        : 'Calcula a medida que escribís: 2 + 3 × 4 = 20. Tiene memoria (MS, M+, M−, MR), 1/x, x² y √x. Mantené apretado el número para copiar, pegar o enviarlo a otra calculadora.'),
      h('div', { class: 'list' },
        h('button', { class: 'list-item', onclick: () => {
          store.haptics = !store.haptics; save();
          vib.classList.toggle('on', store.haptics);
          haptic();
        } }, h('span', { html: ICON.vib, style: 'display:contents' }), h('span', { class: 'grow' }, 'Vibrar al tocar'), vib)),
      h('div', { class: 'section-label' }, 'Calculadoras'),
      h('div', { class: 'list' },
        item(ICON.grid, 'Ver todas', openOverview, { meta: String(store.calcs.length) }),
        item(ICON.plus, 'Nueva calculadora', () => { closeSheet(); addCalc(); }),
        item(ICON.edit, 'Renombrar la actual', () => openCalcMenu(store.active))),
      h('div', { class: 'section-label' }, 'Instalar en el iPhone'),
      h('p', { class: 'hint', style: 'margin-top:6px' }, 'En Safari: Compartir → "Agregar a inicio". Queda como una app, a pantalla completa, funciona sin internet y guarda tus calculadoras.'),
    );
  });
}

/* ================= Inicio ================= */
let resizeRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(fitValue); });
darkMQ.addEventListener?.('change', () => render());
document.fonts?.ready.then(fitValue);
render({ scrollTabs: true });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
