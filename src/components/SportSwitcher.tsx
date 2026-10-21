'use client';

import React from 'react';
import { useSport } from '@/lib/context/SportContext';
import { Sport } from '@/types';

export default function SportSwitcher() {
  const { sport, setSport } = useSport();

  const sports: { id: Sport; label: string; icon: string; subtitle: string }[] = [
    { 
      id: 'football', 
      label: 'Football', 
      icon: '⚽', 
      subtitle: 'Dixon-Coles Goals, Corners & Cards' 
    },
    { 
      id: 'basketball', 
      label: 'Basketball', 
      icon: '🏀', 
      subtitle: 'NBA Efficiency & Possessions Model' 
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2.5 pb-1">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-[3px] rounded-[10px] flex items-center justify-between sm:justify-start gap-1 max-w-md">
        {sports.map((item) => {
          const isActive = sport === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 sm:flex-initial h-[34px] px-3.5 sm:px-4 rounded-[7px] flex items-center justify-center gap-1.5 text-[12.5px] font-[550] transition-all touch-manipulation select-none whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-[550] shadow-xs'
                  : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]/60'
              }`}
              aria-pressed={isActive}
            >
              <span className="text-[14px] leading-none">{item.icon}</span>
              <span>{item.label}</span>
              <span className="hidden md:inline text-[11px] opacity-75 font-normal ml-1">
                ({item.id === 'football' ? '5 Leagues' : 'NBA 30 Teams'})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
