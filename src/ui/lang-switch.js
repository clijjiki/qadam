// Переключатель языка контента (RU / KZ) для шапки, сайдбара и страниц уроков.
// Меняет только язык материалов: уроки, вопросы, пробники. Интерфейс сайта остаётся русским.
// Язык выбирается по предметам: на странице предмета, темы или практики переключатель меняет
// язык этого предмета, на общих страницах — общий язык для всех остальных.

import { h, replaceChildren } from '../core/dom.js';
import { CONTENT_LANGS, langName, langOf, ownLangSubjects, routeSubject, subject } from '../core/content.js';
import { getState, subscribe } from '../core/store.js';
import { currentRoute, onRoute } from '../core/router.js';
import { setContentLang, setSubjectLang } from '../core/actions.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const GENERAL_HINT = 'Общий язык уроков, вопросов и пробников. Интерфейс сайта остаётся русским.';

const IN_LANG = {
  ru: 'на русском',
  kk: 'на казахском',
};

function subjectLabel(subjectId) {
  const meta = subject(subjectId);
  return meta?.short || meta?.name || subjectId;
}

function hintFor(scope) {
  return scope ? `Язык уроков и вопросов предмета «${subjectLabel(scope)}». Остальные предметы не меняются.` : GENERAL_HINT;
}

/** Сообщение после переключения: чей язык изменился и какие предметы остались на своём. */
function switchedMessage(state, scope, lang) {
  const phrase = IN_LANG[lang] || IN_LANG.ru;
  if (scope) return `${subjectLabel(scope)}: материалы ${phrase}`;
  const own = ownLangSubjects(state).map(subjectLabel);
  if (!own.length) return `Материалы ${phrase}`;
  const other = CONTENT_LANGS.find((l) => l.id !== lang)?.id;
  return `Материалы ${phrase}. ${own.join(', ')} — по-прежнему ${IN_LANG[other] || ''}`.trim();
}

/** Применяет выбор языка: предмету (scope) или общий. Возвращает текст для подсказки. */
export function applyLang(scope, lang) {
  const applied = scope ? setSubjectLang(scope, lang) : setContentLang(lang);
  return switchedMessage(getState(), scope, applied || langOf(getState(), scope));
}

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
 * langSwitch({ withIcon, label, subject, followRoute, onBeforeChange }) → элемент-переключатель.
 * subject — переключатель привязан к языку этого предмета; followRoute — берёт предмет открытой
 * страницы (для шапки и сайдбара); без обоих меняет общий язык.
 * Сам подписывается на store и роутер, поэтому остаётся в курсе выбора с других страниц.
 */
export function langSwitch({ withIcon = false, label = '', subject: fixedSubject = null, followRoute = false, onBeforeChange = null } = {}) {
  const group = h('div', { class: 'langsw', role: 'group' });
  const labelNode = label ? h('span', { class: 'langsw-row__label' }, label) : null;
  const root = withIcon || label ? h('div', { class: 'langsw-row' }, withIcon ? h('span', { class: 'langsw-row__ico' }, icon('globe', { size: 16 })) : null, labelNode, group) : group;

  const scopeNow = () => fixedSubject || (followRoute ? routeSubject(currentRoute()) : null);

  const pick = (id) => {
    const scope = scopeNow();
    if (id === langOf(getState(), scope)) return;
    if (onBeforeChange) onBeforeChange(id);
    toast(applyLang(scope, id), { tone: 'success' });
  };

  let shown = '';
  const draw = () => {
    const scope = scopeNow();
    const current = langOf(getState(), scope);
    const key = `${scope || ''}:${current}`;
    if (key === shown) return;
    shown = key;
    const hint = hintFor(scope);
    group.setAttribute('aria-label', scope ? `Язык предмета «${subjectLabel(scope)}»` : 'Язык материалов');
    root.title = hint;
    group.title = hint;
    if (labelNode && !fixedSubject) labelNode.textContent = scope ? `${label} · ${subjectLabel(scope)}` : label;
    replaceChildren(group, CONTENT_LANGS.map((item) => langButton(item, item.id === current, pick)));
  };

  draw();
  // Переключатели на страницах создаются заново при каждом рендере,
  // поэтому подписки снимают себя сами, как только элемент убрали из документа.
  const stops = [subscribe(() => refresh()), followRoute ? onRoute(() => refresh()) : null].filter(Boolean);
  function refresh() {
    if (!group.isConnected) {
      for (const stop of stops) stop();
      return;
    }
    draw();
  }

  return root;
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
