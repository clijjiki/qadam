// Разбор после практики: список ответов с объяснениями и итоговая карточка с баллами.
// Используется практикой, уроком дня и недельным тестом.

import { formatDuration, h } from '../core/dom.js';
import { gradeLabel } from '../core/scoring.js';
import { renderExplanation, renderQuestionCard } from './quiz.js';

export function plainText(markdown) {
  const text = String(markdown || '').replace(/\$[^$]*\$/g, '[формула]').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

/** Раскрывающийся список ответов: ✓ / ½ / ✗ и объяснение к каждому. */
export function answerReview(results, topicsById) {
  return h(
    'div',
    { class: 'result-list' },
    results.map((r, i) => {
      const card = renderQuestionCard({ question: r.question, topic: topicsById[r.question.topicId], order: r.order, selected: Array.isArray(r.selected) ? r.selected : [], value: typeof r.selected === 'string' ? r.selected : '', revealed: true, score: r.score, showMeta: false, showContext: false });
      card.append(renderExplanation({ question: r.question, score: r.score, order: r.order }));
      return h('details', { class: `result-item ${r.score.isCorrect ? 'ok' : 'bad'}` }, h('summary', {}, `${i + 1}. ${r.score.isCorrect ? '✓' : r.score.isPartial ? '½' : '✗'} ${plainText(r.question.text)}`), card);
    }),
  );
}

/** Крупный итог: баллы, оценка, точность, время и дополнительные показатели (extra — массив узлов). */
export function scoreHero(outcome, extra = []) {
  const { summary, seconds } = outcome;
  const grade = gradeLabel(summary.ratio);
  return h(
    'div',
    { class: 'card result-hero stack' },
    h('div', { class: 'big' }, `${summary.points}`, h('small', {}, ` / ${summary.maxPoints}`)),
    h('div', { class: `badge badge--${grade.tone}` }, grade.label),
    h(
      'div',
      { class: 'row', style: { justifyContent: 'center', gap: '22px' } },
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, `${Math.round(summary.accuracy * 100)}%`), h('div', { class: 'stat__label' }, 'точность')),
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, formatDuration(seconds)), h('div', { class: 'stat__label' }, 'время')),
      ...extra,
    ),
  );
}
