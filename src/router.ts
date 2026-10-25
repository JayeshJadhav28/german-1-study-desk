/** Hash-based router: #/path/param?query=… */

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
  /** Route params (e.g. /week/:n → { n: '3' }). Empty object on static routes. */
  params: Record<string, string>;
}

type RouteHandler = (route: Route) => void | Promise<void>;

const handlers: { pattern: string; fn: RouteHandler }[] = [];
let notFound: RouteHandler = () => {};

export function route(pattern: string, fn: RouteHandler): void {
  handlers.push({ pattern, fn });
}

export function setNotFound(fn: RouteHandler): void {
  notFound = fn;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = h.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { path: pathPart || '/', parts, query: new URLSearchParams(queryPart || ''), params: {} };
}

export function navigate(to: string): void {
  if (!to.startsWith('#')) to = `#${to}`;
  if (location.hash === to) dispatch();
  else location.hash = to;
}

/**
 * Params captured for the route currently being rendered. Pages read this via
 * currentRoute().params. It is set by dispatch() before the page handler runs.
 */
let lastParams: Record<string, string> = {};

/**
 * Monotonic dispatch counter. Slow pages capture this before an await and bail
 * out after the await if a newer navigation has started, so a late resume never
 * overwrites the current page's content or breadcrumbs.
 */
let dispatchSeq = 0;

export function routeToken(): number {
  return dispatchSeq;
}

export function currentRoute(): Route {
  return { ...parseHash(location.hash), params: lastParams };
}

export function hrefFor(path: string, query?: Record<string, string>): string {
  const q = query ? `?${new URLSearchParams(query).toString()}` : '';
  return `#${path}${q}`;
}

function match(pattern: string, parts: string[]): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i += 1) {
    const seg = pp[i];
    if (seg === '*') {
      params['*'] = parts.slice(i).join('/');
      return params;
    }
    if (i >= parts.length) return null;
    if (seg.startsWith(':')) params[seg.slice(1)] = parts[i];
    else if (seg !== parts[i]) return null;
  }
  return pp.length === parts.length ? params : null;
}

export async function dispatch(): Promise<void> {
  dispatchSeq += 1;
  const r = parseHash(location.hash);
  for (const h of handlers) {
    const params = match(h.pattern, r.parts);
    if (params) {
      lastParams = params;
      await h.fn({ ...r, params });
      return;
    }
  }
  lastParams = {};
  await notFound({ ...r, params: {} });
}

export function startRouter(): void {
  window.addEventListener('hashchange', () => { void dispatch(); });
  void dispatch();
}
