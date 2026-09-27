# -*- coding: utf-8 -*-
"""Валидатор файлов контента Qadam.

Запуск:
  python scripts/validate_content.py                      # все темы из манифеста
  python scripts/validate_content.py content/math/x.json  # один или несколько файлов
Код выхода 1 — есть ошибки. Предупреждения не блокируют.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "content", "manifest.json")
TYPES = {"single", "multi", "match", "text"}
UBT = {"history", "mathlit", "reading", "math", "informatics"}
# Языковые предметы: single с 2–8 вариантами и вопросы с вводом ответа (text).
LANGUAGE = {"ielts", "english"}

# минимальные требования к числу вопросов по типам: (single, multi, match, contexts)
MINIMUMS = {
    ("math", "lesson"): (14, 4, 3, 1),
    ("informatics", "lesson"): (14, 4, 3, 1),
    ("history", "lesson"): (12, 0, 0, 1),
    ("mathlit", "lesson"): (15, 0, 0, 0),
    ("reading", "lesson"): (0, 0, 0, 3),
}


class Report:
    def __init__(self, path):
        self.path = path
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def check_markdown(value, where, rep):
    if not isinstance(value, str):
        rep.error(f"{where}: ожидается строка")
        return
    if not value.strip():
        rep.error(f"{where}: пустая строка")
    dollars = value.replace("\\$", "").count("$")
    if dollars % 2:
        rep.error(f"{where}: нечётное число символов $ — незакрытая формула")
    if "\\(" in value or "\\[" in value:
        rep.error(f"{where}: используй $...$ и $$...$$ вместо \\( \\) и \\[ \\]")
    if "<img" in value or "![" in value:
        rep.error(f"{where}: изображения не поддерживаются — опиши данные таблицей или словами")
    if re.search(r"<(div|span|table|br|p)\b", value):
        rep.warn(f"{where}: HTML-теги не рендерятся, используй markdown")


def check_question(q, i, rep, topic, subject):
    where = f"questions[{i}] ({q.get('id', '?')})"
    if not isinstance(q, dict):
        rep.error(f"{where}: не объект")
        return None
    qtype = q.get("type", "single")
    if qtype not in TYPES:
        rep.error(f"{where}: неизвестный type «{qtype}»")
        return None
    check_markdown(q.get("text", ""), f"{where}.text", rep)
    if not isinstance(q.get("explanation"), str) or len(q.get("explanation", "").strip()) < 10:
        rep.error(f"{where}: explanation обязателен (минимум одно предложение с решением)")
    else:
        check_markdown(q["explanation"], f"{where}.explanation", rep)
    diff = q.get("difficulty", 1)
    if diff not in (1, 2, 3):
        rep.error(f"{where}: difficulty должен быть 1, 2 или 3")
    options = q.get("options", [])
    answer = q.get("answer")
    if qtype in ("single", "multi", "match"):
        if not isinstance(options, list) or not all(isinstance(o, str) and o.strip() for o in options):
            rep.error(f"{where}: options — непустой список строк")
            return qtype
        for k, o in enumerate(options):
            check_markdown(o, f"{where}.options[{k}]", rep)
        if len(set(o.strip() for o in options)) != len(options):
            rep.error(f"{where}: одинаковые варианты ответа")
        if not isinstance(answer, list) or not all(isinstance(a, int) for a in answer):
            rep.error(f"{where}: answer — список целых индексов (с нуля)")
            return qtype
        if any(a < 0 or a >= len(options) for a in answer):
            rep.error(f"{where}: индекс в answer вне диапазона options")
            return qtype
    if qtype == "single":
        expected = 4
        if subject in LANGUAGE:
            if not (2 <= len(options) <= 8):
                rep.error(f"{where}: для английского и IELTS single допустимо 2–8 вариантов")
        elif len(options) != expected:
            rep.error(f"{where}: single в ЕНТ — ровно 4 варианта (A–D), сейчас {len(options)}")
        if len(answer) != 1:
            rep.error(f"{where}: у single ровно один верный ответ")
    elif qtype == "multi":
        if subject in UBT and len(options) != 6:
            rep.error(f"{where}: multi в ЕНТ — ровно 6 вариантов (A–F), сейчас {len(options)}")
        if not (1 <= len(answer) <= 3):
            rep.error(f"{where}: у multi 1–3 верных ответа, сейчас {len(answer)}")
        if len(set(answer)) != len(answer):
            rep.error(f"{where}: повторяющиеся индексы в answer")
    elif qtype == "match":
        rows = q.get("rows")
        if not isinstance(rows, list) or len(rows) != 2 or not all(isinstance(r, str) and r.strip() for r in rows):
            rep.error(f"{where}: match требует rows — ровно 2 строки (A и B)")
        if len(options) != 4:
            rep.error(f"{where}: match — ровно 4 общих варианта, сейчас {len(options)}")
        if len(answer) != 2 or len(set(answer)) != 2:
            rep.error(f"{where}: answer для match — 2 разных индекса: [для строки A, для строки B]")
    elif qtype == "text":
        if not isinstance(answer, list) or not answer or not all(isinstance(a, str) and a.strip() for a in answer):
            rep.error(f"{where}: text требует answer — непустой список строк")
        if subject in UBT:
            rep.error(f"{where}: тип text допустим только в IELTS")
    ctx = q.get("context")
    if ctx is not None and ctx not in {c.get("id") for c in topic.get("contexts", [])}:
        rep.error(f"{where}: context «{ctx}» не найден в contexts")
    why = q.get("why")
    if why is not None:
        if not isinstance(why, dict):
            rep.error(f"{where}: why — объект {{индекс: текст}}")
        else:
            for k in why:
                if not str(k).isdigit() or int(k) >= len(options):
                    rep.error(f"{where}: ключ why «{k}» не является индексом варианта")
    return qtype


def check_topic(path, meta, manifest_ids):
    rep = Report(path)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        rep.error("файл не найден")
        return rep
    except json.JSONDecodeError as e:
        rep.error(f"невалидный JSON: {e}")
        return rep
    if not isinstance(data, dict):
        rep.error("корень файла должен быть объектом")
        return rep
    expected_id = os.path.splitext(os.path.basename(path))[0]
    if data.get("id") != expected_id:
        rep.error(f"id «{data.get('id')}» не совпадает с именем файла «{expected_id}»")
    if meta and data.get("subject") != meta["subject"]:
        rep.error(f"subject «{data.get('subject')}» не совпадает с манифестом «{meta['subject']}»")
    if not isinstance(data.get("title"), str) or not data["title"].strip():
        rep.error("title обязателен")
    subject = data.get("subject") or (meta or {}).get("subject")
    kind = (meta or {}).get("kind", data.get("kind", "lesson"))
    skill = (meta or {}).get("skill")

    theory = data.get("theory", [])
    if not isinstance(theory, list) or not all(isinstance(t, str) for t in theory):
        rep.error("theory — список markdown-строк")
    else:
        for i, block in enumerate(theory):
            check_markdown(block, f"theory[{i}]", rep)
        words = sum(len(t.split()) for t in theory)
        if kind == "lesson" and words < 250:
            rep.warn(f"теория короткая: {words} слов (цель 400–900)")
        if words > 1600:
            rep.warn(f"теория длинная: {words} слов (цель ≤ 900)")

    for i, ctx in enumerate(data.get("contexts", [])):
        if not isinstance(ctx, dict) or not ctx.get("id") or not isinstance(ctx.get("text"), str):
            rep.error(f"contexts[{i}]: нужны id и text")
        else:
            check_markdown(ctx["text"], f"contexts[{i}].text", rep)
    ctx_ids = [c.get("id") for c in data.get("contexts", []) if isinstance(c, dict)]
    if len(set(ctx_ids)) != len(ctx_ids):
        rep.error("повторяющиеся id контекстов")

    for i, card in enumerate(data.get("cards", [])):
        if not isinstance(card, dict) or not card.get("front") or not card.get("back"):
            rep.error(f"cards[{i}]: нужны front и back")

    questions = data.get("questions", [])
    if not isinstance(questions, list):
        rep.error("questions — список")
        questions = []
    ids = [q.get("id") for q in questions if isinstance(q, dict)]
    if len(set(ids)) != len(ids) or any(not i for i in ids):
        rep.error("id вопросов должны быть уникальными и непустыми")
    counts = {"single": 0, "multi": 0, "match": 0, "text": 0}
    for i, q in enumerate(questions):
        qtype = check_question(q, i, rep, data, subject)
        if qtype:
            counts[qtype] += 1
    used_contexts = {q.get("context") for q in questions if isinstance(q, dict) and q.get("context")}
    for cid in ctx_ids:
        n = sum(1 for q in questions if isinstance(q, dict) and q.get("context") == cid)
        if n == 0:
            rep.warn(f"контекст «{cid}» без вопросов")
    single_min, multi_min, match_min, ctx_min = MINIMUMS.get((subject, kind), (0, 0, 0, 0))
    plain_single = sum(1 for q in questions if isinstance(q, dict) and q.get("type", "single") == "single" and not q.get("context"))
    if kind == "lesson" and subject in UBT:
        if plain_single < single_min:
            rep.error(f"мало одиночных вопросов без контекста: {plain_single} (нужно ≥ {single_min})")
        if counts["multi"] < multi_min:
            rep.error(f"мало multi: {counts['multi']} (нужно ≥ {multi_min})")
        if counts["match"] < match_min:
            rep.error(f"мало match: {counts['match']} (нужно ≥ {match_min})")
        if len(ctx_ids) < ctx_min:
            rep.error(f"мало контекстов: {len(ctx_ids)} (нужно ≥ {ctx_min})")
        diffs = [q.get("difficulty", 1) for q in questions if isinstance(q, dict)]
        if diffs and diffs.count(3) == 0:
            rep.warn("нет вопросов сложности 3 (уровень C — 20 % теста)")
    if kind == "lesson" and subject in LANGUAGE and skill in ("reading", "listening", "grammar") and len(questions) < 10:
        rep.error(f"мало вопросов: {len(questions)} (нужно ≥ 10)")
    if skill == "reading":
        passage = data.get("passage", "")
        n = len(passage.split()) if isinstance(passage, str) else 0
        if n < 550:
            rep.error(f"passage короткий: {n} слов (нужно 650–900)")
    if skill == "listening":
        tr = data.get("transcript", "")
        n = len(tr.split()) if isinstance(tr, str) else 0
        if n < 350:
            rep.error(f"transcript короткий: {n} слов (нужно 450–750)")
    if kind == "vocab":
        words = data.get("words", [])
        if len(words) < 20:
            rep.error(f"мало слов: {len(words)} (нужно 20)")
        for i, w in enumerate(words):
            for key in ("id", "word", "pos", "ru", "def", "example"):
                if not isinstance(w, dict) or not w.get(key):
                    rep.error(f"words[{i}]: нет поля {key}")
        wids = [w.get("id") for w in words if isinstance(w, dict)]
        if len(set(wids)) != len(wids):
            rep.error("id слов должны быть уникальными")
    if kind in ("writing", "speaking"):
        prompts = data.get("prompts", [])
        if len(prompts) < 2:
            rep.error(f"мало prompts: {len(prompts)} (нужно ≥ 2)")
        for i, p in enumerate(prompts):
            if not isinstance(p, dict) or not p.get("id"):
                rep.error(f"prompts[{i}]: нужен id")
                continue
            if kind == "writing":
                for key in ("task", "title", "prompt", "minWords", "minutes", "samples"):
                    if key not in p:
                        rep.error(f"prompts[{i}]: нет поля {key}")
                for j, s in enumerate(p.get("samples", [])):
                    if not isinstance(s, dict) or "band" not in s or not s.get("text"):
                        rep.error(f"prompts[{i}].samples[{j}]: нужны band и text")
                    elif len(s["text"].split()) < (120 if p.get("task") == 1 else 220):
                        rep.warn(f"prompts[{i}].samples[{j}]: образец короче нормы слов")
            if kind == "speaking":
                if p.get("part") not in (1, 2, 3):
                    rep.error(f"prompts[{i}]: part должен быть 1, 2 или 3")
                if p.get("part") == 2 and (not p.get("bullets") or not p.get("model")):
                    rep.error(f"prompts[{i}]: cue card требует bullets и model")
                if p.get("part") in (1, 3) and not p.get("questions"):
                    rep.error(f"prompts[{i}]: нужен список questions")
    return rep


def main(argv):
    manifest = load_manifest()
    by_path = {os.path.normpath(os.path.join(ROOT, t["path"])): t for t in manifest["topics"]}
    if len(argv) > 1:
        paths = [os.path.normpath(os.path.abspath(p)) for p in argv[1:]]
    else:
        paths = list(by_path.keys())
    total_errors = 0
    total_q = 0
    for path in paths:
        meta = by_path.get(path)
        if meta is None and not os.path.exists(path):
            print(f"[SKIP] {path}: не в манифесте и не существует")
            continue
        rep = check_topic(path, meta, set(by_path))
        try:
            with open(path, encoding="utf-8") as f:
                total_q += len(json.load(f).get("questions", []))
        except Exception:
            pass
        rel = os.path.relpath(path, ROOT)
        if rep.errors or rep.warnings:
            print(f"== {rel}")
            for e in rep.errors:
                print(f"  ERROR: {e}")
            for w in rep.warnings:
                print(f"  warn:  {w}")
        else:
            print(f"[OK] {rel}")
        total_errors += len(rep.errors)
    print(f"\nФайлов: {len(paths)}, вопросов: {total_q}, ошибок: {total_errors}")
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
