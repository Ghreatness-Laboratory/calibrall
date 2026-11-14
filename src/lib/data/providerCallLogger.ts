// CALIBRALL: Persistent Provider Call Logger, Quota Header Extractor & Sync State Store
// Captures every external provider call (HTTP status, truncated body, quota headers, timestamp),
// persists last-known-good sync state in Supabase/SQLite, and exposes the last 20 calls for /api/admin/provider-check.

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  ProviderId,
  SkippedLeagueRecord,
  PROVIDER_BUDGETS,
  FIXTURE_STALE_LIMIT_MINUTES,
} from './providerBudget';

export interface ProviderCallLogEntry {
  id: string;
  timestamp: string;
  provider: string;
  endpoint: string;
  method: string;
  statusCode: number | null;
  ok: boolean;
  latencyMs: number;
  leagueCode?: string | null;
  syncMode?: string | null;
  quotaHeaders: Record<string, string>;
  quotaRemaining?: string | null;
  responseBody: string;
  error?: string | null;
}

export interface ProviderSyncStateRecord {
  id: string;
  sport: string;
  providerName: string;
  status: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
  lastResponseBody: string | null;
  quotaRemaining: string | null;
  quotaHeaders: Record<string, string>;
  skippedLeagues: SkippedLeagueRecord[];
  callsUsedLastRun: number;
  callsToday: number;
  budgetDate: string;
  updatedAt: string;
}

declare global {
  var __calibrallProviderCallLogs: ProviderCallLogEntry[] | undefined;
  var __calibrallProviderSyncState: Map<string, ProviderSyncStateRecord> | undefined;
}

function getMemoryLogs(): ProviderCallLogEntry[] {
  if (!globalThis.__calibrallProviderCallLogs) {
    globalThis.__calibrallProviderCallLogs = [];
  }
  return globalThis.__calibrallProviderCallLogs;
}

function getMemoryStateMap(): Map<string, ProviderSyncStateRecord> {
  if (!globalThis.__calibrallProviderSyncState) {
    globalThis.__calibrallProviderSyncState = new Map();
  }
  return globalThis.__calibrallProviderSyncState;
}

export function sanitizeProviderUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const sensitiveParams = ['apiKey', 'apikey', 'api_token', 'token', 'key', 'auth'];
    for (const p of sensitiveParams) {
      if (u.searchParams.has(p)) {
        u.searchParams.set(p, 'REDACTED');
      }
    }
    return u.toString();
  } catch {
    return rawUrl.replace(/(api_token|apiKey|token|key)=[^&\s]+/gi, '$1=REDACTED');
  }
}

export function extractQuotaHeaders(headers: Headers): {
  quotaHeaders: Record<string, string>;
  quotaRemaining: string | null;
} {
  const quotaHeaders: Record<string, string> = {};
  headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (
      lower.includes('quota') ||
      lower.includes('request') ||
      lower.includes('rate') ||
      lower.includes('limit') ||
      lower === 'retry-after'
    ) {
      quotaHeaders[lower] = val;
    }
  });

  const remainingCandidates = [
    quotaHeaders['x-requests-remaining'],
    quotaHeaders['x-requests-available'],
    quotaHeaders['x-requests-available-minute'],
    quotaHeaders['x-ratelimit-remaining'],
    quotaHeaders['x-rate-limit-remaining'],
  ].filter(Boolean);

  return {
    quotaHeaders,
    quotaRemaining: remainingCandidates[0] ?? null,
  };
}

function makeLogId(): string {
  return `pcall_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordProviderCall(entry: Omit<ProviderCallLogEntry, 'id'>): Promise<ProviderCallLogEntry> {
  const full: ProviderCallLogEntry = {
    id: makeLogId(),
    ...entry,
  };

  const mem = getMemoryLogs();
  mem.unshift(full);
  if (mem.length > 200) mem.length = 200;

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('provider_call_logs').upsert(
        {
          id: full.id,
          timestamp: full.timestamp,
          provider: full.provider,
          endpoint: full.endpoint,
          method: full.method,
          status_code: full.statusCode,
          ok: full.ok ? 1 : 0,
          latency_ms: full.latencyMs,
          league_code: full.leagueCode || null,
          sync_mode: full.syncMode || null,
          quota_headers_json: JSON.stringify(full.quotaHeaders || {}),
          quota_remaining: full.quotaRemaining || null,
          response_body: full.responseBody.slice(0, 600),
          error: full.error || null,
        },
        { onConflict: 'id' }
      );
    } catch {
      // Never block sync pipeline on telemetry write failure
    }
  }

  return full;
}

export async function loggedProviderFetch(
  provider: string,
  url: string,
  init: RequestInit & {
    leagueCode?: string;
    syncMode?: string;
    timeoutMs?: number;
  } = {}
): Promise<{
  ok: boolean;
  status: number | null;
  bodyText: string;
  json: any;
  quotaHeaders: Record<string, string>;
  quotaRemaining: string | null;
  latencyMs: number;
  error?: string;
}> {
  const { leagueCode, syncMode, timeoutMs = 10000, ...fetchInit } = init;
  const sanitizedEndpoint = sanitizeProviderUrl(url);
  const method = (fetchInit.method || 'GET').toUpperCase();
  const timestamp = new Date().toISOString();
  const t0 = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchInit,
      signal: fetchInit.signal || controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - t0;
    const { quotaHeaders, quotaRemaining } = extractQuotaHeaders(res.headers);
    const bodyText = await res.text().catch(() => '');
    let json: any = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }

    const snippet = res.ok
      ? `OK (${bodyText.length} bytes)`
      : bodyText.slice(0, 500) || res.statusText || `HTTP ${res.status}`;

    const errorMsg = res.ok
      ? null
      : `HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 240)}` : ''}`;

    await recordProviderCall({
      timestamp,
      provider,
      endpoint: sanitizedEndpoint,
      method,
      statusCode: res.status,
      ok: res.ok,
      latencyMs,
      leagueCode: leagueCode || null,
      syncMode: syncMode || null,
      quotaHeaders,
      quotaRemaining,
      responseBody: snippet,
      error: errorMsg,
    });

    return {
      ok: res.ok,
      status: res.status,
      bodyText,
      json,
      quotaHeaders,
      quotaRemaining,
      latencyMs,
      error: errorMsg || undefined,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - t0;
    const errorMsg = err?.name === 'AbortError'
      ? `Request timeout after ${timeoutMs}ms`
      : err?.message || 'Network failure';

    await recordProviderCall({
      timestamp,
      provider,
      endpoint: sanitizedEndpoint,
      method,
      statusCode: null,
      ok: false,
      latencyMs,
      leagueCode: leagueCode || null,
      syncMode: syncMode || null,
      quotaHeaders: {},
      quotaRemaining: null,
      responseBody: errorMsg,
      error: errorMsg,
    });

    return {
      ok: false,
      status: null,
      bodyText: errorMsg,
      json: null,
      quotaHeaders: {},
      quotaRemaining: null,
      latencyMs,
      error: errorMsg,
    };
  }
}

export async function getRecentProviderCalls(limit = 20): Promise<ProviderCallLogEntry[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('provider_call_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((row: any) => {
          let parsedHeaders: Record<string, string> = {};
          try {
            parsedHeaders = row.quota_headers_json ? JSON.parse(row.quota_headers_json) : {};
          } catch {
            parsedHeaders = {};
          }
          return {
            id: String(row.id),
            timestamp: String(row.timestamp),
            provider: String(row.provider),
            endpoint: String(row.endpoint),
            method: String(row.method || 'GET'),
            statusCode: row.status_code ?? null,
            ok: Boolean(row.ok === 1 || row.ok === true),
            latencyMs: Number(row.latency_ms) || 0,
            leagueCode: row.league_code || null,
            syncMode: row.sync_mode || null,
            quotaHeaders: parsedHeaders,
            quotaRemaining: row.quota_remaining || null,
            responseBody: String(row.response_body || ''),
            error: row.error || null,
          };
        });
      }
    } catch {
      // Fallback to memory
    }
  }

  return getMemoryLogs().slice(0, limit);
}

export async function getProviderCallCountToday(providerFilter?: string): Promise<number> {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('provider_call_logs')
        .select('id, provider, timestamp')
        .gte('timestamp', `${todayPrefix}T00:00:00.000Z`);
      if (providerFilter) {
        query = query.eq('provider', providerFilter);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.length;
      }
    } catch {
      // Fallback
    }
  }

  return getMemoryLogs().filter(l =>
    l.timestamp.startsWith(todayPrefix) &&
    (!providerFilter || l.provider === providerFilter)
  ).length;
}

export async function upsertProviderSyncState(
  id: string,
  patch: Partial<Omit<ProviderSyncStateRecord, 'id' | 'updatedAt'>>
): Promise<void> {
  const existing = await getProviderSyncState(id);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const merged: ProviderSyncStateRecord = {
    id,
    sport: patch.sport ?? existing?.sport ?? 'football',
    providerName: patch.providerName ?? existing?.providerName ?? id,
    status: patch.status ?? existing?.status ?? 'ONLINE',
    lastAttemptAt: patch.lastAttemptAt ?? existing?.lastAttemptAt ?? nowIso,
    lastSuccessAt: patch.lastSuccessAt !== undefined ? patch.lastSuccessAt : (existing?.lastSuccessAt ?? null),
    lastError: patch.lastError !== undefined ? patch.lastError : (existing?.lastError ?? null),
    lastHttpStatus: patch.lastHttpStatus !== undefined ? patch.lastHttpStatus : (existing?.lastHttpStatus ?? null),
    lastResponseBody: patch.lastResponseBody !== undefined ? patch.lastResponseBody : (existing?.lastResponseBody ?? null),
    quotaRemaining: patch.quotaRemaining !== undefined ? patch.quotaRemaining : (existing?.quotaRemaining ?? null),
    quotaHeaders: patch.quotaHeaders ?? existing?.quotaHeaders ?? {},
    skippedLeagues: patch.skippedLeagues ?? existing?.skippedLeagues ?? [],
    callsUsedLastRun: patch.callsUsedLastRun ?? existing?.callsUsedLastRun ?? 0,
    callsToday:
      existing?.budgetDate === todayStr
        ? (patch.callsToday ?? (existing.callsToday + (patch.callsUsedLastRun ?? 0)))
        : (patch.callsToday ?? patch.callsUsedLastRun ?? 0),
    budgetDate: patch.budgetDate ?? todayStr,
    updatedAt: nowIso,
  };

  getMemoryStateMap().set(id, merged);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('provider_sync_state').upsert(
        {
          id: merged.id,
          sport: merged.sport,
          provider_name: merged.providerName,
          status: merged.status,
          last_attempt_at: merged.lastAttemptAt,
          last_success_at: merged.lastSuccessAt,
          last_error: merged.lastError,
          last_http_status: merged.lastHttpStatus,
          last_response_body: merged.lastResponseBody ? merged.lastResponseBody.slice(0, 500) : null,
          quota_remaining: merged.quotaRemaining,
          quota_headers_json: JSON.stringify(merged.quotaHeaders || {}),
          skipped_leagues_json: JSON.stringify(merged.skippedLeagues || []),
          calls_used_last_run: merged.callsUsedLastRun,
          calls_today: merged.callsToday,
          budget_date: merged.budgetDate,
          updated_at: merged.updatedAt,
        },
        { onConflict: 'id' }
      );
    } catch {
      // Non-fatal
    }
  }
}

function mapSyncStateRow(row: any): ProviderSyncStateRecord {
  let quotaHeaders: Record<string, string> = {};
  let skippedLeagues: SkippedLeagueRecord[] = [];
  try {
    quotaHeaders = row.quota_headers_json ? JSON.parse(row.quota_headers_json) : {};
  } catch {}
  try {
    skippedLeagues = row.skipped_leagues_json ? JSON.parse(row.skipped_leagues_json) : [];
  } catch {}

  return {
    id: String(row.id),
    sport: String(row.sport || 'football'),
    providerName: String(row.provider_name || row.id),
    status: String(row.status || 'UNKNOWN'),
    lastAttemptAt: row.last_attempt_at || null,
    lastSuccessAt: row.last_success_at || null,
    lastError: row.last_error || null,
    lastHttpStatus: row.last_http_status ?? null,
    lastResponseBody: row.last_response_body || null,
    quotaRemaining: row.quota_remaining || null,
    quotaHeaders,
    skippedLeagues,
    callsUsedLastRun: Number(row.calls_used_last_run) || 0,
    callsToday: Number(row.calls_today) || 0,
    budgetDate: String(row.budget_date || new Date().toISOString().slice(0, 10)),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function getProviderSyncState(id: string): Promise<ProviderSyncStateRecord | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('provider_sync_state')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        return mapSyncStateRow(data[0]);
      }
    } catch {
      // Fallback
    }
  }
  return getMemoryStateMap().get(id) || null;
}

export async function getAllProviderSyncStates(): Promise<ProviderSyncStateRecord[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('provider_sync_state')
        .select('*');

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(mapSyncStateRow);
      }
    } catch {
      // Fallback
    }
  }
  return Array.from(getMemoryStateMap().values());
}

export function formatUtcTimeStamp(isoString: string | null | undefined): string {
  if (!isoString) return 'never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'never';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/**
 * Computes stored fixture freshness & staleness strictly from Supabase/DB timestamps.
 * Never returns synthetic fixtures; flags `isStaleBeyondLimit` only when stored fixtures
 * are empty or older than `FIXTURE_STALE_LIMIT_MINUTES` (120 minutes).
 */
export async function getStoredSportFreshness(sport: 'football' | 'basketball'): Promise<{
  fixtureCount: number;
  newestUpdatedAt: string | null;
  lastUpdatedFormatted: string;
  ageMinutes: number | null;
  isStaleBeyondLimit: boolean;
  syncState: ProviderSyncStateRecord | null;
}> {
  const syncState = await getProviderSyncState(sport);
  let fixtureCount = 0;
  let newestUpdatedAt: string | null = syncState?.lastSuccessAt || null;

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from('fixtures').select('id, competition_id, updated_at');
      if (sport === 'basketball') {
        query = query.eq('competition_id', 'comp_nba');
      } else {
        query = query.neq('competition_id', 'comp_nba');
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        fixtureCount = data.length;
        for (const row of data) {
          if (row.updated_at && (!newestUpdatedAt || String(row.updated_at) > newestUpdatedAt)) {
            newestUpdatedAt = String(row.updated_at);
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  let ageMinutes: number | null = null;
  if (newestUpdatedAt) {
    const ms = new Date(newestUpdatedAt).getTime();
    if (!isNaN(ms)) {
      ageMinutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
    }
  }

  const isStaleBeyondLimit =
    fixtureCount === 0 ||
    ageMinutes === null ||
    ageMinutes > FIXTURE_STALE_LIMIT_MINUTES;

  return {
    fixtureCount,
    newestUpdatedAt,
    lastUpdatedFormatted: formatUtcTimeStamp(newestUpdatedAt),
    ageMinutes,
    isStaleBeyondLimit,
    syncState,
  };
}

export function getProviderBudgetMeta(id: ProviderId) {
  return PROVIDER_BUDGETS[id];
}
