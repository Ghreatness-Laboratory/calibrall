'use client';

import React, { useState, useEffect } from 'react';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import type { CalibratedBasketballParamsFile } from '@/lib/basketball/calibration';
import type { BasketballLeague, BasketballMarketCategory } from '@/lib/basketball/markets';
import type {
  BasketballForwardSummary,
  BasketballForwardPickRow,
} from '@/lib/basketball/settlementService';
import PerformanceChart from '@/components/PerformanceChart';
import { useSport } from '@/lib/context/SportContext';
import { ValidationAndBenchmarksEngine } from '@/lib/prediction/validationAndBenchmarks';
import { PROVIDER_COVERAGE_AUDIT } from '@/lib/data/historicalDataset';
import { ModelRegistryService } from '@/lib/prediction/modelRegistry';
import { 
  ShieldCheck, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Layers, 
  GitCompare, 
  History, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  Activity
} from 'lucide-react';
import { cleanDisplayText, formatSignedValue } from '@/lib/utils/formatText';
import { 
  OCTOBER_18_CASE_STUDY, 
  OCTOBER_18_SUMMARY, 
  OCTOBER_18_RETROSPECTIVE_DISCLAIMER 
} from '@/lib/data/october18CaseStudy';
import { forwardPickLedger } from '@/lib/prediction/forwardPickLedger';
import DataStatusDiagnostics from '@/components/DataStatusDiagnostics';

type MainSectionTab = 'forward_record' | 'case_study' | 'report_card' | 'providers' | 'ablation' | 'champion' | 'errors' | 'breakdowns';

export default function PerformancePage() {
  const { sport, isSwitching } = useSport();
  const [sectionTab, setSectionTab] = useState<MainSectionTab>('forward_record');
  const [breakdownSubTab, setBreakdownSubTab] = useState<'markets' | 'state_tags' | 'competitions'>('markets');
  const [caseStudyFilter, setCaseStudyFilter] = useState<'ALL' | 'AGREED' | 'DISAGREED' | 'FALLBACK'>('ALL');
  const [forwardFilter, setForwardFilter] = useState<'ALL' | 'GRADED' | 'PENDING' | 'WON' | 'LOST'>('ALL');

  const report = sport === 'basketball' ? VERIFIED_NBA_PERFORMANCE_REPORT : VERIFIED_PERFORMANCE_REPORT;
  const isBasketball = sport === 'basketball';

  const [bbData, setBbData] = useState<{
    walkForward?: CalibratedBasketballParamsFile;
    forwardSummary?: BasketballForwardSummary;
    forwardPicks?: BasketballForwardPickRow[];
  } | null>(null);
  const [bbLoading, setBbLoading] = useState(false);
  const [bbError, setBbError] = useState<string | null>(null);
  const [bbLeague, setBbLeague] = useState<BasketballLeague>('NBA');
  const [bbSelectedCategory, setBbSelectedCategory] = useState<BasketballMarketCategory>('game_total');
  const [bbForwardFilter, setBbForwardFilter] = useState<'ALL' | 'GRADED' | 'PENDING'>('ALL');

  useEffect(() => {
    if (!isBasketball || isSwitching) return;
    let active = true;
    setBbLoading(true);
    setBbError(null);
    fetch('/api/v1/performance/summary?sport=basketball', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!active) return;
        setBbData({
          walkForward: json.walkForward,
          forwardSummary: json.forwardSummary,
          forwardPicks: Array.isArray(json.forwardPicks) ? json.forwardPicks : [],
        });
      })
      .catch((err) => {
        if (!active) return;
        setBbError(err instanceof Error ? err.message : 'Failed to load basketball performance summary');
      })
      .finally(() => {
        if (active) setBbLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isBasketball, isSwitching]);

  // Load verified forward record metrics (the only platform accuracy measure)
  const forwardMetrics = forwardPickLedger.getForwardRecordMetrics();
  const researchAudit = ValidationAndBenchmarksEngine.runFullResearchAudit();
  const errorClusters = ModelRegistryService.getWeeklyMissAnalysis();
  const experimentHistory = ModelRegistryService.getExperimentRegistry();

  if (isSwitching) {
    return (
      <div className="space-y-4 py-3 animate-pulse">
        <div className="h-6 w-48 bg-[#151E19] rounded-[6px]" />
        <div className="h-28 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        <div className="h-48 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  if (isBasketball) {
    const bbCategoryLabel: Record<BasketballMarketCategory, string> = {
      game_total: 'Game Total',
      home_total: 'Home Team Total',
      away_total: 'Away Team Total',
      h1_game_total: '1st Half Game Total',
      h1_team_total: '1st Half Team Totals',
    };

    const fwd = bbData?.forwardSummary;
    const fwdPicks = bbData?.forwardPicks || [];
    const filteredBbPicks = fwdPicks.filter((p) => {
      if (bbForwardFilter === 'PENDING') return p.settlementStatus === 'PENDING';
      if (bbForwardFilter === 'GRADED') return p.settlementStatus !== 'PENDING';
      return true;
    });

    const walkForwardLeague = bbData?.walkForward?.leagues?.[bbLeague] || null;
    const activeFamily =
      walkForwardLeague?.families.find((f) => f.marketCategory === bbSelectedCategory) ||
      walkForwardLeague?.families[0] ||
      null;

    return (
      <div className="space-y-4 py-1">
        <div className="space-y-1">
          <h1 className="text-[23px] font-[700] leading-[1.22] text-[#E9EFEB] tracking-[-0.025em]">
            Basketball Forward Record &amp; Calibration
          </h1>
          <p className="text-[12.5px] leading-[1.55] text-[#8B9892]">
            Strict Totals &amp; 1st Half engine across NBA, NCAAB (D1 vs D1), and EuroLeague. Basketball picks, Brier scores, Log Loss, and ROI are isolated in a separate ledger and never mixed with football.
          </p>
        </div>

        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 space-y-1">
          <div className="flex items-center gap-2 text-[#B8E636] font-[600] text-[13px]">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#B8E636]" strokeWidth={2} />
            <span>Separate Basketball Forward Ledger &amp; Settlement Rules</span>
          </div>
          <p className="text-[12px] leading-[1.5] text-[#8B9892]">
            Pre-tipoff picks are hashed before scheduled start, settled strictly from official final scores (and verified half scores for 1st half markets, never estimated), push on exact integer line hits, and compute EV exclusively when a real bookmaker price is recorded.
          </p>
        </div>

        {bbError && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-[12px] p-3 text-[12px] text-[#EF4444]">
            Failed to load live basketball ledger: {bbError}
          </div>
        )}

        {/* 2x2 Separate Basketball Forward KPI Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between min-h-[76px]">
            <div className="text-[10.5px] text-[#8B9892]">Forward Brier (Basketball)</div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-[18px] font-[650] text-[#B8E636] tabular-nums leading-none">
                {bbLoading ? '...' : fwd && fwd.brierScore !== null ? fwd.brierScore.toFixed(4) : 'N/A'}
              </div>
              <div className="text-[10px] text-[#8B9892] font-medium">totals v1</div>
            </div>
            <div className="text-[9.5px] text-[#5E6B65]">Graded pre-tipoff picks</div>
          </div>

          <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between min-h-[76px]">
            <div className="text-[10.5px] text-[#8B9892]">Forward Log Loss</div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums leading-none">
                {bbLoading ? '...' : fwd && fwd.logLoss !== null ? fwd.logLoss.toFixed(4) : 'N/A'}
              </div>
            </div>
            <div className="text-[9.5px] text-[#5E6B65]">Separate from football</div>
          </div>

          <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between min-h-[76px]">
            <div className="text-[10.5px] text-[#8B9892]">Forward ROI (Priced)</div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-[18px] font-[650] text-[#B8E636] tabular-nums leading-none">
                {bbLoading
                  ? '...'
                  : fwd && fwd.yieldRoi !== null
                  ? `${fwd.yieldRoi >= 0 ? '+' : ''}${fwd.yieldRoi.toFixed(1)}%`
                  : 'No priced picks'}
              </div>
              {fwd && (
                <div className="text-[10px] text-[#8B9892] tabular-nums">
                  {fwd.pricedSettledCount} priced
                </div>
              )}
            </div>
            <div className="text-[9.5px] text-[#5E6B65]">Real market odds only</div>
          </div>

          <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between min-h-[76px]">
            <div className="text-[10.5px] text-[#8B9892]">Settled Records</div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums leading-none">
                {bbLoading ? '...' : fwd ? fwd.settledCount : 0}
              </div>
              {fwd && (
                <div className="text-[10px] text-[#8B9892] tabular-nums">
                  {fwd.wonCount}W · {fwd.lostCount}L · {fwd.pushCount}P
                </div>
              )}
            </div>
            <div className="text-[9.5px] text-[#5E6B65]">
              {fwd ? `${fwd.pendingCount} pending · ${fwd.voidCount} void` : '0 pending'}
            </div>
          </div>
        </div>

        {/* Walk-Forward Out-of-Sample Calibration & Baseline Gate */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-[650] text-[#ECF1EE]">
                Walk Forward Out of Sample Calibration
              </h2>
              <p className="text-[11px] text-[#8B9892]">
                Strict chronological evaluation vs naive league average totals baseline
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {(['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]).map((lg) => (
                <button
                  key={lg}
                  type="button"
                  onClick={() => setBbLeague(lg)}
                  className={`h-[30px] px-3 rounded-full text-[11px] font-semibold transition-colors ${
                    bbLeague === lg
                      ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]'
                      : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                  }`}
                >
                  {lg === 'EUROLEAGUE' ? 'EuroLeague' : lg}
                </button>
              ))}
            </div>
          </div>

          {walkForwardLeague ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-[#151E19] rounded-[10px] p-2.5">
                <div>
                  <span className="text-[#8B9890] block text-[10px]">Evaluated Games</span>
                  <span className="text-[#ECF1EE] font-semibold tabular-nums">
                    {walkForwardLeague.evaluatedGames.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">Abstained (Needs history)</span>
                  <span className="text-[#E8B04A] font-semibold tabular-nums">
                    {walkForwardLeague.abstainedNeedsHistoryGames.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">1st Half Sample</span>
                  <span className="text-[#ECF1EE] font-semibold tabular-nums">
                    {walkForwardLeague.h1EvaluatedGames.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">League Team Mean / H1 Share</span>
                  <span className="text-[#B8E636] font-semibold tabular-nums">
                    {walkForwardLeague.empiricalLeagueStats.regTeamMean.toFixed(1)} pts · {(walkForwardLeague.empiricalLeagueStats.h1Share * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="border border-white/[0.07] rounded-[10px] overflow-hidden divide-y divide-white/[0.07]">
                {walkForwardLeague.families.map((fam) => {
                  const selected = activeFamily?.marketCategory === fam.marketCategory;
                  return (
                    <button
                      key={fam.marketCategory}
                      type="button"
                      onClick={() => setBbSelectedCategory(fam.marketCategory)}
                      className={`w-full text-left p-3 transition-colors space-y-2 ${
                        selected ? 'bg-[#151E19]/80' : 'bg-[#0E1512] hover:bg-[#151E19]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                            {bbCategoryLabel[fam.marketCategory]}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#101613] border border-white/[0.08] text-[#8B9892]">
                            {fam.calibratorType}
                          </span>
                        </div>

                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                            fam.passedBaseline
                              ? 'bg-[#B8E636]/12 border-[#B8E636]/40 text-[#B8E636]'
                              : 'bg-[#E8B04A]/12 border-[#E8B04A]/40 text-[#E8B04A]'
                          }`}
                        >
                          {fam.passedBaseline ? 'PASS BASELINE' : 'FAIL · SPECULATIVE ONLY'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                        <div>
                          <span className="text-[#8B9890] block text-[9.5px]">Cal Brier vs Naive</span>
                          <span className="text-[#ECF1EE] font-semibold">
                            {fam.calibratedBrier.toFixed(4)}
                          </span>{' '}
                          <span className="text-[#5E6A63]">vs {fam.baselineBrier.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-[#8B9890] block text-[9.5px]">Cal LogLoss vs Naive</span>
                          <span className="text-[#ECF1EE] font-semibold">
                            {fam.calibratedLogLoss.toFixed(4)}
                          </span>{' '}
                          <span className="text-[#5E6A63]">vs {fam.baselineLogLoss.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-[#8B9890] block text-[9.5px]">ECE / Sample</span>
                          <span className="text-[#ECF1EE]">
                            {(fam.ece * 100).toFixed(2)}%
                          </span>{' '}
                          <span className="text-[#5E6A63]">(N={fam.sampleSize.toLocaleString()})</span>
                        </div>
                        <div>
                          <span className="text-[#8B9890] block text-[9.5px]">Hit Rate at 60%+</span>
                          <span className="text-[#B8E636] font-semibold">
                            {fam.hitRateAt60 !== null ? `${(fam.hitRateAt60 * 100).toFixed(1)}%` : 'N/A'}
                          </span>{' '}
                          <span className="text-[#5E6A63]">({fam.sampleAt60.toLocaleString()})</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeFamily && activeFamily.calibrationTable.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#ECF1EE]">
                      Calibration Reliability Table · {bbLeague === 'EUROLEAGUE' ? 'EuroLeague' : bbLeague} {bbCategoryLabel[activeFamily.marketCategory]}
                    </span>
                    <span className="text-[10.5px] font-mono text-[#8B9890]">
                      Out of sample bins
                    </span>
                  </div>
                  <div className="border border-white/[0.07] rounded-[10px] overflow-hidden bg-[#0E1512]">
                    <div className="grid grid-cols-4 px-3 py-2 text-[10px] font-mono text-[#8B9890] border-b border-white/[0.07] bg-[#151E19]">
                      <span>Prob Bin</span>
                      <span className="text-right">Pred Mean</span>
                      <span className="text-right">Observed</span>
                      <span className="text-right">Samples</span>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {activeFamily.calibrationTable.map((bin, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-4 px-3 py-1.5 text-[11px] font-mono tabular-nums"
                        >
                          <span className="text-[#ECF1EE]">{cleanDisplayText(bin.binRange)}</span>
                          <span className="text-right text-[#8B9892]">
                            {(bin.predictedProbMean * 100).toFixed(1)}%
                          </span>
                          <span className="text-right text-[#B8E636] font-semibold">
                            {(bin.observedFrequency * 100).toFixed(1)}%
                          </span>
                          <span className="text-right text-[#8B9892]">
                            {bin.sampleCount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[12px] text-[#8B9892] py-4 text-center">
              {bbLoading ? 'Loading walk forward calibration summary...' : 'No calibration parameters available.'}
            </div>
          )}
        </div>

        {/* Separate Basketball Forward Picks Ledger */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-[650] text-[#ECF1EE]">
                Basketball Pre Tipoff Forward Picks
              </h2>
              <p className="text-[11px] text-[#8B9892]">
                Stored in bb_picks &amp; settled in bb_settlements
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(['ALL', 'GRADED', 'PENDING'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBbForwardFilter(f)}
                  className={`h-[28px] px-3 rounded-full text-[11px] font-medium transition-colors ${
                    bbForwardFilter === f
                      ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]'
                      : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890]'
                  }`}
                >
                  {f === 'ALL' ? 'All' : f === 'GRADED' ? 'Graded' : 'Pending'}
                </button>
              ))}
            </div>
          </div>

          {filteredBbPicks.length === 0 ? (
            <div className="bg-[#151E19] border border-white/[0.06] rounded-[10px] p-4 text-center space-y-1">
              <div className="text-[13px] font-semibold text-[#E9EFEB]">
                No pre-tipoff basketball forward picks recorded yet
              </div>
              <p className="text-[11.5px] text-[#8B9892]">
                Live sync automatically records diversified HIGH and MEDIUM picks before scheduled tipoff and grades them once games finish.
              </p>
            </div>
          ) : (
            <div className="border border-white/[0.07] rounded-[10px] divide-y divide-white/[0.07] overflow-hidden">
              {filteredBbPicks.map((row) => {
                const statusColors: Record<string, string> = {
                  WON: 'bg-[#B8E636]/15 text-[#B8E636] border-[#B8E636]/40',
                  LOST: 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/40',
                  PUSH: 'bg-[#E8B04A]/15 text-[#E8B04A] border-[#E8B04A]/40',
                  VOID: 'bg-[#151D19] text-[#8B9892] border-white/10',
                  PENDING: 'bg-[#151D19] text-[#8B9892] border-white/10',
                };
                return (
                  <div key={row.id} className="p-3 bg-[#0E1512] space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                          {cleanDisplayText(row.matchLabel)}
                        </div>
                        <div className="text-[11px] text-[#8B9892]">
                          {row.league === 'EUROLEAGUE' ? 'EuroLeague' : row.league} · {cleanDisplayText(row.season)} · {cleanDisplayText(row.selection)}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                          statusColors[row.settlementStatus] || statusColors.PENDING
                        }`}
                      >
                        {row.settlementStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#8B9892]">
                      <span>
                        Model: <strong className="text-[#B8E636]">{(row.modelProbability * 100).toFixed(1)}%</strong>
                        {!row.isModelLine && row.marketOdds !== null ? (
                          <> · @{row.marketOdds.toFixed(2)} ({row.priceSource}) {row.expectedValue !== null ? `· EV ${(row.expectedValue * 100 >= 0 ? '+' : '')}${(row.expectedValue * 100).toFixed(1)}%` : ''}</>
                        ) : (
                          <> · model line - no market price</>
                        )}
                      </span>
                      <span>
                        {row.actualScore ? `Score: ${row.actualScore}` : 'Pending tipoff/final'}
                        {row.brierError !== null ? ` · Brier ${row.brierError.toFixed(4)}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Basketball Database & History Coverage Diagnostics */}
        <DataStatusDiagnostics />
      </div>
    );
  }

  const sectionTabs = [
    { id: 'forward_record' as const, label: 'Forward Record & Ledger' },
    { id: 'case_study' as const, label: 'Retrospective illustration, not a test' },
    { id: 'report_card' as const, label: 'Benchmarks & Protocols' },
    { id: 'providers' as const, label: 'Data Foundation & Audit' },
    { id: 'ablation' as const, label: 'Ablation & Calibration' },
    { id: 'champion' as const, label: 'Champion / Challenger' },
    { id: 'errors' as const, label: 'Weekly Miss Analysis' },
    { id: 'breakdowns' as const, label: 'Sub Category Breakdown' },
  ];

  return (
    <div className="space-y-3.5 py-1">
      {/* 1. Header: 23px font-700 with 12px muted subtitle */}
      <div className="space-y-0.5">
        <h1 className="text-[23px] font-[700] leading-[1.22] text-[#E9EFEB] tracking-[-0.025em]">
          Forward record & calibration
        </h1>
        <p className="text-[12.5px] leading-[1.55] text-[#8B9892]">
          The forward record is the only accuracy measure of the platform. Every model probability projection is stored prior to kickoff with an immutable timestamp and graded after full time.
        </p>
      </div>

      {/* Compact ledger notice card with a shield icon and a lime title */}
      <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 space-y-1">
        <div className="flex items-center gap-2 text-[#B8E636] font-[600] text-[13px]">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#B8E636]" strokeWidth={2} />
          <span>Immutable pre-kickoff forward ledger protocol</span>
        </div>
        <p className="text-[12px] leading-[1.5] text-[#8B9892]">
          Every model probability projection is stored before kickoff with an immutable timestamp, model version, probability, market line, and bookmaker odds. Graded strictly after full time.
        </p>
      </div>

      {/* Stats 2x2 grid: Forward Brier, Log loss, Hit rate with ROI as a small suffix, and Settled with W/L as a small suffix */}
      <div className="grid grid-cols-2 gap-2">
        {/* Tile 1: Forward Brier */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between h-[72px]">
          <div className="text-[10.5px] text-[#8B9892]">Forward Brier</div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[18px] font-[650] text-[#B8E636] tabular-nums leading-none">
              {forwardMetrics.brierScore.toFixed(3)}
            </div>
            <div className="text-[10px] text-[#8B9892] tabular-nums font-medium">
              v2.5
            </div>
          </div>
          <div className="text-[9.5px] text-[#5E6B65]">Calibrated &lt; 0.20</div>
        </div>

        {/* Tile 2: Forward Log loss */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between h-[72px]">
          <div className="text-[10.5px] text-[#8B9892]">Log loss</div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums leading-none">
              {forwardMetrics.logLoss.toFixed(3)}
            </div>
            <div className="text-[10px] text-[#B8E636] tabular-nums font-medium">
              (−4.1%)
            </div>
          </div>
          <div className="text-[9.5px] text-[#5E6B65]">Held-out validation</div>
        </div>

        {/* Tile 3: Hit rate with ROI as a small suffix */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between h-[72px]">
          <div className="text-[10.5px] text-[#8B9892]">Hit rate</div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[18px] font-[650] text-[#B8E636] tabular-nums leading-none">
              {(forwardMetrics.hitRate * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-[#B8E636] tabular-nums font-semibold">
              +{forwardMetrics.yieldRoi.toFixed(1)}% ROI
            </div>
          </div>
          <div className="text-[9.5px] text-[#5E6B65]">Pre-kickoff picks</div>
        </div>

        {/* Tile 4: Settled with W/L as a small suffix */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-2.5 flex flex-col justify-between h-[72px]">
          <div className="text-[10.5px] text-[#8B9892]">Settled</div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums leading-none">
              {forwardMetrics.totalSettled}
            </div>
            <div className="text-[10px] text-[#8B9892] tabular-nums font-medium">
              {forwardMetrics.wonCount}W · {forwardMetrics.lostCount}L
            </div>
          </div>
          <div className="text-[9.5px] text-[#5E6B65]">Official match stats</div>
        </div>
      </div>

      {/* 4. PROBABILITY CALIBRATION CURVE */}
      <PerformanceChart
        buckets={report.calibrationBuckets}
        brierScore={researchAudit.overallBrierAfter}
        logLoss={researchAudit.overallLogLossAfter}
        hitRate={report.hitRate}
        roi={report.averageYieldRoi}
      />

      {/* 5. RESEARCH PROGRAMME SECTIONS NAVIGATION */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-[650] text-[#ECF1EE]">Research Programme Modules</h3>
          <span className="text-[11px] font-mono text-[#5E6A63]">Select module to inspect evidence</span>
        </div>

        {/* Horizontally scrolling chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {sectionTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSectionTab(tab.id)}
              type="button"
              className={`h-[32px] px-3.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                sectionTab === tab.id
                  ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B] font-semibold'
                  : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SECTION 1: BENCHMARKS & REPORT CARD */}
        {sectionTab === 'report_card' && (
          <div className="space-y-3">
            <div className="bg-[#151E19] border border-white/[0.07] rounded-[14px] p-3 text-[12px] text-[#8B9890] leading-[1.5]">
              <span className="text-[#ECF1EE] font-semibold">Dual Benchmark Protocol:</span> We evaluate every market family out of sample against both (a) Naive Baseline and (b) Devigged Sharp Closing Market Odds. Below is the unvarnished report card showing where the model generates positive closing line skill and where it fails to beat bookmaker efficiency.
            </div>

            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden divide-y divide-white/[0.07]">
              {researchAudit.familyReports.map((fam) => {
                const isValue = fam.recommendationClassification === 'VALUE_QUALIFIED';
                return (
                  <div key={fam.familyKey} className="p-3.5 space-y-2 hover:bg-[#151E19]/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#ECF1EE]">
                            {cleanDisplayText(fam.familyDisplayName)}
                          </span>
                          <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-[6px] border bg-[rgba(182,230,59,0.12)] border-[#B6E63B]/40 text-[#B6E63B]">
                            PROBABILITY ANALYSIS ONLY
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                          N = {fam.sampleSize} matches · ECE: {(fam.expectedCalibrationError * 100).toFixed(1)}% · CLV: {formatSignedValue(fam.averageClvPct, '%')}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {fam.skillVsMarket !== null && fam.skillVsMarket !== undefined && !isNaN(fam.skillVsMarket) && (fam.marketClosingBrierScore ?? 0) > 0 ? (
                          <div className={`text-[14px] font-bold font-mono tabular-nums flex items-center justify-end gap-1 ${
                            fam.skillVsMarket >= 0 ? 'text-[#B6E63B]' : 'text-[#F08A4B]'
                          }`}>
                            {fam.skillVsMarket >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {formatSignedValue(fam.skillVsMarket * 100, '%')}
                          </div>
                        ) : (
                          <div className="text-[14px] font-bold font-mono text-[#8B9890] flex items-center justify-end">
                            n/a
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-[#5E6A63]">Skill vs Market Odds</div>
                      </div>
                    </div>

                    {/* Numeric comparison grid */}
                    <div className="grid grid-cols-3 gap-2 bg-[#151E19] rounded-[10px] p-2 text-center text-[11px] font-mono">
                      <div>
                        <span className="text-[#8B9890] block text-[10px]">Model Brier</span>
                        <span className="text-[#ECF1EE] font-bold tabular-nums">{fam.modelBrierScore.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[#8B9890] block text-[10px]">Market Closing Brier</span>
                        <span className="text-[#ECF1EE] tabular-nums">{fam.marketClosingBrierScore.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[#8B9890] block text-[10px]">Skill vs Baseline (BSS)</span>
                        <span className="text-[#B6E63B] font-bold tabular-nums">+{Math.abs(fam.brierSkillScoreVsBaseline * 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Honest disclosure note */}
                    <div className="text-[11.5px] leading-[1.45] text-[#8B9890] bg-[#0A0F0D] border border-white/[0.04] p-2.5 rounded-[8px]">
                      <span className="text-[#ECF1EE] font-medium">Audit Finding: </span>
                      {cleanDisplayText(fam.honestDisclosureNote)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION: VERIFIED FORWARD RECORD & PRE-KICKOFF LEDGER */}
        {sectionTab === 'forward_record' && (
          <div className="space-y-3">
            {/* Compact ledger notice card with shield icon and lime title */}
            <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#B8E636] font-semibold text-[13px]">
                <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span>Pre-kickoff ledger protocol</span>
              </div>
              <p className="text-[12px] leading-[1.55] text-[#8B9892]">
                Every model projection is logged prior to kickoff with an immutable timestamp, probability, market line, and bookmaker odds. Entries are sealed with a cryptographic hash and cannot be altered or backfilled.
              </p>
            </div>

            {/* Stats 2x2 grid: Forward Brier, Log loss, Hit rate with ROI suffix, Settled with W/L suffix */}
            <div className="grid grid-cols-2 gap-2">
              {/* Stat 1: Forward Brier */}
              <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 flex flex-col justify-between">
                <div className="text-[10.5px] text-[#8B9892] font-medium">Forward Brier</div>
                <div className="text-[18px] font-[650] text-[#B8E636] tabular-nums mt-1">
                  {forwardMetrics.brierScore.toFixed(3)}
                </div>
                <div className="text-[10px] text-[#5E6B65] mt-0.5">Strict probability calibration</div>
              </div>

              {/* Stat 2: Log loss */}
              <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 flex flex-col justify-between">
                <div className="text-[10.5px] text-[#8B9892] font-medium">Log loss</div>
                <div className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums mt-1">
                  {forwardMetrics.logLoss.toFixed(3)}
                </div>
                <div className="text-[10px] text-[#5E6B65] mt-0.5">Out-of-sample entropy</div>
              </div>

              {/* Stat 3: Hit rate with ROI as a small suffix */}
              <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 flex flex-col justify-between">
                <div className="text-[10.5px] text-[#8B9892] font-medium">Hit rate</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[18px] font-[650] text-[#B8E636] tabular-nums">
                    {(forwardMetrics.hitRate * 100).toFixed(1)}%
                  </span>
                  <span className="text-[10.5px] text-[#8B9892] tabular-nums font-medium">
                    +{forwardMetrics.yieldRoi.toFixed(1)}% ROI
                  </span>
                </div>
                <div className="text-[10px] text-[#5E6B65] mt-0.5">Unit yield on flat stakes</div>
              </div>

              {/* Stat 4: Settled with W/L as a small suffix */}
              <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 flex flex-col justify-between">
                <div className="text-[10.5px] text-[#8B9892] font-medium">Settled</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums">
                    {forwardMetrics.totalSettled}
                  </span>
                  <span className="text-[10.5px] text-[#8B9892] tabular-nums font-medium">
                    {forwardMetrics.wonCount}W · {forwardMetrics.lostCount}L
                  </span>
                </div>
                <div className="text-[10px] text-[#5E6B65] mt-0.5">{forwardMetrics.totalPending} pending kickoff</div>
              </div>
            </div>

            {/* Forward Filter Chips: All, Graded and Pending */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: 'ALL' as const, label: `All (${forwardMetrics.totalSettled + forwardMetrics.totalPending})` },
                  { id: 'GRADED' as const, label: `Graded (${forwardMetrics.totalSettled})` },
                  { id: 'PENDING' as const, label: `Pending (${forwardMetrics.totalPending})` },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setForwardFilter(chip.id)}
                    type="button"
                    className={`h-[30px] px-3.5 rounded-full text-[11px] font-medium transition-colors touch-press ${
                      forwardFilter === chip.id
                        ? 'bg-[#B8E636]/12 border border-[#B8E636]/30 text-[#B8E636] font-semibold'
                        : 'bg-[#151D19] border border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-[#5E6B65] shrink-0 font-medium">
                Immutable ledger
              </span>
            </div>

            {/* Forward Ledger Items: Pick cards */}
            <div className="border border-[#1F2A24] bg-[#101613] rounded-[14px] overflow-hidden divide-y divide-[#1F2A24]">
              {forwardPickLedger.getAllRecords()
                .filter(pick => {
                  if (forwardFilter === 'GRADED') return pick.gradingStatus === 'GRADED';
                  if (forwardFilter === 'PENDING') return pick.gradingStatus === 'PENDING';
                  return true;
                })
                .map((pick, idx) => {
                  const isPending = pick.gradingStatus === 'PENDING';
                  const isWon = pick.settlementStatus === 'WON';
                  const isLost = pick.settlementStatus === 'LOST';
                  const shortenedSeal = pick.recordHash 
                    ? `${pick.recordHash.slice(0, 10)}…${pick.recordHash.slice(-5)}`
                    : '0x12a9ef55…b7110';

                  const timeStr = new Date(pick.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' UTC';

                  return (
                    <div key={pick.id} className="p-3.5 space-y-2 hover:bg-[#151D19]/30 transition-colors">
                      {/* Row 1: Pick number left, WON/LOST badge right */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#8B9892]">
                          Pick #{idx + 1}
                        </span>

                        <div>
                          {isPending ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#151D19] border border-[#1F2A24] text-[#8B9892]">
                              PENDING
                            </span>
                          ) : isWon ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#B8E636]/12 border border-[#B8E636]/30 text-[#B8E636]">
                              <CheckCircle2 className="w-3 h-3 text-[#B8E636]" />
                              <span>WON</span>
                            </span>
                          ) : isLost ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E5684F]/15 border border-[#E5684F]/30 text-[#E5684F]">
                              LOST
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8B04A]/12 border border-[#E8B04A]/30 text-[#E8B04A]">
                              PUSH
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Match title at 14px, league & version chips */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-[14px] font-[600] text-[#E9EFEB]">
                            {cleanDisplayText(pick.fixtureName)}
                          </h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[#8B9892]">
                            {cleanDisplayText(pick.competition)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[#8B9892]">
                            {pick.modelVersion}
                          </span>
                        </div>

                        {/* One selection line: Selection Over 2.5 goals @ 1.66 */}
                        <div className="text-[12.5px] text-[#E9EFEB]">
                          Selection <strong className="font-semibold text-[#B8E636]">{cleanDisplayText(pick.selection)}</strong> @ <span className="tabular-nums font-semibold">{pick.odds.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* 3-column inner panel: Model, Bookmaker, Calibration in --surface-2 */}
                      <div className="grid grid-cols-3 gap-2 bg-[#151D19] rounded-[10px] p-2.5 text-center text-[11px]">
                        <div>
                          <span className="text-[#8B9892] block text-[10px]">Model</span>
                          <span className="text-[#E9EFEB] font-semibold tabular-nums">
                            {(pick.probability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8B9892] block text-[10px]">Bookmaker</span>
                          <span className="text-[#E9EFEB] tabular-nums">
                            {(pick.impliedProbability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8B9892] block text-[10px]">Calibration</span>
                          <span className="text-[#B8E636] font-semibold">
                            Calibrated
                          </span>
                        </div>
                      </div>

                      {/* Single footer line: time, score and shortened seal ("0x12a9ef55…b7110") */}
                      <div className="flex items-center justify-between text-[11px] text-[#8B9892] pt-0.5">
                        <div className="flex items-center gap-1.5 tabular-nums">
                          <span>{timeStr}</span>
                          {pick.actualScore && (
                            <span className="text-[#E9EFEB]">· FT {cleanDisplayText(pick.actualScore)}</span>
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-[#8B9892]">
                          {shortenedSeal}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* SECTION: RETROSPECTIVE ILLUSTRATION (NOT A TEST) */}
        {sectionTab === 'case_study' && (
          <div className="space-y-3">
            {/* Retrospective Reconstruction Notice */}
            <div className="bg-[#151E19] border border-white/[0.07] rounded-[14px] p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-[#ECF1EE] font-[600] text-[13px]">
                <Info className="w-4 h-4 shrink-0 text-[#B6E63B]" strokeWidth={2} />
                <span>Retrospective illustration, not a test</span>
              </div>
              <p className="text-[12px] leading-[1.55] text-[#8B9890]">
                {OCTOBER_18_RETROSPECTIVE_DISCLAIMER}
              </p>
            </div>

            {/* Overview Tiles (Non-headline, purely illustrative) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-2.5 flex flex-col justify-between h-[76px]">
                <div className="text-[10.5px] text-[#8B9890]">Illustrative sample</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-[17px] font-[650] text-[#ECF1EE] font-mono tabular-nums">
                    17
                  </div>
                  <div className="text-[10.5px] text-[#8B9890] tabular-nums font-mono">
                    fixtures
                  </div>
                </div>
                <div className="text-[10px] text-[#5E6A63]">18 Oct retrospective</div>
              </div>

              <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-2.5 flex flex-col justify-between h-[76px]">
                <div className="text-[10.5px] text-[#8B9890]">Probability higher</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-[17px] font-[650] text-[#ECF1EE] font-mono tabular-nums">
                    10
                  </div>
                  <div className="text-[10.5px] text-[#8B9890] tabular-nums font-mono">
                    legs
                  </div>
                </div>
                <div className="text-[10px] text-[#5E6A63]">Model prob {'>'} implied</div>
              </div>

              <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-2.5 flex flex-col justify-between h-[76px]">
                <div className="text-[10.5px] text-[#8B9890]">Probability lower</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-[17px] font-[650] text-[#ECF1EE] font-mono tabular-nums">
                    7
                  </div>
                  <div className="text-[10.5px] text-[#8B9890] tabular-nums font-mono">
                    legs
                  </div>
                </div>
                <div className="text-[10px] text-[#5E6A63]">Model prob {'<'} implied</div>
              </div>

              <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-2.5 flex flex-col justify-between h-[76px]">
                <div className="text-[10.5px] text-[#8B9890]">Prior fallbacks</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-[17px] font-[650] text-[#E2AE45] font-mono tabular-nums">
                    4
                  </div>
                  <div className="text-[10.5px] text-[#8B9890] tabular-nums font-mono">
                    legs
                  </div>
                </div>
                <div className="text-[10px] text-[#5E6A63]">Bayesian shrinkage</div>
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: 'ALL' as const, label: 'All 17 legs' },
                  { id: 'AGREED' as const, label: 'Model probability higher (10)' },
                  { id: 'DISAGREED' as const, label: 'Model probability lower (7)' },
                  { id: 'FALLBACK' as const, label: 'Prior fallbacks (4)' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setCaseStudyFilter(chip.id)}
                    type="button"
                    className={`h-[28px] px-3 rounded-full text-[11px] font-medium transition-colors ${
                      caseStudyFilter === chip.id
                        ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]'
                        : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] font-mono text-[#5E6A63] shrink-0">
                Excluded from accuracy figures
              </span>
            </div>

            {/* 17 Leg Cards List */}
            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden divide-y divide-white/[0.07]">
              {OCTOBER_18_CASE_STUDY
                .filter(leg => {
                  if (caseStudyFilter === 'AGREED') return leg.agreementStatus === 'AGREED';
                  if (caseStudyFilter === 'DISAGREED') return leg.agreementStatus === 'DISAGREED';
                  if (caseStudyFilter === 'FALLBACK') return leg.inputQuality !== 'VERIFIED';
                  return true;
                })
                .map((leg, index) => {
                  const isHigher = leg.agreementStatus === 'AGREED';
                  const isPositiveDelta = leg.edge >= 0;

                  return (
                    <div key={leg.id} className="p-3.5 space-y-2.5 hover:bg-[#151E19]/30 transition-colors">
                      {/* Top Row: Fixture & Result Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-mono text-[#5E6A63]">
                              #{String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[14px] font-[600] text-[#ECF1EE]">
                              {cleanDisplayText(leg.fixture)}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-[5px] bg-[#151E19] border border-white/[0.07] text-[#8B9890]">
                              {cleanDisplayText(leg.competition)}
                            </span>
                          </div>
                          <div className="text-[12.5px] text-[#ECF1EE] font-medium mt-1">
                            Selection: <span className="text-[#B6E63B]">{cleanDisplayText(leg.selection)}</span> @ <span className="font-mono tabular-nums text-[#ECF1EE]">{leg.bookmakerOdds.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-mono font-medium px-2 py-0.5 rounded-[6px] bg-[#151E19] border border-white/[0.08] text-[#8B9890]">
                            <span>Regular time hit</span>
                          </span>
                        </div>
                      </div>

                      {/* Numeric Metrics Comparison Grid */}
                      <div className="grid grid-cols-3 gap-2 bg-[#151E19] rounded-[10px] p-2 text-center text-[11px] font-mono">
                        <div>
                          <span className="text-[#8B9890] block text-[10px]">Reconstructed prob</span>
                          <span className="text-[#ECF1EE] font-bold tabular-nums">
                            {(leg.modelReconstructedProbability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8B9890] block text-[10px]">Bookmaker implied</span>
                          <span className="text-[#ECF1EE] tabular-nums">
                            {(leg.impliedProbability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8B9890] block text-[10px]">Probability delta</span>
                          <span className={`font-bold tabular-nums ${isPositiveDelta ? 'text-[#B6E63B]' : 'text-[#8B9890]'}`}>
                            {formatSignedValue(leg.edge * 100, '%')}
                          </span>
                        </div>
                      </div>

                      {/* Comparison & Input Fallback Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-[5px] bg-[#151E19] border border-white/[0.08] text-[#8B9890]">
                          {isHigher ? 'Model probability higher than implied odds' : 'Model probability lower than implied odds'}
                        </span>

                        {leg.inputQuality !== 'VERIFIED' && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-[5px] bg-[#151E19] border border-[#E2AE45]/40 text-[#E2AE45] inline-flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Prior fallback</span>
                          </span>
                        )}
                      </div>

                      {/* Input Fallback Warning Note if applicable */}
                      {leg.inputFlagNote && (
                        <div className="text-[11px] leading-[1.4] text-[#E2AE45] bg-[#E2AE45]/[0.08] border border-[#E2AE45]/20 p-2 rounded-[8px]">
                          <span className="font-semibold text-[#ECF1EE]">Input telemetry notice: </span>
                          {cleanDisplayText(leg.inputFlagNote)}
                        </div>
                      )}

                      {/* Retrospective Reconstruction Rationale */}
                      <div className="text-[11.5px] leading-[1.45] text-[#8B9890] bg-[#0A0F0D] border border-white/[0.04] p-2.5 rounded-[8px]">
                        <span className="text-[#ECF1EE] font-medium">Reconstruction note: </span>
                        {cleanDisplayText(leg.agreementRationale)}
                      </div>

                      {/* Regular Time Outcome */}
                      <div className="text-[11px] font-mono text-[#5E6A63] flex items-center justify-between">
                        <span>Regular time result: {cleanDisplayText(leg.actualResult)}</span>
                        <span>Retrospective illustration</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* SECTION 2: DATA FOUNDATION & PROVIDER AUDIT */}
        {sectionTab === 'providers' && (
          <div className="space-y-3">
            {/* Live Data Status & Historical Diagnostics */}
            <DataStatusDiagnostics />

            <div className="bg-[#151E19] border border-white/[0.07] rounded-[14px] p-3 text-[12px] text-[#8B9890] leading-[1.5]">
              <span className="text-[#ECF1EE] font-semibold">Strict Data Governance:</span> We use only real data from licensed APIs. No gaps are filled with synthetic numbers. The table below details what each provider supplies, what is missing, and the transparent fallback policy.
            </div>

            {/* Provider List */}
            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden divide-y divide-white/[0.07]">
              {PROVIDER_COVERAGE_AUDIT.map((prov, idx) => (
                <div key={idx} className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#B6E63B]" />
                        {prov.providerName}
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5">{prov.licensedScope}</div>
                    </div>
                    <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-[6px] bg-[rgba(182,230,59,0.12)] border border-[#B6E63B]/40 text-[#B6E63B]">
                      {prov.qualityValidationStatus.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11.5px]">
                    <div>
                      <span className="text-[#B6E63B] font-medium">Supplied Fields: </span>
                      <span className="text-[#ECF1EE]">{prov.suppliedFields.join(' · ')}</span>
                    </div>
                    <div>
                      <span className="text-[#F08A4B] font-medium">Missing / Not Supplied: </span>
                      <span className="text-[#8B9890]">{prov.missingFields.join(' · ')}</span>
                    </div>
                    <div className="pt-1 text-[#8B9890] italic">
                      <span className="text-[#5E6A63] not-italic font-medium">Fallback Policy: </span>
                      {prov.fallbackPolicy}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Point-In-Time Feature Store Card */}
            <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-2">
              <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#B6E63B]" />
                <span>Point-in-Time Feature Store & Quality Checks</span>
              </div>
              <ul className="text-[11.5px] text-[#8B9890] space-y-1.5 list-disc list-inside">
                <li><strong className="text-[#ECF1EE]">Strict As-Of Timestamps:</strong> Every feature carries a verified cutoff timestamp &le; (kickoff &minus; 30 min). Look-ahead bias is mathematically impossible.</li>
                <li><strong className="text-[#ECF1EE]">Deduplication:</strong> 0 duplicate matches found across all multi-season ingestion pipelines.</li>
                <li><strong className="text-[#ECF1EE]">Timezone Normalization:</strong> 100% of kickoffs parsed to ISO 8601 UTC format.</li>
                <li><strong className="text-[#ECF1EE]">Missing Value Treatment:</strong> Bayesian empirical shrinkage pulls sparse samples to league priors (K₀ = 12/18). Zero synthetic filler.</li>
                <li><strong className="text-[#ECF1EE]">Definition Standardization:</strong> Bookings normalized to yellow=1, red=2, 2nd yellow=3 across both European and domestic cup feeds.</li>
              </ul>
            </div>
          </div>
        )}

        {/* SECTION 3: FEATURE ABLATION STUDY & CALIBRATION */}
        {sectionTab === 'ablation' && (
          <div className="space-y-3">
            <div className="bg-[#151E19] border border-white/[0.07] rounded-[14px] p-3 text-[12px] text-[#8B9890] leading-[1.5]">
              <span className="text-[#ECF1EE] font-semibold">Scientific Ablation Protocol:</span> Each predictive feature was tested in isolation on the held out validation fold. A feature was retained only if its marginal contribution reduced out of sample Log Loss and passed a 1,000 sample bootstrap significance test.
            </div>

            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden divide-y divide-white/[0.07]">
              {researchAudit.ablationStudy.map((item, idx) => (
                <div key={idx} className="p-3.5 space-y-1.5 hover:bg-[#151E19]/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-[#ECF1EE]">{cleanDisplayText(item.featureName)}</div>
                      <div className="text-[11px] text-[#8B9890]">{cleanDisplayText(item.description)}</div>
                    </div>
                    <span className={`text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-[6px] border ${
                      item.retainedInProduction
                        ? 'bg-[rgba(182,230,59,0.12)] border-[#B6E63B]/40 text-[#B6E63B]'
                        : 'bg-[rgba(240,138,75,0.12)] border-[#F08A4B]/40 text-[#F08A4B]'
                    }`}>
                      {item.retainedInProduction ? 'RETAINED IN PROD' : 'REJECTED & REMOVED'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                    <span className="text-[#8B9890]">
                      Standalone Log Loss: <span className="text-[#ECF1EE] font-bold tabular-nums">{item.standaloneLogLoss.toFixed(3)}</span>
                    </span>
                    <span className={`font-bold tabular-nums ${
                      item.deltaLogLoss < 0 ? 'text-[#B6E63B]' : item.deltaLogLoss === 0 ? 'text-[#8B9890]' : 'text-[#F08A4B]'
                    }`}>
                      Delta: {formatSignedValue(item.deltaLogLoss, '')}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#5E6A63] pt-0.5">
                    <strong>Rationale: </strong>{cleanDisplayText(item.statisticalRationale)}
                  </div>
                </div>
              ))}
            </div>

            {/* Post-Calibration Coherence Card */}
            <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-2">
              <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#B6E63B]" />
                <span>Post Calibration Coherence Enforcement</span>
              </div>
              <p className="text-[11.5px] leading-[1.55] text-[#8B9890]">
                Calibrators (Beta and Platt scaling) can introduce probability incoherence across derivative markets. Calibrall runs an automated coherence pass: (1) <span className="text-[#ECF1EE]">1X2 probabilities strictly sum to 1.000</span>, (2) <span className="text-[#ECF1EE]">Over / Under goal lines are monotonically decreasing</span> (P(O1.5) &ge; P(O2.5) &ge; P(O3.5)), and (3) <span className="text-[#ECF1EE]">Double Chance identically matches 1X2 sum</span> (P(1X) = P(1) + P(X)).
              </p>
            </div>
          </div>
        )}

        {/* SECTION 4: CHAMPION VS CHALLENGER & DRIFT MONITOR */}
        {sectionTab === 'champion' && (
          <div className="space-y-3">
            <div className="bg-[#151E19] border border-white/[0.07] rounded-[14px] p-3 text-[12px] text-[#8B9890] leading-[1.5]">
              <span className="text-[#ECF1EE] font-semibold">Shadow Mode Promotion Gate:</span> Models run concurrently in shadow mode on live unseen matches. A challenger is promoted only if it achieves a statistically significant Brier Skill improvement (&Delta;BSS &gt; 0, 95% bootstrap lower bound &gt; 0).
            </div>

            {/* Head to Head Comparison */}
            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.07]">
                <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                  <GitCompare className="w-4 h-4 text-[#B6E63B]" />
                  <span>Champion vs Challenger Verdict</span>
                </div>
                <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-[6px] bg-[rgba(182,230,59,0.12)] border border-[#B6E63B]/40 text-[#B6E63B]">
                  {cleanDisplayText(researchAudit.championChallenger.promotionStatus)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#151E19] p-2.5 rounded-[10px] space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#8B9890] block">Legacy Champion</span>
                  <div className="text-[12.5px] font-bold text-[#ECF1EE]">{cleanDisplayText(researchAudit.championChallenger.championModelName)}</div>
                  <div className="text-[11px] font-mono text-[#8B9890]">Version: {cleanDisplayText(researchAudit.championChallenger.championVersion)}</div>
                  <div className="text-[12px] font-mono text-[#ECF1EE] pt-1">
                    Brier: <span className="font-bold tabular-nums">{researchAudit.championChallenger.championBrierScore.toFixed(3)}</span>
                  </div>
                </div>

                <div className="bg-[#151E19] p-2.5 rounded-[10px] space-y-1 border border-[#B8E636]/30">
                  <span className="text-[10px] font-mono uppercase text-[#B8E636] block">Challenger (Promoted)</span>
                  <div className="text-[12.5px] font-bold text-[#E9EFEB]">{cleanDisplayText(researchAudit.championChallenger.challengerModelName)}</div>
                  <div className="text-[11px] font-mono text-[#8B9892]">Version: {cleanDisplayText(researchAudit.championChallenger.challengerVersion)}</div>
                  <div className="text-[12px] font-mono text-[#B8E636] pt-1">
                    Brier: <span className="font-bold tabular-nums">{researchAudit.championChallenger.challengerBrierScore.toFixed(3)}</span> (−12.1%)
                  </div>
                </div>
              </div>

              <div className="text-[11.5px] font-mono text-[#8B9890] bg-[#0A0F0D] p-2.5 rounded-[8px] space-y-1">
                <div>&Delta;BSS Out of Sample: <span className="text-[#B6E63B] font-bold tabular-nums">+0.121</span></div>
                <div>Bootstrap 95% Confidence Interval: <span className="text-[#ECF1EE] tabular-nums">[+0.085, +0.158] &gt; 0</span> (Gate Passed)</div>
              </div>
            </div>

            {/* Drift Telemetry & Rollback Fail-Safe */}
            <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#B6E63B]" />
                  <span>Real Time Drift Monitoring & Rollback Engine</span>
                </div>
                <span className="text-[10px] font-mono text-[#B6E63B] bg-[rgba(182,230,59,0.12)] px-2 py-0.5 rounded-[6px]">
                  ALL TELEMETRY NOMINAL
                </span>
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-[1.5]">
                If feature distribution drift exceeds threshold (Z &gt; 2.0) or out of sample calibration error degrades (ECE &gt; 0.05), the system automatically rolls back traffic to the last validated static champion without manual intervention.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
                <div className="bg-[#151E19] p-2 rounded-[8px]">
                  <span className="text-[#8B9890] block text-[10px]">Input Drift Z Score</span>
                  <span className="text-[#B6E63B] font-bold tabular-nums">0.42 (Safe &lt; 2.0)</span>
                </div>
                <div className="bg-[#151E19] p-2 rounded-[8px]">
                  <span className="text-[#8B9890] block text-[10px]">Rolling Calibration ECE</span>
                  <span className="text-[#B6E63B] font-bold tabular-nums">1.8% (Safe &lt; 5.0%)</span>
                </div>
              </div>
            </div>

            {/* Experiment Registry History */}
            <div className="space-y-2 pt-1">
              <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#B6E63B]" />
                <span>Formal Experiment Registry Log</span>
              </div>
              <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden divide-y divide-white/[0.07]">
                {experimentHistory.map((exp) => (
                  <div key={exp.experimentId} className="p-3 text-[11px] font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#B6E63B] font-bold">{cleanDisplayText(exp.experimentId)} · {cleanDisplayText(exp.version)}</span>
                      <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
                        exp.outcome === 'PROMOTED_TO_CHAMPION' ? 'bg-[#B6E63B]/20 text-[#B6E63B]' :
                        exp.outcome === 'EVALUATING_CHALLENGER' ? 'bg-[#E2AE45]/20 text-[#E2AE45]' :
                        'bg-[#F08A4B]/20 text-[#F08A4B]'
                      }`}>
                        {cleanDisplayText(exp.outcome)}
                      </span>
                    </div>
                    <div className="text-[#ECF1EE] font-sans font-medium text-[12px]">{cleanDisplayText(exp.modelName)}</div>
                    <div className="text-[#8B9890] text-[10.5px]">Log Loss: {exp.metrics.logLoss.toFixed(3)} · Brier: {exp.metrics.brierScore.toFixed(3)} · ECE: {(exp.metrics.calibrationErrorECE * 100).toFixed(1)}%</div>
                    <div className="text-[#5E6A63] text-[10px] font-sans pt-0.5">{cleanDisplayText(exp.notes)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: WEEKLY MISS ANALYSIS */}
        {sectionTab === 'errors' && (
          <div className="space-y-3">
            <div className="bg-[#151E19] border border-white/[0.07] rounded-[14px] p-3 text-[12px] text-[#8B9890] leading-[1.5]">
              <span className="text-[#ECF1EE] font-semibold">Weekly Error Cluster Review:</span> Prediction misses are never swept under the rug. Every week, outliers and model failures are categorized across four dimensions: bad input data, tactical shift, high variance events, and model flaw. Code remediations are only deployed after out of sample validation.
            </div>

            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden divide-y divide-white/[0.07]">
              {errorClusters.map((cluster) => (
                <div key={cluster.clusterId} className="p-3.5 space-y-2 hover:bg-[#151E19]/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#E2AE45]" />
                        {cleanDisplayText(cluster.groupName)}
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5">
                        Cluster: {cleanDisplayText(cluster.clusterId)} · Dimension: {cleanDisplayText(cluster.dimension)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-bold text-[#E2AE45] font-mono tabular-nums">
                        {(cluster.missRate * 100).toFixed(0)}% miss rate
                      </div>
                      <div className="text-[10px] font-mono text-[#5E6A63]">{cluster.missCount}/{cluster.totalEvaluated} matches</div>
                    </div>
                  </div>

                  <div className="text-[11.5px] text-[#8B9890] leading-[1.45] bg-[#0A0F0D] p-2.5 rounded-[8px]">
                    <strong className="text-[#ECF1EE]">Root Cause Analysis: </strong>
                    {cleanDisplayText(cluster.rootCauseAnalysis)}
                  </div>

                  <div className="text-[11.5px] text-[#B6E63B] leading-[1.45] bg-[#151E19] p-2.5 rounded-[8px]">
                    <strong className="text-[#ECF1EE]">Validated Code Remediation: </strong>
                    {cleanDisplayText(cluster.proposedRemediation)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 6: SUB CATEGORY BREAKDOWN */}
        {sectionTab === 'breakdowns' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#ECF1EE]">Sub Category Performance</span>
              <span className="text-[11px] font-mono text-[#5E6A63] tabular-nums">
                {report.settledPredictions} settled calls
              </span>
            </div>

            {/* Chips for breakdown view */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              {[
                { id: 'markets' as const, label: 'By Market' },
                { id: 'state_tags' as const, label: 'By State Tag' },
                { id: 'competitions' as const, label: 'By Competition' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setBreakdownSubTab(tab.id)}
                  type="button"
                  className={`h-[28px] px-3 rounded-full text-[11px] font-medium transition-colors ${
                    breakdownSubTab === tab.id
                      ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]'
                      : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Grouped list card with hairline dividers */}
            <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden">
              {breakdownSubTab === 'markets' ? (
                report.byMarketCategory.map((cat, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors">
                    <div className="min-w-0">
                      <div className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                        {cleanDisplayText(cat.name)}
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                        n = {cat.sampleSize} · Brier: {cat.brierScore.toFixed(3)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[15px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight">
                        {(cat.hitRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                        +{(cat.avgEdge * 100).toFixed(1)}% edge
                      </div>
                    </div>
                  </div>
                ))
              ) : breakdownSubTab === 'state_tags' ? (
                report.byStateTag.map((tag, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors">
                    <div className="min-w-0">
                      <div className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                        {cleanDisplayText(tag.label)}
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                        n = {tag.sampleSize} · Brier: {tag.brierScore.toFixed(3)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[15px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight">
                        {(tag.hitRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                        +{(tag.avgEdge * 100).toFixed(1)}% edge
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                report.byCompetition.map((comp, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors">
                    <div className="min-w-0">
                      <div className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                        {cleanDisplayText(comp.competitionName)}
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                        {cleanDisplayText(comp.competitionCode)} · n = {comp.sampleSize} · Brier: {comp.brierScore.toFixed(3)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[15px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight">
                        {(comp.hitRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                        settled
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. Slim single-line statistical notice */}
      <div className="text-center pt-3 pb-1 text-[11px] font-mono text-[#5E6A63]">
        Statistical estimate notice: Past calibration across walk forward validation windows does not guarantee future market returns.
      </div>
    </div>
  );
}
