'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { getFixtureStatistics } from '@/lib/data/seedData';
import { generateNBAPredictions } from '@/lib/data/nbaSeedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { ArrowUpRight, Clock, Info } from 'lucide-react';
import { SupportedOptionType, Fixture } from '@/types';
import TeamCrest from '@/components/TeamCrest';
import { formatExpectedValue, formatOdds } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText } from '@/lib/utils/formatText';

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
  code: string;
  label: string;
  optionType: SupportedOptionType;
  category: string;
  period: string;
}[] = [
  { code: 'BASKETBALL_MONEYLINE', label: '1. Moneyline: Winner', optionType: 'moneyline', category: 'moneyline', period: 'Full game' },
  { code: 'BASKETBALL_SPREAD', label: '2. Point Spread (ATS)', optionType: 'spread', category: 'spread', period: 'Full game' },
  { code: 'BASKETBALL_TOTAL_POINTS', label: '3. Total Points (Over / Under)', optionType: 'total_points', category: 'total_points', period: 'Full game' },
];

export default function MarketExplorerPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const marketOptions = isBasketball ? BASKETBALL_MARKET_OPTIONS : FOOTBALL_MARKET_OPTIONS;

  const [selectedOptionType, setSelectedOptionType] = useState<string>('ALL');
  const [selectedMarketLine, setSelectedMarketLine] = useState<string>(
    isBasketball ? 'BASKETBALL_MONEYLINE' : 'TOTAL_GOALS_O25'
  );

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(
    isBasketball ? 'NBA' : undefined,
    'ALL',
    sport
  );

  const filteredOptions = useMemo(() => {
    if (selectedOptionType === 'ALL') return marketOptions;
    return marketOptions.filter(o => o.optionType === selectedOptionType);
  }, [marketOptions, selectedOptionType]);

  // Evaluate upcoming fixtures for this specific market code
  const comparisons = useMemo(() => {
    const list: {
      fixtureId: string;
      fixture: Fixture;
      prediction: any;
      homeMetric?: string;
      awayMetric?: string;
    }[] = [];

    fixtures.filter(f => f.status !== 'FINISHED').forEach(fixture => {
      if (isBasketball || fixture.sport === 'basketball') {
        const preds = generateNBAPredictions(fixture);
        const matched = preds.find(p => p.marketCode === selectedMarketLine);
        if (matched) {
          list.push({
            fixtureId: fixture.id,
            fixture,
            prediction: matched,
            homeMetric: fixture.basketballStats ? `${fixture.basketballStats.homeProjected.toFixed(1)} pts` : undefined,
            awayMetric: fixture.basketballStats ? `${fixture.basketballStats.awayProjected.toFixed(1)} pts` : undefined,
          });
        }
      } else {
        const stats = getFixtureStatistics(fixture);
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

        const matchedPred = evalResult.predictions.find(p => p.marketCode === selectedMarketLine);
        if (matchedPred) {
          list.push({
            fixtureId: fixture.id,
            fixture,
            prediction: matchedPred,
            homeMetric: `${stats.homeXg.toFixed(2)} xG`,
            awayMetric: `${stats.awayXg.toFixed(2)} xG`,
          });
        }
      }
    });

    return list.sort((a, b) => b.prediction.modelProbability - a.prediction.modelProbability);
  }, [fixtures, selectedMarketLine, isBasketball]);

  const activeOption = marketOptions.find(o => o.code === selectedMarketLine) || marketOptions[0];

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
    { id: 'ALL', label: 'All NBA options' },
    { id: 'moneyline', label: '1. Moneyline' },
    { id: 'spread', label: '2. Point Spread' },
    { id: 'total_points', label: '3. Total Points' },
  ];

  const optionFilterTabs = isBasketball ? basketballOptionTabs : footballOptionTabs;

  if (isSwitching) {
    return (
      <div className="space-y-6 py-6 animate-pulse">
        <div className="h-8 w-64 bg-white/10 rounded-[8px]" />
        <div className="h-32 bg-[#0f2219] rounded-[12px] border border-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9]">
            {isBasketball ? 'NBA Cross Match Market Explorer' : 'Cross Match Market Explorer'}
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            {isBasketball
              ? 'Compare model probability, pricing, and margin differential across NBA matchups.'
              : 'Compare model probability, pricing and edge for specific option lines across all European fixtures.'}
          </p>
        </div>
      </div>

      {/* Market Selector Card */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
        {/* Step 1: Option Type Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
          {optionFilterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedOptionType(tab.id);
                if (tab.id !== 'ALL') {
                  const firstMatch = marketOptions.find(o => o.optionType === tab.id);
                  if (firstMatch) setSelectedMarketLine(firstMatch.code);
                }
              }}
              type="button"
              className={`px-2 py-0.5 rounded-[4px] whitespace-nowrap transition-colors ${
                selectedOptionType === tab.id
                  ? 'bg-[#b8e63a] text-[#0a1812] font-[500]'
                  : 'bg-[#0a1812] text-[#8fa69a] hover:text-[#e8efe9] border border-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Step 2: Target Line Selector */}
        <div className="pt-2 border-t border-white/[0.06]">
          <div className="text-[11px] font-mono text-[#8fa69a] mb-2">
            Target line ({filteredOptions.length} available):
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {filteredOptions.map(opt => (
              <button
                key={opt.code}
                onClick={() => setSelectedMarketLine(opt.code)}
                type="button"
                className={`px-2.5 py-1 rounded-[6px] text-[12px] transition-colors font-[500] ${
                  selectedMarketLine === opt.code
                    ? 'bg-[#b8e63a] text-[#0a1812]'
                    : 'bg-[#0a1812] hover:bg-white/[0.04] text-[#8fa69a] hover:text-[#e8efe9] border border-white/[0.08]'
                }`}
              >
                {cleanDisplayText(opt.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparisons Table */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[#0a1812]/50 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
          <div>
            <h2 className="font-[500] text-[#e8efe9] flex items-center gap-2">
              <span>Cross match comparison:</span>
              <span className="text-[#b8e63a]">{cleanDisplayText(activeOption?.label)}</span>
            </h2>
            <div className="text-[#8fa69a] text-[11px] mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-[#b8e63a]" />
                <span>Period: {cleanDisplayText(activeOption?.period)}</span>
              </span>
              <span>·</span>
              <span>Ranked by modeled probability</span>
            </div>
          </div>
          <span className="font-mono text-[#8fa69a] text-[11px]">{comparisons.length} fixtures</span>
        </div>

        {comparisons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] text-[11px] font-[500] border-b border-white/[0.06]">
                <tr>
                  <th className="py-2.5 px-3">Fixture</th>
                  <th className="py-2.5 px-3">Modeled selection</th>
                  <th className="py-2.5 px-3">Probability</th>
                  <th className="py-2.5 px-3">Odds</th>
                  <th className="py-2.5 px-3">EV / Edge</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {comparisons.map(({ fixture, prediction }) => (
                  <tr key={fixture.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-medium text-[#e8efe9]">
                        {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                      </div>
                      <div className="text-[11px] text-[#8fa69a] font-mono">
                        {fixture.competition.name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#e8efe9] font-medium">
                      {cleanDisplayText(prediction.selection)}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-[#b8e63a]">
                      {(prediction.modelProbability * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 font-mono text-[#e8efe9]">
                      {prediction.marketOdds ? `@${formatOdds(prediction.marketOdds)}` : 'N/A'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">
                      {prediction.expectedValue !== undefined && prediction.expectedValue !== null ? (
                        (() => {
                          const evData = formatExpectedValue(prediction.expectedValue);
                          return <span className={evData.colorClass}>{evData.text}</span>;
                        })()
                      ) : (
                        <span className="text-[#8fa69a]">Probability based</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/matches/${fixture.id}`}
                        className="inline-flex items-center gap-1 text-[11px] text-[#8fa69a] hover:text-[#b8e63a] font-medium"
                      >
                        <span>Analyze</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[12px] text-[#8fa69a]">
            No fixtures found matching this line line.
          </div>
        )}
      </div>
    </div>
  );
}
