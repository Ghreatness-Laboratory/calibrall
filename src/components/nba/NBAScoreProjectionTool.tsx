'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  getAllNBATeamsList, 
  NBA_TEAMS_CATALOG, 
  NBA_SEASONS, 
  NBASeason 
} from '@/lib/data/nbaSeedData';
import { 
  calculateNBAScoreProjection, 
  validateTeamInputs, 
  TeamEfficiencyInput, 
  StepByStepCalculation,
  EFFICIENCY_MIN,
  EFFICIENCY_MAX,
  POSSESSIONS_MIN,
  POSSESSIONS_MAX
} from '@/lib/prediction/nbaMath';
import { 
  ArrowLeftRight, 
  RefreshCw, 
  Calculator, 
  RotateCcw, 
  CheckCircle2, 
  TrendingUp, 
  ShieldCheck, 
  HelpCircle,
  AlertTriangle,
  Sparkles,
  Info
} from 'lucide-react';
import { NBATeamStats } from '@/types';

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

  // Sportsbook optional lines
  const [sportsbookTotal, setSportsbookTotal] = useState<string>('224.5');
  const [sportsbookSpreadTeamA, setSportsbookSpreadTeamA] = useState<string>('-5.5');

  const allTeams = useMemo(() => getAllNBATeamsList(), []);

  // Team A State - prefilled with Boston Celtics test example
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
    lastUpdated: 'Season 2024-25 · Updated today',
  });

  // Team B State - prefilled with Detroit Pistons test example
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
    lastUpdated: 'Season 2024-25 · Updated today',
  });

  // Fetch stats from server-side API route
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

  // Update Team A inputs when selecting team from dropdown
  const handleSelectTeamA = (abbr: string) => {
    const catalogItem = NBA_TEAMS_CATALOG[abbr];
    if (!catalogItem) return;

    const pulled = apiStats[abbr] || catalogItem.statsBySeason[season];
    const off = (pulled.offensiveEfficiency).toFixed(3);
    const def = (pulled.defensiveEfficiency).toFixed(3);
    const pos = (pulled.possessions).toFixed(1);

    setTeamA({
      teamAbbr: abbr,
      name: catalogItem.name,
      offEff: off,
      defEff: def,
      poss: pos,
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
      pulledStats: apiStats[abbr] || null,
      source: apiStats[abbr]?.source || 'Official NBA Advanced Stats (ORtg/100, DRtg/100, PACE)',
      lastUpdated: `Season ${season} · ${apiStats[abbr]?.lastUpdated || 'Updated today'}`,
    });
  };

  // Update Team B inputs when selecting team from dropdown
  const handleSelectTeamB = (abbr: string) => {
    const catalogItem = NBA_TEAMS_CATALOG[abbr];
    if (!catalogItem) return;

    const pulled = apiStats[abbr] || catalogItem.statsBySeason[season];
    const off = (pulled.offensiveEfficiency).toFixed(3);
    const def = (pulled.defensiveEfficiency).toFixed(3);
    const pos = (pulled.possessions).toFixed(1);

    setTeamB({
      teamAbbr: abbr,
      name: catalogItem.name,
      offEff: off,
      defEff: def,
      poss: pos,
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
      pulledStats: apiStats[abbr] || null,
      source: apiStats[abbr]?.source || 'Official NBA Advanced Stats (ORtg/100, DRtg/100, PACE)',
      lastUpdated: `Season ${season} · ${apiStats[abbr]?.lastUpdated || 'Updated today'}`,
    });
  };

  // Swap Teams
  const handleSwapTeams = () => {
    const temp = { ...teamA };
    setTeamA({ ...teamB });
    setTeamB(temp);

    // Also invert spread line if present
    const spreadNum = parseFloat(sportsbookSpreadTeamA);
    if (!isNaN(spreadNum)) {
      setSportsbookSpreadTeamA((-spreadNum).toString());
    }
  };

  // Reset Team A to Auto
  const handleResetTeamA = () => {
    const catalogItem = NBA_TEAMS_CATALOG[teamA.teamAbbr];
    if (!catalogItem) return;
    const pulled = apiStats[teamA.teamAbbr] || catalogItem.statsBySeason[season];
    setTeamA(prev => ({
      ...prev,
      offEff: (pulled.offensiveEfficiency).toFixed(3),
      defEff: (pulled.defensiveEfficiency).toFixed(3),
      poss: (pulled.possessions).toFixed(1),
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
    }));
  };

  // Reset Team B to Auto
  const handleResetTeamB = () => {
    const catalogItem = NBA_TEAMS_CATALOG[teamB.teamAbbr];
    if (!catalogItem) return;
    const pulled = apiStats[teamB.teamAbbr] || catalogItem.statsBySeason[season];
    setTeamB(prev => ({
      ...prev,
      offEff: (pulled.offensiveEfficiency).toFixed(3),
      defEff: (pulled.defensiveEfficiency).toFixed(3),
      poss: (pulled.possessions).toFixed(1),
      isOffEffManual: false,
      isDefEffManual: false,
      isPossManual: false,
    }));
  };

  // Convert inputs to numbers
  const inputA: TeamEfficiencyInput = useMemo(() => ({
    name: teamA.name,
    offensiveEfficiency: parseFloat(teamA.offEff),
    defensiveEfficiency: parseFloat(teamA.defEff),
    possessions: parseFloat(teamA.poss),
  }), [teamA]);

  const inputB: TeamEfficiencyInput = useMemo(() => ({
    name: teamB.name,
    offensiveEfficiency: parseFloat(teamB.offEff),
    defensiveEfficiency: parseFloat(teamB.defEff),
    possessions: parseFloat(teamB.poss),
  }), [teamB]);

  // Validation
  const validation = useMemo(() => {
    return validateTeamInputs(inputA, inputB);
  }, [inputA, inputB]);

  // Calculation Results
  const calculationResult: StepByStepCalculation | null = useMemo(() => {
    if (!validation.isValid) return null;
    return calculateNBAScoreProjection(
      inputA,
      inputB,
      {
        totalLine: sportsbookTotal ? parseFloat(sportsbookTotal) : undefined,
        spreadLineTeamA: sportsbookSpreadTeamA ? parseFloat(sportsbookSpreadTeamA) : undefined,
      }
    );
  }, [inputA, inputB, validation.isValid, sportsbookTotal, sportsbookSpreadTeamA]);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[20px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <span>NBA Score Projection Engine</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-[4px] bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30">
              Verified Model
            </span>
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Offensive & Defensive efficiency ratings multiplied by pace possessions. Fully auditable step-by-step math.
          </p>
        </div>

        {/* Season & Refresh Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#0f2219] border border-white/[0.08] px-2.5 py-1 rounded-[8px] text-[12px]">
            <span className="text-[#8fa69a] text-[11px]">Season:</span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value as NBASeason)}
              className="bg-transparent text-[#e8efe9] font-medium focus:outline-hidden cursor-pointer"
            >
              {NBA_SEASONS.map((s) => (
                <option key={s} value={s} className="bg-[#0a1812] text-[#e8efe9]">
                  {s}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchStats(season, true)}
            disabled={isLoadingStats}
            type="button"
            className="h-[34px] px-3 rounded-[8px] bg-[#0f2219] hover:bg-white/[0.04] border border-white/[0.08] text-[12px] text-[#8fa69a] hover:text-[#e8efe9] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Refresh stats from live provider"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin text-[#b8e63a]' : ''}`} />
            <span>{isLoadingStats ? 'Refreshing...' : 'Refresh stats'}</span>
          </button>
        </div>
      </div>

      {/* Warning/Error notice if API limits reached */}
      {statsError && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-[10px] flex items-start gap-2.5 text-[12px] text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <span className="font-[500] text-amber-200">API Status: </span>
            {statsError} You can type stats manually below.
          </div>
        </div>
      )}

      {/* Two Team Panels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TEAM A PANEL */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <div>
              <span className="text-[11px] font-mono text-[#b8e63a] uppercase tracking-wider font-semibold">
                Team A (Home / Favorite)
              </span>
              <h2 className="text-[16px] font-[500] text-[#e8efe9]">
                {teamA.name}
              </h2>
            </div>

            {(teamA.isOffEffManual || teamA.isDefEffManual || teamA.isPossManual) && (
              <button
                onClick={handleResetTeamA}
                type="button"
                className="text-[11px] text-[#8fa69a] hover:text-[#b8e63a] flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to auto</span>
              </button>
            )}
          </div>

          {/* Team Dropdown Selector */}
          <div>
            <label className="block text-[11px] text-[#8fa69a] mb-1 font-medium">Select NBA Franchise (All 30)</label>
            <select
              value={teamA.teamAbbr}
              onChange={(e) => handleSelectTeamA(e.target.value)}
              className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-2 rounded-[8px] text-[13px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a] font-medium"
            >
              {allTeams.map((t) => (
                <option key={t.abbreviation} value={t.abbreviation} className="bg-[#0a1812] text-[#e8efe9]">
                  {t.name} ({t.abbreviation} - {t.conference})
                </option>
              ))}
            </select>
          </div>

          {/* Three Team Inputs */}
          <div className="space-y-3">
            {/* 1. Offensive Efficiency */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8fa69a]">Offensive Efficiency (Pts / Poss)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  teamA.isOffEffManual 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30'
                }`}>
                  {teamA.isOffEffManual ? 'Manual' : 'Auto (ORtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamA.offEff}
                onChange={(e) => setTeamA(prev => ({ ...prev, offEff: e.target.value, isOffEffManual: true }))}
                className={`w-full bg-[#0a1812] border px-3 py-1.5 rounded-[8px] text-[13px] font-mono text-[#e8efe9] focus:outline-hidden ${
                  validation.errors.teamA?.offEff ? 'border-rose-500 ring-1 ring-rose-500' : 'border-white/[0.08] focus:border-[#b8e63a]'
                }`}
              />
              {validation.errors.teamA?.offEff && (
                <p className="text-[11px] text-rose-400 mt-1">{validation.errors.teamA.offEff}</p>
              )}
            </div>

            {/* 2. Defensive Efficiency */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8fa69a]">Defensive Efficiency (Pts allowed / Poss)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  teamA.isDefEffManual 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30'
                }`}>
                  {teamA.isDefEffManual ? 'Manual' : 'Auto (DRtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamA.defEff}
                onChange={(e) => setTeamA(prev => ({ ...prev, defEff: e.target.value, isDefEffManual: true }))}
                className={`w-full bg-[#0a1812] border px-3 py-1.5 rounded-[8px] text-[13px] font-mono text-[#e8efe9] focus:outline-hidden ${
                  validation.errors.teamA?.defEff ? 'border-rose-500 ring-1 ring-rose-500' : 'border-white/[0.08] focus:border-[#b8e63a]'
                }`}
              />
              {validation.errors.teamA?.defEff && (
                <p className="text-[11px] text-rose-400 mt-1">{validation.errors.teamA.defEff}</p>
              )}
            </div>

            {/* 3. Possessions Per Game */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8fa69a]">Possessions Per Game (PACE)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  teamA.isPossManual 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30'
                }`}>
                  {teamA.isPossManual ? 'Manual' : 'Auto (PACE)'}
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min={POSSESSIONS_MIN}
                max={POSSESSIONS_MAX}
                value={teamA.poss}
                onChange={(e) => setTeamA(prev => ({ ...prev, poss: e.target.value, isPossManual: true }))}
                className={`w-full bg-[#0a1812] border px-3 py-1.5 rounded-[8px] text-[13px] font-mono text-[#e8efe9] focus:outline-hidden ${
                  validation.errors.teamA?.poss ? 'border-rose-500 ring-1 ring-rose-500' : 'border-white/[0.08] focus:border-[#b8e63a]'
                }`}
              />
              {validation.errors.teamA?.poss && (
                <p className="text-[11px] text-rose-400 mt-1">{validation.errors.teamA.poss}</p>
              )}
            </div>
          </div>

          {/* Stats Source Footer */}
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#8fa69a]">
            <span className="truncate max-w-[200px]">{teamA.source || 'Stats source: NBA Advanced Ratings'}</span>
            <span className="font-mono">{teamA.lastUpdated || `Season ${season}`}</span>
          </div>
        </div>

        {/* TEAM B PANEL */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <div>
              <span className="text-[11px] font-mono text-[#5eb6e8] uppercase tracking-wider font-semibold">
                Team B (Away / Underdog)
              </span>
              <h2 className="text-[16px] font-[500] text-[#e8efe9]">
                {teamB.name}
              </h2>
            </div>

            {(teamB.isOffEffManual || teamB.isDefEffManual || teamB.isPossManual) && (
              <button
                onClick={handleResetTeamB}
                type="button"
                className="text-[11px] text-[#8fa69a] hover:text-[#5eb6e8] flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to auto</span>
              </button>
            )}
          </div>

          {/* Team Dropdown Selector */}
          <div>
            <label className="block text-[11px] text-[#8fa69a] mb-1 font-medium">Select NBA Franchise (All 30)</label>
            <select
              value={teamB.teamAbbr}
              onChange={(e) => handleSelectTeamB(e.target.value)}
              className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-2 rounded-[8px] text-[13px] text-[#e8efe9] focus:outline-hidden focus:border-[#5eb6e8] font-medium"
            >
              {allTeams.map((t) => (
                <option key={t.abbreviation} value={t.abbreviation} className="bg-[#0a1812] text-[#e8efe9]">
                  {t.name} ({t.abbreviation} - {t.conference})
                </option>
              ))}
            </select>
          </div>

          {/* Three Team Inputs */}
          <div className="space-y-3">
            {/* 1. Offensive Efficiency */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8fa69a]">Offensive Efficiency (Pts / Poss)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  teamB.isOffEffManual 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-[#5eb6e8]/15 text-[#5eb6e8] border border-[#5eb6e8]/30'
                }`}>
                  {teamB.isOffEffManual ? 'Manual' : 'Auto (ORtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamB.offEff}
                onChange={(e) => setTeamB(prev => ({ ...prev, offEff: e.target.value, isOffEffManual: true }))}
                className={`w-full bg-[#0a1812] border px-3 py-1.5 rounded-[8px] text-[13px] font-mono text-[#e8efe9] focus:outline-hidden ${
                  validation.errors.teamB?.offEff ? 'border-rose-500 ring-1 ring-rose-500' : 'border-white/[0.08] focus:border-[#5eb6e8]'
                }`}
              />
              {validation.errors.teamB?.offEff && (
                <p className="text-[11px] text-rose-400 mt-1">{validation.errors.teamB.offEff}</p>
              )}
            </div>

            {/* 2. Defensive Efficiency */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8fa69a]">Defensive Efficiency (Pts allowed / Poss)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  teamB.isDefEffManual 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-[#5eb6e8]/15 text-[#5eb6e8] border border-[#5eb6e8]/30'
                }`}>
                  {teamB.isDefEffManual ? 'Manual' : 'Auto (DRtg/100)'}
                </span>
              </div>
              <input
                type="number"
                step="0.001"
                min={EFFICIENCY_MIN}
                max={EFFICIENCY_MAX}
                value={teamB.defEff}
                onChange={(e) => setTeamB(prev => ({ ...prev, defEff: e.target.value, isDefEffManual: true }))}
                className={`w-full bg-[#0a1812] border px-3 py-1.5 rounded-[8px] text-[13px] font-mono text-[#e8efe9] focus:outline-hidden ${
                  validation.errors.teamB?.defEff ? 'border-rose-500 ring-1 ring-rose-500' : 'border-white/[0.08] focus:border-[#5eb6e8]'
                }`}
              />
              {validation.errors.teamB?.defEff && (
                <p className="text-[11px] text-rose-400 mt-1">{validation.errors.teamB.defEff}</p>
              )}
            </div>

            {/* 3. Possessions Per Game */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#8fa69a]">Possessions Per Game (PACE)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  teamB.isPossManual 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-[#5eb6e8]/15 text-[#5eb6e8] border border-[#5eb6e8]/30'
                }`}>
                  {teamB.isPossManual ? 'Manual' : 'Auto (PACE)'}
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min={POSSESSIONS_MIN}
                max={POSSESSIONS_MAX}
                value={teamB.poss}
                onChange={(e) => setTeamB(prev => ({ ...prev, poss: e.target.value, isPossManual: true }))}
                className={`w-full bg-[#0a1812] border px-3 py-1.5 rounded-[8px] text-[13px] font-mono text-[#e8efe9] focus:outline-hidden ${
                  validation.errors.teamB?.poss ? 'border-rose-500 ring-1 ring-rose-500' : 'border-white/[0.08] focus:border-[#5eb6e8]'
                }`}
              />
              {validation.errors.teamB?.poss && (
                <p className="text-[11px] text-rose-400 mt-1">{validation.errors.teamB.poss}</p>
              )}
            </div>
          </div>

          {/* Stats Source Footer */}
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#8fa69a]">
            <span className="truncate max-w-[200px]">{teamB.source || 'Stats source: NBA Advanced Ratings'}</span>
            <span className="font-mono">{teamB.lastUpdated || `Season ${season}`}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Swap Teams & Calculate */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={handleSwapTeams}
          type="button"
          className="h-[42px] px-4 rounded-[8px] bg-[#0f2219] hover:bg-white/[0.05] border border-white/[0.08] text-[13px] font-medium text-[#e8efe9] flex items-center gap-2 transition-colors touch-manipulation"
        >
          <ArrowLeftRight className="w-4 h-4 text-[#b8e63a]" />
          <span>Swap teams</span>
        </button>

        {/* Sportsbook Line Inputs (Optional) */}
        <div className="flex items-center gap-3 bg-[#0f2219] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[12px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[#8fa69a]">Total Line:</span>
            <input
              type="number"
              step="0.5"
              placeholder="e.g. 224.5"
              value={sportsbookTotal}
              onChange={(e) => setSportsbookTotal(e.target.value)}
              className="w-16 bg-[#0a1812] border border-white/[0.08] px-2 py-0.5 rounded text-center text-[#e8efe9] font-mono"
            />
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-1.5">
            <span className="text-[#8fa69a]">{teamA.name.split(' ').pop()} Spread:</span>
            <input
              type="number"
              step="0.5"
              placeholder="e.g. -5.5"
              value={sportsbookSpreadTeamA}
              onChange={(e) => setSportsbookSpreadTeamA(e.target.value)}
              className="w-16 bg-[#0a1812] border border-white/[0.08] px-2 py-0.5 rounded text-center text-[#e8efe9] font-mono"
            />
          </div>
        </div>
      </div>

      {/* RESULTS CARD: Step-by-Step Mathematical Breakdown */}
      {calculationResult && (
        <div className="bg-[#0f2219] border border-[#b8e63a]/30 rounded-[12px] p-5 space-y-5">
          {/* Top Banner: Final Projection & Winner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#b8e63a] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Model Output Summary</span>
              </span>
              <div className="text-[24px] sm:text-[28px] font-semibold font-mono tabular-nums text-[#e8efe9]">
                {teamA.name}: <span className="text-[#b8e63a]">{calculationResult.aProjected.toFixed(2)}</span>
                {'  '}—{'  '}
                {teamB.name}: <span className="text-[#5eb6e8]">{calculationResult.bProjected.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-right sm:text-right bg-[#0a1812] border border-white/[0.08] px-4 py-2.5 rounded-[10px]">
              <div className="text-[11px] text-[#8fa69a]">Projected Winner & Margin</div>
              <div className="text-[16px] font-[600] text-[#e8efe9]">
                {calculationResult.projectedWinner} by {calculationResult.margin.toFixed(2)} pts
              </div>
              <div className="text-[12px] font-mono text-[#b8e63a] mt-0.5">
                Total: {calculationResult.total.toFixed(2)} pts
              </div>
            </div>
          </div>

          {/* Sportsbook Lean Cards */}
          {(calculationResult.totalLean || calculationResult.spreadLean) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {calculationResult.totalLean && (
                <div className="p-3 bg-[#0a1812] border border-white/[0.08] rounded-[8px] space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#8fa69a] flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-[#b8e63a]" />
                      <span>Total Line Market ({calculationResult.totalLean.line})</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded font-mono font-semibold text-[11px] ${
                      calculationResult.totalLean.lean === 'OVER' 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : calculationResult.totalLean.lean === 'UNDER'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-white/10 text-white'
                    }`}>
                      {calculationResult.totalLean.lean} LEAN
                    </span>
                  </div>
                  <div className="text-[13px] font-medium text-[#e8efe9]">
                    {calculationResult.totalLean.recommendation}
                  </div>
                </div>
              )}

              {calculationResult.spreadLean && (
                <div className="p-3 bg-[#0a1812] border border-white/[0.08] rounded-[8px] space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#8fa69a] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#b8e63a]" />
                      <span>Spread Against The Spread (ATS)</span>
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-[#b8e63a]/20 text-[#b8e63a] border border-[#b8e63a]/30">
                      SIDE LEAN
                    </span>
                  </div>
                  <div className="text-[13px] font-medium text-[#e8efe9]">
                    {calculationResult.spreadLean.recommendation}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step-by-Step Math Visualization */}
          <div className="space-y-3 pt-2">
            <h3 className="text-[13px] font-[500] text-[#e8efe9] flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-[#b8e63a]" />
              <span>Exact Step-by-Step Mathematical Calculation</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] font-mono">
              {/* Step 1: Offense */}
              <div className="p-3 bg-[#0a1812] rounded-[8px] border border-white/[0.06] space-y-1.5">
                <div className="text-[11px] text-[#b8e63a] font-sans font-semibold">
                  Step 1: Offense Calculation
                </div>
                <div className="text-[#8fa69a] text-[11px]">
                  Formula: Offensive Efficiency × Possessions
                </div>
                <div className="text-[#e8efe9] pt-1 space-y-1">
                  <div>
                    <span className="text-[#8fa69a]">A_off ({teamA.name.split(' ').pop()}): </span>
                    <span>{inputA.offensiveEfficiency.toFixed(3)} × {inputA.possessions.toFixed(1)} = </span>
                    <span className="text-[#b8e63a] font-semibold">{calculationResult.aOff.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#8fa69a]">B_off ({teamB.name.split(' ').pop()}): </span>
                    <span>{inputB.offensiveEfficiency.toFixed(3)} × {inputB.possessions.toFixed(1)} = </span>
                    <span className="text-[#5eb6e8] font-semibold">{calculationResult.bOff.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Step 2: Defense */}
              <div className="p-3 bg-[#0a1812] rounded-[8px] border border-white/[0.06] space-y-1.5">
                <div className="text-[11px] text-[#b8e63a] font-sans font-semibold">
                  Step 2: Defense (Opponent Possessions)
                </div>
                <div className="text-[#8fa69a] text-[11px]">
                  Formula: Defensive Efficiency × Opponent Possessions
                </div>
                <div className="text-[#e8efe9] pt-1 space-y-1">
                  <div>
                    <span className="text-[#8fa69a]">A_def (allows vs B): </span>
                    <span>{inputA.defensiveEfficiency.toFixed(3)} × {inputB.possessions.toFixed(1)} = </span>
                    <span className="text-[#b8e63a] font-semibold">{calculationResult.aDef.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#8fa69a]">B_def (allows vs A): </span>
                    <span>{inputB.defensiveEfficiency.toFixed(3)} × {inputA.possessions.toFixed(1)} = </span>
                    <span className="text-[#5eb6e8] font-semibold">{calculationResult.bDef.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Step 3: Projected Score */}
              <div className="p-3 bg-[#0a1812] rounded-[8px] border border-white/[0.06] space-y-1.5">
                <div className="text-[11px] text-[#b8e63a] font-sans font-semibold">
                  Step 3: Projected Score (Averaging)
                </div>
                <div className="text-[#8fa69a] text-[11px]">
                  Formula: (Team Offense + Opponent Allowed Defense) / 2
                </div>
                <div className="text-[#e8efe9] pt-1 space-y-1">
                  <div>
                    <span className="text-[#8fa69a]">A_projected: </span>
                    <span>({calculationResult.aOff.toFixed(2)} + {calculationResult.bDef.toFixed(2)}) / 2 = </span>
                    <span className="text-[#b8e63a] font-bold text-[14px]">{calculationResult.aProjected.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#8fa69a]">B_projected: </span>
                    <span>({calculationResult.bOff.toFixed(2)} + {calculationResult.aDef.toFixed(2)}) / 2 = </span>
                    <span className="text-[#5eb6e8] font-bold text-[14px]">{calculationResult.bProjected.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Step 4: Total & Margin */}
              <div className="p-3 bg-[#0a1812] rounded-[8px] border border-white/[0.06] space-y-1.5">
                <div className="text-[11px] text-[#b8e63a] font-sans font-semibold">
                  Step 4: Total, Margin & Winner
                </div>
                <div className="text-[#8fa69a] text-[11px]">
                  Formula: Projected Total = A_proj + B_proj; Margin = |A - B|
                </div>
                <div className="text-[#e8efe9] pt-1 space-y-1">
                  <div>
                    <span className="text-[#8fa69a]">Projected Total: </span>
                    <span>{calculationResult.aProjected.toFixed(2)} + {calculationResult.bProjected.toFixed(2)} = </span>
                    <span className="text-[#b8e63a] font-bold text-[14px]">{calculationResult.total.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#8fa69a]">Spread Margin: </span>
                    <span>|{calculationResult.aProjected.toFixed(2)} - {calculationResult.bProjected.toFixed(2)}| = </span>
                    <span className="text-[#e8efe9] font-bold">{calculationResult.margin.toFixed(2)} pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Responsible Use Footer Requirement */}
      <div className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[10px] flex items-center justify-between text-[11px] text-[#8fa69a]">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#b8e63a]" />
          <span>Statistical estimate, not a guaranteed outcome. Please use responsibly.</span>
        </span>
        <span className="font-mono text-[#8fa69a]/70 hidden sm:inline">
          NBA Efficiency Model v1.0
        </span>
      </div>
    </div>
  );
}
