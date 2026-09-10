// Оболочка приложения: сайдбар (ноутбук), верхняя панель и нижние вкладки (телефон), контейнер страницы.

import { h, qsa, replaceChildren } from '../core/dom.js';
import { getState, subscribe } from '../core/store.js';
import { levelInfo, streakInfo } from '../core/stats.js';

const NAV = [
  { key: 'home', href: '#/', icon: '🏠', label: 'Сегодня' },
  { section: 'ЕНТ' },
  { key: 'ubt', href: '#/ubt', icon: '🎓', label: 'Предметы' },
  { key: 'review', href: '#/practice?mode=review', icon: '🔁', label: 'Повторение' },
  { key: 'exam', href: '#/exam', icon: '📝', label: 'Пробники' },
  { section: 'IELTS' },
  { key: 'ielts', href: '#/ielts', icon: '🇬🇧', label: 'Навыки' },
  { key: 'vocab', href: '#/ielts/vocab', icon: '🃏', label: 'Словарь' },
  { section: 'Прогресс' },
  { key: 'plan', href: '#/plan', icon: '📅', label: 'План' },
  { key: 'stats', href: '#/stats', icon: '📊', label: 'Статистика' },
  { key: 'settings', href: '#/settings', icon: '⚙️', label: 'Настройки' },
];

const TABS = [
  { key: 'home', href: '#/', icon: '🏠', label: 'Сегодня' },
  { key: 'ubt', href: '#/ubt', icon: '🎓', label: 'ЕНТ' },
  { key: 'review', href: '#/practice?mode=review', icon: '🔁', label: 'Повтор' },
  { key: 'ielts', href: '#/ielts', icon: '🇬🇧', label: 'IELTS' },
  { key: 'more', href: '#/more', icon: '☰', label: 'Ещё' },
];

const MORE_KEYS = new Set(['more', 'plan', 'stats', 'settings', 'exam', 'vocab']);

function brand() {
  return h('a', { class: 'brand', href: '#/' }, h('div', { class: 'brand__logo' }, 'Q'), h('div', {}, h('div', { class: 'brand__name' }, 'Qadam'), h('div', { class: 'brand__sub' }, 'ЕНТ · IELTS')));
}

function navLink(item) {
  return h('a', { class: 'nav__link', href: item.href, dataset: { key: item.key } }, h('span', { class: 'ico' }, item.icon), item.label);
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
    h('div', { class: 'user-card__meta small', style: { marginTop: '6px' } }, `🔥 Серия: ${streak.current} ${streak.activeToday ? '' : '· сегодня ещё нет'}`),
  );
}

function topbarStats(state) {
  const streak = streakInfo(state);
  const level = levelInfo(state.xp);
  return h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'badge badge--warn' }, `🔥 ${streak.current}`), h('span', { class: 'badge badge--primary' }, `Ур. ${level.level}`));
}

export function createLayout(root) {
  const page = h('div', { class: 'container', id: 'page' });
  const sidebarUser = h('div', { class: 'sidebar__foot' }, userCard(getState()));
  const topStats = h('div', {}, topbarStats(getState()));
  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    brand(),
    h('nav', { class: 'nav', 'aria-label': 'Главное меню' }, NAV.map((item) => (item.section ? h('div', { class: 'nav__section' }, item.section) : navLink(item)))),
    sidebarUser,
  );
  const topbar = h('header', { class: 'topbar' }, brand(), topStats);
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Вкладки' }, TABS.map((tab) => h('a', { href: tab.href, dataset: { key: tab.key } }, h('span', { class: 'ico' }, tab.icon), tab.label)));
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
