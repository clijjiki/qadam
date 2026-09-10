// Хэш-роутер: #/topic/math-01?tab=practice

const routes = [];
const listeners = new Set();

function compile(pattern) {
  const keys = [];
  const regexSource = pattern
    .replace(/\/+$/, '')
    .replace(/:([a-zA-Z_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${regexSource}/?$`), keys };
}

export function addRoute(pattern, handler) {
  const { regex, keys } = compile(pattern);
  routes.push({ pattern, regex, keys, handler });
}

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = Object.fromEntries(new URLSearchParams(queryPart).entries());
  return { path, query };
}

export function matchRoute(path) {
  for (const route of routes) {
    const match = route.regex.exec(path);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1]);
    });
    return { route, params };
  }
  return null;
}

export function currentRoute() {
  const { path, query } = parseHash();
  const matched = matchRoute(path);
  return { path, query, params: matched?.params || {}, route: matched?.route || null };
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', url);
    dispatch();
  } else {
    window.location.hash = target;
  }
}

export function onRoute(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dispatch() {
  const info = currentRoute();
  for (const listener of listeners) listener(info);
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

export function buildQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}
