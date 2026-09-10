// Загрузка контента: манифест (список предметов и тем) + JSON темы по требованию.

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

export function topicMeta(id) {
  return topicIndex.get(id) || null;
}

export function topicWeight(meta) {
  if (!meta) return 1;
  if (Number.isFinite(meta.weight)) return meta.weight;
  return PRIORITY_WEIGHT[meta.priority] || 2;
}

export async function loadTopic(id) {
  if (topicCache.has(id)) return topicCache.get(id);
  if (pending.has(id)) return pending.get(id);
  const meta = topicMeta(id);
  if (!meta) throw new Error(`Тема «${id}» не найдена в манифесте`);
  const promise = fetchJSON(meta.path)
    .then((data) => {
      const normalized = normalizeTopic(data, meta);
      topicCache.set(id, normalized);
      pending.delete(id);
      return normalized;
    })
    .catch((error) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, promise);
  return promise;
}

export async function loadTopics(ids) {
  return Promise.all(ids.map((id) => loadTopic(id)));
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
