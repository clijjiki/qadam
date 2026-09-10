// Статистика: сводка, активность, точность, пробники, прогноз по предметам, таблица тем, бейджи.

import { h, formatMinutes, pluralize } from '../core/dom.js';
import { ieltsSubject, topicWeight, topicsOf, ubtSubjects } from '../core/content.js';
import { ieltsReadiness, masteryLevel, masteryOf, overallReadiness } from '../core/mastery.js';
import { accuracySeries, activityCells, examSeries, levelInfo, streakInfo } from '../core/stats.js';
import { addDaysKey, formatDate, todayKey, weekdayShort } from '../core/time.js';
import { BADGES } from '../core/badges.js';
import { emptyState, pageHead, progressBar, statTile, subjectBadge, subjectColor } from '../ui/components.js';
import { barList, columnChart, heatmap, lineChart } from '../ui/charts.js';

const SORTS = [
  { key: 'mastery', label: 'По мастерству ↑' },
  { key: 'title', label: 'По названию' },
  { key: 'weight', label: 'По весу' },
];

function cardTitle(text, extra) {
  return h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, text), extra || null);
}

function percent(correct, answered) {
  return answered ? `${Math.round((correct / answered) * 100)}%` : '—';
}

// ---------- 1. Сводка ----------

function totalsOf(state) {
  const days = Object.values(state.daily || {});
  return days.reduce(
    (acc, d) => ({ minutes: acc.minutes + (d.minutes || 0), answered: acc.answered + (d.answered || 0), correct: acc.correct + (d.correct || 0) }),
    { minutes: 0, answered: 0, correct: 0 },
  );
}

function summaryGrid(state) {
  const totals = totalsOf(state);
  const streak = streakInfo(state);
  const level = levelInfo(state.xp || 0);
  const tiles = [
    statTile({ value: formatMinutes(totals.minutes), label: 'минут всего' }),
    statTile({ value: String(totals.answered), label: 'ответов' }),
    statTile({ value: percent(totals.correct, totals.answered), label: 'точность' }),
    statTile({ value: `${state.xp || 0} XP`, label: `ур. ${level.level} · ${level.title}` }),
    statTile({ value: `${streak.current} / ${streak.best}`, label: 'серия: сейчас / лучшая', tone: streak.current ? 'success' : undefined }),
    statTile({ value: String((state.exams || []).length), label: 'пробников' }),
  ];
  return h('div', { class: 'grid grid--3' }, tiles.map((tile) => h('div', { class: 'card' }, tile)));
}

// ---------- 2. Активность ----------

function heatLegend() {
  const cells = [0, 1, 2, 3, 4].map((l) => h('i', { class: 'heatmap__cell', dataset: { l } }));
  return h('div', { class: 'heat-legend' }, h('span', {}, 'Меньше'), cells, h('span', {}, 'Больше'));
}

function weekdayColumns(state) {
  const today = todayKey();
  const values = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(today, i - 6);
    return { label: weekdayShort(key), value: state.daily?.[key]?.minutes || 0 };
  });
  return columnChart({ values, height: 110 });
}

function activityCard(state) {
  return h(
    'div',
    { class: 'card stack' },
    cardTitle('Активность', h('span', { class: 'muted small' }, '16 недель')),
    heatmap(activityCells(state, 16)),
    heatLegend(),
    h('div', { class: 'muted small' }, 'Минуты за последние 7 дней'),
    weekdayColumns(state),
  );
}

// ---------- 3. Точность ----------

function accuracyCard(state) {
  const raw = accuracySeries(state, 30);
  const hasAnswers = raw.some((p) => p.answered > 0);
  const series = raw.map((p) => ({ key: p.key, value: p.value === null ? null : Math.round(p.value * 100) }));
  return h(
    'div',
    { class: 'card stack' },
    cardTitle('Точность за 30 дней'),
    hasAnswers
      ? lineChart({ series, max: 100, unit: '%' })
      : emptyState({ icon: '🎯', title: 'Пока нет ответов', sub: 'Реши несколько вопросов — и здесь появится график точности.', action: { label: 'Начать практику', href: '#/ubt' } }),
  );
}

// ---------- 4. Пробники ----------

function examsCard(state) {
  const series = examSeries(state).map((e) => ({ key: e.key, value: e.value, label: `${formatDate(e.key)} (${e.mode === 'full' ? 'полный' : 'мини'})` }));
  const body =
    series.length >= 2
      ? lineChart({ series, max: 140, height: 170 })
      : h(
          'div',
          { class: 'alert alert--info' },
          series.length === 1 ? 'Пройди ещё один пробник — и появится график динамики. ' : 'График появится после двух пробников. Первый мини-пробник займёт 45 минут. ',
          h('a', { href: '#/exam' }, 'К пробникам →'),
        );
  return h('div', { class: 'card stack' }, cardTitle('Пробники', h('span', { class: 'muted small' }, 'баллы из 140')), body);
}

// ---------- 5. Прогноз ----------

function bandText(value) {
  return value === null || value === undefined ? '—' : value.toFixed(1);
}

function ieltsLine(state) {
  const ielts = ieltsReadiness(state, ieltsSubject());
  if (!ielts) return null;
  const b = ielts.bands;
  const parts = [`Listening ${bandText(b.listening)}`, `Reading ${bandText(b.reading)}`, `Writing ${bandText(b.writing)}`, `Speaking ${bandText(b.speaking)}`];
  return h(
    'div',
    { class: 'row row--between', style: { flexWrap: 'wrap', gap: '6px' } },
    h('div', { class: 'small' }, h('b', {}, '🇬🇧 IELTS: '), ielts.overall ? `≈ ${ielts.overall.toFixed(1)} · ` : '', parts.join(' · ')),
    ielts.overall ? null : h('a', { class: 'small', href: '#/ielts' }, 'Пройти урок IELTS →'),
  );
}

function forecastCard(state) {
  const readiness = overallReadiness(state);
  const items = readiness.perSubject.map((r) => {
    const meta = ubtSubjects().find((s) => s.id === r.subjectId);
    return { label: meta?.short || meta?.name || r.subjectId, value: Math.round(r.predicted), max: r.maxPoints, color: subjectColor(r.subjectId) };
  });
  return h(
    'div',
    { class: 'card stack' },
    cardTitle('Прогноз по предметам', h('span', { class: 'badge badge--primary' }, `${readiness.predicted} / ${readiness.max}`)),
    barList({ items }),
    h('div', { class: 'muted small' }, `Освоено ${readiness.mastered} из ${readiness.topicsTotal} тем · начато ${readiness.studied}`),
    ieltsLine(state),
  );
}

// ---------- 6. Темы ----------

function collectTopics(state) {
  const subjectsList = [...ubtSubjects(), ieltsSubject()].filter(Boolean);
  return subjectsList.flatMap((s) =>
    topicsOf(s.id, { kind: 'lesson' }).map((meta) => ({ meta, mastery: masteryOf(state, meta.id), stats: state.topics?.[meta.id] || null, weight: topicWeight(meta) })),
  );
}

function sortRows(rows, sortKey) {
  const copy = [...rows];
  if (sortKey === 'title') return copy.sort((a, b) => a.meta.title.localeCompare(b.meta.title, 'ru'));
  if (sortKey === 'weight') return copy.sort((a, b) => b.weight - a.weight || a.mastery - b.mastery);
  return copy.sort((a, b) => a.mastery - b.mastery || b.weight - a.weight);
}

function topicRow(row, index) {
  const level = masteryLevel(row.mastery);
  const answered = row.stats?.answered || 0;
  const color = subjectColor(row.meta.subject);
  return h(
    'tr',
    {},
    h('td', { class: 'muted' }, String(index + 1)),
    h('td', {}, h('a', { href: `#/topic/${row.meta.id}` }, row.meta.title)),
    h('td', {}, subjectBadge(row.meta.subject)),
    h('td', {}, h('div', { class: 'row', style: { gap: '8px' } }, progressBar(row.mastery, { color }), h('span', { class: 'nowrap small' }, `${Math.round(row.mastery * 100)}%`))),
    h('td', { class: 'right' }, String(answered)),
    h('td', { class: 'right' }, percent(row.stats?.correct || 0, answered)),
    h('td', { class: 'nowrap' }, row.stats?.lastAt ? formatDate(row.stats.lastAt) : '—'),
    h('td', {}, h('span', { class: level.tone === 'muted' ? 'badge' : `badge badge--${level.tone}` }, level.label)),
  );
}

function topicTable(rows) {
  if (!rows.length) {
    return emptyState({ icon: '📚', title: 'Тем не найдено', sub: 'Для этого фильтра пока нет тем в контенте.', action: { label: 'Все предметы', href: '#/ubt' } });
  }
  const head = ['№', 'Тема', 'Предмет', 'Мастерство', 'Отв.', 'Точн.', 'Был', 'Статус'].map((t) => h('th', {}, t));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'topic-table' }, h('thead', {}, h('tr', {}, head)), h('tbody', {}, rows.map(topicRow))));
}

function chip(label, active, onClick) {
  return h('button', { type: 'button', class: active ? 'chip active' : 'chip', onClick }, label);
}

function subjectChips(filter, apply) {
  const subjectsList = [...ubtSubjects(), ieltsSubject()].filter(Boolean);
  return h(
    'div',
    { class: 'chips' },
    chip('Все', filter.subject === 'all', () => apply({ subject: 'all' })),
    subjectsList.map((s) => chip(s.short || s.name, filter.subject === s.id, () => apply({ subject: s.id }))),
  );
}

function sortChips(filter, apply) {
  return h('div', { class: 'chips' }, SORTS.map((s) => chip(s.label, filter.sort === s.key, () => apply({ sort: s.key }))));
}

function topicsCard(state, query) {
  let rows = [];
  try {
    rows = collectTopics(state);
  } catch (error) {
    console.error('Не удалось собрать список тем:', error);
    return h('div', { class: 'card' }, h('div', { class: 'alert alert--danger' }, 'Не удалось загрузить список тем. Обнови страницу.'));
  }
  let filter = { subject: query.subject || 'all', sort: SORTS.some((s) => s.key === query.sort) ? query.sort : 'mastery' };
  const filtersBox = h('div', { class: 'filters', style: { flexDirection: 'column', alignItems: 'flex-start' } });
  const tableBox = h('div', {});
  const draw = () => {
    const visible = sortRows(filter.subject === 'all' ? rows : rows.filter((r) => r.meta.subject === filter.subject), filter.sort);
    filtersBox.replaceChildren(subjectChips(filter, apply), sortChips(filter, apply));
    tableBox.replaceChildren(topicTable(visible));
  };
  function apply(patch) {
    filter = { ...filter, ...patch };
    draw();
  }
  draw();
  return h('div', { class: 'card stack' }, cardTitle('Темы', h('span', { class: 'muted small' }, pluralize(rows.length, ['тема', 'темы', 'тем']))), filtersBox, tableBox);
}

// ---------- 7. Бейджи ----------

function badgesCard(state) {
  const owned = new Set(state.badges || []);
  const tiles = BADGES.map((b) =>
    h(
      'div',
      { class: owned.has(b.id) ? 'badge-tile' : 'badge-tile locked', title: b.desc },
      h('div', { class: 'badge-tile__ico' }, b.icon),
      h('div', { class: 'badge-tile__name' }, b.name),
      h('div', { class: 'muted', style: { fontSize: '.72rem', marginTop: '2px' } }, b.desc),
    ),
  );
  return h('div', { class: 'card stack' }, cardTitle('Бейджи', h('span', { class: 'badge badge--primary' }, `${owned.size} / ${BADGES.length}`)), h('div', { class: 'badge-grid' }, tiles));
}

// ---------- Страница ----------

export async function render({ state, query = {} }) {
  return h(
    'div',
    { class: 'stack', style: { gap: '18px' } },
    pageHead({ title: 'Статистика', sub: 'Как идёт подготовка: время, точность, прогноз и слабые темы.' }),
    summaryGrid(state),
    h('div', { class: 'grid grid--2' }, activityCard(state), accuracyCard(state)),
    h('div', { class: 'grid grid--2' }, examsCard(state), forecastCard(state)),
    topicsCard(state, query),
    badgesCard(state),
  );
}
