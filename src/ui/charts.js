// Простые SVG-графики без библиотек: линия, столбцы, тепловая карта активности.

import { esc, h } from '../core/dom.js';
import { formatDate } from '../core/time.js';

const W = 640;

function scaleX(i, n, pad, width) {
  return n <= 1 ? pad + (width - 2 * pad) / 2 : pad + (i * (width - 2 * pad)) / (n - 1);
}

/**
 * series: [{ key, value|null, label? }], max: верхняя граница шкалы.
 * Пустые значения пропускаются (линия рвётся).
 */
export function lineChart({ series = [], max = 1, min = 0, height = 180, format = (v) => String(v), width = W, unit = '' } = {}) {
  const pad = 28;
  const n = series.length;
  const range = max - min || 1;
  const y = (v) => height - pad + 6 - ((v - min) / range) * (height - 2 * pad);
  const parts = [];
  const gridSteps = 4;
  for (let g = 0; g <= gridSteps; g += 1) {
    const value = min + (range * g) / gridSteps;
    const yy = y(value).toFixed(1);
    parts.push(`<line class="grid-line" x1="${pad}" x2="${width - pad}" y1="${yy}" y2="${yy}"/>`);
    parts.push(`<text x="${pad - 6}" y="${Number(yy) + 4}" text-anchor="end">${esc(format(value))}${esc(unit)}</text>`);
  }
  let d = '';
  let open = false;
  const dots = [];
  series.forEach((p, i) => {
    if (p.value === null || p.value === undefined || !Number.isFinite(p.value)) {
      open = false;
      return;
    }
    const x = scaleX(i, n, pad, width).toFixed(1);
    const yy = y(p.value).toFixed(1);
    d += `${open ? 'L' : 'M'}${x} ${yy} `;
    open = true;
    dots.push(`<circle class="dot" cx="${x}" cy="${yy}" r="3.5"><title>${esc(p.label || p.key)}: ${esc(format(p.value))}${esc(unit)}</title></circle>`);
  });
  const labels = [];
  const labelIdx = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  for (const i of new Set(labelIdx)) {
    if (!series[i]) continue;
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    labels.push(`<text x="${scaleX(i, n, pad, width).toFixed(1)}" y="${height - 4}" text-anchor="${anchor}">${esc(series[i].label || shortDay(series[i].key))}</text>`);
  }
  const svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${parts.join('')}<path class="line" d="${d.trim()}"/>${dots.join('')}${labels.join('')}</svg>`;
  return h('div', { class: 'chart-wrap', html: svg });
}

function shortDay(key) {
  try {
    return formatDate(key);
  } catch (error) {
    return key;
  }
}

/** items: [{ label, value, max, color, hint }] — горизонтальные полосы. */
export function barList({ items = [], format = (v, max) => `${v} / ${max}` } = {}) {
  return h(
    'div',
    { class: 'bar-list' },
    items.map((item) => {
      const ratio = item.max ? Math.max(0, Math.min(1, item.value / item.max)) : 0;
      return h(
        'div',
        { class: 'bar-list__row' },
        h('div', { class: 'bar-list__label' }, item.label),
        h('div', { class: 'progress', style: { flex: 1 } }, h('div', { class: 'progress__bar', style: { width: `${Math.round(ratio * 100)}%`, background: item.color || undefined } })),
        h('div', { class: 'bar-list__val mono small' }, format(item.value, item.max)),
      );
    }),
  );
}

/** cells: из stats.activityCells. */
export function heatmap(cells) {
  return h(
    'div',
    { class: 'heatmap-wrap' },
    h(
      'div',
      { class: 'heatmap' },
      cells.map((c) => h('div', { class: 'heatmap__cell', dataset: { l: c.future ? 0 : c.level }, style: c.future ? { opacity: 0.25 } : null, title: `${formatDate(c.key)}: ${Math.round(c.minutes)} мин, ${c.answered} отв.` })),
    ),
  );
}

/** Вертикальные столбики (например, XP по дням недели). values: [{label, value}] */
export function columnChart({ values = [], height = 120, color = 'var(--primary)' } = {}) {
  const max = Math.max(1, ...values.map((v) => v.value));
  return h(
    'div',
    { class: 'columns', style: { height: `${height}px` } },
    values.map((v) =>
      h(
        'div',
        { class: 'columns__col', title: `${v.label}: ${Math.round(v.value)}` },
        h('div', { class: 'columns__bar', style: { height: `${Math.round((v.value / max) * 100)}%`, background: color } }),
        h('div', { class: 'columns__label' }, v.label),
      ),
    ),
  );
}
