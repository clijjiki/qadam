// План подготовки: выбор следующей темы, ежедневные миссии, недельный план, обратный отсчёт.

import { langOf, subject, topicTitle, topicWeight, topicsOf, ubtSubjects } from './content.js';
import { normalizeGrade, sortByCurriculum, usesCurriculum } from './curriculum.js';
import { MASTERED_THRESHOLD, masteryOf } from './mastery.js';
import { dueIds } from './srs.js';
import { plural } from './dom.js';
import { lessonProgress, weekTopicIds, weeklyQuota, weeklyTestToday } from './lesson.js';
import { addDaysKey, daysSince, daysUntil, fromDayKey, todayKey, toDayKey, weekStartKey } from './time.js';

const PROFILE_FACTOR = { math: 1.4, informatics: 1.4, history: 1.1, mathlit: 0.9, reading: 0.9 };

/** Оценка «полезности» изучения темы прямо сейчас. */
export function topicPriority(state, topic, nowTs = Date.now()) {
  const mastery = masteryOf(state, topic.id, nowTs);
  const stats = state.topics[topic.id];
  const factor = PROFILE_FACTOR[topic.subject] || 1;
  let score = topicWeight(topic) * (1 - mastery) * factor;
  if (stats?.lastAt && daysSince(stats.lastAt, nowTs) > 14 && mastery > 0 && mastery < MASTERED_THRESHOLD) score *= 1.2;
  if (!stats?.answered && topic.order > 1) score *= 0.95; // лёгкое предпочтение начатым линиям
  return score;
}

/**
 * Неосвоенные уроки предмета в порядке изучения.
 * Математика на треке «school» идёт по школьной программе (свой класс → с 7-го → старшие),
 * остальные предметы — по приоритету для ЕНТ.
 */
export function rankedTopics(state, subjectId, nowTs = Date.now()) {
  const pool = topicsOf(subjectId, { kind: 'lesson' }).filter((t) => masteryOf(state, t.id, nowTs) < MASTERED_THRESHOLD);
  if (usesCurriculum(state?.profile, subjectId)) return sortByCurriculum(pool, normalizeGrade(state?.profile?.grade));
  return [...pool].sort((a, b) => topicPriority(state, b, nowTs) - topicPriority(state, a, nowTs));
}

/** Берём по одной теме из каждой очереди по кругу, пока не наберём count. */
export function interleave(queues, count) {
  const rounds = queues.reduce((max, q) => Math.max(max, q.length), 0);
  const picked = [];
  for (let round = 0; round < rounds && picked.length < count; round += 1) {
    for (const queue of queues) {
      if (queue[round] && picked.length < count) picked.push(queue[round]);
    }
  }
  return picked;
}

/** Следующие N тем ЕНТ для изучения (чередуем предметы; порядок предметов — по приоритету их первой темы). */
export function nextTopics(state, count = 3, { exclude = [], nowTs = Date.now() } = {}) {
  const excluded = new Set(exclude);
  const queues = ubtSubjects()
    .map((s) => rankedTopics(state, s.id, nowTs).filter((t) => !excluded.has(t.id)))
    .filter((q) => q.length > 0)
    .sort((a, b) => topicPriority(state, b[0], nowTs) - topicPriority(state, a[0], nowTs));
  return interleave(queues, count);
}

/** Следующий урок грамматики английского (первый неосвоенный по порядку). */
export function nextEnglishLesson(state, nowTs = Date.now()) {
  const lessons = topicsOf('english', { kind: 'lesson' });
  return lessons.find((t) => masteryOf(state, t.id, nowTs) < MASTERED_THRESHOLD) || null;
}

/** Сколько слов английских наборов пора повторить. */
function englishDue(state, nowTs) {
  const sets = new Set(topicsOf('english', { kind: 'vocab' }).map((t) => t.id));
  return dueIds(state.vocab, nowTs).filter((key) => sets.has(key.split(':')[0])).length;
}

/** Сколько задач тренажёра Python решено в этот день. */
export function pythonSolvedOn(state, dayKey) {
  return Object.values(state.python || {}).filter((p) => p.solvedAt && toDayKey(new Date(p.solvedAt)) === dayKey).length;
}

const PYTHON_TASKS_PER_DAY = 2;

function sessionsToday(state, today) {
  return (state.sessions || []).filter((s) => toDayKey(new Date(s.at)) === today);
}

const LESSON_STEP_MINUTES = 15;

/** Урок дня: математика → информатика, по каждому предмету повторение и новая тема. */
function lessonMission(state, today) {
  const progress = lessonProgress(state.lessons?.[today]);
  const next = progress.next;
  const nextName = next ? `${subject(next.subject)?.short || next.subject}: ${next.kind === 'review' ? 'повторение' : 'новая тема'}` : '';
  let sub = 'Математика → информатика: сначала повторение, потом новая тема';
  if (progress.finished) sub = 'Повторение и новые темы — всё закрыто';
  else if (progress.done) sub = `Шаг ${progress.done + 1} из ${progress.total} · ${nextName}`;
  return {
    id: 'lesson',
    icon: '▶️',
    title: progress.finished ? 'Урок дня пройден' : progress.done ? 'Урок дня: продолжить' : 'Урок дня',
    sub,
    href: '#/lesson',
    minutes: LESSON_STEP_MINUTES * (progress.finished ? progress.total : progress.total - progress.done),
    done: progress.finished,
    main: true,
  };
}

/** Недельный тест: в выходные — за эту неделю, в понедельник и вторник — за прошлую, если пропущен. */
function weeklyMission(state, today) {
  const test = weeklyTestToday(state, today);
  if (!test) return null;
  const count = weekTopicIds(state, test.week).length;
  const past = test.week !== weekStartKey(today);
  return {
    id: 'weekly',
    icon: '🧪',
    title: test.done ? 'Недельный тест сдан' : `Недельный тест: ${count} ${plural(count, ['тема', 'темы', 'тем'])}`,
    sub: past ? 'За прошлую неделю — проверь, что не забыл' : 'Проверь, что не забыл пройденное за неделю',
    href: `#/weekly?week=${test.week}`,
    minutes: Math.min(30, count * weeklyQuota(count)),
    done: test.done,
  };
}

/** Ежедневные миссии на сегодня. */
export function dailyMissions(state, nowTs = Date.now()) {
  const today = todayKey(new Date(nowTs));
  const todays = sessionsToday(state, today);
  const missions = [lessonMission(state, today)];
  const weekly = weeklyMission(state, today);
  if (weekly) missions.push(weekly);
  const due = dueIds(state.questions, nowTs);
  if (due.length) {
    missions.push({
      id: 'review',
      icon: '🔁',
      title: `Работа над ошибками: ${Math.min(due.length, 15)} вопр.`,
      sub: 'Повтори то, где ошибался — так знания закрепляются',
      href: '#/practice?mode=review',
      minutes: Math.min(15, due.length * 1.2),
      done: todays.some((s) => s.kind === 'review'),
    });
  }
  const dayNumber = Math.floor(fromDayKey(today).getTime() / 86400000);
  // Английский — каждый день коротко: слова (новые или повторение) и предложения из них.
  const dueVocab = englishDue(state, nowTs);
  missions.push({
    id: 'vocab',
    icon: '🃏',
    title: dueVocab ? `Английские слова: ${dueVocab} к повторению` : 'Английский: 15 новых слов',
    sub: 'Карточки, потом 5 предложений из новых слов',
    href: dueVocab ? '#/english/words?mode=review' : '#/english/words',
    minutes: 15,
    done: todays.some((s) => s.kind === 'vocab'),
  });
  // Через день — либо урок грамматики английского, либо задачи в тренажёре Python.
  const lesson = nextEnglishLesson(state, nowTs);
  if (dayNumber % 2 === 0 && lesson) {
    missions.push({
      id: 'english',
      icon: '🇬🇧',
      title: `Английский: ${topicTitle(lesson, langOf(state))}`,
      sub: 'Короткая теория и практика',
      href: `#/topic/${lesson.id}`,
      minutes: 15,
      done: todays.some((s) => s.topicId === lesson.id),
    });
  } else {
    missions.push({
      id: 'python',
      icon: '🐍',
      title: `Python: ${PYTHON_TASKS_PER_DAY} задачи в тренажёре`,
      sub: 'Пиши код сам — сайт проверит',
      href: '#/python',
      minutes: 15,
      done: pythonSolvedOn(state, today) >= PYTHON_TASKS_PER_DAY,
    });
  }
  const weekday = fromDayKey(today).getDay();
  if (weekday === 6) {
    const weekIndex = Math.floor(dayNumber / 7);
    const full = weekIndex % 4 === 0;
    missions.push({
      id: 'exam',
      icon: '📝',
      title: full ? 'Полный пробный ЕНТ' : 'Мини-пробник (45 мин)',
      sub: full ? 'Раз в 4 недели — полный формат с таймером' : 'Каждую субботу — короткий прогон',
      href: full ? '#/exam?mode=full' : '#/exam?mode=mini',
      minutes: full ? 240 : 45,
      done: (state.exams || []).some((e) => toDayKey(new Date(e.at)) === today),
    });
  }
  return missions;
}

// english — что по английскому в этот день; python — задачи тренажёра в дни информатики.
const WEEK_TEMPLATE = [
  { day: 1, focus: ['math'], english: 'words' },
  { day: 2, focus: ['informatics'], english: 'grammar', python: true },
  { day: 3, focus: ['history'], english: 'words' },
  { day: 4, focus: ['math'], english: 'sentences' },
  { day: 5, focus: ['informatics'], english: 'grammar', python: true },
  { day: 6, focus: ['mathlit', 'reading'], english: 'words', exam: true },
  { day: 0, focus: [], english: 'extra', rest: true, weekly: true },
];

const ENGLISH_ITEMS = {
  words: { title: 'Английский: 15 слов (15 мин)', href: '#/english/words' },
  grammar: { title: 'Английский: урок грамматики', href: '#/english?focus=grammar' },
  sentences: { title: 'Английский: слова + 5 предложений', href: '#/english/sentences' },
  extra: { title: 'Extra English: 1–2 серии для отдыха', href: '#/english' },
};

/** В школьном треке два дня математики в неделю — как в школе: один на алгебру, другой на геометрию. */
export function pickForWeek(pool, usedLines) {
  return pool.find((t) => t.line && !usedLines.has(t.line)) || pool[0] || null;
}

/** Недельный план: 7 дней с рекомендациями по темам. */
export function weeklyPlan(state, { weekStart = weekStartKey(), nowTs = Date.now() } = {}) {
  const today = todayKey(new Date(nowTs));
  const used = new Set();
  const usedLines = new Set();
  const days = [];
  const hoursPerWeek = Number(state.profile.hoursPerWeek) || 6;
  const minutesPerDay = Math.round((hoursPerWeek * 60) / 6);
  for (let i = 0; i < 7; i += 1) {
    const key = addDaysKey(weekStart, i);
    const template = WEEK_TEMPLATE.find((t) => t.day === fromDayKey(key).getDay());
    const items = [];
    for (const subjectId of template.focus) {
      const pool = rankedTopics(state, subjectId, nowTs).filter((t) => !used.has(t.id));
      const pick = usesCurriculum(state.profile, subjectId) ? pickForWeek(pool, usedLines) : pool[0];
      if (pick) {
        used.add(pick.id);
        if (pick.line) usedLines.add(pick.line);
        items.push({ kind: 'topic', topicId: pick.id, title: topicTitle(pick, langOf(state)), subject: subjectId, href: `#/topic/${pick.id}` });
      }
    }
    if (!template.rest) items.push({ kind: 'review', title: 'Повторение ошибок (10 мин)', href: '#/practice?mode=review' });
    if (template.python) items.push({ kind: 'python', title: `Python: ${PYTHON_TASKS_PER_DAY} задачи тренажёра`, href: '#/python' });
    items.push({ kind: 'english', part: template.english, ...ENGLISH_ITEMS[template.english] });
    if (template.exam) items.push({ kind: 'exam', title: 'Мини-пробник ЕНТ', href: '#/exam?mode=mini' });
    if (template.weekly) items.push({ kind: 'weekly', title: 'Недельный тест по темам недели', href: `#/weekly?week=${weekStart}` });
    days.push({ key, isToday: key === today, isPast: key < today, rest: !!template.rest, minutes: template.rest ? Math.round(minutesPerDay / 2) : minutesPerDay, items });
  }
  return days;
}

/** Обратный отсчёт и нужный темп. */
export function countdown(state, nowTs = Date.now()) {
  const today = todayKey(new Date(nowTs));
  const examDays = daysUntil(state.profile.examDate, today);
  const ieltsDays = state.profile.ieltsDate ? daysUntil(state.profile.ieltsDate, today) : null;
  const lessons = ubtSubjects().flatMap((s) => topicsOf(s.id, { kind: 'lesson' }));
  const remaining = lessons.filter((t) => masteryOf(state, t.id, nowTs) < MASTERED_THRESHOLD).length;
  const weeks = examDays !== null && examDays > 0 ? Math.max(1, examDays / 7) : null;
  const topicsPerWeek = weeks ? Math.ceil(remaining / weeks) : null;
  return { examDays, ieltsDays, remaining, total: lessons.length, weeks, topicsPerWeek };
}
