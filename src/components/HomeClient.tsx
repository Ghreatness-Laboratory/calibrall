'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  BarChart3, 
  TrendingUp, 
  Zap, 
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Layers,
  Cpu,
  Target
} from 'lucide-react';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { getFixtureStatistics, VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';

export default function HomeClient() {
  const { sport, isSwitching } = useSport();
  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures('ALL', 'ALL', sport);

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

  const footballModels = [
    { 
      title: 'Dixon Coles goals model', 
      subtitle: 'Bivariate Poisson joint distributions',
      icon: Cpu 
    },
    { 
      title: 'NegBinomial corner lines', 
      subtitle: 'Volume variance and game state',
      icon: TrendingUp 
    },
    { 
      title: 'Grounded explanations', 
      subtitle: 'Quantitative audits, zero hype',
      icon: ShieldCheck 
    },
  ];

  const basketballModels = [
    { 
      title: 'Exact Efficiency Model', 
      subtitle: 'A_off = OffEff × Poss; A_def = DefEff × OppPoss',
      icon: Cpu 
    },
    { 
      title: 'Possessions & Pace Normalization', 
      subtitle: 'Zero arbitrary biases or unverified inflation',
      icon: TrendingUp 
    },
    { 
      title: 'Grounded mathematical audit', 
      subtitle: 'Full transparent calculation steps exposed',
      icon: ShieldCheck 
    },
  ];

  // Skeleton Loader for smooth transitions
  if (isSwitching) {
    return (
      <div className="space-y-6 py-4 animate-pulse">
        <div className="h-4 w-32 bg-[#151E19] rounded-[6px]" />
        <div className="h-14 w-full max-w-md bg-[#151E19] rounded-[10px]" />
        <div className="h-10 w-full bg-[#151E19] rounded-[11px]" />
        <div className="grid grid-cols-3 gap-2.5">
          <div className="h-16 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
          <div className="h-16 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
          <div className="h-16 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        </div>
        <div className="h-44 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  const brierValue = isBasketball 
    ? VERIFIED_NBA_PERFORMANCE_REPORT.brierScore.toFixed(3) 
    : VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3);

  return (
    <div className="space-y-6 py-2">
      {/* 4. HOME SCREEN HERO */}
      <section className="space-y-4 pt-1">
        {/* Mono Eyebrow */}
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#B6E63B] font-semibold">
          STATISTICAL EDGE ENGINE
        </div>

        {/* H1 Heading */}
        <h1 className="text-[23px] leading-[1.2] font-bold tracking-[-0.025em] text-[#ECF1EE]">
          {isBasketball ? (
            <>
              Stop guessing NBA margins.<br />
              <span className="text-[#B6E63B]">Calculate where the edge lies.</span>
            </>
          ) : (
            <>
              Stop guessing match winners.<br />
              <span className="text-[#B6E63B]">Find where the edge lies.</span>
            </>
          )}
        </h1>

        {/* Short description */}
        <p className="text-[13px] leading-[1.55] text-[#8B9890] max-w-lg">
          {isBasketball
            ? 'Calibrall independently models offensive and defensive efficiency per 100 possessions to surface verified NBA spreads, totals, and leans.'
            : 'Calibrall evaluates goals, corners, both teams to score, cards and 1X2 lines to surface verified expected value, and abstains when data is thin.'}
        </p>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Primary Button */}
          <Link
            href="/dashboard"
            className="w-full h-[46px] rounded-[11px] bg-[#B6E63B] hover:bg-[#c8ee47] active:bg-[#a5cf30] text-[#0A0F0D] text-[14px] font-[650] flex items-center justify-center gap-2 transition-transform duration-150 active:scale-[0.98] shadow-xs"
          >
            <span>{isBasketball ? 'Launch NBA analytics terminal' : 'Launch analytics terminal'}</span>
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>

          {/* Ghost Row: Verify track record with Brier in lime mono */}
          <Link
            href="/performance"
            className="w-full h-[44px] px-4 rounded-[11px] border border-white/[0.07] bg-[#101713] hover:bg-[#151E19] text-[#ECF1EE] text-[13px] font-medium flex items-center justify-between transition-transform duration-150 active:scale-[0.98]"
          >
            <span>Verify track record</span>
            <div className="flex items-center gap-1.5 font-mono text-[11.5px] tabular-nums">
              <span className="text-[#5E6A63]">Brier</span>
              <span className="text-[#B6E63B] font-semibold">{brierValue}</span>
            </div>
          </Link>
        </div>

        {/* Row of Three Equal Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px] flex flex-col justify-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#8B9890]">
              BRIER SCORE
            </span>
            <span className="text-[17px] font-[650] text-[#B6E63B] font-mono tabular-nums mt-0.5">
              {brierValue}
            </span>
          </div>

          <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px] flex flex-col justify-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#8B9890]">
              MARKETS
            </span>
            <span className="text-[17px] font-[650] text-[#ECF1EE] font-mono tabular-nums mt-0.5">
              {isBasketball ? '3' : '18'}
            </span>
          </div>

          <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px] flex flex-col justify-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#8B9890]">
              MIN. EDGE
            </span>
            <span className="text-[17px] font-[650] text-[#ECF1EE] font-mono tabular-nums mt-0.5">
              +3.0%
            </span>
          </div>
        </div>

        {/* Models Grouped List Card */}
        <div className="space-y-2 pt-2">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5E6A63] font-semibold">
            INFERENCE MODELS
          </div>
          <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden">
            {(isBasketball ? basketballModels : footballModels).map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="p-3.5 flex items-center gap-3">
                  <div className="w-[30px] h-[30px] min-w-[30px] rounded-[8px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] font-semibold text-[#ECF1EE] leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-[11.5px] text-[#8B9890] leading-tight mt-0.5 truncate">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* NBA Interactive Tool (when Basketball active) */}
      {isBasketball && (
        <section className="pt-2">
          <NBAScoreProjectionTool />
        </section>
      )}

      {/* Live Fixtures Preview */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.07]">
          <h2 className="text-[13px] font-semibold text-[#ECF1EE]">
            {isBasketball ? 'NBA Matchups Today' : 'Live Fixtures Today'}
          </h2>
          <span 
            suppressHydrationWarning
            className="text-[10px] font-mono px-2 py-0.5 rounded-[5px] border border-white/[0.07] bg-[#151E19] text-[#B6E63B] tabular-nums"
          >
            {liveDataAvailable ? 'Active pipeline' : (lastUpdated ? `Sync ${lastUpdated}` : 'Live')}
          </span>
        </div>

        {fixtures.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
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
            </div>

            <div className="pt-1 flex items-center justify-between text-[11.5px] text-[#5E6A63]">
              <span>
                Displaying {Math.min(3, fixtures.length)} of {fixtures.length} {isBasketball ? 'matchups' : 'scheduled fixtures'}
              </span>
              <Link href="/matches" className="text-[#B6E63B] hover:underline flex items-center gap-1 font-medium">
                <span>View all fixtures & markets</span>
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
              </Link>
            </div>
          </>
        ) : (
          <div className="p-6 rounded-[14px] bg-[#101713] border border-dashed border-white/[0.12] text-center space-y-2 flex flex-col items-center justify-center">
            <div className="w-[34px] h-[34px] rounded-[9px] bg-[#151E19] border border-white/[0.07] flex items-center justify-center text-[#8B9890]">
              <Calendar className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="text-[13px] font-semibold text-[#ECF1EE]">
              No games scheduled for today.
            </div>
            <p className="text-[11.5px] text-[#8B9890] max-w-xs mx-auto leading-relaxed">
              Upcoming matchups will display automatically. Check the upcoming fixtures tab.
            </p>
          </div>
        )}
      </section>

      {/* 5. ARCHITECTURE SECTION */}
      <section className="pt-2 space-y-3">
        <div className="space-y-1 text-left">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5aa9e6] font-semibold block">
            ARCHITECTURE PHILOSOPHY
          </span>
          <h2 className="text-[18px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE] text-left">
            Why match winners are often the worst market
          </h2>
          <p className="text-[13px] leading-[1.55] text-[#8B9890] text-left max-w-lg">
            Standard prediction services force a 1X2 pick on every match regardless of efficiency. Calibrall scans multiple lines across the authorized catalog to isolate true mispricings, and abstains when edges are absent.
          </p>
        </div>

        {/* Two Compact Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3.5 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-[13px] font-semibold text-[#ECF1EE]">
                Multi market ranking
              </h3>
            </div>
            <p className="text-[12px] leading-[1.55] text-[#8B9890]">
              We evaluate goals, corners, cards, and result lines simultaneously to isolate where the greatest statistical edge resides.
            </p>
          </div>

          <div className="p-3.5 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-[13px] font-semibold text-[#ECF1EE]">
                Discipline to abstain
              </h3>
            </div>
            <p className="text-[12px] leading-[1.55] text-[#8B9890]">
              When modeled probability fails to clear the required margin of safety (+3.0% edge), the engine abstains rather than inventing a pick.
            </p>
          </div>
        </div>
      </section>

      {/* 5. BUG FIX: RESPONSIBLE USE DISCLAIMER (ONLY ONCE ON THE PAGE) */}
      <section className="pt-2">
        <div className="rounded-[14px] p-3.5 border border-[#E2AE45]/[0.28] bg-[#E2AE45]/[0.06] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#E2AE45] shrink-0 mt-0.5" strokeWidth={2} />
          <div className="text-[11px] leading-[1.55] text-[#E2AE45]/90">
            <strong className="font-semibold text-[#ECF1EE]">Responsible use disclaimer: </strong>
            Calibrall is a statistical modeling terminal providing objective probabilistic estimates and Poisson matrices. Sporting events are stochastic systems; high modeled probability is never a guarantee of outcome. Calibrall does not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>
      </section>
    </div>
  );
}
