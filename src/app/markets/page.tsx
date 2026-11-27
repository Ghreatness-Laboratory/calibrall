'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { ArrowUpRight, Clock, Info } from 'lucide-react';
import { SupportedOptionType, Fixture } from '@/types';
import { formatOdds } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { BasketballMarketCategory } from '@/lib/basketball/markets';
import type { BasketballPickCandidate } from '@/lib/basketball/picker';
import {
  isDisabledRecommendationMarket,
  UNDER_BOOKINGS_BOARD_MESSAGE,
} from '@/lib/markets';

const FOOTBALL_MARKET_OPTIONS: {
  code: string;
  label: string;
  optionType: SupportedOptionType;
  category: string;
  period: string;
  disabledRecommendation?: boolean;
}[] = [
  { code: '1X2_HOME', label: '1. Win: Home victory (1)', optionType: 'win', category: 'match_result', period: 'Regular time' },
  { code: '1X2_AWAY', label: '1. Win: Away victory (2)', optionType: 'win', category: 'match_result', period: 'Regular time' },
  { code: '1X2_DRAW', label: '2. Draw: Regular time draw', optionType: 'draw', category: 'match_result', period: 'Regular time' },
  { code: 'DC_1X', label: '3. Double chance: Home or draw (1X)', optionType: 'double_chance', category: 'double_chance', period: 'Regular time' },
  { code: 'DC_12', label: '3. Double chance: Home or away (no draw)', optionType: 'double_chance', category: 'double_chance', period: 'Regular time' },
  { code: 'TOTAL_GOALS_O25', label: '4. Over 2.5 goals', optionType: 'over_under_goals', category: 'total_goals', period: 'Regular time' },
  { code: 'TOTAL_GOALS_U25', label: '4. Under 2.5 goals', optionType: 'over_under_goals', category: 'total_goals', period: 'Regular time' },
  { code: 'TOTAL_GOALS_O20_PUSH', label: '4. Over 2.0 goals (push at 2)', optionType: 'over_under_goals', category: 'total_goals', period: 'Regular time' },
  { code: 'BTTS_YES', label: '5. Both teams to score (Yes)', optionType: 'both_teams_to_score', category: 'btts', period: 'Regular time' },
  { code: 'BTTS_NO', label: '5. Both teams to score (No)', optionType: 'both_teams_to_score', category: 'btts', period: 'Regular time' },
  { code: 'TOTAL_CORNERS_O95', label: '6. Over 9.5 corners', optionType: 'corners', category: 'total_corners', period: 'Regular time' },
  { code: 'TEAM_CORNERS_HOME_O45', label: '6. Home over 4.5 corners', optionType: 'corners', category: 'team_corners', period: 'Regular time' },
  { code: 'CARDS_O45', label: '7. Over 4.5 cards', optionType: 'bookings', category: 'bookings', period: 'Regular time' },
  { code: 'CARDS_UNDER', label: '7. Under cards', optionType: 'bookings', category: 'bookings', period: 'Regular time', disabledRecommendation: true },
  { code: 'HSH_2ND', label: '8. Highest scoring half: 2nd half', optionType: 'highest_scoring_half', category: 'half_time', period: 'Full time' },
  { code: 'FH_GOALS_O05', label: '9. 1st half over 0.5 goals', optionType: 'first_half_goals', category: 'half_time', period: '1st half' },
  { code: '2H_RESULT_HOME', label: '10. 2nd half result: Home win', optionType: 'second_half_result', category: 'half_time', period: '2nd half' },
  { code: 'MULTI_GOALS_1_3', label: '11. Multi goals: 1 to 3 goals', optionType: 'multi_goals', category: 'multi_goals', period: 'Regular time' },
  { code: 'MULTI_GOALS_2_4', label: '11. Multi goals: 2 to 4 goals', optionType: 'multi_goals', category: 'multi_goals', period: 'Regular time' },
  { code: 'MULTI_GOALS_2_3', label: '11. Multi goals: 2 to 3 goals', optionType: 'multi_goals', category: 'multi_goals', period: 'Regular time' },
  { code: 'MULTI_GOALS_3_5', label: '11. Multi goals: 3 to 5 goals', optionType: 'multi_goals', category: 'multi_goals', period: 'Regular time' },
  { code: 'TEAM_MULTI_GOALS_HOME_1_2', label: '11. Home multi goals: 1 to 2', optionType: 'team_multi_goals', category: 'multi_goals', period: 'Regular time' },
  { code: 'TEAM_MULTI_GOALS_AWAY_0_1', label: '11. Away multi goals: 0 to 1', optionType: 'team_multi_goals', category: 'multi_goals', period: 'Regular time' },
  { code: 'FH_MULTI_GOALS_0_1', label: '11. 1st half multi goals: 0 to 1', optionType: 'first_half_multi_goals', category: 'multi_goals', period: '1st half' },
  { code: 'FH_MULTI_GOALS_1_2', label: '11. 1st half multi goals: 1 to 2', optionType: 'first_half_multi_goals', category: 'multi_goals', period: '1st half' },
];

const BASKETBALL_MARKET_OPTIONS: {
  code: BasketballMarketCategory;
  label: string;
  optionType: string;
  category: BasketballMarketCategory;
  period: string;
}[] = [
  { code: 'game_total', label: '1. Game Total Over/Under', optionType: 'game_total', category: 'game_total', period: 'Full game (incl. OT)' },
  { code: 'home_total', label: '2. Home Team Total Over/Under', optionType: 'home_total', category: 'home_total', period: 'Full game (incl. OT)' },
  { code: 'away_total', label: '3. Away Team Total Over/Under', optionType: 'away_total', category: 'away_total', period: 'Full game (incl. OT)' },
  { code: 'h1_game_total', label: '4. 1st Half Game Total Over/Under', optionType: 'h1_game_total', category: 'h1_game_total', period: '1st half (no OT)' },
  { code: 'h1_team_total', label: '5. 1st Half Team Totals Over/Under', optionType: 'h1_team_total', category: 'h1_team_total', period: '1st half (no OT)' },
];

export default function MarketExplorerPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedOptionType, setSelectedOptionType] = useState<string>('ALL');
  const [selectedFootballLine, setSelectedFootballLine] = useState<string>('TOTAL_GOALS_O25');
  const [selectedBasketballCat, setSelectedBasketballCat] = useState<BasketballMarketCategory>('game_total');
  const [basketballLeagueFilter, setBasketballLeagueFilter] = useState<'ALL' | 'NBA' | 'NCAAB' | 'EUROLEAGUE'>('ALL');

  const { fixtures, evaluations, lastUpdated, error, isOffline, isSavedCopy } = useLiveFixtures(
    isBasketball ? basketballLeagueFilter : undefined,
    'ALL',
    sport
  );

  const marketOptions = isBasketball ? BASKETBALL_MARKET_OPTIONS : FOOTBALL_MARKET_OPTIONS;
  const selectedMarketLine = isBasketball ? selectedBasketballCat : selectedFootballLine;

  const filteredOptions = useMemo(() => {
    if (isBasketball) {
      if (selectedOptionType === 'ALL') return BASKETBALL_MARKET_OPTIONS;
      if (selectedOptionType === 'game_total') {
        return BASKETBALL_MARKET_OPTIONS.filter((o) => o.category === 'game_total');
      }
      if (selectedOptionType === 'team_total') {
        return BASKETBALL_MARKET_OPTIONS.filter((o) => o.category === 'home_total' || o.category === 'away_total');
      }
      if (selectedOptionType === 'h1_total') {
        return BASKETBALL_MARKET_OPTIONS.filter((o) => o.category === 'h1_game_total' || o.category === 'h1_team_total');
      }
      return BASKETBALL_MARKET_OPTIONS.filter((o) => o.category === selectedOptionType);
    }
    if (selectedOptionType === 'ALL') return FOOTBALL_MARKET_OPTIONS;
    if (selectedOptionType === 'multi_goals') {
      return FOOTBALL_MARKET_OPTIONS.filter(
        (o) =>
          o.optionType === 'multi_goals' ||
          o.optionType === 'team_multi_goals' ||
          o.optionType === 'first_half_multi_goals'
      );
    }
    return FOOTBALL_MARKET_OPTIONS.filter((o) => o.optionType === selectedOptionType);
  }, [isBasketball, selectedOptionType]);

  const comparisons = useMemo(() => {
    if (isBasketball) {
      const list: {
        fixtureId: string;
        fixture: Fixture;
        pick: BasketballPickCandidate | null;
        needsHistory: boolean;
        abstentionReason: string | null;
        prob: number;
      }[] = [];

      fixtures
        .filter((f) => {
          const gameLeague = f.basketballStats?.league || f.competition?.code;
          if (basketballLeagueFilter !== 'ALL' && gameLeague !== basketballLeagueFilter) return false;
          return f.status !== 'FINISHED' && f.status !== 'POSTPONED' && f.status !== 'CANCELED';
        })
        .forEach((fixture) => {
          const ev = evaluations?.[fixture.id];
          if (!ev || ev.needsHistory || fixture.basketballStats?.needsHistory) {
            list.push({
              fixtureId: fixture.id,
              fixture,
              pick: null,
              needsHistory: true,
              abstentionReason: ev?.abstentionReason || fixture.basketballStats?.abstentionReason || 'Needs history',
              prob: 0,
            });
            return;
          }
          const matchedPicks = ev.picks.filter((p) => p.marketCategory === selectedBasketballCat);
          if (matchedPicks.length === 0) {
            list.push({
              fixtureId: fixture.id,
              fixture,
              pick: null,
              needsHistory: true,
              abstentionReason: 'Needs history',
              prob: 0,
            });
            return;
          }
          matchedPicks.sort((a, b) => b.calibratedProbability - a.calibratedProbability);
          const best = matchedPicks[0];
          list.push({
            fixtureId: fixture.id,
            fixture,
            pick: best,
            needsHistory: false,
            abstentionReason: null,
            prob: best.calibratedProbability,
          });
        });

      return list.sort((a, b) => {
        if (a.needsHistory !== b.needsHistory) return a.needsHistory ? 1 : -1;
        return b.prob - a.prob;
      });
    }

    if (selectedFootballLine === 'CARDS_UNDER') {
      return [];
    }

    const list: {
      fixtureId: string;
      fixture: Fixture;
      prediction: ReturnType<typeof evaluateFixtureMarkets>['predictions'][number];
    }[] = [];

    fixtures
      .filter((f) => f.status !== 'FINISHED' && f.sport !== 'basketball')
      .forEach((fixture) => {
        const stats = getFixtureStatistics(fixture);
        const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));
        const matchedPred = evalResult.predictions.find(
          (p) => p.marketCode === selectedFootballLine && !isDisabledRecommendationMarket(p)
        );
        if (matchedPred) {
          list.push({
            fixtureId: fixture.id,
            fixture,
            prediction: matchedPred,
          });
        }
      });

    return list.sort((a, b) => b.prediction.modelProbability - a.prediction.modelProbability);
  }, [fixtures, evaluations, isBasketball, basketballLeagueFilter, selectedBasketballCat, selectedFootballLine]);

  const activeOption =
    marketOptions.find((o) => o.code === selectedMarketLine) || marketOptions[0];
  const isDisabledFootballMarket =
    !isBasketball && Boolean((activeOption as { disabledRecommendation?: boolean } | undefined)?.disabledRecommendation);

  const footballOptionTabs = [
    { id: 'ALL', label: 'All market types' },
    { id: 'win', label: '1. Win' },
    { id: 'draw', label: '2. Draw' },
    { id: 'double_chance', label: '3. Double chance' },
    { id: 'over_under_goals', label: '4. Over or under' },
    { id: 'both_teams_to_score', label: '5. BTTS' },
    { id: 'corners', label: '6. Corners' },
    { id: 'bookings', label: '7. Cards' },
    { id: 'highest_scoring_half', label: '8. Highest half' },
    { id: 'first_half_goals', label: '9. 1st half goals' },
    { id: 'second_half_result', label: '10. 2nd half result' },
    { id: 'multi_goals', label: 'Multi goals' },
  ];

  const basketballOptionTabs = [
    { id: 'ALL', label: 'All' },
    { id: 'game_total', label: 'Game total' },
    { id: 'team_total', label: 'Team total' },
    { id: 'h1_total', label: '1st half' },
  ];

  const optionFilterTabs = isBasketball ? basketballOptionTabs : footballOptionTabs;

  if (isSwitching) {
    return (
      <div className="space-y-4 py-3 animate-pulse">
        <div className="h-7 w-52 bg-[var(--surface)] rounded-[8px]" />
        <div className="h-28 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Header */}
      <div className="space-y-1 pb-2 border-b border-[var(--line)]">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
          {isBasketball ? 'Basketball cross-match totals' : 'Cross-match market explorer'}
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          {isBasketball
            ? 'Compare calibrated game total, team total, and 1st half total probabilities across NBA, NCAAB, and EuroLeague.'
            : 'Compare model probability, pricing, and calibration status for specific option lines across European fixtures.'}
        </p>
      </div>

      {(isSavedCopy || error) && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {isSavedCopy
              ? `Showing saved copy${lastUpdated ? ` from ${lastUpdated}` : ''}${error ? ` (${error})` : ''}.`
              : isOffline
              ? 'You appear to be offline and no saved copy is available.'
              : error || 'Unable to load fixtures.'}
          </span>
        </div>
      )}

      {isBasketball && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {(['ALL', 'NBA', 'NCAAB', 'EUROLEAGUE'] as const).map((lg) => (
            <button
              key={lg}
              type="button"
              onClick={() => setBasketballLeagueFilter(lg)}
              className={`min-h-[44px] px-4 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                basketballLeagueFilter === lg
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              {lg === 'ALL' ? 'All' : lg === 'EUROLEAGUE' ? 'EuroLeague' : lg}
            </button>
          ))}
        </div>
      )}

      {/* Market Selector Card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {optionFilterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedOptionType(tab.id);
                if (tab.id !== 'ALL') {
                  if (isBasketball) {
                    const mappedCat: BasketballMarketCategory =
                      tab.id === 'team_total'
                        ? 'home_total'
                        : tab.id === 'h1_total'
                        ? 'h1_game_total'
                        : 'game_total';
                    setSelectedBasketballCat(mappedCat);
                  } else {
                    const firstMatch = FOOTBALL_MARKET_OPTIONS.find((o) => o.optionType === tab.id);
                    if (firstMatch) setSelectedFootballLine(firstMatch.code);
                  }
                }
              }}
              type="button"
              className={`min-h-[44px] px-3.5 rounded-full text-[12px] whitespace-nowrap transition-colors touch-press shrink-0 border ${
                selectedOptionType === tab.id
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                  : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] border-[var(--line)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="pt-2.5 border-t border-[var(--line)]">
          <div className="text-[11.5px] font-medium text-[var(--text-2)] mb-2">
            Target market ({filteredOptions.length} available)
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {filteredOptions.map((opt) => (
              <button
                key={opt.code}
                onClick={() => {
                  if (isBasketball) {
                    setSelectedBasketballCat(opt.code as BasketballMarketCategory);
                  } else {
                    setSelectedFootballLine(opt.code);
                  }
                }}
                type="button"
                className={`min-h-[44px] px-3 rounded-[12px] text-[12px] transition-colors font-medium touch-press border ${
                  selectedMarketLine === opt.code
                    ? 'bg-[var(--accent-fill)] text-[var(--accent-ink)] border-transparent font-bold'
                    : 'bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[var(--text-2)] hover:text-[var(--text)] border-[var(--line)]'
                }`}
              >
                {cleanDisplayText(opt.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparisons Table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] overflow-hidden">
        <div className="p-4 bg-[var(--surface-2)] border-b border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
          <div>
            <h2 className="font-display font-semibold text-[var(--text)] flex items-center gap-2 text-[14px]">
              <span>Cross-match comparison:</span>
              <span className="text-[var(--accent)]">{cleanDisplayText(activeOption?.label)}</span>
            </h2>
            <div className="text-[var(--text-2)] text-[11px] mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Period: {cleanDisplayText(activeOption?.period)}</span>
              </span>
              <span>·</span>
              <span>
                {isDisabledFootballMarket
                  ? 'Not recommended'
                  : 'Ranked by calibrated probability'}
              </span>
            </div>
          </div>
          <span className="text-[var(--text-2)] text-[11.5px] tabular-nums">
            {isDisabledFootballMarket
              ? '—'
              : `${comparisons.length} ${isBasketball ? 'games' : 'fixtures'}`}
          </span>
        </div>

        {isDisabledFootballMarket ? (
          <div className="p-6 text-center space-y-1.5">
            <div className="font-display text-[14px] font-semibold text-[var(--text)]">
              Under bookings (cards)
            </div>
            <p className="text-[12.5px] text-[var(--text-2)]">
              {cleanDisplayText(UNDER_BOOKINGS_BOARD_MESSAGE)}
            </p>
          </div>
        ) : comparisons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--surface)] text-[var(--text-2)] text-[11px] font-medium border-b border-[var(--line)]">
                <tr>
                  <th className="py-3 px-3.5">Matchup</th>
                  <th className="py-3 px-3.5">Selection</th>
                  <th className="py-3 px-3.5">Probability</th>
                  <th className="py-3 px-3.5">Price / Source</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {isBasketball
                  ? (comparisons as Array<{
                      fixtureId: string;
                      fixture: Fixture;
                      pick: BasketballPickCandidate | null;
                      needsHistory: boolean;
                      abstentionReason: string | null;
                      prob: number;
                    }>).map(({ fixture, pick, needsHistory, abstentionReason }) => (
                      <tr key={fixture.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="font-medium text-[var(--text)]">
                            {cleanDisplayText(fixture.homeTeam.name)} vs {cleanDisplayText(fixture.awayTeam.name)}
                          </div>
                          <div className="text-[11px] text-[var(--text-2)]">
                            {fixture.basketballStats?.league || fixture.competition.code}
                            {fixture.basketballStats?.neutral ? ' · Neutral' : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-[var(--text)] font-medium">
                          {needsHistory || !pick ? (
                            <span className="text-[var(--medium)]">Needs history</span>
                          ) : (
                            cleanDisplayText(pick.selection)
                          )}
                        </td>
                        <td className="py-3 px-3.5 font-display font-bold text-[var(--accent)] tabular-nums">
                          {needsHistory || !pick ? '—' : `${(pick.calibratedProbability * 100).toFixed(1)}%`}
                        </td>
                        <td className="py-3 px-3.5 text-[var(--text)] tabular-nums text-[11.5px]">
                          {needsHistory || !pick
                            ? cleanDisplayText(abstentionReason || 'Needs history')
                            : pick.isModelLine
                            ? 'Model line'
                            : `${pick.priceSource} @${pick.marketOdds?.toFixed(2)}`}
                        </td>
                        <td className="py-3 px-3.5 text-[11px]">
                          {needsHistory || !pick ? (
                            <span className="text-[var(--medium)]">Abstained</span>
                          ) : (
                            <span className={pick.tier === 'HIGH' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-2)]'}>
                              {pick.tier === 'HIGH' ? 'High' : pick.tier === 'MEDIUM' ? 'Medium' : 'Low'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <Link
                            href={`/matches/${fixture.id}`}
                            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--accent)] hover:underline font-semibold touch-press"
                          >
                            <span>Analyze</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  : (comparisons as Array<{
                      fixtureId: string;
                      fixture: Fixture;
                      prediction: ReturnType<typeof evaluateFixtureMarkets>['predictions'][number];
                    }>).map(({ fixture, prediction }) => (
                      <tr key={fixture.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="font-medium text-[var(--text)]">
                            {fixture.homeTeam.shortName || fixture.homeTeam.name} vs {fixture.awayTeam.shortName || fixture.awayTeam.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-2)]">{fixture.competition.name}</div>
                        </td>
                        <td className="py-3 px-3.5 text-[var(--text)] font-medium">
                          {cleanDisplayText(prediction.selection)}
                        </td>
                        <td className="py-3 px-3.5 font-display font-bold text-[var(--accent)] tabular-nums">
                          {((prediction.calibratedProbability ?? prediction.modelProbability) * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3.5 text-[var(--text)] tabular-nums text-[11.5px]">
                          {prediction.marketOdds
                            ? `@${formatOdds(prediction.marketOdds)}`
                            : prediction.priceSource
                            ? cleanDisplayText(prediction.priceSource)
                            : '—'}
                        </td>
                        <td className="py-3 px-3.5 text-[11px]">
                          <span
                            className={
                              prediction.isSpeculative
                                ? 'text-[var(--medium)] font-semibold'
                                : prediction.confidenceTier === 'HIGH'
                                ? 'text-[var(--accent)] font-semibold'
                                : 'text-[var(--text-2)]'
                            }
                          >
                            {prediction.isSpeculative
                              ? 'Speculative'
                              : prediction.confidenceTier === 'HIGH'
                              ? 'High'
                              : prediction.confidenceTier === 'MEDIUM'
                              ? 'Medium'
                              : prediction.marketCategory === 'multi_goals'
                              ? 'Low'
                              : 'Analysis only'}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <Link
                            href={`/matches/${fixture.id}`}
                            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--accent)] hover:underline font-semibold touch-press"
                          >
                            <span>Analyze</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[12.5px] text-[var(--text-2)]">
            No fixtures found matching this line.
          </div>
        )}
      </div>
    </div>
  );
}
