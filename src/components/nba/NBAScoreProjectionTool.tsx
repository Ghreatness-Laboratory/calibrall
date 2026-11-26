'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getAllNBATeamsList,
  NBA_TEAMS_CATALOG,
  NBA_SEASONS,
  NBASeason,
} from '@/lib/data/nbaSeedData';
import {
  calculateNBAScoreProjection,
  validateTeamInputs,
  TeamEfficiencyInput,
  StepByStepCalculation,
  EFFICIENCY_MIN,
  EFFICIENCY_MAX,
  POSSESSIONS_MIN,
  POSSESSIONS_MAX,
} from '@/lib/prediction/nbaMath';
import {
  ArrowLeftRight,
  RefreshCw,
  Calculator,
  RotateCcw,
  CheckCircle2,
  TrendingUp,
  Clock,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { NBATeamStats } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface TeamFieldState {
  teamAbbr: string;
  name: string;
  offEff: string;
  defEff: string;
  poss: string;
  isOffEffManual: boolean;
  isDefEffManual: boolean;
  isPossManual: boolean;
  pulledStats?: NBATeamStats | null;
  lastUpdated?: string;
  source?: string;
}

export default function NBAScoreProjectionTool() {
  const [season, setSeason] = useState<NBASeason>('2024-25');
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [apiStats, setApiStats] = useState<Record<string, NBATeamStats>>({});

  const [sportsbookTotal, setSportsbookTotal] = useState<string>('');
  const [sportsbookH1Total, setSportsbookH1Total] = useState<string>('');

  const allTeams = useMemo(() => getAllNBATeamsList(), []);

  const [teamA, setTeamA] = useState<TeamFieldState>({
    teamAbbr: 'BOS',
    name: 'Boston Celtics',
    offEff: '1.159',
    defEff: '1.085',
    poss: '98.5',
    isOffEffManual: false,
    isDefEffManual: false,
    isPossManual: false,
    source: 'Official NBA Advanced Stats (ORtg/100, DRtg/100, PACE)',
    lastUpdated: 'Season 2024 to 2025 · Updated today',
  });

  const [teamB, setTeamB] = useState<TeamFieldState>({
    teamAbbr: 'DET',
    name: 'Detroit Pistons',
    offEff: '1.124',
    defEff: '1.054',
    poss: '103.1',
    isOffEffManual: false,
    isDefEffManual: false,
    isPossManual: false,
    source: 'Official NBA Advanced Stats (ORtg/100, DRtg/100, PACE)',
    lastUpdated: 'Season 2024 to 2025 · Updated today',
  });

  const fetchStats = useCallback(async (targetSeason: NBASeason, refresh = false) => {
    setIsLoadingStats(true);
    setStatsError(null);
    try {
      const res = await fetch(`/api/v1/nba/stats?season=${targetSeason}${refresh ? '&refresh=true' : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Failed to load stats: ${res.statusText}`);
      }
      const json = await res.json();
      if (json.data) {
        setApiStats(json.data);
      }
      if (json.error) {
        setStatsError(json.error);
      }
    } catch (err: any) {
      setStatsError(err?.message || 'Failed to connect to NBA stats API. Preserving local seed values.');
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(season);
  }, [season, fetchStats]);

  const handleSelectTeamA = (abbr: string) => {
    const catalogItem = NBA_TEAMS_CATALOG[abbr];
    if (!catalogItem) return;

    const pulled = apiStats[abbr] || catalogItem.statsBySeason[season];
    setTeamA({
      teamAbbr: abbr,
      name: catalogItem.name,
      offEff: pulled.offensiveEfficiency.toFixed(3),
      defEff: pulled.defensiveEfficiency.toFixed(3),
      poss: pulled.possessions.toFixed(1),
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
      pulledStats: apiStats[abbr] || null,
      source: apiStats[abbr]?.source || 'Official NBA Advanced Stats (ORtg/100, DRtg/100, PACE)',
      lastUpdated: cleanDisplayText(`Season ${season} · ${apiStats[abbr]?.lastUpdated || 'Updated today'}`),
    });
  };

  const handleSelectTeamB = (abbr: string) => {
    const catalogItem = NBA_TEAMS_CATALOG[abbr];
    if (!catalogItem) return;

    const pulled = apiStats[abbr] || catalogItem.statsBySeason[season];
    setTeamB({
      teamAbbr: abbr,
      name: catalogItem.name,
      offEff: pulled.offensiveEfficiency.toFixed(3),
      defEff: pulled.defensiveEfficiency.toFixed(3),
      poss: pulled.possessions.toFixed(1),
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
      pulledStats: apiStats[abbr] || null,
      source: apiStats[abbr]?.source || 'Official NBA Advanced Stats (ORtg/100, DRtg/100, PACE)',
      lastUpdated: cleanDisplayText(`Season ${season} · ${apiStats[abbr]?.lastUpdated || 'Updated today'}`),
    });
  };

  const handleSwapTeams = () => {
    const temp = { ...teamA };
    setTeamA({ ...teamB });
    setTeamB(temp);
  };

  const handleResetTeamA = () => {
    const catalogItem = NBA_TEAMS_CATALOG[teamA.teamAbbr];
    if (!catalogItem) return;
    const pulled = apiStats[teamA.teamAbbr] || catalogItem.statsBySeason[season];
    setTeamA((prev) => ({
      ...prev,
      offEff: pulled.offensiveEfficiency.toFixed(3),
      defEff: pulled.defensiveEfficiency.toFixed(3),
      poss: pulled.possessions.toFixed(1),
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
    }));
  };

  const handleResetTeamB = () => {
    const catalogItem = NBA_TEAMS_CATALOG[teamB.teamAbbr];
    if (!catalogItem) return;
    const pulled = apiStats[teamB.teamAbbr] || catalogItem.statsBySeason[season];
    setTeamB((prev) => ({
      ...prev,
      offEff: pulled.offensiveEfficiency.toFixed(3),
      defEff: pulled.defensiveEfficiency.toFixed(3),
      poss: pulled.possessions.toFixed(1),
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
    }));
  };

  const inputA: TeamEfficiencyInput = useMemo(
    () => ({
      name: teamA.name,
      offensiveEfficiency: parseFloat(teamA.offEff),
      defensiveEfficiency: parseFloat(teamA.defEff),
      possessions: parseFloat(teamA.poss),
    }),
    [teamA]
  );

  const inputB: TeamEfficiencyInput = useMemo(
    () => ({
      name: teamB.name,
      offensiveEfficiency: parseFloat(teamB.offEff),
      defensiveEfficiency: parseFloat(teamB.defEff),
      possessions: parseFloat(teamB.poss),
    }),
    [teamB]
  );

  const validation = useMemo(() => validateTeamInputs(inputA, inputB), [inputA, inputB]);

  const calculationResult: StepByStepCalculation | null = useMemo(() => {
    if (!validation.isValid) return null;
    return calculateNBAScoreProjection(inputA, inputB, {
      totalLine: sportsbookTotal ? parseFloat(sportsbookTotal) : undefined,
    });
  }, [inputA, inputB, validation.isValid, sportsbookTotal]);

  const h1ProjectedTotal = useMemo(() => {
    if (!calculationResult) return null;
    return calculationResult.total * 0.503;
  }, [calculationResult]);

  const h1Lean = useMemo(() => {
    if (h1ProjectedTotal === null || !sportsbookH1Total) return null;
    const line = parseFloat(sportsbookH1Total);
    if (isNaN(line)) return null;
    const diff = h1ProjectedTotal - line;
    const lean = diff > 0.5 ? 'OVER' : diff < -0.5 ? 'UNDER' : 'EVEN';
    return { line, diff, lean };
  }, [h1ProjectedTotal, sportsbookH1Total]);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
        <div>
          <h2 className="font-display text-[18px] font-[700] text-[var(--text)] flex items-center gap-2">
            <span>NBA score projection engine</span>
            <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 font-semibold">
              Verified
            </span>
          </h2>
          <p className="text-[12.5px] text-[var(--text-2)] mt-0.5">
            Offensive &amp; defensive efficiency ratings multiplied by pace possessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--line)] px-3 min-h-[44px] rounded-[12px] text-[12px]">
            <span className="text-[var(--text-3)] text-[11px]">Season:</span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value as NBASeason)}
              className="bg-transparent text-[var(--text)] font-medium focus:outline-none cursor-pointer text-[12px]"
            >
              {NBA_SEASONS.map((s) => (
                <option key={s} value={s} className="bg-[var(--bg)] text-[var(--text)]">
                  {cleanDisplayText(s)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchStats(season, true)}
            disabled={isLoadingStats}
            type="button"
            className="min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--line)] text-[12px] text-[var(--text-2)] hover:text-[var(--text)] flex items-center gap-1.5 transition-colors disabled:opacity-50 touch-press"
            title="Refresh stats from live provider"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{isLoadingStats ? 'Refreshing...' : 'Refresh stats'}</span>
          </button>
        </div>
      </div>

      {statsError && (
        <div className="p-3.5 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] flex items-start gap-2.5 text-[12px] text-[var(--medium)]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <span className="font-[600] text-[var(--text)]">Status: </span>
            {statsError} You can type stats manually below.
          </div>
        </div>
      )}

      {/* Two Team Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Team A */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--line)]">
            <div>
              <span className="text-[10.5px] text-[var(--accent)] font-semibold block">
                Team A (Home)
              </span>
              <h3 className="font-display text-[14px] font-[600] text-[var(--text)]">
                {teamA.name}
              </h3>
            </div>

            {(teamA.isOffEffManual || teamA.isDefEffManual || teamA.isPossManual) && (
              <button
                onClick={handleResetTeamA}
                type="button"
                className="min-h-[44px] text-[11px] text-[var(--text-2)] hover:text-[var(--accent)] flex items-center gap-1 transition-colors px-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] touch-press"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Reset auto</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-2)] mb-1 font-medium">
              Select NBA franchise
            </label>
            <select
              value={teamA.teamAbbr}
              onChange={(e) => handleSelectTeamA(e.target.value)}
              className="min-h-[44px] w-full bg-[var(--surface-2)] border border-[var(--line)] px-3 rounded-[12px] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-medium"
            >
              {allTeams.map((t) => (
                <option key={t.abbreviation} value={t.abbreviation} className="bg-[var(--bg)] text-[var(--text)]">
                  {t.name} ({t.abbreviation} · {t.conference})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-2)]">Offensive efficiency (Pts/Poss)</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                    teamA.isOffEffManual
                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  }`}
                >
                  {teamA.isOffEffManual ? 'Manual' : 'Auto (ORtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamA.offEff}
                onChange={(e) => setTeamA((prev) => ({ ...prev, offEff: e.target.value, isOffEffManual: true }))}
                className={`min-h-[44px] w-full bg-[var(--surface-2)] border px-3 rounded-[12px] text-[13px] text-[var(--text)] tabular-nums focus:outline-none ${
                  validation.errors.teamA?.offEff ? 'border-[var(--danger)]' : 'border-[var(--line)] focus:border-[var(--accent)]'
                }`}
              />
              {validation.errors.teamA?.offEff && (
                <p className="text-[11px] text-[var(--danger)] mt-1">{validation.errors.teamA.offEff}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-2)]">Defensive efficiency (Allowed/Poss)</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                    teamA.isDefEffManual
                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  }`}
                >
                  {teamA.isDefEffManual ? 'Manual' : 'Auto (DRtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamA.defEff}
                onChange={(e) => setTeamA((prev) => ({ ...prev, defEff: e.target.value, isDefEffManual: true }))}
                className={`min-h-[44px] w-full bg-[var(--surface-2)] border px-3 rounded-[12px] text-[13px] text-[var(--text)] tabular-nums focus:outline-none ${
                  validation.errors.teamA?.defEff ? 'border-[var(--danger)]' : 'border-[var(--line)] focus:border-[var(--accent)]'
                }`}
              />
              {validation.errors.teamA?.defEff && (
                <p className="text-[11px] text-[var(--danger)] mt-1">{validation.errors.teamA.defEff}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-2)]">Possessions per game (Pace)</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                    teamA.isPossManual
                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  }`}
                >
                  {teamA.isPossManual ? 'Manual' : 'Auto (Pace)'}
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min={POSSESSIONS_MIN}
                max={POSSESSIONS_MAX}
                value={teamA.poss}
                onChange={(e) => setTeamA((prev) => ({ ...prev, poss: e.target.value, isPossManual: true }))}
                className={`min-h-[44px] w-full bg-[var(--surface-2)] border px-3 rounded-[12px] text-[13px] text-[var(--text)] tabular-nums focus:outline-none ${
                  validation.errors.teamA?.poss ? 'border-[var(--danger)]' : 'border-[var(--line)] focus:border-[var(--accent)]'
                }`}
              />
              {validation.errors.teamA?.poss && (
                <p className="text-[11px] text-[var(--danger)] mt-1">{validation.errors.teamA.poss}</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between text-[10.5px] text-[var(--text-3)]">
            <span className="truncate max-w-[200px]">{teamA.source || 'NBA Advanced Ratings'}</span>
            <span>{teamA.lastUpdated || `Season ${season}`}</span>
          </div>
        </div>

        {/* Team B */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--line)]">
            <div>
              <span className="text-[10.5px] text-[var(--info)] font-semibold block">
                Team B (Away)
              </span>
              <h3 className="font-display text-[14px] font-[600] text-[var(--text)]">
                {teamB.name}
              </h3>
            </div>

            {(teamB.isOffEffManual || teamB.isDefEffManual || teamB.isPossManual) && (
              <button
                onClick={handleResetTeamB}
                type="button"
                className="min-h-[44px] text-[11px] text-[var(--text-2)] hover:text-[var(--info)] flex items-center gap-1 transition-colors px-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] touch-press"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Reset auto</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-2)] mb-1 font-medium">
              Select NBA franchise
            </label>
            <select
              value={teamB.teamAbbr}
              onChange={(e) => handleSelectTeamB(e.target.value)}
              className="min-h-[44px] w-full bg-[var(--surface-2)] border border-[var(--line)] px-3 rounded-[12px] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--info)] font-medium"
            >
              {allTeams.map((t) => (
                <option key={t.abbreviation} value={t.abbreviation} className="bg-[var(--bg)] text-[var(--text)]">
                  {t.name} ({t.abbreviation} · {t.conference})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-2)]">Offensive efficiency (Pts/Poss)</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                    teamB.isOffEffManual
                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  }`}
                >
                  {teamB.isOffEffManual ? 'Manual' : 'Auto (ORtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamB.offEff}
                onChange={(e) => setTeamB((prev) => ({ ...prev, offEff: e.target.value, isOffEffManual: true }))}
                className={`min-h-[44px] w-full bg-[var(--surface-2)] border px-3 rounded-[12px] text-[13px] text-[var(--text)] tabular-nums focus:outline-none ${
                  validation.errors.teamB?.offEff ? 'border-[var(--danger)]' : 'border-[var(--line)] focus:border-[var(--info)]'
                }`}
              />
              {validation.errors.teamB?.offEff && (
                <p className="text-[11px] text-[var(--danger)] mt-1">{validation.errors.teamB.offEff}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-2)]">Defensive efficiency (Allowed/Poss)</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                    teamB.isDefEffManual
                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  }`}
                >
                  {teamB.isDefEffManual ? 'Manual' : 'Auto (DRtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamB.defEff}
                onChange={(e) => setTeamB((prev) => ({ ...prev, defEff: e.target.value, isDefEffManual: true }))}
                className={`min-h-[44px] w-full bg-[var(--surface-2)] border px-3 rounded-[12px] text-[13px] text-[var(--text)] tabular-nums focus:outline-none ${
                  validation.errors.teamB?.defEff ? 'border-[var(--danger)]' : 'border-[var(--line)] focus:border-[var(--info)]'
                }`}
              />
              {validation.errors.teamB?.defEff && (
                <p className="text-[11px] text-[var(--danger)] mt-1">{validation.errors.teamB.defEff}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[var(--text-2)]">Possessions per game (Pace)</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                    teamB.isPossManual
                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                  }`}
                >
                  {teamB.isPossManual ? 'Manual' : 'Auto (Pace)'}
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min={POSSESSIONS_MIN}
                max={POSSESSIONS_MAX}
                value={teamB.poss}
                onChange={(e) => setTeamB((prev) => ({ ...prev, poss: e.target.value, isPossManual: true }))}
                className={`min-h-[44px] w-full bg-[var(--surface-2)] border px-3 rounded-[12px] text-[13px] text-[var(--text)] tabular-nums focus:outline-none ${
                  validation.errors.teamB?.poss ? 'border-[var(--danger)]' : 'border-[var(--line)] focus:border-[var(--info)]'
                }`}
              />
              {validation.errors.teamB?.poss && (
                <p className="text-[11px] text-[var(--danger)] mt-1">{validation.errors.teamB.poss}</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between text-[10.5px] text-[var(--text-3)]">
            <span className="truncate max-w-[200px]">{teamB.source || 'NBA Advanced Ratings'}</span>
            <span>{teamB.lastUpdated || `Season ${season}`}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button
          onClick={handleSwapTeams}
          type="button"
          className="min-h-[44px] px-4 rounded-[12px] bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--line)] text-[12.5px] font-medium text-[var(--text)] flex items-center gap-2 transition-colors touch-press"
        >
          <ArrowLeftRight className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} />
          <span>Swap teams</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5 bg-[var(--surface)] border border-[var(--line)] p-2 rounded-[18px] text-[12px]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-2)] pl-1">Game total line:</span>
            <input
              type="number"
              step="0.5"
              placeholder="Optional"
              value={sportsbookTotal}
              onChange={(e) => setSportsbookTotal(e.target.value)}
              className="min-h-[44px] w-24 bg-[var(--surface-2)] border border-[var(--line)] px-2.5 rounded-[12px] text-center text-[var(--text)] text-[13px] tabular-nums"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--text-2)] pl-1">1st half line:</span>
            <input
              type="number"
              step="0.5"
              placeholder="Optional"
              value={sportsbookH1Total}
              onChange={(e) => setSportsbookH1Total(e.target.value)}
              className="min-h-[44px] w-24 bg-[var(--surface-2)] border border-[var(--line)] px-2.5 rounded-[12px] text-center text-[var(--text)] text-[13px] tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Results Card */}
      {calculationResult && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-3.5 border-b border-[var(--line)]">
            <div className="space-y-1">
              <span className="text-[11px] text-[var(--accent)] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Model output summary</span>
              </span>
              <div className="font-display text-[20px] font-bold tabular-nums text-[var(--text)]">
                {teamA.name}: <span className="text-[var(--accent)]">{calculationResult.aProjected.toFixed(2)}</span>
                {' · '}
                {teamB.name}: <span className="text-[var(--info)]">{calculationResult.bProjected.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-left sm:text-right bg-[var(--surface-2)] border border-[var(--line)] px-3.5 py-2.5 rounded-[12px]">
              <div className="text-[10.5px] text-[var(--text-2)]">Projected game &amp; 1H totals</div>
              <div className="text-[14px] font-bold text-[var(--accent)] tabular-nums">
                Game total: {calculationResult.total.toFixed(2)} pts
              </div>
              <div className="text-[12px] text-[var(--text)] mt-0.5 tabular-nums">
                1st half est: {h1ProjectedTotal !== null ? h1ProjectedTotal.toFixed(2) : '—'} pts
              </div>
            </div>
          </div>

          {(calculationResult.totalLean || h1Lean) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {calculationResult.totalLean && (
                <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-2)] flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                      <span>Game total ({calculationResult.totalLean.line})</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full font-semibold text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                      {calculationResult.totalLean.lean === 'OVER'
                        ? 'Over lean'
                        : calculationResult.totalLean.lean === 'UNDER'
                        ? 'Under lean'
                        : 'Even'}
                    </span>
                  </div>
                  <div className="text-[12.5px] font-medium text-[var(--text)]">
                    {calculationResult.totalLean.recommendation}
                  </div>
                </div>
              )}

              {h1Lean && (
                <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-2)] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                      <span>1st half line ({h1Lean.line})</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full font-semibold text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                      {h1Lean.lean === 'OVER' ? 'Over lean' : h1Lean.lean === 'UNDER' ? 'Under lean' : 'Even'}
                    </span>
                  </div>
                  <div className="text-[12.5px] font-medium text-[var(--text)]">
                    1st half projection {(h1Lean.diff >= 0 ? '+' : '') + h1Lean.diff.toFixed(2)} pts vs {h1Lean.line}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step-by-Step Math */}
          <div className="space-y-2.5 pt-1">
            <h3 className="font-display text-[14px] font-[600] text-[var(--text)] flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} />
              <span>Step-by-step mathematical breakdown</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[12px]">
              <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] space-y-1">
                <div className="text-[11px] text-[var(--accent)] font-semibold">Step 1: Offense calculation</div>
                <div className="text-[var(--text-2)]">Offensive efficiency × possessions</div>
                <div className="text-[var(--text)] pt-0.5 space-y-1 tabular-nums">
                  <div>
                    <span className="text-[var(--text-2)]">A offense ({teamA.name.split(' ').pop()}): </span>
                    <span>{inputA.offensiveEfficiency.toFixed(3)} × {inputA.possessions.toFixed(1)} = </span>
                    <span className="text-[var(--accent)] font-semibold">{calculationResult.aOff.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-2)]">B offense ({teamB.name.split(' ').pop()}): </span>
                    <span>{inputB.offensiveEfficiency.toFixed(3)} × {inputB.possessions.toFixed(1)} = </span>
                    <span className="text-[var(--info)] font-semibold">{calculationResult.bOff.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] space-y-1">
                <div className="text-[11px] text-[var(--accent)] font-semibold">Step 2: Defense adjustment</div>
                <div className="text-[var(--text-2)]">Defensive efficiency × opponent possessions</div>
                <div className="text-[var(--text)] pt-0.5 space-y-1 tabular-nums">
                  <div>
                    <span className="text-[var(--text-2)]">A defense (vs B): </span>
                    <span>{inputA.defensiveEfficiency.toFixed(3)} × {inputB.possessions.toFixed(1)} = </span>
                    <span className="text-[var(--accent)] font-semibold">{calculationResult.aDef.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-2)]">B defense (vs A): </span>
                    <span>{inputB.defensiveEfficiency.toFixed(3)} × {inputA.possessions.toFixed(1)} = </span>
                    <span className="text-[var(--info)] font-semibold">{calculationResult.bDef.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] space-y-1">
                <div className="text-[11px] text-[var(--accent)] font-semibold">Step 3: Projected scores</div>
                <div className="text-[var(--text-2)]">(Team offense + opponent allowed defense) / 2</div>
                <div className="text-[var(--text)] pt-0.5 space-y-1 tabular-nums">
                  <div>
                    <span className="text-[var(--text-2)]">A projected: </span>
                    <span>({calculationResult.aOff.toFixed(2)} + {calculationResult.bDef.toFixed(2)}) / 2 = </span>
                    <span className="text-[var(--accent)] font-semibold text-[13px]">{calculationResult.aProjected.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-2)]">B projected: </span>
                    <span>({calculationResult.bOff.toFixed(2)} + {calculationResult.aDef.toFixed(2)}) / 2 = </span>
                    <span className="text-[var(--info)] font-semibold text-[13px]">{calculationResult.bProjected.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] space-y-1">
                <div className="text-[11px] text-[var(--accent)] font-semibold">Step 4: Game &amp; 1st half totals</div>
                <div className="text-[var(--text-2)]">Game total = A + B · 1st half = 50.3% share</div>
                <div className="text-[var(--text)] pt-0.5 space-y-1 tabular-nums">
                  <div>
                    <span className="text-[var(--text-2)]">Projected game total: </span>
                    <span>{calculationResult.aProjected.toFixed(2)} + {calculationResult.bProjected.toFixed(2)} = </span>
                    <span className="text-[var(--accent)] font-semibold text-[13px]">{calculationResult.total.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-2)]">Projected 1st half: </span>
                    <span>{calculationResult.total.toFixed(2)} × 0.503 = </span>
                    <span className="text-[var(--text)] font-semibold">{h1ProjectedTotal !== null ? h1ProjectedTotal.toFixed(2) : '—'} pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Responsible Use Footer */}
      <div className="p-3.5 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] flex items-center justify-between gap-2 text-[11.5px] text-[var(--text-2)]">
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[var(--medium)] shrink-0" strokeWidth={1.75} />
          <span>
            <strong className="text-[var(--text)] font-semibold">Responsible use:</strong> Statistical estimate, not a guaranteed outcome.
          </span>
        </span>
        <span className="text-[10.5px] text-[var(--text-3)] hidden sm:inline">NBA Efficiency v1.0</span>
      </div>
    </div>
  );
}
