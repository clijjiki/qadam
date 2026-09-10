// Формулы освоения темы (mastery) и готовности к экзамену (readiness).
//
// mastery = skill × (0.5 + 0.5 × confidence) × retention
//   skill      = 0.6 × среднее по последним 3 попыткам + 0.4 × лучший результат
//   confidence = min(1, отвечено вопросов / 10)
//   retention  = 1 в первые 7 дней, затем −1.5% в день, но не ниже 0.55
//
// Прогноз балла по предмету = Σ по темам (вес темы / Σ весов) × макс. балл × (0.15 + 0.85 × mastery)
// Если есть пробные экзамены за последние 60 дней — прогноз усредняется с их результатом (50/50).

import { daysSince } from './time.js';
import { topicWeight, topicsOf, ubtSubjects } from './content.js';

export const GUESS_BASELINE = 0.15;
export const MASTERED_THRESHOLD = 0.8;

export function emptyTopicStats() {
  return { answered: 0, correct: 0, attempts: 0, best: 0, recent: [], lastAt: 0, studiedAt: 0, points: 0, maxPoints: 0 };
}

export function retentionFactor(lastAt, nowTs = Date.now()) {
  if (!lastAt) return 0;
  const days = daysSince(lastAt, nowTs);
  if (days <= 7) return 1;
  return Math.max(0.55, 1 - 0.015 * (days - 7));
}

export function computeMastery(stats, nowTs = Date.now()) {
  if (!stats || !stats.answered) return 0;
  const recent = stats.recent && stats.recent.length ? stats.recent : [stats.best || 0];
  const recentMean = recent.reduce((s, x) => s + x, 0) / recent.length;
  const skill = 0.6 * recentMean + 0.4 * (stats.best || 0);
  const confidence = Math.min(1, stats.answered / 10);
  return clamp01(skill * (0.5 + 0.5 * confidence) * retentionFactor(stats.lastAt, nowTs));
}

export function masteryOf(state, topicId, nowTs = Date.now()) {
  return computeMastery(state.topics[topicId], nowTs);
}

export function masteryLevel(mastery) {
  if (mastery >= MASTERED_THRESHOLD) return { key: 'mastered', label: 'Освоено', tone: 'success' };
  if (mastery >= 0.5) return { key: 'progress', label: 'В процессе', tone: 'primary' };
  if (mastery > 0) return { key: 'weak', label: 'Слабо', tone: 'warn' };
  return { key: 'new', label: 'Не начато', tone: 'muted' };
}

/** Прогноз по одному предмету ЕНТ. */
export function subjectReadiness(state, subjectMeta, nowTs = Date.now()) {
  const topics = topicsOf(subjectMeta.id, { kind: 'lesson' });
  const maxPoints = subjectMeta.exam?.maxPoints || 0;
  const totalWeight = topics.reduce((s, t) => s + topicWeight(t), 0) || 1;
  let masterySum = 0;
  let studied = 0;
  let mastered = 0;
  for (const topic of topics) {
    const m = masteryOf(state, topic.id, nowTs);
    masterySum += (topicWeight(topic) / totalWeight) * m;
    if (state.topics[topic.id]?.answered) studied += 1;
    if (m >= MASTERED_THRESHOLD) mastered += 1;
  }
  const masteryBased = maxPoints * (GUESS_BASELINE + (1 - GUESS_BASELINE) * masterySum);
  const examBased = recentExamAverage(state, subjectMeta.id, nowTs);
  const predicted = examBased === null ? masteryBased : 0.5 * masteryBased + 0.5 * examBased * maxPoints;
  return {
    subjectId: subjectMeta.id,
    maxPoints,
    predicted: Math.round(predicted * 10) / 10,
    mastery: masterySum,
    topics: topics.length,
    studied,
    mastered,
    examBased,
  };
}

function recentExamAverage(state, subjectId, nowTs) {
  const recent = (state.exams || [])
    .filter((e) => e.mode === 'full' && daysSince(e.at, nowTs) <= 60)
    .map((e) => e.sections.find((s) => s.subject === subjectId))
    .filter((s) => s && s.max > 0)
    .slice(-2);
  if (!recent.length) return null;
  return recent.reduce((s, x) => s + x.points / x.max, 0) / recent.length;
}

/** Общая готовность к ЕНТ: прогноз из 140. */
export function overallReadiness(state, nowTs = Date.now()) {
  const perSubject = ubtSubjects().map((s) => subjectReadiness(state, s, nowTs));
  const predicted = perSubject.reduce((s, x) => s + x.predicted, 0);
  const max = perSubject.reduce((s, x) => s + x.maxPoints, 0);
  const topicsTotal = perSubject.reduce((s, x) => s + x.topics, 0);
  const mastered = perSubject.reduce((s, x) => s + x.mastered, 0);
  const studied = perSubject.reduce((s, x) => s + x.studied, 0);
  return { predicted: Math.round(predicted), max, perSubject, topicsTotal, mastered, studied };
}

/** Оценка IELTS band по данным сайта (грубая, для мотивации). */
export function ieltsReadiness(state, ieltsMeta, nowTs = Date.now()) {
  if (!ieltsMeta) return null;
  const lessons = topicsOf(ieltsMeta.id, { kind: 'lesson' });
  const bySkill = {};
  for (const topic of lessons) {
    const skill = topic.skill || 'general';
    const m = masteryOf(state, topic.id, nowTs);
    const w = topicWeight(topic);
    bySkill[skill] = bySkill[skill] || { sum: 0, weight: 0, studied: 0 };
    bySkill[skill].sum += m * w;
    bySkill[skill].weight += w;
    if (state.topics[topic.id]?.answered) bySkill[skill].studied += 1;
  }
  const skillBand = (key) => {
    const s = bySkill[key];
    if (!s || !s.studied) return null;
    return roundHalf(4 + 5 * (s.sum / s.weight));
  };
  const selfBand = (map) => {
    const values = Object.values(map || {})
      .map((x) => Number(x.band))
      .filter((b) => Number.isFinite(b) && b > 0);
    if (!values.length) return null;
    const last = values.slice(-3);
    return roundHalf(last.reduce((a, b) => a + b, 0) / last.length);
  };
  const bands = {
    listening: skillBand('listening'),
    reading: skillBand('reading'),
    writing: selfBand(state.writing),
    speaking: selfBand(state.speaking),
  };
  const known = Object.values(bands).filter((b) => b !== null);
  const overall = known.length ? roundHalf(known.reduce((a, b) => a + b, 0) / known.length) : null;
  const vocabTotal = Object.keys(state.vocab || {}).length;
  const vocabLearned = Object.values(state.vocab || {}).filter((v) => (v.reps || 0) >= 3).length;
  return { bands, overall, vocabTotal, vocabLearned };
}

export function roundHalf(x) {
  return Math.round(x * 2) / 2;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
