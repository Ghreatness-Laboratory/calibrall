'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { MarketPrediction, Team, RiskTier } from '@/types';
import { 
  ArrowUpRight, 
  Sparkles,
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

  // Daily Safest Picks: Top 5 SAFE picks, max 2 per market type
  const safestPicks = useMemo(() => {
    const safeCandidates = allPredictions.filter(item => {
      const p = item.prediction;
      return p.riskTier === 'SAFE' && p.modelProbability >= 0.75;
    }).sort((a, b) => {
      const confA = a.prediction.confidenceScore ?? 0.75;
      const confB = b.prediction.confidenceScore ?? 0.75;
      const scoreA = (a.prediction.modelProbability * 10) + (confA * 5) + ((a.prediction.edge ?? 0) * 8);
      const scoreB = (b.prediction.modelProbability * 10) + (confB * 5) + ((b.prediction.edge ?? 0) * 8);
      return scoreB - scoreA;
    });

    const selected: typeof safeCandidates = [];
    const marketCounts: Record<string, number> = {};

    for (const cand of safeCandidates) {
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
      if (selectedRiskTier !== 'ALL' && p.riskTier !== selectedRiskTier) return false;
      if (!matchesMarketGroup(p, selectedMarketGroup)) return false;
      if (p.modelProbability < minProb) return false;
      if (onlyValuePicks && p.qualificationStatus !== 'QUALIFIED_VALUE') {
        return false;
      }
      return true;
    }).sort((a, b) => b.prediction.rankingScore - a.prediction.rankingScore);
  }, [allPredictions, selectedComp, selectedRiskTier, selectedMarketGroup, onlyValuePicks, minProb]);

  const footballMarketFilters: { id: MarketGroupFilter; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results & Double Chance' },
    { id: 'goals', label: 'Goals & BTTS' },
    { id: 'handicap', label: 'Handicap' },
    { id: 'goal_bounds', label: 'Goal Bounds' },
    { id: 'halves', label: 'Halves' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
  ];

  const basketballMarketFilters: { id: MarketGroupFilter; label: string }[] = [
    { id: 'ALL', label: 'All NBA markets' },
    { id: 'moneyline', label: 'Moneyline' },
    { id: 'spread', label: 'Point Spread' },
    { id: 'total_points', label: 'Totals' },
  ];

  const activeMarketFilters = isBasketball ? basketballMarketFilters : footballMarketFilters;

  const riskTierPills: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All Tiers' },
    { id: 'SAFE', label: 'Safe (75%+)' },
    { id: 'MODERATE', label: 'Moderate (60 to 75%)' },
    { id: 'RISKY', label: 'Risky (45 to 60%)' },
  ];

  // Helper for Tier Badge styles
  const getTierBadgeStyle = (tier?: RiskTier) => {
    if (tier === 'SAFE') {
      return 'text-[#B6E63B] bg-[rgba(182,230,59,0.12)] border-[rgba(182,230,59,0.45)]';
    }
    if (tier === 'MODERATE') {
      return 'text-[#E2AE45] bg-[rgba(226,174,69,0.12)] border-[rgba(226,174,69,0.45)]';
    }
    return 'text-[#F08A4B] bg-[rgba(240,138,75,0.12)] border-[rgba(240,138,75,0.45)]';
  };

  const getTeamCode = (team: Team): string => {
    if (team.shortName && team.shortName.length <= 4) {
      return team.shortName.slice(0, 3).toUpperCase();
    }
    return team.name.slice(0, 3).toUpperCase();
  };

  if (isSwitching) {
    return (
      <div className="space-y-4 py-3 animate-pulse">
        <div className="h-6 w-48 bg-[#151E19] rounded-[6px]" />
        <div className="h-24 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        <div className="h-48 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* 7. PICKS HEADER: H2 "Market intelligence" at 19px with one line 12px subtitle */}
      <div className="pb-2 border-b border-white/[0.07]">
        <h2 className="text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE]">
          Market intelligence
        </h2>
        <p className="text-[12px] text-[#8B9890] mt-0.5 truncate">
          {isBasketball
            ? 'NBA possessions, defensive ratings and expected value projections.'
            : 'Multi market evaluation across Goals, Results, Handicaps, Corners, and Cards.'}
        </p>
      </div>

      {/* 7. RESPONSIBLE USE DISCLAIMER (SHOW ONCE AS A COMPACT AMBER CARD) */}
      <div className="rounded-[14px] p-3.5 border border-[#E2AE45]/[0.28] bg-[#E2AE45]/[0.06] flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#E2AE45] shrink-0 mt-0.5" strokeWidth={2} />
        <div className="text-[11px] leading-[1.55] text-[#E2AE45]/90">
          <strong className="font-semibold text-[#ECF1EE]">Responsible use disclaimer: </strong>
          Calibrall provides probabilistic statistical models and mathematical projections. Sports outcomes are stochastic; high modeled probability is never a guarantee. Strictly 18+.
        </div>
      </div>

      {/* 7. DAILY SAFEST PICKS SECTION */}
      {safestPicks.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-[650] text-[#ECF1EE]">
                Daily safest picks
              </h3>
              <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-[6px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] font-semibold border border-[rgba(182,230,59,0.45)]">
                MAX 2 PER MARKET
              </span>
            </div>
            <span className="text-[11.5px] text-[#8B9890]">
              Top 5 across all leagues, 75 percent or higher probability
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {safestPicks.map((item, idx) => {
              const p = item.prediction;
              const homeCode = getTeamCode(item.homeTeam);
              const awayCode = getTeamCode(item.awayTeam);
              const tierBadgeClass = getTierBadgeStyle(p.riskTier);

              return (
                <Link
                  key={idx}
                  href={`/matches/${item.fixtureId}`}
                  className="bg-[#101713] border border-white/[0.07] hover:border-white/[0.14] rounded-[14px] p-3 flex flex-col justify-between space-y-2.5 transition-all touch-press group"
                >
                  <div className="space-y-2">
                    {/* Top row: league and market in 10.5px muted, tier badge on right */}
                    <div className="flex items-center justify-between gap-1 text-[10.5px] text-[#8B9890]">
                      <span className="truncate">{item.compCode} · {getOptionTypeLabel(p.optionType)}</span>
                      <span className={`text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-[6px] border font-semibold tracking-wider shrink-0 ${tierBadgeClass}`}>
                        {p.riskTier}
                      </span>
                    </div>

                    {/* Team row: 2 small mono 3-letter team badges (lime tint, no overlap), team names at 14px weight 650 separated by muted vs */}
                    <div className="flex items-center gap-1.5 text-[14px] font-[650] text-[#ECF1EE] min-w-0">
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] font-mono text-[10px] font-semibold border border-[#B6E63B]/30 shrink-0">
                        {homeCode}
                      </span>
                      <span className="truncate">{item.homeTeam.shortName || item.homeTeam.name}</span>
                      <span className="text-[#5E6A63] text-[11px] font-normal shrink-0">vs</span>
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] font-mono text-[10px] font-semibold border border-[#B6E63B]/30 shrink-0">
                        {awayCode}
                      </span>
                      <span className="truncate">{item.awayTeam.shortName || item.awayTeam.name}</span>
                    </div>

                    {/* Pick line at 15px weight 700 */}
                    <div className="text-[15px] font-bold text-[#ECF1EE] group-hover:text-[#B6E63B] transition-colors leading-tight">
                      {formatSelectionName(p.selection)}
                    </div>

                    {/* Reasoning: 1 or 2 lines of 11.5px muted */}
                    {p.plainEnglishReason && (
                      <p className="text-[11.5px] leading-[1.55] text-[#8B9890] line-clamp-2">
                        {p.plainEnglishReason}
                      </p>
                    )}
                  </div>

                  {/* Probability & Odds Footer */}
                  <div className="space-y-1.5 pt-1">
                    {/* 5px progress bar for probability */}
                    <div className="w-full h-[5px] bg-[#151E19] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B6E63B] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, p.modelProbability * 100)}%` }}
                      />
                    </div>

                    {/* Bottom row: probability in lime at 16px weight 700 on left, odds in small bordered mono chip on right */}
                    <div className="flex items-center justify-between text-[11px] pt-0.5">
                      <span className="text-[16px] font-bold text-[#B6E63B] font-mono tabular-nums">
                        {(p.modelProbability * 100).toFixed(0)}%
                      </span>
                      {p.marketOdds ? (
                        <span className="bg-[#151E19] px-2 py-0.5 rounded-[5px] border border-white/[0.07] font-mono text-[11px] text-[#ECF1EE] tabular-nums">
                          @{formatOdds(p.marketOdds)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#5E6A63] font-mono">No line</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. FILTERS: A compact block with a 14px title */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
          <h3 className="text-[14px] font-[650] text-[#ECF1EE]">Filters</h3>
        </div>

        {/* Competition & Risk tier: two selects side by side in a two column grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[#8B9890] mb-1 text-[11px] font-medium">Competition</label>
            {isBasketball ? (
              <select
                disabled
                className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] opacity-90 cursor-default"
              >
                <option value="NBA">NBA</option>
              </select>
            ) : (
              <select
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
                className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus:outline-hidden focus:border-[#B6E63B]"
              >
                <option value="ALL">All competitions</option>
                {COMPETITIONS.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[#8B9890] mb-1 text-[11px] font-medium">Risk tier</label>
            <select
              value={selectedRiskTier}
              onChange={(e) => setSelectedRiskTier(e.target.value)}
              className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus:outline-hidden focus:border-[#B6E63B]"
            >
              <option value="ALL">All risk tiers</option>
              <option value="SAFE">SAFE (≥75%)</option>
              <option value="MODERATE">MODERATE (60 to 75%)</option>
              <option value="RISKY">RISKY (45 to 60%)</option>
            </select>
          </div>
        </div>

        {/* Min probability: slim 4px slider with lime fill, live value in lime at right of label */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#8B9890] font-medium">Min probability</span>
            <span className="font-mono text-[#B6E63B] font-semibold tabular-nums">
              {(minProb * 100).toFixed(0)}%
            </span>
          </div>
          <div className="relative flex items-center">
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
        </div>

        {/* "Only positive edge" checkbox: 16px with rounded border */}
        <div className="pt-0.5">
          <label className="inline-flex items-center gap-2 cursor-pointer text-[12.5px] text-[#ECF1EE] select-none">
            <input
              type="checkbox"
              checked={onlyValuePicks}
              onChange={(e) => setOnlyValuePicks(e.target.checked)}
              className="w-[16px] h-[16px] rounded-[5px] bg-[#151E19] border border-white/[0.14] text-[#B6E63B] accent-[#B6E63B] cursor-pointer"
            />
            <span>Only positive edge (EV &gt; 0)</span>
          </label>
        </div>

        {/* Market and Tier filters: two horizontally scrolling chip rows (hidden scrollbar), with lime tint on active chip */}
        <div className="pt-2 border-t border-white/[0.05] space-y-2">
          {/* Market Chips Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[10px] font-mono text-[#5E6A63] uppercase tracking-[0.08em] shrink-0 mr-1">Market:</span>
            {activeMarketFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setSelectedMarketGroup(filter.id)}
                type="button"
                className={`h-[30px] px-3 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                  selectedMarketGroup === filter.id
                    ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B] font-semibold'
                    : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Tier Chips Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[10px] font-mono text-[#5E6A63] uppercase tracking-[0.08em] shrink-0 mr-1">Tier:</span>
            {riskTierPills.map(tier => (
              <button
                key={tier.id}
                onClick={() => setSelectedRiskTier(tier.id)}
                type="button"
                className={`h-[30px] px-3 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                  selectedRiskTier === tier.id
                    ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B] font-semibold'
                    : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 7. RESULTS LIST: Small count line ("18 scored lines" on left, "Ranked by model score and edge" on right, 11.5px muted) */}
      <div className="flex items-center justify-between text-[11.5px] text-[#8B9890] px-1">
        <span className="font-mono tabular-nums">{filtered.length} scored lines</span>
        <span className="text-[#5E6A63]">Ranked by model score and edge</span>
      </div>

      {/* IMPORTANT: Mobile Pick Cards (No horizontal cutoffs anywhere!) */}
      {filtered.length > 0 ? (
        <div className="space-y-2.5">
          {/* Card list on mobile & tablets (< lg), clean responsive cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filtered.map((item, idx) => {
              const p = item.prediction;
              const homeCode = getTeamCode(item.homeTeam);
              const awayCode = getTeamCode(item.awayTeam);
              const tierBadgeClass = getTierBadgeStyle(p.riskTier);

              return (
                <Link
                  key={idx}
                  href={`/matches/${item.fixtureId}`}
                  className="bg-[#101713] border border-white/[0.07] hover:border-white/[0.14] rounded-[14px] p-3.5 flex flex-col justify-between space-y-2.5 transition-all touch-press group"
                >
                  <div className="space-y-2">
                    {/* Top row: league and market in 10.5px muted text, tier badge on right */}
                    <div className="flex items-center justify-between gap-1 text-[10.5px] text-[#8B9890]">
                      <span className="truncate">{item.compCode} · {getOptionTypeLabel(p.optionType)}</span>
                      <span className={`text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-[6px] border font-semibold tracking-wider shrink-0 ${tierBadgeClass}`}>
                        {p.riskTier}
                      </span>
                    </div>

                    {/* Team row: 2 small mono 3-letter team badges, team names at 14px weight 650 separated by muted vs */}
                    <div className="flex items-center gap-1.5 text-[14px] font-[650] text-[#ECF1EE] min-w-0">
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] font-mono text-[10px] font-semibold border border-[#B6E63B]/30 shrink-0">
                        {homeCode}
                      </span>
                      <span className="truncate">{item.homeTeam.shortName || item.homeTeam.name}</span>
                      <span className="text-[#5E6A63] text-[11px] font-normal shrink-0">vs</span>
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] font-mono text-[10px] font-semibold border border-[#B6E63B]/30 shrink-0">
                        {awayCode}
                      </span>
                      <span className="truncate">{item.awayTeam.shortName || item.awayTeam.name}</span>
                    </div>

                    {/* Pick line at 15px weight 700 */}
                    <div className="text-[15px] font-bold text-[#ECF1EE] group-hover:text-[#B6E63B] transition-colors leading-tight">
                      {formatSelectionName(p.selection)}
                      {p.isTopPick && (
                        <span className="ml-2 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-[4px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] border border-[#B6E63B]/30 align-middle">
                          TOP PICK
                        </span>
                      )}
                    </div>

                    {/* Reasoning: 1 or 2 lines of 11.5px muted */}
                    {p.plainEnglishReason && (
                      <p className="text-[11.5px] leading-[1.55] text-[#8B9890] line-clamp-2">
                        {p.plainEnglishReason}
                      </p>
                    )}
                  </div>

                  {/* Probability & Odds Footer */}
                  <div className="space-y-1.5 pt-1">
                    {/* 5px progress bar for probability */}
                    <div className="w-full h-[5px] bg-[#151E19] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B6E63B] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, p.modelProbability * 100)}%` }}
                      />
                    </div>

                    {/* Bottom row: probability in lime at 16px weight 700 on left, odds in small bordered mono chip on right */}
                    <div className="flex items-center justify-between text-[11px] pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[16px] font-bold text-[#B6E63B] font-mono tabular-nums">
                          {(p.modelProbability * 100).toFixed(0)}%
                        </span>
                        {p.edge !== undefined && (
                          <span className={`text-[11px] font-mono tabular-nums ${p.edge >= 0 ? 'text-[#B6E63B]' : 'text-[#8B9890]'}`}>
                            {formatSignedValue(p.edge * 100, '%')} edge
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {p.expectedValue !== undefined && (
                          <span className="text-[10px] font-mono text-[#8B9890]">
                            EV {formatExpectedValue(p.expectedValue).text}
                          </span>
                        )}
                        {p.marketOdds ? (
                          <span className="bg-[#151E19] px-2 py-0.5 rounded-[5px] border border-white/[0.07] font-mono text-[11px] text-[#ECF1EE] tabular-nums">
                            @{formatOdds(p.marketOdds)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#5E6A63] font-mono">No line</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2">
          <div suppressHydrationWarning className="font-mono text-[12.5px] text-[#ECF1EE]">
            {liveDataAvailable ? 'No predictions match your selected filters' : `Live data unavailable. Last updated ${lastUpdated}`}
          </div>
          <p className="max-w-sm mx-auto text-[11.5px] text-[#8B9890]">
            {liveDataAvailable ? 'Try adjusting the minimum probability threshold or selecting all market categories.' : 'Live market intelligence will populate once live provider data is refreshed.'}
          </p>
        </div>
      )}
    </div>
  );
}
