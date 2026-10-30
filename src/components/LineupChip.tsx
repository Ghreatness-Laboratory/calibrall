'use client';

import React from 'react';
import { FixtureLineupState } from '@/types';
import { CheckCircle2, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface Props {
  lineupState: FixtureLineupState;
  className?: string;
}

export default function LineupChip({ lineupState, className = '' }: Props) {
  const { status, expectedReleaseTimeFormatted, isWithin30MinsOfKickoff, anyKeyPlayerOut, firstKeyPlayerOutName } = lineupState;

  // 1. Key player out on confirmed lineup: Amber/Red with AlertTriangle icon + explicit name text (never colour alone)
  if (status === 'confirmed' && anyKeyPlayerOut && firstKeyPlayerOutName) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 ${className}`}
        title={`Key player out: ${firstKeyPlayerOutName}`}
      >
        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" strokeWidth={2.2} />
        <span className="truncate max-w-[170px]">Key player out: {cleanDisplayText(firstKeyPlayerOutName)}</span>
      </span>
    );
  }

  // 2. Confirmed lineups without key absences: Green with CheckCircle2 icon + text
  if (status === 'confirmed') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-semibold bg-[#B6E63B]/[0.15] text-[#B6E63B] border border-[#B6E63B]/30 ${className}`}
      >
        <CheckCircle2 className="w-3 h-3 text-[#B6E63B] shrink-0" strokeWidth={2.2} />
        <span>XI confirmed</span>
      </span>
    );
  }

  // 3. Late release within 30 minutes of kickoff: Yellow/Neutral advisory, never guessing!
  if (status === 'unreleased_late' || isWithin30MinsOfKickoff) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/25 ${className}`}
      >
        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" strokeWidth={2} />
        <span>Lineup not released yet</span>
      </span>
    );
  }

  // 4. Standard pending: Grey with Clock icon and expected release time (~T-60)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-normal bg-[#151E19] text-[#8B9890] border border-white/[0.07] ${className}`}
    >
      <Clock className="w-3 h-3 text-[#5E6A63] shrink-0" strokeWidth={1.8} />
      <span>Lineups pending · expected ~{expectedReleaseTimeFormatted.replace(' WAT', '')}</span>
    </span>
  );
}
