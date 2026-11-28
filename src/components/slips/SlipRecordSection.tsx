'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Layers, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { DailySlipRecordRow, SlipRecordSummary } from '@/lib/slips/types';

export default function SlipRecordSection() {
  const [summary, setSummary] = useState<SlipRecordSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSlipId, setExpandedSlipId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/v1/slips/record', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as SlipRecordSummary;
        if (active) setSummary(json);
      } catch {
        // Non-fatal
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const badgeClass = (status: DailySlipRecordRow['status']) => {
    if (status === 'WON') {
      return 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]';
    }
    if (status === 'LOST') {
      return 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-3)]';
    }
    if (status === 'VOID') {
      return 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]';
    }
    return 'bg-[var(--medium-soft)] border-[var(--medium)]/40 text-[var(--medium)]';
  };

  return (
    <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h2 className="font-display text-[15px] font-bold text-[var(--text)] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--accent)]" />
            <span>Slip record</span>
          </h2>
          <p className="text-[11.5px] text-[var(--text-2)] leading-[1.45]">
            Fixed daily pre kickoff slips (2.0, 3.0, and 4.0 targets, Safest). User built slips are excluded.
          </p>
        </div>

        <Link
          href="/slips"
          className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[11.5px] font-semibold text-[var(--accent)] hover:bg-[var(--bg)] shrink-0"
        >
          <span>Build a slip</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
            <div className="h-16 bg-[var(--surface-2)] rounded-[12px]" />
          </div>
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3">
              <div className="text-[10.5px] text-[var(--text-3)]">Daily slips</div>
              <div className="font-display text-[18px] font-bold text-[var(--text)] tabular-nums mt-0.5">
                {summary.totalSlips}
              </div>
              <div className="text-[10.5px] text-[var(--text-2)] tabular-nums">
                {summary.pendingSlips} pending
              </div>
            </div>

            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3">
              <div className="text-[10.5px] text-[var(--text-3)]">Hit rate</div>
              <div className="font-display text-[18px] font-bold text-[var(--accent)] tabular-nums mt-0.5">
                {summary.hitRatePct !== null ? `${summary.hitRatePct.toFixed(1)}%` : 'Pending'}
              </div>
              <div className="text-[10.5px] text-[var(--text-2)] tabular-nums">
                {summary.wonSlips}W · {summary.lostSlips}L
              </div>
            </div>

            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3">
              <div className="text-[10.5px] text-[var(--text-3)]">Voided slips</div>
              <div className="font-display text-[18px] font-bold text-[var(--text)] tabular-nums mt-0.5">
                {summary.voidSlips}
              </div>
              <div className="text-[10.5px] text-[var(--text-2)]">
                Void leg recalculates
              </div>
            </div>
          </div>

          <div className="rounded-[12px] p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/35 flex items-start gap-2 text-[11.5px] text-[var(--text)]">
            <AlertTriangle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" />
            <span className="leading-[1.45]">{cleanDisplayText(summary.smallSampleCaveat)}</span>
          </div>

          {summary.records.length > 0 && (
            <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[14px] overflow-hidden">
              {summary.records.slice(0, 12).map((row) => {
                const isExpanded = expandedSlipId === row.id;
                return (
                  <div key={row.id} className="bg-[var(--surface-2)]/40">
                    <button
                      type="button"
                      onClick={() => setExpandedSlipId(isExpanded ? null : row.id)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-2 flex-wrap">
                          <span className="tabular-nums">{row.recordDate.replace(/-/g, '/')}</span>
                          <span>·</span>
                          <span className="tabular-nums">Target {row.targetOdds.toFixed(1)}</span>
                          <span>·</span>
                          <span className="tabular-nums">{row.legsCount} legs</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] tabular-nums mt-0.5">
                          Quoted {row.combinedOdds.toFixed(2)}
                          {row.settledOdds !== null && row.voidedLegsCount > 0
                            ? ` · Settled ${row.settledOdds.toFixed(2)} (${row.voidedLegsCount} void leg)`
                            : ''}
                          {' · '}
                          Hit chance {(row.combinedProbability * 100).toFixed(1)}%
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-[8px] text-[10.5px] font-bold border ${badgeClass(
                            row.status
                          )}`}
                        >
                          {row.status}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[var(--text-3)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--text-3)]" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3.5 pb-3 pt-1 space-y-1.5 border-t border-[var(--line)] bg-[var(--bg)]/40">
                        {row.legs.map((leg, i) => (
                          <div
                            key={`${row.id}_${i}`}
                            className="flex items-center justify-between gap-2 text-[11.5px] py-1"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-[var(--text)] truncate flex items-center gap-1.5">
                                <span className="truncate">{cleanDisplayText(leg.matchLabel)}</span>
                                {leg.isExperimental && (
                                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] shrink-0">
                                    Experimental
                                  </span>
                                )}
                              </div>
                              <div className="text-[10.5px] text-[var(--text-2)]">
                                {leg.marketScope ? `${cleanDisplayText(leg.marketScope)} · ` : ''}
                                {cleanDisplayText(leg.selection)} · {leg.decimalOdds.toFixed(2)} (
                                {cleanDisplayText(leg.bookmakerName)})
                                {leg.settledScore
                                  ? leg.settledScore === 'Awaiting goal data'
                                    ? ' · Awaiting goal data'
                                    : ` · FT ${leg.settledScore}`
                                  : ''}
                              </div>
                            </div>
                            <span className="text-[10.5px] font-bold text-[var(--text-2)] shrink-0">
                              {leg.legStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-[12px] text-[var(--text-2)] py-2">
          Daily slip record will appear once the first pre kickoff snapshot is logged.
        </div>
      )}
    </section>
  );
}
