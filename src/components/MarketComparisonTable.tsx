'use client';

import React, { useState, useMemo } from 'react';
import { MarketPrediction } from '@/types';
import {
  ArrowUpDown,
  Clock,
  ChevronRight,
  ChevronDown,
  Scale,
  Gauge,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  getOptionTypeLabel,
  getPeriodLabel,
  formatExpectedValue,
  formatOdds,
  groupPredictionsByConfidenceTier,
} from '@/lib/prediction/marketCatalog';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface Props {
  predictions: MarketPrediction[];
  onSelectPrediction?: (prediction: MarketPrediction) => void;
  selectedPredictionId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

type ViewMode = 'TIER_GROUPED' | 'MARKET_SECTIONS' | 'ALL_LINES';

export default function MarketComparisonTable({
  predictions,
  onSelectPrediction,
  selectedPredictionId,
  homeTeamName = 'Home',
  awayTeamName = 'Away',
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('TIER_GROUPED');
  const [marketFilter, setMarketFilter] = useState<string>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openTiers, setOpenTiers] = useState<Record<'high' | 'medium' | 'low', boolean>>({
    high: true,
    medium: true,
    low: true,
  });

  const [handicapMode, setHandicapMode] = useState<'asian' | 'european'>('asian');

  const handleRowClick = (pred: MarketPrediction) => {
    if (onSelectPrediction) {
      onSelectPrediction(pred);
    }
    setExpandedId((prev) => (prev === pred.id ? null : pred.id));
  };

  const toggleTierSection = (tier: 'high' | 'medium' | 'low') => {
    setOpenTiers((prev) => ({ ...prev, [tier]: !prev[tier] }));
  };

  // Single source of truth used by BOTH the summary card + stacked bar AND the collapsible tier sections
  const tierGroups = useMemo(
    () => groupPredictionsByConfidenceTier(predictions),
    [predictions]
  );

  const totalCount = tierGroups.total || 1;
  const highPct = (tierGroups.high.length / totalCount) * 100;
  const medPct = (tierGroups.medium.length / totalCount) * 100;
  const lowPct = (tierGroups.low.length / totalCount) * 100;

  const handicapPredictions = useMemo(
    () =>
      predictions.filter(
        (p) =>
          p.marketCategory === 'handicap' ||
          p.optionType === 'asian_handicap' ||
          p.optionType === 'european_handicap'
      ),
    [predictions]
  );

  const safestHomeHandicap = useMemo(() => {
    const homeLines = handicapPredictions.filter(
      (p) => p.handicapType === 'asian' && p.selection.includes(homeTeamName)
    );
    return homeLines.sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [handicapPredictions, homeTeamName]);

  const safestAwayHandicap = useMemo(() => {
    const awayLines = handicapPredictions.filter(
      (p) => p.handicapType === 'asian' && p.selection.includes(awayTeamName)
    );
    return awayLines.sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [handicapPredictions, awayTeamName]);

  const goalBoundsPredictions = useMemo(
    () => predictions.filter((p) => p.marketCategory === 'goal_bounds'),
    [predictions]
  );

  const mostLikelyGoalBand = useMemo(
    () =>
      goalBoundsPredictions
        .filter((p) => p.selection.includes('Exact') || p.selection.includes('goals') || p.selection.includes('to'))
        .sort((a, b) => b.modelProbability - a.modelProbability)[0],
    [goalBoundsPredictions]
  );

  const safestWideBand = useMemo(
    () =>
      goalBoundsPredictions
        .filter(
          (p) =>
            p.selection.includes('2 to 4') ||
            p.selection.includes('1 to 3') ||
            p.selection.includes('2 to 5') ||
            p.selection.includes('Wide')
        )
        .sort((a, b) => b.modelProbability - a.modelProbability)[0],
    [goalBoundsPredictions]
  );

  const multiGoalsPredictions = useMemo(
    () => predictions.filter((p) => p.marketCategory === 'multi_goals'),
    [predictions]
  );

  const topFullMatchMultiGoals = useMemo(
    () =>
      multiGoalsPredictions
        .filter((p) => p.multiGoalsMeta?.scope === 'full_match' && ((p.multiGoalsMeta?.span ?? 5) <= 3 || ((p.multiGoalsMeta?.span ?? 5) === 4 && (p.calibratedProbability ?? p.modelProbability) > 0.80)))
        .sort((a, b) => (b.calibratedProbability ?? b.modelProbability) - (a.calibratedProbability ?? a.modelProbability))[0],
    [multiGoalsPredictions]
  );

  const topTeamMultiGoals = useMemo(
    () =>
      multiGoalsPredictions
        .filter((p) => p.multiGoalsMeta?.scope === 'home' || p.multiGoalsMeta?.scope === 'away')
        .sort((a, b) => (b.calibratedProbability ?? b.modelProbability) - (a.calibratedProbability ?? a.modelProbability))[0],
    [multiGoalsPredictions]
  );

  const halfPredictions = useMemo(
    () => predictions.filter((p) => p.marketCategory === 'half_time'),
    [predictions]
  );

  const hasHalfData = halfPredictions.length > 0;

  const filteredList = useMemo(() => {
    let list = [...predictions];
    if (marketFilter !== 'ALL') {
      list = list.filter((p) => p.marketCategory === marketFilter || p.optionType === marketFilter);
    }
    return list.sort((a, b) => {
      const pA = a.calibratedProbability ?? a.modelProbability;
      const pB = b.calibratedProbability ?? b.modelProbability;
      return sortAsc ? pA - pB : pB - pA;
    });
  }, [predictions, marketFilter, sortAsc]);

  const renderPredictionRow = (pred: MarketPrediction) => {
    const isSelected = selectedPredictionId === pred.id;
    const isExpanded = expandedId === pred.id;
    const probPct = (pred.calibratedProbability ?? pred.modelProbability) * 100;
    const oddsFormatted = pred.marketOdds ? formatOdds(pred.marketOdds) : '—';
    const evFormatted = formatExpectedValue(pred.expectedValue);

    const tier = (pred.confidenceTier || pred.riskTier || '').toUpperCase();
    const barColor =
      tier === 'HIGH' || tier === 'SAFE'
        ? 'bg-[var(--accent-fill)]'
        : tier === 'MEDIUM' || tier === 'MODERATE'
        ? 'bg-[var(--medium)]'
        : 'bg-[var(--muted)]';

    const refSummary = (() => {
      const ref = pred.evidence?.referee;
      if (!ref) return null;
      if (!ref.leagueBaseline || ref.leagueBaseline <= 0) {
        return ref.announced && ref.name ? `Referee ${ref.name}` : 'Referee unannounced';
      }
      return cleanDisplayText(ref.explanation);
    })();

    return (
      <div
        key={pred.id}
        className={`transition-colors border-b border-[var(--line)] last:border-b-0 ${
          isSelected ? 'bg-[var(--accent-soft)]' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => handleRowClick(pred)}
          aria-expanded={isExpanded}
          className="w-full min-h-[52px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--surface-2)]/70 transition-colors touch-press"
        >
          {/* Left: Market name & subtext */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`font-display font-semibold truncate text-[13.5px] leading-snug ${
                  isSelected ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                }`}
              >
                {cleanDisplayText(pred.selection)}
              </span>
              {pred.isSpeculative && (
                <span className="text-[10.5px] px-1.5 py-0.5 bg-[var(--medium-soft)] text-[var(--medium)] rounded-full border border-[var(--medium)]/30 shrink-0 font-semibold">
                  Speculative
                </span>
              )}
              {pred.handicapLine !== undefined && (
                <span className="text-[10.5px] px-1.5 py-0.5 bg-[var(--surface-2)] text-[var(--text-2)] rounded-full border border-[var(--line)] tabular-nums shrink-0">
                  {cleanDisplayText(pred.handicapLine > 0 ? `+${pred.handicapLine}` : `${pred.handicapLine}`)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-2)] mt-0.5 truncate">
              <span>{cleanDisplayText(getOptionTypeLabel(pred.optionType))}</span>
              <span>·</span>
              <span>{cleanDisplayText(getPeriodLabel(pred.period))}</span>
              {pred.marketOdds && pred.marketOdds > 1.0 ? (
                <>
                  <span>·</span>
                  <span className="tabular-nums text-[var(--text)]">@{oddsFormatted}</span>
                </>
              ) : (
                <>
                  <span>·</span>
                  <span>{pred.priceSource ? cleanDisplayText(pred.priceSource) : 'Probability only'}</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Right-aligned probability + mini bar + chevron */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex flex-col items-end gap-1">
              <span className="font-display text-[14px] font-bold text-[var(--text)] tabular-nums leading-none">
                {probPct.toFixed(1)}%
              </span>
              <div className="w-14 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, probPct))}%` }}
                />
              </div>
            </div>

            <div className="w-5 h-5 flex items-center justify-center text-[var(--text-2)] shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-[var(--text)]" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </div>
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-2 bg-[var(--surface-2)]/70 border-t border-[var(--line)] text-[12px] space-y-2">
            {pred.settlementStatus && pred.settlementStatus !== 'PENDING' && (
              <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--line)] text-[11.5px] flex items-center justify-between gap-2">
                <span className="text-[var(--text-2)]">Settlement outcome</span>
                <span
                  className={`font-semibold ${
                    pred.settlementStatus === 'WON'
                      ? 'text-[var(--accent)]'
                      : pred.settlementStatus === 'LOST'
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--medium)]'
                  }`}
                >
                  {cleanDisplayText(pred.lineComparisonText || pred.settlementStatus)}
                </span>
              </div>
            )}

            <div className="text-[12px] text-[var(--text-2)] leading-[1.5]">
              <span className="text-[var(--text)] font-medium">Settlement rule: </span>
              {cleanDisplayText(pred.settlementRule)}
            </div>

            {pred.plainEnglishReason && (
              <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--line)] text-[12px] text-[var(--text)] leading-[1.5]">
                <span className="text-[var(--accent)] font-semibold block text-[11px] mb-0.5">
                  Model rationale
                </span>
                {cleanDisplayText(pred.plainEnglishReason)}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--text-2)] tabular-nums">
              <div>
                <span>Odds: </span>
                <span className="text-[var(--text)] font-medium">
                  {pred.marketOdds && pred.marketOdds > 1.0 ? `@${oddsFormatted}` : 'No price'}
                </span>
              </div>
              {pred.marketOdds && pred.marketOdds > 1.0 && pred.expectedValue !== null && pred.expectedValue !== undefined && (
                <div>
                  <span>EV: </span>
                  <span className={`font-semibold ${evFormatted.colorClass}`}>
                    {cleanDisplayText(evFormatted.text)}
                  </span>
                </div>
              )}
              <div>
                <span>Confidence: </span>
                <span className="text-[var(--text)] font-medium">
                  {((pred.confidenceScore ?? 0.75) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {pred.evidence && (
              <div className="p-2.5 rounded-[10px] bg-[var(--surface)] border border-[var(--line)] text-[11px] text-[var(--text-2)] space-y-1">
                <div className="text-[var(--text)]">{cleanDisplayText(pred.evidence.whyLineChosen)}</div>
                {refSummary && <div>{refSummary}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const tierSections = [
    {
      key: 'high' as const,
      title: 'High confidence',
      description: 'Narrow variance bounds and high sample depth',
      dotColor: 'bg-[var(--accent)]',
      titleColor: 'text-[var(--accent)]',
      items: tierGroups.high,
      emptyText: 'No lines met the high confidence criteria for this fixture.',
    },
    {
      key: 'medium' as const,
      title: 'Medium confidence',
      description: 'Balanced probability with moderate market spread',
      dotColor: 'bg-[var(--medium)]',
      titleColor: 'text-[var(--medium)]',
      items: tierGroups.medium,
      emptyText: 'No lines classified in the medium confidence tier.',
    },
    {
      key: 'low' as const,
      title: 'Low confidence',
      description: 'Higher variance, longshots, or active risk flags',
      dotColor: 'bg-[var(--muted)]',
      titleColor: 'text-[var(--text)]',
      items: tierGroups.low,
      emptyText: 'No low confidence lines.',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="space-y-0.5 px-0.5">
        <h2 className="font-display text-[18px] font-bold text-[var(--text)] tracking-[-0.015em]">
          Market intel
        </h2>
        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          {predictions.length} calibrated lines evaluated from Dixon Coles and volume models.
        </p>
      </div>

      {/* Tier Summary Card: Stacked proportional bar + 3 rows computed from single source of truth */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
            Confidence tiers
          </h3>
          <span className="text-[11px] text-[var(--text-2)] tabular-nums">
            {tierGroups.total} total lines
          </span>
        </div>

        {/* Stacked proportional bar */}
        <div
          className="w-full h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden flex gap-[2px]"
          role="img"
          aria-label={`High ${tierGroups.high.length}, Medium ${tierGroups.medium.length}, Low ${tierGroups.low.length} lines`}
        >
          {tierGroups.high.length > 0 && (
            <div
              className="h-full bg-[var(--accent-fill)] transition-all duration-300"
              style={{ width: `${highPct}%` }}
            />
          )}
          {tierGroups.medium.length > 0 && (
            <div
              className="h-full bg-[var(--medium)] transition-all duration-300"
              style={{ width: `${medPct}%` }}
            />
          )}
          {tierGroups.low.length > 0 && (
            <div
              className="h-full bg-[var(--muted)] transition-all duration-300"
              style={{ width: `${lowPct}%` }}
            />
          )}
        </div>

        {/* 3 Summary Rows */}
        <div className="divide-y divide-[var(--line)]">
          {tierSections.map((sec) => (
            <div key={sec.key} className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sec.dotColor}`} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text)] leading-tight">
                    {sec.title}
                  </div>
                  <p className="text-[11.5px] text-[var(--text-2)] truncate mt-0.5">
                    {sec.description}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text)] tabular-nums shrink-0 font-semibold">
                {sec.items.length} {sec.items.length === 1 ? 'line' : 'lines'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Segmented Control (By tier / Special markets / All lines) */}
      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-[14px] bg-[var(--surface-2)] border border-[var(--line)]"
        role="tablist"
        aria-label="Market view mode"
      >
        {(
          [
            { id: 'TIER_GROUPED' as const, label: 'By tier' },
            { id: 'MARKET_SECTIONS' as const, label: 'Special markets' },
            { id: 'ALL_LINES' as const, label: 'All lines' },
          ]
        ).map((seg) => {
          const active = viewMode === seg.id;
          return (
            <button
              key={seg.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setViewMode(seg.id)}
              className={`min-h-[44px] px-2 rounded-[10px] text-[12px] font-medium transition-colors touch-press ${
                active
                  ? 'bg-[var(--surface)] text-[var(--accent)] font-semibold border border-[var(--line)]'
                  : 'text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {/* VIEW MODE 1: BY TIER (Collapsible sections matching exact counts) */}
      {viewMode === 'TIER_GROUPED' && (
        <div className="space-y-3">
          {tierSections.map((sec) => {
            const isOpen = openTiers[sec.key];
            return (
              <section
                key={sec.key}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleTierSection(sec.key)}
                  aria-expanded={isOpen}
                  className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-[var(--surface-2)]/60 transition-colors touch-press"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sec.dotColor}`} />
                    <h4 className={`font-display text-[14px] font-semibold truncate ${sec.titleColor}`}>
                      {sec.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums font-medium">
                      {sec.items.length} {sec.items.length === 1 ? 'line' : 'lines'}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-[var(--text-2)]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--line)]">
                    {sec.items.length > 0 ? (
                      <div>{sec.items.map(renderPredictionRow)}</div>
                    ) : (
                      <div className="px-4 py-4 text-[12px] text-[var(--text-3)] text-center bg-[var(--surface-2)]/30">
                        {sec.emptyText}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: SPECIAL MARKETS */}
      {viewMode === 'MARKET_SECTIONS' && (
        <div className="space-y-3">
          {/* Handicap section */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
                  Handicap intel
                </h4>
              </div>

              <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-[12px] border border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setHandicapMode('asian')}
                  className={`min-h-[36px] px-3 rounded-[8px] text-[11.5px] font-medium touch-press ${
                    handicapMode === 'asian'
                      ? 'bg-[var(--surface)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-2)]'
                  }`}
                >
                  Asian
                </button>
                <button
                  type="button"
                  onClick={() => setHandicapMode('european')}
                  className={`min-h-[36px] px-3 rounded-[8px] text-[11.5px] font-medium touch-press ${
                    handicapMode === 'european'
                      ? 'bg-[var(--surface)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-2)]'
                  }`}
                >
                  European
                </button>
              </div>
            </div>

            {(safestHomeHandicap || safestAwayHandicap) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {safestHomeHandicap && (
                  <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1">
                    <div className="text-[11px] text-[var(--text-2)]">
                      Top {cleanDisplayText(homeTeamName)} line
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(safestHomeHandicap.selection)}
                      </span>
                      <span className="font-display text-[14px] text-[var(--accent)] font-bold tabular-nums">
                        {(safestHomeHandicap.modelProbability * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}

                {safestAwayHandicap && (
                  <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1">
                    <div className="text-[11px] text-[var(--text-2)]">
                      Top {cleanDisplayText(awayTeamName)} line
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(safestAwayHandicap.selection)}
                      </span>
                      <span className="font-display text-[14px] text-[var(--accent)] font-bold tabular-nums">
                        {(safestAwayHandicap.modelProbability * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border border-[var(--line)] rounded-[12px] overflow-hidden">
              {handicapPredictions.filter((p) => p.handicapType === handicapMode).length > 0 ? (
                handicapPredictions
                  .filter((p) => p.handicapType === handicapMode)
                  .map(renderPredictionRow)
              ) : (
                <div className="p-4 text-center text-[12px] text-[var(--text-3)]">
                  No handicap lines evaluated for this mode.
                </div>
              )}
            </div>
          </div>

          {/* Multi goals */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
                  Multi goals
                </h4>
              </div>
              <span className="text-[11px] text-[var(--text-2)]">
                {multiGoalsPredictions.some((p) => p.isSpeculative)
                  ? 'Speculative · Unvalidated league'
                  : 'Model line, no market price'}
              </span>
            </div>

            {(topFullMatchMultiGoals || topTeamMultiGoals) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {topFullMatchMultiGoals && (
                  <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1">
                    <div className="text-[11px] text-[var(--text-2)]">
                      Top full match band (width {topFullMatchMultiGoals.multiGoalsMeta?.span ?? 3})
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(topFullMatchMultiGoals.selection)}
                      </span>
                      <span className="font-display text-[14px] text-[var(--accent)] font-bold tabular-nums">
                        {((topFullMatchMultiGoals.calibratedProbability ?? topFullMatchMultiGoals.modelProbability) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

                {topTeamMultiGoals && (
                  <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1">
                    <div className="text-[11px] text-[var(--text-2)]">
                      Top team band (width {topTeamMultiGoals.multiGoalsMeta?.span ?? 2})
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(topTeamMultiGoals.selection)}
                      </span>
                      <span className="font-display text-[14px] text-[var(--accent)] font-bold tabular-nums">
                        {((topTeamMultiGoals.calibratedProbability ?? topTeamMultiGoals.modelProbability) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border border-[var(--line)] rounded-[12px] overflow-hidden">
              {multiGoalsPredictions.length > 0 ? (
                multiGoalsPredictions.map(renderPredictionRow)
              ) : (
                <div className="p-4 text-center text-[12px] text-[var(--text-3)]">
                  No multi goals bands evaluated.
                </div>
              )}
            </div>
          </div>

          {/* Goal bounds */}
          {goalBoundsPredictions.length > 0 && (
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
                  Goal bounds
                </h4>
              </div>
              <span className="text-[11px] text-[var(--text-2)]">Non overlapping bands</span>
            </div>

            {(mostLikelyGoalBand || safestWideBand) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {mostLikelyGoalBand && (
                  <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1">
                    <div className="text-[11px] text-[var(--text-2)]">Most likely band</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(mostLikelyGoalBand.selection)}
                      </span>
                      <span className="font-display text-[14px] text-[var(--accent)] font-bold tabular-nums">
                        {(mostLikelyGoalBand.modelProbability * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}

                {safestWideBand && (
                  <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1">
                    <div className="text-[11px] text-[var(--text-2)]">Wide band cushion</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {cleanDisplayText(safestWideBand.selection)}
                      </span>
                      <span className="font-display text-[14px] text-[var(--accent)] font-bold tabular-nums">
                        {(safestWideBand.modelProbability * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border border-[var(--line)] rounded-[12px] overflow-hidden">
              {goalBoundsPredictions.map(renderPredictionRow)}
            </div>
          </div>
          )}

          {/* Halves analysis */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
                  Half by half breakdown
                </h4>
              </div>
              <span className="text-[11px] text-[var(--text-2)]">
                {hasHalfData ? 'Empirically calibrated' : 'Insufficient split data'}
              </span>
            </div>

            {hasHalfData ? (
              <div className="border border-[var(--line)] rounded-[12px] overflow-hidden">
                {halfPredictions.map(renderPredictionRow)}
              </div>
            ) : (
              <div className="p-4 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-center text-[12px] text-[var(--text-2)] space-y-1">
                <AlertTriangle className="w-4 h-4 text-[var(--medium)] mx-auto" />
                <p className="font-semibold text-[var(--text)]">Insufficient half split data</p>
                <p>
                  Half level goal records for {homeTeamName} and {awayTeamName} are unavailable. Engine abstains.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE 3: ALL LINES */}
      {viewMode === 'ALL_LINES' && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] overflow-hidden">
          <div className="border-b border-[var(--line)] bg-[var(--surface-2)]/60 py-2 px-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {[
                'ALL',
                'match_result',
                'double_chance',
                'handicap',
                'total_goals',
                'multi_goals',
                'half_time',
                'total_corners',
                'bookings',
              ].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMarketFilter(cat)}
                  type="button"
                  className={`min-h-[36px] px-3 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap touch-press shrink-0 border ${
                    marketFilter === cat
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface)] text-[var(--text-2)] border-[var(--line)]'
                  }`}
                >
                  {cat === 'ALL' ? 'All' : cat === 'bookings' ? 'Cards' : cleanDisplayText(cat)}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSortAsc(!sortAsc)}
              type="button"
              className="min-h-[36px] px-2.5 flex items-center gap-1 text-[11.5px] text-[var(--text-2)] hover:text-[var(--text)] shrink-0 touch-press"
            >
              <span>Prob</span>
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            {filteredList.length > 0 ? (
              filteredList.map(renderPredictionRow)
            ) : (
              <div className="p-5 text-center text-[12.5px] text-[var(--text-3)]">
                No markets match this category filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statistical Estimate Disclaimer */}
      <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[14px] text-[11.5px] text-[var(--text-2)] flex items-center gap-2">
        <Info className="w-4 h-4 text-[var(--text-3)] shrink-0" />
        <span>
          Statistical estimates derived from Dixon Coles parameters; outcomes are never guaranteed.
        </span>
      </div>
    </div>
  );
}
