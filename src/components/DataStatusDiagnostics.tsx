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

interface LeagueLatestDate {
  league: string;
  leagueName: string;
  count: number;
  earliestDate: string | null;
  latestDate: string | null;
  daysAgo: number | null;
  isStale: boolean;
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
  unmappedFixtureNamesCount?: number;
  unmappedFixtureNames?: { name: string; provider: string }[];
  storeUsed?: 'supabase' | 'in-memory';
  persistenceMode?: string;
}

export default function DataStatusDiagnostics() {
  const [data, setData] = useState<DataStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [adminSecretInput, setAdminSecretInput] = useState<string>('');
  const [isSecretSaved, setIsSecretSaved] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');

  // Comprehensive backfill call list for all supported leagues & extra leagues
  const exampleCalls = [
    { league: 'ELC', season: '2627', desc: 'Championship 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'ELC', season: '2526', desc: 'Championship 2025-26 · Has Corners & Cards' },
    { league: 'PL', season: '2627', desc: 'Premier League 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'PL', season: '2526', desc: 'Premier League 2025-26 · Has Corners & Cards' },
    { league: 'PD', season: '2627', desc: 'La Liga 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'PD', season: '2526', desc: 'La Liga 2025-26 · Has Corners & Cards' },
    { league: 'BL1', season: '2627', desc: 'Bundesliga 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'BL1', season: '2526', desc: 'Bundesliga 2025-26 · Has Corners & Cards' },
    { league: 'SA', season: '2627', desc: 'Serie A 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'SA', season: '2526', desc: 'Serie A 2025-26 · Has Corners & Cards' },
    { league: 'FL1', season: '2627', desc: 'Ligue 1 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'FL1', season: '2526', desc: 'Ligue 1 2025-26 · Has Corners & Cards' },
    { league: 'DED', season: '2627', desc: 'Eredivisie 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'DED', season: '2526', desc: 'Eredivisie 2025-26 · Has Corners & Cards' },
    { league: 'P1', season: '2627', desc: 'Portugal Primeira Liga 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'P1', season: '2526', desc: 'Portugal Primeira Liga 2025-26 · Has Corners & Cards' },
    { league: 'T1', season: '2627', desc: 'Turkey Süper Lig 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'T1', season: '2526', desc: 'Turkey Süper Lig 2025-26 · Has Corners & Cards' },
    { league: 'SC0', season: '2627', desc: 'Scotland Premiership 2026-27 (Current In-Play) · Has Corners & Cards' },
    { league: 'SC0', season: '2526', desc: 'Scotland Premiership 2025-26 · Has Corners & Cards' },
    { league: 'DNK', season: '2026', desc: 'Denmark Superliga (Extra League /new/DNK.csv) · No Corners/Cards' },
    { league: 'NOR', season: '2026', desc: 'Norway Eliteserien (Extra League /new/NOR.csv) · No Corners/Cards' },
    { league: 'FIN', season: '2026', desc: 'Finland Veikkausliiga (Extra League /new/FIN.csv) · No Corners/Cards' },
    { league: 'JPN', season: '2026', desc: 'Japan J1 League (Extra League /new/JPN.csv) · No Corners/Cards' },
    { league: 'ARG', season: '2026', desc: 'Argentina Liga Profesional (Extra League /new/ARG.csv) · No Corners/Cards' },
    { league: 'BSA', season: '2026', desc: 'Brazil Série A 2026 (Extra League /new/BRA.csv) · No Corners/Cards' },
    { league: 'BSA', season: '2025', desc: 'Brazil Série A 2025 (Extra League /new/BRA.csv) · No Corners/Cards' },
  ];

  const fetchDataStatus = async (secretOverride?: string) => {
    setLoading(true);
    setError(null);
    const secret = secretOverride !== undefined ? secretOverride : adminSecretInput;

    try {
      const headers: Record<string, string> = {};
      if (secret) {
        headers['x-admin-secret'] = secret;
      }

      const res = await fetch('/api/admin/data-status', {
        headers,
        cache: 'no-store',
      });

      if (res.status === 503) {
        throw new Error('ADMIN_SECRET environment variable is not configured on the server (503 Service Unavailable). Configure it in Vercel/environment to activate status inspection.');
      }

      if (res.status === 401) {
        throw new Error('Unauthorized (401). Provide a valid ADMIN_SECRET (>= 32 chars) via the input below or x-admin-secret header.');
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
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
        <div>
          <div className="text-[13.5px] font-semibold text-[#ECF1EE] flex items-center gap-2">
            <Database className="w-4 h-4 text-[#B6E63B]" />
            <span>Database Status & Historical Sample Coverage</span>
          </div>
          <p className="text-[11.5px] text-[#8B9890] mt-0.5">
            Diagnostic verification joining the teams table and multi-season ingestion pipeline.
          </p>
        </div>
        <button
          onClick={() => fetchDataStatus()}
          disabled={loading}
          type="button"
          className="p-1.5 rounded-[8px] bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE] transition-colors disabled:opacity-50"
          title="Refresh Data Status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Admin Secret Bar */}
      <form onSubmit={handleSaveSecret} className="flex items-center gap-2 bg-[#151E19] p-2 rounded-[10px] border border-white/[0.07]">
        <Key className="w-4 h-4 text-[#B6E63B] shrink-0" />
        <input
          type="password"
          placeholder="Enter x-admin-secret (>= 32 chars)..."
          value={adminSecretInput}
          onChange={(e) => setAdminSecretInput(e.target.value)}
          className="bg-transparent text-[11.5px] font-mono text-[#ECF1EE] placeholder-[#5E6A63] flex-1 outline-none min-w-0"
        />
        <button
          type="submit"
          disabled={loading || adminSecretInput.length < 5}
          className="px-2.5 py-1 rounded-[6px] bg-[#B6E63B] text-[#0A0F0D] text-[11px] font-semibold hover:bg-[#c8ee47] disabled:opacity-50 shrink-0"
        >
          {loading ? 'Checking...' : isSecretSaved ? 'Update Key' : 'Authorize'}
        </button>
      </form>

      {loading && !data && (
        <div className="py-6 text-center text-[12px] text-[#8B9890] flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#B6E63B]" />
          <span>Querying database status...</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#E2AE45]/[0.08] border border-[#E2AE45]/30 rounded-[10px] text-[12px] text-[#E2AE45]">
          <span className="font-semibold text-[#ECF1EE]">Admin Status: </span>
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {/* Active Store Indicator */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-[8px] bg-[#151E19] border border-white/[0.07] text-[11px] font-mono">
            <span className="text-[#8B9890]">Active Store Source:</span>
            <span className={`font-semibold px-2 py-0.5 rounded ${
              data.storeUsed === 'supabase'
                ? 'bg-[#B6E63B]/10 text-[#B6E63B] border border-[#B6E63B]/30'
                : 'bg-[#E2AE45]/10 text-[#E2AE45] border border-[#E2AE45]/30'
            }`}>
              {data.storeUsed === 'supabase' ? 'Supabase Production Database' : 'In-Memory Sandbox Store'}
            </span>
          </div>

          {/* Headline summary pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#151E19] rounded-[10px] p-2.5 border border-white/[0.07]">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#8B9890] block">
                Total Matches
              </span>
              <span className="text-[17px] font-bold font-mono text-[#B6E63B] tabular-nums">
                {data.totalMatches}
              </span>
            </div>

            <div className="bg-[#151E19] rounded-[10px] p-2.5 border border-white/[0.07]">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#8B9890] block">
                Earliest Date
              </span>
              <span className="text-[12px] font-mono text-[#ECF1EE] truncate block mt-0.5">
                {data.earliestDate ? cleanDisplayText(data.earliestDate.substring(0, 10)) : 'N/A'}
              </span>
            </div>

            <div className="bg-[#151E19] rounded-[10px] p-2.5 border border-white/[0.07]">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#8B9890] block">
                Latest Date
              </span>
              <span className="text-[12px] font-mono text-[#ECF1EE] truncate block mt-0.5">
                {data.latestDate ? cleanDisplayText(data.latestDate.substring(0, 10)) : 'N/A'}
              </span>
            </div>

            <div className="bg-[#151E19] rounded-[10px] p-2.5 border border-white/[0.07]">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#8B9890] block">
                Unmatched Names
              </span>
              <span className="text-[17px] font-bold font-mono text-[#ECF1EE] tabular-nums">
                {data.unmatchedNamesCount ?? 0}
              </span>
            </div>
          </div>

          {/* Unmatched Names Box if any */}
          {data.unmatchedNames && data.unmatchedNames.length > 0 && (
            <div className="p-3 bg-[#E2AE45]/[0.08] border border-[#E2AE45]/30 rounded-[10px] space-y-1.5">
              <span className="text-[11.5px] font-semibold text-[#E2AE45] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Unmatched Team Names ({data.unmatchedNames.length})</span>
              </span>
              <p className="text-[11px] text-[#8B9890]">
                The following raw CSV names had no match in team_aliases and were skipped (never auto-slugified):
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.unmatchedNames.map((name, i) => (
                  <span key={i} className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-black/40 border border-[#E2AE45]/40 text-[#ECF1EE]">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Matches Per League & Season Table */}
          {data.matchesPerLeagueAndSeason.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11.5px] font-semibold text-[#ECF1EE] flex items-center justify-between">
                <span>Matches by League & Season</span>
                <span className="text-[10px] font-mono text-[#5E6A63]">
                  {data.matchesPerLeagueAndSeason.length} active pipelines
                </span>
              </div>
              <div className="border border-white/[0.07] bg-[#151E19] rounded-[10px] overflow-hidden text-[11px] font-mono">
                <div className="grid grid-cols-4 px-3 py-1.5 bg-black/20 text-[#5E6A63] border-b border-white/[0.05] font-semibold">
                  <span>League</span>
                  <span>Season</span>
                  <span className="text-right">Matches</span>
                  <span className="text-right">Coverage Span</span>
                </div>
                <div className="divide-y divide-white/[0.04] max-h-48 overflow-y-auto">
                  {data.matchesPerLeagueAndSeason.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-4 px-3 py-1.5 text-[#8B9890] hover:text-[#ECF1EE]">
                      <span className="font-semibold text-[#ECF1EE]">{row.league}</span>
                      <span>{row.season}</span>
                      <span className="text-right text-[#B6E63B] font-bold tabular-nums">{row.count}</span>
                      <span className="text-right text-[#5E6A63] truncate">
                        {row.earliestDate.substring(0, 10)} to {row.latestDate.substring(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Latest Stored Match Date Per League */}
          {data.leagueLatestDates && data.leagueLatestDates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11.5px] font-semibold text-[#ECF1EE] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#B6E63B]" />
                  <span>Latest Stored Match Date Per League</span>
                </span>
                <span className="text-[10px] font-mono text-[#5E6A63]">
                  {data.leagueLatestDates.filter(l => !l.isStale).length} / {data.leagueLatestDates.length} current
                </span>
              </div>
              <div className="border border-white/[0.07] bg-[#151E19] rounded-[10px] overflow-hidden text-[11px] font-mono">
                <div className="grid grid-cols-5 px-3 py-1.5 bg-black/20 text-[#5E6A63] border-b border-white/[0.05] font-semibold">
                  <span className="col-span-2">League</span>
                  <span className="text-right">Stored Matches</span>
                  <span className="text-right">Latest Loaded Date</span>
                  <span className="text-right">Staleness Status</span>
                </div>
                <div className="divide-y divide-white/[0.04] max-h-56 overflow-y-auto">
                  {data.leagueLatestDates.map((l) => (
                    <div key={l.league} className="grid grid-cols-5 px-3 py-1.5 text-[#8B9890] hover:text-[#ECF1EE] items-center">
                      <div className="col-span-2 truncate pr-2">
                        <span className="font-semibold text-[#ECF1EE]">{l.league}</span>
                        <span className="text-[#5E6A63] ml-1.5 text-[10px] truncate">{l.leagueName}</span>
                      </div>
                      <span className="text-right font-bold tabular-nums text-[#B6E63B]">{l.count}</span>
                      <span className="text-right text-[#ECF1EE] truncate">
                        {l.latestDate ? l.latestDate.substring(0, 10) : 'None'}
                      </span>
                      <div className="text-right">
                        {l.isStale ? (
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            {l.daysAgo !== null ? `Stale (${l.daysAgo}d ago)` : 'No Data'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[#B6E63B]/10 text-[#B6E63B] border border-[#B6E63B]/30">
                            Active ({l.daysAgo}d ago)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Latest Stored Match Date Per Club */}
          {data.teamLatestDates && data.teamLatestDates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11.5px] font-semibold text-[#ECF1EE] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#B6E63B]" />
                  <span>Latest Stored Match Date Per Club ({data.teamLatestDates.length} registered)</span>
                </span>
                <input
                  type="text"
                  placeholder="Filter club name / league..."
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  className="bg-black/40 border border-white/[0.08] rounded px-2 py-0.5 text-[10.5px] font-mono text-[#ECF1EE] placeholder-[#5E6A63] outline-none w-44"
                />
              </div>
              <div className="border border-white/[0.07] bg-[#151E19] rounded-[10px] overflow-hidden text-[11px] font-mono">
                <div className="grid grid-cols-5 px-3 py-1.5 bg-black/20 text-[#5E6A63] border-b border-white/[0.05] font-semibold">
                  <span className="col-span-2">Club Name</span>
                  <span className="text-right">Stored Matches</span>
                  <span className="text-right">Latest Match</span>
                  <span className="text-right">Staleness Status</span>
                </div>
                <div className="divide-y divide-white/[0.04] max-h-56 overflow-y-auto">
                  {data.teamLatestDates
                    .filter((t) => {
                      if (!teamSearchQuery.trim()) return true;
                      const q = teamSearchQuery.toLowerCase().trim();
                      return t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q) || t.competitionCode.toLowerCase().includes(q);
                    })
                    .map((t) => (
                      <div key={t.teamId} className="grid grid-cols-5 px-3 py-1.5 text-[#8B9890] hover:text-[#ECF1EE] items-center">
                        <div className="col-span-2 truncate pr-2">
                          <span className="font-semibold text-[#ECF1EE]">{t.shortName}</span>
                          <span className="text-[#5E6A63] ml-1.5 text-[10px]">({t.competitionCode})</span>
                        </div>
                        <span className="text-right font-bold tabular-nums text-[#B6E63B]">{t.matchCount}</span>
                        <span className="text-right text-[#ECF1EE] truncate">
                          {t.latestDate ? t.latestDate.substring(0, 10) : 'None'}
                        </span>
                        <div className="text-right">
                          {t.isStale ? (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              {t.daysAgo !== null ? `Stale (${t.daysAgo}d)` : 'Needs Backfill'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[#B6E63B]/10 text-[#B6E63B] border border-[#B6E63B]/30">
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

          {/* Under-Sampled Teams (< 10 matches) by joining teams table */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#E2AE45]" />
                <span>Under-Sampled Clubs (&lt; 10 matches) Joined from Teams Table</span>
              </span>
              <span className="text-[10px] font-mono text-[#E2AE45]">
                {data.teamsWithFewerThan10Matches.length} clubs flagged
              </span>
            </div>

            {data.teamsWithFewerThan10Matches.length === 0 ? (
              <div className="p-2.5 rounded-[10px] bg-[#151E19] border border-white/[0.07] text-[11.5px] text-[#B6E63B] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All registered clubs in teams table have verified sample coverage (&ge; 10 matches).</span>
              </div>
            ) : (
              <div className="border border-[#E2AE45]/20 bg-[#151E19] rounded-[10px] p-2.5 space-y-2">
                <p className="text-[11px] text-[#8B9890] leading-tight">
                  Clubs with insufficient history in the joined teams table require historical match backfill:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                  {data.teamsWithFewerThan10Matches.map((t) => (
                    <span
                      key={t.teamId}
                      className="inline-flex items-center gap-1.5 text-[10.5px] font-mono px-2 py-0.5 rounded-[6px] bg-black/30 border border-white/[0.08] text-[#ECF1EE]"
                    >
                      <span className="font-semibold text-[#E2AE45]">{t.shortName}</span>
                      <span className="text-[#5E6A63]">({t.competitionCode})</span>
                      <span className="text-[#B6E63B] font-bold">{t.matchCount} m</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Call List Section */}
      <div className="space-y-2 pt-2 border-t border-white/[0.07]">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#B6E63B]" />
            <span>Authorized Backfill Call List (Seasons 2526, 2627, BSA 2025/2026, 1920 Dropped)</span>
          </span>
          <span className="text-[10px] font-mono text-[#5E6A63]">Header: x-admin-secret</span>
        </div>

        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {exampleCalls.map((c, idx) => {
            const curlCmd = `curl -X POST "https://calibrall.vercel.app/api/admin/backfill?league=${c.league}&season=${c.season}" -H "x-admin-secret: $ADMIN_SECRET"`;
            const isCopied = copiedIndex === idx;

            return (
              <div key={idx} className="p-2 bg-[#151E19] rounded-[8px] border border-white/[0.05] flex items-center justify-between gap-2 text-[11px] font-mono">
                <div className="min-w-0">
                  <div className="text-[#ECF1EE] font-semibold">{c.desc}</div>
                  <div className="text-[#8B9890] truncate text-[10px] mt-0.5">{curlCmd}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCommand(curlCmd, idx)}
                  className="p-1 rounded bg-black/40 hover:bg-black/60 text-[#8B9890] hover:text-[#ECF1EE] shrink-0"
                  title="Copy curl command"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-[#B6E63B]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
