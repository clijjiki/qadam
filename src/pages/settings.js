// Настройки: профиль, оформление, данные (экспорт/импорт/сброс) и сведения о сайте.

import { h, pluralize } from '../core/dom.js';
import { getManifest } from '../core/content.js';
import { exportJSON, getState, importJSON, resetState } from '../core/store.js';
import { setProfile, setSettings } from '../core/actions.js';
import { todayKey } from '../core/time.js';
import { pageHead } from '../ui/components.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const LIMITS = {
  targetScore: { min: 50, max: 140 },
  hoursPerWeek: { min: 2, max: 20 },
  dailyGoalMinutes: { min: 5, max: 240 },
  nameLength: 40,
};

const IELTS_TARGETS = Array.from({ length: 8 }, (_, i) => (5 + i * 0.5).toFixed(1));
const THEMES = [
  ['auto', 'Как в системе'],
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
];
const EXAM_LANGS = [
  ['ru', 'Русский'],
  ['kk', 'Қазақша (казахский)'],
];
const FONT_SCALES = [
  ['0.9', 'Мелкий'],
  ['1', 'Обычный'],
  ['1.1', 'Крупный'],
  ['1.2', 'Очень крупный'],
];

// ---------- валидация ----------

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ts = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(ts) ? null : value;
}

function parseInRange(value, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}

function rangeHint({ min, max }) {
  return `от ${min} до ${max}`;
}

// ---------- элементы формы ----------

function settingRow(title, help, control) {
  return h('div', { class: 'setting-row' }, h('div', { class: 'stack', style: { gap: '2px', minWidth: '0' } }, h('div', { style: { fontWeight: 600 } }, title), help ? h('div', { class: 'help' }, help) : null), control);
}

function inputField({ type = 'text', value, min, max, step, placeholder, onCommit }) {
  return h('input', {
    class: 'input',
    type,
    value: value ?? '',
    min,
    max,
    step,
    placeholder,
    onChange: (event) => onCommit(event.target.value),
  });
}

function selectField({ options, value, onCommit }) {
  return h(
    'select',
    { class: 'input', onChange: (event) => onCommit(event.target.value) },
    options.map(([val, label]) => h('option', { value: val, selected: String(val) === String(value) }, label)),
  );
}

function checkboxField({ checked, label, onCommit }) {
  return h('label', { class: 'row', style: { gap: '8px', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: !!checked, onChange: (event) => onCommit(event.target.checked) }), label);
}

// ---------- карточки ----------

function saveProfile(patch, message, rerender) {
  setProfile(patch);
  toast(message || 'Сохранено', { tone: 'success' });
  rerender();
}

function reject(message, rerender) {
  toast(message, { tone: 'danger' });
  rerender();
}

function profileRowsA(profile, rerender) {
  return [
    settingRow(
      'Имя',
      'Как к тебе обращаться на главной.',
      inputField({
        value: profile.name,
        placeholder: 'Например, Айдана',
        onCommit: (v) => {
          const name = String(v).trim().slice(0, LIMITS.nameLength);
          saveProfile({ name }, name ? `Привет, ${name}!` : 'Имя очищено', rerender);
        },
      }),
    ),
    settingRow(
      'Дата ЕНТ',
      'От неё считается план и обратный отсчёт.',
      inputField({
        type: 'date',
        value: profile.examDate,
        onCommit: (v) => {
          const date = parseDate(v);
          if (!date) return reject('Укажи дату ЕНТ в формате ГГГГ-ММ-ДД', rerender);
          saveProfile({ examDate: date }, 'Дата ЕНТ обновлена', rerender);
        },
      }),
    ),
    settingRow(
      'Дата IELTS',
      'Можно оставить пустой, если ещё не записался.',
      inputField({
        type: 'date',
        value: profile.ieltsDate,
        onCommit: (v) => {
          if (!v) return saveProfile({ ieltsDate: '' }, 'Дата IELTS очищена', rerender);
          const date = parseDate(v);
          if (!date) return reject('Дата IELTS не распознана', rerender);
          saveProfile({ ieltsDate: date }, 'Дата IELTS обновлена', rerender);
        },
      }),
    ),
  ];
}

function profileRowsB(profile, rerender) {
  return [
    settingRow(
      'Цель по ЕНТ',
      `Баллы, ${rangeHint(LIMITS.targetScore)}.`,
      inputField({
        type: 'number',
        value: profile.targetScore,
        min: LIMITS.targetScore.min,
        max: LIMITS.targetScore.max,
        onCommit: (v) => {
          const score = parseInRange(v, LIMITS.targetScore);
          if (score === null) return reject(`Цель по ЕНТ — число ${rangeHint(LIMITS.targetScore)}`, rerender);
          saveProfile({ targetScore: score }, `Цель: ${score} баллов`, rerender);
        },
      }),
    ),
    settingRow(
      'Цель по IELTS',
      'Общий балл (overall band).',
      selectField({
        options: IELTS_TARGETS.map((b) => [b, b]),
        value: Number(profile.ieltsTarget).toFixed(1),
        onCommit: (v) => saveProfile({ ieltsTarget: Number(v) }, `Цель IELTS: ${Number(v).toFixed(1)}`, rerender),
      }),
    ),
    settingRow(
      'Часов в неделю',
      `Сколько реально готов заниматься, ${rangeHint(LIMITS.hoursPerWeek)}.`,
      inputField({
        type: 'number',
        value: profile.hoursPerWeek,
        min: LIMITS.hoursPerWeek.min,
        max: LIMITS.hoursPerWeek.max,
        onCommit: (v) => {
          const hours = parseInRange(v, LIMITS.hoursPerWeek);
          if (hours === null) return reject(`Часы в неделю — число ${rangeHint(LIMITS.hoursPerWeek)}`, rerender);
          saveProfile({ hoursPerWeek: hours }, `${pluralize(hours, ['час', 'часа', 'часов'])} в неделю`, rerender);
        },
      }),
    ),
    settingRow(
      'Смена в школе',
      'Влияет на время занятий в плане.',
      selectField({
        options: [
          ['1', 'Первая (учусь утром)'],
          ['2', 'Вторая (учусь днём)'],
        ],
        value: profile.shift,
        onCommit: (v) => saveProfile({ shift: Number(v) === 1 ? 1 : 2 }, 'Смена обновлена', rerender),
      }),
    ),
  ];
}

function profileCard(state, rerender) {
  return h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, '👤 Профиль'), profileRowsA(state.profile, rerender), profileRowsB(state.profile, rerender));
}

function saveSettings(patch, message, rerender) {
  setSettings(patch);
  toast(message || 'Сохранено', { tone: 'success' });
  rerender();
}

function appearanceCard(state, rerender) {
  const { settings } = state;
  return h(
    'div',
    { class: 'card' },
    h('h2', { style: { marginTop: 0 } }, '🎨 Оформление'),
    settingRow('Тема', 'Авто — как в системе телефона или компьютера.', selectField({ options: THEMES, value: settings.theme || 'auto', onCommit: (v) => saveSettings({ theme: v }, 'Тема обновлена', rerender) })),
    settingRow('Размер шрифта', 'Если текст мелкий — увеличь.', selectField({ options: FONT_SCALES, value: String(settings.fontScale ?? 1), onCommit: (v) => saveSettings({ fontScale: Number(v) }, 'Размер шрифта обновлён', rerender) })),
    settingRow(
      'Цель на день',
      `Минут занятий в день, ${rangeHint(LIMITS.dailyGoalMinutes)}.`,
      inputField({
        type: 'number',
        value: settings.dailyGoalMinutes,
        min: LIMITS.dailyGoalMinutes.min,
        max: LIMITS.dailyGoalMinutes.max,
        onCommit: (v) => {
          const minutes = parseInRange(v, LIMITS.dailyGoalMinutes);
          if (minutes === null) return reject(`Цель на день — число ${rangeHint(LIMITS.dailyGoalMinutes)}`, rerender);
          saveSettings({ dailyGoalMinutes: minutes }, `Цель: ${minutes} мин в день`, rerender);
        },
      }),
    ),
    settingRow(
      'Язык заданий пробника',
      'ЕНТ можно сдавать на казахском или русском. Интерфейс сайта остаётся русским.',
      selectField({ options: EXAM_LANGS, value: settings.examLang || 'ru', onCommit: (v) => saveSettings({ examLang: v }, v === 'kk' ? 'Пробник будет на казахском' : 'Пробник будет на русском', rerender) }),
    ),
    settingRow('Перемешивать варианты', 'Чтобы не запоминать «правильная — буква B».', checkboxField({ checked: settings.shuffleOptions, label: 'Включено', onCommit: (v) => saveSettings({ shuffleOptions: !!v }, v ? 'Варианты перемешиваются' : 'Варианты по порядку', rerender) })),
    settingRow('Показывать таймер', 'Секундомер в практике и пробниках.', checkboxField({ checked: settings.showTimer, label: 'Включено', onCommit: (v) => saveSettings({ showTimer: !!v }, v ? 'Таймер включён' : 'Таймер скрыт', rerender) })),
  );
}

// ---------- данные ----------

function downloadExport() {
  try {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `qadam-progress-${todayKey()}.json`, style: { display: 'none' } });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Файл с прогрессом сохранён', { tone: 'success' });
  } catch (error) {
    console.error('Экспорт не удался:', error);
    toast('Не удалось подготовить файл', { tone: 'danger' });
  }
}

async function importFile(file, rerender) {
  if (!file) return;
  try {
    const text = await file.text();
    importJSON(text);
    toast('Прогресс восстановлен из файла', { tone: 'success' });
    rerender();
  } catch (error) {
    console.error('Импорт не удался:', error);
    toast(`Не удалось импортировать: ${error?.message || 'ошибка чтения'}`, { tone: 'danger' });
  }
}

async function resetAll(navigate) {
  const ok = await confirmDialog({
    title: 'Сбросить весь прогресс?',
    text: 'Удалятся темы, слова, пробники, XP и бейджи. Это нельзя отменить — сначала сделай экспорт.',
    okLabel: 'Сбросить',
    danger: true,
  });
  if (!ok) return;
  resetState();
  toast('Прогресс сброшен');
  navigate('/onboarding', { replace: true });
}

function storageSizeKb(state) {
  try {
    return (JSON.stringify(state).length / 1024).toFixed(1);
  } catch (error) {
    console.error('Не удалось измерить объём данных:', error);
    return '—';
  }
}

function dataCard(state, rerender, navigate) {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: (event) => importFile(event.target.files?.[0], rerender) });
  const sessions = (state.sessions || []).length;
  return h(
    'div',
    { class: 'card' },
    h('h2', { style: { marginTop: 0 } }, '💾 Данные'),
    h('div', { class: 'alert alert--info' }, 'Прогресс хранится только в этом браузере. Делай экспорт перед сменой устройства или чисткой браузера.'),
    settingRow('Экспортировать прогресс', `Занимает ${storageSizeKb(state)} КБ · ${pluralize(sessions, ['сессия', 'сессии', 'сессий'])}.`, h('button', { class: 'btn btn--primary', onClick: downloadExport }, '⬇️ Скачать JSON')),
    settingRow('Импортировать', 'Загрузи файл экспорта — текущие данные заменятся.', h('div', {}, fileInput, h('button', { class: 'btn', onClick: () => fileInput.click() }, '⬆️ Выбрать файл'))),
    settingRow('Сбросить прогресс', 'Начать с чистого листа. Спросим подтверждение.', h('button', { class: 'btn btn--danger', onClick: () => resetAll(navigate) }, 'Сбросить')),
  );
}

// ---------- о сайте ----------

function aboutCard() {
  let version = '—';
  let topics = 0;
  let subjectsCount = 0;
  try {
    const manifest = getManifest();
    version = manifest.version || '—';
    topics = manifest.topics.length;
    subjectsCount = manifest.subjects.length;
  } catch (error) {
    console.error('Манифест недоступен:', error);
  }
  return h(
    'div',
    { class: 'card' },
    h('h2', { style: { marginTop: 0 } }, 'ℹ️ О сайте'),
    h('p', { class: 'muted' }, 'Qadam — личный тренер к ЕНТ и IELTS. Данные хранятся только в этом браузере — делай экспорт.'),
    settingRow('Версия контента', null, h('span', { class: 'badge' }, version)),
    settingRow('Материалы', null, h('span', { class: 'badge' }, `${pluralize(subjectsCount, ['предмет', 'предмета', 'предметов'])} · ${pluralize(topics, ['тема', 'темы', 'тем'])}`)),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('a', { class: 'btn btn--sm', href: '#/more' }, 'Ещё разделы'), h('a', { class: 'btn btn--sm', href: '#/stats' }, 'Статистика')),
  );
}

// ---------- страница ----------

function buildPage(rerender, navigate) {
  const state = getState();
  return [
    pageHead({ title: 'Настройки', sub: 'Всё сохраняется сразу — без кнопки «Сохранить».' }),
    h('div', { class: 'grid grid--2' }, profileCard(state, rerender), appearanceCard(state, rerender)),
    h('div', { class: 'grid grid--2' }, dataCard(state, rerender, navigate), aboutCard()),
  ];
}

export async function render(ctx) {
  const root = h('div', { class: 'stack' });
  const rerender = () => root.replaceChildren(...buildPage(rerender, ctx.navigate));
  rerender();
  return root;
}
