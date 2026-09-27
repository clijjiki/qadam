// Запуск Python-кода в воркере (pyworker.js) с таймаутом.
// Задачи выполняются строго по очереди: таймер запускается, только когда код реально отправлен в воркер,
// поэтому ожидание в очереди не съедает лимит. Загрузка Pyodide в лимит не входит.

export const RUN_TIMEOUT_MS = 4000;
const BOOT_TIMEOUT_MS = 120000;

let worker = null;
let booting = null;
let seq = 0;
let queue = Promise.resolve();
const pending = new Map();

function rejectAll(message) {
  const entries = [...pending.values()];
  pending.clear();
  for (const { reject } of entries) reject(new Error(message));
}

/** Убивает воркер и отклоняет все его запросы — ни один старый таймер потом не тронет новый воркер. */
function reset(reason = 'Python перезапущен — запусти код ещё раз') {
  if (worker) worker.terminate();
  worker = null;
  booting = null;
  rejectAll(reason);
}

function spawn() {
  worker = new Worker(new URL('./pyworker.js', import.meta.url));
  worker.onmessage = (event) => {
    const { id, ok, fatal, broken } = event.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(event.data);
    else entry.reject(new Error(fatal || 'Python не запустился'));
    // Сломанный интерпретатор не чиним на месте — поднимем новый при следующем запуске.
    if (broken) reset();
  };
  worker.onerror = (event) => {
    console.error('Ошибка воркера Python:', event.message);
    reset('Python не запустился. Для первого запуска нужен интернет.');
  };
}

function send(message, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    try {
      if (!worker) spawn();
    } catch (error) {
      reject(error);
      return;
    }
    const id = (seq += 1);
    const timer = window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      onTimeout(resolve, reject);
    }, timeoutMs);
    const settle = (fn) => (value) => {
      window.clearTimeout(timer);
      fn(value);
    };
    pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
    worker.postMessage({ id, ...message });
  });
}

/** Загрузка Python (один раз за сессию, дальше из кеша браузера). */
export function warmUp() {
  if (!booting) {
    const attempt = send({ type: 'init' }, BOOT_TIMEOUT_MS, (_resolve, reject) => {
      reset('Python долго загружается. Проверь интернет и попробуй ещё раз.');
      reject(new Error('Python долго загружается. Проверь интернет и попробуй ещё раз.'));
    }).catch((error) => {
      if (booting === attempt) booting = null;
      throw error;
    });
    booting = attempt;
  }
  return booting;
}

async function runNow(code, stdin, timeoutMs) {
  await warmUp();
  const result = await send({ type: 'run', code, stdin }, timeoutMs, (resolve) => {
    // Зависший код не остановить изнутри — пересоздаём воркер.
    reset();
    resolve({ timedOut: true });
  });
  return { stdout: result.stdout || '', error: result.error || '', timedOut: Boolean(result.timedOut) };
}

/** Выполняет код. Возвращает { stdout, error, timedOut }. Запуски идут строго по очереди. */
export function runPython(code, stdin = '', { timeoutMs = RUN_TIMEOUT_MS } = {}) {
  const job = queue.then(() => runNow(code, stdin, timeoutMs));
  queue = job.catch(() => {});
  return job.catch((error) => {
    console.error('Запуск Python не удался:', error);
    throw new Error(error?.message || 'Не удалось запустить код');
  });
}

/**
 * Прогон кода по всем тестам задачи. После таймаута остальные тесты не запускаем.
 * isCancelled() — страницу закрыли, дальше не гоняем.
 */
export async function runTests(code, tests, { isCancelled = () => false } = {}) {
  const runs = [];
  for (const testCase of tests) {
    if (isCancelled()) break;
    const run = await runPython(code, testCase.input || '');
    runs.push(run);
    if (run.timedOut) break;
  }
  return runs;
}
