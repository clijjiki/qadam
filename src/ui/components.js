// Переиспользуемые элементы интерфейса: кольца прогресса, полосы, карточки тем, заголовки страниц.

import { h, pluralize } from '../core/dom.js';
import { subject, topicWeight } from '../core/content.js';
import { masteryLevel, masteryOf } from '../core/mastery.js';
import { formatDate } from '../core/time.js';

export function subjectColor(subjectId) {
  return `var(--c-${subjectId}, var(--primary))`;
}

export function subjectBadge(subjectId) {
  const meta = subject(subjectId);
  return h('span', { class: 'badge badge--subject', style: { background: subjectColor(subjectId) } }, meta ? meta.short || meta.name : subjectId);
}

export function ring({ value = 0, size = 64, stroke = 7, color = 'var(--primary)', label, sub } = {}) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const half = size / 2;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="var(--bg-sunken)" stroke-width="${stroke}"/>
    <circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v)).toFixed(2)}" style="transition: stroke-dashoffset .6s var(--ease)"/>
  </svg>`;
  return h(
    'div',
    { class: 'ring', style: { width: `${size}px`, height: `${size}px` } },
    h('div', { html: svg }),
    h('div', { class: 'ring__val', style: { fontSize: `${Math.round(size / 4.2)}px` } }, label ?? `${Math.round(v * 100)}%`, sub ? h('small', {}, sub) : null),
  );
}

export function progressBar(value, { color, large = false } = {}) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return h('div', { class: large ? 'progress progress--lg' : 'progress' }, h('div', { class: 'progress__bar', style: { width: `${Math.round(v * 100)}%`, background: color || undefined } }));
}

export function masteryRow(mastery, { color } = {}) {
  const level = masteryLevel(mastery);
  return h('div', { class: 'mastery' }, progressBar(mastery, { color }), h('span', { class: `badge badge--${level.tone === 'muted' ? '' : level.tone}`.trim() }, level.label), h('span', { class: 'nowrap' }, `${Math.round(mastery * 100)}%`));
}

export function statTile({ value, label, delta, tone } = {}) {
  return h(
    'div',
    { class: 'stat' },
    h('div', { class: 'stat__val', style: tone ? { color: `var(--${tone})` } : null }, value),
    h('div', { class: 'stat__label' }, label),
    delta ? h('div', { class: `stat__delta ${delta.startsWith('-') ? 'down' : 'up'}` }, delta) : null,
  );
}

export function pageHead({ title, sub, crumbs = [], actions = [] } = {}) {
  return h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      {},
      crumbs.length ? h('div', { class: 'crumbs' }, crumbs.flatMap((c, i) => [i ? h('span', {}, '›') : null, c.href ? h('a', { href: c.href }, c.label) : h('span', {}, c.label)])) : null,
      h('h1', {}, title),
      sub ? h('p', {}, sub) : null,
    ),
    actions.length ? h('div', { class: 'row' }, actions) : null,
  );
}

export function emptyState({ icon = '📭', title, sub, action } = {}) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty__ico' }, icon),
    title ? h('h3', {}, title) : null,
    sub ? h('p', { class: 'muted' }, sub) : null,
    action ? h('a', { class: 'btn btn--primary', href: action.href }, action.label) : null,
  );
}

export function skeleton(lines = 3) {
  return h('div', { class: 'card stack skeleton', 'aria-busy': 'true' }, Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton__line', style: { width: `${90 - i * 15}%` } })));
}

export function linkButton(label, href, variant = '') {
  return h('a', { class: `btn ${variant}`.trim(), href }, label);
}

/** Карточка темы для списков предмета и дашборда. */
export function topicCard(topic, state, { index } = {}) {
  const mastery = masteryOf(state, topic.id);
  const stats = state.topics[topic.id];
  const color = subjectColor(topic.subject);
  const weight = topicWeight(topic);
  const subLine = [
    topic.minutes ? `≈ ${topic.minutes} мин` : null,
    weight ? `вес: ${weight}` : null,
    stats?.lastAt ? `был ${formatDate(stats.lastAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return h(
    'a',
    { class: 'card card--clickable topic-card', href: `#/topic/${topic.id}`, style: { '--card-accent': color } },
    h(
      'div',
      { class: 'topic-card__head' },
      h('div', { class: 'topic-card__num' }, index != null ? String(index + 1) : '•'),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'card__title' }, topic.title), h('div', { class: 'card__sub' }, subLine)),
    ),
    masteryRow(mastery, { color }),
    stats?.answered ? h('div', { class: 'small muted' }, `${pluralize(stats.answered, ['ответ', 'ответа', 'ответов'])}, точность ${Math.round((stats.correct / stats.answered) * 100)}%`) : null,
  );
}

export function keyHint(keys) {
  return h('span', { class: 'muted small' }, keys.flatMap((k, i) => [i ? ' ' : null, h('span', { class: 'kbd' }, k)]));
}
