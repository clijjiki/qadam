// Английский с нуля: этапы пути A0 → C1 и прогресс по целям. Чистые функции без DOM.
// Состояние в store: state.english = { counters: {id: n}, checks: {id: bool}, sentences: {dayKey: n} }.

/**
 * Типы целей:
 * - metric   — считается сайтом (выученные слова, пройденная грамматика); offset — сколько взято предыдущими этапами;
 * - counter  — ученик отмечает вручную кнопкой «+1» (серии, фильмы);
 * - sentences — сколько предложений написано на странице «Предложения»;
 * - check    — просто галочка «сделано».
 */
export const ENGLISH_STAGES = [
  {
    id: 'a0-b1',
    title: 'Этап 1. С нуля до B1',
    sub: 'Слова, базовые времена и первое понимание на слух.',
    goals: [
      { id: 'words', kind: 'metric', metric: 'wordsLearned', offset: 0, target: 1500, title: 'Выучить 1500 слов из контекста', unit: 'слов', href: '#/english/words' },
      { id: 'extra', kind: 'counter', target: 30, title: 'Посмотреть сериал Extra English', unit: 'серий', hint: '30 серий по ~25 минут. Сначала с английскими субтитрами.' },
      { id: 'grammar', kind: 'metric', metric: 'grammarDone', offset: 0, target: 5, title: 'Present, Past и Future Simple', unit: 'уроков', href: '#/english?focus=grammar' },
      { id: 'sentences', kind: 'sentences', target: 300, title: 'Составлять предложения из выученных слов', unit: 'предложений', href: '#/english/sentences' },
    ],
  },
  {
    id: 'b1-b2',
    title: 'Этап 2. От B1 до B2',
    sub: 'Фильмы, живая речь и все остальные времена.',
    goals: [
      { id: 'words2', kind: 'metric', metric: 'wordsLearned', offset: 1500, target: 1000, title: 'Ещё 1000 слов из контекста', unit: 'слов', href: '#/english/words' },
      { id: 'films', kind: 'counter', target: 10, title: 'Посмотреть 10 фильмов уровня B1', unit: 'фильмов', hint: 'Сначала с субтитрами, потом без. Можно чередовать.' },
      { id: 'analyze', kind: 'counter', target: 5, title: 'Разобрать по 30 минут из 5 фильмов', unit: 'фильмов', hint: 'Выписать незнакомые слова и фразы, пересмотреть без субтитров.' },
      { id: 'partner', kind: 'check', title: 'Найти собеседника для практики' },
      { id: 'videos', kind: 'check', title: 'Стабильно смотреть английские ролики уровня B1' },
      { id: 'tenses', kind: 'check', title: 'Изучить все остальные времена' },
    ],
  },
  {
    id: 'b2-c1',
    title: 'Этап 3. От B2 до C1',
    sub: 'Английский становится частью жизни.',
    goals: [
      { id: 'google', kind: 'check', title: 'Гуглить только на английском' },
      { id: 'films2', kind: 'counter', target: 15, title: 'Посмотреть 15 фильмов на английском', unit: 'фильмов' },
      { id: 'youtube', kind: 'check', title: 'Регулярно смотреть YouTube на английском' },
      { id: 'words3', kind: 'metric', metric: 'wordsLearned', offset: 2500, target: 1500, title: 'Ещё 1500 слов', unit: 'слов', href: '#/english/words' },
      { id: 'speak', kind: 'check', title: 'Регулярно говорить на английском' },
    ],
  },
];

// Слово выучено после трёх успешных повторений — то же правило, что в словаре.
const LEARNED_REPS = 3;

/** Сколько слов выучено в наборах setIds. Ключи state.vocab — «<id набора>:<id слова>». */
export function wordsLearned(vocab, setIds) {
  const sets = new Set(setIds);
  return Object.entries(vocab || {}).filter(([key, item]) => sets.has(key.split(':')[0]) && (item?.reps || 0) >= LEARNED_REPS).length;
}

/** Ключи последних повторённых слов из наборов setIds — из них составляются предложения дня. */
export function recentWordKeys(vocab, setIds, count) {
  const sets = new Set(setIds);
  return Object.entries(vocab || {})
    .filter(([key]) => sets.has(key.split(':')[0]))
    .sort((a, b) => (b[1]?.lastAt || 0) - (a[1]?.lastAt || 0))
    .slice(0, count)
    .map(([key]) => key);
}

export function totalSentences(eng) {
  return Object.values(eng?.sentences || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function goalValue(goal, eng, metrics) {
  if (goal.kind === 'metric') return Math.max(0, (Number(metrics?.[goal.metric]) || 0) - goal.offset);
  if (goal.kind === 'counter') return Number(eng?.counters?.[goal.id]) || 0;
  if (goal.kind === 'sentences') return totalSentences(eng);
  return eng?.checks?.[goal.id] ? 1 : 0;
}

/** Прогресс этапа: для каждой цели value/target/ratio/done; этап закрыт, когда закрыты все цели. */
export function stageProgress(stage, eng, metrics) {
  const goals = stage.goals.map((goal) => {
    const target = goal.kind === 'check' ? 1 : goal.target;
    const value = goalValue(goal, eng, metrics);
    return { ...goal, target, value, ratio: Math.min(1, value / target), done: value >= target };
  });
  const ratio = goals.reduce((sum, g) => sum + g.ratio, 0) / goals.length;
  return { ...stage, goals, ratio, done: goals.every((g) => g.done) };
}

export function activeStageId(eng, metrics) {
  const open = ENGLISH_STAGES.find((stage) => !stageProgress(stage, eng, metrics).done);
  return (open || ENGLISH_STAGES[ENGLISH_STAGES.length - 1]).id;
}

export function withCounter(eng, id, delta) {
  const counters = eng?.counters || {};
  return { ...eng, counters: { ...counters, [id]: Math.max(0, (Number(counters[id]) || 0) + delta) } };
}

export function withCheck(eng, id, value) {
  return { ...eng, checks: { ...(eng?.checks || {}), [id]: Boolean(value) } };
}

export function withSentences(eng, dayKey, count) {
  const sentences = eng?.sentences || {};
  return { ...eng, sentences: { ...sentences, [dayKey]: (Number(sentences[dayKey]) || 0) + count } };
}
