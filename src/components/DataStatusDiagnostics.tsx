'use client';

import React, { useState, useEffect } from 'react';
import { Database, AlertTriangle, CheckCircle2, RefreshCw, Calendar, ShieldCheck } from 'lucide-react';
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

interface DataStatusData {
  totalMatches: number;
  earliestDate: string | null;
  latestDate: string | null;
  matchesPerLeagueAndSeason: LeagueSeasonStat[];
  teamsWithFewerThan10Matches: UnderSampledTeam[];
}

export default function DataStatusDiagnostics() {
  const [data, setData] = useState<DataStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDataStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data-status?secret=calibrall_secret_2026', {
        headers: {
          'admin_secret': 'calibrall_secret_2026',
        },
        cache: 'no-store',
      });
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
    fetchDataStatus();
  }, []);

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
            Diagnostic verification from Supabase matches table and multi-season ingestion pipeline.
          </p>
        </div>
        <button
          onClick={fetchDataStatus}
          disabled={loading}
          type="button"
          className="p-1.5 rounded-[8px] bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE] transition-colors disabled:opacity-50"
          title="Refresh Data Status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !data && (
        <div className="py-6 text-center text-[12px] text-[#8B9890] flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#B6E63B]" />
          <span>Querying database status...</span>
        </div>
      )}

      {error && !data && (
        <div className="p-3 bg-[#E2AE45]/[0.08] border border-[#E2AE45]/30 rounded-[10px] text-[12px] text-[#E2AE45]">
          <span className="font-semibold text-[#ECF1EE]">Status query notice: </span>
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {/* Headline summary pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              <span className="text-[12.5px] font-mono text-[#ECF1EE] truncate block mt-0.5">
                {data.earliestDate ? cleanDisplayText(data.earliestDate.substring(0, 10)) : 'N/A'}
              </span>
            </div>

            <div className="bg-[#151E19] rounded-[10px] p-2.5 border border-white/[0.07]">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#8B9890] block">
                Latest Date
              </span>
              <span className="text-[12.5px] font-mono text-[#ECF1EE] truncate block mt-0.5">
                {data.latestDate ? cleanDisplayText(data.latestDate.substring(0, 10)) : 'N/A'}
              </span>
            </div>
          </div>

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

          {/* Under-Sampled Teams (< 10 matches) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#E2AE45]" />
                <span>Under-Sampled Clubs (&lt; 10 matches)</span>
              </span>
              <span className="text-[10px] font-mono text-[#E2AE45]">
                {data.teamsWithFewerThan10Matches.length} clubs flagged
              </span>
            </div>

            {data.teamsWithFewerThan10Matches.length === 0 ? (
              <div className="p-2.5 rounded-[10px] bg-[#151E19] border border-white/[0.07] text-[11.5px] text-[#B6E63B] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All registered clubs have verified sample coverage (&ge; 10 matches).</span>
              </div>
            ) : (
              <div className="border border-[#E2AE45]/20 bg-[#151E19] rounded-[10px] p-2.5 space-y-2">
                <p className="text-[11px] text-[#8B9890] leading-tight">
                  Clubs with insufficient history fail minimum sample size validation and will produce: <code className="text-[#ECF1EE] bg-black/40 px-1 py-0.5 rounded">Needs history: Club (0 matches)</code>.
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
    </div>
  );
}
