'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { COMPETITIONS, FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { 
  CheckCircle2, 
  TrendingUp, 
  Filter, 
  ArrowUpRight, 
  AlertCircle, 
  Layers,
  Sliders,
  ShieldCheck
} from 'lucide-react';
import { MarketCategory, QualificationStatus } from '@/types';

export default function PredictionsPage() {
  const [selectedComp, setSelectedComp] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [onlyValuePicks, setOnlyValuePicks] = useState<boolean>(true);
  const [minProb, setMinProb] = useState<number>(0.55);

  // Evaluate all upcoming fixtures
  const allPredictions = useMemo(() => {
    const list: {
      fixtureId: string;
      fixtureName: string;
      compCode: string;
      compName: string;
      kickoff: string;
      prediction: any;
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
        verifiedOdds: stats.verifiedOdds,
      });

      evalResult.predictions.forEach(p => {
        list.push({
          fixtureId: fixture.id,
          fixtureName: `${fixture.homeTeam.shortName} vs ${fixture.awayTeam.shortName}`,
          compCode: fixture.competition.code,
          compName: fixture.competition.name,
          kickoff: fixture.kickoffTime,
          prediction: p,
        });
      });
    });

    return list;
  }, []);

  const filtered = useMemo(() => {
    return allPredictions.filter(item => {
      const p = item.prediction;
      if (selectedComp !== 'ALL' && item.compCode !== selectedComp) return false;
      if (selectedCategory !== 'ALL' && p.marketCategory !== selectedCategory) return false;
      if (p.modelProbability < minProb) return false;
      if (onlyValuePicks && p.qualificationStatus !== 'QUALIFIED_VALUE' && p.qualificationStatus !== 'QUALIFIED_PROBABILITY') {
        return false;
      }
      return true;
    }).sort((a, b) => (b.prediction.expectedValue ?? 0) - (a.prediction.expectedValue ?? 0));
  }, [allPredictions, selectedComp, selectedCategory, onlyValuePicks, minProb]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <CheckCircle2 className="w-6 h-6 text-brand-emerald" />
            <span>Today’s Market Intelligence & Qualified Predictions</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Independently ranked statistical opportunities. Filter by market type, minimum edge, and model confidence.
          </p>
        </div>
      </div>

      {/* Critical Statistical Education Banner */}
      <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded flex items-start space-x-3 text-xs text-gray-300">
        <ShieldCheck className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-white">The Expected Value Principle:</strong> A high probability (e.g. 80%) alone does not make a bet advantageous if the bookmaker price demands 85%. Only selections with statistical advantage exceeding bookmaker overround are classified as <strong className="text-brand-emerald">Qualified Value</strong>.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-200 border border-border rounded p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {/* Competition */}
          <div>
            <label className="block text-gray-400 mb-1 text-[11px] font-medium">Competition</label>
            <select
              value={selectedComp}
              onChange={(e) => setSelectedComp(e.target.value)}
              className="w-full bg-surface-100 border border-border px-3 py-1.5 rounded text-white focus:outline-hidden focus:border-brand-emerald"
            >
              <option value="ALL">All Competitions</option>
              {COMPETITIONS.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Market Category */}
          <div>
            <label className="block text-gray-400 mb-1 text-[11px] font-medium">Market Focus</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-surface-100 border border-border px-3 py-1.5 rounded text-white focus:outline-hidden focus:border-brand-emerald"
            >
              <option value="ALL">All Market Types</option>
              <option value="total_goals">Total Goals (Over/Under)</option>
              <option value="btts">Both Teams to Score (BTTS)</option>
              <option value="total_corners">Total Corners</option>
              <option value="match_result">1X2 Match Result</option>
              <option value="bookings">Disciplinary Bookings</option>
            </select>
          </div>

          {/* Min Probability */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-gray-400 font-medium">Min Model Probability</span>
              <span className="font-mono text-brand-emerald font-bold">{(minProb * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.45"
              max="0.80"
              step="0.05"
              value={minProb}
              onChange={(e) => setMinProb(parseFloat(e.target.value))}
              className="w-full accent-brand-emerald cursor-pointer"
            />
          </div>

          {/* Only Value Toggle */}
          <div className="flex items-end pb-1">
            <label className="flex items-center space-x-2 cursor-pointer text-xs text-gray-300">
              <input
                type="checkbox"
                checked={onlyValuePicks}
                onChange={(e) => setOnlyValuePicks(e.target.checked)}
                className="rounded bg-surface-100 border-border text-brand-emerald focus:ring-0 w-4 h-4"
              />
              <span>Only Qualified Value & Edge</span>
            </label>
          </div>
        </div>
      </div>

      {/* Predictions Table */}
      <div className="bg-surface-200 border border-border rounded overflow-hidden">
        <div className="p-3.5 bg-surface-100 border-b border-border flex items-center justify-between text-xs text-gray-400">
          <span className="font-mono">Displaying {filtered.length} qualified opportunities</span>
          <span className="italic">Sorted by Expected Value</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0c1017] text-gray-400 font-mono text-[10px] uppercase border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Fixture</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Selection</th>
                <th className="py-2.5 px-3">Model Prob</th>
                <th className="py-2.5 px-3">Odds</th>
                <th className="py-2.5 px-3">Edge</th>
                <th className="py-2.5 px-3">Est. EV</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((item, idx) => {
                const p = item.prediction;
                const isTop = p.isTopPick;

                return (
                  <tr key={idx} className={`hover:bg-surface-50 transition-colors ${isTop ? 'bg-brand-emerald/5' : ''}`}>
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] font-mono text-gray-400 bg-surface-100 px-1 rounded">{item.compCode}</span>
                        <span>{item.fixtureName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-400 capitalize">{p.marketCategory.replace('_', ' ')}</td>
                    <td className="py-3 px-3 font-medium text-white flex items-center space-x-1">
                      <span>{p.selection}</span>
                      {isTop && (
                        <span className="text-[9px] bg-brand-emerald/20 text-brand-emerald px-1 rounded font-mono uppercase">Top Pick</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-white tabular-nums">
                      {(p.modelProbability * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 font-mono text-gray-200">
                      {p.marketOdds ? p.marketOdds.toFixed(2) : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-brand-blue tabular-nums">
                      {p.edge ? `+${(p.edge * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-brand-emerald tabular-nums">
                      {p.expectedValue ? `+${(p.expectedValue * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-100 border border-border text-gray-300">
                        {p.modelConfidence}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-medium text-brand-emerald bg-emerald-500/10 border border-brand-emerald/30 px-1.5 py-0.5 rounded">
                        {p.qualificationStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <Link
                        href={`/matches/${item.fixtureId}`}
                        className="text-brand-emerald hover:underline font-semibold flex items-center space-x-0.5"
                      >
                        <span>Audit</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
