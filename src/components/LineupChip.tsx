'use client';

import React from 'react';
import { FixtureLineupState } from '@/types';
import { CheckCircle2, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { isTeamNewsEnabled } from '@/lib/prediction/featureFlags';

interface Props {
  lineupState: FixtureLineupState;
  className?: string;
  isPastKickoff?: boolean;
}

export default function LineupChip({ lineupState, className = '', isPastKickoff = false }: Props) {
  // Free tier / no paid provider: show neutral team news note
  if (!isTeamNewsEnabled()) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)] ${className}`}
      >
        <span>Team news pending</span>
      </span>
    );
  }

  const { status, expectedReleaseTimeFormatted, isWithin30MinsOfKickoff, anyKeyPlayerOut, firstKeyPlayerOutName } = lineupState;

  // 1. Key player out on confirmed lineup
  if (status === 'confirmed' && anyKeyPlayerOut && firstKeyPlayerOutName) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30 ${className}`}
        title={`Key player out: ${firstKeyPlayerOutName}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={2.2} />
        <span className="truncate max-w-[170px]">Key player out: {cleanDisplayText(firstKeyPlayerOutName)}</span>
      </span>
    );
  }

  // 2. Confirmed lineups without key absences
  if (status === 'confirmed') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 ${className}`}
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" strokeWidth={2.2} />
        <span>XI confirmed</span>
      </span>
    );
  }

  // 3. Past kickoff or unreleased late
  if (isPastKickoff || status === 'unreleased_late' || isWithin30MinsOfKickoff) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30 ${className}`}
      >
        <AlertCircle className="w-3 h-3 shrink-0" strokeWidth={2} />
        <span>Team news pending</span>
      </span>
    );
  }

  // 4. Standard pending
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-normal bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)] ${className}`}
    >
      <Clock className="w-3 h-3 text-[var(--text-3)] shrink-0" strokeWidth={1.8} />
      <span>Team news pending · ~{expectedReleaseTimeFormatted.replace(' WAT', '')}</span>
    </span>
  );
}
