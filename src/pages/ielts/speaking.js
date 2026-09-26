// IELTS Speaking: тренажёр трёх частей с таймерами, модельными ответами и самооценкой.

import { h, replaceChildren } from '../../core/dom.js';
import { langOf, loadTopics, topicsOf } from '../../core/content.js';
import { getState } from '../../core/store.js';
import { saveSpeaking } from '../../core/actions.js';
import { renderMarkdown } from '../../core/markdown.js';
import { roundHalf } from '../../core/mastery.js';
import { mountMath } from '../../core/math.js';
import { emptyState, pageHead } from '../../ui/components.js';
import { toast } from '../../ui/toast.js';

const CRITERIA = [
  { key: 'FC', name: 'Fluency & Coherence', hint: '5 — паузы и повторы мешают; 6 — говоришь связно, но с паузами; 7 — говоришь без заметных усилий, идеи связаны' },
  { key: 'LR', name: 'Lexical Resource', hint: '5 — базовые слова; 6 — хватает слов на тему, есть перифраз; 7 — точная лексика и коллокации' },
  { key: 'GRA', name: 'Grammar Range & Accuracy', hint: '5 — простые формы, частые ошибки; 6 — есть сложные конструкции с ошибками; 7 — многие предложения без ошибок' },
  { key: 'P', name: 'Pronunciation', hint: '5 — иногда трудно понять; 6 — понятно, есть акцент; 7 — ясная речь, интонация помогает смыслу' },
];
const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8];
const TIMERS = { 1: 30, 2: { prep: 60, talk: 120 }, 3: 45 };

let timerId = null;

function clearTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function countdown(seconds, onTick, onDone) {
  clearTimer();
  let left = seconds;
  onTick(left);
  timerId = window.setInterval(() => {
    left -= 1;
    onTick(left);
    if (left <= 0) {
      clearTimer();
      if (onDone) onDone();
    }
  }, 1000);
}

function timerView(node, left, danger) {
  node.textContent = `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, '0')}`;
  node.style.color = danger ? 'var(--danger)' : '';
}

async function loadPrompts() {
  const metas = topicsOf('ielts', { kind: 'speaking' });
  const out = [];
  await Promise.all(
    metas.map(async (meta) => {
      try {
        const [topic] = await loadTopics([meta.id], langOf(getState()));
        for (const prompt of topic.prompts) out.push({ ...prompt, topicId: meta.id, topicTitle: topic.title || meta.title });
      } catch (error) {
        console.error(`Не удалось загрузить ${meta.id}:`, error);
      }
    }),
  );
  return { metas, prompts: out };
}

function rubricBlock(onSave) {
  const values = {};
  const overallEl = h('b', {}, '—');
  const saveBtn = h('button', { class: 'btn btn--primary', disabled: true, onClick: () => onSave(values, Number(overallEl.textContent) || null) }, 'Сохранить оценку');
  const rows = CRITERIA.map((c) => {
    const scale = h('div', { class: 'rubric__scale' });
    const buttons = BANDS.map((b) =>
      h('button', {
        onClick: () => {
          values[c.key] = b;
          for (const btn of buttons) btn.classList.toggle('active', Number(btn.textContent) === b);
          const list = CRITERIA.map((x) => values[x.key]).filter((v) => typeof v === 'number');
          overallEl.textContent = list.length === CRITERIA.length ? roundHalf(list.reduce((s, v) => s + v, 0) / list.length).toFixed(1) : '—';
          saveBtn.disabled = list.length !== CRITERIA.length;
        },
      }, b.toFixed(1)),
    );
    replaceChildren(scale, ...buttons);
    return h('div', { class: 'rubric__row' }, h('div', {}, h('b', {}, c.name), h('div', { class: 'muted small' }, c.hint)), scale);
  });
  return h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Самооценка'), h('div', { class: 'rubric' }, rows), h('div', { class: 'row row--between' }, h('span', {}, 'Band за ответ: ', overallEl), saveBtn));
}

function part2Trainer(prompt, root, back) {
  const timer = h('div', { class: 'speak-timer' }, '1:00');
  const notes = h('textarea', { class: 'input', placeholder: 'Заметки: 4–5 ключевых слов', style: { minHeight: '90px' } });
  const stage = h('div', { class: 'stack' });

  const showModel = () => {
    clearTimer();
    const model = h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Модельный ответ (Band 7+)'), h('div', { class: 'prose', html: renderMarkdown(prompt.model || '') }), prompt.linkers?.length ? h('div', { class: 'chips' }, prompt.linkers.map((l) => h('span', { class: 'badge badge--info' }, l))) : null);
    mountMath(model);
    const part3 = prompt.part3?.length ? h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Part 3 по теме'), h('ul', {}, prompt.part3.map((q) => h('li', {}, q)))) : null;
    replaceChildren(
      stage,
      model,
      part3,
      rubricBlock((rubric, band) => {
        saveSpeaking(prompt.id, { part: 2, band, rubric, topicId: prompt.topicId });
        toast(`Сохранено: band ${band}`, { tone: 'success' });
        back();
      }),
    );
  };

  const talk = () => {
    replaceChildren(stage, h('div', { class: 'card stack' }, h('b', {}, 'Говори 2 минуты'), timer, h('div', { class: 'muted small' }, 'Отвечай вслух по пунктам карточки. Не останавливайся раньше времени.'), h('button', { class: 'btn', onClick: showModel }, 'Закончил → модельный ответ')));
    countdown(TIMERS[2].talk, (left) => timerView(timer, left, left <= 15), showModel);
  };

  const prep = () => {
    replaceChildren(stage, h('div', { class: 'card stack' }, h('b', {}, 'Подготовка: 1 минута'), timer, notes, h('button', { class: 'btn btn--primary', onClick: talk }, 'Готов — начать ответ')));
    countdown(TIMERS[2].prep, (left) => timerView(timer, left, left <= 10), talk);
  };

  replaceChildren(
    root,
    pageHead({ title: 'Part 2 · Cue card', crumbs: [{ label: 'IELTS', href: '#/ielts' }, { label: 'Speaking', href: '#/ielts/speaking' }] }),
    h('div', { class: 'cue-card' }, h('b', {}, prompt.topic), h('ul', {}, (prompt.bullets || []).map((b) => h('li', {}, b)))),
    stage,
  );
  prep();
}

function questionTrainer(prompt, root, back) {
  const seconds = TIMERS[prompt.part] || 45;
  const questions = prompt.questions || [];
  const timer = h('div', { class: 'speak-timer' }, '0:30');
  const stage = h('div', { class: 'stack' });
  let index = 0;

  const finish = () => {
    clearTimer();
    saveSpeaking(prompt.id, { part: prompt.part, done: true, topicId: prompt.topicId });
    toast('Отмечено как пройдено', { tone: 'success' });
    back();
  };

  const draw = () => {
    if (index >= questions.length) {
      finish();
      return;
    }
    const sample = h('details', { class: 'card' }, h('summary', {}, 'Показать пример ответа'), h('div', { class: 'prose', style: { marginTop: '8px' }, html: renderMarkdown(prompt.sample || 'Пример появится позже.') }));
    replaceChildren(
      stage,
      h('div', { class: 'card stack' }, h('div', { class: 'muted small' }, `Вопрос ${index + 1} из ${questions.length}`), h('h3', { style: { margin: 0 } }, questions[index]), timer, h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', onClick: () => { index += 1; draw(); } }, 'Ответил → дальше'), h('button', { class: 'btn btn--ghost', onClick: finish }, 'Закончить'))),
      sample,
    );
    countdown(seconds, (left) => timerView(timer, left, left <= 5), () => {
      index += 1;
      draw();
    });
  };

  replaceChildren(root, pageHead({ title: `Part ${prompt.part} · ${prompt.topic}`, crumbs: [{ label: 'IELTS', href: '#/ielts' }, { label: 'Speaking', href: '#/ielts/speaking' }] }), stage);
  draw();
}

function hub(metas, prompts, state, open) {
  const byPart = [1, 2, 3].map((part) => ({ part, items: prompts.filter((p) => Number(p.part) === part) }));
  const donePrompts = new Set(Object.keys(state.speaking));
  return h(
    'div',
    { class: 'stack' },
    pageHead({ title: 'IELTS Speaking', sub: '11–14 минут, три части. Тренируйся вслух и оценивай себя по критериям.', crumbs: [{ label: 'IELTS', href: '#/ielts' }, { label: 'Speaking' }] }),
    h('div', { class: 'grid grid--3' }, byPart.map(({ part, items }) => h('div', { class: 'card stack' }, h('div', { class: 'card__title' }, `Part ${part}`), h('div', { class: 'card__sub' }, part === 1 ? '4–5 минут, вопросы о тебе' : part === 2 ? '2 минуты монолога по карточке' : '4–5 минут дискуссии'), h('div', { class: 'badge badge--primary' }, `${items.filter((p) => donePrompts.has(p.id)).length} / ${items.length} пройдено`)))),
    metas.length ? h('div', { class: 'row' }, metas.map((m) => h('a', { class: 'btn btn--sm', href: `#/topic/${m.id}` }, `Теория: ${m.title}`))) : null,
    ...byPart.map(({ part, items }) =>
      items.length
        ? h('div', { class: 'stack', style: { gap: '8px' } }, h('h3', { style: { margin: 0 } }, `Part ${part}`), h('div', { class: 'list' }, items.map((p) => h('button', { class: 'list-item', style: { textAlign: 'left' }, onClick: () => open(p) }, h('div', { class: 'list-item__num' }, donePrompts.has(p.id) ? '✓' : String(part)), h('div', { class: 'list-item__main' }, h('div', { class: 'list-item__title' }, p.topic), h('div', { class: 'list-item__sub' }, part === 2 ? (p.bullets || []).join(' · ') : `${(p.questions || []).length} вопросов`)), h('span', { class: 'badge' }, 'Начать')))))
        : null,
    ),
  );
}

export async function render({ query, navigate }) {
  clearTimer();
  const { metas, prompts } = await loadPrompts();
  if (!prompts.length) return emptyState({ icon: '🎤', title: 'Материалы Speaking скоро появятся', sub: 'Файлы заданий ещё не добавлены в content/ielts.', action: { label: 'К IELTS', href: '#/ielts' } });
  const root = h('div', { class: 'stack' });
  const back = () => {
    clearTimer();
    navigate('/ielts/speaking', { replace: true });
    replaceChildren(root, hub(metas, prompts, getState(), open));
  };
  const open = (prompt) => {
    if (Number(prompt.part) === 2) part2Trainer(prompt, root, back);
    else questionTrainer(prompt, root, back);
  };
  const selected = query.card ? prompts.find((p) => p.id === query.card) : null;
  if (selected) open(selected);
  else replaceChildren(root, hub(metas, prompts, getState(), open));
  return root;
}

export function unmount() {
  clearTimer();
}
