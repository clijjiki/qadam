// Всплывающие уведомления.

import { h } from '../core/dom.js';

const DEFAULT_DURATION = 2800;

export function toast(message, { tone = '', duration = DEFAULT_DURATION } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: tone ? `toast toast--${tone}` : 'toast', role: 'status' }, message);
  host.append(el);
  window.setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    window.setTimeout(() => el.remove(), 320);
  }, duration);
}

export function toastBadges(badgeIds, badgeById) {
  for (const id of badgeIds) {
    const badge = badgeById(id);
    if (badge) toast(`${badge.icon} Новый бейдж: ${badge.name}`, { tone: 'success', duration: 4000 });
  }
}
