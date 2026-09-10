// Онбординг: 4 шага — имя, даты и цели, время на учёбу, старт.

import { h, replaceChildren } from '../core/dom.js';
import { setProfile } from '../core/actions.js';
import { daysUntil, todayKey } from '../core/time.js';
import { toast } from '../ui/toast.js';

const HOURS = [4, 6, 8, 10, 12];
const BANDS = [5.5, 6, 6.5, 7, 7.5, 8];
const EXAM_PRESETS = ['2027-06-01', '2028-06-01', '2029-06-01'];

function field(label, control, help) {
  const box = h('div', { class: 'field' }, h('label', {}, label), control);
  if (help) box.append(h('div', { class: 'help' }, help));
  return box;
}

function chips(values, current, onPick, format) {
  const row = h('div', { class: 'chips' });
  values.forEach(function (value) {
    const label = format ? format(value) : String(value);
    row.append(h('button', { class: value === current ? 'chip active' : 'chip', onClick: function () { onPick(value); } }, label));
  });
  return row;
}

export async function render(ctx) {
  const profile = ctx.state.profile;
  const draft = {
    name: profile.name || '',
    examDate: profile.examDate || '2028-06-01',
    ieltsDate: profile.ieltsDate || '',
    targetScore: profile.targetScore || 120,
    ieltsTarget: profile.ieltsTarget || 7,
    hoursPerWeek: profile.hoursPerWeek || 6,
    shift: profile.shift || 2,
    ielts: true,
  };
  let step = 0;
  let error = '';

  const steps = h('div', { class: 'onboard-steps' });
  const body = h('div', { class: 'card stack' });
  const root = h('div', { class: 'onboard stack' }, steps, body);

  function set(patch) {
    Object.assign(draft, patch);
    draw();
  }

  function go(delta) {
    if (delta > 0 && step === 1) {
      const left = daysUntil(draft.examDate, todayKey());
      if (!draft.examDate || left === null || left <= 0) {
        error = 'Поставь дату ЕНТ в будущем — от неё считается весь план.';
        draw();
        return;
      }
    }
    error = '';
    step = Math.max(0, Math.min(3, step + delta));
    draw();
  }

  function finish() {
    setProfile({
      name: String(draft.name).trim(),
      examDate: draft.examDate,
      ieltsDate: draft.ielts ? draft.ieltsDate : '',
      targetScore: Number(draft.targetScore) || 120,
      ieltsTarget: Number(draft.ieltsTarget) || 7,
      hoursPerWeek: Number(draft.hoursPerWeek) || 6,
      shift: Number(draft.shift) || 2,
      onboarded: true,
    });
    toast('Готово! Начинаем 🚀', { tone: 'success' });
    ctx.navigate('/', { replace: true });
  }

  function stepOne() {
    const input = h('input', { class: 'input', value: draft.name, placeholder: 'Имя', onInput: function (event) { draft.name = event.target.value; } });
    return [
      h('h1', {}, 'Привет! Я Qadam'),
      h('p', { class: 'muted' }, 'Помогу подготовиться к ЕНТ (Математика + Информатика) и IELTS дома, по 20–40 минут в день. Настроим за минуту.'),
      field('Как тебя зовут?', input, 'Нужно только для приветствия. Все данные остаются в этом браузере.'),
    ];
  }

  function stepTwo() {
    const dateInput = h('input', { class: 'input', type: 'date', value: draft.examDate, onChange: function (event) { set({ examDate: event.target.value }); } });
    const scoreInput = h('input', { class: 'input', type: 'number', min: '50', max: '140', value: String(draft.targetScore), onChange: function (event) { set({ targetScore: event.target.value }); } });
    const ieltsToggle = h('input', { type: 'checkbox', checked: draft.ielts, onChange: function (event) { set({ ielts: event.target.checked }); } });
    const parts = [
      h('h2', {}, 'Когда экзамены и какая цель?'),
      field('Дата ЕНТ', dateInput),
      chips(EXAM_PRESETS, draft.examDate, function (value) { set({ examDate: value }); }, function (value) { return 'ЕНТ ' + value.slice(0, 4); }),
      field('Целевой балл ЕНТ (из 140)', scoreInput, 'Порог гранта: 65 в национальные вузы, 50 в остальные. 120+ — сильная заявка.'),
      h('label', { class: 'row' }, ieltsToggle, 'Готовлюсь ещё и к IELTS'),
    ];
    if (draft.ielts) {
      const ieltsDate = h('input', { class: 'input', type: 'date', value: draft.ieltsDate, onChange: function (event) { set({ ieltsDate: event.target.value }); } });
      const bandSelect = h('select', { class: 'input', onChange: function (event) { set({ ieltsTarget: event.target.value }); } });
      BANDS.forEach(function (band) {
        bandSelect.append(h('option', { value: String(band), selected: Number(draft.ieltsTarget) === band }, band.toFixed(1)));
      });
      parts.push(field('Дата IELTS (примерно)', ieltsDate, 'Не знаешь точно — оставь пустым, поменяешь в настройках.'));
      parts.push(field('Целевой band', bandSelect, 'Для большинства вузов нужен 6.0–7.0.'));
    }
    if (error) parts.push(h('div', { class: 'alert alert--danger' }, error));
    return parts;
  }

  function stepThree() {
    const hoursRow = chips(HOURS, Number(draft.hoursPerWeek), function (value) { set({ hoursPerWeek: value }); }, function (value) { return value + ' ч'; });
    const shiftRow = h('div', { class: 'choice-grid' });
    [1, 2].forEach(function (shift) {
      shiftRow.append(h('button', { class: Number(draft.shift) === shift ? 'choice active' : 'choice', onClick: function () { set({ shift: shift }); } }, shift + '-я смена'));
    });
    return [
      h('h2', {}, 'Сколько времени есть на подготовку?'),
      field('Часов в неделю', hoursRow, 'Это примерно 40–100 минут в день. Можно поменять в любой момент.'),
      field('Смена в школе', shiftRow, 'Вторая смена — планируем короткие вечерние и утренние сессии.'),
    ];
  }

  function summaryRow(title, value) {
    return h('div', { class: 'list-item' }, h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, title), h('div', { class: 'list-item__sub' }, value)));
  }

  function stepFour() {
    const days = daysUntil(draft.examDate, todayKey());
    const ieltsLine = draft.ielts ? (draft.ieltsDate || 'дата позже') + ' · цель ' + Number(draft.ieltsTarget).toFixed(1) : 'позже';
    return [
      h('h2', {}, 'Всё готово'),
      h(
        'div',
        { class: 'list' },
        summaryRow('Имя', draft.name || '—'),
        summaryRow('ЕНТ', draft.examDate + ' · через ' + days + ' дн. · цель ' + draft.targetScore),
        summaryRow('IELTS', ieltsLine),
        summaryRow('Время', draft.hoursPerWeek + ' ч в неделю, ' + draft.shift + '-я смена'),
      ),
      h('p', { class: 'muted small' }, 'Прогресс хранится в этом браузере. В настройках есть экспорт в файл — делай его раз в месяц.'),
      h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: finish }, 'Начать подготовку'),
    ];
  }

  function draw() {
    const bars = [0, 1, 2, 3].map(function (i) {
      return h('span', { class: i <= step ? 'done' : '' });
    });
    replaceChildren(steps, bars);
    const content = [stepOne, stepTwo, stepThree, stepFour][step]();
    const nav = h('div', { class: 'row row--between' });
    nav.append(step > 0 ? h('button', { class: 'btn', onClick: function () { go(-1); } }, '← Назад') : h('span'));
    nav.append(step < 3 ? h('button', { class: 'btn btn--primary', onClick: function () { go(1); } }, 'Дальше →') : h('span'));
    content.push(nav);
    replaceChildren(body, content);
  }

  draw();
  return root;
}
