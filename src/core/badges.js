// Бейджи: id, название, иконка, описание и проверка по состоянию.

import { MASTERED_THRESHOLD, computeMastery } from './mastery.js';
import { streakInfo } from './stats.js';

function masteredCount(state) {
  return Object.values(state.topics).filter((t) => computeMastery(t) >= MASTERED_THRESHOLD).length;
}

export const BADGES = [
  { id: 'first-steps', icon: '🚀', name: 'Первый шаг', desc: 'Пройти первую практику', check: (s) => s.sessions.length >= 1 },
  { id: 'streak-3', icon: '🔥', name: '3 дня подряд', desc: 'Заниматься 3 дня подряд', check: (s) => streakInfo(s).best >= 3 },
  { id: 'streak-7', icon: '⚡', name: 'Неделя силы', desc: 'Заниматься 7 дней подряд', check: (s) => streakInfo(s).best >= 7 },
  { id: 'streak-30', icon: '🏆', name: 'Месяц дисциплины', desc: '30 дней подряд', check: (s) => streakInfo(s).best >= 30 },
  { id: 'perfect-10', icon: '🎯', name: 'Снайпер', desc: '100% в практике из 10+ вопросов', check: (s) => s.sessions.some((x) => x.total >= 10 && x.correct === x.total) },
  { id: 'mastered-5', icon: '🧠', name: 'Пять тем', desc: 'Освоить 5 тем (≥80%)', check: (s) => masteredCount(s) >= 5 },
  { id: 'mastered-20', icon: '💎', name: 'Двадцать тем', desc: 'Освоить 20 тем', check: (s) => masteredCount(s) >= 20 },
  { id: 'mastered-50', icon: '👑', name: 'Полсотни', desc: 'Освоить 50 тем', check: (s) => masteredCount(s) >= 50 },
  { id: 'first-exam', icon: '📝', name: 'Боевое крещение', desc: 'Пройти пробный экзамен', check: (s) => s.exams.length >= 1 },
  { id: 'exam-100', icon: '💯', name: 'Сотня', desc: 'Набрать 100+ на полном пробнике', check: (s) => s.exams.some((e) => e.mode === 'full' && e.total >= 100) },
  { id: 'exam-120', icon: '🌟', name: 'Грант близко', desc: 'Набрать 120+ на полном пробнике', check: (s) => s.exams.some((e) => e.mode === 'full' && e.total >= 120) },
  { id: 'reviewer', icon: '🔁', name: 'Работа над ошибками', desc: 'Закрыть 25 вопросов из повторения', check: (s) => (s.counters?.graduated || 0) >= 25 },
  { id: 'vocab-100', icon: '📚', name: '100 слов', desc: 'Выучить 100 слов IELTS', check: (s) => Object.values(s.vocab).filter((v) => v.reps >= 3).length >= 100 },
  { id: 'writer', icon: '✍️', name: 'Писатель', desc: 'Написать 5 эссе IELTS', check: (s) => Object.keys(s.writing).length >= 5 },
  { id: 'speaker', icon: '🎤', name: 'Спикер', desc: 'Пройти 10 speaking-карточек', check: (s) => Object.keys(s.speaking).length >= 10 },
  { id: 'early-bird', icon: '🌅', name: 'Ранняя пташка', desc: 'Заниматься до 9 утра (2-я смена — сила!)', check: (s) => s.sessions.some((x) => new Date(x.at).getHours() < 9) },
  { id: 'xp-1000', icon: '🎖️', name: '1000 XP', desc: 'Набрать 1000 опыта', check: (s) => s.xp >= 1000 },
  { id: 'xp-5000', icon: '🏅', name: '5000 XP', desc: 'Набрать 5000 опыта', check: (s) => s.xp >= 5000 },
];

export function badgeById(id) {
  return BADGES.find((b) => b.id === id) || null;
}

/** Возвращает список id новых бейджей, которые заслужены, но ещё не выданы. */
export function newlyEarned(state) {
  const owned = new Set(state.badges || []);
  return BADGES.filter((b) => !owned.has(b.id) && safeCheck(b, state)).map((b) => b.id);
}

function safeCheck(badge, state) {
  try {
    return !!badge.check(state);
  } catch (error) {
    console.error(`Ошибка проверки бейджа ${badge.id}:`, error);
    return false;
  }
}
