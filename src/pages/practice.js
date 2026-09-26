// Практика: тема / сложные / все вопросы, повторение ошибок (SRS), микс по предмету, слабые темы.
// После завершения — итоги, разбор и «исправить ошибки».

import { formatDuration, h, pluralize } from '../core/dom.js';
import { langOf, loadTopic, loadTopics, subject, topicMeta, topicsOf } from '../core/content.js';
import { getState } from '../core/store.js';
import { recordPractice } from '../core/actions.js';
import { badgeById } from '../core/badges.js';
import { masteryOf } from '../core/mastery.js';
import { nextTopics } from '../core/plan.js';
import { shuffle } from '../core/random.js';
import { gradeLabel } from '../core/scoring.js';
import { dueIds } from '../core/srs.js';
import { renderMarkdown } from '../core/markdown.js';
import { createPractice, renderExplanation, renderQuestionCard } from '../ui/quiz.js';
import { createPlayer } from '../ui/player.js';
import { confirmDialog } from '../ui/modal.js';
import { toast, toastBadges } from '../ui/toast.js';
import { emptyState, ring, subjectColor } from '../ui/components.js';

const DEFAULT_COUNT = 10;
const REVIEW_COUNT = 15;

let active = null;
let player = null;

function orderByDue(questions, state) {
  const due = new Set(dueIds(state.questions));
  const first = questions.filter((q) => due.has(q.id));
  const rest = shuffle(questions.filter((q) => !due.has(q.id)));
  return [...first, ...rest];
}

async function topicSession(topicId, mode, n, state) {
  const meta = topicMeta(topicId);
  if (!meta) return null;
  const topic = await loadTopic(topicId, langOf(state));
  const base = { meta, topic, topicId, subject: meta.subject, topicsById: { [topicId]: topic }, backHref: `#/topic/${topicId}`, kind: 'practice', shuffleOptions: state.settings.shuffleOptions };
  if (meta.skill === 'reading' || meta.skill === 'listening') {
    return { ...base, title: topic.title, subtitle: meta.skill === 'reading' ? 'IELTS Reading · отвечай по тексту' : 'IELTS Listening · слушай и отвечай', questions: topic.questions, shuffleOptions: false, layout: meta.skill };
  }
  const pool = mode === 'hard' ? topic.questions.filter((q) => q.type === 'multi' || q.difficulty >= 3) : topic.questions;
  const ordered = orderByDue(pool, state);
  const count = mode === 'all' ? ordered.length : Math.min(ordered.length, n || DEFAULT_COUNT);
  const subtitle = mode === 'hard' ? 'Сложные задания' : mode === 'all' ? 'Все вопросы темы' : 'Практика темы';
  return { ...base, title: topic.title, subtitle, questions: ordered.slice(0, count) };
}

async function reviewSession(state, n) {
  const ids = dueIds(state.questions).slice(0, n);
  const topicIds = [...new Set(ids.map((id) => id.split(':')[0]))].filter((id) => topicMeta(id));
  const topics = await loadTopics(topicIds, langOf(state));
  const topicsById = Object.fromEntries(topics.map((t) => [t.id, t]));
  const questions = ids.map((id) => topicsById[id.split(':')[0]]?.questions.find((q) => q.id === id)).filter(Boolean);
  return { title: 'Работа над ошибками', subtitle: 'Вопросы, в которых ты ошибался — пора закрыть их', questions, topicsById, kind: 'review', subject: null, topicId: null, backHref: '#/', shuffleOptions: state.settings.shuffleOptions };
}

async function mixedSession(topicsMeta, n, state, { title, subtitle, subjectId, backHref }) {
  const topics = await loadTopics(topicsMeta.map((t) => t.id), langOf(state));
  const topicsById = Object.fromEntries(topics.map((t) => [t.id, t]));
  const pool = shuffle(topics.flatMap((t) => t.questions.filter((q) => !q.context)));
  return { title, subtitle, questions: pool.slice(0, n), topicsById, kind: 'practice', subject: subjectId, topicId: null, backHref, shuffleOptions: state.settings.shuffleOptions };
}

async function buildSession({ params, query, state }) {
  const mode = query.mode || (params.topicId ? 'topic' : 'review');
  const n = Number(query.n) || 0;
  if (params.topicId) return topicSession(params.topicId, mode, n, state);
  if (mode === 'subject' && query.subject) {
    const subj = subject(query.subject);
    return mixedSession(topicsOf(query.subject, { kind: 'lesson' }), n || DEFAULT_COUNT, state, { title: `Микс: ${subj?.name || query.subject}`, subtitle: 'Случайные вопросы из всех тем предмета', subjectId: query.subject, backHref: `#/subject/${query.subject}` });
  }
  if (mode === 'topics' && query.ids) {
    const metas = String(query.ids).split(',').map((id) => topicMeta(id.trim())).filter((meta) => meta && meta.kind === 'lesson');
    return mixedSession(metas, n || DEFAULT_COUNT, state, { title: 'Микс по темам четверти', subtitle: 'Вопросы из выбранных тем — как перед БЖБ и ТЖБ', subjectId: metas[0]?.subject || null, backHref: '#/curriculum' });
  }
  if (mode === 'weak') return mixedSession(nextTopics(state, 3), n || DEFAULT_COUNT, state, { title: 'Слабые темы', subtitle: 'Вопросы из тем, где мастерство ниже всего', subjectId: null, backHref: '#/' });
  return reviewSession(state, n || REVIEW_COUNT);
}

function emptyView(session, query) {
  if (query.mode === 'review' || !query.mode) {
    return emptyState({ icon: '🎉', title: 'Нет вопросов к повторению', sub: 'Ошибок, которые пора повторить, сейчас нет. Пройди новую тему — и очередь наполнится.', action: { label: 'На главную', href: '#/' } });
  }
  return emptyState({ icon: '📭', title: 'Вопросов пока нет', sub: 'В этой теме ещё нет заданий такого типа.', action: { label: 'Назад', href: session?.backHref || '#/' } });
}

function header(session) {
  return h('div', { class: 'row row--between' }, h('div', {}, h('h1', { style: { margin: 0, fontSize: '1.3rem' } }, session.title), h('div', { class: 'muted small' }, session.subtitle)), h('a', { class: 'btn btn--ghost btn--sm', href: session.backHref }, 'Закрыть ✕'));
}

function passagePane(topic) {
  return h('div', { class: 'card split__passage prose' }, h('h3', {}, topic.title), h('div', { html: renderMarkdown(topic.passage) }));
}

function wrongList(results, topicsById) {
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

function plainText(markdown) {
  const text = String(markdown || '').replace(/\$[^$]*\$/g, '[формула]').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function resultHero(session, outcome, recorded) {
  const { summary, seconds } = outcome;
  const grade = gradeLabel(summary.ratio);
  const mastery = session.topicId ? masteryOf(getState(), session.topicId) : null;
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
      recorded ? h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, `+${recorded.xp}`), h('div', { class: 'stat__label' }, 'XP')) : null,
      mastery !== null ? h('div', { class: 'stat' }, ring({ value: mastery, size: 56, stroke: 6, color: subjectColor(session.subject) }), h('div', { class: 'stat__label' }, 'мастерство')) : null,
    ),
  );
}

function showResults(root, session, outcome, ctx) {
  const wrong = outcome.results.filter((r) => !r.score.isCorrect);
  const recorded = session.record === false ? null : recordPractice({ topicId: session.topicId, subject: session.subject, kind: session.kind, results: outcome.results, summary: outcome.summary, seconds: outcome.seconds });
  if (recorded?.badges?.length) toastBadges(recorded.badges, badgeById);
  const actions = h(
    'div',
    { class: 'row', style: { justifyContent: 'center' } },
    wrong.length ? h('button', { class: 'btn btn--primary btn--lg', onClick: () => runSession(root, { ...session, title: 'Исправляем ошибки', subtitle: `${pluralize(wrong.length, ['вопрос', 'вопроса', 'вопросов'])} — ещё раз`, questions: wrong.map((r) => r.question), record: false, layout: null }, ctx) }, `Исправить ошибки (${wrong.length})`) : null,
    h('button', { class: 'btn btn--lg', onClick: () => restart(root, ctx) }, 'Ещё раз'),
    h('a', { class: 'btn btn--lg', href: session.backHref }, session.topicId ? 'К теме' : 'Назад'),
    h('a', { class: 'btn btn--lg', href: '#/' }, 'На главную'),
  );
  const transcript = session.layout === 'listening' && session.topic?.transcript ? h('details', { class: 'card' }, h('summary', {}, 'Транскрипт'), h('div', { class: 'prose', style: { marginTop: '10px' }, html: renderMarkdown(session.topic.transcript) })) : null;
  root.replaceChildren(header(session), resultHero(session, outcome, recorded), actions, transcript, h('h3', {}, 'Разбор'), wrongList(outcome.results, session.topicsById));
  window.scrollTo({ top: 0 });
}

async function restart(root, ctx) {
  const session = await buildSession({ ...ctx, state: getState() });
  if (!session || !session.questions.length) {
    root.replaceChildren(emptyView(session, ctx.query));
    return;
  }
  runSession(root, session, ctx);
}

function runSession(root, session, ctx) {
  if (active) active.destroy();
  if (player) player.stop();
  const container = h('div', {});
  const exit = async () => {
    const ok = await confirmDialog({ title: 'Выйти из практики?', text: 'Ответы этой сессии не сохранятся.', okLabel: 'Выйти', danger: true });
    if (ok) ctx.navigate(session.backHref.replace(/^#/, ''));
  };
  const parts = [header(session)];
  if (session.layout === 'reading' && session.topic?.passage) {
    parts.push(h('div', { class: 'split' }, passagePane(session.topic), container));
  } else {
    if (session.layout === 'listening' && session.topic?.transcript) {
      player = createPlayer({ text: session.topic.transcript, label: session.topic.title });
      parts.push(player.element);
    }
    parts.push(container);
  }
  root.replaceChildren(...parts);
  active = createPractice({
    container,
    questions: session.questions,
    topicsById: session.topicsById,
    shuffleOptions: session.shuffleOptions,
    showTimer: getState().settings.showTimer,
    onExit: exit,
    onFinish: (outcome) => {
      active = null;
      if (player) player.stop();
      showResults(root, session, outcome, ctx);
    },
  });
  window.scrollTo({ top: 0 });
}

export async function render(ctx) {
  const session = await buildSession(ctx);
  if (!session || !session.questions.length) return emptyView(session, ctx.query);
  const root = h('div', { class: 'stack' });
  runSession(root, session, ctx);
  if (session.kind === 'review') toast('Отвечай спокойно: верный ответ отодвигает повтор, ошибка вернёт вопрос завтра.');
  return root;
}

export function unmount() {
  if (active) active.destroy();
  if (player) player.stop();
  active = null;
  player = null;
}
