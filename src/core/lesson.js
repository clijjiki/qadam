// Урок дня и недельный тест.
// Урок: по каждому предмету (сначала математика, потом информатика) — повторение пройденных тем (10 задач),
// затем новая тема: теория → задачи. Недельный тест — задачи по всем темам, пройденным за неделю,
// чтобы увидеть, что забылось. Функции выбора чистые: принимают данные и rng, их проверяет tests/run.js.

import { subject, topicMeta, topicsOf } from './content.js';
import { normalizeGrade, sortByCurriculum, usesCurriculum } from './curriculum.js';
import { MASTERED_THRESHOLD, masteryOf } from './mastery.js';
import { shuffle, weightedIndex } from './random.js';
import { addDaysKey, daysSince, fromDayKey, toDayKey, weekStartKey } from './time.js';

export const LESSON_SUBJECTS = ['math', 'informatics'];
export const REVIEW_SIZE = 10;
export const NEW_TOPIC_SIZE = 10;
export const WEEKLY_SIZE = 20;
export const WEEKLY_MIN_PER_TOPIC = 3;
export const WEEKLY_MAX_PER_TOPIC = 10;
/** Сколько дней хранить записи уроков — дальше они не нужны и только раздувают localStorage. */
export const LESSON_KEEP_DAYS = 60;

// Сессии, которые считаются «прошёл тему» для недельного теста: практика темы (в том числе новая тема урока).
const STUDY_KINDS = new Set(['practice']);
// Предметы, темы которых попадают в недельный тест (у IELTS своя система, вопросы по тексту).
const WEEKLY_SUBJECT_KINDS = new Set(['ubt', 'english']);

const SATURDAY = 6;
const SUNDAY = 0;
const MONDAY = 1;
const TUESDAY = 2;

/** Шаги урока: для каждого предмета повторение, потом новая тема. */
export function lessonSteps(subjectIds = LESSON_SUBJECTS) {
  return subjectIds.flatMap((subject) => [
    { id: `${subject}:review`, subject, kind: 'review' },
    { id: `${subject}:new`, subject, kind: 'new' },
  ]);
}

/** Первый невыполненный шаг урока или null, если урок закончен. */
export function nextLessonStep(steps, record) {
  const done = record?.steps || {};
  return steps.find((step) => !done[step.id]) || null;
}

/** Прогресс урока за день: сколько шагов закрыто (пропущенный шаг тоже закрыт). */
export function lessonProgress(record, steps = lessonSteps()) {
  const done = steps.filter((step) => record?.steps?.[step.id]).length;
  return { done, total: steps.length, started: !!record, finished: done >= steps.length, next: nextLessonStep(steps, record) };
}

/** Порядок изучения тем предмета: математика — по школьной программе, остальное — по порядку в манифесте (с нуля). */
export function orderForLesson(topics, profile, subjectId) {
  if (usesCurriculum(profile, subjectId)) return sortByCurriculum(topics, normalizeGrade(profile?.grade));
  return [...topics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Новая тема: первая по порядку, которую ещё не решал.
 * Если начаты все — самая слабая из неосвоенных, чтобы её доучить. Всё освоено — null.
 */
export function chooseNewTopic(queue, state, nowTs = Date.now()) {
  const fresh = queue.find((topic) => !state.topics?.[topic.id]?.answered);
  if (fresh) return fresh;
  const weak = queue
    .map((topic) => ({ topic, mastery: masteryOf(state, topic.id, nowTs) }))
    .filter((x) => x.mastery < MASTERED_THRESHOLD)
    .sort((a, b) => a.mastery - b.mastery);
  return weak[0]?.topic || null;
}

export function newTopicFor(state, subjectId, nowTs = Date.now()) {
  const queue = orderForLesson(topicsOf(subjectId, { kind: 'lesson' }), state.profile, subjectId);
  return chooseNewTopic(queue, state, nowTs);
}

/** Темы предмета, которые уже решались (их и повторяем). */
export function studiedTopics(topics, state, excludeIds = []) {
  const excluded = new Set(excludeIds);
  return topics.filter((topic) => state.topics?.[topic.id]?.answered > 0 && !excluded.has(topic.id));
}

export function studiedTopicsFor(state, subjectId, excludeIds = []) {
  return studiedTopics(topicsOf(subjectId, { kind: 'lesson' }), state, excludeIds);
}

/**
 * Вес темы в повторении: слабее и давнее — чаще.
 * Темы, которые на недельном тесте оказались забыты, получают добавку.
 */
export function reviewWeight({ mastery = 0, lastAt = 0, forgotten = false }, nowTs = Date.now()) {
  const age = lastAt ? Math.min(30, daysSince(lastAt, nowTs)) / 30 : 1;
  return 0.25 + (1 - mastery) + 0.5 * age + (forgotten ? 0.75 : 0);
}

/** Вопросы без общего текста-контекста: их можно смешивать из разных тем. */
function standalone(questions) {
  return questions.filter((q) => !q.context);
}

/**
 * Задачи для повторения. pools: [{ questions, weight }].
 * Сначала (до половины) — вопросы, где ты ошибался и пришёл срок повторения, остальное — случайно,
 * чаще из тем с большим весом. Вес темы уменьшается после каждого выбора, чтобы темы чередовались.
 */
export function pickReviewQuestions(pools, { due = new Set(), count = REVIEW_SIZE, rng = Math.random } = {}) {
  const usable = pools.map((p) => ({ weight: p.weight, questions: standalone(p.questions || []) })).filter((p) => p.questions.length);
  const dueFirst = shuffle(usable.flatMap((p) => p.questions).filter((q) => due.has(q.id)), rng).slice(0, Math.ceil(count / 2));
  const taken = new Set(dueFirst.map((q) => q.id));
  let queues = usable.map((p) => ({ weight: p.weight, left: shuffle(p.questions.filter((q) => !taken.has(q.id)), rng) }));
  const picked = [...dueFirst];
  while (picked.length < count) {
    const open = queues.filter((q) => q.left.length);
    if (!open.length) break;
    const chosen = open[weightedIndex(open.map((q) => q.weight), rng)];
    const [question, ...rest] = chosen.left;
    picked.push(question);
    queues = queues.map((q) => (q === chosen ? { weight: q.weight * 0.7, left: rest } : q));
  }
  return shuffle(picked, rng);
}

/** Задачи новой темы: от простых к сложным (внутри одной сложности — случайно). */
export function pickNewTopicQuestions(questions, { count = NEW_TOPIC_SIZE, rng = Math.random } = {}) {
  return shuffle(questions, rng)
    .slice(0, count)
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (a.q.difficulty || 1) - (b.q.difficulty || 1) || a.i - b.i)
    .map((x) => x.q);
}

/** Удаляет записи уроков старше keepDays дней от dayKey. */
export function pruneLessons(lessons, dayKey, keepDays = LESSON_KEEP_DAYS) {
  const oldest = addDaysKey(dayKey, -keepDays);
  return Object.fromEntries(Object.entries(lessons || {}).filter(([key]) => key >= oldest));
}

// ---------- недельный тест ----------

/** Темы, которые проходил на неделе, начинающейся с weekKey (понедельник), в порядке первого прохождения. */
export function topicsStudiedInWeek(sessions, weekKey, isEligible = () => true) {
  const end = addDaysKey(weekKey, 7);
  const ids = (sessions || [])
    .filter((s) => s.topicId && STUDY_KINDS.has(s.kind))
    .filter((s) => {
      const key = toDayKey(new Date(s.at));
      return key >= weekKey && key < end;
    })
    .map((s) => s.topicId);
  return [...new Set(ids)].filter(isEligible);
}

/** Подходит ли тема для недельного теста: урок ЕНТ или грамматика английского. */
export function isWeeklyTopic(topicId, subjectKindOf) {
  const meta = topicMeta(topicId);
  return !!meta && meta.kind === 'lesson' && WEEKLY_SUBJECT_KINDS.has(subjectKindOf(meta.subject));
}

/** Сколько задач брать из каждой темы: всего около WEEKLY_SIZE, но не меньше 3 и не больше 10 на тему. */
export function weeklyQuota(topicCount, total = WEEKLY_SIZE) {
  if (!topicCount) return 0;
  return Math.max(WEEKLY_MIN_PER_TOPIC, Math.min(WEEKLY_MAX_PER_TOPIC, Math.round(total / topicCount)));
}

/** Задачи недельного теста: поровну из каждой темы, всё вперемешку. pools: [{ questions }]. */
export function pickWeeklyQuestions(pools, { rng = Math.random, total = WEEKLY_SIZE } = {}) {
  const usable = pools.map((p) => standalone(p.questions || [])).filter((qs) => qs.length);
  const quota = weeklyQuota(usable.length, total);
  return shuffle(usable.flatMap((qs) => shuffle(qs, rng).slice(0, quota)), rng);
}

/** Итоги по темам: { [topicId]: { correct, total } }. */
export function breakdownByTopic(results) {
  return (results || []).reduce((acc, r) => {
    const id = r.question.topicId;
    const prev = acc[id] || { correct: 0, total: 0 };
    return { ...acc, [id]: { correct: prev.correct + (r.score.isCorrect ? 1 : 0), total: prev.total + 1 } };
  }, {});
}

/** Вердикт по теме: помнишь / подзабыл / забыл. */
export function topicVerdict({ correct = 0, total = 0 } = {}) {
  const ratio = total ? correct / total : 0;
  if (ratio >= 0.8) return { key: 'remember', label: 'Помнишь', tone: 'success' };
  if (ratio >= 0.5) return { key: 'shaky', label: 'Подзабыл', tone: 'warn' };
  return { key: 'forgot', label: 'Забыл — повтори', tone: 'danger' };
}

/** Темы, которые на последнем недельном тесте оказались забыты или подзабыты. */
export function forgottenTopicIds(weekly) {
  const latest = Object.entries(weekly || {}).sort((a, b) => b[0].localeCompare(a[0]))[0]?.[1];
  if (!latest?.topics) return [];
  return Object.entries(latest.topics)
    .filter(([, stats]) => topicVerdict(stats).key !== 'remember')
    .map(([id]) => id);
}

/**
 * Недельный тест, который пора сдать сегодня: в субботу и воскресенье — за текущую неделю,
 * в понедельник и вторник — за прошлую, если его пропустил. topicsFor(weekKey) → список тем недели.
 */
export function weeklyTestFor(weekly, dayKey, topicsFor) {
  const current = weekStartKey(dayKey);
  const weekday = fromDayKey(dayKey).getDay();
  if (weekday === SATURDAY || weekday === SUNDAY) {
    return topicsFor(current).length ? { week: current, done: !!weekly?.[current] } : null;
  }
  const previous = addDaysKey(current, -7);
  if ((weekday === MONDAY || weekday === TUESDAY) && !weekly?.[previous] && topicsFor(previous).length) {
    return { week: previous, done: false };
  }
  return null;
}

/** Темы недели weekKey, подходящие для недельного теста (по реальному манифесту). */
export function weekTopicIds(state, weekKey) {
  return topicsStudiedInWeek(state.sessions, weekKey, (id) => isWeeklyTopic(id, (subjectId) => subject(subjectId)?.kind));
}

/** Недельный тест на сегодня для текущего состояния или null. */
export function weeklyTestToday(state, dayKey) {
  return weeklyTestFor(state.weekly, dayKey, (week) => weekTopicIds(state, week));
}
