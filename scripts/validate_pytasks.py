"""Проверка задач тренажёра Python: python scripts/validate_pytasks.py

Для каждой задачи: обязательные поля, уникальный id, эталонное решение проходит все тесты,
а заготовка (starter) — не проходит (иначе задача решается без работы).
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TASKS = ROOT / "content" / "python" / "tasks.json"
REQUIRED = ("id", "title", "level", "text", "starter", "solution", "tests", "hint")


def run(code, stdin):
    try:
        # -X utf8: иначе на Windows дочерний процесс пишет в cp1251 и кириллица в тестах «не совпадает».
        # Таймаут строже, чем 4 с в браузере: Pyodide медленнее CPython.
        proc = subprocess.run([sys.executable, "-X", "utf8", "-c", code], input=stdin, capture_output=True,
                              text=True, encoding="utf-8", timeout=1)
    except subprocess.TimeoutExpired:
        return None
    return proc.stdout if proc.returncode == 0 else None


def normalize(text):
    lines = (text or "").replace("\r\n", "\n").split("\n")
    return "\n".join(line.rstrip(" \t") for line in lines).rstrip("\n")


def passes(code, tests):
    for test in tests:
        out = run(code, test["input"])
        if out is None or normalize(out) != normalize(test["output"]):
            return False
    return True


def check_task(task, seen):
    errors = [f"нет поля {key}" for key in REQUIRED if key not in task]
    if errors:
        return errors
    if task["id"] in seen:
        errors.append("повторяющийся id")
    seen.add(task["id"])
    if task["level"] not in (1, 2, 3):
        errors.append("level должен быть 1, 2 или 3")
    bad_tests = [i for i, t in enumerate(task["tests"])
                 if not isinstance(t.get("input"), str) or not isinstance(t.get("output"), str)
                 or (t["input"] and not t["input"].endswith("\n"))]
    if not task["tests"]:
        errors.append("нет тестов")
    elif bad_tests:
        errors.append(f"тесты {bad_tests}: нужны строки input и output, непустой input заканчивается переводом строки")
    elif not passes(task["solution"], task["tests"]):
        errors.append("эталонное решение не проходит тесты")
    elif passes(task["starter"], task["tests"]):
        errors.append("заготовка уже проходит тесты")
    return errors


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.loads(TASKS.read_text(encoding="utf-8"))
    seen = set()
    failed = 0
    for unit in data["units"]:
        for task in unit["tasks"]:
            errors = check_task(task, seen)
            if errors:
                failed += 1
                print(f"[ERROR] {unit['id']}/{task.get('id')}: {'; '.join(errors)}")
    total = len(seen)
    print(f"[OK] {total} задач" if not failed else f"Ошибок в задачах: {failed} из {total}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
