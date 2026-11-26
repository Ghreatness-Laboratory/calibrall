'use client';

import React, { useState, useMemo } from 'react';
import { lookupTeamCrest } from '@/lib/data/teamCrests';

interface TeamCrestProps {
  crestUrl?: string | null;
  teamName: string;
  canonicalTeamId?: string;
  size?: number;
  className?: string;
}

export function getTeamInitials(name: string): string {
  if (!name) return 'FC';
  const cleaned = name
    .replace(/\b(FC|CF|BSC|AFC|SC|FK|AC|AS|SS)\b/gi, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 3).toUpperCase();
}

function getBadgeBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#253346',
    '#3D242B',
    '#1B3838',
    '#3B3120',
    '#2E2741',
    '#1B2E3E',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export default function TeamCrest({
  teamName,
  canonicalTeamId,
  size = 28,
  className = '',
}: TeamCrestProps) {
  const [hasError, setHasError] = useState(false);

  const effectiveCrestUrl = useMemo(() => {
    const targetId = canonicalTeamId || teamName;
    const record = lookupTeamCrest(targetId);
    if (record) {
      return record.verified && record.crestUrl ? record.crestUrl : null;
    }
    return null;
  }, [canonicalTeamId, teamName]);

  const styleDimension = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    maxWidth: `${size}px`,
    maxHeight: `${size}px`,
  };

  if (!effectiveCrestUrl || hasError) {
    const initials = getTeamInitials(teamName);
    return (
      <div
        style={{
          ...styleDimension,
          backgroundColor: getBadgeBg(teamName),
        }}
        className={`shrink-0 rounded-full border border-[var(--line)] flex items-center justify-center text-[10.5px] font-bold text-[#EEF2F0] select-none tracking-tight ${className}`}
        title={`${teamName} crest`}
        aria-label={`${teamName} crest fallback`}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      style={styleDimension}
      className={`shrink-0 rounded-full flex items-center justify-center overflow-hidden bg-[var(--surface-2)] border border-[var(--line)] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={effectiveCrestUrl}
        alt={`${teamName} crest`}
        loading="lazy"
        className="w-full h-full object-contain p-0.5"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
