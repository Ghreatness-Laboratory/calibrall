'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Lock,
  Play,
  RotateCcw,
  Square,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface CallListItem {
  league: string;
  season: string;
  division: string;
  description: string;
  hasCorners: boolean;
  hasCards: boolean;
  liveDataSource: string;
}

interface BackfillStepResult {
  index: number;
  league: string;
  season: string;
  division: string;
  description: string;
  status: 'ok' | 'error';
  dryRun: boolean;
  sourceUsed?: string;
  matchesFound: number;
  matchesWritten: number;
  previewValidMatches: number;
  skippedRows: number;
  oddsSnapshotsCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  error?: string;
  httpStatus?: number;
}

interface LeagueLatestDate {
  league: string;
  leagueName: string;
  count: number;
  earliestDate: string | null;
  latestDate: string | null;
  daysAgo: number | null;
  isStale: boolean;
  isStale7d?: boolean;
}

interface TeamLatestDate {
  teamId: string;
  name: string;
  shortName: string;
  competitionCode: string;
  matchCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  daysAgo: number | null;
}

interface UnresolvedTeamEntry {
  sourceName: string;
  sourceProvider: string;
  count: number;
  firstSeen?: string;
  lastSeen?: string;
}

interface DataStatusPayload {
  success: boolean;
  timestamp: string;
  totalMatches: number;
  earliestDate: string | null;
  latestDate: string | null;
  storeUsed: 'supabase' | 'in-memory';
  persistenceMode: string;
  aggregationMethod?: string;
  leagueLatestDates: LeagueLatestDate[];
  teamLatestDates: TeamLatestDate[];
  teamsWithUnder8Matches?: {
    teamId: string;
    name: string;
    shortName: string;
    competitionCode: string;
    matchCount: number;
  }[];
  unmatchedNamesCount: number;
  unmatchedNames: string[];
  unresolvedTeamsCount: number;
  unresolvedTeams: UnresolvedTeamEntry[];
  unmappedFixtureNamesCount: number;
  unmappedFixtureNames: { name: string; provider: string }[];
}

type RunState = 'idle' | 'running' | 'stopped' | 'error' | 'completed';
type SeasonWindow = '2122_to_2627' | 'all_route_seasons';

const EUROPEAN_WINDOW_SEASONS = new Set(['2122', '2223', '2324', '2425', '2526', '2627']);
const EXTRA_WINDOW_SEASONS = new Set(['2021', '2022', '2023', '2024', '2025', '2026']);

const LEAGUE_ALIAS_HINT: Record<string, string> = {
  E0: 'PL',
  E1: 'ELC',
  SP1: 'PD',
  I1: 'SA',
  D1: 'BL1',
  F1: 'FL1',
  N1: 'DED',
};

function filterQueueBySeasonWindow(
  items: CallListItem[],
  windowMode: SeasonWindow
): CallListItem[] {
  if (windowMode === 'all_route_seasons') return items;
  return items.filter((item) => {
    const isFourDigitCalendarYear = /^20\d{2}$/.test(item.season) && item.season !== '2021';
    const isExtraCode =
      ['ARG', 'AUT', 'BSA', 'CHN', 'DNK', 'FIN', 'IRL', 'JPN', 'MEX', 'NOR', 'POL', 'ROU', 'RUS', 'SWE', 'SWZ', 'USA'].includes(
        item.league
      ) || isFourDigitCalendarYear;

    if (isExtraCode) {
      return EXTRA_WINDOW_SEASONS.has(item.season);
    }
    return EUROPEAN_WINDOW_SEASONS.has(item.season);
  });
}

function formatLeagueLabel(code: string): string {
  const alias = LEAGUE_ALIAS_HINT[code];
  return alias ? `${code} (${alias})` : code;
}

export default function AdminBackfillClient() {
  // Secret lives ONLY in React component state (never localStorage, sessionStorage, or cookies)
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);

  // Controls
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [seasonWindow, setSeasonWindow] = useState<SeasonWindow>('2122_to_2627');

  // Execution state
  const [runState, setRunState] = useState<RunState>('idle');
  const [queue, setQueue] = useState<CallListItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [waitingDelay, setWaitingDelay] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<BackfillStepResult[]>([]);

  // Post-run data status (populated strictly after authenticated run)
  const [dataStatus, setDataStatus] = useState<DataStatusPayload | null>(null);
  const [dataStatusLoading, setDataStatusLoading] = useState<boolean>(false);
  const [dataStatusError, setDataStatusError] = useState<string | null>(null);
  const [showEmptyLeagues, setShowEmptyLeagues] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const sleepAbortable = useCallback((ms: number, signal: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }, []);

  const fetchDataStatusReport = useCallback(async (secret: string, signal?: AbortSignal) => {
    setDataStatusLoading(true);
    setDataStatusError(null);
    try {
      const res = await fetch('/api/admin/data-status', {
        method: 'GET',
        headers: {
          'x-admin-secret': secret,
        },
        cache: 'no-store',
        signal,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        const msg = json?.error || `HTTP ${res.status} ${res.statusText}`;
        setDataStatusError(`Failed to load /api/admin/data-status: ${msg}`);
        return;
      }

      setDataStatus(json as DataStatusPayload);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setDataStatusError(err?.message || 'Failed to request /api/admin/data-status');
    } finally {
      setDataStatusLoading(false);
    }
  }, []);

  const executeSequence = useCallback(
    async (startIndex: number, existingQueue?: CallListItem[]) => {
      const trimmedSecret = adminSecret;
      if (!trimmedSecret) {
        setRunState('error');
        setErrorMessage('Enter the admin secret before running the backfill.');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      stopRequestedRef.current = false;

      setRunState('running');
      setErrorMessage(null);
      setWaitingDelay(false);
      setDataStatusError(null);

      let activeQueue = existingQueue || queue;

      // Fresh run: fetch authoritative callList from /api/admin/backfill (also verifies auth)
      if (startIndex === 0 || activeQueue.length === 0) {
        setResults([]);
        setDataStatus(null);
        setFailedIndex(null);
        setCurrentIndex(-1);

        try {
          const listRes = await fetch('/api/admin/backfill', {
            method: 'GET',
            headers: {
              'x-admin-secret': trimmedSecret,
            },
            cache: 'no-store',
            signal: controller.signal,
          });

          const listText = await listRes.text();
          let listJson: any = null;
          try {
            listJson = JSON.parse(listText);
          } catch {
            listJson = null;
          }

          if (!listRes.ok) {
            setRunState('error');
            setErrorMessage(
              `HTTP ${listRes.status}: ${listJson?.error || listRes.statusText || 'Unauthorized'}`
            );
            return;
          }

          const rawCallList: CallListItem[] = Array.isArray(listJson?.callList)
            ? listJson.callList
            : [];
          activeQueue = filterQueueBySeasonWindow(rawCallList, seasonWindow);
          setQueue(activeQueue);
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            setRunState('stopped');
            return;
          }
          setRunState('error');
          setErrorMessage(err?.message || 'Failed to fetch backfill call list.');
          return;
        }
      }

      if (activeQueue.length === 0) {
        setRunState('error');
        setErrorMessage('Backfill call list returned zero league and season combinations.');
        return;
      }

      for (let i = startIndex; i < activeQueue.length; i++) {
        if (stopRequestedRef.current || controller.signal.aborted) {
          setFailedIndex(i);
          setRunState('stopped');
          setWaitingDelay(false);
          return;
        }

        const item = activeQueue[i];
        setCurrentIndex(i);
        setWaitingDelay(false);

        const endpoint = `/api/admin/backfill?league=${encodeURIComponent(
          item.league
        )}&season=${encodeURIComponent(item.season)}&dryRun=${dryRun ? 'true' : 'false'}`;

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'x-admin-secret': trimmedSecret,
            },
            cache: 'no-store',
            signal: controller.signal,
          });

          const text = await res.text();
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }

          if (!res.ok || !json?.success) {
            const exactError =
              json?.error ||
              (text && text.length < 300 ? text : `HTTP ${res.status} ${res.statusText}`);

            const failedEntry: BackfillStepResult = {
              index: i,
              league: item.league,
              season: item.season,
              division: item.division,
              description: item.description,
              status: 'error',
              dryRun,
              matchesFound: typeof json?.rowsFetched === 'number' ? json.rowsFetched : 0,
              matchesWritten: 0,
              previewValidMatches: 0,
              skippedRows: typeof json?.rowsSkipped === 'number' ? json.rowsSkipped : 0,
              oddsSnapshotsCount: 0,
              earliestDate: null,
              latestDate: null,
              error: `HTTP ${res.status}: ${exactError}`,
              httpStatus: res.status,
            };

            setResults((prev) => {
              const filtered = prev.filter((r) => r.index !== i);
              return [failedEntry, ...filtered];
            });
            setFailedIndex(i);
            setErrorMessage(`${item.league} ${item.season}: HTTP ${res.status} — ${exactError}`);
            setRunState('error');
            setWaitingDelay(false);
            return;
          }

          const stepEntry: BackfillStepResult = {
            index: i,
            league: item.league,
            season: item.season,
            division: item.division,
            description: item.description,
            status: 'ok',
            dryRun: Boolean(json.dryRun),
            sourceUsed: json.sourceUsed,
            matchesFound: Number(json.rowsFetched ?? 0),
            matchesWritten: json.dryRun ? 0 : Number(json.rowsInserted ?? 0),
            previewValidMatches: Number(json.rowsInserted ?? 0),
            skippedRows: Number(json.rowsSkipped ?? 0),
            oddsSnapshotsCount: Number(json.oddsSnapshotsCount ?? 0),
            earliestDate: json.earliestDate ?? null,
            latestDate: json.latestDate ?? null,
          };

          setResults((prev) => {
            const filtered = prev.filter((r) => r.index !== i);
            return [stepEntry, ...filtered];
          });
          setFailedIndex(null);
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            setFailedIndex(i);
            setRunState('stopped');
            setWaitingDelay(false);
            return;
          }

          const errMsg = err?.message || 'Network request failed';
          const failedEntry: BackfillStepResult = {
            index: i,
            league: item.league,
            season: item.season,
            division: item.division,
            description: item.description,
            status: 'error',
            dryRun,
            matchesFound: 0,
            matchesWritten: 0,
            previewValidMatches: 0,
            skippedRows: 0,
            oddsSnapshotsCount: 0,
            earliestDate: null,
            latestDate: null,
            error: errMsg,
          };

          setResults((prev) => {
            const filtered = prev.filter((r) => r.index !== i);
            return [failedEntry, ...filtered];
          });
          setFailedIndex(i);
          setErrorMessage(`${item.league} ${item.season}: ${errMsg}`);
          setRunState('error');
          setWaitingDelay(false);
          return;
        }

        // Wait 1 second before the next call
        if (i < activeQueue.length - 1) {
          setWaitingDelay(true);
          try {
            await sleepAbortable(1000, controller.signal);
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              setFailedIndex(i + 1);
              setRunState('stopped');
              setWaitingDelay(false);
              return;
            }
          }
          setWaitingDelay(false);
        }
      }

      setCurrentIndex(-1);
      setFailedIndex(null);
      setRunState('completed');
      await fetchDataStatusReport(trimmedSecret, controller.signal);
    },
    [adminSecret, dryRun, fetchDataStatusReport, queue, seasonWindow, sleepAbortable]
  );

  const handleStop = () => {
    stopRequestedRef.current = true;
    abortRef.current?.abort();
  };

  const completedOkCount = results.filter((r) => r.status === 'ok').length;
  const totalFound = results.reduce((sum, r) => sum + r.matchesFound, 0);
  const totalWritten = results.reduce((sum, r) => sum + r.matchesWritten, 0);
  const totalPreviewReady = results.reduce((sum, r) => sum + r.previewValidMatches, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skippedRows, 0);
  const progressPct = queue.length > 0 ? Math.min(100, Math.round((completedOkCount / queue.length) * 100)) : 0;

  const activeItem =
    runState === 'running' && currentIndex >= 0 && currentIndex < queue.length
      ? queue[currentIndex]
      : null;

  const latestDateByTeamId = new Map(
    (dataStatus?.teamLatestDates || []).map((t) => [t.teamId, t.latestDate] as const)
  );

  const teamsUnder8Matches = dataStatus
    ? (Array.isArray(dataStatus.teamsWithUnder8Matches)
        ? dataStatus.teamsWithUnder8Matches
            .map((t) => ({
              ...t,
              latestDate: latestDateByTeamId.get(t.teamId) ?? null,
            }))
            .sort((a, b) => a.matchCount - b.matchCount || a.name.localeCompare(b.name))
        : dataStatus.teamLatestDates
            .filter((t) => t.matchCount < 8)
            .sort((a, b) => a.matchCount - b.matchCount || a.name.localeCompare(b.name)))
    : [];

  const visibleLeagues = dataStatus
    ? (showEmptyLeagues
        ? dataStatus.leagueLatestDates
        : dataStatus.leagueLatestDates.filter((l) => l.count > 0))
    : [];

  const totalUnresolvedCount = dataStatus
    ? dataStatus.unmatchedNamesCount +
      dataStatus.unmappedFixtureNamesCount +
      dataStatus.unresolvedTeamsCount
    : 0;

  return (
    <div className="space-y-4 pb-6 min-w-0">
      {/* Header */}
      <header className="border-b border-[#1F2A24] pb-3 space-y-1">
        <div className="flex items-center gap-2 text-[#E9EFEB]">
          <Lock className="w-4 h-4 text-[#B8E636] shrink-0" strokeWidth={2} />
          <h1 className="text-[18px] font-semibold tracking-tight">
            Admin Backfill Runner
          </h1>
        </div>
        <p className="text-[12.5px] text-[#8B9892] leading-relaxed">
          Sequential historical ingestion across all supported leagues and seasons. Protected by{' '}
          <code className="font-mono text-[11.5px] text-[#E9EFEB]">x-admin-secret</code> in memory only.
        </p>
      </header>

      {/* Authentication & Controls Panel */}
      <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 space-y-4">
        {/* Secret Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="admin-secret-input"
            className="block text-[12px] font-medium text-[#E9EFEB]"
          >
            Admin secret
          </label>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                id="admin-secret-input"
                type={showSecret ? 'text' : 'password'}
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Paste ADMIN_SECRET (kept in memory only)"
                disabled={runState === 'running'}
                className="w-full min-h-[44px] px-3 pr-11 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24] focus:border-[#B8E636] focus:outline-none text-[13px] font-mono text-[#E9EFEB] placeholder:text-[#5E6B65] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowSecret((prev) => !prev)}
                aria-label={showSecret ? 'Hide admin secret' : 'Show admin secret'}
                className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-[#8B9892] hover:text-[#E9EFEB]"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {adminSecret.length > 0 && runState !== 'running' && (
              <button
                type="button"
                onClick={() => {
                  setAdminSecret('');
                  setDataStatus(null);
                  setResults([]);
                  setQueue([]);
                  setFailedIndex(null);
                  setErrorMessage(null);
                  setRunState('idle');
                }}
                className="min-h-[44px] px-3 rounded-[10px] border border-[#1F2A24] bg-[#151D19] text-[12px] font-medium text-[#8B9892] hover:text-[#E9EFEB] whitespace-nowrap shrink-0"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#5E6B65]">
            Never stored in localStorage, sessionStorage, or cookies. Sent only as the{' '}
            <span className="font-mono text-[#8B9892]">x-admin-secret</span> header to{' '}
            <span className="font-mono text-[#8B9892]">/api/admin/*</span>.
          </p>
        </div>

        {/* Dry run toggle + Season window */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#1F2A24]">
          {/* Dry Run Toggle */}
          <div className="flex items-center justify-between gap-3 py-1">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[#E9EFEB]">Dry run</div>
              <div className="text-[11px] text-[#8B9892]">
                {dryRun
                  ? 'On: parses CSVs and reports counts with zero DB writes'
                  : 'Off: writes idempotent match and odds upserts to DB'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dryRun}
              aria-label="Dry run toggle"
              disabled={runState === 'running'}
              onClick={() => setDryRun((prev) => !prev)}
              className={`relative shrink-0 w-[52px] min-h-[44px] flex items-center px-1 rounded-[10px] border transition-colors disabled:opacity-50 ${
                dryRun
                  ? 'bg-[#B8E636]/15 border-[#B8E636]/50 justify-end'
                  : 'bg-[#151D19] border-[#1F2A24] justify-start'
              }`}
            >
              <span
                className={`w-[22px] h-[24px] rounded-[6px] transition-colors ${
                  dryRun ? 'bg-[#B8E636]' : 'bg-[#5E6B65]'
                }`}
              />
            </button>
          </div>

          {/* Season Window Selector */}
          <div className="space-y-1">
            <label
              htmlFor="season-window-select"
              className="block text-[11.5px] font-medium text-[#8B9892]"
            >
              Season scope
            </label>
            <select
              id="season-window-select"
              value={seasonWindow}
              disabled={runState === 'running'}
              onChange={(e) => setSeasonWindow(e.target.value as SeasonWindow)}
              className="w-full min-h-[44px] px-3 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24] text-[12.5px] text-[#E9EFEB] focus:border-[#B8E636] focus:outline-none disabled:opacity-50"
            >
              <option value="2122_to_2627">2021/22 to 2026/27 (228 calls)</option>
              <option value="all_route_seasons">All route seasons incl. 2020/21 (266 calls)</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          {runState !== 'running' ? (
            <button
              type="button"
              onClick={() => executeSequence(0)}
              className="w-full sm:w-auto flex-1 min-h-[46px] px-4 rounded-[10px] bg-[#B8E636] hover:bg-[#c5ef4b] active:scale-[0.99] text-[#0A0E0C] font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all whitespace-nowrap"
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>{dryRun ? 'Run backfill (Dry run)' : 'Run backfill (Live write)'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="w-full sm:w-auto flex-1 min-h-[46px] px-4 rounded-[10px] bg-[#151D19] hover:bg-[#1b2620] border border-[#E8B04A]/40 text-[#E8B04A] font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Square className="w-4 h-4 shrink-0" />
              <span>Stop after current request</span>
            </button>
          )}

          {(runState === 'error' || runState === 'stopped') &&
            failedIndex !== null &&
            queue.length > 0 && (
              <button
                type="button"
                onClick={() => executeSequence(failedIndex, queue)}
                className="w-full sm:w-auto min-h-[46px] px-4 rounded-[10px] bg-[#151D19] hover:bg-[#1c2621] border border-[#B8E636]/50 text-[#B8E636] font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>
                  Retry from here ({queue[failedIndex]?.league} {queue[failedIndex]?.season})
                </span>
              </button>
            )}
        </div>
      </section>

      {/* Error Alert */}
      {errorMessage && (
        <section
          role="alert"
          className="bg-[#1A1011] border border-red-500/40 rounded-[14px] p-4 space-y-2"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <div className="text-[13px] font-semibold text-red-300">
                Backfill halted on error
              </div>
              <p className="text-[12px] font-mono text-red-200/90 break-words">
                {errorMessage}
              </p>
            </div>
          </div>
          {failedIndex !== null && queue[failedIndex] && (
            <div className="pt-1 flex items-center justify-between gap-2 border-t border-red-500/20 text-[11.5px] text-red-200/80">
              <span className="tabular-nums">
                Stopped at step {failedIndex + 1} of {queue.length}
              </span>
              <button
                type="button"
                onClick={() => executeSequence(failedIndex, queue)}
                className="min-h-[44px] px-3 rounded-[8px] bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-200 font-semibold whitespace-nowrap"
              >
                Retry from here
              </button>
            </div>
          )}
        </section>
      )}

      {/* Progress & Counters (only shown once a run starts) */}
      {(queue.length > 0 || results.length > 0) && (
        <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {runState === 'running' ? (
                <Loader2 className="w-4 h-4 text-[#B8E636] animate-spin shrink-0" />
              ) : runState === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-[#B8E636] shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-[#E8B04A] shrink-0" />
              )}
              <span className="text-[13px] font-semibold text-[#E9EFEB] truncate">
                {runState === 'running' && activeItem
                  ? waitingDelay
                    ? `Completed ${formatLeagueLabel(activeItem.league)} ${activeItem.season} · waiting 1s`
                    : `Fetching ${formatLeagueLabel(activeItem.league)} ${activeItem.season}`
                  : runState === 'completed'
                  ? `Run complete (${completedOkCount} of ${queue.length})`
                  : runState === 'stopped'
                  ? `Stopped at ${completedOkCount} of ${queue.length}`
                  : `Paused at ${completedOkCount} of ${queue.length}`}
              </span>
            </div>
            <span className="text-[12px] font-mono tabular-nums text-[#8B9892] shrink-0">
              {completedOkCount} / {queue.length} ({progressPct}%)
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-[4px] bg-[#0A0E0C] border border-[#1F2A24] overflow-hidden">
            <div
              className="h-full bg-[#B8E636] transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Aggregate counters */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
              <div className="text-[10.5px] text-[#8B9892]">Matches found</div>
              <div className="text-[16px] font-semibold font-mono tabular-nums text-[#E9EFEB] mt-0.5">
                {totalFound.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
              <div className="text-[10.5px] text-[#8B9892]">
                {dryRun ? 'Written (preview)' : 'Matches written'}
              </div>
              <div className="text-[16px] font-semibold font-mono tabular-nums text-[#B8E636] mt-0.5">
                {dryRun
                  ? `0 (${totalPreviewReady.toLocaleString()})`
                  : totalWritten.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
              <div className="text-[10.5px] text-[#8B9892]">Skipped rows</div>
              <div className="text-[16px] font-semibold font-mono tabular-nums text-[#E8B04A] mt-0.5">
                {totalSkipped.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Per League-Season Live Log */}
          {results.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-[#1F2A24]">
              <div className="flex items-center justify-between text-[11.5px] text-[#8B9892]">
                <span>Sequential call log (latest first)</span>
                <span className="font-mono tabular-nums">{results.length} logged</span>
              </div>

              {/* Mobile card layout (<640px) */}
              <div className="sm:hidden divide-y divide-[#1F2A24] border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] max-h-[340px] overflow-y-auto">
                {results.map((r) => (
                  <div key={`${r.league}-${r.season}-${r.index}`} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold font-mono text-[#E9EFEB]">
                        {formatLeagueLabel(r.league)} · {r.season}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-medium ${
                          r.status === 'ok' ? 'text-[#B8E636]' : 'text-red-400'
                        }`}
                      >
                        {r.status === 'ok' ? (r.dryRun ? 'Dry run OK' : 'Written') : 'Failed'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                      <div>
                        <span className="text-[#5E6B65]">Found </span>
                        <span className="text-[#E9EFEB]">{r.matchesFound}</span>
                      </div>
                      <div>
                        <span className="text-[#5E6B65]">Written </span>
                        <span className="text-[#B8E636]">
                          {r.dryRun ? `0 (${r.previewValidMatches})` : r.matchesWritten}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5E6B65]">Skipped </span>
                        <span className="text-[#E8B04A]">{r.skippedRows}</span>
                      </div>
                    </div>
                    {r.error && (
                      <div className="text-[11px] font-mono text-red-300 break-words">
                        {r.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table layout (>=640px) */}
              <div className="hidden sm:block border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-[#101613] text-[#8B9892] border-b border-[#1F2A24] text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium">League</th>
                      <th className="py-2 px-3 font-medium">Season</th>
                      <th className="py-2 px-3 font-medium text-right">Found</th>
                      <th className="py-2 px-3 font-medium text-right">Written</th>
                      <th className="py-2 px-3 font-medium text-right">Skipped</th>
                      <th className="py-2 px-3 font-medium">Date range</th>
                      <th className="py-2 px-3 font-medium text-right">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2A24] font-mono tabular-nums text-[11.5px]">
                    {results.map((r) => (
                      <tr key={`${r.league}-${r.season}-${r.index}`} className="hover:bg-[#151D19]/60">
                        <td className="py-2 px-3 text-[#E9EFEB] font-semibold">
                          {formatLeagueLabel(r.league)}
                        </td>
                        <td className="py-2 px-3 text-[#8B9892]">{r.season}</td>
                        <td className="py-2 px-3 text-right text-[#E9EFEB]">{r.matchesFound}</td>
                        <td className="py-2 px-3 text-right text-[#B8E636]">
                          {r.dryRun ? `0 (${r.previewValidMatches})` : r.matchesWritten}
                        </td>
                        <td className="py-2 px-3 text-right text-[#E8B04A]">{r.skippedRows}</td>
                        <td className="py-2 px-3 text-[#8B9892]">
                          {r.earliestDate && r.latestDate
                            ? `${r.earliestDate.slice(0, 10)} → ${r.latestDate.slice(0, 10)}`
                            : 'N/A'}
                        </td>
                        <td
                          className={`py-2 px-3 text-right ${
                            r.status === 'ok' ? 'text-[#B8E636]' : 'text-red-400'
                          }`}
                        >
                          {r.status === 'ok' ? (r.dryRun ? 'Dry run OK' : 'Written') : 'Failed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Post-Run Data Status Summary (ONLY rendered after authenticated /api/admin/data-status call) */}
      {dataStatusLoading && (
        <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 flex items-center gap-2.5 text-[12.5px] text-[#8B9892]">
          <Loader2 className="w-4 h-4 text-[#B8E636] animate-spin shrink-0" />
          <span>Loading database status from /api/admin/data-status...</span>
        </section>
      )}

      {dataStatusError && (
        <section
          role="alert"
          className="bg-[#1A1011] border border-red-500/40 rounded-[14px] p-4 space-y-2 text-[12px] text-red-200"
        >
          <div className="flex items-center gap-2 font-semibold text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Data status check failed</span>
          </div>
          <p className="font-mono break-words">{dataStatusError}</p>
        </section>
      )}

      {dataStatus && (
        <div className="space-y-4">
          {/* Summary Header */}
          <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1F2A24] pb-2.5">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#B8E636] shrink-0" />
                <h2 className="text-[14px] font-semibold text-[#E9EFEB]">
                  Database Data Status
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#8B9892]">
                Store: {dataStatus.storeUsed} ({dataStatus.persistenceMode}
                {dataStatus.aggregationMethod ? ` · ${dataStatus.aggregationMethod}` : ''})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
                <div className="text-[10.5px] text-[#8B9892]">Matches stored</div>
                <div className="text-[16px] font-semibold font-mono tabular-nums text-[#E9EFEB] mt-0.5">
                  {dataStatus.totalMatches.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
                <div className="text-[10.5px] text-[#8B9892]">Latest match date</div>
                <div className="text-[14px] font-semibold font-mono tabular-nums text-[#B8E636] mt-1">
                  {dataStatus.latestDate ? dataStatus.latestDate.slice(0, 10) : 'None'}
                </div>
              </div>
              <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
                <div className="text-[10.5px] text-[#8B9892]">Teams under 8 matches</div>
                <div className="text-[16px] font-semibold font-mono tabular-nums text-[#E8B04A] mt-0.5">
                  {teamsUnder8Matches.length.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24]">
                <div className="text-[10.5px] text-[#8B9892]">Unresolved names</div>
                <div className="text-[16px] font-semibold font-mono tabular-nums text-[#E9EFEB] mt-0.5">
                  {totalUnresolvedCount.toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          {/* Matches stored & Latest match date per league */}
          <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-[13.5px] font-semibold text-[#E9EFEB]">
                Matches stored &amp; latest match date per league
              </h3>
              <button
                type="button"
                onClick={() => setShowEmptyLeagues((prev) => !prev)}
                className="min-h-[44px] sm:min-h-[36px] px-3 rounded-[8px] border border-[#1F2A24] bg-[#0A0E0C] text-[11.5px] text-[#8B9892] hover:text-[#E9EFEB] text-left sm:text-center whitespace-nowrap"
              >
                {showEmptyLeagues
                  ? `Showing all (${dataStatus.leagueLatestDates.length})`
                  : `Showing populated (${visibleLeagues.length} of ${dataStatus.leagueLatestDates.length})`}
              </button>
            </div>

            {visibleLeagues.length === 0 ? (
              <div className="p-3 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24] text-[12px] text-[#8B9892]">
                No matches stored in the database yet. Toggle Dry run off to persist matches.
              </div>
            ) : (
              <>
                {/* Mobile list */}
                <div className="sm:hidden divide-y divide-[#1F2A24] border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C]">
                  {visibleLeagues.map((lg) => (
                    <div key={lg.league} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-[#E9EFEB] truncate">
                          {lg.leagueName}
                        </div>
                        <div className="text-[11px] font-mono text-[#8B9892]">
                          {formatLeagueLabel(lg.league)} · Latest{' '}
                          {lg.latestDate ? lg.latestDate.slice(0, 10) : 'None'}
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div className="text-[13px] font-semibold text-[#B8E636]">
                          {lg.count.toLocaleString()}
                        </div>
                        <div className="text-[10.5px] text-[#5E6B65]">matches</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-[#151D19] text-[#8B9892] border-b border-[#1F2A24] text-[11px]">
                      <tr>
                        <th className="py-2 px-3 font-medium">Code</th>
                        <th className="py-2 px-3 font-medium">League</th>
                        <th className="py-2 px-3 font-medium text-right">Matches stored</th>
                        <th className="py-2 px-3 font-medium">Earliest match</th>
                        <th className="py-2 px-3 font-medium">Latest match date</th>
                        <th className="py-2 px-3 font-medium text-right">Age (days)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2A24] font-mono tabular-nums text-[11.5px]">
                      {visibleLeagues.map((lg) => (
                        <tr key={lg.league} className="hover:bg-[#151D19]/50">
                          <td className="py-2 px-3 text-[#B8E636] font-semibold">
                            {formatLeagueLabel(lg.league)}
                          </td>
                          <td className="py-2 px-3 font-sans text-[#E9EFEB]">{lg.leagueName}</td>
                          <td className="py-2 px-3 text-right text-[#E9EFEB]">
                            {lg.count.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-[#8B9892]">
                            {lg.earliestDate ? lg.earliestDate.slice(0, 10) : 'None'}
                          </td>
                          <td className="py-2 px-3 text-[#E9EFEB]">
                            {lg.latestDate ? lg.latestDate.slice(0, 10) : 'None'}
                          </td>
                          <td className="py-2 px-3 text-right text-[#8B9892]">
                            {lg.daysAgo !== null ? lg.daysAgo : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Teams under 8 matches */}
          <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13.5px] font-semibold text-[#E9EFEB]">
                Teams under 8 matches
              </h3>
              <span className="text-[11.5px] font-mono tabular-nums text-[#E8B04A]">
                {teamsUnder8Matches.length} clubs
              </span>
            </div>

            {teamsUnder8Matches.length === 0 ? (
              <div className="p-3 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24] text-[12px] text-[#B8E636]">
                All registered clubs have at least 8 matches stored.
              </div>
            ) : (
              <div className="border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] max-h-[280px] overflow-y-auto divide-y divide-[#1F2A24]">
                {teamsUnder8Matches.map((team) => (
                  <div
                    key={team.teamId}
                    className="p-2.5 px-3 flex items-center justify-between gap-2 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="text-[#E9EFEB] font-medium truncate">{team.name}</div>
                      <div className="text-[11px] font-mono text-[#8B9892]">
                        {team.competitionCode} · Latest{' '}
                        {team.latestDate ? team.latestDate.slice(0, 10) : 'None'}
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-[12px] font-semibold text-[#E8B04A] shrink-0">
                      {team.matchCount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Unresolved names */}
          <section className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13.5px] font-semibold text-[#E9EFEB]">
                Unresolved names
              </h3>
              <span className="text-[11.5px] font-mono tabular-nums text-[#8B9892]">
                {totalUnresolvedCount} entries
              </span>
            </div>

            {totalUnresolvedCount === 0 ? (
              <div className="p-3 rounded-[10px] bg-[#0A0E0C] border border-[#1F2A24] text-[12px] text-[#B8E636]">
                Zero unresolved team or fixture names logged.
              </div>
            ) : (
              <div className="space-y-2.5">
                {dataStatus.unresolvedTeams.length > 0 && (
                  <div className="border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] divide-y divide-[#1F2A24] max-h-[220px] overflow-y-auto">
                    {dataStatus.unresolvedTeams.map((entry, idx) => (
                      <div
                        key={`${entry.sourceProvider}-${entry.sourceName}-${idx}`}
                        className="p-2.5 px-3 flex items-center justify-between gap-2 text-[11.5px]"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[#E9EFEB] truncate">{entry.sourceName}</div>
                          <div className="text-[10.5px] text-[#8B9892] truncate">
                            {entry.sourceProvider}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-[#E8B04A] shrink-0">
                          {entry.count}x
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {dataStatus.unmappedFixtureNames.length > 0 && (
                  <div className="border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] divide-y divide-[#1F2A24] max-h-[180px] overflow-y-auto">
                    {dataStatus.unmappedFixtureNames.map((entry, idx) => (
                      <div
                        key={`${entry.provider}-${entry.name}-${idx}`}
                        className="p-2.5 px-3 flex items-center justify-between gap-2 text-[11.5px]"
                      >
                        <span className="font-mono text-[#E9EFEB] truncate">{entry.name}</span>
                        <span className="text-[10.5px] text-[#8B9892] shrink-0">
                          {entry.provider}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {dataStatus.unmatchedNames.length > 0 && (
                  <div className="border border-[#1F2A24] rounded-[10px] bg-[#0A0E0C] p-3 text-[11.5px] font-mono text-[#E8B04A] space-y-1 max-h-[180px] overflow-y-auto">
                    {dataStatus.unmatchedNames.map((name, idx) => (
                      <div key={`${name}-${idx}`}>{name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
