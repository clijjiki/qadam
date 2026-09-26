// Мобильная вкладка «Ещё»: профиль и ссылки на остальные разделы.

import { h } from '../core/dom.js';
import { levelInfo, streakInfo } from '../core/stats.js';
import { pageHead, progressBar } from '../ui/components.js';

const LINKS = [
  ['📅', 'План подготовки', '#/plan'],
  ['🏫', 'Программа по классам', '#/curriculum'],
  ['📝', 'Пробники ЕНТ', '#/exam'],
  ['🃏', 'Словарь IELTS', '#/ielts/vocab'],
  ['✍️', 'IELTS Writing', '#/ielts/writing'],
  ['🎤', 'IELTS Speaking', '#/ielts/speaking'],
  ['📊', 'Статистика', '#/stats'],
  ['⚙️', 'Настройки', '#/settings'],
];

export async function render({ state }) {
  const level = levelInfo(state.xp);
  const streak = streakInfo(state);
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: 'Ещё' }),
    h(
      'div',
      { class: 'card stack' },
      h('div', { class: 'row row--between' }, h('b', {}, state.profile.name || 'Ученик'), h('span', { class: 'badge badge--warn' }, `🔥 ${streak.current}`)),
      h('div', { class: 'muted small' }, `Уровень ${level.level} · ${level.title} · ${state.xp} XP`),
      progressBar(level.progress),
      h('div', { class: 'muted small' }, `До следующего уровня ${level.toNext} XP`),
    ),
    h('div', { class: 'more-grid' }, LINKS.map(([icon, label, href]) => h('a', { href }, h('span', {}, icon), label))),
    h('p', { class: 'muted small' }, 'Прогресс хранится только в этом браузере. Сделай экспорт в ', h('a', { href: '#/settings' }, 'настройках'), ', чтобы не потерять его.'),
  );
}
