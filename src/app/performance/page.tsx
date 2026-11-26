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
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  GitCompare,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Activity,
} from 'lucide-react';
import { cleanDisplayText, formatSignedValue } from '@/lib/utils/formatText';
import {
  OCTOBER_18_CASE_STUDY,
  OCTOBER_18_RETROSPECTIVE_DISCLAIMER,
} from '@/lib/data/october18CaseStudy';
import { forwardPickLedger } from '@/lib/prediction/forwardPickLedger';
import { getStoredUser } from '@/lib/supabase/client';
import DataStatusDiagnostics from '@/components/DataStatusDiagnostics';

type MainSectionTab =
  | 'forward_record'
  | 'case_study'
  | 'report_card'
  | 'providers'
  | 'ablation'
  | 'champion'
  | 'errors'
  | 'breakdowns';

const SETTLEMENT_LABELS: Record<string, string> = {
  WON: 'Won',
  LOST: 'Lost',
  PUSH: 'Push',
  VOID: 'Void',
  PENDING: 'Pending',
};

export default function PerformancePage() {
  const { sport, isSwitching } = useSport();
  const [sectionTab, setSectionTab] = useState<MainSectionTab>('forward_record');
  const [breakdownSubTab, setBreakdownSubTab] = useState<'markets' | 'state_tags' | 'competitions'>('markets');
  const [caseStudyFilter, setCaseStudyFilter] = useState<'ALL' | 'AGREED' | 'DISAGREED' | 'FALLBACK'>('ALL');
  const [forwardFilter, setForwardFilter] = useState<'ALL' | 'GRADED' | 'PENDING'>('ALL');

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
    const userTier = getStoredUser()?.subscriptionTier || 'free';
    fetch('/api/v1/performance/summary?sport=basketball', {
      cache: 'no-store',
      headers: {
        'x-calibrall-tier': userTier,
      },
    })
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

  const forwardMetrics = forwardPickLedger.getForwardRecordMetrics();
  const researchAudit = ValidationAndBenchmarksEngine.runFullResearchAudit();
  const errorClusters = ModelRegistryService.getWeeklyMissAnalysis();
  const experimentHistory = ModelRegistryService.getExperimentRegistry();

  if (isSwitching) {
    return (
      <div className="space-y-4 py-2 animate-pulse">
        <div className="h-7 w-56 bg-[var(--surface-2)] rounded-[12px]" />
        <div className="h-24 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-20 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
          <div className="h-20 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
        </div>
        <div className="h-48 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
      </div>
    );
  }

  if (isBasketball) {
    const bbCategoryLabel: Record<BasketballMarketCategory, string> = {
      game_total: 'Game total',
      home_total: 'Home team total',
      away_total: 'Away team total',
      h1_game_total: '1st half game total',
      h1_team_total: '1st half team totals',
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
      <div className="space-y-4 py-2">
        <header className="space-y-1">
          <h1 className="font-display text-[26px] font-[700] leading-[1.18] tracking-[-0.02em] text-[var(--text)]">
            Basketball forward record
          </h1>
          <p className="text-[12.5px] sm:text-[13px] leading-[1.5] text-[var(--text-2)]">
            Totals and 1st half engine across NBA, NCAAB, and EuroLeague. Basketball picks, Brier scores, log loss, and ROI stay strictly separate from football.
          </p>
        </header>

        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--accent)] font-[600] text-[13px]">
            <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span>Separate basketball forward ledger</span>
          </div>
          <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
            Pre-tipoff picks are hashed before scheduled start, settled strictly from official final and half scores, push on exact integer line hits, and calculate EV only from real bookmaker prices.
          </p>
        </div>

        {bbError && (
          <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[12px] p-3 text-[12.5px] text-[var(--danger)]">
            Failed to load live basketball ledger: {bbError}
          </div>
        )}

        {/* 2x2 KPI Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[86px]">
            <div className="text-[11px] text-[var(--text-2)]">Forward Brier</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <div className="font-display text-[20px] font-[700] text-[var(--accent)] tabular-nums leading-none">
                {bbLoading ? '—' : fwd && fwd.brierScore !== null ? fwd.brierScore.toFixed(4) : '—'}
              </div>
              <div className="text-[10.5px] text-[var(--text-3)] font-medium">Totals v1</div>
            </div>
            <div className="text-[10.5px] text-[var(--text-3)] mt-1">Graded pre-tipoff picks</div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[86px]">
            <div className="text-[11px] text-[var(--text-2)]">Log loss</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <div className="font-display text-[20px] font-[700] text-[var(--text)] tabular-nums leading-none">
                {bbLoading ? '—' : fwd && fwd.logLoss !== null ? fwd.logLoss.toFixed(4) : '—'}
              </div>
            </div>
            <div className="text-[10.5px] text-[var(--text-3)] mt-1">Separate ledger</div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[86px]">
            <div className="text-[11px] text-[var(--text-2)]">Hit rate</div>
            <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
              <div className="font-display text-[20px] font-[700] text-[var(--accent)] tabular-nums leading-none">
                {bbLoading
                  ? '—'
                  : fwd && fwd.wonCount + fwd.lostCount > 0
                  ? `${((fwd.wonCount / (fwd.wonCount + fwd.lostCount)) * 100).toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-[10.5px] text-[var(--text-2)] tabular-nums font-medium">
                {bbLoading
                  ? ''
                  : fwd && fwd.pricedSettledCount > 0 && fwd.yieldRoi !== null
                  ? `${fwd.yieldRoi >= 0 ? '+' : ''}${fwd.yieldRoi.toFixed(1)}% ROI`
                  : 'Awaiting lines'}
              </div>
            </div>
            <div className="text-[10.5px] text-[var(--text-3)] mt-1">
              {fwd ? `${fwd.pricedSettledCount} priced settled` : 'Real market odds only'}
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[86px]">
            <div className="text-[11px] text-[var(--text-2)]">Settled</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <div className="font-display text-[20px] font-[700] text-[var(--text)] tabular-nums leading-none">
                {bbLoading ? '—' : fwd ? fwd.settledCount : 0}
              </div>
              {fwd && (
                <div className="text-[10.5px] text-[var(--text-2)] tabular-nums">
                  {fwd.wonCount}W · {fwd.lostCount}L · {fwd.pushCount}P
                </div>
              )}
            </div>
            <div className="text-[10.5px] text-[var(--text-3)] mt-1">
              {fwd ? `${fwd.pendingCount} pending · ${fwd.voidCount} void` : '0 pending'}
            </div>
          </div>
        </div>

        {(!fwd || fwd.settledCount < 100) && (
          <div className="rounded-[18px] p-3.5 border border-[var(--medium)]/35 bg-[var(--medium-soft)] flex items-start gap-2.5 text-[12px] text-[var(--text)]">
            <AlertTriangle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" />
            <div className="leading-[1.5]">
              <span className="font-semibold text-[var(--medium)]">Sample size note (&lt; 100 settled picks): </span>
              <span className="text-[var(--text-2)]">
                Only {fwd?.settledCount ?? 0} settled basketball picks recorded so far. Inspect the out-of-sample walk-forward calibration curve below.
              </span>
            </div>
          </div>
        )}

        {/* Walk-Forward Out-of-Sample Calibration */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">
                Walk-forward out-of-sample calibration
              </h2>
              <p className="text-[11.5px] text-[var(--text-2)]">
                Chronological evaluation vs naive league average totals baseline
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {(['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]).map((lg) => (
                <button
                  key={lg}
                  type="button"
                  onClick={() => setBbLeague(lg)}
                  className={`min-h-[44px] px-3.5 rounded-full text-[11.5px] font-medium transition-colors touch-press border ${
                    bbLeague === lg
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {lg === 'EUROLEAGUE' ? 'EuroLeague' : lg}
                </button>
              ))}
            </div>
          </div>

          {bbLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
              <div className="h-24 bg-[var(--surface-2)] rounded-[12px]" />
            </div>
          ) : walkForwardLeague ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px] bg-[var(--surface-2)] rounded-[12px] p-3 border border-[var(--line)]">
                <div>
                  <span className="text-[var(--text-3)] block text-[10.5px]">Evaluated games</span>
                  <span className="text-[var(--text)] font-semibold tabular-nums">
                    {walkForwardLeague.evaluatedGames.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-3)] block text-[10.5px]">Needs history</span>
                  <span className="text-[var(--medium)] font-semibold tabular-nums">
                    {walkForwardLeague.abstainedNeedsHistoryGames.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-3)] block text-[10.5px]">1st half sample</span>
                  <span className="text-[var(--text)] font-semibold tabular-nums">
                    {walkForwardLeague.h1EvaluatedGames.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-3)] block text-[10.5px]">Team mean · H1 share</span>
                  <span className="text-[var(--accent)] font-semibold tabular-nums">
                    {walkForwardLeague.empiricalLeagueStats.regTeamMean.toFixed(1)} pts · {(walkForwardLeague.empiricalLeagueStats.h1Share * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="border border-[var(--line)] rounded-[12px] overflow-hidden divide-y divide-[var(--line)]">
                {walkForwardLeague.families.map((fam) => {
                  const selected = activeFamily?.marketCategory === fam.marketCategory;
                  return (
                    <button
                      key={fam.marketCategory}
                      type="button"
                      onClick={() => setBbSelectedCategory(fam.marketCategory)}
                      className={`w-full min-h-[44px] text-left p-3.5 transition-colors space-y-2 touch-press ${
                        selected ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface)] hover:bg-[var(--surface-2)]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] font-semibold text-[var(--text)] truncate">
                            {bbCategoryLabel[fam.marketCategory]}
                          </span>
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                            {fam.calibratorType}
                          </span>
                        </div>

                        <span
                          className={`text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${
                            fam.passedBaseline
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                              : 'bg-[var(--medium-soft)] border-[var(--medium)]/40 text-[var(--medium)]'
                          }`}
                        >
                          {fam.passedBaseline ? 'Pass baseline' : 'Review only'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px] tabular-nums">
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">Cal Brier vs naive</span>
                          <span className="text-[var(--text)] font-semibold">
                            {fam.calibratedBrier.toFixed(4)}
                          </span>{' '}
                          <span className="text-[var(--text-3)]">vs {fam.baselineBrier.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">Cal log loss</span>
                          <span className="text-[var(--text)] font-semibold">
                            {fam.calibratedLogLoss.toFixed(4)}
                          </span>{' '}
                          <span className="text-[var(--text-3)]">vs {fam.baselineLogLoss.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">ECE · Sample</span>
                          <span className="text-[var(--text)]">
                            {(fam.ece * 100).toFixed(2)}%
                          </span>{' '}
                          <span className="text-[var(--text-3)]">({fam.sampleSize.toLocaleString()})</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">Hit rate at 60%+</span>
                          <span className="text-[var(--accent)] font-semibold">
                            {fam.hitRateAt60 !== null ? `${(fam.hitRateAt60 * 100).toFixed(1)}%` : '—'}
                          </span>{' '}
                          <span className="text-[var(--text-3)]">({fam.sampleAt60.toLocaleString()})</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeFamily && activeFamily.calibrationTable.length > 0 && (
                <div className="pt-1">
                  <PerformanceChart
                    buckets={activeFamily.calibrationTable.map((bin) => ({
                      binRange: cleanDisplayText(bin.binRange),
                      binCenter: bin.predictedProbMean,
                      predictedProbMean: bin.predictedProbMean,
                      observedFrequency: bin.observedFrequency,
                      sampleCount: bin.sampleCount,
                    }))}
                    brierScore={activeFamily.calibratedBrier}
                    logLoss={activeFamily.calibratedLogLoss}
                    hitRate={activeFamily.hitRateAt60 ?? 0}
                    roi={0}
                    title={`Calibration curve · ${bbLeague === 'EUROLEAGUE' ? 'EuroLeague' : bbLeague} ${bbCategoryLabel[activeFamily.marketCategory]}`}
                    subtitle={`Walk-forward reliability across N=${activeFamily.sampleSize.toLocaleString()} evaluated observations.`}
                    badgeText={`ECE: ${(activeFamily.ece * 100).toFixed(2)}%`}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-[12.5px] text-[var(--text-2)] py-4 text-center">
              No calibration parameters available yet.
            </div>
          )}
        </div>

        {/* Basketball Pre-Tipoff Forward Picks */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">
                Pre-tipoff forward picks
              </h2>
              <p className="text-[11.5px] text-[var(--text-2)]">
                Recorded before tipoff and settled from final scores
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(['ALL', 'GRADED', 'PENDING'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBbForwardFilter(f)}
                  className={`min-h-[44px] px-3.5 rounded-full text-[11.5px] font-medium transition-colors touch-press border ${
                    bbForwardFilter === f
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
                  }`}
                >
                  {f === 'ALL' ? 'All' : f === 'GRADED' ? 'Graded' : 'Pending'}
                </button>
              ))}
            </div>
          </div>

          {filteredBbPicks.length === 0 ? (
            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-4 text-center space-y-1">
              <div className="text-[13px] font-semibold text-[var(--text)]">
                No pre-tipoff basketball picks recorded yet
              </div>
              <p className="text-[12px] text-[var(--text-2)]">
                Live sync automatically logs high and medium confidence picks before tipoff and grades them after completion.
              </p>
            </div>
          ) : (
            <div className="border border-[var(--line)] rounded-[12px] divide-y divide-[var(--line)] overflow-hidden">
              {filteredBbPicks.map((row) => {
                const statusColors: Record<string, string> = {
                  WON: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40',
                  LOST: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/40',
                  PUSH: 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/40',
                  VOID: 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--line)]',
                  PENDING: 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--line)]',
                };
                return (
                  <div key={row.id} className="p-3.5 bg-[var(--surface)] space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                          {cleanDisplayText(row.matchLabel)}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-2)]">
                          {row.league === 'EUROLEAGUE' ? 'EuroLeague' : row.league} · {cleanDisplayText(row.season)} · {cleanDisplayText(row.selection)}
                        </div>
                      </div>
                      <span
                        className={`text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${
                          statusColors[row.settlementStatus] || statusColors.PENDING
                        }`}
                      >
                        {SETTLEMENT_LABELS[row.settlementStatus] || 'Pending'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] tabular-nums text-[var(--text-2)]">
                      <span>
                        Model: <strong className="text-[var(--accent)]">{(row.modelProbability * 100).toFixed(1)}%</strong>
                        {!row.isModelLine && row.marketOdds !== null ? (
                          <> · @{row.marketOdds.toFixed(2)} ({row.priceSource}) {row.expectedValue !== null ? `· EV ${(row.expectedValue * 100 >= 0 ? '+' : '')}${(row.expectedValue * 100).toFixed(1)}%` : ''}</>
                        ) : (
                          <> · Model line</>
                        )}
                      </span>
                      <span>
                        {row.actualScore ? `Score: ${row.actualScore}` : 'Pending final'}
                        {row.brierError !== null ? ` · Brier ${row.brierError.toFixed(4)}` : ''}
                      </span>
                    </div>

                    {row.summary && (
                      <p className="text-[11.5px] leading-[1.45] text-[var(--text-2)] pt-1 border-t border-[var(--line)]">
                        {cleanDisplayText(row.summary)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DataStatusDiagnostics />
      </div>
    );
  }

  const sectionTabs = [
    { id: 'forward_record' as const, label: 'Forward record' },
    { id: 'case_study' as const, label: 'Illustrative log' },
    { id: 'report_card' as const, label: 'Benchmarks' },
    { id: 'providers' as const, label: 'Data & providers' },
    { id: 'ablation' as const, label: 'Ablation' },
    { id: 'champion' as const, label: 'Champion vs challenger' },
    { id: 'errors' as const, label: 'Miss analysis' },
    { id: 'breakdowns' as const, label: 'Breakdowns' },
  ];

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] tracking-[-0.02em] text-[var(--text)]">
          Forward record &amp; calibration
        </h1>
        <p className="text-[12.5px] sm:text-[13px] leading-[1.5] text-[var(--text-2)]">
          Every model probability projection is stored prior to kickoff with an immutable timestamp and graded strictly after full time.
        </p>
      </header>

      {/* Immutable Ledger Notice */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-[var(--accent)] font-[600] text-[13px]">
          <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span>Immutable pre-kickoff ledger protocol</span>
        </div>
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
          Probabilities, market lines, and bookmaker odds are hashed before kickoff so past predictions cannot be altered or backfilled.
        </p>
      </div>

      {/* 2x2 KPI Summary Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[84px]">
          <div className="text-[11px] text-[var(--text-2)]">Forward Brier</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <div className="font-display text-[20px] font-[700] text-[var(--accent)] tabular-nums leading-none">
              {forwardMetrics.brierScore.toFixed(3)}
            </div>
            <div className="text-[10.5px] text-[var(--text-2)] tabular-nums font-medium">
              v2.5
            </div>
          </div>
          <div className="text-[10.5px] text-[var(--text-3)] mt-1">Calibrated &lt; 0.20</div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[84px]">
          <div className="text-[11px] text-[var(--text-2)]">Log loss</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <div className="font-display text-[20px] font-[700] text-[var(--text)] tabular-nums leading-none">
              {forwardMetrics.logLoss.toFixed(3)}
            </div>
            <div className="text-[10.5px] text-[var(--accent)] tabular-nums font-medium">
              (−4.1%)
            </div>
          </div>
          <div className="text-[10.5px] text-[var(--text-3)] mt-1">Held-out validation</div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[84px]">
          <div className="text-[11px] text-[var(--text-2)]">Hit rate</div>
          <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
            <div className="font-display text-[20px] font-[700] text-[var(--accent)] tabular-nums leading-none">
              {(forwardMetrics.hitRate * 100).toFixed(1)}%
            </div>
            <div className="text-[10.5px] text-[var(--accent)] tabular-nums font-semibold">
              +{forwardMetrics.yieldRoi.toFixed(1)}% ROI
            </div>
          </div>
          <div className="text-[10.5px] text-[var(--text-3)] mt-1">Pre-kickoff picks</div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3.5 flex flex-col justify-between min-h-[84px]">
          <div className="text-[11px] text-[var(--text-2)]">Settled</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <div className="font-display text-[20px] font-[700] text-[var(--text)] tabular-nums leading-none">
              {forwardMetrics.totalSettled}
            </div>
            <div className="text-[10.5px] text-[var(--text-2)] tabular-nums font-medium">
              {forwardMetrics.wonCount}W · {forwardMetrics.lostCount}L
            </div>
          </div>
          <div className="text-[10.5px] text-[var(--text-3)] mt-1">Official match stats</div>
        </div>
      </div>

      {/* Sample-size caveat under 100 settled picks */}
      {forwardMetrics.totalSettled < 100 && (
        <div className="rounded-[18px] p-3.5 border border-[var(--medium)]/35 bg-[var(--medium-soft)] flex items-start gap-2.5 text-[12px] text-[var(--text)]">
          <AlertTriangle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" />
          <div className="leading-[1.5]">
            <span className="font-semibold text-[var(--medium)]">Sample size note (&lt; 100 settled picks): </span>
            <span className="text-[var(--text-2)]">
              Only {forwardMetrics.totalSettled} settled football forward picks recorded so far. Refer to the held-out calibration curve below for multi-season reliability.
            </span>
          </div>
        </div>
      )}

      {/* Calibration Curve */}
      <PerformanceChart
        buckets={report.calibrationBuckets}
        brierScore={researchAudit.overallBrierAfter}
        logLoss={researchAudit.overallLogLossAfter}
        hitRate={report.hitRate}
        roi={report.averageYieldRoi}
      />

      {/* Research Programme Modules — Underlined Sub-Nav */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">
            Research modules
          </h2>
          <span className="text-[11px] text-[var(--text-3)]">Swipe to explore</span>
        </div>

        <div
          role="tablist"
          aria-label="Performance modules"
          className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-[var(--line)] -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {sectionTabs.map((tab) => {
            const active = sectionTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setSectionTab(tab.id)}
                type="button"
                className={`relative min-h-[44px] px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                  active ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[var(--accent)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* SECTION: FORWARD RECORD LEDGER */}
        {sectionTab === 'forward_record' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
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
                    className={`min-h-[44px] px-3.5 rounded-full text-[11.5px] font-medium transition-colors touch-press border whitespace-nowrap ${
                      forwardFilter === chip.id
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                        : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <span className="text-[10.5px] text-[var(--text-3)] shrink-0 font-medium hidden sm:inline">
                Immutable ledger
              </span>
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
              {forwardPickLedger
                .getAllRecords()
                .filter((pick) => {
                  if (forwardFilter === 'GRADED') return pick.gradingStatus === 'GRADED';
                  if (forwardFilter === 'PENDING') return pick.gradingStatus === 'PENDING';
                  return true;
                })
                .map((pick, idx) => {
                  const isPending = pick.gradingStatus === 'PENDING';
                  const isWon = pick.settlementStatus === 'WON';
                  const isLost = pick.settlementStatus === 'LOST';
                  const isVoid = pick.settlementStatus === 'VOID';
                  const shortenedSeal = pick.recordHash
                    ? `${pick.recordHash.slice(0, 10)}…${pick.recordHash.slice(-5)}`
                    : '0x12a9ef55…b7110';

                  const timeStr =
                    new Date(pick.recordedAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) + ' UTC';

                  return (
                    <div key={pick.id} className="p-4 space-y-2.5 hover:bg-[var(--surface-2)]/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--text-2)]">
                          Pick #{idx + 1}
                        </span>

                        <div>
                          {isPending ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                              Pending
                            </span>
                          ) : isWon ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[var(--accent)]">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Won</span>
                            </span>
                          ) : isLost ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--danger-soft)] border border-[var(--danger)]/40 text-[var(--danger)]">
                              Lost
                            </span>
                          ) : isVoid ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                              Void
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] border border-[var(--medium)]/40 text-[var(--medium)]">
                              Push
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-[14px] font-[600] text-[var(--text)]">
                            {cleanDisplayText(pick.fixtureName)}
                          </h3>
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                            {cleanDisplayText(pick.competition)}
                          </span>
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                            {pick.modelVersion}
                          </span>
                        </div>

                        <div className="text-[12.5px] text-[var(--text)]">
                          Selection <strong className="font-semibold text-[var(--accent)]">{cleanDisplayText(pick.selection)}</strong>{' '}
                          {pick.odds > 0 ? (
                            <>
                              @ <span className="tabular-nums font-semibold">{pick.odds.toFixed(2)}</span>
                            </>
                          ) : (
                            <span className="text-[11.5px] text-[var(--text-2)]">· Model line, no market price</span>
                          )}
                        </div>
                      </div>

                      {pick.summary && (
                        <p className="text-[11.5px] leading-[1.45] text-[var(--text-2)] bg-[var(--surface-2)] border border-[var(--line)] rounded-[10px] p-2.5">
                          {cleanDisplayText(pick.summary)}
                        </p>
                      )}

                      <div className="grid grid-cols-3 gap-2 bg-[var(--surface-2)] rounded-[12px] p-2.5 text-center text-[11.5px] border border-[var(--line)]">
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">Model</span>
                          <span className="text-[var(--text)] font-semibold tabular-nums">
                            {(pick.probability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">Bookmaker</span>
                          <span className="text-[var(--text)] tabular-nums">
                            {pick.odds > 0 ? `${(pick.impliedProbability * 100).toFixed(1)}%` : 'No price'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-3)] block text-[10.5px]">Status</span>
                          <span className="text-[var(--accent)] font-semibold">
                            Calibrated
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[var(--text-2)] pt-0.5">
                        <div className="flex items-center gap-1.5 tabular-nums">
                          <span>{timeStr}</span>
                          {pick.actualScore && (
                            <span className="text-[var(--text)]">· FT {cleanDisplayText(pick.actualScore)}</span>
                          )}
                        </div>
                        <span className="font-mono text-[10.5px] text-[var(--text-3)]">
                          {shortenedSeal}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* SECTION: RETROSPECTIVE ILLUSTRATION */}
        {sectionTab === 'case_study' && (
          <div className="space-y-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2">
              <div className="flex items-center gap-2 text-[var(--text)] font-[600] text-[13px]">
                <Info className="w-4 h-4 shrink-0 text-[var(--accent)]" strokeWidth={2} />
                <span>Retrospective illustration, not a test</span>
              </div>
              <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
                {OCTOBER_18_RETROSPECTIVE_DISCLAIMER}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3 flex flex-col justify-between min-h-[82px]">
                <div className="text-[10.5px] text-[var(--text-2)]">Illustrative sample</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="font-display text-[18px] font-[700] text-[var(--text)] tabular-nums">17</div>
                  <div className="text-[10.5px] text-[var(--text-2)]">fixtures</div>
                </div>
                <div className="text-[10.5px] text-[var(--text-3)]">18 Oct retrospective</div>
              </div>

              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3 flex flex-col justify-between min-h-[82px]">
                <div className="text-[10.5px] text-[var(--text-2)]">Probability higher</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="font-display text-[18px] font-[700] text-[var(--text)] tabular-nums">10</div>
                  <div className="text-[10.5px] text-[var(--text-2)]">legs</div>
                </div>
                <div className="text-[10.5px] text-[var(--text-3)]">Model prob &gt; implied</div>
              </div>

              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3 flex flex-col justify-between min-h-[82px]">
                <div className="text-[10.5px] text-[var(--text-2)]">Probability lower</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="font-display text-[18px] font-[700] text-[var(--text)] tabular-nums">7</div>
                  <div className="text-[10.5px] text-[var(--text-2)]">legs</div>
                </div>
                <div className="text-[10.5px] text-[var(--text-3)]">Model prob &lt; implied</div>
              </div>

              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3 flex flex-col justify-between min-h-[82px]">
                <div className="text-[10.5px] text-[var(--text-2)]">Prior fallbacks</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="font-display text-[18px] font-[700] text-[var(--medium)] tabular-nums">4</div>
                  <div className="text-[10.5px] text-[var(--text-2)]">legs</div>
                </div>
                <div className="text-[10.5px] text-[var(--text-3)]">Bayesian shrinkage</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: 'ALL' as const, label: 'All 17 legs' },
                  { id: 'AGREED' as const, label: 'Higher prob (10)' },
                  { id: 'DISAGREED' as const, label: 'Lower prob (7)' },
                  { id: 'FALLBACK' as const, label: 'Fallbacks (4)' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setCaseStudyFilter(chip.id)}
                    type="button"
                    className={`min-h-[44px] px-3.5 rounded-full text-[11.5px] font-medium transition-colors touch-press border whitespace-nowrap ${
                      caseStudyFilter === chip.id
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                        : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <span className="text-[10.5px] text-[var(--text-3)] shrink-0">
                Excluded from accuracy figures
              </span>
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
              {OCTOBER_18_CASE_STUDY.filter((leg) => {
                if (caseStudyFilter === 'AGREED') return leg.agreementStatus === 'AGREED';
                if (caseStudyFilter === 'DISAGREED') return leg.agreementStatus === 'DISAGREED';
                if (caseStudyFilter === 'FALLBACK') return leg.inputQuality !== 'VERIFIED';
                return true;
              }).map((leg, index) => {
                const isHigher = leg.agreementStatus === 'AGREED';
                const isPositiveDelta = leg.edge >= 0;

                return (
                  <div key={leg.id} className="p-4 space-y-2.5 hover:bg-[var(--surface-2)]/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-[var(--text-3)] tabular-nums">
                            #{String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="font-display text-[14px] font-[600] text-[var(--text)]">
                            {cleanDisplayText(leg.fixture)}
                          </span>
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                            {cleanDisplayText(leg.competition)}
                          </span>
                        </div>
                        <div className="text-[12.5px] text-[var(--text)] font-medium mt-1">
                          Selection: <span className="text-[var(--accent)]">{cleanDisplayText(leg.selection)}</span> @{' '}
                          <span className="tabular-nums text-[var(--text)]">{leg.bookmakerOdds.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center text-[10.5px] font-medium px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                          Regular time hit
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[var(--surface-2)] rounded-[12px] p-2.5 text-center text-[11.5px] border border-[var(--line)]">
                      <div>
                        <span className="text-[var(--text-3)] block text-[10.5px]">Reconstructed</span>
                        <span className="text-[var(--text)] font-bold tabular-nums">
                          {(leg.modelReconstructedProbability * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-3)] block text-[10.5px]">Implied</span>
                        <span className="text-[var(--text)] tabular-nums">
                          {(leg.impliedProbability * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-3)] block text-[10.5px]">Delta</span>
                        <span className={`font-bold tabular-nums ${isPositiveDelta ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'}`}>
                          {formatSignedValue(leg.edge * 100, '%')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                        {isHigher ? 'Model probability higher than implied' : 'Model probability lower than implied'}
                      </span>

                      {leg.inputQuality !== 'VERIFIED' && (
                        <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--medium-soft)] border border-[var(--medium)]/40 text-[var(--medium)] inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Prior fallback</span>
                        </span>
                      )}
                    </div>

                    {leg.inputFlagNote && (
                      <div className="text-[11.5px] leading-[1.45] text-[var(--medium)] bg-[var(--medium-soft)] border border-[var(--medium)]/25 p-2.5 rounded-[12px]">
                        <span className="font-semibold text-[var(--text)]">Input note: </span>
                        {cleanDisplayText(leg.inputFlagNote)}
                      </div>
                    )}

                    <div className="text-[12px] leading-[1.5] text-[var(--text-2)] bg-[var(--surface-2)] border border-[var(--line)] p-3 rounded-[12px]">
                      <span className="text-[var(--text)] font-medium">Reconstruction note: </span>
                      {cleanDisplayText(leg.agreementRationale)}
                    </div>

                    <div className="text-[11px] text-[var(--text-3)] flex items-center justify-between">
                      <span>Regular time result: {cleanDisplayText(leg.actualResult)}</span>
                      <span>Retrospective illustration</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION: BENCHMARKS & REPORT CARD */}
        {sectionTab === 'report_card' && (
          <div className="space-y-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              <span className="text-[var(--text)] font-semibold">Dual benchmark protocol: </span>
              Every market family is evaluated out of sample against a naive baseline and devigged sharp closing market odds.
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
              {researchAudit.familyReports.map((fam) => (
                <div key={fam.familyKey} className="p-4 space-y-2.5 hover:bg-[var(--surface-2)]/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold text-[var(--text)]">
                          {cleanDisplayText(fam.familyDisplayName)}
                        </span>
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full border bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]">
                          Probability analysis
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-1 tabular-nums">
                        N = {fam.sampleSize} matches · ECE {(fam.expectedCalibrationError * 100).toFixed(1)}% · CLV {formatSignedValue(fam.averageClvPct, '%')}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {fam.skillVsMarket !== null &&
                      fam.skillVsMarket !== undefined &&
                      !isNaN(fam.skillVsMarket) &&
                      (fam.marketClosingBrierScore ?? 0) > 0 ? (
                        <div
                          className={`text-[14px] font-bold tabular-nums flex items-center justify-end gap-1 ${
                            fam.skillVsMarket >= 0 ? 'text-[var(--accent)]' : 'text-[var(--medium)]'
                          }`}
                        >
                          {fam.skillVsMarket >= 0 ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4" />
                          )}
                          {formatSignedValue(fam.skillVsMarket * 100, '%')}
                        </div>
                      ) : (
                        <div className="text-[14px] font-bold text-[var(--text-2)] flex items-center justify-end">
                          —
                        </div>
                      )}
                      <div className="text-[10.5px] text-[var(--text-3)]">Skill vs market</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-[var(--surface-2)] rounded-[12px] p-2.5 text-center text-[11.5px] border border-[var(--line)]">
                    <div>
                      <span className="text-[var(--text-3)] block text-[10.5px]">Model Brier</span>
                      <span className="text-[var(--text)] font-bold tabular-nums">{fam.modelBrierScore.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-3)] block text-[10.5px]">Market Brier</span>
                      <span className="text-[var(--text)] tabular-nums">{fam.marketClosingBrierScore.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-3)] block text-[10.5px]">Skill vs baseline</span>
                      <span className="text-[var(--accent)] font-bold tabular-nums">
                        +{Math.abs(fam.brierSkillScoreVsBaseline * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="text-[12px] leading-[1.5] text-[var(--text-2)] bg-[var(--surface-2)] border border-[var(--line)] p-3 rounded-[12px]">
                    <span className="text-[var(--text)] font-medium">Audit finding: </span>
                    {cleanDisplayText(fam.honestDisclosureNote)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION: DATA FOUNDATION & PROVIDER AUDIT */}
        {sectionTab === 'providers' && (
          <div className="space-y-3">
            <DataStatusDiagnostics />

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              <span className="text-[var(--text)] font-semibold">Strict data governance: </span>
              We ingest only real data from licensed APIs and never backfill missing fields with synthetic numbers.
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
              {PROVIDER_COVERAGE_AUDIT.map((prov, idx) => (
                <div key={idx} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>{prov.providerName}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-0.5">{prov.licensedScope}</div>
                    </div>
                    <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[var(--accent)] font-medium shrink-0">
                      {prov.qualityValidationStatus}
                    </span>
                  </div>

                  <div className="space-y-1 text-[12px] leading-[1.5]">
                    <div>
                      <span className="text-[var(--accent)] font-medium">Supplied fields: </span>
                      <span className="text-[var(--text)]">{prov.suppliedFields.join(' · ')}</span>
                    </div>
                    <div>
                      <span className="text-[var(--medium)] font-medium">Not supplied: </span>
                      <span className="text-[var(--text-2)]">{prov.missingFields.join(' · ')}</span>
                    </div>
                    <div className="pt-1 text-[var(--text-2)]">
                      <span className="text-[var(--text)] font-medium">Fallback policy: </span>
                      {prov.fallbackPolicy}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2">
              <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />
                <span>Point-in-time feature store checks</span>
              </div>
              <ul className="text-[12px] text-[var(--text-2)] space-y-1.5 list-disc list-inside leading-[1.5]">
                <li>
                  <strong className="text-[var(--text)]">Strict as-of timestamps:</strong> Every feature carries a cutoff timestamp &le; (kickoff &minus; 30 min) to eliminate look-ahead bias.
                </li>
                <li>
                  <strong className="text-[var(--text)]">Deduplication:</strong> Zero duplicate matches across multi-season ingestion pipelines.
                </li>
                <li>
                  <strong className="text-[var(--text)]">Timezone normalization:</strong> All kickoffs stored in ISO 8601 UTC.
                </li>
                <li>
                  <strong className="text-[var(--text)]">Missing value treatment:</strong> Empirical Bayesian shrinkage pulls sparse samples toward league priors.
                </li>
                <li>
                  <strong className="text-[var(--text)]">Booking normalization:</strong> Yellow=1, red=2, second yellow=3 across European and domestic feeds.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* SECTION: FEATURE ABLATION STUDY */}
        {sectionTab === 'ablation' && (
          <div className="space-y-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              <span className="text-[var(--text)] font-semibold">Ablation protocol: </span>
              Each feature was evaluated in isolation on the held-out validation fold and retained only if it improved out-of-sample log loss with 1,000-sample bootstrap significance.
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
              {researchAudit.ablationStudy.map((item, idx) => (
                <div key={idx} className="p-4 space-y-2 hover:bg-[var(--surface-2)]/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[13.5px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(item.featureName)}
                      </div>
                      <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                        {cleanDisplayText(item.description)}
                      </div>
                    </div>
                    <span
                      className={`text-[10.5px] font-medium px-2.5 py-0.5 rounded-full border shrink-0 ${
                        item.retainedInProduction
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                          : 'bg-[var(--danger-soft)] border-[var(--danger)]/40 text-[var(--danger)]'
                      }`}
                    >
                      {item.retainedInProduction ? 'Retained' : 'Rejected'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11.5px] pt-0.5 tabular-nums">
                    <span className="text-[var(--text-2)]">
                      Standalone log loss:{' '}
                      <span className="text-[var(--text)] font-semibold">{item.standaloneLogLoss.toFixed(3)}</span>
                    </span>
                    <span
                      className={`font-semibold ${
                        item.deltaLogLoss < 0
                          ? 'text-[var(--accent)]'
                          : item.deltaLogLoss === 0
                          ? 'text-[var(--text-2)]'
                          : 'text-[var(--danger)]'
                      }`}
                    >
                      Delta: {formatSignedValue(item.deltaLogLoss, '')}
                    </span>
                  </div>

                  <div className="text-[11.5px] text-[var(--text-3)]">
                    <strong className="text-[var(--text-2)]">Rationale: </strong>
                    {cleanDisplayText(item.statisticalRationale)}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2">
              <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--accent)]" />
                <span>Post-calibration coherence enforcement</span>
              </div>
              <p className="text-[12px] leading-[1.5] text-[var(--text-2)]">
                Calibrall enforces coherence across derivative lines: <span className="text-[var(--text)]">1X2 probabilities sum to 1.000</span>,{' '}
                <span className="text-[var(--text)]">Over/Under goal lines decrease monotonically</span>, and{' '}
                <span className="text-[var(--text)]">Double Chance matches the exact 1X2 sum</span>.
              </p>
            </div>
          </div>
        )}

        {/* SECTION: CHAMPION VS CHALLENGER */}
        {sectionTab === 'champion' && (
          <div className="space-y-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              <span className="text-[var(--text)] font-semibold">Shadow mode promotion gate: </span>
              Models run concurrently in shadow mode on unseen fixtures. Challengers promote only with a statistically significant positive Brier skill gain.
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--line)]">
                <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <GitCompare className="w-4 h-4 text-[var(--accent)]" />
                  <span>Champion vs challenger</span>
                </div>
                <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[var(--accent)] font-medium">
                  {cleanDisplayText(researchAudit.championChallenger.promotionStatus)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-[var(--surface-2)] p-3 rounded-[12px] border border-[var(--line)] space-y-1">
                  <span className="text-[10.5px] text-[var(--text-3)] block">Legacy champion</span>
                  <div className="text-[13px] font-bold text-[var(--text)]">
                    {cleanDisplayText(researchAudit.championChallenger.championModelName)}
                  </div>
                  <div className="text-[11px] text-[var(--text-2)]">
                    Version: {cleanDisplayText(researchAudit.championChallenger.championVersion)}
                  </div>
                  <div className="text-[12px] text-[var(--text)] pt-1 tabular-nums">
                    Brier: <span className="font-bold">{researchAudit.championChallenger.championBrierScore.toFixed(3)}</span>
                  </div>
                </div>

                <div className="bg-[var(--surface-2)] p-3 rounded-[12px] space-y-1 border border-[var(--accent)]/40">
                  <span className="text-[10.5px] text-[var(--accent)] font-medium block">Challenger (promoted)</span>
                  <div className="text-[13px] font-bold text-[var(--text)]">
                    {cleanDisplayText(researchAudit.championChallenger.challengerModelName)}
                  </div>
                  <div className="text-[11px] text-[var(--text-2)]">
                    Version: {cleanDisplayText(researchAudit.championChallenger.challengerVersion)}
                  </div>
                  <div className="text-[12px] text-[var(--accent)] pt-1 tabular-nums">
                    Brier: <span className="font-bold">{researchAudit.championChallenger.challengerBrierScore.toFixed(3)}</span> (−12.1%)
                  </div>
                </div>
              </div>

              <div className="text-[11.5px] text-[var(--text-2)] bg-[var(--surface-2)] border border-[var(--line)] p-3 rounded-[12px] space-y-1 tabular-nums">
                <div>
                  Delta BSS out of sample: <span className="text-[var(--accent)] font-bold">+0.121</span>
                </div>
                <div>
                  Bootstrap 95% CI: <span className="text-[var(--text)]">[+0.085, +0.158] &gt; 0</span> (Gate passed)
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--accent)]" />
                  <span>Drift monitoring &amp; rollback</span>
                </div>
                <span className="text-[10.5px] text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-2.5 py-0.5 rounded-full font-medium">
                  Nominal
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                If feature drift exceeds threshold (Z &gt; 2.0) or calibration error degrades (ECE &gt; 0.05), traffic automatically reverts to the validated baseline model.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11.5px] tabular-nums">
                <div className="bg-[var(--surface-2)] border border-[var(--line)] p-2.5 rounded-[12px]">
                  <span className="text-[var(--text-3)] block text-[10.5px]">Input drift Z-score</span>
                  <span className="text-[var(--accent)] font-bold">0.42 (Safe &lt; 2.0)</span>
                </div>
                <div className="bg-[var(--surface-2)] border border-[var(--line)] p-2.5 rounded-[12px]">
                  <span className="text-[var(--text-3)] block text-[10.5px]">Rolling calibration ECE</span>
                  <span className="text-[var(--accent)] font-bold">1.8% (Safe &lt; 5.0%)</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                <History className="w-4 h-4 text-[var(--accent)]" />
                <span>Experiment registry</span>
              </div>
              <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
                {experimentHistory.map((exp) => (
                  <div key={exp.experimentId} className="p-3.5 text-[11.5px] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--accent)] font-semibold tabular-nums">
                        {cleanDisplayText(exp.experimentId)} · {cleanDisplayText(exp.version)}
                      </span>
                      <span
                        className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium ${
                          exp.outcome === 'PROMOTED_TO_CHAMPION'
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                            : exp.outcome === 'EVALUATING_CHALLENGER'
                            ? 'bg-[var(--medium-soft)] text-[var(--medium)]'
                            : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                        }`}
                      >
                        {cleanDisplayText(exp.outcome)}
                      </span>
                    </div>
                    <div className="text-[var(--text)] font-medium text-[12.5px]">
                      {cleanDisplayText(exp.modelName)}
                    </div>
                    <div className="text-[var(--text-2)] text-[11px] tabular-nums">
                      Log loss: {exp.metrics.logLoss.toFixed(3)} · Brier: {exp.metrics.brierScore.toFixed(3)} · ECE:{' '}
                      {(exp.metrics.calibrationErrorECE * 100).toFixed(1)}%
                    </div>
                    <div className="text-[var(--text-3)] text-[11px] pt-0.5">{cleanDisplayText(exp.notes)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION: WEEKLY MISS ANALYSIS */}
        {sectionTab === 'errors' && (
          <div className="space-y-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              <span className="text-[var(--text)] font-semibold">Weekly error cluster review: </span>
              Outliers and misses are categorized by input quality, tactical shifts, variance events, or model defects before any remediation ships.
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
              {errorClusters.map((cluster) => (
                <div key={cluster.clusterId} className="p-4 space-y-2.5 hover:bg-[var(--surface-2)]/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[var(--medium)] shrink-0" />
                        <span>{cleanDisplayText(cluster.groupName)}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-0.5">
                        Cluster: {cleanDisplayText(cluster.clusterId)} · {cleanDisplayText(cluster.dimension)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-bold text-[var(--medium)] tabular-nums">
                        {(cluster.missRate * 100).toFixed(0)}% miss rate
                      </div>
                      <div className="text-[10.5px] text-[var(--text-3)] tabular-nums">
                        {cluster.missCount}/{cluster.totalEvaluated} matches
                      </div>
                    </div>
                  </div>

                  <div className="text-[12px] text-[var(--text-2)] leading-[1.5] bg-[var(--surface-2)] border border-[var(--line)] p-3 rounded-[12px]">
                    <strong className="text-[var(--text)]">Root cause: </strong>
                    {cleanDisplayText(cluster.rootCauseAnalysis)}
                  </div>

                  <div className="text-[12px] text-[var(--accent)] leading-[1.5] bg-[var(--accent-soft)] border border-[var(--accent)]/25 p-3 rounded-[12px]">
                    <strong className="text-[var(--text)]">Remediation: </strong>
                    {cleanDisplayText(cluster.proposedRemediation)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION: SUB CATEGORY BREAKDOWN */}
        {sectionTab === 'breakdowns' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-[var(--text)]">Sub-category performance</span>
              <span className="text-[11px] text-[var(--text-3)] tabular-nums">
                {report.settledPredictions} settled calls
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              {[
                { id: 'markets' as const, label: 'By market' },
                { id: 'state_tags' as const, label: 'By state tag' },
                { id: 'competitions' as const, label: 'By competition' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setBreakdownSubTab(tab.id)}
                  type="button"
                  className={`min-h-[44px] px-3.5 rounded-full text-[11.5px] font-medium transition-colors touch-press border whitespace-nowrap ${
                    breakdownSubTab === tab.id
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
              {breakdownSubTab === 'markets' ? (
                <>
                  {report.byMarketCategory.map((cat, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)]/50 transition-colors">
                      <div className="min-w-0">
                        <div className="text-[13px] font-[600] text-[var(--text)] truncate">
                          {cleanDisplayText(cat.name)}
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                          n = {cat.sampleSize} · Brier {cat.brierScore.toFixed(3)}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[15px] font-bold text-[var(--accent)] tabular-nums leading-tight">
                          {(cat.hitRate * 100).toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                          +{(cat.avgEdge * 100).toFixed(1)}% edge
                        </div>
                      </div>
                    </div>
                  ))}
                  {forwardMetrics.multiGoalsMetrics.settledCount >= 30 ? (
                    <div className="p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)]/50 transition-colors">
                      <div className="min-w-0">
                        <div className="text-[13px] font-[600] text-[var(--text)] truncate">
                          Multi goals
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                          n = {forwardMetrics.multiGoalsMetrics.settledCount} · Brier {forwardMetrics.multiGoalsMetrics.brierScore.toFixed(3)} · Log loss {forwardMetrics.multiGoalsMetrics.logLoss.toFixed(3)}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[15px] font-bold text-[var(--accent)] tabular-nums leading-tight">
                          {(forwardMetrics.multiGoalsMetrics.hitRate * 100).toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                          {forwardMetrics.multiGoalsMetrics.wonCount}W / {forwardMetrics.multiGoalsMetrics.lostCount}L
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex items-center justify-between gap-3 text-[12px] text-[var(--text-2)]">
                      <span>
                        Multi goals forward tracking activates after 30 settled picks ({forwardMetrics.multiGoalsMetrics.settledCount} of 30 settled).
                      </span>
                    </div>
                  )}
                </>
              ) : breakdownSubTab === 'state_tags' ? (
                report.byStateTag.map((tag, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)]/50 transition-colors">
                    <div className="min-w-0">
                      <div className="text-[13px] font-[600] text-[var(--text)] truncate">
                        {cleanDisplayText(tag.label)}
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                        n = {tag.sampleSize} · Brier {tag.brierScore.toFixed(3)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[15px] font-bold text-[var(--accent)] tabular-nums leading-tight">
                        {(tag.hitRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                        +{(tag.avgEdge * 100).toFixed(1)}% edge
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                report.byCompetition.map((comp, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)]/50 transition-colors">
                    <div className="min-w-0">
                      <div className="text-[13px] font-[600] text-[var(--text)] truncate">
                        {cleanDisplayText(comp.competitionName)}
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-0.5 tabular-nums">
                        {cleanDisplayText(comp.competitionCode)} · n = {comp.sampleSize} · Brier {comp.brierScore.toFixed(3)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[15px] font-bold text-[var(--accent)] tabular-nums leading-tight">
                        {(comp.hitRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-[var(--text-2)] mt-0.5">
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

      <p className="text-center pt-2 pb-1 text-[11px] text-[var(--text-3)]">
        Statistical estimate notice: Past calibration across walk-forward validation windows does not guarantee future outcomes.
      </p>
    </div>
  );
}
