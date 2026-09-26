// Школьная программа по математике: классы, линии (алгебра/геометрия), четверти
// и порядок трека «сначала программа своего класса (БЖБ/ТЖБ), потом с 7 класса».
// Функции чистые: принимают списки тем из манифеста, чтобы их можно было тестировать без загрузки контента.

export const GRADES = [7, 8, 9, 10, 11];
export const DEFAULT_GRADE = 10;

export const LINES = [
  { id: 'algebra', name: 'Алгебра' },
  { id: 'geometry', name: 'Геометрия' },
];

export const TRACKS = [
  { id: 'school', name: 'Сначала свой класс, потом с 7-го', short: 'по классам' },
  { id: 'ent', name: 'По весу на ЕНТ', short: 'по весу' },
];
export const DEFAULT_TRACK = 'school';

/** Предметы, у которых темы размечены по классам (grade/line/quarter в манифесте). */
export const CURRICULUM_SUBJECTS = ['math'];

const QUARTER_LABELS = ['I', 'II', 'III', 'IV'];

// Примерные границы четвертей в школах Казахстана (месяц-день). Между ними — каникулы.
const QUARTER_DATES = [
  { n: 1, start: '09-01', end: '10-26' },
  { n: 2, start: '11-03', end: '12-30' },
  { n: 3, start: '01-08', end: '03-20' },
  { n: 4, start: '03-30', end: '05-25' },
];

export function normalizeGrade(grade) {
  const n = Number(grade);
  return GRADES.includes(n) ? n : DEFAULT_GRADE;
}

export function normalizeTrack(track) {
  return TRACKS.some((t) => t.id === track) ? track : DEFAULT_TRACK;
}

export function quarterLabel(n) {
  return `${QUARTER_LABELS[n - 1] || n} четверть`;
}

/** Идёт ли предмет по школьной программе при текущих настройках профиля. */
export function usesCurriculum(profile, subjectId) {
  return CURRICULUM_SUBJECTS.includes(subjectId) && normalizeTrack(profile?.track) === 'school';
}

/** Класс темы из манифеста или null, если тема не размечена. */
export function topicGrade(topic) {
  const grade = Number(topic?.grade);
  return GRADES.includes(grade) ? grade : null;
}

/**
 * Какая школьная четверть идёт в день dayKey (ГГГГ-ММ-ДД).
 * На каникулах возвращаем следующую четверть с пометкой holiday: к ней и готовимся.
 */
export function schoolQuarter(dayKey) {
  const monthDay = String(dayKey).slice(5, 10);
  const current = QUARTER_DATES.find((q) => monthDay >= q.start && monthDay <= q.end);
  if (current) return { quarter: current.n, holiday: false, label: quarterLabel(current.n) };
  // Каникулы: ищем ближайшую четверть в календарном порядке (III начинается в январе, I — в сентябре).
  // После последнего старта в году (ноябрь, II четверть) следующая — первая по календарю, т.е. III в январе.
  const byCalendar = [...QUARTER_DATES].sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = byCalendar.find((q) => monthDay < q.start) || byCalendar[0];
  return { quarter: upcoming.n, holiday: true, label: quarterLabel(upcoming.n) };
}

/** Порядок классов в треке: свой класс, затем с 7-го по предыдущий, затем старшие. */
export function gradeSequence(grade) {
  const own = normalizeGrade(grade);
  return [own, ...GRADES.filter((g) => g < own), ...GRADES.filter((g) => g > own)];
}

function lineRank(topic) {
  const index = LINES.findIndex((l) => l.id === topic?.line);
  return index === -1 ? LINES.length : index;
}

/**
 * Сортировочный ключ темы внутри трека: [этап, четверть, линия, порядок в четверти (seq), порядок в ЕНТ-списке].
 * seq задаёт школьную последовательность внутри четверти (предел → производная); без него — порядок ЕНТ-списка.
 * Неразмеченные темы — в конец.
 */
export function curriculumKey(topic, grade) {
  const topicGradeValue = topicGrade(topic);
  const phase = topicGradeValue === null ? GRADES.length : gradeSequence(grade).indexOf(topicGradeValue);
  return [phase, Number(topic?.quarter) || 5, lineRank(topic), Number(topic?.seq) || 99, Number(topic?.order) || 0];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Новый массив тем в порядке трека для класса grade. */
export function sortByCurriculum(topics, grade) {
  return [...topics]
    .map((topic) => ({ topic, key: curriculumKey(topic, grade) }))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map((x) => x.topic);
}

/** Программа одного класса: четверти × линии. Темы без четверти попадают в rest. */
export function gradeProgram(topics, grade) {
  const own = normalizeGrade(grade);
  const inGrade = sortByCurriculum(topics.filter((t) => topicGrade(t) === own), own);
  const quarters = [1, 2, 3, 4].map((n) => ({
    n,
    label: quarterLabel(n),
    lines: LINES.map((line) => ({ ...line, topics: inGrade.filter((t) => Number(t.quarter) === n && t.line === line.id) })),
  }));
  const rest = inGrade.filter((t) => ![1, 2, 3, 4].includes(Number(t.quarter)));
  return { grade: own, quarters, rest, topics: inGrade };
}

/** «7 класс» или «7–9 классы». */
export function gradesLabel(grades) {
  if (!grades.length) return '';
  return grades.length === 1 ? `${grades[0]} класс` : `${grades[0]}–${grades[grades.length - 1]} классы`;
}

/** Этапы трека для страницы плана: свой класс → фундамент с 7-го → старшие классы → без класса. */
export function trackPhases(topics, grade) {
  const own = normalizeGrade(grade);
  const below = GRADES.filter((g) => g < own);
  const above = GRADES.filter((g) => g > own);
  const byGrades = (grades) => sortByCurriculum(topics.filter((t) => grades.includes(topicGrade(t))), own);
  const phases = [
    { key: 'own', title: `Программа ${own} класса`, hint: 'То, что сейчас в школе: БЖБ и ТЖБ', grades: [own], topics: byGrades([own]) },
    { key: 'base', title: below.length ? `Фундамент: ${gradesLabel(below)}` : 'Фундамент', hint: 'Возвращаемся к основам по порядку', grades: below, topics: byGrades(below) },
    { key: 'ahead', title: above.length ? `На опережение: ${gradesLabel(above)}` : 'На опережение', hint: 'Темы старших классов — ближе к ЕНТ', grades: above, topics: byGrades(above) },
    { key: 'other', title: 'Вне школьной программы', hint: 'Формат экзамена и стратегия', grades: [], topics: topics.filter((t) => topicGrade(t) === null) },
  ];
  return phases.filter((p) => p.topics.length > 0);
}
