import { cleanDisplayText } from '@/lib/utils/formatText';
import { loadAndBuildSlipCandidates } from './candidateBuilder';
import { searchSlips } from './slipSearch';
import {
  getDailySlipsForDate,
  listDailySlipRecordRows,
  loadSettlementScoresForMatchIds,
  saveDailySlipRecordRows,
  SettlementMatchScore,
  updateDailySlipSettlement,
} from './storage';
import type {
  BuiltSlip,
  DailySlipLegRecord,
  DailySlipRecordRow,
  SlipOddsBasis,
  SlipRecordSummary,
} from './types';

export const DAILY_RECORD_TARGETS = [2.0, 3.0, 4.0] as const;
export const SMALL_SAMPLE_SLIP_THRESHOLD = 30;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function settleSingleLeg(
  leg: DailySlipLegRecord,
  score: SettlementMatchScore | undefined
): { legStatus: DailySlipLegRecord['legStatus']; settledScore: string | null } {
  if (!score) {
    return { legStatus: leg.legStatus, settledScore: leg.settledScore ?? null };
  }

  const st = String(score.status || '').toUpperCase();
  if (st === 'POSTPONED' || st === 'CANCELED' || st === 'CANCELLED' || st === 'SUSPENDED' || st === 'AWARDED') {
    return { legStatus: 'VOID', settledScore: cleanDisplayText(st) };
  }

  if (st !== 'FINISHED') {
    return { legStatus: 'PENDING', settledScore: null };
  }

  if (score.homeScore === null || score.awayScore === null) {
    return { legStatus: 'PENDING', settledScore: null };
  }

  const h = score.homeScore;
  const a = score.awayScore;
  const total = h + a;
  const scoreLabel = `${h}:${a}`;

  if (leg.sport === 'basketball') {
    const code = leg.marketCode.toUpperCase();
    const line = leg.line ?? 0;
    const isH1 = code.startsWith('H1_');
    let metric: number | null = total;
    if (code.startsWith('HOME_TOTAL')) metric = h;
    else if (code.startsWith('AWAY_TOTAL')) metric = a;
    else if (isH1) {
      if (score.homeH1Score === null || score.homeH1Score === undefined || score.awayH1Score === null || score.awayH1Score === undefined) {
        return { legStatus: 'VOID', settledScore: scoreLabel };
      }
      if (code.startsWith('H1_HOME_')) metric = score.homeH1Score;
      else if (code.startsWith('H1_AWAY_')) metric = score.awayH1Score;
      else metric = score.homeH1Score + score.awayH1Score;
    }

    if (metric === null) return { legStatus: 'PENDING', settledScore: scoreLabel };
    if (Math.abs(metric - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    const isOver = code.endsWith('_OVER');
    return {
      legStatus: isOver ? (metric > line ? 'WON' : 'LOST') : metric < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  // Football settlement
  const code = leg.marketCode.toUpperCase();
  if (code === '1X2_HOME') return { legStatus: h > a ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === '1X2_DRAW') return { legStatus: h === a ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === '1X2_AWAY') return { legStatus: a > h ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === 'DC_1X') return { legStatus: h >= a ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === 'DC_X2') return { legStatus: a >= h ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === 'DC_12') return { legStatus: h !== a ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === 'DNB_HOME') {
    return { legStatus: h > a ? 'WON' : h === a ? 'PUSH' : 'LOST', settledScore: scoreLabel };
  }
  if (code === 'DNB_AWAY') {
    return { legStatus: a > h ? 'WON' : h === a ? 'PUSH' : 'LOST', settledScore: scoreLabel };
  }
  if (code === 'BTTS_YES') return { legStatus: h >= 1 && a >= 1 ? 'WON' : 'LOST', settledScore: scoreLabel };
  if (code === 'BTTS_NO') return { legStatus: h === 0 || a === 0 ? 'WON' : 'LOST', settledScore: scoreLabel };

  if (code.startsWith('TOTAL_GOALS_O') || code.startsWith('TOTAL_GOALS_U')) {
    const line = leg.line ?? 2.5;
    if (Math.abs(total - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    const isOver = code.startsWith('TOTAL_GOALS_O');
    return {
      legStatus: isOver ? (total > line ? 'WON' : 'LOST') : total < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  if (code.startsWith('TEAM_GOALS_HOME_O') || code.startsWith('TEAM_GOALS_HOME_U')) {
    const line = leg.line ?? 1.5;
    if (Math.abs(h - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    return {
      legStatus: code.includes('_O') ? (h > line ? 'WON' : 'LOST') : h < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  if (code.startsWith('TEAM_GOALS_AWAY_O') || code.startsWith('TEAM_GOALS_AWAY_U')) {
    const line = leg.line ?? 1.5;
    if (Math.abs(a - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    return {
      legStatus: code.includes('_O') ? (a > line ? 'WON' : 'LOST') : a < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  if (code.startsWith('AH_HOME_') || code.startsWith('AH_AWAY_')) {
    const line = leg.line ?? 0;
    const isHome = code.startsWith('AH_HOME_');
    const diff = (isHome ? h - a : a - h) + line;
    if (Math.abs(diff) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    if (Math.abs(diff - 0.25) < 1e-6 || Math.abs(diff + 0.25) < 1e-6) {
      // Quarter line half win/half loss handled cleanly as won/lost/push approximation on integer scores
      return { legStatus: diff > 0 ? 'WON' : 'LOST', settledScore: scoreLabel };
    }
    return { legStatus: diff > 0 ? 'WON' : 'LOST', settledScore: scoreLabel };
  }

  if (code.startsWith('FH_GOALS_O') || code.startsWith('FH_GOALS_U')) {
    if (score.homeHtScore === null || score.homeHtScore === undefined || score.awayHtScore === null || score.awayHtScore === undefined) {
      return { legStatus: 'VOID', settledScore: scoreLabel };
    }
    const htTotal = score.homeHtScore + score.awayHtScore;
    const line = leg.line ?? 0.5;
    if (Math.abs(htTotal - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    return {
      legStatus: code.startsWith('FH_GOALS_O') ? (htTotal > line ? 'WON' : 'LOST') : htTotal < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  if (code.startsWith('CORNERS_')) {
    if (score.homeCorners === null || score.homeCorners === undefined || score.awayCorners === null || score.awayCorners === undefined) {
      return { legStatus: 'VOID', settledScore: scoreLabel };
    }
    const totalCorners = score.homeCorners + score.awayCorners;
    const line = leg.line ?? 9.5;
    if (Math.abs(totalCorners - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    return {
      legStatus: code.startsWith('CORNERS_O') ? (totalCorners > line ? 'WON' : 'LOST') : totalCorners < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  if (code.startsWith('CARDS_')) {
    if (
      score.homeYellowCards === null ||
      score.homeYellowCards === undefined ||
      score.awayYellowCards === null ||
      score.awayYellowCards === undefined
    ) {
      return { legStatus: 'VOID', settledScore: scoreLabel };
    }
    const totalCards =
      score.homeYellowCards +
      score.awayYellowCards +
      (score.homeRedCards || 0) * 2 +
      (score.awayRedCards || 0) * 2;
    const line = leg.line ?? 4.5;
    if (Math.abs(totalCards - line) < 1e-6) return { legStatus: 'PUSH', settledScore: scoreLabel };
    return {
      legStatus: code.startsWith('CARDS_O') ? (totalCards > line ? 'WON' : 'LOST') : totalCards < line ? 'WON' : 'LOST',
      settledScore: scoreLabel,
    };
  }

  if (code.startsWith('MULTI_GOALS_')) {
    const m = code.match(/MULTI_GOALS_(\d+)_(\d+)/);
    if (m) {
      const minG = Number(m[1]);
      const maxG = Number(m[2]);
      return { legStatus: total >= minG && total <= maxG ? 'WON' : 'LOST', settledScore: scoreLabel };
    }
  }

  return { legStatus: 'VOID', settledScore: scoreLabel };
}

/**
 * Computes slip outcome from its settled leg statuses.
 * - Slip wins ONLY if all active (non-VOID/PUSH) legs win and at least 1 active leg remains.
 * - A VOID or PUSH leg is removed (factor 1.0) and settledOdds recalculates as product of remaining legs.
 * - If all legs are VOID/PUSH, the slip status is VOID (settledOdds = 1.0).
 */
export function computeSlipSettlementFromLegs(legs: DailySlipLegRecord[]): {
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  settledOdds: number | null;
  activeLegsCount: number;
  voidedLegsCount: number;
} {
  let hasPending = false;
  let hasLost = false;
  let activeLegsCount = 0;
  let voidedLegsCount = 0;
  let recalculatedOdds = 1.0;

  for (const leg of legs) {
    if (leg.legStatus === 'VOID' || leg.legStatus === 'PUSH') {
      voidedLegsCount++;
      continue;
    }
    activeLegsCount++;
    recalculatedOdds *= leg.decimalOdds;
    if (leg.legStatus === 'PENDING') {
      hasPending = true;
    } else if (leg.legStatus === 'LOST') {
      hasLost = true;
    }
  }

  if (activeLegsCount === 0) {
    return {
      status: 'VOID',
      settledOdds: 1.0,
      activeLegsCount: 0,
      voidedLegsCount,
    };
  }

  const settledOdds = round2(recalculatedOdds);

  if (hasLost) {
    return {
      status: 'LOST',
      settledOdds,
      activeLegsCount,
      voidedLegsCount,
    };
  }

  if (hasPending) {
    return {
      status: 'PENDING',
      settledOdds: null,
      activeLegsCount,
      voidedLegsCount,
    };
  }

  return {
    status: 'WON',
    settledOdds,
    activeLegsCount,
    voidedLegsCount,
  };
}

function builtSlipToRecordRow(
  slip: BuiltSlip,
  recordDate: string,
  targetOdds: number,
  oddsBasis: SlipOddsBasis,
  createdAt: string
): DailySlipRecordRow {
  const legs: DailySlipLegRecord[] = slip.legs.map((l) => ({
    matchId: l.matchId,
    sport: l.sport,
    matchLabel: l.matchLabel,
    competitionId: l.competitionId,
    competitionCode: l.competitionCode,
    competitionName: l.competitionName,
    kickoffTime: l.kickoffTime,
    marketCode: l.marketCode,
    marketName: l.marketName,
    selection: l.selection,
    line: l.line,
    decimalOdds: l.decimalOdds,
    oddsSourceType: l.oddsSourceType,
    bookmakerName: l.bookmakerName,
    priceAgeLabel: l.priceAgeLabel,
    calibratedProbability: l.calibratedProbability,
    confidenceTier: l.confidenceTier,
    oneLineWhy: l.oneLineWhy,
    legStatus: 'PENDING',
    settledScore: null,
  }));

  const firstKickoffMs = Math.min(
    ...legs.map((l) => Date.parse(l.kickoffTime)).filter((ms) => Number.isFinite(ms))
  );
  const firstKickoffUtc = Number.isFinite(firstKickoffMs)
    ? new Date(firstKickoffMs).toISOString()
    : createdAt;

  return {
    id: `dailyslip_${recordDate}_${targetOdds.toFixed(1)}`,
    recordDate,
    targetOdds,
    style: 'safest',
    oddsBasis,
    combinedOdds: slip.combinedOdds,
    combinedProbability: slip.combinedProbability,
    settledOdds: null,
    status: 'PENDING',
    legsCount: legs.length,
    activeLegsCount: legs.length,
    voidedLegsCount: 0,
    legs,
    createdAt,
    firstKickoffUtc,
    settledAt: null,
  };
}

/**
 * Generates and stores the fixed public daily slip set (targets 2.0, 3.0, 4.0, Safest)
 * once per UTC day before the first kickoff on the day's slate.
 * Strictly real bookmaker prices only (never invents odds or relaxes gates).
 */
export async function ensureDailyRecordSlips(now: Date = new Date()): Promise<{
  createdCount: number;
  existingCount: number;
  skippedReason?: string;
}> {
  const dateIso = now.toISOString().slice(0, 10);
  const existing = await getDailySlipsForDate(dateIso);
  if (existing.length > 0) {
    return { createdCount: 0, existingCount: existing.length };
  }

  const nowMs = now.getTime();
  const buildOut = await loadAndBuildSlipCandidates({
    day: 'today',
    sport: 'all',
    competitionIds: [],
    markets: [],
    oddsBasis: 'real',
    bestPriceComparison: false,
    nowMs,
  });

  if (buildOut.candidates.length < 2) {
    return {
      createdCount: 0,
      existingCount: 0,
      skippedReason: 'Fewer than 2 real-priced qualified legs on today slate',
    };
  }

  const nowIso = now.toISOString();
  const toSave: DailySlipRecordRow[] = [];

  for (const targetOdds of DAILY_RECORD_TARGETS) {
    const slips = searchSlips(buildOut.candidates, {
      targetOdds,
      maxLegs: 4,
      style: 'safest',
      maxResults: 1,
      nowIso,
    });
    if (slips.length > 0) {
      const top = slips[0];
      const firstKickoffMs = Math.min(
        ...top.legs.map((l) => Date.parse(l.kickoffTime)).filter((ms) => Number.isFinite(ms))
      );
      if (Number.isFinite(firstKickoffMs) && nowMs < firstKickoffMs) {
        toSave.push(builtSlipToRecordRow(top, dateIso, targetOdds, 'real', nowIso));
      }
    }
  }

  if (toSave.length === 0) {
    return {
      createdCount: 0,
      existingCount: 0,
      skippedReason: 'No daily record target combinations qualified before kickoff',
    };
  }

  const saved = await saveDailySlipRecordRows(toSave);
  return { createdCount: saved, existingCount: 0 };
}

/**
 * Settles all PENDING daily record slips once matches finish, recalculating odds when a leg voids/pushes.
 */
export async function settleDailyRecordSlips(now: Date = new Date()): Promise<{
  checkedCount: number;
  settledCount: number;
}> {
  const rows = await listDailySlipRecordRows(120);
  const pendingRows = rows.filter((r) => r.status === 'PENDING');
  if (pendingRows.length === 0) {
    return { checkedCount: 0, settledCount: 0 };
  }

  const footballIds: string[] = [];
  const basketballIds: string[] = [];
  for (const row of pendingRows) {
    for (const leg of row.legs) {
      if (leg.sport === 'basketball') basketballIds.push(leg.matchId);
      else footballIds.push(leg.matchId);
    }
  }

  const scoreMap = await loadSettlementScoresForMatchIds(footballIds, basketballIds);
  let settledCount = 0;
  const nowIso = now.toISOString();

  for (const row of pendingRows) {
    let anyChanged = false;
    const updatedLegs = row.legs.map((leg) => {
      const score = scoreMap.get(leg.matchId);
      const outcome = settleSingleLeg(leg, score);
      if (
        outcome.legStatus !== leg.legStatus ||
        outcome.settledScore !== (leg.settledScore ?? null)
      ) {
        anyChanged = true;
      }
      return {
        ...leg,
        legStatus: outcome.legStatus,
        settledScore: outcome.settledScore,
      };
    });

    const summary = computeSlipSettlementFromLegs(updatedLegs);
    if (anyChanged || summary.status !== row.status) {
      await updateDailySlipSettlement({
        id: row.id,
        status: summary.status,
        settledOdds: summary.settledOdds,
        activeLegsCount: summary.activeLegsCount,
        voidedLegsCount: summary.voidedLegsCount,
        legs: updatedLegs,
        settledAt: summary.status === 'PENDING' ? null : nowIso,
      });
      if (summary.status !== 'PENDING') settledCount++;
    }
  }

  return { checkedCount: pendingRows.length, settledCount };
}

export async function getDailySlipRecordSummary(): Promise<SlipRecordSummary> {
  const records = await listDailySlipRecordRows(90);
  let wonSlips = 0;
  let lostSlips = 0;
  let voidSlips = 0;
  let pendingSlips = 0;

  for (const r of records) {
    if (r.status === 'WON') wonSlips++;
    else if (r.status === 'LOST') lostSlips++;
    else if (r.status === 'VOID') voidSlips++;
    else pendingSlips++;
  }

  const settledDecisions = wonSlips + lostSlips;
  const hitRatePct =
    settledDecisions > 0 ? Math.round((wonSlips / settledDecisions) * 1000) / 10 : null;
  const isSmallSample = settledDecisions < SMALL_SAMPLE_SLIP_THRESHOLD;

  const smallSampleCaveat = cleanDisplayText(
    settledDecisions === 0
      ? `No settled daily record slips yet. Public daily slips lock before first kickoff (2.0, 3.0, and 4.0 targets, Safest) and exclude user builds.`
      : isSmallSample
      ? `Small sample note (${settledDecisions} settled slips out of ${SMALL_SAMPLE_SLIP_THRESHOLD} minimum): early slip hit rates carry wide variance and should not be extrapolated.`
      : `Public daily record across ${settledDecisions} settled slips (fixed pre kickoff snapshots; user built slips excluded).`
  );

  return {
    totalSlips: records.length,
    settledSlips: settledDecisions + voidSlips,
    wonSlips,
    lostSlips,
    voidSlips,
    pendingSlips,
    hitRatePct,
    smallSampleThreshold: SMALL_SAMPLE_SLIP_THRESHOLD,
    isSmallSample,
    smallSampleCaveat,
    records,
    generatedAt: new Date().toISOString(),
  };
}
