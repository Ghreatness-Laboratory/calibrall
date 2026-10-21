'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { MarketPrediction, SupportedOptionType, MarketPeriod, Team } from '@/types';
import TeamCrest from '@/components/TeamCrest';
import { 
  CheckCircle2, 
  ArrowUpRight, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';
import { 
  formatExpectedValue, 
  formatOdds, 
  formatSelectionName, 
  getOptionTypeLabel, 
  getPeriodLabel 
} from '@/lib/prediction/marketCatalog';

export default function PredictionsPage() {
  const [selectedComp, setSelectedComp] = useState<string>('ALL');
  const [selectedOptionType, setSelectedOptionType] = useState<string>('ALL');
  const [onlyValuePicks, setOnlyValuePicks] = useState<boolean>(false);
  const [minProb, setMinProb] = useState<number>(0.50);

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(selectedComp);

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
      prediction: MarketPrediction;
    }[] = [];

    fixtures.forEach(fixture => {
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

      evalResult.predictions.forEach(p => {
        list.push({
          fixtureId: fixture.id,
          fixtureName: `${fixture.homeTeam.shortName || fixture.homeTeam.name} vs ${fixture.awayTeam.shortName || fixture.awayTeam.name}`,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          compCode: fixture.competition.code,
          compName: fixture.competition.name,
          kickoff: fixture.kickoffTime,
          prediction: p,
        });
      });
    });

    return list;
  }, [fixtures]);


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
    { id: 'ALL', label: 'All 10 option types' },
    { id: 'win', label: '1. Win' },
    { id: 'draw', label: '2. Draw' },
    { id: 'double_chance', label: '3. Double chance' },
    { id: 'over_under_goals', label: '4. Over/under goals' },
    { id: 'both_teams_to_score', label: '5. BTTS' },
    { id: 'corners', label: '6. Corners' },
    { id: 'bookings', label: '7. Bookings' },
    { id: 'highest_scoring_half', label: '8. Highest half' },
    { id: 'first_half_goals', label: '9. 1st half goals' },
    { id: 'second_half_result', label: '10. 2nd half result' },
  ];

  const getPeriodLabel = (period: MarketPeriod) => {
    switch (period) {
      case 'FIRST_HALF':
        return '1st Half';
      case 'SECOND_HALF':
        return '2nd Half';
      case 'REGULAR_TIME':
      default:
        return 'Regular Time';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <span>Market intelligence & supported options</span>
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Independently ranked statistical opportunities strictly from the 10 authorized catalog option types.
          </p>
        </div>
      </div>

      {/* Analysis Boundary Banner */}
      <div className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[10px] flex items-start gap-2.5 text-[12px] text-[#8fa69a]">
        <ShieldCheck className="w-4 h-4 text-[#b8e63a] shrink-0 mt-0.5" />
        <p className="leading-normal">
          <span className="text-[#e8efe9] font-[500]">Analysis & value boundary:</span> Selections with verified bookmaker pricing exceeding overround are classified as <span className="text-[#b8e63a] font-[500]">Qualified value</span>. Options without live verified odds are presented as <span className="text-[#e8efe9] font-[500]">Probability-based analysis</span>.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[12px]">
          {/* Competition */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Competition</label>
            <select
              value={selectedComp}
              onChange={(e) => setSelectedComp(e.target.value)}
              className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a]"
            >
              <option value="ALL">All competitions</option>
              {COMPETITIONS.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Option Type */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Option catalogue</label>
            <select
              value={selectedOptionType}
              onChange={(e) => setSelectedOptionType(e.target.value)}
              className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a]"
            >
              {optionFilterPills.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Min Probability */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-[#8fa69a] font-[500]">Min probability</span>
              <span className="font-mono text-[#b8e63a]">{(minProb * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.80"
              step="0.05"
              value={minProb}
              onChange={(e) => setMinProb(parseFloat(e.target.value))}
              className="w-full accent-[#b8e63a] cursor-pointer"
            />
          </div>

          {/* Only Value Toggle */}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[#e8efe9]">
              <input
                type="checkbox"
                checked={onlyValuePicks}
                onChange={(e) => setOnlyValuePicks(e.target.checked)}
                className="rounded bg-[#0a1812] border-white/20 text-[#b8e63a] focus:ring-0 w-3.5 h-3.5"
              />
              <span>Only verified value (EV &gt; 0)</span>
            </label>
          </div>
        </div>

        {/* Quick Option Type Pills */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
          <span className="text-[#8fa69a] font-mono shrink-0 mr-1">Catalog:</span>
          {optionFilterPills.map(pill => (
            <button
              key={pill.id}
              onClick={() => setSelectedOptionType(pill.id)}
              type="button"
              className={`px-2 py-0.5 rounded-[4px] whitespace-nowrap transition-colors ${
                selectedOptionType === pill.id
                  ? 'bg-[#b8e63a] text-[#0a1812] font-[500]'
                  : 'bg-[#0a1812] border border-white/[0.06] text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Predictions Table */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[#0a1812]/50 border-b border-white/[0.08] flex items-center justify-between text-[11px] text-[#8fa69a]">
          <span className="font-mono">Displaying {filtered.length} analyzed options</span>
          <span>Ranked by expected value & probability</span>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] font-mono text-[10px] uppercase border-b border-white/[0.06]">
                <tr>
                  <th className="py-2 px-3">Fixture</th>
                  <th className="py-2 px-3">Option type</th>
                  <th className="py-2 px-3">Selection</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Prob</th>
                  <th className="py-2 px-3">Price mode</th>
                  <th className="py-2 px-3">Edge</th>
                  <th className="py-2 px-3">Est. EV</th>
                  <th className="py-2 px-3 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((item, idx) => {
                  const p = item.prediction;
                  const isTop = p.isTopPick;

                  return (
                    <tr key={idx} className={`hover:bg-white/[0.02] transition-colors ${isTop ? 'bg-[#b8e63a]/[0.03]' : ''}`}>
                      <td className="py-2.5 px-3 text-[#e8efe9]">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <TeamCrest
                              crestUrl={item.homeTeam.crestUrl}
                              teamName={item.homeTeam.shortName || item.homeTeam.name}
                              size={20}
                            />
                            <TeamCrest
                              crestUrl={item.awayTeam.crestUrl}
                              teamName={item.awayTeam.shortName || item.awayTeam.name}
                              size={20}
                            />
                          </div>
                          <span className="font-[500] truncate max-w-[150px] sm:max-w-none">{item.fixtureName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#8fa69a]">
                        <span className="text-[12px] text-[#e8efe9]">
                          {getOptionTypeLabel(p.optionType)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">
                        <div className="flex items-center gap-1.5">
                          <span>{formatSelectionName(p.selection)}</span>
                          {isTop && (
                            <span className="text-[9px] bg-[#b8e63a]/20 text-[#b8e63a] px-1 rounded-[3px] font-mono">
                              Top pick
                            </span>
                          )}
                          {p.pushProbability !== undefined && (
                            <span className="text-[9px] bg-white/10 text-[#8fa69a] px-1 rounded-[3px] font-mono">
                              Push rule
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#8fa69a] text-[12px]">
                        {getPeriodLabel(p.period)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums font-[500]">
                        {(p.modelProbability * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[12px]">
                        {p.marketOdds ? (
                          <span className="bg-[#0a1812] px-1.5 py-0.5 rounded-[4px] border border-white/[0.08] text-[#e8efe9] tabular-nums">
                            {p.marketOdds.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#8fa69a] bg-[#0a1812] px-1.5 py-0.5 rounded-[4px] border border-white/[0.06]">
                            Probability analysis
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#8fa69a] tabular-nums">
                        {p.edge ? `+${(p.edge * 100).toFixed(1)}%` : 'n/a'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {p.expectedValue !== undefined ? (
                          <span className={`font-[500] ${formatExpectedValue(p.expectedValue).colorClass}`}>
                            {formatExpectedValue(p.expectedValue).text}
                          </span>
                        ) : (
                          <span className="text-[#8fa69a] text-[12px]">n/a</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/matches/${item.fixtureId}`}
                          className="inline-flex items-center gap-0.5 text-[11px] text-[#b8e63a] hover:underline font-[500]"
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
        ) : (
          <div className="p-12 text-center text-[12px] text-[#8fa69a] space-y-2">
            <div className="font-mono text-[13px] text-[#e8efe9]">
              {liveDataAvailable ? 'No predictions match your selected filters' : `Live data unavailable. Last updated ${lastUpdated}`}
            </div>
            <p className="max-w-sm mx-auto">
              {liveDataAvailable ? 'Try adjusting the minimum probability threshold or selecting all option types.' : 'Live market intelligence will populate once live provider data is refreshed.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
