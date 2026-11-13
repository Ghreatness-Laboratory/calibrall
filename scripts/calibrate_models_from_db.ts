import fs from 'fs';
import path from 'path';
import { getLocalDatabase } from '../src/lib/supabase/client';
import { canonicalPairIds } from '../src/lib/data/rivalriesSeed';

const DECAY_LAMBDA = 0.005; // ~138.6 day half-life
const DAY_MS = 1000 * 60 * 60 * 24;

type LeagueGroupKey = 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';

const GROUP_LEAGUES: Record<LeagueGroupKey, string[]> = {
  UK_WITH_REF: ['E0', 'E1', 'E2', 'E3', 'EC', 'SC0', 'SC1', 'SC2', 'SC3'],
  EURO_NO_REF: ['B1', 'D1', 'D2', 'F1', 'F2', 'G1', 'I1', 'I2', 'N1', 'P1', 'SP1', 'SP2', 'T1'],
  EXTRA_GOALS_ONLY: ['ARG', 'AUT', 'BSA', 'CHN', 'DNK', 'FIN', 'IRL', 'JPN', 'MEX', 'NOR', 'POL', 'ROU', 'RUS', 'SWE', 'SWZ', 'USA'],
};

const ALIAS_TO_CANONICAL: Record<string, string> = {
  PL: 'E0',
  ELC: 'E1',
  PD: 'SP1',
  SA: 'I1',
  BL1: 'D1',
  FL1: 'F1',
  DED: 'N1',
  PPL: 'P1',
  TSL: 'T1',
  BRA: 'BSA',
  ROM: 'ROU',
  SUI: 'SWZ',
  SP: 'SC0',
};

function canonicalComp(code: string): string {
  const u = String(code || '').toUpperCase().trim();
  return ALIAS_TO_CANONICAL[u] || u;
}

function getLeagueGroup(compCode: string): LeagueGroupKey {
  const c = canonicalComp(compCode);
  if (GROUP_LEAGUES.UK_WITH_REF.includes(c)) return 'UK_WITH_REF';
  if (GROUP_LEAGUES.EURO_NO_REF.includes(c)) return 'EURO_NO_REF';
  return 'EXTRA_GOALS_ONLY';
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function negBinomialProb(mu: number, k: number, alpha: number): number {
  if (mu <= 0) return k === 0 ? 1 : 0;
  if (alpha <= 0.001) return poissonProb(mu, k);
  const r = 1 / alpha;
  const p = r / (r + mu);
  if (k === 0) return Math.pow(p, r);
  let prob = Math.pow(p, r);
  for (let i = 1; i <= k; i++) {
    prob *= ((i - 1 + r) / i) * (1 - p);
    if (prob <= 0) return 0;
  }
  return prob;
}

function nbOverProb(mu: number, line: number, alpha: number, maxK: number): number {
  let under = 0;
  const cut = Math.floor(line);
  for (let k = 0; k <= cut; k++) under += negBinomialProb(mu, k, alpha);
  return Math.max(0.001, Math.min(0.999, 1 - under));
}

function poisOverProb(mu: number, line: number): number {
  let under = 0;
  const cut = Math.floor(line);
  for (let k = 0; k <= cut; k++) under += poissonProb(mu, k);
  return Math.max(0.001, Math.min(0.999, 1 - under));
}

function dcTau(x: number, y: number, l: number, m: number, rho: number): number {
  if (x === 0 && y === 0) return Math.max(1e-6, 1 - l * m * rho);
  if (x === 0 && y === 1) return Math.max(1e-6, 1 + l * rho);
  if (x === 1 && y === 0) return Math.max(1e-6, 1 + m * rho);
  if (x === 1 && y === 1) return Math.max(1e-6, 1 - rho);
  return 1.0;
}

// Normal CDF approximation for two-sided p-value from Welch t
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

function welchTTest(a: number[], b: number[]): {
  nA: number;
  nB: number;
  meanA: number;
  meanB: number;
  diff: number;
  se: number;
  tStat: number;
  pValue: number;
  significant05: boolean;
} {
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) {
    return { nA, nB, meanA: 0, meanB: 0, diff: 0, se: 0, tStat: 0, pValue: 1, significant05: false };
  }
  const meanA = a.reduce((s, v) => s + v, 0) / nA;
  const meanB = b.reduce((s, v) => s + v, 0) / nB;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);
  const se = Math.sqrt(varA / nA + varB / nB);
  const tStat = se > 0 ? (meanA - meanB) / se : 0;
  const pValue = Math.min(1, Math.max(0, 2 * (1 - normCdf(Math.abs(tStat)))));
  return {
    nA,
    nB,
    meanA: Number(meanA.toFixed(4)),
    meanB: Number(meanB.toFixed(4)),
    diff: Number((meanA - meanB).toFixed(4)),
    se: Number(se.toFixed(4)),
    tStat: Number(tStat.toFixed(3)),
    pValue: Number(pValue.toFixed(6)),
    significant05: pValue < 0.05,
  };
}

interface RawMatchRow {
  id: string;
  provider_id: string;
  competition_code: string;
  season: string;
  kickoff_time: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  home_half_time_score: number | null;
  away_half_time_score: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_yellow_cards: number | null;
  away_yellow_cards: number | null;
  home_red_cards: number | null;
  away_red_cards: number | null;
  referee: string | null;
}

interface DecayedTracker {
  matches: number;
  wSum: number;
  gfSum: number;
  gaSum: number;
  lastMs: number;
}

function updateTracker(t: DecayedTracker, tsMs: number, vFor: number, vAgainst: number) {
  if (t.matches > 0 && t.lastMs > 0) {
    const dtDays = Math.max(0, (tsMs - t.lastMs) / DAY_MS);
    const decay = Math.exp(-DECAY_LAMBDA * dtDays);
    t.wSum *= decay;
    t.gfSum *= decay;
    t.gaSum *= decay;
  }
  t.matches += 1;
  t.wSum += 1.0;
  t.gfSum += vFor;
  t.gaSum += vAgainst;
  t.lastMs = tsMs;
}

function currentDecayedRate(t: DecayedTracker | undefined, tsMs: number, priorMean: number, shrinkageK: number): { forRate: number; againstRate: number; matches: number } {
  if (!t || t.matches === 0 || t.wSum <= 0) {
    return { forRate: priorMean, againstRate: priorMean, matches: 0 };
  }
  const dtDays = Math.max(0, (tsMs - t.lastMs) / DAY_MS);
  const decay = Math.exp(-DECAY_LAMBDA * dtDays);
  const w = t.wSum * decay;
  const f = (t.gfSum * decay + shrinkageK * priorMean) / (w + shrinkageK);
  const a = (t.gaSum * decay + shrinkageK * priorMean) / (w + shrinkageK);
  return { forRate: f, againstRate: a, matches: t.matches };
}

function main() {
  const db = getLocalDatabase();

  const matches = db.prepare(`
    SELECT
      id, provider_id, competition_code, season, kickoff_time,
      home_team_id, away_team_id,
      home_score, away_score,
      home_half_time_score, away_half_time_score,
      home_corners, away_corners,
      home_yellow_cards, away_yellow_cards,
      home_red_cards, away_red_cards,
      referee
    FROM matches
    WHERE status = 'FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL
    ORDER BY kickoff_time ASC
  `).all() as RawMatchRow[];

  const ahRows = db.prepare(`
    SELECT UPPER(m.competition_code) as comp_code, COUNT(DISTINCT o.match_id) as ah_n
    FROM odds_snapshots o
    JOIN matches m ON m.provider_id = o.match_id OR m.id = o.match_id
    WHERE o.market_code LIKE 'ASIAN_HANDICAP%'
    GROUP BY UPPER(m.competition_code)
  `).all() as Array<{ comp_code: string; ah_n: number }>;

  const ahCountByLeague = new Map<string, number>();
  for (const r of ahRows) {
    const c = canonicalComp(r.comp_code);
    ahCountByLeague.set(c, (ahCountByLeague.get(c) || 0) + r.ah_n);
  }

  const rivalryRows = db.prepare(`SELECT team_a_id, team_b_id, rivalry_name, source FROM rivalries`).all() as Array<{
    team_a_id: string;
    team_b_id: string;
    rivalry_name: string;
    source: string;
  }>;
  const rivalrySet = new Set<string>();
  for (const r of rivalryRows) {
    const [a, b] = canonicalPairIds(r.team_a_id, r.team_b_id);
    rivalrySet.add(`${a}__${b}`);
  }

  // Group matches by canonical league
  const byLeague = new Map<string, RawMatchRow[]>();
  for (const m of matches) {
    const c = canonicalComp(m.competition_code);
    if (!byLeague.has(c)) byLeague.set(c, []);
    byLeague.get(c)!.push(m);
  }

  // 1. Per-league & Per-group raw statistics, Dixon-Coles rho, and NB alpha
  const leaguesOutput: Record<string, any> = {};
  const groupSampleSizes: Record<LeagueGroupKey, {
    leagues: string[];
    goalsMatches: number;
    asianHandicapModelMatches: number;
    asianHandicapOddsMatches: number;
    halfTimeMatches: number;
    cornersMatches: number;
    cardsMatches: number;
    refereeMatches: number;
  }> = {
    UK_WITH_REF: { leagues: GROUP_LEAGUES.UK_WITH_REF, goalsMatches: 0, asianHandicapModelMatches: 0, asianHandicapOddsMatches: 0, halfTimeMatches: 0, cornersMatches: 0, cardsMatches: 0, refereeMatches: 0 },
    EURO_NO_REF: { leagues: GROUP_LEAGUES.EURO_NO_REF, goalsMatches: 0, asianHandicapModelMatches: 0, asianHandicapOddsMatches: 0, halfTimeMatches: 0, cornersMatches: 0, cardsMatches: 0, refereeMatches: 0 },
    EXTRA_GOALS_ONLY: { leagues: GROUP_LEAGUES.EXTRA_GOALS_ONLY, goalsMatches: 0, asianHandicapModelMatches: 0, asianHandicapOddsMatches: 0, halfTimeMatches: 0, cornersMatches: 0, cardsMatches: 0, refereeMatches: 0 },
  };

  for (const [comp, rows] of Array.from(byLeague.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const grp = getLeagueGroup(comp);
    const n = rows.length;
    let sumHG = 0, sumAG = 0, hw = 0, dw = 0, aw = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0;

    let htN = 0, sum1HG = 0, sum1AG = 0, sum2HG = 0, sum2AG = 0;
    let fhO05 = 0, fhU15 = 0, hsh1 = 0, hsh2 = 0, hshEq = 0, shH = 0, shD = 0, shA = 0;

    const cornerTotals: number[] = [];
    let sumHC = 0, sumAC = 0, cO85 = 0, cO95 = 0, cO105 = 0, cO115 = 0;

    const cardTotals: number[] = [];
    let cO35 = 0, cO45 = 0, cO55 = 0;

    let refN = 0;

    for (const m of rows) {
      const hg = m.home_score;
      const ag = m.away_score;
      const totG = hg + ag;
      sumHG += hg;
      sumAG += ag;
      if (hg > ag) hw++;
      else if (hg === ag) dw++;
      else aw++;
      if (totG > 1.5) o15++;
      if (totG > 2.5) o25++;
      if (totG > 3.5) o35++;
      if (hg >= 1 && ag >= 1) btts++;

      if (m.home_half_time_score !== null && m.away_half_time_score !== null) {
        htN++;
        const h1 = m.home_half_time_score;
        const a1 = m.away_half_time_score;
        const h2 = Math.max(0, hg - h1);
        const a2 = Math.max(0, ag - a1);
        const t1 = h1 + a1;
        const t2 = h2 + a2;
        sum1HG += h1;
        sum1AG += a1;
        sum2HG += h2;
        sum2AG += a2;
        if (t1 > 0.5) fhO05++;
        if (t1 < 1.5) fhU15++;
        if (t1 > t2) hsh1++;
        else if (t2 > t1) hsh2++;
        else hshEq++;
        if (h2 > a2) shH++;
        else if (h2 === a2) shD++;
        else shA++;
      }

      if (m.home_corners !== null && m.away_corners !== null) {
        const tc = m.home_corners + m.away_corners;
        cornerTotals.push(tc);
        sumHC += m.home_corners;
        sumAC += m.away_corners;
        if (tc > 8.5) cO85++;
        if (tc > 9.5) cO95++;
        if (tc > 10.5) cO105++;
        if (tc > 11.5) cO115++;
      }

      if (m.home_yellow_cards !== null && m.away_yellow_cards !== null) {
        const tCards = m.home_yellow_cards + m.away_yellow_cards + (m.home_red_cards ?? 0) + (m.away_red_cards ?? 0);
        cardTotals.push(tCards);
        if (tCards > 3.5) cO35++;
        if (tCards > 4.5) cO45++;
        if (tCards > 5.5) cO55++;
      }

      if (m.referee && m.referee.trim().length > 0) {
        refN++;
      }
    }

    const avgHG = sumHG / n;
    const avgAG = sumAG / n;

    // Fit Dixon-Coles rho via MLE on league-level low scores
    let bestRho = -0.10;
    let bestLl = -Infinity;
    let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (const m of rows) {
      if (m.home_score === 0 && m.away_score === 0) n00++;
      else if (m.home_score === 0 && m.away_score === 1) n01++;
      else if (m.home_score === 1 && m.away_score === 0) n10++;
      else if (m.home_score === 1 && m.away_score === 1) n11++;
    }
    for (let rho = -0.25; rho <= 0.05; rho += 0.005) {
      const t00 = 1 - avgHG * avgAG * rho;
      const t01 = 1 + avgHG * rho;
      const t10 = 1 + avgAG * rho;
      const t11 = 1 - rho;
      if (t00 <= 0.01 || t01 <= 0.01 || t10 <= 0.01 || t11 <= 0.01) continue;
      const ll = n00 * Math.log(t00) + n01 * Math.log(t01) + n10 * Math.log(t10) + n11 * Math.log(t11);
      if (ll > bestLl) {
        bestLl = ll;
        bestRho = rho;
      }
    }

    const cornersN = cornerTotals.length;
    let avgCorners = 0, varCorners = 0, cornersAlpha = 0.08;
    if (cornersN > 10) {
      avgCorners = cornerTotals.reduce((s, v) => s + v, 0) / cornersN;
      varCorners = cornerTotals.reduce((s, v) => s + (v - avgCorners) ** 2, 0) / (cornersN - 1);
      cornersAlpha = Math.max(0.01, (varCorners - avgCorners) / (avgCorners * avgCorners));
    }

    const cardsN = cardTotals.length;
    let avgCards = 0, varCards = 0, cardsAlpha = 0.12;
    if (cardsN > 10) {
      avgCards = cardTotals.reduce((s, v) => s + v, 0) / cardsN;
      varCards = cardTotals.reduce((s, v) => s + (v - avgCards) ** 2, 0) / (cardsN - 1);
      cardsAlpha = Math.max(0.01, (varCards - avgCards) / (avgCards * avgCards));
    }

    const ahOddsN = ahCountByLeague.get(comp) || 0;
    const hasHalfTimeGoals = htN > 0;
    const hasCorners = cornersN >= 50; // EC has 189 (2627 only); Group 3 has 0
    const hasCards = cardsN > 0;
    const hasReferee = refN > 0;
    const hasAsianHandicapPrices = ahOddsN > 0;

    groupSampleSizes[grp].goalsMatches += n;
    groupSampleSizes[grp].asianHandicapModelMatches += n;
    groupSampleSizes[grp].asianHandicapOddsMatches += ahOddsN;
    groupSampleSizes[grp].halfTimeMatches += htN;
    groupSampleSizes[grp].cornersMatches += cornersN;
    groupSampleSizes[grp].cardsMatches += cardsN;
    groupSampleSizes[grp].refereeMatches += refN;

    leaguesOutput[comp] = {
      competitionCode: comp,
      leagueGroup: grp,
      capabilities: {
        competitionCode: comp,
        leagueGroup: grp,
        hasGoals: n > 0,
        hasHalfTimeGoals,
        hasCorners,
        hasCards,
        hasReferee,
        hasAsianHandicapPrices,
        sampleSizeMatches: n,
        cornersSampleSize: cornersN,
        cardsSampleSize: cardsN,
        halfTimeSampleSize: htN,
        refereeSampleSize: refN,
      },
      goals: {
        sampleSize: n,
        avgHomeGoals: Number(avgHG.toFixed(4)),
        avgAwayGoals: Number(avgAG.toFixed(4)),
        avgGoals: Number((avgHG + avgAG).toFixed(4)),
        homeAdvantageRatio: Number((avgHG / Math.max(0.1, avgAG)).toFixed(4)),
        dixonColesRho: Number(bestRho.toFixed(4)),
        homeWinRate: Number((hw / n).toFixed(4)),
        drawRate: Number((dw / n).toFixed(4)),
        awayWinRate: Number((aw / n).toFixed(4)),
        o15Rate: Number((o15 / n).toFixed(4)),
        o25Rate: Number((o25 / n).toFixed(4)),
        o35Rate: Number((o35 / n).toFixed(4)),
        bttsRate: Number((btts / n).toFixed(4)),
      },
      halves: hasHalfTimeGoals ? {
        sampleSize: htN,
        avgHome1HGoals: Number((sum1HG / htN).toFixed(4)),
        avgAway1HGoals: Number((sum1AG / htN).toFixed(4)),
        avgHome2HGoals: Number((sum2HG / htN).toFixed(4)),
        avgAway2HGoals: Number((sum2AG / htN).toFixed(4)),
        firstHalfGoalShare: Number(((sum1HG + sum1AG) / Math.max(0.01, sum1HG + sum1AG + sum2HG + sum2AG)).toFixed(4)),
        fhO05Rate: Number((fhO05 / htN).toFixed(4)),
        fhU15Rate: Number((fhU15 / htN).toFixed(4)),
        hsh1stRate: Number((hsh1 / htN).toFixed(4)),
        hsh2ndRate: Number((hsh2 / htN).toFixed(4)),
        hshEqualRate: Number((hshEq / htN).toFixed(4)),
        shHomeWinRate: Number((shH / htN).toFixed(4)),
        shDrawRate: Number((shD / htN).toFixed(4)),
        shAwayWinRate: Number((shA / htN).toFixed(4)),
      } : null,
      corners: hasCorners ? {
        sampleSize: cornersN,
        avgHomeCorners: Number((sumHC / cornersN).toFixed(4)),
        avgAwayCorners: Number((sumAC / cornersN).toFixed(4)),
        avgTotalCorners: Number(avgCorners.toFixed(4)),
        varTotalCorners: Number(varCorners.toFixed(4)),
        overdispersionAlpha: Number(cornersAlpha.toFixed(4)),
        o85Rate: Number((cO85 / cornersN).toFixed(4)),
        o95Rate: Number((cO95 / cornersN).toFixed(4)),
        o105Rate: Number((cO105 / cornersN).toFixed(4)),
        o115Rate: Number((cO115 / cornersN).toFixed(4)),
      } : null,
      cards: hasCards ? {
        sampleSize: cardsN,
        avgTotalCards: Number(avgCards.toFixed(4)),
        varTotalCards: Number(varCards.toFixed(4)),
        overdispersionAlpha: Number(cardsAlpha.toFixed(4)),
        o35Rate: Number((cO35 / cardsN).toFixed(4)),
        o45Rate: Number((cO45 / cardsN).toFixed(4)),
        o55Rate: Number((cO55 / cardsN).toFixed(4)),
      } : null,
    };
  }

  // 2. Chronological Walk-Forward Pass for:
  //    - Held-out Goals Brier & H2H Ablation (varying kappa)
  //    - Held-out Halves Brier (separate 1H/2H rates vs flat 0.43 ratio)
  //    - Held-out Corners NegBinomial vs Poisson (using team corners FOR & AGAINST)
  //    - Held-out Cards NegBinomial + Referee Shrinkage K_ref vs League Baseline
  //    - Per-(leagueGroup, marketFamily) match-cluster walk-forward Brier Skill vs causal league base rate + 1000 bootstrap CIs
  const leagueCutoffIdx = new Map<string, number>();
  const leagueSeenIdx = new Map<string, number>();
  for (const [comp, rows] of byLeague.entries()) {
    leagueCutoffIdx.set(comp, Math.floor(rows.length * 0.75));
    leagueSeenIdx.set(comp, 0);
  }

  const teamGoalsHome = new Map<string, DecayedTracker>();
  const teamGoalsAway = new Map<string, DecayedTracker>();
  const teamGoalsAll = new Map<string, DecayedTracker>();
  const team1HGoals = new Map<string, DecayedTracker>();
  const team2HGoals = new Map<string, DecayedTracker>();
  const teamCorners = new Map<string, DecayedTracker>();
  const teamCards = new Map<string, DecayedTracker>();
  const refTracker = new Map<string, DecayedTracker>(); // key: comp + '::' + normRef
  const h2hPairHistory = new Map<string, Array<{ ms: number; homeId: string; awayId: string; hg: number; ag: number }>>();

  // Causal per-league expanding counters (strictly t < now, ZERO future leakage for walk-forward baselines)
  interface CausalLeagueStats {
    n: number;
    hg: number;
    ag: number;
    hw: number;
    dw: number;
    aw: number;
    btts: number;
    totO: Record<number, number>;
    homeO: Record<number, number>;
    awayO: Record<number, number>;
    ahRetSum: Record<number, number>;
    htN: number;
    h1g: number;
    a1g: number;
    h2g: number;
    a2g: number;
    hsh1: number;
    hsh2: number;
    hshEq: number;
    fhO05: number;
    fhO15: number;
    shH: number;
    shD: number;
    shA: number;
    cornersN: number;
    hc: number;
    ac: number;
    cornersSumSq: number;
    cornersO: Record<number, number>;
    cardsN: number;
    cardsSum: number;
    cardsSumSq: number;
    cardsO: Record<number, number>;
  }

  const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
  const TEAM_GOAL_LINES = [0.5, 1.5, 2.5];
  const AH_LINES = [-1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  const CORNER_LINES = [8.5, 9.5, 10.5, 11.5];
  const CARD_LINES = [2.5, 3.5, 4.5, 5.5];

  const causalStats = new Map<string, CausalLeagueStats>();
  const getOrInitCausal = (comp: string): CausalLeagueStats => {
    let st = causalStats.get(comp);
    if (!st) {
      st = {
        n: 0, hg: 0, ag: 0, hw: 0, dw: 0, aw: 0, btts: 0,
        totO: { 0.5: 0, 1.5: 0, 2.5: 0, 3.5: 0, 4.5: 0 },
        homeO: { 0.5: 0, 1.5: 0, 2.5: 0 },
        awayO: { 0.5: 0, 1.5: 0, 2.5: 0 },
        ahRetSum: Object.fromEntries(AH_LINES.map(l => [l, 0])),
        htN: 0, h1g: 0, a1g: 0, h2g: 0, a2g: 0, hsh1: 0, hsh2: 0, hshEq: 0, fhO05: 0, fhO15: 0, shH: 0, shD: 0, shA: 0,
        cornersN: 0, hc: 0, ac: 0, cornersSumSq: 0, cornersO: { 8.5: 0, 9.5: 0, 10.5: 0, 11.5: 0 },
        cardsN: 0, cardsSum: 0, cardsSumSq: 0, cardsO: { 2.5: 0, 3.5: 0, 4.5: 0, 5.5: 0 },
      };
      causalStats.set(comp, st);
    }
    return st;
  };

  function settleAhReturn(hg: number, ag: number, line: number): number {
    const rem = Math.abs(line % 0.5);
    if (rem < 0.01) {
      const diff = hg + line - ag;
      if (diff > 0.001) return 1.0;
      if (Math.abs(diff) <= 0.001) return 0.5;
      return 0.0;
    }
    const rLow = settleAhReturn(hg, ag, line - 0.25);
    const rHigh = settleAhReturn(hg, ag, line + 0.25);
    return 0.5 * (rLow + rHigh);
  }

  // Match-cluster Brier pairs per (leagueGroup, marketFamily)
  type WfFamily =
    | 'result'
    | 'draw'
    | 'double_chance'
    | 'goals_over_under'
    | 'both_teams_to_score'
    | 'handicap'
    | 'highest_scoring_half'
    | 'first_half_goals'
    | 'second_half_result'
    | 'corners'
    | 'bookings';

  const WF_FAMILIES: WfFamily[] = [
    'result',
    'draw',
    'double_chance',
    'goals_over_under',
    'both_teams_to_score',
    'handicap',
    'highest_scoring_half',
    'first_half_goals',
    'second_half_result',
    'corners',
    'bookings',
  ];

  // Each entry is one match cluster: { sumSqModel, sumSqBase, kLines }
  const wfClusters = new Map<string, Array<{ sumSqModel: number; sumSqBase: number; kLines: number }>>();
  const pushWfCluster = (grp: LeagueGroupKey, fam: WfFamily, sumSqModel: number, sumSqBase: number, kLines: number) => {
    const key = `${grp}::${fam}`;
    if (!wfClusters.has(key)) wfClusters.set(key, []);
    wfClusters.get(key)!.push({ sumSqModel, sumSqBase, kLines });
  };

  // Ablation accumulators
  const K_TEAM = 12;
  const K_CORNERS = 12;
  const HALVES_KS = [14, 25, 40, 60];
  const H2H_WEIGHTS = [0.0, 0.02, 0.04, 0.06, 0.08, 0.12];
  const h2hBrierSums: Record<number, { n: number; sum1X2: number; sumO25: number; sumBtts: number }> = {};
  for (const w of H2H_WEIGHTS) h2hBrierSums[w] = { n: 0, sum1X2: 0, sumO25: 0, sumBtts: 0 };

  const halvesKSweep: Record<number, { n: number; sepHshBrier: number; flatHshBrier: number; sepFhBrier: number; flatFhBrier: number }> = {};
  for (const kh of HALVES_KS) halvesKSweep[kh] = { n: 0, sepHshBrier: 0, flatHshBrier: 0, sepFhBrier: 0, flatFhBrier: 0 };
  let cornersEvalN = 0, cornersNbBrier = 0, cornersPoisBrier = 0, cornersBaseBrier = 0, cornersNbLl = 0, cornersPoisLl = 0;

  const REF_KS = [3, 5, 8, 10, 15, 20];
  const cardsRefBrier: Record<number, { n: number; nbRefBrier: number; poisRefBrier: number; nbBaseBrier: number }> = {};
  for (const k of REF_KS) cardsRefBrier[k] = { n: 0, nbRefBrier: 0, poisRefBrier: 0, nbBaseBrier: 0 };
  let cardsNoRefEvalN = 0, cardsNoRefNbBrier = 0, cardsNoRefPoisBrier = 0;

  const FIVE_YEARS_MS = 5 * 365.25 * DAY_MS;

  for (const m of matches) {
    const comp = canonicalComp(m.competition_code);
    const lCfg = leaguesOutput[comp];
    if (!lCfg) continue;
    const grp = getLeagueGroup(comp);
    const cst = getOrInitCausal(comp);

    const idx = leagueSeenIdx.get(comp)!;
    leagueSeenIdx.set(comp, idx + 1);
    const isTest = idx >= (leagueCutoffIdx.get(comp) ?? 0);
    const tsMs = new Date(m.kickoff_time).getTime();

    const avgHG = cst.n >= 30 ? cst.hg / cst.n : lCfg.goals.avgHomeGoals;
    const avgAG = cst.n >= 30 ? cst.ag / cst.n : lCfg.goals.avgAwayGoals;
    const avgTG = avgHG + avgAG;
    const rho = lCfg.goals.dixonColesRho;

    const hTeam = currentDecayedRate(teamGoalsAll.get(m.home_team_id), tsMs, avgTG / 2, K_TEAM);
    const aTeam = currentDecayedRate(teamGoalsAll.get(m.away_team_id), tsMs, avgTG / 2, K_TEAM);

    if (isTest && hTeam.matches >= 10 && aTeam.matches >= 10 && cst.n >= 30) {
      const basePerSide = avgTG / 2;
      const baseLam = Math.max(0.25, Math.min(4.8, avgHG * (hTeam.forRate / basePerSide) * (aTeam.againstRate / basePerSide)));
      const baseMu = Math.max(0.25, Math.min(4.8, avgAG * (aTeam.forRate / basePerSide) * (hTeam.againstRate / basePerSide)));

      // H2H lookup
      const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
      const pairKey = `${pA}__${pB}`;
      const past = (h2hPairHistory.get(pairKey) || []).filter(h => (tsMs - h.ms) <= FIVE_YEARS_MS).slice(-6);
      let h2hGoalDiff = 0;
      const nH2H = past.length;
      if (nH2H > 0) {
        let diffSum = 0;
        for (const p of past) {
          const d = p.homeId === m.home_team_id ? (p.hg - p.ag) : (p.ag - p.hg);
          diffSum += d;
        }
        h2hGoalDiff = diffSum / nH2H;
      }
      const h2hSampleWeight = nH2H > 0 ? Math.min(0.20, nH2H / (nH2H + 15)) : 0;

      const actualH = m.home_score > m.away_score ? 1 : 0;
      const actualD = m.home_score === m.away_score ? 1 : 0;
      const actualA = m.home_score < m.away_score ? 1 : 0;
      const actualO25 = (m.home_score + m.away_score) > 2.5 ? 1 : 0;
      const actualBtts = (m.home_score >= 1 && m.away_score >= 1) ? 1 : 0;

      // H2H ablation sweep (plus retain w=0.04 matrix probabilities for comprehensive walk-forward check)
      let wfMatrix: number[][] | null = null;
      for (const w of H2H_WEIGHTS) {
        const mod = w * h2hSampleWeight * h2hGoalDiff * 5.0;
        const lam = Math.max(0.2, Math.min(5.0, baseLam * Math.exp(mod)));
        const mu = Math.max(0.2, Math.min(5.0, baseMu * Math.exp(-mod)));

        let pH = 0, pD = 0, pA = 0, pO25 = 0, pBtts = 0, tot = 0;
        const mat: number[][] = [];
        for (let x = 0; x <= 7; x++) {
          mat[x] = [];
          const px = poissonProb(lam, x);
          for (let y = 0; y <= 7; y++) {
            const p = px * poissonProb(mu, y) * dcTau(x, y, lam, mu, rho);
            mat[x][y] = p;
            tot += p;
            if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
            if (x + y > 2.5) pO25 += p;
            if (x >= 1 && y >= 1) pBtts += p;
          }
        }
        pH /= tot; pD /= tot; pA /= tot; pO25 /= tot; pBtts /= tot;
        if (w === 0.04) {
          for (let x = 0; x <= 7; x++) {
            for (let y = 0; y <= 7; y++) {
              mat[x][y] /= tot;
            }
          }
          wfMatrix = mat;
        }

        const brier1X2 = ((pH - actualH) ** 2 + (pD - actualD) ** 2 + (pA - actualA) ** 2) / 3;
        const brierO25 = (pO25 - actualO25) ** 2;
        const brierBtts = (pBtts - actualBtts) ** 2;

        h2hBrierSums[w].n += 1;
        h2hBrierSums[w].sum1X2 += brier1X2;
        h2hBrierSums[w].sumO25 += brierO25;
        h2hBrierSums[w].sumBtts += brierBtts;
      }

      // Comprehensive per-(leagueGroup, marketFamily) Walk-Forward Scoring (using normalized joint matrix)
      if (wfMatrix) {
        let pH = 0, pD = 0, pA = 0, pBtts = 0;
        const pTotO: Record<number, number> = { 0.5: 0, 1.5: 0, 2.5: 0, 3.5: 0, 4.5: 0 };
        const pHomeO: Record<number, number> = { 0.5: 0, 1.5: 0, 2.5: 0 };
        const pAwayO: Record<number, number> = { 0.5: 0, 1.5: 0, 2.5: 0 };
        const pAhRet: Record<number, number> = Object.fromEntries(AH_LINES.map(l => [l, 0]));

        for (let x = 0; x <= 7; x++) {
          for (let y = 0; y <= 7; y++) {
            const p = wfMatrix[x][y];
            if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
            if (x >= 1 && y >= 1) pBtts += p;
            for (const l of GOAL_LINES) if (x + y > l) pTotO[l] += p;
            for (const l of TEAM_GOAL_LINES) {
              if (x > l) pHomeO[l] += p;
              if (y > l) pAwayO[l] += p;
            }
            for (const l of AH_LINES) {
              pAhRet[l] += p * settleAhReturn(x, y, l);
            }
          }
        }

        const baseH = cst.hw / cst.n;
        const baseD = cst.dw / cst.n;
        const baseA = cst.aw / cst.n;
        const baseBtts = cst.btts / cst.n;

        // 1. result (1X2_HOME, 1X2_AWAY)
        pushWfCluster(
          grp,
          'result',
          (pH - actualH) ** 2 + (pA - actualA) ** 2,
          (baseH - actualH) ** 2 + (baseA - actualA) ** 2,
          2
        );

        // 2. draw (1X2_DRAW)
        pushWfCluster(grp, 'draw', (pD - actualD) ** 2, (baseD - actualD) ** 2, 1);

        // 3. double_chance (DC_1X, DC_X2, DC_12)
        const act1X = actualH + actualD;
        const actX2 = actualA + actualD;
        const act12 = actualH + actualA;
        pushWfCluster(
          grp,
          'double_chance',
          ((pH + pD) - act1X) ** 2 + ((pA + pD) - actX2) ** 2 + ((pH + pA) - act12) ** 2,
          ((baseH + baseD) - act1X) ** 2 + ((baseA + baseD) - actX2) ** 2 + ((baseH + baseA) - act12) ** 2,
          3
        );

        // 4. goals_over_under (Total O/U 0.5..4.5 + Team Totals Home/Away O/U 0.5..2.5)
        let gModelSq = 0, gBaseSq = 0, gK = 0;
        const totG = m.home_score + m.away_score;
        for (const l of GOAL_LINES) {
          const yAct = totG > l ? 1 : 0;
          const bRate = cst.totO[l] / cst.n;
          gModelSq += (pTotO[l] - yAct) ** 2;
          gBaseSq += (bRate - yAct) ** 2;
          gK += 1;
        }
        for (const l of TEAM_GOAL_LINES) {
          const yH = m.home_score > l ? 1 : 0;
          const bH = cst.homeO[l] / cst.n;
          gModelSq += (pHomeO[l] - yH) ** 2;
          gBaseSq += (bH - yH) ** 2;
          gK += 1;

          const yA = m.away_score > l ? 1 : 0;
          const bA = cst.awayO[l] / cst.n;
          gModelSq += (pAwayO[l] - yA) ** 2;
          gBaseSq += (bA - yA) ** 2;
          gK += 1;
        }
        pushWfCluster(grp, 'goals_over_under', gModelSq, gBaseSq, gK);

        // 5. both_teams_to_score
        pushWfCluster(grp, 'both_teams_to_score', (pBtts - actualBtts) ** 2, (baseBtts - actualBtts) ** 2, 1);

        // 6. handicap (all 13 Asian Handicap lines -1.5..+1.5 via normalized settlement return)
        let ahModelSq = 0, ahBaseSq = 0;
        for (const l of AH_LINES) {
          const yRet = settleAhReturn(m.home_score, m.away_score, l);
          const bRet = cst.ahRetSum[l] / cst.n;
          ahModelSq += (pAhRet[l] - yRet) ** 2;
          ahBaseSq += (bRet - yRet) ** 2;
        }
        pushWfCluster(grp, 'handicap', ahModelSq, ahBaseSq, AH_LINES.length);
      }

      // Halves held-out evaluation (separate 1H/2H rates across K_HALVES vs league-specific 1H share & flat 0.43)
      if (lCfg.halves && m.home_half_time_score !== null && m.away_half_time_score !== null && cst.htN >= 30) {
        const h1Mean = cst.h1g / cst.htN;
        const a1Mean = cst.a1g / cst.htN;
        const h2Mean = cst.h2g / cst.htN;
        const a2Mean = cst.a2g / cst.htN;
        const base1H = Math.max(0.05, (h1Mean + a1Mean) / 2);
        const base2H = Math.max(0.05, (h2Mean + a2Mean) / 2);

        const h1Check = team1HGoals.get(m.home_team_id)?.matches ?? 0;
        const a1Check = team1HGoals.get(m.away_team_id)?.matches ?? 0;

        if (h1Check >= 10 && a1Check >= 10) {
          const t1 = m.home_half_time_score + m.away_half_time_score;
          const h2Actual = Math.max(0, m.home_score - m.home_half_time_score);
          const a2Actual = Math.max(0, m.away_score - m.away_half_time_score);
          const t2 = h2Actual + a2Actual;
          const actHsh2 = t2 > t1 ? 1 : 0;
          const actHsh1 = t1 > t2 ? 1 : 0;
          const actHshEq = t1 === t2 ? 1 : 0;
          const actFh05 = t1 > 0.5 ? 1 : 0;
          const actFh15 = t1 > 1.5 ? 1 : 0;
          const actShH = h2Actual > a2Actual ? 1 : 0;
          const actShD = h2Actual === a2Actual ? 1 : 0;
          const actShA = h2Actual < a2Actual ? 1 : 0;

          const flat1H = (baseLam + baseMu) * 0.43;
          const flat2H = (baseLam + baseMu) * 0.57;
          const computeHsh = (m1: number, m2: number) => {
            let p1 = 0, p2 = 0, pEq = 0;
            for (let g1 = 0; g1 <= 7; g1++) {
              const pg1 = poissonProb(m1, g1);
              for (let g2 = 0; g2 <= 7; g2++) {
                const j = pg1 * poissonProb(m2, g2);
                if (g2 > g1) p2 += j; else if (g1 > g2) p1 += j; else pEq += j;
              }
            }
            const s = p1 + p2 + pEq;
            return {
              p1: p1 / s,
              p2: p2 / s,
              pEq: pEq / s,
              pFhO05: poisOverProb(m1, 0.5),
              pFhO15: poisOverProb(m1, 1.5),
            };
          };
          const flatPred = computeHsh(flat1H, flat2H);

          for (const kh of HALVES_KS) {
            const h1 = currentDecayedRate(team1HGoals.get(m.home_team_id), tsMs, base1H, kh);
            const a1 = currentDecayedRate(team1HGoals.get(m.away_team_id), tsMs, base1H, kh);
            const h2 = currentDecayedRate(team2HGoals.get(m.home_team_id), tsMs, base2H, kh);
            const a2 = currentDecayedRate(team2HGoals.get(m.away_team_id), tsMs, base2H, kh);

            const sep1H = Math.max(0.1, h1Mean * (h1.forRate / base1H) * (a1.againstRate / base1H))
                        + Math.max(0.1, a1Mean * (a1.forRate / base1H) * (h1.againstRate / base1H));
            const sep2HHome = Math.max(0.1, h2Mean * (h2.forRate / base2H) * (a2.againstRate / base2H));
            const sep2HAway = Math.max(0.1, a2Mean * (a2.forRate / base2H) * (h2.againstRate / base2H));
            const sep2H = sep2HHome + sep2HAway;
            const sepPred = computeHsh(sep1H, sep2H);

            halvesKSweep[kh].n++;
            halvesKSweep[kh].sepHshBrier += (sepPred.p2 - actHsh2) ** 2;
            halvesKSweep[kh].flatHshBrier += (flatPred.p2 - actHsh2) ** 2;
            halvesKSweep[kh].sepFhBrier += (sepPred.pFhO05 - actFh05) ** 2;
            halvesKSweep[kh].flatFhBrier += (flatPred.pFhO05 - actFh05) ** 2;

            if (kh === 40) {
              // Walk-forward clusters for highest_scoring_half, first_half_goals, second_half_result
              const bHsh1 = cst.hsh1 / cst.htN;
              const bHsh2 = cst.hsh2 / cst.htN;
              const bHshEq = cst.hshEq / cst.htN;
              pushWfCluster(
                grp,
                'highest_scoring_half',
                (sepPred.p1 - actHsh1) ** 2 + (sepPred.p2 - actHsh2) ** 2 + (sepPred.pEq - actHshEq) ** 2,
                (bHsh1 - actHsh1) ** 2 + (bHsh2 - actHsh2) ** 2 + (bHshEq - actHshEq) ** 2,
                3
              );

              const bFh05 = cst.fhO05 / cst.htN;
              const bFh15 = cst.fhO15 / cst.htN;
              pushWfCluster(
                grp,
                'first_half_goals',
                (sepPred.pFhO05 - actFh05) ** 2 + (sepPred.pFhO15 - actFh15) ** 2,
                (bFh05 - actFh05) ** 2 + (bFh15 - actFh15) ** 2,
                2
              );

              let p2H = 0, p2D = 0, p2A = 0, tot2H = 0;
              for (let x = 0; x <= 6; x++) {
                const px = poissonProb(sep2HHome, x);
                for (let y = 0; y <= 6; y++) {
                  const j = px * poissonProb(sep2HAway, y);
                  tot2H += j;
                  if (x > y) p2H += j; else if (x === y) p2D += j; else p2A += j;
                }
              }
              p2H /= tot2H; p2D /= tot2H; p2A /= tot2H;
              const bShH = cst.shH / cst.htN;
              const bShD = cst.shD / cst.htN;
              const bShA = cst.shA / cst.htN;
              pushWfCluster(
                grp,
                'second_half_result',
                (p2H - actShH) ** 2 + (p2D - actShD) ** 2 + (p2A - actShA) ** 2,
                (bShH - actShH) ** 2 + (bShD - actShD) ** 2 + (bShA - actShA) ** 2,
                3
              );
            }
          }
        }
      }

      // Corners held-out evaluation (NegBinomial + Corners FOR & AGAINST vs Poisson & Causal Baseline)
      if (lCfg.corners && m.home_corners !== null && m.away_corners !== null && cst.cornersN >= 30) {
        const avgHC = cst.hc / cst.cornersN;
        const avgAC = cst.ac / cst.cornersN;
        const avgTotC = avgHC + avgAC;
        const cMeanSide = Math.max(0.5, avgTotC / 2);
        const meanSq = avgTotC;
        const varC = Math.max(avgTotC + 0.1, (cst.cornersSumSq / cst.cornersN - avgTotC * avgTotC) * (cst.cornersN / Math.max(1, cst.cornersN - 1)));
        const alphaC = Math.max(0.01, (varC - meanSq) / (avgTotC * avgTotC));

        const hc = currentDecayedRate(teamCorners.get(m.home_team_id), tsMs, cMeanSide, K_CORNERS);
        const ac = currentDecayedRate(teamCorners.get(m.away_team_id), tsMs, cMeanSide, K_CORNERS);
        if (hc.matches >= 10 && ac.matches >= 10) {
          const expHC = avgHC * (hc.forRate / cMeanSide) * (ac.againstRate / cMeanSide);
          const expAC = avgAC * (ac.forRate / cMeanSide) * (hc.againstRate / cMeanSide);
          const expTotalC = Math.max(4.5, Math.min(17.0, expHC + expAC));
          const totC = m.home_corners + m.away_corners;

          const actO95 = totC > 9.5 ? 1 : 0;
          const pNb95 = nbOverProb(expTotalC, 9.5, alphaC, 30);
          const pPois95 = poisOverProb(expTotalC, 9.5);
          const pBase95 = cst.cornersO[9.5] / cst.cornersN;

          cornersEvalN++;
          cornersNbBrier += (pNb95 - actO95) ** 2;
          cornersPoisBrier += (pPois95 - actO95) ** 2;
          cornersBaseBrier += (pBase95 - actO95) ** 2;
          cornersNbLl -= actO95 ? Math.log(pNb95) : Math.log(1 - pNb95);
          cornersPoisLl -= actO95 ? Math.log(pPois95) : Math.log(1 - pPois95);

          let cModSq = 0, cBaseSq = 0;
          for (const cl of CORNER_LINES) {
            const act = totC > cl ? 1 : 0;
            const pMod = nbOverProb(expTotalC, cl, alphaC, 30);
            const pBas = cst.cornersO[cl] / cst.cornersN;
            cModSq += (pMod - act) ** 2;
            cBaseSq += (pBas - act) ** 2;
          }
          pushWfCluster(grp, 'corners', cModSq, cBaseSq, CORNER_LINES.length);
        }
      }

      // Cards held-out evaluation (NegBinomial + Referee Shrinkage)
      if (lCfg.cards && m.home_yellow_cards !== null && m.away_yellow_cards !== null && cst.cardsN >= 30) {
        const totalC = m.home_yellow_cards + m.away_yellow_cards + (m.home_red_cards ?? 0) + (m.away_red_cards ?? 0);
        const actO45 = totalC > 4.5 ? 1 : 0;
        const cardMean = Math.max(1.0, cst.cardsSum / cst.cardsN);
        const varCards = Math.max(cardMean + 0.1, (cst.cardsSumSq / cst.cardsN - cardMean * cardMean) * (cst.cardsN / Math.max(1, cst.cardsN - 1)));
        const alphaCards = Math.max(0.01, (varCards - cardMean) / (cardMean * cardMean));
        const hCd = currentDecayedRate(teamCards.get(m.home_team_id), tsMs, cardMean / 2, K_CORNERS);
        const aCd = currentDecayedRate(teamCards.get(m.away_team_id), tsMs, cardMean / 2, K_CORNERS);
        const teamCardsRatio = ((hCd.forRate + hCd.againstRate + aCd.forRate + aCd.againstRate) / 2) / cardMean;

        let chosenMuCards = Math.max(1.5, Math.min(9.0, cardMean * (0.3 * teamCardsRatio + 0.7)));
        if (m.referee && m.referee.trim().length > 0) {
          const refKey = `${comp}::${m.referee.trim().toLowerCase()}`;
          const rt = refTracker.get(refKey);
          for (const kRef of REF_KS) {
            const refShrunk = (rt && rt.wSum > 0)
              ? ((rt.gfSum * Math.exp(-DECAY_LAMBDA * Math.max(0, (tsMs - rt.lastMs) / DAY_MS)) + kRef * cardMean) / (rt.wSum * Math.exp(-DECAY_LAMBDA * Math.max(0, (tsMs - rt.lastMs) / DAY_MS)) + kRef))
              : cardMean;
            const muCardsRef = Math.max(1.5, Math.min(9.0, 0.5 * refShrunk + 0.5 * cardMean * teamCardsRatio));
            if (kRef === 10) chosenMuCards = muCardsRef;
            const muCardsBase = Math.max(1.5, Math.min(9.0, cardMean * (0.3 * teamCardsRatio + 0.7)));

            const pNbRef = nbOverProb(muCardsRef, 4.5, alphaCards, 20);
            const pPoisRef = poisOverProb(muCardsRef, 4.5);
            const pNbBase = nbOverProb(muCardsBase, 4.5, alphaCards, 20);

            cardsRefBrier[kRef].n++;
            cardsRefBrier[kRef].nbRefBrier += (pNbRef - actO45) ** 2;
            cardsRefBrier[kRef].poisRefBrier += (pPoisRef - actO45) ** 2;
            cardsRefBrier[kRef].nbBaseBrier += (pNbBase - actO45) ** 2;
          }
        } else {
          const muCardsBase = Math.max(1.5, Math.min(9.0, cardMean * (0.3 * teamCardsRatio + 0.7)));
          chosenMuCards = muCardsBase;
          cardsNoRefEvalN++;
          cardsNoRefNbBrier += (nbOverProb(muCardsBase, 4.5, alphaCards, 20) - actO45) ** 2;
          cardsNoRefPoisBrier += (poisOverProb(muCardsBase, 4.5) - actO45) ** 2;
        }

        if (hCd.matches >= 10 && aCd.matches >= 10) {
          let cdModSq = 0, cdBaseSq = 0;
          for (const cl of CARD_LINES) {
            const act = totalC > cl ? 1 : 0;
            const pMod = nbOverProb(chosenMuCards, cl, alphaCards, 20);
            const pBas = cst.cardsO[cl] / cst.cardsN;
            cdModSq += (pMod - act) ** 2;
            cdBaseSq += (pBas - act) ** 2;
          }
          pushWfCluster(grp, 'bookings', cdModSq, cdBaseSq, CARD_LINES.length);
        }
      }
    }

    // Update all causal league stats & trackers strictly AFTER prediction evaluation
    cst.n += 1;
    cst.hg += m.home_score;
    cst.ag += m.away_score;
    if (m.home_score > m.away_score) cst.hw += 1;
    else if (m.home_score === m.away_score) cst.dw += 1;
    else cst.aw += 1;
    if (m.home_score >= 1 && m.away_score >= 1) cst.btts += 1;
    const mTotG = m.home_score + m.away_score;
    for (const l of GOAL_LINES) if (mTotG > l) cst.totO[l] += 1;
    for (const l of TEAM_GOAL_LINES) {
      if (m.home_score > l) cst.homeO[l] += 1;
      if (m.away_score > l) cst.awayO[l] += 1;
    }
    for (const l of AH_LINES) {
      cst.ahRetSum[l] += settleAhReturn(m.home_score, m.away_score, l);
    }

    if (!teamGoalsHome.has(m.home_team_id)) teamGoalsHome.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    if (!teamGoalsAway.has(m.away_team_id)) teamGoalsAway.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    if (!teamGoalsAll.has(m.home_team_id)) teamGoalsAll.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    if (!teamGoalsAll.has(m.away_team_id)) teamGoalsAll.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    updateTracker(teamGoalsHome.get(m.home_team_id)!, tsMs, m.home_score, m.away_score);
    updateTracker(teamGoalsAway.get(m.away_team_id)!, tsMs, m.away_score, m.home_score);
    updateTracker(teamGoalsAll.get(m.home_team_id)!, tsMs, m.home_score, m.away_score);
    updateTracker(teamGoalsAll.get(m.away_team_id)!, tsMs, m.away_score, m.home_score);

    if (m.home_half_time_score !== null && m.away_half_time_score !== null) {
      const h1 = m.home_half_time_score;
      const a1 = m.away_half_time_score;
      const h2 = Math.max(0, m.home_score - h1);
      const a2 = Math.max(0, m.away_score - a1);
      cst.htN += 1;
      cst.h1g += h1; cst.a1g += a1; cst.h2g += h2; cst.a2g += a2;
      const t1 = h1 + a1, t2 = h2 + a2;
      if (t1 > t2) cst.hsh1 += 1; else if (t2 > t1) cst.hsh2 += 1; else cst.hshEq += 1;
      if (t1 > 0.5) cst.fhO05 += 1;
      if (t1 > 1.5) cst.fhO15 += 1;
      if (h2 > a2) cst.shH += 1; else if (h2 === a2) cst.shD += 1; else cst.shA += 1;

      if (!team1HGoals.has(m.home_team_id)) team1HGoals.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!team1HGoals.has(m.away_team_id)) team1HGoals.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!team2HGoals.has(m.home_team_id)) team2HGoals.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!team2HGoals.has(m.away_team_id)) team2HGoals.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      updateTracker(team1HGoals.get(m.home_team_id)!, tsMs, h1, a1);
      updateTracker(team1HGoals.get(m.away_team_id)!, tsMs, a1, h1);
      updateTracker(team2HGoals.get(m.home_team_id)!, tsMs, h2, a2);
      updateTracker(team2HGoals.get(m.away_team_id)!, tsMs, a2, h2);
    }

    if (m.home_corners !== null && m.away_corners !== null) {
      const tc = m.home_corners + m.away_corners;
      cst.cornersN += 1;
      cst.hc += m.home_corners;
      cst.ac += m.away_corners;
      cst.cornersSumSq += tc * tc;
      for (const cl of CORNER_LINES) if (tc > cl) cst.cornersO[cl] += 1;

      if (!teamCorners.has(m.home_team_id)) teamCorners.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!teamCorners.has(m.away_team_id)) teamCorners.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      updateTracker(teamCorners.get(m.home_team_id)!, tsMs, m.home_corners, m.away_corners);
      updateTracker(teamCorners.get(m.away_team_id)!, tsMs, m.away_corners, m.home_corners);
    }

    if (m.home_yellow_cards !== null && m.away_yellow_cards !== null) {
      const hCards = m.home_yellow_cards + (m.home_red_cards ?? 0);
      const aCards = m.away_yellow_cards + (m.away_red_cards ?? 0);
      const totCd = hCards + aCards;
      cst.cardsN += 1;
      cst.cardsSum += totCd;
      cst.cardsSumSq += totCd * totCd;
      for (const cl of CARD_LINES) if (totCd > cl) cst.cardsO[cl] += 1;

      if (!teamCards.has(m.home_team_id)) teamCards.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!teamCards.has(m.away_team_id)) teamCards.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      updateTracker(teamCards.get(m.home_team_id)!, tsMs, hCards, aCards);
      updateTracker(teamCards.get(m.away_team_id)!, tsMs, aCards, hCards);

      if (m.referee && m.referee.trim().length > 0) {
        const refKey = `${comp}::${m.referee.trim().toLowerCase()}`;
        if (!refTracker.has(refKey)) refTracker.set(refKey, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
        updateTracker(refTracker.get(refKey)!, tsMs, totCd, 0);
      }
    }

    const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
    const pairKey = `${pA}__${pB}`;
    if (!h2hPairHistory.has(pairKey)) h2hPairHistory.set(pairKey, []);
    h2hPairHistory.get(pairKey)!.push({ ms: tsMs, homeId: m.home_team_id, awayId: m.away_team_id, hg: m.home_score, ag: m.away_score });
  }

  // Pick optimal H2H weight ONLY if held-out Brier strictly improves vs 0.0
  const baseH2h = h2hBrierSums[0.0];
  const baseCombinedBrier = (baseH2h.sum1X2 + baseH2h.sumO25 + baseH2h.sumBtts) / (3 * baseH2h.n);
  let bestH2hWeight = 0.0;
  let bestH2hBrier = baseCombinedBrier;
  const h2hResultsTable: Array<{ weight: number; n: number; brier1X2: number; brierO25: number; brierBtts: number; combinedBrier: number; deltaVsBase: number }> = [];
  for (const w of H2H_WEIGHTS) {
    const r = h2hBrierSums[w];
    const b1x2 = r.sum1X2 / r.n;
    const bo25 = r.sumO25 / r.n;
    const bbtts = r.sumBtts / r.n;
    const comb = (b1x2 + bo25 + bbtts) / 3;
    h2hResultsTable.push({
      weight: w,
      n: r.n,
      brier1X2: Number(b1x2.toFixed(6)),
      brierO25: Number(bo25.toFixed(6)),
      brierBtts: Number(bbtts.toFixed(6)),
      combinedBrier: Number(comb.toFixed(6)),
      deltaVsBase: Number((comb - baseCombinedBrier).toFixed(7)),
    });
    if (w > 0 && comb < bestH2hBrier) {
      bestH2hBrier = comb;
      bestH2hWeight = w;
    }
  }
  const h2hEnabled = bestH2hWeight > 0 && bestH2hBrier < baseCombinedBrier;

  // Pick optimal referee shrinkage K_ref
  let bestRefK = 15;
  let bestRefBrier = Infinity;
  const refTable: Array<{ k: number; n: number; nbRefBrier: number; poisRefBrier: number; nbLeagueBaseBrier: number }> = [];
  for (const k of REF_KS) {
    const r = cardsRefBrier[k];
    const nbB = r.nbRefBrier / r.n;
    const poB = r.poisRefBrier / r.n;
    const baB = r.nbBaseBrier / r.n;
    refTable.push({
      k,
      n: r.n,
      nbRefBrier: Number(nbB.toFixed(6)),
      poisRefBrier: Number(poB.toFixed(6)),
      nbLeagueBaseBrier: Number(baB.toFixed(6)),
    });
    if (nbB < bestRefBrier) {
      bestRefBrier = nbB;
      bestRefK = k;
    }
  }

  // Compute 1,000-resample Match-Cluster Bootstrap Brier Skill Score + 95% CI per (leagueGroup, marketFamily)
  interface WalkForwardMarketValidationEntry {
    leagueGroup: LeagueGroupKey;
    market: WfFamily;
    matches: number;
    samples: number;
    modelBrier: number;
    baseBrier: number;
    brierSkill: number;
    ci95Lower: number;
    ci95Upper: number;
    allowed: boolean;
    reason: string;
  }

  const walkForwardMarketValidation: Record<LeagueGroupKey, Record<string, WalkForwardMarketValidationEntry>> = {
    UK_WITH_REF: {},
    EURO_NO_REF: {},
    EXTRA_GOALS_ONLY: {},
  };

  let rngSeed = 20250501;
  const nextRand = () => {
    rngSeed = (rngSeed * 16807) % 2147483647;
    return (rngSeed - 1) / 2147483646;
  };

  const GROUPS: LeagueGroupKey[] = ['UK_WITH_REF', 'EURO_NO_REF', 'EXTRA_GOALS_ONLY'];
  for (const grp of GROUPS) {
    for (const fam of WF_FAMILIES) {
      const clusters = wfClusters.get(`${grp}::${fam}`) || [];
      const nMatches = clusters.length;
      if (nMatches < 30) {
        walkForwardMarketValidation[grp][fam] = {
          leagueGroup: grp,
          market: fam,
          matches: nMatches,
          samples: nMatches > 0 ? clusters.reduce((s, c) => s + c.kLines, 0) : 0,
          modelBrier: 0,
          baseBrier: 0,
          brierSkill: 0,
          ci95Lower: -1,
          ci95Upper: 1,
          allowed: false,
          reason: nMatches === 0
            ? `Disabled: no stored column data for ${fam} in ${grp}.`
            : `Disabled: insufficient held-out sample (${nMatches} < 30 matches).`,
        };
        continue;
      }

      let totalMod = 0, totalBas = 0, totalSamples = 0;
      for (const c of clusters) {
        totalMod += c.sumSqModel;
        totalBas += c.sumSqBase;
        totalSamples += c.kLines;
      }
      const modelBrier = totalMod / totalSamples;
      const baseBrier = totalBas / totalSamples;
      const brierSkill = baseBrier > 0 ? 1 - modelBrier / baseBrier : 0;

      const bootBss: number[] = new Array(1000);
      for (let it = 0; it < 1000; it++) {
        let bMod = 0, bBas = 0;
        for (let i = 0; i < nMatches; i++) {
          const c = clusters[Math.floor(nextRand() * nMatches)];
          bMod += c.sumSqModel;
          bBas += c.sumSqBase;
        }
        bootBss[it] = bBas > 0 ? 1 - bMod / bBas : 0;
      }
      bootBss.sort((a, b) => a - b);
      const ci95Lower = Number(bootBss[25].toFixed(4));
      const ci95Upper = Number(bootBss[975].toFixed(4));
      const bssRounded = Number(brierSkill.toFixed(4));
      const allowed = nMatches >= 30 && bssRounded > 0 && ci95Lower > 0;

      walkForwardMarketValidation[grp][fam] = {
        leagueGroup: grp,
        market: fam,
        matches: nMatches,
        samples: totalSamples,
        modelBrier: Number(modelBrier.toFixed(5)),
        baseBrier: Number(baseBrier.toFixed(5)),
        brierSkill: bssRounded,
        ci95Lower,
        ci95Upper,
        allowed,
        reason: allowed
          ? `Allowed: BSS +${bssRounded.toFixed(4)} (95% CI [+${ci95Lower.toFixed(4)}, +${ci95Upper.toFixed(4)}] > 0 across ${nMatches} held-out matches).`
          : `Rejected: BSS ${bssRounded >= 0 ? '+' : ''}${bssRounded.toFixed(4)} (95% CI [${ci95Lower.toFixed(4)}, ${ci95Upper.toFixed(4)}]) does not exceed 0 with CI lower > 0.`,
      };
    }
  }

  // 3. Derby Statistical Significance Test (league-matched: within-league excess vs non-derbies in same leagues)
  const derbyGoals: number[] = [], nonDerbyGoals: number[] = [];
  const derbyDraws: number[] = [], nonDerbyDraws: number[] = [];
  const derbyCards: number[] = [], nonDerbyCards: number[] = [];
  const derbyCorners: number[] = [], nonDerbyCorners: number[] = [];

  const derbyLeaguesWithMatches = new Set<string>();
  for (const m of matches) {
    const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
    if (rivalrySet.has(`${pA}__${pB}`)) derbyLeaguesWithMatches.add(canonicalComp(m.competition_code));
  }

  for (const m of matches) {
    const comp = canonicalComp(m.competition_code);
    if (!derbyLeaguesWithMatches.has(comp)) continue;
    const lCfg = leaguesOutput[comp];
    if (!lCfg) continue;

    const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
    const isDerby = rivalrySet.has(`${pA}__${pB}`);

    const goalExcess = (m.home_score + m.away_score) - lCfg.goals.avgGoals;
    const drawExcess = (m.home_score === m.away_score ? 1 : 0) - lCfg.goals.drawRate;
    if (isDerby) {
      derbyGoals.push(goalExcess);
      derbyDraws.push(drawExcess);
    } else {
      nonDerbyGoals.push(goalExcess);
      nonDerbyDraws.push(drawExcess);
    }

    if (lCfg.cards && m.home_yellow_cards !== null && m.away_yellow_cards !== null) {
      const tc = m.home_yellow_cards + m.away_yellow_cards + (m.home_red_cards ?? 0) + (m.away_red_cards ?? 0);
      const cardExcess = tc - lCfg.cards.avgTotalCards;
      if (isDerby) derbyCards.push(cardExcess);
      else nonDerbyCards.push(cardExcess);
    }

    if (lCfg.corners && m.home_corners !== null && m.away_corners !== null) {
      const tCo = m.home_corners + m.away_corners;
      const cornerExcess = tCo - lCfg.corners.avgTotalCorners;
      if (isDerby) derbyCorners.push(cornerExcess);
      else nonDerbyCorners.push(cornerExcess);
    }
  }

  const derbyCardsTest = welchTTest(derbyCards, nonDerbyCards);
  const derbyGoalsTest = welchTTest(derbyGoals, nonDerbyGoals);
  const derbyDrawTest = welchTTest(derbyDraws, nonDerbyDraws);
  const derbyCornersTest = welchTTest(derbyCorners, nonDerbyCorners);

  const derbyMeanCardsBase = 4.2;
  const avgCardsWeightedInDerbyLeagues = (() => {
    let s = 0, c = 0;
    for (const m of matches) {
      const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
      if (rivalrySet.has(`${pA}__${pB}`) && m.home_yellow_cards !== null && m.away_yellow_cards !== null) {
        const lCfg = leaguesOutput[canonicalComp(m.competition_code)];
        if (lCfg?.cards) {
          s += lCfg.cards.avgTotalCards;
          c++;
        }
      }
    }
    return c > 0 ? s / c : derbyMeanCardsBase;
  })();

  const cardMultiplierIfSig = derbyCardsTest.significant05 && derbyCardsTest.diff > 0
    ? Number((1 + derbyCardsTest.diff / avgCardsWeightedInDerbyLeagues).toFixed(4))
    : 1.0;

  let bestHalvesK = 40;
  let bestHalvesHshBrier = Infinity;
  const halvesSweepTable: Array<{ kHalves: number; n: number; sepHshBrier: number; flatHshBrier: number; sepFhO05Brier: number; flatFhO05Brier: number }> = [];
  for (const kh of HALVES_KS) {
    const r = halvesKSweep[kh];
    const sepHsh = r.sepHshBrier / Math.max(1, r.n);
    const flatHsh = r.flatHshBrier / Math.max(1, r.n);
    const sepFh = r.sepFhBrier / Math.max(1, r.n);
    const flatFh = r.flatFhBrier / Math.max(1, r.n);
    halvesSweepTable.push({
      kHalves: kh,
      n: r.n,
      sepHshBrier: Number(sepHsh.toFixed(6)),
      flatHshBrier: Number(flatHsh.toFixed(6)),
      sepFhO05Brier: Number(sepFh.toFixed(6)),
      flatFhO05Brier: Number(flatFh.toFixed(6)),
    });
    if (sepHsh < bestHalvesHshBrier) {
      bestHalvesHshBrier = sepHsh;
      bestHalvesK = kh;
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalFinishedMatches: matches.length,
    totalRivalriesSeeded: rivalryRows.length,
    aliasToCanonical: ALIAS_TO_CANONICAL,
    groupSampleSizes,
    h2hAblation: {
      enabled: h2hEnabled,
      selectedWeight: h2hEnabled ? bestH2hWeight : 0,
      baseCombinedBrier: Number(baseCombinedBrier.toFixed(6)),
      selectedCombinedBrier: Number(bestH2hBrier.toFixed(6)),
      deltaBrier: Number((bestH2hBrier - baseCombinedBrier).toFixed(7)),
      heldOutMatchesTested: baseH2h.n,
      candidates: h2hResultsTable,
    },
    halvesValidation: {
      optimalHalfShrinkageK: bestHalvesK,
      heldOutMatchesTested: halvesKSweep[bestHalvesK].n,
      sweep: halvesSweepTable,
    },
    cornersValidation: {
      heldOutMatchesTested: cornersEvalN,
      negBinomialO95Brier: Number((cornersNbBrier / Math.max(1, cornersEvalN)).toFixed(6)),
      poissonO95Brier: Number((cornersPoisBrier / Math.max(1, cornersEvalN)).toFixed(6)),
      leagueBaselineO95Brier: Number((cornersBaseBrier / Math.max(1, cornersEvalN)).toFixed(6)),
      negBinomialO95LogLoss: Number((cornersNbLl / Math.max(1, cornersEvalN)).toFixed(6)),
      poissonO95LogLoss: Number((cornersPoisLl / Math.max(1, cornersEvalN)).toFixed(6)),
    },
    cardsAndRefereeValidation: {
      optimalRefShrinkageK: bestRefK,
      announcedRefereeSweep: refTable,
      noRefereeHeldOutMatches: cardsNoRefEvalN,
      noRefereeNegBinomialBrier: Number((cardsNoRefNbBrier / Math.max(1, cardsNoRefEvalN)).toFixed(6)),
      noRefereePoissonBrier: Number((cardsNoRefPoisBrier / Math.max(1, cardsNoRefEvalN)).toFixed(6)),
    },
    derbySignificance: {
      rivalriesTableCount: rivalryRows.length,
      cardsExcessVsLeagueMean: derbyCardsTest,
      goalsExcessVsLeagueMean: derbyGoalsTest,
      drawExcessVsLeagueMean: derbyDrawTest,
      cornersExcessVsLeagueMean: derbyCornersTest,
      applyCardsAdjustment: derbyCardsTest.significant05 && derbyCardsTest.diff > 0,
      cardsMultiplier: cardMultiplierIfSig,
      applyGoalsAdjustment: derbyGoalsTest.significant05,
      applyDrawAdjustment: derbyDrawTest.significant05,
      applyCornersAdjustment: derbyCornersTest.significant05,
    },
    walkForwardMarketValidation,
    leagues: leaguesOutput,
  };

  const outPath = path.join(process.cwd(), 'src/lib/prediction/calibratedParams.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

  console.log('====================================================================');
  console.log('EMPIRICAL CALIBRATION, H2H ABLATION & WALK-FORWARD MARKET GATING');
  console.log('====================================================================');
  console.log(`Total finished stored matches: ${matches.length}`);
  console.log('\n--- 1. SAMPLE SIZE PER MARKET AND LEAGUE GROUP ---');
  for (const [grp, s] of Object.entries(groupSampleSizes)) {
    console.log(`\nGroup: ${grp} (${s.leagues.length} leagues: ${s.leagues.join(', ')})`);
    console.log(`  Goals & Team Totals (stored FT scores): N = ${s.goalsMatches}`);
    console.log(`  Asian Handicap (joint goal distribution): N = ${s.goalsMatches} (bookmaker AH odds stored: N = ${s.asianHandicapOddsMatches})`);
    console.log(`  Highest-Scoring Half / 1H Goals (stored HT): N = ${s.halfTimeMatches}`);
    console.log(`  Corners Full Match (stored corners): N = ${s.cornersMatches}`);
    console.log(`  Cards (stored yellow+red cards): N = ${s.cardsMatches}`);
    console.log(`  Referee Coverage (stored referee): N = ${s.refereeMatches}`);
  }

  console.log('\n--- 2. WALK-FORWARD RESULTS PER MARKET & LEAGUE GROUP (1,000 BOOTSTRAP RESAMPLES) ---');
  for (const grp of GROUPS) {
    console.log(`\nLeague Group: ${grp}`);
    console.log('  Market                | Matches | Samples | ModelBrier | BaseBrier | BrierSkill | 95% CI               | Allowed');
    console.log('  ----------------------+---------+---------+------------+-----------+------------+----------------------+--------');
    for (const fam of WF_FAMILIES) {
      const r = walkForwardMarketValidation[grp][fam];
      const ciStr = `[${r.ci95Lower >= 0 ? '+' : ''}${r.ci95Lower.toFixed(4)}, ${r.ci95Upper >= 0 ? '+' : ''}${r.ci95Upper.toFixed(4)}]`;
      const bssStr = `${r.brierSkill >= 0 ? '+' : ''}${r.brierSkill.toFixed(4)}`;
      console.log(
        `  ${fam.padEnd(21)} | ${String(r.matches).padStart(7)} | ${String(r.samples).padStart(7)} | ${r.modelBrier.toFixed(5).padStart(10)} | ${r.baseBrier.toFixed(5).padStart(9)} | ${bssStr.padStart(10)} | ${ciStr.padEnd(20)} | ${r.allowed ? 'YES' : 'NO'}`
      );
    }
  }

  console.log('\n--- 3. HELD-OUT H2H BRIER SCORE ABLATION ---');
  console.log(JSON.stringify(output.h2hAblation, null, 2));

  console.log('\n--- 4. HALVES SEPARATE RATES vs FLAT SPLIT (HELD-OUT) ---');
  console.log(JSON.stringify(output.halvesValidation, null, 2));

  console.log('\n--- 5. CORNERS NEGBINOMIAL (FOR+AGAINST) vs POISSON (HELD-OUT) ---');
  console.log(JSON.stringify(output.cornersValidation, null, 2));

  console.log('\n--- 6. CARDS NEGBINOMIAL & REFEREE SHRINKAGE vs BASELINE (HELD-OUT) ---');
  console.log(JSON.stringify(output.cardsAndRefereeValidation, null, 2));

  console.log('\n--- 7. DERBY STATISTICAL SIGNIFICANCE (LEAGUE-MATCHED WELCH T-TEST) ---');
  console.log(JSON.stringify(output.derbySignificance, null, 2));
  console.log(`\nWrote calibrated parameters to ${outPath}`);
}

main();
