// Загрузка KaTeX с CDN (не блокирует запуск) и рендер формул в элементах [data-tex].

import { esc } from './dom.js';

const KATEX_JS = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js';
let loadPromise = null;
const readyListeners = new Set();

export function isKatexReady() {
  return typeof window !== 'undefined' && !!window.katex;
}

export function loadKatex() {
  if (isKatexReady()) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = KATEX_JS;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      for (const listener of readyListeners) listener();
      resolve(true);
    };
    script.onerror = () => {
      console.error('KaTeX не загрузился — формулы показаны как текст (нет интернета?)');
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function onKatexReady(listener) {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/** Рендерит все формулы внутри root. Безопасно вызывать несколько раз. */
export function mountMath(root = document) {
  const nodes = root.querySelectorAll('[data-tex]:not([data-rendered])');
  if (!nodes.length) return;
  const katex = window.katex;
  for (const el of nodes) {
    const tex = el.dataset.tex || '';
    const display = el.dataset.display === '1';
    if (katex) {
      try {
        katex.render(tex, el, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false });
        el.setAttribute('data-rendered', '1');
      } catch (error) {
        el.innerHTML = `<span class="tex-error" title="${esc(String(error))}">${esc(tex)}</span>`;
        el.setAttribute('data-rendered', '1');
      }
    } else {
      el.innerHTML = `<span class="tex-fallback">${esc(tex)}</span>`;
    }
  }
}
