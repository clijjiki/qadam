// Задача тренажёра Python: условие, редактор, запуск со своим вводом и проверка на тестах.

import { h, replaceChildren } from '../core/dom.js';
import { loadPyCatalog } from '../core/content.js';
import { renderMarkdown } from '../core/markdown.js';
import { evaluateRuns, explainError, findTask } from '../core/pytrainer.js';
import { RUN_TIMEOUT_MS, runPython, runTests, warmUp } from '../core/pyrunner.js';
import { recordPyCheck, savePyCode } from '../core/actions.js';
import { getState } from '../core/store.js';
import { pageHead } from '../ui/components.js';
import { codeEditor } from '../ui/code-editor.js';
import { toast } from '../ui/toast.js';

const LEVEL_LABEL = { 1: 'легко', 2: 'средне', 3: 'сложно' };
const SAVE_DELAY_MS = 600;
const ATTEMPTS_FOR_SOLUTION = 2;

let saveTimer = null;
let disposed = false;

const onVisibility = () => {
  if (document.hidden) flushSave();
};

function flushSave() {
  if (saveTimer) window.clearTimeout(saveTimer.id);
  if (saveTimer) saveTimer.run();
  saveTimer = null;
}

function scheduleSave(taskId, code) {
  if (saveTimer) window.clearTimeout(saveTimer.id);
  const run = () => savePyCode(taskId, code);
  saveTimer = { id: window.setTimeout(() => { saveTimer = null; run(); }, SAVE_DELAY_MS), run };
}

const pre = (text, extra = '') => h('pre', { class: `code-out ${extra}` }, text === '' ? '(пусто)' : text);

function errorBlock(error) {
  const info = explainError(error);
  return h(
    'div',
    { class: 'stack', style: { gap: '6px' } },
    pre(error, 'code-out--error'),
    info ? h('div', { class: 'alert alert--warn small' }, h('b', {}, info.line ? `Строка ${info.line}. ` : ''), info.hint) : null,
  );
}

function runView(result) {
  if (result.timedOut) return h('div', { class: 'alert alert--danger small' }, `Программа работала дольше ${RUN_TIMEOUT_MS / 1000} секунд и была остановлена. Скорее всего, цикл не заканчивается.`);
  return h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'muted small' }, 'Вывод программы'), pre(result.stdout), result.error ? errorBlock(result.error) : null);
}

function testCaseView(testCase, result, index) {
  const title = `Тест ${index + 1}: ${result.ok ? 'пройден' : { timeout: 'время вышло', error: 'ошибка', mismatch: 'неверный вывод', skipped: 'не запускался' }[result.reason]}`;
  if (result.ok) return h('div', { class: 'test-row test-row--ok' }, title);
  const details = h(
    'div',
    { class: 'grid grid--3 test-row__details' },
    h('div', {}, h('div', { class: 'muted small' }, 'Ввод'), pre(testCase.input.replace(/\n$/, ''))),
    h('div', {}, h('div', { class: 'muted small' }, 'Ожидалось'), pre(testCase.output)),
    h('div', {}, h('div', { class: 'muted small' }, 'Получено'), result.run ? pre(result.run.stdout.replace(/\n$/, '')) : pre('—')),
  );
  const mismatch = result.diff && !result.diff.ok ? h('div', { class: 'small' }, `Первое расхождение — строка ${result.diff.line}.`) : null;
  return h('div', { class: 'test-row test-row--fail stack' }, h('b', {}, title), details, mismatch, result.run?.error ? errorBlock(result.run.error) : null);
}

function checkView(task, report) {
  const all = report.passed === report.total;
  return h(
    'div',
    { class: 'stack', style: { gap: '8px' } },
    h('div', { class: `alert ${all ? 'alert--success' : 'alert--danger'}` }, all ? `Все тесты пройдены (${report.total} из ${report.total}). Задача решена!` : `Пройдено ${report.passed} из ${report.total}. Посмотри, где вывод отличается.`),
    report.results.map((result, i) => testCaseView(task.tests[i], result, i)),
  );
}

function sampleBlock(task) {
  const sample = task.tests[0];
  if (!sample) return null;
  const hasInput = sample.input.trim() !== '';
  return h(
    'div',
    { class: hasInput ? 'grid grid--2' : 'stack' },
    hasInput ? h('div', {}, h('div', { class: 'muted small' }, 'Пример ввода'), pre(sample.input.replace(/\n$/, ''))) : null,
    h('div', {}, h('div', { class: 'muted small' }, 'Пример вывода'), pre(sample.output)),
  );
}

function taskView(found, state) {
  const { task, unit, prevId, nextId } = found;
  const saved = state.python?.[task.id];
  const output = h('div', { class: 'stack' });
  const status = h('span', { class: 'muted small' }, '');
  const stdin = h('textarea', { class: 'input code-stdin', rows: 3, placeholder: 'Входные данные для «Запустить», по строкам', spellcheck: 'false' });
  stdin.value = task.tests[0]?.input.replace(/\n$/, '') || '';
  const hintBox = h('div');
  const solutionBox = h('div');
  let busy = false;

  const editor = codeEditor({ value: saved?.code ?? task.starter, onChange: (code) => scheduleSave(task.id, code), onRun: () => check() });
  const buttons = [];

  const withBusy = async (label, fn) => {
    if (busy) return;
    busy = true;
    for (const b of buttons) b.disabled = true;
    status.textContent = label;
    try {
      await fn();
      status.textContent = '';
    } catch (error) {
      console.error('Тренажёр Python:', error);
      status.textContent = '';
      replaceChildren(output, h('div', { class: 'alert alert--danger small' }, error.message || 'Не удалось запустить код'));
    } finally {
      busy = false;
      for (const b of buttons) b.disabled = false;
    }
  };

  const run = () =>
    withBusy('Запускаем…', async () => {
      flushSave();
      const input = stdin.value.endsWith('\n') || !stdin.value ? stdin.value : `${stdin.value}\n`;
      const result = await runPython(editor.value, input);
      if (!disposed) replaceChildren(output, runView(result));
    });

  const check = () =>
    withBusy('Проверяем на тестах…', async () => {
      flushSave();
      const code = editor.value;
      const runs = await runTests(code, task.tests, { isCancelled: () => disposed });
      if (disposed) return;
      const report = evaluateRuns(task.tests, runs);
      const ok = report.passed === report.total;
      const first = recordPyCheck(task.id, { ok, code, level: task.level });
      if (first) toast('Задача решена! +XP', { tone: 'success' });
      replaceChildren(output, checkView(task, report), ok && nextId ? h('a', { class: 'btn btn--primary', href: `#/python/${nextId}` }, 'Следующая задача') : null);
      if (!ok) offerSolution();
    });

  const showSolution = () => replaceChildren(solutionBox, h('div', { class: 'card card--flat stack' }, h('b', {}, 'Одно из верных решений'), pre(task.solution.replace(/\n$/, '')), h('div', { class: 'muted small' }, 'Разберись, почему оно работает, и напиши своё — не копируй.')));

  function offerSolution() {
    const attempts = getState().python?.[task.id]?.attempts || 0;
    if (attempts >= ATTEMPTS_FOR_SOLUTION && !solutionBox.firstChild) replaceChildren(solutionBox, h('button', { class: 'btn btn--ghost btn--sm', onClick: showSolution }, 'Показать решение'));
  }

  const runBtn = h('button', { class: 'btn', onClick: run }, 'Запустить');
  const checkBtn = h('button', { class: 'btn btn--primary', onClick: check, title: 'Ctrl+Enter' }, 'Проверить');
  const hintBtn = h('button', { class: 'btn btn--ghost', onClick: () => replaceChildren(hintBox, h('div', { class: 'alert alert--info small' }, h('b', {}, 'Подсказка. '), task.hint)) }, 'Подсказка');
  const resetBtn = h('button', {
    class: 'btn btn--ghost',
    onClick: () => {
      if (!window.confirm('Вернуть исходную заготовку? Твой код будет удалён.')) return;
      editor.value = task.starter;
      scheduleSave(task.id, task.starter);
    },
  }, 'Сбросить');
  buttons.push(runBtn, checkBtn);
  if (saved?.solved) showSolution();
  else offerSolution();

  return h(
    'div',
    { class: 'stack' },
    pageHead({
      title: task.title,
      crumbs: [{ label: 'Тренажёр Python', href: '#/python' }, { label: unit.title }],
      actions: [h('span', { class: 'badge' }, LEVEL_LABEL[task.level] || ''), saved?.solved ? h('span', { class: 'badge badge--success' }, 'Решено') : null].filter(Boolean),
    }),
    h('div', { class: 'card stack' }, h('div', { class: 'prose', html: renderMarkdown(task.text) }), sampleBlock(task)),
    h('div', { class: 'card stack' }, editor, h('div', { class: 'row', style: { flexWrap: 'wrap' } }, checkBtn, runBtn, hintBtn, resetBtn, status), hintBox, solutionBox),
    h('details', { class: 'card' }, h('summary', {}, 'Свои входные данные для «Запустить»'), stdin),
    output,
    h('div', { class: 'row row--between' }, prevId ? h('a', { class: 'btn btn--ghost', href: `#/python/${prevId}` }, '← Назад') : h('span'), nextId ? h('a', { class: 'btn btn--ghost', href: `#/python/${nextId}` }, 'Дальше →') : null),
  );
}

export async function render({ params, state }) {
  const catalog = await loadPyCatalog();
  const found = findTask(catalog, params.taskId);
  if (!found) return h('div', { class: 'empty card' }, h('h2', {}, 'Задача не найдена'), h('a', { class: 'btn btn--primary', href: '#/python' }, 'Ко всем задачам'));
  warmUp().catch(() => {});
  disposed = false;
  // Код, набранный перед закрытием вкладки или сворачиванием браузера, тоже сохраняем.
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', onVisibility);
  return taskView(found, state);
}

export function unmount() {
  disposed = true;
  flushSave();
  window.removeEventListener('pagehide', flushSave);
  document.removeEventListener('visibilitychange', onVisibility);
}
