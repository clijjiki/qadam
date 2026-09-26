// Таблица маршрутов. Страницы подгружаются по требованию.
// Поля: pattern — шаблон хэша; nav — активный пункт меню; focus — режим без навигации; public — доступна до онбординга.

export const ROUTES = [
  { pattern: '/', nav: 'home', title: 'Сегодня', load: () => import('./dashboard.js') },
  { pattern: '/onboarding', nav: 'home', title: 'Начало', focus: true, public: true, load: () => import('./onboarding.js') },
  { pattern: '/ubt', nav: 'ubt', title: 'ЕНТ', load: () => import('./ubt.js') },
  { pattern: '/subject/:subjectId', nav: 'ubt', title: 'Предмет', load: () => import('./subject.js') },
  { pattern: '/curriculum', nav: 'school', title: 'По классам', load: () => import('./curriculum.js') },
  { pattern: '/topic/:topicId', nav: 'ubt', title: 'Тема', load: () => import('./topic.js') },
  { pattern: '/practice/:topicId', nav: 'ubt', title: 'Практика', focus: true, load: () => import('./practice.js') },
  { pattern: '/practice', nav: 'review', title: 'Повторение', focus: true, load: () => import('./practice.js') },
  { pattern: '/exam', nav: 'exam', title: 'Пробники', load: () => import('./exam.js') },
  { pattern: '/exam/run', nav: 'exam', title: 'Пробный ЕНТ', focus: true, load: () => import('./exam-run.js') },
  { pattern: '/exam/result', nav: 'exam', title: 'Результат', load: () => import('./exam-result.js') },
  { pattern: '/ielts', nav: 'ielts', title: 'IELTS', load: () => import('./ielts/hub.js') },
  { pattern: '/ielts/vocab', nav: 'vocab', title: 'Словарь IELTS', load: () => import('./ielts/vocab.js') },
  { pattern: '/ielts/writing', nav: 'ielts', title: 'IELTS Writing', load: () => import('./ielts/writing.js') },
  { pattern: '/ielts/speaking', nav: 'ielts', title: 'IELTS Speaking', load: () => import('./ielts/speaking.js') },
  { pattern: '/plan', nav: 'plan', title: 'План', load: () => import('./plan.js') },
  { pattern: '/stats', nav: 'stats', title: 'Статистика', load: () => import('./stats.js') },
  { pattern: '/settings', nav: 'settings', title: 'Настройки', load: () => import('./settings.js') },
  { pattern: '/more', nav: 'more', title: 'Ещё', load: () => import('./more.js') },
];
