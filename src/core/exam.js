// Сборка пробного экзамена в формате ЕНТ из банка вопросов по темам.
// Секция состоит из частей: plain (один ответ), multi (несколько ответов), match (соответствие), context (по контексту).

import { loadTopics, topicWeight, topicsOf, ubtSubjects } from './content.js';
import { createRng, randomSeed, shuffle, weightedIndex } from './random.js';

export const EXAM_STORAGE_KEY = 'qadam.exam.inprogress';
export const EXAM_RESULT_KEY = 'qadam.exam.last';
export const MINI_MINUTES = 45;
const MINI_DIVISOR = 4;
const PART_ORDER = ['plain', 'multi', 'match', 'context'];

const PART_FILTER = {
  plain: (q) => q.type === 'single' && q.format === 'plain',
  multi: (q) => q.type === 'multi',
  match: (q) => q.type === 'match',
  context: (q) => q.type === 'single' && q.format === 'context',
};

function miniCount(n) {
  return n > 0 ? Math.max(1, Math.round(n / MINI_DIVISOR)) : 0;
}

function partsOf(exam, mode) {
  const full = {
    plain: exam.single ?? 0,
    multi: exam.multi ?? 0,
    match: exam.match ?? 0,
    context: exam.context ?? 0,
  };
  if (mode !== 'mini') return full;
  return Object.fromEntries(Object.entries(full).map(([k, v]) => [k, miniCount(v)]));
}

/** Конфигурация секций по режиму. Формат берётся из subjects[].exam манифеста. */
export function examConfig(mode) {
  const sections = ubtSubjects().map((s) => {
    const parts = partsOf(s.exam || {}, mode);
    return {
      subject: s.id,
      name: s.name,
      short: s.short || s.name,
      color: s.color,
      parts,
      target: Object.values(parts).reduce((a, b) => a + b, 0),
    };
  });
  const fullMinutes = ubtSubjects()[0]?.exam?.durationMinutes || 240;
  return { mode, sections, durationMinutes: mode === 'mini' ? MINI_MINUTES : fullMinutes };
}

function makePools(topics, filter, rng, used) {
  return topics
    .map((t) => ({ topic: t, weight: topicWeight(t.meta), questions: shuffle(t.questions.filter((q) => filter(q) && !used.has(q.id)), rng) }))
    .filter((p) => p.questions.length);
}

function takeSiblings(pool, question, picked, count, used) {
  if (!question.context) return pool.questions;
  let rest = pool.questions;
  for (const sibling of rest.filter((x) => x.context === question.context)) {
    if (picked.length >= count) break;
    rest = rest.filter((x) => x.id !== sibling.id);
    used.add(sibling.id);
    picked.push(sibling);
  }
  return rest;
}

/** Выбирает вопросы части: темы берутся пропорционально весу, контекстные вопросы — группами. */
function pickPart(topics, filter, count, rng, used) {
  const pools = makePools(topics, filter, rng, used);
  const picked = [];
  let guard = 0;
  while (picked.length < count && pools.some((p) => p.questions.length) && guard < 5000) {
    guard += 1;
    const idx = weightedIndex(pools.map((p) => (p.questions.length ? p.weight : 0)), rng);
    const pool = pools[idx];
    const question = pool.questions[pool.questions.length - 1];
    if (!question) continue;
    pool.questions = pool.questions.slice(0, -1);
    used.add(question.id);
    picked.push(question);
    pool.questions = takeSiblings(pool, question, picked, count, used);
  }
  return picked;
}

function orderWithContexts(questions, rng) {
  const groups = new Map();
  const order = [];
  for (const q of questions) {
    const key = q.context ? `${q.topicId}:${q.context}` : q.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(q);
  }
  return shuffle(order, rng).flatMap((key) => groups.get(key));
}

function buildSection(section, topics, rng) {
  const used = new Set();
  const byPart = {};
  for (const part of PART_ORDER) byPart[part] = pickPart(topics, PART_FILTER[part], section.parts[part] || 0, rng, used);
  const picked = PART_ORDER.reduce((n, part) => n + byPart[part].length, 0);
  const missing = section.target - picked;
  if (missing > 0) byPart.plain = [...byPart.plain, ...pickPart(topics, PART_FILTER.plain, missing, rng, used)];
  const questions = PART_ORDER.flatMap((part) => orderWithContexts(byPart[part], rng));
  return { ...section, questions, shortage: section.target - questions.length };
}

/** Собирает экзамен. Детерминирован по seed (при неизменном контенте). */
export async function buildExam({ mode = 'full', seed = randomSeed() } = {}) {
  const config = examConfig(mode);
  const rng = createRng(seed);
  const sections = [];
  for (const section of config.sections) {
    const metas = topicsOf(section.subject, { kind: 'lesson' });
    const loaded = await loadTopics(metas.map((m) => m.id));
    const topics = loaded.map((t, i) => ({ ...t, meta: metas[i] }));
    const built = buildSection(section, topics, rng);
    sections.push({ ...built, topicsById: Object.fromEntries(topics.map((t) => [t.id, t])) });
  }
  return { id: `exam-${seed}`, mode, seed, createdAt: Date.now(), durationMinutes: config.durationMinutes, sections };
}

function readKey(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`Не удалось прочитать ${key}:`, error);
    return null;
  }
}

function writeKey(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Не удалось сохранить ${key}:`, error);
  }
}

function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error(`Не удалось очистить ${key}:`, error);
  }
}

export function saveInProgress(snapshot) {
  writeKey(EXAM_STORAGE_KEY, snapshot);
}

export function loadInProgress() {
  return readKey(EXAM_STORAGE_KEY);
}

export function clearInProgress() {
  removeKey(EXAM_STORAGE_KEY);
}

export function saveLastResult(detail) {
  writeKey(EXAM_RESULT_KEY, detail);
}

export function loadLastResult() {
  return readKey(EXAM_RESULT_KEY);
}
