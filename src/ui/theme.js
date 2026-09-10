// Тема оформления (авто / светлая / тёмная) и масштаб шрифта из настроек.

import { getState, subscribe } from '../core/store.js';

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export function applyFontScale(scale) {
  const value = Number(scale) || 1;
  document.documentElement.style.fontSize = value === 1 ? '' : `${Math.round(value * 100)}%`;
}

export function initTheme() {
  const { settings } = getState();
  applyTheme(settings.theme);
  applyFontScale(settings.fontScale);
  let last = settings;
  subscribe((state) => {
    if (state.settings === last) return;
    if (state.settings.theme !== last.theme) applyTheme(state.settings.theme);
    if (state.settings.fontScale !== last.fontScale) applyFontScale(state.settings.fontScale);
    last = state.settings;
  });
}
