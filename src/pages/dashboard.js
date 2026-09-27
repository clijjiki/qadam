// Главная «Сегодня»: прогноз, миссия дня, предметы, неделя, быстрые действия.

import { formatMinutes, h, pluralize } from '../core/dom.js';
import { ieltsSubject, langOf, subject, topicTitle, ubtSubjects } from '../core/content.js';
import { ieltsReadiness, overallReadiness } from '../core/mastery.js';
import { recordForecastSnapshot } from '../core/actions.js';
import { countdown, dailyMissions, nextTopics } from '../core/plan.js';
import { isActiveDay, levelInfo, streakInfo, sumDaily } from '../core/stats.js';
import { dueIds } from '../core/srs.js';
import { addDaysKey, todayKey, weekStartKey, weekdayShort } from '../core/time.js';
import { icon, missionIcon, subjectIcon } from '../ui/icons.js';
import { progressBar, ring, subjectColor } from '../ui/components.js';

const MAX_BAR_MINUTES = 60;

function greeting(name) {
  const hour = new Date().getHours();
  const word = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  return name ? `${word}, ${name}` : word;
}

/** Дельта прогноза относительно самого раннего снимка за последние 3 недели. */
function forecastDelta(state, current) {
  const week = weekStartKey();
  const keys = [addDaysKey(week, -21), addDaysKey(week, -14), addDaysKey(week, -7)];
  const previous = keys.map((k) => state.forecast[k]).find((entry) => entry && Number.isFinite(entry.ent));
  if (!previous) return null;
  return current - previous.ent;
}

function deltaBadge(delta) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  const chip = h('span', { class: `delta ${up ? 'delta--up' : 'delta--down'}` }, icon(up ? 'trendUp' : 'chart', { size: 14 }), `${up ? '+' : ''}${delta} за неделю`);
  return chip;
}

function heroCard(state, readiness, ielts, cd) {
  const hasData = readiness.studied > 0;
  const delta = hasData ? forecastDelta(state, readiness.predicted) : null;
  const target = Number(state.profile.targetScore) || 120;
  const progress = Math.min(1, readiness.predicted / target);
  const level = levelInfo(state.xp);
  return h(
    'section',
    { class: 'hero' },
    h('div', { class: 'hero__glow', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'hero__main' },
      h('p', { class: 'hero__hello' }, greeting(state.profile.name)),
      h('h1', { class: 'hero__label' }, 'Прогноз ЕНТ'),
      h(
        'div',
        { class: 'hero__score' },
        h('span', { class: 'hero__num' }, hasData ? String(readiness.predicted) : '—'),
        h('span', { class: 'hero__den' }, `/ ${readiness.max}`),
        deltaBadge(delta),
      ),
      h('div', { class: 'hero__bar' }, progressBar(progress, { color: 'var(--hero-bar)' })),
      h('p', { class: 'hero__hint' }, hasData ? `Цель ${target} баллов · освоено ${readiness.mastered} из ${readiness.topicsTotal} тем` : 'Появится после первой практики — начни с миссии дня'),
    ),
    h(
      'div',
      { class: 'hero__side' },
      h('div', { class: 'hero__ring' }, ring({ value: progress, size: 108, stroke: 9, color: 'var(--hero-ring)', label: `${Math.round(progress * 100)}%`, sub: 'до цели' })),
      h(
        'div',
        { class: 'hero__pills' },
        cd.examDays !== null ? h('span', { class: 'pill' }, icon('calendar', { size: 15 }), `${cd.examDays} дн. до ЕНТ`) : null,
        ielts && ielts.overall ? h('span', { class: 'pill' }, icon('globe', { size: 15 }), `IELTS ≈ ${ielts.overall.toFixed(1)}`) : null,
        h('span', { class: 'pill' }, icon('medal', { size: 15 }), `Ур. ${level.level} · ${level.title}`),
      ),
    ),
  );
}

function missionRow(mission) {
  const node = h(
    'a',
    { class: mission.done ? 'mission mission--done' : 'mission', href: mission.href },
    h('span', { class: 'mission__ico' }, mission.done ? icon('check', { size: 18 }) : missionIcon(mission.id, { size: 18 })),
    h('span', { class: 'mission__main' }, h('span', { class: 'mission__title' }, mission.title), h('span', { class: 'mission__sub' }, mission.sub)),
    h('span', { class: 'mission__time' }, `${Math.round(mission.minutes)} мин`),
    icon('chevronRight', { size: 16, className: 'mission__arrow' }),
  );
  return node;
}

function missionsCard(state, missions) {
  const left = missions.filter((m) => !m.done);
  const minutes = left.reduce((sum, m) => sum + m.minutes, 0);
  const goal = Number(state.settings.dailyGoalMinutes) || 25;
  const doneMinutes = Math.round((state.daily[todayKey()] || {}).minutes || 0);
  return h(
    'section',
    { class: 'card panel' },
    h(
      'header',
      { class: 'panel__head' },
      h('h2', { class: 'panel__title' }, 'Сегодня'),
      left.length ? h('span', { class: 'badge badge--primary' }, `≈ ${formatMinutes(minutes)}`) : h('span', { class: 'badge badge--success' }, 'всё выполнено'),
    ),
    h('div', { class: 'goal' }, progressBar(Math.min(1, doneMinutes / goal), { color: 'var(--success)' }), h('span', { class: 'goal__text' }, `${doneMinutes} из ${goal} мин`)),
    h('div', { class: 'missions' }, missions.length ? missions.map(missionRow) : h('p', { class: 'muted' }, 'Контент загружается…')),
    !left.length && missions.length ? h('p', { class: 'muted small', style: { margin: 0 } }, 'План на сегодня закрыт. Можно отдыхать — или взять ещё одну тему.') : null,
  );
}

function subjectTile(state, meta, readiness) {
  const r = readiness.perSubject.find((x) => x.subjectId === meta.id) || { predicted: 0, maxPoints: 0, mastery: 0, studied: 0, topics: 0 };
  const color = subjectColor(meta.id);
  return h(
    'a',
    { class: 'subj', href: `#/subject/${meta.id}`, style: { '--subj': color } },
    h('span', { class: 'subj__ico' }, subjectIcon(meta.id, { size: 18 })),
    h('span', { class: 'subj__name' }, meta.short || meta.name),
    ring({ value: r.mastery, size: 56, stroke: 6, color, label: `${Math.round(r.mastery * 100)}` }),
    h('span', { class: 'subj__score' }, `${Math.round(r.predicted)} / ${r.maxPoints}`),
    h('span', { class: 'subj__sub' }, `${r.studied} из ${r.topics} тем`),
  );
}

function weekCard(state) {
  const today = todayKey();
  const start = weekStartKey(today);
  const week = sumDaily(state, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  const bars = days.map((key) => {
    const day = state.daily[key] || {};
    const minutes = Math.round(day.minutes || 0);
    const height = Math.max(minutes ? 6 : 2, Math.min(100, (minutes / MAX_BAR_MINUTES) * 100));
    const classes = ['spark__bar', isActiveDay(day) ? 'is-active' : '', key === today ? 'is-today' : ''].filter(Boolean).join(' ');
    return h('div', { class: 'spark__col', title: `${weekdayShort(key)}: ${minutes} мин` }, h('div', { class: classes, style: { height: `${height}%` } }), h('span', { class: 'spark__label' }, weekdayShort(key)));
  });
  return h(
    'section',
    { class: 'card panel' },
    h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Неделя'), h('span', { class: 'badge' }, `${pluralize(week.activeDays, ['активный день', 'активных дня', 'активных дней'])}`)),
    h('div', { class: 'spark' }, bars),
    h(
      'div',
      { class: 'metrics' },
      metric('clock', formatMinutes(week.minutes), 'времени'),
      metric('check', String(week.answered), 'ответов'),
      metric('target', week.answered ? `${Math.round(week.accuracy * 100)}%` : '—', 'точность'),
      metric('spark', `+${week.xp}`, 'XP'),
    ),
  );
}

function metric(name, value, label) {
  return h('div', { class: 'metric' }, h('span', { class: 'metric__ico' }, icon(name, { size: 15 })), h('span', { class: 'metric__val' }, value), h('span', { class: 'metric__label' }, label));
}

function streakCard(state) {
  const streak = streakInfo(state);
  const level = levelInfo(state.xp);
  return h(
    'section',
    { class: 'card panel streak-card' },
    h('div', { class: 'streak-card__flame' }, icon('flame', { size: 26 })),
    h('div', { class: 'streak-card__main' }, h('div', { class: 'streak-card__num' }, String(streak.current)), h('div', { class: 'streak-card__label' }, streak.current === 1 ? 'день подряд' : 'дней подряд')),
    h('div', { class: 'streak-card__meta' }, h('div', { class: 'muted small' }, `Лучшая серия: ${streak.best}`), h('div', { class: 'muted small' }, streak.activeToday ? 'Сегодня засчитан ✓' : 'Сегодня ещё не засчитан'), progressBar(level.progress, { color: 'var(--accent)' }), h('div', { class: 'muted small' }, `${level.toNext} XP до уровня ${level.level + 1}`)),
  );
}

function quickActions(state) {
  const due = dueIds(state.questions).length;
  const items = [
    { icon: 'repeat', title: 'Повторить ошибки', sub: due ? `${due} в очереди` : 'очередь пуста', href: '#/practice?mode=review' },
    { icon: 'target', title: 'Слабые темы', sub: '10 вопросов', href: '#/practice?mode=weak&n=10' },
    { icon: 'exam', title: 'Мини-пробник', sub: '45 минут', href: '#/exam?mode=mini' },
    { icon: 'cards', title: 'Английские слова', sub: '15 в день', href: '#/english/words' },
  ];
  return h(
    'section',
    { class: 'card panel' },
    h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Быстрый старт')),
    h('div', { class: 'quick' }, items.map((item) => h('a', { class: 'quick__item', href: item.href }, h('span', { class: 'quick__ico' }, icon(item.icon, { size: 18 })), h('span', { class: 'quick__title' }, item.title), h('span', { class: 'quick__sub' }, item.sub)))),
  );
}

function nextTopicsCard(state) {
  const topics = nextTopics(state, 3);
  if (!topics.length) return null;
  return h(
    'section',
    { class: 'card panel' },
    h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Дальше по плану'), h('a', { class: 'panel__link', href: '#/plan' }, 'Весь план', icon('arrowRight', { size: 15 }))),
    h(
      'div',
      { class: 'next-list' },
      topics.map((topic) => {
        const meta = subject(topic.subject);
        return h(
          'a',
          { class: 'next', href: `#/topic/${topic.id}`, style: { '--subj': subjectColor(topic.subject) } },
          h('span', { class: 'next__ico' }, subjectIcon(topic.subject, { size: 16 })),
          h('span', { class: 'next__main' }, h('span', { class: 'next__title' }, topicTitle(topic, langOf(state))), h('span', { class: 'next__sub' }, `${meta ? meta.short || meta.name : topic.subject} · ≈ ${topic.minutes || 20} мин`)),
          icon('chevronRight', { size: 16, className: 'next__arrow' }),
        );
      }),
    ),
  );
}

function paceAlert(cd) {
  if (cd.examDays === null || cd.examDays <= 0 || !cd.topicsPerWeek) return null;
  return h('div', { class: 'note' }, icon('calendar', { size: 16 }), h('span', {}, `Осталось ${pluralize(cd.remaining, ['тема', 'темы', 'тем'])} и ${cd.examDays} дней. Нужный темп — ${pluralize(cd.topicsPerWeek, ['тема', 'темы', 'тем'])} в неделю.`));
}

export async function render({ state }) {
  const readiness = overallReadiness(state);
  const ielts = ieltsReadiness(state, ieltsSubject());
  const cd = countdown(state);
  const missions = dailyMissions(state);
  if (readiness.studied > 0) recordForecastSnapshot(readiness.predicted, ielts ? ielts.overall : null);
  return h(
    'div',
    { class: 'dash' },
    heroCard(state, readiness, ielts, cd),
    h('div', { class: 'dash__grid' }, missionsCard(state, missions), h('div', { class: 'dash__col' }, streakCard(state), weekCard(state))),
    h(
      'section',
      { class: 'stack', style: { gap: '10px' } },
      h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Предметы ЕНТ'), h('a', { class: 'panel__link', href: '#/ubt' }, 'Все темы', icon('arrowRight', { size: 15 }))),
      h('div', { class: 'subj-grid' }, ubtSubjects().map((meta) => subjectTile(state, meta, readiness))),
    ),
    paceAlert(cd),
    h('div', { class: 'dash__grid dash__grid--even' }, nextTopicsCard(state), quickActions(state)),
  );
}
