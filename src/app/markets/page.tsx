'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { Sliders, CheckCircle2, ArrowUpRight, BarChart2, Layers, Clock } from 'lucide-react';
import { SupportedOptionType } from '@/types';
import { SUPPORTED_OPTIONS_CATALOGUE, getPeriodLabel } from '@/lib/prediction/marketCatalog';

const MARKET_OPTIONS: {
  code: string;
  label: string;
  optionType: SupportedOptionType;
  category: string;
  period: string;
}[] = [
  { code: '1X2_HOME', label: '1. Win: Home Victory (1)', optionType: 'win', category: 'match_result', period: 'Regular Time' },
  { code: '1X2_AWAY', label: '1. Win: Away Victory (2)', optionType: 'win', category: 'match_result', period: 'Regular Time' },
  { code: '1X2_DRAW', label: '2. Draw: Regular Time Draw', optionType: 'draw', category: 'match_result', period: 'Regular Time' },
  { code: 'DC_1X', label: '3. Double Chance: Home or Draw (1X)', optionType: 'double_chance', category: 'double_chance', period: 'Regular Time' },
  { code: 'DC_12', label: '3. Double Chance: Home or Away (No Draw)', optionType: 'double_chance', category: 'double_chance', period: 'Regular Time' },
  { code: 'TOTAL_GOALS_O25', label: '4. Over 2.5 Total Goals', optionType: 'over_under_goals', category: 'total_goals', period: 'Regular Time' },
  { code: 'TOTAL_GOALS_U25', label: '4. Under 2.5 Total Goals', optionType: 'over_under_goals', category: 'total_goals', period: 'Regular Time' },
  { code: 'TOTAL_GOALS_O20_PUSH', label: '4. Over 2.0 Goals (Push at 2)', optionType: 'over_under_goals', category: 'total_goals', period: 'Regular Time' },
  { code: 'BTTS_YES', label: '5. Both Teams to Score (Yes)', optionType: 'both_teams_to_score', category: 'btts', period: 'Regular Time' },
  { code: 'BTTS_NO', label: '5. Both Teams to Score (No)', optionType: 'both_teams_to_score', category: 'btts', period: 'Regular Time' },
  { code: 'TOTAL_CORNERS_O95', label: '6. Over 9.5 Total Corners', optionType: 'corners', category: 'total_corners', period: 'Regular Time' },
  { code: 'TEAM_CORNERS_HOME_O45', label: '6. Home Team Over 4.5 Corners', optionType: 'corners', category: 'team_corners', period: 'Regular Time' },
  { code: 'CARDS_O45', label: '7. Over 4.5 Bookings/Cards', optionType: 'bookings', category: 'bookings', period: 'Regular Time' },
  { code: 'HSH_2ND', label: '8. Highest Scoring Half: 2nd Half', optionType: 'highest_scoring_half', category: 'half_time', period: 'Full Time' },
  { code: 'FH_GOALS_O05', label: '9. 1st Half Over 0.5 Goals', optionType: 'first_half_goals', category: 'half_time', period: '1st Half' },
  { code: '2H_RESULT_HOME', label: '10. 2nd Half Result: Home Win', optionType: 'second_half_result', category: 'half_time', period: '2nd Half' },
];

export default function MarketExplorerPage() {
  const [selectedOptionType, setSelectedOptionType] = useState<string>('ALL');
  const [selectedMarketLine, setSelectedMarketLine] = useState<string>('TOTAL_GOALS_O25');

  const filteredOptions = useMemo(() => {
    if (selectedOptionType === 'ALL') return MARKET_OPTIONS;
    return MARKET_OPTIONS.filter(o => o.optionType === selectedOptionType);
  }, [selectedOptionType]);

  // Evaluate all upcoming fixtures for this specific market code
  const comparisons = useMemo(() => {
    const list: {
      fixtureId: string;
      fixture: any;
      prediction: any;
      homeXg: number;
      awayXg: number;
    }[] = [];

    FIXTURES.filter(f => f.status !== 'FINISHED').forEach(fixture => {
      const stats = FIXTURE_STATISTICS[fixture.id] || {
        homeXg: 1.5,
        awayXg: 1.2,
        expectedCornersHome: 5.5,
        expectedCornersAway: 4.5,
        expectedCards: 4.2,
        uncertaintyScore: 0.1,
        dataCoverageScore: 0.92,
        sampleSizeMatches: 20,
      };

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
  }, [selectedMarketLine]);

  const activeOption = MARKET_OPTIONS.find(o => o.code === selectedMarketLine) || MARKET_OPTIONS[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <Sliders className="w-6 h-6 text-brand-emerald" />
            <span>Cross-Match Supported Options Explorer</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Compare any of the 10 authorized option catalogue types across every upcoming European fixture to spot distribution anomalies.
          </p>
        </div>
      </div>

      {/* Filter by Option Type */}
      <div className="bg-surface-200 border border-border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase text-gray-400">
            <Layers className="w-4 h-4 text-brand-emerald" />
            <span>1. Select Option Type:</span>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">10 Launch Catalogue Types</span>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs pb-1 scrollbar-thin">
          {[
            { id: 'ALL', label: 'All Options' },
            { id: 'win', label: '1. Win' },
            { id: 'draw', label: '2. Draw' },
            { id: 'double_chance', label: '3. Double Chance' },
            { id: 'over_under_goals', label: '4. Over/Under Goals' },
            { id: 'both_teams_to_score', label: '5. BTTS' },
            { id: 'corners', label: '6. Corners' },
            { id: 'bookings', label: '7. Bookings' },
            { id: 'highest_scoring_half', label: '8. Highest Half' },
            { id: 'first_half_goals', label: '9. 1st Half Goals' },
            { id: 'second_half_result', label: '10. 2nd Half Result' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedOptionType(tab.id);
                // If current line not in new option type, switch to first matching
                if (tab.id !== 'ALL') {
                  const firstMatch = MARKET_OPTIONS.find(o => o.optionType === tab.id);
                  if (firstMatch) setSelectedMarketLine(firstMatch.code);
                }
              }}
              className={`px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                selectedOptionType === tab.id
                  ? 'bg-brand-emerald text-navy-950 font-bold'
                  : 'bg-surface-100 text-gray-400 hover:text-white border border-border-subtle'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Market Line Selector Pills */}
        <div className="pt-2 border-t border-border-subtle">
          <div className="text-[11px] font-mono text-gray-400 uppercase tracking-wider mb-2">
            2. Target Line Selection ({filteredOptions.length} available):
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filteredOptions.map(opt => (
              <button
                key={opt.code}
                onClick={() => setSelectedMarketLine(opt.code)}
                className={`px-3 py-1.5 rounded text-xs transition-colors font-medium ${
                  selectedMarketLine === opt.code
                    ? 'bg-brand-emerald text-navy-950 font-bold shadow-glow-emerald'
                    : 'bg-surface-100 hover:bg-surface-50 text-gray-300 border border-border'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparisons Grid / Table */}
      <div className="bg-surface-200 border border-border rounded overflow-hidden">
        <div className="p-4 bg-surface-100 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <h2 className="font-bold text-white text-sm flex items-center space-x-2">
              <span>Cross-European Comparison:</span>
              <span className="text-brand-emerald">{activeOption.label}</span>
            </h2>
            <div className="text-gray-400 text-xs mt-0.5 flex items-center space-x-2">
              <span className="flex items-center space-x-1 font-mono text-[11px] text-brand-accent">
                <Clock className="w-3 h-3" />
                <span>Period: {activeOption.period}</span>
              </span>
              <span>•</span>
              <span>Ranked from highest modeled probability to lowest</span>
            </div>
          </div>
          <span className="font-mono text-gray-400">{comparisons.length} Fixtures evaluated</span>
        </div>

        <div className="divide-y divide-border-subtle">
          {comparisons.map((item, idx) => {
            const p = item.prediction;
            const fix = item.fixture;
            const pct = p.modelProbability * 100;

            return (
              <div key={idx} className="p-4 hover:bg-surface-100 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-xs font-bold text-gray-500 w-5">#{idx + 1}</span>
                  <img src={fix.competition.emblemUrl} alt="" className="w-5 h-5 object-contain" />
                  <div>
                    <div className="font-bold text-sm text-white">
                      {fix.homeTeam.name} vs {fix.awayTeam.name}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono">
                      {fix.competition.name} • xG: {item.homeXg.toFixed(2)} - {item.awayXg.toFixed(2)} (Total: {(item.homeXg + item.awayXg).toFixed(2)})
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  {/* Probability meter */}
                  <div className="w-36 sm:w-48">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 text-[11px]">Model Probability</span>
                      <span className="font-mono font-bold text-brand-emerald">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-navy-900 rounded-full h-2 overflow-hidden">
                      <div className="bg-brand-emerald h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* Odds & Value */}
                  <div className="text-right font-mono text-xs w-28">
                    <div className="text-gray-300">
                      Odds: <span className="text-white font-bold">{p.marketOdds ? p.marketOdds.toFixed(2) : '—'}</span>
                    </div>
                    <div className={`text-[11px] font-semibold ${p.expectedValue && p.expectedValue > 0 ? 'text-brand-emerald' : 'text-gray-500'}`}>
                      {p.expectedValue ? `EV: +${(p.expectedValue * 100).toFixed(1)}%` : (p.isProbabilityBasedAnalysis ? 'Prob Analysis' : 'Sub-edge')}
                    </div>
                  </div>

                  {/* Action Link */}
                  <Link
                    href={`/matches/${fix.id}`}
                    className="px-3 py-1.5 rounded bg-surface-50 hover:bg-surface-100 border border-border text-xs text-white font-medium flex items-center space-x-1"
                  >
                    <span>Full Analysis</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-brand-emerald" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
