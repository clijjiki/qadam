// План подготовки: выбор следующей темы, ежедневные миссии, недельный план, обратный отсчёт.

import { allTopics, ieltsSubject, langOf, subject, topicTitle, topicWeight, topicsOf, ubtSubjects } from './content.js';
import { normalizeGrade, sortByCurriculum, usesCurriculum } from './curriculum.js';
import { MASTERED_THRESHOLD, masteryOf } from './mastery.js';
import { dueIds } from './srs.js';
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

export function nextIeltsLesson(state, nowTs = Date.now()) {
  const ielts = ieltsSubject();
  if (!ielts) return null;
  const lessons = topicsOf(ielts.id, { kind: 'lesson' });
  const unfinished = lessons.filter((t) => masteryOf(state, t.id, nowTs) < MASTERED_THRESHOLD);
  return unfinished[0] || lessons[0] || null;
}

function sessionsToday(state, today) {
  return (state.sessions || []).filter((s) => toDayKey(new Date(s.at)) === today);
}

/** Ежедневные миссии на сегодня. */
export function dailyMissions(state, nowTs = Date.now()) {
  const today = todayKey(new Date(nowTs));
  const todays = sessionsToday(state, today);
  const missions = [];
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
  const studiedToday = new Set(todays.map((s) => s.topicId).filter(Boolean));
  const [topic] = nextTopics(state, 1, { exclude: [...studiedToday], nowTs });
  const topicDone = todays.some((s) => (s.kind === 'practice' || s.kind === 'topic') && s.topicId && allTopics().find((t) => t.id === s.topicId)?.subject !== 'ielts');
  if (topic) {
    const subj = subject(topic.subject);
    missions.push({
      id: 'topic',
      icon: '📘',
      title: topicDone ? 'Тема дня пройдена' : `Тема: ${topicTitle(topic, langOf(state))}`,
      sub: `${subj?.name || topic.subject} · теория + практика`,
      href: `#/topic/${topic.id}`,
      minutes: 20,
      done: topicDone,
      topicId: topic.id,
    });
  }
  const dayNumber = Math.floor(fromDayKey(today).getTime() / 86400000);
  const vocabDay = dayNumber % 2 === 0;
  const dueVocab = dueIds(state.vocab, nowTs).length;
  if (vocabDay || dueVocab > 0) {
    missions.push({
      id: 'vocab',
      icon: '🃏',
      title: dueVocab ? `IELTS-слова: ${dueVocab} к повторению` : 'IELTS-слова: 10 новых',
      sub: 'Карточки с интервальным повторением',
      href: '#/ielts/vocab',
      minutes: 8,
      done: todays.some((s) => s.kind === 'vocab'),
    });
  } else {
    const lesson = nextIeltsLesson(state, nowTs);
    if (lesson) {
      missions.push({
        id: 'ielts',
        icon: '🇬🇧',
        title: `IELTS: ${lesson.title}`,
        sub: 'Урок и практика по навыку',
        href: `#/topic/${lesson.id}`,
        minutes: 15,
        done: todays.some((s) => s.topicId === lesson.id),
      });
    }
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

const WEEK_TEMPLATE = [
  { day: 1, focus: ['math'], ielts: 'vocab' },
  { day: 2, focus: ['informatics'], ielts: 'lesson' },
  { day: 3, focus: ['history'], ielts: 'vocab' },
  { day: 4, focus: ['math'], ielts: 'lesson' },
  { day: 5, focus: ['informatics'], ielts: 'vocab' },
  { day: 6, focus: ['mathlit', 'reading'], ielts: 'writing', exam: true },
  { day: 0, focus: [], ielts: 'speaking', rest: true },
];

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
    const ieltsLabel = { vocab: 'IELTS: слова (8 мин)', lesson: 'IELTS: урок', writing: 'IELTS: Writing (25 мин)', speaking: 'IELTS: Speaking-карточки' }[template.ielts];
    const ieltsHref = { vocab: '#/ielts/vocab', lesson: '#/ielts', writing: '#/ielts/writing', speaking: '#/ielts/speaking' }[template.ielts];
    items.push({ kind: 'ielts', title: ieltsLabel, href: ieltsHref });
    if (template.exam) items.push({ kind: 'exam', title: 'Мини-пробник ЕНТ', href: '#/exam?mode=mini' });
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
