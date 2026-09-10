// Аудиоплеер на Web Speech API: озвучивает английский текст (IELTS Listening) без сервера и файлов.

import { h, replaceChildren } from '../core/dom.js';

const MAX_CHUNK = 220;

function splitSentences(text) {
  const clean = String(text || '')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]?\s*|[^.!?]+$/g) || [clean];
  const chunks = [];
  let buffer = '';
  for (const part of parts) {
    if ((buffer + part).length > MAX_CHUNK && buffer) {
      chunks.push(buffer.trim());
      buffer = part;
    } else buffer += part;
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

function pickVoice(lang) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const exact = voices.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase());
  const family = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pool = exact.length ? exact : family;
  return pool.find((v) => /google|natural|neural|online/i.test(v.name)) || pool[0] || null;
}

/**
 * createPlayer({ text, lang }) → { element, stop }.
 * Кнопки: слушать / пауза / стоп, скорость 0.85–1.1. Транскрипт не показывается — это задача страницы.
 */
export function createPlayer({ text, lang = 'en-GB', label = 'Аудио' } = {}) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const status = h('span', { class: 'player__status' }, supported ? 'Готово к прослушиванию' : 'Браузер не поддерживает озвучку');
  const rate = h('select', { class: 'input', style: { width: 'auto' } }, [0.85, 1, 1.1].map((r) => h('option', { value: String(r), selected: r === 1 }, `${r}×`)));
  const chunks = splitSentences(text);
  let index = 0;
  let playing = false;
  let paused = false;

  function setStatus(message) {
    status.textContent = message;
  }

  function speakNext() {
    if (!playing || index >= chunks.length) {
      playing = false;
      setStatus(index >= chunks.length ? 'Запись закончилась' : 'Остановлено');
      index = 0;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = lang;
    utterance.rate = Number(rate.value) || 1;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      index += 1;
      setStatus(`Часть ${Math.min(index + 1, chunks.length)} из ${chunks.length}`);
      speakNext();
    };
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      console.error('Ошибка озвучки:', event.error);
      playing = false;
      setStatus('Ошибка озвучки — попробуй другой браузер (Chrome/Edge)');
    };
    window.speechSynthesis.speak(utterance);
  }

  function play() {
    if (!supported) return;
    if (paused) {
      window.speechSynthesis.resume();
      paused = false;
      setStatus('Играет…');
      return;
    }
    if (playing) return;
    window.speechSynthesis.cancel();
    playing = true;
    setStatus(`Часть 1 из ${chunks.length}`);
    speakNext();
  }

  function pause() {
    if (!supported || !playing) return;
    window.speechSynthesis.pause();
    paused = true;
    setStatus('Пауза');
  }

  function stop() {
    if (!supported) return;
    playing = false;
    paused = false;
    index = 0;
    window.speechSynthesis.cancel();
    setStatus('Остановлено');
  }

  if (supported && window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', () => setStatus('Готово к прослушиванию'), { once: true });
  }

  const element = h(
    'div',
    { class: 'player' },
    h('b', {}, `🎧 ${label}`),
    h('button', { class: 'btn btn--primary btn--sm', onClick: play, disabled: !supported }, '▶ Слушать'),
    h('button', { class: 'btn btn--sm', onClick: pause, disabled: !supported }, '⏸ Пауза'),
    h('button', { class: 'btn btn--sm', onClick: stop, disabled: !supported }, '⏹ Стоп'),
    rate,
    status,
  );
  return { element, stop, replaceStatus: (node) => replaceChildren(status, node) };
}
