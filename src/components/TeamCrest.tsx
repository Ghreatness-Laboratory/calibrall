'use client';

import React, { useState } from 'react';

interface TeamCrestProps {
  crestUrl?: string | null;
  teamName: string;
  size?: number; // size in px, defaults to 28
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

// Deterministic subtle badge color based on name for crisp native look
function getBadgeBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#253346', // slate blue
    '#3D242B', // burgundy / red
    '#1B3838', // teal
    '#3B3120', // amber
    '#2E2741', // violet
    '#1B2E3E', // ocean
  ];
  return colors[Math.abs(hash) % colors.length];
}

export default function TeamCrest({
  crestUrl,
  teamName,
  size = 28,
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

  // If the image fails to load or no URL is provided, display circular badge with team initials
  if (!crestUrl || hasError) {
    const initials = getTeamInitials(teamName);
    return (
      <div
        style={{
          ...styleDimension,
          backgroundColor: getBadgeBg(teamName),
        }}
        className={`shrink-0 rounded-full border border-[#232C3A] flex items-center justify-center text-[10px] font-bold text-[#EDF1F6] select-none tracking-tight ${className}`}
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
      className={`shrink-0 rounded-full flex items-center justify-center overflow-hidden bg-[#1A222E] border border-[#232C3A] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={crestUrl}
        alt={`${teamName} crest`}
        loading="lazy"
        className="w-full h-full object-contain p-0.5"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
