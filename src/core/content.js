// Загрузка контента: манифест (список предметов и тем) + JSON темы по требованию.
// Язык контента: 'ru' (основной) и 'kk' (перевод в content/kk/...). Если перевода нет —
// возвращаем русскую версию с пометкой translated: false, чтобы страница могла предупредить.

export const CONTENT_LANGS = [
  { id: 'ru', name: 'Русский', short: 'RU' },
  { id: 'kk', name: 'Қазақша', short: 'KK' },
];

let manifest = null;
const topicIndex = new Map();
const topicCache = new Map();
const pending = new Map();

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

async function fetchJSON(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}: HTTP ${response.status}`);
  return response.json();
}

export async function loadManifest() {
  if (manifest) return manifest;
  const data = await fetchJSON('content/manifest.json');
  if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.topics)) {
    throw new Error('Манифест контента повреждён (нет subjects/topics)');
  }
  manifest = data;
  topicIndex.clear();
  for (const topic of data.topics) topicIndex.set(topic.id, topic);
  return manifest;
}

export function getManifest() {
  if (!manifest) throw new Error('Манифест ещё не загружен');
  return manifest;
}

export function subjects() {
  return getManifest().subjects;
}

export function subject(id) {
  return getManifest().subjects.find((s) => s.id === id) || null;
}

export function ubtSubjects() {
  return subjects().filter((s) => s.kind === 'ubt');
}

export function ieltsSubject() {
  return subjects().find((s) => s.kind === 'ielts') || null;
}

export function topicsOf(subjectId, { kind } = {}) {
  return getManifest()
    .topics.filter((t) => t.subject === subjectId && (!kind || t.kind === kind))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function allTopics() {
  return getManifest().topics;
}

export function isContentLang(lang) {
  return CONTENT_LANGS.some((l) => l.id === lang);
}

export function normalizeLang(lang) {
  return isContentLang(lang) ? lang : 'ru';
}

export function langName(lang) {
  const found = CONTENT_LANGS.find((l) => l.id === normalizeLang(lang));
  return found ? found.name : 'Русский';
}

/** Путь к файлу темы на нужном языке: content/kk/<subject>/<id>.json для казахского. */
export function localizedPath(meta, lang) {
  if (normalizeLang(lang) === 'ru') return meta.path;
  return meta.path.replace(/^content\//, 'content/kk/');
}

export function topicMeta(id) {
  return topicIndex.get(id) || null;
}

export function topicWeight(meta) {
  if (!meta) return 1;
  if (Number.isFinite(meta.weight)) return meta.weight;
  return PRIORITY_WEIGHT[meta.priority] || 2;
}

async function fetchTopicData(meta, lang) {
  if (lang === 'ru') return { data: await fetchJSON(meta.path), lang: 'ru', translated: true };
  try {
    return { data: await fetchJSON(localizedPath(meta, lang)), lang, translated: true };
  } catch (error) {
    return { data: await fetchJSON(meta.path), lang: 'ru', translated: false };
  }
}

export async function loadTopic(id, requested = 'ru') {
  const lang = normalizeLang(requested);
  const key = `${lang}:${id}`;
  if (topicCache.has(key)) return topicCache.get(key);
  if (pending.has(key)) return pending.get(key);
  const meta = topicMeta(id);
  if (!meta) throw new Error(`Тема «${id}» не найдена в манифесте`);
  const promise = fetchTopicData(meta, lang)
    .then(({ data, lang: actual, translated }) => {
      const normalized = { ...normalizeTopic(data, meta), lang: actual, requestedLang: lang, translated };
      topicCache.set(key, normalized);
      pending.delete(key);
      return normalized;
    })
    .catch((error) => {
      pending.delete(key);
      throw error;
    });
  pending.set(key, promise);
  return promise;
}

export async function loadTopics(ids, lang = 'ru') {
  return Promise.all(ids.map((id) => loadTopic(id, lang)));
}

/** Приводит тему к единому виду: массивы гарантированы, вопросы получают глобальный id topicId:qid. */
export function normalizeTopic(data, meta) {
  const id = data.id || meta.id;
  const contexts = Array.isArray(data.contexts) ? data.contexts : [];
  const questions = (Array.isArray(data.questions) ? data.questions : []).map((q, index) => ({
    ...q,
    id: `${id}:${q.id || `q${index + 1}`}`,
    localId: q.id || `q${index + 1}`,
    topicId: id,
    subject: data.subject || meta.subject,
    type: ['multi', 'text', 'match'].includes(q.type) ? q.type : 'single',
    format: q.type === 'match' ? 'match' : q.context ? 'context' : 'plain',
    rows: Array.isArray(q.rows) ? q.rows : [],
    answer: Array.isArray(q.answer) ? q.answer : [q.answer],
    difficulty: Number(q.difficulty) || 1,
    options: Array.isArray(q.options) ? q.options : [],
  }));
  return {
    ...data,
    id,
    subject: data.subject || meta.subject,
    kind: data.kind || meta.kind || 'lesson',
    theory: Array.isArray(data.theory) ? data.theory : data.theory ? [String(data.theory)] : [],
    contexts,
    questions,
    words: Array.isArray(data.words) ? data.words : [],
    prompts: Array.isArray(data.prompts) ? data.prompts : [],
    cards: Array.isArray(data.cards) ? data.cards : [],
    passage: typeof data.passage === 'string' ? data.passage : '',
    transcript: typeof data.transcript === 'string' ? data.transcript : '',
  };
}

export function findContext(topic, contextId) {
  if (!contextId) return null;
  return (topic.contexts || []).find((c) => c.id === contextId) || null;
}
