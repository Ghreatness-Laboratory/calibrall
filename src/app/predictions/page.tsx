'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import { MarketPrediction, Team } from '@/types';
import CompetitionFilter from '@/components/CompetitionFilter';
import { CountryCompetitionGroup } from '@/lib/data/canonicalCompetitions';
import { DayFilterType } from '@/lib/utils/dateWindow';
import { SlidersHorizontal, AlertCircle, Info, ChevronRight } from 'lucide-react';
import {
  formatOdds,
  formatSelectionName,
  getOptionTypeLabel,
  getRiskTierBadge,
} from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';
import { useSport } from '@/lib/context/SportContext';
import type { BasketballLeague, BasketballMarketCategory } from '@/lib/basketball/markets';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';
import TeamCrest from '@/components/TeamCrest';
import {
  cleanDisplayText,
  displayName,
  getTeamAbbreviation,
  formatMatchTime,
} from '@/lib/utils/formatText';

type MarketGroupFilter =
  | 'ALL'
  | 'goals'
  | 'corners'
  | 'cards'
  | 'handicap'
  | 'results'
  | 'halves'
  | 'goal_bounds'
  | 'game_total'
  | 'team_total'
  | 'h1_total';

const BB_CATEGORY_LABELS: Record<BasketballMarketCategory, string> = {
  game_total: 'Game total',
  home_total: 'Home team total',
  away_total: 'Away team total',
  h1_game_total: '1st half game total',
  h1_team_total: '1st half team total',
};

export default function PredictionsPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedCompId, setSelectedCompId] = useState<string>('ALL');
  const [selectedBbLeague, setSelectedBbLeague] = useState<'ALL' | BasketballLeague>('ALL');
  const [selectedDay, setSelectedDay] = useState<DayFilterType>('ALL');
  const [selectedRiskTier, setSelectedRiskTier] = useState<string>('ALL');
  const [selectedMarketGroup, setSelectedMarketGroup] = useState<MarketGroupFilter>('ALL');
  const [onlyValuePicks, setOnlyValuePicks] = useState<boolean>(false);
  const [minProb, setMinProb] = useState<number>(0.5);
  const [compGroups, setCompGroups] = useState<CountryCompetitionGroup[]>([]);
  const [totalCompFixtures, setTotalCompFixtures] = useState<number>(0);

  useEffect(() => {
    if (isBasketball) return;
    fetch('/api/v1/competitions?sport=football', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.groupedByCountry && Array.isArray(json.groupedByCountry)) {
          setCompGroups(json.groupedByCountry);
        }
        if (typeof json.totalFixtures === 'number') {
          setTotalCompFixtures(json.totalFixtures);
        }
      })
      .catch((err) => console.error('[PredictionsPage] Error fetching active competitions:', err));
  }, [isBasketball]);

  const {
    fixtures,
    isLoading,
    lastUpdated,
    isDelayed,
    hasFreeFixturesSource,
    storedHistoryMode,
    error,
    isOffline,
    isSavedCopy,
    evaluations,
  } = useLiveFixtures(
    isBasketball ? selectedBbLeague : selectedCompId,
    'ALL',
    sport,
    selectedDay
  );

  const allPredictions = useMemo(() => {
    if (isBasketball) return [];
    const list: {
      fixtureId: string;
      fixtureName: string;
      homeTeam: Team;
      awayTeam: Team;
      compId: string;
      compCode: string;
      compName: string;
      kickoff: string;
      isDerby?: boolean;
      derbyName?: string;
      prediction: MarketPrediction;
    }[] = [];

    const now = Date.now();
    const footballEvaluations: {
      fixtureId: string;
      fixtureName: string;
      homeTeam: Team;
      awayTeam: Team;
      compId: string;
      compCode: string;
      compName: string;
      kickoff: string;
      isDerby?: boolean;
      derbyName?: string;
      topPick: MarketPrediction | null;
      predictions: MarketPrediction[];
      noRecommendationReason?: string;
    }[] = [];

    fixtures.forEach((fixture) => {
      if (!storedHistoryMode) {
        if (fixture.status === 'FINISHED' || fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED')
          return;
        const kickoffMs = new Date(fixture.kickoffTime).getTime();
        if (!isNaN(kickoffMs) && kickoffMs <= now) return;
      }

      const stats = getFixtureStatistics(fixture);
      if (fixture.insufficientData || stats.insufficientData) {
        return;
      }

      const derbyInfo =
        fixture.isDerby && fixture.derbyName
          ? { name: fixture.derbyName }
          : checkDerby(fixture.homeTeam.name, fixture.awayTeam.name);

      const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));

      footballEvaluations.push({
        fixtureId: fixture.id,
        fixtureName: `${displayName(fixture.homeTeam)} vs ${displayName(fixture.awayTeam)}`,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        compId: fixture.competitionId || fixture.competition.id,
        compCode: fixture.competition.code,
        compName: fixture.competition.name,
        kickoff: fixture.kickoffTime,
        isDerby: !!derbyInfo,
        derbyName: derbyInfo?.name,
        topPick: evalResult.topPick,
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason,
      });
    });

    const diversifiedFootball = selectDiversifiedSlatePicks(footballEvaluations, 0.4);
    diversifiedFootball.forEach((item) => {
      item.predictions.forEach((p) => {
        list.push({
          fixtureId: item.fixtureId,
          fixtureName: item.fixtureName,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          compId: item.compId,
          compCode: item.compCode,
          compName: item.compName,
          kickoff: item.kickoff,
          isDerby: item.isDerby,
          derbyName: item.derbyName,
          prediction: p,
        });
      });
    });

    return list;
  }, [fixtures, isBasketball, storedHistoryMode]);

  const basketballMatches = useMemo(() => {
    if (!isBasketball) return [];
    const now = Date.now();
    const out: Array<{
      fixture: (typeof fixtures)[number];
      evaluation?: BasketballGameEvaluation;
      needsHistory: boolean;
      abstentionReason: string | null;
      picks: BasketballPickCandidate[];
      hasRealOdds: boolean;
    }> = [];

    for (const fixture of fixtures) {
      const gameLeague = fixture.basketballStats?.league || fixture.competition?.code;
      if (selectedBbLeague !== 'ALL' && gameLeague !== selectedBbLeague) {
        continue;
      }
      if (
        fixture.status === 'FINISHED' ||
        fixture.status === 'IN_PLAY' ||
        fixture.status === 'PAUSED' ||
        fixture.status === 'POSTPONED' ||
        fixture.status === 'CANCELED'
      ) {
        continue;
      }
      const kickoffMs = new Date(fixture.kickoffTime).getTime();
      if (!isNaN(kickoffMs) && kickoffMs <= now) continue;

      const ev = evaluations?.[fixture.id];
      const needsHistory = Boolean(
        ev?.needsHistory ?? fixture.basketballStats?.needsHistory ?? fixture.insufficientData
      );
      const abstentionReason =
        ev?.abstentionReason || fixture.basketballStats?.abstentionReason || 'Needs history';

      if (needsHistory) {
        if (selectedMarketGroup === 'ALL' && !onlyValuePicks && selectedRiskTier === 'ALL') {
          out.push({
            fixture,
            evaluation: ev,
            needsHistory: true,
            abstentionReason,
            picks: [],
            hasRealOdds: false,
          });
        }
        continue;
      }

      const rawPicks = ev?.picks || [];
      const filteredPicks = rawPicks.filter((p) => {
        if (selectedRiskTier !== 'ALL') {
          if (selectedRiskTier === 'HIGH' && p.tier !== 'HIGH') return false;
          if (selectedRiskTier === 'MEDIUM' && p.tier !== 'MEDIUM') return false;
          if (selectedRiskTier === 'LOW' && p.tier !== 'SPECULATIVE') return false;
        }
        if (selectedMarketGroup === 'game_total' && p.marketCategory !== 'game_total') {
          return false;
        }
        if (
          selectedMarketGroup === 'team_total' &&
          p.marketCategory !== 'home_total' &&
          p.marketCategory !== 'away_total'
        ) {
          return false;
        }
        if (
          selectedMarketGroup === 'h1_total' &&
          p.marketCategory !== 'h1_game_total' &&
          p.marketCategory !== 'h1_team_total'
        ) {
          return false;
        }
        if (onlyValuePicks && (p.isModelLine || p.expectedValue === null || p.expectedValue <= 0)) {
          return false;
        }
        if (p.calibratedProbability < minProb) return false;
        return true;
      });

      if (filteredPicks.length > 0) {
        out.push({
          fixture,
          evaluation: ev,
          needsHistory: false,
          abstentionReason: null,
          picks: filteredPicks,
          hasRealOdds: filteredPicks.some((p) => !p.isModelLine),
        });
      }
    }

    return out.sort((a, b) => {
      if (a.needsHistory !== b.needsHistory) return a.needsHistory ? 1 : -1;
      const probA = a.picks[0]?.calibratedProbability ?? 0;
      const probB = b.picks[0]?.calibratedProbability ?? 0;
      return probB - probA;
    });
  }, [
    fixtures,
    evaluations,
    isBasketball,
    selectedBbLeague,
    selectedRiskTier,
    selectedMarketGroup,
    onlyValuePicks,
    minProb,
  ]);

  const matchesMarketGroup = (p: MarketPrediction, group: MarketGroupFilter): boolean => {
    if (group === 'ALL') return true;
    if (group === 'goals') {
      return (
        p.optionType === 'over_under_goals' ||
        p.optionType === 'first_half_goals' ||
        p.marketCategory === 'total_goals' ||
        p.marketCategory === 'team_goals' ||
        p.marketCategory === 'btts'
      );
    }
    if (group === 'results') {
      return (
        p.optionType === 'win' ||
        p.optionType === 'draw' ||
        p.optionType === 'double_chance' ||
        p.optionType === 'draw_no_bet' ||
        p.marketCategory === 'match_result' ||
        p.marketCategory === 'double_chance' ||
        p.marketCategory === 'draw_no_bet'
      );
    }
    if (group === 'corners') {
      return (
        p.optionType === 'corners' ||
        p.optionType === 'corner_handicap' ||
        p.marketCategory === 'total_corners' ||
        p.marketCategory === 'team_corners'
      );
    }
    if (group === 'cards') {
      return (
        p.optionType === 'bookings' ||
        p.optionType === 'team_bookings' ||
        p.optionType === 'booking_points' ||
        p.marketCategory === 'bookings'
      );
    }
    if (group === 'handicap') {
      return p.optionType === 'asian_handicap' || p.marketCategory === 'handicap';
    }
    if (group === 'halves') {
      return (
        p.optionType === 'first_half_goals' ||
        p.optionType === 'second_half_result' ||
        p.optionType === 'highest_scoring_half'
      );
    }
    if (group === 'goal_bounds') {
      return (
        p.optionType === 'goal_bounds' ||
        p.optionType === 'team_goal_bounds' ||
        p.marketCategory === 'goal_bounds'
      );
    }
    return true;
  };

  const filtered = useMemo(() => {
    if (isBasketball) return [];
    return allPredictions
      .filter((item) => {
        const p = item.prediction;
        if (selectedCompId !== 'ALL' && item.compId !== selectedCompId) {
          return false;
        }
        if (selectedRiskTier !== 'ALL') {
          const matchesTier =
            (selectedRiskTier === 'HIGH' && (p.riskTier === 'SAFE' || p.confidenceTier === 'HIGH')) ||
            (selectedRiskTier === 'MEDIUM' &&
              (p.riskTier === 'MODERATE' || p.confidenceTier === 'MEDIUM')) ||
            (selectedRiskTier === 'LOW' &&
              (p.riskTier === 'RISKY' || p.riskTier === 'LONGSHOT' || p.confidenceTier === 'LOW'));
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
      })
      .sort((a, b) => {
        const probA = a.prediction.calibratedProbability ?? a.prediction.modelProbability;
        const probB = b.prediction.calibratedProbability ?? b.prediction.modelProbability;
        return probB - probA;
      });
  }, [
    allPredictions,
    isBasketball,
    selectedCompId,
    selectedRiskTier,
    selectedMarketGroup,
    onlyValuePicks,
    minProb,
  ]);

  const groupedMatches = useMemo(() => {
    const map = new Map<
      string,
      {
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
      }
    >();

    filtered.forEach((item) => {
      const existing = map.get(item.fixtureId);
      if (existing) {
        if (!existing.picks.some((pk) => pk.marketCode === item.prediction.marketCode)) {
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
    { id: 'ALL', label: 'All' },
    { id: 'game_total', label: 'Game total' },
    { id: 'team_total', label: 'Team total' },
    { id: 'h1_total', label: '1st half' },
  ];

  const activeMarketFilters = isBasketball ? basketballMarketFilters : footballMarketFilters;

  if (isSwitching || isLoading) {
    return (
      <div className="space-y-3 py-2 animate-pulse">
        <div className="h-7 w-44 bg-[var(--surface)] rounded-[8px]" />
        <div className="h-4 w-60 bg-[var(--surface)] rounded-[8px]" />
        <div className="h-36 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
        <div className="h-48 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
          Market intelligence
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          {isBasketball
            ? 'Calibrated NBA, NCAAB Division I & EuroLeague totals · Local tip-off times'
            : 'Pre-kickoff probability models and statistical evaluations · All times WAT'}
          {lastUpdated ? ` · Updated ${lastUpdated}` : ''}
        </p>
      </div>

      {/* Notices */}
      {(isSavedCopy || error) && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {isSavedCopy
              ? `Showing saved copy${lastUpdated ? ` from ${lastUpdated}` : ''}${error ? ` (${error})` : ''}.`
              : isOffline
              ? 'You appear to be offline and no saved copy is available.'
              : error || 'Unable to load fixtures.'}
          </span>
        </div>
      )}

      {(storedHistoryMode || hasFreeFixturesSource === false) && !isBasketball && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            Fixtures not available on free tier for this league. Showing stored match history and picks only.
          </span>
        </div>
      )}

      {isDelayed && !storedHistoryMode && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>Stored fixtures are older than 3 days (last updated {lastUpdated || 'never'}).</span>
        </div>
      )}

      {/* Odds status */}
      {isBasketball ? (
        basketballMatches.some((m) => m.hasRealOdds) ? (
          <div className="p-3 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] text-[12px] flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>Bookmaker totals connected for priced selections.</span>
          </div>
        ) : (
          <div className="p-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-[var(--text-2)] text-[12px] flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span>Awaiting lines — unpriced selections show model probability without EV.</span>
          </div>
        )
      ) : fixtures.some((f) => Boolean(f.verifiedOdds)) ? (
        <div className="p-3 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>Real bookmaker odds active. Unquoted lines show &ldquo;—&rdquo;.</span>
        </div>
      ) : (
        <div className="p-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-[var(--text-2)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span>Odds not connected. Unquoted markets show &ldquo;—&rdquo;. Showing probability analysis.</span>
        </div>
      )}

      {/* Filters Card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
          <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">Filters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {isBasketball ? (
            <div>
              <label className="block text-[var(--text-2)] mb-1.5 text-[11px]">League</label>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                {(
                  [
                    { id: 'ALL', label: 'All' },
                    { id: 'NBA', label: 'NBA' },
                    { id: 'NCAAB', label: 'NCAAB' },
                    { id: 'EUROLEAGUE', label: 'EuroLeague' },
                  ] as const
                ).map((chip) => {
                  const isActive = selectedBbLeague === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setSelectedBbLeague(chip.id)}
                      className={`min-h-[44px] px-4 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                        isActive
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                          : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <CompetitionFilter
              selectedCompetitionId={selectedCompId}
              onSelectCompetitionId={setSelectedCompId}
              groups={compGroups}
              totalFixturesCount={totalCompFixtures || fixtures.length}
            />
          )}

          <div>
            <label className="block text-[var(--text-2)] mb-1.5 text-[11px]">Confidence</label>
            <select
              value={selectedRiskTier}
              onChange={(e) => setSelectedRiskTier(e.target.value)}
              className="w-full min-h-[44px] bg-[var(--surface-2)] border border-[var(--line)] px-3 rounded-[12px] text-[13px] text-[var(--text)] focus:outline-none"
            >
              <option value="ALL">All</option>
              <option value="HIGH">High (≥70%)</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">{isBasketball ? 'Speculative' : 'Low'}</option>
            </select>
          </div>
        </div>

        {/* Date strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {(['ALL', 'today', 'tomorrow', 'weekend'] as const).map((day) => {
            const isActive = selectedDay === day;
            const label =
              day === 'ALL'
                ? 'All days'
                : day === 'today'
                ? 'Today'
                : day === 'tomorrow'
                ? 'Tomorrow'
                : 'Weekend';
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`min-h-[44px] px-4 rounded-full text-[12px] font-medium transition-colors shrink-0 border touch-press ${
                  isActive
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Min probability */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11.5px] tabular-nums">
            <span className="text-[var(--text-2)]">Min probability</span>
            <span className="text-[var(--accent)] font-bold text-[12px]">
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
            className="w-full h-2 accent-[var(--accent-fill)] cursor-pointer bg-[var(--surface-2)] rounded-full"
          />
        </div>

        <div>
          <label className="min-h-[44px] inline-flex items-center gap-2.5 cursor-pointer text-[12.5px] text-[var(--text)] select-none">
            <input
              type="checkbox"
              checked={onlyValuePicks}
              onChange={(e) => setOnlyValuePicks(e.target.checked)}
              className="w-4 h-4 rounded bg-[var(--surface-2)] border border-[var(--line)] accent-[var(--accent-fill)] cursor-pointer"
            />
            <span>
              {isBasketball
                ? 'Only priced value lines (EV > 0)'
                : 'Only calibrated lines (Data coverage ≥ 80%)'}
            </span>
          </label>
        </div>

        {/* Market family chips */}
        <div className="pt-2 border-t border-[var(--line)]">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {activeMarketFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setSelectedMarketGroup(filter.id)}
                type="button"
                className={`min-h-[44px] px-4 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  selectedMarketGroup === filter.id
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                    : 'bg-transparent border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results header count */}
      <div className="flex items-center justify-between text-[12px] text-[var(--text-2)] px-1 tabular-nums">
        <span className="font-medium text-[var(--text)]">
          {isBasketball
            ? `${basketballMatches.length} matchups (${basketballMatches.reduce(
                (s, m) => s + m.picks.length,
                0
              )} lines)`
            : `${groupedMatches.length} fixtures (${filtered.length} selections)`}
        </span>
        <span className="text-[var(--text-3)]">Ranked by probability</span>
      </div>

      {/* Results Grid */}
      {isBasketball ? (
        basketballMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {basketballMatches.map(({ fixture, needsHistory, abstentionReason, picks }) => {
              const homeName = displayName(fixture.homeTeam);
              const awayName = displayName(fixture.awayTeam);
              const leagueCode =
                fixture.basketballStats?.league || fixture.competition?.code || 'NBA';

              return (
                <div
                  key={fixture.id}
                  className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="border-b border-[var(--line)] pb-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-2)] gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-[var(--text)]">{leagueCode}</span>
                        {fixture.basketballStats?.neutral && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[10.5px]">
                            Neutral
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums shrink-0" suppressHydrationWarning>
                        {new Date(fixture.kickoffTime).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <Link
                      href={`/matches/${fixture.id}`}
                      className="min-h-[44px] flex items-center justify-between gap-2 min-w-0 hover:text-[var(--accent)] transition-colors touch-press"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamCrest
                          canonicalTeamId={fixture.homeTeam.id}
                          crestUrl={fixture.homeTeam.crestUrl}
                          teamName={homeName}
                          size={28}
                        />
                        <span className="font-display text-[13.5px] font-semibold text-[var(--text)] truncate">
                          {homeName}
                        </span>
                        <span className="text-[var(--text-3)] text-[11px] shrink-0">vs</span>
                        <TeamCrest
                          canonicalTeamId={fixture.awayTeam.id}
                          crestUrl={fixture.awayTeam.crestUrl}
                          teamName={awayName}
                          size={28}
                        />
                        <span className="font-display text-[13.5px] font-semibold text-[var(--text)] truncate">
                          {awayName}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--text-2)] shrink-0" />
                    </Link>
                  </div>

                  {needsHistory ? (
                    <div className="bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] p-3 space-y-1">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)]">
                        Needs history
                      </span>
                      <p className="text-[12px] text-[var(--text)]">
                        {cleanDisplayText(abstentionReason || 'Needs history')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {picks.map((p) => {
                        const badge = getRiskTierBadge(p.tier);
                        return (
                          <div
                            key={`${p.marketCode}_${p.line}`}
                            className="bg-[var(--surface-2)] rounded-[12px] p-3 space-y-2 border border-[var(--line)]"
                          >
                            <div className="flex items-center justify-between text-[11px] gap-1">
                              <span className="text-[var(--text-2)] text-[11px] truncate">
                                {BB_CATEGORY_LABELS[p.marketCategory]}
                              </span>
                              <span
                                className={`text-[10.5px] px-2.5 py-0.5 rounded-full border font-semibold shrink-0 ${badge.badgeClass}`}
                              >
                                {badge.label}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display text-[14px] font-semibold text-[var(--text)] truncate">
                                {cleanDisplayText(p.selection)}
                              </span>
                              <span className="font-display text-[14px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                                {(p.calibratedProbability * 100).toFixed(1)}%
                              </span>
                            </div>

                            <div className="relative w-full h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--accent-fill)] rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, p.calibratedProbability * 100)}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px] pt-0.5 gap-2 tabular-nums">
                              <span className="text-[var(--text-2)]">
                                Proj {p.projectedMean.toFixed(1)} (±{p.projectedStd.toFixed(1)})
                              </span>
                              {p.isModelLine ? (
                                <span className="text-[var(--text-2)]">Model line</span>
                              ) : (
                                <span className="bg-[var(--surface)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text)]">
                                  {p.priceSource} @{p.marketOdds?.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-6 text-center space-y-1.5">
            <p className="font-display text-[14px] font-semibold text-[var(--text)]">
              {selectedDay === 'today' ? 'No games today' : 'No basketball totals match filters'}
            </p>
            <p className="text-[12px] text-[var(--text-2)]">
              Try lowering minimum probability, switching league, or unchecking priced-only filter.
            </p>
          </div>
        )
      ) : groupedMatches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groupedMatches.map((group) => {
            const homeName = displayName(group.homeTeam);
            const awayName = displayName(group.awayTeam);
            const homeAbbr = getTeamAbbreviation(group.homeTeam);
            const awayAbbr = getTeamAbbreviation(group.awayTeam);
            const hasMultiplePicks = group.picks.length > 1;

            return (
              <div
                key={group.fixtureId}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col justify-between space-y-3"
              >
                <div className="border-b border-[var(--line)] pb-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-2)]">
                    <span className="truncate font-medium">{cleanDisplayText(group.compName)}</span>
                    <span className="tabular-nums shrink-0">
                      {formatMatchTime(group.kickoff, 'Africa/Lagos')} WAT
                    </span>
                  </div>

                  <Link
                    href={`/matches/${group.fixtureId}`}
                    className="min-h-[44px] flex items-center justify-between gap-2 min-w-0 hover:text-[var(--accent)] transition-colors touch-press"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TeamCrest
                        canonicalTeamId={group.homeTeam.id}
                        crestUrl={group.homeTeam.crestUrl}
                        teamName={homeName}
                        size={28}
                      />
                      <span className="font-display text-[13.5px] font-semibold text-[var(--text)] truncate">
                        {homeName}
                      </span>
                      <span className="text-[10.5px] text-[var(--text-3)] shrink-0">
                        {homeAbbr}
                      </span>
                      <span className="text-[var(--text-3)] text-[11px] shrink-0">vs</span>
                      <TeamCrest
                        canonicalTeamId={group.awayTeam.id}
                        crestUrl={group.awayTeam.crestUrl}
                        teamName={awayName}
                        size={28}
                      />
                      <span className="font-display text-[13.5px] font-semibold text-[var(--text)] truncate">
                        {awayName}
                      </span>
                      <span className="text-[10.5px] text-[var(--text-3)] shrink-0">
                        {awayAbbr}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-2)] shrink-0" />
                  </Link>

                  {hasMultiplePicks && (
                    <div className="text-[10.5px] text-[var(--medium)]">
                      Options from one match overlap.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {group.picks.map((p, pIdx) => {
                    const badge = getRiskTierBadge(p.confidenceTier || p.riskTier);
                    const probVal = p.calibratedProbability ?? p.modelProbability;
                    const hasRealOdds = Boolean(
                      p.marketOdds && p.expectedValue !== null && p.expectedValue !== undefined
                    );

                    return (
                      <div
                        key={pIdx}
                        className="bg-[var(--surface-2)] rounded-[12px] p-3 space-y-2 border border-[var(--line)]"
                      >
                        <div className="flex items-center justify-between text-[11px] gap-1">
                          <span className="text-[var(--text-2)] text-[11px] truncate">
                            {getOptionTypeLabel(p.optionType)}
                          </span>
                          <span
                            className={`text-[10.5px] px-2.5 py-0.5 rounded-full border font-semibold shrink-0 ${badge.badgeClass}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-[14px] font-semibold text-[var(--text)] truncate">
                            {cleanDisplayText(formatSelectionName(p.selection))}
                          </span>
                          <span className="font-display text-[14px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                            {(probVal * 100).toFixed(1)}%
                            {p.uncertaintySpread !== undefined && p.uncertaintySpread !== null && (
                              <span className="text-[10.5px] text-[var(--text-2)] font-normal ml-1">
                                ±{(p.uncertaintySpread * 100).toFixed(1)}%
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="relative w-full h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent-fill)] rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, probVal * 100)}%` }}
                          />
                          <span
                            className="absolute top-0 bottom-0 w-0.5 bg-[var(--text)]/40"
                            style={{ left: '70%' }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-0.5 tabular-nums">
                          <span className="text-[var(--text-2)]">
                            {hasRealOdds ? 'Calibrated' : 'Data coverage: Standard'}
                          </span>
                          {hasRealOdds && (
                            <span className="bg-[var(--surface)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text)]">
                              {p.bookmakerName ? `${p.bookmakerName} ` : ''}@{formatOdds(p.marketOdds)}
                            </span>
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
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-6 text-center space-y-1.5">
          <p className="font-display text-[14px] font-semibold text-[var(--text)]">
            No models match current filters
          </p>
          <p className="text-[12px] text-[var(--text-2)]">
            Try lowering the minimum probability or selecting another competition.
          </p>
        </div>
      )}

      {/* Responsible use disclaimer */}
      <div className="rounded-[18px] p-3.5 border border-[var(--medium)]/30 bg-[var(--medium-soft)] flex items-start gap-2.5 mt-2">
        <AlertCircle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" strokeWidth={2} />
        <div className="text-[11.5px] leading-[1.5] text-[var(--text)]">
          <strong className="font-semibold text-[var(--medium)]">Responsible use: </strong>
          Probabilistic models and mathematical projections only. Sports outcomes contain intrinsic randomness; high modeled probability is never a guarantee. 18+ only.
        </div>
      </div>
    </div>
  );
}
