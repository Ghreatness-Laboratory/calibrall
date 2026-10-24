'use client';

import { useState, useEffect, useCallback } from 'react';
import { Fixture, Sport } from '@/types';

export interface LiveFixturesHookResult {
  fixtures: Fixture[];
  isLoading: boolean;
  liveDataAvailable: boolean;
  lastUpdated: string;
  isDelayed?: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

export function useLiveFixtures(
  competitionCode?: string, 
  status?: string, 
  sport: Sport = 'football'
): LiveFixturesHookResult {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveDataAvailable, setLiveDataAvailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isDelayed, setIsDelayed] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams();
      query.set('sport', sport);
      if (competitionCode && competitionCode !== 'ALL') query.set('competition', competitionCode);
      if (status && status !== 'ALL') query.set('status', status);

      const res = await fetch(`/api/v1/fixtures?${query.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setLiveDataAvailable(false);
        const now = new Date();
        const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
        setLastUpdated(prev => prev || stamp);
        setError(`Live data unavailable. Last updated ${stamp}`);
        return;
      }
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        setLiveDataAvailable(false);
        const now = new Date();
        const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
        setLastUpdated(prev => prev || stamp);
        setError(`Live data unavailable. Last updated ${stamp}`);
        return;
      }
      
      const list = json.data || [];
      setFixtures(list);
      setLiveDataAvailable(Boolean(json.liveDataAvailable && list.length > 0));
      setIsDelayed(Boolean(json.isDelayed));
      if (json.lastUpdated) {
        setLastUpdated(json.lastUpdated);
      } else {
        const now = new Date();
        const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
        setLastUpdated(prev => prev || stamp);
      }
      if (json.error && list.length === 0) {
        setError(json.error);
      } else {
        setError(undefined);
      }
    } catch {
      setLiveDataAvailable(false);
      const now = new Date();
      const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
      setLastUpdated(prev => prev || stamp);
      setError(`Live data unavailable. Last updated ${stamp}`);
    } finally {
      setIsLoading(false);
    }
  }, [competitionCode, status, sport]);

  useEffect(() => {
    load();
    // Auto-revalidate every 120 seconds for live updates
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, [load]);

  return { fixtures, isLoading, liveDataAvailable, lastUpdated, isDelayed, error, refetch: load };
}

