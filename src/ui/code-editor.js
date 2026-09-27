// Простой редактор кода на textarea: Tab — 4 пробела (или сдвиг выделенных строк), Shift+Tab — назад,
// Enter сохраняет отступ и добавляет его после «:», Esc + Tab — выйти из редактора.

const INDENT = '    ';

/** Вставка через execCommand, чтобы работал Ctrl+Z; запасной путь — setRangeText. */
function insertText(area, text) {
  area.focus();
  const done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  if (!done) {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function currentLine(area) {
  const before = area.value.slice(0, area.selectionStart);
  return before.slice(before.lastIndexOf('\n') + 1);
}

/** Сдвиг всех выделенных строк вправо (или влево при outdent). Выделение сохраняется. */
function shiftLines(area, outdent) {
  const { value, selectionStart, selectionEnd } = area;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const end = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n' ? selectionEnd - 1 : selectionEnd;
  const lines = value.slice(start, end).split('\n');
  const shifted = lines.map((line) => (outdent ? line.replace(/^ {1,4}/, '') : INDENT + line));
  const next = shifted.join('\n');
  if (next === lines.join('\n')) return;
  area.setSelectionRange(start, end);
  insertText(area, next);
  const firstDelta = shifted[0].length - lines[0].length;
  area.setSelectionRange(Math.max(start, selectionStart + firstDelta), start + next.length);
}

function onKeyDown(event, { onRun } = {}) {
  const area = event.currentTarget;
  // Ввод через IME (телефонные клавиатуры) — Enter завершает слово, не трогаем.
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    // Esc отпускает следующий Tab, чтобы с клавиатуры можно было уйти из редактора.
    area.dataset.tabExit = '1';
    return;
  }
  if (event.key === 'Tab' && area.dataset.tabExit) {
    delete area.dataset.tabExit;
    return;
  }
  delete area.dataset.tabExit;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    if (onRun) onRun();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const multiline = area.value.slice(area.selectionStart, area.selectionEnd).includes('\n');
    if (event.shiftKey || multiline) shiftLines(area, event.shiftKey);
    else insertText(area, INDENT);
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    const line = currentLine(area);
    const indent = line.match(/^ */)[0];
    const extra = /:\s*$/.test(line) ? INDENT : '';
    event.preventDefault();
    insertText(area, `\n${indent}${extra}`);
  }
}

/** textarea для кода. onChange(code) — после каждого изменения, onRun — по Ctrl+Enter. */
export function codeEditor({ value = '', onChange, onRun, rows = 12, label = 'Код программы' } = {}) {
  const area = document.createElement('textarea');
  area.className = 'code-editor';
  area.value = value;
  area.rows = rows;
  area.spellcheck = false;
  area.setAttribute('autocapitalize', 'off');
  area.setAttribute('autocomplete', 'off');
  area.setAttribute('aria-label', label);
  area.addEventListener('keydown', (event) => onKeyDown(event, { onRun }));
  if (onChange) area.addEventListener('input', () => onChange(area.value));
  return area;
}
