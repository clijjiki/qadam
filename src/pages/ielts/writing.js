// IELTS Writing: список заданий, редактор с таймером и автосохранением, самопроверка по критериям.

import { h, formatDuration, replaceChildren } from '../../core/dom.js';
import { loadLocalTopic, topicMeta, topicsOf } from '../../core/content.js';
import { renderMarkdown } from '../../core/markdown.js';
import { mountMath } from '../../core/math.js';
import { saveWriting } from '../../core/actions.js';
import { getState } from '../../core/store.js';
import { roundHalf } from '../../core/mastery.js';
import { formatDate } from '../../core/time.js';
import { toast } from '../../ui/toast.js';
import { emptyState, pageHead } from '../../ui/components.js';

const SCALE = [5, 5.5, 6, 6.5, 7, 7.5, 8];
const AUTOSAVE_MS = 800;
const RED_ZONE_SECONDS = 180;
const SUBMIT_RATIO = 0.6;
const MY_WORKS_LIMIT = 10;

const TASK_ACHIEVEMENT = {
  5: 'Описание есть, но без overview; данные не сравниваются, есть неточности',
  6: 'Есть overview и ключевые черты, но детали местами неполные или неточные',
  7: 'Чёткий overview, ключевые черты выделены и подкреплены цифрами',
  8: 'Все требования покрыты полно и точно, умелый выбор ключевых данных',
};
const TASK_RESPONSE = {
  5: 'Тема раскрыта частично, позиция неясная, аргументы слабо развиты',
  6: 'Все части задания затронуты, позиция ясна, но аргументы развиты неровно',
  7: 'Все части раскрыты, ясная позиция во всём эссе, идеи развиты и поддержаны',
  8: 'Полный ответ, хорошо развитая позиция с уместными расширенными примерами',
};
const COHERENCE = {
  5: 'Связки есть, но механические или неверные; абзацы не всегда логичны',
  6: 'Текст организован связно, но связки местами избыточны или неточны',
  7: 'Логичная организация, ясное развитие, разнообразные связки с редкими сбоями',
  8: 'Идеи выстроены логично, абзацы продуманы, связки почти незаметны',
};
const LEXIS = {
  5: 'Ограниченный словарь, частые ошибки в словообразовании и написании',
  6: 'Достаточный словарь, есть попытки редкой лексики, ошибки не мешают пониманию',
  7: 'Гибкий словарь, точные коллокации, редкие ошибки в выборе слов',
  8: 'Широкий и естественный словарь, лишь редкие неточности и опечатки',
};
const GRAMMAR = {
  5: 'Ограниченный набор структур, частые ошибки, иногда мешают пониманию',
  6: 'Смесь простых и сложных предложений, ошибки редко мешают пониманию',
  7: 'Много сложных структур, безошибочные предложения встречаются часто',
  8: 'Широкий набор структур, большинство предложений без ошибок',
};

let timerId = null;
let saveTimerId = null;
let flushDraft = null;

function criteriaFor(task) {
  const first = task === 1 ? { key: 'task', name: 'Task Achievement', levels: TASK_ACHIEVEMENT } : { key: 'task', name: 'Task Response', levels: TASK_RESPONSE };
  return [first, { key: 'cc', name: 'Coherence & Cohesion', levels: COHERENCE }, { key: 'lr', name: 'Lexical Resource', levels: LEXIS }, { key: 'gra', name: 'Grammatical Range & Accuracy', levels: GRAMMAR }];
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function editorHref(topicId, promptId) {
  return `#/ielts/writing?topic=${encodeURIComponent(topicId)}&prompt=${encodeURIComponent(promptId)}`;
}

function statusBadge(entry) {
  if (entry?.band) return h('span', { class: 'badge badge--success' }, `сдано · Band ${entry.band}`);
  if (entry?.words) return h('span', { class: 'badge badge--warn' }, `черновик · ${entry.words} сл.`);
  return h('span', { class: 'badge' }, 'не начато');
}

function taskBadge(task) {
  return h('span', { class: 'list-item__num' }, `T${task === 1 ? 1 : 2}`);
}

function stopTimers() {
  if (timerId) window.clearInterval(timerId);
  if (saveTimerId) window.clearTimeout(saveTimerId);
  timerId = null;
  saveTimerId = null;
}

async function loadSafely(meta) {
  try {
    return { meta, topic: await loadLocalTopic(getState(), meta.id), error: null };
  } catch (error) {
    console.error('Не удалось загрузить тему письма', meta.id, error);
    return { meta, topic: null, error };
  }
}

// ---------- Экран 1: список ----------

function promptRow(meta, prompt, writing) {
  const entry = writing[prompt.id];
  return h(
    'a',
    { class: entry?.band ? 'list-item done' : 'list-item', href: editorHref(meta.id, prompt.id) },
    taskBadge(prompt.task),
    h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, prompt.title || prompt.id), h('div', { class: 'list-item__sub' }, `мин. ${prompt.minWords || 0} слов · ${prompt.minutes || 0} мин`)),
    statusBadge(entry),
  );
}

function topicCard({ meta, topic, error }, writing) {
  const head = h('div', { class: 'row row--between' }, h('div', {}, h('div', { class: 'card__title' }, meta.title), h('div', { class: 'card__sub' }, meta.summary || '')), h('a', { class: 'btn btn--sm', href: `#/topic/${meta.id}` }, '📖 Теория'));
  if (error) return h('div', { class: 'card stack' }, head, h('div', { class: 'alert alert--warn small' }, 'Задания этой темы пока не загружены. Загляни позже или ', h('a', { href: '#/ielts' }, 'выбери другой раздел IELTS'), '.'));
  if (!topic.prompts.length) return h('div', { class: 'card stack' }, head, h('p', { class: 'muted small', style: { margin: 0 } }, 'Заданий пока нет — прочитай теорию, чтобы не терять время.'));
  return h('div', { class: 'card stack' }, head, h('div', { class: 'list' }, topic.prompts.map((p) => promptRow(meta, p, writing))));
}

function promptIndex(loaded) {
  const map = new Map();
  for (const { meta, topic } of loaded) for (const p of topic?.prompts || []) map.set(p.id, { topicId: meta.id, title: p.title || p.id, task: p.task });
  return map;
}

function workRow(promptId, entry, info) {
  const title = info?.title || promptId;
  const status = entry.band ? h('span', { class: 'badge badge--success' }, `Band ${entry.band}`) : h('span', { class: 'badge badge--warn' }, 'черновик');
  const sub = `${entry.words || 0} слов · ${formatDate(entry.updatedAt || entry.createdAt || Date.now())}`;
  const main = h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, title), h('div', { class: 'list-item__sub' }, sub));
  if (!info) return h('div', { class: 'list-item' }, taskBadge(2), main, status);
  return h('a', { class: 'list-item', href: editorHref(info.topicId, promptId) }, taskBadge(info.task), main, status);
}

function myWorks(writing, loaded, firstHref) {
  const entries = Object.entries(writing || {}).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)).slice(0, MY_WORKS_LIMIT);
  const body = entries.length
    ? h('div', { class: 'list' }, entries.map(([id, entry]) => workRow(id, entry, promptIndex(loaded).get(id))))
    : emptyState({ icon: '✍️', title: 'Работ пока нет', sub: 'Напиши первое эссе — таймер и самопроверка уже готовы.', action: firstHref ? { label: 'Начать первое задание', href: firstHref } : { label: 'К разделу IELTS', href: '#/ielts' } });
  return h('div', { class: 'card stack' }, h('div', { class: 'card__title' }, 'Мои работы'), body);
}

async function renderList(state) {
  const metas = topicsOf('ielts', { kind: 'writing' });
  if (!metas.length) return emptyState({ icon: '✍️', title: 'Раздел Writing ещё пуст', sub: 'Темы появятся позже.', action: { label: 'К разделу IELTS', href: '#/ielts' } });
  const loaded = await Promise.all(metas.map(loadSafely));
  const first = loaded.find((x) => x.topic?.prompts.length);
  const firstHref = first ? editorHref(first.meta.id, first.topic.prompts[0].id) : null;
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: 'IELTS Writing', sub: 'Пиши по таймеру, считай слова, оценивай себя по официальным критериям.', crumbs: [{ label: 'IELTS', href: '#/ielts' }] }),
    h('div', { class: 'grid grid--2' }, loaded.map((item) => topicCard(item, state.writing || {}))),
    myWorks(state.writing, loaded, firstHref),
  );
}

// ---------- Экран 2: редактор ----------

function createTimer(minutes, onTick) {
  const total = Math.max(1, Number(minutes) || 20) * 60;
  let elapsed = 0;
  let running = false;
  const tick = () => {
    elapsed += 1;
    if (elapsed >= total) {
      running = false;
      stopTimers();
      toast('Время вышло — на экзамене тут нужно было бы сдать работу', { tone: 'danger' });
    }
    onTick(total - elapsed, running);
  };
  return {
    toggle() {
      running = !running;
      if (timerId) window.clearInterval(timerId);
      timerId = running ? window.setInterval(tick, 1000) : null;
      onTick(total - elapsed, running);
    },
    remaining: () => total - elapsed,
    elapsed: () => elapsed,
    isRunning: () => running,
  };
}

function timerCard(prompt) {
  const display = h('div', { class: 'speak-timer' }, formatDuration((prompt.minutes || 20) * 60));
  const button = h('button', { class: 'btn btn--primary btn--block' }, '▶ Старт');
  const timer = createTimer(prompt.minutes, (remaining, running) => {
    display.textContent = formatDuration(remaining);
    display.style.color = remaining < RED_ZONE_SECONDS ? 'var(--danger)' : '';
    button.textContent = running ? '⏸ Пауза' : remaining <= 0 ? 'Время вышло' : '▶ Старт';
    button.disabled = remaining <= 0;
  });
  button.addEventListener('click', () => timer.toggle());
  const card = h('div', { class: 'card stack' }, h('div', { class: 'card__title' }, `⏱ ${prompt.minutes || 20} минут`), display, button, h('p', { class: 'muted small', style: { margin: 0 } }, 'Красный цвет — меньше 3 минут. Успей проверить грамматику.'));
  return { card, timer };
}

function checklistCard(prompt) {
  if (!prompt.checklist?.length) return null;
  return h('div', { class: 'card stack' }, h('div', { class: 'card__title' }, '✅ Проверь перед сдачей'), h('div', { class: 'checklist' }, prompt.checklist.map((item) => h('label', {}, h('input', { type: 'checkbox' }), h('span', {}, item)))));
}

function sampleView(sample) {
  const notes = sample.notes?.length ? h('div', {}, h('b', { class: 'small' }, 'Что важно:'), h('ul', {}, sample.notes.map((n) => h('li', {}, n)))) : null;
  const body = h('div', { class: 'stack' }, h('div', { class: 'prose', html: renderMarkdown(sample.text || '') }), notes);
  mountMath(body);
  return h('details', { class: 'sample' }, h('summary', {}, h('b', {}, `Образец Band ${sample.band}`)), body);
}

function samplesCard(prompt) {
  if (!prompt.samples?.length) return h('div', { class: 'alert alert--info' }, 'Образцов для этого задания пока нет. Сравни свою работу с критериями выше.');
  return h('div', { class: 'card stack' }, h('div', { class: 'card__title' }, '📚 Образцы ответов'), h('p', { class: 'muted small', style: { margin: 0 } }, 'Сначала сравни структуру, потом лексику. Заметки — на русском.'), prompt.samples.map(sampleView));
}

function rubricRow(criterion, picked, onPick) {
  const buttons = SCALE.map((value) => h('button', { type: 'button', class: value === picked ? 'active' : '', onClick: () => onPick(criterion.key, value) }, String(value)));
  const levels = [5, 6, 7, 8].map((band) => h('div', { class: 'small' }, h('b', {}, `${band}.0 `), criterion.levels[band]));
  return h('div', { class: 'rubric__row' }, h('div', {}, h('div', { class: 'list-item__title' }, criterion.name), h('div', { class: 'muted', style: { display: 'grid', gap: '2px', marginTop: '4px' } }, levels)), h('div', { class: 'rubric__scale' }, buttons));
}

function overallOf(rubric) {
  const values = Object.values(rubric).filter((v) => Number.isFinite(v));
  return values.length ? roundHalf(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function rubricCard(prompt, initial, onSave) {
  let rubric = { ...(initial || {}) };
  const criteria = criteriaFor(prompt.task);
  const total = h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, '—'), h('div', { class: 'stat__label' }, 'Итоговый band'));
  const rows = h('div', { class: 'rubric' });
  const save = h('button', { class: 'btn btn--success', disabled: true, onClick: () => onSave(rubric, overallOf(rubric)) }, 'Сохранить оценку');
  const refresh = () => {
    replaceChildren(rows, criteria.map((c) => rubricRow(c, rubric[c.key], pick)));
    const overall = overallOf(rubric);
    total.firstChild.textContent = overall ? String(overall) : '—';
    save.disabled = criteria.some((c) => !rubric[c.key]);
  };
  const pick = (key, value) => {
    rubric = { ...rubric, [key]: value };
    refresh();
  };
  refresh();
  return h('div', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('div', {}, h('div', { class: 'card__title' }, '🎯 Самопроверка'), h('div', { class: 'card__sub' }, 'Честно выбери band по каждому критерию — среднее округлится до 0.5.')), total), rows, h('div', { class: 'row' }, save));
}

function promptCard(prompt) {
  const body = h('div', { class: 'prose', html: renderMarkdown(prompt.prompt || '') });
  mountMath(body);
  return h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('span', { class: 'badge badge--primary' }, `Task ${prompt.task === 1 ? 1 : 2}`), h('span', { class: 'badge' }, `минимум ${prompt.minWords || 0} слов`), h('span', { class: 'badge' }, `${prompt.minutes || 20} мин`)), body);
}

function editorCard(prompt, existing, { onDraft, onSubmit }) {
  const minWords = Number(prompt.minWords) || 150;
  const counter = h('div', { class: 'wordcount' });
  const submit = h('button', { class: 'btn btn--primary' }, 'Сдать на самопроверку');
  const area = h('textarea', { class: 'input editor', placeholder: 'Пиши здесь. Черновик сохраняется сам.', spellcheck: 'false' }, existing?.text || '');
  const sync = () => {
    const words = countWords(area.value);
    counter.textContent = `${words} слов · минимум ${minWords}`;
    counter.className = words >= minWords ? 'wordcount ok' : 'wordcount low';
    submit.disabled = words < minWords * SUBMIT_RATIO;
    return words;
  };
  area.addEventListener('input', () => {
    const words = sync();
    if (saveTimerId) window.clearTimeout(saveTimerId);
    flushDraft = () => {
      flushDraft = null;
      onDraft(area.value, words);
    };
    saveTimerId = window.setTimeout(() => flushDraft && flushDraft(), AUTOSAVE_MS);
  });
  submit.addEventListener('click', () => onSubmit(area.value, countWords(area.value)));
  sync();
  return h('div', { class: 'card stack' }, area, h('div', { class: 'row row--between' }, counter, submit));
}

function buildEditor(meta, prompt, state) {
  const promptId = prompt.id;
  const existing = state.writing?.[promptId] || null;
  const { card: timerBox, timer } = timerCard(prompt);
  const results = h('div', { class: 'stack' });
  const showSamples = () => replaceChildren(results, rubricNode(), samplesCard(prompt));
  const onSave = (rubric, band) => {
    if (flushDraft) flushDraft();
    const text = editor.querySelector('textarea').value;
    saveWriting(promptId, { text, words: countWords(text), band, rubric, seconds: timer.elapsed() });
    toast(`Оценка сохранена: Band ${band}. +15 XP за первую сдачу`, { tone: 'success' });
    showSamples();
  };
  const rubricNode = () => rubricCard(prompt, getState().writing?.[promptId]?.rubric, onSave);
  const editor = editorCard(prompt, existing, {
    onDraft: (text, words) => saveWriting(promptId, { text, words }),
    onSubmit: () => {
      if (flushDraft) flushDraft();
      replaceChildren(results, rubricNode());
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  if (existing?.band) showSamples();
  const status = existing?.band ? h('div', { class: 'alert alert--success small' }, `Уже сдано: Band ${existing.band}. Можно переписать и оценить заново.`) : null;
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: prompt.title || promptId, sub: meta.title, crumbs: [{ label: 'IELTS', href: '#/ielts' }, { label: 'Writing', href: '#/ielts/writing' }] }),
    status,
    h('div', { class: 'grid writing-layout' }, h('div', { class: 'stack' }, promptCard(prompt), editor, results), h('div', { class: 'stack' }, timerBox, checklistCard(prompt))),
  );
}

async function renderEditor(query, state) {
  const meta = topicMeta(query.topic);
  if (!meta || meta.kind !== 'writing') return emptyState({ icon: '🧭', title: 'Тема не найдена', action: { label: 'К списку заданий', href: '#/ielts/writing' } });
  const { topic, error } = await loadSafely(meta);
  if (error) return h('div', { class: 'stack' }, pageHead({ title: meta.title, crumbs: [{ label: 'IELTS', href: '#/ielts' }, { label: 'Writing', href: '#/ielts/writing' }] }), h('div', { class: 'alert alert--warn' }, 'Задания этой темы пока не загружены. ', h('a', { href: '#/ielts/writing' }, 'Вернуться к списку')));
  const prompt = topic.prompts.find((p) => p.id === query.prompt) || topic.prompts[0];
  if (!prompt) return emptyState({ icon: '✍️', title: 'В этой теме пока нет заданий', action: { label: 'К списку заданий', href: '#/ielts/writing' } });
  return buildEditor(meta, prompt, state);
}

export async function render({ query = {}, state }) {
  stopTimers();
  flushDraft = null;
  return query.topic ? renderEditor(query, state) : renderList(state);
}

export function unmount() {
  if (flushDraft) flushDraft();
  stopTimers();
}
