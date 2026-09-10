// Движок вопросов: карточка вопроса (используется практикой и экзаменом),
// разбор ответа и раннер практики с мгновенной проверкой.
// Типы: single (4 варианта), multi (6 вариантов, 1–3 верных), match (2 строки × 4 варианта), text (ввод).

import { formatDuration, h, replaceChildren } from '../core/dom.js';
import { renderInline, renderMarkdown } from '../core/markdown.js';
import { mountMath } from '../core/math.js';
import { emptySelection, isAnswered, scoreQuestion, summarize } from '../core/scoring.js';
import { shuffle } from '../core/random.js';
import { findContext } from '../core/content.js';

export const OPTION_KEYS = 'ABCDEFGH';

/** Порядок показа вариантов: массив исходных индексов. */
export function makeOrder(question, shuffleOptions = true) {
  const base = question.options.map((_, i) => i);
  if (!shuffleOptions || question.noShuffle || question.type === 'text' || question.type === 'match') return base;
  return shuffle(base);
}

export function typeLabel(question) {
  if (question.type === 'multi') return 'Несколько ответов';
  if (question.type === 'text') return 'Впиши ответ';
  if (question.type === 'match') return 'Соответствие';
  return 'Один ответ';
}

function optionHtml(text) {
  const source = String(text ?? '');
  return /\n|```/.test(source) ? renderMarkdown(source) : renderInline(source);
}

function optionClass({ isSelected, isAnswer, revealed, type }) {
  if (!revealed) return isSelected ? 'option selected' : 'option';
  if (isSelected && isAnswer) return 'option correct';
  if (isSelected) return 'option wrong';
  if (isAnswer) return type === 'multi' ? 'option missed' : 'option correct';
  return 'option';
}

function optionButton({ text, keyLabel, className, disabled, pressed, onClick }) {
  return h(
    'button',
    { type: 'button', class: className, disabled, 'aria-pressed': pressed ? 'true' : 'false', onClick },
    h('span', { class: 'option__key' }, keyLabel),
    h('div', { class: 'option__body', html: optionHtml(text) }),
  );
}

function renderOptions({ question, order, selected, revealed, disabled, onSelect }) {
  const answer = question.answer.map(Number);
  return h(
    'div',
    { class: 'options', role: question.type === 'multi' ? 'group' : 'radiogroup' },
    order.map((original, position) => {
      const isSelected = selected.includes(original);
      return optionButton({
        text: question.options[original],
        keyLabel: OPTION_KEYS[position] || String(position + 1),
        className: optionClass({ isSelected, isAnswer: answer.includes(original), revealed, type: question.type }),
        disabled: revealed || disabled,
        pressed: isSelected,
        onClick: () => onSelect && onSelect(original),
      });
    }),
  );
}

function renderMatch({ question, selected, revealed, disabled, onSelect }) {
  const chosen = Array.isArray(selected) && selected.length ? selected : emptySelection(question);
  return h(
    'div',
    { class: 'match' },
    question.rows.map((row, r) =>
      h(
        'div',
        { class: 'match__row' },
        h('div', { class: 'match__label', html: `${OPTION_KEYS[r]}) ${renderInline(row)}` }),
        h(
          'div',
          { class: 'match__opts' },
          question.options.map((text, i) =>
            optionButton({
              text,
              keyLabel: String(i + 1),
              className: `${optionClass({ isSelected: chosen[r] === i, isAnswer: Number(question.answer[r]) === i, revealed, type: 'single' })} option--sm`,
              disabled: revealed || disabled,
              pressed: chosen[r] === i,
              onClick: () => onSelect && onSelect(i, r),
            }),
          ),
        ),
      ),
    ),
  );
}

function renderTextAnswer({ question, value, revealed, disabled, onText, score }) {
  const input = h('input', {
    class: 'input',
    type: 'text',
    value: value || '',
    placeholder: question.placeholder || 'Ответ',
    autocomplete: 'off',
    spellcheck: 'false',
    disabled: revealed || disabled,
    onInput: (event) => onText && onText(event.target.value),
  });
  const wrap = h('div', { class: 'text-answer' }, input);
  if (revealed) {
    const correct = question.answer.join(' / ');
    wrap.append(h('span', { class: score?.isCorrect ? 'text-answer__ok' : 'text-answer__bad' }, score?.isCorrect ? '✓ Верно' : `✗ Верно: ${correct}`));
  }
  return wrap;
}

function hintFor(question) {
  if (question.type === 'multi') return 'Верных ответов может быть от одного до трёх. Без ошибок — 2 балла, одна ошибка — 1 балл.';
  if (question.type === 'match') return 'Для каждой строки выбери один вариант. Обе строки верно — 2 балла, одна — 1 балл.';
  if (question.type === 'text') return question.maxWords ? `Не больше ${question.maxWords} слов${/\d/.test(question.maxWords) ? '/чисел' : ''}.` : null;
  return null;
}

/**
 * Карточка вопроса. selected — исходные индексы (single/multi) или пара индексов (match); value — текст для type=text.
 * revealed=true показывает верные/неверные варианты.
 */
export function renderQuestionCard({
  question,
  topic = null,
  order,
  selected = [],
  value = '',
  revealed = false,
  disabled = false,
  score = null,
  index,
  total,
  onSelect,
  onText,
  showContext = true,
  showMeta = true,
}) {
  const card = h('div', { class: 'question' });
  const context = showContext && topic ? findContext(topic, question.context) : null;
  if (context) {
    card.append(h('div', { class: 'question__context' }, context.title ? h('h4', {}, context.title) : null, h('div', { class: 'prose', html: renderMarkdown(context.text) })));
  }
  if (showMeta) {
    card.append(
      h(
        'div',
        { class: 'row', style: { marginBottom: '10px' } },
        index !== undefined && index !== null ? h('span', { class: 'quiz__counter' }, `Вопрос ${index + 1}${total ? ` из ${total}` : ''}`) : null,
        h('span', { class: 'badge' }, typeLabel(question)),
        question.difficulty > 1 ? h('span', { class: 'badge', title: 'Сложность' }, '★'.repeat(Math.min(3, question.difficulty))) : null,
      ),
    );
  }
  card.append(h('div', { class: 'question__text prose', html: renderMarkdown(question.text) }));
  const hint = hintFor(question);
  if (hint) card.append(h('div', { class: 'question__hint' }, hint));
  if (question.type === 'text') card.append(renderTextAnswer({ question, value, revealed, disabled, onText, score }));
  else if (question.type === 'match') card.append(renderMatch({ question, selected, revealed, disabled, onSelect }));
  else card.append(renderOptions({ question, order: order || makeOrder(question, false), selected, revealed, disabled, onSelect }));
  mountMath(card);
  return card;
}

function correctAnswerText(question, order) {
  if (question.type === 'match') return question.answer.map((a, r) => `${OPTION_KEYS[r]} → ${Number(a) + 1}`).join(', ');
  return question.answer
    .map((i) => OPTION_KEYS[order.indexOf(Number(i))])
    .filter(Boolean)
    .join(', ');
}

/** Разбор ответа: заголовок, правильный ответ, объяснение, «почему другие неверны». */
export function renderExplanation({ question, score, order }) {
  const ok = score.isCorrect;
  const title = ok ? `Верно! +${score.points}` : score.isPartial ? `Почти: ${score.points} из ${score.max}` : 'Неверно';
  const box = h('div', { class: `explanation ${ok ? 'ok' : 'bad'}` }, h('div', { class: 'explanation__title' }, title));
  if (!ok && question.type !== 'text') {
    box.append(h('div', { class: 'small', style: { marginBottom: '6px' } }, `Правильный ответ: ${correctAnswerText(question, order)}`));
  }
  if (question.explanation) box.append(h('div', { class: 'prose', html: renderMarkdown(question.explanation) }));
  const why = question.why && typeof question.why === 'object' ? Object.entries(question.why) : [];
  if (why.length && question.type !== 'match') {
    box.append(
      h(
        'details',
        {},
        h('summary', {}, 'Почему другие варианты неверны'),
        h(
          'ul',
          {},
          why.map(([idx, text]) => {
            const position = order.indexOf(Number(idx));
            return h('li', {}, h('b', {}, `${OPTION_KEYS[position] || idx}: `), h('span', { html: renderInline(text) }));
          }),
        ),
      ),
    );
  }
  mountMath(box);
  return box;
}

/**
 * Раннер практики: вопрос → «Ответить» → разбор → «Далее». Возвращает { destroy, finish }.
 * onFinish({ results, summary, seconds }); results[i] = { question, selected, score, order, seconds }.
 */
export function createPractice({ container, questions, topicsById = {}, shuffleOptions = true, showTimer = true, onFinish, onExit, onAnswer }) {
  const orders = questions.map((q) => makeOrder(q, shuffleOptions));
  const results = [];
  const startedAt = Date.now();
  const root = h('div', { class: 'quiz' });
  const timerEl = h('span', { class: 'quiz__timer' }, '0:00');
  let index = 0;
  let selected = emptySelection(questions[0]);
  let value = '';
  let revealed = false;
  let current = null;
  let questionStartedAt = Date.now();
  let submitButton = null;
  let finished = false;

  const timerId = showTimer ? window.setInterval(() => { timerEl.textContent = formatDuration((Date.now() - startedAt) / 1000); }, 1000) : null;
  container.append(root);

  const question = () => questions[index];

  function canSubmit() {
    const q = question();
    if (q.type === 'text') return value.trim().length > 0;
    if (q.type === 'match') return selected.every((x) => x >= 0);
    return selected.length > 0;
  }

  function select(original, row) {
    if (revealed) return;
    const q = question();
    if (q.type === 'match') {
      const target = row ?? Math.max(0, selected.findIndex((x) => x < 0));
      selected = selected.map((x, i) => (i === target ? original : x));
    } else if (q.type === 'multi') selected = selected.includes(original) ? selected.filter((x) => x !== original) : [...selected, original];
    else selected = [original];
    render();
  }

  function submit() {
    if (revealed || !canSubmit()) return;
    const q = question();
    const chosen = q.type === 'text' ? value : selected;
    const score = scoreQuestion(q, chosen);
    current = { question: q, selected: chosen, score, order: orders[index], seconds: (Date.now() - questionStartedAt) / 1000 };
    results.push(current);
    revealed = true;
    if (onAnswer) onAnswer(current);
    render();
  }

  function next() {
    if (!revealed) return;
    if (index + 1 >= questions.length) {
      finish();
      return;
    }
    index += 1;
    selected = emptySelection(questions[index]);
    value = '';
    revealed = false;
    current = null;
    questionStartedAt = Date.now();
    render();
  }

  function finish() {
    if (finished) return;
    finished = true;
    destroy();
    onFinish({ results: [...results], summary: summarize(results.map((r) => r.score)), seconds: (Date.now() - startedAt) / 1000 });
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (revealed) next();
      else submit();
      return;
    }
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const q = question();
    const position = '12345678'.indexOf(event.key);
    if (position < 0 || revealed || q.type === 'text') return;
    if (q.type === 'match') {
      if (position < q.options.length) select(position);
    } else if (position < orders[index].length) select(orders[index][position]);
  }

  function actions() {
    if (revealed) {
      const last = index + 1 >= questions.length;
      return h('button', { class: 'btn btn--primary btn--lg', onClick: next }, last ? 'Завершить' : 'Далее →');
    }
    submitButton = h('button', { class: 'btn btn--primary btn--lg', disabled: !canSubmit(), onClick: submit }, 'Ответить');
    return submitButton;
  }

  function render() {
    const q = question();
    const progress = h('div', { class: 'progress quiz__progress' }, h('div', { class: 'progress__bar', style: { width: `${Math.round((index / questions.length) * 100)}%` } }));
    const top = h(
      'div',
      { class: 'quiz__top' },
      h('span', { class: 'quiz__counter' }, `${index + 1} / ${questions.length}`),
      progress,
      showTimer ? timerEl : null,
      onExit ? h('button', { class: 'btn btn--ghost btn--sm', onClick: onExit }, 'Выйти') : null,
    );
    const card = renderQuestionCard({
      question: q,
      topic: topicsById[q.topicId],
      order: orders[index],
      selected,
      value,
      revealed,
      score: current?.score,
      index,
      total: questions.length,
      onSelect: select,
      onText: (text) => {
        value = text;
        if (submitButton) submitButton.disabled = !canSubmit();
      },
    });
    if (revealed && current) card.append(renderExplanation({ question: q, score: current.score, order: orders[index] }));
    const hint = h('span', { class: 'muted small' }, h('span', { class: 'kbd' }, '1–8'), ' выбрать · ', h('span', { class: 'kbd' }, 'Enter'), revealed ? ' далее' : ' ответить');
    replaceChildren(root, top, card, h('div', { class: 'quiz__actions' }, actions(), hint));
    if (q.type === 'text' && !revealed) root.querySelector('input')?.focus();
  }

  function destroy() {
    document.removeEventListener('keydown', onKey);
    if (timerId) window.clearInterval(timerId);
  }

  document.addEventListener('keydown', onKey);
  render();
  return { destroy, finish, isAnswered: () => isAnswered(question(), selected) };
}
