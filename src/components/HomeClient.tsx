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
  Activity,
  Calendar
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
    <div className="space-y-[30px] py-2">
      {/* Hero Section */}
      <section className="space-y-[18px] pt-1 pb-6 border-b border-[var(--border)]">
        {/* 4. Tagline strip: single row, 10.5px, one-line; remove duplicate 'Every call, on record'; show short mono version tag at right */}
        <div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--text-3)] pb-2.5 border-b border-[var(--border)] w-full overflow-hidden">
          <div className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0 shadow-[0_0_0_3px_var(--accent-soft)]" />
            <span className="text-[var(--text-2)] uppercase tracking-[0.04em] truncate">
              {isBasketball ? 'NBA POSSESSION-EFFICIENCY MODEL' : 'BIVARIATE POISSON INFERENCE PIPELINE'}
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-3)] shrink-0 ml-2">v2.4.1</span>
        </div>

        {/* 5. Hero: mono eyebrow "STATISTICAL EDGE ENGINE" above H2; second sentence of H2 in --accent */}
        <div className="space-y-2.5">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-[var(--accent)] font-[600]">
            STATISTICAL EDGE ENGINE
          </div>

          {isBasketball ? (
            <>
              <h2 className="text-[25px] leading-[1.18] font-[650] tracking-[-0.025em] text-[var(--text)]">
                Stop guessing NBA margins.<br />
                <span className="text-[var(--accent)]">Calculate where the efficiency edge lies.</span>
              </h2>
              <p className="text-[12.8px] leading-[1.6] text-[var(--text-2)] max-w-xl">
                Independent NBA score projection engine. Evaluate offensive efficiency, defensive efficiency, and possessions per game to isolate true team totals, spreads, and moneyline edges.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[25px] leading-[1.18] font-[650] tracking-[-0.025em] text-[var(--text)]">
                Stop guessing match winners.<br />
                <span className="text-[var(--accent)]">Find where the statistical edge lies.</span>
              </h2>
              <p className="text-[12.8px] leading-[1.6] text-[var(--text-2)] max-w-xl">
                Calibrall independently evaluates all available football markets—total goals, corners, both teams to score, cards, and 1X2 lines—to identify qualified probability and verified expected value. When data is insufficient, it abstains.
              </p>
            </>
          )}
        </div>

        {/* 6. Primary CTA & Secondary row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto h-[44px] px-5 py-[12px] rounded-[10px] bg-[var(--accent)] hover:bg-[#c8ee47] active:bg-[#a5cf30] text-[var(--accent-ink)] text-[13.5px] font-[600] flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <span>{isBasketball ? 'Launch NBA Projection Tool' : 'Launch analytics terminal'}</span>
            <ArrowRight className="w-[15px] h-[15px]" strokeWidth={2} />
          </Link>

          <Link
            href="/performance"
            className="w-full sm:w-auto h-[42px] px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text)] text-[12.5px] font-[550] flex items-center justify-between sm:justify-center gap-4 transition-colors"
          >
            <span>Verify track record</span>
            <span className="font-mono text-[11px] tracking-tight">
              <span className="text-[var(--text-3)]">Brier </span>
              <span className="text-[var(--accent)] font-[550]">
                {isBasketball ? VERIFIED_NBA_PERFORMANCE_REPORT.brierScore.toFixed(3) : VERIFIED_PERFORMANCE_REPORT.brierScore.toFixed(3)}
              </span>
            </span>
          </Link>
        </div>

        {/* 7. Feature checklist: ONE grouped card with 1px dividers between rows (not four separate cards) */}
        <div className="border border-[var(--border)] bg-[var(--surface)] rounded-[12px] divide-y divide-[var(--border)] overflow-hidden max-w-xl mt-3">
          {(isBasketball ? basketballFeatureChecklist : footballFeatureChecklist).map((item, idx) => (
            <div
              key={idx}
              className="p-3 sm:px-3.5 sm:py-2.5 flex items-start sm:items-center gap-2.5"
            >
              {/* 18px checkbox tile with --accent-soft fill and thin accent border */}
              <div className="w-[18px] h-[18px] min-w-[18px] rounded-[5px] bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <Check className="w-3 h-3 text-[var(--accent)]" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-[600] text-[var(--text)] leading-tight">
                  {item.title}
                </div>
                <div className="text-[11.5px] text-[var(--text-3)] leading-tight mt-0.5 truncate">
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive NBA Projection Tool Section (when Basketball is selected) */}
        {isBasketball && (
          <div className="pt-6">
            <NBAScoreProjectionTool />
          </div>
        )}

        {/* 8. Live fixtures: header row with title (13.5px/620) + mono timestamp chip */}
        <div className="pt-6">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border)] mb-3.5">
            <h3 className="text-[13.5px] font-[620] text-[var(--text)]">
              {isBasketball ? 'NBA Games Today & Upcoming' : 'Live Fixtures'}
            </h3>
            <span 
              suppressHydrationWarning
              className="text-[10.5px] font-mono px-2 py-0.5 rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--accent)]"
            >
              {liveDataAvailable ? 'Active verification' : (lastUpdated ? `Updated ${lastUpdated}` : 'Live data pipeline')}
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

              <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-[11.5px] text-[var(--text-3)]">
                <span>
                  Displaying {Math.min(3, fixtures.length)} of {fixtures.length} {isBasketball ? 'NBA matchups' : 'live evaluated fixtures'}
                </span>
                <Link href="/matches" className="text-[var(--accent)] hover:underline flex items-center gap-1 font-[550]">
                  <span>View all {isBasketball ? 'NBA matchups & lines' : 'available fixtures & markets'}</span>
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                </Link>
              </div>
            </>
          ) : (
            /* Empty state: dashed 1px --border-strong card, 34px icon tile (calendar), title 12.5px, helper text 11.5px --text-3, centered */
            <div className="p-6 rounded-[12px] bg-[var(--surface)] border border-dashed border-[var(--border-strong)] text-center space-y-2 flex flex-col items-center justify-center">
              <div className="w-[34px] h-[34px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--text-2)] mb-0.5">
                <Calendar className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="text-[12.5px] font-[600] text-[var(--text)]">
                No games scheduled for today.
              </div>
              <p className="text-[11.5px] text-[var(--text-3)] max-w-sm mx-auto leading-relaxed">
                Next scheduled matchups will display automatically. Check the upcoming tab in Fixtures.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 9. Architecture section: eyebrow in --info, H3 18px, body 12.5px. Feature cards get 30px rounded icon tile, stroke icons 15px, title 13px/620, desc 12px/1.55 */}
      <section className="pt-2 space-y-3.5">
        <div className="space-y-1 text-left">
          <span className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-[var(--info)] font-[600] block">
            ARCHITECTURE PHILOSOPHY
          </span>
          <h3 className="text-[18px] font-[620] leading-[1.25] tracking-[-0.01em] text-[var(--text)] text-left">
            {isBasketball ? 'Why Possessions & Efficiency Outperform Simple Scoring Averages' : 'Why match winners are often the worst market'}
          </h3>
          <p className="text-[12.5px] leading-[1.6] text-[var(--text-2)] text-left max-w-xl">
            {isBasketball 
              ? 'Raw points per game fails to isolate pace distortions. By decoupling offensive points per possession from opponent pace and defensive allowance, our engine computes true game states.'
              : 'Standard prediction tools force a 1X2 pick on every match regardless of efficiency. Calibrall scans up to 18 market lines across the 10 authorized catalog types to isolate statistical mispricings.'}
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-[var(--info)]/10 border border-[var(--info)]/20 flex items-center justify-center text-[var(--info)] shrink-0">
                  <Zap className="w-[15px] h-[15px]" strokeWidth={1.75} />
                </div>
                <h4 className="text-[13px] font-[620] text-[var(--text)]">
                  {isBasketball ? 'Pace & Possession Normalization' : 'Multi-market ranking'}
                </h4>
              </div>
              <p className="text-[12px] leading-[1.55] text-[var(--text-2)] mt-2">
                {isBasketball
                  ? 'Each team’s defense is tested specifically against the opponent’s expected pace. Possessions are never artificially blended.'
                  : 'We rank 1X2, Over/Under, BTTS, Corners, and Cards simultaneously to find the single highest expected value candidate.'}
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-[var(--accent-soft)] border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0">
                  <ShieldCheck className="w-[15px] h-[15px]" strokeWidth={1.75} />
                </div>
                <h4 className="text-[13px] font-[620] text-[var(--text)]">
                  {isBasketball ? 'Grounded Mathematical Audit' : 'Discipline to abstain'}
                </h4>
              </div>
              <p className="text-[12px] leading-[1.55] text-[var(--text-2)] mt-2">
                {isBasketball
                  ? 'Every single step (A_off, B_off, A_def, B_def, projected scores, margins, totals) is exposed in plain text for verifiable transparency.'
                  : 'If no market presents at least a +3.0% probability edge and verified data coverage, the engine labels the match "No recommendation".'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Responsible-use disclaimer: warm amber-tinted card (border rgba(217,164,65,.3), bg rgba(217,164,65,.04)), 15px alert icon, 11px text --text-3 with bold lead-in in --text-2 */}
      <section className="pt-1">
        <div className="rounded-[12px] p-3.5 border border-[rgba(217,164,65,0.30)] bg-[rgba(217,164,65,0.04)] flex items-start gap-2.5">
          <AlertCircle className="w-[15px] h-[15px] text-[var(--warn)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="text-[11px] leading-[1.6] text-[var(--text-3)]">
            <strong className="font-[600] text-[var(--text-2)]">Responsible use disclaimer: </strong>
            Calibrall is an institutional statistical modeling terminal providing objective probabilistic estimates, Poisson goal matrices, and market edge metrics. Football matches and sporting events are stochastic systems; high model probability is never a guarantee of outcome. Calibrall does not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>
      </section>
    </div>
  );
}
