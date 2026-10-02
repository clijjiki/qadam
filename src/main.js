// Точка входа Qadam: загрузка манифеста контента, тема, оболочка, роутер и рендер страниц.

import { langSignature, loadManifest } from './core/content.js';
import { getState, subscribe } from './core/store.js';
import { addRoute, currentRoute, navigate, onRoute, startRouter } from './core/router.js';
import { loadKatex, mountMath, onKatexReady } from './core/math.js';
import { h } from './core/dom.js';
import { initTheme } from './ui/theme.js';
import { createLayout } from './ui/layout.js';
import { ROUTES } from './pages/index.js';

const APP_NAME = 'Qadam';
const app = document.getElementById('app');

let layout = null;
let activePage = null;
let renderToken = 0;

function pageContext(info) {
  return { ...info, state: getState(), navigate };
}

function unmountActive() {
  if (!activePage?.unmount) {
    activePage = null;
    return;
  }
  try {
    activePage.unmount();
  } catch (error) {
    console.error('Ошибка при закрытии страницы:', error);
  }
  activePage = null;
}

function errorView(error, title = 'Страница не открылась') {
  return h(
    'div',
    { class: 'card stack' },
    h('h2', {}, title),
    h('p', { class: 'muted' }, String(error?.message || error)),
    h('div', { class: 'row' }, h('a', { class: 'btn btn--primary', href: '#/' }, 'На главную'), h('button', { class: 'btn', onClick: () => window.location.reload() }, 'Перезагрузить')),
  );
}

function notFoundView(path) {
  return h('div', { class: 'empty card' }, h('div', { class: 'empty__ico' }, '🧭'), h('h2', {}, 'Такой страницы нет'), h('p', { class: 'muted' }, path), h('a', { class: 'btn btn--primary', href: '#/' }, 'На главную'));
}

function needsOnboarding(entry) {
  return !getState().profile.onboarded && !entry?.public;
}

async function showPage(info) {
  const token = (renderToken += 1);
  const entry = info.route?.handler;
  if (needsOnboarding(entry)) {
    navigate('/onboarding', { replace: true });
    return;
  }
  unmountActive();
  if (!entry) {
    layout.setFocus(false);
    layout.setContent(notFoundView(info.path));
    return;
  }
  layout.setFocus(!!entry.focus);
  layout.setActive(entry.nav || '');
  try {
    const module = await entry.load();
    if (token !== renderToken) return;
    const view = await module.render(pageContext(info));
    if (token !== renderToken) {
      if (module.unmount) module.unmount();
      return;
    }
    activePage = module;
    layout.setContent(view);
    document.title = entry.title ? `${entry.title} — ${APP_NAME}` : APP_NAME;
    mountMath(layout.content);
    window.scrollTo({ top: 0 });
    // Хук страницы после вставки в DOM и сброса прокрутки (например, прокрутить к нужному блоку).
    if (module.afterMount) module.afterMount(view, pageContext(info));
  } catch (error) {
    console.error(`Не удалось отрисовать ${info.path}:`, error);
    if (token === renderToken) layout.setContent(errorView(error));
  }
}

function fatal(error) {
  app.replaceChildren(
    h(
      'div',
      { class: 'boot' },
      h('div', { class: 'boot__logo', style: { animation: 'none' } }, '!'),
      h('h2', {}, 'Не удалось загрузить контент'),
      h('p', { class: 'muted', style: { maxWidth: '460px', textAlign: 'center' } }, String(error?.message || error)),
      h('p', { class: 'muted small', style: { maxWidth: '460px', textAlign: 'center' } }, 'Сайт нужно открывать через start.bat (локальный сервер), а не двойным кликом по index.html — иначе браузер не даст загрузить файлы контента.'),
      h('button', { class: 'btn btn--primary', onClick: () => window.location.reload() }, 'Попробовать снова'),
    ),
  );
}

/** Смена языка материалов (общего или любого предмета) перерисовывает текущую страницу — контент грузится заново. */
function watchContentLang() {
  let last = langSignature(getState());
  subscribe((state) => {
    const next = langSignature(state);
    if (next === last) return;
    last = next;
    showPage(currentRoute());
  });
}

async function boot() {
  initTheme();
  loadKatex();
  onKatexReady(() => mountMath(document));
  try {
    await loadManifest();
  } catch (error) {
    console.error(error);
    fatal(error);
    return;
  }
  layout = createLayout(app);
  for (const route of ROUTES) addRoute(route.pattern, route);
  onRoute(showPage);
  watchContentLang();
  startRouter();
}

boot();
