'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Fixture, Sport } from '@/types';
import type { BasketballGameEvaluation } from '@/lib/basketball/picker';

export interface SkippedLeagueDiagnostic {
  leagueCode: string;
  leagueName: string;
  tier: 1 | 2 | 3;
  provider: string;
  reason: string;
}

export interface LiveFixturesHookResult {
  fixtures: Fixture[];
  isLoading: boolean;
  liveDataAvailable: boolean;
  lastUpdated: string;
  lastSyncTimestamp?: string | null;
  isDelayed?: boolean;
  staleLimitMinutes?: number;
  hasFreeFixturesSource?: boolean;
  storedHistoryMode?: boolean;
  error?: string;
  serverStatus?: number;
  isOffline?: boolean;
  isSavedCopy?: boolean;
  savedCopyTimestamp?: string;
  providerUsed?: string;
  failedProvider?: string;
  quotaHeaders?: Record<string, string>;
  skippedLeagues?: SkippedLeagueDiagnostic[];
  evaluations?: Record<string, BasketballGameEvaluation>;
  refetch: () => Promise<void>;
}

interface SavedFixturesPayload {
  fixtures: Fixture[];
  evaluations?: Record<string, BasketballGameEvaluation>;
  lastUpdated: string;
  lastSyncTimestamp: string | null;
  providerUsed?: string;
  savedAt: string;
}

const SAVED_FIXTURES_PREFIX = 'calibrall_saved_fixtures_v1:';

function normalizeCompParam(competitionId?: string | string[]): string {
  if (!competitionId) return 'ALL';
  const rawList = Array.isArray(competitionId) ? competitionId : competitionId.split(',');
  const cleaned = Array.from(
    new Set(
      rawList
        .map((c) => c.trim())
        .filter((c) => c && c.toUpperCase() !== 'ALL')
    )
  ).sort();
  return cleaned.length > 0 ? cleaned.join(',') : 'ALL';
}

function getSavedFixturesKey(sport: Sport | 'all', competitionId?: string, status?: string, day?: string): string {
  return `${SAVED_FIXTURES_PREFIX}${sport}:${competitionId || 'ALL'}:${status || 'ALL'}:${day || 'ALL'}`;
}

function readSavedFixturesFromStorage(key: string): SavedFixturesPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedFixturesPayload;
    if (parsed && Array.isArray(parsed.fixtures) && parsed.fixtures.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore storage read/parse errors
  }
  return null;
}

function writeSavedFixturesToStorage(key: string, payload: SavedFixturesPayload): void {
  if (typeof window === 'undefined' || !payload.fixtures || payload.fixtures.length === 0) return;
  const serialized = JSON.stringify(payload);
  try {
    window.localStorage.setItem(key, serialized);
  } catch {
    // Prune older saved fixture keys if storage quota is tight, then retry once
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(SAVED_FIXTURES_PREFIX) && k !== key) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.localStorage.removeItem(k);
      }
      window.localStorage.setItem(key, serialized);
    } catch {
      // Ignore if still over quota
    }
  }
}

function formatServerFailureReason(status: number, parsedJson: any, fallbackText?: string): string {
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isBrowserOffline) {
    return 'Offline';
  }

  const rawReason =
    (typeof parsedJson?.reason === 'string' && parsedJson.reason.trim()) ||
    (typeof parsedJson?.error === 'string' && parsedJson.error.trim()) ||
    (typeof parsedJson?.message === 'string' && parsedJson.message.trim()) ||
    '';

  // Never propagate a misleading "Offline" label from an older cache/worker when the browser is online
  if (rawReason && rawReason.toLowerCase() !== 'offline' && !rawReason.toLowerCase().includes('live network unavailable')) {
    if (status === 504 && !rawReason.includes('504')) {
      return `server timeout (504): ${rawReason}`;
    }
    if (status >= 500 && !rawReason.includes(String(status))) {
      return `${rawReason} (${status})`;
    }
    return rawReason;
  }

  if (status === 504) return 'server timeout (504)';
  if (status === 502) return 'bad gateway (502)';
  if (status === 503) return 'service unavailable (503)';
  if (status >= 500) return `server error (${status})`;
  if (fallbackText && fallbackText.trim() && !fallbackText.trim().startsWith('<')) {
    return `request failed (${status}): ${fallbackText.trim().slice(0, 120)}`;
  }
  return `request failed (${status})`;
}

export function useLiveFixtures(
  competitionId?: string | string[],
  status?: string,
  sport: Sport | 'all' = 'football',
  day?: string
): LiveFixturesHookResult {
  const normalizedCompId = normalizeCompParam(competitionId);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveDataAvailable, setLiveDataAvailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(null);
  const [isDelayed, setIsDelayed] = useState<boolean>(false);
  const [staleLimitMinutes, setStaleLimitMinutes] = useState<number>(4320);
  const [hasFreeFixturesSource, setHasFreeFixturesSource] = useState<boolean>(true);
  const [storedHistoryMode, setStoredHistoryMode] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>();
  const [serverStatus, setServerStatus] = useState<number | undefined>();
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isSavedCopy, setIsSavedCopy] = useState<boolean>(false);
  const [savedCopyTimestamp, setSavedCopyTimestamp] = useState<string | undefined>();
  const [providerUsed, setProviderUsed] = useState<string | undefined>();
  const [failedProvider, setFailedProvider] = useState<string | undefined>();
  const [quotaHeaders, setQuotaHeaders] = useState<Record<string, string> | undefined>();
  const [skippedLeagues, setSkippedLeagues] = useState<SkippedLeagueDiagnostic[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, BasketballGameEvaluation>>({});
  const fixturesRef = useRef<Fixture[]>([]);
  const evaluationsRef = useRef<Record<string, BasketballGameEvaluation>>({});
  const lastUpdatedRef = useRef<string>('');

  const applySavedFallback = useCallback(
    (storageKey: string, failureReason: string, httpStatus: number | undefined, offlineFlag: boolean) => {
      const inMemory = fixturesRef.current;
      if (inMemory.length > 0) {
        setIsSavedCopy(true);
        setSavedCopyTimestamp(lastUpdatedRef.current || undefined);
        setLiveDataAvailable(true);
        setIsDelayed(true);
        setIsOffline(offlineFlag);
        setServerStatus(httpStatus);
        setError(failureReason);
        return;
      }

      const stored = readSavedFixturesFromStorage(storageKey);
      if (stored && stored.fixtures.length > 0) {
        fixturesRef.current = stored.fixtures;
        evaluationsRef.current = stored.evaluations || {};
        lastUpdatedRef.current = stored.lastUpdated || lastUpdatedRef.current;
        setFixtures(stored.fixtures);
        setEvaluations(stored.evaluations || {});
        if (stored.lastUpdated) setLastUpdated(stored.lastUpdated);
        if (stored.lastSyncTimestamp) setLastSyncTimestamp(stored.lastSyncTimestamp);
        if (stored.providerUsed) setProviderUsed(stored.providerUsed);
        setIsSavedCopy(true);
        setSavedCopyTimestamp(stored.lastUpdated || stored.savedAt);
        setLiveDataAvailable(true);
        setIsDelayed(true);
        setIsOffline(offlineFlag);
        setServerStatus(httpStatus);
        setError(failureReason);
        return;
      }

      setLiveDataAvailable(false);
      setIsSavedCopy(false);
      setIsDelayed(true);
      setIsOffline(offlineFlag);
      setServerStatus(httpStatus);
      setError(failureReason);
    },
    []
  );

  const load = useCallback(async () => {
    const storageKey = getSavedFixturesKey(sport, normalizedCompId, status, day);
    const browserOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;

    try {
      setIsLoading(true);
      const query = new URLSearchParams();
      query.set('sport', sport);
      if (normalizedCompId && normalizedCompId !== 'ALL') {
        query.set('competition_id', normalizedCompId);
      }
      if (status && status !== 'ALL') query.set('status', status);
      if (day && day !== 'ALL') query.set('day', day);

      const res = await fetch(`/api/v1/fixtures?${query.toString()}`, {
        cache: 'no-store',
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (res.status === 401 || res.status === 403) {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {}
        fixturesRef.current = [];
        evaluationsRef.current = {};
        setFixtures([]);
        setEvaluations({});
        setLiveDataAvailable(false);
        setIsSavedCopy(false);
        setServerStatus(res.status);
        setError('Authentication required.');
        return;
      }

      if (!res.ok) {
        const offlineFlag = browserOfflineNow || (typeof navigator !== 'undefined' && navigator.onLine === false);
        const reason = formatServerFailureReason(res.status, json, text);
        applySavedFallback(storageKey, reason, res.status, offlineFlag);
        return;
      }

      if (!json || !Array.isArray(json.data)) {
        const offlineFlag = typeof navigator !== 'undefined' && navigator.onLine === false;
        const reason = offlineFlag ? 'Offline' : 'Invalid JSON response from fixtures API';
        applySavedFallback(storageKey, reason, res.status, offlineFlag);
        return;
      }

      const swSavedCopyHeader =
        res.headers.get('X-Calibrall-Saved-Copy') === 'true' ||
        res.headers.get('X-Calibrall-Cached') === 'true';
      const swServerError = res.headers.get('X-Calibrall-Server-Error') || undefined;
      const swServerStatusRaw = Number(res.headers.get('X-Calibrall-Server-Status') || 0);
      const swServerStatus = swServerStatusRaw > 0 ? swServerStatusRaw : res.status;

      const list: Fixture[] = json.data || [];
      const evalMap: Record<string, BasketballGameEvaluation> =
        json.evaluations && typeof json.evaluations === 'object' ? json.evaluations : {};
      if (list.length > 0) {
        fixturesRef.current = list;
        evaluationsRef.current = evalMap;
        if (!swSavedCopyHeader) {
          writeSavedFixturesToStorage(storageKey, {
            fixtures: list,
            evaluations: evalMap,
            lastUpdated: json.lastUpdated || '',
            lastSyncTimestamp: json.lastSyncTimestamp || null,
            providerUsed: json.providerUsed,
            savedAt: new Date().toISOString(),
          });
        }
      }

      setFixtures(list);
      setEvaluations(evalMap);
      setLiveDataAvailable(Boolean(json.liveDataAvailable || list.length > 0));
      setIsDelayed(Boolean(json.isDelayed || swSavedCopyHeader));
      if (typeof json.staleLimitMinutes === 'number') {
        setStaleLimitMinutes(json.staleLimitMinutes);
      }
      setHasFreeFixturesSource(json.hasFreeFixturesSource !== false);
      setStoredHistoryMode(Boolean(json.storedHistoryMode));
      setLastSyncTimestamp(json.lastSyncTimestamp || null);
      setProviderUsed(json.providerUsed);
      setFailedProvider(json.failedProvider);
      setQuotaHeaders(json.quotaHeaders);
      setSkippedLeagues(Array.isArray(json.skippedLeagues) ? json.skippedLeagues : []);
      if (json.lastUpdated) {
        lastUpdatedRef.current = json.lastUpdated;
        setLastUpdated(json.lastUpdated);
      }

      const offlineFlag = typeof navigator !== 'undefined' && navigator.onLine === false;
      setIsOffline(offlineFlag);
      setServerStatus(swServerStatus);

      if (swSavedCopyHeader && list.length > 0) {
        setIsSavedCopy(true);
        setSavedCopyTimestamp(json.lastUpdated || res.headers.get('X-Calibrall-Cached-Time') || undefined);
        setError(offlineFlag ? 'Offline' : swServerError || 'Server unavailable, showing saved copy');
      } else {
        setIsSavedCopy(false);
        setSavedCopyTimestamp(undefined);
        // Show error banner ONLY when stored fixtures exceed the 3-day staleness limit or are empty (and not in stored history mode)
        if (!json.storedHistoryMode && json.error && (json.isDelayed || list.length === 0)) {
          setError(json.error);
        } else {
          setError(undefined);
        }
      }
    } catch (err: any) {
      const offlineFlag = typeof navigator !== 'undefined' && navigator.onLine === false;
      let reason = 'Offline';
      if (!offlineFlag) {
        const msg = err instanceof Error ? err.message : 'Network error';
        reason = msg.toLowerCase().includes('timeout')
          ? 'server timeout (504)'
          : `network error (${msg})`;
      }
      applySavedFallback(storageKey, reason, offlineFlag ? 503 : undefined, offlineFlag);
    } finally {
      setIsLoading(false);
    }
  }, [normalizedCompId, status, sport, day, applySavedFallback]);

  useEffect(() => {
    const storageKey = getSavedFixturesKey(sport, normalizedCompId, status, day);
    const stored = readSavedFixturesFromStorage(storageKey);
    if (stored) {
      fixturesRef.current = stored.fixtures;
      evaluationsRef.current = stored.evaluations || {};
      lastUpdatedRef.current = stored.lastUpdated || '';
      setFixtures(stored.fixtures);
      setEvaluations(stored.evaluations || {});
    } else {
      fixturesRef.current = [];
      evaluationsRef.current = {};
      lastUpdatedRef.current = '';
      setFixtures([]);
      setEvaluations({});
    }
    load();
    // Poll DB-backed API every 120 seconds (0 external provider calls per visitor)
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, [normalizedCompId, status, sport, day, load]);

  return {
    fixtures,
    isLoading,
    liveDataAvailable,
    lastUpdated,
    lastSyncTimestamp,
    isDelayed,
    staleLimitMinutes,
    hasFreeFixturesSource,
    storedHistoryMode,
    error,
    serverStatus,
    isOffline,
    isSavedCopy,
    savedCopyTimestamp,
    providerUsed,
    failedProvider,
    quotaHeaders,
    skippedLeagues,
    evaluations,
    refetch: load,
  };
}
