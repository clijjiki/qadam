// Интервальное повторение (упрощённый SM-2).
// grade: 0 — не помню/ошибка, 1 — трудно, 2 — нормально, 3 — легко.
// Интервалы: 1 день → 3 дня → далее × ease (по умолчанию 2.5). Ошибка сбрасывает на 1 день и штрафует ease.

import { DAY_MS } from './time.js';

export const GRADES = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const RELEARN_DELAY_MS = 10 * 60 * 1000;

export function newItem(nowTs = Date.now()) {
  return { reps: 0, interval: 0, ease: 2.5, due: nowTs, lapses: 0, lastAt: 0, seen: 0 };
}

export function review(prev, grade, nowTs = Date.now()) {
  const item = { ...newItem(nowTs), ...(prev || {}) };
  const seen = (item.seen || 0) + 1;
  if (grade === GRADES.AGAIN) {
    return {
      ...item,
      reps: 0,
      interval: 0,
      ease: Math.max(MIN_EASE, item.ease - 0.2),
      lapses: (item.lapses || 0) + 1,
      due: nowTs + RELEARN_DELAY_MS,
      lastAt: nowTs,
      seen,
    };
  }
  const reps = item.reps + 1;
  let interval;
  if (reps === 1) interval = 1;
  else if (reps === 2) interval = 3;
  else {
    const factor = grade === GRADES.HARD ? 0.8 : grade === GRADES.EASY ? 1.3 : 1;
    interval = Math.max(item.interval + 1, Math.round(item.interval * item.ease * factor));
  }
  const easeDelta = grade === GRADES.EASY ? 0.15 : grade === GRADES.HARD ? -0.15 : 0;
  const ease = Math.min(MAX_EASE, Math.max(MIN_EASE, item.ease + easeDelta));
  return { ...item, reps, interval, ease, due: nowTs + interval * DAY_MS, lastAt: nowTs, seen };
}

export function isDue(item, nowTs = Date.now()) {
  return !!item && (item.due || 0) <= nowTs;
}

/** Список id, у которых наступил срок повторения, начиная с самых просроченных. */
export function dueIds(map, nowTs = Date.now()) {
  return Object.entries(map || {})
    .filter(([, item]) => isDue(item, nowTs))
    .sort((a, b) => (a[1].due || 0) - (b[1].due || 0))
    .map(([id]) => id);
}

export function upcomingIds(map, nowTs = Date.now(), withinDays = 1) {
  const limit = nowTs + withinDays * DAY_MS;
  return Object.entries(map || {})
    .filter(([, item]) => (item.due || 0) > nowTs && (item.due || 0) <= limit)
    .map(([id]) => id);
}

/** Вопрос считается «закрытым», если после ошибок его 3 раза подряд решили верно. */
export function isGraduated(item) {
  return !!item && item.reps >= 3;
}

export function gradeFromCorrect(isCorrect) {
  return isCorrect ? GRADES.GOOD : GRADES.AGAIN;
}
