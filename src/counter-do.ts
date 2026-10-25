import type { DurableObjectState } from '@cloudflare/workers-types';

export interface Env {
  VISITOR_COUNTER: any;
}

const STALE_TIMEOUT_MS = 300_000;
const DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const INITIAL_TOTAL_VISITS = 220;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_REGEX.test(v);
}

export class VisitorCounter {
  private ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    this.initialize();
  }

  private initialize(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counter_meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL,
        online_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS active_profiles (
        profile_id TEXT PRIMARY KEY,
        last_heartbeat INTEGER NOT NULL,
        visit_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seen_visits (
        visit_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS counter_meta_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_active_heartbeat ON active_profiles(last_heartbeat);
      CREATE INDEX IF NOT EXISTS idx_seen_created ON seen_visits(created_at);
    `);

    this.migrateBaselineIfNeeded();
  }

  private migrateBaselineIfNeeded(): void {
    const versionCursor = this.ctx.storage.sql.exec(
      `SELECT 1 FROM counter_meta_version WHERE version = 1`
    );
    const hasMigrated = Array.from(versionCursor).length > 0;

    if (!hasMigrated) {
      const legacyCursor = this.ctx.storage.sql.exec(
        `SELECT 1 FROM counter_meta WHERE key = 'totalVisits'`
      );
      const hasLegacyRow = Array.from(legacyCursor).length > 0;

      if (hasLegacyRow) {
        this.ctx.storage.sql.exec(
          `UPDATE counter_meta SET value = value + 100 WHERE key = 'totalVisits'`
        );
      } else {
        this.ctx.storage.sql.exec(
          `INSERT INTO counter_meta (key, value, online_count) VALUES ('totalVisits', ${INITIAL_TOTAL_VISITS}, 0)`
        );
      }

      this.ctx.storage.sql.exec(
        `INSERT INTO counter_meta_version (version, applied_at) VALUES (1, ?)`,
        Date.now()
      );
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/heartbeat' || request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let payload: unknown;
    try {
      const text = await request.text();
      if (text.length > 1024) throw new Error('Payload too large');
      payload = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { profileId, visitId } = payload as { profileId?: string; visitId?: string };

    if (!isValidUuid(profileId) || !isValidUuid(visitId)) {
      return new Response(JSON.stringify({ error: 'Invalid ID format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const result = this.heartbeat(profileId, visitId);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('[VisitorCounter] heartbeat error:', e);
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private heartbeat(profileId: string, visitId: string): { online: number; totalVisits: number } {
    const now = Date.now();
    const staleThreshold = now - STALE_TIMEOUT_MS;

    return this.ctx.storage.transactionSync(() => {
      // 1. Delete stale profiles and get count
      this.ctx.storage.sql.exec(
        `DELETE FROM active_profiles WHERE last_heartbeat < ?`,
        staleThreshold
      );
      const staleDeleted = this.ctx.storage.sql.exec(`SELECT changes() as deleted`);
      const staleCount = Number(Array.from(staleDeleted)[0]?.deleted ?? 0);

      // 2. Insert visitId if new
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO seen_visits (visit_id, created_at) VALUES (?, ?)`,
        visitId, now
      );

      // 3. Check if visit was newly inserted
      const visitInserted = this.ctx.storage.sql.exec(`SELECT changes() as inserted`);
      const visitIsNew = Array.from(visitInserted)[0]?.inserted === 1;

      // 4. Increment totalVisits ONLY if visit is new
      if (visitIsNew) {
        this.ctx.storage.sql.exec(
          `UPDATE counter_meta SET value = value + 1 WHERE key = 'totalVisits'`
        );
      }

      // 5. Check if profile exists BEFORE upsert
      const existingProfile = this.ctx.storage.sql.exec(
        `SELECT 1 FROM active_profiles WHERE profile_id = ?`,
        profileId
      );
      const isNewProfile = Array.from(existingProfile).length === 0;

      // 6. Upsert active profile
      this.ctx.storage.sql.exec(
        `INSERT INTO active_profiles (profile_id, last_heartbeat, visit_id) VALUES (?, ?, ?)
         ON CONFLICT(profile_id) DO UPDATE SET
           last_heartbeat = excluded.last_heartbeat,
           visit_id = excluded.visit_id`,
        profileId, now, visitId
      );

      // 7. Update online_count transactionally
      let onlineDelta = 0;
      if (isNewProfile) onlineDelta += 1;
      if (staleCount > 0) onlineDelta -= staleCount;

      if (onlineDelta !== 0) {
        this.ctx.storage.sql.exec(
          `UPDATE counter_meta SET online_count = online_count + ? WHERE key = 'totalVisits'`,
          onlineDelta
        );
      }

      // 8. Read totalVisits and online_count
      const totalsCursor = this.ctx.storage.sql.exec(
        `SELECT value as totalVisits, online_count as online FROM counter_meta WHERE key = 'totalVisits'`
      );
      const row = Array.from(totalsCursor)[0];
      const totalVisits = Number(row?.totalVisits ?? INITIAL_TOTAL_VISITS);
      const online = Number(row?.online ?? 0);

      // 9. Periodic cleanup (1% chance) - INSIDE transaction
      if (Math.random() < 0.01) {
        const retentionThreshold = now - DEDUP_RETENTION_MS;
        this.ctx.storage.sql.exec(
          `DELETE FROM seen_visits WHERE created_at < ?`,
          retentionThreshold
        );
      }

      return { online: Math.max(0, online), totalVisits };
    });
  }
}