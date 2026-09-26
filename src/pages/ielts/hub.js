// Хаб IELTS: общий band, четыре навыка, словарь, грамматика, списки уроков и формат экзамена.

import { h, pluralize } from '../../core/dom.js';
import { ieltsSubject, langOf, topicTitle, topicsOf } from '../../core/content.js';
import { MASTERED_THRESHOLD, ieltsReadiness, masteryOf } from '../../core/mastery.js';
import { dueIds } from '../../core/srs.js';
import { daysUntil, formatDate } from '../../core/time.js';
import { emptyState, masteryRow, pageHead, progressBar, subjectColor, topicCard } from '../../ui/components.js';

const SKILLS = [
  { key: 'listening', icon: '🎧', label: 'Listening' },
  { key: 'reading', icon: '📖', label: 'Reading' },
  { key: 'writing', icon: '✍️', label: 'Writing' },
  { key: 'speaking', icon: '🎤', label: 'Speaking' },
];

const FORMAT_ROWS = [
  ['🎧 Listening', '30 мин · 4 части · 40 вопросов'],
  ['📖 Reading', '60 мин · 3 текста · 40 вопросов'],
  ['✍️ Writing', '60 мин · Task 1: 150 слов (20 мин) · Task 2: 250 слов (40 мин, вес ×2)'],
  ['🎤 Speaking', '11–14 мин · 3 части'],
  ['Общий балл', 'среднее четырёх навыков, округление до 0.5'],
];

const RAW_TO_BAND = [
  ['Listening', '16 → 5.0 · 23 → 6.0 · 30 → 7.0 · 35 → 8.0'],
  ['Reading', '15 → 5.0 · 23 → 6.0 · 30 → 7.0 · 35 → 8.0'],
];

function bandText(band) {
  return band === null || band === undefined ? '—' : band.toFixed(1);
}

function lessonsOf(skill) {
  return topicsOf('ielts', { kind: 'lesson' }).filter((t) => t.skill === skill);
}

function firstUnmastered(state, lessons) {
  return lessons.find((t) => masteryOf(state, t.id) < MASTERED_THRESHOLD) || lessons[0] || null;
}

function studiedCount(state, lessons) {
  return lessons.filter((t) => state.topics[t.id]?.answered).length;
}

function sectionTitle(title, sub) {
  return h('div', { class: 'row row--between' }, h('div', {}, h('h2', { style: { margin: 0 } }, title), sub ? h('div', { class: 'muted small' }, sub) : null));
}

function countdownLine(state) {
  const key = state.profile.ieltsDate;
  if (!key) return h('span', { class: 'muted small' }, 'Дата экзамена не задана — ', h('a', { href: '#/settings' }, 'указать в настройках'));
  const days = daysUntil(key);
  if (days < 0) return h('span', { class: 'level-pill' }, `📅 IELTS был ${formatDate(key)}`);
  if (days === 0) return h('span', { class: 'level-pill' }, '📅 IELTS сегодня — удачи!');
  return h('span', { class: 'level-pill' }, `📅 До IELTS ${pluralize(days, ['день', 'дня', 'дней'])} · ${formatDate(key)}`);
}

function heroCard(state, ielts) {
  const overall = ielts?.overall ?? null;
  const target = Number(state.profile.ieltsTarget) || null;
  return h(
    'div',
    { class: 'card card--hero stack' },
    h('div', { class: 'muted' }, 'Оценка по данным сайта'),
    h('div', { class: 'row', style: { alignItems: 'baseline', gap: '10px' } }, h('span', { class: 'forecast__num' }, bandText(overall)), h('span', { class: 'forecast__max' }, 'band'), target ? h('span', { class: 'muted' }, `· цель ${target.toFixed(1)}`) : null),
    h('div', { class: 'muted small' }, overall === null ? 'Появится после первых уроков — начни с Reading или Listening' : 'Средний band по навыкам, где уже есть данные. Это ориентир, а не результат теста'),
    h('div', { class: 'row' }, countdownLine(state)),
  );
}

function skillPrimary(state, skill) {
  if (skill === 'writing') return { href: '#/ielts/writing', label: 'Писать эссе' };
  if (skill === 'speaking') return { href: '#/ielts/speaking', label: 'Тренировать речь' };
  const next = firstUnmastered(state, lessonsOf(skill));
  if (!next) return { href: '#/ielts', label: 'Уроки скоро' };
  return { href: `#/topic/${next.id}`, label: 'Следующий урок' };
}

function skillSummary(state, skill) {
  if (skill === 'writing') return `Эссе написано: ${Object.keys(state.writing || {}).length}`;
  if (skill === 'speaking') return pluralize(Object.keys(state.speaking || {}).length, ['карточка пройдена', 'карточки пройдено', 'карточек пройдено']);
  const lessons = lessonsOf(skill);
  return `${studiedCount(state, lessons)} из ${pluralize(lessons.length, ['урока', 'уроков', 'уроков'])}`;
}

function skillProgress(state, skill) {
  if (skill === 'writing' || skill === 'speaking') return null;
  const lessons = lessonsOf(skill);
  if (!lessons.length) return null;
  const sum = lessons.reduce((s, t) => s + masteryOf(state, t.id), 0);
  return progressBar(sum / lessons.length, { color: subjectColor('ielts') });
}

function skillCard(state, ielts, skill) {
  const band = ielts?.bands?.[skill.key] ?? null;
  const link = skillPrimary(state, skill.key);
  return h(
    'div',
    { class: 'card card--accent stack', style: { '--card-accent': subjectColor('ielts') } },
    h('div', { class: 'card__sub' }, `${skill.icon} ${skill.label}`),
    h('div', { class: 'band' }, bandText(band)),
    h('div', { class: 'muted small' }, skillSummary(state, skill.key)),
    skillProgress(state, skill.key),
    h('a', { class: 'btn btn--primary btn--sm', href: link.href }, link.label),
  );
}

function vocabCard(state, ielts) {
  const total = ielts?.vocabTotal ?? 0;
  const learned = ielts?.vocabLearned ?? 0;
  const due = dueIds(state.vocab).length;
  const sets = topicsOf('ielts', { kind: 'vocab' }).length;
  const label = due ? `Повторить ${pluralize(due, ['слово', 'слова', 'слов'])}` : total ? 'Учить новые слова' : 'Начать словарь';
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, '🃏 Словарь'), due ? h('span', { class: 'badge badge--warn' }, `к повторению: ${due}`) : h('span', { class: 'badge badge--success' }, 'всё повторено')),
    h('div', { class: 'row', style: { gap: '18px' } }, h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(learned)), h('div', { class: 'stat__label' }, 'выучено')), h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(total)), h('div', { class: 'stat__label' }, 'в изучении')), h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(sets)), h('div', { class: 'stat__label' }, 'наборов')), h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(due)), h('div', { class: 'stat__label' }, 'на сегодня'))),
    total ? progressBar(learned / total, { color: subjectColor('ielts') }) : h('p', { class: 'muted small', style: { margin: 0 } }, 'Слова ещё не добавлены — открой любой набор, и они попадут в повторение.'),
    h('a', { class: 'btn btn--primary', href: '#/ielts/vocab' }, label),
  );
}

function grammarRow(state, topic, index) {
  const mastery = masteryOf(state, topic.id);
  return h(
    'a',
    { class: 'list-item', href: `#/topic/${topic.id}` },
    h('span', { class: 'list-item__num' }, String(index + 1)),
    h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, topicTitle(topic, langOf(state))), h('div', { class: 'list-item__sub' }, topic.minutes ? `≈ ${topic.minutes} мин` : '')),
    h('div', { style: { minWidth: '160px' } }, masteryRow(mastery, { color: subjectColor('ielts') })),
  );
}

function grammarSection(state) {
  const lessons = lessonsOf('grammar');
  const mastered = lessons.filter((t) => masteryOf(state, t.id) >= MASTERED_THRESHOLD).length;
  if (!lessons.length) return null;
  return h(
    'div',
    { class: 'card stack' },
    sectionTitle('📝 Grammar', `Освоено ${mastered} из ${lessons.length} · база для Writing и Speaking`),
    h('div', { class: 'list' }, lessons.map((t, i) => grammarRow(state, t, i))),
  );
}

function lessonSection(state, skill, title, sub) {
  const lessons = lessonsOf(skill);
  return h(
    'div',
    { class: 'stack', style: { gap: '10px' } },
    sectionTitle(title, sub),
    lessons.length
      ? h('div', { class: 'grid grid--3' }, lessons.map((t, i) => topicCard(t, state, { index: i })))
      : emptyState({ icon: '📚', title: 'Уроки появятся позже', sub: 'Пока можно учить слова и грамматику.', action: { label: 'К словарю', href: '#/ielts/vocab' } }),
  );
}

function promptRow(state, topic, index, page) {
  const stats = state.topics[topic.id];
  const sub = [topic.minutes ? `≈ ${topic.minutes} мин` : null, stats?.studiedAt ? 'теория прочитана' : 'теория не открыта'].filter(Boolean).join(' · ');
  return h(
    'a',
    { class: 'list-item', href: `#/ielts/${page}?topic=${topic.id}` },
    h('span', { class: 'list-item__num' }, String(index + 1)),
    h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, topicTitle(topic, langOf(state))), h('div', { class: 'list-item__sub' }, sub)),
    h('span', { class: 'muted' }, '→'),
  );
}

function promptSection(state, kind, page, title, sub, ctaLabel) {
  const topics = topicsOf('ielts', { kind });
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'row row--between' }, sectionTitle(title, sub), h('a', { class: 'btn btn--sm', href: `#/ielts/${page}` }, ctaLabel)),
    topics.length ? h('div', { class: 'list' }, topics.map((t, i) => promptRow(state, t, i, page))) : h('p', { class: 'muted small', style: { margin: 0 } }, 'Задания появятся позже — пока потренируй грамматику.'),
  );
}

function formatCard() {
  const row = ([k, v]) => h('tr', {}, h('td', { class: 'muted' }, k), h('td', {}, v));
  return h(
    'div',
    { class: 'card stack' },
    h('h2', { style: { margin: 0 } }, 'Формат IELTS Academic'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'topic-table' }, h('tbody', {}, FORMAT_ROWS.map(row)))),
    h('div', { class: 'card__sub' }, 'Ориентиры raw → band (правильных ответов из 40)'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'topic-table' }, h('tbody', {}, RAW_TO_BAND.map(row)))),
  );
}

export async function render({ state }) {
  const meta = ieltsSubject();
  if (!meta) return emptyState({ icon: '🇬🇧', title: 'Раздел IELTS пока не подключён', sub: 'Контент ещё не загружен.', action: { label: 'На главную', href: '#/' } });
  const ielts = ieltsReadiness(state, meta);
  return h(
    'div',
    { class: 'stack', style: { gap: '18px' } },
    pageHead({ title: `${meta.icon || '🇬🇧'} ${meta.name}`, sub: 'Четыре навыка, словарь и грамматика — всё в одном месте.' }),
    heroCard(state, ielts),
    h('div', { class: 'skill-grid' }, SKILLS.map((s) => skillCard(state, ielts, s))),
    vocabCard(state, ielts),
    grammarSection(state),
    lessonSection(state, 'reading', '📖 Reading', 'Типы вопросов и тайминг на academic-текстах'),
    lessonSection(state, 'listening', '🎧 Listening', 'Четыре части экзамена с озвучкой'),
    promptSection(state, 'writing', 'writing', '✍️ Writing', 'Task 1 и Task 2 с образцами и самопроверкой', 'Открыть редактор'),
    promptSection(state, 'speaking', 'speaking', '🎤 Speaking', 'Три части с таймером и cue cards', 'Открыть карточки'),
    formatCard(),
  );
}
