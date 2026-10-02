// Страница темы: теория, карточки, статистика и переход к практике.

import { h, pluralize } from '../core/dom.js';
import { langOf, loadTopic, subject, topicMeta, topicTitle, topicWeight, topicsOf } from '../core/content.js';
import { masteryLevel, masteryOf } from '../core/mastery.js';
import { renderMarkdown } from '../core/markdown.js';
import { recordTheory } from '../core/actions.js';
import { formatDate } from '../core/time.js';
import { emptyState, pageHead, ring, subjectColor } from '../ui/components.js';
import { langSwitch, translationNote } from '../ui/lang-switch.js';

const SKILL_LABEL = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking', grammar: 'Grammar', vocab: 'Vocabulary' };

/** Адрес карточек для набора слов: у английского свой словарь, у IELTS — свой. */
const vocabHref = (meta) => `${meta.subject === 'english' ? '#/english/words' : '#/ielts/vocab'}?mode=learn&set=${meta.id}`;

/** Раздел, к которому относится тема, — для «хлебных крошек». */
function sectionOf(subj, meta) {
  if (subj?.kind === 'english') {
    const own = meta.kind === 'vocab' ? { label: 'Слова', href: '#/english/words' } : { label: 'Грамматика', href: '#/english?focus=grammar' };
    return { root: { label: 'Английский', href: '#/english' }, own };
  }
  if (subj?.kind === 'ielts') return { root: { label: 'IELTS', href: '#/ielts' }, own: { label: subj.name, href: '#/ielts' } };
  return { root: { label: 'ЕНТ', href: '#/ubt' }, own: { label: subj?.name || meta.subject, href: `#/subject/${meta.subject}` } };
}

function practiceLinks(meta, topic) {
  const count = topic.questions.length;
  const hard = topic.questions.filter((q) => q.type === 'multi' || q.difficulty >= 3).length;
  const links = [];
  if (meta.kind === 'vocab') links.push(h('a', { class: 'btn btn--primary btn--lg', href: vocabHref(meta) }, `🃏 Учить слова (${topic.words.length})`));
  else if (meta.kind === 'writing') links.push(h('a', { class: 'btn btn--primary btn--lg', href: `#/ielts/writing?topic=${meta.id}` }, '✍️ Открыть задания'));
  else if (meta.kind === 'speaking') links.push(h('a', { class: 'btn btn--primary btn--lg', href: `#/ielts/speaking?topic=${meta.id}` }, '🎤 Открыть карточки'));
  else if (count) {
    const label = meta.skill === 'reading' ? `📖 Начать passage (${count} вопр.)` : meta.skill === 'listening' ? `🎧 Начать listening (${count} вопр.)` : `▶ Практика (${Math.min(count, 10)} вопр.)`;
    links.push(h('a', { class: 'btn btn--primary btn--lg', href: `#/practice/${meta.id}` }, label));
    if (hard >= 3 && !meta.skill) links.push(h('a', { class: 'btn btn--lg', href: `#/practice/${meta.id}?mode=hard` }, `🔥 Сложные (${hard})`));
    if (count > 10 && !meta.skill) links.push(h('a', { class: 'btn btn--lg', href: `#/practice/${meta.id}?mode=all` }, `Все ${count}`));
  }
  return links;
}

function statsCard(state, meta) {
  const stats = state.topics[meta.id];
  const mastery = masteryOf(state, meta.id);
  const level = masteryLevel(mastery);
  const weight = topicWeight(meta);
  const subj = subject(meta.subject);
  const rows = [
    ['Статус', level.label],
    ['Попыток', String(stats?.attempts || 0)],
    ['Точность', stats?.answered ? `${Math.round((stats.correct / stats.answered) * 100)}%` : '—'],
    ['Лучший результат', stats?.best ? `${Math.round(stats.best * 100)}%` : '—'],
    ['Последний раз', stats?.lastAt ? formatDate(stats.lastAt) : '—'],
    [subj?.kind === 'ubt' ? 'На ЕНТ' : 'Вес', subj?.kind === 'ubt' ? `≈ ${pluralize(weight, ['вопрос', 'вопроса', 'вопросов'])}` : String(weight)],
  ];
  return h(
    'div',
    { class: 'card stack' },
    h('div', { class: 'row' }, ring({ value: mastery, size: 72, color: subjectColor(meta.subject) }), h('div', {}, h('div', { class: 'card__title' }, 'Мастерство'), h('div', { class: 'card__sub' }, 'Точность × уверенность × память'))),
    h('table', { class: 'topic-table' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', { class: 'muted' }, k), h('td', { class: 'right' }, v))))),
  );
}

function theoryView(topic) {
  if (!topic.theory.length) return h('p', { class: 'muted' }, 'Для этой темы пока нет конспекта — переходи сразу к практике.');
  return h('div', { class: 'card prose' }, topic.theory.map((block) => h('div', { class: 'theory-block', html: renderMarkdown(block) })));
}

function cardsView(topic) {
  return h(
    'div',
    { class: 'flip-list' },
    topic.cards.map((card) =>
      h('div', { class: 'flip', onClick: (e) => e.currentTarget.classList.toggle('open') }, h('div', { class: 'flip__front', html: renderMarkdown(card.front) }), h('div', { class: 'flip__back', html: renderMarkdown(card.back) })),
    ),
  );
}

function wordsView(topic, meta) {
  return h(
    'div',
    { class: 'card' },
    h('table', { class: 'topic-table' }, h('tbody', {}, topic.words.slice(0, 60).map((w) => h('tr', {}, h('td', {}, h('b', {}, w.word), w.pos ? h('span', { class: 'muted small' }, ` ${w.pos}`) : null), h('td', {}, w.ru || ''), h('td', { class: 'muted small' }, w.def || ''))))),
    h('a', { class: 'btn btn--primary', href: vocabHref(meta), style: { marginTop: '12px' } }, 'Учить карточками'),
  );
}

function neighbours(meta) {
  const siblings = topicsOf(meta.subject, { kind: meta.kind });
  const idx = siblings.findIndex((t) => t.id === meta.id);
  return { prev: idx > 0 ? siblings[idx - 1] : null, next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null };
}

function tabs(topic, meta, active, setActive) {
  const items = [{ key: 'theory', label: 'Теория' }];
  if (topic.cards.length) items.push({ key: 'cards', label: `Карточки (${topic.cards.length})` });
  if (topic.words.length) items.push({ key: 'words', label: `Слова (${topic.words.length})` });
  if (items.length < 2) return null;
  return h('div', { class: 'topic-tabs' }, items.map((item) => h('button', { class: item.key === active ? 'active' : '', onClick: () => setActive(item.key) }, item.label)));
}

export async function render({ params, state }) {
  const meta = topicMeta(params.topicId);
  if (!meta) return emptyState({ icon: '🧭', title: 'Тема не найдена', action: { label: 'К предметам', href: '#/ubt' } });
  const lang = langOf(state, meta.subject);
  const topic = await loadTopic(meta.id, lang);
  const subj = subject(meta.subject);
  if (topic.theory.length) recordTheory(meta.id);
  const { prev, next } = neighbours(meta);
  const body = h('div', {});
  let active = 'theory';
  const tabBar = h('div', {});
  const setActive = (key) => {
    active = key;
    tabBar.replaceChildren(tabs(topic, meta, active, setActive) || '');
    body.replaceChildren(active === 'cards' ? cardsView(topic) : active === 'words' ? wordsView(topic, meta) : theoryView(topic));
  };
  setActive('theory');
  const skill = meta.skill ? h('span', { class: 'badge badge--success' }, SKILL_LABEL[meta.skill] || meta.skill) : null;
  return h(
    'div',
    { class: 'stack' },
    pageHead({
      title: topic.title || meta.title,
      sub: topic.summary || '',
      crumbs: [sectionOf(subj, meta).root, sectionOf(subj, meta).own],
    }),
    translationNote(topic),
    subj?.kind === 'ielts' ? null : langSwitch({ withIcon: true, label: `Язык уроков: ${subj?.short || subj?.name || meta.subject}`, subject: meta.subject }),
    h('div', { class: 'row' }, skill, meta.minutes ? h('span', { class: 'badge' }, `≈ ${meta.minutes} мин`) : null, ...practiceLinks(meta, topic)),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)' } }, h('div', { class: 'stack' }, tabBar, body), statsCard(state, meta)),
    h('div', { class: 'row row--between' }, prev ? h('a', { class: 'btn', href: `#/topic/${prev.id}` }, `← ${topicTitle(prev, lang)}`) : h('span'), next ? h('a', { class: 'btn', href: `#/topic/${next.id}` }, `${topicTitle(next, lang)} →`) : h('span')),
  );
}
