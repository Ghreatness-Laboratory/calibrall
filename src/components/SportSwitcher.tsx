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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
      <div className="bg-[#07130e] border border-white/[0.08] p-1 rounded-[10px] flex items-center justify-between sm:justify-start gap-1">
        {sports.map((item) => {
          const isActive = sport === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
              type="button"
              className={`flex-1 sm:flex-initial h-[42px] sm:h-[38px] px-4 sm:px-5 rounded-[8px] flex items-center justify-center gap-2 text-[13px] font-[500] transition-all touch-manipulation select-none ${
                isActive
                  ? 'bg-[#b8e63a] text-[#0a1812] shadow-sm font-semibold'
                  : 'text-[#8fa69a] hover:text-[#e8efe9] hover:bg-white/[0.04]'
              }`}
              aria-pressed={isActive}
            >
              <span className="text-[15px]">{item.icon}</span>
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
