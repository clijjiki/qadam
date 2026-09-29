// Недельный тест: задачи по всем темам, пройденным за неделю, — чтобы увидеть, что помнишь, а что забыл.
// Итог по каждой теме хранится в state.weekly[понедельник недели]; забытые темы чаще идут в повторение урока.

import { h, pluralize } from '../core/dom.js';
import { langOf, loadTopics, topicMeta, topicTitle } from '../core/content.js';
import { getState } from '../core/store.js';
import { recordPractice, recordWeeklyTest } from '../core/actions.js';
import { badgeById } from '../core/badges.js';
import { breakdownByTopic, pickWeeklyQuestions, topicVerdict, weekTopicIds, weeklyQuota, weeklyTestToday } from '../core/lesson.js';
import { mountMath } from '../core/math.js';
import { addDaysKey, formatDate, todayKey, weekStartKey } from '../core/time.js';
import { createPractice } from '../ui/quiz.js';
import { answerReview, scoreHero } from '../ui/quiz-review.js';
import { confirmDialog } from '../ui/modal.js';
import { toastBadges } from '../ui/toast.js';
import { subjectBadge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const HISTORY_LIMIT = 8;
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

let root = null;
let runner = null;

function isWeekKey(value) {
  return WEEK_RE.test(String(value || '')) && weekStartKey(value) === value;
}

function weekLabel(week) {
  return `${formatDate(week)} – ${formatDate(addDaysKey(week, 6))}`;
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

function pageTop(week) {
  return h('div', { class: 'row row--between' }, h('div', {}, h('h1', { style: { margin: 0, fontSize: '1.4rem' } }, 'Недельный тест'), h('div', { class: 'muted small' }, `Неделя ${weekLabel(week)}`)), h('a', { class: 'btn btn--ghost btn--sm', href: '#/' }, 'Закрыть ✕'));
}

function percent(correct, total) {
  return total ? Math.round((correct / total) * 100) : 0;
}

/** Таблица «тема → результат → вердикт», сначала самые забытые. */
function verdictTable(breakdown) {
  const lang = langOf(getState());
  const rows = Object.entries(breakdown || {})
    .map(([id, stats]) => ({ id, stats, meta: topicMeta(id), verdict: topicVerdict(stats) }))
    .sort((a, b) => a.stats.correct / (a.stats.total || 1) - b.stats.correct / (b.stats.total || 1));
  return h(
    'div',
    { class: 'verdicts' },
    rows.map(({ id, stats, meta, verdict }) =>
      h(
        'a',
        { class: `verdict verdict--${verdict.key}`, href: `#/topic/${id}` },
        h('span', { class: 'verdict__main' }, h('span', { class: 'verdict__title' }, meta ? topicTitle(meta, lang) : id), meta ? subjectBadge(meta.subject) : null),
        h('span', { class: 'verdict__score' }, `${stats.correct}/${stats.total}`),
        h('span', { class: `badge badge--${verdict.tone}` }, verdict.label),
      ),
    ),
  );
}

function forgottenCount(breakdown) {
  return Object.values(breakdown || {}).filter((stats) => topicVerdict(stats).key === 'forgot').length;
}

function history(currentWeek) {
  const entries = Object.entries(getState().weekly || {})
    .filter(([week]) => week !== currentWeek)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, HISTORY_LIMIT);
  if (!entries.length) return null;
  return h(
    'section',
    { class: 'card stack' },
    h('h3', { style: { margin: 0 } }, 'Прошлые недели'),
    h(
      'div',
      { class: 'verdicts' },
      entries.map(([week, entry]) => {
        const forgot = forgottenCount(entry.topics);
        return h(
          'a',
          { class: 'verdict', href: `#/weekly?week=${week}` },
          h('span', { class: 'verdict__main' }, h('span', { class: 'verdict__title' }, weekLabel(week))),
          h('span', { class: 'verdict__score' }, `${percent(entry.correct, entry.total)}%`),
          h('span', { class: `badge ${forgot ? 'badge--danger' : 'badge--success'}` }, forgot ? `забыто: ${pluralize(forgot, ['тема', 'темы', 'тем'])}` : 'всё помнишь'),
        );
      }),
    ),
  );
}

function weekSwitch(week) {
  const current = weekStartKey(todayKey());
  const prev = addDaysKey(week, -7);
  return h(
    'div',
    { class: 'row' },
    h('a', { class: 'btn btn--sm', href: `#/weekly?week=${prev}` }, '← Прошлая неделя'),
    week !== current ? h('a', { class: 'btn btn--sm', href: `#/weekly?week=${current}` }, 'Эта неделя') : null,
  );
}

function topicList(ids) {
  const lang = langOf(getState());
  return h(
    'ul',
    { class: 'weekly-topics' },
    ids.map((id) => {
      const meta = topicMeta(id);
      return h('li', {}, meta ? subjectBadge(meta.subject) : null, h('span', {}, meta ? topicTitle(meta, lang) : id));
    }),
  );
}

function showIntro(week) {
  const state = getState();
  const ids = weekTopicIds(state, week);
  const done = state.weekly?.[week];
  const approx = ids.length * weeklyQuota(ids.length);
  if (!ids.length && !done) {
    show(
      pageTop(week),
      h('div', { class: 'card stack' }, h('b', {}, 'На этой неделе ты ещё не проходил новых тем'), h('p', { class: 'muted', style: { margin: 0 } }, 'Проходи урок дня: каждая новая тема попадает в недельный тест. В субботу или воскресенье проверишь, что запомнил.'), h('div', { class: 'row' }, h('a', { class: 'btn btn--primary', href: '#/lesson' }, 'К уроку дня'))),
      weekSwitch(week),
      history(week),
    );
    return;
  }
  const startButton = ids.length ? h('button', { class: `btn btn--lg ${done ? '' : 'btn--primary'}`.trim(), onClick: () => startTest(week, ids) }, icon('play', { size: 16 }), done ? 'Пройти ещё раз' : 'Начать тест') : null;
  show(
    pageTop(week),
    done
      ? h('section', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('h3', { style: { margin: 0 } }, 'Результат'), h('span', { class: 'badge badge--primary' }, `${done.correct}/${done.total} · ${percent(done.correct, done.total)}%`)), verdictTable(done.topics))
      : null,
    ids.length
      ? h(
          'section',
          { class: 'card stack' },
          h('p', { class: 'muted', style: { margin: 0 } }, `Около ${pluralize(approx, ['задачи', 'задач', 'задач'])} по темам, которые ты проходил на этой неделе. Теорию заранее не открывай — так честнее видно, что осталось в голове.`),
          topicList(ids),
          h('div', { class: 'row' }, startButton),
        )
      : null,
    weekSwitch(week),
    history(week),
  );
}

async function startTest(week, ids) {
  show(pageTop(week), h('div', { class: 'card muted' }, 'Собираем задачи…'));
  let topics;
  try {
    topics = await loadTopics(ids, langOf(getState()));
  } catch (error) {
    console.error('Недельный тест не загрузился:', error);
    show(pageTop(week), h('div', { class: 'card stack' }, h('b', {}, 'Не удалось загрузить задачи'), h('p', { class: 'muted' }, String(error?.message || error)), h('button', { class: 'btn btn--primary', onClick: () => startTest(week, ids) }, 'Попробовать снова')));
    return;
  }
  const questions = pickWeeklyQuestions(topics.map((t) => ({ questions: t.questions })));
  const topicsById = Object.fromEntries(topics.map((t) => [t.id, t]));
  const container = h('div', {});
  show(h('div', {}, h('h1', { style: { margin: 0, fontSize: '1.3rem' } }, 'Недельный тест'), h('div', { class: 'muted small' }, `${pluralize(topics.length, ['тема', 'темы', 'тем'])} · неделя ${weekLabel(week)}`)), container);
  const settings = getState().settings;
  runner = createPractice({
    container,
    questions,
    topicsById,
    shuffleOptions: settings.shuffleOptions,
    showTimer: settings.showTimer,
    onExit: async () => {
      const ok = await confirmDialog({ title: 'Выйти из теста?', text: 'Ответы не сохранятся — тест можно будет начать заново.', okLabel: 'Выйти', danger: true });
      if (ok) showIntro(week);
    },
    onFinish: (outcome) => {
      runner = null;
      finishTest(week, outcome, topicsById);
    },
  });
}

function finishTest(week, outcome, topicsById) {
  const recorded = recordPractice({ topicId: null, subject: null, kind: 'weekly', results: outcome.results, summary: outcome.summary, seconds: outcome.seconds });
  if (recorded?.badges?.length) toastBadges(recorded.badges, badgeById);
  const breakdown = breakdownByTopic(outcome.results);
  recordWeeklyTest(week, { topics: breakdown, summary: outcome.summary, seconds: outcome.seconds });
  const forgot = forgottenCount(breakdown);
  const shaky = Object.values(breakdown).filter((stats) => topicVerdict(stats).key === 'shaky').length;
  const message = forgot || shaky
    ? `Забытые темы (${forgot + shaky}) будут чаще попадаться в повторении урока. Можно открыть тему и перечитать теорию прямо сейчас.`
    : 'Всё, что прошёл за неделю, ты помнишь. Так держать!';
  show(
    pageTop(week),
    scoreHero(outcome, [h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, `+${recorded.xp}`), h('div', { class: 'stat__label' }, 'XP'))]),
    h('div', { class: `note ${forgot || shaky ? '' : 'note--success'}`.trim() }, icon(forgot || shaky ? 'repeat' : 'check', { size: 16 }), h('span', {}, message)),
    h('section', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'По темам'), verdictTable(breakdown)),
    h('div', { class: 'row' }, h('a', { class: 'btn btn--primary btn--lg', href: '#/' }, 'На главную'), h('button', { class: 'btn btn--lg', onClick: () => showIntro(week) }, 'К тесту недели')),
    h('h3', {}, 'Разбор'),
    answerReview(outcome.results, topicsById),
  );
}

export async function render({ query }) {
  const state = getState();
  const pending = weeklyTestToday(state, todayKey());
  const week = isWeekKey(query.week) ? query.week : pending?.week || weekStartKey(todayKey());
  root = h('div', { class: 'stack weekly' });
  showIntro(week);
  return root;
}

export function unmount() {
  destroyRunner();
  root = null;
}
