'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Lock, Sparkles, ArrowUpRight } from 'lucide-react';
import { ExplanationDriverTile, WrittenMatchExplanation } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { formatMonthlyPrice } from '@/lib/tiers';
import {
  getMarketEvidenceFamily,
  resolveBasketballTargetScope,
  resolveFootballTargetScope,
} from '@/lib/prediction/explanationValidator';

interface Props {
  open: boolean;
  onClose: () => void;
  matchTitle: string;
  pickLabel?: string;
  explanation?: WrittenMatchExplanation;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function resolveDriverTiles(explanation: WrittenMatchExplanation): ExplanationDriverTile[] {
  if (Array.isArray(explanation.driverTiles) && explanation.driverTiles.length > 0) {
    return explanation.driverTiles.slice(0, 4);
  }
  const reasoning = explanation.reasoning;
  if (!reasoning || typeof reasoning !== 'object') return [];
  const items: ExplanationDriverTile[] = [];

  if (reasoning.sport === 'football') {
    const family =
      (reasoning.marketEvidenceFamily as ReturnType<typeof getMarketEvidenceFamily> | undefined) ||
      getMarketEvidenceFamily(reasoning.topPick, 'football');
    const homeTeam = cleanDisplayText(String(reasoning.homeTeam || 'Home'));
    const awayTeam = cleanDisplayText(String(reasoning.awayTeam || 'Away'));
    const fbScope = reasoning.topPick?.marketCode
      ? resolveFootballTargetScope({
          marketCode: reasoning.topPick.marketCode,
          selection: reasoning.topPick.selection,
          homeTeam,
          awayTeam,
          period: reasoning.topPick.period,
          side: reasoning.topPick.side,
          multiGoalsMeta: reasoning.topPick.multiGoalsMeta,
        })
      : { scope: 'match' as const, period: 'regular' as const, isTeamScoped: false };

    if (family === 'cards') {
      if (fbScope.scope === 'home' && typeof reasoning.expectedCardsHome === 'number') {
        items.push({ label: `${homeTeam} expected cards`, value: `${reasoning.expectedCardsHome.toFixed(2)} cards` });
      } else if (fbScope.scope === 'away' && typeof reasoning.expectedCardsAway === 'number') {
        items.push({ label: `${awayTeam} expected cards`, value: `${reasoning.expectedCardsAway.toFixed(2)} cards` });
      } else if (!fbScope.isTeamScoped && typeof reasoning.expectedCards === 'number') {
        items.push({ label: 'Projected total cards', value: `${reasoning.expectedCards.toFixed(2)} cards` });
      }
      if (reasoning.referee && typeof reasoning.refereeShrunkRate === 'number') {
        items.push({
          label: 'Referee average',
          value: `${cleanDisplayText(reasoning.referee)} (${reasoning.refereeShrunkRate.toFixed(2)})`,
        });
      } else if (typeof reasoning.refereeLeagueBaseline === 'number' && reasoning.refereeLeagueBaseline > 0) {
        items.push({
          label: 'Referee',
          value: `Unannounced (${reasoning.refereeLeagueBaseline.toFixed(2)} avg)`,
        });
      } else {
        items.push({ label: 'Referee', value: 'Unannounced' });
      }
      if (
        !fbScope.isTeamScoped &&
        typeof reasoning.h2hCardsMeetingsCount === 'number' &&
        reasoning.h2hCardsMeetingsCount >= 3 &&
        typeof reasoning.h2hAvgTotalCards === 'number'
      ) {
        items.push({
          label: `H2H (${reasoning.h2hCardsMeetingsCount} meetings)`,
          value: `${reasoning.h2hAvgTotalCards.toFixed(2)} cards`,
        });
      }
    } else if (family === 'corners') {
      if (fbScope.scope === 'home' && typeof reasoning.expectedCornersHome === 'number') {
        items.push({
          label: `${homeTeam} expected corners`,
          value: `${reasoning.expectedCornersHome.toFixed(1)} corners`,
        });
      } else if (fbScope.scope === 'away' && typeof reasoning.expectedCornersAway === 'number') {
        items.push({
          label: `${awayTeam} expected corners`,
          value: `${reasoning.expectedCornersAway.toFixed(1)} corners`,
        });
      } else if (
        !fbScope.isTeamScoped &&
        typeof reasoning.expectedCornersHome === 'number' &&
        typeof reasoning.expectedCornersAway === 'number'
      ) {
        items.push({
          label: 'Projected corners',
          value: `${(reasoning.expectedCornersHome + reasoning.expectedCornersAway).toFixed(1)} (${reasoning.expectedCornersHome.toFixed(1)} + ${reasoning.expectedCornersAway.toFixed(1)})`,
        });
      }
      if (
        !fbScope.isTeamScoped &&
        typeof reasoning.h2hCornersMeetingsCount === 'number' &&
        reasoning.h2hCornersMeetingsCount >= 3 &&
        typeof reasoning.h2hAvgTotalCorners === 'number'
      ) {
        items.push({
          label: `H2H (${reasoning.h2hCornersMeetingsCount} meetings)`,
          value: `${reasoning.h2hAvgTotalCorners.toFixed(1)} corners`,
        });
      }
    } else {
      if (fbScope.scope === 'home' && typeof reasoning.homeXg === 'number') {
        items.push({
          label: `${homeTeam} expected goals`,
          value: `${reasoning.homeXg.toFixed(2)} xG`,
        });
      } else if (fbScope.scope === 'away' && typeof reasoning.awayXg === 'number') {
        items.push({
          label: `${awayTeam} expected goals`,
          value: `${reasoning.awayXg.toFixed(2)} xG`,
        });
      } else if (
        fbScope.period === 'first_half' &&
        typeof reasoning.homeXg === 'number' &&
        typeof reasoning.awayXg === 'number'
      ) {
        items.push({
          label: '1st half expected goals',
          value: `${((reasoning.homeXg + reasoning.awayXg) * 0.45).toFixed(2)} goals`,
        });
      } else if (typeof reasoning.homeXg === 'number' && typeof reasoning.awayXg === 'number') {
        items.push({
          label: 'Expected goals',
          value: `${reasoning.homeXg.toFixed(2)} vs ${reasoning.awayXg.toFixed(2)}`,
        });
      }
      if (
        !fbScope.isTeamScoped &&
        fbScope.period !== 'first_half' &&
        typeof reasoning.h2hMeetingsCount === 'number' &&
        reasoning.h2hMeetingsCount >= 3 &&
        typeof reasoning.h2hAvgTotalGoals === 'number'
      ) {
        items.push({
          label: `H2H (${reasoning.h2hMeetingsCount} meetings)`,
          value: `${reasoning.h2hAvgTotalGoals.toFixed(2)} goals`,
        });
      }
      if (reasoning.topPick?.multiGoalsMeta?.band) {
        items.push({
          label: 'Goal band',
          value: `${reasoning.topPick.multiGoalsMeta.band} (width ${reasoning.topPick.multiGoalsMeta.span})`,
        });
      }
    }

    if (fbScope.scope === 'home' && typeof reasoning.homeSampleMatches === 'number') {
      items.push({
        label: 'Sample depth',
        value: `${reasoning.homeSampleMatches} ${homeTeam} matches`,
      });
    } else if (fbScope.scope === 'away' && typeof reasoning.awaySampleMatches === 'number') {
      items.push({
        label: 'Sample depth',
        value: `${reasoning.awaySampleMatches} ${awayTeam} matches`,
      });
    } else if (typeof reasoning.homeSampleMatches === 'number' && typeof reasoning.awaySampleMatches === 'number') {
      items.push({
        label: 'Sample depth',
        value: `${reasoning.homeSampleMatches}H / ${reasoning.awaySampleMatches}A matches`,
      });
    }
  } else if (reasoning.sport === 'basketball') {
    const homeTeam = cleanDisplayText(String(reasoning.homeTeam || 'Home'));
    const awayTeam = cleanDisplayText(String(reasoning.awayTeam || 'Away'));
    const bbScope = resolveBasketballTargetScope({
      marketCode: reasoning.topPick?.marketCode,
      marketCategory: reasoning.topPick?.marketCategory,
      side: reasoning.topPick?.side,
    });
    if (bbScope.scope === 'home_total' && typeof reasoning.homeProjected === 'number') {
      items.push({ label: `${homeTeam} projected`, value: `${reasoning.homeProjected.toFixed(1)} pts` });
    } else if (bbScope.scope === 'away_total' && typeof reasoning.awayProjected === 'number') {
      items.push({ label: `${awayTeam} projected`, value: `${reasoning.awayProjected.toFixed(1)} pts` });
    } else if (bbScope.scope === 'h1_team_total') {
      const targetTeam = bbScope.side === 'away' ? awayTeam : homeTeam;
      const mean = typeof reasoning.topPick?.projectedMean === 'number' ? reasoning.topPick.projectedMean : undefined;
      if (mean !== undefined) {
        items.push({ label: `1st half ${targetTeam}`, value: `${mean.toFixed(1)} pts` });
      }
    } else if (bbScope.scope === 'h1_game_total') {
      const mean = typeof reasoning.h1ProjectedTotal === 'number' ? reasoning.h1ProjectedTotal : reasoning.topPick?.projectedMean;
      if (typeof mean === 'number') {
        items.push({ label: '1st half projected total', value: `${mean.toFixed(1)} pts` });
      }
    } else {
      if (typeof reasoning.projectedTotal === 'number') {
        items.push({ label: 'Projected total', value: `${reasoning.projectedTotal.toFixed(1)} pts` });
      }
      if (typeof reasoning.homeProjected === 'number' && typeof reasoning.awayProjected === 'number') {
        items.push({
          label: 'Split projection',
          value: `${reasoning.homeProjected.toFixed(1)} / ${reasoning.awayProjected.toFixed(1)}`,
        });
      }
    }
    if (bbScope.targetSide === 'home' && typeof reasoning.homeGamesPlayed === 'number') {
      items.push({ label: 'Sample depth', value: `${reasoning.homeGamesPlayed} ${homeTeam} games` });
    } else if (bbScope.targetSide === 'away' && typeof reasoning.awayGamesPlayed === 'number') {
      items.push({ label: 'Sample depth', value: `${reasoning.awayGamesPlayed} ${awayTeam} games` });
    } else if (typeof reasoning.homeGamesPlayed === 'number' && typeof reasoning.awayGamesPlayed === 'number') {
      items.push({
        label: 'Sample depth',
        value: `${reasoning.homeGamesPlayed}H / ${reasoning.awayGamesPlayed}A games`,
      });
    }
  }

  return items.slice(0, 4);
}

function formatTierPill(tier?: string) {
  const upper = String(tier || '').toUpperCase();
  if (upper === 'HIGH') {
    return {
      label: 'High confidence',
      className: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30',
    };
  }
  if (upper === 'MEDIUM') {
    return {
      label: 'Medium confidence',
      className: 'bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30',
    };
  }
  if (upper === 'LOW') {
    return {
      label: 'Low confidence',
      className: 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30',
    };
  }
  return null;
}

export default function WhyThisPickSheet({
  open,
  onClose,
  matchTitle,
  pickLabel,
  explanation,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const previousFocused = document.activeElement as HTMLElement | null;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const panelEl = panelRef.current;
    const focusTimer = window.setTimeout(() => {
      if (!panelEl) return;
      const focusables = panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panelEl.focus();
      }
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelEl) {
        const focusables = Array.from(panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panelEl.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !panelEl.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !panelEl.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.touchAction = prevBodyTouchAction;
      setDragOffsetY(0);
      if (previousFocused && typeof previousFocused.focus === 'function') {
        previousFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!mounted || !open || !explanation) return null;

  const drivers = resolveDriverTiles(explanation);
  const rawProb =
    typeof explanation.rawProbability === 'number'
      ? explanation.rawProbability
      : typeof explanation.reasoning?.topPick?.rawProbability === 'number'
      ? explanation.reasoning.topPick.rawProbability
      : undefined;
  const calProb =
    typeof explanation.activePickProbability === 'number'
      ? explanation.activePickProbability
      : typeof explanation.calibratedProbability === 'number'
      ? explanation.calibratedProbability
      : typeof explanation.reasoning?.topPick?.calibratedProbability === 'number'
      ? explanation.reasoning.topPick.calibratedProbability
      : undefined;
  const showCalibrationComparison =
    typeof rawProb === 'number' &&
    typeof calProb === 'number' &&
    Math.abs(rawProb - calProb) >= 0.001;

  const confidenceTier =
    explanation.activePickTier ||
    explanation.confidenceTier ||
    explanation.reasoning?.topPick?.confidenceTier;
  const confidenceReason =
    explanation.confidenceReason || explanation.reasoning?.topPick?.confidenceReason;
  const tierBadge = formatTierPill(confidenceTier);
  const isExperimentalPick = Boolean(
    explanation.reasoning?.topPick?.experimentalLabel ||
      explanation.reasoning?.topPick?.goalRunsMeta ||
      explanation.reasoning?.marketEvidenceFamily === 'goal_runs'
  );
  const headerPickLabel = explanation.activePickSelection || pickLabel;
  const headerMarketScope = cleanDisplayText(
    explanation.activePickMarketScope || explanation.reasoning?.topPick?.marketScope || ''
  );
  const marketBoard = !explanation.tierLocked && Array.isArray(explanation.marketBoard)
    ? explanation.marketBoard
    : [];

  const handleTouchStart = (e: React.TouchEvent, forceAllow: boolean) => {
    if (e.touches.length !== 1) return;
    const scrollTop = bodyScrollRef.current?.scrollTop ?? 0;
    if (!forceAllow && scrollTop > 2) return;
    touchStartYRef.current = e.touches[0].clientY;
    draggingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingRef.current || touchStartYRef.current === null) return;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY > 0) {
      setDragOffsetY(Math.min(deltaY, 240));
    } else {
      setDragOffsetY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    touchStartYRef.current = null;
    if (dragOffsetY > 70) {
      setDragOffsetY(0);
      onClose();
    } else {
      setDragOffsetY(0);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4"
      style={{ zIndex: 120 }}
      role="dialog"
      aria-modal="true"
      aria-label="Model explanation"
      data-testid="why-this-pick-backdrop"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="why-this-pick-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
          transition: draggingRef.current ? 'none' : 'transform 160ms ease-out',
        }}
        className="w-full sm:max-w-lg bg-[#111815] border-t sm:border border-[var(--line)] rounded-t-[20px] sm:rounded-[20px] max-h-[88dvh] flex flex-col overflow-hidden shadow-2xl focus:outline-none"
      >
        {/* Drag handle & Header */}
        <div
          className="px-5 pt-2.5 pb-3 shrink-0 select-none"
          onTouchStart={(e) => handleTouchStart(e, true)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            aria-hidden="true"
            className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-3"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent)]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Model explanation</span>
                </div>
                {isExperimentalPick && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30">
                    Experimental
                  </span>
                )}
                {tierBadge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${tierBadge.className}`}
                  >
                    {tierBadge.label}
                  </span>
                )}
                {headerMarketScope && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]">
                    {headerMarketScope}
                  </span>
                )}
              </div>
              <h3 className="font-display text-[17px] font-bold text-[var(--text)] leading-snug truncate">
                {cleanDisplayText(matchTitle)}
              </h3>
              {headerPickLabel && (
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-[12.5px] font-semibold text-[var(--text-2)] break-words leading-snug">
                    {cleanDisplayText(headerPickLabel)}
                  </p>
                  {typeof calProb === 'number' && (
                    <span className="text-[12px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                      {(calProb * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-[12px] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] touch-press"
              aria-label="Close explanation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Sheet Body */}
        <div
          ref={bodyScrollRef}
          onTouchStart={(e) => handleTouchStart(e, false)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 space-y-3"
          style={
            !explanation.tierLocked
              ? { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }
              : { paddingBottom: '12px' }
          }
        >
          <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3.5 space-y-2 text-[13px] leading-[1.55] text-[var(--text)]">
            <p>
              {cleanDisplayText(
                explanation.tierLocked
                  ? explanation.oneLineSummary
                  : explanation.fullSummary || explanation.oneLineSummary
              )}
            </p>
            {explanation.headlineSelectionReason && (
              <p className="text-[11.5px] text-[var(--text-2)] leading-[1.45]">
                {cleanDisplayText(explanation.headlineSelectionReason)}
              </p>
            )}
            {confidenceTier === 'LOW' && confidenceReason && (
              <p className="text-[12px] text-[var(--danger)] font-medium">
                {cleanDisplayText(`Confidence note: ${confidenceReason}.`)}
              </p>
            )}
            {showCalibrationComparison && (
              <p className="text-[11.5px] text-[var(--text-2)] tabular-nums">
                Raw model {(rawProb! * 100).toFixed(1)}% · Calibrated {(calProb! * 100).toFixed(1)}%
              </p>
            )}
          </div>

          {explanation.tierLocked ? (
            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[14px] p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--medium)]">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Full model reasoning locked</span>
              </div>
              <p className="text-[12.5px] leading-[1.45] text-[var(--text-2)]">
                Pro ({formatMonthlyPrice('pro')}) unlocks model drivers, the full market board, and the next 2 alternate picks.
              </p>
            </div>
          ) : (
            <>
              {drivers.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {drivers.map((d) => (
                    <div
                      key={d.label}
                      className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-2.5"
                    >
                      <div className="text-[10.5px] text-[var(--text-3)]">{cleanDisplayText(d.label)}</div>
                      <div className="text-[12.5px] font-semibold text-[var(--text)] tabular-nums mt-0.5 truncate">
                        {cleanDisplayText(d.value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {explanation.alternates && explanation.alternates.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[12px] font-semibold text-[var(--text-2)]">
                    Next 2 best alternates
                  </div>
                  <div className="border border-[var(--line)] rounded-[12px] divide-y divide-[var(--line)] overflow-hidden">
                    {explanation.alternates.slice(0, 2).map((alt) => (
                      <div
                        key={alt.marketCode}
                        data-testid={`alternate-row-${alt.marketCode}`}
                        className="min-h-[48px] px-3 py-2.5 bg-[var(--surface-2)] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--text)] break-words leading-snug">
                            {cleanDisplayText(alt.selection)}
                          </div>
                          <div className="text-[10.5px] text-[var(--text-3)] leading-snug">
                            {cleanDisplayText(alt.marketScope || alt.marketName)}
                          </div>
                        </div>
                        <span className="font-display text-[14px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                          {(alt.probability * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {marketBoard.length > 0 && (
                <div className="space-y-2" data-testid="market-board-section">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-[var(--text-2)]">
                      Market board
                    </div>
                    <span className="text-[11px] text-[var(--text-3)] tabular-nums">
                      {marketBoard.length} markets
                    </span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto border border-[var(--line)] rounded-[12px] divide-y divide-[var(--line)] bg-[var(--surface-2)]">
                    {marketBoard.map((entry) => (
                      <div
                        key={entry.marketCode}
                        data-testid={`market-board-row-${entry.marketCode}`}
                        className="px-3 py-2.5 flex items-start justify-between gap-2.5"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12.5px] font-semibold text-[var(--text)] break-words leading-snug">
                              {cleanDisplayText(entry.selection)}
                            </span>
                            {entry.isExperimental && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30">
                                Experimental
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-[var(--text-3)] leading-snug">
                            {cleanDisplayText(entry.marketScope || entry.marketName)}
                          </div>
                          {!entry.recommended && entry.reasonNotRecommended && (
                            <div className="text-[10.5px] text-[var(--text-2)] leading-snug">
                              {cleanDisplayText(entry.reasonNotRecommended)}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <div className="font-display text-[13px] font-bold text-[var(--accent)] tabular-nums">
                            {entry.calibratedProbability !== null && entry.calibratedProbability !== undefined
                              ? `${(entry.calibratedProbability * 100).toFixed(1)}%`
                              : '—'}
                          </div>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold border ${
                              entry.recommended
                                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                                : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--line)]'
                            }`}
                          >
                            {entry.recommended ? 'Recommended' : 'Not recommended'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Primary CTA Footer for Locked State */}
        {explanation.tierLocked && (
          <div
            className="sticky bottom-0 px-5 pt-3 border-t border-[var(--line)] bg-[#111815] shrink-0"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
          >
            <Link
              href="/pricing"
              onClick={onClose}
              className="min-h-[44px] w-full inline-flex items-center justify-center gap-1.5 rounded-[12px] bg-[var(--accent-fill)] text-[#0A0E0D] font-semibold text-[13.5px] px-4 touch-press"
            >
              <span>See plans</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
