'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { ArrowUpRight, Clock } from 'lucide-react';
import { SupportedOptionType, Fixture } from '@/types';
import TeamCrest from '@/components/TeamCrest';
import { formatExpectedValue, formatOdds } from '@/lib/prediction/marketCatalog';

const MARKET_OPTIONS: {
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

export default function MarketExplorerPage() {
  const [selectedOptionType, setSelectedOptionType] = useState<string>('ALL');
  const [selectedMarketLine, setSelectedMarketLine] = useState<string>('TOTAL_GOALS_O25');

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures();

  const filteredOptions = useMemo(() => {
    if (selectedOptionType === 'ALL') return MARKET_OPTIONS;
    return MARKET_OPTIONS.filter(o => o.optionType === selectedOptionType);
  }, [selectedOptionType]);

  // Evaluate all upcoming fixtures for this specific market code
  const comparisons = useMemo(() => {
    const list: {
      fixtureId: string;
      fixture: Fixture;
      prediction: any;
      homeXg: number;
      awayXg: number;
    }[] = [];

    fixtures.filter(f => f.status !== 'FINISHED').forEach(fixture => {
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
          homeXg: stats.homeXg,
          awayXg: stats.awayXg,
        });
      }
    });

    return list.sort((a, b) => b.prediction.modelProbability - a.prediction.modelProbability);
  }, [fixtures, selectedMarketLine]);


  const activeOption = MARKET_OPTIONS.find(o => o.code === selectedMarketLine) || MARKET_OPTIONS[0];

  const optionFilterTabs: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All 10 option types' },
    { id: 'win', label: '1. Win' },
    { id: 'draw', label: '2. Draw' },
    { id: 'double_chance', label: '3. Double chance' },
    { id: 'over_under_goals', label: '4. Over/under' },
    { id: 'both_teams_to_score', label: '5. BTTS' },
    { id: 'corners', label: '6. Corners' },
    { id: 'bookings', label: '7. Bookings' },
    { id: 'highest_scoring_half', label: '8. Highest half' },
    { id: 'first_half_goals', label: '9. 1st half goals' },
    { id: 'second_half_result', label: '10. 2nd half result' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9]">
            Cross-match market explorer
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Compare model probability, pricing and edge for specific option lines across all European fixtures.
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
                  const firstMatch = MARKET_OPTIONS.find(o => o.optionType === tab.id);
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
                {opt.label}
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
              <span>Cross-match comparison:</span>
              <span className="text-[#b8e63a]">{activeOption.label}</span>
            </h2>
            <div className="text-[#8fa69a] text-[11px] mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-[#b8e63a]" />
                <span>Period: {activeOption.period}</span>
              </span>
              <span>·</span>
              <span>Ranked by modeled probability</span>
            </div>
          </div>
          <span className="font-mono text-[#8fa69a] text-[11px]">{comparisons.length} fixtures</span>
        </div>

        {comparisons.length > 0 ? (
          <div className="divide-y divide-white/[0.05]">
            {comparisons.map((item, idx) => {
              const p = item.prediction;
              const fix = item.fixture;
              const pct = p.modelProbability * 100;

              return (
                <div key={idx} className="p-3.5 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-[12px]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-[#8fa69a] w-5">#{idx + 1}</span>
                    <div className="flex items-center -space-x-1.5 shrink-0">
                      <TeamCrest
                        crestUrl={fix.homeTeam.crestUrl}
                        teamName={fix.homeTeam.shortName || fix.homeTeam.name}
                        size={24}
                      />
                      <TeamCrest
                        crestUrl={fix.awayTeam.crestUrl}
                        teamName={fix.awayTeam.shortName || fix.awayTeam.name}
                        size={24}
                      />
                    </div>
                    <div>
                      <div className="font-[500] text-[#e8efe9]">
                        {fix.homeTeam.shortName || fix.homeTeam.name} vs {fix.awayTeam.shortName || fix.awayTeam.name}
                      </div>
                      <div className="text-[11px] text-[#8fa69a] font-mono">
                        {fix.competition.name} · xG {item.homeXg.toFixed(2)} - {item.awayXg.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 ml-8 md:ml-0 font-mono text-[12px]">
                    {/* Probability Bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-white/[0.08] rounded-full h-1 overflow-hidden">
                        <div className="bg-[#b8e63a] h-full rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="font-[500] text-[#e8efe9] tabular-nums">
                        {pct.toFixed(1)}%
                      </span>
                    </div>

                    {/* Market Price / Mode */}
                    <div className="text-right min-w-[70px]">
                      {p.marketOdds ? (
                        <span className="text-[#e8efe9]">{p.marketOdds.toFixed(2)}</span>
                      ) : (
                        <span className="text-[10px] text-[#8fa69a]">n/a</span>
                      )}
                    </div>

                    {/* EV */}
                    <div className="text-right min-w-[65px]">
                      <span className={`font-[500] ${formatExpectedValue(p.expectedValue).colorClass}`}>
                        {formatExpectedValue(p.expectedValue).text}
                      </span>
                    </div>

                    {/* Action Link */}
                    <Link
                      href={`/matches/${item.fixtureId}`}
                      className="p-1 rounded-[6px] hover:bg-white/[0.05] text-[#b8e63a] transition-colors"
                      title="Audit Match"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-[12px] text-[#8fa69a] space-y-2">
            <div className="font-mono text-[13px] text-[#e8efe9]">
              {liveDataAvailable ? 'No upcoming fixtures available for this market line' : `Live data unavailable. Last updated ${lastUpdated}`}
            </div>
            <p className="max-w-sm mx-auto">
              {liveDataAvailable ? 'Select a different market or competition filter above.' : 'Cross-match market intelligence will populate once live provider data is refreshed.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
