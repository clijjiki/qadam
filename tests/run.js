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
import { CONTENT_LANGS, isContentLang, langName, langOf, langShort, localizedPath, normalizeLang, topicSummary, topicTitle } from '../src/core/content.js';
import { createDefaultState, migrate, migrateProfile, migrateSettings } from '../src/core/store.js';
import { ENGLISH_STAGES, activeStageId, recentWordKeys, stageProgress, totalSentences, withCheck, withCounter, withSentences, wordsLearned } from '../src/core/english.js';
import { compareOutput, evaluateRuns, explainError, findTask, nextTaskId, normalizeOutput, taskProgress, withPyAttempt } from '../src/core/pytrainer.js';
import { curriculumKey, gradeProgram, gradeSequence, gradesLabel, normalizeGrade, normalizeTrack, schoolQuarter, sortByCurriculum, trackPhases, usesCurriculum } from '../src/core/curriculum.js';
import { interleave, pickForWeek } from '../src/core/plan.js';

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
test('markdown: ссылка внутри сайта открывается в той же вкладке', () => ok(!renderInline('[тренажёр](#/python)').includes('_blank')));
test('markdown: внешняя ссылка открывается в новой вкладке', () => ok(renderInline('[сайт](https://ok.kz)').includes('_blank')));
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

// ---------- языки контента ----------
test('lang: поддерживаются ru и kk', () => {
  deepEqual(CONTENT_LANGS.map((l) => l.id), ['ru', 'kk']);
  equal(isContentLang('kk'), true);
  equal(isContentLang('en'), false);
});
test('lang: неизвестный язык откатывается к ru', () => {
  equal(normalizeLang('en'), 'ru');
  equal(normalizeLang(undefined), 'ru');
  equal(normalizeLang('kk'), 'kk');
});
test('lang: путь к казахской версии темы', () => {
  const meta = { path: 'content/math/math-derivative.json' };
  equal(localizedPath(meta, 'kk'), 'content/kk/math/math-derivative.json');
  equal(localizedPath(meta, 'ru'), 'content/math/math-derivative.json');
});
test('lang: название языка для интерфейса', () => {
  equal(langName('kk'), 'Қазақша');
  equal(langName('ru'), 'Русский');
});
test('lang: короткая подпись для переключателя', () => {
  equal(langShort('kk'), 'KZ');
  equal(langShort('ru'), 'RU');
  equal(langShort('en'), 'RU');
});
test('lang: заголовок темы берёт перевод из манифеста', () => {
  const meta = { id: 'math-derivative', title: 'Производная', titleKk: 'Туынды', summary: 'Про то', summaryKk: 'Ол туралы' };
  equal(topicTitle(meta, 'kk'), 'Туынды');
  equal(topicTitle(meta, 'ru'), 'Производная');
  equal(topicSummary(meta, 'kk'), 'Ол туралы');
});
test('lang: без перевода заголовок остаётся русским', () => {
  const meta = { id: 'ielts-reading-tfng', title: 'True / False / Not Given' };
  equal(topicTitle(meta, 'kk'), 'True / False / Not Given');
  equal(topicSummary(meta, 'kk'), '');
});
test('lang: заголовок пустой темы не ломает список', () => {
  equal(topicTitle(null, 'kk'), '');
  equal(topicTitle({ id: 'x' }, 'kk'), 'x');
});
test('lang: langOf читает язык из настроек', () => {
  equal(langOf({ settings: { contentLang: 'kk' } }), 'kk');
  equal(langOf({ settings: { contentLang: 'en' } }), 'ru');
  equal(langOf({ settings: {} }), 'ru');
  equal(langOf(undefined), 'ru');
});
test('settings: старый examLang становится contentLang', () => {
  const base = createDefaultState().settings;
  equal(migrateSettings(base, { examLang: 'kk' }).contentLang, 'kk');
  equal('examLang' in migrateSettings(base, { examLang: 'kk' }), false);
});
test('settings: contentLang важнее старого examLang', () => {
  const base = createDefaultState().settings;
  equal(migrateSettings(base, { examLang: 'ru', contentLang: 'kk' }).contentLang, 'kk');
  equal(migrateSettings(base, { examLang: 'kk', contentLang: 'ru' }).contentLang, 'ru');
});
test('settings: без сохранённого языка остаётся ru', () => {
  const base = createDefaultState().settings;
  equal(migrateSettings(base, {}).contentLang, 'ru');
  equal(migrateSettings(base).contentLang, 'ru');
});
test('settings: миграция не теряет остальные настройки', () => {
  const base = createDefaultState().settings;
  const next = migrateSettings(base, { examLang: 'kk', dailyGoalMinutes: 40 });
  equal(next.dailyGoalMinutes, 40);
  equal(next.theme, base.theme);
});

// ---------- школьная программа (curriculum) ----------
const CUR = [
  { id: 'p7', grade: 7, line: 'algebra', quarter: 1, order: 2 },
  { id: 'g10', grade: 10, line: 'geometry', quarter: 1, order: 27 },
  { id: 'a10', grade: 10, line: 'algebra', quarter: 1, order: 17 },
  { id: 'a10q3', grade: 10, line: 'algebra', quarter: 3, order: 18 },
  { id: 'a11', grade: 11, line: 'algebra', quarter: 1, order: 20 },
  { id: 'none', order: 30 },
  { id: 'g8', grade: 8, line: 'geometry', quarter: 1, order: 25 },
];
test('curriculum: порядок классов для 10-го — 10, 7, 8, 9, 11', () => deepEqual(gradeSequence(10), [10, 7, 8, 9, 11]));
test('curriculum: порядок классов для 7-го — по возрастанию', () => deepEqual(gradeSequence(7), [7, 8, 9, 10, 11]));
test('curriculum: порядок классов для 11-го — 11, затем 7–10', () => deepEqual(gradeSequence(11), [11, 7, 8, 9, 10]));
test('curriculum: normalizeGrade принимает строку и отбрасывает мусор', () => {
  equal(normalizeGrade('9'), 9);
  equal(normalizeGrade(5), 10);
  equal(normalizeGrade(undefined), 10);
});
test('curriculum: normalizeTrack по умолчанию school', () => {
  equal(normalizeTrack('ent'), 'ent');
  equal(normalizeTrack('x'), 'school');
});
test('curriculum: usesCurriculum только для математики на треке school', () => {
  equal(usesCurriculum({ track: 'school' }, 'math'), true);
  equal(usesCurriculum({ track: 'ent' }, 'math'), false);
  equal(usesCurriculum({ track: 'school' }, 'history'), false);
  equal(usesCurriculum(undefined, 'math'), true);
});
test('curriculum: четверть по дате — учебные дни', () => {
  equal(schoolQuarter('2026-09-15').quarter, 1);
  equal(schoolQuarter('2026-09-15').holiday, false);
  equal(schoolQuarter('2026-12-01').quarter, 2);
  equal(schoolQuarter('2027-02-10').quarter, 3);
  equal(schoolQuarter('2027-04-20').quarter, 4);
});
test('curriculum: на каникулах — следующая четверть с пометкой', () => {
  deepEqual([schoolQuarter('2026-10-29').quarter, schoolQuarter('2026-10-29').holiday], [2, true]);
  deepEqual([schoolQuarter('2027-01-03').quarter, schoolQuarter('2027-01-03').holiday], [3, true]);
  deepEqual([schoolQuarter('2027-07-01').quarter, schoolQuarter('2027-07-01').holiday], [1, true]);
  deepEqual([schoolQuarter('2026-12-31').quarter, schoolQuarter('2026-12-31').holiday], [3, true]);
  deepEqual([schoolQuarter('2027-03-25').quarter, schoolQuarter('2027-03-25').holiday], [4, true]);
});
test('curriculum: сортировка — свой класс, потом 7-й, старшие, без класса', () => {
  deepEqual(sortByCurriculum(CUR, 10).map((t) => t.id), ['a10', 'g10', 'a10q3', 'p7', 'g8', 'a11', 'none']);
});
test('curriculum: сортировка не меняет исходный массив', () => {
  const before = CUR.map((t) => t.id);
  sortByCurriculum(CUR, 10);
  deepEqual(CUR.map((t) => t.id), before);
});
test('curriculum: ключ темы без класса уходит в конец', () => ok(curriculumKey({ id: 'x' }, 10)[0] > curriculumKey({ grade: 11 }, 10)[0]));
test('curriculum: внутри четверти порядок задаёт seq, а не место в ЕНТ-списке', () => {
  const q3 = [
    { id: 'derivative', grade: 10, line: 'algebra', quarter: 3, seq: 3, order: 18 },
    { id: 'limits', grade: 10, line: 'algebra', quarter: 3, seq: 2, order: 33 },
    { id: 'polynomials', grade: 10, line: 'algebra', quarter: 3, seq: 1, order: 32 },
  ];
  deepEqual(sortByCurriculum(q3, 10).map((t) => t.id), ['polynomials', 'limits', 'derivative']);
});
test('curriculum: без seq тема встаёт после тем с seq', () => {
  const list = [{ id: 'noseq', grade: 10, line: 'algebra', quarter: 1, order: 1 }, { id: 'seq', grade: 10, line: 'algebra', quarter: 1, seq: 2, order: 40 }];
  deepEqual(sortByCurriculum(list, 10).map((t) => t.id), ['seq', 'noseq']);
});
test('curriculum: подпись классов — один или диапазон', () => {
  equal(gradesLabel([7]), '7 класс');
  equal(gradesLabel([7, 8, 9]), '7–9 классы');
  equal(gradesLabel([]), '');
  equal(trackPhases(CUR, 8)[1].title, 'Фундамент: 7 класс');
});
test('plan: чередование берёт по одной теме из каждой очереди по кругу', () => {
  deepEqual(interleave([['a1', 'a2'], ['b1'], ['c1', 'c2']], 4), ['a1', 'b1', 'c1', 'a2']);
  deepEqual(interleave([['a1'], []], 5), ['a1']);
  deepEqual(interleave([], 3), []);
});
test('plan: второй день математики берёт другую линию', () => {
  const pool = [{ id: 'a', line: 'algebra' }, { id: 'b', line: 'algebra' }, { id: 'g', line: 'geometry' }];
  equal(pickForWeek(pool, new Set()).id, 'a');
  equal(pickForWeek(pool, new Set(['algebra'])).id, 'g');
  equal(pickForWeek(pool, new Set(['algebra', 'geometry'])).id, 'a');
  equal(pickForWeek([], new Set()), null);
});
test('curriculum: программа класса раскладывает темы по четвертям и линиям', () => {
  const program = gradeProgram(CUR, 10);
  deepEqual(program.quarters[0].lines[0].topics.map((t) => t.id), ['a10']);
  deepEqual(program.quarters[0].lines[1].topics.map((t) => t.id), ['g10']);
  deepEqual(program.quarters[2].lines[0].topics.map((t) => t.id), ['a10q3']);
  equal(program.topics.length, 3);
});
test('curriculum: этапы трека для 10 класса', () => {
  const phases = trackPhases(CUR, 10);
  deepEqual(phases.map((p) => p.key), ['own', 'base', 'ahead', 'other']);
  deepEqual(phases[0].topics.map((t) => t.id), ['a10', 'g10', 'a10q3']);
  deepEqual(phases[1].topics.map((t) => t.id), ['p7', 'g8']);
  deepEqual(phases[2].topics.map((t) => t.id), ['a11']);
});
test('curriculum: у 11 класса нет этапа «на опережение»', () => deepEqual(trackPhases(CUR, 11).map((p) => p.key), ['own', 'base', 'other']));
test('profile: старому профилю добавляются класс и трек по умолчанию', () => {
  const base = createDefaultState().profile;
  const next = migrateProfile(base, { name: 'Айдана', hoursPerWeek: 8 });
  equal(next.grade, 10);
  equal(next.track, 'school');
  equal(next.hoursPerWeek, 8);
});
test('profile: сохранённые класс и трек не сбрасываются', () => {
  const base = createDefaultState().profile;
  const next = migrateProfile(base, { grade: '8', track: 'ent' });
  equal(next.grade, 8);
  equal(next.track, 'ent');
});

// ---------- тренажёр Python ----------
const PY_CATALOG = {
  units: [
    { id: 'u1', title: 'Вывод', tasks: [{ id: 't1', tests: [] }, { id: 't2', tests: [] }] },
    { id: 'u2', title: 'Условия', tasks: [{ id: 't3', tests: [] }] },
  ],
};
test('python: перевод строк Windows и хвостовые пробелы не важны', () => equal(normalizeOutput('1 \r\n2\t\r\n\r\n'), '1\n2'));
test('python: пустой вывод нормализуется в пустую строку', () => equal(normalizeOutput(''), ''));
test('python: совпадающий вывод засчитывается', () => equal(compareOutput('5\n', '5').ok, true));
test('python: первая отличающаяся строка указывается с номером', () => {
  const res = compareOutput('1\n3\n', '1\n2');
  equal(res.ok, false);
  equal(res.line, 2);
  equal(res.expectedLine, '2');
  equal(res.actualLine, '3');
});
test('python: лишняя строка в выводе — ошибка', () => {
  const res = compareOutput('1\n2\n', '1');
  equal(res.ok, false);
  equal(res.line, 2);
  equal(res.expectedLine, '');
});
test('python: пробелы внутри строки важны', () => equal(compareOutput('1  2', '1 2').ok, false));
test('python: проверка по тестам — таймаут и ошибка различаются', () => {
  const tests = [{ output: '1' }, { output: '2' }, { output: '3' }];
  const runs = [{ stdout: '1\n' }, { stdout: '', error: 'NameError: x' }, { stdout: '', timedOut: true }];
  const res = evaluateRuns(tests, runs);
  equal(res.passed, 1);
  equal(res.total, 3);
  deepEqual(res.results.map((r) => r.reason), [null, 'error', 'timeout']);
});
test('python: тесты после таймаута помечаются как пропущенные', () => {
  const res = evaluateRuns([{ output: '1' }, { output: '2' }], [{ stdout: '', timedOut: true }]);
  deepEqual(res.results.map((r) => r.reason), ['timeout', 'skipped']);
});
test('python: подсказка к NameError', () => equal(explainError('Traceback...\nNameError: name \'prnt\' is not defined').kind, 'NameError'));
test('python: подсказка к IndentationError', () => ok(explainError('  File "<код>", line 2\nIndentationError: expected an indented block').hint.length > 10));
test('python: незнакомая ошибка — без подсказки', () => equal(explainError('SomethingWeird: boom'), null));
test('python: номер строки берётся из ошибки', () => equal(explainError('  File "<код>", line 3, in <module>\nZeroDivisionError: division by zero').line, 3));
test('python: попытка без решения увеличивает счётчик и сохраняет код', () => {
  const next = withPyAttempt({}, 't1', { ok: false, code: 'print(1)', at: 10 });
  deepEqual(next.t1, { attempts: 1, solved: false, solvedAt: null, code: 'print(1)', updatedAt: 10 });
});
test('python: решённая задача остаётся решённой после неверной попытки', () => {
  const solved = withPyAttempt({}, 't1', { ok: true, code: 'a', at: 5 });
  const next = withPyAttempt(solved, 't1', { ok: false, code: 'b', at: 9 });
  equal(next.t1.solved, true);
  equal(next.t1.solvedAt, 5);
  equal(next.t1.attempts, 2);
});
test('python: withPyAttempt не мутирует исходный объект', () => {
  const prev = {};
  withPyAttempt(prev, 't1', { ok: true, code: '', at: 1 });
  deepEqual(prev, {});
});
test('python: прогресс по разделам и следующая задача', () => {
  const py = { t1: { solved: true }, t3: { solved: true } };
  const prog = taskProgress(PY_CATALOG, py);
  equal(prog.solved, 2);
  equal(prog.total, 3);
  deepEqual(prog.units.map((u) => `${u.id}:${u.solved}/${u.total}`), ['u1:1/2', 'u2:1/1']);
  equal(nextTaskId(PY_CATALOG, py), 't2');
});
test('python: все решены — следующей задачи нет', () => equal(nextTaskId(PY_CATALOG, { t1: { solved: true }, t2: { solved: true }, t3: { solved: true } }), null));
test('python: поиск задачи с соседями', () => {
  const found = findTask(PY_CATALOG, 't2');
  equal(found.unit.id, 'u1');
  equal(found.prevId, 't1');
  equal(found.nextId, 't3');
  equal(findTask(PY_CATALOG, 'нет'), null);
});
test('store: прогресс Python переживает миграцию', () => deepEqual(migrate({ python: { t1: { solved: true } } }).python, { t1: { solved: true } }));
test('store: у нового состояния есть пустой прогресс Python', () => deepEqual(createDefaultState().python, {}));

// ---------- английский ----------
test('english: три этапа из плана, первый — с нуля до B1', () => {
  deepEqual(ENGLISH_STAGES.map((s) => s.id), ['a0-b1', 'b1-b2', 'b2-c1']);
  ok(ENGLISH_STAGES[0].goals.some((g) => g.id === 'extra'));
});
test('english: счётчик увеличивается и не уходит ниже нуля', () => {
  const one = withCounter({}, 'extra', 1);
  equal(one.counters.extra, 1);
  equal(withCounter(one, 'extra', -5).counters.extra, 0);
});
test('english: withCounter не мутирует исходный объект', () => {
  const prev = { counters: { extra: 2 } };
  withCounter(prev, 'extra', 1);
  equal(prev.counters.extra, 2);
});
test('english: отметка переключается', () => {
  const on = withCheck({}, 'partner', true);
  equal(on.checks.partner, true);
  equal(withCheck(on, 'partner', false).checks.partner, false);
});
test('english: предложения за день суммируются', () => {
  const a = withSentences({}, '2026-09-27', 3);
  const b = withSentences(a, '2026-09-27', 2);
  equal(b.sentences['2026-09-27'], 5);
  equal(totalSentences(b), 5);
});
test('english: прогресс цели по словам берётся из метрик', () => {
  const stage = ENGLISH_STAGES[0];
  const res = stageProgress(stage, {}, { wordsLearned: 750, grammarDone: 0 });
  const words = res.goals.find((g) => g.id === 'words');
  equal(words.value, 750);
  equal(words.target, 1500);
  close(words.ratio, 0.5);
  equal(res.done, false);
});
test('english: слова второго этапа считаются сверх первых 1500', () => {
  const res = stageProgress(ENGLISH_STAGES[1], {}, { wordsLearned: 2000, grammarDone: 5 });
  equal(res.goals.find((g) => g.id === 'words2').value, 500);
});
test('english: выученными считаются слова английских наборов с 3+ повторениями', () => {
  const vocab = { 'eng-words-01:w01-go': { reps: 3 }, 'eng-words-01:w01-be': { reps: 1 }, 'ielts-vocab-education:x': { reps: 5 } };
  equal(wordsLearned(vocab, ['eng-words-01']), 1);
});
test('english: для предложений берутся последние повторённые слова', () => {
  const vocab = { 'eng-words-01:a': { lastAt: 5 }, 'eng-words-01:b': { lastAt: 9 }, 'eng-words-02:c': { lastAt: 7 }, 'ielts-x:d': { lastAt: 99 } };
  deepEqual(recentWordKeys(vocab, ['eng-words-01', 'eng-words-02'], 2), ['eng-words-01:b', 'eng-words-02:c']);
});
test('english: активный этап — первый незавершённый', () => {
  equal(activeStageId({}, { wordsLearned: 0, grammarDone: 0 }), 'a0-b1');
  const eng = { counters: { extra: 30, sentences: 0 }, sentences: { d: 300 } };
  equal(activeStageId(eng, { wordsLearned: 1500, grammarDone: 5 }), 'b1-b2');
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
