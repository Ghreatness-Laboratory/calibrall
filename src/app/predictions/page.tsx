'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { MarketPrediction, SupportedOptionType, MarketPeriod, Team, RiskTier, MarketCategory } from '@/types';
import TeamCrest from '@/components/TeamCrest';
import { 
  CheckCircle2, 
  ArrowUpRight, 
  ShieldCheck, 
  AlertCircle,
  Sparkles,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { 
  formatExpectedValue, 
  formatOdds, 
  formatSelectionName, 
  getOptionTypeLabel, 
  getPeriodLabel,
  getRiskTierBadge
} from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';
import { useSport } from '@/lib/context/SportContext';
import { generateNBAPredictions } from '@/lib/data/nbaSeedData';

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

  // Requirement 13: Daily "Safest Picks" across all leagues
  // Top 5 SAFE picks, with variety rule: no more than 2 from the same market type/category
  const safestPicks = useMemo(() => {
    const safeCandidates = allPredictions.filter(item => {
      const p = item.prediction;
      return p.riskTier === 'SAFE' && p.modelProbability >= 0.75;
    }).sort((a, b) => {
      // Sort by combination of probability, confidence, and edge
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

  // Helper to map option/market to market group filter
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
    { id: 'handicap', label: 'Handicap (Asian & European)' },
    { id: 'goal_bounds', label: 'Goal Bounds' },
    { id: 'halves', label: 'Halves' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards & Bookings' },
  ];

  const basketballMarketFilters: { id: MarketGroupFilter; label: string }[] = [
    { id: 'ALL', label: 'All NBA markets' },
    { id: 'moneyline', label: 'Moneyline' },
    { id: 'spread', label: 'Point Spread' },
    { id: 'total_points', label: 'Game Total Points' },
  ];

  const activeMarketFilters = isBasketball ? basketballMarketFilters : footballMarketFilters;

  const riskTierPills: { id: string; label: string; badgeColor: string }[] = [
    { id: 'ALL', label: 'All Tiers', badgeColor: 'bg-white/10 text-white' },
    { id: 'SAFE', label: 'Safe (75%+)', badgeColor: 'bg-[#b8e63a]/20 text-[#b8e63a]' },
    { id: 'MODERATE', label: 'Moderate (60-75%)', badgeColor: 'bg-[#e3b341]/20 text-[#e3b341]' },
    { id: 'RISKY', label: 'Risky (45-60%)', badgeColor: 'bg-orange-500/20 text-orange-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <h1 className="text-[18px] font-[620] text-[var(--text)] flex items-center gap-2">
            <span>Market intelligence & prediction engine</span>
          </h1>
          <p className="text-[12.5px] text-[var(--text-2)] mt-0.5">
            Full-market evaluation across Results, Handicaps, Goal Bounds, Halves, Corners, and Cards.
          </p>
        </div>
      </div>

      {/* Responsible Use Disclaimer Banner (Requirement 15) */}
      <div className="p-3 bg-[rgba(217,164,65,0.04)] border border-[rgba(217,164,65,0.3)] rounded-[10px] flex items-start gap-2.5 text-[11px] text-[var(--text-3)] leading-relaxed">
        <Info className="w-3.5 h-3.5 text-[var(--warn)] shrink-0 mt-0.5" strokeWidth={1.75} />
        <p>
          <strong className="text-[var(--text-2)] font-semibold">Responsible statistical notice:</strong> All predictions, probabilities, and model lines are mathematical estimates computed via Dixon-Coles bivariate Poisson and negative binomial regression models, not guaranteed outcomes. Past statistical performance does not ensure future returns.
        </p>
      </div>

      {/* DAILY SAFEST PICKS SECTION (Requirement 13) */}
      {safestPicks.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-3.5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
              <h2 className="text-[13.5px] font-[620] text-[var(--text)]">
                Daily Safest Picks (Top 5 Across All Leagues)
              </h2>
              <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-[5px] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold border border-[var(--accent)]/30">
                Variety Rule Active (Max 2 per Market)
              </span>
            </div>
            <span className="text-[10.5px] text-[var(--text-3)] font-mono">
              High Confidence · ≥75% Probability
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {safestPicks.map((item, idx) => {
              const p = item.prediction;
              const tierBadge = getRiskTierBadge(p.riskTier);

              return (
                <Link
                  key={idx}
                  href={`/matches/${item.fixtureId}`}
                  className="bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-[10px] p-3 flex flex-col justify-between space-y-2.5 transition-all group"
                >
                  <div className="space-y-1.5">
                    {/* Header: Comp & Tier */}
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-3)]">
                      <span className="truncate max-w-[90px]">{item.compCode}</span>
                      <span className={`px-1.5 py-0.2 rounded-[4px] font-mono font-bold text-[9px] ${tierBadge.badgeClass}`}>
                        {tierBadge.label}
                      </span>
                    </div>

                    {/* Teams Row */}
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text)] truncate">
                      <TeamCrest crestUrl={item.homeTeam.crestUrl} teamName={item.homeTeam.name} size={16} />
                      <span className="truncate">{item.homeTeam.shortName || item.homeTeam.name}</span>
                      <span className="text-[var(--text-3)] text-[10px]">v</span>
                      <TeamCrest crestUrl={item.awayTeam.crestUrl} teamName={item.awayTeam.name} size={16} />
                      <span className="truncate">{item.awayTeam.shortName || item.awayTeam.name}</span>
                    </div>

                    {/* Selection */}
                    <div className="text-[12.5px] font-[600] text-[var(--text)] group-hover:text-[var(--accent)] transition-colors leading-snug">
                      {formatSelectionName(p.selection)}
                    </div>

                    {/* Plain English Reason */}
                    {p.plainEnglishReason && (
                      <p className="text-[10.5px] text-[var(--text-3)] line-clamp-2 leading-relaxed">
                        {p.plainEnglishReason}
                      </p>
                    )}
                  </div>

                  {/* Probability Bar & Odds */}
                  <div className="pt-2 border-t border-[var(--border)] space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[var(--accent)] font-bold">{(p.modelProbability * 100).toFixed(0)}%</span>
                      {p.marketOdds && (
                        <span className="text-[var(--text)] bg-[var(--surface)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border)] text-[10px]">
                          @{formatOdds(p.marketOdds)}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1 bg-[var(--surface)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full"
                        style={{ width: `${Math.min(100, p.modelProbability * 100)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTER BAR (Requirements 12 & 16) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--text)]">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
          <span>Filter market intelligence</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[12px]">
          {/* Competition */}
          <div>
            <label className="block text-[var(--text-3)] mb-1 text-[10.5px] font-medium">Competition</label>
            {isBasketball ? (
              <select
                disabled
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-[10px] text-[12px] text-[var(--text)] opacity-90 cursor-default"
              >
                <option value="NBA">NBA (USA)</option>
              </select>
            ) : (
              <select
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-[10px] text-[12px] text-[var(--text)] focus:outline-hidden focus:border-[var(--accent)]"
              >
                <option value="ALL">All competitions</option>
                {COMPETITIONS.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Risk Tier */}
          <div>
            <label className="block text-[var(--text-3)] mb-1 text-[10.5px] font-medium">Risk Tier</label>
            <select
              value={selectedRiskTier}
              onChange={(e) => setSelectedRiskTier(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-[10px] text-[12px] text-[var(--text)] focus:outline-hidden focus:border-[var(--accent)]"
            >
              <option value="ALL">All risk tiers</option>
              <option value="SAFE">SAFE (≥75% high confidence)</option>
              <option value="MODERATE">MODERATE (60-75%)</option>
              <option value="RISKY">RISKY (45-60% or value)</option>
              <option value="LONGSHOT">LONGSHOT (&lt;45%)</option>
            </select>
          </div>

          {/* Min Probability Slider */}
          <div>
            <div className="flex items-center justify-between text-[10.5px] mb-1">
              <span className="text-[var(--text-3)] font-medium">Min probability</span>
              <span className="font-mono text-[var(--accent)]">{(minProb * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.85"
              step="0.05"
              value={minProb}
              onChange={(e) => setMinProb(parseFloat(e.target.value))}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          {/* Only Value Toggle */}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[var(--text)]">
              <input
                type="checkbox"
                checked={onlyValuePicks}
                onChange={(e) => setOnlyValuePicks(e.target.checked)}
                className="rounded-[4px] bg-[var(--surface-2)] border-[var(--border)] text-[var(--accent)] focus:ring-0 w-3.5 h-3.5"
              />
              <span>Only positive edge (EV &gt; 0)</span>
            </label>
          </div>
        </div>

        {/* Market-Type Filter Pills (Requirement 12 & 16) */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center gap-1.5 overflow-x-auto text-[10.5px] pb-1 [scrollbar-width:none]">
          <span className="text-[var(--text-3)] font-mono shrink-0 mr-1">Market:</span>
          {activeMarketFilters.map(filter => (
            <button
              key={filter.id}
              onClick={() => setSelectedMarketGroup(filter.id)}
              type="button"
              className={`px-2.5 py-1 rounded-[6px] whitespace-nowrap transition-colors text-[11px] font-medium ${
                selectedMarketGroup === filter.id
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold'
                  : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Risk Tier Quick Buttons */}
        <div className="pt-1 flex items-center gap-1.5 overflow-x-auto text-[10.5px] pb-1 [scrollbar-width:none]">
          <span className="text-[var(--text-3)] font-mono shrink-0 mr-1">Tier:</span>
          {riskTierPills.map(tier => (
            <button
              key={tier.id}
              onClick={() => setSelectedRiskTier(tier.id)}
              type="button"
              className={`px-2 py-0.5 rounded-[4px] whitespace-nowrap transition-colors text-[10.5px] ${
                selectedRiskTier === tier.id
                  ? 'bg-[var(--surface-2)] text-[var(--text)] font-semibold border border-[var(--border-strong)]'
                  : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>

      {/* Predictions Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-3)]">
          <span className="font-mono">Displaying {filtered.length} scored lines</span>
          <span>Ranked by model score & statistical edge</span>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--surface-2)] text-[var(--text-3)] font-mono text-[10px] uppercase tracking-wider border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-3">Fixture</th>
                  <th className="py-2.5 px-3">Tier</th>
                  <th className="py-2.5 px-3">Market category</th>
                  <th className="py-2.5 px-3">Selection</th>
                  <th className="py-2.5 px-3">Prob</th>
                  <th className="py-2.5 px-3">Odds</th>
                  <th className="py-2.5 px-3">Edge</th>
                  <th className="py-2.5 px-3">Est. EV</th>
                  <th className="py-2.5 px-3">Statistical Rationale</th>
                  <th className="py-2.5 px-3 text-right">Intel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((item, idx) => {
                  const p = item.prediction;
                  const isTop = p.isTopPick;
                  const tierBadge = getRiskTierBadge(p.riskTier);

                  return (
                    <tr key={idx} className={`hover:bg-[var(--surface-2)]/60 transition-colors ${isTop ? 'bg-[var(--accent-soft)]' : ''}`}>
                      <td className="py-2.5 px-3 text-[var(--text)]">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <TeamCrest
                              crestUrl={item.homeTeam.crestUrl}
                              teamName={item.homeTeam.shortName || item.homeTeam.name}
                              size={18}
                            />
                            <TeamCrest
                              crestUrl={item.awayTeam.crestUrl}
                              teamName={item.awayTeam.shortName || item.awayTeam.name}
                              size={18}
                            />
                          </div>
                          <div>
                            <span className="font-medium block truncate max-w-[140px] sm:max-w-none">{item.fixtureName}</span>
                            {item.isDerby && (
                              <span className="text-[10px] font-semibold text-rose-300">⚡ {item.derbyName || 'Derby'}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono font-bold tracking-wider ${tierBadge.badgeClass}`}>
                          {tierBadge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-2)]">
                        <span className="text-[12px] text-[var(--text)]">
                          {getOptionTypeLabel(p.optionType)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[var(--text)]">
                        <div className="flex items-center gap-1.5">
                          <span>{formatSelectionName(p.selection)}</span>
                          {isTop && (
                            <span className="text-[9px] bg-[var(--accent-soft)] text-[var(--accent)] px-1 rounded-[3px] font-mono font-bold border border-[var(--accent)]/30">
                              Best pick
                            </span>
                          )}
                          {p.pushProbability !== undefined && (
                            <span className="text-[9px] bg-[var(--surface-2)] text-[var(--text-3)] px-1 rounded-[3px] font-mono border border-[var(--border)]">
                              Push {(p.pushProbability * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[var(--text)] tabular-nums font-semibold">
                        {(p.modelProbability * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[12px]">
                        {p.marketOdds ? (
                          <span className="bg-[var(--surface-2)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border)] text-[var(--text)] tabular-nums">
                            {p.marketOdds.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-3)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border)]">
                            n/a
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[var(--text-2)] tabular-nums">
                        {p.edge !== undefined ? (
                          <span className={p.edge >= 0 ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}>
                            {p.edge >= 0 ? `+${(p.edge * 100).toFixed(1)}%` : `${(p.edge * 100).toFixed(1)}%`}
                          </span>
                        ) : 'n/a'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {p.expectedValue !== undefined ? (
                          <span className={`font-medium ${formatExpectedValue(p.expectedValue).colorClass}`}>
                            {formatExpectedValue(p.expectedValue).text}
                          </span>
                        ) : (
                          <span className="text-[var(--text-3)] text-[12px]">n/a</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-3)] text-[11px] max-w-[220px]">
                        <span className="line-clamp-2">{p.plainEnglishReason}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/matches/${item.fixtureId}`}
                          className="inline-flex items-center gap-0.5 text-[11px] text-[var(--accent)] hover:underline font-medium"
                        >
                          <span>Market intel</span>
                          <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-[12px] text-[var(--text-3)] space-y-2">
            <div suppressHydrationWarning className="font-mono text-[12.5px] text-[var(--text)]">
              {liveDataAvailable ? 'No predictions match your selected filters' : `Live data unavailable. Last updated ${lastUpdated}`}
            </div>
            <p className="max-w-sm mx-auto text-[11.5px]">
              {liveDataAvailable ? 'Try adjusting the minimum probability threshold or selecting all market categories.' : 'Live market intelligence will populate once live provider data is refreshed.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
