// Набор SVG-иконок (в стиле Lucide, stroke-based). Эмодзи как иконки не используем:
// они по-разному выглядят на разных системах и не масштабируются под цвет текста.

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  cap: '<path d="m2 8 10-4 10 4-10 4Z"/><path d="M6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 8v6"/>',
  repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>',
  exam: '<path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2.5v5h5"/><path d="m9 14 2 2 4-4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z"/>',
  cards: '<rect x="3" y="6" width="13" height="14" rx="2"/><path d="M8 3h10a3 3 0 0 1 3 3v11"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0A1.7 1.7 0 0 0 16.9 5.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1Z"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.5 0-4.5-4-6.5-4-11 0 0-2 1.5-2 4.5 0 1.6-1 2.5-2 2.5s-1.5-.8-1.5-2C7 12 5 13.4 5 15.5 5 19.3 8 22 12 22Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  play: '<path d="M6 4.5 19.5 12 6 19.5Z"/>',
  arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  trendUp: '<path d="m3 16 6-6 4 4 8-8"/><path d="M15 6h6v6"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2.5 2.5 0 0 1 5 0v3a2.5 2.5 0 0 1-5 0Z"/><path d="M15 15a2.5 2.5 0 0 1 5 0v3a2.5 2.5 0 0 1-5 0Z"/>',
  pen: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m14.5 5.5 3 3"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="m6.5 6.5 3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="m8 3 2.5 5M16 3l-2.5 5"/><path d="m12 12.5 1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2-1.6-1.6 2.2-.3Z"/>',
  code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
};

/**
 * icon('flame', { size: 18, class: 'ico' }) → SVGElement.
 * Иконки декоративные: aria-hidden. Рядом всегда есть текстовая подпись.
 */
export function icon(name, { size = 20, stroke = 1.75, className = '' } = {}) {
  const path = PATHS[name] || PATHS.spark;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', String(stroke));
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  if (className) el.setAttribute('class', className);
  el.innerHTML = path;
  return el;
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}

/** Иконка предмета по его id из манифеста. */
export function subjectIcon(subjectId, options) {
  const map = { history: 'layers', mathlit: 'chart', reading: 'book', math: 'target', informatics: 'bolt', ielts: 'globe', english: 'globe' };
  return icon(map[subjectId] || 'book', options);
}

/** Иконка типа миссии. */
export function missionIcon(kind, options) {
  const map = { lesson: 'play', weekly: 'exam', topic: 'book', review: 'repeat', vocab: 'cards', ielts: 'globe', english: 'globe', python: 'code', exam: 'exam', weak: 'target' };
  return icon(map[kind] || 'spark', options);
}
