'use client';

import React from 'react';
import { useSport } from '@/lib/context/SportContext';
import { Sport } from '@/types';
import { Trophy, Dribbble } from 'lucide-react';

export default function SportSwitcher() {
  const { sport, setSport } = useSport();

  const sports = [
    {
      id: 'football' as Sport,
      label: 'Football',
      icon: Trophy,
    },
    {
      id: 'basketball' as Sport,
      label: 'Basketball',
      icon: Dribbble,
    },
  ];

  return (
    <div className="w-full">
      <div className="h-[44px] bg-[var(--surface)] border border-[var(--line)] p-[3px] rounded-full flex items-center gap-1 w-full">
        {sports.map((item) => {
          const isActive = sport === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 h-full rounded-full flex items-center justify-center gap-1.5 text-[12.5px] transition-all touch-manipulation select-none whitespace-nowrap touch-press ${
                isActive
                  ? 'bg-[var(--accent-fill)] text-[#0A0E0D] font-semibold'
                  : 'text-[var(--text-2)] font-medium hover:text-[var(--text)]'
              }`}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
