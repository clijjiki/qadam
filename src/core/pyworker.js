// Воркер тренажёра: настоящий CPython (Pyodide) в отдельном потоке.
// Бесконечный цикл не вешает страницу — pyrunner.js просто завершает воркер по таймауту.
/* global importScripts, loadPyodide */

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

// Запуск кода ученика: свой stdin, input() без вывода подсказки (иначе ломается сравнение),
// лимит вывода и трейсбэк только по строкам ученика.
const HARNESS = `
import sys, io, builtins, traceback

class _QadamOut(io.StringIO):
    LIMIT = 100_000
    def write(self, s):
        if self.tell() + len(s) > self.LIMIT:
            raise RuntimeError('Слишком много вывода — возможно, бесконечный цикл')
        return super().write(s)

def __qadam_run(code, stdin):
    src = io.StringIO(stdin)
    out = _QadamOut()
    def _input(prompt=''):
        line = src.readline()
        if line == '':
            raise EOFError('входные данные закончились')
        return line.rstrip('\\n')
    old_out, old_in, old_input = sys.stdout, sys.stdin, builtins.input
    sys.stdout, sys.stdin = out, src
    builtins.input = _input
    err = ''
    try:
        exec(compile(code, '<код>', 'exec'), {'__name__': '__main__'})
    except SystemExit:
        pass
    except BaseException as e:
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == '<код>']
        where = [f'  File "<код>", line {f.lineno}' + ('' if f.name == '<module>' else f', in {f.name}') for f in frames]
        try:
            err = '\\n'.join(where + traceback.format_exception_only(type(e), e)).rstrip()
        except BaseException:
            err = type(e).__name__
    finally:
        sys.stdout, sys.stdin, builtins.input = old_out, old_in, old_input
    return out.getvalue(), err
`;

let ready = null;

function boot() {
  if (!ready) {
    ready = (async () => {
      importScripts(`${PYODIDE_URL}pyodide.js`);
      const py = await loadPyodide({ indexURL: PYODIDE_URL });
      py.runPython(HARNESS);
      return py;
    })().catch((error) => {
      // Повторная загрузка — только если не удалась сама загрузка.
      ready = null;
      throw error;
    });
  }
  return ready;
}

function run(py, code, stdin) {
  const fn = py.globals.get('__qadam_run');
  let result = null;
  try {
    result = fn(code, stdin);
    const [stdout, error] = result.toJs();
    return { stdout, error };
  } finally {
    if (result) result.destroy();
    fn.destroy();
  }
}

self.onmessage = async (event) => {
  const { id, type, code, stdin } = event.data || {};
  let py;
  try {
    py = await boot();
  } catch (error) {
    self.postMessage({ id, ok: false, fatal: `Python не загрузился: ${error?.message || error}` });
    return;
  }
  if (type === 'init') {
    self.postMessage({ id, ok: true });
    return;
  }
  try {
    self.postMessage({ id, ok: true, ...run(py, String(code ?? ''), String(stdin ?? '')) });
  } catch (error) {
    // Ошибка вылетела мимо обвязки — интерпретатор мог сломаться; pyrunner поднимет новый воркер.
    self.postMessage({ id, ok: false, broken: true, fatal: `Python аварийно остановился: ${error?.message || error}` });
  }
};
