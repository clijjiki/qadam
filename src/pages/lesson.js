// Урок дня: математика (повторение → новая тема), затем информатика (повторение → новая тема).
// Прогресс шагов хранится в state.lessons[день]: можно уйти и вернуться к тому же шагу.

import { formatMinutes, h, pluralize } from '../core/dom.js';
import { loadLocalTopic, loadLocalTopics, localTitle, subject, topicMeta } from '../core/content.js';
import { getState } from '../core/store.js';
import { completeLessonStep, recordPractice, recordTheory, startLesson } from '../core/actions.js';
import { badgeById } from '../core/badges.js';
import {
  LESSON_SUBJECTS,
  REVIEW_SIZE,
  forgottenTopicIds,
  lessonProgress,
  lessonSteps,
  newTopicFor,
  pickNewTopicQuestions,
  pickReviewQuestions,
  reviewWeight,
  studiedTopicsFor,
  weekTopicIds,
  weeklyTestToday,
} from '../core/lesson.js';
import { masteryOf } from '../core/mastery.js';
import { renderMarkdown } from '../core/markdown.js';
import { mountMath } from '../core/math.js';
import { dueIds } from '../core/srs.js';
import { formatDate, todayKey, weekdayLong } from '../core/time.js';
import { createPractice } from '../ui/quiz.js';
import { answerReview, scoreHero } from '../ui/quiz-review.js';
import { confirmDialog } from '../ui/modal.js';
import { toastBadges } from '../ui/toast.js';
import { subjectColor } from '../ui/components.js';
import { icon, subjectIcon } from '../ui/icons.js';
import { langSwitch, translationNote } from '../ui/lang-switch.js';

const STEPS = lessonSteps(LESSON_SUBJECTS);
const GOOD = 0.8;
const OK = 0.5;

let root = null;
let runner = null;
let today = todayKey();
// Шаг, к которому нужно вернуться после смены языка: страница при этом перерисовывается целиком.
let resumeStepId = null;

// ---------- данные ----------

const lessonRecord = () => getState().lessons?.[today] || null;
const stepIndex = (step) => STEPS.findIndex((s) => s.id === step.id);

function subjectName(id) {
  const meta = subject(id);
  return meta?.short || meta?.name || id;
}

function stepTitle(step) {
  return `${subjectName(step.subject)}: ${step.kind === 'review' ? 'повторение' : 'новая тема'}`;
}

function newTopicTitle(step) {
  const meta = topicMeta(lessonRecord()?.newTopics?.[step.subject]);
  return meta ? localTitle(getState(), meta) : null;
}

/** Первый вход за день: выбираем новые темы и фиксируем их до конца дня. */
function ensureLesson() {
  if (lessonRecord()) return;
  const state = getState();
  const newTopics = Object.fromEntries(LESSON_SUBJECTS.map((id) => [id, newTopicFor(state, id)?.id || null]));
  startLesson(today, newTopics);
}

function destroyRunner() {
  if (runner) runner.destroy();
  runner = null;
}

function show(...nodes) {
  destroyRunner();
  root.replaceChildren(...nodes.filter(Boolean));
  mountMath(root);
  window.scrollTo({ top: 0 });
}

// ---------- общие куски интерфейса ----------

function stepDetail(step, result) {
  if (result?.status === 'skipped') return result.reason || 'Пропущен';
  if (step.kind === 'review') return `${REVIEW_SIZE} задач по пройденным темам`;
  return newTopicTitle(step) || 'Новых тем пока нет';
}

function stepRow(step, index, current) {
  const result = lessonRecord()?.steps?.[step.id];
  const status = result ? 'done' : current?.id === step.id ? 'next' : 'todo';
  const score = result?.total ? h('span', { class: `badge ${result.correct / result.total >= GOOD ? 'badge--success' : 'badge--warn'}` }, `${result.correct}/${result.total}`) : null;
  return h(
    'li',
    { class: `lesson-step lesson-step--${status}`, style: { '--subj': subjectColor(step.subject) } },
    h('span', { class: 'lesson-step__num' }, result ? icon('check', { size: 16 }) : String(index + 1)),
    h('span', { class: 'lesson-step__main' }, h('span', { class: 'lesson-step__title' }, stepTitle(step)), h('span', { class: 'lesson-step__sub' }, stepDetail(step, result))),
    score,
  );
}

function stepList() {
  const { next } = lessonProgress(lessonRecord(), STEPS);
  return h('ol', { class: 'lesson-steps' }, STEPS.map((step, i) => stepRow(step, i, next)));
}

function dots(activeStep) {
  const steps = lessonRecord()?.steps || {};
  return h(
    'div',
    { class: 'lesson-dots', 'aria-hidden': 'true' },
    STEPS.map((s) => h('span', { class: ['lesson-dot', steps[s.id] ? 'is-done' : '', s.id === activeStep?.id ? 'is-active' : ''].filter(Boolean).join(' ') })),
  );
}

function stepHead(step, note, { back = true } = {}) {
  return h(
    'div',
    { class: 'lesson-head', style: { '--subj': subjectColor(step.subject) } },
    h('span', { class: 'lesson-head__ico' }, subjectIcon(step.subject, { size: 20 })),
    h(
      'div',
      { class: 'lesson-head__main' },
      h('div', { class: 'lesson-head__meta' }, `Шаг ${stepIndex(step) + 1} из ${STEPS.length}`, dots(step)),
      h('h1', { class: 'lesson-head__title' }, stepTitle(step)),
      note ? h('div', { class: 'muted small' }, note) : null,
    ),
    back ? h('button', { class: 'btn btn--ghost btn--sm', onClick: showOverview }, 'План урока') : null,
  );
}

function pageTop(title, sub) {
  return h('div', { class: 'row row--between' }, h('div', {}, h('h1', { style: { margin: 0, fontSize: '1.4rem' } }, title), sub ? h('div', { class: 'muted small' }, sub) : null), h('a', { class: 'btn btn--ghost btn--sm', href: '#/' }, 'Закрыть ✕'));
}

function note(text, tone = 'info') {
  return h('div', { class: `note note--${tone}` }, icon(tone === 'success' ? 'check' : 'spark', { size: 16 }), h('span', {}, text));
}

function loading(step) {
  show(stepHead(step), h('div', { class: 'card muted' }, 'Загружаем задачи…'));
}

function failed(step, error) {
  console.error('Шаг урока не загрузился:', error);
  show(stepHead(step), h('div', { class: 'card stack' }, h('b', {}, 'Не удалось загрузить задачи'), h('p', { class: 'muted' }, String(error?.message || error)), h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', onClick: () => runStep(step) }, 'Попробовать снова'), h('button', { class: 'btn', onClick: showOverview }, 'План урока'))));
}

// ---------- обзор и финиш ----------

function showOverview() {
  const progress = lessonProgress(lessonRecord(), STEPS);
  if (progress.finished) {
    showFinish();
    return;
  }
  const next = progress.next;
  const label = progress.done ? `Продолжить: ${stepTitle(next).toLowerCase()}` : 'Начать урок';
  show(
    pageTop('Урок дня', `${weekdayLong(today)}, ${formatDate(today)} · ${progress.done} из ${progress.total} шагов`),
    h(
      'section',
      { class: 'card stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Сначала повторяем то, что уже прошёл, чтобы не забылось, потом разбираем новую тему. Сначала математика, потом информатика.'),
      stepList(),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', onClick: () => runStep(next) }, icon('play', { size: 16 }), label), h('span', { class: 'muted small' }, `≈ ${formatMinutes(15 * (progress.total - progress.done))}`)),
    ),
  );
}

function extraLinks() {
  const state = getState();
  const weekly = weeklyTestToday(state, today);
  const links = [];
  if (weekly && !weekly.done) links.push({ icon: 'exam', title: 'Недельный тест', sub: `${pluralize(weekTopicIds(state, weekly.week).length, ['тема', 'темы', 'тем'])} недели — проверь, что не забыл`, href: `#/weekly?week=${weekly.week}` });
  links.push({ icon: 'cards', title: 'Английские слова', sub: '15 минут карточек', href: '#/english/words' });
  links.push({ icon: 'code', title: 'Тренажёр Python', sub: 'Пара задач руками', href: '#/python' });
  return h('div', { class: 'quick' }, links.map((l) => h('a', { class: 'quick__item', href: l.href }, h('span', { class: 'quick__ico' }, icon(l.icon, { size: 18 })), h('span', { class: 'quick__title' }, l.title), h('span', { class: 'quick__sub' }, l.sub))));
}

function showFinish() {
  const steps = Object.values(lessonRecord()?.steps || {});
  const correct = steps.reduce((s, x) => s + (x.correct || 0), 0);
  const total = steps.reduce((s, x) => s + (x.total || 0), 0);
  show(
    pageTop('Урок на сегодня пройден', `${weekdayLong(today)}, ${formatDate(today)}`),
    h('section', { class: 'card result-hero stack' }, h('div', { class: 'big' }, total ? `${correct}` : '✓', total ? h('small', {}, ` / ${total}`) : null), h('div', { class: 'muted' }, total ? 'верных ответов за урок' : 'Все шаги закрыты')),
    h('section', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Шаги урока'), stepList()),
    h('section', { class: 'stack', style: { gap: '10px' } }, h('h3', { style: { margin: 0 } }, 'Что ещё можно сегодня'), extraLinks()),
    h('div', { class: 'row' }, h('a', { class: 'btn btn--primary btn--lg', href: '#/' }, 'На главную')),
  );
}

// ---------- шаги ----------

function runStep(step) {
  if (!step) {
    showOverview();
    return;
  }
  if (step.kind === 'review') reviewStep(step);
  else newStep(step);
}

function continueLesson() {
  runStep(lessonProgress(lessonRecord(), STEPS).next);
}

function skipStep(step, text) {
  show(
    stepHead(step),
    h('div', { class: 'card stack' }, note(text), h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', onClick: () => { completeLessonStep(today, step.id, { status: 'skipped', reason: 'Пропущен — пока нечего делать' }); continueLesson(); } }, 'Дальше →'))),
  );
}

function runQuiz({ step, questions, topicsById, hint, onFinish }) {
  const container = h('div', {});
  show(stepHead(step, hint, { back: false }), container);
  const settings = getState().settings;
  runner = createPractice({
    container,
    questions,
    topicsById,
    shuffleOptions: settings.shuffleOptions,
    showTimer: settings.showTimer,
    onExit: async () => {
      const ok = await confirmDialog({ title: 'Прервать шаг?', text: 'Ответы этого шага не сохранятся — потом начнёшь его заново.', okLabel: 'Прервать', danger: true });
      if (ok) showOverview();
    },
    onFinish: (outcome) => {
      runner = null;
      onFinish(outcome);
    },
  });
}

function nextButton() {
  const { next } = lessonProgress(lessonRecord(), STEPS);
  const label = next ? `Дальше: ${stepTitle(next).toLowerCase()} →` : 'Завершить урок';
  return h('button', { class: 'btn btn--primary btn--lg', onClick: () => runStep(next) }, label);
}

function fixErrorsButton(step, outcome, topicsById) {
  const wrong = outcome.results.filter((r) => !r.score.isCorrect);
  if (!wrong.length) return null;
  const fix = () =>
    runQuiz({
      step,
      questions: wrong.map((r) => r.question),
      topicsById,
      hint: 'Исправляем ошибки — эти ответы не идут в статистику',
      onFinish: (again) => {
        const left = again.results.filter((r) => !r.score.isCorrect).length;
        show(stepHead(step), note(left ? `Исправлено ${again.results.length - left} из ${again.results.length}. Оставшиеся вернутся в повторении.` : 'Все ошибки исправлены!', left ? 'info' : 'success'), h('div', { class: 'row' }, nextButton()), h('h3', {}, 'Разбор'), answerReview(again.results, topicsById));
      },
    });
  return h('button', { class: 'btn btn--lg', onClick: fix }, `Исправить ошибки (${wrong.length})`);
}

function saveStepResult(step, outcome, topicId) {
  const recorded = recordPractice({ topicId, subject: step.subject, kind: topicId ? 'practice' : 'lesson', results: outcome.results, summary: outcome.summary, seconds: outcome.seconds });
  if (recorded?.badges?.length) toastBadges(recorded.badges, badgeById);
  completeLessonStep(today, step.id, { status: 'done', topicId: topicId || null, correct: outcome.summary.correct, total: outcome.summary.total });
  return recorded;
}

function xpStat(recorded) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, `+${recorded.xp}`), h('div', { class: 'stat__label' }, 'XP'));
}

// Повторение: задачи из тем предмета, которые уже решал.
async function reviewStep(step) {
  const state = getState();
  const exclude = [lessonRecord()?.newTopics?.[step.subject]].filter(Boolean);
  const metas = studiedTopicsFor(state, step.subject, exclude);
  if (!metas.length) {
    skipStep(step, `По предмету «${subjectName(step.subject)}» ты ещё не проходил тем — повторять пока нечего. Начнём сразу с новой темы.`);
    return;
  }
  loading(step);
  let topics;
  try {
    topics = await loadLocalTopics(state, metas.map((m) => m.id));
  } catch (error) {
    failed(step, error);
    return;
  }
  const forgotten = new Set(forgottenTopicIds(state.weekly));
  const pools = topics.map((t) => ({ questions: t.questions, weight: reviewWeight({ mastery: masteryOf(state, t.id), lastAt: state.topics[t.id]?.lastAt, forgotten: forgotten.has(t.id) }) }));
  const questions = pickReviewQuestions(pools, { due: new Set(dueIds(state.questions)) });
  if (!questions.length) {
    skipStep(step, 'В пройденных темах пока нет задач для повторения.');
    return;
  }
  const topicsById = Object.fromEntries(topics.map((t) => [t.id, t]));
  const names = topics.map((t) => t.title).join(' · ');
  runQuiz({
    step,
    questions,
    topicsById,
    hint: `Темы: ${names}`,
    onFinish: (outcome) => {
      const recorded = saveStepResult(step, outcome, null);
      const good = outcome.summary.accuracy >= GOOD;
      show(
        stepHead(step),
        scoreHero(outcome, [xpStat(recorded)]),
        note(good ? 'Отлично — пройденное держится.' : 'Задачи с ошибками вернутся в повторение, пока не решишь их верно.', good ? 'success' : 'info'),
        h('div', { class: 'row' }, nextButton(), fixErrorsButton(step, outcome, topicsById)),
        h('h3', {}, 'Разбор'),
        answerReview(outcome.results, topicsById),
      );
    },
  });
}

function theoryBody(topic) {
  if (!topic.theory.length) return h('p', { class: 'muted' }, 'Для этой темы пока нет конспекта — сразу к задачам.');
  return h('div', { class: 'prose' }, topic.theory.map((block) => h('div', { class: 'theory-block', html: renderMarkdown(block) })));
}

function cardsBody(topic) {
  if (!topic.cards.length) return null;
  return h(
    'div',
    { class: 'stack' },
    h('h3', { style: { margin: 0 } }, 'Проверь себя'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Нажми на карточку — увидишь ответ.'),
    h('div', { class: 'flip-list' }, topic.cards.map((card) => h('div', { class: 'flip', onClick: (e) => e.currentTarget.classList.toggle('open') }, h('div', { class: 'flip__front', html: renderMarkdown(card.front) }), h('div', { class: 'flip__back', html: renderMarkdown(card.back) })))),
  );
}

function showTheory(step, topic, { onNext, nextLabel }) {
  show(
    stepHead(step, 'Прочитай спокойно, разберись в примерах — потом задачи'),
    translationNote(topic),
    // У пройденного шага («Перечитать теорию») переключателя нет: смена языка перезапустила бы шаг.
    lessonRecord()?.steps?.[step.id] ? null : langSwitch({ withIcon: true, label: `Язык уроков: ${subjectName(step.subject)}`, subject: step.subject, onBeforeChange: () => { resumeStepId = step.id; } }),
    h('article', { class: 'card stack' }, h('h2', { style: { margin: 0 } }, topic.title), topic.summary ? h('p', { class: 'muted', style: { margin: 0 } }, topic.summary) : null, theoryBody(topic)),
    cardsBody(topic),
    h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', onClick: onNext }, nextLabel)),
  );
}

function newTopicAdvice(ratio) {
  if (ratio >= GOOD) return { text: 'Тема понята! Через день-два она придёт в повторении, чтобы закрепилась.', tone: 'success' };
  if (ratio >= OK) return { text: 'Неплохо. Посмотри разбор ошибок — завтра в повторении эта тема встретится чаще.', tone: 'info' };
  return { text: 'Тема далась тяжело — это нормально для первого раза. Перечитай теорию и исправь ошибки, это 5–10 минут.', tone: 'info' };
}

function showNewResult(step, topic, outcome, recorded) {
  const topicsById = { [topic.id]: topic };
  const advice = newTopicAdvice(outcome.summary.accuracy);
  const reread = outcome.summary.accuracy < GOOD ? h('button', { class: 'btn btn--lg', onClick: () => showTheory(step, topic, { onNext: () => showNewResult(step, topic, outcome, recorded), nextLabel: '← Вернуться к результату' }) }, 'Перечитать теорию') : null;
  show(
    stepHead(step, topic.title),
    scoreHero(outcome, [xpStat(recorded)]),
    note(advice.text, advice.tone),
    h('div', { class: 'row' }, nextButton(), fixErrorsButton(step, outcome, topicsById), reread),
    h('h3', {}, 'Разбор'),
    answerReview(outcome.results, topicsById),
  );
}

// Новая тема: теория → задачи от простых к сложным → разбор.
async function newStep(step) {
  const meta = topicMeta(lessonRecord()?.newTopics?.[step.subject]);
  if (!meta) {
    skipStep(step, `Все готовые темы по предмету «${subjectName(step.subject)}» уже пройдены. Новые появятся на сайте — а пока держим форму повторением.`);
    return;
  }
  loading(step);
  let topic;
  try {
    topic = await loadLocalTopic(getState(), meta.id);
  } catch (error) {
    failed(step, error);
    return;
  }
  if (topic.theory.length) recordTheory(meta.id);
  const questions = pickNewTopicQuestions(topic.questions);
  if (!questions.length) {
    showTheory(step, topic, { nextLabel: 'Тема прочитана →', onNext: () => { completeLessonStep(today, step.id, { status: 'done', topicId: meta.id, correct: 0, total: 0 }); continueLesson(); } });
    return;
  }
  const practice = () =>
    runQuiz({
      step,
      questions,
      topicsById: { [topic.id]: topic },
      hint: topic.title,
      onFinish: (outcome) => showNewResult(step, topic, outcome, saveStepResult(step, outcome, meta.id)),
    });
  showTheory(step, topic, { onNext: practice, nextLabel: `Понял — к задачам (${questions.length}) →` });
}

// ---------- страница ----------

export async function render({ query }) {
  today = todayKey();
  ensureLesson();
  root = h('div', { class: 'stack lesson' });
  const step = STEPS.find((s) => s.id === (query.step || resumeStepId));
  resumeStepId = null;
  if (step) runStep(step);
  else showOverview();
  return root;
}

export function unmount() {
  destroyRunner();
  root = null;
}
