// Небольшие помощники для работы с DOM без фреймворков.

/** Экранирует HTML-спецсимволы. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * h('div', { class: 'card', onClick: fn, dataset: { id: 1 }, html: '<b>x</b>' }, child1, 'text', [child2])
 * Создаёт элемент. `html` — доверенная разметка (только из нашего рендера markdown).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === null || val === undefined || val === false) continue;
    if (key === 'class' || key === 'className') el.className = val;
    else if (key === 'html') el.innerHTML = val;
    else if (key === 'text') el.textContent = val;
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key === 'dataset' && typeof val === 'object') {
      for (const [dk, dv] of Object.entries(val)) el.dataset[dk] = dv;
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val === true) el.setAttribute(key, '');
    else el.setAttribute(key, val);
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replaceChildren(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Плюрализация для русского: plural(5, ['вопрос','вопроса','вопросов']) */
export function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function pluralize(n, forms) {
  return `${n} ${plural(n, forms)}`;
}

export function formatPercent(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (hrs > 0) return `${hrs}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function formatMinutes(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} мин`;
  const hrs = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hrs} ч ${rest} мин` : `${hrs} ч`;
}

export function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
