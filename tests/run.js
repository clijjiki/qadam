// Тесты движка без Node: открой /tests/ через локальный сервер.

import { emptySelection, gradeLabel, isAnswered, normalizeText, scoreQuestion, summarize } from '../src/core/scoring.js';
import { GRADES, dueIds, isDue, isGraduated, newItem, review } from '../src/core/srs.js';
import { computeMastery, emptyTopicStats, masteryLevel, retentionFactor, roundHalf } from '../src/core/mastery.js';
import { renderInline, renderMarkdown } from '../src/core/markdown.js';
import { DAY_MS, addDaysKey, daysBetween, fromDayKey, toDayKey, weekStartKey } from '../src/core/time.js';
import { isActiveDay, levelInfo, streakInfo, xpForLevel } from '../src/core/stats.js';
import { createRng, hashString, shuffle } from '../src/core/random.js';
import { addRoute, matchRoute, parseHash } from '../src/core/router.js';
import { formatDuration, plural, pluralize } from '../src/core/dom.js';

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, message: String(error && error.message ? error.message : error) });
  }
}

function ok(value, message) {
  if (!value) throw new Error(message || 'ожидалось истинное значение');
}

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || ''} ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
}

function deepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || ''} ожидалось ${b}, получено ${a}`);
}

function close(actual, expected, eps, message) {
  if (Math.abs(actual - expected) > (eps || 1e-6)) throw new Error(`${message || ''} ожидалось ≈${expected}, получено ${actual}`);
}

// ---------- scoring ----------
const single = { type: 'single', answer: [2], options: ['a', 'b', 'c', 'd'] };
const multi = { type: 'multi', answer: [0, 2, 4], options: ['a', 'b', 'c', 'd', 'e', 'f'] };
const match = { type: 'match', answer: [1, 2], rows: ['A', 'B'], options: ['w', 'x', 'y', 'z'] };
const text = { type: 'text', answer: ['200'], accept: ['200', 'two hundred'] };

test('single: верный ответ даёт 1 балл', () => equal(scoreQuestion(single, [2]).points, 1));
test('single: неверный ответ даёт 0', () => equal(scoreQuestion(single, [0]).points, 0));
test('single: без ответа isAnswered = false', () => equal(scoreQuestion(single, []).isAnswered, false));
test('single: два выбора не засчитываются', () => equal(scoreQuestion(single, [2, 3]).isCorrect, false));
test('multi: точное совпадение — 2 балла', () => equal(scoreQuestion(multi, [0, 2, 4]).points, 2));
test('multi: порядок выбора не важен', () => equal(scoreQuestion(multi, [4, 0, 2]).points, 2));
test('multi: один лишний — 1 балл', () => equal(scoreQuestion(multi, [0, 2, 4, 1]).points, 1));
test('multi: один пропущенный — 1 балл', () => equal(scoreQuestion(multi, [0, 2]).points, 1));
test('multi: две ошибки — 0 баллов', () => equal(scoreQuestion(multi, [0, 1]).points, 0));
test('multi: частичный балл помечен isPartial', () => equal(scoreQuestion(multi, [0, 2]).isPartial, true));
test('multi: пустой ответ — 0 баллов', () => equal(scoreQuestion(multi, []).points, 0));
test('match: обе строки верно — 2 балла', () => equal(scoreQuestion(match, [1, 2]).points, 2));
test('match: одна строка верно — 1 балл', () => equal(scoreQuestion(match, [1, 0]).points, 1));
test('match: обе строки неверно — 0 баллов', () => equal(scoreQuestion(match, [0, 3]).points, 0));
test('match: пустой выбор не даёт баллов', () => equal(scoreQuestion(match, [-1, -1]).points, 0));
test('text: точное совпадение', () => equal(scoreQuestion(text, '200').isCorrect, true));
test('text: вариант из accept', () => equal(scoreQuestion(text, 'Two Hundred').isCorrect, true));
test('text: артикль и пробелы игнорируются', () => equal(normalizeText('  The Answer '), 'answer'));
test('text: запятая как десятичный разделитель', () => equal(normalizeText('3,5'), '3.5'));
test('text: пустая строка не ответ', () => equal(scoreQuestion(text, '   ').isAnswered, false));
test('emptySelection: match даёт [-1,-1]', () => deepEqual(emptySelection(match), [-1, -1]));
test('emptySelection: text даёт пустую строку', () => equal(emptySelection(text), ''));
test('isAnswered: multi с выбором', () => equal(isAnswered(multi, [1]), true));
test('summarize считает баллы и точность', () => {
  const s = summarize([scoreQuestion(single, [2]), scoreQuestion(multi, [0, 2]), scoreQuestion(single, [0])]);
  equal(s.total, 3);
  equal(s.correct, 1);
  equal(s.points, 2);
  equal(s.maxPoints, 4);
  close(s.accuracy, 1 / 3, 0.001);
});
test('gradeLabel даёт тон по доле баллов', () => {
  equal(gradeLabel(0.95).tone, 'success');
  equal(gradeLabel(0.3).tone, 'danger');
});

// ---------- srs ----------
test('srs: первый верный ответ — интервал 1 день', () => equal(review(null, GRADES.GOOD, 0).interval, 1));
test('srs: второй верный — интервал 3 дня', () => {
  const first = review(null, GRADES.GOOD, 0);
  equal(review(first, GRADES.GOOD, 0).interval, 3);
});
test('srs: третий верный — интервал растёт по ease', () => {
  let item = review(null, GRADES.GOOD, 0);
  item = review(item, GRADES.GOOD, 0);
  ok(review(item, GRADES.GOOD, 0).interval > 3);
});
test('srs: ошибка сбрасывает повторы и увеличивает lapses', () => {
  const item = review(review(null, GRADES.GOOD, 0), GRADES.AGAIN, 0);
  equal(item.reps, 0);
  equal(item.lapses, 1);
});
test('srs: ошибка снижает ease', () => ok(review(null, GRADES.AGAIN, 0).ease < 2.5));
test('srs: «легко» повышает ease', () => ok(review(null, GRADES.EASY, 0).ease > 2.5));
test('srs: due через interval дней', () => {
  const item = review(null, GRADES.GOOD, 1000);
  equal(item.due, 1000 + DAY_MS);
});
test('srs: isDue по времени', () => {
  const item = review(null, GRADES.GOOD, 0);
  equal(isDue(item, DAY_MS + 1), true);
  equal(isDue(item, 10), false);
});
test('srs: dueIds сортирует по просроченности', () => {
  const map = { a: { due: 500 }, b: { due: 100 }, c: { due: 10 ** 12 } };
  deepEqual(dueIds(map, 1000), ['b', 'a']);
});
test('srs: isGraduated после трёх повторов', () => {
  let item = null;
  for (let i = 0; i < 3; i += 1) item = review(item, GRADES.GOOD, 0);
  equal(isGraduated(item), true);
});
test('srs: newItem готов к показу сразу', () => equal(isDue(newItem(0), 0), true));

// ---------- mastery ----------
test('mastery: без ответов равна нулю', () => equal(computeMastery(emptyTopicStats()), 0));
test('mastery: идеальные ответы дают высокий уровень', () => {
  const stats = { ...emptyTopicStats(), answered: 20, correct: 20, best: 1, recent: [1, 1, 1], lastAt: Date.now() };
  ok(computeMastery(stats) > 0.95);
});
test('mastery: слабые ответы дают низкий уровень', () => {
  const stats = { ...emptyTopicStats(), answered: 10, correct: 3, best: 0.3, recent: [0.3, 0.2, 0.4], lastAt: Date.now() };
  ok(computeMastery(stats) < 0.5);
});
test('mastery: мало ответов снижает уверенность', () => {
  const few = { ...emptyTopicStats(), answered: 2, correct: 2, best: 1, recent: [1], lastAt: Date.now() };
  const many = { ...emptyTopicStats(), answered: 20, correct: 20, best: 1, recent: [1], lastAt: Date.now() };
  ok(computeMastery(few) < computeMastery(many));
});
test('retentionFactor: первые 7 дней = 1', () => equal(retentionFactor(Date.now() - 3 * DAY_MS), 1));
test('retentionFactor: не падает ниже 0.55', () => equal(retentionFactor(Date.now() - 400 * DAY_MS), 0.55));
test('masteryLevel: пороги статусов', () => {
  equal(masteryLevel(0.9).key, 'mastered');
  equal(masteryLevel(0.6).key, 'progress');
  equal(masteryLevel(0.2).key, 'weak');
  equal(masteryLevel(0).key, 'new');
});
test('roundHalf округляет до 0.5', () => {
  equal(roundHalf(6.24), 6);
  equal(roundHalf(6.25), 6.5);
  equal(roundHalf(6.75), 7);
});

// ---------- markdown ----------
test('markdown: заголовок', () => ok(renderMarkdown('## Тема').includes('<h2>Тема</h2>')));
test('markdown: список', () => ok(renderMarkdown('- раз\n- два').includes('<li>раз</li>')));
test('markdown: таблица', () => ok(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |').includes('<table>')));
test('markdown: callout', () => ok(renderMarkdown(':::tip Совет\nтекст\n:::').includes('callout--tip')));
test('markdown: жирный и код', () => {
  ok(renderMarkdown('**жир**').includes('<strong>жир</strong>'));
  ok(renderMarkdown('`код`').includes('<code>код</code>'));
});
test('markdown: формула получает data-tex', () => ok(renderMarkdown('$x^2$').includes('data-tex="x^2"')));
test('markdown: HTML экранируется', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  ok(!html.includes('<script>'), 'тег script не должен попасть в разметку');
  ok(html.includes('&lt;script&gt;'));
});
test('markdown: javascript-ссылка обезврежена', () => {
  const html = renderInline('[клик](javascript:alert(1))');
  ok(!html.includes('javascript:'));
});
test('markdown: обычная ссылка сохраняется', () => ok(renderInline('[сайт](https://ok.kz)').includes('https://ok.kz')));

// ---------- time ----------
test('time: toDayKey и fromDayKey обратимы', () => equal(toDayKey(fromDayKey('2026-03-08')), '2026-03-08'));
test('time: addDaysKey через конец месяца', () => equal(addDaysKey('2026-01-31', 1), '2026-02-01'));
test('time: addDaysKey назад', () => equal(addDaysKey('2026-03-01', -1), '2026-02-28'));
test('time: daysBetween', () => equal(daysBetween('2026-01-01', '2026-01-11'), 10));
test('time: weekStartKey — понедельник', () => {
  equal(weekStartKey('2026-09-10'), '2026-09-07');
  equal(fromDayKey(weekStartKey('2026-09-13')).getDay(), 1);
});

// ---------- stats ----------
test('stats: xpForLevel растёт', () => ok(xpForLevel(3) > xpForLevel(2)));
test('stats: levelInfo для нуля XP', () => equal(levelInfo(0).level, 1));
test('stats: levelInfo растёт с XP', () => ok(levelInfo(5000).level > levelInfo(500).level));
test('stats: isActiveDay по ответам и минутам', () => {
  equal(isActiveDay({ answered: 6, minutes: 0 }), true);
  equal(isActiveDay({ answered: 0, minutes: 12 }), true);
  equal(isActiveDay({ answered: 1, minutes: 1 }), false);
  equal(isActiveDay(null), false);
});
test('stats: streakInfo считает подряд идущие дни', () => {
  const today = '2026-09-10';
  const daily = {};
  for (let i = 0; i < 4; i += 1) daily[addDaysKey(today, -i)] = { answered: 10, minutes: 20 };
  equal(streakInfo({ daily }, today).current, 4);
});
test('stats: пропуск дня обрывает серию', () => {
  const today = '2026-09-10';
  const daily = { '2026-09-10': { answered: 10 }, '2026-09-08': { answered: 10 } };
  equal(streakInfo({ daily }, today).current, 1);
});

// ---------- random ----------
test('random: один seed — одна последовательность', () => {
  const a = createRng(42);
  const b = createRng(42);
  deepEqual([a(), a(), a()], [b(), b(), b()]);
});
test('random: разные seed — разные значения', () => ok(createRng(1)() !== createRng(2)()));
test('random: shuffle сохраняет элементы', () => {
  const source = [1, 2, 3, 4, 5];
  const mixed = shuffle(source, createRng(7));
  deepEqual([...mixed].sort(), source);
  deepEqual(source, [1, 2, 3, 4, 5]);
});
test('random: hashString стабилен', () => equal(hashString('qadam'), hashString('qadam')));

// ---------- router ----------
test('router: parseHash с параметрами', () => {
  const parsed = parseHash('#/practice/math-derivative?mode=hard&n=5');
  equal(parsed.path, '/practice/math-derivative');
  equal(parsed.query.mode, 'hard');
  equal(parsed.query.n, '5');
});
test('router: parseHash без хэша', () => equal(parseHash('').path, '/'));
test('router: matchRoute достаёт параметры', () => {
  addRoute('/test-topic/:topicId', { name: 'topic' });
  const matched = matchRoute('/test-topic/math-derivative');
  equal(matched.params.topicId, 'math-derivative');
});
test('router: неизвестный путь не совпадает', () => equal(matchRoute('/nope-nope-nope'), null));

// ---------- dom ----------
test('dom: plural для русского', () => {
  equal(plural(1, ['вопрос', 'вопроса', 'вопросов']), 'вопрос');
  equal(plural(2, ['вопрос', 'вопроса', 'вопросов']), 'вопроса');
  equal(plural(5, ['вопрос', 'вопроса', 'вопросов']), 'вопросов');
  equal(plural(11, ['вопрос', 'вопроса', 'вопросов']), 'вопросов');
  equal(plural(21, ['вопрос', 'вопроса', 'вопросов']), 'вопрос');
});
test('dom: pluralize добавляет число', () => equal(pluralize(3, ['тема', 'темы', 'тем']), '3 темы'));
test('dom: formatDuration', () => {
  equal(formatDuration(65), '1:05');
  equal(formatDuration(3661), '1:01:01');
});

// ---------- вывод ----------
const out = document.getElementById('out');
const passed = results.filter((r) => r.ok).length;
out.replaceChildren();
const summary = document.createElement('div');
summary.className = 'sum';
summary.textContent = `Пройдено ${passed} из ${results.length}`;
summary.style.color = passed === results.length ? 'var(--success)' : 'var(--danger)';
out.append(summary);
for (const result of results) {
  const row = document.createElement('div');
  row.className = `t ${result.ok ? 'pass' : 'fail'}`;
  row.textContent = `${result.ok ? '✓' : '✗'} ${result.name}${result.ok ? '' : `\n   ${result.message}`}`;
  out.append(row);
}
document.title = passed === results.length ? 'OK' : `FAIL: ${results.length - passed}`;
