// Общие элементы трека по школьной программе: чипсы, поля «класс / порядок тем», статистика и строка этапа.

import { h } from '../core/dom.js';
import { GRADES, TRACKS, normalizeGrade, normalizeTrack } from '../core/curriculum.js';
import { MASTERED_THRESHOLD, masteryOf } from '../core/mastery.js';
import { rankedTopics } from '../core/plan.js';
import { progressBar, subjectColor } from './components.js';

/** Ряд кнопок-чипсов: values → onPick(value); format задаёт подпись. */
export function chips(values, current, onPick, format) {
  return h(
    'div',
    { class: 'chips' },
    values.map((value) => h('button', { type: 'button', class: value === current ? 'chip active' : 'chip', onClick: () => onPick(value) }, format ? format(value) : String(value))),
  );
}

/** Два поля профиля: «Мой класс» и «Порядок тем по математике». apply(patch, message) сохраняет и перерисовывает. */
export function trackFields(state, apply) {
  const grade = normalizeGrade(state.profile.grade);
  const track = normalizeTrack(state.profile.track);
  const trackName = (id) => TRACKS.find((t) => t.id === id)?.name || id;
  return h(
    'div',
    { class: 'grid grid--2' },
    h('div', { class: 'field' }, h('label', {}, 'Мой класс'), chips(GRADES, grade, (g) => apply({ grade: g }, `Класс: ${g}`), (g) => `${g} класс`), h('div', { class: 'help' }, 'Математика идёт сначала по программе твоего класса (БЖБ, ТЖБ), потом с 7-го.')),
    h('div', { class: 'field' }, h('label', {}, 'Порядок тем по математике'), chips(TRACKS.map((t) => t.id), track, (id) => apply({ track: id }, `Порядок: ${trackName(id).toLowerCase()}`), trackName), h('div', { class: 'help' }, 'Остальные предметы всегда идут по весу на ЕНТ.')),
  );
}

/** Сколько тем этапа освоено и для скольких вообще есть материал. */
export function phaseStats(state, topics) {
  const ready = topics.filter((t) => t.ready !== false);
  const mastered = ready.filter((t) => masteryOf(state, t.id) >= MASTERED_THRESHOLD).length;
  return { total: topics.length, ready: ready.length, mastered, progress: topics.length ? mastered / topics.length : 0 };
}

/** Активный этап: тот, откуда план возьмёт следующую тему; если готовых тем нет — первый незавершённый. */
export function activePhaseIndex(state, phases, subjectId) {
  const next = rankedTopics(state, subjectId)[0];
  if (next) return phases.findIndex((p) => p.topics.some((t) => t.id === next.id));
  return phases.findIndex((p) => phaseStats(state, p.topics).mastered < p.topics.length);
}

/** Строка этапа: номер, название, подсказка, прогресс. */
export function phaseRow(state, phase, index, { active = false, subjectId = 'math' } = {}) {
  const stats = phaseStats(state, phase.topics);
  return h(
    'div',
    { class: active ? 'list-item phase-row phase-row--active' : 'list-item phase-row' },
    h('div', { class: 'list-item__num' }, String(index + 1)),
    h(
      'div',
      { class: 'list-item__main stack', style: { gap: '4px' } },
      h('div', { class: 'list-item__title' }, phase.title),
      h('div', { class: 'list-item__sub' }, `${phase.hint} · освоено ${stats.mastered} из ${stats.total} · материал готов: ${stats.ready}`),
      progressBar(stats.progress, { color: subjectColor(subjectId) }),
    ),
  );
}
