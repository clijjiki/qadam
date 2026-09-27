// План подготовки: обратный отсчёт и фазы, недельная сетка, настройки темпа, «что дальше».

import { append, h, pluralize } from '../core/dom.js';
import { curriculumTopicsOf, langOf, subject, topicTitle } from '../core/content.js';
import { CURRICULUM_SUBJECTS, normalizeGrade, trackPhases, usesCurriculum } from '../core/curriculum.js';
import { getState } from '../core/store.js';
import { setProfile } from '../core/actions.js';
import { masteryOf } from '../core/mastery.js';
import { countdown, nextTopics, pythonSolvedOn, weeklyPlan } from '../core/plan.js';
import { formatDate, toDayKey, weekdayShort } from '../core/time.js';
import { emptyState, masteryRow, pageHead, subjectBadge, subjectColor } from '../ui/components.js';
import { activePhaseIndex, phaseRow, trackFields } from '../ui/curriculum-ui.js';
import { toast } from '../ui/toast.js';

const HOURS_OPTIONS = [4, 6, 8, 10, 12];
const CURRICULUM_SUBJECT = CURRICULUM_SUBJECTS[0];
const KIND_ICONS = { topic: '📘', review: '🔁', english: '🇬🇧', python: '🐍', exam: '📝' };

const PHASES = [
  { key: 'base', name: 'Фундамент', range: '> 40 недель', tip: 'Проходи темы по порядку: теория + практика, без спешки. Главное — регулярность.' },
  { key: 'build', name: 'Закрепление', range: '8–40 недель', tip: 'Закрывай слабые темы, повторяй ошибки каждый день, каждую субботу — мини-пробник.' },
  { key: 'exam', name: 'Экзамен', range: '< 8 недель', tip: 'Полные пробники раз в неделю, разбор ошибок, лёгкие дни перед экзаменом.' },
];

function phaseIndex(cd) {
  if (cd.weeks === null) return 0;
  if (cd.weeks > 40) return 0;
  if (cd.weeks >= 8) return 1;
  return 2;
}

// ---------- обратный отсчёт ----------

function countStat(value, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, value), h('div', { class: 'stat__label' }, label));
}

function daysText(days) {
  if (days === null) return '—';
  if (days < 0) return 'прошёл';
  if (days === 0) return 'сегодня';
  return String(days);
}

function phaseBar(current) {
  return h(
    'div',
    { class: 'phase-bar', role: 'img', 'aria-label': `Фаза: ${PHASES[current].name}` },
    PHASES.map((p, i) => h('span', { style: { flex: '1', background: i < current ? 'var(--success)' : i === current ? 'var(--primary)' : 'var(--bg-sunken)' } })),
  );
}

function phaseLegend(current) {
  return h(
    'div',
    { class: 'row', style: { justifyContent: 'space-between', fontSize: '.8rem' } },
    PHASES.map((p, i) => h('span', { class: i === current ? '' : 'muted', style: i === current ? { fontWeight: '600' } : null }, `${p.name} · ${p.range}`)),
  );
}

function paceLine(cd) {
  if (cd.examDays === null) return 'Укажи дату ЕНТ ниже — и план рассчитает темп.';
  if (cd.examDays <= 0) return 'ЕНТ уже наступил — удачи на экзамене!';
  if (!cd.remaining) return 'Все темы освоены. Держи форму пробниками.';
  return `Осталось ${pluralize(cd.remaining, ['тема', 'темы', 'тем'])} из ${cd.total}. Чтобы успеть, нужно ≈ ${pluralize(cd.topicsPerWeek, ['тема', 'темы', 'тем'])} в неделю.`;
}

function countdownCard(cd) {
  const current = phaseIndex(cd);
  const phase = PHASES[current];
  return h(
    'div',
    { class: 'card card--hero stack' },
    h('h2', { style: { margin: 0 } }, 'Обратный отсчёт'),
    h(
      'div',
      { class: 'grid grid--4' },
      countStat(daysText(cd.examDays), 'дней до ЕНТ'),
      countStat(daysText(cd.ieltsDays), 'дней до IELTS'),
      countStat(String(cd.remaining), 'тем осталось'),
      countStat(cd.topicsPerWeek ? String(cd.topicsPerWeek) : '—', 'тем в неделю'),
    ),
    phaseBar(current),
    phaseLegend(current),
    h('div', { class: 'alert alert--info', style: { margin: 0 } }, h('b', {}, `Сейчас фаза «${phase.name}». `), phase.tip),
    h('p', { class: 'muted small', style: { margin: 0 } }, paceLine(cd)),
  );
}

// ---------- неделя ----------

function sessionsByDay(state) {
  const map = new Map();
  for (const s of state.sessions || []) {
    const key = toDayKey(new Date(s.at));
    map.set(key, [...(map.get(key) || []), s]);
  }
  return map;
}

/** Сделан ли пункт английского в этот день. Серии Extra сайт не видит — они отмечаются на странице «Английский». */
function englishDone(state, list, key, part) {
  if (part === 'words') return list.some((s) => s.kind === 'vocab');
  if (part === 'sentences') return (Number(state.english?.sentences?.[key]) || 0) > 0;
  if (part === 'grammar') return list.some((s) => s.subject === 'english' && s.kind !== 'vocab');
  return false;
}

function itemDone(state, byDay, key, item) {
  const list = byDay.get(key) || [];
  if (item.kind === 'topic') return list.some((s) => s.topicId === item.topicId);
  if (item.kind === 'review') return list.some((s) => s.kind === 'review');
  if (item.kind === 'exam') return list.some((s) => s.kind === 'exam') || (state.exams || []).some((e) => toDayKey(new Date(e.at)) === key);
  if (item.kind === 'english') return englishDone(state, list, key, item.part);
  if (item.kind === 'python') return pythonSolvedOn(state, key) > 0;
  return false;
}

function dayItem(item, done) {
  const color = item.subject ? subjectColor(item.subject) : null;
  return h(
    'a',
    { class: done ? 'plan-item done' : 'plan-item', href: item.href, title: done ? 'Сделано' : null },
    h('span', { class: 'plan-item__ico', style: color ? { color } : null }, done ? '✓' : KIND_ICONS[item.kind] || '•'),
    h('span', { class: 'plan-item__title' }, item.title),
  );
}

function dayCard(state, byDay, day) {
  const classes = ['day', day.isToday ? 'today' : '', day.isPast ? 'past' : ''].filter(Boolean).join(' ');
  return h(
    'div',
    { class: classes },
    h(
      'div',
      { class: 'row row--between' },
      h('div', {}, h('div', { class: 'day__name' }, day.isToday ? `${weekdayShort(day.key)} · сегодня` : weekdayShort(day.key)), h('div', { class: 'day__date' }, formatDate(day.key))),
      h('span', { class: day.rest ? 'badge badge--success' : 'badge' }, day.rest ? `лёгкий · ${day.minutes} мин` : `${day.minutes} мин`),
    ),
    h('div', { class: 'day__items' }, day.items.map((item) => dayItem(item, itemDone(state, byDay, day.key, item)))),
  );
}

function weekCard(state) {
  const days = weeklyPlan(state);
  const byDay = sessionsByDay(state);
  const total = days.reduce((s, d) => s + d.minutes, 0);
  return h(
    'div',
    { class: 'stack', style: { gap: '10px' } },
    h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, 'Эта неделя'), h('span', { class: 'badge badge--primary' }, `≈ ${Math.round(total / 60)} ч`)),
    h('div', { class: 'week-grid' }, days.map((d) => dayCard(state, byDay, d))),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Галочка ставится сама, когда ты проходишь тему, повторение или пробник в этот день.'),
  );
}

// ---------- настройки темпа ----------

function hoursChips(state, apply) {
  const current = Number(state.profile.hoursPerWeek) || 6;
  return h(
    'div',
    { class: 'chips' },
    HOURS_OPTIONS.map((hours) => h('button', { type: 'button', class: hours === current ? 'chip active' : 'chip', onClick: () => apply({ hoursPerWeek: hours }, `Темп: ${hours} ч в неделю`) }, `${hours} ч`)),
  );
}

function dateField(label, key, value, apply) {
  const input = h('input', { class: 'input', type: 'date', value: value || '', onChange: (e) => apply({ [key]: e.target.value || '' }, e.target.value ? `${label}: ${formatDate(e.target.value, { withYear: true })}` : `${label} убрана`) });
  return h('div', { class: 'field' }, h('label', {}, label), input, h('div', { class: 'help' }, key === 'examDate' ? 'От неё считаем фазы и темп' : 'Необязательно — если сдаёшь IELTS'));
}

function settingsCard(state, apply) {
  return h(
    'div',
    { class: 'card stack' },
    h('h2', { style: { margin: 0 } }, 'Настройки плана'),
    h('div', { class: 'field' }, h('label', {}, 'Сколько часов в неделю готов заниматься'), hoursChips(state, apply), h('div', { class: 'help' }, 'План разложит минуты по дням: шесть учебных дней и лёгкое воскресенье.')),
    trackFields(state, apply),
    h('div', { class: 'grid grid--2' }, dateField('Дата ЕНТ', 'examDate', state.profile.examDate, apply), dateField('Дата IELTS', 'ieltsDate', state.profile.ieltsDate, apply)),
  );
}

// ---------- трек по математике ----------

function trackCard(state) {
  if (!usesCurriculum(state.profile, CURRICULUM_SUBJECT)) return null;
  const grade = normalizeGrade(state.profile.grade);
  const phases = trackPhases(curriculumTopicsOf(CURRICULUM_SUBJECT), grade);
  const activeIndex = activePhaseIndex(state, phases, CURRICULUM_SUBJECT);
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, `Математика: ${grade} класс, потом с 7-го`), h('a', { href: '#/curriculum' }, 'Программа по классам →')),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Сначала темы своего класса — то, что спросят на БЖБ и ТЖБ. Потом фундамент с 7 класса по порядку, затем старшие классы.'),
    h('div', { class: 'list' }, phases.map((p, i) => phaseRow(state, p, i, { active: i === activeIndex, subjectId: CURRICULUM_SUBJECT }))),
  );
}

// ---------- что дальше ----------

function nextRow(state, topic, index) {
  const subj = subject(topic.subject);
  const mastery = masteryOf(state, topic.id);
  return h(
    'a',
    { class: 'list-item', href: `#/topic/${topic.id}` },
    h('div', { class: 'list-item__num' }, String(index + 1)),
    h(
      'div',
      { class: 'list-item__main' },
      h('div', { class: 'list-item__title' }, topicTitle(topic, langOf(state))),
      h('div', { class: 'list-item__sub row', style: { gap: '8px' } }, subjectBadge(topic.subject), h('span', {}, `${subj?.name || topic.subject}${topic.minutes ? ` · ≈ ${topic.minutes} мин` : ''}`)),
      masteryRow(mastery, { color: subjectColor(topic.subject) }),
    ),
  );
}

function nextCard(state) {
  const topics = nextTopics(state, 6);
  if (!topics.length) {
    return h('div', { class: 'card' }, emptyState({ icon: '🏁', title: 'Все темы освоены', sub: 'Осталось держать форму: пробники и повторение ошибок.', action: { label: 'Пройти пробник', href: '#/exam' } }));
  }
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, 'Что дальше'), h('a', { href: '#/ubt' }, 'Все темы →')),
    h('p', { class: 'muted small', style: { margin: 0 } }, usesCurriculum(state.profile, CURRICULUM_SUBJECT) ? 'Математика — по школьной программе (свой класс, потом с 7-го), остальные предметы — по эффекту для балла. Предметы чередуются.' : 'Шесть тем с самым большим эффектом для балла. Предметы чередуются.'),
    h('div', { class: 'list' }, topics.map((t, i) => nextRow(state, t, i))),
  );
}

function howCard() {
  const bullets = [
    'Математика идёт по школьной программе: сначала темы своего класса (к БЖБ и ТЖБ), потом фундамент с 7 класса, затем старшие классы. Два дня математики в неделю — один на алгебру, другой на геометрию. В настройках плана можно переключить на «по весу на ЕНТ».',
    'Приоритет темы = её вес на ЕНТ × (1 − мастерство) × коэффициент профильного предмета. Сначала — то, что даст больше баллов.',
    'Предметы чередуются по дням: мозгу проще запоминать, когда темы не сливаются.',
    'Повторение ошибок — каждый день по 10 минут: интервальные повторения (SRS) закрепляют слабые вопросы.',
    'IELTS идёт параллельно: слова через день, уроки, Writing по субботам и Speaking в воскресенье.',
    'Суббота — пробник: мини каждую неделю, полный формат раз в 4 недели.',
    'Воскресенье — лёгкий день: половина обычной нагрузки, чтобы не выгореть.',
  ];
  return h(
    'details',
    { class: 'card' },
    h('summary', { style: { cursor: 'pointer', fontWeight: '600' } }, 'Как строится план'),
    h('ul', { class: 'muted', style: { margin: '10px 0 0', paddingLeft: '1.2em', lineHeight: '1.6' } }, bullets.map((b) => h('li', {}, b))),
  );
}

// ---------- страница ----------

function noExamDateAlert(cd) {
  if (cd.examDays !== null) return null;
  return h('div', { class: 'alert alert--warn' }, '📅 Дата ЕНТ не указана. Поставь её в настройках ниже — и появятся фазы, темп и обратный отсчёт.');
}

export async function render(ctx) {
  const state = ctx.state || getState();
  const cd = countdown(state);
  const root = h('div', { class: 'stack', style: { gap: '18px' } });
  const apply = async (patch, message) => {
    try {
      setProfile(patch);
      if (message) toast(message, { tone: 'success' });
      root.replaceChildren(...(await render({ ...ctx, state: getState() })).childNodes);
    } catch (error) {
      console.error('Не удалось сохранить настройки плана:', error);
      toast('Не удалось сохранить. Попробуй ещё раз.', { tone: 'danger' });
    }
  };
  append(root, [
    pageHead({ title: 'План подготовки', sub: 'Темп, фазы и расписание на неделю — подстраиваются под твой прогресс.' }),
    noExamDateAlert(cd),
    countdownCard(cd),
    weekCard(state),
    trackCard(state),
    h('div', { class: 'grid grid--2' }, settingsCard(state, apply), nextCard(state)),
    howCard(),
  ]);
  return root;
}
