'use client';

import React from 'react';
import { useSport } from '@/lib/context/SportContext';
import { Sport } from '@/types';

export default function SportSwitcher() {
  const { sport, setSport } = useSport();

  const sports = [
    { 
      id: 'football' as Sport, 
      label: 'Football', 
    },
    { 
      id: 'basketball' as Sport, 
      label: 'Basketball', 
    },
  ];

  return (
    <div className="w-full">
      <div className="h-[40px] bg-[#141A23] border border-[#232C3A] p-1 rounded-[14px] flex items-center gap-1 w-full">
        {sports.map((item) => {
          const isActive = sport === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 h-full rounded-[10px] flex items-center justify-center text-[13.5px] transition-all touch-manipulation select-none whitespace-nowrap touch-press ${
                isActive
                  ? 'bg-[#A8E05F] text-[#0D1117] font-semibold'
                  : 'text-[#8A95A5] font-medium hover:text-[#EDF1F6]'
              }`}
              aria-pressed={isActive}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
