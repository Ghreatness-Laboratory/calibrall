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
  ShieldCheck,
  Clock
} from 'lucide-react';
import { SupportedOptionType, QualificationStatus, MarketPrediction } from '@/types';
import { SUPPORTED_OPTIONS_CATALOGUE, getPeriodLabel } from '@/lib/prediction/marketCatalog';

export default function PredictionsPage() {
  const [selectedComp, setSelectedComp] = useState<string>('ALL');
  const [selectedOptionType, setSelectedOptionType] = useState<string>('ALL');
  const [onlyValuePicks, setOnlyValuePicks] = useState<boolean>(false);
  const [minProb, setMinProb] = useState<number>(0.50);

  // Evaluate all upcoming fixtures
  const allPredictions = useMemo(() => {
    const list: {
      fixtureId: string;
      fixtureName: string;
      compCode: string;
      compName: string;
      kickoff: string;
      prediction: MarketPrediction;
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
      if (selectedOptionType !== 'ALL' && p.optionType !== selectedOptionType) return false;
      if (p.modelProbability < minProb) return false;
      if (onlyValuePicks && p.qualificationStatus !== 'QUALIFIED_VALUE') {
        return false;
      }
      return true;
    }).sort((a, b) => (b.prediction.expectedValue ?? (b.prediction.modelProbability * 0.1)) - (a.prediction.expectedValue ?? (a.prediction.modelProbability * 0.1)));
  }, [allPredictions, selectedComp, selectedOptionType, onlyValuePicks, minProb]);

  const optionFilterPills: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All 10 Option Types' },
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
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <CheckCircle2 className="w-6 h-6 text-brand-emerald" />
            <span>Today’s Market Intelligence & Supported Options</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Independently ranked statistical opportunities strictly from the 10 authorized catalogue option types.
          </p>
        </div>
      </div>

      {/* Critical Statistical Education Banner */}
      <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded flex items-start space-x-3 text-xs text-gray-300">
        <ShieldCheck className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-white">Analysis & Value Boundary:</strong> Selections with verified bookmaker pricing exceeding overround are classified as <strong className="text-brand-emerald">Qualified Value</strong>. Options with unpublished odds are provided as <strong className="text-brand-blue">Probability-Based Analyses</strong> only. The platform does not place wagers, offer staking advice, or provide outcome guarantees.
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

          {/* Option Type */}
          <div>
            <label className="block text-gray-400 mb-1 text-[11px] font-medium">Option Catalogue Filter</label>
            <select
              value={selectedOptionType}
              onChange={(e) => setSelectedOptionType(e.target.value)}
              className="w-full bg-surface-100 border border-border px-3 py-1.5 rounded text-white focus:outline-hidden focus:border-brand-emerald"
            >
              <option value="ALL">All 10 Option Types</option>
              {Object.entries(SUPPORTED_OPTIONS_CATALOGUE).map(([k, meta]) => (
                <option key={k} value={k}>{meta.title}</option>
              ))}
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
              min="0.30"
              max="0.80"
              step="0.05"
              value={minProb}
              onChange={(e) => setMinProb(parseFloat(e.target.value))}
              className="w-full accent-brand-emerald cursor-pointer"
            >
            </input>
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
              <span>Only Verified Value (EV &gt; 0)</span>
            </label>
          </div>
        </div>

        {/* Quick Option Type Pills */}
        <div className="pt-2 border-t border-border-subtle flex items-center space-x-1.5 overflow-x-auto text-[11px] pb-1 scrollbar-thin">
          <span className="text-gray-500 font-mono shrink-0 mr-1">Catalogue:</span>
          {optionFilterPills.map(pill => (
            <button
              key={pill.id}
              onClick={() => setSelectedOptionType(pill.id)}
              className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                selectedOptionType === pill.id
                  ? 'bg-brand-emerald text-navy-950 font-bold'
                  : 'bg-surface-100 border border-border-subtle text-gray-400 hover:text-white'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Predictions Table */}
      <div className="bg-surface-200 border border-border rounded overflow-hidden">
        <div className="p-3.5 bg-surface-100 border-b border-border flex items-center justify-between text-xs text-gray-400">
          <span className="font-mono">Displaying {filtered.length} analyzed options</span>
          <span className="italic">Ranking by Model Score & Expected Value</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0c1017] text-gray-400 font-mono text-[10px] uppercase border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Fixture</th>
                <th className="py-2.5 px-3">Option Type</th>
                <th className="py-2.5 px-3">Selection</th>
                <th className="py-2.5 px-3">Period</th>
                <th className="py-2.5 px-3">Model Prob</th>
                <th className="py-2.5 px-3">Price Mode</th>
                <th className="py-2.5 px-3">Edge</th>
                <th className="py-2.5 px-3">Est. EV</th>
                <th className="py-2.5 px-3">Evidence Tier</th>
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
                    <td className="py-3 px-3 text-gray-300">
                      <span className="font-mono text-[11px] text-brand-accent">
                        {p.optionType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-white">
                      <div className="flex items-center space-x-1.5">
                        <span>{p.selection}</span>
                        {isTop && (
                          <span className="text-[9px] bg-brand-emerald/20 text-brand-emerald px-1 rounded font-mono uppercase">Top Pick</span>
                        )}
                        {p.pushProbability !== undefined && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-mono">Push Rule</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-400 font-mono text-[11px]">
                      {getPeriodLabel(p.period)}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-white tabular-nums">
                      {(p.modelProbability * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">
                      {p.marketOdds ? (
                        <span className="bg-surface-100 px-1.5 py-0.5 rounded border border-border text-gray-200">
                          {p.marketOdds.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                          Probability Analysis
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-brand-blue tabular-nums">
                      {p.edge ? `+${(p.edge * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold tabular-nums">
                      {p.expectedValue !== undefined ? (
                        <span className={(p.expectedValue ?? 0) > 0 ? 'text-brand-emerald' : 'text-gray-500'}>
                          +{(p.expectedValue * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-500 font-normal italic text-[11px]">No Odds</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-medium text-gray-300 bg-surface-100 border border-border px-1.5 py-0.5 rounded">
                        {p.evidenceTier}
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
