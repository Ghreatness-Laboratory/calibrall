'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CountryCompetitionGroup, CompetitionWithCount } from '@/lib/data/canonicalCompetitions';
import { Search, ChevronDown, Check, X, Trophy } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface CompetitionFilterProps {
  selectedCompetitionId: string;
  onSelectCompetitionId: (id: string) => void;
  groups: CountryCompetitionGroup[];
  totalFixturesCount: number;
}

export default function CompetitionFilter({
  selectedCompetitionId,
  onSelectCompetitionId,
  groups,
  totalFixturesCount,
}: CompetitionFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Find currently selected competition
  const selectedComp = useMemo(() => {
    if (selectedCompetitionId === 'ALL') return null;
    for (const group of groups) {
      const found = group.competitions.find(c => c.id === selectedCompetitionId);
      if (found) return found;
    }
    return null;
  }, [selectedCompetitionId, groups]);

  // Filter groups by competition name, code, or country search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();

    const result: CountryCompetitionGroup[] = [];

    for (const group of groups) {
      const countryMatches = group.country.toLowerCase().includes(q);
      const matchingComps = group.competitions.filter(c => 
        countryMatches ||
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );

      if (matchingComps.length > 0) {
        result.push({
          country: group.country,
          competitions: matchingComps,
        });
      }
    }

    return result;
  }, [groups, searchQuery]);

  const handleSelect = (id: string) => {
    onSelectCompetitionId(id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <label className="text-[11px] text-[#8B9892] font-normal mb-1 block">
        Competition
      </label>

      {/* Button trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-10 px-3 rounded-[12px] bg-[#101613] border text-left flex items-center justify-between text-[13px] transition-colors ${
          isOpen ? 'border-[#B8E636] ring-1 ring-[#B8E636]' : 'border-[#1F2A24] hover:border-[#2D3C34]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate flex items-center gap-2">
          {selectedComp ? (
            <>
              <span className="text-[#E9EFEB] font-medium">{cleanDisplayText(selectedComp.name)}</span>
              <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[#8B9892] font-mono">
                {selectedComp.fixtureCount}
              </span>
            </>
          ) : (
            <>
              <span className="text-[#E9EFEB]">All competitions</span>
              <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[#8B9892] font-mono">
                {totalFixturesCount}
              </span>
            </>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#8B9892] shrink-0 transition-transform ${isOpen ? 'rotate-180 text-[#B8E636]' : ''}`} />
      </button>

      {/* Popover list */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[280px] max-w-[360px] bg-[#0E1410] border border-[#1F2A24] rounded-[14px] shadow-2xl overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-100">
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-[#1F2A24]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5E6B65]" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search league or country..."
                className="w-full h-8 pl-8 pr-7 bg-[#151D19] border border-[#1F2A24] rounded-[8px] text-[12px] text-[#E9EFEB] placeholder:text-[#5E6B65] focus:outline-none focus:border-[#B8E636]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5E6B65] hover:text-[#E9EFEB]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#1F2A24] py-1">
            {/* "All competitions" option */}
            {!searchQuery && (
              <button
                type="button"
                onClick={() => handleSelect('ALL')}
                className={`w-full px-3 py-2 text-left flex items-center justify-between text-[12.5px] transition-colors ${
                  selectedCompetitionId === 'ALL'
                    ? 'bg-[#B8E636]/10 text-[#B8E636] font-semibold'
                    : 'text-[#E9EFEB] hover:bg-[#151D19]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-[#8B9892]" />
                  <span>All competitions</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] px-1.5 py-0.2 rounded-full bg-[#151D19] border border-[#1F2A24] text-[#8B9892] font-mono">
                    {totalFixturesCount}
                  </span>
                  {selectedCompetitionId === 'ALL' && <Check className="w-3.5 h-3.5 text-[#B8E636]" />}
                </div>
              </button>
            )}

            {filteredGroups.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-[#5E6B65]">
                No competitions found
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.country} className="mt-1">
                  {/* Country Header */}
                  <div className="px-3 py-1 text-[10px] uppercase font-semibold text-[#5E6B65] tracking-wider bg-[#0A0F0C]/80 sticky top-0">
                    {group.country}
                  </div>

                  {/* Competitions in this Country */}
                  {group.competitions.map((comp: CompetitionWithCount) => {
                    const isSelected = selectedCompetitionId === comp.id;
                    return (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => handleSelect(comp.id)}
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between text-[12.5px] transition-colors ${
                          isSelected
                            ? 'bg-[#B8E636]/10 text-[#B8E636] font-semibold'
                            : 'text-[#E9EFEB] hover:bg-[#151D19]'
                        }`}
                      >
                        <span className="truncate pr-2">
                          {cleanDisplayText(comp.name)}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[#8B9892] font-mono">
                            {comp.fixtureCount}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#B8E636]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
