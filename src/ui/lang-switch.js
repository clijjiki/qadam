// Переключатель языка контента (RU / KZ) для шапки и сайдбара.
// Меняет только язык материалов: уроки, вопросы, пробники. Интерфейс сайта остаётся русским.

import { h, replaceChildren } from '../core/dom.js';
import { CONTENT_LANGS, langName, langOf } from '../core/content.js';
import { getState, subscribe } from '../core/store.js';
import { setContentLang } from '../core/actions.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const HINT = 'Язык уроков, вопросов и пробников. Интерфейс сайта остаётся русским.';

const SWITCHED = {
  ru: 'Материалы на русском',
  kk: 'Материалы на казахском',
};

function langButton(item, active, onPick) {
  return h(
    'button',
    {
      type: 'button',
      class: active ? 'langsw__btn active' : 'langsw__btn',
      'aria-pressed': active ? 'true' : 'false',
      title: langName(item.id),
      onClick: () => onPick(item.id),
    },
    item.short,
  );
}

/**
 * langSwitch({ withIcon: true }) → элемент-переключатель.
 * Сам подписывается на store, поэтому остаётся в курсе выбора с других страниц.
 */
export function langSwitch({ withIcon = false, label = '' } = {}) {
  const group = h('div', { class: 'langsw', role: 'group', 'aria-label': 'Язык материалов', title: HINT });

  const pick = (id) => {
    const applied = setContentLang(id);
    toast(SWITCHED[applied] || SWITCHED.ru, { tone: 'success' });
  };

  const draw = (state) => {
    const current = langOf(state);
    replaceChildren(group, CONTENT_LANGS.map((item) => langButton(item, item.id === current, pick)));
  };

  draw(getState());
  let last = langOf(getState());
  // Переключатель на странице пробников создаётся заново при каждом рендере,
  // поэтому подписка снимает себя сама, как только элемент убрали из документа.
  const stop = subscribe((state) => {
    if (!group.isConnected) {
      stop();
      return;
    }
    const next = langOf(state);
    if (next === last) return;
    last = next;
    draw(state);
  });

  if (!withIcon && !label) return group;
  return h(
    'div',
    { class: 'langsw-row', title: HINT },
    withIcon ? h('span', { class: 'langsw-row__ico' }, icon('globe', { size: 16 })) : null,
    label ? h('span', { class: 'langsw-row__label' }, label) : null,
    group,
  );
}

/**
 * Плашка «перевода пока нет»: тема запрошена на казахском, но отдана русская версия.
 * Показываем её, чтобы ученик понимал, почему язык не совпал с выбором.
 */
export function translationNote(topic) {
  if (!topic || topic.translated !== false) return null;
  return h(
    'div',
    { class: 'alert alert--warn small' },
    `Эта тема пока не переведена на ${langName('kk')} — показываем русскую версию. Прогресс общий для обоих языков.`,
  );
}
