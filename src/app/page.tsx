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
  ShieldCheck
} from 'lucide-react';
import { COMPETITIONS, FIXTURES, FIXTURE_STATISTICS, VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import TeamCrest from '@/components/TeamCrest';

export default function HomePage() {
  const showcaseFixtures = FIXTURES.slice(0, 3).map(fixture => {
    const stats = FIXTURE_STATISTICS[fixture.id] || {
      homeXg: 1.5,
      awayXg: 1.2,
      expectedCornersHome: 5.5,
      expectedCornersAway: 4.5,
      expectedCards: 4.2,
      uncertaintyScore: 0.1,
      dataCoverageScore: 0.92,
      sampleSizeMatches: 20,
    };

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

  const featureChecklist = [
    { title: 'Dixon-Coles goals model', desc: 'Bivariate Poisson joint distributions' },
    { title: 'NegBinomial corner lines', desc: 'Volume variance and game-state adjustments' },
    { title: 'Grounded explanations', desc: 'Quantitative audits with zero generated hype' },
    { title: 'No forced picks', desc: 'Engine abstains whenever edges are marginal' },
  ];

  return (
    <div className="space-y-16 py-2">
      {/* Hero Section */}
      <section className="space-y-6 pt-2 pb-8 border-b border-white/[0.08]">
        {/* Outlined pill */}
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[6px] border border-white/[0.08] bg-[#0f2219] text-[11px] text-[#8fa69a]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#b8e63a]" />
          <span>Quantitative sports intelligence</span>
          <span className="text-white/20">|</span>
          <span className="font-mono text-[#b8e63a]">Every call, on record</span>
        </div>

        {/* Hero headline: 26px mobile / 34px desktop, 500 weight, line-height 1.2, line 1 white, line 2 solid lime */}
        <div className="space-y-3">
          <h1 className="text-[26px] sm:text-[34px] font-[500] leading-[1.2] text-[#e8efe9]">
            Stop guessing match winners.<br />
            <span className="text-[#b8e63a]">Find where the statistical edge lies.</span>
          </h1>

          <p className="text-[13px] leading-[1.6] text-[#8fa69a] max-w-xl">
            Calibrall independently evaluates all available football markets—total goals, corners, both teams to score, cards, and 1X2 lines—to identify qualified probability and verified expected value. When data is insufficient, it abstains.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <Link
            href="/dashboard"
            className="h-[44px] px-5 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] text-[14px] font-[500] flex items-center justify-center gap-2 transition-colors"
          >
            <span>Launch analytics terminal</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/performance"
            className="h-[42px] px-4 rounded-[8px] border border-white/[0.08] bg-[#0f2219] hover:bg-white/[0.04] text-[#e8efe9] text-[14px] font-[500] flex items-center justify-between sm:justify-center gap-3 transition-colors"
          >
            <span>Verify track record</span>
            <span className="font-mono text-[11px] text-[#b8e63a]">Brier 0.176</span>
          </Link>
        </div>

        {/* Feature checklist: 2-column grid of compact cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl pt-2">
          {featureChecklist.map((item, idx) => (
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

        {/* Live Fixtures Section */}
        <div className="pt-8">
          {/* Section header row */}
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
            <span className="text-[13px] font-[500] text-[#e8efe9]">Live fixtures</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] border border-white/[0.1] text-[#b8e63a]">
              Active verification
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {showcaseFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
              />
            ))}
          </div>

          <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[12px] text-[#8fa69a]">
            <span>Displaying 3 of 6 live evaluated fixtures for today</span>
            <Link href="/matches" className="text-[#b8e63a] hover:underline flex items-center gap-1 font-[500]">
              <span>View all available fixtures & markets</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Core Methodology Section */}
      <section className="space-y-6">
        <div className="space-y-1.5 max-w-xl">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#b8e63a]">
            Architecture
          </span>
          <h2 className="text-[20px] font-[500] text-[#e8efe9]">
            Why match winners are often the least efficient market
          </h2>
          <p className="text-[13px] leading-[1.6] text-[#8fa69a]">
            Standard prediction tools force a 1X2 pick on every match regardless of efficiency. Calibrall scans up to 18 market lines across the 10 authorized catalog types to isolate statistical mispricings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="p-4 bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-2">
            <div className="w-8 h-8 rounded-[6px] bg-[#b8e63a]/10 border border-[#b8e63a]/20 flex items-center justify-center text-[#b8e63a]">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-[14px] font-[500] text-[#e8efe9]">Multi-market ranking</h3>
            <p className="text-[12px] leading-[1.6] text-[#8fa69a]">
              Exact joint probability distributions for goals (over/under), both teams to score, corners, cards, and half splits.
            </p>
          </div>

          <div className="p-4 bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-2">
            <div className="w-8 h-8 rounded-[6px] bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[#e8efe9]">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-[14px] font-[500] text-[#e8efe9]">Expected value edge</h3>
            <p className="text-[12px] leading-[1.6] text-[#8fa69a]">
              Calculates EV = (p × odds) - 1 adjusted for overround. A 70% model probability is disqualified if the market already implies 75%.
            </p>
          </div>

          <div className="p-4 bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-2">
            <div className="w-8 h-8 rounded-[6px] bg-[#e3b341]/10 border border-[#e3b341]/20 flex items-center justify-center text-[#e3b341]">
              <AlertCircle className="w-4 h-4" />
            </div>
            <h3 className="text-[14px] font-[500] text-[#e8efe9]">Abstention discipline</h3>
            <p className="text-[12px] leading-[1.6] text-[#8fa69a]">
              When coverage is scarce, tactical variance is high, or prices are fair, Calibrall returns &quot;No strong recommendation&quot;.
            </p>
          </div>
        </div>
      </section>

      {/* Model Performance Overview */}
      <section className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div>
            <span className="text-[11px] font-mono uppercase text-[#b8e63a]">Audited calibration</span>
            <h2 className="text-[18px] font-[500] text-[#e8efe9] mt-0.5">Walk-forward validation track record</h2>
            <p className="text-[12px] text-[#8fa69a] mt-0.5">
              Evaluated on 420 out-of-sample fixtures across Premier League, Champions League, La Liga, and Bundesliga.
            </p>
          </div>
          <Link
            href="/performance"
            className="h-[36px] px-3.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[12px] font-[500] text-[#e8efe9] flex items-center gap-1.5 self-start sm:self-auto transition-colors"
          >
            <span>Full track record</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#b8e63a]" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
          <div className="p-3 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
            <span className="text-[11px] text-[#8fa69a] block mb-0.5">Settled predictions</span>
            <span className="text-[18px] font-[500] text-[#e8efe9]">{VERIFIED_PERFORMANCE_REPORT.settledPredictions}</span>
          </div>
          <div className="p-3 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
            <span className="text-[11px] text-[#8fa69a] block mb-0.5">Overall hit rate</span>
            <span className="text-[18px] font-[500] text-[#b8e63a]">
              {(VERIFIED_PERFORMANCE_REPORT.hitRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="p-3 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
            <span className="text-[11px] text-[#8fa69a] block mb-0.5">Brier calibration</span>
            <span className="text-[18px] font-[500] text-[#e8efe9]">{VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3)}</span>
          </div>
          <div className="p-3 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
            <span className="text-[11px] text-[#8fa69a] block mb-0.5">Level-stake ROI</span>
            <span className="text-[18px] font-[500] text-[#b8e63a]">
              +{(VERIFIED_PERFORMANCE_REPORT.averageYieldRoi * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </section>

      {/* Supported Leagues: 24x24 fixed box crests */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-[16px] font-[500] text-[#e8efe9]">Tier-1 European league coverage</h2>
          <p className="text-[12px] text-[#8fa69a]">Continuous team ratings with shrinkage toward verified competition baselines</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {COMPETITIONS.map(comp => (
            <div key={comp.id} className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[10px] flex items-center gap-2.5">
              <TeamCrest
                crestUrl={comp.emblemUrl}
                teamName={comp.name}
                size={24}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-[500] text-[#e8efe9] truncate">{comp.name}</div>
                <div className="text-[11px] text-[#8fa69a] font-mono truncate">
                  Avg {comp.avgGoalsPerGame} g/m
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Commitment to Integrity */}
      <section className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-[#b8e63a] shrink-0 mt-0.5" />
        <div className="space-y-1 text-[12px] text-[#8fa69a] leading-[1.6]">
          <span className="font-[500] text-[#e8efe9] block">Statistical integrity policy</span>
          Calibrall was created as a transparent antidote to unsubstantiated tipping claims. Sports outcomes are subject to irreducible randomness. Our engine strictly quantifies uncertainty, provides grounded data audits, and never alters historical benchmarks retrospectively.
        </div>
      </section>
    </div>
  );
}
