# -*- coding: utf-8 -*-
"""Сверяет казахские версии тем (content/kk/...) с русскими оригиналами.

Перевод обязан повторять структуру оригинала: те же id вопросов, типы, сложность, ответы,
число и порядок вариантов, те же формулы и код. Иначе прогресс и разбор разъедутся между языками.

Запуск:
  python scripts/check_translations.py                           # все файлы в content/kk
  python scripts/check_translations.py content/kk/math/x.json    # один или несколько файлов
Код выхода 1 — есть ошибки. Предупреждения не блокируют.
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = "kk"
KK_ROOT = os.path.join(ROOT, "content", LANG)
MANIFEST = os.path.join(ROOT, "content", "manifest.json")

FORMULA_RE = re.compile(r"\$\$.+?\$\$|\$[^$]+\$", re.S)
CODE_BLOCK_RE = re.compile(r"```.*?```", re.S)
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
CALLOUT_RE = re.compile(r"^:::(\w+)", re.M)
CYRILLIC_RE = re.compile(r"[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]")
# Слово из трёх и более кириллических букв: «тг», «с», «м» и подобные единицы не считаются текстом.
WORD_RE = re.compile(r"[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]{3,}")
# Поля слова, которые остаются английскими и обязаны совпасть с оригиналом.
WORD_FIXED = ("id", "word", "pos", "ipa", "def", "example", "collocations")
# Поля вопроса, которые перевод не меняет.
QUESTION_FIXED = ("id", "type", "difficulty", "context", "noShuffle", "maxWords", "tags")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def source_path(kk_path):
    """content/kk/math/x.json -> content/math/x.json"""
    rel = os.path.relpath(kk_path, KK_ROOT)
    return os.path.join(ROOT, "content", rel)


def table_rows(text):
    return sum(1 for line in text.splitlines() if line.strip().startswith("|"))


def without_code(text):
    return CODE_BLOCK_RE.sub("", text)


def untranslated(ru, kk):
    """Текст совпал с русским и в нём есть хотя бы два слова — скорее всего, его забыли перевести."""
    return ru == kk and len(WORD_RE.findall(without_code(ru))) >= 2


def compare_text(ru, kk, where, rep):
    """Сверяет пару строк «оригинал — перевод»: код, таблицы, callout-блоки — строго, формулы — предупреждением."""
    if not isinstance(ru, str) or not isinstance(kk, str):
        if type(ru) is not type(kk):
            rep.error(f"{where}: тип значения отличается от оригинала")
        return
    if CODE_BLOCK_RE.findall(ru) != CODE_BLOCK_RE.findall(kk):
        rep.error(f"{where}: блоки кода ``` отличаются от оригинала (код не переводится)")
    ru_plain, kk_plain = without_code(ru), without_code(kk)
    if CALLOUT_RE.findall(ru) != CALLOUT_RE.findall(kk):
        rep.error(f"{where}: callout-блоки (:::tip / :::warn / …) отличаются от оригинала")
    if table_rows(ru_plain) != table_rows(kk_plain):
        rep.error(f"{where}: число строк таблиц отличается ({table_rows(ru_plain)} → {table_rows(kk_plain)})")
    if sorted(FORMULA_RE.findall(ru_plain)) != sorted(FORMULA_RE.findall(kk_plain)):
        lost = sorted(set(FORMULA_RE.findall(ru_plain)) - set(FORMULA_RE.findall(kk_plain)))
        rep.warn(f"{where}: формулы отличаются от оригинала, проверь: {', '.join(lost[:3]) or 'добавлены новые'}")
    if sorted(INLINE_CODE_RE.findall(ru_plain)) != sorted(INLINE_CODE_RE.findall(kk_plain)):
        rep.warn(f"{where}: фрагменты `кода` отличаются от оригинала")
    if not CYRILLIC_RE.search(ru) and ru != kk:
        rep.warn(f"{where}: в оригинале нет текста для перевода, а значение изменено: «{ru}» → «{kk}»")
    if untranslated(ru, kk):
        rep.warn(f"{where}: текст совпадает с русским — похоже, не переведён")


def compare_list(ru, kk, where, rep):
    """Список строк одинаковой длины: сверяем попарно."""
    ru, kk = ru or [], kk or []
    if len(ru) != len(kk):
        rep.error(f"{where}: {len(kk)} элементов, в оригинале {len(ru)}")
        return
    for i, (a, b) in enumerate(zip(ru, kk)):
        compare_text(a, b, f"{where}[{i}]", rep)


def compare_question(ru, kk, where, rep):
    for key in QUESTION_FIXED:
        if ru.get(key) != kk.get(key):
            rep.error(f"{where}: поле {key} отличается от оригинала ({ru.get(key)!r} → {kk.get(key)!r})")
    qtype = ru.get("type", "single")
    if qtype == "text":
        # Ответ вводится по-английски — ответы и допустимые варианты не переводятся.
        for key in ("answer", "accept"):
            if ru.get(key) != kk.get(key):
                rep.error(f"{where}: {key} у вопроса с вводом ответа должен совпадать с оригиналом")
    elif ru.get("answer") != kk.get("answer"):
        rep.error(f"{where}: answer отличается от оригинала ({ru.get('answer')} → {kk.get('answer')})")
    compare_text(ru.get("text"), kk.get("text"), f"{where}.text", rep)
    compare_text(ru.get("explanation"), kk.get("explanation"), f"{where}.explanation", rep)
    compare_list(ru.get("options"), kk.get("options"), f"{where}.options", rep)
    compare_list(ru.get("rows"), kk.get("rows"), f"{where}.rows", rep)
    ru_why, kk_why = ru.get("why") or {}, kk.get("why") or {}
    if sorted(map(str, ru_why)) != sorted(map(str, kk_why)):
        rep.error(f"{where}: ключи why отличаются от оригинала")
    else:
        for key in ru_why:
            compare_text(ru_why[key], kk_why.get(key, kk_why.get(str(key))), f"{where}.why[{key}]", rep)


def compare_keyed(ru_items, kk_items, where, rep, fields):
    """Списки объектов с id (контексты, слова, задания): тот же порядок id, сверяем текстовые поля."""
    ru_items, kk_items = ru_items or [], kk_items or []
    ru_ids = [x.get("id") for x in ru_items]
    kk_ids = [x.get("id") for x in kk_items]
    if ru_ids != kk_ids:
        rep.error(f"{where}: id и их порядок отличаются от оригинала")
        return
    for a, b in zip(ru_items, kk_items):
        for field in fields:
            if field in a or field in b:
                compare_value(a.get(field), b.get(field), f"{where}[{a.get('id')}].{field}", rep)


def compare_value(ru, kk, where, rep):
    """Рекурсивная сверка: строки — как текст, списки и объекты — по элементам."""
    if isinstance(ru, str):
        compare_text(ru, kk, where, rep)
    elif isinstance(ru, list):
        if not isinstance(kk, list) or len(ru) != len(kk):
            rep.error(f"{where}: список отличается длиной от оригинала")
            return
        for i, (a, b) in enumerate(zip(ru, kk)):
            compare_value(a, b, f"{where}[{i}]", rep)
    elif isinstance(ru, dict):
        if not isinstance(kk, dict) or sorted(ru) != sorted(kk):
            rep.error(f"{where}: набор полей отличается от оригинала")
            return
        for key in ru:
            compare_value(ru[key], kk[key], f"{where}.{key}", rep)
    elif ru != kk:
        rep.error(f"{where}: значение отличается от оригинала ({ru!r} → {kk!r})")


def compare_words(ru_words, kk_words, rep):
    ru_words, kk_words = ru_words or [], kk_words or []
    if [w.get("id") for w in ru_words] != [w.get("id") for w in kk_words]:
        rep.error("words: id слов и их порядок отличаются от оригинала")
        return
    for a, b in zip(ru_words, kk_words):
        for key in WORD_FIXED:
            if a.get(key) != b.get(key):
                rep.error(f"words[{a.get('id')}].{key}: английская часть слова должна совпадать с оригиналом")
        # Поле ru в казахском файле хранит перевод слова на казахский (имя поля общее для обоих языков).
        if not isinstance(b.get("ru"), str) or not b["ru"].strip():
            rep.error(f"words[{a.get('id')}].ru: нужен перевод слова на казахский")


def check_file(kk_path):
    rep = Report()
    ru_path = source_path(kk_path)
    if not os.path.exists(ru_path):
        rep.error(f"нет русского оригинала {os.path.relpath(ru_path, ROOT)}")
        return rep
    try:
        ru, kk = load(ru_path), load(kk_path)
    except (OSError, ValueError) as error:
        rep.error(f"не удалось прочитать JSON: {error}")
        return rep
    for key in ("id", "subject", "kind"):
        if ru.get(key) != kk.get(key):
            rep.error(f"{key} отличается от оригинала ({ru.get(key)!r} → {kk.get(key)!r})")
    extra = sorted(set(kk) - set(ru))
    missing = sorted(set(ru) - set(kk))
    if extra or missing:
        rep.error(f"набор полей отличается от оригинала: лишние {extra}, нет {missing}")
    for key in ("title", "summary"):
        if key in ru:
            compare_text(ru.get(key), kk.get(key), key, rep)
    compare_list(ru.get("theory"), kk.get("theory"), "theory", rep)
    ru_cards, kk_cards = ru.get("cards") or [], kk.get("cards") or []
    if len(ru_cards) != len(kk_cards):
        rep.error(f"cards: {len(kk_cards)} карточек, в оригинале {len(ru_cards)}")
    else:
        for i, (a, b) in enumerate(zip(ru_cards, kk_cards)):
            compare_text(a.get("front"), b.get("front"), f"cards[{i}].front", rep)
            compare_text(a.get("back"), b.get("back"), f"cards[{i}].back", rep)
    compare_keyed(ru.get("contexts"), kk.get("contexts"), "contexts", rep, ("title", "text"))
    ru_q, kk_q = ru.get("questions") or [], kk.get("questions") or []
    if [q.get("id") for q in ru_q] != [q.get("id") for q in kk_q]:
        rep.error("questions: id вопросов и их порядок отличаются от оригинала")
    else:
        for a, b in zip(ru_q, kk_q):
            compare_question(a, b, f"questions[{a.get('id')}]", rep)
    compare_words(ru.get("words"), kk.get("words"), rep)
    for key in ("passage", "transcript"):
        if ru.get(key) != kk.get(key):
            rep.error(f"{key}: английский текст должен совпадать с оригиналом")
    ru_prompts, kk_prompts = ru.get("prompts") or [], kk.get("prompts") or []
    if [p.get("id") for p in ru_prompts] != [p.get("id") for p in kk_prompts]:
        rep.error("prompts: id заданий и их порядок отличаются от оригинала")
    return rep


def all_translations():
    out = []
    for dirpath, _, files in os.walk(KK_ROOT):
        out.extend(os.path.join(dirpath, f) for f in sorted(files) if f.endswith(".json"))
    return sorted(out)


def coverage():
    """Сколько тем каждого предмета уже переведено — по манифесту."""
    try:
        topics = load(MANIFEST)["topics"]
    except (OSError, ValueError, KeyError):
        return
    by_subject = {}
    for topic in topics:
        done, total = by_subject.get(topic["subject"], (0, 0))
        has = os.path.exists(os.path.join(ROOT, topic["path"].replace("content/", f"content/{LANG}/", 1)))
        by_subject[topic["subject"]] = (done + (1 if has else 0), total + 1)
    print("\nПереведено тем: " + ", ".join(f"{s} {d}/{t}" for s, (d, t) in by_subject.items()))


def main(argv):
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    paths = [os.path.abspath(p) for p in argv[1:]] or all_translations()
    total_errors = 0
    for path in paths:
        rel = os.path.relpath(path, ROOT)
        if not os.path.exists(path):
            print(f"== {rel}\n  ERROR: файл не найден")
            total_errors += 1
            continue
        rep = check_file(path)
        if rep.errors or rep.warnings:
            print(f"== {rel}")
            for e in rep.errors:
                print(f"  ERROR: {e}")
            for w in rep.warnings:
                print(f"  warn:  {w}")
        else:
            print(f"[OK] {rel}")
        total_errors += len(rep.errors)
    print(f"\nФайлов: {len(paths)}, ошибок: {total_errors}")
    if len(argv) <= 1:
        coverage()
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
