// Прохождение пробного экзамена: таймер, навигация по секциям и вопросам, автосохранение, завершение.

import { formatDuration, h, replaceChildren } from '../core/dom.js';
import { buildExam, clearInProgress, loadInProgress, saveInProgress, saveLastResult } from '../core/exam.js';
import { recordExam } from '../core/actions.js';
import { badgeById } from '../core/badges.js';
import { emptySelection, isAnswered, scoreQuestion } from '../core/scoring.js';
import { renderQuestionCard } from '../ui/quiz.js';
import { confirmDialog } from '../ui/modal.js';
import { toast, toastBadges } from '../ui/toast.js';
import { skeleton } from '../ui/components.js';

const WARN_SECONDS = 15 * 60;

let timerId = null;
let keyHandler = null;

function cleanup() {
  if (timerId) window.clearInterval(timerId);
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  timerId = null;
  keyHandler = null;
}

async function prepare(query) {
  const snapshot = loadInProgress();
  const resume = snapshot && (query.resume === '1' || !query.mode);
  if (resume) {
    const exam = await buildExam({ mode: snapshot.mode, seed: snapshot.seed });
    return { exam, answers: snapshot.answers || {}, flags: new Set(snapshot.flags || []), startedAt: snapshot.startedAt || Date.now() };
  }
  const exam = await buildExam({ mode: query.mode === 'mini' ? 'mini' : 'full' });
  const session = { exam, answers: {}, flags: new Set(), startedAt: Date.now() };
  persist(session);
  return session;
}

function persist({ exam, answers, flags, startedAt }) {
  saveInProgress({ mode: exam.mode, seed: exam.seed, answers, flags: [...flags], startedAt });
}

function gradeExam(exam, answers) {
  const results = [];
  const sections = exam.sections.map((section) => {
    const items = section.questions.map((q) => {
      const selected = answers[q.id] || [];
      const score = scoreQuestion(q, selected);
      results.push({ question: q, selected, score });
      return { id: q.id, topicId: q.topicId, selected, points: score.points, max: score.max, isCorrect: score.isCorrect };
    });
    return {
      subject: section.subject,
      name: section.name,
      short: section.short,
      correct: items.filter((i) => i.isCorrect).length,
      total: items.length,
      points: items.reduce((s, i) => s + i.points, 0),
      max: items.reduce((s, i) => s + i.max, 0),
      items,
    };
  });
  return { results, sections };
}

export async function render({ query, navigate }) {
  const root = h('div', { class: 'stack' }, skeleton(4));
  cleanup();
  let session;
  try {
    session = await prepare(query);
  } catch (error) {
    console.error(error);
    return h('div', { class: 'card' }, h('h2', {}, 'Не удалось собрать экзамен'), h('p', { class: 'muted' }, String(error.message || error)), h('a', { class: 'btn', href: '#/exam' }, 'Назад'));
  }
  const { exam, answers, flags, startedAt } = session;
  const shortage = exam.sections.filter((s) => s.shortage > 0);
  let si = 0;
  let qi = 0;
  let finished = false;
  const timerEl = h('span', { class: 'quiz__timer' }, '—');
  const body = h('div', { class: 'exam-body' });

  const current = () => exam.sections[si].questions[qi];
  const answered = (q) => isAnswered(q, answers[q.id]);
  const answeredCount = () => exam.sections.reduce((n, s) => n + s.questions.filter(answered).length, 0);
  const totalCount = () => exam.sections.reduce((n, s) => n + s.questions.length, 0);

  function tick() {
    const remaining = exam.durationMinutes * 60 - (Date.now() - startedAt) / 1000;
    timerEl.textContent = formatDuration(Math.max(0, remaining));
    timerEl.classList.toggle('warn', remaining <= WARN_SECONDS);
    if (remaining <= 0 && !finished) {
      toast('Время вышло — экзамен завершён', { tone: 'danger' });
      finish(true);
    }
  }

  function go(sectionIndex, questionIndex) {
    si = Math.max(0, Math.min(exam.sections.length - 1, sectionIndex));
    const max = exam.sections[si].questions.length - 1;
    qi = Math.max(0, Math.min(max, questionIndex));
    renderBody();
  }

  function next() {
    if (qi < exam.sections[si].questions.length - 1) go(si, qi + 1);
    else if (si < exam.sections.length - 1) go(si + 1, 0);
  }

  function prev() {
    if (qi > 0) go(si, qi - 1);
    else if (si > 0) go(si - 1, exam.sections[si - 1].questions.length - 1);
  }

  function select(original, row) {
    const q = current();
    const prevSel = answers[q.id] || emptySelection(q);
    let nextSel;
    if (q.type === 'match') nextSel = prevSel.map((x, i) => (i === (row ?? prevSel.findIndex((v) => v < 0)) ? original : x));
    else if (q.type === 'multi') nextSel = prevSel.includes(original) ? prevSel.filter((x) => x !== original) : [...prevSel, original];
    else nextSel = [original];
    answers[q.id] = nextSel;
    persist(session);
    renderBody();
  }

  function toggleFlag() {
    const id = current().id;
    if (flags.has(id)) flags.delete(id);
    else flags.add(id);
    persist(session);
    renderBody();
  }

  async function finish(force = false) {
    if (finished) return;
    if (!force) {
      const unanswered = totalCount() - answeredCount();
      const ok = await confirmDialog({ title: 'Завершить экзамен?', text: unanswered ? `Без ответа: ${unanswered}. Пустой ответ даёт 0 баллов, штрафа нет — лучше ответить наугад.` : 'Все вопросы отвечены. Завершаем?', okLabel: 'Завершить' });
      if (!ok) return;
    }
    finished = true;
    cleanup();
    const { results, sections } = gradeExam(exam, answers);
    const seconds = (Date.now() - startedAt) / 1000;
    const summary = sections.map(({ items, ...rest }) => rest);
    const { badges } = recordExam({ mode: exam.mode, sections: summary, results, seconds, seed: exam.seed });
    saveLastResult({ at: Date.now(), mode: exam.mode, seed: exam.seed, seconds, total: summary.reduce((s, x) => s + x.points, 0), max: summary.reduce((s, x) => s + x.max, 0), sections });
    clearInProgress();
    if (badges.length) toastBadges(badges, badgeById);
    navigate('/exam/result', { replace: true });
  }

  function navGrid(section, index) {
    return h(
      'div',
      { class: 'qnav' },
      section.questions.map((q, i) => {
        const classes = ['', answered(q) ? 'answered' : '', flags.has(q.id) ? 'flag' : '', index === si && i === qi ? 'current' : ''].filter(Boolean).join(' ');
        return h('button', { class: classes, onClick: () => go(index, i), title: `${section.short} · ${i + 1}` }, String(i + 1));
      }),
    );
  }

  function sidePanel() {
    return h(
      'div',
      { class: 'exam-side stack', style: { gap: '10px' } },
      h('div', { class: 'section-tabs' }, exam.sections.map((s, i) => h('button', { class: i === si ? 'active' : '', onClick: () => go(i, 0) }, `${s.short} ${s.questions.filter(answered).length}/${s.questions.length}`))),
      h('div', { class: 'card' }, h('div', { class: 'small muted', style: { marginBottom: '6px' } }, exam.sections[si].name), navGrid(exam.sections[si], si), h('div', { class: 'exam-legend' }, h('span', {}, h('i', { style: { background: 'var(--primary-soft)' } }), 'отвечен'), h('span', {}, h('i', { style: { background: 'var(--accent-soft)' } }), 'помечен'))),
      h('div', { class: 'small muted' }, `Отвечено ${answeredCount()} из ${totalCount()}`),
      h('button', { class: 'btn btn--danger btn--block', onClick: () => finish(false) }, 'Завершить экзамен'),
    );
  }

  function renderBody() {
    const section = exam.sections[si];
    const q = current();
    const card = renderQuestionCard({ question: q, topic: section.topicsById[q.topicId], selected: answers[q.id] || emptySelection(q), index: qi, total: section.questions.length, onSelect: select });
    const flagged = flags.has(q.id);
    const controls = h(
      'div',
      { class: 'quiz__actions' },
      h('button', { class: 'btn', onClick: prev, disabled: si === 0 && qi === 0 }, '← Назад'),
      h('button', { class: flagged ? 'btn btn--sm' : 'btn btn--ghost btn--sm', onClick: toggleFlag }, flagged ? '🚩 Снять пометку' : '🏳 Пометить'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', onClick: next, disabled: si === exam.sections.length - 1 && qi === section.questions.length - 1 }, 'Далее →'),
    );
    replaceChildren(body, h('div', { class: 'stack' }, h('div', { class: 'muted small' }, `${section.name} · вопрос ${qi + 1} из ${section.questions.length}`), card, controls), sidePanel());
  }

  keyHandler = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || finished) return;
    if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') prev();
    else if (event.key.toLowerCase() === 'm' || event.key.toLowerCase() === 'ь') toggleFlag();
    else {
      const position = '12345678'.indexOf(event.key);
      const q = current();
      if (position >= 0 && position < q.options.length && q.type !== 'text') select(position);
    }
  };
  document.addEventListener('keydown', keyHandler);
  timerId = window.setInterval(tick, 1000);
  tick();

  const head = h(
    'div',
    { class: 'exam-head' },
    h('b', {}, exam.mode === 'mini' ? '⚡ Мини-пробник' : '📝 Пробный ЕНТ'),
    timerEl,
    h('span', { class: 'muted small' }, 'Клавиши: 1–8 выбрать · ←/→ вопрос · M пометить'),
    h('span', { class: 'spacer' }),
    h('a', { class: 'btn btn--ghost btn--sm', href: '#/exam', title: 'Экзамен сохранится, таймер продолжит идти' }, 'Свернуть'),
  );
  renderBody();
  replaceChildren(root, head, shortage.length ? h('div', { class: 'alert alert--warn small' }, `В банке пока мало вопросов: ${shortage.map((s) => `${s.short} (не хватает ${s.shortage})`).join(', ')}. Балл считается по фактическому числу заданий.`) : null, body);
  return root;
}

export function unmount() {
  cleanup();
}
