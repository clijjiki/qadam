// Тренажёр Python: разделы курса, прогресс и переход к следующей задаче.

import { h } from '../core/dom.js';
import { loadPyCatalog, topicMeta } from '../core/content.js';
import { findTask, nextTaskId, taskProgress } from '../core/pytrainer.js';
import { warmUp } from '../core/pyrunner.js';
import { pageHead, progressBar, ring } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const LEVEL_LABEL = { 1: 'легко', 2: 'средне', 3: 'сложно' };

function taskRow(task, index, py) {
  const solved = Boolean(py[task.id]?.solved);
  const tried = !solved && py[task.id]?.attempts > 0;
  return h(
    'a',
    { class: `list-item${solved ? ' done' : ''}`, href: `#/python/${task.id}` },
    h('span', { class: 'list-item__num' }, solved ? icon('check', { size: 16 }) : String(index + 1)),
    h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, task.title), h('div', { class: 'list-item__sub' }, LEVEL_LABEL[task.level] || '', tried ? ' · есть попытки' : '')),
  );
}

function unitCard(unit, stats, py) {
  const theory = unit.topicId && topicMeta(unit.topicId) ? h('a', { class: 'btn btn--sm btn--ghost', href: `#/topic/${unit.topicId}` }, 'Теория') : null;
  return h(
    'section',
    { class: 'card stack' },
    h('div', { class: 'row row--between' }, h('h3', { style: { margin: 0 } }, unit.title), h('span', { class: 'muted small nowrap' }, `${stats.solved} из ${stats.total}`)),
    h('p', { class: 'muted small', style: { margin: 0 } }, unit.intro),
    progressBar(stats.total ? stats.solved / stats.total : 0),
    h('div', { class: 'list' }, unit.tasks.map((task, i) => taskRow(task, i, py))),
    theory ? h('div', { class: 'row' }, theory) : null,
  );
}

function heroCard(catalog, py, progress) {
  const nextId = nextTaskId(catalog, py);
  const next = nextId ? findTask(catalog, nextId) : null;
  return h(
    'div',
    { class: 'card row', style: { gap: '20px', flexWrap: 'wrap' } },
    ring({ value: progress.total ? progress.solved / progress.total : 0, size: 76, label: String(progress.solved), sub: `из ${progress.total}` }),
    h(
      'div',
      { class: 'stack', style: { flex: '1 1 240px', gap: '6px' } },
      next ? h('b', {}, `Следующая: ${next.task.title}`) : h('b', {}, 'Все задачи решены. Отличная работа!'),
      h('div', { class: 'muted small' }, next ? next.unit.title : 'Переходи к теме «Списки и строки» и пробникам ЕНТ.'),
    ),
    next ? h('a', { class: 'btn btn--primary', href: `#/python/${next.task.id}` }, progress.solved ? 'Продолжить' : 'Начать') : null,
  );
}

export async function render({ state }) {
  const catalog = await loadPyCatalog();
  const py = state.python || {};
  const progress = taskProgress(catalog, py);
  // Python грузится ~10 МБ — начинаем заранее, пока ученик выбирает задачу.
  warmUp().catch(() => {});
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: 'Тренажёр Python', sub: 'Пиши код прямо здесь — сайт запустит его и проверит на тестах. Задачи идут по порядку, как в учебнике.' }),
    heroCard(catalog, py, progress),
    h('div', { class: 'alert alert--info small' }, 'Первый запуск скачивает Python (около 10 МБ) — нужен интернет. Потом он берётся из кеша браузера.'),
    catalog.units.map((unit, i) => unitCard(unit, progress.units[i], py)),
  );
}
