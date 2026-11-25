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

const FOOTBALL_MARKET_OPTIONS: {
  code: string;
  label: string;
  optionType: SupportedOptionType;
  category: string;
  period: string;
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
  { code: 'CARDS_O45', label: '7. Over 4.5 bookings', optionType: 'bookings', category: 'bookings', period: 'Regular time' },
  { code: 'HSH_2ND', label: '8. Highest scoring half: 2nd half', optionType: 'highest_scoring_half', category: 'half_time', period: 'Full time' },
  { code: 'FH_GOALS_O05', label: '9. 1st half over 0.5 goals', optionType: 'first_half_goals', category: 'half_time', period: '1st half' },
  { code: '2H_RESULT_HOME', label: '10. 2nd half result: Home win', optionType: 'second_half_result', category: 'half_time', period: '2nd half' },
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
    return FOOTBALL_MARKET_OPTIONS.filter((o) => o.optionType === selectedOptionType);
  }, [isBasketball, selectedOptionType]);

  // Evaluate upcoming fixtures for this specific market code / category
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

    const list: {
      fixtureId: string;
      fixture: Fixture;
      prediction: any;
    }[] = [];

    fixtures
      .filter((f) => f.status !== 'FINISHED')
      .forEach((fixture) => {
        const stats = getFixtureStatistics(fixture);
        const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));
        const matchedPred = evalResult.predictions.find((p) => p.marketCode === selectedFootballLine);
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

  const footballOptionTabs = [
    { id: 'ALL', label: 'All 10 option types' },
    { id: 'win', label: '1. Win' },
    { id: 'draw', label: '2. Draw' },
    { id: 'double_chance', label: '3. Double chance' },
    { id: 'over_under_goals', label: '4. Over or under' },
    { id: 'both_teams_to_score', label: '5. BTTS' },
    { id: 'corners', label: '6. Corners' },
    { id: 'bookings', label: '7. Bookings' },
    { id: 'highest_scoring_half', label: '8. Highest half' },
    { id: 'first_half_goals', label: '9. 1st half goals' },
    { id: 'second_half_result', label: '10. 2nd half result' },
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
        <div className="h-6 w-48 bg-[#151E19] rounded-[6px]" />
        <div className="h-28 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 py-1">
      {/* Header */}
      <div className="space-y-0.5 pb-1 border-b border-white/[0.07]">
        <h1 className="text-[23px] font-[700] leading-[1.2] text-[#ECF1EE] tracking-[-0.025em]">
          {isBasketball ? 'Basketball cross match totals explorer' : 'Cross match market explorer'}
        </h1>
        <p className="text-[12px] text-[#8B9890]">
          {isBasketball
            ? 'Compare calibrated game total, team total, and 1st half total probabilities across NBA, NCAAB, and EuroLeague.'
            : 'Compare model probability, pricing, and calibration status for specific option lines across all European fixtures.'}
        </p>
      </div>

      {/* Saved copy or server error notice */}
      {(isSavedCopy || error) && (
        <div className="p-2.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11.5px] flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span>
            {isSavedCopy
              ? `Showing saved copy${lastUpdated ? ` from ${lastUpdated}` : ''}${error ? ` (${error})` : ''}.`
              : isOffline
              ? 'You appear to be offline and no saved copy is available.'
              : error || 'Unable to load fixtures.'}
          </span>
        </div>
      )}

      {/* Basketball League Selector */}
      {isBasketball && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {(['ALL', 'NBA', 'NCAAB', 'EUROLEAGUE'] as const).map((lg) => (
            <button
              key={lg}
              type="button"
              onClick={() => setBasketballLeagueFilter(lg)}
              className={`h-[30px] px-3 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                basketballLeagueFilter === lg
                  ? 'bg-[#B8E636]/15 border-[#B8E636] text-[#B8E636] font-semibold'
                  : 'bg-[#101713] border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              {lg === 'ALL' ? 'All' : lg === 'EUROLEAGUE' ? 'EuroLeague' : lg}
            </button>
          ))}
        </div>
      )}

      {/* Market Selector Card */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
        {/* Step 1: Option Type Filter */}
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
              className={`h-[30px] px-3 rounded-full text-[11px] whitespace-nowrap transition-colors touch-press shrink-0 ${
                selectedOptionType === tab.id
                  ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B] font-semibold'
                  : 'bg-[#151E19] text-[#8B9890] hover:text-[#ECF1EE] border border-white/[0.07]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Step 2: Target Line Selector */}
        <div className="pt-2 border-t border-white/[0.07]">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#8B9890] mb-2">
            TARGET MARKET ({filteredOptions.length} AVAILABLE):
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
                className={`px-2.5 py-1 rounded-[8px] text-[12px] transition-colors font-medium touch-press ${
                  selectedMarketLine === opt.code
                    ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold shadow-sm'
                    : 'bg-[#151E19] hover:bg-white/[0.04] text-[#8B9890] hover:text-[#ECF1EE] border border-white/[0.07]'
                }`}
              >
                {cleanDisplayText(opt.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparisons Table */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] overflow-hidden">
        <div className="p-3 bg-[#151E19] border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
          <div>
            <h2 className="font-semibold text-[#ECF1EE] flex items-center gap-2 text-[13px]">
              <span>Cross match comparison:</span>
              <span className="text-[#B6E63B]">{cleanDisplayText(activeOption?.label)}</span>
            </h2>
            <div className="text-[#8B9890] text-[11px] mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-[#B6E63B]" />
                <span>Period: {cleanDisplayText(activeOption?.period)}</span>
              </span>
              <span>·</span>
              <span>Ranked by calibrated probability</span>
            </div>
          </div>
          <span className="font-mono text-[#8B9890] text-[11px] tabular-nums">
            {comparisons.length} {isBasketball ? 'games' : 'fixtures'}
          </span>
        </div>

        {comparisons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#101713] text-[#8B9890] text-[10px] font-mono uppercase tracking-[0.14em] border-b border-white/[0.07]">
                <tr>
                  <th className="py-2.5 px-3">Matchup</th>
                  <th className="py-2.5 px-3">Modeled selection</th>
                  <th className="py-2.5 px-3">Probability</th>
                  <th className="py-2.5 px-3">Price / Line source</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isBasketball
                  ? (comparisons as Array<{
                      fixtureId: string;
                      fixture: Fixture;
                      pick: BasketballPickCandidate | null;
                      needsHistory: boolean;
                      abstentionReason: string | null;
                      prob: number;
                    }>).map(({ fixture, pick, needsHistory, abstentionReason }) => (
                      <tr key={fixture.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-medium text-[#ECF1EE]">
                            {cleanDisplayText(fixture.homeTeam.name)} vs {cleanDisplayText(fixture.awayTeam.name)}
                          </div>
                          <div className="text-[11px] text-[#8B9890] font-mono">
                            {fixture.basketballStats?.league || fixture.competition.code}
                            {fixture.basketballStats?.neutral ? ' · Neutral' : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[#ECF1EE] font-medium">
                          {needsHistory || !pick ? (
                            <span className="text-[#E8B04A]">Needs history</span>
                          ) : (
                            cleanDisplayText(pick.selection)
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-[#B6E63B] tabular-nums">
                          {needsHistory || !pick ? '—' : `${(pick.calibratedProbability * 100).toFixed(1)}%`}
                        </td>
                        <td className="py-3 px-3 font-mono text-[#ECF1EE] tabular-nums text-[11px]">
                          {needsHistory || !pick
                            ? cleanDisplayText(abstentionReason || 'Needs history')
                            : pick.isModelLine
                            ? 'Model line - no market price'
                            : `${pick.priceSource} @${pick.marketOdds?.toFixed(2)}${
                                pick.expectedValue !== null
                                  ? ` (EV ${pick.expectedValue >= 0 ? '+' : ''}${(pick.expectedValue * 100).toFixed(1)}%)`
                                  : ''
                              }`}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {needsHistory || !pick ? (
                            <span className="text-[#E8B04A]">ABSTAIN</span>
                          ) : (
                            <span className={pick.tier === 'HIGH' ? 'text-[#B6E63B]' : 'text-[#8B9890]'}>
                              {pick.tier}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/matches/${fixture.id}`}
                            className="inline-flex items-center gap-1 text-[11px] text-[#8B9890] hover:text-[#B6E63B] font-medium touch-press"
                          >
                            <span>Analyze</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  : (comparisons as Array<{ fixtureId: string; fixture: Fixture; prediction: any }>).map(
                      ({ fixture, prediction }) => (
                        <tr key={fixture.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-medium text-[#ECF1EE]">
                              {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                            </div>
                            <div className="text-[11px] text-[#8B9890] font-mono">
                              {fixture.competition.name}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[#ECF1EE] font-medium">
                            {cleanDisplayText(prediction.selection)}
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-[#B6E63B] tabular-nums">
                            {(prediction.modelProbability * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-3 font-mono text-[#ECF1EE] tabular-nums">
                            {prediction.marketOdds ? `@${formatOdds(prediction.marketOdds)}` : 'N/A'}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] tabular-nums">
                            <span className="text-[#8B9890]">Withheld: analysis only</span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Link
                              href={`/matches/${fixture.id}`}
                              className="inline-flex items-center gap-1 text-[11px] text-[#8B9890] hover:text-[#B6E63B] font-medium touch-press"
                            >
                              <span>Analyze</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      )
                    )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[12px] text-[#8B9890]">
            No fixtures found matching this line.
          </div>
        )}
      </div>
    </div>
  );
}
