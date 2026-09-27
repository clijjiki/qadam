// Действия, меняющие прогресс. Все они проходят через store.update и возвращают новое состояние.

import { getState, setIn, update } from './store.js';
import { normalizeLang } from './content.js';
import { emptyTopicStats } from './mastery.js';
import { GRADES, gradeFromCorrect, isGraduated, review } from './srs.js';
import { newlyEarned } from './badges.js';
import { todayKey, weekStartKey } from './time.js';
import { withPyAttempt } from './pytrainer.js';
import { withCheck, withCounter, withSentences } from './english.js';

export const XP = {
  correct: 2,
  partial: 1,
  finishPractice: 5,
  accuracyBonus: 10,
  theory: 5,
  vocab: 1,
  miniExam: 30,
  fullExam: 80,
  writing: 15,
  speaking: 8,
  python: 5,
  sentence: 2,
};

function bumpDaily(state, patch, nowTs) {
  const key = todayKey(new Date(nowTs));
  const prev = state.daily[key] || { minutes: 0, answered: 0, correct: 0, xp: 0, sessions: 0 };
  const next = {
    minutes: prev.minutes + (patch.minutes || 0),
    answered: prev.answered + (patch.answered || 0),
    correct: prev.correct + (patch.correct || 0),
    xp: prev.xp + (patch.xp || 0),
    sessions: prev.sessions + (patch.sessions || 0),
  };
  return { ...state, daily: { ...state.daily, [key]: next }, xp: state.xp + (patch.xp || 0) };
}

function withBadges(state) {
  const earned = newlyEarned(state);
  if (!earned.length) return { state, earned };
  return { state: { ...state, badges: [...state.badges, ...earned] }, earned };
}

function applyTopicResult(state, topicId, summary, nowTs) {
  const prev = state.topics[topicId] || emptyTopicStats();
  const accuracy = summary.total ? summary.correct / summary.total : 0;
  const recent = [...(prev.recent || []), accuracy].slice(-3);
  const next = {
    ...prev,
    answered: prev.answered + summary.total,
    correct: prev.correct + summary.correct,
    attempts: prev.attempts + 1,
    best: Math.max(prev.best || 0, accuracy),
    recent,
    lastAt: nowTs,
    points: (prev.points || 0) + summary.points,
    maxPoints: (prev.maxPoints || 0) + summary.maxPoints,
  };
  return setIn(state, ['topics', topicId], next);
}

function applyQuestionSrs(state, results, nowTs) {
  let questions = state.questions;
  let graduated = 0;
  for (const r of results) {
    const id = r.question.id;
    const prev = questions[id];
    if (r.score.isCorrect) {
      if (!prev) continue;
      const next = review(prev, GRADES.GOOD, nowTs);
      if (isGraduated(next)) {
        const { [id]: _removed, ...rest } = questions;
        questions = rest;
        graduated += 1;
      } else {
        questions = { ...questions, [id]: next };
      }
    } else {
      questions = { ...questions, [id]: review(prev, gradeFromCorrect(false), nowTs) };
    }
  }
  const counters = { ...(state.counters || {}), graduated: (state.counters?.graduated || 0) + graduated };
  return { ...state, questions, counters };
}

/**
 * Завершение практики/повторения.
 * results: [{ question, selected, score }]; summary из scoring.summarize.
 */
export function recordPractice({ topicId, subject, kind = 'practice', results, summary, seconds = 0 }) {
  const nowTs = Date.now();
  let earnedBadges = [];
  update((state) => {
    let next = state;
    const byTopic = groupByTopic(results);
    for (const [tid, group] of byTopic) {
      next = applyTopicResult(next, tid, summarizeGroup(group), nowTs);
    }
    next = applyQuestionSrs(next, results, nowTs);
    const xp = computePracticeXp(summary);
    next = {
      ...next,
      sessions: [
        ...next.sessions,
        { at: nowTs, kind, topicId: topicId || null, subject: subject || null, correct: summary.correct, total: summary.total, points: summary.points, maxPoints: summary.maxPoints, seconds: Math.round(seconds), xp },
      ].slice(-2000),
    };
    next = bumpDaily(next, { minutes: seconds / 60, answered: summary.total, correct: summary.correct, xp, sessions: 1 }, nowTs);
    const badged = withBadges(next);
    earnedBadges = badged.earned;
    return badged.state;
  });
  return { xp: computePracticeXp(summary), badges: earnedBadges };
}

function groupByTopic(results) {
  const map = new Map();
  for (const r of results) {
    const tid = r.question.topicId;
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid).push(r);
  }
  return map;
}

function summarizeGroup(group) {
  return {
    total: group.length,
    correct: group.filter((r) => r.score.isCorrect).length,
    points: group.reduce((s, r) => s + r.score.points, 0),
    maxPoints: group.reduce((s, r) => s + r.score.max, 0),
  };
}

export function computePracticeXp(summary) {
  const partial = Math.max(0, summary.points - summary.correct * 1 - summary.partialCount || 0);
  let xp = summary.correct * XP.correct + XP.finishPractice;
  if (summary.total >= 5 && summary.accuracy >= 0.8) xp += XP.accuracyBonus;
  return xp + partial;
}

/** Открыл теорию темы: отмечаем и даём XP один раз в день на тему. */
export function recordTheory(topicId) {
  const nowTs = Date.now();
  update((state) => {
    const prev = state.topics[topicId] || emptyTopicStats();
    const sameDay = prev.studiedAt && todayKey(new Date(prev.studiedAt)) === todayKey(new Date(nowTs));
    let next = setIn(state, ['topics', topicId], { ...prev, studiedAt: nowTs });
    if (!sameDay) next = bumpDaily(next, { xp: XP.theory, minutes: 3 }, nowTs);
    return next;
  });
}

/** Завершение пробного экзамена. sections: [{subject, name, correct, total, points, max}] */
export function recordExam({ mode, sections, results, seconds, seed }) {
  const nowTs = Date.now();
  const total = sections.reduce((s, x) => s + x.points, 0);
  const max = sections.reduce((s, x) => s + x.max, 0);
  let earnedBadges = [];
  update((state) => {
    let next = state;
    for (const [tid, group] of groupByTopic(results)) {
      next = applyTopicResult(next, tid, summarizeGroup(group), nowTs);
    }
    next = applyQuestionSrs(next, results, nowTs);
    const xp = mode === 'full' ? XP.fullExam : XP.miniExam;
    const exam = { at: nowTs, mode, seed, sections, total, max, seconds: Math.round(seconds), xp };
    const correct = results.filter((r) => r.score.isCorrect).length;
    next = {
      ...next,
      exams: [...next.exams, exam].slice(-200),
      sessions: [...next.sessions, { at: nowTs, kind: 'exam', topicId: null, subject: 'exam', correct, total: results.length, points: total, maxPoints: max, seconds: Math.round(seconds), xp }].slice(-2000),
    };
    next = bumpDaily(next, { minutes: seconds / 60, answered: results.length, correct, xp, sessions: 1 }, nowTs);
    const badged = withBadges(next);
    earnedBadges = badged.earned;
    return badged.state;
  });
  return { total, max, badges: earnedBadges };
}

export function recordVocabReview(wordId, grade, seconds = 0.5) {
  const nowTs = Date.now();
  update((state) => {
    const prev = state.vocab[wordId];
    let next = setIn(state, ['vocab', wordId], review(prev, grade, nowTs));
    next = bumpDaily(next, { xp: XP.vocab, minutes: seconds / 60, answered: 1, correct: grade > 0 ? 1 : 0 }, nowTs);
    return next;
  });
}

export function finishVocabSession(count, seconds, subject = 'ielts') {
  if (!count) return;
  const nowTs = Date.now();
  update((state) => {
    const session = { at: nowTs, kind: 'vocab', topicId: null, subject, correct: count, total: count, points: 0, maxPoints: 0, seconds: Math.round(seconds), xp: 0 };
    let next = { ...state, sessions: [...state.sessions, session].slice(-2000) };
    next = bumpDaily(next, { sessions: 1 }, nowTs);
    const badged = withBadges(next);
    return badged.state;
  });
}

export function saveWriting(promptId, patch) {
  const nowTs = Date.now();
  update((state) => {
    const prev = state.writing[promptId] || { createdAt: nowTs };
    const isNew = !state.writing[promptId]?.band && patch.band;
    let next = setIn(state, ['writing', promptId], { ...prev, ...patch, updatedAt: nowTs });
    if (isNew) next = bumpDaily(next, { xp: XP.writing, minutes: 25, sessions: 1 }, nowTs);
    return withBadges(next).state;
  });
}

export function saveSpeaking(cardId, patch) {
  const nowTs = Date.now();
  update((state) => {
    const prev = state.speaking[cardId] || { createdAt: nowTs };
    const isNew = !state.speaking[cardId];
    let next = setIn(state, ['speaking', cardId], { ...prev, ...patch, updatedAt: nowTs });
    if (isNew) next = bumpDaily(next, { xp: XP.speaking, minutes: 4, sessions: 1 }, nowTs);
    return withBadges(next).state;
  });
}

// Защита localStorage от вставки огромного текста: при переполнении перестал бы сохраняться весь прогресс.
const MAX_CODE_LENGTH = 20000;

/** Черновик кода задачи (без попытки проверки). */
export function savePyCode(taskId, rawCode) {
  const code = String(rawCode ?? '').slice(0, MAX_CODE_LENGTH);
  update((state) => {
    const prev = state.python[taskId];
    if (prev?.code === code) return state;
    const base = prev || { attempts: 0, solved: false, solvedAt: null };
    return { ...state, python: { ...state.python, [taskId]: { ...base, code, updatedAt: Date.now() } } };
  });
}

/** Результат проверки задачи тренажёра. XP — только за первое решение. Возвращает true, если задача решена впервые. */
export function recordPyCheck(taskId, { ok, code: rawCode, level = 1 }) {
  const nowTs = Date.now();
  const code = String(rawCode ?? '').slice(0, MAX_CODE_LENGTH);
  let firstSolve = false;
  update((state) => {
    firstSolve = Boolean(ok) && !state.python[taskId]?.solved;
    let next = { ...state, python: withPyAttempt(state.python, taskId, { ok, code, at: nowTs }) };
    // answered/correct не трогаем: они про точность в тестах ЕНТ, а не про попытки в тренажёре.
    if (firstSolve) next = bumpDaily(next, { xp: XP.python * level, minutes: 5 }, nowTs);
    return withBadges(next).state;
  });
  return firstSolve;
}

/** Английский: +1 серия/фильм (delta может быть -1, если нажал по ошибке). */
export function bumpEnglishCounter(goalId, delta = 1) {
  update((state) => ({ ...state, english: withCounter(state.english, goalId, delta) }));
}

export function setEnglishCheck(goalId, value) {
  update((state) => ({ ...state, english: withCheck(state.english, goalId, value) }));
}

/** Предложения, составленные из выученных слов. */
export function recordSentences(count) {
  if (!count || count <= 0) return;
  const nowTs = Date.now();
  update((state) => {
    const next = { ...state, english: withSentences(state.english, todayKey(new Date(nowTs)), count) };
    return bumpDaily(next, { xp: count * XP.sentence, minutes: count * 2, sessions: 1 }, nowTs);
  });
}

export function setProfile(patch) {
  update((state) => ({ ...state, profile: { ...state.profile, ...patch } }));
}

export function setSettings(patch) {
  update((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
}

/** Язык контента (уроки, вопросы, пробники). Возвращает применённый язык. */
export function setContentLang(lang) {
  const next = normalizeLang(lang);
  update((state) => (state.settings.contentLang === next ? state : { ...state, settings: { ...state.settings, contentLang: next } }));
  return next;
}

export function addStudyMinutes(minutes) {
  if (!minutes || minutes <= 0) return;
  update((state) => bumpDaily(state, { minutes }, Date.now()));
}

/**
 * Снимок прогноза на текущую неделю (пишется один раз в неделю).
 * По этим снимкам считается дельта «+N за неделю» на дашборде.
 */
export function recordForecastSnapshot(ent, band) {
  const week = weekStartKey();
  const state = getState();
  const prev = state.forecast[week];
  if (prev && prev.ent === ent && prev.band === band) return;
  update((current) => ({ ...current, forecast: { ...current.forecast, [week]: { ent, band: band ?? null, at: Date.now() } } }));
}

export function currentState() {
  return getState();
}
