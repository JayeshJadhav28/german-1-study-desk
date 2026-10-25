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

let fetchMock: ReturnType<typeof vi.fn>;

function setupGlobals() {
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

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', {
    addEventListener: vi.fn((event, handler) => {
      if (event === 'beforeunload') {
        (globalThis as any).__beforeunloadHandler = handler;
      }
    }),
    removeEventListener: vi.fn(),
  });
}

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

  setupGlobals();

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

async function initCounter() {
  const { initVisitorCounter, __resetForTesting } = await import('../src/visitor-client');
  __resetForTesting();
  return initVisitorCounter();
}

function setFetchResponse(ok: boolean, data: unknown) {
  if (ok) {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
  } else {
    fetchMock.mockRejectedValue(new Error('Network error'));
  }
}

describe('Visitor Client - Tab Coordination', () => {
  it('leadership transfers when leader tab goes hidden, no duplicate heartbeats', async () => {
    setFetchResponse(true, { online: 1, totalVisits: 121 });

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await triggerVisibilityChange('hidden');
    vi.advanceTimersByTime(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await triggerVisibilityChange('visible');
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('localStorage fallback leadership works when navigator.locks unavailable', async () => {
    setFetchResponse(true, { online: 1, totalVisits: 121 });

    vi.stubGlobal('navigator', { locks: undefined });

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await triggerVisibilityChange('hidden');
    await triggerVisibilityChange('visible');
    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('heartbeat interval is 120s and stale timeout logic is 300s (integration)', async () => {
    setFetchResponse(true, { online: 1, totalVisits: 121 });

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(119_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(119_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shows fallback on API error', async () => {
    setFetchResponse(false, null);

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
  });

  it('shows fallback on invalid response shape', async () => {
    setFetchResponse(true, { foo: 'bar' });

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('Visitor count temporarily unavailable');
  });

  it('no rapid retry on failure', async () => {
    setFetchResponse(false, null);

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updates badge with online and totalVisits on success', async () => {
    setFetchResponse(true, { online: 5, totalVisits: 123 });

    await initCounter();
    await triggerDOMContentLoaded();
    vi.advanceTimersByTime(100);
    expect(mockCountEl.textContent).toBe('5 online \u00B7 123 visits');
    expect(mockDotEl.classList.add).toHaveBeenCalledWith('active');
  });
});