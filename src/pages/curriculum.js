// Страница «По классам»: школьная программа по математике (алгебра и геометрия по четвертям),
// трек «сначала свой класс, потом с 7-го» и подготовка к БЖБ/ТЖБ.

import { h, replaceChildren } from '../core/dom.js';
import { curriculumTopicsOf, langOf, topicSummary, topicTitle } from '../core/content.js';
import { CURRICULUM_SUBJECTS, GRADES, gradeProgram, normalizeGrade, normalizeTrack, schoolQuarter, trackPhases } from '../core/curriculum.js';
import { MASTERED_THRESHOLD, masteryOf } from '../core/mastery.js';
import { setProfile } from '../core/actions.js';
import { getState } from '../core/store.js';
import { todayKey } from '../core/time.js';
import { pageHead, subjectColor } from '../ui/components.js';
import { activePhaseIndex, chips, phaseRow, trackFields } from '../ui/curriculum-ui.js';
import { toast } from '../ui/toast.js';

const SUBJECT_ID = CURRICULUM_SUBJECTS[0];
const NO_QUARTER = { quarter: 0, holiday: false, label: '' };

// ---------- темы ----------

function statusBadge(state, topic) {
  if (!topic.ready) return h('span', { class: 'badge' }, 'материал готовится');
  const mastery = masteryOf(state, topic.id);
  if (mastery >= MASTERED_THRESHOLD) return h('span', { class: 'badge badge--success' }, '✓ освоено');
  if (state.topics[topic.id]?.answered) return h('span', { class: 'badge badge--info' }, `${Math.round(mastery * 100)}%`);
  return h('span', { class: 'badge badge--primary' }, 'открыть');
}

function topicRow(state, topic, number) {
  const main = h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, topicTitle(topic, langOf(state))), h('div', { class: 'list-item__sub' }, topicSummary(topic, langOf(state))));
  const num = h('div', { class: 'list-item__num' }, String(number));
  if (!topic.ready) return h('div', { class: 'list-item curriculum-item--planned' }, num, main, statusBadge(state, topic));
  return h('a', { class: 'list-item', href: `#/topic/${topic.id}` }, num, main, statusBadge(state, topic));
}

function lineBlock(state, line, program) {
  const rows = line.topics.length
    ? h('div', { class: 'list' }, line.topics.map((t) => topicRow(state, t, program.topics.indexOf(t) + 1)))
    : h('div', { class: 'small muted' }, 'В этой четверти нет тем, которые спрашивают на ЕНТ.');
  return h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'small', style: { fontWeight: '600', color: subjectColor(SUBJECT_ID) } }, line.name), rows);
}

function quarterCard(state, quarter, program, current) {
  const isCurrent = current.quarter === quarter.n;
  if (quarter.lines.every((l) => !l.topics.length)) {
    return h('div', { class: isCurrent ? 'card quarter quarter--current' : 'card quarter' }, h('div', { class: 'row row--between' }, h('h3', { style: { margin: 0 } }, quarter.label), h('span', { class: 'muted small' }, 'в этой четверти на ЕНТ ничего не спрашивают')));
  }
  const readyIds = quarter.lines.flatMap((l) => l.topics).filter((t) => t.ready).map((t) => t.id);
  const mark = isCurrent ? h('span', { class: 'badge badge--primary' }, current.holiday ? 'следующая четверть' : 'сейчас в школе') : null;
  const mix = readyIds.length ? h('a', { class: 'btn btn--sm', href: `#/practice?mode=topics&ids=${readyIds.join(',')}&n=10` }, 'Микс четверти') : null;
  return h(
    'div',
    { class: isCurrent ? 'card stack quarter quarter--current' : 'card stack quarter' },
    h('div', { class: 'row row--between' }, h('h3', { style: { margin: 0 } }, quarter.label), h('div', { class: 'row' }, mark, mix)),
    h('div', { class: 'grid grid--2' }, quarter.lines.map((line) => lineBlock(state, line, program))),
  );
}

function quarterAlert(state, current, grade, program) {
  const quarter = program.quarters.find((q) => q.n === current.quarter);
  const titles = quarter ? quarter.lines.flatMap((l) => l.topics).map((t) => topicTitle(t, langOf(state))) : [];
  const head = current.holiday ? `Каникулы. Впереди ${current.label} ${grade} класса — пройди её темы заранее: ` : `Сейчас ${current.label} ${grade} класса. Это спросят на БЖБ и ТЖБ: `;
  return h('div', { class: 'alert alert--info' }, h('b', {}, head), titles.length ? titles.join(' · ') : 'в этой четверти тем ЕНТ нет — иди по следующему этапу трека.');
}

// ---------- трек ----------

function trackCard(state, topics, apply) {
  const grade = normalizeGrade(state.profile.grade);
  const track = normalizeTrack(state.profile.track);
  const phases = trackPhases(topics, grade);
  const activeIndex = activePhaseIndex(state, phases, SUBJECT_ID);
  const sequence = phases.filter((p) => p.grades.length).map((p) => p.grades.join(', ')).join(' → ');
  const body = track === 'school'
    ? h('div', { class: 'stack', style: { gap: '8px' } }, h('div', { class: 'muted small' }, `Порядок классов: ${sequence}. План и «тема дня» берут математику отсюда.`), h('div', { class: 'list' }, phases.map((p, i) => phaseRow(state, p, i, { active: i === activeIndex, subjectId: SUBJECT_ID }))))
    : h('div', { class: 'alert alert--info', style: { margin: 0 } }, 'Сейчас темы по математике идут по весу на ЕНТ. Выбери «Сначала свой класс, потом с 7-го», чтобы план шёл по школьной программе.');
  return h('div', { class: 'card stack' }, h('h2', { style: { margin: 0 } }, 'Твой трек по математике'), trackFields(state, apply), body);
}

// ---------- страница ----------

export async function render(ctx) {
  const topics = curriculumTopicsOf(SUBJECT_ID);
  const quarterNow = schoolQuarter(todayKey());
  const root = h('div', { class: 'stack', style: { gap: '18px' } });
  let viewGrade = normalizeGrade((ctx.state || getState()).profile.grade);

  function draw(state) {
    const ownGrade = normalizeGrade(state.profile.grade);
    const program = gradeProgram(topics, viewGrade);
    const current = viewGrade === ownGrade ? quarterNow : NO_QUARTER;
    const tabs = chips(GRADES, viewGrade, (g) => { viewGrade = g; draw(state); }, (g) => `${g} класс`);
    replaceChildren(
      root,
      pageHead({ title: 'Программа по классам', sub: 'Математика: алгебра и геометрия по четвертям. Сначала свой класс — под БЖБ и ТЖБ, потом фундамент с 7-го.', crumbs: [{ label: 'ЕНТ', href: '#/ubt' }, { label: 'По классам' }] }),
      trackCard(state, topics, apply),
      h('div', { class: 'row row--between', style: { flexWrap: 'wrap', gap: '10px' } }, h('h2', { style: { margin: 0 } }, `Программа ${viewGrade} класса`), tabs),
      viewGrade === ownGrade ? quarterAlert(state, quarterNow, viewGrade, program) : null,
      program.quarters.map((q) => quarterCard(state, q, program, current)),
      program.rest.length ? h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Вне четвертей'), h('div', { class: 'list' }, program.rest.map((t) => topicRow(state, t, program.topics.indexOf(t) + 1)))) : null,
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Темы с пометкой «материал готовится» уже стоят в треке, но конспекта и заданий для них пока нет — они появятся в плане, как только будут написаны.'),
    );
  }

  function apply(patch, message) {
    try {
      setProfile(patch);
      toast(message, { tone: 'success' });
      if (patch.grade !== undefined) viewGrade = normalizeGrade(getState().profile.grade);
      draw(getState());
    } catch (error) {
      console.error('Не удалось сохранить настройки трека:', error);
      toast('Не удалось сохранить. Попробуй ещё раз.', { tone: 'danger' });
    }
  }

  draw(ctx.state || getState());
  return root;
}
