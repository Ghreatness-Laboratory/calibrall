'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Search, SlidersHorizontal, Trophy } from 'lucide-react';
import {
  CountryCompetitionGroup,
  competitionMatchesSearch,
} from '@/lib/data/competitionSearch';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { SLIP_MARKET_OPTIONS, SlipMarketGroupKey, SlipSportFilter } from '@/lib/slips/types';

interface SlipFiltersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sport: SlipSportFilter;
  competitionGroups: CountryCompetitionGroup[];
  selectedCompetitionIds: string[];
  onApplyCompetitionIds: (ids: string[]) => void;
  selectedMarkets: SlipMarketGroupKey[];
  onApplyMarkets: (markets: SlipMarketGroupKey[]) => void;
}

export default function SlipFiltersSheet({
  isOpen,
  onClose,
  sport,
  competitionGroups,
  selectedCompetitionIds,
  onApplyCompetitionIds,
  selectedMarkets,
  onApplyMarkets,
}: SlipFiltersSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'leagues' | 'markets'>('leagues');
  const [leagueSearch, setLeagueSearch] = useState('');
  const [draftCompIds, setDraftCompIds] = useState<string[]>(selectedCompetitionIds);
  const [draftMarkets, setDraftMarkets] = useState<SlipMarketGroupKey[]>(selectedMarkets);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDraftCompIds(selectedCompetitionIds);
      setDraftMarkets(selectedMarkets);
      setLeagueSearch('');
    }
  }, [isOpen, selectedCompetitionIds, selectedMarkets]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const filteredGroups = useMemo(() => {
    const q = leagueSearch.trim();
    return competitionGroups
      .map((grp) => ({
        country: cleanDisplayText(grp.country),
        competitions: grp.competitions.filter((c) => {
          if (sport !== 'all' && c.sport !== sport) return false;
          if (!q) return true;
          return competitionMatchesSearch(c, q);
        }),
      }))
      .filter((grp) => grp.competitions.length > 0);
  }, [competitionGroups, leagueSearch, sport]);

  const visibleMarketOptions = useMemo(() => {
    if (sport === 'all') return SLIP_MARKET_OPTIONS;
    return SLIP_MARKET_OPTIONS.filter((m) => m.sport === sport);
  }, [sport]);

  const toggleCompetition = (id: string) => {
    const clean = id.toLowerCase();
    setDraftCompIds((prev) =>
      prev.includes(clean) ? prev.filter((x) => x !== clean) : [...prev, clean]
    );
  };

  const toggleMarket = (key: SlipMarketGroupKey) => {
    setDraftMarkets((prev) => {
      if (prev.length === 0) {
        // Empty array means "all markets"; clicking one narrows to everything except it, or selects just it:
        // Standard UX: selecting a specific item when "all" is active switches to just that item.
        return [key];
      }
      return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    });
  };

  const handleApply = () => {
    onApplyCompetitionIds(draftCompIds);
    onApplyMarkets(draftMarkets);
    onClose();
  };

  const handleReset = () => {
    setDraftCompIds([]);
    setDraftMarkets([]);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Slip Builder filters"
    >
      <div className="w-full max-w-[430px] md:max-w-lg max-h-[85vh] bg-[var(--surface)] border border-[var(--line)] rounded-t-[24px] md:rounded-[20px] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="font-display text-[15px] font-bold text-[var(--text)]">
              Leagues and markets
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[12px] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
            aria-label="Close filters"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="grid grid-cols-2 gap-2 px-4 pt-3 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('leagues')}
            className={`min-h-[44px] rounded-[12px] text-[12.5px] font-semibold border transition-colors ${
              activeTab === 'leagues'
                ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
            }`}
          >
            Leagues ({draftCompIds.length === 0 ? 'All' : draftCompIds.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('markets')}
            className={`min-h-[44px] rounded-[12px] text-[12.5px] font-semibold border transition-colors ${
              activeTab === 'markets'
                ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
            }`}
          >
            Markets ({draftMarkets.length === 0 ? 'All' : draftMarkets.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {activeTab === 'leagues' ? (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={leagueSearch}
                  onChange={(e) => setLeagueSearch(e.target.value)}
                  placeholder="Search leagues or countries"
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <button
                type="button"
                onClick={() => setDraftCompIds([])}
                className={`w-full min-h-[44px] px-3.5 rounded-[12px] border flex items-center justify-between text-[12.5px] font-medium ${
                  draftCompIds.length === 0
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>All canonical competitions</span>
                </span>
                {draftCompIds.length === 0 && <Check className="w-4 h-4" />}
              </button>

              {filteredGroups.length === 0 ? (
                <div className="py-6 text-center text-[12.5px] text-[var(--text-3)]">
                  No matching competitions found.
                </div>
              ) : (
                <div className="space-y-3 pb-2">
                  {filteredGroups.map((grp) => (
                    <div key={grp.country} className="space-y-1.5">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-3)] px-1">
                        {grp.country}
                      </div>
                      <div className="space-y-1">
                        {grp.competitions.map((comp) => {
                          const selected = draftCompIds.includes(comp.id.toLowerCase());
                          return (
                            <button
                              key={comp.id}
                              type="button"
                              onClick={() => toggleCompetition(comp.id)}
                              className={`w-full min-h-[44px] px-3 rounded-[12px] border flex items-center justify-between gap-2 text-left text-[12.5px] transition-colors ${
                                selected
                                  ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--text)] font-semibold'
                                  : 'bg-[var(--surface-2)]/60 border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                              }`}
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="truncate">{cleanDisplayText(comp.name)}</span>
                                <span className="text-[10.5px] text-[var(--text-3)] shrink-0">
                                  {cleanDisplayText(comp.code)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] tabular-nums text-[var(--text-3)]">
                                  {comp.fixtureCount}
                                </span>
                                <span
                                  className={`w-4 h-4 rounded-[4px] border flex items-center justify-center ${
                                    selected
                                      ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)]'
                                      : 'border-[var(--border-strong)]'
                                  }`}
                                >
                                  {selected && <Check className="w-3 h-3" strokeWidth={2.5} />}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 pb-2">
              <button
                type="button"
                onClick={() => setDraftMarkets([])}
                className={`w-full min-h-[44px] px-3.5 rounded-[12px] border flex items-center justify-between text-[12.5px] font-medium ${
                  draftMarkets.length === 0
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
                }`}
              >
                <span>All eligible markets (recommended)</span>
                {draftMarkets.length === 0 && <Check className="w-4 h-4" />}
              </button>

              {visibleMarketOptions.map((opt) => {
                const selected = draftMarkets.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleMarket(opt.key)}
                    className={`w-full min-h-[44px] px-3.5 rounded-[12px] border flex items-center justify-between text-[12.5px] transition-colors ${
                      selected
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--text)] font-semibold'
                        : 'bg-[var(--surface-2)]/60 border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span>{cleanDisplayText(opt.label)}</span>
                    <span
                      className={`w-4 h-4 rounded-[4px] border flex items-center justify-center ${
                        selected
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)]'
                          : 'border-[var(--border-strong)]'
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          className="px-4 py-3 border-t border-[var(--line)] bg-[var(--surface)] flex items-center gap-2"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[12.5px] font-semibold text-[var(--text-2)] hover:text-[var(--text)]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13px] font-bold hover:opacity-95"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
