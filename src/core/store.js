// Хранилище прогресса в localStorage. Состояние иммутабельно: update(fn) возвращает новый объект.

import { normalizeLang } from './content.js';
import { DEFAULT_GRADE, DEFAULT_TRACK, normalizeGrade, normalizeTrack } from './curriculum.js';

export const STORAGE_KEY = 'qadam.v1';
export const STATE_VERSION = 1;

const listeners = new Set();
let memoryFallback = null;

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    profile: {
      name: '',
      examDate: '2028-06-01',
      ieltsDate: '',
      targetScore: 120,
      ieltsTarget: 7,
      hoursPerWeek: 6,
      shift: 2,
      grade: DEFAULT_GRADE,
      track: DEFAULT_TRACK,
      onboarded: false,
      createdAt: Date.now(),
    },
    settings: {
      theme: 'auto',
      dailyGoalMinutes: 25,
      shuffleOptions: true,
      showTimer: true,
      contentLang: 'ru',
    },
    topics: {},
    questions: {},
    vocab: {},
    sessions: [],
    exams: [],
    daily: {},
    writing: {},
    speaking: {},
    python: {},
    english: {},
    lessons: {},
    weekly: {},
    xp: 0,
    badges: [],
    missions: {},
    forecast: {},
  };
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.error('Не удалось прочитать сохранённый прогресс:', error);
    return null;
  }
}

/**
 * Настройки: `examLang` (язык только для пробников) стал общим `contentLang` —
 * переносим старое значение, чтобы выбор пользователя не сбросился.
 */
export function migrateSettings(base, saved = {}) {
  const { examLang, ...rest } = { ...base, ...saved };
  // Порядок важен: у base всегда есть contentLang, поэтому сначала смотрим на сохранённые значения.
  const chosen = saved?.contentLang || examLang || base.contentLang;
  return { ...rest, contentLang: normalizeLang(chosen) };
}

/** Профиль: класс и трек появились позже — старым профилям ставим значения по умолчанию. */
export function migrateProfile(base, saved = {}) {
  const merged = { ...base, ...(saved || {}) };
  return { ...merged, grade: normalizeGrade(merged.grade), track: normalizeTrack(merged.track) };
}

/** Приводит старые/неполные данные к актуальной форме, не теряя прогресс. */
export function migrate(saved) {
  const base = createDefaultState();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    version: STATE_VERSION,
    profile: migrateProfile(base.profile, saved.profile),
    settings: migrateSettings(base.settings, saved.settings),
    topics: saved.topics || {},
    questions: saved.questions || {},
    vocab: saved.vocab || {},
    sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
    exams: Array.isArray(saved.exams) ? saved.exams : [],
    daily: saved.daily || {},
    writing: saved.writing || {},
    speaking: saved.speaking || {},
    python: saved.python || {},
    english: saved.english || {},
    lessons: saved.lessons || {},
    weekly: saved.weekly || {},
    xp: Number(saved.xp) || 0,
    badges: Array.isArray(saved.badges) ? saved.badges : [],
    missions: saved.missions || {},
    forecast: saved.forecast || {},
  };
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? safeParse(raw) : null;
  } catch (error) {
    console.error('localStorage недоступен, прогресс будет храниться только в памяти:', error);
    return memoryFallback;
  }
}

function writeStorage(state) {
  memoryFallback = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Не удалось сохранить прогресс:', error);
    return false;
  }
}

let state = migrate(readStorage());

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.error('Ошибка подписчика store:', error);
    }
  }
}

/** update(prev => next). Функция должна вернуть НОВЫЙ объект состояния. */
export function update(reducer) {
  const next = reducer(state);
  if (!next || typeof next !== 'object') throw new Error('update(): reducer должен вернуть объект состояния');
  if (next === state) return state;
  state = next;
  writeStorage(state);
  notify();
  return state;
}

export function exportJSON() {
  return JSON.stringify({ app: 'qadam', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  const parsed = safeParse(text);
  if (!parsed) throw new Error('Файл не является корректным JSON');
  const candidate = parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
  if (!candidate.profile || !candidate.topics) throw new Error('В файле нет данных прогресса Qadam');
  state = migrate(candidate);
  writeStorage(state);
  notify();
  return state;
}

export function resetState() {
  state = createDefaultState();
  writeStorage(state);
  notify();
  return state;
}

// ---------- иммутабельные помощники ----------

export function setIn(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const current = obj && typeof obj === 'object' ? obj : {};
  return { ...current, [head]: setIn(current[head], rest, value) };
}

export function updateIn(obj, path, fn) {
  const current = getIn(obj, path);
  return setIn(obj, path, fn(current));
}

export function getIn(obj, path) {
  return path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}
