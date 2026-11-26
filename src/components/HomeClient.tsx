'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Zap,
  Target,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import {
  getFixtureStatistics,
  buildFixtureContextFromStats,
  VERIFIED_PERFORMANCE_REPORT,
} from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import {
  evaluateFixtureMarkets,
  selectDiversifiedSlatePicks,
} from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import HomeCreatorsTeaser from '@/components/creators/HomeCreatorsTeaser';
import type { BasketballLeague } from '@/lib/basketball/markets';

export default function HomeClient() {
  const { sport, isSwitching } = useSport();
  const [selectedBbLeague, setSelectedBbLeague] = useState<'ALL' | BasketballLeague>('ALL');
  const isBasketball = sport === 'basketball';
  const { fixtures, evaluations, lastUpdated, isDelayed, error, isSavedCopy, isOffline } =
    useLiveFixtures(isBasketball ? selectedBbLeague : 'ALL', 'ALL', sport);

  const visibleBasketballFixtures = useMemo(() => {
    if (!isBasketball) return [];
    if (selectedBbLeague === 'ALL') return fixtures;
    return fixtures.filter(
      (f) => (f.basketballStats?.league || f.competition?.code) === selectedBbLeague
    );
  }, [fixtures, isBasketball, selectedBbLeague]);

  const showcaseFootballFixtures = selectDiversifiedSlatePicks(
    fixtures.slice(0, 3).map((fixture) => {
      const stats = getFixtureStatistics(fixture);
      const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));
      return {
        fixtureId: fixture.id,
        fixture,
        topPick: evalResult.topPick,
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    }),
    0.40
  );

  const brierValue = isBasketball
    ? VERIFIED_NBA_PERFORMANCE_REPORT.brierScore.toFixed(3)
    : VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3);

  if (isSwitching) {
    return (
      <div className="space-y-3 py-2 animate-pulse">
        <div className="h-4 w-36 bg-[var(--surface)] rounded-[8px]" />
        <div className="h-11 w-full bg-[var(--surface)] rounded-[12px]" />
        <div className="h-12 w-full bg-[var(--surface)] rounded-[12px]" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-[72px] bg-[var(--surface)] rounded-[12px]" />
          <div className="h-[72px] bg-[var(--surface)] rounded-[12px]" />
          <div className="h-[72px] bg-[var(--surface)] rounded-[12px]" />
        </div>
        <div className="h-40 bg-[var(--surface)] rounded-[18px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Hero */}
      <section className="space-y-3 pt-1">
        <div className="text-[11.5px] font-medium text-[var(--text-2)]">
          Statistical edge engine
        </div>

        <h1 className="font-display text-[26px] leading-[1.18] font-bold tracking-[-0.02em] text-[var(--text)]">
          {isBasketball ? (
            <>
              Stop guessing basketball totals.{' '}
              <span className="text-[var(--accent)]">Calibrated probabilistic models.</span>
            </>
          ) : (
            <>
              Stop guessing match winners.{' '}
              <span className="text-[var(--accent)]">Calibrated probabilistic models.</span>
            </>
          )}
        </h1>

        <p className="text-[13px] leading-[1.5] text-[var(--text-2)]">
          {isBasketball
            ? 'Calibrall models NBA, NCAAB Division I, and EuroLeague game totals, team totals, and 1st half totals using shrunk team efficiency, pace, rest, and empirical variance.'
            : 'Calibrall evaluates goals, corners, both teams to score, cards, and 1X2 lines to project calibrated probabilities, and abstains when data is thin.'}
        </p>

        {/* Action Buttons */}
        <div className="space-y-2 pt-0.5">
          <Link
            href="/matches"
            className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] text-[13.5px] font-bold flex items-center justify-center gap-2 transition-all duration-150 touch-press"
          >
            <span>Explore live fixtures</span>
            <ArrowRight className="w-4 h-4 text-[var(--accent-ink)]" strokeWidth={2.5} />
          </Link>

          <Link
            href="/performance"
            className="w-full min-h-[44px] px-3.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text)] text-[13px] font-medium flex items-center justify-between transition-all duration-150 touch-press"
          >
            <span>Verify track record</span>
            <div className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-bold tabular-nums">
              <span>Brier {brierValue}</span>
              <ChevronRight className="w-4 h-4 text-[var(--text-2)]" strokeWidth={2} />
            </div>
          </Link>
        </div>

        {/* 3-column stat grid */}
        <div className="grid grid-cols-3 gap-2 pt-1 tabular-nums">
          <div className="min-h-[72px] p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[12px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[var(--text-2)] leading-tight">
              Brier score
            </span>
            <span className="font-display text-[18px] font-bold text-[var(--accent)] leading-none">
              {brierValue}
            </span>
          </div>

          <div className="min-h-[72px] p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[12px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[var(--text-2)] leading-tight">
              Markets
            </span>
            <span className="font-display text-[18px] font-bold text-[var(--text)] leading-none">
              {isBasketball ? '5' : '18'}
            </span>
          </div>

          <div className="min-h-[72px] p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[12px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[var(--text-2)] leading-tight">
              Status
            </span>
            <span className="font-display text-[15px] font-bold text-[var(--text)] leading-none">
              Calibrated
            </span>
          </div>
        </div>

        {/* Grouped list card: Models section */}
        <div className="pt-1">
          <div className="rounded-[18px] bg-[var(--surface)] border border-[var(--line)] divide-y divide-[var(--line)] overflow-hidden">
            <div className="p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Target className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">
                  {isBasketball ? 'Team points + pace + shrinkage' : 'Dixon Coles goals model'}
                </span>
                <span className="text-[11.5px] text-[var(--text-2)] leading-tight truncate mt-0.5">
                  {isBasketball
                    ? 'Time-decayed scoring, rest, and neutral court adjustments'
                    : 'Bivariate Poisson joint distributions'}
                </span>
              </div>
            </div>

            <div className="p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <TrendingUp className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">
                  {isBasketball ? 'Empirical covariance & OT model' : 'NegBinomial corner lines'}
                </span>
                <span className="text-[11.5px] text-[var(--text-2)] leading-tight truncate mt-0.5">
                  {isBasketball
                    ? 'League variance, score correlation, and 1st half share'
                    : 'Volume variance and game state'}
                </span>
              </div>
            </div>

            <div className="p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">
                  {isBasketball ? 'Walk-forward calibrated totals' : 'Grounded explanations'}
                </span>
                <span className="text-[11.5px] text-[var(--text-2)] leading-tight truncate mt-0.5">
                  {isBasketball
                    ? 'Game, team, and 1st half totals gated vs baseline'
                    : 'Quantitative audits, zero hype'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isBasketball && (
        <section className="pt-1">
          <NBAScoreProjectionTool />
        </section>
      )}

      {/* Live fixtures section */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-2 pb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-display text-[14px] font-semibold text-[var(--text)] shrink-0">
              {isBasketball ? 'Live matchups' : 'Live fixtures'}
            </h2>
            {lastUpdated && (
              <span className="text-[11px] text-[var(--text-2)] tabular-nums truncate">
                · {lastUpdated}
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[10.5px] text-[var(--text-2)] shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isSavedCopy || isDelayed ? 'bg-[var(--medium)]' : 'bg-[var(--accent)]'
              }`}
            />
            <span>{isSavedCopy ? 'Saved copy' : isDelayed ? 'Data delayed' : 'Model live'}</span>
          </div>
        </div>

        {isSavedCopy && fixtures.length > 0 && (
          <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[11.5px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isOffline ? 'Offline' : error || 'Live request failed'}: showing saved copy
                {lastUpdated ? ` (last updated ${lastUpdated})` : ''}.
              </span>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-[var(--medium-soft)] text-[10.5px] font-semibold">
              Saved copy
            </span>
          </div>
        )}

        {!isSavedCopy && (isDelayed || (error && fixtures.length === 0)) && (
          <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[11.5px] flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {error && fixtures.length === 0
                ? `${isOffline ? 'Offline' : error}${lastUpdated ? ` (last updated ${lastUpdated})` : ''}`
                : `Stored fixtures are older than 3 days (last updated ${lastUpdated || 'never'}). Displaying latest verified schedule.`}
            </span>
          </div>
        )}

        {isBasketball && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'NBA', label: 'NBA' },
                { id: 'NCAAB', label: 'NCAAB' },
                { id: 'EUROLEAGUE', label: 'EuroLeague' },
              ] as const
            ).map((chip) => {
              const active = selectedBbLeague === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedBbLeague(chip.id)}
                  className={`min-h-[44px] px-4 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {(isBasketball ? visibleBasketballFixtures.length > 0 : fixtures.length > 0) ? (
          <div className="space-y-3">
            {isBasketball
              ? visibleBasketballFixtures.slice(0, 3).map((f) => (
                  <NBAGameCard key={f.id} fixture={f} evaluation={evaluations?.[f.id]} />
                ))
              : showcaseFootballFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
                  <FixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    topPrediction={topPick}
                    noRecommendationReason={noRecommendationReason}
                  />
                ))}

            <div className="pt-1 flex items-center justify-between text-[11.5px] text-[var(--text-2)]">
              <span className="tabular-nums">
                Showing {Math.min(3, isBasketball ? visibleBasketballFixtures.length : fixtures.length)} of{' '}
                {isBasketball ? visibleBasketballFixtures.length : fixtures.length}{' '}
                {isBasketball ? 'games' : 'fixtures'}
              </span>
              <Link
                href="/matches"
                className="min-h-[44px] inline-flex items-center gap-1 text-[var(--accent)] hover:underline font-semibold text-[12.5px] touch-press"
              >
                <span>View all fixtures</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-[18px] bg-[var(--surface)] border border-[var(--line)] text-center space-y-2 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--text-2)]">
              <Calendar className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="font-display text-[14px] font-semibold text-[var(--text)]">
              No games today
            </div>
            <p className="text-[12.5px] text-[var(--text-2)] max-w-xs leading-[1.5]">
              {isBasketball
                ? `No ${
                    selectedBbLeague === 'ALL'
                      ? 'NBA, NCAAB, or EuroLeague'
                      : selectedBbLeague === 'EUROLEAGUE'
                      ? 'EuroLeague'
                      : selectedBbLeague
                  } matchups found in the active window.`
                : 'Upcoming matchups will appear here automatically when football feeds are connected.'}
            </p>
          </div>
        )}
      </section>

      {/* Architecture Section */}
      <section className="pt-2 space-y-2.5">
        <div className="text-[11.5px] font-medium text-[var(--text-2)]">
          Architecture philosophy
        </div>
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)]">
          Why match winners are often the worst market
        </h2>
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
          Standard models force a 1X2 projection on every fixture. Calibrall evaluates multiple lines to find calibrated models and abstains when evidence is absent.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Zap className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
                Multi-market ranking
              </h3>
            </div>
            <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
              We evaluate totals, both teams to score, corners, cards, and results simultaneously to analyze full match distributions.
            </p>
          </div>

          <div className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
                Discipline to abstain
              </h3>
            </div>
            <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
              When modeled probability fails to clear the hurdle, the engine abstains rather than inventing a projection.
            </p>
          </div>
        </div>
      </section>

      <HomeCreatorsTeaser />

      {/* Responsible Use */}
      <section className="pt-1 pb-2">
        <div className="rounded-[18px] p-3.5 border border-[var(--medium)]/30 bg-[var(--medium-soft)] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[var(--medium)] shrink-0 mt-0.5" strokeWidth={2} />
          <div className="text-[11.5px] leading-[1.5] text-[var(--text)]">
            <strong className="font-semibold text-[var(--medium)]">Responsible use: </strong>
            Calibrall provides quantitative statistical estimates. Sports outcomes contain irreducible variance; modeled probabilities never guarantee results. 18+ only.
          </div>
        </div>
      </section>
    </div>
  );
}
