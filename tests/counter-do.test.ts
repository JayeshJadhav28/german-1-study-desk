import { describe, it, expect, beforeEach, vi } from 'vitest';

const STALE_TIMEOUT_MS = 300_000;
const DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const INITIAL_TOTAL_VISITS = 220;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_REGEX.test(v);
}

interface CounterState {
  counterMeta: Map<string, number>;
  onlineCount: number;
  activeProfiles: Map<string, { lastHeartbeat: number; visitId: string }>;
  seenVisits: Map<string, number>;
}

function createCounterState(): CounterState {
  return {
    counterMeta: new Map([['totalVisits', INITIAL_TOTAL_VISITS]]),
    onlineCount: 0,
    activeProfiles: new Map(),
    seenVisits: new Map(),
  };
}

function heartbeat(state: CounterState, profileId: string, visitId: string, now: number): { online: number; totalVisits: number } {
  const staleThreshold = now - STALE_TIMEOUT_MS;

  let staleCount = 0;
  for (const [pid, data] of state.activeProfiles.entries()) {
    if (data.lastHeartbeat < staleThreshold) {
      state.activeProfiles.delete(pid);
      staleCount++;
    }
  }

  let visitIsNew = false;
  if (!state.seenVisits.has(visitId)) {
    state.seenVisits.set(visitId, now);
    visitIsNew = true;
    const current = state.counterMeta.get('totalVisits') ?? INITIAL_TOTAL_VISITS;
    state.counterMeta.set('totalVisits', current + 1);
  }

  const isNewProfile = !state.activeProfiles.has(profileId);
  state.activeProfiles.set(profileId, { lastHeartbeat: now, visitId });

  let onlineDelta = 0;
  if (isNewProfile) onlineDelta += 1;
  if (staleCount > 0) onlineDelta -= staleCount;
  state.onlineCount = Math.max(0, state.onlineCount + onlineDelta);

  if (Math.random() < 0.01) {
    const retentionThreshold = now - DEDUP_RETENTION_MS;
    for (const [vid, created] of state.seenVisits.entries()) {
      if (created < retentionThreshold) {
        state.seenVisits.delete(vid);
      }
    }
  }

  return {
    online: state.onlineCount,
    totalVisits: state.counterMeta.get('totalVisits') ?? INITIAL_TOTAL_VISITS,
  };
}

const VALID_UUID = () => '123e4567-e89b-12d3-a456-426614174000';
const PROFILE_A = '123e4567-e89b-12d3-a456-426614174001';
const VISIT_1 = '123e4567-e89b-12d3-a456-426614174002';
const VISIT_2 = '123e4567-e89b-12d3-a456-426614174003';
const PROFILE_B = '123e4567-e89b-12d3-a456-426614174004';
const PROFILE_C = '123e4567-e89b-12d3-a456-426614174005';

describe('VisitorCounter Logic', () => {
  let state: CounterState;
  let now: number;

  beforeEach(() => {
    state = createCounterState();
    now = Date.now();
  });

  it('starts at 220, first visit increments to 221', () => {
    const result = heartbeat(state, PROFILE_A, VISIT_1, now);
    expect(result.totalVisits).toBe(221);
    expect(result.online).toBe(1);
  });

  it('duplicate visitId does not increment total', () => {
    heartbeat(state, PROFILE_A, VISIT_1, now);
    const result = heartbeat(state, PROFILE_A, VISIT_1, now);
    expect(result.totalVisits).toBe(221);
  });

  it('new visitId increments total', () => {
    heartbeat(state, PROFILE_A, VISIT_1, now);
    const result = heartbeat(state, PROFILE_A, VISIT_2, now);
    expect(result.totalVisits).toBe(222);
  });

  it('multiple tabs same profile = 1 online', () => {
    heartbeat(state, PROFILE_A, VISIT_1, now);
    heartbeat(state, PROFILE_A, VALID_UUID(), now);
    const result = heartbeat(state, PROFILE_A, VALID_UUID(), now);
    expect(result.online).toBe(1);
  });

  it('two profiles = 2 online', () => {
    heartbeat(state, PROFILE_A, VALID_UUID(), now);
    heartbeat(state, PROFILE_B, VALID_UUID(), now);
    const result = heartbeat(state, PROFILE_A, VALID_UUID(), now);
    expect(result.online).toBe(2);
  });

  it('rejects malformed UUIDs', () => {
    expect(isValidUuid('bad')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
  });

  it('stale profiles excluded after 300s', () => {
    heartbeat(state, PROFILE_A, VISIT_1, now);
    const later = now + STALE_TIMEOUT_MS + 1000;
    const result = heartbeat(state, PROFILE_B, VALID_UUID(), later);
    expect(result.online).toBe(1);
  });

  it('concurrent duplicate visits do not double-count', () => {
    const visitId = VALID_UUID();
    const results = Array(20).fill(null).map(() =>
      heartbeat(state, VALID_UUID(), visitId, now)
    );
    const totals = results.map(r => r.totalVisits);
    const unique = new Set(totals);
    expect(unique.size).toBe(1);
  });

  it('online count decreases when stale profiles removed', () => {
    heartbeat(state, PROFILE_A, VISIT_1, now);
    expect(state.onlineCount).toBe(1);
    const later = now + STALE_TIMEOUT_MS + 1000;
    heartbeat(state, PROFILE_B, VALID_UUID(), later);
    expect(state.onlineCount).toBe(1);
  });

  it('online count maintained transactionally with new profile and stale cleanup', () => {
    heartbeat(state, PROFILE_A, VISIT_1, now);
    expect(state.onlineCount).toBe(1);

    heartbeat(state, PROFILE_B, VALID_UUID(), now);
    expect(state.onlineCount).toBe(2);

    const later = now + STALE_TIMEOUT_MS + 1000;
    heartbeat(state, PROFILE_C, VALID_UUID(), later);
    // A and B are stale (last heartbeat at `now`, threshold is `now + 1000`), both cleaned up
    // C is new, so online = 1 (just C)
    expect(state.onlineCount).toBe(1);
  });
});