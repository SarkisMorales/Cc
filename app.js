import { newState, press, tokensText } from './engine.js';

const STORE_KEY = 'multicalc:v1';
const MAX_CALCS = 12;
const $ = (sel, el = document) => el.querySelector(sel);

/* ---------------- Formato de números (según idioma del teléfono) ---------------- */
const parts = new Intl.NumberFormat(navigator.language || 'es-AR').formatToParts(12345.6);
const DEC = parts.find((p) => p.type === 'decimal')?.value || ',';
const GRP = parts.find((p) => p.type === 'group')?.value || '.';

function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, GRP);
}

function maxDigits() { return store.style === 'ios' ? 9 : 16; }

// Número calculado -> texto para mostrar
function fmt(n, digits = maxDigits()) {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10 ** digits || abs < 10 ** -(digits - 1)) {
    let [m, e] = abs.toExponential(digits - 4).split('e');
    m = m.replace(/\.?0+$/, '').replace('.', DEC);
    e = e.replace('+', '');
    return `${sign}${m}e${store.style === 'ios' ? e : (e.startsWith('-') ? e : '+' + e)}`;
  }
  const intDigits = Math.max(1, Math.floor(Math.log10(abs)) + 1);
  const decimals = Math.max(0, Math.min(digits - intDigits, 15));
  let s = abs.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  const [i, d] = s.split('.');
  return sign + group(i) + (d ? DEC + d : '');
}

// Entrada en curso ("1234.50") -> "1.234,50"
function fmtEntry(cur) {
  const sign = cur.startsWith('-') ? '-' : '';
  const body = sign ? cur.slice(1) : cur;
  const [i, d] = body.split('.');
  return sign + group(i) + (body.includes('.') ? DEC + d : '');
}

function displayValue(s) {
  if (s.error) {
    if (store.style === 'ios') return 'Error';
    return { div0: 'No se puede dividir entre cero', invalid: 'Entrada no válida', overflow: 'Desbordamiento' }[s.error];
  }
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

/* ---------------- Persistencia ---------------- */
function makeCalc(name) {
  store.seq += 1;
  return { id: 'c' + Date.now().toString(36) + store.seq, name: name || `Calc ${store.seq}`, s: newState() };
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.calcs) && data.calcs.length) {
      data.calcs.forEach((c) => { c.s = Object.assign(newState(), c.s); });
      if (!data.calcs.some((c) => c.id === data.active)) data.active = data.calcs[0].id;
      if (data.style !== 'win') data.style = 'ios';
      return data;
    }
  } catch { /* datos corruptos o almacenamiento bloqueado */ }
  return null;
}

let store = load();
if (!store) {
  store = { style: 'ios', seq: 0, calcs: [], active: null };
  const c = makeCalc();
  store.calcs.push(c);
  store.active = c.id;
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* sin espacio / modo privado */ }
}

const active = () => store.calcs.find((c) => c.id === store.active);

/* ---------------- Render ---------------- */
const el = {
  tabs: $('#tabs'), expr: $('#expr'), value: $('#value'), valueWrap: $('#value-wrap'),
  name: $('#calc-name'), mem: $('#mem-ind'), iosAc: $('#ios-ac'),
};

const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="m12 9 6 6M18 9l-6 6"/></svg>';

function renderTabs() {
  el.tabs.innerHTML = '';
  for (const c of store.calcs) {
    const b = document.createElement('button');
    b.className = 'tab' + (c.id === store.active ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.dataset.id = c.id;
    const n = document.createElement('span'); n.className = 'tab-name'; n.textContent = c.name;
    const v = document.createElement('span'); v.className = 'tab-val'; v.textContent = c.s.error ? 'Error' : displayValue(c.s);
    b.append(n, v);
    el.tabs.append(b);
  }
  const act = el.tabs.querySelector('.tab.active');
  act?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function fitValue() {
  const v = el.value;
  v.style.transform = '';
  const avail = el.valueWrap.clientWidth;
  const w = v.scrollWidth;
  if (w > avail && avail > 0) v.style.transform = `scale(${avail / w})`;
}

function render() {
  const c = active();
  const s = c.s;
  document.body.className = 'style-' + store.style;
  document.querySelector('meta[name="theme-color"]').content =
    store.style === 'ios' ? '#000000' : getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#202020';

  el.value.textContent = displayValue(s);
  el.value.classList.toggle('error', !!s.error);
  el.expr.textContent = exprLine(s);
  el.name.textContent = c.name;
  el.mem.classList.toggle('on', s.memory !== null);
  fitValue();

  // iPhone: AC ↔ borrar
  const canDelete = s.typing && s.cur !== '0' && s.cur !== '-0' && !s.error;
  el.iosAc.dataset.key = canDelete ? 'back' : 'ac';
  el.iosAc.innerHTML = canDelete ? BACK_ICON : 'AC';
  el.iosAc.setAttribute('aria-label', canDelete ? 'Borrar' : 'Borrar todo');

  // Operador activo (iPhone)
  const pendingOp = s.opPending ? s.tokens[s.tokens.length - 1] : null;
  document.querySelectorAll('.keypad-ios .k.op').forEach((b) => b.classList.toggle('active', b.dataset.key === pendingOp && pendingOp !== '='));

  // Memoria (Windows)
  const noMem = s.memory === null;
  document.querySelectorAll('.memrow [data-key="mc"], .memrow [data-key="mr"]').forEach((b) => { b.disabled = noMem; });

  renderTabs();
}

/* ---------------- Teclas ---------------- */
function doKey(key) {
  const c = active();
  press(c.s, key, { mode: store.style, fmt: (n) => fmt(n) });
  save();
  render();
}

function bindPress(btn) {
  btn.addEventListener('pointerdown', () => btn.classList.add('pressed'));
  const up = () => btn.classList.remove('pressed');
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('pointercancel', up);
}

document.querySelectorAll('.keypad .k, .memrow .m').forEach((btn) => {
  bindPress(btn);
  btn.addEventListener('click', () => {
    setTimeout(() => btn.classList.remove('pressed'), 60);
    if (btn.dataset.action === 'overview') return openOverview();
    if (btn.dataset.key) doKey(btn.dataset.key);
  });
});

// Etiqueta del separador decimal según idioma
document.querySelectorAll('.k.dec').forEach((b) => { b.textContent = DEC; });

// Teclado físico (compu)
const KEYMAP = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', Enter: '=', '=': '=', '%': '%',
  Backspace: 'back', Escape: 'ac', Delete: 'ce', ',': '.', '.': '.', F9: 'neg', r: 'inv', q: 'sq', '@': 'sqrt' };
document.addEventListener('keydown', (e) => {
  if (!$('#sheet-backdrop').hidden || e.target.matches('input')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'c') { copyValue(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  let key = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
  if (!key) return;
  if (store.style === 'ios' && ['inv', 'sq', 'sqrt', 'ce'].includes(key)) return;
  e.preventDefault();
  doKey(key);
});

/* ---------------- Gestos en la pantalla ---------------- */
let touchX = null, touchY = null, longTimer = null;
el.valueWrap.parentElement.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchX = t.clientX; touchY = t.clientY;
  clearTimeout(longTimer);
  longTimer = setTimeout(() => { touchX = null; copyValue(); }, 600);
}, { passive: true });
el.valueWrap.parentElement.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (Math.abs(t.clientX - touchX) > 10 || Math.abs(t.clientY - touchY) > 10) clearTimeout(longTimer);
}, { passive: true });
el.valueWrap.parentElement.addEventListener('touchend', (e) => {
  clearTimeout(longTimer);
  if (touchX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchX, dy = t.clientY - touchY;
  // Deslizar horizontal sobre el número = borrar último dígito (como en el iPhone)
  if (Math.abs(dx) > 40 && Math.abs(dy) < 40) doKey('back');
  touchX = null;
});

async function copyValue() {
  const s = active().s;
  if (s.error) return;
  const text = s.typing ? s.cur : String(Number(s.cur));
  try {
    await navigator.clipboard.writeText(text.replace('.', DEC));
    toast('Copiado');
  } catch { toast('No se pudo copiar'); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1300);
}

/* ---------------- Calculadoras múltiples ---------------- */
function switchTo(id) {
  if (id === store.active) return;
  store.active = id;
  save();
  render();
  toast(active().name);
}

function addCalc() {
  if (store.calcs.length >= MAX_CALCS) { toast(`Máximo ${MAX_CALCS} calculadoras`); return; }
  const c = makeCalc();
  store.calcs.push(c);
  store.active = c.id;
  save();
  render();
  toast(c.name);
}

function duplicateCalc(id) {
  if (store.calcs.length >= MAX_CALCS) { toast(`Máximo ${MAX_CALCS} calculadoras`); return; }
  const src = store.calcs.find((c) => c.id === id);
  const c = makeCalc(src.name + ' (copia)');
  c.s = JSON.parse(JSON.stringify(src.s));
  store.calcs.splice(store.calcs.indexOf(src) + 1, 0, c);
  store.active = c.id;
  save();
  render();
}

function deleteCalc(id) {
  const i = store.calcs.findIndex((c) => c.id === id);
  if (i < 0) return;
  if (store.calcs.length === 1) {
    store.calcs[0].s = newState();
  } else {
    store.calcs.splice(i, 1);
    if (store.active === id) store.active = store.calcs[Math.max(0, i - 1)].id;
  }
  save();
  render();
}

el.tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  if (tab.dataset.id === store.active) openCalcMenu(tab.dataset.id);
  else switchTo(tab.dataset.id);
});
$('#btn-add').addEventListener('click', addCalc);
$('#btn-menu').addEventListener('click', openSettings);
$('#btn-history').addEventListener('click', openHistory);

/* ---------------- Hoja inferior ---------------- */
const sheet = { root: $('#sheet-backdrop'), title: $('#sheet-title'), body: $('#sheet-body') };
function openSheet(title, build) {
  sheet.title.textContent = title;
  sheet.body.innerHTML = '';
  build(sheet.body);
  sheet.root.hidden = false;
}
function closeSheet() { sheet.root.hidden = true; }
$('#sheet-close').addEventListener('click', closeSheet);
sheet.root.addEventListener('click', (e) => { if (e.target === sheet.root) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.root.hidden) closeSheet(); });

function h(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  n.append(...children.filter((c) => c != null));
  return n;
}

const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

function openOverview() {
  openSheet('Calculadoras', (body) => {
    body.append(h('p', { class: 'hint' }, 'Cada calculadora guarda sus cuentas. Tocá una para seguir donde la dejaste.'));
    const grid = h('div', { class: 'cards' });
    for (const c of store.calcs) {
      const card = h('button', { class: 'card' + (c.id === store.active ? ' active' : ''),
        onclick: () => { closeSheet(); switchTo(c.id); } },
      h('div', { class: 'c-name' }, c.name),
      h('div', {},
        h('div', { class: 'c-expr' }, exprLine(c.s)),
        h('div', { class: 'c-val' }, displayValue(c.s))),
      h('span', { class: 'c-del', html: X_ICON, 'aria-label': 'Borrar',
        onclick: (e) => {
          e.stopPropagation();
          if (confirm(`¿Borrar "${c.name}"?`)) { deleteCalc(c.id); openOverview(); }
        } }));
      grid.append(card);
    }
    if (store.calcs.length < MAX_CALCS) {
      grid.append(h('button', { class: 'card new', onclick: () => { closeSheet(); addCalc(); } },
        h('span', { html: PLUS_ICON }), 'Nueva'));
    }
    body.append(grid);
  });
}

function openCalcMenu(id) {
  const c = store.calcs.find((x) => x.id === id);
  openSheet(c.name, (body) => {
    const input = h('input', { class: 'field', value: c.name, maxlength: '24', 'aria-label': 'Nombre', enterkeyhint: 'done' });
    const saveName = () => {
      const v = input.value.trim();
      if (v) { c.name = v; save(); render(); }
      closeSheet();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
    body.append(
      h('div', { class: 'section-label' }, 'Nombre'),
      h('div', { style: 'margin:6px 0 4px' }, input),
      h('button', { class: 'btn-primary', onclick: saveName }, 'Guardar nombre'),
      h('div', { class: 'list', style: 'margin-top:18px' },
        h('button', { class: 'list-item', onclick: () => { closeSheet(); duplicateCalc(id); } }, 'Duplicar calculadora'),
        h('button', { class: 'list-item', onclick: () => { c.s.history = []; save(); closeSheet(); toast('Historial borrado'); } }, 'Borrar historial'),
        h('button', { class: 'list-item danger', onclick: () => {
          if (confirm(`¿Borrar "${c.name}"?`)) { closeSheet(); deleteCalc(id); }
        } }, store.calcs.length > 1 ? 'Borrar calculadora' : 'Reiniciar calculadora')),
    );
  });
}

function openHistory() {
  const c = active();
  openSheet('Historial · ' + c.name, (body) => {
    if (!c.s.history.length) { body.append(h('div', { class: 'empty' }, 'Todavía no hay cuentas')); return; }
    const list = h('div', { class: 'list' });
    for (const item of c.s.history) {
      list.append(h('button', { class: 'list-item hist-item', onclick: () => {
        Object.assign(c.s, { cur: String(item.result), typing: false, error: null, label: null, done: null, opPending: false });
        save(); render(); closeSheet();
      } },
      h('span', { class: 'h-expr' }, item.expr),
      h('span', { class: 'h-res' }, fmt(item.result))));
    }
    body.append(
      h('p', { class: 'hint' }, 'Tocá un resultado para usarlo.'),
      list,
      h('div', { class: 'list' },
        h('button', { class: 'list-item danger', onclick: () => { c.s.history = []; save(); openHistory(); } }, 'Borrar historial')));
  });
}

function openSettings() {
  openSheet('Ajustes', (body) => {
    const mini = (kind) => {
      const m = h('div', { class: 'mini ' + kind });
      const pattern = kind === 'ios'
        ? ['f', 'f', 'f', 'o', '', '', '', 'o', '', '', '', 'o', '', '', '', 'o', '', '', '', 'o']
        : ['f', 'f', 'f', 'f', 'f', 'f', 'f', 'f', '', '', '', 'f', '', '', '', 'f', '', '', '', 'f', '', '', '', 'o'];
      pattern.forEach((p) => m.append(h('i', p ? { class: p } : {})));
      return m;
    };
    const opt = (style, label) => h('button', { class: store.style === style ? 'on' : '',
      onclick: () => { store.style = style; save(); render(); openSettings(); } }, mini(style), label);
    body.append(
      h('div', { class: 'section-label' }, 'Estilo'),
      h('div', { class: 'seg' }, opt('ios', 'iPhone'), opt('win', 'Windows')),
      h('p', { class: 'hint' }, store.style === 'ios'
        ? 'Estilo iPhone: respeta el orden de las operaciones (2 + 3 × 4 = 14). Deslizá el número para borrar el último dígito. Mantené apretado para copiar.'
        : 'Estilo Windows: calcula a medida que escribís (2 + 3 × 4 = 20). Incluye memoria, 1/x, x² y √x. Mantené apretado el número para copiar.'),
      h('div', { class: 'section-label' }, 'Calculadoras'),
      h('div', { class: 'list' },
        h('button', { class: 'list-item', onclick: openOverview }, h('span', { class: 'grow' }, 'Ver todas'), `${store.calcs.length}`),
        h('button', { class: 'list-item', onclick: () => { closeSheet(); addCalc(); } }, 'Nueva calculadora'),
        h('button', { class: 'list-item', onclick: () => openCalcMenu(store.active) }, 'Renombrar la actual')),
      h('div', { class: 'section-label' }, 'Instalar en el iPhone'),
      h('p', { class: 'hint' }, 'En Safari tocá Compartir (□↑) → "Agregar a inicio". Queda como una app, funciona sin internet y guarda tus calculadoras.'),
    );
  });
}

/* ---------------- Inicio ---------------- */
window.addEventListener('resize', fitValue);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', render);
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
