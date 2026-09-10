// Страница предмета: список тем с фильтрами и прогнозом.

import { h, replaceChildren } from '../core/dom.js';
import { subject, topicsOf } from '../core/content.js';
import { masteryLevel, masteryOf, subjectReadiness } from '../core/mastery.js';
import { emptyState, pageHead, ring, statTile, subjectColor, topicCard } from '../ui/components.js';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'new', label: 'Не начаты' },
  { key: 'weak', label: 'Слабые' },
  { key: 'progress', label: 'В процессе' },
  { key: 'mastered', label: 'Освоены' },
];

function matches(key, mastery, started) {
  const level = masteryLevel(mastery).key;
  if (key === 'all') return true;
  if (key === 'new') return !started;
  if (key === 'weak') return started && mastery < 0.5;
  if (key === 'progress') return started && mastery >= 0.5 && level !== 'mastered';
  return level === 'mastered';
}

export async function render({ params, state, navigate }) {
  if (params.subjectId === 'ielts') {
    navigate('/ielts', { replace: true });
    return h('div', {});
  }
  const meta = subject(params.subjectId);
  if (!meta) return emptyState({ icon: '🧭', title: 'Предмет не найден', action: { label: 'К предметам ЕНТ', href: '#/ubt' } });
  const topics = topicsOf(meta.id, { kind: 'lesson' });
  const r = subjectReadiness(state, meta);
  const list = h('div', { class: 'grid grid--3' });
  const chips = h('div', { class: 'filters' });
  const counter = h('div', { class: 'muted small' });
  let active = 'all';

  const draw = () => {
    replaceChildren(chips, ...FILTERS.map((f) => h('button', { class: f.key === active ? 'chip active' : 'chip', onClick: () => { active = f.key; draw(); } }, f.label)));
    const shown = topics.filter((t) => matches(active, masteryOf(state, t.id), !!state.topics[t.id]?.answered));
    counter.textContent = `Показано ${shown.length} из ${topics.length} тем`;
    replaceChildren(list, ...(shown.length ? shown.map((t, i) => topicCard(t, state, { index: topics.indexOf(t) })) : [emptyState({ icon: '🔍', title: 'Пусто', sub: 'В этой группе тем нет — попробуй другой фильтр.' })]));
  };
  draw();

  return h(
    'div',
    { class: 'stack' },
    pageHead({
      title: meta.name,
      sub: `${topics.length} тем · прогноз ${Math.round(r.predicted)} из ${r.maxPoints} баллов`,
      crumbs: [{ label: 'ЕНТ', href: '#/ubt' }, { label: meta.short || meta.name }],
      actions: [h('a', { class: 'btn', href: `#/practice?mode=subject&subject=${meta.id}&n=10` }, 'Микс 10 вопросов'), h('a', { class: 'btn btn--primary', href: '#/exam?mode=mini' }, 'Пробник')],
    }),
    h(
      'div',
      { class: 'card row', style: { gap: '24px' } },
      ring({ value: r.mastery, size: 88, stroke: 8, color: subjectColor(meta.id) }),
      statTile({ value: `${Math.round(r.predicted)} / ${r.maxPoints}`, label: 'прогноз баллов' }),
      statTile({ value: `${r.studied} / ${r.topics}`, label: 'начато тем' }),
      statTile({ value: String(r.mastered), label: 'освоено' }),
    ),
    chips,
    counter,
    list,
  );
}
