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
      Icon: Trophy, 
    },
    { 
      id: 'basketball' as Sport, 
      label: 'Basketball', 
      Icon: Dribbble, 
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-2 pb-1">
      <div className="bg-[#101713] border border-white/[0.07] p-[3px] rounded-[11px] flex items-center justify-between sm:justify-start gap-1 max-w-sm h-[38px]">
        {sports.map((item) => {
          const isActive = sport === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 h-full px-3.5 rounded-[9px] flex items-center justify-center gap-2 text-[12px] font-semibold transition-all touch-manipulation select-none whitespace-nowrap touch-press ${
                isActive
                  ? 'bg-[#B6E63B] text-[#0A0F0D] shadow-xs'
                  : 'text-[#8B9890] hover:text-[#ECF1EE] hover:bg-[#151E19]/60'
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
