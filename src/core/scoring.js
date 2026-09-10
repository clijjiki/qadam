// Подсчёт баллов в формате ЕНТ-2026.
// single  — один ответ из 4: 1 балл.
// multi   — 1–3 верных из 6: 2 балла без ошибок, 1 балл при одной ошибке, 0 — при двух и более.
// match   — соответствие: 2 строки (A, B) × 4 общих варианта; 2 балла за обе строки, 1 — за одну.
// text    — ввод ответа (IELTS gap-fill): 1 балл при совпадении с любым допустимым вариантом.

export const POINTS = { single: 1, multi: 2, match: 2, text: 1 };

function symmetricDifference(a, b) {
  let count = 0;
  for (const x of a) if (!b.has(x)) count += 1;
  for (const x of b) if (!a.has(x)) count += 1;
  return count;
}

/** Нормализация текстового ответа: регистр, пробелы, ё/е, артикли, запятая как десятичный разделитель. */
export function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.。]$/, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/(\d),(\d)/g, '$1.$2');
}

function textMatches(question, value) {
  const given = normalizeText(value);
  if (!given) return false;
  const accepted = (question.accept && question.accept.length ? question.accept : question.answer).map(normalizeText);
  if (accepted.includes(given)) return true;
  const asNumber = Number(given);
  return Number.isFinite(asNumber) && accepted.some((a) => Number.isFinite(Number(a)) && Number(a) === asNumber);
}

export function maxPointsFor(question) {
  if (Number.isFinite(question.points) && question.points > 0) return question.points;
  return POINTS[question.type] || POINTS.single;
}

/** Пустой выбор для вопроса: [] для single/multi, [-1, -1] для match, '' для text. */
export function emptySelection(question) {
  if (question.type === 'match') return (question.rows || []).map(() => -1);
  return question.type === 'text' ? '' : [];
}

/** Есть ли хоть какой-то ответ. */
export function isAnswered(question, selected) {
  if (question.type === 'text') return normalizeText(Array.isArray(selected) ? selected[0] : selected).length > 0;
  if (!Array.isArray(selected)) return false;
  if (question.type === 'match') return selected.some((x) => Number.isInteger(x) && x >= 0);
  return selected.length > 0;
}

function scoreText(question, selected, max) {
  const value = Array.isArray(selected) ? selected[0] : selected;
  const answered = isAnswered(question, selected);
  const isCorrect = answered && textMatches(question, value);
  return { points: isCorrect ? max : 0, max, isCorrect, isPartial: false, isAnswered: answered, errors: isCorrect ? 0 : 1 };
}

function scoreMatch(question, selected, max) {
  const chosen = Array.isArray(selected) ? selected : [];
  const rows = (question.rows || []).length || question.answer.length;
  const correct = question.answer.filter((a, i) => Number(chosen[i]) === Number(a)).length;
  const answered = isAnswered(question, chosen);
  const points = !answered ? 0 : Math.round((max * correct) / rows);
  return { points, max, isCorrect: answered && correct === rows, isPartial: points > 0 && correct < rows, isAnswered: answered, errors: rows - correct };
}

function scoreMulti(question, selected, max) {
  const answer = new Set(question.answer.map(Number));
  const chosen = new Set((Array.isArray(selected) ? selected : []).map(Number));
  const answered = chosen.size > 0;
  const errors = symmetricDifference(answer, chosen);
  const points = !answered ? 0 : errors === 0 ? max : errors === 1 ? Math.floor(max / 2) : 0;
  return { points, max, isCorrect: answered && errors === 0, isPartial: answered && errors === 1 && points > 0, isAnswered: answered, errors };
}

/**
 * @param {{type:string, answer:any[]}} question
 * @param {number[]|string} selected индексы выбранных вариантов (single/multi), пара индексов (match) или текст
 */
export function scoreQuestion(question, selected = []) {
  const max = maxPointsFor(question);
  if (question.type === 'text') return scoreText(question, selected, max);
  if (question.type === 'match') return scoreMatch(question, selected, max);
  if (question.type === 'multi') return scoreMulti(question, selected, max);
  const answer = new Set(question.answer.map(Number));
  const chosen = new Set((Array.isArray(selected) ? selected : []).map(Number));
  const [only] = [...chosen];
  const isCorrect = chosen.size === 1 && answer.has(only);
  return { points: isCorrect ? max : 0, max, isCorrect, isPartial: false, isAnswered: chosen.size > 0, errors: isCorrect ? 0 : 1 };
}

/** Сводка по массиву результатов scoreQuestion. */
export function summarize(results) {
  const total = results.length;
  const correct = results.filter((r) => r.isCorrect).length;
  const partialCount = results.filter((r) => r.isPartial).length;
  const points = results.reduce((s, r) => s + r.points, 0);
  const maxPoints = results.reduce((s, r) => s + r.max, 0);
  const answered = results.filter((r) => r.isAnswered).length;
  return {
    total,
    correct,
    partialCount,
    answered,
    points,
    maxPoints,
    accuracy: total ? correct / total : 0,
    ratio: maxPoints ? points / maxPoints : 0,
  };
}

/** Оценка по шкале «уровня» — для бейджей и подписей. */
export function gradeLabel(ratio) {
  if (ratio >= 0.9) return { label: 'Отлично', tone: 'success' };
  if (ratio >= 0.75) return { label: 'Хорошо', tone: 'primary' };
  if (ratio >= 0.5) return { label: 'Средне', tone: 'warn' };
  return { label: 'Нужно повторить', tone: 'danger' };
}
