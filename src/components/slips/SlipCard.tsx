'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  Share2,
  Bookmark,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { BuiltSlip, SlipCandidateLeg } from '@/lib/slips/types';

interface SlipCardProps {
  slip: BuiltSlip;
  bestPriceComparison: boolean;
  isSaved: boolean;
  onSaveSlip: (slip: BuiltSlip) => void;
}

function formatLocalKickoff(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Scheduled';
  const day = d.toLocaleDateString([], { weekday: 'short' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return cleanDisplayText(`${day} ${time}`);
}

export function formatSlipAsPlainText(slip: BuiltSlip): string {
  const lines: string[] = [];
  lines.push(
    `Calibrall Slip ${slip.rank} (${slip.style === 'balanced' ? 'Balanced' : 'Safest'})`
  );
  lines.push(
    `Combined odds: ${slip.combinedOdds.toFixed(2)} | Estimated hit chance: ${slip.estimatedHitChancePct.toFixed(
      1
    )}% | ${slip.legsCount} legs`
  );
  if (slip.includesModelFairOdds) {
    lines.push(
      "Includes model fair odds: your bookmaker's price will differ (usually lower)"
    );
  }
  lines.push('');
  slip.legs.forEach((leg, idx) => {
    const isWeakest =
      leg.matchId === slip.weakestLegMatchId && leg.marketCode === slip.weakestLegMarketCode;
    lines.push(
      `${idx + 1}. ${cleanDisplayText(leg.matchLabel)} (${cleanDisplayText(
        leg.competitionName
      )}, ${formatLocalKickoff(leg.kickoffTime)})`
    );
    lines.push(
      `   Pick: ${cleanDisplayText(leg.selection)} (${cleanDisplayText(leg.marketName)})`
    );
    lines.push(
      `   Price: ${leg.decimalOdds.toFixed(2)} (${cleanDisplayText(
        leg.bookmakerName
      )}, ${cleanDisplayText(leg.priceAgeLabel)}) | Prob: ${(
        leg.calibratedProbability * 100
      ).toFixed(1)}% | Tier: ${leg.confidenceTier === 'HIGH' ? 'High' : 'Medium'}${
        isWeakest ? ' [Weakest leg]' : ''
      }`
    );
    lines.push(`   Why: ${cleanDisplayText(leg.oneLineWhy)}`);
  });
  lines.push('');
  lines.push(cleanDisplayText(slip.honestNotice));
  lines.push(cleanDisplayText(slip.responsibleFooter));
  return lines.join('\n');
}

function BookmakerComparisonToggle({ leg }: { leg: SlipCandidateLeg }) {
  const [expanded, setExpanded] = useState(false);
  if (!leg.bookmakerQuotes || leg.bookmakerQuotes.length <= 1) return null;

  return (
    <div className="pt-1.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
      >
        <span>
          {expanded
            ? 'Hide bookmaker prices'
            : `Compare ${leg.bookmakerQuotes.length} stored bookmakers`}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-1.5 rounded-[10px] bg-[var(--bg)] border border-[var(--line)] divide-y divide-[var(--line)] overflow-hidden">
          {leg.bookmakerQuotes.map((q, idx) => (
            <div
              key={`${q.bookmaker}_${idx}`}
              className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
            >
              <div className="min-w-0">
                <span className="font-medium text-[var(--text)] truncate block">
                  {cleanDisplayText(q.bookmaker)}
                </span>
                <span className="text-[10px] text-[var(--text-3)]">
                  {cleanDisplayText(q.ageLabel)}
                </span>
              </div>
              <span
                className={`font-bold tabular-nums shrink-0 ${
                  idx === 0 ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'
                }`}
              >
                {q.decimalOdds.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SlipCard({
  slip,
  bestPriceComparison,
  isSaved,
  onSaveSlip,
}: SlipCardProps) {
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatSlipAsPlainText(slip));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    const text = formatSlipAsPlainText(slip);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Calibrall Slip ${slip.rank} (${slip.combinedOdds.toFixed(2)})`,
          text,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareFeedback('Copied to share');
      setTimeout(() => setShareFeedback(null), 1800);
    } catch {
      setShareFeedback(null);
    }
  };

  return (
    <article className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
      {/* Header summary */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--line)]">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[15px] font-bold text-[var(--text)]">
              Slip {slip.rank}
            </span>
            <span className="px-2 py-0.5 rounded-[8px] text-[10.5px] font-semibold bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
              {slip.style === 'balanced' ? 'Balanced' : 'Safest'}
            </span>
            <span className="px-2 py-0.5 rounded-[8px] text-[10.5px] font-semibold bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
              {slip.legsCount} legs
            </span>
          </div>
          <div className="text-[12px] text-[var(--text-2)] flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--accent)] tabular-nums">
              Estimated hit chance {slip.estimatedHitChancePct.toFixed(1)}%
            </span>
            <span className="text-[var(--text-3)]">·</span>
            <span>{cleanDisplayText(slip.targetProximityLabel)}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)] font-semibold">
            Combined odds
          </div>
          <div className="font-display text-[22px] font-bold text-[var(--text)] tabular-nums leading-tight">
            {slip.combinedOdds.toFixed(2)}
          </div>
          {!slip.includesModelFairOdds && slip.averageMarketEdge !== null && (
            <div
              className={`text-[10.5px] font-semibold tabular-nums ${
                slip.averageMarketEdge >= 0 ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'
              }`}
            >
              Avg edge {slip.averageMarketEdge >= 0 ? '+' : '\u2212'}
              {Math.abs(slip.averageMarketEdge * 100).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Model fair warning banner */}
      {slip.includesModelFairOdds && slip.modelFairWarning && (
        <div className="rounded-[12px] p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/35 flex items-start gap-2 text-[12px] text-[var(--text)]">
          <AlertTriangle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" />
          <span className="leading-[1.45]">{cleanDisplayText(slip.modelFairWarning)}</span>
        </div>
      )}

      {/* Legs */}
      <div className="space-y-2.5">
        {slip.legs.map((leg, idx) => {
          const isWeakest =
            leg.matchId === slip.weakestLegMatchId &&
            leg.marketCode === slip.weakestLegMarketCode;
          const tierLabel = leg.confidenceTier === 'HIGH' ? 'High' : 'Medium';

          return (
            <div
              key={`${leg.matchId}_${leg.marketCode}_${idx}`}
              className={`rounded-[14px] p-3 border space-y-2 ${
                isWeakest
                  ? 'bg-[var(--medium-soft)]/45 border-[var(--medium)]/40'
                  : 'bg-[var(--surface-2)]/70 border-[var(--line)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 flex-wrap">
                    <span>{cleanDisplayText(leg.competitionName)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="w-3 h-3" />
                      {formatLocalKickoff(leg.kickoffTime)}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-semibold text-[var(--text)] truncate">
                    {cleanDisplayText(leg.matchLabel)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isWeakest && (
                    <span className="px-2 py-0.5 rounded-[6px] text-[10px] font-bold bg-[var(--medium-soft)] border border-[var(--medium)]/40 text-[var(--medium)]">
                      Weakest leg
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-[6px] text-[10px] font-bold border ${
                      leg.confidenceTier === 'HIGH'
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                        : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)]'
                    }`}
                  >
                    {tierLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-[var(--bg)]/60 rounded-[10px] px-2.5 py-2 border border-[var(--line)]">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-[var(--text)]">
                    {cleanDisplayText(leg.selection)}
                  </div>
                  <div className="text-[11px] text-[var(--text-2)]">
                    {cleanDisplayText(leg.marketName)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[14px] font-bold text-[var(--text)] tabular-nums">
                    {leg.decimalOdds.toFixed(2)}
                  </div>
                  <div className="text-[10.5px] text-[var(--accent)] font-semibold tabular-nums">
                    Prob {(leg.calibratedProbability * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[var(--text-2)] flex items-center justify-between gap-2 flex-wrap">
                <span>
                  {leg.oddsSourceType === 'real_bookmaker' ? (
                    <>
                      <span className="font-semibold text-[var(--text)]">
                        {cleanDisplayText(leg.bookmakerName)}
                      </span>
                      {' · '}
                      <span>{cleanDisplayText(leg.priceAgeLabel)}</span>
                    </>
                  ) : (
                    <span className="text-[var(--medium)] font-medium">
                      Model fair odds, not a bookmaker price
                    </span>
                  )}
                </span>

                {leg.oddsSourceType === 'real_bookmaker' && leg.marketEdge !== null && (
                  <span className="tabular-nums text-[var(--text-3)]">
                    Edge {leg.marketEdge >= 0 ? '+' : '\u2212'}
                    {Math.abs(leg.marketEdge * 100).toFixed(1)}%
                  </span>
                )}
              </div>

              {leg.teamNewsLowered && leg.teamNewsNote && (
                <div className="text-[10.5px] text-[var(--medium)]">
                  {cleanDisplayText(leg.teamNewsNote)}
                </div>
              )}

              <p className="text-[11.5px] leading-[1.45] text-[var(--text-2)]">
                {cleanDisplayText(leg.oneLineWhy)}
              </p>

              {bestPriceComparison && <BookmakerComparisonToggle leg={leg} />}
            </div>
          );
        })}
      </div>

      {/* Independence & Honest Disclaimer */}
      <div className="rounded-[12px] p-3 bg-[var(--surface-2)] border border-[var(--line)] space-y-1.5 text-[11.5px]">
        <p className="font-semibold text-[var(--text)] leading-[1.45]">
          {cleanDisplayText(slip.honestNotice)}
        </p>
        <p className="text-[var(--text-2)] leading-[1.45]">
          {cleanDisplayText(slip.independenceNote)}
        </p>
        <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-3)] pt-0.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>{cleanDisplayText(slip.responsibleFooter)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleCopy}
          className="min-h-[44px] px-2.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--bg)] text-[12px] font-semibold text-[var(--text)] flex items-center justify-center gap-1.5 touch-press"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy slip</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="min-h-[44px] px-2.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--bg)] text-[12px] font-semibold text-[var(--text)] flex items-center justify-center gap-1.5 touch-press"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>{shareFeedback || 'Share'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSaveSlip(slip)}
          className={`min-h-[44px] px-2.5 rounded-[12px] border text-[12px] font-semibold flex items-center justify-center gap-1.5 touch-press ${
            isSaved
              ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
              : 'bg-[var(--accent-fill)] border-transparent text-[var(--accent-ink)]'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[var(--accent)]' : ''}`} />
          <span>{isSaved ? 'Saved' : 'Save slip'}</span>
        </button>
      </div>
    </article>
  );
}
