import type { Fetcher, ExecutionContext, ExportedHandler } from '@cloudflare/workers-types';
import { VisitorCounter } from './counter-do';

export interface Env {
  ASSETS: Fetcher;
  VISITOR_COUNTER: any;
}

export { VisitorCounter };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_REGEX.test(v);
}

const handler: ExportedHandler<Env> = {
  // @ts-ignore - Request type compatibility between standard and CF types
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/visitor/')) {
      return handleVisitorApi(request, env);
    }

    // @ts-ignore - ASSETS.fetch compatibility
    return env.ASSETS.fetch(request);
  },
};

export default handler;

async function handleVisitorApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/visitor', '') || '/';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
  };

  const origin = request.headers.get('Origin');
  const sameOrigin = origin === null || origin === url.origin;

  if (!sameOrigin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (path === '/heartbeat' && request.method === 'POST') {
      return handleHeartbeat(request, env, headers);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
}

async function handleHeartbeat(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const contentType = request.headers.get('Content-Type');
  console.log('[Worker] Content-Type:', contentType);
  if (!contentType?.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Invalid content type' }), { status: 400, headers });
  }

  let payload: unknown;
  try {
    const text = await request.text();
    console.log('[Worker] Request body length:', text.length);
    console.log('[Worker] Request body:', text);
    if (text.length > 1024) throw new Error('Payload too large');
    payload = JSON.parse(text);
  } catch (e) {
    console.error('[Worker] JSON parse error:', e);
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  if (!payload || typeof payload !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers });
  }

  const { profileId, visitId } = payload as { profileId?: string; visitId?: string };

  if (!isValidUuid(profileId) || !isValidUuid(visitId)) {
    return new Response(JSON.stringify({ error: 'Invalid ID format' }), { status: 400, headers });
  }

  const id = env.VISITOR_COUNTER.idFromName('global-counter');
  const stub = env.VISITOR_COUNTER.get(id);

  try {
    const response = await stub.fetch('http://internal/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, visitId }),
    });

    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) headers['Retry-After'] = retryAfter;

      const errorMsg = response.status === 429
        ? 'Rate limited'
        : response.status >= 500
          ? 'Counter service temporarily unavailable'
          : 'Counter error';

      return new Response(JSON.stringify({ error: errorMsg }), { status: response.status, headers });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (e) {
    console.error('[VisitorCounter] DO fetch failed:', e);
    return new Response(JSON.stringify({ error: 'Counter service unavailable' }), { status: 503, headers });
  }
}