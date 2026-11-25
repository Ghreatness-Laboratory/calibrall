// CALIBRALL: Basketball Team Points, Tempo, Covariance & First-Half Statistical Engine
// Strictly isolated from football. Zero fake data, zero invented lines.
// Models regulation scoring + empirical OT adjustment (full game only) + H1 share/variance.

import { BasketballLeague, BasketballMarketCategory } from './markets';
import { StoredBbGame } from './store';

export interface LeagueHyperparams {
  halfLifeDays: number;
  seasonCarryover: number;
  kOff: number;
  kDef: number;
  kPace: number;
  kVar: number;
  kH1Share: number;
  minGames: number;
  minRecentGames: number; // within 240 days so stale/inactive teams abstain
  minH1Games: number;
  paceInteractWeight: number;
  applyRest: boolean;
  defaultRegTeamMean: number;
  defaultHomeAdv: number;
  defaultTeamVar: number;
  defaultCov: number;
  defaultH1Share: number;
  defaultH1TeamVar: number;
  defaultH1Cov: number;
  defaultOtMean: number;
  defaultOtVar: number;
}

export const LEAGUE_HYPERPARAMS: Record<BasketballLeague, LeagueHyperparams> = {
  NBA: {
    halfLifeDays: 42,
    seasonCarryover: 0.30,
    kOff: 7.5,
    kDef: 7.5,
    kPace: 10.0,
    kVar: 18.0,
    kH1Share: 16.0,
    minGames: 5,
    minRecentGames: 3,
    minH1Games: 4,
    paceInteractWeight: 0.35,
    applyRest: true,
    defaultRegTeamMean: 112.5,
    defaultHomeAdv: 2.6,
    defaultTeamVar: 144.0,
    defaultCov: 24.0,
    defaultH1Share: 0.503,
    defaultH1TeamVar: 68.0,
    defaultH1Cov: 10.0,
    defaultOtMean: 1.25,
    defaultOtVar: 26.0,
  },
  NCAAB: {
    // Hard shrinkage for 368 D1 programs with wide strength spread and high roster turnover
    halfLifeDays: 32,
    seasonCarryover: 0.16,
    kOff: 10.0,
    kDef: 10.0,
    kPace: 12.0,
    kVar: 22.0,
    kH1Share: 18.0,
    minGames: 6,
    minRecentGames: 3,
    minH1Games: 5,
    paceInteractWeight: 0.30,
    applyRest: false,
    defaultRegTeamMean: 71.5,
    defaultHomeAdv: 3.4,
    defaultTeamVar: 118.0,
    defaultCov: 16.0,
    defaultH1Share: 0.480,
    defaultH1TeamVar: 52.0,
    defaultH1Cov: 7.0,
    defaultOtMean: 1.05,
    defaultOtVar: 20.0,
  },
  EUROLEAGUE: {
    // Strictly 40-minute European baseline separated from NBA
    halfLifeDays: 45,
    seasonCarryover: 0.28,
    kOff: 7.5,
    kDef: 7.5,
    kPace: 10.0,
    kVar: 18.0,
    kH1Share: 16.0,
    minGames: 5,
    minRecentGames: 3,
    minH1Games: 4,
    paceInteractWeight: 0.30,
    applyRest: true,
    defaultRegTeamMean: 80.5,
    defaultHomeAdv: 3.2,
    defaultTeamVar: 104.0,
    defaultCov: 14.0,
    defaultH1Share: 0.495,
    defaultH1TeamVar: 48.0,
    defaultH1Cov: 6.0,
    defaultOtMean: 1.15,
    defaultOtVar: 22.0,
  },
};

export interface TeamRatingState {
  teamId: string;
  lastSeason: string;
  lastGameDate: string;
  totalGames: number;
  h1Games: number;
  recentGames240d: number;
  recentGameDates: string[]; // track dates for sliding 240d window cleanly
  lastUpdateDaysEpoch: number;
  wSum: number;
  offWeightedSum: number;
  defWeightedSum: number;
  paceWeightedSum: number;
  varSum: number;
  varWeight: number;
  h1Weight: number;
  h1OffRatioSum: number;
  h1DefRatioSum: number;
  h1VarSum: number;
}

export interface LeagueBaselineState {
  league: BasketballLeague;
  gamesProcessed: number;
  regGamesProcessed: number;
  nonNeutralGames: number;
  h1GamesProcessed: number;
  ewmaRegTeamMean: number;
  ewmaHomeAdv: number;
  // Exponentially smoothed residual moments
  ewmaRegVarH: number;
  ewmaRegVarA: number;
  ewmaRegCovHA: number;
  ewmaWeight: number;
  // OT empirical adjustment (full game only)
  otTotalPtsSum: number;
  otTotalSqSum: number;
  otGamesCount: number;
  // H1 share & empirical covariance (strictly non-null h1 games, 0 OT)
  ewmaH1Share: number;
  ewmaH1VarH: number;
  ewmaH1VarA: number;
  ewmaH1CovHA: number;
  ewmaH1Weight: number;
  // Empirical B2B scoring adjustment (NBA / EuroLeague)
  b2bResSum: number;
  b2bCount: number;
  // Team map
  teams: Map<string, TeamRatingState>;
  // Head-to-head finished history keyed by sorted pair idA|idB
  h2hHistory: Map<string, Array<{ date: string; total: number; h1Total: number | null }>>;
}

export interface GameProjection {
  gameId: string;
  league: BasketballLeague;
  season: string;
  gameDate: string;
  neutral: boolean;
  needsHistory: boolean;
  needsH1History: boolean;
  abstentionReason: string | null;
  h1AbstentionReason: string | null;
  // Sample counts
  homeGamesPlayed: number;
  awayGamesPlayed: number;
  homeH1GamesPlayed: number;
  awayH1GamesPlayed: number;
  homeRestDays: number | null;
  awayRestDays: number | null;
  homeIsB2B: boolean;
  awayIsB2B: boolean;
  // Team ratings (raw shrunk)
  leagueRegTeamMean: number;
  homeOffDelta: number;
  homeDefDelta: number;
  awayOffDelta: number;
  awayDefDelta: number;
  homeAvgScored: number;
  homeAvgAllowed: number;
  awayAvgScored: number;
  awayAvgAllowed: number;
  homePaceDelta: number;
  awayPaceDelta: number;
  paceAdjustment: number;
  homeAdvantagePts: number;
  restAdjustmentHome: number;
  restAdjustmentAway: number;
  otAdjustmentTotal: number;
  // Projected distributions
  homeRegMean: number;
  awayRegMean: number;
  homeMean: number;
  awayMean: number;
  gameTotalMean: number;
  homeStd: number;
  awayStd: number;
  gameTotalStd: number;
  teamCovariance: number;
  // First-half projected distributions (no OT)
  h1HomeMean: number;
  h1AwayMean: number;
  h1TotalMean: number;
  h1HomeStd: number;
  h1AwayStd: number;
  h1TotalStd: number;
  h1Covariance: number;
  h1ShareApplied: number;
  // H2H context
  h2hMeetings: number;
  h2hAvgTotal: number | null;
}

export interface LineOutcomeProbabilities {
  line: number;
  isIntegerLine: boolean;
  pOver: number;
  pUnder: number;
  pPush: number;
  pOverCond: number;
  pUnderCond: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function dateToEpochDays(ymd: string): number {
  const ms = Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * High-precision standard Normal CDF using Abramowitz & Stegun approximation (max error < 1.5e-7).
 */
export function normCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  if (x < -8) return 0;
  if (x > 8) return 1;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const y =
    1.0 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

export function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Computes Normal over/under/push probabilities with exact half-point & integer-line continuity treatment.
 */
export function computeNormalOverUnder(mean: number, std: number, line: number): LineOutcomeProbabilities {
  const safeStd = Math.max(2.0, std);
  const isIntegerLine = Math.abs(line - Math.round(line)) < 1e-6;

  if (!isIntegerLine) {
    // Half-point line (e.g. 220.5): zero push probability
    const z = (line - mean) / safeStd;
    const pUnder = clamp(normCdf(z), 0.001, 0.999);
    const pOver = clamp(1 - pUnder, 0.001, 0.999);
    return {
      line,
      isIntegerLine: false,
      pOver,
      pUnder,
      pPush: 0,
      pOverCond: pOver,
      pUnderCond: pUnder,
    };
  }

  // Integer line (e.g. 220.0): continuity-corrected intervals for discrete basketball points
  const zHigh = (line + 0.5 - mean) / safeStd;
  const zLow = (line - 0.5 - mean) / safeStd;
  const pUnder = clamp(normCdf(zLow), 0.001, 0.998);
  const pOver = clamp(1 - normCdf(zHigh), 0.001, 0.998);
  const pPush = clamp(1 - pOver - pUnder, 0, 0.25);
  const nonPush = Math.max(0.01, pOver + pUnder);
  return {
    line,
    isIntegerLine: true,
    pOver,
    pUnder,
    pPush,
    pOverCond: clamp(pOver / nonPush, 0.001, 0.999),
    pUnderCond: clamp(pUnder / nonPush, 0.001, 0.999),
  };
}

/**
 * Extracts true regulation points and overtime points from stored game totals & q_scores.
 * Returns null regulation splits if game had OT without quarter/half breakdown (never estimates).
 */
export function extractGameScoringSplits(game: StoredBbGame): {
  regHome: number;
  regAway: number;
  otHome: number;
  otAway: number;
  hasOt: boolean;
} | null {
  if (game.status !== 'FINISHED' || game.home_pts === null || game.away_pts === null) {
    return null;
  }
  const homePts = Number(game.home_pts);
  const awayPts = Number(game.away_pts);
  if (!Number.isFinite(homePts) || !Number.isFinite(awayPts) || homePts <= 0 || awayPts <= 0) {
    return null;
  }

  const regPeriods = game.league === 'NCAAB' ? 2 : 4;
  const otPeriods = Number(game.ot_periods) || 0;
  const q = game.q_scores;

  if (
    q &&
    Array.isArray(q.h) &&
    Array.isArray(q.a) &&
    q.h.length >= regPeriods &&
    q.a.length >= regPeriods
  ) {
    let regH = 0;
    let regA = 0;
    for (let i = 0; i < regPeriods; i++) {
      const vh = Number(q.h[i]);
      const va = Number(q.a[i]);
      if (!Number.isFinite(vh) || !Number.isFinite(va)) {
        regH = -1;
        break;
      }
      regH += vh;
      regA += va;
    }
    if (regH > 0 && regA > 0 && regH <= homePts && regA <= awayPts) {
      const otH = Math.max(0, homePts - regH);
      const otA = Math.max(0, awayPts - regA);
      return {
        regHome: regH,
        regAway: regA,
        otHome: otH,
        otAway: otA,
        hasOt: otPeriods > 0 || otH + otA > 0,
      };
    }
  }

  if (otPeriods === 0) {
    return {
      regHome: homePts,
      regAway: awayPts,
      otHome: 0,
      otAway: 0,
      hasOt: false,
    };
  }

  // OT occurred without q_scores breakdown: cannot separate regulation from OT honestly
  return null;
}

export function createLeagueState(league: BasketballLeague): LeagueBaselineState {
  const hp = LEAGUE_HYPERPARAMS[league];
  return {
    league,
    gamesProcessed: 0,
    regGamesProcessed: 0,
    nonNeutralGames: 0,
    h1GamesProcessed: 0,
    ewmaRegTeamMean: hp.defaultRegTeamMean,
    ewmaHomeAdv: hp.defaultHomeAdv,
    ewmaRegVarH: hp.defaultTeamVar,
    ewmaRegVarA: hp.defaultTeamVar,
    ewmaRegCovHA: hp.defaultCov,
    ewmaWeight: 0,
    otTotalPtsSum: 0,
    otTotalSqSum: 0,
    otGamesCount: 0,
    ewmaH1Share: hp.defaultH1Share,
    ewmaH1VarH: hp.defaultH1TeamVar,
    ewmaH1VarA: hp.defaultH1TeamVar,
    ewmaH1CovHA: hp.defaultH1Cov,
    ewmaH1Weight: 0,
    b2bResSum: 0,
    b2bCount: 0,
    teams: new Map(),
    h2hHistory: new Map(),
  };
}

function getLeaguePriorStats(state: LeagueBaselineState) {
  const hp = LEAGUE_HYPERPARAMS[state.league];
  const regTeamMean = state.ewmaRegTeamMean;
  const homeAdv = state.ewmaHomeAdv;
  const otTotalMean =
    state.otGamesCount >= 20
      ? clamp((state.otTotalPtsSum + 30 * hp.defaultOtMean) / (state.otGamesCount + 30), 0.1, 3.5)
      : hp.defaultOtMean;
  const otTotalVar =
    state.otGamesCount >= 20
      ? clamp((state.otTotalSqSum + 30 * hp.defaultOtVar) / (state.otGamesCount + 30) - otTotalMean * otTotalMean, 4, 80)
      : hp.defaultOtVar;
  const h1Share = clamp(state.ewmaH1Share, 0.42, 0.56);
  const b2bPenalty =
    hp.applyRest && state.b2bCount >= 20
      ? clamp((state.b2bResSum + 30 * -0.9) / (state.b2bCount + 30), -3.5, 0.5)
      : hp.applyRest
      ? -0.9
      : 0;

  return {
    regTeamMean,
    homeAdv,
    regVarH: state.ewmaRegVarH,
    regVarA: state.ewmaRegVarA,
    regCovHA: state.ewmaRegCovHA,
    otTotalMean,
    otTotalVar,
    otTeamVar: otTotalVar * 0.30,
    h1Share,
    h1VarH: state.ewmaH1VarH,
    h1VarA: state.ewmaH1VarA,
    h1CovHA: state.ewmaH1CovHA,
    b2bPenalty,
  };
}

function decayTeamToDate(team: TeamRatingState, targetEpochDays: number, targetSeason: string, hp: LeagueHyperparams) {
  if (team.lastUpdateDaysEpoch > 0 && targetEpochDays > team.lastUpdateDaysEpoch) {
    const dt = targetEpochDays - team.lastUpdateDaysEpoch;
    let factor = Math.pow(0.5, dt / hp.halfLifeDays);
    if (team.lastSeason && team.lastSeason !== targetSeason) {
      factor *= hp.seasonCarryover;
    }
    team.wSum *= factor;
    team.offWeightedSum *= factor;
    team.defWeightedSum *= factor;
    team.paceWeightedSum *= factor;
    team.varSum *= factor;
    team.varWeight *= factor;
    team.h1Weight *= factor;
    team.h1OffRatioSum *= factor;
    team.h1DefRatioSum *= factor;
    team.h1VarSum *= factor;
    team.lastUpdateDaysEpoch = targetEpochDays;
    team.lastSeason = targetSeason;
  }
}

function getEffectiveTeamSnapshot(
  team: TeamRatingState | undefined,
  targetDate: string,
  targetSeason: string,
  hp: LeagueHyperparams,
  leagueRegMean: number,
  leagueTeamVar: number,
  leagueH1Share: number
) {
  if (!team) {
    return {
      totalGames: 0,
      recentGames240d: 0,
      h1Games: 0,
      restDays: null as number | null,
      isB2B: false,
      offDelta: 0,
      defDelta: 0,
      paceDelta: 0,
      shrunkVar: leagueTeamVar,
      h1OffShare: leagueH1Share,
      h1DefShare: leagueH1Share,
      avgScored: leagueRegMean,
      avgAllowed: leagueRegMean,
    };
  }

  const targetEpoch = dateToEpochDays(targetDate);
  const lastEpoch = dateToEpochDays(team.lastGameDate);
  const daysSince = targetEpoch > 0 && lastEpoch > 0 ? Math.max(0, targetEpoch - lastEpoch) : null;
  let decay = daysSince !== null && daysSince > 0 ? Math.pow(0.5, daysSince / hp.halfLifeDays) : 1;
  if (team.lastSeason && team.lastSeason !== targetSeason) {
    decay *= hp.seasonCarryover;
  }

  const effW = team.wSum * decay;
  const offDelta = (team.offWeightedSum * decay) / (effW + hp.kOff);
  const defDelta = (team.defWeightedSum * decay) / (effW + hp.kDef);
  const paceDelta = (team.paceWeightedSum * decay) / (effW + hp.kPace);

  const effVarW = team.varWeight * decay;
  const shrunkVar = (team.varSum * decay + hp.kVar * leagueTeamVar) / (effVarW + hp.kVar);

  const effH1W = team.h1Weight * decay;
  const h1OffShare = clamp(
    (team.h1OffRatioSum * decay + hp.kH1Share * leagueH1Share) / (effH1W + hp.kH1Share),
    0.40,
    0.58
  );
  const h1DefShare = clamp(
    (team.h1DefRatioSum * decay + hp.kH1Share * leagueH1Share) / (effH1W + hp.kH1Share),
    0.40,
    0.58
  );

  // Count already-finished games within past 240 days
  const cutoffEpoch = targetEpoch - 240;
  let recent240 = 0;
  for (let i = team.recentGameDates.length - 1; i >= 0; i--) {
    const e = dateToEpochDays(team.recentGameDates[i]);
    if (e >= cutoffEpoch && e <= targetEpoch) {
      recent240++;
    } else if (e < cutoffEpoch) {
      break;
    }
  }

  const restDays = daysSince !== null && daysSince > 0 && daysSince <= 14 ? daysSince - 1 : null;
  const isB2B = daysSince === 1;

  return {
    totalGames: team.totalGames,
    recentGames240d: recent240,
    h1Games: team.h1Games,
    restDays,
    isB2B,
    offDelta,
    defDelta,
    paceDelta,
    shrunkVar,
    h1OffShare,
    h1DefShare,
    avgScored: leagueRegMean + offDelta,
    avgAllowed: leagueRegMean + defDelta,
  };
}

/**
 * Predicts expected distributions for a game strictly from PRIOR state in LeagueBaselineState.
 */
export function projectBasketballGame(
  state: LeagueBaselineState,
  game: Pick<StoredBbGame, 'id' | 'league' | 'season' | 'game_date' | 'home_id' | 'away_id' | 'neutral'>
): GameProjection {
  const hp = LEAGUE_HYPERPARAMS[state.league];
  const prior = getLeaguePriorStats(state);

  const homeSnap = getEffectiveTeamSnapshot(
    state.teams.get(game.home_id),
    game.game_date,
    game.season,
    hp,
    prior.regTeamMean,
    prior.regVarH,
    prior.h1Share
  );
  const awaySnap = getEffectiveTeamSnapshot(
    state.teams.get(game.away_id),
    game.game_date,
    game.season,
    hp,
    prior.regTeamMean,
    prior.regVarA,
    prior.h1Share
  );

  const hasEnoughHome =
    homeSnap.totalGames >= hp.minGames && homeSnap.recentGames240d >= hp.minRecentGames;
  const hasEnoughAway =
    awaySnap.totalGames >= hp.minGames && awaySnap.recentGames240d >= hp.minRecentGames;
  const needsHistory = !hasEnoughHome || !hasEnoughAway;

  const hasEnoughH1 =
    !needsHistory &&
    homeSnap.h1Games >= hp.minH1Games &&
    awaySnap.h1Games >= hp.minH1Games;
  const needsH1History = !hasEnoughH1;

  let abstentionReason: string | null = null;
  if (needsHistory) {
    abstentionReason = `Needs history (home ${homeSnap.totalGames}/${hp.minGames}, away ${awaySnap.totalGames}/${hp.minGames} recent games)`;
  }
  let h1AbstentionReason: string | null = null;
  if (needsH1History) {
    h1AbstentionReason = needsHistory
      ? abstentionReason
      : `Needs history (1st half sample: home ${homeSnap.h1Games}/${hp.minH1Games}, away ${awaySnap.h1Games}/${hp.minH1Games})`;
  }

  const homeAdv = game.neutral ? 0 : prior.homeAdv;
  const halfHomeAdv = homeAdv * 0.5;

  // Multiplicative tempo/pace interaction term (zero-mean interaction when teams are average)
  const paceProduct = (homeSnap.paceDelta * awaySnap.paceDelta) / Math.max(40, prior.regTeamMean);
  const paceAdjustment = clamp(
    hp.paceInteractWeight * (paceProduct + 0.25 * (homeSnap.paceDelta + awaySnap.paceDelta)),
    -6.0,
    6.0
  );

  // Rest & B2B adjustment strictly for NBA and EuroLeague
  let restAdjHome = 0;
  let restAdjAway = 0;
  if (hp.applyRest) {
    if (homeSnap.isB2B) restAdjHome += prior.b2bPenalty;
    if (awaySnap.isB2B) restAdjAway += prior.b2bPenalty;
    // Small positive nudge when well-rested (>=3 days vs tired opponent on <=1 day)
    if (homeSnap.restDays !== null && awaySnap.restDays !== null) {
      const restDelta = clamp(homeSnap.restDays - awaySnap.restDays, -3, 3);
      if (Math.abs(restDelta) >= 2) {
        restAdjHome += restDelta * 0.22;
        restAdjAway -= restDelta * 0.22;
      }
    }
  }

  const homeRegMean = Math.max(
    30,
    prior.regTeamMean + halfHomeAdv + homeSnap.offDelta + awaySnap.defDelta + 0.5 * paceAdjustment + restAdjHome
  );
  const awayRegMean = Math.max(
    30,
    prior.regTeamMean - halfHomeAdv + awaySnap.offDelta + homeSnap.defDelta + 0.5 * paceAdjustment + restAdjAway
  );

  // Full game adds empirical league OT adjustment (regulation scoring + E[OT])
  const otTotalAdj = prior.otTotalMean;
  const homeMean = homeRegMean + 0.5 * otTotalAdj;
  const awayMean = awayRegMean + 0.5 * otTotalAdj;
  const gameTotalMean = homeMean + awayMean;

  // Variance & covariance across home/away scores
  const varH = clamp(0.65 * prior.regVarH + 0.35 * homeSnap.shrunkVar, 36, 360);
  const varA = clamp(0.65 * prior.regVarA + 0.35 * awaySnap.shrunkVar, 36, 360);
  const maxCov = 0.75 * Math.sqrt(varH * varA);
  const covHA = clamp(prior.regCovHA, -maxCov, maxCov);

  const homeStd = Math.sqrt(Math.max(16, varH + prior.otTeamVar));
  const awayStd = Math.sqrt(Math.max(16, varA + prior.otTeamVar));
  const gameTotalStd = Math.sqrt(Math.max(36, varH + varA + 2 * covHA + prior.otTotalVar));

  // 1st-Half projections (strictly NO overtime effect)
  const h1HomeShare = clamp(0.5 * homeSnap.h1OffShare + 0.5 * awaySnap.h1DefShare, 0.42, 0.56);
  const h1AwayShare = clamp(0.5 * awaySnap.h1OffShare + 0.5 * homeSnap.h1DefShare, 0.42, 0.56);

  const h1HomeMean = Math.max(15, homeRegMean * h1HomeShare);
  const h1AwayMean = Math.max(15, awayRegMean * h1AwayShare);
  const h1TotalMean = h1HomeMean + h1AwayMean;

  const h1VarH = clamp(prior.h1VarH, 20, 180);
  const h1VarA = clamp(prior.h1VarA, 20, 180);
  const maxH1Cov = 0.75 * Math.sqrt(h1VarH * h1VarA);
  const h1Cov = clamp(prior.h1CovHA, -maxH1Cov, maxH1Cov);

  const h1HomeStd = Math.sqrt(Math.max(9, h1VarH));
  const h1AwayStd = Math.sqrt(Math.max(9, h1VarA));
  const h1TotalStd = Math.sqrt(Math.max(16, h1VarH + h1VarA + 2 * h1Cov));

  // H2H context
  const pairKey = game.home_id < game.away_id ? `${game.home_id}|${game.away_id}` : `${game.away_id}|${game.home_id}`;
  const h2hList = state.h2hHistory.get(pairKey) || [];
  const h2hAvgTotal =
    h2hList.length > 0
      ? h2hList.reduce((acc, row) => acc + row.total, 0) / h2hList.length
      : null;

  return {
    gameId: game.id,
    league: state.league,
    season: game.season,
    gameDate: game.game_date,
    neutral: game.neutral,
    needsHistory,
    needsH1History,
    abstentionReason,
    h1AbstentionReason,
    homeGamesPlayed: homeSnap.totalGames,
    awayGamesPlayed: awaySnap.totalGames,
    homeH1GamesPlayed: homeSnap.h1Games,
    awayH1GamesPlayed: awaySnap.h1Games,
    homeRestDays: homeSnap.restDays,
    awayRestDays: awaySnap.restDays,
    homeIsB2B: homeSnap.isB2B,
    awayIsB2B: awaySnap.isB2B,
    leagueRegTeamMean: prior.regTeamMean,
    homeOffDelta: homeSnap.offDelta,
    homeDefDelta: homeSnap.defDelta,
    awayOffDelta: awaySnap.offDelta,
    awayDefDelta: awaySnap.defDelta,
    homeAvgScored: homeSnap.avgScored,
    homeAvgAllowed: homeSnap.avgAllowed,
    awayAvgScored: awaySnap.avgScored,
    awayAvgAllowed: awaySnap.avgAllowed,
    homePaceDelta: homeSnap.paceDelta,
    awayPaceDelta: awaySnap.paceDelta,
    paceAdjustment,
    homeAdvantagePts: homeAdv,
    restAdjustmentHome: restAdjHome,
    restAdjustmentAway: restAdjAway,
    otAdjustmentTotal: otTotalAdj,
    homeRegMean,
    awayRegMean,
    homeMean,
    awayMean,
    gameTotalMean,
    homeStd,
    awayStd,
    gameTotalStd,
    teamCovariance: covHA,
    h1HomeMean,
    h1AwayMean,
    h1TotalMean,
    h1HomeStd,
    h1AwayStd,
    h1TotalStd,
    h1Covariance: h1Cov,
    h1ShareApplied: 0.5 * (h1HomeShare + h1AwayShare),
    h2hMeetings: h2hList.length,
    h2hAvgTotal,
  };
}

/**
 * Updates LeagueBaselineState strictly AFTER a game finishes, using its pre-game projection for residual updates.
 */
export function updateLeagueStateWithGame(
  state: LeagueBaselineState,
  game: StoredBbGame,
  preGameProj?: GameProjection
): void {
  if (game.status !== 'FINISHED' || game.home_pts === null || game.away_pts === null) {
    return;
  }

  const hp = LEAGUE_HYPERPARAMS[state.league];
  const splits = extractGameScoringSplits(game);
  const proj = preGameProj || projectBasketballGame(state, game);
  const epochDays = dateToEpochDays(game.game_date);

  state.gamesProcessed += 1;

  // Record H2H
  const pairKey = game.home_id < game.away_id ? `${game.home_id}|${game.away_id}` : `${game.away_id}|${game.home_id}`;
  const h2hArr = state.h2hHistory.get(pairKey) || [];
  const h1TotalVal =
    game.h1_home !== null && game.h1_away !== null
      ? Number(game.h1_home) + Number(game.h1_away)
      : null;
  h2hArr.push({
    date: game.game_date,
    total: Number(game.home_pts) + Number(game.away_pts),
    h1Total: h1TotalVal,
  });
  if (h2hArr.length > 20) h2hArr.shift();
  state.h2hHistory.set(pairKey, h2hArr);

  // Regulation scoring & variance updates
  if (splits) {
    const { regHome, regAway, otHome, otAway } = splits;

    state.regGamesProcessed += 1;
    const meanWindow = state.league === 'NCAAB' ? 350 : 120;
    const alphaMean = 1 / Math.min(meanWindow, state.regGamesProcessed + 15);
    state.ewmaRegTeamMean = (1 - alphaMean) * state.ewmaRegTeamMean + alphaMean * (0.5 * (regHome + regAway));

    if (!game.neutral) {
      state.nonNeutralGames += 1;
      const alphaHome = 1 / Math.min(350, state.nonNeutralGames + 40);
      const strengthMargin =
        proj.homeOffDelta - proj.homeDefDelta - (proj.awayOffDelta - proj.awayDefDelta);
      const homeAdvObs = clamp(regHome - regAway - strengthMargin, -18, 22);
      state.ewmaHomeAdv = clamp(
        (1 - alphaHome) * state.ewmaHomeAdv + alphaHome * homeAdvObs,
        0.5,
        6.5
      );
    }

    // Empirical OT statistics across valid regulation-split games
    const otSum = otHome + otAway;
    state.otGamesCount += 1;
    state.otTotalPtsSum += otSum;
    state.otTotalSqSum += otSum * otSum;

    // Regulation prediction residuals for variance & covariance estimation (only once teams have minimum sample)
    const errH = regHome - proj.homeRegMean;
    const errA = regAway - proj.awayRegMean;
    if (!proj.needsHistory) {
      const alpha = 1 / Math.min(400, state.ewmaWeight + 25);
      state.ewmaRegVarH = (1 - alpha) * state.ewmaRegVarH + alpha * (errH * errH);
      state.ewmaRegVarA = (1 - alpha) * state.ewmaRegVarA + alpha * (errA * errA);
      state.ewmaRegCovHA = (1 - alpha) * state.ewmaRegCovHA + alpha * (errH * errA);
      state.ewmaWeight = Math.min(1000, state.ewmaWeight + 1);

      if (hp.applyRest) {
        if (proj.homeIsB2B) {
          state.b2bResSum += errH;
          state.b2bCount += 1;
        }
        if (proj.awayIsB2B) {
          state.b2bResSum += errA;
          state.b2bCount += 1;
        }
      }
    }

    // Update team states (ensure both exist & decayed to game_date)
    let homeTeam = state.teams.get(game.home_id);
    if (!homeTeam) {
      homeTeam = {
        teamId: game.home_id,
        lastSeason: game.season,
        lastGameDate: game.game_date,
        totalGames: 0,
        h1Games: 0,
        recentGames240d: 0,
        recentGameDates: [],
        lastUpdateDaysEpoch: epochDays,
        wSum: 0,
        offWeightedSum: 0,
        defWeightedSum: 0,
        paceWeightedSum: 0,
        varSum: 0,
        varWeight: 0,
        h1Weight: 0,
        h1OffRatioSum: 0,
        h1DefRatioSum: 0,
        h1VarSum: 0,
      };
      state.teams.set(game.home_id, homeTeam);
    } else {
      decayTeamToDate(homeTeam, epochDays, game.season, hp);
    }

    let awayTeam = state.teams.get(game.away_id);
    if (!awayTeam) {
      awayTeam = {
        teamId: game.away_id,
        lastSeason: game.season,
        lastGameDate: game.game_date,
        totalGames: 0,
        h1Games: 0,
        recentGames240d: 0,
        recentGameDates: [],
        lastUpdateDaysEpoch: epochDays,
        wSum: 0,
        offWeightedSum: 0,
        defWeightedSum: 0,
        paceWeightedSum: 0,
        varSum: 0,
        varWeight: 0,
        h1Weight: 0,
        h1OffRatioSum: 0,
        h1DefRatioSum: 0,
        h1VarSum: 0,
      };
      state.teams.set(game.away_id, awayTeam);
    } else {
      decayTeamToDate(awayTeam, epochDays, game.season, hp);
    }

    const baseMean = proj.leagueRegTeamMean;
    const halfHome = game.neutral ? 0 : 0.5 * proj.homeAdvantagePts;

    // Opponent-adjusted observations relative to league baseline
    const homeOffObs = regHome - (baseMean + halfHome + proj.awayDefDelta);
    const homeDefObs = regAway - (baseMean - halfHome + proj.awayOffDelta);
    const awayOffObs = regAway - (baseMean - halfHome + proj.homeDefDelta);
    const awayDefObs = regHome - (baseMean + halfHome + proj.homeOffDelta);

    const gamePaceResidual =
      regHome +
      regAway -
      (2 * baseMean + proj.homeOffDelta + proj.awayDefDelta + proj.awayOffDelta + proj.homeDefDelta);

    homeTeam.totalGames += 1;
    homeTeam.lastGameDate = game.game_date;
    homeTeam.lastSeason = game.season;
    homeTeam.recentGameDates.push(game.game_date);
    if (homeTeam.recentGameDates.length > 100) homeTeam.recentGameDates.shift();
    homeTeam.wSum += 1;
    homeTeam.offWeightedSum += homeOffObs;
    homeTeam.defWeightedSum += homeDefObs;
    homeTeam.paceWeightedSum += 0.5 * gamePaceResidual;
    homeTeam.varSum += errH * errH;
    homeTeam.varWeight += 1;

    awayTeam.totalGames += 1;
    awayTeam.lastGameDate = game.game_date;
    awayTeam.lastSeason = game.season;
    awayTeam.recentGameDates.push(game.game_date);
    if (awayTeam.recentGameDates.length > 100) awayTeam.recentGameDates.shift();
    awayTeam.wSum += 1;
    awayTeam.offWeightedSum += awayOffObs;
    awayTeam.defWeightedSum += awayDefObs;
    awayTeam.paceWeightedSum += 0.5 * gamePaceResidual;
    awayTeam.varSum += errA * errA;
    awayTeam.varWeight += 1;

    // 1st-half updates ONLY when real non-null half scores exist (never estimated)
    if (game.h1_home !== null && game.h1_away !== null && regHome > 0 && regAway > 0) {
      const h1H = Number(game.h1_home);
      const h1A = Number(game.h1_away);
      if (Number.isFinite(h1H) && Number.isFinite(h1A) && h1H >= 0 && h1A >= 0) {
        const shareObs = clamp((h1H + h1A) / (regHome + regAway), 0.30, 0.70);
        const h1ShareH = clamp(h1H / regHome, 0.25, 0.75);
        const h1ShareA = clamp(h1A / regAway, 0.25, 0.75);

        state.h1GamesProcessed += 1;
        const alphaShare = 1 / Math.min(300, state.h1GamesProcessed + 20);
        state.ewmaH1Share = (1 - alphaShare) * state.ewmaH1Share + alphaShare * shareObs;

        homeTeam.h1Games += 1;
        homeTeam.h1Weight += 1;
        homeTeam.h1OffRatioSum += h1ShareH;
        homeTeam.h1DefRatioSum += h1ShareA;

        awayTeam.h1Games += 1;
        awayTeam.h1Weight += 1;
        awayTeam.h1OffRatioSum += h1ShareA;
        awayTeam.h1DefRatioSum += h1ShareH;

        if (!proj.needsH1History) {
          const errH1H = h1H - proj.h1HomeMean;
          const errH1A = h1A - proj.h1AwayMean;
          const alphaH1 = 1 / Math.min(350, state.ewmaH1Weight + 25);
          state.ewmaH1VarH = (1 - alphaH1) * state.ewmaH1VarH + alphaH1 * (errH1H * errH1H);
          state.ewmaH1VarA = (1 - alphaH1) * state.ewmaH1VarA + alphaH1 * (errH1A * errH1A);
          state.ewmaH1CovHA = (1 - alphaH1) * state.ewmaH1CovHA + alphaH1 * (errH1H * errH1A);
          state.ewmaH1Weight = Math.min(1000, state.ewmaH1Weight + 1);

          homeTeam.h1VarSum += errH1H * errH1H;
          awayTeam.h1VarSum += errH1A * errH1A;
        }
      }
    }
  }
}

export function getDistributionForCategory(
  proj: GameProjection,
  category: BasketballMarketCategory,
  side: 'game' | 'home' | 'away' = 'game'
): { mean: number; std: number; requiresHalfScores: boolean; abstained: boolean; abstainReason: string | null } {
  switch (category) {
    case 'game_total':
      return {
        mean: proj.gameTotalMean,
        std: proj.gameTotalStd,
        requiresHalfScores: false,
        abstained: proj.needsHistory,
        abstainReason: proj.abstentionReason,
      };
    case 'home_total':
      return {
        mean: proj.homeMean,
        std: proj.homeStd,
        requiresHalfScores: false,
        abstained: proj.needsHistory,
        abstainReason: proj.abstentionReason,
      };
    case 'away_total':
      return {
        mean: proj.awayMean,
        std: proj.awayStd,
        requiresHalfScores: false,
        abstained: proj.needsHistory,
        abstainReason: proj.abstentionReason,
      };
    case 'h1_game_total':
      return {
        mean: proj.h1TotalMean,
        std: proj.h1TotalStd,
        requiresHalfScores: true,
        abstained: proj.needsH1History,
        abstainReason: proj.h1AbstentionReason,
      };
    case 'h1_team_total':
      return {
        mean: side === 'away' ? proj.h1AwayMean : proj.h1HomeMean,
        std: side === 'away' ? proj.h1AwayStd : proj.h1HomeStd,
        requiresHalfScores: true,
        abstained: proj.needsH1History,
        abstainReason: proj.h1AbstentionReason,
      };
  }
}
