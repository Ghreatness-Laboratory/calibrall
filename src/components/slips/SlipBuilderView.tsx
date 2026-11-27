'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Layers,
  SlidersHorizontal,
  Sparkles,
  Lock,
  AlertTriangle,
  ArrowRight,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useSport } from '@/lib/context/SportContext';
import { useAuth } from '@/lib/context/AuthContext';
import { getSlipBuilderTierPolicy, SLIP_BUILDER_GLOBAL_BOUNDS, SlipBuildStyle } from '@/lib/tiers';
import type { CountryCompetitionGroup } from '@/lib/data/competitionSearch';
import { cleanDisplayText } from '@/lib/utils/formatText';
import {
  getStoredSavedSlips,
  saveSlipToStorage,
  removeSavedSlipFromStorage,
  StoredSavedSlip,
} from '@/lib/storage/userStorage';
import type {
  BuiltSlip,
  SlipBuildResponse,
  SlipDayFilter,
  SlipMarketGroupKey,
  SlipOddsBasis,
  SlipSportFilter,
} from '@/lib/slips/types';
import SlipCard from './SlipCard';
import SlipFiltersSheet from './SlipFiltersSheet';

const TARGET_CHIPS = [2.0, 3.0, 4.0, 5.0] as const;
const MAX_LEGS_OPTIONS = [2, 3, 4, 5, 6] as const;

export default function SlipBuilderView() {
  const { sport: globalSport } = useSport();
  const { user, isAdmin } = useAuth();

  const initialPolicy = useMemo(
    () => getSlipBuilderTierPolicy(user?.tier || 'free', isAdmin),
    [user?.tier, isAdmin]
  );

  const [targetOdds, setTargetOdds] = useState<number>(2.0);
  const [customTargetInput, setCustomTargetInput] = useState<string>('2.0');
  const [day, setDay] = useState<SlipDayFilter>('today');
  const [sport, setSport] = useState<SlipSportFilter>(
    globalSport === 'basketball' ? 'basketball' : globalSport === 'all' ? 'all' : 'football'
  );
  const [selectedCompetitionIds, setSelectedCompetitionIds] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<SlipMarketGroupKey[]>([]);
  const [maxLegs, setMaxLegs] = useState<number>(SLIP_BUILDER_GLOBAL_BOUNDS.defaultMaxLegs);
  const [style, setStyle] = useState<SlipBuildStyle>('safest');
  const [oddsBasis, setOddsBasis] = useState<SlipOddsBasis>('real');

  const [competitionGroups, setCompetitionGroups] = useState<CountryCompetitionGroup[]>([]);
  const [basketballUpcomingCount, setBasketballUpcomingCount] = useState<number>(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [quota, setQuota] = useState<SlipBuildResponse['quota']>({
    tier: initialPolicy.tier,
    isAdmin: initialPolicy.isAdmin,
    dailyBuildLimit: initialPolicy.dailyBuildLimit,
    buildsUsedToday: 0,
    buildsRemainingToday: initialPolicy.dailyBuildLimit,
    maxTargetOdds: initialPolicy.maxTargetOdds,
    allowedStyles: initialPolicy.allowedStyles,
    bestPriceComparison: initialPolicy.bestPriceComparison,
  });

  const [result, setResult] = useState<SlipBuildResponse | null>(null);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSlipIds, setSavedSlipIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = getStoredSavedSlips();
    setSavedSlipIds(new Set(saved.map((s) => s.slipId)));
  }, []);

  // Load canonical competition catalog + quota
  const loadInitialContext = useCallback(async () => {
    try {
      const [quotaRes, compFootRes, compBbRes] = await Promise.all([
        fetch('/api/v1/slips/build', { cache: 'no-store' }),
        fetch(`/api/v1/competitions?sport=all&day=${day}`, { cache: 'no-store' }),
        fetch(`/api/v1/competitions?sport=basketball&day=${day}`, { cache: 'no-store' }),
      ]);

      if (quotaRes.ok) {
        const qJson = await quotaRes.json();
        if (qJson?.quota) setQuota(qJson.quota);
      }
      if (compFootRes.ok) {
        const cJson = await compFootRes.json();
        if (Array.isArray(cJson?.groupedByCountry)) {
          setCompetitionGroups(cJson.groupedByCountry);
        }
      }
      if (compBbRes.ok) {
        const bJson = await compBbRes.json();
        setBasketballUpcomingCount(Number(bJson?.totalFixtures || 0));
      }
    } catch {
      // Non-fatal
    }
  }, [day]);

  useEffect(() => {
    loadInitialContext();
  }, [loadInitialContext]);

  const handleSelectChip = (val: number) => {
    setTargetOdds(val);
    setCustomTargetInput(val.toFixed(1));
    setErrorMessage(null);
  };

  const handleCustomTargetChange = (raw: string) => {
    setCustomTargetInput(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setTargetOdds(parsed);
    }
    setErrorMessage(null);
  };

  const handleBuild = async () => {
    setErrorMessage(null);
    const parsedTarget = Number(customTargetInput || targetOdds);
    if (
      !Number.isFinite(parsedTarget) ||
      parsedTarget < SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds ||
      parsedTarget > SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds
    ) {
      setErrorMessage(
        `Enter target odds between ${SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds.toFixed(
          1
        )} and ${SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds.toFixed(1)}.`
      );
      return;
    }

    setIsBuilding(true);
    try {
      const res = await fetch('/api/v1/slips/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetOdds: parsedTarget,
          day,
          sport,
          competitionIds: selectedCompetitionIds,
          markets: selectedMarkets,
          maxLegs,
          style,
          oddsBasis,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult(null);
        setErrorMessage(cleanDisplayText(json?.error || 'Unable to build slip right now.'));
        return;
      }

      const data = json as SlipBuildResponse;
      setResult(data);
      if (data.quota) setQuota(data.quota);
    } catch {
      setErrorMessage('Network error while building slips. Please try again.');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleToggleSaveSlip = (slip: BuiltSlip) => {
    if (savedSlipIds.has(slip.slipId)) {
      const updated = removeSavedSlipFromStorage(slip.slipId);
      setSavedSlipIds(new Set(updated.map((s) => s.slipId)));
      return;
    }

    const toStore: StoredSavedSlip = {
      slipId: slip.slipId,
      savedAt: new Date().toISOString(),
      targetOdds: slip.targetOdds,
      style: slip.style,
      combinedOdds: slip.combinedOdds,
      combinedProbability: slip.combinedProbability,
      estimatedHitChancePct: slip.estimatedHitChancePct,
      includesModelFairOdds: slip.includesModelFairOdds,
      honestNotice: slip.honestNotice,
      legs: slip.legs.map((l) => ({
        matchId: l.matchId,
        sport: l.sport,
        matchLabel: l.matchLabel,
        competitionName: l.competitionName,
        kickoffTime: l.kickoffTime,
        marketName: l.marketName,
        selection: l.selection,
        decimalOdds: l.decimalOdds,
        oddsSourceType: l.oddsSourceType,
        bookmakerName: l.bookmakerName,
        priceAgeLabel: l.priceAgeLabel,
        calibratedProbability: l.calibratedProbability,
        confidenceTier: l.confidenceTier,
        oneLineWhy: l.oneLineWhy,
      })),
    };
    const updated = saveSlipToStorage(toStore);
    setSavedSlipIds(new Set(updated.map((s) => s.slipId)));
  };

  const quotaText =
    quota.dailyBuildLimit === null
      ? 'Unlimited builds'
      : `${quota.buildsRemainingToday ?? 0} of ${quota.dailyBuildLimit} builds left today`;

  const activeFiltersCount = selectedCompetitionIds.length + selectedMarkets.length;
  const targetLockedByTier = targetOdds > quota.maxTargetOdds + 1e-6;
  const balancedAllowed = quota.allowedStyles.includes('balanced');

  return (
    <div className="space-y-4 py-1">
      {/* Page Title */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="space-y-1 min-w-0">
          <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em] flex items-center gap-2">
            <Layers className="w-6 h-6 text-[var(--accent)] shrink-0" />
            <span>Slip builder</span>
          </h1>
          <p className="text-[12.5px] text-[var(--text-2)] leading-[1.45]">
            Build multi leg combinations from calibrated upcoming picks within a target odds band.
          </p>
        </div>

        <Link
          href="/performance"
          className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-[12px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] shrink-0"
        >
          <span>Slip record</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Sticky Top Input Card */}
      <section
        aria-label="Slip Builder parameters"
        className="sticky top-[calc(var(--app-header-offset,64px)+6px)] z-20 bg-[var(--surface)]/95 backdrop-blur-xl border border-[var(--line)] rounded-[20px] p-4 space-y-3.5 shadow-lg"
      >
        {/* Target Odds Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[var(--text)]">
              Target combined odds (plus or minus 8%)
            </span>
            <span className="text-[11px] font-medium text-[var(--accent)] tabular-nums">
              {cleanDisplayText(quotaText)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {TARGET_CHIPS.map((val) => {
              const locked = val > quota.maxTargetOdds + 1e-6;
              const active = Math.abs(targetOdds - val) < 0.01;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleSelectChip(val)}
                  className={`min-h-[44px] px-3.5 rounded-[12px] text-[13px] font-bold tabular-nums border flex items-center gap-1 transition-colors touch-press ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                      : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg)]'
                  }`}
                >
                  <span>{val.toFixed(1)}</span>
                  {locked && <Lock className="w-3 h-3 text-[var(--medium)]" />}
                </button>
              );
            })}

            <div className="flex-1 min-w-[100px] flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds}
                max={SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds}
                value={customTargetInput}
                onChange={(e) => handleCustomTargetChange(e.target.value)}
                aria-label="Custom target odds"
                className="w-full min-h-[44px] px-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] font-bold text-[var(--text)] tabular-nums focus:outline-none focus:border-[var(--accent)]"
                placeholder="1.5 to 10"
              />
            </div>
          </div>

          {targetLockedByTier && (
            <div className="rounded-[10px] px-3 py-2 bg-[var(--medium-soft)] border border-[var(--medium)]/35 flex items-center justify-between gap-2 text-[11.5px]">
              <span className="text-[var(--text)]">
                Free trial targets go up to {quota.maxTargetOdds.toFixed(1)} odds.
              </span>
              <Link
                href="/pricing"
                className="font-bold text-[var(--accent)] hover:underline shrink-0"
              >
                Upgrade
              </Link>
            </div>
          )}
        </div>

        {/* Day + Sport + Max Legs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Day */}
          <div className="grid grid-cols-2 gap-1 bg-[var(--surface-2)] p-1 rounded-[12px] border border-[var(--line)]">
            {(['today', 'tomorrow'] as SlipDayFilter[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={`min-h-[38px] rounded-[9px] text-[12px] font-semibold transition-colors ${
                  day === d
                    ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm'
                    : 'text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {d === 'today' ? 'Today' : 'Tomorrow'}
              </button>
            ))}
          </div>

          {/* Sport */}
          <div className="grid grid-cols-3 gap-1 bg-[var(--surface-2)] p-1 rounded-[12px] border border-[var(--line)]">
            {(
              [
                { id: 'football', label: 'Football' },
                { id: 'basketball', label: 'Basketball' },
                { id: 'all', label: 'Both' },
              ] as Array<{ id: SlipSportFilter; label: string }>
            ).map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => {
                  setSport(sp.id);
                  setSelectedCompetitionIds([]);
                  setSelectedMarkets([]);
                }}
                className={`min-h-[38px] rounded-[9px] text-[11.5px] font-semibold transition-colors px-1 ${
                  sport === sp.id
                    ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm'
                    : 'text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>

          {/* Max Legs */}
          <div className="flex items-center justify-between gap-1 bg-[var(--surface-2)] px-2 py-1 rounded-[12px] border border-[var(--line)]">
            <span className="text-[11px] font-semibold text-[var(--text-2)] pl-1 whitespace-nowrap">
              Max legs
            </span>
            <div className="flex items-center gap-1">
              {MAX_LEGS_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxLegs(n)}
                  className={`w-7 h-8 rounded-[8px] text-[12px] font-bold tabular-nums transition-colors ${
                    maxLegs === n
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                      : 'text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Style + Odds basis + Leagues & Markets Bottom Sheet */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Style */}
          <div className="grid grid-cols-2 gap-1 bg-[var(--surface-2)] p-1 rounded-[12px] border border-[var(--line)]">
            <button
              type="button"
              onClick={() => setStyle('safest')}
              className={`min-h-[38px] rounded-[9px] text-[12px] font-semibold transition-colors ${
                style === 'safest'
                  ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              Safest
            </button>
            <button
              type="button"
              onClick={() => setStyle('balanced')}
              className={`min-h-[38px] rounded-[9px] text-[12px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                style === 'balanced'
                  ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              <span>Balanced</span>
              {!balancedAllowed && <Lock className="w-3 h-3 text-[var(--medium)]" />}
            </button>
          </div>

          {/* Odds Basis */}
          <div className="grid grid-cols-2 gap-1 bg-[var(--surface-2)] p-1 rounded-[12px] border border-[var(--line)]">
            <button
              type="button"
              onClick={() => setOddsBasis('real')}
              className={`min-h-[38px] rounded-[9px] text-[11px] font-semibold transition-colors px-1.5 ${
                oddsBasis === 'real'
                  ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              Real prices only
            </button>
            <button
              type="button"
              onClick={() => setOddsBasis('model_fair')}
              className={`min-h-[38px] rounded-[9px] text-[11px] font-semibold transition-colors px-1.5 ${
                oddsBasis === 'model_fair'
                  ? 'bg-[var(--surface)] text-[var(--medium)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              Include model fair odds
            </button>
          </div>
        </div>

        {/* Bottom-sheet Filter Button + Primary CTA */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[12.5px] font-semibold text-[var(--text)] hover:bg-[var(--bg)] flex items-center gap-1.5 touch-press shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
            <span>
              Leagues and markets{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={handleBuild}
            disabled={isBuilding}
            className="flex-1 min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 disabled:opacity-60 text-[var(--accent-ink)] text-[13.5px] font-bold flex items-center justify-center gap-2 touch-press"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isBuilding ? 'Searching slate...' : 'Build slip'}</span>
          </button>
        </div>

        {basketballUpcomingCount > 0 && sport === 'football' && (
          <div className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>
              {basketballUpcomingCount} basketball matchups are also available under Basketball or Both.
            </span>
          </div>
        )}
      </section>

      {/* Error / Tier Guard Notice */}
      {errorMessage && (
        <div className="rounded-[16px] p-4 bg-[var(--medium-soft)] border border-[var(--medium)]/40 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 text-[12.5px] text-[var(--text)]">
            <AlertTriangle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" />
            <span className="leading-[1.45]">{cleanDisplayText(errorMessage)}</span>
          </div>
          <Link
            href="/pricing"
            className="min-h-[44px] px-3.5 rounded-[10px] bg-[var(--surface)] border border-[var(--line)] text-[12px] font-bold text-[var(--accent)] flex items-center shrink-0"
          >
            View plans
          </Link>
        </div>
      )}

      {/* Results Area */}
      {result ? (
        result.slips.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11.5px] text-[var(--text-2)] px-1 flex-wrap gap-2">
              <span>
                Showing {result.slips.length} distinct{' '}
                {result.slips.length === 1 ? 'slip' : 'slips'} from{' '}
                {result.diagnostics.qualifiedMatches} qualified{' '}
                {result.diagnostics.qualifiedMatches === 1 ? 'match' : 'matches'} (
                {result.diagnostics.candidateLegs} eligible legs)
              </span>
              {result.quota.bestPriceComparison && (
                <span className="text-[var(--accent)] font-semibold">
                  Best stored bookmaker prices enabled
                </span>
              )}
            </div>

            {result.slips.map((slip) => (
              <SlipCard
                key={slip.slipId}
                slip={slip}
                bestPriceComparison={result.quota.bestPriceComparison}
                isSaved={savedSlipIds.has(slip.slipId)}
                onSaveSlip={handleToggleSaveSlip}
              />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[var(--border-strong)] rounded-[18px] bg-[var(--surface)] p-7 text-center space-y-3">
            <div className="w-11 h-11 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] mx-auto flex items-center justify-center text-[var(--medium)]">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="font-display text-[16px] font-bold text-[var(--text)]">
              No qualifying combination found
            </h2>
            <p className="text-[12.5px] leading-[1.55] text-[var(--text-2)] max-w-md mx-auto">
              {cleanDisplayText(
                result.emptyMessage ||
                  `No combination reaches ${result.request.targetOdds.toFixed(
                    1
                  )} odds with enough confidence today. Try fewer odds, more leagues or the next day.`
              )}
            </p>
            <div className="text-[11px] text-[var(--text-3)] pt-1">
              Quality gates are never relaxed silently. Stored slate: {result.diagnostics.upcomingFixtures}{' '}
              upcoming games, {result.diagnostics.realPricedLegs} fresh real prices
              {result.diagnostics.rejectedStalePrices > 0
                ? `, ${result.diagnostics.rejectedStalePrices} stale prices rejected`
                : ''}
              .
            </div>
          </div>
        )
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--text)]">
            <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
            <span>Strict pre match quality gates</span>
          </div>
          <p className="text-[12px] leading-[1.55] text-[var(--text-2)]">
            Slip builder uses stored pre kickoff bookmaker prices (no older than 3 hours), allows at most 1 leg per match and 2 legs per league, excludes abstained picks and flagged explanations, and lowers High confidence when team news is pending.
          </p>
        </div>
      )}

      <SlipFiltersSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        sport={sport}
        competitionGroups={competitionGroups}
        selectedCompetitionIds={selectedCompetitionIds}
        onApplyCompetitionIds={setSelectedCompetitionIds}
        selectedMarkets={selectedMarkets}
        onApplyMarkets={setSelectedMarkets}
      />
    </div>
  );
}
