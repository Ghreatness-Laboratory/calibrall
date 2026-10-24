'use client';

import React from 'react';
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
import { getFixtureStatistics, VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import HomeCreatorsTeaser from '@/components/creators/HomeCreatorsTeaser';
import SportSwitcher from '@/components/SportSwitcher';

export default function HomeClient() {
  const { sport, isSwitching } = useSport();
  const { fixtures, lastUpdated, isDelayed } = useLiveFixtures('ALL', 'ALL', sport);

  const isBasketball = sport === 'basketball';

  // Football evaluated fixtures
  const showcaseFootballFixtures = fixtures.slice(0, 3).map(fixture => {
    const stats = getFixtureStatistics(fixture);
    const evalResult = evaluateFixtureMarkets({
      fixtureId: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      competitionCode: fixture.competition.code,
      competitionName: fixture.competition.name,
      homeAttackRating: fixture.homeTeam.attackRating,
      homeDefenseRating: fixture.homeTeam.defenseRating,
      awayAttackRating: fixture.awayTeam.attackRating,
      awayDefenseRating: fixture.awayTeam.defenseRating,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      uncertaintyScore: stats.uncertaintyScore,
      dataCoverageScore: stats.dataCoverageScore,
      sampleSizeMatches: stats.sampleSizeMatches,
      stateTags: stats.stateTags,
      lineupConfirmed: stats.lineupConfirmed,
      verifiedOdds: stats.verifiedOdds,
    });
    return {
      fixture,
      topPick: evalResult.topPick,
      noRecommendationReason: evalResult.noRecommendationReason,
    };
  });

  const brierValue = isBasketball 
    ? VERIFIED_NBA_PERFORMANCE_REPORT.brierScore.toFixed(3) 
    : VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3);

  if (isSwitching) {
    return (
      <div className="space-y-3 py-2 animate-pulse">
        <div className="h-4 w-36 bg-[#101713] rounded-[8px]" />
        <div className="h-10 w-full bg-[#101713] rounded-[11px]" />
        <div className="h-12 w-full bg-[#101713] rounded-[11px]" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-[66px] bg-[#101713] rounded-[14px]" />
          <div className="h-[66px] bg-[#101713] rounded-[14px]" />
          <div className="h-[66px] bg-[#101713] rounded-[14px]" />
        </div>
        <div className="h-36 bg-[#101713] rounded-[14px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Sport switcher control */}
      <div className="pt-0.5">
        <SportSwitcher />
      </div>

      {/* 4. HOME SCREEN HERO */}
      <section className="space-y-2.5 pt-1">
        {/* Mono eyebrow: STATISTICAL EDGE ENGINE */}
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B9890]">
          STATISTICAL EDGE ENGINE
        </div>

        {/* H1: 23px, line height 1.2, weight 700, letter spacing -0.025em. Second sentence is lime */}
        <h1 className="text-[23px] leading-[1.2] font-[700] tracking-[-0.025em] text-[#ECF1EE]">
          {isBasketball ? (
            <>
              Stop guessing NBA margins.{' '}
              <span className="text-[#B6E63B]">Find where the edge lies.</span>
            </>
          ) : (
            <>
              Stop guessing match winners.{' '}
              <span className="text-[#B6E63B]">Find where the edge lies.</span>
            </>
          )}
        </h1>

        {/* Short description 2 to 3 lines (13px, line height 1.55) */}
        <p className="text-[13px] leading-[1.55] text-[#8B9890]">
          {isBasketball
            ? 'Calibrall evaluates possession efficiency, offensive ratings, and sportsbook margins to surface verified expected value, and abstains when data is thin.'
            : 'Calibrall evaluates goals, corners, both teams to score, cards and 1X2 lines to surface verified expected value, and abstains when data is thin.'}
        </p>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Primary button: "Launch analytics terminal" with an arrow, full width, 46px high, lime background, dark text, 14px weight 650 */}
          <Link
            href="/dashboard"
            className="w-full h-[46px] rounded-[11px] bg-[#B6E63B] hover:bg-[#c5f34e] active:scale-[0.98] text-[#0A0F0D] text-[14px] font-[650] flex items-center justify-center gap-2 transition-all duration-150 touch-press"
          >
            <span>Launch analytics terminal</span>
            <ArrowRight className="w-4 h-4 text-[#0A0F0D]" strokeWidth={2} />
          </Link>

          {/* Ghost row: "Verify track record" with Brier value 0.176 in lime mono on the right */}
          <Link
            href="/performance"
            className="w-full h-[44px] px-3.5 rounded-[11px] border border-white/[0.07] bg-[#101713] hover:bg-[#151E19] active:scale-[0.98] text-[#ECF1EE] text-[13px] font-medium flex items-center justify-between transition-all duration-150 touch-press"
          >
            <span>Verify track record</span>
            <div className="flex items-center gap-1.5 font-mono text-[13px] text-[#B6E63B] tabular-nums">
              <span>{brierValue}</span>
              <ChevronRight className="w-4 h-4 text-[#8B9890]" strokeWidth={2} />
            </div>
          </Link>
        </div>

        {/* Row of three equal stat tiles: Brier score, Markets, Min. edge */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="h-[66px] p-2.5 bg-[#101713] border border-white/[0.07] rounded-[14px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[#8B9890] font-normal leading-tight">
              Brier score
            </span>
            <span className="text-[17px] font-[650] text-[#B6E63B] font-mono tabular-nums leading-none">
              {brierValue}
            </span>
          </div>

          <div className="h-[66px] p-2.5 bg-[#101713] border border-white/[0.07] rounded-[14px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[#8B9890] font-normal leading-tight">
              Markets
            </span>
            <span className="text-[17px] font-[650] text-[#ECF1EE] tabular-nums leading-none">
              {isBasketball ? '3' : '18'}
            </span>
          </div>

          <div className="h-[66px] p-2.5 bg-[#101713] border border-white/[0.07] rounded-[14px] flex flex-col justify-between">
            <span className="text-[10.5px] text-[#8B9890] font-normal leading-tight">
              Min. edge
            </span>
            <span className="text-[17px] font-[650] text-[#ECF1EE] tabular-nums leading-none">
              +3.0%
            </span>
          </div>
        </div>

        {/* Grouped list card: Models section */}
        <div className="pt-2">
          <div className="rounded-[14px] bg-[#101713] border border-white/[0.07] divide-y divide-white/[0.07] overflow-hidden">
            <div className="p-3 flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] flex items-center justify-center text-[#B6E63B] shrink-0">
                <Target className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                  Dixon Coles goals model
                </span>
                <span className="text-[11.5px] text-[#8B9890] leading-tight truncate mt-0.5">
                  Bivariate Poisson joint distributions
                </span>
              </div>
            </div>

            <div className="p-3 flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] flex items-center justify-center text-[#B6E63B] shrink-0">
                <TrendingUp className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                  NegBinomial corner lines
                </span>
                <span className="text-[11.5px] text-[#8B9890] leading-tight truncate mt-0.5">
                  Volume variance and game state
                </span>
              </div>
            </div>

            <div className="p-3 flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] flex items-center justify-center text-[#B6E63B] shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                  Grounded explanations
                </span>
                <span className="text-[11.5px] text-[#8B9890] leading-tight truncate mt-0.5">
                  Quantitative audits, zero hype
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
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] leading-[1.25] font-[700] tracking-[-0.02em] text-[#ECF1EE]">
              {isBasketball ? 'Live matchups' : 'Live fixtures'}
            </h2>
            {isBasketball && lastUpdated && (
              <span className="text-[11px] text-[#8B9890] font-mono tabular-nums">
                · Last updated {lastUpdated}
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#151E19] border border-white/[0.07] text-[10px] font-mono text-[#8B9890]">
            <span className={`w-1.5 h-1.5 rounded-full ${isDelayed ? 'bg-[#E2AE45]' : 'bg-[#B6E63B]'} shrink-0`} />
            <span>{isDelayed ? 'Data delayed' : 'Pipeline active'}</span>
          </div>
        </div>

        {/* Notice when basketball sync is delayed by more than 2 hours */}
        {isBasketball && isDelayed && (
          <div className="p-2.5 rounded-[10px] bg-[#E2AE45]/10 border border-[#E2AE45]/30 text-[#E2AE45] text-[11.5px] flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Data delayed: Basketball live pipeline sync was delayed by more than 2 hours. Displaying latest verified schedule.</span>
          </div>
        )}

        {/* Fixtures list: 12px gaps */}
        {fixtures.length > 0 ? (
          <div className="space-y-3">
            {isBasketball
              ? fixtures.slice(0, 3).map((f) => <NBAGameCard key={f.id} fixture={f} />)
              : showcaseFootballFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
                  <FixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    topPrediction={topPick}
                    noRecommendationReason={noRecommendationReason}
                  />
                ))}

            <div className="pt-1 flex items-center justify-between text-[11.5px] text-[#5E6A63]">
              <span>
                Showing {Math.min(3, fixtures.length)} of {fixtures.length} {isBasketball ? 'games' : 'fixtures'}
              </span>
              <Link href="/matches" className="text-[#B6E63B] hover:underline flex items-center gap-1 font-semibold text-[12.5px]">
                <span>View all fixtures</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-[14px] bg-[#101713] border border-white/[0.07] text-center space-y-2 flex flex-col items-center justify-center">
            <div className="w-[36px] h-[36px] rounded-[10px] bg-[#151E19] border border-white/[0.07] flex items-center justify-center text-[#8B9890]">
              <Calendar className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="text-[14px] font-semibold text-[#ECF1EE]">
              {isBasketball ? 'No games scheduled in current window' : 'No games scheduled today'}
            </div>
            <p className="text-[12px] text-[#8B9890] max-w-xs leading-relaxed">
              {isBasketball
                ? 'No NBA matchups found for the window (today - 1 to +14 days). Live sync checks every 15 minutes.'
                : 'Upcoming matchups will appear here automatically. Check the upcoming tab in Fixtures.'}
            </p>
          </div>
        )}
      </section>

      {/* 5. ARCHITECTURE SECTION */}
      <section className="pt-2 space-y-2.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B9890]">
          ARCHITECTURE PHILOSOPHY
        </div>
        <h2 className="text-[18px] leading-[1.25] font-[700] tracking-[-0.02em] text-[#ECF1EE]">
          Why match winners are often the worst market
        </h2>
        <p className="text-[13px] leading-[1.55] text-[#8B9890]">
          Standard tipsters force a 1X2 pick on every fixture. Calibrall evaluates multiple lines to find calibrated value and abstains when edges are absent.
        </p>

        {/* Two compact cards: Multi market ranking & Discipline to abstain */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] flex items-center justify-center text-[#B6E63B] shrink-0">
                <Zap className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Multi market ranking</h3>
            </div>
            <p className="text-[12px] leading-[1.5] text-[#8B9890]">
              We evaluate totals, both teams to score, corners, cards and results simultaneously to find where real value lies.
            </p>
          </div>

          <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] flex items-center justify-center text-[#B6E63B] shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Discipline to abstain</h3>
            </div>
            <p className="text-[12px] leading-[1.5] text-[#8B9890]">
              When modeled probability fails to clear the hurdle (+3.0% edge), the engine abstains rather than inventing a pick.
            </p>
          </div>
        </div>
      </section>

      {/* Creators Teaser */}
      <HomeCreatorsTeaser />

      {/* Bug fix: Responsible Use disclaimer rendered ONLY ONCE as a compact amber tinted card */}
      <section className="pt-1 pb-2">
        <div className="rounded-[14px] p-3 border border-[#E2AE45]/[0.28] bg-[#E2AE45]/[0.08] flex items-start gap-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-[#E2AE45] shrink-0 mt-0.5" strokeWidth={2} />
          <div className="text-[11px] leading-[16px] text-[#ECF1EE]">
            <strong className="font-semibold text-[#E2AE45]">Responsible use: </strong>
            Calibrall provides quantitative statistical estimates. Sports outcomes contain irreducible variance; modeled probabilities never guarantee results. We do not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>
      </section>
    </div>
  );
}
