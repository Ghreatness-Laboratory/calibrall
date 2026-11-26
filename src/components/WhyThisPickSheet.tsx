'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { X, Lock, Sparkles, ArrowUpRight } from 'lucide-react';
import { WrittenMatchExplanation } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface Props {
  open: boolean;
  onClose: () => void;
  matchTitle: string;
  pickLabel?: string;
  explanation?: WrittenMatchExplanation;
}

function buildDriverChips(reasoning: Record<string, any> | undefined): { label: string; value: string }[] {
  if (!reasoning || typeof reasoning !== 'object') return [];
  const items: { label: string; value: string }[] = [];

  if (reasoning.sport === 'football') {
    if (typeof reasoning.homeXg === 'number' && typeof reasoning.awayXg === 'number') {
      items.push({
        label: 'Expected goals',
        value: `${reasoning.homeXg.toFixed(2)} vs ${reasoning.awayXg.toFixed(2)}`,
      });
    }
    if (typeof reasoning.homeSampleMatches === 'number' && typeof reasoning.awaySampleMatches === 'number') {
      items.push({
        label: 'Sample depth',
        value: `${reasoning.homeSampleMatches} / ${reasoning.awaySampleMatches} matches`,
      });
    }
    if (typeof reasoning.h2hMeetingsCount === 'number' && reasoning.h2hMeetingsCount > 0 && typeof reasoning.h2hAvgTotalGoals === 'number') {
      items.push({
        label: 'Head to head avg',
        value: `${reasoning.h2hAvgTotalGoals.toFixed(2)} goals (${reasoning.h2hMeetingsCount})`,
      });
    }
    if (reasoning.referee && typeof reasoning.refereeShrunkRate === 'number') {
      items.push({
        label: 'Referee cards',
        value: `${cleanDisplayText(reasoning.referee)} (${reasoning.refereeShrunkRate.toFixed(2)})`,
      });
    }
    if (reasoning.topPick?.multiGoalsMeta?.band) {
      items.push({
        label: 'Range width',
        value: `${reasoning.topPick.multiGoalsMeta.band} (width ${reasoning.topPick.multiGoalsMeta.span})`,
      });
    }
  } else if (reasoning.sport === 'basketball') {
    if (typeof reasoning.homeProjected === 'number' && typeof reasoning.awayProjected === 'number') {
      items.push({
        label: 'Projected score',
        value: `${reasoning.homeProjected.toFixed(1)} to ${reasoning.awayProjected.toFixed(1)}`,
      });
    }
    if (typeof reasoning.projectedTotal === 'number') {
      items.push({
        label: 'Projected total',
        value: `${reasoning.projectedTotal.toFixed(1)} pts`,
      });
    }
    if (typeof reasoning.homeGamesPlayed === 'number' && typeof reasoning.awayGamesPlayed === 'number') {
      items.push({
        label: 'Season sample',
        value: `${reasoning.homeGamesPlayed} / ${reasoning.awayGamesPlayed} games`,
      });
    }
    if (reasoning.homeRestDays !== undefined || reasoning.awayRestDays !== undefined) {
      items.push({
        label: 'Rest days',
        value: `${reasoning.homeRestDays ?? 'N/A'} vs ${reasoning.awayRestDays ?? 'N/A'}`,
      });
    }
  }

  return items.slice(0, 4);
}

export default function WhyThisPickSheet({
  open,
  onClose,
  matchTitle,
  pickLabel,
  explanation,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !explanation) return null;

  const drivers = buildDriverChips(explanation.reasoning);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Why this pick"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[var(--surface)] border border-[var(--line)] rounded-t-[24px] sm:rounded-[20px] p-5 pb-7 sm:pb-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent)]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Model explanation</span>
            </div>
            <h3 className="font-display text-[17px] font-bold text-[var(--text)] leading-snug truncate">
              {cleanDisplayText(matchTitle)}
            </h3>
            {pickLabel && (
              <p className="text-[12.5px] font-medium text-[var(--text-2)] truncate">
                {cleanDisplayText(pickLabel)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-[12px] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] touch-press"
            aria-label="Close explanation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {explanation.tierLocked ? (
          <div className="space-y-3">
            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3.5 text-[13px] leading-[1.55] text-[var(--text)]">
              {cleanDisplayText(explanation.oneLineSummary)}
            </div>

            <div className="bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[14px] p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--medium)]">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Full model reasoning &amp; alternates locked</span>
              </div>
              <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
                {explanation.dailySummaryLimitReached
                  ? 'Free accounts include up to 3 daily summary lines. Upgrade to Pro for full numeric breakdowns and the next 2 alternate selections on every match.'
                  : 'Upgrade to Pro to unlock the complete match breakdown, numeric drivers, and the next 2 best alternate picks.'}
              </p>
              <Link
                href="/pricing"
                className="min-h-[44px] w-full inline-flex items-center justify-center gap-1.5 rounded-[12px] bg-[var(--accent-fill)] text-[#0A0E0D] font-semibold text-[13px] px-4 touch-press"
              >
                <span>View Pro plans</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3.5 text-[13px] leading-[1.55] text-[var(--text)]">
              {cleanDisplayText(explanation.fullSummary || explanation.oneLineSummary)}
            </div>

            {drivers.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {drivers.map((d) => (
                  <div
                    key={d.label}
                    className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-2.5"
                  >
                    <div className="text-[10.5px] text-[var(--text-3)]">{d.label}</div>
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
                      className="px-3 py-2.5 bg-[var(--surface-2)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                          {cleanDisplayText(alt.selection)}
                        </div>
                        <div className="text-[10.5px] text-[var(--text-3)] truncate">
                          {cleanDisplayText(alt.marketName)}
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
          </div>
        )}
      </div>
    </div>
  );
}
