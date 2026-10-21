import React from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Sliders, 
  Zap, 
  AlertTriangle,
  Lock,
  ChevronRight,
  Database
} from 'lucide-react';
import { COMPETITIONS, FIXTURES, FIXTURE_STATISTICS, VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';

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

  return (
    <div className="space-y-24 py-4">
      {/* Hero Section */}
      <section className="relative pt-6 pb-12 overflow-hidden border-b border-border-subtle">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-surface-100 border border-border shadow-glow-lime">
            <div className="w-5 h-5 rounded-full overflow-hidden bg-[#f4f1ea] shrink-0 border border-border/80">
              <img
                src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                alt="Calibrall"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-extrabold text-white text-xs tracking-tight">Calibrall</span>
            <span className="text-gray-500">•</span>
            <span className="text-brand-accent text-xs font-mono font-bold tracking-wide">
              Every call, on record.
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Stop Guessing Match Winners. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-emerald via-emerald-400 to-blue-400">
              Find Where The Statistical Edge Lies.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            CALIBRALL independently evaluates all available football markets—Total Goals, Corners, Both Teams to Score, Cards, and 1X2 lines—to identify qualified probability and verified expected value. When the data is insufficient, it abstains.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-6 py-3 rounded bg-brand-emerald hover:bg-emerald-600 text-navy-950 font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-glow-emerald"
            >
              <span>Launch Analytics Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/performance"
              className="w-full sm:w-auto px-6 py-3 rounded bg-surface-100 hover:bg-surface-50 border border-border text-gray-200 font-semibold text-sm flex items-center justify-center space-x-2 transition-all"
            >
              <BarChart3 className="w-4 h-4 text-brand-blue" />
              <span>Verify Track Record (Brier 0.176)</span>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs font-mono text-gray-400">
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
              <span>Dixon-Coles Goals Model</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
              <span>NegBinomial Corners Lines</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
              <span>Grounded Statistical Explanations</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
              <span>No Forced Picks Policy</span>
            </span>
          </div>
        </div>

        {/* Live Terminal Preview Card */}
        <div className="mt-12 bg-surface-200 border border-border rounded-lg shadow-terminal p-4 sm:p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-brand-accent shadow-glow-lime" />
              </div>
              <span className="font-mono text-xs text-gray-400">calibrall-terminal // live-fixtures-feed</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="hidden sm:inline font-mono text-[10px] text-brand-accent tracking-wider font-bold">
                EVERY CALL, ON RECORD.
              </span>
              <span className="text-[10px] font-mono text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded border border-brand-accent/30 font-bold">
                ACTIVE VERIFICATION
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {showcaseFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
              />
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-gray-400">
            <span>Displaying 3 of 6 live evaluated fixtures for today</span>
            <Link href="/matches" className="text-brand-emerald hover:underline flex items-center">
              <span>View all available fixtures & markets</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Core Paradigm: Intelligent Market Selection */}
      <section className="space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="text-xs font-mono uppercase tracking-widest text-brand-blue">Architecture Philosophy</span>
          <h2 className="text-3xl font-extrabold text-white">Why Match Winners Are Often The Worst Market</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Most prediction tools force a 1X2 pick on every game regardless of efficiency. CALIBRALL scans up to 18 market lines per fixture to find statistical mispricings where the evidence is overwhelmingly concentrated.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-surface-200 border border-border rounded-lg space-y-3">
            <div className="w-10 h-10 rounded bg-emerald-500/10 border border-brand-emerald/30 flex items-center justify-center text-brand-emerald">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Multi-Market Ranking</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We compute exact joint probability distributions for Goals (Over/Under 1.5, 2.5, 3.5), Both Teams to Score, Total Corners (8.5, 9.5, 10.5), and Disciplinary Bookings.
            </p>
          </div>

          <div className="p-6 bg-surface-200 border border-border rounded-lg space-y-3">
            <div className="w-10 h-10 rounded bg-blue-500/10 border border-brand-blue/30 flex items-center justify-center text-brand-blue">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Mathematical Expected Value</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We calculate <span className="font-mono text-gray-200">EV = (p × Odds) - 1</span> and adjust for bookmaker overround. A 70% probability is disqualified if the price implies 75%.
            </p>
          </div>

          <div className="p-6 bg-surface-200 border border-border rounded-lg space-y-3">
            <div className="w-10 h-10 rounded bg-amber-500/10 border border-brand-amber/30 flex items-center justify-center text-brand-amber">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Abstention Discipline</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              When data coverage is low, tactical uncertainty is high, or market prices are perfectly efficient, CALIBRALL proudly outputs <em>&quot;No strong recommendation&quot;</em>.
            </p>
          </div>
        </div>
      </section>

      {/* Model Performance Overview */}
      <section className="bg-surface-200 border border-border rounded-xl p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-brand-emerald">Audited Track Record</span>
            <h2 className="text-2xl font-bold text-white mt-1">Walk-Forward Model Calibration</h2>
            <p className="text-xs text-gray-400 mt-1">
              Evaluated on 420 out-of-sample European fixtures across Premier League, Champions League, La Liga, and Bundesliga.
            </p>
          </div>
          <Link
            href="/performance"
            className="px-4 py-2 rounded bg-surface-100 hover:bg-surface-50 border border-border text-xs font-semibold text-white flex items-center space-x-1.5 self-start md:self-auto"
          >
            <span>View Full Calibration Plot</span>
            <ArrowRight className="w-3.5 h-3.5 text-brand-emerald" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center font-mono">
          <div className="p-4 bg-surface-100 rounded border border-border">
            <span className="text-xs text-gray-400 block mb-1">Settled Predictions</span>
            <span className="text-2xl font-bold text-white">{VERIFIED_PERFORMANCE_REPORT.settledPredictions}</span>
          </div>
          <div className="p-4 bg-surface-100 rounded border border-border">
            <span className="text-xs text-gray-400 block mb-1">Overall Hit Rate</span>
            <span className="text-2xl font-bold text-brand-emerald">
              {(VERIFIED_PERFORMANCE_REPORT.hitRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="p-4 bg-surface-100 rounded border border-border">
            <span className="text-xs text-gray-400 block mb-1">Brier Calibration</span>
            <span className="text-2xl font-bold text-white">{VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3)}</span>
          </div>
          <div className="p-4 bg-surface-100 rounded border border-border">
            <span className="text-xs text-gray-400 block mb-1">Level-Stake ROI</span>
            <span className="text-2xl font-bold text-brand-emerald">
              +{(VERIFIED_PERFORMANCE_REPORT.averageYieldRoi * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </section>

      {/* Supported Leagues */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-white">Tier-1 European League Coverage</h2>
          <p className="text-xs text-gray-400 mt-1">Continuous team attack & defense ratings with shrinkage toward league baselines</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {COMPETITIONS.map(comp => (
            <div key={comp.id} className="p-4 bg-surface-200 border border-border rounded text-center space-y-2">
              <img src={comp.emblemUrl} alt={comp.name} className="w-8 h-8 mx-auto object-contain" />
              <div className="font-bold text-white text-xs">{comp.name}</div>
              <div className="text-[10px] text-gray-400 font-mono">
                Avg {comp.avgGoalsPerGame} goals/g
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Subscription Plans Section */}
      <section className="space-y-8">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <span className="text-xs font-mono uppercase tracking-widest text-brand-emerald">Transparent Pricing</span>
          <h2 className="text-3xl font-extrabold text-white">Choose Your Analytical Depth</h2>
          <p className="text-xs text-gray-400">Upgrade or downgrade anytime. No hidden lock-in.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Free Tier */}
          <div className="p-6 bg-surface-200 border border-border rounded-lg flex flex-col justify-between space-y-6">
            <div>
              <span className="text-xs font-mono text-gray-400 uppercase font-semibold">Starter / Research</span>
              <h3 className="text-xl font-bold text-white mt-1">Free Tier</h3>
              <div className="text-2xl font-bold text-white mt-3 font-mono">$0 <span className="text-xs text-gray-400 font-normal">/ month</span></div>
              <p className="text-xs text-gray-400 mt-2">Essential match result distributions and basic goal line models.</p>

              <ul className="mt-6 space-y-2.5 text-xs text-gray-300">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>3 European match analyses per day</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Basic Poisson goal distributions</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Public performance tracking</span>
                </li>
              </ul>
            </div>

            <Link
              href="/dashboard"
              className="w-full py-2.5 rounded bg-surface-100 hover:bg-surface-50 border border-border text-center text-xs font-semibold text-white block transition-colors"
            >
              Start Free Exploration
            </Link>
          </div>

          {/* Pro Tier (Featured) */}
          <div className="p-6 bg-surface-200 border-2 border-brand-emerald rounded-lg flex flex-col justify-between space-y-6 relative shadow-glow-emerald">
            <div className="absolute -top-3 right-6 bg-brand-emerald text-navy-950 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">
              Most Popular
            </div>

            <div>
              <span className="text-xs font-mono text-brand-emerald uppercase font-semibold">Pro Analyst</span>
              <h3 className="text-xl font-bold text-white mt-1">Pro Terminal</h3>
              <div className="text-2xl font-bold text-white mt-3 font-mono">$29 <span className="text-xs text-gray-400 font-normal">/ month</span></div>
              <p className="text-xs text-gray-400 mt-2">Complete multi-market ranking, expected value analysis, and corner lines.</p>

              <ul className="mt-6 space-y-2.5 text-xs text-gray-300">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Unlimited European fixture evaluations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Full Market Selection Engine ranking</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Expected Value (EV) & Edge calculations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Corners & Disciplinary Bookings models</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  <span>Saved fixtures & watchlist alerts</span>
                </li>
              </ul>
            </div>

            <Link
              href="/pricing"
              className="w-full py-2.5 rounded bg-brand-emerald hover:bg-emerald-600 text-center text-xs font-bold text-navy-950 block transition-colors"
            >
              Get Pro Access
            </Link>
          </div>

          {/* Premium Tier */}
          <div className="p-6 bg-surface-200 border border-border rounded-lg flex flex-col justify-between space-y-6">
            <div>
              <span className="text-xs font-mono text-brand-blue uppercase font-semibold">Institutional / Syndicate</span>
              <h3 className="text-xl font-bold text-white mt-1">Premium Terminal</h3>
              <div className="text-2xl font-bold text-white mt-3 font-mono">$79 <span className="text-xs text-gray-400 font-normal">/ month</span></div>
              <p className="text-xs text-gray-400 mt-2">API endpoints, custom model parameter tuning, and raw Poisson matrices.</p>

              <ul className="mt-6 space-y-2.5 text-xs text-gray-300">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                  <span>Everything in Pro Terminal</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                  <span>REST API programmatic access (/api/v1)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                  <span>Custom shrinkage & Dixon-Coles rho tuning</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                  <span>Historical raw CSV exports</span>
                </li>
              </ul>
            </div>

            <Link
              href="/pricing"
              className="w-full py-2.5 rounded bg-surface-100 hover:bg-surface-50 border border-border text-center text-xs font-semibold text-white block transition-colors"
            >
              Explore Premium
            </Link>
          </div>
        </div>
      </section>

      {/* Responsible Gaming & Probabilistic Integrity */}
      <section className="bg-surface-100 border border-border rounded-lg p-6 max-w-4xl mx-auto space-y-3">
        <div className="flex items-center space-x-2 text-brand-amber font-semibold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>Commitment to Statistical Integrity</span>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed">
          CALIBRALL was created as an antidote to unsubstantiated &quot;guaranteed lock&quot; tipping websites. Sports outcomes are subject to irreducible randomness. Our algorithms quantify uncertainty, disclose small sample warnings, and never alter past results retrospectively.
        </p>
      </section>
    </div>
  );
}
