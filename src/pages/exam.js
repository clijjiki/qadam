// Хаб пробников: формат ЕНТ, запуск полного/мини режима, продолжение, история результатов.

import { append, formatDuration, h, pluralize } from '../core/dom.js';
import { langName, langOf, localizedPath, topicsOf, ubtSubjects } from '../core/content.js';
import { icon } from '../ui/icons.js';
import { clearInProgress, examConfig, loadInProgress, loadLastResult } from '../core/exam.js';
import { examSeries } from '../core/stats.js';
import { getState } from '../core/store.js';
import { formatDateTime } from '../core/time.js';
import { lineChart } from '../ui/charts.js';
import { confirmDialog } from '../ui/modal.js';
import { pageHead, subjectBadge } from '../ui/components.js';
import { langSwitch } from '../ui/lang-switch.js';

function pointsOf(parts) {
  return (parts.plain || 0) + (parts.context || 0) + 2 * (parts.multi || 0) + 2 * (parts.match || 0);
}

function formatTable(config) {
  const rows = config.sections.map((s) => h('tr', {}, h('td', {}, subjectBadge(s.subject), ' ', s.name), h('td', { class: 'right' }, String(s.target)), h('td', { class: 'right' }, String(pointsOf(s.parts)))));
  const total = config.sections.reduce((a, s) => a + s.target, 0);
  const points = config.sections.reduce((a, s) => a + pointsOf(s.parts), 0);
  return h(
    'div',
    { class: 'table-wrap' },
    h('table', { class: 'exam-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Секция'), h('th', { class: 'right' }, 'Заданий'), h('th', { class: 'right' }, 'Баллов'))), h('tbody', {}, rows, h('tr', {}, h('td', {}, h('b', {}, 'Итого')), h('td', { class: 'right' }, h('b', {}, String(total))), h('td', { class: 'right' }, h('b', {}, String(points)))))),
  );
}

function startCard(mode, config, highlight, lang) {
  const full = mode === 'full';
  return h(
    'div',
    { class: highlight ? 'card card--accent stack' : 'card stack', style: highlight ? { '--card-accent': 'var(--primary)' } : null },
    h('div', { class: 'card__title row', style: { gap: '8px' } }, icon(full ? 'exam' : 'bolt', { size: 18 }), full ? 'Полный пробный ЕНТ' : 'Мини-пробник'),
    h('p', { class: 'muted', style: { margin: 0 } }, full ? `120 заданий, ${config.durationMinutes} минут, 5 секций подряд — как на настоящем экзамене.` : `Короткий прогон всех секций (~${config.sections.reduce((a, s) => a + s.target, 0)} заданий) за ${config.durationMinutes} минут. Каждую субботу.`),
    h('a', { class: 'btn btn--primary btn--lg', href: `#/exam/run?mode=${mode}&lang=${lang}` }, `Начать · ${langName(lang)}`),
  );
}

/** Сколько тем ЕНТ уже переведено на выбранный язык (проверяем наличие файлов). */
async function translationStats(lang) {
  if (lang === 'ru') return null;
  const metas = ubtSubjects().flatMap((s) => topicsOf(s.id, { kind: 'lesson' }));
  const checks = await Promise.all(
    metas.map(async (meta) => {
      try {
        const response = await fetch(localizedPath(meta, lang), { method: 'HEAD', cache: 'no-store' });
        return response.ok;
      } catch (error) {
        return false;
      }
    }),
  );
  return { total: metas.length, translated: checks.filter(Boolean).length };
}

function langCard(lang, stats) {
  const note = lang === 'ru'
    ? 'ЕНТ можно сдавать на казахском или русском. Пробник целиком идёт на общем языке материалов — его и меняет этот переключатель. Свой язык предмета (например, математика на казахском) действует в уроках и практике.'
    : stats
      ? `Заданий на казахском: ${stats.translated} из ${stats.total} тем. Непереведённые темы придут на русском.`
      : 'Задания будут на казахском языке.';
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'card__title row', style: { gap: '8px' } }, icon('globe', { size: 18 }), 'Язык заданий'),
    langSwitch(),
    h('p', { class: 'muted small', style: { margin: 0 } }, note),
  );
}

function resumeCard(snapshot, rerender) {
  const answered = Object.keys(snapshot.answers || {}).length;
  return h(
    'div',
    { class: 'alert alert--warn row row--between' },
    h('div', {}, h('b', {}, `Есть незавершённый ${snapshot.mode === 'mini' ? 'мини-пробник' : 'полный пробник'}`), h('div', { class: 'small' }, `Начат ${formatDateTime(snapshot.startedAt)}, ответов: ${answered}. Таймер идёт с момента старта.`)),
    h(
      'div',
      { class: 'row' },
      h('a', { class: 'btn btn--primary btn--sm', href: '#/exam/run?resume=1' }, 'Продолжить'),
      h(
        'button',
        {
          class: 'btn btn--sm btn--danger',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'Отменить пробник?', text: 'Ответы будут удалены.', okLabel: 'Отменить пробник', danger: true });
            if (!ok) return;
            clearInProgress();
            rerender();
          },
        },
        'Отменить',
      ),
    ),
  );
}

function historyCard(state) {
  const exams = [...(state.exams || [])].reverse();
  if (!exams.length) return h('div', { class: 'card' }, h('h3', {}, 'История'), h('p', { class: 'muted', style: { margin: 0 } }, 'Пробников ещё не было. Первый мини-пробник займёт 45 минут и даст первую честную оценку.'));
  const fullSeries = examSeries(state).filter((e) => e.mode === 'full').map((e) => ({ key: e.key, value: e.value }));
  const rows = exams.slice(0, 12).map((e) =>
    h(
      'div',
      { class: 'list-item' },
      h('div', { class: 'list-item__num' }, e.mode === 'full' ? '📝' : '⚡'),
      h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, `${e.total} из ${e.max}`), h('div', { class: 'list-item__sub' }, `${formatDateTime(e.at)} · ${formatDuration(e.seconds)} · ${e.sections.map((s) => `${s.short || s.name}: ${s.points}/${s.max}`).join(' · ')}`)),
      h('span', { class: 'badge' }, `${Math.round((e.total / e.max) * 100)}%`),
      e.lang && e.lang !== 'ru' ? h('span', { class: 'badge badge--info' }, langName(e.lang)) : null,
    ),
  );
  return h(
    'div',
    { class: 'card stack' },
    h('h3', { style: { margin: 0 } }, `История (${pluralize(exams.length, ['пробник', 'пробника', 'пробников'])})`),
    fullSeries.length >= 2 ? lineChart({ series: fullSeries, max: 140, height: 170 }) : null,
    loadLastResult() ? h('a', { class: 'btn btn--sm', href: '#/exam/result' }, 'Разбор последнего пробника →') : null,
    h('div', { class: 'list' }, rows),
  );
}

export async function render(ctx) {
  const { state, query } = ctx;
  const config = examConfig('full');
  const mini = examConfig('mini');
  const snapshot = loadInProgress();
  const lang = langOf(state);
  const stats = await translationStats(lang);
  const root = h('div', { class: 'stack' });
  const rerender = async () => root.replaceChildren(await render({ ...ctx, state: getState() }));
  append(root, [
    pageHead({ title: 'Пробные экзамены', sub: 'Формат ЕНТ: 5 секций, баллы за мультиответ 2/1/0, таймер без пауз.' }),
    snapshot ? resumeCard(snapshot, rerender) : null,
    langCard(lang, stats),
    h('div', { class: 'grid grid--2' }, startCard('full', config, query.mode === 'full', lang), startCard('mini', mini, query.mode === 'mini', lang)),
    h('div', { class: 'grid grid--2' }, h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Формат полного пробника'), formatTable(config), h('p', { class: 'muted small', style: { margin: 0 } }, 'Задания с несколькими ответами и на соответствие — по 2 балла. Одна ошибка в мультиответе — 1 балл. Пустой ответ — 0, штрафа нет: отвечай на всё.')), historyCard(state)),
  ]);
  return root;
}
