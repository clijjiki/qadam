// Результат последнего пробника: баллы по секциям, слабые темы, разбор каждого вопроса.

import { formatDuration, h, pluralize } from '../core/dom.js';
import { topicMeta } from '../core/content.js';
import { buildExam, loadLastResult } from '../core/exam.js';
import { gradeLabel } from '../core/scoring.js';
import { formatDateTime } from '../core/time.js';
import { renderExplanation, renderQuestionCard } from '../ui/quiz.js';
import { emptyState, pageHead, subjectBadge } from '../ui/components.js';

async function questionIndex(detail) {
  try {
    const exam = await buildExam({ mode: detail.mode, seed: detail.seed });
    const map = new Map();
    for (const section of exam.sections) for (const q of section.questions) map.set(q.id, { question: q, topic: section.topicsById[q.topicId] });
    return map;
  } catch (error) {
    console.error('Не удалось восстановить вопросы пробника:', error);
    return new Map();
  }
}

function sectionTable(detail) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'exam-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Секция'), h('th', { class: 'right' }, 'Верно'), h('th', { class: 'right' }, 'Баллы'), h('th', { class: 'right' }, '%'))),
      h('tbody', {}, detail.sections.map((s) => h('tr', {}, h('td', {}, subjectBadge(s.subject), ' ', s.name), h('td', { class: 'right' }, `${s.correct} / ${s.total}`), h('td', { class: 'right' }, `${s.points} / ${s.max}`), h('td', { class: 'right' }, s.max ? `${Math.round((s.points / s.max) * 100)}%` : '—')))),
    ),
  );
}

function weakTopics(detail) {
  const byTopic = new Map();
  for (const section of detail.sections) {
    for (const item of section.items) {
      const prev = byTopic.get(item.topicId) || { points: 0, max: 0, count: 0 };
      byTopic.set(item.topicId, { points: prev.points + item.points, max: prev.max + item.max, count: prev.count + 1 });
    }
  }
  return [...byTopic.entries()]
    .map(([id, s]) => ({ id, ratio: s.max ? s.points / s.max : 0, count: s.count, meta: topicMeta(id) }))
    .filter((t) => t.meta && t.ratio < 0.7)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 6);
}

function reviewList(detail, index, onlyWrong) {
  const items = detail.sections.flatMap((s) => s.items.map((item) => ({ ...item, section: s })));
  const shown = onlyWrong ? items.filter((i) => !i.isCorrect) : items;
  if (!shown.length) return h('p', { class: 'muted' }, 'Ошибок нет — отличная работа!');
  return h(
    'div',
    { class: 'result-list' },
    shown.map((item, i) => {
      const entry = index.get(item.id);
      const title = `${i + 1}. ${item.isCorrect ? '✓' : item.points > 0 ? '½' : '✗'} ${item.section.short} · ${item.points}/${item.max}`;
      if (!entry) return h('div', { class: `result-item ${item.isCorrect ? 'ok' : 'bad'}` }, title, h('div', { class: 'muted small' }, 'Контент изменился — разбор недоступен.'));
      const order = entry.question.options.map((_, k) => k);
      const card = renderQuestionCard({ question: entry.question, topic: entry.topic, order, selected: Array.isArray(item.selected) ? item.selected : [], revealed: true, showMeta: false });
      card.append(renderExplanation({ question: entry.question, score: { isCorrect: item.isCorrect, isPartial: item.points > 0 && !item.isCorrect, points: item.points, max: item.max }, order }));
      return h('details', { class: `result-item ${item.isCorrect ? 'ok' : 'bad'}` }, h('summary', {}, title), card);
    }),
  );
}

export async function render() {
  const detail = loadLastResult();
  if (!detail) return emptyState({ icon: '📝', title: 'Результатов пока нет', sub: 'Пройди пробник — здесь появится разбор.', action: { label: 'К пробникам', href: '#/exam' } });
  const index = await questionIndex(detail);
  const grade = gradeLabel(detail.max ? detail.total / detail.max : 0);
  const weak = weakTopics(detail);
  const list = h('div', {});
  let onlyWrong = true;
  const filters = h('div', { class: 'filters' });
  const setFilter = (value) => {
    onlyWrong = value;
    filters.replaceChildren(h('button', { class: onlyWrong ? 'chip active' : 'chip', onClick: () => setFilter(true) }, 'Только ошибки'), h('button', { class: onlyWrong ? 'chip' : 'chip active', onClick: () => setFilter(false) }, 'Все вопросы'));
    list.replaceChildren(reviewList(detail, index, onlyWrong));
  };
  setFilter(true);
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: detail.mode === 'mini' ? 'Результат мини-пробника' : 'Результат пробного ЕНТ', sub: `${formatDateTime(detail.at)} · ${formatDuration(detail.seconds)}`, actions: [h('a', { class: 'btn', href: '#/exam' }, 'К пробникам'), h('a', { class: 'btn btn--primary', href: `#/exam/run?mode=${detail.mode}` }, 'Ещё пробник')] }),
    h('div', { class: 'card result-hero' }, h('div', { class: 'big' }, String(detail.total), h('small', {}, ` / ${detail.max}`)), h('div', { class: `badge badge--${grade.tone}`, style: { marginTop: '8px' } }, grade.label)),
    h('div', { class: 'grid grid--2' }, h('div', { class: 'card' }, h('h3', {}, 'По секциям'), sectionTable(detail)), h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Слабые темы этого пробника'), weak.length ? h('div', { class: 'list' }, weak.map((t) => h('a', { class: 'list-item', href: `#/topic/${t.id}` }, h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, t.meta.title), h('div', { class: 'list-item__sub' }, `${pluralize(t.count, ['вопрос', 'вопроса', 'вопросов'])} · ${Math.round(t.ratio * 100)}%`)), h('span', { class: 'badge badge--danger' }, 'учить')))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Провалов по темам нет.'))),
    h('h3', {}, 'Разбор'),
    filters,
    list,
  );
}
