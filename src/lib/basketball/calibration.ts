// CALIBRALL: Basketball Causal Calibration (Platt + Isotonic PAV) & Walk-Forward Backtest
// Strictly chronological out-of-sample evaluation. Zero look-ahead leakage.

import { BasketballLeague, BasketballMarketCategory } from './markets';
import { StoredBbGame } from './store';
import {
  createLeagueState,
  projectBasketballGame,
  updateLeagueStateWithGame,
  getDistributionForCategory,
  computeNormalOverUnder,
  normCdf,
} from './model';

export interface PlattParams {
  a: number;
  b: number;
}

export interface IsotonicPoint {
  pRaw: number;
  pCal: number;
  count: number;
}

export interface CalibrationBinRow {
  binRange: string;
  binCenter: number;
  predictedProbMean: number;
  observedFrequency: number;
  sampleCount: number;
}

export interface FamilyBacktestReport {
  league: BasketballLeague;
  marketCategory: BasketballMarketCategory;
  sampleSize: number;
  rawBrier: number;
  calibratedBrier: number;
  baselineBrier: number;
  brierDiffVsBaseline: number; // negative = model better
  rawLogLoss: number;
  calibratedLogLoss: number;
  baselineLogLoss: number;
  logLossDiffVsBaseline: number; // negative = model better
  ece: number;
  hitRateAt60: number | null;
  sampleAt60: number;
  passedBaseline: boolean;
  calibratorType: 'platt' | 'isotonic' | 'raw';
  platt: PlattParams;
  isotonicCurve: IsotonicPoint[];
  calibrationTable: CalibrationBinRow[];
  gateAction: 'ALLOW_TIERS' | 'SPECULATIVE_ONLY';
}

export interface LeagueWalkForwardSummary {
  league: BasketballLeague;
  totalGamesAnalyzed: number;
  evaluatedGames: number;
  abstainedNeedsHistoryGames: number;
  h1EvaluatedGames: number;
  empiricalLeagueStats: {
    regTeamMean: number;
    homeAdv: number;
    regVarH: number;
    regVarA: number;
    regCovHA: number;
    otMeanTotal: number;
    h1Share: number;
    h1CovHA: number;
  };
  families: FamilyBacktestReport[];
}

export interface CalibratedBasketballParamsFile {
  generatedAt: string;
  modelVersion: string;
  totalsOnly: boolean;
  leagues: Record<BasketballLeague, LeagueWalkForwardSummary>;
}

const ALL_CATEGORIES: BasketballMarketCategory[] = [
  'game_total',
  'home_total',
  'away_total',
  'h1_game_total',
  'h1_team_total',
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function logit(p: number): number {
  const cp = clamp(p, 0.002, 0.998);
  return Math.log(cp / (1 - cp));
}

function sigmoid(z: number): number {
  if (z > 30) return 1 - 1e-12;
  if (z < -30) return 1e-12;
  return 1 / (1 + Math.exp(-z));
}

export function computeBrier(p: number, y: 0 | 1): number {
  const diff = p - y;
  return diff * diff;
}

export function computeLogLoss(p: number, y: 0 | 1): number {
  const cp = clamp(p, 0.001, 0.999);
  return -(y * Math.log(cp) + (1 - y) * Math.log(1 - cp));
}

/**
 * Fits L2-regularized Platt logistic scaling: P_cal = sigmoid(a * logit(p) + b)
 */
export function fitPlattCalibrator(pairs: Array<{ p: number; y: 0 | 1 }>): PlattParams {
  if (pairs.length < 40) {
    return { a: 1, b: 0 };
  }
  let a = 1.0;
  let b = 0.0;
  const reg = 0.05;

  for (let iter = 0; iter < 20; iter++) {
    let g0 = reg * (a - 1.0);
    let g1 = reg * b;
    let h00 = reg;
    let h01 = 0;
    let h11 = reg;

    for (let i = 0; i < pairs.length; i++) {
      const x = logit(pairs[i].p);
      const y = pairs[i].y;
      const q = sigmoid(a * x + b);
      const w = q * (1 - q);
      const diff = q - y;
      g0 += diff * x;
      g1 += diff;
      h00 += w * x * x;
      h01 += w * x;
      h11 += w;
    }

    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-10) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (-h01 * g0 + h00 * g1) / det;
    a = clamp(a - da, 0.15, 3.0);
    b = clamp(b - db, -1.5, 1.5);
    if (Math.abs(da) < 1e-5 && Math.abs(db) < 1e-5) break;
  }

  return {
    a: Math.round(a * 10000) / 10000,
    b: Math.round(b * 10000) / 10000,
  };
}

export function applyPlattCalibrator(p: number, params: PlattParams): number {
  return clamp(sigmoid(params.a * logit(p) + params.b), 0.005, 0.995);
}

/**
 * Fits causal Pool-Adjacent-Violators (PAV) Isotonic Regression over 2%-wide histogram bins.
 */
export function fitIsotonicCalibrator(pairs: Array<{ p: number; y: 0 | 1 }>): IsotonicPoint[] {
  if (pairs.length < 80) {
    return [
      { pRaw: 0.05, pCal: 0.05, count: 0 },
      { pRaw: 0.5, pCal: 0.5, count: 0 },
      { pRaw: 0.95, pCal: 0.95, count: 0 },
    ];
  }

  const numBins = 40;
  const binCounts = new Array<number>(numBins).fill(0);
  const binY = new Array<number>(numBins).fill(0);
  const binX = new Array<number>(numBins).fill(0);

  for (const row of pairs) {
    const p = clamp(row.p, 0.001, 0.999);
    const idx = Math.min(numBins - 1, Math.max(0, Math.floor(p * numBins)));
    binCounts[idx] += 1;
    binY[idx] += row.y;
    binX[idx] += p;
  }

  // Build non-empty PAV blocks with small Bayesian Laplace smoothing toward bin center
  const blocks: Array<{ xSum: number; ySum: number; w: number }> = [];
  for (let i = 0; i < numBins; i++) {
    if (binCounts[i] === 0) continue;
    const center = (i + 0.5) / numBins;
    // Shrink tiny bins mildly so isolated bins never jump to 0 or 1
    const priorW = 2.0;
    blocks.push({
      xSum: binX[i] + priorW * center,
      ySum: binY[i] + priorW * center,
      w: binCounts[i] + priorW,
    });

    while (blocks.length >= 2) {
      const last = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (prev.ySum / prev.w > last.ySum / last.w) {
        prev.xSum += last.xSum;
        prev.ySum += last.ySum;
        prev.w += last.w;
        blocks.pop();
      } else {
        break;
      }
    }
  }

  return blocks.map((b) => ({
    pRaw: Math.round((b.xSum / b.w) * 10000) / 10000,
    pCal: Math.round(clamp(b.ySum / b.w, 0.01, 0.99) * 10000) / 10000,
    count: Math.max(0, Math.round(b.w - 2)),
  }));
}

export function applyIsotonicCalibrator(p: number, curve: IsotonicPoint[]): number {
  const cp = clamp(p, 0.005, 0.995);
  if (!curve || curve.length === 0) return cp;
  if (curve.length === 1) return clamp(curve[0].pCal, 0.01, 0.99);
  if (cp <= curve[0].pRaw) return clamp(curve[0].pCal, 0.01, 0.99);
  const last = curve[curve.length - 1];
  if (cp >= last.pRaw) return clamp(last.pCal, 0.01, 0.99);

  for (let i = 1; i < curve.length; i++) {
    if (cp <= curve[i].pRaw) {
      const left = curve[i - 1];
      const right = curve[i];
      const span = Math.max(1e-6, right.pRaw - left.pRaw);
      const t = (cp - left.pRaw) / span;
      return clamp(left.pCal + t * (right.pCal - left.pCal), 0.01, 0.99);
    }
  }
  return clamp(last.pCal, 0.01, 0.99);
}

export function buildCalibrationBuckets(
  samples: Array<{ prob: number; y: 0 | 1 }>
): { buckets: CalibrationBinRow[]; ece: number } {
  const bins: Array<{ pSum: number; ySum: number; n: number; low: number; high: number }> = [];
  for (let b = 0; b < 10; b++) {
    bins.push({ pSum: 0, ySum: 0, n: 0, low: b * 0.1, high: (b + 1) * 0.1 });
  }

  for (const s of samples) {
    const p = clamp(s.prob, 0.001, 0.999);
    const idx = Math.min(9, Math.max(0, Math.floor(p * 10)));
    bins[idx].pSum += p;
    bins[idx].ySum += s.y;
    bins[idx].n += 1;
  }

  let ece = 0;
  const total = Math.max(1, samples.length);
  const rows: CalibrationBinRow[] = [];

  for (const bin of bins) {
    const center = Math.round(((bin.low + bin.high) * 0.5) * 100) / 100;
    const pMean = bin.n > 0 ? bin.pSum / bin.n : center;
    const obsFreq = bin.n > 0 ? bin.ySum / bin.n : center;
    if (bin.n > 0) {
      ece += (bin.n / total) * Math.abs(pMean - obsFreq);
    }
    rows.push({
      binRange: `${bin.low.toFixed(1)} to ${bin.high.toFixed(1)}`,
      binCenter: center,
      predictedProbMean: Math.round(pMean * 10000) / 10000,
      observedFrequency: Math.round(obsFreq * 10000) / 10000,
      sampleCount: bin.n,
    });
  }

  return { buckets: rows, ece: Math.round(ece * 10000) / 10000 };
}

interface NaiveStatsTracker {
  mean: number;
  m2: number;
  n: number;
}

function createNaiveTracker(defaultMean: number, defaultStd: number): NaiveStatsTracker {
  return {
    mean: defaultMean,
    m2: defaultStd * defaultStd * 20,
    n: 20,
  };
}

function getNaiveMeanStd(t: NaiveStatsTracker): { mean: number; std: number } {
  return {
    mean: t.mean,
    std: Math.sqrt(Math.max(9, t.m2 / Math.max(1, t.n - 1))),
  };
}

function updateNaiveTracker(t: NaiveStatsTracker, val: number) {
  t.n += 1;
  // Use slow-decaying EWMA variance + expanding-style mean capped at 500 games window so naive tracks modern era fairly
  const alpha = 1 / Math.min(400, t.n);
  const delta = val - t.mean;
  t.mean += alpha * delta;
  const oldVar = t.m2 / Math.max(1, t.n - 1);
  const newVar = (1 - alpha) * oldVar + alpha * delta * (val - t.mean);
  t.m2 = newVar * Math.max(1, t.n - 1);
}

/**
 * Runs a strictly causal walk-forward backtest for one league across all 5 authorized market families.
 */
export function runLeagueWalkForwardBacktest(
  league: BasketballLeague,
  finishedGamesChrono: StoredBbGame[]
): LeagueWalkForwardSummary {
  const games = [...finishedGamesChrono]
    .filter((g) => g.league === league && g.status === 'FINISHED' && g.home_pts !== null && g.away_pts !== null)
    .sort((a, b) => a.game_date.localeCompare(b.game_date) || (a.kickoff_utc || '').localeCompare(b.kickoff_utc || '') || a.id.localeCompare(b.id));

  const state = createLeagueState(league);

  const defaultTeamMean = league === 'NBA' ? 113 : league === 'EUROLEAGUE' ? 81 : 72;
  const defaultTeamStd = league === 'NBA' ? 12.5 : league === 'EUROLEAGUE' ? 11.0 : 11.2;
  const naiveTrackers: Record<BasketballMarketCategory, NaiveStatsTracker> = {
    game_total: createNaiveTracker(defaultTeamMean * 2, defaultTeamStd * 1.55),
    home_total: createNaiveTracker(defaultTeamMean + 1.5, defaultTeamStd),
    away_total: createNaiveTracker(defaultTeamMean - 1.5, defaultTeamStd),
    h1_game_total: createNaiveTracker(defaultTeamMean, defaultTeamStd * 1.05),
    h1_team_total: createNaiveTracker(defaultTeamMean * 0.5, defaultTeamStd * 0.72),
  };

  interface EvalObs {
    rawProb: number;
    plattProb: number;
    isoProb: number;
    naiveProb: number;
    y: 0 | 1;
  }

  const obsByCat: Record<BasketballMarketCategory, EvalObs[]> = {
    game_total: [],
    home_total: [],
    away_total: [],
    h1_game_total: [],
    h1_team_total: [],
  };

  const causalHistoryByCat: Record<BasketballMarketCategory, Array<{ p: number; y: 0 | 1 }>> = {
    game_total: [],
    home_total: [],
    away_total: [],
    h1_game_total: [],
    h1_team_total: [],
  };

  const currentPlatt: Record<BasketballMarketCategory, PlattParams> = {
    game_total: { a: 1, b: 0 },
    home_total: { a: 1, b: 0 },
    away_total: { a: 1, b: 0 },
    h1_game_total: { a: 1, b: 0 },
    h1_team_total: { a: 1, b: 0 },
  };
  const currentIso: Record<BasketballMarketCategory, IsotonicPoint[]> = {
    game_total: [],
    home_total: [],
    away_total: [],
    h1_game_total: [],
    h1_team_total: [],
  };

  let evaluatedGames = 0;
  let abstainedNeedsHistoryGames = 0;
  let h1EvaluatedGames = 0;

  for (const game of games) {
    const homePts = Number(game.home_pts);
    const awayPts = Number(game.away_pts);
    const hasH1 = game.h1_home !== null && game.h1_away !== null;
    const h1Home = hasH1 ? Number(game.h1_home) : null;
    const h1Away = hasH1 ? Number(game.h1_away) : null;

    // 1. Project purely from PRIOR state
    const proj = projectBasketballGame(state, game);

    if (proj.needsHistory) {
      abstainedNeedsHistoryGames += 1;
    } else {
      evaluatedGames += 1;
      if (hasH1 && !proj.needsH1History) {
        h1EvaluatedGames += 1;
      }

      // Evaluate full-game categories on causal half-point benchmark line centered on naive league prior
      const evalEntry = (
        cat: BasketballMarketCategory,
        side: 'game' | 'home' | 'away',
        actualValue: number
      ) => {
        const dist = getDistributionForCategory(proj, cat, side);
        if (dist.abstained) return;

        const naive = getNaiveMeanStd(naiveTrackers[cat]);
        // Half-point line placed cleanly at prior league baseline (zero look-ahead)
        const testLine = Math.round(naive.mean - 0.5) + 0.5;
        const y: 0 | 1 = actualValue > testLine ? 1 : 0;

        const modelOu = computeNormalOverUnder(dist.mean, dist.std, testLine);
        const rawProb = modelOu.pOver;
        const naiveProb = clamp(1 - normCdf((testLine - naive.mean) / naive.std), 0.001, 0.999);

        // Refit causal calibrators strictly from PRIOR observations every 250 samples
        const hist = causalHistoryByCat[cat];
        if (hist.length >= 150 && hist.length % 250 === 0) {
          currentPlatt[cat] = fitPlattCalibrator(hist);
          currentIso[cat] = fitIsotonicCalibrator(hist);
        }

        const plattProb = hist.length >= 150 ? applyPlattCalibrator(rawProb, currentPlatt[cat]) : rawProb;
        const isoProb =
          hist.length >= 150 && currentIso[cat].length >= 2
            ? applyIsotonicCalibrator(rawProb, currentIso[cat])
            : rawProb;

        obsByCat[cat].push({
          rawProb,
          plattProb,
          isoProb,
          naiveProb,
          y,
        });
        hist.push({ p: rawProb, y });
      };

      evalEntry('game_total', 'game', homePts + awayPts);
      evalEntry('home_total', 'home', homePts);
      evalEntry('away_total', 'away', awayPts);

      if (hasH1 && h1Home !== null && h1Away !== null && !proj.needsH1History) {
        evalEntry('h1_game_total', 'game', h1Home + h1Away);
        evalEntry('h1_team_total', 'home', h1Home);
        evalEntry('h1_team_total', 'away', h1Away);
      }
    }

    // 2. Strictly AFTER prediction, update naive baselines & model state with true outcome
    updateNaiveTracker(naiveTrackers.game_total, homePts + awayPts);
    updateNaiveTracker(naiveTrackers.home_total, homePts);
    updateNaiveTracker(naiveTrackers.away_total, awayPts);
    if (hasH1 && h1Home !== null && h1Away !== null) {
      updateNaiveTracker(naiveTrackers.h1_game_total, h1Home + h1Away);
      updateNaiveTracker(naiveTrackers.h1_team_total, h1Home);
      updateNaiveTracker(naiveTrackers.h1_team_total, h1Away);
    }

    updateLeagueStateWithGame(state, game, proj);
  }

  // Summarize per category
  const families: FamilyBacktestReport[] = ALL_CATEGORIES.map((cat) => {
    const obs = obsByCat[cat];
    const n = obs.length;
    if (n === 0) {
      return {
        league,
        marketCategory: cat,
        sampleSize: 0,
        rawBrier: 0.25,
        calibratedBrier: 0.25,
        baselineBrier: 0.25,
        brierDiffVsBaseline: 0,
        rawLogLoss: 0.6931,
        calibratedLogLoss: 0.6931,
        baselineLogLoss: 0.6931,
        logLossDiffVsBaseline: 0,
        ece: 0,
        hitRateAt60: null,
        sampleAt60: 0,
        passedBaseline: false,
        calibratorType: 'raw',
        platt: { a: 1, b: 0 },
        isotonicCurve: [],
        calibrationTable: [],
        gateAction: 'SPECULATIVE_ONLY',
      };
    }

    let rawBrierSum = 0;
    let plattBrierSum = 0;
    let isoBrierSum = 0;
    let baseBrierSum = 0;
    let rawLlSum = 0;
    let plattLlSum = 0;
    let isoLlSum = 0;
    let baseLlSum = 0;

    for (const r of obs) {
      rawBrierSum += computeBrier(r.rawProb, r.y);
      plattBrierSum += computeBrier(r.plattProb, r.y);
      isoBrierSum += computeBrier(r.isoProb, r.y);
      baseBrierSum += computeBrier(r.naiveProb, r.y);

      rawLlSum += computeLogLoss(r.rawProb, r.y);
      plattLlSum += computeLogLoss(r.plattProb, r.y);
      isoLlSum += computeLogLoss(r.isoProb, r.y);
      baseLlSum += computeLogLoss(r.naiveProb, r.y);
    }

    const rawBrier = rawBrierSum / n;
    const plattBrier = plattBrierSum / n;
    const isoBrier = isoBrierSum / n;
    const baseBrier = baseBrierSum / n;

    const rawLl = rawLlSum / n;
    const plattLl = plattLlSum / n;
    const isoLl = isoLlSum / n;
    const baseLl = baseLlSum / n;

    // Choose best causal calibrator among raw / platt / isotonic (using causal out-of-sample Log Loss & Brier)
    let chosenType: 'platt' | 'isotonic' | 'raw' = 'raw';
    let bestBrier = rawBrier;
    let bestLl = rawLl;

    if (plattBrier <= bestBrier + 1e-5 && plattLl <= bestLl + 1e-4) {
      chosenType = 'platt';
      bestBrier = plattBrier;
      bestLl = plattLl;
    }
    if (isoBrier < bestBrier - 1e-4 && isoLl < bestLl - 1e-4) {
      chosenType = 'isotonic';
      bestBrier = isoBrier;
      bestLl = isoLl;
    }

    const chosenProbs = obs.map((r) => ({
      prob: chosenType === 'platt' ? r.plattProb : chosenType === 'isotonic' ? r.isoProb : r.rawProb,
      y: r.y,
    }));

    // Track actual directional hit rate when confident side >= 60%
    let winsAt60 = 0;
    let nAt60 = 0;
    for (const s of chosenProbs) {
      const pSide = Math.max(s.prob, 1 - s.prob);
      if (pSide >= 0.60) {
        nAt60 += 1;
        const pickedOver = s.prob >= 0.5;
        if ((pickedOver && s.y === 1) || (!pickedOver && s.y === 0)) {
          winsAt60 += 1;
        }
      }
    }

    const { buckets, ece } = buildCalibrationBuckets(chosenProbs);
    const passedBaseline = n >= 100 && bestBrier < baseBrier && bestLl < baseLl;

    const finalPlatt = fitPlattCalibrator(causalHistoryByCat[cat]);
    const finalIso = fitIsotonicCalibrator(causalHistoryByCat[cat]);

    return {
      league,
      marketCategory: cat,
      sampleSize: n,
      rawBrier: Math.round(rawBrier * 10000) / 10000,
      calibratedBrier: Math.round(bestBrier * 10000) / 10000,
      baselineBrier: Math.round(baseBrier * 10000) / 10000,
      brierDiffVsBaseline: Math.round((bestBrier - baseBrier) * 10000) / 10000,
      rawLogLoss: Math.round(rawLl * 10000) / 10000,
      calibratedLogLoss: Math.round(bestLl * 10000) / 10000,
      baselineLogLoss: Math.round(baseLl * 10000) / 10000,
      logLossDiffVsBaseline: Math.round((bestLl - baseLl) * 10000) / 10000,
      ece,
      hitRateAt60: nAt60 > 0 ? Math.round((winsAt60 / nAt60) * 10000) / 10000 : null,
      sampleAt60: nAt60,
      passedBaseline,
      calibratorType: chosenType,
      platt: finalPlatt,
      isotonicCurve: finalIso,
      calibrationTable: buckets,
      gateAction: passedBaseline ? 'ALLOW_TIERS' : 'SPECULATIVE_ONLY',
    };
  });

  const otMeanTotal =
    state.otGamesCount > 0 ? Math.round((state.otTotalPtsSum / state.otGamesCount) * 100) / 100 : 1.2;

  return {
    league,
    totalGamesAnalyzed: games.length,
    evaluatedGames,
    abstainedNeedsHistoryGames,
    h1EvaluatedGames,
    empiricalLeagueStats: {
      regTeamMean: Math.round(state.ewmaRegTeamMean * 100) / 100,
      homeAdv: Math.round(state.ewmaHomeAdv * 100) / 100,
      regVarH: Math.round(state.ewmaRegVarH * 100) / 100,
      regVarA: Math.round(state.ewmaRegVarA * 100) / 100,
      regCovHA: Math.round(state.ewmaRegCovHA * 100) / 100,
      otMeanTotal,
      h1Share: Math.round(state.ewmaH1Share * 10000) / 10000,
      h1CovHA: Math.round(state.ewmaH1CovHA * 100) / 100,
    },
    families,
  };
}
