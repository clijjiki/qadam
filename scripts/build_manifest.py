# -*- coding: utf-8 -*-
"""Генерирует content/manifest.json: предметы, формат ЕНТ-2026 и список всех тем.
Запуск: python scripts/build_manifest.py
"""
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SUBJECTS = [
    {"id": "history", "name": "История Казахстана", "short": "История", "kind": "ubt", "color": "#ea580c", "icon": "🏛️",
     "exam": {"maxPoints": 20, "single": 10, "context": 10, "multi": 0, "match": 0, "optionsSingle": 4, "durationMinutes": 240, "threshold": 5}},
    {"id": "mathlit", "name": "Математическая грамотность", "short": "Матграм", "kind": "ubt", "color": "#0d9488", "icon": "🧮",
     "exam": {"maxPoints": 10, "single": 10, "context": 0, "multi": 0, "match": 0, "optionsSingle": 4, "durationMinutes": 240, "threshold": 3}},
    {"id": "reading", "name": "Грамотность чтения", "short": "Чтение", "kind": "ubt", "color": "#db2777", "icon": "📖",
     "exam": {"maxPoints": 10, "single": 0, "context": 10, "multi": 0, "match": 0, "optionsSingle": 4, "durationMinutes": 240, "threshold": 3}},
    {"id": "math", "name": "Математика", "short": "Математика", "kind": "ubt", "color": "#2563eb", "icon": "📐",
     "exam": {"maxPoints": 50, "single": 25, "context": 5, "multi": 5, "match": 5, "optionsSingle": 4, "optionsMulti": 6, "durationMinutes": 240, "threshold": 5}},
    {"id": "informatics", "name": "Информатика", "short": "Информатика", "kind": "ubt", "color": "#7c3aed", "icon": "💻",
     "exam": {"maxPoints": 50, "single": 25, "context": 5, "multi": 5, "match": 5, "optionsSingle": 4, "optionsMulti": 6, "durationMinutes": 240, "threshold": 5}},
    {"id": "ielts", "name": "IELTS Academic", "short": "IELTS", "kind": "ielts", "color": "#059669", "icon": "🇬🇧"},
    {"id": "english", "name": "Английский", "short": "Английский", "kind": "english", "color": "#059669", "icon": "🇬🇧"},
]

# (id, title, weight, summary)
HISTORY = [
    ("hist-ancient", "Древний Казахстан: каменный век, бронза, саки, гунны", 1, "Стоянки каменного века, энеолит и бронза (Ботай, андроновцы), саки, сарматы, уйсуни, кангюй, гунны, Модэ, 530 г. до н.э."),
    ("hist-turkic-khaganates", "Тюркские каганаты VI–IX вв.", 1, "Тюркский (552–603), Западно-Тюркский (603–704), Тюргешский (704–756), Атлахская битва 751, Карлукский (756–940) каганаты."),
    ("hist-oguz-kimak-karakhanids", "Огузы, кимаки, Караханиды, кыпчаки", 1, "Огузское государство, Кимакский каганат, Караханиды (942–1212, ислам 960), найманы, кереиты, жалаиры, Кыпчакское ханство, Дешт-и Кипчак, хозяйство."),
    ("hist-mongols-golden-horde", "Монгольское нашествие, Золотая Орда, Ак Орда, Могулистан", 1, "Походы Чингисхана, оборона Отрара, улусы, Золотая Орда (хан Узбек), Ак Орда, Могулистан, походы Тимура, Ногайская Орда, ханство Абулхаира (1428–1468), путешественники."),
    ("hist-kazakh-khanate-formation", "Формирование народа и образование Казахского ханства", 1, "Этногенез, этноним «казах», жузы, предпосылки образования ханства, Жанибек и Керей, 1465 г., первые годы, значение."),
    ("hist-khans-16-17", "Ханы XVI–XVII вв.: Касым, Хакназар, Тауекель, Есим, Жангир", 1, "Внутренняя и внешняя политика ханов, «Исконный путь Есима», Орбулакская битва 1643, отношения с Ногайской Ордой, Бухарой, Россией."),
    ("hist-tauke-society", "Тауке хан, «Жеты жаргы», устройство и хозяйство ханства", 1, "Тауке (1680–1715), «Жеты жаргы», великие бии Толе, Казыбек, Айтеке, административное устройство, социальная структура, кочевое скотоводство и земледелие."),
    ("hist-dzhungar-wars", "Казахско-джунгарские войны", 1, "Джунгарское ханство, «Актабан шубырынды» 1723, курултаи Каракум и Ордабасы 1726, Булантинская 1728 и Аныракайская 1730 битвы, батыры, войны 30–40-х гг."),
    ("hist-russia-abylai", "Подданство Абулхаира и Аблай хан", 1, "Цели Российской империи, экспедиции и крепости, принятие подданства 1731, политика России 30–50-х гг., Аблай хан (1771–1781): внутренняя и внешняя политика."),
    ("hist-uprisings-18-19", "Восстания конца XVIII – XIX вв. и реформы 1822–1824", 1, "Сырым Датов (1783–1797), Уставы 1822 и 1824, Жоламан Тленшиев, Саржан Касымов, Исатай и Махамбет 1836–1838, Кенесары Касымов 1837–1847, Жанхожа, Есет Котибаров."),
    ("hist-colonial-19", "Реформы 1867–1868, переселение и общество XIX в.", 1, "«Временные положения», области и уезды, аграрная и переселенческая политика, восстания 1868–1870, ярмарки и капитализм, трансформация общества, общественная мысль."),
    ("hist-early-20-alash", "Начало XX в., 1916 год, «Алаш» и революции 1917 г.", 1, "Промышленность и торговля, восстание 1916 г., Февраль и Октябрь 1917, газета «Казах», журнал «Айкап», партия «Алаш» (июль 1917), Алаш-Орда (декабрь 1917), лидеры."),
    ("hist-soviet-power-kazassr", "Советская власть, Гражданская война, КазАССР, НЭП", 1, "Установление советской власти, «Уш Жуз», Гражданская война 1918–1920, Кокандская автономия, КазАССР 26.08.1920, военный коммунизм, голод 1921, НЭП, 1925 г."),
    ("hist-collectivization-repressions", "Индустриализация, коллективизация, голод 1931–1933, репрессии", 1, "«Малый Октябрь» Голощёкина, конфискация байских хозяйств, Турксиб, насильственная коллективизация, голод и его последствия, «Письмо пяти», репрессии 1937–1938, Карлаг и АЛЖИР."),
    ("hist-wwii", "Казахстан в Великой Отечественной войне", 1, "Мобилизация и эвакуация, дивизии (8-я гвардейская Панфилова), герои (Момышулы, Маметова, Молдагулова), тыл, депортации народов, культура в годы войны."),
    ("hist-postwar-thaw", "Послевоенные годы, целина, «оттепель»", 1, "1946–1953: промышленность, «Дело Бекмаханова», Семипалатинский полигон 1949; 1954–1964: целина и её последствия, Байконур, Темиртау 1959, Шаяхметов, Кунаев."),
    ("hist-stagnation-perestroika", "«Застой», перестройка, Декабрь 1986", 1, "1965–1985: сырьевая экономика, урбанизация, Целиноград 1979, Кунаев; перестройка, Декабрьские события 1986, Декларация о суверенитете 25.10.1990, Закон о языках 1989."),
    ("hist-independence", "Независимость: 1991 г. – наши дни", 1, "Закрытие полигона 29.08.1991, выборы Президента 01.12.1991, Конституционный закон 16.12.1991, символы, тенге 1993, Конституция 1995, Астана 1997, ОБСЕ 2010, ЭКСПО 2017, 2019 г."),
    ("hist-culture-ancient-medieval", "Культура древности и средневековья", 1, "«Звериный стиль», «Золотой человек» Иссык, Берель, Бесшатыр, Великий Шёлковый путь, руническая письменность, аль-Фараби, Баласагуни, Кашгари, Йасауи, ислам, культура XIII–XVIII вв., жырау."),
    ("hist-culture-19-20", "Культура XIX–XX вв. и современности", 1, "Уалиханов, Алтынсарин, Абай, Жангир хан и школы, джадидизм, Шакарим, Байтурсынов, алфавиты, первые вузы, Сатпаев, Ауэзов, театр и кино, культура независимого Казахстана."),
    ("hist-dates", "100 дат по истории Казахстана", 0, "Официальный список дат НЦТ (99 позиций): карточки «дата ↔ событие» и тренировка «в каком году»."),
]

MATHLIT = [
    ("mlit-percent-finance", "Проценты и финансы", 2, "Процент от числа, число по проценту, последовательные изменения цены, скидки и наценки, простые и сложные проценты по вкладу, тарифы и заказы."),
    ("mlit-charts-tables", "Чтение диаграмм и таблиц", 2, "Круговые и столбчатые диаграммы (данные даны таблицей), доли в процентах, таблицы тарифов/отметок/расписаний, средневзвешенное по таблице частот."),
    ("mlit-statistics", "Статистика: среднее, мода, медиана, размах", 1, "Среднее арифметическое, восстановление элемента по среднему, мода и медиана ряда, размах, таблицы частот."),
    ("mlit-combinatorics-probability", "Комбинаторика и вероятность", 1, "Правило произведения, сочетания и размещения, рукопожатия, классическая вероятность, множества и логика."),
    ("mlit-geometry-plane", "Геометрия в жизни: периметр и площадь", 1, "Прямоугольник, квадрат, треугольник, круг, составные фигуры, теорема Пифагора, расход материалов, нестандартные задачи с периметром."),
    ("mlit-solids", "Площадь поверхности и объём тел", 1, "Куб, параллелепипед, фигуры из кубиков, цилиндр, объём аквариума, площадь полной поверхности."),
    ("mlit-word-problems", "Текстовые задачи через уравнение", 1, "Движение, работа, возраст, «на сколько больше», пропорции, единицы измерения, логические задачи с числами."),
    ("mlit-dependencies-sequences", "Зависимости и последовательности", 1, "Прямая и обратная пропорциональность, арифметические закономерности, «найдите x в фигурах», анализ данных таблицы."),
]

READING = [
    ("rdg-facts-details", "Извлечение фактов и деталей", 3, "Вопросы «согласно тексту», «утверждение не соответствует», числа и названия. Тексты трёх объёмов с вопросами."),
    ("rdg-main-idea", "Основная мысль и тема текста", 2, "Тема, основная мысль, «из текста можно узнать», пословица, соответствующая содержанию, заголовок."),
    ("rdg-inference", "Вывод и умозаключение", 2, "Причина и следствие, что следует из текста, «если…, то нужно знать», предположения автора."),
    ("rdg-structure", "Структура текста", 1, "Итоговое предложение, номер абзаца с информацией, связь абзацев, место вывода, план текста."),
    ("rdg-author-purpose", "Цель текста и позиция автора", 1, "Цель текста, позиция автора и героя, о чём заставило задуматься, отношение к описываемому."),
    ("rdg-vocabulary-style", "Значение слова, средства связи, стиль", 1, "Значение термина в контексте, слово на месте пропуска (союзы, вводные слова), стиль и жанр текста."),
]

MATH = [
    ("math-radicals-numeric-expressions", "Действия с радикалами и числовые выражения", 2, "Свойства корней n-й степени, вынесение из-под корня, сравнение чисел, действия с дробями и десятичными дробями, порядок действий."),
    ("math-powers-exponents", "Степени с целым и рациональным показателем", 2, "Свойства степеней, отрицательный и дробный показатель, стандартный вид числа, упрощение степенных выражений."),
    ("math-algebraic-expressions", "Формулы сокращённого умножения и упрощение выражений", 2, "ФСУ, разложение на множители, сокращение алгебраических дробей, упрощение рациональных и иррациональных выражений."),
    ("math-trigonometry-basics", "Тригонометрия: тождества, формулы приведения, значения углов", 2, "Определения, знаки по четвертям, основные тождества, формулы приведения, суммы и двойного угла, значения табличных углов."),
    ("math-linear-quadratic-rational-equations", "Линейные, квадратные и дробно-рациональные уравнения", 2, "Дискриминант, теорема Виета, неполные квадратные, замена переменной, ОДЗ дробно-рациональных, уравнения с модулем."),
    ("math-irrational-equations", "Иррациональные уравнения", 1, "Возведение в степень, проверка корней, ОДЗ, замена переменной."),
    ("math-trigonometric-equations", "Тригонометрические уравнения", 1, "Простейшие уравнения и их серии, отбор корней, сведение к квадратному, однородные уравнения."),
    ("math-exponential-equations", "Показательные уравнения", 1, "Приведение к одному основанию, вынесение множителя, замена переменной, показательно-степенные уравнения."),
    ("math-logarithmic-equations", "Логарифмы и логарифмические уравнения", 1, "Определение и свойства логарифмов, переход к новому основанию, ОДЗ, замена переменной."),
    ("math-linear-systems", "Системы линейных уравнений", 1, "Методы подстановки и сложения, графический метод, число решений, задачи на составление систем."),
    ("math-nonlinear-systems", "Системы нелинейных уравнений", 2, "Системы с квадратными, показательными, логарифмическими, иррациональными и тригонометрическими уравнениями; симметрические системы."),
    ("math-linear-quadratic-rational-inequalities", "Линейные, квадратные и рациональные неравенства", 1, "Метод интервалов, неравенства с модулем, ОДЗ, целые решения на промежутке."),
    ("math-exp-log-irrational-inequalities", "Показательные, логарифмические и иррациональные неравенства", 1, "Монотонность функций, ОДЗ, равносильные переходы, метод рационализации."),
    ("math-systems-of-inequalities", "Системы неравенств", 1, "Пересечение решений, системы с модулем, дробно-рациональные, показательные и логарифмические системы неравенств."),
    ("math-arithmetic-progression", "Арифметическая прогрессия", 1, "Формула n-го члена, сумма n членов, характеристическое свойство, задачи на составление."),
    ("math-geometric-progression", "Геометрическая прогрессия", 2, "Формула n-го члена, сумма, бесконечно убывающая прогрессия, смешанные задачи с арифметической прогрессией."),
    ("math-functions-and-graphs", "Функции и графики", 1, "Область определения и значений, чётность, монотонность, квадратичная функция, графики с модулем, преобразования графиков."),
    ("math-derivative", "Производная", 2, "Таблица производных, правила дифференцирования, производная сложной функции, физический смысл."),
    ("math-derivative-applications", "Применение производной", 1, "Касательная, монотонность, экстремумы, наибольшее и наименьшее значение на отрезке, геометрический смысл."),
    ("math-antiderivative-integral", "Первообразная и неопределённый интеграл", 1, "Таблица первообразных, правила, первообразная, график которой проходит через точку."),
    ("math-definite-integral-area", "Определённый интеграл и площадь фигуры", 1, "Формула Ньютона–Лейбница, площадь криволинейной трапеции и фигуры между графиками."),
    ("math-word-problems-modeling", "Текстовые задачи и математическое моделирование", 1, "Проценты, движение, работа, смеси и сплавы, числовые зависимости, задачи на прогрессии в жизни."),
    ("math-combinatorics-probability", "Комбинаторика, вероятность и статистика", 0, "Перестановки, размещения, сочетания, бином Ньютона, классическая вероятность, среднее и дисперсия — встречаются в демоверсиях."),
    ("math-triangles", "Треугольники", 2, "Метрические соотношения, теоремы синусов и косинусов, площадь, вписанная и описанная окружности, медианы и биссектрисы."),
    ("math-quadrilaterals-polygons-circle", "Четырёхугольники, многоугольники, окружность", 1, "Параллелограмм, трапеция, ромб, правильные многоугольники, окружность и её элементы, вписанные и описанные четырёхугольники."),
    ("math-plane-vectors-transformations", "Векторы и координаты на плоскости", 1, "Координаты вектора, длина, скалярное произведение, угол между векторами, уравнение прямой и окружности, преобразования."),
    ("math-polyhedra", "Многогранники: призма, пирамида, куб", 2, "Сечения, площади поверхности, объёмы, правильные многогранники, углы между прямыми и плоскостями."),
    ("math-solids-of-revolution", "Тела вращения: цилиндр, конус, шар", 3, "Площади и объёмы, осевые сечения, вписанные и описанные тела — основа контекстных заданий."),
    ("math-space-vectors-coordinates", "Векторы и координаты в пространстве", 1, "Координаты точки и вектора в пространстве, длина, скалярное произведение, уравнение плоскости и сферы."),
    ("math-inverse-trig-functions", "Обратные тригонометрические функции", 1, "arcsin, arccos, arctg, arcctg: определения, области значений, свойства, вычисление значений и упрощение выражений."),
    ("math-trigonometric-inequalities", "Тригонометрические неравенства", 1, "Простейшие неравенства на единичной окружности, запись серий решений, сведение к простейшим."),
    ("math-polynomials", "Многочлены: деление, теорема Безу, схема Горнера", 1, "Деление многочленов уголком, теорема Безу, схема Горнера, рациональные корни, разложение на множители."),
    ("math-limits-continuity", "Предел функции и непрерывность", 0, "Предел последовательности и функции, замечательные пределы, непрерывность, асимптоты — школьная база перед производной."),
    ("math-random-variables", "Случайные величины и их числовые характеристики", 0, "Дискретная случайная величина, закон распределения, математическое ожидание, дисперсия, среднее квадратическое отклонение."),
    ("math-stereometry-axioms-parallel", "Аксиомы стереометрии. Параллельность прямых и плоскостей", 1, "Аксиомы и следствия, взаимное расположение прямых, параллельность прямой и плоскости, параллельные плоскости, скрещивающиеся прямые."),
    ("math-stereometry-perpendicular", "Перпендикулярность прямых и плоскостей", 1, "Признак перпендикулярности, теорема о трёх перпендикулярах, расстояния, угол между прямой и плоскостью, двугранный угол."),
    ("math-exam-strategy", "Форматы заданий ЕНТ по математике и стратегия", 0, "Множественный выбор (до 3 из 6), соответствие (2 строки), контекст, тайминг 2 минуты на задание, частичные баллы, типичные ловушки."),
]

# Школьная программа (ЕМН, обновлённое содержание): класс, линия, четверть и порядок внутри четверти.
# Нужна для трека «сначала программа своего класса, потом с 7-го»: см. src/core/curriculum.js.
MATH_CURRICULUM = {
    # 7 класс
    "math-powers-exponents": (7, "algebra", 1, 1),
    "math-algebraic-expressions": (7, "algebra", 2, 1),
    "math-linear-systems": (7, "algebra", 3, 1),
    "math-triangles": (7, "geometry", 2, 1),
    # 8 класс
    "math-radicals-numeric-expressions": (8, "algebra", 1, 1),
    "math-linear-quadratic-rational-equations": (8, "algebra", 2, 1),
    "math-linear-quadratic-rational-inequalities": (8, "algebra", 3, 1),
    "math-word-problems-modeling": (8, "algebra", 4, 1),
    "math-quadrilaterals-polygons-circle": (8, "geometry", 1, 1),
    # 9 класс
    "math-nonlinear-systems": (9, "algebra", 1, 1),
    "math-systems-of-inequalities": (9, "algebra", 1, 2),
    "math-arithmetic-progression": (9, "algebra", 2, 1),
    "math-geometric-progression": (9, "algebra", 2, 2),
    "math-trigonometry-basics": (9, "algebra", 3, 1),
    "math-plane-vectors-transformations": (9, "geometry", 1, 1),
    # 10 класс
    "math-functions-and-graphs": (10, "algebra", 1, 1),
    "math-inverse-trig-functions": (10, "algebra", 1, 2),
    "math-trigonometric-equations": (10, "algebra", 2, 1),
    "math-trigonometric-inequalities": (10, "algebra", 2, 2),
    "math-combinatorics-probability": (10, "algebra", 2, 3),
    "math-polynomials": (10, "algebra", 3, 1),
    "math-limits-continuity": (10, "algebra", 3, 2),
    "math-derivative": (10, "algebra", 3, 3),
    "math-derivative-applications": (10, "algebra", 4, 1),
    "math-random-variables": (10, "algebra", 4, 2),
    "math-stereometry-axioms-parallel": (10, "geometry", 1, 1),
    "math-stereometry-perpendicular": (10, "geometry", 2, 1),
    "math-space-vectors-coordinates": (10, "geometry", 3, 1),
    # 11 класс
    "math-antiderivative-integral": (11, "algebra", 1, 1),
    "math-definite-integral-area": (11, "algebra", 1, 2),
    "math-irrational-equations": (11, "algebra", 2, 1),
    "math-exponential-equations": (11, "algebra", 2, 2),
    "math-logarithmic-equations": (11, "algebra", 2, 3),
    "math-exp-log-irrational-inequalities": (11, "algebra", 3, 1),
    "math-polyhedra": (11, "geometry", 1, 1),
    "math-solids-of-revolution": (11, "geometry", 2, 1),
}

INFORMATICS = [
    ("inf-information-measurement", "Информация и её измерение", 2, "Бит и байт, единицы, формула N = 2^i, объём текста, скорость передачи, время передачи."),
    ("inf-encoding", "Кодирование текста, графики и звука", 1, "ASCII и Unicode, растровая графика (глубина цвета, объём изображения), дискретизация звука, RGB."),
    ("inf-number-systems", "Системы счисления", 2, "Перевод 2 ↔ 8 ↔ 10 ↔ 16, развёрнутая форма, признаки чисел в разных системах."),
    ("inf-binary-arithmetic", "Арифметика в двоичной, восьмеричной и шестнадцатеричной системах", 1, "Сложение, вычитание, умножение в позиционных системах, сравнение чисел."),
    ("inf-logic-basics", "Логические операции и таблицы истинности", 2, "НЕ, И, ИЛИ, импликация, эквивалентность, приоритет операций, законы логики, упрощение выражений."),
    ("inf-logic-circuits", "Логические элементы и схемы", 1, "Инвертор, конъюнктор, дизъюнктор, сумматор, чтение и построение схем (схемы описываются текстом/формулой)."),
    ("inf-computer-devices", "Устройства компьютера", 2, "Процессор, регистры, память ОЗУ/ПЗУ, шина, тактовая частота, устройства ввода-вывода, характеристики."),
    ("inf-software-os", "Программное обеспечение и ОС", 2, "Виды ПО, операционные системы, файловая система и пути, утилиты, драйверы, конфигурация компьютера."),
    ("inf-networks", "Компьютерные сети", 2, "Топологии, коммутатор/маршрутизатор/концентратор, IP-адрес и маска, протоколы TCP/IP, HTTP, DNS, пропускная способность."),
    ("inf-security", "Информационная безопасность", 2, "Вирусы и антивирусы, идентификация и аутентификация, криптография, ЭЦП, кибербуллинг, сетевой этикет, авторское право."),
    ("inf-python-basics", "Python: переменные, типы, операторы", 2, "Типы данных, операторы / // % **, input/print, sep/end, преобразование типов, приоритет."),
    ("inf-python-branching-loops", "Python: условия и циклы", 2, "if/elif/else, for/range, while, break/continue, трассировка программ, подсчёт итераций."),
    ("inf-python-lists-strings", "Python: списки и строки", 2, "Индексы и срезы, методы списков и строк, двумерные списки, генераторы, сортировка."),
    ("inf-python-functions-recursion", "Python: функции и рекурсия", 2, "Определение функций, параметры, return, области видимости, рекурсия, трассировка рекурсивных вызовов."),
    ("inf-python-files", "Python: работа с файлами", 1, "open и режимы, чтение и запись, обработка данных из файла, with, кодировки."),
    ("inf-algorithms-sorting-search", "Сортировка и поиск", 1, "Пузырьковая, выбором, вставками, бинарный поиск, число сравнений, сложность O-нотация."),
    ("inf-graphs", "Графы", 1, "Представление графов, матрица смежности, обход в ширину и глубину, кратчайший путь, деревья."),
    ("inf-algorithms-flowcharts", "Алгоритмы и блок-схемы", 1, "Свойства алгоритма, виды алгоритмов, блок-схемы (описываются словами и псевдокодом), исполнение по шагам."),
    ("inf-db-relational", "Реляционные базы данных", 2, "Таблицы, поля, записи, ключи, связи 1:М, формы и отчёты, СУБД, типы данных."),
    ("inf-sql-queries", "SQL и структурированные запросы", 2, "SELECT, WHERE, ORDER BY, GROUP BY, JOIN, агрегатные функции, запросы в MS Access."),
    ("inf-it-trends", "Современные IT-тенденции", 2, "ИИ и машинное обучение, big data, блокчейн, облака, VR/AR, IoT, IT-стартап, краудфандинг, 3D-моделирование."),
    ("inf-spreadsheets", "Электронные таблицы", 2, "Ячейки и типы данных, формулы, относительные/абсолютные/смешанные ссылки, копирование формул, функции, диаграммы."),
    ("inf-information-objects", "Информационные объекты и форматы", 1, "Текст, графика, презентации, форматы файлов, векторная и растровая графика, сжатие."),
    ("inf-web-design", "Веб-проектирование: HTML, CSS, сайт", 2, "HTML-теги и атрибуты, CSS-свойства, скрипты, домен, хостинг, структура сайта."),
]

IELTS_GRAMMAR = [
    ("ielts-grammar-tenses", "Времена глагола для IELTS", 1, "Present/Past/Future, Perfect и Continuous, согласование времён; ошибки русскоязычных."),
    ("ielts-grammar-articles", "Артикли и существительные", 1, "a/an/the/zero article, исчисляемые и неисчисляемые, типичные ошибки русскоязычных."),
    ("ielts-grammar-conditionals", "Условные предложения и wish", 1, "Zero–Third conditionals, mixed, wish/if only, hedging для Task 2 и Speaking Part 3."),
    ("ielts-grammar-passive", "Пассивный залог и описание процессов", 1, "Passive во всех временах, описание процессов и карт в Task 1."),
    ("ielts-grammar-relative-clauses", "Относительные придаточные", 1, "which/that/who/whose/where, defining и non-defining, сокращённые придаточные."),
    ("ielts-grammar-modals", "Модальные глаголы и степени уверенности", 1, "may/might/could/must/should, hedging, советы и предположения в Speaking и Writing."),
    ("ielts-grammar-complex-sentences", "Сложные предложения и связки", 1, "Although/whereas/despite, linking words, participle clauses, инверсия — путь к GRA Band 7."),
    ("ielts-grammar-common-errors", "Типичные ошибки русскоязычных", 1, "Порядок слов, предлоги, согласование, «very» и академическая лексика, пунктуация, самопроверка error-free sentences."),
]

IELTS_VOCAB = [
    ("ielts-vocab-education", "Education", 1, "20 слов и коллокаций об образовании: curriculum, tuition, vocational…"),
    ("ielts-vocab-environment", "Environment", 1, "20 слов: emissions, biodiversity, sustainable, deforestation…"),
    ("ielts-vocab-technology", "Technology", 1, "20 слов: automation, breakthrough, obsolete, cutting-edge…"),
    ("ielts-vocab-health", "Health", 1, "20 слов: sedentary, obesity, preventive, well-being…"),
    ("ielts-vocab-work-career", "Work & Career", 1, "20 слов: workforce, redundancy, promotion, flexible hours…"),
    ("ielts-vocab-society-culture", "Society & Culture", 1, "20 слов: heritage, inequality, integration, tradition…"),
    ("ielts-vocab-cities-transport", "Cities & Transport", 1, "20 слов: congestion, infrastructure, commute, urban sprawl…"),
    ("ielts-vocab-science-research", "Science & Research", 1, "20 слов: hypothesis, evidence, significant, methodology…"),
    ("ielts-vocab-media-communication", "Media & Communication", 1, "20 слов: censorship, bias, coverage, misinformation…"),
    ("ielts-vocab-academic-linkers", "Academic linkers & essay phrases", 1, "20 связок и академических фраз: furthermore, consequently, it is widely believed that…"),
]

IELTS_READING = [
    ("ielts-reading-skimming-scanning", "Skimming, scanning и тайминг", 1, "Как читать passage за 20 минут; passage «The history of timekeeping» с 13 вопросами разных типов."),
    ("ielts-reading-tfng", "True / False / Not Given", 2, "Разница между «противоречит» и «не сказано»; passage об урбанистике, упор на TFNG."),
    ("ielts-reading-matching-headings", "Matching headings", 1, "Главная идея абзаца vs деталь; passage о психологии сна, упор на matching headings."),
    ("ielts-reading-matching-info-features", "Matching information & features", 1, "Сопоставление деталей с абзацами и исследователями; passage о биологии."),
    ("ielts-reading-completion", "Sentence / summary / note completion", 1, "Лимит слов и точное копирование форм; passage о технологиях, упор на completion."),
    ("ielts-reading-mcq-short-answer", "Multiple choice и short answer", 1, "Дистракторы и парафраз; passage об образовании, упор на MCQ."),
]

IELTS_LISTENING = [
    ("ielts-listening-part1-forms", "Part 1: формы, числа, spelling", 1, "Диалог о бронировании/регистрации: form completion, числа, имена по буквам."),
    ("ielts-listening-part2-maps", "Part 2: монолог, карты и matching", 1, "Экскурсия/объявление: описание плана словами и matching."),
    ("ielts-listening-part3-discussion", "Part 3: обсуждение и мнения", 1, "Студенты и преподаватель: multiple choice, смена мнений."),
    ("ielts-listening-part4-lecture", "Part 4: лекция и конспект", 1, "Академическая лекция: note completion."),
]

IELTS_WRITING = [
    ("ielts-writing-task1-graphs", "Task 1: графики, таблицы, диаграммы", 1, "Структура overview + детали, лексика тенденций, 2 задания (данные таблицей) с образцами Band 6/7/8."),
    ("ielts-writing-task1-process-map", "Task 1: процессы и карты", 1, "Пассив, последовательность, изменения на карте (описание словами); 2 задания с образцами."),
    ("ielts-writing-task2-essay-types", "Task 2: типы эссе и план", 1, "Opinion, discussion, problem-solution, advantages, double question; план 4 абзацев; 3 задания с образцами."),
    ("ielts-writing-task2-cohesion-lexis", "Task 2: связность, лексика, самопроверка", 1, "Развитие абзаца, связки, апгрейд лексики, поиск ошибок; 3 задания с образцами."),
]

IELTS_SPEAKING = [
    ("ielts-speaking-part1", "Part 1: развёрнутые ответы", 1, "Answer + reason + example; банк вопросов по 12 темам с примерами ответов."),
    ("ielts-speaking-part2", "Part 2: cue card", 1, "1 минута подготовки, 2 минуты речи; 12 cue cards с модельными ответами и вопросами Part 3."),
    ("ielts-speaking-part3", "Part 3: дискуссия", 1, "Мнение, сравнение, прогноз, hedging; наборы вопросов Part 3 с примерами ответов."),
]


# Английский с нуля (этап A0–A2): грамматика по порядку и 1500 частых слов наборами по 20.
ENGLISH_GRAMMAR = [
    ("eng-grammar-to-be", "Глагол to be: am, is, are", 1, "Я есть, ты есть: am/is/are, отрицание not, вопросы Are you…?, краткие формы I'm, it's."),
    ("eng-grammar-present-simple", "Present Simple: что я делаю обычно", 1, "I work / he works, do/does в вопросах и отрицаниях, always/usually/every day."),
    ("eng-grammar-past-simple", "Past Simple: что я сделал", 1, "Правильные глаголы -ed, 30 частых неправильных (went, saw, did), did в вопросах, yesterday/ago."),
    ("eng-grammar-future-simple", "Future Simple: что я сделаю", 1, "will + глагол, won't, решения в момент речи и обещания, tomorrow/next week."),
    ("eng-grammar-simple-mix", "Три времени Simple вместе", 1, "Как выбрать Present, Past или Future по слову-маркеру; вопросы и отрицания во всех трёх."),
]

ENGLISH_VOCAB = [
    ("eng-words-01-core-verbs", "Самые нужные глаголы", 1, "be, have, do, go, get, make, know, want, like, need…"),
    ("eng-words-02-people-family", "Люди и семья", 1, "mother, brother, friend, child, name, boy, girl…"),
    ("eng-words-03-numbers-time", "Числа, дни и время", 1, "day, week, today, morning, Monday, hour, first…"),
    ("eng-words-04-food", "Еда и напитки", 1, "bread, water, tea, meat, apple, eat, drink, breakfast…"),
    ("eng-words-05-home", "Дом и вещи", 1, "house, room, door, bed, table, phone, key…"),
    ("eng-words-06-school", "Школа и учёба", 1, "school, lesson, teacher, book, learn, test, homework…"),
    ("eng-words-07-adjectives", "Частые прилагательные", 1, "good, bad, big, small, new, old, easy, hard…"),
    ("eng-words-08-function-words", "Маленькие слова: местоимения и предлоги", 1, "I, you, this, that, in, on, at, with, because…"),
    ("eng-words-09-action-verbs", "Глаголы действия", 1, "open, close, buy, send, help, start, stop, wait…"),
    ("eng-words-10-city-transport", "Город и транспорт", 1, "city, street, shop, bus, car, left, right, near…"),
    ("eng-words-11-body-health", "Тело и здоровье", 1, "head, hand, eye, doctor, sick, pain, sleep…"),
    ("eng-words-12-clothes-colors", "Одежда и цвета", 1, "shirt, shoes, jacket, red, black, white, wear…"),
    ("eng-words-13-work-jobs", "Работа и профессии", 1, "job, work, money, boss, office, engineer, earn…"),
    ("eng-words-14-nature-weather", "Природа и погода", 1, "sun, rain, snow, tree, river, hot, cold, weather…"),
    ("eng-words-15-feelings", "Чувства и характер", 1, "happy, sad, angry, tired, kind, funny, love, afraid…"),
]


# Что нужно странице «По классам» о теме без контента: без path/weight/minutes, чтобы манифест не разбухал.
PLANNED_FIELDS = ("id", "subject", "title", "summary", "kind", "order", "grade", "line", "quarter", "seq")


def build():
    topics = []

    def add(subject, items, kind="lesson", skill=None, minutes=20):
        for i, (tid, title, weight, summary) in enumerate(items, start=1):
            topic = {"id": tid, "subject": subject, "title": title, "kind": kind, "order": i,
                     "path": f"content/{subject}/{tid}.json", "weight": weight, "minutes": minutes, "summary": summary}
            if skill:
                topic["skill"] = skill
            if tid in MATH_CURRICULUM:
                grade, line, quarter, seq = MATH_CURRICULUM[tid]
                topic.update({"grade": grade, "line": line, "quarter": quarter, "seq": seq})
            topics.append(topic)

    add("history", HISTORY, minutes=25)
    add("mathlit", MATHLIT, minutes=20)
    add("reading", READING, minutes=20)
    add("math", MATH, minutes=30)
    add("informatics", INFORMATICS, minutes=25)
    add("ielts", IELTS_GRAMMAR, skill="grammar", minutes=20)
    add("ielts", IELTS_VOCAB, kind="vocab", skill="vocab", minutes=10)
    add("ielts", IELTS_READING, skill="reading", minutes=25)
    add("ielts", IELTS_LISTENING, skill="listening", minutes=20)
    add("ielts", IELTS_WRITING, kind="writing", skill="writing", minutes=45)
    add("ielts", IELTS_SPEAKING, kind="speaking", skill="speaking", minutes=15)
    add("english", ENGLISH_GRAMMAR, skill="grammar", minutes=20)
    add("english", ENGLISH_VOCAB, kind="vocab", skill="vocab", minutes=10)
    for i, topic in enumerate([t for t in topics if t["subject"] == "ielts"], start=1):
        topic["order"] = i
    return {"version": "2026-09-10", "app": "qadam", "subjects": SUBJECTS, "topics": topics}


def localized_path(path, lang):
    """content/math/x.json -> content/kk/math/x.json"""
    return path.replace("content/", f"content/{lang}/", 1) if lang != "ru" else path


def add_translations(topics, langs=("kk",)):
    """Заголовок и описание темы на других языках берём из переведённых файлов.

    Нужно для списков (главная, предмет, план): без этого при выборе KZ
    подписи остались бы русскими, хотя сам урок открывается на казахском.
    """
    for topic in topics:
        for lang in langs:
            path = os.path.join(ROOT, localized_path(topic["path"], lang))
            if not os.path.exists(path):
                continue
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, ValueError) as error:
                print(f"  ! {path}: {error}")
                continue
            suffix = lang.capitalize()
            if data.get("title"):
                topic[f"title{suffix}"] = data["title"]
            if data.get("summary"):
                topic[f"summary{suffix}"] = data["summary"]
    return topics


def main():
    manifest = build()
    # В манифест попадают только темы, для которых уже есть файл контента:
    # остальные — план на будущее (scripts/topic-order.json), сайт их не показывает.
    ready = [t for t in manifest["topics"] if os.path.exists(os.path.join(ROOT, t["path"]))]
    planned = [t for t in manifest["topics"] if t not in ready]
    with open(os.path.join(ROOT, "scripts", "topic-order.json"), "w", encoding="utf-8") as f:
        json.dump(manifest["topics"], f, ensure_ascii=False, indent=2)
    print(f"готово тем: {len(ready)}, в плане: {len(planned)}")
    manifest["topics"] = add_translations(ready)
    # Темы без файла тоже попадают в манифест (planned): страница «По классам» показывает
    # полную дорожную карту, а остальной сайт работает только с topics.
    manifest["planned"] = [{k: t[k] for k in PLANNED_FIELDS if k in t} for t in planned]
    os.makedirs(os.path.join(ROOT, "content"), exist_ok=True)
    for subject in SUBJECTS:
        os.makedirs(os.path.join(ROOT, "content", subject["id"]), exist_ok=True)
    with open(os.path.join(ROOT, "content", "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    topics = manifest["topics"]
    print("topics:", len(topics), dict(Counter(t["subject"] for t in topics)))
    for s in ("history", "mathlit", "reading", "math", "informatics"):
        print(s, "weight sum", sum(t["weight"] for t in topics if t["subject"] == s))


if __name__ == "__main__":
    main()
