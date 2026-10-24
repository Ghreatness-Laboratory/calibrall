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
      <div className="bg-[#0F1814] border border-[#1B2A23] p-[3px] rounded-full sm:rounded-[12px] flex items-center justify-between sm:justify-start gap-1 max-w-sm h-[36px]">
        {sports.map((item) => {
          const isActive = sport === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 h-[30px] px-3.5 rounded-full sm:rounded-[9px] flex items-center justify-center gap-1.5 text-[12px] font-[600] transition-all touch-manipulation select-none whitespace-nowrap touch-press ${
                isActive
                  ? 'bg-[#B8E63A] text-[#0A0F0D]'
                  : 'text-[#8B9B93] hover:text-[#E9EFEB] hover:bg-[#142019]/60'
              }`}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
