// Оболочка приложения: сайдбар (ноутбук), верхняя панель и нижние вкладки (телефон), контейнер страницы.

import { h, qsa, replaceChildren } from '../core/dom.js';
import { getState, subscribe } from '../core/store.js';
import { levelInfo, streakInfo } from '../core/stats.js';
import { icon } from './icons.js';
import { langSwitch } from './lang-switch.js';

const NAV = [
  { key: 'home', href: '#/', icon: 'home', label: 'Сегодня' },
  { section: 'ЕНТ' },
  { key: 'ubt', href: '#/ubt', icon: 'cap', label: 'Предметы' },
  { key: 'school', href: '#/curriculum', icon: 'book', label: 'По классам' },
  { key: 'review', href: '#/practice?mode=review', icon: 'repeat', label: 'Повторение' },
  { key: 'exam', href: '#/exam', icon: 'exam', label: 'Пробники' },
  { section: 'IELTS' },
  { key: 'ielts', href: '#/ielts', icon: 'globe', label: 'Навыки' },
  { key: 'vocab', href: '#/ielts/vocab', icon: 'cards', label: 'Словарь' },
  { section: 'Прогресс' },
  { key: 'plan', href: '#/plan', icon: 'calendar', label: 'План' },
  { key: 'stats', href: '#/stats', icon: 'chart', label: 'Статистика' },
  { key: 'settings', href: '#/settings', icon: 'settings', label: 'Настройки' },
];

const TABS = [
  { key: 'home', href: '#/', icon: 'home', label: 'Сегодня' },
  { key: 'ubt', href: '#/ubt', icon: 'cap', label: 'ЕНТ' },
  { key: 'review', href: '#/practice?mode=review', icon: 'repeat', label: 'Повтор' },
  { key: 'ielts', href: '#/ielts', icon: 'globe', label: 'IELTS' },
  { key: 'more', href: '#/more', icon: 'more', label: 'Ещё' },
];

export const COPYRIGHT = '© 2026 Nurbol · Qadam. Все права защищены.';

const MORE_KEYS =new Set(['more', 'plan', 'stats', 'settings', 'exam', 'vocab', 'school']);

function brand() {
  return h('a', { class: 'brand', href: '#/' }, h('div', { class: 'brand__logo' }, 'Q'), h('div', {}, h('div', { class: 'brand__name' }, 'Qadam'), h('div', { class: 'brand__sub' }, 'ЕНТ · IELTS')));
}

function navLink(item) {
  return h('a', { class: 'nav__link', href: item.href, dataset: { key: item.key } }, h('span', { class: 'ico' }, icon(item.icon, { size: 18 })), item.label);
}

function userCard(state) {
  const level = levelInfo(state.xp);
  const streak = streakInfo(state);
  return h(
    'div',
    { class: 'user-card' },
    h('div', { class: 'user-card__name' }, state.profile.name || 'Ученик'),
    h('div', { class: 'user-card__meta muted small' }, `Ур. ${level.level} · ${level.title}`),
    h('div', { class: 'progress', style: { marginTop: '6px' } }, h('div', { class: 'progress__bar', style: { width: `${Math.round(level.progress * 100)}%` } })),
    h('div', { class: 'user-card__meta small row', style: { marginTop: '6px', gap: '6px' } }, icon('flame', { size: 14 }), `Серия: ${streak.current}${streak.activeToday ? '' : ' · сегодня ещё нет'}`),
  );
}

function topbarStats(state) {
  const streak = streakInfo(state);
  const level = levelInfo(state.xp);
  return h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'badge badge--warn', style: { gap: '4px' } }, icon('flame', { size: 13 }), String(streak.current)), h('span', { class: 'badge badge--primary' }, `Ур. ${level.level}`));
}

export function createLayout(root) {
  const page = h('div', { class: 'container', id: 'page' });
  const sidebarUser = h('div', { class: 'sidebar__foot' }, userCard(getState()));
  const topStats = h('div', {}, topbarStats(getState()));
  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    brand(),
    langSwitch({ withIcon: true, label: 'Язык' }),
    h('nav', { class: 'nav', 'aria-label': 'Главное меню' }, NAV.map((item) => (item.section ? h('div', { class: 'nav__section' }, item.section) : navLink(item)))),
    sidebarUser,
    h('div', { class: 'copyright' }, COPYRIGHT),
  );
  const topbar = h('header', { class: 'topbar' }, brand(), h('div', { class: 'row', style: { gap: '8px' } }, langSwitch(), topStats));
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Вкладки' }, TABS.map((tab) => h('a', { href: tab.href, dataset: { key: tab.key } }, h('span', { class: 'ico' }, icon(tab.icon, { size: 20 })), tab.label)));
  const main = h('main', { class: 'main' }, page);
  const shell = h('div', { class: 'shell' }, sidebar, h('div', { class: 'main-col' }, topbar, main), tabbar);
  replaceChildren(root, shell);

  subscribe((state) => {
    replaceChildren(sidebarUser, userCard(state));
    replaceChildren(topStats, topbarStats(state));
  });

  return {
    content: page,
    setContent(view) {
      replaceChildren(page, view);
    },
    setActive(key) {
      for (const link of qsa('[data-key]', shell)) {
        const own = link.dataset.key;
        const active = own === key || (own === 'more' && MORE_KEYS.has(key) && link.closest('.tabbar'));
        link.classList.toggle('active', !!active);
      }
    },
    setFocus(enabled) {
      shell.classList.toggle('focus', !!enabled);
    },
  };
}
