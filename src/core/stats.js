// Статистика: серии (streak), уровни, активность по дням, тренды.

import { addDaysKey, daysBetween, todayKey, toDayKey } from './time.js';

export const ACTIVE_DAY_MIN_ANSWERS = 5;
export const ACTIVE_DAY_MIN_MINUTES = 5;

export function isActiveDay(day) {
  if (!day) return false;
  return (day.answered || 0) >= ACTIVE_DAY_MIN_ANSWERS || (day.minutes || 0) >= ACTIVE_DAY_MIN_MINUTES;
}

/** Текущая и лучшая серия активных дней. Серия не прерывается, если сегодня ещё не занимался. */
export function streakInfo(state, today = todayKey()) {
  const daily = state.daily || {};
  const activeToday = isActiveDay(daily[today]);
  let current = 0;
  let cursor = activeToday ? today : addDaysKey(today, -1);
  while (isActiveDay(daily[cursor])) {
    current += 1;
    cursor = addDaysKey(cursor, -1);
  }
  const keys = Object.keys(daily).filter((k) => isActiveDay(daily[k])).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    run = prev && daysBetween(prev, key) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return { current, best: Math.max(best, current), activeToday };
}

const LEVEL_TITLES = ['Новичок', 'Ученик', 'Практик', 'Знаток', 'Стратег', 'Мастер', 'Эксперт', 'Гроссмейстер', 'Легенда', 'Абитуриент мечты'];

export function xpForLevel(level) {
  return 40 * (level - 1) * (level - 1);
}

export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, level - 1)],
    current,
    next,
    progress: (xp - current) / (next - current),
    toNext: next - xp,
  };
}

/** Минуты и XP за последние N дней. */
export function sumDaily(state, days = 7, today = todayKey()) {
  const daily = state.daily || {};
  let minutes = 0;
  let answered = 0;
  let correct = 0;
  let xp = 0;
  let activeDays = 0;
  for (let i = 0; i < days; i += 1) {
    const key = addDaysKey(today, -i);
    const d = daily[key];
    if (!d) continue;
    minutes += d.minutes || 0;
    answered += d.answered || 0;
    correct += d.correct || 0;
    xp += d.xp || 0;
    if (isActiveDay(d)) activeDays += 1;
  }
  return { minutes, answered, correct, xp, activeDays, accuracy: answered ? correct / answered : 0 };
}

/** Тепловая карта активности за N недель: массив ячеек по дням (Пн..Вс колонками). */
export function activityCells(state, weeks = 16, today = todayKey()) {
  const daily = state.daily || {};
  const total = weeks * 7;
  const end = fromToday(today);
  const endOffset = (end.getDay() + 6) % 7; // до конца недели (Вс)
  const cells = [];
  for (let i = total - 1 - (6 - endOffset); i >= -(6 - endOffset); i -= 1) {
    const key = addDaysKey(today, -i);
    const d = daily[key];
    const minutes = d?.minutes || 0;
    const level = !d || (!d.minutes && !d.answered) ? 0 : minutes < 10 ? 1 : minutes < 25 ? 2 : minutes < 50 ? 3 : 4;
    cells.push({ key, level, minutes, answered: d?.answered || 0, future: i < 0 });
  }
  return cells;
}

function fromToday(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Точность по дням за период (для графика). */
export function accuracySeries(state, days = 30, today = todayKey()) {
  const daily = state.daily || {};
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = addDaysKey(today, -i);
    const d = daily[key];
    series.push({ key, value: d && d.answered ? d.correct / d.answered : null, answered: d?.answered || 0 });
  }
  return series;
}

export function examSeries(state) {
  return (state.exams || []).map((e) => ({ key: toDayKey(new Date(e.at)), value: e.total, max: e.max, mode: e.mode, at: e.at }));
}

export function subjectSessions(state, subjectId, limit = 10) {
  return (state.sessions || []).filter((s) => s.subject === subjectId).slice(-limit);
}
