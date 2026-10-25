'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { MarketPrediction, Team } from '@/types';
import { 
  SlidersHorizontal,
  AlertCircle
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
import { cleanDisplayText, formatSignedValue } from '@/lib/utils/formatText';

type MarketGroupFilter = 'ALL' | 'goals' | 'corners' | 'cards' | 'handicap' | 'results' | 'halves' | 'goal_bounds' | 'moneyline' | 'spread' | 'total_points';

export default function PredictionsPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedComp, setSelectedComp] = useState<string>('ALL');
  const [selectedRiskTier, setSelectedRiskTier] = useState<string>('ALL');
  const [selectedMarketGroup, setSelectedMarketGroup] = useState<MarketGroupFilter>('ALL');
  const [onlyValuePicks, setOnlyValuePicks] = useState<boolean>(false);
  const [minProb, setMinProb] = useState<number>(0.50);

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(
    isBasketball ? 'NBA' : selectedComp,
    'ALL',
    sport
  );

  // Generate qualified and probability-based market candidates across all live fixtures
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

    fixtures.forEach(fixture => {
      if (isBasketball || fixture.sport === 'basketball') {
        const nbaPreds = generateNBAPredictions(fixture);
        nbaPreds.forEach(p => {
          list.push({
            fixtureId: fixture.id,
            fixtureName: `${fixture.homeTeam.shortName || fixture.homeTeam.name} vs ${fixture.awayTeam.shortName || fixture.awayTeam.name}`,
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
      const derbyInfo = fixture.isDerby && fixture.derbyName 
        ? { name: fixture.derbyName }
        : checkDerby(fixture.homeTeam.name, fixture.awayTeam.name);

      const evalResult = evaluateFixtureMarkets({
        fixtureId: fixture.id,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        competitionCode: fixture.competition.code,
        competitionName: fixture.competition.name,
        homeAttackRating: fixture.homeTeam.attackRating,
        homeDefenseRating: fixture.homeTeam.defenseRating,
        awayAttackRating: fixture.awayTeam.attackRating,
        awayDefenseRating: fixture.awayTeam.defenseRating,
        homeXg: stats.homeXg,
        awayXg: stats.awayXg,
        expectedCornersHome: stats.expectedCornersHome,
        expectedCornersAway: stats.expectedCornersAway,
        expectedCards: stats.expectedCards,
        uncertaintyScore: stats.uncertaintyScore,
        dataCoverageScore: stats.dataCoverageScore,
        sampleSizeMatches: stats.sampleSizeMatches,
        stateTags: stats.stateTags,
        lineupConfirmed: stats.lineupConfirmed,
        verifiedOdds: stats.verifiedOdds,
      });

      evalResult.predictions.forEach(p => {
        list.push({
          fixtureId: fixture.id,
          fixtureName: `${fixture.homeTeam.shortName || fixture.homeTeam.name} vs ${fixture.awayTeam.shortName || fixture.awayTeam.name}`,
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

  // Daily High Confidence Picks: Top 5 High Confidence picks, max 2 per market type
  const featuredConfidencePicks = useMemo(() => {
    const candidates = allPredictions.filter(item => {
      const p = item.prediction;
      const isHigh = p.confidenceTier === 'HIGH' || p.riskTier === 'SAFE' || p.riskTier === 'HIGH';
      const prob = p.calibratedProbability ?? p.modelProbability;
      return isHigh && prob >= 0.60;
    }).sort((a, b) => {
      const confA = a.prediction.confidenceScore ?? 0.75;
      const confB = b.prediction.confidenceScore ?? 0.75;
      const probA = a.prediction.calibratedProbability ?? a.prediction.modelProbability;
      const probB = b.prediction.calibratedProbability ?? b.prediction.modelProbability;
      const scoreA = (probA * 10) + (confA * 5) + ((a.prediction.edge ?? 0) * 8);
      const scoreB = (probB * 10) + (confB * 5) + ((b.prediction.edge ?? 0) * 8);
      return scoreB - scoreA;
    });

    const selected: typeof candidates = [];
    const marketCounts: Record<string, number> = {};

    for (const cand of candidates) {
      if (selected.length >= 5) break;

      const groupKey = cand.prediction.marketCategory || cand.prediction.optionType;
      const count = marketCounts[groupKey] || 0;
      if (count < 2) {
        selected.push(cand);
        marketCounts[groupKey] = count + 1;
      }
    }

    return selected;
  }, [allPredictions]);

  // Market Group matching helper
  const matchesMarketGroup = (p: MarketPrediction, group: MarketGroupFilter): boolean => {
    if (group === 'ALL') return true;
    if (group === 'goals') {
      return p.optionType === 'over_under_goals' || p.optionType === 'first_half_goals' || p.marketCategory === 'total_goals' || p.marketCategory === 'team_goals' || p.marketCategory === 'btts';
    }
    if (group === 'corners') {
      return p.optionType === 'corners' || p.optionType === 'corner_handicap' || p.marketCategory === 'total_corners' || p.marketCategory === 'team_corners';
    }
    if (group === 'cards') {
      return p.optionType === 'bookings' || p.optionType === 'team_bookings' || p.optionType === 'booking_points' || p.marketCategory === 'bookings';
    }
    if (group === 'handicap') {
      return p.optionType === 'asian_handicap' || p.optionType === 'european_handicap' || p.optionType === 'corner_handicap' || p.marketCategory === 'handicap';
    }
    if (group === 'results') {
      return p.optionType === 'win' || p.optionType === 'draw' || p.optionType === 'double_chance' || p.optionType === 'draw_no_bet' || p.optionType === 'win_draw_combo' || p.marketCategory === 'match_result' || p.marketCategory === 'double_chance' || p.marketCategory === 'draw_no_bet' || p.marketCategory === 'combos';
    }
    if (group === 'halves') {
      return p.optionType === 'highest_scoring_half' || p.optionType === 'first_half_goals' || p.optionType === 'second_half_result' || p.marketCategory === 'half_time';
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

  const filtered = useMemo(() => {
    return allPredictions.filter(item => {
      const p = item.prediction;
      if (selectedComp !== 'ALL' && item.compCode !== selectedComp) return false;
      if (selectedRiskTier !== 'ALL') {
        const matchesTier = p.confidenceTier === selectedRiskTier || p.riskTier === selectedRiskTier ||
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

  const riskTierPills = [
    { id: 'ALL', label: 'All Tiers' },
    { id: 'HIGH', label: 'High Confidence' },
    { id: 'MEDIUM', label: 'Medium Confidence' },
    { id: 'LOW', label: 'Low Confidence' },
  ];

  const getTierBadgeStyle = (tier?: string) => {
    if (tier === 'HIGH' || tier === 'SAFE') {
      return 'text-[#B6E63B] bg-[#B6E63B]/[0.12] border-[#B6E63B]/40';
    }
    if (tier === 'MEDIUM' || tier === 'MODERATE') {
      return 'text-[#E2AE45] bg-[#E2AE45]/[0.12] border-[#E2AE45]/40';
    }
    return 'text-[#8B9890] bg-[#151E19] border border-white/[0.07]';
  };

  const getTeamCode = (team: Team): string => {
    if (team.shortName && team.shortName.length <= 4) {
      return team.shortName.slice(0, 3).toUpperCase();
    }
    return team.name.slice(0, 3).toUpperCase();
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
      {/* Title 23px with 12px muted subtitle */}
      <div className="space-y-0.5">
        <h1 className="text-[23px] font-[700] leading-[1.2] text-[#ECF1EE] tracking-[-0.025em]">
          Market intelligence
        </h1>
        <p className="text-[12px] text-[#8B9890]">
          {isBasketball
            ? 'NBA possessions, defensive ratings and expected value projections.'
            : 'Multi market evaluation across goals, results, handicaps, corners, and cards.'}
        </p>
      </div>

      {/* Responsible use disclaimer - compact amber card */}
      <div className="rounded-[14px] p-3 border border-[#E2AE45]/[0.28] bg-[#E2AE45]/[0.08] flex items-start gap-2.5">
        <AlertCircle className="w-3.5 h-3.5 text-[#E2AE45] shrink-0 mt-0.5" strokeWidth={2} />
        <div className="text-[11px] leading-[16px] text-[#ECF1EE]">
          <strong className="font-semibold text-[#E2AE45]">Responsible use: </strong>
          Probabilistic models and mathematical projections only. Sports outcomes contain intrinsic randomness; high modeled probability is never a guarantee. 18+ only.
        </div>
      </div>

      {/* Daily High Confidence Picks Section */}
      {featuredConfidencePicks.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-[15px] font-semibold text-[#EDF1F6]">
              Daily high confidence picks
            </h2>
            <span className="text-[11px] text-[#8A95A5]">
              Top selections across holdout models
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featuredConfidencePicks.map((item, idx) => {
              const p = item.prediction;
              const homeCode = getTeamCode(item.homeTeam);
              const awayCode = getTeamCode(item.awayTeam);
              const displayTier = p.confidenceTier || (p.riskTier === 'SAFE' ? 'HIGH' : p.riskTier === 'MODERATE' ? 'MEDIUM' : 'LOW');
              const tierBadgeClass = getTierBadgeStyle(displayTier);
              const probVal = p.calibratedProbability ?? p.modelProbability;

              return (
                <Link
                  key={idx}
                  href={`/matches/${item.fixtureId}`}
                  className="bg-[#101713] border border-white/[0.07] hover:border-[#B6E63B]/40 rounded-[14px] p-3 flex flex-col justify-between space-y-2 transition-transform duration-150 touch-press group"
                >
                  <div className="space-y-1.5">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-1 text-[11px] text-[#8B9890]">
                      <span className="truncate">{item.compCode} · {getOptionTypeLabel(p.optionType)}</span>
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full border font-semibold tracking-wider shrink-0 ${tierBadgeClass}`}>
                        {displayTier}
                      </span>
                    </div>

                    {/* Team row */}
                    <div className="flex items-center gap-1.5 text-[13px] font-[600] text-[#ECF1EE] min-w-0">
                      <span className="px-1.5 py-0.5 rounded-[5px] bg-[#151E19] text-[#ECF1EE] text-[10px] font-bold border border-white/[0.07] shrink-0 font-mono">
                        {homeCode}
                      </span>
                      <span className="truncate">{item.homeTeam.shortName || item.homeTeam.name}</span>
                      <span className="text-[#5E6A63] text-[11px] font-normal shrink-0">vs</span>
                      <span className="px-1.5 py-0.5 rounded-[5px] bg-[#151E19] text-[#ECF1EE] text-[10px] font-bold border border-white/[0.07] shrink-0 font-mono">
                        {awayCode}
                      </span>
                      <span className="truncate">{item.awayTeam.shortName || item.awayTeam.name}</span>
                    </div>

                    {/* Pick line */}
                    <div className="text-[13.5px] font-[600] text-[#ECF1EE] group-hover:text-[#B6E63B] transition-colors leading-tight">
                      {formatSelectionName(p.selection)}
                    </div>

                    {p.plainEnglishReason && (
                      <p className="text-[11.5px] leading-[1.5] text-[#8B9890] line-clamp-2">
                        {cleanDisplayText(p.plainEnglishReason)}
                      </p>
                    )}
                  </div>

                  {/* Probability & Odds Footer */}
                  <div className="space-y-1 pt-1">
                    <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B6E63B] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, probVal * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11.5px] pt-0.5">
                      <span className="text-[13.5px] font-[600] text-[#B6E63B] tabular-nums">
                        {(probVal * 100).toFixed(0)}%
                        {p.uncertaintySpread !== undefined && (
                          <span className="text-[10.5px] text-[#8B9890] font-normal ml-1">
                            ±{(p.uncertaintySpread * 100).toFixed(1)}%
                          </span>
                        )}
                      </span>

                      {p.sanityTripwire && (
                        <span className="px-1.5 py-0.5 rounded-[4px] bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9.5px] font-mono font-semibold">
                          Check data
                        </span>
                      )}
                      {p.marketOdds && p.expectedValue !== null && p.expectedValue !== undefined ? (
                        <span className="bg-[#151E19] px-2 py-0.5 rounded-[6px] border border-white/[0.07] text-[10.5px] text-[#ECF1EE] tabular-nums">
                          {p.bookmakerName ? `${p.bookmakerName} ` : ''}@{formatOdds(p.marketOdds)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#8B9890]/80">Odds unavailable: probability analysis only</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters Card */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#B6E63B]" strokeWidth={2} />
          <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Filters</h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
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
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[#8B9890] mb-1 text-[11px] font-normal">Confidence tier</label>
            <select
              value={selectedRiskTier}
              onChange={(e) => setSelectedRiskTier(e.target.value)}
              className="w-full h-[38px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E63B]/40"
            >
              <option value="ALL">All confidence tiers</option>
              <option value="HIGH">High confidence (≥60%)</option>
              <option value="MEDIUM">Medium confidence</option>
              <option value="LOW">Low confidence</option>
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

      {/* Results header count */}
      <div className="flex items-center justify-between text-[12px] text-[#8A95A5] px-1 pt-1">
        <span className="tabular-nums font-medium text-[#EDF1F6]">{filtered.length} scored lines</span>
        <span className="text-[#5F6B7C]">Ranked by probability and edge</span>
      </div>

      {/* Results Card Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item, idx) => {
            const p = item.prediction;
            const homeCode = getTeamCode(item.homeTeam);
            const awayCode = getTeamCode(item.awayTeam);
            const displayTier = p.confidenceTier || (p.riskTier === 'SAFE' ? 'HIGH' : p.riskTier === 'MODERATE' ? 'MEDIUM' : 'LOW');
            const tierBadgeClass = getTierBadgeStyle(displayTier);
            const probVal = p.calibratedProbability ?? p.modelProbability;

            return (
              <Link
                key={idx}
                href={`/matches/${item.fixtureId}`}
                className="bg-[#101713] border border-white/[0.07] hover:border-[#B6E63B]/40 rounded-[14px] p-3 flex flex-col justify-between space-y-2 transition-transform duration-150 touch-press group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1 text-[11px] text-[#8A95A5]">
                    <span className="truncate">{item.compCode} · {getOptionTypeLabel(p.optionType)}</span>
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border font-semibold tracking-wider shrink-0 ${tierBadgeClass}`}>
                      {displayTier}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[13px] font-[600] text-[#ECF1EE] min-w-0">
                    <span className="px-1.5 py-0.5 rounded-[5px] bg-[#151E19] text-[#ECF1EE] text-[10px] font-bold border border-white/[0.07] shrink-0 font-mono">
                      {homeCode}
                    </span>
                    <span className="truncate">{item.homeTeam.shortName || item.homeTeam.name}</span>
                    <span className="text-[#5E6A63] text-[11px] font-normal shrink-0">vs</span>
                    <span className="px-1.5 py-0.5 rounded-[5px] bg-[#151E19] text-[#ECF1EE] text-[10px] font-bold border border-white/[0.07] shrink-0 font-mono">
                      {awayCode}
                    </span>
                    <span className="truncate">{item.awayTeam.shortName || item.awayTeam.name}</span>
                  </div>

                  <div className="text-[13.5px] font-[600] text-[#ECF1EE] group-hover:text-[#B6E63B] transition-colors leading-tight">
                    {formatSelectionName(p.selection)}
                    {p.isTopPick && (
                      <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#B6E63B]/[0.12] text-[#B6E63B] border border-[#B6E63B]/30 align-middle">
                        Top pick
                      </span>
                    )}
                  </div>

                  {p.plainEnglishReason && (
                    <p className="text-[11.5px] leading-[1.5] text-[#8B9890] line-clamp-2">
                      {cleanDisplayText(p.plainEnglishReason)}
                    </p>
                  )}
                </div>

                <div className="space-y-1 pt-1">
                  <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#B6E63B] rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, probVal * 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11.5px] pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-[600] text-[#B6E63B] tabular-nums">
                        {(probVal * 100).toFixed(0)}%
                      </span>
                      {p.edge !== undefined && (
                        <span className={`text-[11px] tabular-nums ${p.edge >= 0 ? 'text-[#B6E63B]' : 'text-[#8B9890]'}`}>
                          {formatSignedValue(p.edge * 100, '%')} edge
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {p.sanityTripwire && (
                        <span className="px-1.5 py-0.5 rounded-[4px] bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9.5px] font-mono font-semibold">
                          Check data
                        </span>
                      )}
                      {p.marketOdds && p.expectedValue !== null && p.expectedValue !== undefined ? (
                        <>
                          <span className="text-[10.5px] text-[#8B9890] tabular-nums">
                            EV {cleanDisplayText(formatExpectedValue(p.expectedValue).text)}
                          </span>
                          <span className="bg-[#151E19] px-2 py-0.5 rounded-[6px] border border-white/[0.07] text-[10.5px] text-[#ECF1EE] tabular-nums">
                            {p.bookmakerName ? `${p.bookmakerName} ` : ''}@{formatOdds(p.marketOdds)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-[#8B9890]/80">Odds unavailable: probability analysis only</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2">
          <div suppressHydrationWarning className="text-[13px] font-[600] text-[#ECF1EE]">
            {liveDataAvailable ? 'No predictions match your selected filters' : `Live data unavailable. Last updated ${lastUpdated}`}
          </div>
          <p className="max-w-sm mx-auto text-[12px] text-[#8B9890]">
            Try adjusting the minimum probability threshold or selecting all market categories.
          </p>
        </div>
      )}
    </div>
  );
}
