'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { MarketPrediction, Team } from '@/types';
import { 
  SlidersHorizontal,
  AlertCircle,
  Info
} from 'lucide-react';
import { 
  formatOdds, 
  formatSelectionName, 
  getOptionTypeLabel,
  formatExpectedValue
} from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';
import { useSport } from '@/lib/context/SportContext';
import { generateNBAPredictions } from '@/lib/data/nbaSeedData';
import TeamCrest from '@/components/TeamCrest';
import { 
  cleanDisplayText, 
  formatSignedValue, 
  displayName, 
  getTeamAbbreviation, 
  formatMatchTime 
} from '@/lib/utils/formatText';

type MarketGroupFilter = 'ALL' | 'goals' | 'corners' | 'cards' | 'handicap' | 'results' | 'halves' | 'goal_bounds' | 'moneyline' | 'spread' | 'total_points';

export default function PredictionsPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedComp, setSelectedComp] = useState<string>('ALL');
  const [selectedRiskTier, setSelectedRiskTier] = useState<string>('ALL');
  const [selectedMarketGroup, setSelectedMarketGroup] = useState<MarketGroupFilter>('ALL');
  const [onlyValuePicks, setOnlyValuePicks] = useState<boolean>(false);
  const [minProb, setMinProb] = useState<number>(0.50);

  const { fixtures, isLoading, liveDataAvailable, lastUpdated, isDelayed } = useLiveFixtures(
    isBasketball ? 'NBA' : selectedComp,
    'ALL',
    sport
  );

  // Generate qualified and probability-based market candidates across upcoming fixtures
  // Bug 7: Only list fixtures that haven't kicked off, remove any match that already started or finished.
  // Bug 1: Never generate picks if team strength is missing (insufficientData).
  const allPredictions = useMemo(() => {
    const list: {
      fixtureId: string;
      fixtureName: string;
      homeTeam: Team;
      awayTeam: Team;
      compCode: string;
      compName: string;
      kickoff: string;
      isDerby?: boolean;
      derbyName?: string;
      prediction: MarketPrediction;
    }[] = [];

    const now = Date.now();

    fixtures.forEach(fixture => {
      // Filter out finished or already started matches
      if (fixture.status === 'FINISHED' || fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED') return;
      const kickoffMs = new Date(fixture.kickoffTime).getTime();
      if (!isNaN(kickoffMs) && kickoffMs <= now) return;

      if (isBasketball || fixture.sport === 'basketball') {
        const nbaPreds = generateNBAPredictions(fixture);
        nbaPreds.forEach(p => {
          list.push({
            fixtureId: fixture.id,
            fixtureName: `${displayName(fixture.homeTeam)} vs ${displayName(fixture.awayTeam)}`,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            compCode: 'NBA',
            compName: 'NBA',
            kickoff: fixture.kickoffTime,
            isDerby: false,
            prediction: p,
          });
        });
        return;
      }

      const stats = getFixtureStatistics(fixture);
      // Hard rule: if fixture has no real team strength, do not return a pick for it
      if (fixture.insufficientData || stats.insufficientData) {
        return;
      }

      const derbyInfo = fixture.isDerby && fixture.derbyName 
        ? { name: fixture.derbyName }
        : checkDerby(fixture.homeTeam.name, fixture.awayTeam.name);

      const evalResult = evaluateFixtureMarkets({
        fixtureId: fixture.id,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        competitionCode: fixture.competition.code,
        competitionName: fixture.competition.name,
        homeAttackRating: fixture.homeTeam.attackRating ?? 1.0,
        homeDefenseRating: fixture.homeTeam.defenseRating ?? 1.0,
        awayAttackRating: fixture.awayTeam.attackRating ?? 1.0,
        awayDefenseRating: fixture.awayTeam.defenseRating ?? 1.0,
        homeXg: stats.homeXg,
        awayXg: stats.awayXg,
        expectedCornersHome: stats.expectedCornersHome,
        expectedCornersAway: stats.expectedCornersAway,
        expectedCards: stats.expectedCards,
        uncertaintyScore: stats.uncertaintyScore as any,
        dataCoverageScore: stats.dataCoverageScore as any,
        sampleSizeMatches: stats.sampleSizeMatches,
        stateTags: stats.stateTags,
        lineupConfirmed: stats.lineupConfirmed,
        verifiedOdds: stats.verifiedOdds,
        insufficientData: stats.insufficientData || fixture.insufficientData,
        hasRealTeamStrength: stats.hasRealTeamStrength,
      });

      evalResult.predictions.forEach(p => {
        list.push({
          fixtureId: fixture.id,
          fixtureName: `${displayName(fixture.homeTeam)} vs ${displayName(fixture.awayTeam)}`,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          compCode: fixture.competition.code,
          compName: fixture.competition.name,
          kickoff: fixture.kickoffTime,
          isDerby: !!derbyInfo,
          derbyName: derbyInfo?.name,
          prediction: p,
        });
      });
    });

    return list;
  }, [fixtures, isBasketball]);

  // Market Group matching helper
  const matchesMarketGroup = (p: MarketPrediction, group: MarketGroupFilter): boolean => {
    if (group === 'ALL') return true;
    if (group === 'goals') {
      return p.optionType === 'over_under_goals' || p.optionType === 'first_half_goals' || p.marketCategory === 'total_goals' || p.marketCategory === 'team_goals' || p.marketCategory === 'btts';
    }
    if (group === 'results') {
      return p.optionType === 'win' || p.optionType === 'draw' || p.optionType === 'double_chance' || p.optionType === 'draw_no_bet' || p.marketCategory === 'match_result' || p.marketCategory === 'double_chance' || p.marketCategory === 'draw_no_bet';
    }
    if (group === 'corners') {
      return p.optionType === 'corners' || p.optionType === 'corner_handicap' || p.marketCategory === 'total_corners' || p.marketCategory === 'team_corners';
    }
    if (group === 'cards') {
      return p.optionType === 'bookings' || p.optionType === 'team_bookings' || p.optionType === 'booking_points' || p.marketCategory === 'bookings';
    }
    if (group === 'handicap') {
      return p.optionType === 'asian_handicap' || p.marketCategory === 'handicap';
    }
    if (group === 'halves') {
      return p.optionType === 'first_half_goals' || p.optionType === 'second_half_result' || p.optionType === 'highest_scoring_half';
    }
    if (group === 'goal_bounds') {
      return p.optionType === 'goal_bounds' || p.optionType === 'team_goal_bounds' || p.marketCategory === 'goal_bounds';
    }
    if (group === 'moneyline') {
      return p.optionType === 'moneyline' || p.marketCategory === 'moneyline';
    }
    if (group === 'spread') {
      return p.optionType === 'spread' || p.marketCategory === 'spread';
    }
    if (group === 'total_points') {
      return p.optionType === 'total_points' || p.marketCategory === 'total_points';
    }
    return true;
  };

  // Filtered raw predictions
  const filtered = useMemo(() => {
    return allPredictions.filter(item => {
      const p = item.prediction;
      if (selectedComp !== 'ALL' && item.compCode !== selectedComp) {
        return false;
      }
      if (selectedRiskTier !== 'ALL') {
        const matchesTier =
          (selectedRiskTier === 'HIGH' && (p.riskTier === 'SAFE' || p.confidenceTier === 'HIGH')) ||
          (selectedRiskTier === 'MEDIUM' && (p.riskTier === 'MODERATE' || p.confidenceTier === 'MEDIUM')) ||
          (selectedRiskTier === 'LOW' && (p.riskTier === 'RISKY' || p.riskTier === 'LONGSHOT' || p.confidenceTier === 'LOW'));
        if (!matchesTier) return false;
      }
      if (selectedMarketGroup !== 'ALL' && !matchesMarketGroup(p, selectedMarketGroup)) {
        return false;
      }
      if (onlyValuePicks && (!p.expectedValue || p.expectedValue <= 0)) {
        return false;
      }
      const prob = p.calibratedProbability ?? p.modelProbability;
      if (prob < minProb) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      const probA = a.prediction.calibratedProbability ?? a.prediction.modelProbability;
      const probB = b.prediction.calibratedProbability ?? b.prediction.modelProbability;
      return probB - probA;
    });
  }, [allPredictions, selectedComp, selectedRiskTier, selectedMarketGroup, onlyValuePicks, minProb]);

  // Bug 7: Group options for one match into one card so overlapping selections are presented together
  const groupedMatches = useMemo(() => {
    const map = new Map<string, {
      fixtureId: string;
      fixtureName: string;
      homeTeam: Team;
      awayTeam: Team;
      compCode: string;
      compName: string;
      kickoff: string;
      isDerby?: boolean;
      derbyName?: string;
      picks: MarketPrediction[];
    }>();

    filtered.forEach(item => {
      const existing = map.get(item.fixtureId);
      if (existing) {
        // Prevent duplicate same market code
        if (!existing.picks.some(pk => pk.marketCode === item.prediction.marketCode)) {
          existing.picks.push(item.prediction);
        }
      } else {
        map.set(item.fixtureId, {
          fixtureId: item.fixtureId,
          fixtureName: item.fixtureName,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          compCode: item.compCode,
          compName: item.compName,
          kickoff: item.kickoff,
          isDerby: item.isDerby,
          derbyName: item.derbyName,
          picks: [item.prediction],
        });
      }
    });

    return Array.from(map.values());
  }, [filtered]);

  const footballMarketFilters: { id: MarketGroupFilter; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'goals', label: 'Goals' },
    { id: 'results', label: 'Results' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
    { id: 'handicap', label: 'Handicap' },
    { id: 'halves', label: 'Halves' },
    { id: 'goal_bounds', label: 'Bounds' },
  ];

  const basketballMarketFilters: { id: MarketGroupFilter; label: string }[] = [
    { id: 'ALL', label: 'All NBA markets' },
    { id: 'moneyline', label: 'Moneyline' },
    { id: 'spread', label: 'Point Spread' },
    { id: 'total_points', label: 'Totals' },
  ];

  const activeMarketFilters = isBasketball ? basketballMarketFilters : footballMarketFilters;

  const getTierBadgeStyle = (tier?: string) => {
    if (tier === 'HIGH' || tier === 'SAFE') {
      return 'text-[#B6E63B] bg-[#B6E63B]/[0.12] border-[#B6E63B]/40';
    }
    if (tier === 'MEDIUM' || tier === 'MODERATE') {
      return 'text-[#E2AE45] bg-[#E2AE45]/[0.12] border-[#E2AE45]/40';
    }
    return 'text-[#8B9890] bg-[#151E19] border border-white/[0.07]';
  };

  if (isSwitching) {
    return (
      <div className="space-y-3 py-2 animate-pulse">
        <div className="h-6 w-36 bg-[#101713] rounded-[8px]" />
        <div className="h-4 w-44 bg-[#101713] rounded-[8px]" />
        <div className="h-24 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        <div className="h-44 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 py-1">
      {/* Title with WAT timezone indicator and Last updated */}
      <div className="space-y-0.5">
        <h1 className="text-[23px] font-[700] leading-[1.2] text-[#ECF1EE] tracking-[-0.025em]">
          Market intelligence
        </h1>
        <p className="text-[12px] text-[#8B9890]">
          {isBasketball
            ? 'NBA possessions, defensive ratings and expected value projections · All times WAT'
            : 'Pre-kickoff probability models and statistical evaluations · All times WAT'}
          {lastUpdated ? ` · Last updated ${lastUpdated}` : ''}
        </p>
      </div>

      {/* Bug 8: Notice if fixtures snapshot is delayed or older than 30 minutes */}
      {isDelayed && (
        <div className="p-2.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11.5px] flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Data may be out of date (snapshot is older than 30 minutes).</span>
        </div>
      )}

      {/* Odds connection status */}
      {fixtures.some(f => Boolean(f.verifiedOdds)) ? (
        <div className="p-2.5 rounded-[10px] bg-[#B6E63B]/[0.08] border border-[#B6E63B]/20 text-[#B6E63B] text-[11.5px] flex items-center gap-2 font-mono">
          <Info className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" />
          <span>Real bookmaker odds active (DraftKings sportsbook lines). Unquoted lines show &quot;—&quot;.</span>
        </div>
      ) : (
        <div className="p-2.5 rounded-[10px] bg-white/[0.04] border border-white/[0.08] text-[#8B9890] text-[11.5px] flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" />
          <span>Odds not connected. Unquoted markets show &quot;—&quot;. Showing probability analysis only.</span>
        </div>
      )}

      {/* Bug 7: Filters Card placed FIRST so filters sit above the fold */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#B6E63B]" strokeWidth={2} />
          <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Filters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[#8B9890] mb-1 text-[11px] font-normal">Competition</label>
            {isBasketball ? (
              <select
                disabled
                className="w-full h-[38px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] opacity-90 cursor-default"
              >
                <option value="NBA">NBA</option>
              </select>
            ) : (
              <select
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
                className="w-full h-[38px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E63B]/40"
              >
                <option value="ALL">All competitions</option>
                {COMPETITIONS.map(c => (
                  <option key={c.code} value={c.code}>{cleanDisplayText(c.name)}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[#8B9890] mb-1 text-[11px] font-normal">Confidence</label>
            <select
              value={selectedRiskTier}
              onChange={(e) => setSelectedRiskTier(e.target.value)}
              className="w-full h-[38px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E63B]/40"
            >
              <option value="ALL">All</option>
              <option value="HIGH">High (≥60%)</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>

        {/* Min probability */}
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#8B9890] font-normal">Min probability</span>
            <span className="text-[#B6E63B] font-[600] tabular-nums text-[11.5px]">
              {(minProb * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.85"
            step="0.05"
            value={minProb}
            onChange={(e) => setMinProb(parseFloat(e.target.value))}
            className="w-full h-[4px] accent-[#B6E63B] cursor-pointer bg-[#151E19] rounded-full"
          />
        </div>

        {/* Positive edge toggle */}
        <div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-[12px] text-[#ECF1EE] select-none">
            <input
              type="checkbox"
              checked={onlyValuePicks}
              onChange={(e) => setOnlyValuePicks(e.target.checked)}
              className="w-[15px] h-[15px] rounded-[4px] bg-[#151E19] border border-white/[0.07] text-[#B6E63B] accent-[#B6E63B] cursor-pointer"
            />
            <span>Only positive edge (EV &gt; 0)</span>
          </label>
        </div>

        {/* Filter chips rows: 30px high, outlined, rounded-full */}
        <div className="pt-2 border-t border-white/[0.07] space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {activeMarketFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setSelectedMarketGroup(filter.id)}
                type="button"
                className={`h-[30px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  selectedMarketGroup === filter.id
                    ? 'bg-[#B6E63B]/[0.12] border-[#B6E63B] text-[#B6E63B] font-[600]'
                    : 'bg-transparent border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results header count: Bug 7: Show fixture count instead of raw pipeline line count */}
      <div className="flex items-center justify-between text-[12px] text-[#8A95A5] px-1 pt-1">
        <span className="tabular-nums font-medium text-[#EDF1F6]">
          {groupedMatches.length} upcoming fixtures analyzed ({filtered.length} selections)
        </span>
        <span className="text-[#5F6B7C]">Ranked by model confidence</span>
      </div>

      {/* Results Card Grid: Bug 7: Grouped by fixture so overlapping options sit inside one match card */}
      {groupedMatches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groupedMatches.map(group => {
            const homeName = displayName(group.homeTeam);
            const awayName = displayName(group.awayTeam);
            const homeAbbr = getTeamAbbreviation(group.homeTeam);
            const awayAbbr = getTeamAbbreviation(group.awayTeam);
            const hasMultiplePicks = group.picks.length > 1;

            return (
              <div
                key={group.fixtureId}
                className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3 flex flex-col justify-between space-y-2.5 transition-transform duration-150"
              >
                {/* Matchup Header */}
                <div className="border-b border-white/[0.06] pb-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#8B9890]">
                    <span className="truncate">{cleanDisplayText(group.compName)}</span>
                    <span className="tabular-nums shrink-0">
                      {formatMatchTime(group.kickoff, 'Africa/Lagos')} WAT
                    </span>
                  </div>

                  {/* Team matchup with crests and verified abbreviations */}
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/matches/${group.fixtureId}`}
                      className="flex items-center gap-2 min-w-0 flex-1 hover:text-[#B6E63B] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TeamCrest crestUrl={group.homeTeam.crestUrl} teamName={homeName} size={20} />
                        <span className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                          {homeName}
                        </span>
                        <span className="px-1 py-0.5 rounded-[4px] bg-[#151E19] text-[#8B9890] text-[9.5px] font-mono font-bold border border-white/[0.06]">
                          {homeAbbr}
                        </span>
                      </div>
                      <span className="text-[#5E6A63] text-[11px] shrink-0">vs</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TeamCrest crestUrl={group.awayTeam.crestUrl} teamName={awayName} size={20} />
                        <span className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                          {awayName}
                        </span>
                        <span className="px-1 py-0.5 rounded-[4px] bg-[#151E19] text-[#8B9890] text-[9.5px] font-mono font-bold border border-white/[0.06]">
                          {awayAbbr}
                        </span>
                      </div>
                    </Link>
                  </div>

                  {/* Bug 7: Note when options from one match overlap */}
                  {hasMultiplePicks && (
                    <div className="text-[10.5px] text-[#E2AE45] flex items-center gap-1 pt-0.5">
                      <span className="w-1 h-1 rounded-full bg-[#E2AE45]" />
                      <span>Options from one match overlap.</span>
                    </div>
                  )}
                </div>

                {/* Picks list for this fixture */}
                <div className="space-y-2">
                  {group.picks.map((p, pIdx) => {
                    const displayTier = p.confidenceTier || (p.riskTier === 'SAFE' ? 'HIGH' : p.riskTier === 'MODERATE' ? 'MEDIUM' : 'LOW');
                    const tierBadgeClass = getTierBadgeStyle(displayTier);
                    const probVal = p.calibratedProbability ?? p.modelProbability;
                    const hasRealOdds = Boolean(p.marketOdds && p.expectedValue !== null && p.expectedValue !== undefined);

                    return (
                      <div
                        key={pIdx}
                        className="bg-[#151E19] rounded-[10px] p-2.5 space-y-1.5 border border-white/[0.04]"
                      >
                        <div className="flex items-center justify-between text-[11px] gap-1">
                          <span className="text-[#8B9890] text-[10.5px] truncate">
                            {getOptionTypeLabel(p.optionType)}
                          </span>
                          <span className={`text-[9.5px] uppercase px-1.5 py-0.5 rounded-full border font-semibold tracking-wider shrink-0 ${tierBadgeClass}`}>
                            {displayTier}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                            {cleanDisplayText(formatSelectionName(p.selection))}
                          </span>
                          <span className="text-[12.5px] font-[600] text-[#B6E63B] tabular-nums shrink-0">
                            {(probVal * 100).toFixed(0)}%
                            {p.uncertaintySpread !== undefined && p.uncertaintySpread !== null && (
                              <span className="text-[10px] text-[#8B9890] font-normal ml-1">
                                ±{(p.uncertaintySpread * 100).toFixed(1)}%
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#B6E63B] rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, probVal * 100)}%` }}
                          />
                        </div>

                        {/* Odds & EV row: Real odds snapshot when available, dash when unquoted */}
                        <div className="flex items-center justify-end gap-1.5 text-[10.5px] pt-0.5">
                          {hasRealOdds ? (
                            <>
                              {p.expectedValue !== null && p.expectedValue !== undefined && (
                                <span className="text-[#8B9890] tabular-nums">
                                  EV {cleanDisplayText(formatExpectedValue(p.expectedValue).text)}
                                </span>
                              )}
                              <span className="bg-[#101713] px-2 py-0.5 rounded-[5px] border border-white/[0.07] text-[#ECF1EE] tabular-nums">
                                {p.bookmakerName ? `${p.bookmakerName} ` : ''}@{formatOdds(p.marketOdds)}
                              </span>
                            </>
                          ) : (
                            <span className="text-[#5E6A63] tabular-nums">Odds: — · EV: —</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-6 text-center space-y-1.5">
          <p className="text-[13px] font-semibold text-[#ECF1EE]">No picks match current filters</p>
          <p className="text-[11.5px] text-[#8B9890]">Try lowering the minimum probability or selecting another competition.</p>
        </div>
      )}

      {/* Responsible use disclaimer at bottom */}
      <div className="rounded-[14px] p-3 border border-[#E2AE45]/[0.28] bg-[#E2AE45]/[0.08] flex items-start gap-2.5 mt-2">
        <AlertCircle className="w-3.5 h-3.5 text-[#E2AE45] shrink-0 mt-0.5" strokeWidth={2} />
        <div className="text-[11px] leading-[16px] text-[#ECF1EE]">
          <strong className="font-semibold text-[#E2AE45]">Responsible use: </strong>
          Probabilistic models and mathematical projections only. Sports outcomes contain intrinsic randomness; high modeled probability is never a guarantee. 18+ only.
        </div>
      </div>
    </div>
  );
}
