'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  Check, 
  BarChart3, 
  TrendingUp, 
  Zap, 
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Calculator,
  Activity
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

  const footballFeatureChecklist = [
    { title: 'Dixon-Coles goals model', desc: 'Bivariate Poisson joint distributions' },
    { title: 'NegBinomial corner lines', desc: 'Volume variance and game-state adjustments' },
    { title: 'Grounded explanations', desc: 'Quantitative audits with zero generated hype' },
    { title: 'No forced picks', desc: 'Engine abstains whenever edges are marginal' },
  ];

  const basketballFeatureChecklist = [
    { title: 'Exact Efficiency Model', desc: 'A_off = OffEff × Poss; A_def = DefEff × OppPoss' },
    { title: 'No Arbitrary Biases', desc: 'Zero pace blending or unverified home court inflation' },
    { title: '30 NBA Franchises', desc: 'Official ORtg/100, DRtg/100, PACE auto-filled & editable' },
    { title: 'Sportsbook Margin Leans', desc: 'Precise Over/Under and ATS spread differentials' },
  ];

  if (isSwitching) {
    return (
      <div className="space-y-6 py-8 animate-pulse">
        <div className="h-6 w-48 bg-white/10 rounded-[6px]" />
        <div className="h-16 w-3/4 bg-white/10 rounded-[8px]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="h-44 bg-[#0f2219] rounded-[12px] border border-white/10" />
          <div className="h-44 bg-[#0f2219] rounded-[12px] border border-white/10" />
          <div className="h-44 bg-[#0f2219] rounded-[12px] border border-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-7 py-2">
      {/* Hero Section */}
      <section className="space-y-6 pt-2 pb-8 border-b border-white/[0.08]">
        {/* Outlined pill */}
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[6px] border border-white/[0.08] bg-[#0f2219] text-[11px] text-[#8fa69a]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#b8e63a]" />
          <span>
            {isBasketball ? 'NBA Quantitative Basketball Intelligence' : 'Quantitative European Sports Intelligence'}
          </span>
          <span className="text-white/20">|</span>
          <span className="font-mono text-[#b8e63a]">Every call, on record</span>
        </div>

        {/* Hero headline */}
        <div className="space-y-3">
          {isBasketball ? (
            <>
              <h1 className="text-[26px] sm:text-[34px] font-[500] leading-[1.2] text-[#e8efe9]">
                Stop guessing NBA margins.<br />
                <span className="text-[#b8e63a]">Calculate where the efficiency edge lies.</span>
              </h1>
              <p className="text-[13px] leading-[1.6] text-[#8fa69a] max-w-xl">
                Independent NBA score projection engine. Evaluate offensive efficiency, defensive efficiency, and possessions per game to isolate true team totals, spreads, and moneyline edges.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[26px] sm:text-[34px] font-[500] leading-[1.2] text-[#e8efe9]">
                Stop guessing match winners.<br />
                <span className="text-[#b8e63a]">Find where the statistical edge lies.</span>
              </h1>
              <p className="text-[13px] leading-[1.6] text-[#8fa69a] max-w-xl">
                Calibrall independently evaluates all available football markets—total goals, corners, both teams to score, cards, and 1X2 lines—to identify qualified probability and verified expected value. When data is insufficient, it abstains.
              </p>
            </>
          )}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <Link
            href="/dashboard"
            className="h-[44px] px-5 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] text-[14px] font-[500] flex items-center justify-center gap-2 transition-colors"
          >
            <span>{isBasketball ? 'Launch NBA Projection Tool' : 'Launch analytics terminal'}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/performance"
            className="h-[42px] px-4 rounded-[8px] border border-white/[0.08] bg-[#0f2219] hover:bg-white/[0.04] text-[#e8efe9] text-[14px] font-[500] flex items-center justify-between sm:justify-center gap-3 transition-colors"
          >
            <span>Verify track record</span>
            <span className="font-mono text-[11px] text-[#b8e63a]">
              {isBasketball ? `Brier ${VERIFIED_NBA_PERFORMANCE_REPORT.brierScore.toFixed(3)}` : `Brier ${VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3)}`}
            </span>
          </Link>
        </div>

        {/* Feature checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl pt-2">
          {(isBasketball ? basketballFeatureChecklist : footballFeatureChecklist).map((item, idx) => (
            <div
              key={idx}
              className="p-[10px] rounded-[8px] bg-[#0f2219] border border-white/[0.08] flex items-start gap-2.5"
            >
              <div className="w-4 h-4 rounded-[4px] bg-[#b8e63a]/15 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-[#b8e63a]" />
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-[500] text-[#e8efe9] leading-tight">
                  {item.title}
                </div>
                <div className="text-[11px] text-[#8fa69a] leading-tight mt-0.5 truncate">
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive NBA Projection Tool Section (prominently available when Basketball is selected) */}
        {isBasketball && (
          <div className="pt-8">
            <NBAScoreProjectionTool />
          </div>
        )}

        {/* Live Fixtures Section */}
        <div className="pt-8">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
            <span className="text-[13px] font-[500] text-[#e8efe9]">
              {isBasketball ? 'NBA Games Today & Upcoming' : 'Live Fixtures'}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] border border-white/[0.1] text-[#b8e63a]">
              {liveDataAvailable ? 'Active verification' : `Updated ${lastUpdated}`}
            </span>
          </div>

          {fixtures.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
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

              <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[12px] text-[#8fa69a]">
                <span>
                  Displaying {Math.min(3, fixtures.length)} of {fixtures.length} {isBasketball ? 'NBA matchups' : 'live evaluated fixtures'}
                </span>
                <Link href="/matches" className="text-[#b8e63a] hover:underline flex items-center gap-1 font-[500]">
                  <span>View all {isBasketball ? 'NBA matchups & lines' : 'available fixtures & markets'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </>
          ) : (
            <div className="p-6 rounded-[12px] bg-[#0f2219] border border-white/[0.08] text-center space-y-2">
              <div className="font-mono text-[13px] text-[#e8efe9]">
                No games scheduled for today.
              </div>
              <p className="text-[12px] text-[#8fa69a] max-w-md mx-auto">
                Next scheduled matchups will display automatically. Check the upcoming tab in Fixtures.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Core Methodology Section */}
      <section className="pt-6 sm:pt-7 border-t border-white/[0.08] space-y-4">
        <div className="space-y-1 text-left">
          <span className="text-[11px] font-[500] tracking-[0.04em] text-[#5eb6e8] block">
            Architecture philosophy
          </span>
          <h2 className="text-[22px] font-[500] leading-[1.25] tracking-[-0.01em] text-[#e8efe9] text-left">
            {isBasketball ? 'Why Possessions & Efficiency Outperform Simple Scoring Averages' : 'Why match winners are often the worst market'}
          </h2>
          <p className="text-[13px] leading-[1.65] text-[#8fa69a] text-left max-w-[560px]">
            {isBasketball 
              ? 'Raw points per game fails to isolate pace distortions. By decoupling offensive points per possession from opponent pace and defensive allowance, our engine computes true game states.'
              : 'Standard prediction tools force a 1X2 pick on every match regardless of efficiency. Calibrall scans up to 18 market lines across the 10 authorized catalog types to isolate statistical mispricings.'}
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          <div className="p-4 bg-[#0f2219] border border-white/[0.08] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#5eb6e8]/10 flex items-center justify-center text-[#5eb6e8] shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <h3 className="text-[14px] font-[500] text-[#e8efe9]">
                  {isBasketball ? 'Pace & Possession Normalization' : 'Multi-market ranking'}
                </h3>
              </div>
              <p className="text-[12px] text-[#8fa69a] mt-2.5 leading-relaxed">
                {isBasketball
                  ? 'Each team’s defense is tested specifically against the opponent’s expected pace. Possessions are never artificially blended.'
                  : 'We rank 1X2, Over/Under, BTTS, Corners, and Cards simultaneously to find the single highest expected value candidate.'}
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#0f2219] border border-white/[0.08] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#b8e63a]/10 flex items-center justify-center text-[#b8e63a] shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="text-[14px] font-[500] text-[#e8efe9]">
                  {isBasketball ? 'Grounded Mathematical Audit' : 'Discipline to abstain'}
                </h3>
              </div>
              <p className="text-[12px] text-[#8fa69a] mt-2.5 leading-relaxed">
                {isBasketball
                  ? 'Every single step (A_off, B_off, A_def, B_def, projected scores, margins, totals) is exposed in plain text for verifiable transparency.'
                  : 'If no market presents at least a +3.0% probability edge and verified data coverage, the engine labels the match "No recommendation".'}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
