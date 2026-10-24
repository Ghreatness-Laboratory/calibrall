'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ChevronRight,
  ShieldCheck,
  Calendar,
  Zap,
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

export default function HomeClient() {
  const { sport, isSwitching } = useSport();
  const { fixtures, isLoading } = useLiveFixtures('ALL', 'ALL', sport);

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
        <div className="h-6 w-48 bg-[#141A23] rounded-[10px]" />
        <div className="h-12 w-full bg-[#141A23] rounded-[14px]" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-[66px] bg-[#141A23] rounded-[14px]" />
          <div className="h-[66px] bg-[#141A23] rounded-[14px]" />
          <div className="h-[66px] bg-[#141A23] rounded-[14px]" />
        </div>
        <div className="h-44 bg-[#141A23] rounded-[18px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Hero headline 22px: Both lines the same weight: line 1 white, line 2 muted. Do not color single words. */}
      <section className="space-y-2 pt-1">
        <h1 className="text-[22px] leading-[28px] font-semibold tracking-[-0.015em]">
          <div className="text-[#EDF1F6]">
            {isBasketball ? 'Stop guessing NBA margins.' : 'Stop guessing match winners.'}
          </div>
          <div className="text-[#8A95A5]">
            {isBasketball ? 'Calculate where the edge lies.' : 'Find where the edge lies.'}
          </div>
        </h1>

        {/* Short description 13px */}
        <p className="text-[13px] leading-[18px] text-[#8A95A5]">
          {isBasketball
            ? 'Possession efficiency models for NBA spreads, totals, and leans. We abstain when the edge is thin.'
            : 'Probabilistic models for goals, corners, cards and 1X2. We abstain when the data is thin.'}
        </p>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Primary CTA 46px high, label 15 semibold ("Open analytics terminal", no arrow) */}
          <Link
            href="/dashboard"
            className="w-full h-[46px] rounded-[14px] bg-[#A8E05F] hover:bg-[#b5e870] active:scale-[0.98] text-[#0D1117] text-[15px] font-semibold flex items-center justify-center transition-all duration-120 touch-press"
          >
            <span>Open analytics terminal</span>
          </Link>

          {/* Secondary row 44px (surface, 1px border, chevron) */}
          <Link
            href="/performance"
            className="w-full h-[44px] px-3.5 rounded-[14px] border border-[#232C3A] bg-[#141A23] hover:bg-[#1A222E] active:scale-[0.98] text-[#EDF1F6] text-[13px] font-medium flex items-center justify-between transition-all duration-120 touch-press"
          >
            <span>Verify track record</span>
            <div className="flex items-center gap-1.5 text-[12px] text-[#8A95A5] tabular-nums">
              <span>Brier {brierValue}</span>
              <ChevronRight className="w-4 h-4 text-[#8A95A5]" strokeWidth={2} />
            </div>
          </Link>
        </div>

        {/* Stat tiles: 3 across, 66px high, label 11 muted, value 20 semibold */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="h-[66px] p-2.5 bg-[#141A23] border border-[#232C3A] rounded-[14px] flex flex-col justify-between">
            <span className="text-[11px] text-[#8A95A5] font-normal leading-tight">
              Brier score
            </span>
            <span className="text-[20px] font-semibold text-[#EDF1F6] tabular-nums leading-none">
              {brierValue}
            </span>
          </div>

          <div className="h-[66px] p-2.5 bg-[#141A23] border border-[#232C3A] rounded-[14px] flex flex-col justify-between">
            <span className="text-[11px] text-[#8A95A5] font-normal leading-tight">
              Markets
            </span>
            <span className="text-[20px] font-semibold text-[#EDF1F6] tabular-nums leading-none">
              {isBasketball ? '3' : '18'}
            </span>
          </div>

          <div className="h-[66px] p-2.5 bg-[#141A23] border border-[#232C3A] rounded-[14px] flex flex-col justify-between">
            <span className="text-[11px] text-[#8A95A5] font-normal leading-tight">
              Min. edge
            </span>
            <span className="text-[20px] font-semibold text-[#EDF1F6] tabular-nums leading-none">
              +3.0%
            </span>
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
          <h2 className="text-[16px] font-semibold text-[#EDF1F6]">
            {isBasketball ? 'Live matchups' : 'Live fixtures'}
          </h2>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141A23] border border-[#232C3A] text-[11px] text-[#8A95A5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A8E05F]" />
            <span>Pipeline active</span>
          </div>
        </div>

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

            <div className="pt-1 flex items-center justify-between text-[12px] text-[#5F6B7C]">
              <span>
                Showing {Math.min(3, fixtures.length)} of {fixtures.length} {isBasketball ? 'games' : 'fixtures'}
              </span>
              <Link href="/matches" className="text-[#A8E05F] hover:underline flex items-center gap-1 font-semibold text-[13px]">
                <span>View all fixtures</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-[18px] bg-[#141A23] border border-[#232C3A] text-center space-y-2 flex flex-col items-center justify-center">
            <div className="w-[36px] h-[36px] rounded-[10px] bg-[#1A222E] border border-[#232C3A] flex items-center justify-center text-[#8A95A5]">
              <Calendar className="w-4 h-4" strokeWidth={1.8} />
            </div>
            <div className="text-[14px] font-semibold text-[#EDF1F6]">
              No games scheduled today
            </div>
            <p className="text-[12px] text-[#8A95A5] max-w-xs leading-relaxed">
              Upcoming matchups will appear here automatically. Check the upcoming tab in Fixtures.
            </p>
          </div>
        )}
      </section>

      {/* Philosophy cards */}
      <section className="pt-2 space-y-2.5">
        <h2 className="text-[16px] font-semibold text-[#EDF1F6]">
          Why match winners are often the worst market
        </h2>
        <p className="text-[13px] leading-[18px] text-[#8A95A5]">
          Standard tipsters force a 1X2 pick on every fixture. Calibrall evaluates multiple lines to find calibrated value and abstains when edges are absent.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3.5 bg-[#141A23] border border-[#232C3A] rounded-[18px] space-y-1.5">
            <div className="flex items-center gap-2 text-[#A8E05F]">
              <Zap className="w-4 h-4" strokeWidth={2} />
              <h3 className="text-[14px] font-semibold text-[#EDF1F6]">Multi market ranking</h3>
            </div>
            <p className="text-[12.5px] leading-[17px] text-[#8A95A5]">
              We evaluate totals, both teams to score, corners, cards and results simultaneously to find where real value lies.
            </p>
          </div>

          <div className="p-3.5 bg-[#141A23] border border-[#232C3A] rounded-[18px] space-y-1.5">
            <div className="flex items-center gap-2 text-[#A8E05F]">
              <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              <h3 className="text-[14px] font-semibold text-[#EDF1F6]">Discipline to abstain</h3>
            </div>
            <p className="text-[12.5px] leading-[17px] text-[#8A95A5]">
              When modeled probability fails to clear the hurdle (+3.0% edge), the engine abstains rather than inventing a pick.
            </p>
          </div>
        </div>
      </section>

      {/* Creators Teaser */}
      <HomeCreatorsTeaser />

      {/* Responsible use disclaimer */}
      <section className="pt-1 pb-4">
        <div className="rounded-[18px] p-3.5 border border-[#E8B64A]/30 bg-[#141A23] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#E8B64A] shrink-0 mt-0.5" strokeWidth={1.8} />
          <div className="text-[12px] leading-[18px] text-[#8A95A5]">
            <strong className="font-semibold text-[#EDF1F6]">Responsible use: </strong>
            Calibrall is a statistical modeling terminal providing objective probabilistic estimates. Sporting events contain natural variance; modeled probabilities never guarantee outcomes. Calibrall does not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>
      </section>
    </div>
  );
}
