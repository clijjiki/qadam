// Логика тренажёра Python без DOM: сравнение вывода, разбор ошибок, прогресс по задачам.
// Код выполняется в воркере (pyrunner.js), здесь только чистые функции.

/** Вывод программы в каноничном виде: \n вместо \r\n, без хвостовых пробелов и пустых строк в конце. */
export function normalizeOutput(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/** Сравнение вывода с ожидаемым. При расхождении — номер первой отличающейся строки (с 1). */
export function compareOutput(actual, expected) {
  const a = normalizeOutput(actual);
  const e = normalizeOutput(expected);
  if (a === e) return { ok: true, line: null, expectedLine: null, actualLine: null };
  const aLines = a.split('\n');
  const eLines = e.split('\n');
  const length = Math.max(aLines.length, eLines.length);
  let index = 0;
  while (index < length && aLines[index] === eLines[index]) index += 1;
  return { ok: false, line: index + 1, expectedLine: eLines[index] ?? '', actualLine: aLines[index] ?? '' };
}

/** Итог проверки: tests — [{ input, output }], runs — [{ stdout, error, timedOut }] в том же порядке. */
export function evaluateRuns(tests, runs) {
  const results = tests.map((testCase, index) => {
    const run = runs[index];
    if (!run) return { ok: false, reason: 'skipped', run: null };
    if (run.timedOut) return { ok: false, reason: 'timeout', run };
    if (run.error) return { ok: false, reason: 'error', run };
    const diff = compareOutput(run.stdout, testCase.output);
    return { ok: diff.ok, reason: diff.ok ? null : 'mismatch', diff, run };
  });
  return { passed: results.filter((r) => r.ok).length, total: tests.length, results };
}

const ERROR_HINTS = {
  SyntaxError: 'Python не понял запись. Проверь скобки и кавычки (каждая открытая должна закрыться) и двоеточие после if, for, while, else.',
  IndentationError: 'Ошибка отступа. Строки внутри if, for, while и def сдвигаются на 4 пробела, и у всех строк блока отступ одинаковый.',
  TabError: 'Смешаны табы и пробелы в отступах. Используй только пробелы — по 4 на уровень.',
  NameError: 'Имя не найдено. Проверь написание (print, а не prnt) и что переменной присвоили значение раньше, чем используют.',
  TypeError: 'Операция с неподходящими типами. Частая причина — input() возвращает строку: оберни в int(...) перед вычислениями, а число переводи в str(...) перед склеиванием со строкой.',
  ValueError: 'Неподходящее значение. Например, int("3.5") или int("abc") не превращаются в целое число.',
  ZeroDivisionError: 'Деление на ноль. Проверь делитель перед / , // или %.',
  IndexError: 'Индекс за пределами списка или строки. Индексы идут с 0 до len(...) - 1.',
  KeyError: 'Такого ключа нет в словаре.',
  EOFError: 'Программа вызвала input() больше раз, чем есть строк во входных данных.',
  AttributeError: 'У объекта нет такого метода. Проверь написание, например .append, .split, .upper.',
};

/** Тип ошибки из текста трейсбэка, подсказка по-русски и номер строки. null — если ошибка незнакомая. */
export function explainError(errorText) {
  const text = String(errorText || '');
  const kinds = Object.keys(ERROR_HINTS).join('|');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(${kinds})\\b`));
  if (!match) return null;
  const lines = [...text.matchAll(/line (\d+)/g)];
  const line = lines.length ? Number(lines[lines.length - 1][1]) : null;
  return { kind: match[1], hint: ERROR_HINTS[match[1]], line };
}

/** Новый прогресс по задаче после проверки. Решённая задача не «разрешается» обратно. */
export function withPyAttempt(pyState, taskId, { ok, code, at }) {
  const prev = pyState[taskId] || { attempts: 0, solved: false, solvedAt: null };
  const solved = prev.solved || Boolean(ok);
  const next = {
    attempts: (prev.attempts || 0) + 1,
    solved,
    solvedAt: prev.solved ? prev.solvedAt : ok ? at : null,
    code,
    updatedAt: at,
  };
  return { ...pyState, [taskId]: next };
}

/** Все задачи каталога подряд, с id раздела. */
export function flattenTasks(catalog) {
  return (catalog?.units || []).flatMap((unit) => unit.tasks.map((task) => ({ ...task, unitId: unit.id })));
}

export function taskProgress(catalog, pyState) {
  const isSolved = (task) => Boolean(pyState?.[task.id]?.solved);
  const units = (catalog?.units || []).map((unit) => ({ id: unit.id, solved: unit.tasks.filter(isSolved).length, total: unit.tasks.length }));
  return { solved: units.reduce((s, u) => s + u.solved, 0), total: units.reduce((s, u) => s + u.total, 0), units };
}

/** Первая нерешённая задача по порядку курса. */
export function nextTaskId(catalog, pyState) {
  return flattenTasks(catalog).find((task) => !pyState?.[task.id]?.solved)?.id ?? null;
}

/** Задача по id + её раздел и соседние задачи для кнопок «назад/дальше». */
export function findTask(catalog, taskId) {
  const all = flattenTasks(catalog);
  const index = all.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const task = all[index];
  const unit = catalog.units.find((u) => u.id === task.unitId);
  return { task, unit, prevId: all[index - 1]?.id ?? null, nextId: all[index + 1]?.id ?? null };
}
