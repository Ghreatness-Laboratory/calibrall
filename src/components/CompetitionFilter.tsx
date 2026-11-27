'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  CountryCompetitionGroup,
  CompetitionWithCount,
  competitionMatchesSearch,
  canonicalizeCompetitionId,
} from '@/lib/data/competitionSearch';
import { Search, ChevronDown, Check, X, Trophy, Eye, EyeOff } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface CompetitionFilterProps {
  selectedCompetitionIds?: string[];
  onApplyCompetitionIds?: (ids: string[]) => void;
  selectedCompetitionId?: string;
  onSelectCompetitionId?: (id: string) => void;
  groups: CountryCompetitionGroup[];
  totalFixturesCount: number;
  showSportBadge?: boolean;
}

export default function CompetitionFilter({
  selectedCompetitionIds,
  onApplyCompetitionIds,
  selectedCompetitionId,
  onSelectCompetitionId,
  groups,
  totalFixturesCount,
  showSportBadge = false,
}: CompetitionFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showZeroFixtures, setShowZeroFixtures] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeSelectedIds = useMemo(() => {
    if (Array.isArray(selectedCompetitionIds)) {
      return Array.from(
        new Set(
          selectedCompetitionIds
            .map((id) => canonicalizeCompetitionId(id) || id.trim().toLowerCase())
            .filter((id) => id && id !== 'all')
        )
      );
    }
    if (selectedCompetitionId && selectedCompetitionId.toUpperCase() !== 'ALL') {
      const canon = canonicalizeCompetitionId(selectedCompetitionId) || selectedCompetitionId.trim().toLowerCase();
      return canon ? [canon] : [];
    }
    return [];
  }, [selectedCompetitionIds, selectedCompetitionId]);

  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>(activeSelectedIds);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setDraftSelectedIds(activeSelectedIds);
      setSearchQuery('');
      return;
    }

    setDraftSelectedIds(activeSelectedIds);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeSelectedIds]);

  useEffect(() => {
    if (!isOpen || isMobile) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (!isOpen || !isMobile || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, isMobile]);

  const allCompetitionsById = useMemo(() => {
    const map = new Map<string, CompetitionWithCount>();
    for (const grp of groups) {
      for (const comp of grp.competitions) {
        map.set(comp.id.toLowerCase(), comp);
      }
    }
    return map;
  }, [groups]);

  const zeroFixtureCount = useMemo(() => {
    let cnt = 0;
    for (const grp of groups) {
      for (const comp of grp.competitions) {
        if (comp.fixtureCount === 0) cnt++;
      }
    }
    return cnt;
  }, [groups]);

  const activeSelectionSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);
  const draftSelectionSet = useMemo(() => new Set(draftSelectedIds), [draftSelectedIds]);

  const filteredGroups = useMemo(() => {
    const trimmed = searchQuery.trim();
    const isSearching = trimmed.length > 0;
    const result: CountryCompetitionGroup[] = [];

    for (const group of groups) {
      const matchingComps = group.competitions.filter((comp) => {
        const compIdLower = comp.id.toLowerCase();
        const isZero = comp.fixtureCount === 0;
        const isDraftSelected = draftSelectionSet.has(compIdLower);

        if (isSearching) {
          if (!competitionMatchesSearch(comp, trimmed)) return false;
          return showZeroFixtures || !isZero || isDraftSelected || isSearching;
        }

        if (isZero && !showZeroFixtures && !isDraftSelected) {
          return false;
        }
        return true;
      });

      if (matchingComps.length > 0) {
        result.push({
          country: group.country,
          competitions: matchingComps,
        });
      }
    }
    return result;
  }, [groups, searchQuery, showZeroFixtures, draftSelectionSet]);

  const commitSelection = (nextIds: string[]) => {
    const deduped = Array.from(new Set(nextIds));
    if (onApplyCompetitionIds) {
      onApplyCompetitionIds(deduped);
    }
    if (onSelectCompetitionId) {
      onSelectCompetitionId(deduped.length > 0 ? deduped.join(',') : 'ALL');
    }
    setIsOpen(false);
  };

  const toggleDraftId = (compId: string) => {
    const cleanId = compId.toLowerCase();
    setDraftSelectedIds((prev) =>
      prev.includes(cleanId) ? prev.filter((id) => id !== cleanId) : [...prev, cleanId]
    );
  };

  const selectedTriggerSummary = useMemo(() => {
    if (activeSelectedIds.length === 0) {
      return {
        label: 'All competitions',
        count: totalFixturesCount,
        archiveOnly: false,
      };
    }
    if (activeSelectedIds.length === 1) {
      const comp = allCompetitionsById.get(activeSelectedIds[0]);
      if (comp) {
        return {
          label: cleanDisplayText(comp.name),
          count: comp.fixtureCount,
          archiveOnly: comp.hasFreeFixturesSource === false && comp.fixtureCount === 0,
        };
      }
      return {
        label: activeSelectedIds[0],
        count: 0,
        archiveOnly: false,
      };
    }
    const combinedCount = activeSelectedIds.reduce(
      (sum, id) => sum + (allCompetitionsById.get(id)?.fixtureCount ?? 0),
      0
    );
    return {
      label: `${activeSelectedIds.length} competitions`,
      count: combinedCount,
      archiveOnly: false,
    };
  }, [activeSelectedIds, allCompetitionsById, totalFixturesCount]);

  const renderCompetitionList = (isSheet: boolean) => (
    <div
      className={
        isSheet
          ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2'
          : 'max-h-[320px] overflow-y-auto py-1'
      }
      role="listbox"
      aria-multiselectable="true"
    >
      {!searchQuery.trim() && (
        <button
          type="button"
          onClick={() => setDraftSelectedIds([])}
          className={`w-full min-h-[46px] px-4 text-left flex items-center justify-between text-[13px] transition-colors ${
            draftSelectedIds.length === 0
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
              : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
          }`}
          role="option"
          aria-selected={draftSelectedIds.length === 0}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Trophy className="w-4 h-4 text-[var(--text-2)] shrink-0" />
            <span className="truncate">All competitions</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
              {totalFixturesCount}
            </span>
            {draftSelectedIds.length === 0 && (
              <Check className="w-4 h-4 text-[var(--accent)]" strokeWidth={2.4} />
            )}
          </div>
        </button>
      )}

      {filteredGroups.length === 0 ? (
        <div className="py-8 px-4 text-center space-y-2">
          <div className="text-[13px] font-medium text-[var(--text-2)]">
            No competitions found
          </div>
          {zeroFixtureCount > 0 && !showZeroFixtures && !searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setShowZeroFixtures(true)}
              className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[12px] font-medium text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Show {zeroFixtureCount} leagues with 0 fixtures
            </button>
          )}
        </div>
      ) : (
        filteredGroups.map((group) => (
          <div key={group.country} className="mt-0.5">
            <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-2)] bg-[var(--surface-2)] border-y border-[var(--line)] sticky top-0 z-[5]">
              {cleanDisplayText(group.country)}
            </div>

            {group.competitions.map((comp: CompetitionWithCount) => {
              const compIdLower = comp.id.toLowerCase();
              const isSelected = draftSelectionSet.has(compIdLower);
              const isZero = comp.fixtureCount === 0;
              const noFreeSource = comp.hasFreeFixturesSource === false;

              return (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => toggleDraftId(comp.id)}
                  className={`w-full min-h-[46px] px-4 py-2 text-left flex items-center justify-between gap-2 text-[13px] transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                      : isZero
                      ? 'text-[var(--text-3)] opacity-60 hover:opacity-90 hover:bg-[var(--surface-2)]'
                      : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-5 h-5 rounded-[6px] border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-fill)] border-[var(--accent-fill)] text-[#0A0E0D]'
                          : 'border-[var(--border-strong)] bg-[var(--surface-2)]'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                    </span>
                    <span className="truncate">{cleanDisplayText(comp.name)}</span>
                    {showSportBadge && comp.sport && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] shrink-0">
                        {comp.sport === 'basketball' ? 'Hoops' : 'Football'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {noFreeSource && comp.fixtureCount === 0 ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
                        {(comp.storedMatchCount ?? 0) > 0 ? `${comp.storedMatchCount} stored` : '0'}
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full border tabular-nums ${
                          isSelected
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/30 text-[var(--accent)]'
                            : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
                        }`}
                      >
                        {comp.fixtureCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))
      )}

      {zeroFixtureCount > 0 && !searchQuery.trim() && (
        <div className="px-4 py-2.5 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={() => setShowZeroFixtures((v) => !v)}
            className="w-full min-h-[44px] px-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)]/70 hover:bg-[var(--surface-2)] text-[12px] text-[var(--text-2)] hover:text-[var(--text)] flex items-center justify-center gap-2 transition-colors"
          >
            {showZeroFixtures ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide leagues with 0 fixtures</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Show {zeroFixtureCount} leagues with 0 fixtures</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative" ref={popoverRef}>
      <label className="text-[11px] text-[var(--text-2)] font-medium mb-1 block">
        Competition
      </label>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="competition-filter-trigger"
        className={`w-full min-h-[44px] px-3 rounded-[12px] bg-[var(--surface)] border text-left flex items-center justify-between gap-2 text-[13px] transition-colors touch-press ${
          isOpen || activeSelectionSet.size > 0
            ? 'border-[var(--accent)]'
            : 'border-[var(--line)] hover:border-[var(--border-strong)]'
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="truncate flex items-center gap-2 min-w-0">
          <span
            className={`truncate ${
              activeSelectionSet.size > 0 ? 'text-[var(--text)] font-medium' : 'text-[var(--text)]'
            }`}
          >
            {selectedTriggerSummary.label}
          </span>
          {selectedTriggerSummary.archiveOnly ? (
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] shrink-0">
              Archive only
            </span>
          ) : (
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] tabular-nums shrink-0">
              {selectedTriggerSummary.count}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-2)] shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-[var(--accent)]' : ''
          }`}
        />
      </button>

      {mounted &&
        isOpen &&
        isMobile &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-sm flex flex-col justify-end"
            style={{ zIndex: 120 }}
            role="dialog"
            aria-modal="true"
            aria-label="Select competitions"
            data-testid="competition-bottom-sheet"
          >
            <div
              className="w-full h-[100dvh] max-h-[100dvh] bg-[var(--surface)] flex flex-col overflow-hidden"
              style={{
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {/* Sticky Mobile Sheet Header + Search */}
              <div className="shrink-0 bg-[var(--surface)] border-b border-[var(--line)] px-4 pt-3 pb-3 space-y-2.5 z-10">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-[17px] font-bold text-[var(--text)] leading-tight">
                      Select competitions
                    </h2>
                    <p className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                      {draftSelectedIds.length === 0
                        ? `All competitions (${totalFixturesCount} fixtures)`
                        : `${draftSelectedIds.length} selected`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="min-w-[44px] min-h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] flex items-center justify-center shrink-0 touch-press"
                    aria-label="Close competition picker"
                  >
                    <X className="w-5 h-5" strokeWidth={2} />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)] pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search league, country, or alias"
                    data-testid="competition-search-input"
                    className="w-full min-h-[44px] pl-10 pr-11 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-[14px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-0 top-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]"
                      aria-label="Clear competition search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {renderCompetitionList(true)}

              {/* Sticky Mobile Sheet Footer with Apply */}
              <div
                className="shrink-0 bg-[var(--surface)] border-t border-[var(--line)] px-4 pt-3 flex items-center gap-2.5 z-10"
                style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
              >
                <button
                  type="button"
                  onClick={() => setDraftSelectedIds([])}
                  className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text)] touch-press"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => commitSelection(draftSelectedIds)}
                  data-testid="competition-apply-button"
                  className="flex-1 min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13.5px] font-bold touch-press"
                >
                  {draftSelectedIds.length > 0 ? `Apply (${draftSelectedIds.length})` : 'Apply'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {isOpen && !isMobile && (
        <div
          className="absolute z-50 mt-1.5 w-full min-w-[320px] max-w-[420px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-[14px] shadow-xl overflow-hidden flex flex-col"
          role="dialog"
          aria-label="Select competitions"
          data-testid="competition-desktop-popover"
        >
          <div className="p-2.5 border-b border-[var(--line)] bg-[var(--surface)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-3)] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search league, country, or alias"
                data-testid="competition-search-input"
                className="w-full min-h-[44px] pl-9 pr-10 bg-[var(--surface-2)] border border-[var(--line)] rounded-[10px] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-0 top-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]"
                  aria-label="Clear competition search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {renderCompetitionList(false)}

          <div className="p-2.5 border-t border-[var(--line)] bg-[var(--surface)] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftSelectedIds([])}
              className="min-h-[44px] px-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] text-[12.5px] font-medium text-[var(--text-2)] hover:text-[var(--text)] touch-press"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => commitSelection(draftSelectedIds)}
              data-testid="competition-apply-button"
              className="flex-1 min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13px] font-bold touch-press"
            >
              {draftSelectedIds.length > 0 ? `Apply (${draftSelectedIds.length})` : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
