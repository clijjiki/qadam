// Словарь: наборы слов, режим «учить новые» и очередь интервального повторения.
// Один модуль на два раздела — IELTS (#/ielts/vocab) и английский с нуля (#/english/words).

import { h, formatDuration, pluralize, replaceChildren } from '../../core/dom.js';
import { langOf, loadTopics, topicsOf } from '../../core/content.js';
import { getState } from '../../core/store.js';
import { finishVocabSession, recordVocabReview } from '../../core/actions.js';
import { GRADES, dueIds } from '../../core/srs.js';
import { emptyState, pageHead, progressBar } from '../../ui/components.js';
import { toast } from '../../ui/toast.js';

const CONFIGS = {
  ielts: {
    subject: 'ielts',
    base: '#/ielts/vocab',
    home: { label: 'IELTS', href: '#/ielts' },
    title: 'Словарь IELTS',
    sub: 'Академическая лексика с интервальным повторением',
    color: 'var(--c-ielts)',
    batch: 10,
  },
  english: {
    subject: 'english',
    base: '#/english/words',
    home: { label: 'Английский', href: '#/english' },
    title: 'Слова',
    sub: '1500 самых нужных слов — по 15 новых в день, с интервальным повторением',
    color: 'var(--c-ielts)',
    batch: 15,
  },
};
const REVIEW_LIMIT = 30;
const RATES = [
  { grade: GRADES.AGAIN, label: 'Не помню', hint: '1' },
  { grade: GRADES.HARD, label: 'Сложно', hint: '2' },
  { grade: GRADES.GOOD, label: 'Помню', hint: '3' },
  { grade: GRADES.EASY, label: 'Легко', hint: '4' },
];

let keyHandler = null;

function wordId(topicId, word) {
  return `${topicId}:${word.id}`;
}

function isLearned(item) {
  return !!item && (item.reps || 0) >= 3;
}

async function loadSets(cfg) {
  const metas = topicsOf(cfg.subject, { kind: 'vocab' });
  const loaded = [];
  const missing = [];
  await Promise.all(
    metas.map(async (meta) => {
      try {
        const [topic] = await loadTopics([meta.id], langOf(getState()));
        loaded.push({ meta, topic });
      } catch (error) {
        missing.push(meta.title);
      }
    }),
  );
  loaded.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));
  return { sets: loaded, missing };
}

function wordIndex(sets) {
  const map = new Map();
  for (const { meta, topic } of sets) for (const word of topic.words) map.set(wordId(meta.id, word), { word, set: meta });
  return map;
}

function overview(cfg, sets, missing, state) {
  const index = wordIndex(sets);
  const total = index.size;
  const learned = [...index.keys()].filter((id) => isLearned(state.vocab[id])).length;
  const due = dueIds(state.vocab).filter((id) => index.has(id)).length;
  const rows = sets.map(({ meta, topic }) => {
    const ids = topic.words.map((w) => wordId(meta.id, w));
    const known = ids.filter((id) => isLearned(state.vocab[id])).length;
    const fresh = ids.filter((id) => !state.vocab[id]).length;
    return h(
      'div',
      { class: 'card stack', style: { gap: '8px' } },
      h('div', { class: 'row row--between' }, h('b', {}, topic.title || meta.title), h('span', { class: 'badge' }, `${known} / ${ids.length}`)),
      progressBar(ids.length ? known / ids.length : 0, { color: cfg.color }),
      h('div', { class: 'row' }, fresh ? h('a', { class: 'btn btn--sm btn--primary', href: `${cfg.base}?mode=learn&set=${meta.id}` }, `Учить новые (${Math.min(fresh, cfg.batch)})`) : h('span', { class: 'muted small' }, 'Все слова уже открыты'), h('a', { class: 'btn btn--sm', href: `#/topic/${meta.id}` }, 'Список слов')),
    );
  });
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: cfg.title, sub: cfg.sub, crumbs: [cfg.home, { label: 'Слова' }] }),
    missing.length ? h('div', { class: 'alert alert--warn' }, `Наборы ещё не загружены: ${missing.join(', ')}`) : null,
    h(
      'div',
      { class: 'card row', style: { gap: '24px' } },
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(total)), h('div', { class: 'stat__label' }, 'слов в базе')),
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(learned)), h('div', { class: 'stat__label' }, 'выучено')),
      h('div', { class: 'stat' }, h('div', { class: 'stat__val' }, String(due)), h('div', { class: 'stat__label' }, 'к повторению')),
      h('span', { class: 'spacer' }),
      due ? h('a', { class: 'btn btn--primary btn--lg', href: `${cfg.base}?mode=review` }, `Повторить (${due})`) : h('span', { class: 'muted small' }, 'Повторять пока нечего — учи новые слова'),
    ),
    rows.length ? h('div', { class: 'grid grid--2' }, rows) : emptyState({ icon: '🃏', title: 'Наборы слов появятся позже', sub: `Файлы словаря ещё не добавлены в content/${cfg.subject}.`, action: cfg.home }),
  );
}

function cardFace(entry, flipped) {
  const { word } = entry;
  if (!flipped) {
    return [h('div', { class: 'flashcard__word' }, word.word), h('div', { class: 'flashcard__pos' }, [word.pos, word.ipa].filter(Boolean).join(' · ')), h('div', { class: 'muted small' }, 'Нажми, чтобы проверить себя')];
  }
  return [
    h('div', { class: 'flashcard__word', style: { fontSize: '1.4rem' } }, word.word),
    h('div', { class: 'flashcard__def' }, word.def || ''),
    word.example ? h('div', { class: 'flashcard__ex' }, `«${word.example}»`) : null,
    h('div', { class: 'flashcard__ru' }, word.ru || ''),
    word.collocations?.length ? h('div', { class: 'muted small' }, word.collocations.join(' · ')) : null,
  ];
}

function session({ cfg, queue, mode, root, setName }) {
  const startedAt = Date.now();
  let index = 0;
  let flipped = false;
  let cardStart = Date.now();
  let done = 0;
  let good = 0;

  const rate = (grade) => {
    const entry = queue[index];
    recordVocabReview(entry.id, grade, (Date.now() - cardStart) / 1000);
    done += 1;
    if (grade >= GRADES.GOOD) good += 1;
    index += 1;
    flipped = false;
    cardStart = Date.now();
    draw();
  };

  const flip = () => {
    flipped = true;
    draw();
  };

  function finishScreen() {
    const seconds = (Date.now() - startedAt) / 1000;
    finishVocabSession(done, seconds, cfg.subject);
    replaceChildren(
      root,
      pageHead({ title: 'Готово!', crumbs: [cfg.home, { label: 'Слова', href: cfg.base }] }),
      h(
        'div',
        { class: 'card result-hero stack' },
        h('div', { class: 'big' }, String(done)),
        h('div', { class: 'muted' }, `${pluralize(done, ['карточка', 'карточки', 'карточек'])} за ${formatDuration(seconds)} · знал ${done ? Math.round((good / done) * 100) : 0}%`),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn btn--primary', href: cfg.base }, 'Ещё'), h('a', { class: 'btn', href: cfg.home.href }, `К разделу «${cfg.home.label}»`), h('a', { class: 'btn', href: '#/' }, 'На главную')),
      ),
    );
  }

  function draw() {
    if (index >= queue.length) {
      finishScreen();
      return;
    }
    const entry = queue[index];
    const card = h('div', { class: 'card flashcard', onClick: () => (flipped ? null : flip()) }, h('div', { class: 'stack' }, ...cardFace(entry, flipped)));
    const actions = flipped
      ? h(
          'div',
          { class: mode === 'learn' ? 'row' : 'rate' },
          mode === 'learn'
            ? [h('button', { class: 'btn btn--block', onClick: () => rate(GRADES.AGAIN) }, 'Не знал'), h('button', { class: 'btn btn--primary btn--block', onClick: () => rate(GRADES.GOOD) }, 'Знал')]
            : RATES.map((r) => h('button', { class: 'btn', onClick: () => rate(r.grade) }, r.label, h('small', {}, r.hint))),
        )
      : h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: flip }, 'Показать перевод');
    replaceChildren(
      root,
      h('div', { class: 'row row--between' }, h('b', {}, mode === 'learn' ? `Новые слова · ${setName}` : 'Повторение'), h('a', { class: 'btn btn--ghost btn--sm', href: cfg.base }, 'Выйти ✕')),
      h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${Math.round((index / queue.length) * 100)}%` } })),
      h('div', { class: 'muted small' }, `${index + 1} из ${queue.length} · ${entry.set.title}`),
      card,
      actions,
      h('div', { class: 'muted small' }, 'Пробел — перевернуть, 1–4 — оценить'),
    );
  }

  keyHandler = (event) => {
    if (event.metaKey || event.ctrlKey || event.target?.tagName === 'INPUT') return;
    if (index >= queue.length) return;
    if (!flipped && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      flip();
      return;
    }
    if (!flipped) return;
    const position = '1234'.indexOf(event.key);
    if (position < 0) return;
    if (mode === 'learn') rate(position >= 2 ? GRADES.GOOD : GRADES.AGAIN);
    else rate(RATES[position].grade);
  };
  document.addEventListener('keydown', keyHandler);
  draw();
}

export async function render({ query, path = '' }) {
  unmount();
  const cfg = path.startsWith('/english') ? CONFIGS.english : CONFIGS.ielts;
  const { sets, missing } = await loadSets(cfg);
  const state = getState();
  if (!sets.length) return overview(cfg, sets, missing, state);
  const index = wordIndex(sets);

  if (query.mode === 'review') {
    const queue = dueIds(state.vocab)
      .filter((id) => index.has(id))
      .slice(0, REVIEW_LIMIT)
      .map((id) => ({ id, ...index.get(id) }));
    if (!queue.length) return emptyState({ icon: '🎉', title: 'Нечего повторять', sub: 'Все слова на сегодня закрыты. Открой новый набор.', action: { label: 'К наборам', href: cfg.base } });
    const root = h('div', { class: 'stack' });
    session({ cfg, queue, mode: 'review', root, setName: '' });
    return root;
  }

  if (query.mode === 'learn') {
    const target = sets.find((s) => s.meta.id === query.set) || sets[0];
    const queue = target.topic.words
      .map((w) => ({ id: wordId(target.meta.id, w), word: w, set: target.meta }))
      .filter((e) => !state.vocab[e.id])
      .slice(0, cfg.batch);
    if (!queue.length) {
      toast('В этом наборе все слова уже открыты — повтори их');
      return overview(cfg, sets, missing, getState());
    }
    const root = h('div', { class: 'stack' });
    session({ cfg, queue, mode: 'learn', root, setName: target.topic.title || target.meta.title });
    return root;
  }

  return overview(cfg, sets, missing, state);
}

export function unmount() {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = null;
}
