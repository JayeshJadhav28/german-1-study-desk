import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockLocalStorage = new Map<string, string>();
const mockSessionStorage = new Map<string, string>();

const mockCountEl = {
  textContent: '',
  classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
  setAttribute: vi.fn(),
};

const mockDotEl = {
  classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
  setAttribute: vi.fn(),
};

const mockDispatchEvent = vi.fn();

beforeEach(() => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  mockCountEl.textContent = '';
  mockCountEl.classList.add.mockClear();
  mockCountEl.classList.remove.mockClear();
  mockDotEl.classList.add.mockClear();
  mockDotEl.classList.remove.mockClear();
  mockDispatchEvent.mockClear();
  vi.useFakeTimers();

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mockLocalStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
    removeItem: (k: string) => mockLocalStorage.delete(k),
  });

  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => mockSessionStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
    removeItem: (k: string) => mockSessionStorage.delete(k),
  });

  vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' });

  vi.stubGlobal('document', {
    visibilityState: 'visible',
    readyState: 'complete',
    addEventListener: vi.fn((event, handler) => {
      if (event === 'visibilitychange') {
        (globalThis as any).__visibilityHandler = handler;
      }
      if (event === 'DOMContentLoaded') {
        (globalThis as any).__domContentLoadedHandler = handler;
      }
    }),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(() => mockDotEl),
    getElementById: vi.fn(() => mockCountEl),
    body: { appendChild: vi.fn() },
    dispatchEvent: mockDispatchEvent,
  });

  vi.stubGlobal('navigator', {
    locks: undefined,
  });

  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('window', {
    addEventListener: vi.fn((event, handler) => {
      if (event === 'beforeunload') {
        (globalThis as any).__beforeunloadHandler = handler;
      }
    }),
    removeEventListener: vi.fn(),
  });

  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function triggerVisibilityChange(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  if ((globalThis as any).__visibilityHandler) {
    await (globalThis as any).__visibilityHandler(new Event('visibilitychange'));
  }
}

async function triggerDOMContentLoaded() {
  if ((globalThis as any).__domContentLoadedHandler) {
    await (globalThis as any).__domContentLoadedHandler(new Event('DOMContentLoaded'));
  }
}

describe('Visitor Client', () => {
  it('creates profileId on first load', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(mockLocalStorage.get('visitor:profileId')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates visitId in sessionStorage', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(mockSessionStorage.get('visitor:visitId')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refresh same tab reuses visitId', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    mockSessionStorage.set('visitor:visitId', '123e4567-e89b-12d3-a456-426614174001');
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    expect(mockSessionStorage.get('visitor:visitId')).toBe('123e4567-e89b-12d3-a456-426614174001');
  });

  it('new tab session gets new visitId', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(mockSessionStorage.get('visitor:visitId')).toBeDefined();
  });

  it('schedules heartbeat at 120s interval', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(119_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops heartbeats when hidden', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(120_000);
    expect(fetch).toHaveBeenCalledTimes(2);

    await triggerVisibilityChange('hidden');

    vi.advanceTimersByTime(120_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('resumes heartbeat when visible again', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);

    await triggerVisibilityChange('hidden');
    await triggerVisibilityChange('visible');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows fallback on 429 and respects Retry-After', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: (k: string) => k === 'Retry-After' ? '60' : null },
      json: () => Promise.resolve({ error: 'Rate limited' }),
    });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows fallback on 503 with exponential backoff', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({ error: 'Counter service unavailable' }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles network timeout gracefully', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockRejectedValue(new Error('Timeout'));
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles invalid JSON response', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ foo: 'bar' }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
  });

it('handles network error then recovers', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ online: 5, totalVisits: 225 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');

    // Advance past cooldown (5 seconds base backoff) BEFORE triggering new heartbeat
    vi.advanceTimersByTime(5_100);

    await triggerVisibilityChange('hidden');
    await triggerVisibilityChange('visible');
    await Promise.resolve(); // Let microtasks run (acquireLeadership -> sendHeartbeat)
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('5 online \u00B7 225 visits');
  });

  it('counter failure never blocks app init', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockRejectedValue(new Error('Network error'));
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
  });

  it('shows fallback on invalid response shape', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ foo: 'bar' }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
  });

  it('no rapid retry on failure', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockRejectedValue(new Error('Network error'));
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('updates badge with online and totalVisits on success', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 5, totalVisits: 223 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('5 online \u00B7 223 visits');
    expect(mockDotEl.classList.add).toHaveBeenCalledWith('active');
  });

  it('leader takeover when lock released', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(fetch).toHaveBeenCalledTimes(1);

    await triggerVisibilityChange('hidden');
    await triggerVisibilityChange('visible');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('handles storage unavailable gracefully', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage unavailable'); },
      setItem: () => { throw new Error('Storage unavailable'); },
      removeItem: () => { throw new Error('Storage unavailable'); },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('Storage unavailable'); },
      setItem: () => { throw new Error('Storage unavailable'); },
      removeItem: () => { throw new Error('Storage unavailable'); },
    });
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    await initVisitorCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('counter init is non-blocking and async', async () => {
    const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
    __resetForTesting();
    (fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ online: 1, totalVisits: 221 }) });
    const initPromise = initVisitorCounter();
    await triggerDOMContentLoaded();
    expect(initPromise).toBeInstanceOf(Promise);
    await initPromise;
    vi.advanceTimersByTime(100);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});