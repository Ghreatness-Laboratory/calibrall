'use client';

import React, { useState, useEffect } from 'react';
import { Database, AlertTriangle, CheckCircle2, RefreshCw, Key, Terminal, Copy, Check } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface LeagueSeasonStat {
  league: string;
  season: string;
  count: number;
  earliestDate: string;
  latestDate: string;
}

interface UnderSampledTeam {
  teamId: string;
  name: string;
  shortName: string;
  competitionCode: string;
  matchCount: number;
}

interface LeagueFeatureCoverage {
  cards: boolean;
  corners: boolean;
  halfTimeGoals: boolean;
  referee: boolean;
  asianHandicapPrices: boolean;
  cardsCount: number;
  cornersCount: number;
  halfTimeGoalsCount: number;
  refereeCount: number;
  asianHandicapCount: number;
  cardsSeasons?: number;
  cornersSeasons?: number;
  halfTimeGoalsSeasons?: number;
  refereeSeasons?: number;
  asianHandicapSeasons?: number;
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
  features?: LeagueFeatureCoverage;
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
  isStale: boolean;
}

interface DataStatusData {
  totalMatches: number;
  earliestDate: string | null;
  latestDate: string | null;
  matchesPerLeagueAndSeason: LeagueSeasonStat[];
  leagueLatestDates?: LeagueLatestDate[];
  teamLatestDates?: TeamLatestDate[];
  teamsWithFewerThan10Matches: UnderSampledTeam[];
  unmatchedNamesCount?: number;
  unmatchedNames?: string[];
  unresolvedTeamsCount?: number;
  unresolvedTeams?: {
    sourceName: string;
    sourceProvider: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }[];
  unmappedFixtureNamesCount?: number;
  unmappedFixtureNames?: { name: string; provider: string }[];
  storeUsed?: 'supabase' | 'local-sqlite' | 'in-memory';
  persistenceMode?: string;
  skippedLeagues?: {
    leagueCode: string;
    leagueName: string;
    tier: number;
    provider: string;
    reason: string;
  }[];
  providerSyncStates?: {
    id: string;
    providerName: string;
    status: string;
    lastSuccessAt: string | null;
    quotaRemaining: string | null;
    callsToday: number;
    lastError: string | null;
  }[];
  basketball?: {
    totalGames: number;
    totalTeams: number;
    earliestDate: string | null;
    latestDate: string | null;
    unresolvedTeamsCount: number;
    unresolvedTeams: {
      sourceName: string;
      sourceProvider: string;
      count: number;
    }[];
    leagueSummary: {
      league: string;
      count: number;
      finishedCount: number;
      withHalfScoresCount: number;
      halfScoresPct: number;
      earliestDate: string | null;
      latestDate: string | null;
      daysAgo: number | null;
    }[];
    gamesPerLeagueAndSeason: {
      league: string;
      season: string;
      count: number;
      finishedCount: number;
      withHalfScoresCount: number;
      halfScoresPct: number;
      earliestDate: string | null;
      latestDate: string | null;
    }[];
  };
}

export default function DataStatusDiagnostics() {
  const [data, setData] = useState<DataStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [publicNote, setPublicNote] = useState<string | null>(null);
  const [adminSecretInput, setAdminSecretInput] = useState<string>('');
  const [isSecretSaved, setIsSecretSaved] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');

  const exampleCalls = [
    { league: 'ELC', season: '2627', desc: 'Championship 2026-27 (Current in-play) · Corners & cards' },
    { league: 'ELC', season: '2526', desc: 'Championship 2025-26 · Corners & cards' },
    { league: 'PL', season: '2627', desc: 'Premier League 2026-27 (Current in-play) · Corners & cards' },
    { league: 'PL', season: '2526', desc: 'Premier League 2025-26 · Corners & cards' },
    { league: 'PD', season: '2627', desc: 'La Liga 2026-27 (Current in-play) · Corners & cards' },
    { league: 'PD', season: '2526', desc: 'La Liga 2025-26 · Corners & cards' },
    { league: 'BL1', season: '2627', desc: 'Bundesliga 2026-27 (Current in-play) · Corners & cards' },
    { league: 'BL1', season: '2526', desc: 'Bundesliga 2025-26 · Corners & cards' },
    { league: 'SA', season: '2627', desc: 'Serie A 2026-27 (Current in-play) · Corners & cards' },
    { league: 'SA', season: '2526', desc: 'Serie A 2025-26 · Corners & cards' },
    { league: 'FL1', season: '2627', desc: 'Ligue 1 2026-27 (Current in-play) · Corners & cards' },
    { league: 'FL1', season: '2526', desc: 'Ligue 1 2025-26 · Corners & cards' },
    { league: 'DED', season: '2627', desc: 'Eredivisie 2026-27 (Current in-play) · Corners & cards' },
    { league: 'DED', season: '2526', desc: 'Eredivisie 2025-26 · Corners & cards' },
    { league: 'P1', season: '2627', desc: 'Primeira Liga 2026-27 (Current in-play) · Corners & cards' },
    { league: 'P1', season: '2526', desc: 'Primeira Liga 2025-26 · Corners & cards' },
    { league: 'T1', season: '2627', desc: 'Turkey Süper Lig 2026-27 (Current in-play) · Corners & cards' },
    { league: 'T1', season: '2526', desc: 'Turkey Süper Lig 2025-26 · Corners & cards' },
    { league: 'SC0', season: '2627', desc: 'Scotland Premiership 2026-27 (Current in-play) · Corners & cards' },
    { league: 'SC0', season: '2526', desc: 'Scotland Premiership 2025-26 · Corners & cards' },
    { league: 'DNK', season: '2026', desc: 'Denmark Superliga · Goals only' },
    { league: 'NOR', season: '2026', desc: 'Norway Eliteserien · Goals only' },
    { league: 'FIN', season: '2026', desc: 'Finland Veikkausliiga · Goals only' },
    { league: 'JPN', season: '2026', desc: 'Japan J1 League · Goals only' },
    { league: 'ARG', season: '2026', desc: 'Argentina Liga Profesional · Goals only' },
    { league: 'BSA', season: '2026', desc: 'Brazil Série A 2026 · Goals only' },
    { league: 'BSA', season: '2025', desc: 'Brazil Série A 2025 · Goals only' },
  ];

  const fetchPublicHealthFallback = async (reasonMsg: string) => {
    const res = await fetch('/api/health/data', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(reasonMsg);
    }
    const json = await res.json();
    setData({
      totalMatches: json.storeStats?.totalMatches ?? 0,
      earliestDate: json.storeStats?.earliestDate ?? null,
      latestDate: json.storeStats?.latestDate ?? null,
      matchesPerLeagueAndSeason: [],
      teamsWithFewerThan10Matches: [],
      unmatchedNamesCount: json.unmatchedTeams?.count ?? 0,
      unresolvedTeamsCount: json.unresolvedTeams?.count ?? 0,
      storeUsed: json.basketball?.storeUsed || 'local-sqlite',
      basketball: json.basketball || undefined,
    });
    setPublicNote(reasonMsg);
  };

  const fetchDataStatus = async (secretOverride?: string) => {
    setLoading(true);
    setError(null);
    setPublicNote(null);
    const secret = secretOverride !== undefined ? secretOverride : adminSecretInput;

    try {
      const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      if (!secret && !isAdminRoute) {
        await fetchPublicHealthFallback('Public database coverage summary.');
        return;
      }

      const headers: Record<string, string> = {};
      if (secret) {
        headers['x-admin-secret'] = secret;
      }

      const res = await fetch('/api/admin/data-status', {
        headers,
        cache: 'no-store',
      });

      if (res.status === 503) {
        await fetchPublicHealthFallback(
          'ADMIN_SECRET is not configured. Displaying public database coverage summary.'
        );
        return;
      }

      if (res.status === 401) {
        await fetchPublicHealthFallback(
          'Admin diagnostics locked. Displaying public database coverage summary.'
        );
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        throw new Error(json.error || 'Failed to load data status');
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading data status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('calibrall_admin_secret') : null;
    if (saved) {
      setAdminSecretInput(saved);
      setIsSecretSaved(true);
      fetchDataStatus(saved);
    } else {
      fetchDataStatus('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('calibrall_admin_secret', adminSecretInput.trim());
      setIsSecretSaved(true);
    }
    fetchDataStatus(adminSecretInput.trim());
  };

  const handleCopyCommand = (cmd: string, index: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
        <div>
          <div className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
            <Database className="w-4 h-4 text-[var(--accent)]" />
            <span>Database status &amp; historical coverage</span>
          </div>
          <p className="text-[12px] text-[var(--text-2)] mt-0.5">
            Diagnostic verification joining the teams table and multi-season ingestion pipeline.
          </p>
        </div>
        <button
          onClick={() => fetchDataStatus()}
          disabled={loading}
          type="button"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] transition-colors disabled:opacity-50 touch-press"
          title="Refresh data status"
          aria-label="Refresh data status"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Admin Secret Bar */}
      <form
        onSubmit={handleSaveSecret}
        className="flex items-center gap-2 bg-[var(--surface-2)] p-1.5 pl-3 rounded-[12px] border border-[var(--line)]"
      >
        <Key className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <input
          type="password"
          placeholder="Enter x-admin-secret..."
          value={adminSecretInput}
          onChange={(e) => setAdminSecretInput(e.target.value)}
          className="bg-transparent text-[12px] font-mono text-[var(--text)] placeholder-[var(--text-3)] flex-1 outline-none min-w-0 min-h-[40px]"
        />
        <button
          type="submit"
          disabled={loading || adminSecretInput.length < 5}
          className="min-h-[40px] px-3.5 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[11.5px] font-semibold hover:opacity-90 disabled:opacity-50 shrink-0 touch-press"
        >
          {loading ? 'Checking...' : isSecretSaved ? 'Update key' : 'Authorize'}
        </button>
      </form>

      {loading && !data && (
        <div className="space-y-2.5 animate-pulse py-2">
          <div className="h-10 bg-[var(--surface-2)] rounded-[12px]" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
          </div>
        </div>
      )}

      {publicNote && (
        <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-[12px] text-[var(--text-2)]">
          <span className="font-semibold text-[var(--text)]">Public coverage mode: </span>
          {publicNote}
        </div>
      )}

      {error && (
        <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] text-[12px] text-[var(--medium)]">
          <span className="font-semibold text-[var(--text)]">Status: </span>
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {/* Active Store Indicator */}
          <div className="flex items-center justify-between px-3 py-2 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[11.5px]">
            <span className="text-[var(--text-2)]">Active store source</span>
            <span
              className={`font-semibold px-2.5 py-0.5 rounded-full border text-[10.5px] ${
                data.storeUsed === 'supabase' || data.storeUsed === 'local-sqlite'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  : 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
              }`}
            >
              {data.storeUsed === 'supabase'
                ? 'Supabase production'
                : data.storeUsed === 'local-sqlite'
                ? 'Local SQLite store'
                : 'In-memory sandbox'}
            </span>
          </div>

          {/* Headline summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[var(--surface-2)] rounded-[12px] p-3 border border-[var(--line)]">
              <span className="text-[10.5px] text-[var(--text-2)] block">Total matches</span>
              <span className="font-display text-[18px] font-bold text-[var(--accent)] tabular-nums mt-0.5 block">
                {data.totalMatches.toLocaleString()}
              </span>
            </div>

            <div className="bg-[var(--surface-2)] rounded-[12px] p-3 border border-[var(--line)]">
              <span className="text-[10.5px] text-[var(--text-2)] block">Earliest date</span>
              <span className="text-[12.5px] font-medium text-[var(--text)] truncate block mt-1 tabular-nums">
                {data.earliestDate ? cleanDisplayText(data.earliestDate.substring(0, 10)) : '—'}
              </span>
            </div>

            <div className="bg-[var(--surface-2)] rounded-[12px] p-3 border border-[var(--line)]">
              <span className="text-[10.5px] text-[var(--text-2)] block">Latest date</span>
              <span className="text-[12.5px] font-medium text-[var(--text)] truncate block mt-1 tabular-nums">
                {data.latestDate ? cleanDisplayText(data.latestDate.substring(0, 10)) : '—'}
              </span>
            </div>

            <div className="bg-[var(--surface-2)] rounded-[12px] p-3 border border-[var(--line)]">
              <span className="text-[10.5px] text-[var(--text-2)] block">Unmatched names</span>
              <span className="font-display text-[18px] font-bold text-[var(--text)] tabular-nums mt-0.5 block">
                {data.unmatchedNamesCount ?? 0}
              </span>
            </div>
          </div>

          {data.unmatchedNames && data.unmatchedNames.length > 0 && (
            <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] space-y-1.5">
              <span className="text-[12px] font-semibold text-[var(--medium)] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Unmatched team names ({data.unmatchedNames.length})</span>
              </span>
              <p className="text-[11.5px] text-[var(--text-2)]">
                Raw CSV names without an alias match were skipped:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.unmatchedNames.map((name, i) => (
                  <span
                    key={i}
                    className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--medium)]/40 text-[var(--text)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.skippedLeagues && data.skippedLeagues.length > 0 && (
            <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--medium)] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Skipped leagues ({data.skippedLeagues.length})</span>
                </span>
                <span className="text-[10.5px] text-[var(--medium)]">Tier 1 prioritized</span>
              </div>
              <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[12px] overflow-hidden text-[11px]">
                <div className="grid grid-cols-5 px-3 py-1.5 bg-[var(--surface-2)] text-[var(--text-3)] border-b border-[var(--line)] font-semibold">
                  <span>League</span>
                  <span>Tier</span>
                  <span>Provider</span>
                  <span className="col-span-2">Reason</span>
                </div>
                <div className="divide-y divide-[var(--line)] max-h-36 overflow-y-auto">
                  {data.skippedLeagues.map((sk, idx) => (
                    <div key={`${sk.provider}_${sk.leagueCode}_${idx}`} className="grid grid-cols-5 px-3 py-1.5 text-[var(--text-2)]">
                      <span className="font-semibold text-[var(--text)] truncate">{sk.leagueCode}</span>
                      <span>T{sk.tier}</span>
                      <span className="truncate">{sk.provider}</span>
                      <span className="col-span-2 truncate text-[var(--medium)]">{sk.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {data.unresolvedTeams && data.unresolvedTeams.length > 0 ? (
            <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--medium)] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Unresolved teams ({data.unresolvedTeams.length})</span>
                </span>
                <span className="text-[10.5px] text-[var(--medium)]">Exact aliases needed</span>
              </div>
              <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[12px] overflow-hidden text-[11px]">
                <div className="grid grid-cols-4 px-3 py-1.5 bg-[var(--surface-2)] text-[var(--text-3)] border-b border-[var(--line)] font-semibold">
                  <span className="col-span-2">Source name</span>
                  <span>Provider</span>
                  <span className="text-right">Attempts</span>
                </div>
                <div className="divide-y divide-[var(--line)] max-h-36 overflow-y-auto">
                  {data.unresolvedTeams.map((entry, i) => (
                    <div key={i} className="grid grid-cols-4 px-3 py-1.5 text-[var(--text-2)]">
                      <span className="col-span-2 font-semibold text-[var(--text)] truncate">{entry.sourceName}</span>
                      <span className="text-[var(--text-3)] truncate">{entry.sourceProvider}</span>
                      <span className="text-right text-[var(--medium)] font-bold tabular-nums">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[11.5px] text-[var(--accent)] flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All source clubs resolved via canonical aliases.</span>
              </span>
              <span className="text-[10.5px] text-[var(--text-3)]">0 unresolved</span>
            </div>
          )}

          {data.matchesPerLeagueAndSeason.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-semibold text-[var(--text)] flex items-center justify-between">
                <span>Matches by league &amp; season</span>
                <span className="text-[10.5px] text-[var(--text-3)]">
                  {data.matchesPerLeagueAndSeason.length} pipelines
                </span>
              </div>
              <div className="border border-[var(--line)] bg-[var(--surface-2)] rounded-[12px] overflow-hidden text-[11px]">
                <div className="grid grid-cols-4 px-3 py-1.5 bg-[var(--surface)] text-[var(--text-3)] border-b border-[var(--line)] font-semibold">
                  <span>League</span>
                  <span>Season</span>
                  <span className="text-right">Matches</span>
                  <span className="text-right">Span</span>
                </div>
                <div className="divide-y divide-[var(--line)] max-h-48 overflow-y-auto">
                  {data.matchesPerLeagueAndSeason.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-4 px-3 py-1.5 text-[var(--text-2)]">
                      <span className="font-semibold text-[var(--text)]">{row.league}</span>
                      <span>{row.season}</span>
                      <span className="text-right text-[var(--accent)] font-bold tabular-nums">{row.count}</span>
                      <span className="text-right text-[var(--text-3)] truncate tabular-nums">
                        {row.earliestDate.substring(0, 10)} to {row.latestDate.substring(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {data.leagueLatestDates && data.leagueLatestDates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[12px] font-semibold text-[var(--text)] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Latest stored match per league</span>
                </span>
                <span className="text-[10.5px] text-[var(--text-3)]">
                  {data.leagueLatestDates.filter((l) => !l.isStale).length} / {data.leagueLatestDates.length} current
                </span>
              </div>
              <div className="border border-[var(--line)] bg-[var(--surface-2)] rounded-[12px] overflow-x-auto text-[11px]">
                <div className="min-w-[540px]">
                  <div className="grid grid-cols-7 px-3 py-1.5 bg-[var(--surface)] text-[var(--text-3)] border-b border-[var(--line)] font-semibold">
                    <span className="col-span-2">League</span>
                    <span className="text-right">Matches</span>
                    <span className="text-right">Latest</span>
                    <span className="col-span-2 text-center">Features</span>
                    <span className="text-right">Status</span>
                  </div>
                  <div className="divide-y divide-[var(--line)] max-h-72 overflow-y-auto">
                    {data.leagueLatestDates.map((l) => (
                      <div key={l.league} className="grid grid-cols-7 px-3 py-2 text-[var(--text-2)] items-center gap-1">
                        <div className="col-span-2 truncate pr-2">
                          <span className="font-semibold text-[var(--text)]">{l.league}</span>
                          <span className="text-[var(--text-3)] ml-1.5 text-[10.5px] truncate">{l.leagueName}</span>
                        </div>
                        <span className="text-right font-bold tabular-nums text-[var(--accent)]">{l.count}</span>
                        <span className="text-right text-[var(--text)] truncate tabular-nums">
                          {l.latestDate ? l.latestDate.substring(0, 10) : 'None'}
                        </span>
                        <div className="col-span-2 flex flex-wrap justify-center gap-1 text-[10.5px]">
                          {[
                            { key: 'Cards', ok: Boolean(l.features?.cards) },
                            { key: 'Corners', ok: Boolean(l.features?.corners) },
                            { key: 'HT', ok: Boolean(l.features?.halfTimeGoals) },
                            { key: 'Ref', ok: Boolean(l.features?.referee) },
                            { key: 'AH', ok: Boolean(l.features?.asianHandicapPrices) },
                          ].map((tag) => (
                            <span
                              key={tag.key}
                              className={`px-1.5 py-0.5 rounded border ${
                                tag.ok
                                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                                  : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--line)]'
                              }`}
                            >
                              {tag.key}
                            </span>
                          ))}
                        </div>
                        <div className="text-right">
                          {l.isStale ? (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30">
                              {l.daysAgo !== null ? `Stale (${l.daysAgo}d)` : 'No data'}
                            </span>
                          ) : l.isStale7d ? (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30">
                              {`>7d (${l.daysAgo}d)`}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                              Active ({l.daysAgo}d)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {data.teamLatestDates && data.teamLatestDates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[12px] font-semibold text-[var(--text)] flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Latest match per club ({data.teamLatestDates.length})</span>
                </span>
                <input
                  type="text"
                  placeholder="Filter club or league..."
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  className="min-h-[44px] bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] px-3 text-[12px] text-[var(--text)] placeholder-[var(--text-3)] outline-none w-full sm:w-48"
                />
              </div>
              <div className="border border-[var(--line)] bg-[var(--surface-2)] rounded-[12px] overflow-hidden text-[11px]">
                <div className="grid grid-cols-5 px-3 py-1.5 bg-[var(--surface)] text-[var(--text-3)] border-b border-[var(--line)] font-semibold">
                  <span className="col-span-2">Club</span>
                  <span className="text-right">Matches</span>
                  <span className="text-right">Latest</span>
                  <span className="text-right">Status</span>
                </div>
                <div className="divide-y divide-[var(--line)] max-h-56 overflow-y-auto">
                  {data.teamLatestDates
                    .filter((t) => {
                      if (!teamSearchQuery.trim()) return true;
                      const q = teamSearchQuery.toLowerCase().trim();
                      return (
                        t.name.toLowerCase().includes(q) ||
                        t.shortName.toLowerCase().includes(q) ||
                        t.competitionCode.toLowerCase().includes(q)
                      );
                    })
                    .map((t) => (
                      <div key={t.teamId} className="grid grid-cols-5 px-3 py-2 text-[var(--text-2)] items-center">
                        <div className="col-span-2 truncate pr-2">
                          <span className="font-semibold text-[var(--text)]">{t.shortName}</span>
                          <span className="text-[var(--text-3)] ml-1.5 text-[10.5px]">({t.competitionCode})</span>
                        </div>
                        <span className="text-right font-bold tabular-nums text-[var(--accent)]">{t.matchCount}</span>
                        <span className="text-right text-[var(--text)] truncate tabular-nums">
                          {t.latestDate ? t.latestDate.substring(0, 10) : 'None'}
                        </span>
                        <div className="text-right">
                          {t.isStale ? (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30">
                              {t.daysAgo !== null ? `Stale (${t.daysAgo}d)` : 'Backfill'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                              Active ({t.daysAgo}d)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Under-Sampled Teams */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--medium)]" />
                <span>Under-sampled clubs (&lt; 10 matches)</span>
              </span>
              <span className="text-[10.5px] text-[var(--medium)]">
                {data.teamsWithFewerThan10Matches.length} flagged
              </span>
            </div>

            {data.teamsWithFewerThan10Matches.length === 0 ? (
              <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[12px] text-[var(--accent)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All registered clubs have verified sample coverage (&ge; 10 matches).</span>
              </div>
            ) : (
              <div className="border border-[var(--medium)]/30 bg-[var(--surface-2)] rounded-[12px] p-3 space-y-2">
                <p className="text-[11.5px] text-[var(--text-2)]">
                  Clubs with insufficient history require historical backfill:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {data.teamsWithFewerThan10Matches.map((t) => (
                    <span
                      key={t.teamId}
                      className="inline-flex items-center gap-1.5 text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--text)]"
                    >
                      <span className="font-semibold text-[var(--medium)]">{t.shortName}</span>
                      <span className="text-[var(--text-3)]">({t.competitionCode})</span>
                      <span className="text-[var(--accent)] font-bold">{t.matchCount}m</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Basketball Historical Coverage Panel */}
          {data.basketball && (
            <div className="space-y-2.5 pt-3 border-t border-[var(--line)]">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Basketball coverage</span>
                </span>
                <span className="text-[10.5px] text-[var(--text-2)] tabular-nums">
                  {data.basketball.totalGames.toLocaleString()} games · Latest {data.basketball.latestDate || '—'}
                </span>
              </div>

              {data.basketball.leagueSummary.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {data.basketball.leagueSummary.map((ls) => (
                    <div key={ls.league} className="bg-[var(--surface-2)] rounded-[12px] p-3 border border-[var(--line)] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11.5px] font-semibold text-[var(--accent)]">{ls.league}</span>
                        <span className="text-[10.5px] text-[var(--text-2)]">Half scores: {ls.halfScoresPct}%</span>
                      </div>
                      <div className="font-display text-[16px] font-bold text-[var(--text)] tabular-nums">
                        {ls.count.toLocaleString()} games
                      </div>
                      <div className="text-[10.5px] text-[var(--text-2)]">
                        Latest: {ls.latestDate || 'Needs history'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {data.basketball.gamesPerLeagueAndSeason.length === 0 ? (
                <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[12px] text-[var(--text-2)]">
                  No basketball seasons ingested yet.
                </div>
              ) : (
                <div className="border border-[var(--line)] bg-[var(--surface-2)] rounded-[12px] overflow-hidden text-[11px]">
                  <div className="grid grid-cols-5 px-3 py-1.5 bg-[var(--surface)] text-[var(--text-3)] border-b border-[var(--line)] font-semibold">
                    <span>League</span>
                    <span>Season</span>
                    <span className="text-right">Games</span>
                    <span className="text-right">Half %</span>
                    <span className="text-right">Latest</span>
                  </div>
                  <div className="divide-y divide-[var(--line)] max-h-56 overflow-y-auto">
                    {data.basketball.gamesPerLeagueAndSeason.map((row) => (
                      <div key={`${row.league}-${row.season}`} className="grid grid-cols-5 px-3 py-1.5 text-[var(--text-2)]">
                        <span className="font-semibold text-[var(--text)]">{row.league}</span>
                        <span>{row.season}</span>
                        <span className="text-right text-[var(--accent)] font-bold tabular-nums">{row.count}</span>
                        <span className="text-right text-[var(--text)] tabular-nums">{row.halfScoresPct}%</span>
                        <span className="text-right text-[var(--text-3)] tabular-nums">{row.latestDate || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.basketball.unresolvedTeams.length > 0 ? (
                <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] space-y-1.5">
                  <span className="text-[11.5px] font-semibold text-[var(--medium)] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Unresolved basketball teams ({data.basketball.unresolvedTeams.length})</span>
                  </span>
                  <div className="divide-y divide-[var(--line)] max-h-28 overflow-y-auto text-[11px]">
                    {data.basketball.unresolvedTeams.map((u, i) => (
                      <div key={i} className="py-1 flex items-center justify-between gap-2">
                        <span className="text-[var(--text)] truncate">{u.sourceName}</span>
                        <span className="text-[var(--text-2)] shrink-0">
                          {u.sourceProvider} ({u.count}x)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[11.5px] text-[var(--accent)] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Unresolved basketball teams: 0</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Backfill Reference Calls */}
      <div className="space-y-2 pt-3 border-t border-[var(--line)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Backfill API endpoints</span>
          </span>
          <span className="text-[10.5px] text-[var(--text-3)]">x-admin-secret</span>
        </div>

        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {exampleCalls.map((c, idx) => {
            const curlCmd = `curl -X POST "https://calibrall.vercel.app/api/admin/backfill?league=${c.league}&season=${c.season}" -H "x-admin-secret: $ADMIN_SECRET"`;
            const isCopied = copiedIndex === idx;

            return (
              <div
                key={idx}
                className="p-2.5 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] flex items-center justify-between gap-2 text-[11.5px]"
              >
                <div className="min-w-0">
                  <div className="text-[var(--text)] font-medium">{c.desc}</div>
                  <div className="text-[var(--text-3)] font-mono truncate text-[10.5px] mt-0.5">{curlCmd}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCommand(curlCmd, idx)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] bg-[var(--surface)] border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] shrink-0 touch-press"
                  title="Copy curl command"
                  aria-label="Copy curl command"
                >
                  {isCopied ? <Check className="w-4 h-4 text-[var(--accent)]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
