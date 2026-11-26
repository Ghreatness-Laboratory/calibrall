'use client';

import React from 'react';
import { useSport } from '@/lib/context/SportContext';
import { SportFilter } from '@/types';
import { Layers, Trophy, Dribbble } from 'lucide-react';

export default function SportSwitcher() {
  const { sport, setSport } = useSport();

  const sports: Array<{ id: SportFilter; label: string; icon: typeof Trophy }> = [
    {
      id: 'all',
      label: 'All sports',
      icon: Layers,
    },
    {
      id: 'football',
      label: 'Football',
      icon: Trophy,
    },
    {
      id: 'basketball',
      label: 'Basketball',
      icon: Dribbble,
    },
  ];

  return (
    <div className="w-full">
      <div
        className="min-h-[44px] bg-[var(--surface)] border border-[var(--line)] p-[3px] rounded-full flex items-center gap-1 w-full"
        role="group"
        aria-label="Sport filter"
      >
        {sports.map((item) => {
          const isActive = sport === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 min-h-[38px] px-2 rounded-full flex items-center justify-center gap-1.5 text-[12px] transition-all touch-manipulation select-none whitespace-nowrap touch-press ${
                isActive
                  ? 'bg-[var(--accent-fill)] text-[#0A0E0D] font-semibold'
                  : 'text-[var(--text-2)] font-medium hover:text-[var(--text)]'
              }`}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
