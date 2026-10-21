'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { Sliders, CheckCircle2, ArrowUpRight, BarChart2 } from 'lucide-react';

export default function MarketExplorerPage() {
  const [selectedMarketLine, setSelectedMarketLine] = useState<string>('TOTAL_GOALS_O25');

  const marketOptions = [
    { code: 'TOTAL_GOALS_O25', label: 'Over 2.5 Total Goals', category: 'total_goals' },
    { code: 'TOTAL_GOALS_U25', label: 'Under 2.5 Total Goals', category: 'total_goals' },
    { code: 'BTTS_YES', label: 'Both Teams to Score (Yes)', category: 'btts' },
    { code: 'BTTS_NO', label: 'Both Teams to Score (No)', category: 'btts' },
    { code: 'TOTAL_CORNERS_O95', label: 'Over 9.5 Corners', category: 'total_corners' },
    { code: 'CARDS_O45', label: 'Over 4.5 Bookings/Cards', category: 'bookings' },
    { code: '1X2_HOME', label: 'Home Team Win (1)', category: 'match_result' },
  ];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <Sliders className="w-6 h-6 text-brand-emerald" />
            <span>Cross-Match Market Explorer</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Compare a single statistical market line across every upcoming European fixture to spot distribution anomalies.
          </p>
        </div>
      </div>

      {/* Market Line Selector Pills */}
      <div className="bg-surface-200 border border-border rounded p-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider mr-2">Target Line:</span>
        {marketOptions.map(opt => (
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

      {/* Comparisons Grid / Table */}
      <div className="bg-surface-200 border border-border rounded overflow-hidden">
        <div className="p-4 bg-surface-100 border-b border-border flex items-center justify-between text-xs">
          <div>
            <h2 className="font-bold text-white text-sm">
              Cross-European Comparison for: <span className="text-brand-emerald">{marketOptions.find(o => o.code === selectedMarketLine)?.label}</span>
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">Ranked from highest modeled probability to lowest</p>
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
                  <div className="text-right font-mono text-xs w-24">
                    <div className="text-gray-300">
                      Odds: <span className="text-white font-bold">{p.marketOdds ? p.marketOdds.toFixed(2) : '—'}</span>
                    </div>
                    <div className={`text-[11px] font-semibold ${p.expectedValue && p.expectedValue > 0 ? 'text-brand-emerald' : 'text-gray-500'}`}>
                      {p.expectedValue ? `EV: +${(p.expectedValue * 100).toFixed(1)}%` : 'No verified odds'}
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
