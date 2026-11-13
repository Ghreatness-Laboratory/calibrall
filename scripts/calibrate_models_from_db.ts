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

    const idx = leagueSeenIdx.get(comp)!;
    leagueSeenIdx.set(comp, idx + 1);
    const isTest = idx >= (leagueCutoffIdx.get(comp) ?? 0);
    const tsMs = new Date(m.kickoff_time).getTime();

    const avgHG = lCfg.goals.avgHomeGoals;
    const avgAG = lCfg.goals.avgAwayGoals;
    const avgTG = lCfg.goals.avgGoals;
    const rho = lCfg.goals.dixonColesRho;

    const hTeam = currentDecayedRate(teamGoalsAll.get(m.home_team_id), tsMs, avgTG / 2, K_TEAM);
    const aTeam = currentDecayedRate(teamGoalsAll.get(m.away_team_id), tsMs, avgTG / 2, K_TEAM);

    if (isTest && hTeam.matches >= 10 && aTeam.matches >= 10) {
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

      // Only evaluate H2H ablation across fixtures that actually have H2H sample (and overall)
      for (const w of H2H_WEIGHTS) {
        const mod = w * h2hSampleWeight * h2hGoalDiff * 5.0; // scaled adjustment
        const lam = Math.max(0.2, Math.min(5.0, baseLam * Math.exp(mod)));
        const mu = Math.max(0.2, Math.min(5.0, baseMu * Math.exp(-mod)));

        let pH = 0, pD = 0, pA = 0, pO25 = 0, pBtts = 0, tot = 0;
        for (let x = 0; x <= 7; x++) {
          const px = poissonProb(lam, x);
          for (let y = 0; y <= 7; y++) {
            const p = px * poissonProb(mu, y) * dcTau(x, y, lam, mu, rho);
            tot += p;
            if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
            if (x + y > 2.5) pO25 += p;
            if (x >= 1 && y >= 1) pBtts += p;
          }
        }
        pH /= tot; pD /= tot; pA /= tot; pO25 /= tot; pBtts /= tot;

        const brier1X2 = ((pH - actualH) ** 2 + (pD - actualD) ** 2 + (pA - actualA) ** 2) / 3;
        const brierO25 = (pO25 - actualO25) ** 2;
        const brierBtts = (pBtts - actualBtts) ** 2;

        h2hBrierSums[w].n += 1;
        h2hBrierSums[w].sum1X2 += brier1X2;
        h2hBrierSums[w].sumO25 += brierO25;
        h2hBrierSums[w].sumBtts += brierBtts;
      }

      // Halves held-out evaluation (separate 1H/2H rates across K_HALVES vs league-specific 1H share & flat 0.43)
      if (lCfg.halves && m.home_half_time_score !== null && m.away_half_time_score !== null) {
        const h1Mean = lCfg.halves.avgHome1HGoals;
        const a1Mean = lCfg.halves.avgAway1HGoals;
        const h2Mean = lCfg.halves.avgHome2HGoals;
        const a2Mean = lCfg.halves.avgAway2HGoals;
        const base1H = (h1Mean + a1Mean) / 2;
        const base2H = (h2Mean + a2Mean) / 2;

        const h1Check = team1HGoals.get(m.home_team_id)?.matches ?? 0;
        const a1Check = team1HGoals.get(m.away_team_id)?.matches ?? 0;

        if (h1Check >= 10 && a1Check >= 10) {
          const t1 = m.home_half_time_score + m.away_half_time_score;
          const t2 = (m.home_score - m.home_half_time_score) + (m.away_score - m.away_half_time_score);
          const actHsh2 = t2 > t1 ? 1 : 0;
          const actFh05 = t1 > 0.5 ? 1 : 0;

          const flat1H = (baseLam + baseMu) * 0.43;
          const flat2H = (baseLam + baseMu) * 0.57;
          const computeHsh2 = (m1: number, m2: number) => {
            let p1 = 0, p2 = 0, pEq = 0;
            for (let g1 = 0; g1 <= 7; g1++) {
              const pg1 = poissonProb(m1, g1);
              for (let g2 = 0; g2 <= 7; g2++) {
                const j = pg1 * poissonProb(m2, g2);
                if (g2 > g1) p2 += j; else if (g1 > g2) p1 += j; else pEq += j;
              }
            }
            const s = p1 + p2 + pEq;
            return { p2: p2 / s, pFhO05: 1 - Math.exp(-m1) };
          };
          const flatPred = computeHsh2(flat1H, flat2H);

          for (const kh of HALVES_KS) {
            const h1 = currentDecayedRate(team1HGoals.get(m.home_team_id), tsMs, base1H, kh);
            const a1 = currentDecayedRate(team1HGoals.get(m.away_team_id), tsMs, base1H, kh);
            const h2 = currentDecayedRate(team2HGoals.get(m.home_team_id), tsMs, base2H, kh);
            const a2 = currentDecayedRate(team2HGoals.get(m.away_team_id), tsMs, base2H, kh);

            const sep1H = Math.max(0.1, h1Mean * (h1.forRate / base1H) * (a1.againstRate / base1H))
                        + Math.max(0.1, a1Mean * (a1.forRate / base1H) * (h1.againstRate / base1H));
            const sep2H = Math.max(0.1, h2Mean * (h2.forRate / base2H) * (a2.againstRate / base2H))
                        + Math.max(0.1, a2Mean * (a2.forRate / base2H) * (h2.againstRate / base2H));
            const sepPred = computeHsh2(sep1H, sep2H);

            halvesKSweep[kh].n++;
            halvesKSweep[kh].sepHshBrier += (sepPred.p2 - actHsh2) ** 2;
            halvesKSweep[kh].flatHshBrier += (flatPred.p2 - actHsh2) ** 2;
            halvesKSweep[kh].sepFhBrier += (sepPred.pFhO05 - actFh05) ** 2;
            halvesKSweep[kh].flatFhBrier += (flatPred.pFhO05 - actFh05) ** 2;
          }
        }
      }

      // Corners held-out evaluation (NegBinomial + Corners FOR & AGAINST vs Poisson & Baseline)
      if (lCfg.corners && m.home_corners !== null && m.away_corners !== null) {
        const cMeanSide = lCfg.corners.avgTotalCorners / 2;
        const hc = currentDecayedRate(teamCorners.get(m.home_team_id), tsMs, cMeanSide, K_CORNERS);
        const ac = currentDecayedRate(teamCorners.get(m.away_team_id), tsMs, cMeanSide, K_CORNERS);
        if (hc.matches >= 10 && ac.matches >= 10) {
          const expHC = lCfg.corners.avgHomeCorners * (hc.forRate / cMeanSide) * (ac.againstRate / cMeanSide);
          const expAC = lCfg.corners.avgAwayCorners * (ac.forRate / cMeanSide) * (hc.againstRate / cMeanSide);
          const expTotalC = Math.max(4.5, Math.min(17.0, expHC + expAC));
          const alphaC = lCfg.corners.overdispersionAlpha;

          const actO95 = (m.home_corners + m.away_corners) > 9.5 ? 1 : 0;
          const pNb = nbOverProb(expTotalC, 9.5, alphaC, 30);
          const pPois = poisOverProb(expTotalC, 9.5);
          const pBase = lCfg.corners.o95Rate;

          cornersEvalN++;
          cornersNbBrier += (pNb - actO95) ** 2;
          cornersPoisBrier += (pPois - actO95) ** 2;
          cornersBaseBrier += (pBase - actO95) ** 2;
          cornersNbLl -= actO95 ? Math.log(pNb) : Math.log(1 - pNb);
          cornersPoisLl -= actO95 ? Math.log(pPois) : Math.log(1 - pPois);
        }
      }

      // Cards held-out evaluation (NegBinomial + Referee Shrinkage)
      if (lCfg.cards && m.home_yellow_cards !== null && m.away_yellow_cards !== null) {
        const totalC = m.home_yellow_cards + m.away_yellow_cards + (m.home_red_cards ?? 0) + (m.away_red_cards ?? 0);
        const actO45 = totalC > 4.5 ? 1 : 0;
        const cardMean = lCfg.cards.avgTotalCards;
        const alphaCards = lCfg.cards.overdispersionAlpha;
        const hCd = currentDecayedRate(teamCards.get(m.home_team_id), tsMs, cardMean / 2, K_CORNERS);
        const aCd = currentDecayedRate(teamCards.get(m.away_team_id), tsMs, cardMean / 2, K_CORNERS);
        const teamCardsRatio = ((hCd.forRate + hCd.againstRate + aCd.forRate + aCd.againstRate) / 2) / cardMean;

        if (m.referee && m.referee.trim().length > 0) {
          const refKey = `${comp}::${m.referee.trim().toLowerCase()}`;
          const rt = refTracker.get(refKey);
          for (const kRef of REF_KS) {
            const refShrunk = (rt && rt.wSum > 0)
              ? ((rt.gfSum * Math.exp(-DECAY_LAMBDA * Math.max(0, (tsMs - rt.lastMs) / DAY_MS)) + kRef * cardMean) / (rt.wSum * Math.exp(-DECAY_LAMBDA * Math.max(0, (tsMs - rt.lastMs) / DAY_MS)) + kRef))
              : cardMean;
            const muCardsRef = Math.max(1.5, Math.min(9.0, 0.5 * refShrunk + 0.5 * cardMean * teamCardsRatio));
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
          // Group 2 no referee: NegBinomial vs Poisson
          const muCardsBase = Math.max(1.5, Math.min(9.0, cardMean * (0.3 * teamCardsRatio + 0.7)));
          cardsNoRefEvalN++;
          cardsNoRefNbBrier += (nbOverProb(muCardsBase, 4.5, alphaCards, 20) - actO45) ** 2;
          cardsNoRefPoisBrier += (poisOverProb(muCardsBase, 4.5) - actO45) ** 2;
        }
      }
    }

    // Update all trackers strictly AFTER prediction evaluation
    if (!teamGoalsHome.has(m.home_team_id)) teamGoalsHome.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    if (!teamGoalsAway.has(m.away_team_id)) teamGoalsAway.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    if (!teamGoalsAll.has(m.home_team_id)) teamGoalsAll.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    if (!teamGoalsAll.has(m.away_team_id)) teamGoalsAll.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
    updateTracker(teamGoalsHome.get(m.home_team_id)!, tsMs, m.home_score, m.away_score);
    updateTracker(teamGoalsAway.get(m.away_team_id)!, tsMs, m.away_score, m.home_score);
    updateTracker(teamGoalsAll.get(m.home_team_id)!, tsMs, m.home_score, m.away_score);
    updateTracker(teamGoalsAll.get(m.away_team_id)!, tsMs, m.away_score, m.home_score);

    if (m.home_half_time_score !== null && m.away_half_time_score !== null) {
      if (!team1HGoals.has(m.home_team_id)) team1HGoals.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!team1HGoals.has(m.away_team_id)) team1HGoals.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!team2HGoals.has(m.home_team_id)) team2HGoals.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!team2HGoals.has(m.away_team_id)) team2HGoals.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      const h2 = Math.max(0, m.home_score - m.home_half_time_score);
      const a2 = Math.max(0, m.away_score - m.away_half_time_score);
      updateTracker(team1HGoals.get(m.home_team_id)!, tsMs, m.home_half_time_score, m.away_half_time_score);
      updateTracker(team1HGoals.get(m.away_team_id)!, tsMs, m.away_half_time_score, m.home_half_time_score);
      updateTracker(team2HGoals.get(m.home_team_id)!, tsMs, h2, a2);
      updateTracker(team2HGoals.get(m.away_team_id)!, tsMs, a2, h2);
    }

    if (m.home_corners !== null && m.away_corners !== null) {
      if (!teamCorners.has(m.home_team_id)) teamCorners.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!teamCorners.has(m.away_team_id)) teamCorners.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      updateTracker(teamCorners.get(m.home_team_id)!, tsMs, m.home_corners, m.away_corners);
      updateTracker(teamCorners.get(m.away_team_id)!, tsMs, m.away_corners, m.home_corners);
    }

    if (m.home_yellow_cards !== null && m.away_yellow_cards !== null) {
      const hCards = m.home_yellow_cards + (m.home_red_cards ?? 0);
      const aCards = m.away_yellow_cards + (m.away_red_cards ?? 0);
      if (!teamCards.has(m.home_team_id)) teamCards.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!teamCards.has(m.away_team_id)) teamCards.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      updateTracker(teamCards.get(m.home_team_id)!, tsMs, hCards, aCards);
      updateTracker(teamCards.get(m.away_team_id)!, tsMs, aCards, hCards);

      if (m.referee && m.referee.trim().length > 0) {
        const refKey = `${comp}::${m.referee.trim().toLowerCase()}`;
        if (!refTracker.has(refKey)) refTracker.set(refKey, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
        updateTracker(refTracker.get(refKey)!, tsMs, hCards + aCards, 0);
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

    // Test league-centered residuals (and raw draws) so cross-league base rates never bias the test
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

  // Compute derby card multiplier if statistically significant (p < 0.05)
  const derbyMeanCardsBase = 4.2; // just for percentage scaling vs league average
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
    leagues: leaguesOutput,
  };

  const outPath = path.join(process.cwd(), 'src/lib/prediction/calibratedParams.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

  console.log('====================================================================');
  console.log('EMPIRICAL CALIBRATION, H2H ABLATION & DERBY SIGNIFICANCE (FROM DB)');
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

  console.log('\n--- 2. PER-LEAGUE COVERAGE & CALIBRATED PARAMETERS ---');
  for (const comp of Object.keys(leaguesOutput).sort()) {
    const l = leaguesOutput[comp];
    console.log(
      `${comp.padEnd(4)} | grp=${l.leagueGroup.padEnd(16)} | N_FT=${String(l.goals.sampleSize).padStart(4)} rho=${l.goals.dixonColesRho.toFixed(3)} avgG=${l.goals.avgGoals.toFixed(2)}` +
      ` | HT=${l.halves ? `${l.halves.sampleSize} (1H=${(l.halves.firstHalfGoalShare * 100).toFixed(1)}%)` : 'DISABLED'}` +
      ` | Corners=${l.corners ? `${l.corners.sampleSize} (mu=${l.corners.avgTotalCorners.toFixed(2)}, alpha=${l.corners.overdispersionAlpha.toFixed(4)})` : 'DISABLED'}` +
      ` | Cards=${l.cards ? `${l.cards.sampleSize} (mu=${l.cards.avgTotalCards.toFixed(2)}, alpha=${l.cards.overdispersionAlpha.toFixed(4)})` : 'DISABLED'}` +
      ` | Ref=${l.capabilities.refereeSampleSize} | AH_Odds=${ahCountByLeague.get(comp) || 0}`
    );
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
