'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Fixture, Sport } from '@/types';

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
  error?: string;
  providerUsed?: string;
  failedProvider?: string;
  quotaHeaders?: Record<string, string>;
  skippedLeagues?: SkippedLeagueDiagnostic[];
  refetch: () => Promise<void>;
}

export function useLiveFixtures(
  competitionId?: string,
  status?: string,
  sport: Sport = 'football',
  day?: string
): LiveFixturesHookResult {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveDataAvailable, setLiveDataAvailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(null);
  const [isDelayed, setIsDelayed] = useState<boolean>(false);
  const [staleLimitMinutes, setStaleLimitMinutes] = useState<number>(120);
  const [error, setError] = useState<string | undefined>();
  const [providerUsed, setProviderUsed] = useState<string | undefined>();
  const [failedProvider, setFailedProvider] = useState<string | undefined>();
  const [quotaHeaders, setQuotaHeaders] = useState<Record<string, string> | undefined>();
  const [skippedLeagues, setSkippedLeagues] = useState<SkippedLeagueDiagnostic[]>([]);
  const hasCachedListRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams();
      query.set('sport', sport);
      if (competitionId && competitionId !== 'ALL') {
        query.set('competition_id', competitionId);
      }
      if (status && status !== 'ALL') query.set('status', status);
      if (day && day !== 'ALL') query.set('day', day);

      const res = await fetch(`/api/v1/fixtures?${query.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        if (!hasCachedListRef.current) {
          setLiveDataAvailable(false);
          setIsDelayed(true);
          setError(`Fixtures unavailable, last updated ${lastUpdated || 'never'}`);
        }
        return;
      }
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        if (!hasCachedListRef.current) {
          setLiveDataAvailable(false);
          setIsDelayed(true);
          setError(`Fixtures unavailable, last updated ${lastUpdated || 'never'}`);
        }
        return;
      }

      const list: Fixture[] = json.data || [];
      if (list.length > 0) {
        hasCachedListRef.current = true;
      }
      setFixtures(list);
      setLiveDataAvailable(Boolean(json.liveDataAvailable || list.length > 0));
      setIsDelayed(Boolean(json.isDelayed));
      if (typeof json.staleLimitMinutes === 'number') {
        setStaleLimitMinutes(json.staleLimitMinutes);
      }
      setLastSyncTimestamp(json.lastSyncTimestamp || null);
      setProviderUsed(json.providerUsed);
      setFailedProvider(json.failedProvider);
      setQuotaHeaders(json.quotaHeaders);
      setSkippedLeagues(Array.isArray(json.skippedLeagues) ? json.skippedLeagues : []);
      if (json.lastUpdated) {
        setLastUpdated(json.lastUpdated);
      }

      // Show error banner ONLY when stored fixtures exceed the staleness limit or are empty
      if (json.error && (json.isDelayed || list.length === 0)) {
        setError(json.error);
      } else {
        setError(undefined);
      }
    } catch {
      if (!hasCachedListRef.current) {
        setLiveDataAvailable(false);
        setIsDelayed(true);
        setError(`Fixtures unavailable, last updated ${lastUpdated || 'never'}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [competitionId, status, sport, day, lastUpdated]);

  useEffect(() => {
    hasCachedListRef.current = false;
    load();
    // Poll DB-backed API every 120 seconds (0 external provider calls per visitor)
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, status, sport, day]);

  return {
    fixtures,
    isLoading,
    liveDataAvailable,
    lastUpdated,
    lastSyncTimestamp,
    isDelayed,
    staleLimitMinutes,
    error,
    providerUsed,
    failedProvider,
    quotaHeaders,
    skippedLeagues,
    refetch: load,
  };
}
