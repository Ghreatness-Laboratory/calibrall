'use client';

import { useState, useEffect, useCallback } from 'react';
import { Fixture } from '@/types';

export interface LiveFixturesHookResult {
  fixtures: Fixture[];
  isLoading: boolean;
  liveDataAvailable: boolean;
  lastUpdated: string;
  error?: string;
  refetch: () => Promise<void>;
}

export function useLiveFixtures(competitionCode?: string, status?: string): LiveFixturesHookResult {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveDataAvailable, setLiveDataAvailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm} UTC`;
  });
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams();
      if (competitionCode && competitionCode !== 'ALL') query.set('competition', competitionCode);
      if (status && status !== 'ALL') query.set('status', status);

      const res = await fetch(`/api/v1/fixtures?${query.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setLiveDataAvailable(false);
        setError(`Live data unavailable. Last updated ${lastUpdated}`);
        return;
      }
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        setLiveDataAvailable(false);
        setError(`Live data unavailable. Last updated ${lastUpdated}`);
        return;
      }
      
      const list = json.data || [];
      setFixtures(list);
      setLiveDataAvailable(Boolean(json.liveDataAvailable && list.length > 0));
      if (json.lastUpdated) {
        setLastUpdated(json.lastUpdated);
      }
      if (json.error || !json.liveDataAvailable) {
        setError(json.error || `Live data unavailable. Last updated ${json.lastUpdated || lastUpdated}`);
      } else {
        setError(undefined);
      }
    } catch {
      setLiveDataAvailable(false);
      setError(`Live data unavailable. Last updated ${lastUpdated}`);
    } finally {
      setIsLoading(false);
    }
  }, [competitionCode, status, lastUpdated]);

  useEffect(() => {
    load();
    // Auto-revalidate every 120 seconds for live updates
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, [load]);

  return { fixtures, isLoading, liveDataAvailable, lastUpdated, error, refetch: load };
}
