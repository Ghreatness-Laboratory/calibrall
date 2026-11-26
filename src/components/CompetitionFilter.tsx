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

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const selectedComp = useMemo(() => {
    if (selectedCompetitionId === 'ALL') return null;
    for (const group of groups) {
      const found = group.competitions.find((c) => c.id === selectedCompetitionId);
      if (found) return found;
    }
    return null;
  }, [selectedCompetitionId, groups]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    const result: CountryCompetitionGroup[] = [];

    for (const group of groups) {
      const countryMatches = group.country.toLowerCase().includes(q);
      const matchingComps = group.competitions.filter(
        (c) =>
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
      <label className="text-[11px] text-[var(--text-2)] font-medium mb-1 block">
        Competition
      </label>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[44px] px-3 rounded-[12px] bg-[var(--surface)] border text-left flex items-center justify-between text-[13px] transition-colors touch-press ${
          isOpen ? 'border-[var(--accent)]' : 'border-[var(--line)] hover:border-[var(--border-strong)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate flex items-center gap-2">
          {selectedComp ? (
            <>
              <span className="text-[var(--text)] font-medium truncate">{cleanDisplayText(selectedComp.name)}</span>
              {selectedComp.hasFreeFixturesSource === false ? (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] shrink-0">
                  Archive only
                </span>
              ) : (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums shrink-0">
                  {selectedComp.fixtureCount}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-[var(--text)]">All competitions</span>
              <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
                {totalFixturesCount}
              </span>
            </>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-2)] shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-[var(--accent)]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[280px] max-w-[380px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-[14px] overflow-hidden py-1.5">
          <div className="p-2 border-b border-[var(--line)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-3)]" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search league or country"
                className="w-full min-h-[44px] pl-9 pr-9 bg-[var(--surface-2)] border border-[var(--line)] rounded-[10px] text-[12.5px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text)]"
                  aria-label="Clear competition search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[260px] overflow-y-auto py-1">
            {!searchQuery && (
              <button
                type="button"
                onClick={() => handleSelect('ALL')}
                className={`w-full min-h-[44px] px-3 text-left flex items-center justify-between text-[12.5px] transition-colors ${
                  selectedCompetitionId === 'ALL'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-[var(--text-2)]" />
                  <span>All competitions</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
                    {totalFixturesCount}
                  </span>
                  {selectedCompetitionId === 'ALL' && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                </div>
              </button>
            )}

            {filteredGroups.length === 0 ? (
              <div className="py-4 text-center text-[12.5px] text-[var(--text-3)]">
                No competitions found
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.country} className="mt-1">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-3)] bg-[var(--bg)]/80 sticky top-0">
                    {group.country}
                  </div>

                  {group.competitions.map((comp: CompetitionWithCount) => {
                    const isSelected = selectedCompetitionId === comp.id;
                    const noFreeSource = comp.hasFreeFixturesSource === false;
                    return (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => handleSelect(comp.id)}
                        className={`w-full min-h-[44px] px-3 text-left flex items-center justify-between text-[12.5px] transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                            : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <span className="truncate pr-2">{cleanDisplayText(comp.name)}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {noFreeSource ? (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
                              {(comp.storedMatchCount ?? 0) > 0 ? `${comp.storedMatchCount} stored` : 'Archive'}
                            </span>
                          ) : (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
                              {comp.fixtureCount}
                            </span>
                          )}
                          {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
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
