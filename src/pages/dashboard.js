// Главная «Сегодня»: прогноз, миссии дня, предметы, неделя, рекомендации.

import { h, pluralize } from '../core/dom.js';
import { ieltsSubject, ubtSubjects } from '../core/content.js';
import { ieltsReadiness, overallReadiness } from '../core/mastery.js';
import { countdown, dailyMissions, nextTopics } from '../core/plan.js';
import { isActiveDay, levelInfo, streakInfo, sumDaily } from '../core/stats.js';
import { addDaysKey, todayKey, weekStartKey, weekdayShort } from '../core/time.js';
import { ring, subjectColor, topicCard } from '../ui/components.js';

function greeting(name) {
  const hour = new Date().getHours();
  const word = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  return name ? `${word}, ${name}!` : `${word}!`;
}

function heroCard(state, readiness, ielts, streak, level, cd) {
  const hasData = readiness.studied > 0;
  const anyExam = (state.exams || []).some((e) => e.mode === 'full');
  return h(
    'div',
    { class: 'card card--hero stack' },
    h('div', { class: 'row row--between' }, h('div', {}, h('div', { class: 'muted' }, greeting(state.profile.name)), h('h2', { style: { margin: 0 } }, 'Прогноз ЕНТ')), h('span', { class: 'level-pill' }, `Ур. ${level.level} · ${level.title}`)),
    h('div', { class: 'forecast' }, h('span', { class: 'forecast__num' }, hasData ? String(readiness.predicted) : '—'), h('span', { class: 'forecast__max' }, `из ${readiness.max}`), h('span', { class: 'muted' }, `· цель ${state.profile.targetScore}`)),
    h('div', { class: 'muted small' }, hasData ? `По мастерству тем${anyExam ? ' и результатам пробников' : ''} · освоено ${readiness.mastered} из ${readiness.topicsTotal} тем` : 'Появится после первой практики — начни с миссии дня'),
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'level-pill' }, `🔥 Серия ${streak.current} дн.`),
      cd.examDays !== null ? h('span', { class: 'level-pill' }, `📅 До ЕНТ ${cd.examDays} дн.`) : null,
      ielts?.overall ? h('span', { class: 'level-pill' }, `🇬🇧 IELTS ≈ ${ielts.overall.toFixed(1)}`) : null,
    ),
  );
}

function missionRow(mission) {
  return h(
    'a',
    { class: mission.done ? 'mission done' : 'mission', href: mission.href },
    h('span', { class: 'mission__check' }, mission.done ? '✓' : ''),
    h('div', { class: 'mission__main' }, h('div', { class: 'mission__title' }, `${mission.icon} ${mission.title}`), h('div', { class: 'mission__sub' }, mission.sub)),
    h('span', { class: 'badge' }, `${Math.round(mission.minutes)} мин`),
  );
}

function missionsCard(missions) {
  const left = missions.filter((m) => !m.done);
  const minutes = left.reduce((s, m) => s + m.minutes, 0);
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, 'Миссии на сегодня'), h('span', { class: 'badge badge--primary' }, left.length ? `≈ ${Math.round(minutes)} мин` : 'Готово ✓')),
    missions.length ? h('div', { class: 'stack', style: { gap: '8px' } }, missions.map(missionRow)) : h('p', { class: 'muted' }, 'Контент ещё загружается.'),
    !left.length && missions.length ? h('p', { class: 'muted small', style: { margin: 0 } }, 'Все миссии выполнены. Можно отдохнуть — или пройти ещё одну тему.') : null,
  );
}

function subjectsRow(state, readiness) {
  return h(
    'div',
    { class: 'subject-mini' },
    ubtSubjects().map((s) => {
      const r = readiness.perSubject.find((x) => x.subjectId === s.id);
      return h('a', { href: `#/subject/${s.id}` }, ring({ value: r?.mastery || 0, size: 52, stroke: 6, color: subjectColor(s.id), label: `${Math.round((r?.mastery || 0) * 100)}` }), h('b', {}, s.short || s.name), h('span', { class: 'muted' }, `${r?.predicted ?? 0} / ${s.exam?.maxPoints ?? 0}`));
    }),
  );
}

function weekStrip(state) {
  const today = todayKey();
  const start = weekStartKey(today);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  return h(
    'div',
    { class: 'week-strip' },
    days.map((key) => {
      const d = state.daily[key];
      const classes = ['week-strip__day', isActiveDay(d) ? 'active' : '', key === today ? 'today' : ''].filter(Boolean).join(' ');
      return h('div', { class: classes }, h('b', {}, weekdayShort(key)), h('span', { class: 'muted' }, d?.minutes ? `${Math.round(d.minutes)} мин` : key > today ? '' : '—'));
    }),
  );
}

function weekCard(state) {
  const week = sumDaily(state, 7);
  return h(
    'div',
    { class: 'card stack' },
    h('h2', { style: { margin: 0 } }, 'Эта неделя'),
    weekStrip(state),
    h(
      'div',
      { class: 'row', style: { gap: '18px' } },
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(Math.round(week.minutes))), h('div', { class: 'stat__label' }, 'минут')),
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(week.answered)), h('div', { class: 'stat__label' }, 'ответов')),
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, week.answered ? `${Math.round(week.accuracy * 100)}%` : '—'), h('div', { class: 'stat__label' }, 'точность')),
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, `+${week.xp}`), h('div', { class: 'stat__label' }, 'XP')),
    ),
  );
}

function paceCard(cd) {
  if (cd.examDays === null) return null;
  const text = cd.examDays <= 0 ? 'ЕНТ уже наступил — удачи!' : `Осталось ${pluralize(cd.remaining, ['тема', 'темы', 'тем'])} из ${cd.total}. Чтобы успеть, нужно ≈ ${cd.topicsPerWeek} ${cd.topicsPerWeek === 1 ? 'тема' : 'темы'} в неделю.`;
  return h('div', { class: 'alert alert--info' }, `📅 ${text}`);
}

export async function render({ state }) {
  const readiness = overallReadiness(state);
  const ielts = ieltsReadiness(state, ieltsSubject());
  const missions = dailyMissions(state);
  const cd = countdown(state);
  const streak = streakInfo(state);
  const level = levelInfo(state.xp);
  const recommended = nextTopics(state, 3);
  return h(
    'div',
    { class: 'stack', style: { gap: '18px' } },
    h('div', { class: 'hero-grid' }, heroCard(state, readiness, ielts, streak, level, cd), missionsCard(missions)),
    h('div', { class: 'stack', style: { gap: '10px' } }, h('div', { class: 'row row--between' }, h('h2', { style: { margin: 0 } }, 'Предметы ЕНТ'), h('a', { href: '#/ubt' }, 'Все темы →')), subjectsRow(state, readiness)),
    h('div', { class: 'grid grid--2' }, weekCard(state), h('div', { class: 'card stack' }, h('h2', { style: { margin: 0 } }, 'Быстрый старт'), h('div', { class: 'stack', style: { gap: '8px' } }, h('a', { class: 'btn', href: '#/practice?mode=review' }, '🔁 Повторить ошибки'), h('a', { class: 'btn', href: '#/exam?mode=mini' }, '📝 Мини-пробник (45 мин)'), h('a', { class: 'btn', href: '#/ielts/vocab' }, '🃏 Слова IELTS'), h('a', { class: 'btn', href: '#/ielts' }, '🇬🇧 Урок IELTS')))),
    paceCard(cd),
    recommended.length ? h('div', { class: 'stack', style: { gap: '10px' } }, h('h2', { style: { margin: 0 } }, 'Рекомендуем дальше'), h('div', { class: 'grid grid--3' }, recommended.map((t) => topicCard(t, state)))) : null,
  );
}
