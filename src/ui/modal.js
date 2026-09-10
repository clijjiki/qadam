// Модальные окна и диалог подтверждения.

import { h } from '../core/dom.js';

export function openModal({ title, body, actions = [], closable = true, onClose } = {}) {
  let closed = false;
  const backdrop = h('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && closable) close();
  };
  const buttons = actions.map((action) =>
    h(
      'button',
      {
        class: `btn ${action.class || ''}`.trim(),
        onClick: () => {
          const keepOpen = action.onClick ? action.onClick() === false : false;
          if (!keepOpen) close();
        },
      },
      action.label,
    ),
  );
  const modal = h(
    'div',
    { class: 'modal stack' },
    title ? h('h2', { style: { marginBottom: '0' } }, title) : null,
    typeof body === 'string' ? h('p', { style: { margin: 0 } }, body) : body,
    buttons.length ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, buttons) : null,
  );
  backdrop.append(modal);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop && closable) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  return close;
}

export function confirmDialog({ title, text, okLabel = 'Да', cancelLabel = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };
    openModal({
      title,
      body: text,
      onClose: () => answer(false),
      actions: [
        { label: cancelLabel, onClick: () => answer(false) },
        { label: okLabel, class: danger ? 'btn--danger' : 'btn--primary', onClick: () => answer(true) },
      ],
    });
  });
}
