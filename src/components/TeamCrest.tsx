'use client';

import React, { useState } from 'react';

interface TeamCrestProps {
  crestUrl?: string | null;
  teamName: string;
  size?: number; // size in px, defaults to 24
  className?: string;
}

export function getTeamInitials(name: string): string {
  if (!name) return 'FC';
  // Strip common football club suffixes
  const cleaned = name
    .replace(/\b(FC|CF|BSC|AFC|SC|FK|AC|AS|SS)\b/gi, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 3).toUpperCase();
}

export default function TeamCrest({
  crestUrl,
  teamName,
  size = 24,
  className = '',
}: TeamCrestProps) {
  const [hasError, setHasError] = useState(false);

  const styleDimension = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    maxWidth: `${size}px`,
    maxHeight: `${size}px`,
  };

  // If the image fails to load or no URL is provided, display the neutral rounded-square fallback with team initials
  if (!crestUrl || hasError) {
    return (
      <div
        style={styleDimension}
        className={`shrink-0 rounded-[4px] bg-[#12251c] border border-white/10 flex items-center justify-center font-mono text-[11px] font-[500] text-[#8fa69a] select-none ${className}`}
        title={`${teamName} crest`}
        aria-label={`${teamName} crest fallback`}
      >
        {getTeamInitials(teamName)}
      </div>
    );
  }

  return (
    <div
      style={styleDimension}
      className={`shrink-0 flex items-center justify-center overflow-hidden bg-transparent ${className}`}
    >
      <img
        src={crestUrl}
        alt={`${teamName} crest`}
        loading="lazy"
        className="w-full h-full object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
