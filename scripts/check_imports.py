# -*- coding: utf-8 -*-
"""Статическая проверка ES-модулей без Node: каждый именованный импорт должен существовать в целевом файле,
все относительные пути должны существовать, страницы из pages/index.js — присутствовать.

Запуск: python scripts/check_imports.py [файлы...]   (без аргументов — весь src/ и tests/)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT_RE = re.compile(r"import\s*(?:(\{[^}]*\})|(\*\s+as\s+\w+)|(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from\s*['\"]([^'\"]+)['\"]", re.S)
DYNAMIC_RE = re.compile(r"import\(\s*['\"]([^'\"]+)['\"]\s*\)")
EXPORT_RE = re.compile(r"^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)", re.M)
EXPORT_LIST_RE = re.compile(r"^\s*export\s*\{([^}]*)\}", re.M)


def js_files(paths):
    if paths:
        return [os.path.abspath(p) for p in paths]
    out = []
    for base in ("src", "tests"):
        for dirpath, _, files in os.walk(os.path.join(ROOT, base)):
            out.extend(os.path.join(dirpath, f) for f in files if f.endswith(".js"))
    return out


def exports_of(path, cache):
    if path in cache:
        return cache[path]
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        cache[path] = None
        return None
    names = set(EXPORT_RE.findall(text))
    for group in EXPORT_LIST_RE.findall(text):
        for item in group.split(","):
            item = item.strip()
            if not item:
                continue
            names.add(item.split(" as ")[-1].strip())
    cache[path] = names
    return names


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"^\s*//.*$", "", text, flags=re.M)


def check(path, cache):
    errors = []
    text = strip_comments(open(path, encoding="utf-8").read())
    base = os.path.dirname(path)
    for m in IMPORT_RE.finditer(text):
        named, star, default, named2, target = m.groups()
        if not target.startswith("."):
            continue
        target_path = os.path.normpath(os.path.join(base, target))
        exported = exports_of(target_path, cache)
        if exported is None:
            errors.append(f"нет файла {target} (из {os.path.relpath(path, ROOT)})")
            continue
        if default:
            errors.append(f"default-импорт «{default}» из {target}: модули используют только именованные экспорты")
        for group in (named, named2):
            if not group:
                continue
            for item in group.strip("{} \n").split(","):
                item = item.strip()
                if not item:
                    continue
                name = item.split(" as ")[0].strip()
                if name not in exported:
                    errors.append(f"«{name}» не экспортируется из {target} (импорт в {os.path.relpath(path, ROOT)})")
    for m in DYNAMIC_RE.finditer(text):
        target_path = os.path.normpath(os.path.join(base, m.group(1)))
        if not os.path.exists(target_path):
            errors.append(f"динамический импорт: нет файла {m.group(1)} (в {os.path.relpath(path, ROOT)})")
    if re.search(r"\bconsole\.log\(", text):
        errors.append(f"console.log в {os.path.relpath(path, ROOT)} — убери")
    return errors


def main(argv):
    cache = {}
    files = js_files(argv[1:])
    total = 0
    for path in files:
        if not os.path.exists(path):
            print(f"ERROR: нет файла {path}")
            total += 1
            continue
        errs = check(path, cache)
        for e in errs:
            print(f"ERROR: {e}")
        total += len(errs)
    print(f"Проверено файлов: {len(files)}, ошибок: {total}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
