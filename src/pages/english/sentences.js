// Предложения дня: 5 последних выученных слов → 5 своих предложений. Так слова переходят из «узнаю» в «использую».

import { h, replaceChildren } from '../../core/dom.js';
import { loadLocalTopics } from '../../core/content.js';
import { getState } from '../../core/store.js';
import { recentWordKeys } from '../../core/english.js';
import { recordSentences } from '../../core/actions.js';
import { emptyState, pageHead } from '../../ui/components.js';
import { toast } from '../../ui/toast.js';
import { SENTENCES_PER_DAY, englishMetrics } from './hub.js';

const MIN_WORDS_IN_SENTENCE = 3;

async function wordsForToday(state, sets) {
  const keys = recentWordKeys(state.vocab, sets, SENTENCES_PER_DAY);
  const setIds = [...new Set(keys.map((k) => k.split(':')[0]))];
  const topics = await loadLocalTopics(state, setIds);
  const byKey = new Map(topics.flatMap((topic) => topic.words.map((w) => [`${topic.id}:${w.id}`, w])));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

/** Засчитываем предложение от 3 слов. Само слово может стоять в другой форме (go → went), поэтому его отсутствие — только подсказка. */
const isSentence = (text) => text.trim().split(/\s+/).filter(Boolean).length >= MIN_WORDS_IN_SENTENCE;
const mentions = (text, word) => text.toLowerCase().includes(word.word.toLowerCase());

function wordField(word) {
  const input = h('textarea', { class: 'input', rows: 2, placeholder: `Предложение со словом «${word.word}»`, spellcheck: 'true', lang: 'en' });
  const card = h(
    'div',
    { class: 'card stack', style: { gap: '8px' } },
    h('div', { class: 'row row--between' }, h('b', { style: { fontSize: '1.1rem' } }, word.word), h('span', { class: 'muted small' }, word.ru)),
    h('div', { class: 'muted small' }, `Пример: ${word.example}`),
    input,
  );
  return { card, input, word };
}

export async function render() {
  const state = getState();
  const { sets } = englishMetrics(state);
  const words = await wordsForToday(state, sets);
  const head = pageHead({ title: 'Предложения дня', sub: 'Напиши по одному простому предложению с каждым словом. Говори их вслух, пока пишешь.', crumbs: [{ label: 'Английский', href: '#/english' }, { label: 'Предложения' }] });
  if (!words.length) {
    return h('div', { class: 'stack' }, head, emptyState({ icon: '✍️', title: 'Сначала выучи первые слова', sub: 'Предложения составляются из слов, которые ты уже открыл в карточках.', action: { label: 'К словам', href: '#/english/words' } }));
  }
  const fields = words.map(wordField);
  const result = h('div');
  const save = () => {
    const good = fields.filter((f) => isSentence(f.input.value));
    const short = fields.filter((f) => f.input.value.trim() && !isSentence(f.input.value));
    if (short.length) {
      replaceChildren(result, h('div', { class: 'alert alert--warn small' }, `Слишком коротко: ${short.map((f) => f.word.word).join(', ')}. Нужно хотя бы ${MIN_WORDS_IN_SENTENCE} слова — полное предложение.`));
      return;
    }
    const noWord = good.filter((f) => !mentions(f.input.value, f.word));
    if (!good.length) {
      replaceChildren(result, h('div', { class: 'alert alert--warn small' }, 'Напиши хотя бы одно предложение.'));
      return;
    }
    recordSentences(good.length);
    toast(`Засчитано предложений: ${good.length}`, { tone: 'success' });
    replaceChildren(
      result,
      h('div', { class: 'alert alert--success stack' }, h('div', {}, `Отлично! ${good.length} из ${fields.length}.`), noWord.length ? h('div', { class: 'small' }, `Не вижу слов: ${noWord.map((f) => f.word.word).join(', ')}. Если использовал другую форму (go → went) — всё правильно.`) : null, h('div', { class: 'small' }, 'Хочешь проверить ошибки — вставь предложения в Claude или ChatGPT с просьбой «исправь ошибки и объясни по-русски».')),
      h('a', { class: 'btn btn--primary', href: '#/english' }, 'К плану английского'),
    );
    for (const f of fields) f.input.disabled = true;
  };
  return h('div', { class: 'stack' }, head, fields.map((f) => f.card), h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', onClick: save }, 'Готово')), result);
}
