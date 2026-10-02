// Английский с нуля: план на сегодня, этапы пути A0 → C1 и уроки грамматики.

import { h, replaceChildren } from '../../core/dom.js';
import { localTitle, topicsOf } from '../../core/content.js';
import { getState } from '../../core/store.js';
import { MASTERED_THRESHOLD, masteryOf } from '../../core/mastery.js';
import { dueIds } from '../../core/srs.js';
import { toDayKey, todayKey } from '../../core/time.js';
import { ENGLISH_STAGES, activeStageId, stageProgress, wordsLearned } from '../../core/english.js';
import { bumpEnglishCounter, setEnglishCheck } from '../../core/actions.js';
import { pageHead, progressBar } from '../../ui/components.js';
import { icon } from '../../ui/icons.js';

export const SENTENCES_PER_DAY = 5;
const EXTRA_URL = 'https://www.youtube.com/results?search_query=Extra+English+episode';

/** Всё, что считает сайт: выученные слова, пройденная грамматика, очередь повторения. */
export function englishMetrics(state) {
  const sets = topicsOf('english', { kind: 'vocab' }).map((t) => t.id);
  const lessons = topicsOf('english', { kind: 'lesson' });
  const setIds = new Set(sets);
  return {
    sets,
    lessons,
    wordsLearned: wordsLearned(state.vocab, sets),
    grammarDone: lessons.filter((t) => masteryOf(state, t.id) >= MASTERED_THRESHOLD).length,
    dueWords: dueIds(state.vocab).filter((key) => setIds.has(key.split(':')[0])).length,
  };
}

function todayCard(state, metrics) {
  const sentencesToday = Number(state.english?.sentences?.[todayKey()]) || 0;
  const nextLesson = metrics.lessons.find((t) => masteryOf(state, t.id) < MASTERED_THRESHOLD);
  const wordsDone = (state.sessions || []).some((s) => s.kind === 'vocab' && s.subject === 'english' && toDayKey(new Date(s.at)) === todayKey());
  const row = (done, title, sub, action) =>
    h('div', { class: `list-item${done ? ' done' : ''}` }, h('span', { class: 'list-item__num' }, done ? icon('check', { size: 16 }) : ''), h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, title), h('div', { class: 'list-item__sub' }, sub)), action);
  return h(
    'div',
    { class: 'card stack' },
    h('h3', { style: { margin: 0 } }, 'Сегодня · около 30 минут'),
    h(
      'div',
      { class: 'list' },
      row(wordsDone, metrics.dueWords ? `Повторить слова: ${metrics.dueWords}` : 'Новые слова: 15', '15 минут, карточки с повторением', h('a', { class: 'btn btn--sm btn--primary', href: metrics.dueWords ? '#/english/words?mode=review' : '#/english/words' }, 'Открыть')),
      row(sentencesToday >= SENTENCES_PER_DAY, `Составить ${SENTENCES_PER_DAY} предложений`, `Из выученных слов · сегодня ${sentencesToday}`, h('a', { class: 'btn btn--sm', href: '#/english/sentences' }, 'Писать')),
      nextLesson ? row(false, `Грамматика: ${localTitle(state, nextLesson)}`, '10 минут теории + практика', h('a', { class: 'btn btn--sm', href: `#/topic/${nextLesson.id}` }, 'Урок')) : null,
      row(false, 'Серия Extra English — вместо отдыха в телефоне', 'Не входит в учебное время. Посмотрел — отметь в «Этапе 1»', h('a', { class: 'btn btn--sm btn--ghost', href: EXTRA_URL, target: '_blank', rel: 'noopener' }, 'YouTube')),
    ),
  );
}

function goalAction(goal, rerender) {
  if (goal.kind === 'counter') {
    return h(
      'div',
      { class: 'row', style: { gap: '6px' } },
      h('button', { class: 'btn btn--sm btn--ghost', 'aria-label': 'Отменить одну', disabled: goal.value <= 0, onClick: () => { bumpEnglishCounter(goal.id, -1); rerender(); } }, '−1'),
      h('button', { class: 'btn btn--sm btn--primary', onClick: () => { bumpEnglishCounter(goal.id, 1); rerender(); } }, '+1'),
    );
  }
  if (goal.kind === 'check') {
    return h('input', { type: 'checkbox', checked: goal.done, 'aria-label': goal.title, onChange: (event) => { setEnglishCheck(goal.id, event.target.checked); rerender(); } });
  }
  return goal.href ? h('a', { class: 'btn btn--sm', href: goal.href }, 'Открыть') : null;
}

function goalRow(goal, rerender) {
  const counted = goal.kind !== 'check';
  return h(
    'div',
    { class: 'stack', style: { gap: '6px', padding: '10px 0', borderTop: '1px solid var(--line)' } },
    h('div', { class: 'row row--between', style: { gap: '12px' } }, h('div', {}, h('b', { style: goal.done ? { color: 'var(--success)' } : null }, goal.done ? '✓ ' : '', goal.title), goal.hint ? h('div', { class: 'muted small' }, goal.hint) : null), goalAction(goal, rerender)),
    counted ? h('div', { class: 'row', style: { gap: '10px' } }, h('div', { style: { flex: 1 } }, progressBar(goal.ratio, { color: 'var(--c-ielts)' })), h('span', { class: 'muted small nowrap' }, `${Math.min(goal.value, goal.target)} / ${goal.target} ${goal.unit || ''}`)) : null,
  );
}

function stageCard(progress, isActive, rerender) {
  const head = h('div', { class: 'row row--between' }, h('div', {}, h('h3', { style: { margin: 0 } }, progress.title), h('div', { class: 'muted small' }, progress.sub)), h('span', { class: `badge ${progress.done ? 'badge--success' : isActive ? 'badge--primary' : ''}` }, progress.done ? 'пройден' : `${Math.round(progress.ratio * 100)}%`));
  const body = progress.goals.map((goal) => goalRow(goal, rerender));
  if (isActive) return h('section', { class: 'card stack' }, head, body);
  return h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer' } }, head), body);
}

function grammarCard(state, metrics) {
  return h(
    'section',
    { class: 'card stack', id: 'grammar' },
    h('h3', { style: { margin: 0 } }, 'Грамматика этапа 1'),
    h(
      'div',
      { class: 'list' },
      metrics.lessons.map((t, i) => {
        const m = masteryOf(state, t.id);
        const done = m >= MASTERED_THRESHOLD;
        return h('a', { class: `list-item${done ? ' done' : ''}`, href: `#/topic/${t.id}` }, h('span', { class: 'list-item__num' }, done ? icon('check', { size: 16 }) : String(i + 1)), h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, localTitle(state, t)), h('div', { class: 'list-item__sub' }, `освоено ${Math.round(m * 100)}%`)));
      }),
    ),
  );
}

function build(root) {
  const state = getState();
  const metrics = englishMetrics(state);
  const activeId = activeStageId(state.english, metrics);
  const rerender = () => build(root);
  replaceChildren(
    root,
    pageHead({ title: 'Английский', sub: 'С нуля до свободного — по этапам. Сейчас главное: слова, три времени Simple и Extra English.' }),
    todayCard(state, metrics),
    ENGLISH_STAGES.map((stage) => stageCard(stageProgress(stage, state.english, metrics), stage.id === activeId, rerender)),
    grammarCard(state, metrics),
    h('p', { class: 'muted small' }, 'IELTS-раздел пока скрыт: к нему вернёмся с уровня B2. Он доступен по адресу ', h('a', { href: '#/ielts' }, '#/ielts'), '.'),
  );
  return root;
}

export async function render() {
  return build(h('div', { class: 'stack' }));
}

/** #/english?focus=grammar — из плана сразу к урокам грамматики. */
export function afterMount(view, { query = {} } = {}) {
  if (query.focus) view.querySelector(`#${CSS.escape(query.focus)}`)?.scrollIntoView();
}
