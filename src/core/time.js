// Работа с датами. Все «дни» — локальные календарные даты в формате YYYY-MM-DD.

export const DAY_MS = 24 * 60 * 60 * 1000;

export function now() {
  return Date.now();
}

export function toDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return toDayKey(new Date());
}

export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : fromDayKey(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addDaysKey(key, days) {
  return toDayKey(addDays(fromDayKey(key), days));
}

/** Разница в целых днях между двумя ключами (b - a). */
export function daysBetween(aKey, bKey) {
  const a = fromDayKey(aKey);
  const b = fromDayKey(bKey);
  return Math.round((b - a) / DAY_MS);
}

export function daysSince(timestamp, ref = Date.now()) {
  if (!timestamp) return Infinity;
  return (ref - timestamp) / DAY_MS;
}

export function daysUntil(dayKey, fromKey = todayKey()) {
  if (!dayKey) return null;
  return daysBetween(fromKey, dayKey);
}

const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAYS_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function weekdayShort(date) {
  return WEEKDAYS_SHORT[(date instanceof Date ? date : fromDayKey(date)).getDay()];
}

export function weekdayLong(date) {
  return WEEKDAYS_LONG[(date instanceof Date ? date : fromDayKey(date)).getDay()];
}

export function formatDate(dateOrKey, { withYear = false } = {}) {
  const d = dateOrKey instanceof Date ? dateOrKey : typeof dateOrKey === 'number' ? new Date(dateOrKey) : fromDayKey(dateOrKey);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

export function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)}, ${hh}:${mm}`;
}

/** Ключ понедельника той недели, в которую входит дата. */
export function weekStartKey(key = todayKey()) {
  const d = fromDayKey(key);
  const shift = (d.getDay() + 6) % 7; // Пн = 0
  return toDayKey(addDays(d, -shift));
}

export function relativeDay(key, ref = todayKey()) {
  const diff = daysBetween(ref, key);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff > 1) return `через ${diff} дн.`;
  return `${-diff} дн. назад`;
}
