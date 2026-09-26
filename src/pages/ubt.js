// Хаб ЕНТ: общий прогноз, карточки пяти предметов, формат экзамена.

import { h, pluralize } from '../core/dom.js';
import { langOf, topicTitle, topicsOf, ubtSubjects } from '../core/content.js';
import { MASTERED_THRESHOLD, masteryOf, overallReadiness } from '../core/mastery.js';
import { countdown } from '../core/plan.js';
import { streakInfo } from '../core/stats.js';
import { CURRICULUM_SUBJECTS } from '../core/curriculum.js';
import { pageHead, ring, subjectColor } from '../ui/components.js';
import { icon, subjectIcon } from '../ui/icons.js';

function weakest(state, subjectId, limit = 2) {
  return topicsOf(subjectId, { kind: 'lesson' })
    .map((t) => ({ t, m: masteryOf(state, t.id), started: !!state.topics[t.id]?.answered }))
    .filter((x) => x.started && x.m < MASTERED_THRESHOLD)
    .sort((a, b) => a.m - b.m)
    .slice(0, limit);
}

function nextTopicOf(state, subjectId) {
  const topics = topicsOf(subjectId, { kind: 'lesson' });
  return topics.find((t) => !state.topics[t.id]?.answered) || topics.find((t) => masteryOf(state, t.id) < MASTERED_THRESHOLD) || topics[0] || null;
}

function subjectTile(state, meta, readiness) {
  const r = readiness.perSubject.find((x) => x.subjectId === meta.id) || { predicted: 0, maxPoints: meta.exam?.maxPoints || 0, mastery: 0, topics: 0, studied: 0, mastered: 0 };
  const weak = weakest(state, meta.id);
  const next = nextTopicOf(state, meta.id);
  return h(
    'div',
    { class: 'card subject-tile', style: { '--card-accent': subjectColor(meta.id) } },
    h('div', { class: 'row row--between' }, h('div', {}, h('div', { class: 'subj__ico', style: { '--subj': subjectColor(meta.id), marginBottom: '8px' } }, subjectIcon(meta.id, { size: 18 })), h('a', { class: 'card__title', href: `#/subject/${meta.id}` }, meta.name)), ring({ value: r.mastery, size: 60, color: subjectColor(meta.id) })),
    h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, `${Math.round(r.predicted)} `, h('span', { class: 'muted', style: { fontSize: '.6em' } }, `/ ${r.maxPoints}`)), h('div', { class: 'stat__label' }, 'прогноз баллов')),
    h('div', { class: 'card__sub' }, `Изучено ${r.studied} из ${r.topics} · освоено ${r.mastered}`),
    weak.length ? h('div', { class: 'stack', style: { gap: '4px' } }, h('div', { class: 'small muted' }, 'Слабые темы:'), weak.map((x) => h('a', { class: 'small', href: `#/topic/${x.t.id}` }, `• ${topicTitle(x.t, langOf(state))} — ${Math.round(x.m * 100)}%`))) : null,
    h('div', { class: 'row' }, next ? h('a', { class: 'btn btn--primary btn--sm', href: `#/topic/${next.id}` }, 'Учить дальше') : null, h('a', { class: 'btn btn--sm', href: `#/practice?mode=subject&subject=${meta.id}&n=10` }, 'Микс 10'), CURRICULUM_SUBJECTS.includes(meta.id) ? h('a', { class: 'btn btn--sm', href: '#/curriculum' }, 'По классам') : null),
  );
}

function formatCard() {
  const rows = ubtSubjects().map((s) => {
    const e = s.exam || {};
    const parts = [e.single ? `${e.single} одиночных` : null, e.context ? `${e.context} по контексту` : null, e.multi ? `${e.multi} мультиответ` : null, e.match ? `${e.match} соответствие` : null].filter(Boolean).join(', ');
    return h('tr', {}, h('td', {}, s.name), h('td', {}, parts), h('td', { class: 'right' }, String(e.maxPoints || 0)));
  });
  return h(
    'div',
    { class: 'card stack' },
    h('h3', { style: { margin: 0 } }, 'Формат ЕНТ-2026'),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Предмет'), h('th', {}, 'Задания'), h('th', { class: 'right' }, 'Баллы'))), h('tbody', {}, rows))),
    h('p', { class: 'muted small', style: { margin: 0 } }, '120 заданий · 140 баллов · 240 минут. Мультиответ и соответствие — по 2 балла, одна ошибка — 1 балл. За пустой ответ штрафа нет.'),
    h('div', { class: 'row' }, h('a', { class: 'btn btn--primary', href: '#/exam' }, icon('exam', { size: 16 }), 'Пробник'), h('a', { class: 'btn', href: '#/practice?mode=review' }, icon('repeat', { size: 16 }), 'Повторение'), h('a', { class: 'btn', href: '#/practice?mode=weak&n=10' }, icon('target', { size: 16 }), 'Слабые темы')),
  );
}

export async function render({ state }) {
  const readiness = overallReadiness(state);
  const cd = countdown(state);
  const streak = streakInfo(state);
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: 'ЕНТ', sub: 'Математика + Информатика и три обязательных предмета' }),
    h(
      'div',
      { class: 'card card--hero row row--between' },
      h(
        'div',
        {},
        h('div', { class: 'forecast' }, h('span', { class: 'forecast__num' }, String(readiness.predicted)), h('span', { class: 'forecast__max' }, `из ${readiness.max}`)),
        h('div', { class: 'muted' }, `Цель ${state.profile.targetScore} · освоено ${readiness.mastered} из ${readiness.topicsTotal} тем`),
        h('div', { class: 'row', style: { marginTop: '10px' } }, cd.examDays !== null ? h('span', { class: 'pill' }, icon('calendar', { size: 15 }), `${cd.examDays} дн. до ЕНТ`) : null, cd.topicsPerWeek ? h('span', { class: 'pill' }, icon('trendUp', { size: 15 }), `${pluralize(cd.topicsPerWeek, ['тема', 'темы', 'тем'])} в неделю`) : null, h('span', { class: 'pill' }, icon('flame', { size: 15 }), String(streak.current))),
      ),
      ring({ value: readiness.max ? readiness.predicted / readiness.max : 0, size: 96, stroke: 9, color: '#fff' }),
    ),
    h('div', { class: 'grid grid--3' }, ubtSubjects().map((s) => subjectTile(state, s, readiness))),
    formatCard(),
  );
}
