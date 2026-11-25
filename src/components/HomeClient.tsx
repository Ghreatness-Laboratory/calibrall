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
  AlertCircle
} from 'lucide-react';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { getFixtureStatistics, buildFixtureContextFromStats, VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import HomeCreatorsTeaser from '@/components/creators/HomeCreatorsTeaser';
import type { BasketballLeague } from '@/lib/basketball/markets';

export default function HomeClient() {
  const { sport, isSwitching } = useSport();
  const [selectedBbLeague, setSelectedBbLeague] = useState<'ALL' | BasketballLeague>('ALL');
  const isBasketball = sport === 'basketball';
  const { fixtures, evaluations, lastUpdated, isDelayed, error, isSavedCopy, isOffline } = useLiveFixtures(
    isBasketball ? selectedBbLeague : 'ALL',
    'ALL',
    sport
  );

  const visibleBasketballFixtures = useMemo(() => {
    if (!isBasketball) return [];
    if (selectedBbLeague === 'ALL') return fixtures;
    return fixtures.filter(
      (f) => (f.basketballStats?.league || f.competition?.code) === selectedBbLeague
    );
  }, [fixtures, isBasketball, selectedBbLeague]);

  // Football evaluated fixtures with 40% family diversity cap
  const showcaseFootballFixtures = selectDiversifiedSlatePicks(
    fixtures.slice(0, 3).map(fixture => {
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
        <div className="h-4 w-36 bg-[#101613] rounded-[8px]" />
        <div className="h-10 w-full bg-[#101613] rounded-full" />
        <div className="h-12 w-full bg-[#101613] rounded-[13px]" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-[68px] bg-[#101613] rounded-[14px]" />
          <div className="h-[68px] bg-[#101613] rounded-[14px]" />
          <div className="h-[68px] bg-[#101613] rounded-[14px]" />
        </div>
        <div className="h-36 bg-[#101613] rounded-[14px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* 4. HOME SCREEN HERO */}
      <section className="space-y-2.5 pt-1">
        {/* Eyebrow: 10px uppercase, letter-spacing 0.16em, colour #5E6B65 */}
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5E6B65]">
          STATISTICAL EDGE ENGINE
        </div>

        {/* H1: 23px, line height 1.22, weight 700, letter spacing -0.025em. Second line is lime */}
        <h1 className="text-[23px] leading-[1.22] font-[700] tracking-[-0.025em] text-[#E9EFEB]">
          {isBasketball ? (
            <>
              Stop guessing basketball totals.<br />
              <span className="text-[#B8E636]">Calibrated probabilistic models.</span>
            </>
          ) : (
            <>
              Stop guessing match winners.<br />
              <span className="text-[#B8E636]">Calibrated probabilistic models.</span>
            </>
          )}
        </h1>

        {/* Short description 2 to 3 lines (12.5px, line height 1.55) */}
        <p className="text-[12.5px] leading-[1.55] text-[#8B9892]">
          {isBasketball
            ? 'Calibrall models NBA, NCAAB Division I, and EuroLeague game totals, team totals, and 1st half totals using shrunk team efficiency, pace, rest, and empirical variance, and abstains when history is thin.'
            : 'Calibrall evaluates goals, corners, both teams to score, cards and 1X2 lines to project calibrated probabilities, and abstains when data is thin.'}
        </p>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Primary CTA: full width, 46px tall, 13px radius, lime background, dark text */}
          <Link
            href="/dashboard"
            className="w-full h-[46px] rounded-[13px] bg-[#B8E636] hover:bg-[#cbf54a] active:scale-[0.98] text-[#0A0E0C] text-[13.5px] font-[650] flex items-center justify-center gap-2 transition-all duration-150 touch-press"
          >
            <span>Launch analytics terminal</span>
            <ArrowRight className="w-4 h-4 text-[#0A0E0C]" strokeWidth={2.5} />
          </Link>

          {/* Compact tappable row: "Verify track record" with Brier value in lime and chevron */}
          <Link
            href="/performance"
            className="w-full h-[44px] px-3.5 rounded-[13px] border border-[#1F2A24] bg-[#101613] hover:bg-[#151D19] active:scale-[0.98] text-[#E9EFEB] text-[12.5px] font-medium flex items-center justify-between transition-all duration-150 touch-press"
          >
            <span>Verify track record</span>
            <div className="flex items-center gap-1.5 text-[12.5px] text-[#B8E636] font-[650] tabular-nums">
              <span>Brier {brierValue}</span>
              <ChevronRight className="w-4 h-4 text-[#8B9892]" strokeWidth={2} />
            </div>
          </Link>
        </div>

        {/* 3-column stat grid: Brier score, Markets, Status. Stat values: 18px, weight 650 */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="h-[68px] p-2.5 bg-[#101613] border border-[#1F2A24] rounded-[14px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[#8B9892] font-normal leading-tight">
              Brier score
            </span>
            <span className="text-[18px] font-[650] text-[#B8E636] tabular-nums leading-none">
              {brierValue}
            </span>
          </div>

          <div className="h-[68px] p-2.5 bg-[#101613] border border-[#1F2A24] rounded-[14px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[#8B9892] font-normal leading-tight">
              Markets
            </span>
            <span className="text-[18px] font-[650] text-[#E9EFEB] tabular-nums leading-none">
              {isBasketball ? '5' : '18'}
            </span>
          </div>

          <div className="h-[68px] p-2.5 bg-[#101613] border border-[#1F2A24] rounded-[14px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[#8B9892] font-normal leading-tight">
              Status
            </span>
            <span className="text-[15px] font-[650] text-[#E9EFEB] leading-none">
              Calibrated
            </span>
          </div>
        </div>

        {/* Grouped list card: Models section */}
        <div className="pt-2">
          <div className="rounded-[14px] bg-[#101613] border border-[#1F2A24] divide-y divide-[#1F2A24] overflow-hidden">
            <div className="p-3 flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B8E636]/12 flex items-center justify-center text-[#B8E636] shrink-0">
                <Target className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                  {isBasketball ? 'Team points + pace + shrinkage' : 'Dixon Coles goals model'}
                </span>
                <span className="text-[11px] text-[#8B9892] leading-tight truncate mt-0.5">
                  {isBasketball
                    ? 'Time decayed scoring, rest, and neutral court adjustments'
                    : 'Bivariate Poisson joint distributions'}
                </span>
              </div>
            </div>

            <div className="p-3 flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B8E636]/12 flex items-center justify-center text-[#B8E636] shrink-0">
                <TrendingUp className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                  {isBasketball ? 'Empirical covariance & OT model' : 'NegBinomial corner lines'}
                </span>
                <span className="text-[11px] text-[#8B9892] leading-tight truncate mt-0.5">
                  {isBasketball
                    ? 'League variance, score correlation, and 1st half share'
                    : 'Volume variance and game state'}
                </span>
              </div>
            </div>

            <div className="p-3 flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B8E636]/12 flex items-center justify-center text-[#B8E636] shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                  {isBasketball ? 'Walk forward calibrated totals' : 'Grounded explanations'}
                </span>
                <span className="text-[11px] text-[#8B9892] leading-tight truncate mt-0.5">
                  {isBasketball
                    ? 'Game, team, and 1st half totals gated vs baseline'
                    : 'Quantitative audits, zero hype'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NBA Interactive Tool (when Basketball active) */}
      {isBasketball && (
        <section className="pt-1">
          <NBAScoreProjectionTool />
        </section>
      )}

      {/* Live fixtures heading + small "Pipeline active" dot chip beside it */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between pb-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-[600] text-[#E9EFEB]">
              {isBasketball ? 'Live matchups' : 'Live fixtures'}
            </h2>
            {lastUpdated && (
              <span className="text-[11px] text-[#8B9892] tabular-nums">
                · Last updated {lastUpdated}
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[10.5px] text-[#8B9892]">
            <span className={`w-1.5 h-1.5 rounded-full ${isSavedCopy || isDelayed ? 'bg-[#E8B04A]' : 'bg-[#B8E636]'} shrink-0`} />
            <span>{isSavedCopy ? 'saved copy' : isDelayed ? 'Data delayed' : 'Pipeline active'}</span>
          </div>
        </div>

        {/* Saved copy / server error / offline notice */}
        {isSavedCopy && fixtures.length > 0 && (
          <div className="p-2.5 rounded-[12px] bg-[#E8B04A]/12 border border-[#E8B04A]/30 text-[#E8B04A] text-[11.5px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isOffline ? 'Offline' : (error || 'Live request failed')}: showing saved copy{lastUpdated ? ` (last updated ${lastUpdated})` : ''}.
              </span>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-[6px] bg-[#E8B04A]/20 font-mono text-[10px] font-semibold uppercase">
              saved copy
            </span>
          </div>
        )}

        {/* Notice shown when stored fixtures are older than the 3 day limit or empty error */}
        {!isSavedCopy && (isDelayed || (error && fixtures.length === 0)) && (
          <div className="p-2.5 rounded-[12px] bg-[#E8B04A]/12 border border-[#E8B04A]/30 text-[#E8B04A] text-[11.5px] flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {error && fixtures.length === 0
                ? `${isOffline ? 'Offline' : error}${lastUpdated ? ` (last updated ${lastUpdated})` : ''}`
                : `Stored fixtures are older than 3 days (last updated ${lastUpdated || 'never'}). Displaying latest verified schedule.`}
            </span>
          </div>
        )}

        {/* Basketball league filter chips: All, NBA, NCAAB, EuroLeague */}
        {isBasketball && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
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
                  className={`h-[30px] px-3.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                    active
                      ? 'bg-[#B8E636]/15 border-[#B8E636] text-[#B8E636] font-semibold'
                      : 'bg-[#101613] border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Fixtures list: 8px/12px gaps */}
        {(isBasketball ? visibleBasketballFixtures.length > 0 : fixtures.length > 0) ? (
          <div className="space-y-2.5">
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

            <div className="pt-1 flex items-center justify-between text-[11px] text-[#5E6B65]">
              <span>
                Showing {Math.min(3, isBasketball ? visibleBasketballFixtures.length : fixtures.length)} of{' '}
                {isBasketball ? visibleBasketballFixtures.length : fixtures.length}{' '}
                {isBasketball ? 'games' : 'fixtures'}
              </span>
              <Link href="/matches" className="text-[#B8E636] hover:underline flex items-center gap-1 font-semibold text-[12px]">
                <span>View all fixtures</span>
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-[14px] bg-[#101613] border border-[#1F2A24] text-center space-y-2 flex flex-col items-center justify-center">
            <div className="w-[36px] h-[36px] rounded-[10px] bg-[#151D19] border border-[#1F2A24] flex items-center justify-center text-[#8B9892]">
              <Calendar className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="text-[13px] font-semibold text-[#E9EFEB]">
              No games today
            </div>
            <p className="text-[12px] text-[#8B9892] max-w-xs leading-relaxed">
              {isBasketball
                ? `No ${selectedBbLeague === 'ALL' ? 'NBA, NCAAB, or EuroLeague' : selectedBbLeague === 'EUROLEAGUE' ? 'EuroLeague' : selectedBbLeague} matchups found in the active window.`
                : 'Upcoming matchups will appear here automatically when football feeds are connected.'}
            </p>
          </div>
        )}
      </section>

      {/* 5. ARCHITECTURE SECTION */}
      <section className="pt-2 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5E6B65]">
          ARCHITECTURE PHILOSOPHY
        </div>
        <h2 className="text-[14px] font-[600] text-[#E9EFEB]">
          Why match winners are often the worst market
        </h2>
        <p className="text-[12.5px] leading-[1.55] text-[#8B9892]">
          Standard models force a 1X2 projection on every fixture. Calibrall evaluates multiple lines to find calibrated models and abstains when evidence is absent.
        </p>

        {/* Two compact cards: Multi market ranking & Discipline to abstain */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3.5 bg-[#101613] border border-[#1F2A24] rounded-[14px] space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B8E636]/12 flex items-center justify-center text-[#B8E636] shrink-0">
                <Zap className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-[13px] font-[600] text-[#E9EFEB]">Multi market ranking</h3>
            </div>
            <p className="text-[12px] leading-[1.5] text-[#8B9892]">
              We evaluate totals, both teams to score, corners, cards and results simultaneously to analyze full match distributions.
            </p>
          </div>

          <div className="p-3.5 bg-[#101613] border border-[#1F2A24] rounded-[14px] space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B8E636]/12 flex items-center justify-center text-[#B8E636] shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-[13px] font-[600] text-[#E9EFEB]">Discipline to abstain</h3>
            </div>
            <p className="text-[12px] leading-[1.5] text-[#8B9892]">
              When modeled probability fails to clear the hurdle, the engine abstains rather than inventing a projection.
            </p>
          </div>
        </div>
      </section>

      {/* Creators Teaser */}
      <HomeCreatorsTeaser />

      {/* Responsible Use disclaimer rendered as a compact amber tinted card */}
      <section className="pt-1 pb-2">
        <div className="rounded-[14px] p-3 border border-[#E8B04A]/30 bg-[#E8B04A]/10 flex items-start gap-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-[#E8B04A] shrink-0 mt-0.5" strokeWidth={2} />
          <div className="text-[11px] leading-[16px] text-[#E9EFEB]">
            <strong className="font-semibold text-[#E8B04A]">Responsible use: </strong>
            Calibrall provides quantitative statistical estimates. Sports outcomes contain irreducible variance; modeled probabilities never guarantee results. We do not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>
      </section>
    </div>
  );
}
