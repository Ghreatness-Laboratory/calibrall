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
      <div className="h-[38px] bg-[#101713] border border-white/[0.07] p-[3px] rounded-[11px] flex items-center gap-1 w-full">
        {sports.map((item) => {
          const isActive = sport === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 h-full rounded-[8px] flex items-center justify-center gap-1.5 text-[13px] transition-all touch-manipulation select-none whitespace-nowrap touch-press ${
                isActive
                  ? 'bg-[#B6E63B] text-[#0A0F0D] font-[650]'
                  : 'text-[#8B9890] font-medium hover:text-[#ECF1EE]'
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
