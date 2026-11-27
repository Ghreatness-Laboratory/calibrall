'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import MarketComparisonTable from '@/components/MarketComparisonTable';
import ExplanationCard from '@/components/ExplanationCard';
import ScorelineMatrix from '@/components/ScorelineMatrix';
import FactorsAndStatePanel from '@/components/FactorsAndStatePanel';
import TeamCrest from '@/components/TeamCrest';
import {
  ChevronLeft,
  Bookmark,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  CornerUpRight,
  Lock,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/storage/userStorage';
import { Fixture, MarketPrediction, WrittenMatchExplanation } from '@/types';
import { formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';
import type { BasketballMarketCategory } from '@/lib/basketball/markets';
import { evaluateLiveMatchState } from '@/lib/prediction/liveMatchState';
import { extractMatchStats, settleMarketPrediction } from '@/lib/prediction/settlementEngine';
import QuantitativeFactorsAuditPanel from '@/components/QuantitativeFactorsAuditPanel';
import LineupComparisonPanel from '@/components/LineupComparisonPanel';
import LineupChip from '@/components/LineupChip';
import { getFixtureLineupState } from '@/lib/data/lineupsService';
import { forwardPickLedger } from '@/lib/prediction/forwardPickLedger';
import { displayName, formatMatchTime, cleanDisplayText } from '@/lib/utils/formatText';
import { formatMonthlyPrice } from '@/lib/tiers';

const BB_CAT_TITLES: Record<BasketballMarketCategory, string> = {
  game_total: 'Game Total Over/Under',
  home_total: 'Home Team Total Over/Under',
  away_total: 'Away Team Total Over/Under',
  h1_game_total: '1st Half Game Total Over/Under',
  h1_team_total: '1st Half Team Total Over/Under',
};

function getClientBbSettlement(
  pick: BasketballPickCandidate,
  fixture: Fixture
): {
  status: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
  actualLabel: string | null;
} {
  if (fixture.status === 'POSTPONED' || fixture.status === 'CANCELED') {
    return { status: 'VOID', actualLabel: fixture.status };
  }
  if (fixture.status !== 'FINISHED') {
    return { status: 'PENDING', actualLabel: null };
  }
  const h = fixture.homeScore ?? null;
  const a = fixture.awayScore ?? null;
  const h1h = fixture.homeHalfTimeScore ?? null;
  const h1a = fixture.awayHalfTimeScore ?? null;
  let actual: number | null = null;
  let label: string | null = h !== null && a !== null ? `${h} - ${a}` : null;

  if (pick.marketCategory === 'game_total' && h !== null && a !== null) actual = h + a;
  else if (pick.marketCategory === 'home_total' && h !== null) actual = h;
  else if (pick.marketCategory === 'away_total' && a !== null) actual = a;
  else if (pick.marketCategory === 'h1_game_total' && h1h !== null && h1a !== null) {
    actual = h1h + h1a;
    label = `1H ${h1h} - ${h1a}`;
  } else if (pick.marketCategory === 'h1_team_total') {
    if (pick.side === 'away' && h1a !== null) {
      actual = h1a;
      label = `1H Away ${h1a}`;
    } else if (pick.side !== 'away' && h1h !== null) {
      actual = h1h;
      label = `1H Home ${h1h}`;
    }
  }

  if (actual === null) return { status: 'PENDING', actualLabel: 'Missing official period breakdown' };
  if (Math.abs(actual - pick.line) < 1e-6) return { status: 'PUSH', actualLabel: `${actual.toFixed(0)} (${label})` };
  const isOver = pick.marketCode.endsWith('_OVER');
  const won = isOver ? actual > pick.line : actual < pick.line;
  return { status: won ? 'WON' : 'LOST', actualLabel: `${actual.toFixed(0)} (${label})` };
}

export default function MatchAnalysisPage() {
  const params = useParams();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [bbEvaluation, setBbEvaluation] = useState<BasketballGameEvaluation | null>(null);
  const [selectedBbPickKey, setSelectedBbPickKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [pickExpanded, setPickExpanded] = useState<boolean>(false);

  useEffect(() => {
    async function loadFixture() {
      try {
        setIsLoading(true);
        const isBb = id?.startsWith('bbg_') || id?.startsWith('nba_');
        const res = await fetch(
          `/api/v1/fixtures?sport=${isBb ? 'basketball' : 'football'}&id=${encodeURIComponent(id)}`,
          {
            cache: 'no-store',
          }
        );
        if (!res.ok) {
          setFixture(null);
          setBbEvaluation(null);
          return;
        }
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          setFixture(null);
          setBbEvaluation(null);
          return;
        }
        if (json.lastUpdated) setLastUpdated(json.lastUpdated);
        const found = (json.data || []).find((f: Fixture) => f.id === id);
        setFixture(found || null);
        setBbEvaluation(json.evaluations?.[id] || null);
      } catch {
        setFixture(null);
        setBbEvaluation(null);
      } finally {
        setIsLoading(false);
      }
    }
    if (id) loadFixture();
  }, [id]);

  const [isSaved, setIsSaved] = useState<boolean>(() => {
    return getStoredSavedFixtures().includes(id);
  });

  const isBasketball = fixture?.sport === 'basketball' || id?.startsWith('bbg_') || id?.startsWith('nba_');

  const stats = useMemo(() => {
    if (!fixture || isBasketball) return null;
    return getFixtureStatistics(fixture);
  }, [fixture, isBasketball]);

  const footballEvaluation = useMemo(() => {
    if (!fixture || isBasketball || !stats) return null;
    return evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));
  }, [fixture, isBasketball, stats]);

  const matchStats = useMemo(() => {
    if (!fixture || isBasketball || fixture.status !== 'FINISHED') return null;
    return extractMatchStats(fixture);
  }, [fixture, isBasketball]);

  const predictions = useMemo(() => {
    if (isBasketball) return [];
    const raw = footballEvaluation?.predictions || [];
    if (!matchStats) return raw;
    return raw.map((p) => {
      const settled = settleMarketPrediction(p, matchStats);
      return {
        ...p,
        settlementStatus: settled.settlementStatus,
        actualStatValue: settled.actualStatValue,
        lineComparisonText: settled.lineComparisonText,
      };
    });
  }, [isBasketball, footballEvaluation, matchStats]);

  const topPick = isBasketball
    ? null
    : predictions.find((p) => p.isTopPick) ||
      (footballEvaluation?.noRecommendationReason ? null : predictions[0]) ||
      null;
  const noRecommendationReason = isBasketball ? undefined : footballEvaluation?.noRecommendationReason;

  const liveState = useMemo(() => {
    if (!fixture) return undefined;
    return evaluateLiveMatchState(fixture);
  }, [fixture]);

  const [selectedPredictionOverride, setSelectedPredictionOverride] = useState<MarketPrediction | null>(null);
  const rawSelected = selectedPredictionOverride || topPick || predictions[0] || null;
  const selectedPrediction = useMemo(() => {
    if (!rawSelected) return null;
    return {
      ...rawSelected,
      liveStateStatus: liveState,
    };
  }, [rawSelected, liveState]);
  const setSelectedPrediction = (p: MarketPrediction | null) => setSelectedPredictionOverride(p);

  const [activeAnalysisTab, setActiveAnalysisTab] = useState<
    'markets' | 'lineups' | 'poisson' | 'form' | 'corners'
  >('markets');

  const lineupState = useMemo(() => {
    if (!fixture || isBasketball) return null;
    return getFixtureLineupState(fixture);
  }, [fixture, isBasketball]);

  const pickRevisions = useMemo(() => {
    if (!fixture) return [];
    return forwardPickLedger.getPickRevisions(fixture.id);
  }, [fixture]);

  const isDataInsufficient = useMemo(() => {
    if (!fixture) return true;
    if (fixture.insufficientData || stats?.insufficientData) return true;
    if (
      noRecommendationReason &&
      (noRecommendationReason.startsWith('Data out of date') ||
        noRecommendationReason.toLowerCase().includes('insufficient'))
    ) {
      return true;
    }
    return false;
  }, [fixture, stats, noRecommendationReason]);

  const cornerPredictions = useMemo(
    () =>
      predictions.filter(
        (p) =>
          p.optionType === 'corners' ||
          p.optionType === 'corner_handicap' ||
          p.marketCategory === 'total_corners' ||
          p.marketCategory === 'team_corners'
      ),
    [predictions]
  );

  if (isLoading) {
    return (
      <div className="space-y-3 py-1 animate-pulse" aria-busy="true" aria-label="Loading match analysis">
        <div className="flex items-center justify-between h-[44px]">
          <div className="h-5 w-24 bg-[var(--surface)] rounded-[8px]" />
          <div className="w-9 h-9 bg-[var(--surface)] rounded-[10px]" />
        </div>
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-32 bg-[var(--surface-2)] rounded" />
            <div className="h-5 w-24 bg-[var(--surface-2)] rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-3 items-center py-2">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-2)]" />
              <div className="h-3.5 w-20 bg-[var(--surface-2)] rounded" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-5 w-14 bg-[var(--surface-2)] rounded" />
              <div className="h-3 w-16 bg-[var(--surface-2)] rounded" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-2)]" />
              <div className="h-3.5 w-20 bg-[var(--surface-2)] rounded" />
            </div>
          </div>
          <div className="h-3 bg-[var(--surface-2)] rounded-full" />
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-[var(--surface-2)] rounded-[12px]" />
            ))}
          </div>
        </div>
        <div className="h-44 bg-[var(--surface)] border border-[var(--line)] rounded-[18px]" />
      </div>
    );
  }

  if (!fixture || (!isBasketball && (!stats || !footballEvaluation))) {
    return (
      <div className="py-12 text-center space-y-3 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-6">
        <h2 suppressHydrationWarning className="font-display text-[18px] font-bold text-[var(--text)]">
          Live data unavailable{lastUpdated ? ` · ${lastUpdated}` : ''}
        </h2>
        <p className="text-[12.5px] text-[var(--text-2)] max-w-sm mx-auto leading-[1.5]">
          {isBasketball
            ? 'The requested basketball matchup data could not be retrieved.'
            : 'The requested match data could not be retrieved.'}
        </p>
        <Link
          href="/matches"
          className="inline-flex min-h-[44px] items-center justify-center px-5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] font-medium text-[var(--text)] hover:border-[var(--accent)]"
        >
          Return to fixtures
        </Link>
      </div>
    );
  }

  const handleToggleBookmark = () => {
    const updated = toggleStoredSavedFixture(fixture.id);
    setIsSaved(updated);
  };

  const kickoff = new Date(fixture.kickoffTime);
  const homeName = displayName(fixture.homeTeam);
  const awayName = displayName(fixture.awayTeam);
  const isPastKickoff = !isNaN(kickoff.getTime()) && Date.now() >= kickoff.getTime();

  const StickyDetailTopBar = (
    <div
      className="fixed top-0 left-0 right-0 z-40 md:hidden px-4 bg-[var(--bg)]/95 backdrop-blur-xl border-b border-[var(--line)]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="h-[52px] flex items-center justify-between">
        <Link
          href="/matches"
          className="min-h-[44px] min-w-[44px] -ml-2 px-2 inline-flex items-center gap-1.5 text-[13px] text-[var(--text)] hover:text-[var(--accent)] transition-colors touch-press font-medium rounded-[10px]"
          aria-label="Back to fixtures"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2.2} />
          <span>Fixtures</span>
        </Link>

        <button
          onClick={handleToggleBookmark}
          type="button"
          className="min-w-[44px] min-h-[44px] -mr-1 flex items-center justify-center touch-press"
          title={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
        >
          <span
            className={`w-[36px] h-[36px] rounded-[10px] border flex items-center justify-center transition-colors ${
              isSaved
                ? 'bg-[var(--medium-soft)] border-[var(--medium)]/40 text-[var(--medium)]'
                : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[var(--medium)]' : ''}`} strokeWidth={2} />
          </span>
        </button>
      </div>
    </div>
  );

  if (isBasketball) {
    const bStats = fixture.basketballStats;
    const proj = bbEvaluation?.projection;
    const needsHistory = Boolean(bbEvaluation?.needsHistory ?? bStats?.needsHistory ?? fixture.insufficientData);
    const needsH1History = Boolean(proj?.needsH1History ?? bStats?.needsH1History);
    const abstentionReason = bbEvaluation?.abstentionReason || bStats?.abstentionReason || 'Needs history';
    const bbPicks = bbEvaluation?.picks || [];
    const bbTopPick = bbEvaluation?.topPick || null;
    const activeBbPick =
      bbPicks.find((p) => `${p.marketCode}_${p.line}` === selectedBbPickKey) ||
      bbTopPick ||
      bbPicks[0] ||
      null;

    const leagueCode = bStats?.league || fixture.competition?.code || 'NBA';
    const isFinished = fixture.status === 'FINISHED';
    const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
    const hasFinalScore =
      (isFinished || isLive) &&
      fixture.homeScore !== null &&
      fixture.homeScore !== undefined &&
      fixture.awayScore !== null &&
      fixture.awayScore !== undefined;

    const totalMean = proj ? proj.gameTotalMean : bStats?.projectedTotal;
    const totalStd = proj ? proj.gameTotalStd : bStats?.projectedTotalStd;
    const h1TotalMean = proj ? proj.h1TotalMean : bStats?.h1ProjectedTotal;
    const h1TotalStd = proj ? proj.h1TotalStd : bStats?.h1ProjectedTotalStd;
    const homeMean = proj ? proj.homeMean : bStats?.homeProjected;
    const awayMean = proj ? proj.awayMean : bStats?.awayProjected;

    const tierStyle = (t: BasketballPickCandidate['tier']) =>
      t === 'HIGH'
        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
        : t === 'MEDIUM'
        ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
        : 'bg-[var(--muted-soft)] text-[var(--muted)] border-[var(--line)]';

    return (
      <div className="space-y-4">
        {StickyDetailTopBar}

        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--text-2)]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-[var(--text)]">{leagueCode}</span>
              <span className="text-[var(--text-3)]">·</span>
              <span>{cleanDisplayText(fixture.seasonYear || '2026 to 2027')}</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-2)] text-[11px] font-medium border border-[var(--line)]">
              {isFinished ? 'Final' : isLive ? 'Live' : 'Scheduled'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 items-center text-center">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <TeamCrest canonicalTeamId={fixture.homeTeam.id} crestUrl={fixture.homeTeam.crestUrl} teamName={homeName} size={36} />
              <span className="font-display text-[13.5px] font-semibold text-[var(--text)] leading-tight line-clamp-2">
                {cleanDisplayText(homeName)}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center">
              <span className="font-display text-[18px] font-bold text-[var(--text)] tabular-nums" suppressHydrationWarning>
                {hasFinalScore ? `${fixture.homeScore} – ${fixture.awayScore}` : formatMatchTime(fixture.kickoffTime, 'Africa/Lagos')}
              </span>
              <span className="text-[11px] text-[var(--text-2)] mt-0.5" suppressHydrationWarning>
                {kickoff.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <TeamCrest canonicalTeamId={fixture.awayTeam.id} crestUrl={fixture.awayTeam.crestUrl} teamName={awayName} size={36} />
              <span className="font-display text-[13.5px] font-semibold text-[var(--text)] leading-tight line-clamp-2">
                {cleanDisplayText(awayName)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--line)]">
            <div className="p-2.5 bg-[var(--surface-2)] rounded-[12px] text-center">
              <span className="text-[10.5px] text-[var(--text-2)] block">Game total</span>
              <span className="font-display text-[14px] font-bold text-[var(--text)] tabular-nums">
                {!needsHistory && totalMean !== undefined ? `${totalMean.toFixed(1)}` : '—'}
              </span>
            </div>
            <div className="p-2.5 bg-[var(--surface-2)] rounded-[12px] text-center">
              <span className="text-[10.5px] text-[var(--text-2)] block">1st half</span>
              <span className="font-display text-[14px] font-bold text-[var(--text)] tabular-nums">
                {!needsHistory && !needsH1History && h1TotalMean !== undefined ? `${h1TotalMean.toFixed(1)}` : '—'}
              </span>
            </div>
            <div className="p-2.5 bg-[var(--surface-2)] rounded-[12px] text-center">
              <span className="text-[10.5px] text-[var(--text-2)] block">Split</span>
              <span className="font-display text-[13px] font-bold text-[var(--text)] tabular-nums">
                {!needsHistory && homeMean !== undefined && awayMean !== undefined
                  ? `${homeMean.toFixed(0)} / ${awayMean.toFixed(0)}`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {needsHistory ? (
          <div className="rounded-[18px] p-4 border border-[var(--medium)]/30 bg-[var(--medium-soft)] space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--medium)]">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
              <span>Needs history</span>
            </div>
            <p className="text-[12.5px] text-[var(--text)] leading-[1.5]">
              {cleanDisplayText(abstentionReason)}. Model lines are withheld when sample history is incomplete.
            </p>
          </div>
        ) : (
          <>
            {bbTopPick && (
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[14px] font-semibold text-[var(--text)]">Model pick</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${tierStyle(bbTopPick.tier)}`}>
                    {bbTopPick.tier === 'HIGH' ? 'High' : bbTopPick.tier === 'MEDIUM' ? 'Medium' : 'Speculative'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-[18px] font-bold text-[var(--text)]">
                    {cleanDisplayText(bbTopPick.selection)}
                  </h3>
                  <span className="font-display text-[30px] font-bold text-[var(--accent)] tabular-nums leading-none">
                    {(bbTopPick.calibratedProbability * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
                  {cleanDisplayText(bbTopPick.evidenceLine)}
                </p>
              </div>
            )}

            {(fixture.writtenExplanation || bbEvaluation?.writtenExplanation) && (() => {
              const expl: WrittenMatchExplanation = (fixture.writtenExplanation || bbEvaluation?.writtenExplanation)!;
              return (
                <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[14px] font-display font-semibold text-[var(--text)]">
                      <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span>Model explanation</span>
                    </div>
                    {expl.tierLocked && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30">
                        <Lock className="w-3 h-3" />
                        <span>Pro feature</span>
                      </span>
                    )}
                  </div>

                  {expl.tierLocked ? (
                    <div className="space-y-2.5">
                      <p className="text-[12.5px] text-[var(--text)] leading-[1.5]">
                        {cleanDisplayText(expl.oneLineSummary)}
                      </p>
                      <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="space-y-0.5">
                          <div className="text-[12.5px] font-semibold text-[var(--medium)]">
                            Full model reasoning locked
                          </div>
                          <p className="text-[12px] text-[var(--text-2)]">
                            Pro ({formatMonthlyPrice('pro')}) unlocks model drivers and the next 2 alternate picks.
                          </p>
                        </div>
                        <Link
                          href="/pricing"
                          className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 rounded-[12px] bg-[var(--accent-fill)] text-[#0A0E0D] font-semibold text-[12.5px] shrink-0 touch-press"
                        >
                          <span>See plans</span>
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[13px] text-[var(--text)] leading-[1.55]">
                        {cleanDisplayText(expl.fullSummary || expl.oneLineSummary)}
                      </p>
                      {expl.alternates && expl.alternates.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                          <div className="text-[11.5px] font-semibold text-[var(--text-2)]">
                            Next 2 best alternates
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {expl.alternates.slice(0, 2).map((alt) => (
                              <div
                                key={alt.marketCode}
                                className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-2.5 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-[12.5px] font-semibold text-[var(--text)] truncate">
                                    {cleanDisplayText(alt.selection)}
                                  </div>
                                  <div className="text-[10.5px] text-[var(--text-3)] truncate">
                                    {cleanDisplayText(alt.marketName)}
                                  </div>
                                </div>
                                <span className="font-display text-[13.5px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                                  {(alt.probability * 100).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-7 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
                <div className="p-3.5 flex items-center justify-between">
                  <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">Totals markets</h3>
                  <span className="text-[11px] text-[var(--text-2)]">Game · Team · 1st half</span>
                </div>
                {bbPicks.length > 0 ? (
                  bbPicks.map((p) => {
                    const key = `${p.marketCode}_${p.line}`;
                    const isSelected = activeBbPick ? `${activeBbPick.marketCode}_${activeBbPick.line}` === key : false;
                    const sett = getClientBbSettlement(p, fixture);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedBbPickKey(key)}
                        className={`w-full min-h-[56px] text-left p-3.5 space-y-1 transition-colors touch-press ${
                          isSelected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-2)]">
                          <span>{BB_CAT_TITLES[p.marketCategory]}</span>
                          <span>{isFinished ? sett.status : p.tier}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-[14px] font-semibold text-[var(--text)]">
                            {cleanDisplayText(p.selection)}
                          </span>
                          <span className="font-display text-[14px] font-bold text-[var(--accent)] tabular-nums">
                            {(p.calibratedProbability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] tabular-nums">
                          Proj {p.projectedMean.toFixed(1)} (±{p.projectedStd.toFixed(1)})
                          {totalStd && p.marketCategory === 'game_total' ? ` · ${totalStd.toFixed(1)} std` : ''}
                          {h1TotalStd && p.marketCategory === 'h1_game_total' ? ` · ${h1TotalStd.toFixed(1)} std` : ''}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-[12.5px] text-[var(--text-2)]">
                    No totals markets cleared evaluation gates for this matchup.
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2.5">
                <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
                  Selected line evidence
                </h3>
                {activeBbPick ? (
                  <div className="space-y-2 text-[12.5px]">
                    <div className="bg-[var(--surface-2)] rounded-[12px] p-3">
                      <div className="text-[11px] text-[var(--text-2)]">{BB_CAT_TITLES[activeBbPick.marketCategory]}</div>
                      <div className="font-display text-[15px] font-bold text-[var(--text)] mt-0.5">
                        {cleanDisplayText(activeBbPick.selection)}
                      </div>
                    </div>
                    <div className="bg-[var(--surface-2)] rounded-[12px] p-3 text-[12px] text-[var(--text-2)] leading-[1.5]">
                      {cleanDisplayText(activeBbPick.evidenceLine)}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-[var(--text-2)]">Select a totals line to inspect evidence.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Football Match Detail values
  const homeXg = !isDataInsufficient && stats && stats.homeXg > 0 ? stats.homeXg : null;
  const awayXg = !isDataInsufficient && stats && stats.awayXg > 0 ? stats.awayXg : null;
  const totalXg = homeXg !== null && awayXg !== null ? homeXg + awayXg : 0;
  const homeXgSharePct = totalXg > 0 && homeXg !== null ? (homeXg / totalXg) * 100 : 50;

  const totalCorners =
    !isDataInsufficient && stats && stats.expectedCornersHome + stats.expectedCornersAway > 0
      ? stats.expectedCornersHome + stats.expectedCornersAway
      : null;

  const expectedCards =
    !isDataInsufficient && stats && stats.expectedCards > 0 ? stats.expectedCards : null;

  const confidencePct =
    !isDataInsufficient && stats && stats.uncertaintyScore !== null && stats.uncertaintyScore !== undefined
      ? Math.round((1 - stats.uncertaintyScore) * 100)
      : null;

  const topPickProb = topPick ? (topPick.calibratedProbability ?? topPick.modelProbability) * 100 : null;
  const topPickTier = topPick ? getRiskTierBadge(topPick.confidenceTier || topPick.riskTier) : null;
  const topPickExplanation = topPick
    ? cleanDisplayText(topPick.plainEnglishReason || topPick.evidence?.whyLineChosen || '')
    : '';

  const analysisTabs = [
    { id: 'markets' as const, label: 'Market intel' },
    { id: 'lineups' as const, label: 'Lineups' },
    { id: 'poisson' as const, label: 'Poisson' },
    { id: 'form' as const, label: 'Form' },
    { id: 'corners' as const, label: 'Corners' },
  ];

  return (
    <div className="space-y-4">
      {StickyDetailTopBar}

      {/* 1. Compact Header Card */}
      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
        {/* League & matchday left, Team news status chip right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-2)] min-w-0 truncate">
            <span className="font-semibold text-[var(--text)] truncate">
              {cleanDisplayText(fixture.competition.name)}
            </span>
            <span className="text-[var(--text-3)]">·</span>
            <span className="tabular-nums shrink-0">Matchday {fixture.matchday}</span>
          </div>

          <div className="shrink-0">
            {lineupState ? (
              <LineupChip lineupState={lineupState} isPastKickoff={isPastKickoff} />
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]">
                Team news pending
              </span>
            )}
          </div>
        </div>

        {/* 3-Column Matchup Layout: Home | Kickoff & Date | Away */}
        <div className="grid grid-cols-3 gap-2 items-center text-center">
          <div className="flex flex-col items-center gap-2 min-w-0">
            <TeamCrest
              canonicalTeamId={fixture.homeTeam.id}
              crestUrl={fixture.homeTeam.crestUrl}
              teamName={homeName}
              size={40}
            />
            <span className="font-display text-[13.5px] font-semibold text-[var(--text)] leading-tight line-clamp-2">
              {cleanDisplayText(homeName)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-1">
            {fixture.status === 'FINISHED' ? (
              <span className="font-display text-[22px] font-bold text-[var(--text)] tabular-nums leading-none">
                {fixture.homeScore ?? 0} – {fixture.awayScore ?? 0}
              </span>
            ) : (
              <span
                className="font-display text-[18px] font-bold text-[var(--text)] tabular-nums leading-none"
                suppressHydrationWarning
              >
                {formatMatchTime(fixture.kickoffTime, 'Africa/Lagos')}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-2)] mt-1" suppressHydrationWarning>
              {fixture.status === 'FINISHED'
                ? 'Full time'
                : kickoff.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'Africa/Lagos',
                  })}
            </span>
          </div>

          <div className="flex flex-col items-center gap-2 min-w-0">
            <TeamCrest
              canonicalTeamId={fixture.awayTeam.id}
              crestUrl={fixture.awayTeam.crestUrl}
              teamName={awayName}
              size={40}
            />
            <span className="font-display text-[13.5px] font-semibold text-[var(--text)] leading-tight line-clamp-2">
              {cleanDisplayText(awayName)}
            </span>
          </div>
        </div>

        {/* xG Split Bar (Home vs Away) */}
        <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
          <div className="flex items-center justify-between text-[11.5px] tabular-nums">
            <span className="font-semibold text-[var(--text)]">
              {homeXg !== null ? `${homeXg.toFixed(2)} xG` : '—'}
            </span>
            <span className="text-[11px] text-[var(--text-2)]">Expected goals split</span>
            <span className="font-semibold text-[var(--text)]">
              {awayXg !== null ? `${awayXg.toFixed(2)} xG` : '—'}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[var(--surface-2)] overflow-hidden flex gap-[2px]">
            {totalXg > 0 ? (
              <>
                <div
                  className="h-full bg-[var(--accent-fill)] transition-all duration-300"
                  style={{ width: `${homeXgSharePct}%` }}
                />
                <div
                  className="h-full bg-[var(--muted)] transition-all duration-300"
                  style={{ width: `${100 - homeXgSharePct}%` }}
                />
              </>
            ) : (
              <div className="h-full w-full bg-[var(--surface-2)]" />
            )}
          </div>
        </div>

        {/* 3-Tile Stat Row: Corners, Cards, Confidence */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-center">
            <span className="text-[11px] text-[var(--text-2)] block">Corners</span>
            <span
              className={`font-display text-[15px] font-bold tabular-nums mt-0.5 block ${
                totalCorners !== null ? 'text-[var(--text)]' : 'text-[var(--text-3)]'
              }`}
            >
              {totalCorners !== null ? totalCorners.toFixed(1) : '—'}
            </span>
          </div>

          <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-center">
            <span className="text-[11px] text-[var(--text-2)] block">Cards</span>
            <span
              className={`font-display text-[15px] font-bold tabular-nums mt-0.5 block ${
                expectedCards !== null ? 'text-[var(--text)]' : 'text-[var(--text-3)]'
              }`}
            >
              {expectedCards !== null ? expectedCards.toFixed(1) : '—'}
            </span>
          </div>

          <div className="p-2.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-center">
            <span className="text-[11px] text-[var(--text-2)] block">Confidence</span>
            <span
              className={`font-display text-[15px] font-bold tabular-nums mt-0.5 block ${
                confidencePct !== null ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'
              }`}
            >
              {confidencePct !== null ? `${confidencePct}%` : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Model Pick Card */}
      {isDataInsufficient || !topPick ? (
        <section className="rounded-[18px] p-4 border border-[var(--medium)]/30 bg-[var(--medium-soft)] space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--medium)]">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span>Statistical evidence insufficient</span>
          </div>
          <p className="text-[12.5px] text-[var(--text)] leading-[1.5]">
            {cleanDisplayText(
              noRecommendationReason ||
                `Model pick withheld: ${homeName} and ${awayName} do not meet the calibrated probability hurdle with sufficient sample depth.`
            )}
          </p>
        </section>
      ) : (
        <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2.2} />
              <h2 className="font-display text-[14px] font-semibold text-[var(--text)]">
                Model pick
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              {topPickTier && (
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${topPickTier.badgeClass}`}>
                  {topPickTier.label}
                </span>
              )}
              {topPick.marketOdds && topPick.marketOdds > 1.0 ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text)] tabular-nums">
                  @{formatOdds(topPick.marketOdds)}
                </span>
              ) : topPick.priceSource ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
                  {cleanDisplayText(topPick.priceSource)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <div className="font-display text-[18px] font-bold text-[var(--text)] leading-snug">
              {formatSelectionName(topPick.selection)}
            </div>
            {topPickProb !== null && (
              <div className="text-right shrink-0">
                <span className="font-display text-[30px] font-bold text-[var(--accent)] tabular-nums leading-none">
                  {topPickProb.toFixed(1)}%
                </span>
                {topPick.uncertaintySpread !== undefined && (
                  <span className="block text-[11px] text-[var(--text-2)] tabular-nums mt-0.5">
                    ±{(topPick.uncertaintySpread * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Probability meter with threshold tick (60% for Multi goals, 70% standard) */}
          {topPickProb !== null && (
            <div className="space-y-1">
              <div className="relative w-full h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-fill)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, topPickProb))}%` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 w-[2px] bg-[var(--text)]"
                  style={{ left: topPick.marketCategory === 'multi_goals' ? '60%' : '70%' }}
                />
              </div>
              <div className="flex items-center justify-between text-[10.5px] text-[var(--text-3)] tabular-nums">
                <span>0%</span>
                <span className="text-[var(--text-2)] font-medium">
                  {topPick.marketCategory === 'multi_goals' ? '60% threshold' : '70% threshold'}
                </span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* 3-line clamped explanation with Read more toggle */}
          {topPickExplanation && (
            <div className="pt-1 border-t border-[var(--line)]">
              <p
                className={`text-[12.5px] text-[var(--text-2)] leading-[1.5] ${
                  pickExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {topPickExplanation}
              </p>
              <button
                type="button"
                onClick={() => setPickExpanded((prev) => !prev)}
                className="min-h-[44px] inline-flex items-center text-[12px] font-semibold text-[var(--accent)] touch-press -my-2"
              >
                {pickExpanded ? 'Show less' : 'Read more'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2b. Written Match Explanation & Next 2 Best Alternates */}
      {fixture.writtenExplanation && (
        <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[14px] font-display font-semibold text-[var(--text)]">
              <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>Model explanation</span>
            </div>
            {fixture.writtenExplanation.tierLocked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30">
                <Lock className="w-3 h-3" />
                <span>Pro feature</span>
              </span>
            )}
          </div>

          {fixture.writtenExplanation.tierLocked ? (
            <div className="space-y-2.5">
              <p className="text-[12.5px] text-[var(--text)] leading-[1.5]">
                {cleanDisplayText(fixture.writtenExplanation.oneLineSummary)}
              </p>
              <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5">
                  <div className="text-[12.5px] font-semibold text-[var(--medium)]">
                    Full model reasoning locked
                  </div>
                  <p className="text-[12px] text-[var(--text-2)]">
                    Pro ({formatMonthlyPrice('pro')}) unlocks model drivers and the next 2 alternate picks.
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 rounded-[12px] bg-[var(--accent-fill)] text-[#0A0E0D] font-semibold text-[12.5px] shrink-0 touch-press"
                >
                  <span>See plans</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-[var(--text)] leading-[1.55]">
                {cleanDisplayText(
                  fixture.writtenExplanation.fullSummary || fixture.writtenExplanation.oneLineSummary
                )}
              </p>

              {fixture.writtenExplanation.alternates &&
                fixture.writtenExplanation.alternates.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                    <div className="text-[11.5px] font-semibold text-[var(--text-2)]">
                      Next 2 best alternates
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {fixture.writtenExplanation.alternates.slice(0, 2).map((alt) => (
                        <div
                          key={alt.marketCode}
                          className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-semibold text-[var(--text)] truncate">
                              {cleanDisplayText(alt.selection)}
                            </div>
                            <div className="text-[10.5px] text-[var(--text-3)] truncate">
                              {cleanDisplayText(alt.marketName)}
                            </div>
                          </div>
                          <span className="font-display text-[13.5px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                            {(alt.probability * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </section>
      )}

      {/* 3. Horizontally Scrollable Underlined Sub-Navigation Tabs */}
      <nav
        aria-label="Match analysis sections"
        className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-[var(--line)]"
      >
        {analysisTabs.map((tab) => {
          const isActive = activeAnalysisTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveAnalysisTab(tab.id)}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`min-h-[44px] px-3.5 text-[13px] whitespace-nowrap transition-colors touch-press shrink-0 border-b-2 ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                  : 'border-transparent text-[var(--text-2)] hover:text-[var(--text)] font-medium'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* TAB 1: Market Intel */}
      {activeAnalysisTab === 'markets' && (
        <div className="space-y-4">
          {lineupState?.anyKeyPlayerOut && (
            <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[14px] flex items-center justify-between gap-2 text-[12.5px]">
              <div className="flex items-center gap-2 text-[var(--medium)] font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Lineup alert: {cleanDisplayText(lineupState.firstKeyPlayerOutName || 'Key player')} missing
                </span>
              </div>
              <button
                onClick={() => setActiveAnalysisTab('lineups')}
                type="button"
                className="min-h-[44px] px-2 text-[12px] text-[var(--accent)] font-semibold shrink-0"
              >
                Inspect XI
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-3">
              <MarketComparisonTable
                predictions={predictions}
                selectedPredictionId={selectedPrediction?.id}
                onSelectPrediction={(p) => setSelectedPrediction(p)}
                homeTeamName={fixture.homeTeam.name}
                awayTeamName={fixture.awayTeam.name}
              />
            </div>

            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
                  Selected line audit
                </h3>
                <span className="text-[11px] text-[var(--accent)] font-medium">Grounded facts</span>
              </div>

              <ExplanationCard
                prediction={selectedPrediction}
                noRecommendationReason={noRecommendationReason}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Lineups */}
      {activeAnalysisTab === 'lineups' && lineupState && (
        <LineupComparisonPanel
          lineupState={lineupState}
          homeTeamName={homeName}
          awayTeamName={awayName}
          topPick={topPick}
          revisions={pickRevisions}
        />
      )}

      {/* TAB 3: Poisson */}
      {activeAnalysisTab === 'poisson' &&
        (isDataInsufficient || !stats || !footballEvaluation ? (
          <div className="rounded-[18px] p-5 border border-[var(--medium)]/30 bg-[var(--medium-soft)] space-y-1.5 text-center">
            <AlertCircle className="w-5 h-5 text-[var(--medium)] mx-auto" />
            <h4 className="font-display text-[14px] font-semibold text-[var(--medium)]">
              Poisson matrix withheld
            </h4>
            <p className="text-[12.5px] text-[var(--text)] max-w-sm mx-auto leading-[1.5]">
              Statistical evidence insufficient for {homeName} and {awayName} to parameterize the bivariate Poisson distribution.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ScorelineMatrix
              homeTeamName={fixture.homeTeam.name}
              awayTeamName={fixture.awayTeam.name}
              homeXg={stats.homeXg}
              awayXg={stats.awayXg}
            />

            <FactorsAndStatePanel
              contextEvaluation={footballEvaluation.contextEvaluation}
              rankedOptions={footballEvaluation.rankedOptions}
              selectedOptionId={selectedPrediction?.id}
              onSelectOption={(p) => setSelectedPrediction(p)}
            />
          </div>
        ))}

      {/* TAB 4: Form (with Coaches & Weather switcher inside QuantitativeFactorsAuditPanel) */}
      {activeAnalysisTab === 'form' && (
        <QuantitativeFactorsAuditPanel
          homeTeamName={fixture.homeTeam.name}
          awayTeamName={fixture.awayTeam.name}
          venueName={fixture.venue}
          kickoffTime={fixture.kickoffTime}
          topPickOdds={topPick?.marketOdds || 1.95}
          topPickSelection={topPick?.selection || 'Home Win'}
          topPickProbability={topPick?.modelProbability || 0.54}
          marketCode={topPick?.marketCode || 'MATCH_RESULT_HOME'}
          initialTab="form"
        />
      )}

      {/* TAB 5: Corners */}
      {activeAnalysisTab === 'corners' && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
            <div className="flex items-center gap-2">
              <CornerUpRight className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
                Corner projections
              </h3>
            </div>
            <span className="text-[11px] text-[var(--text-2)] tabular-nums">
              {totalCorners !== null ? `${totalCorners.toFixed(1)} expected` : 'Unavailable'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-center">
              <span className="text-[11px] text-[var(--text-2)] block truncate">{homeName}</span>
              <span className="font-display text-[15px] font-bold text-[var(--text)] tabular-nums mt-0.5 block">
                {!isDataInsufficient && stats && stats.expectedCornersHome > 0
                  ? stats.expectedCornersHome.toFixed(1)
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-center">
              <span className="text-[11px] text-[var(--text-2)] block">Match total</span>
              <span className="font-display text-[15px] font-bold text-[var(--accent)] tabular-nums mt-0.5 block">
                {totalCorners !== null ? totalCorners.toFixed(1) : '—'}
              </span>
            </div>
            <div className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-center">
              <span className="text-[11px] text-[var(--text-2)] block truncate">{awayName}</span>
              <span className="font-display text-[15px] font-bold text-[var(--text)] tabular-nums mt-0.5 block">
                {!isDataInsufficient && stats && stats.expectedCornersAway > 0
                  ? stats.expectedCornersAway.toFixed(1)
                  : '—'}
              </span>
            </div>
          </div>

          {cornerPredictions.length > 0 ? (
            <div className="border border-[var(--line)] rounded-[12px] divide-y divide-[var(--line)] overflow-hidden">
              {cornerPredictions.map((cp) => {
                const probPct = (cp.calibratedProbability ?? cp.modelProbability) * 100;
                return (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => {
                      setSelectedPrediction(cp);
                      setActiveAnalysisTab('markets');
                    }}
                    className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--surface-2)] transition-colors touch-press"
                  >
                    <div className="min-w-0">
                      <div className="font-display text-[13.5px] font-semibold text-[var(--text)] truncate">
                        {cleanDisplayText(cp.selection)}
                      </div>
                      <div className="text-[11px] text-[var(--text-2)]">
                        {cp.marketOdds && cp.marketOdds > 1.0 ? `@${formatOdds(cp.marketOdds)}` : 'Probability analysis'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-display text-[14px] font-bold text-[var(--accent)] tabular-nums">
                        {probPct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-center text-[12.5px] text-[var(--text-2)]">
              Corner market lines are withheld because verified corner history is unavailable for this fixture.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
