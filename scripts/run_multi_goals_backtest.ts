// CALIBRALL: Multi Goals Walk-Forward Backtest & Calibration Pipeline
// Downloads real historical CSVs from football-data.co.uk (cached in /tmp/fdco_cache),
// walks forward chronologically per league, computes raw Dixon-Coles matrix probabilities
// across all supported Multi Goals ranges (Full Match, Home/Away Team, 1st Half),
// fits Platt scaling strictly on past folds, compares against empirical naive league
// total-goals baselines, and reports per-league Brier, Log Loss, calibration table,
// hit rate by range, and hit rate by tier.
//
// Usage: npx tsx scripts/run_multi_goals_backtest.ts [--write-params]

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
  parseLondonCsvDateTime,
  parseBrazilCsvDate,
  getCanonicalTeamForCsv,
  sanitizeRawTeamForId,
} from '../src/lib/data/backfillCatalog';

const DECAY_LAMBDA = 0.005; // ~138.6 day half-life
const DAY_MS = 1000 * 60 * 60 * 24;
const K_TEAM = 12;
const K_HALVES = 40;

const DIVISIONS = [
  'E0', 'E1', 'E2', 'E3', 'EC',
  'SC0', 'SC1', 'SC2', 'SC3',
  'SP1', 'SP2', 'I1', 'I2', 'D1', 'D2', 'F1', 'F2',
  'N1', 'B1', 'P1', 'T1', 'G1',
];

const SEASONS = ['2021', '2122', '2223', '2324', '2425', '2526'];
const T1_SEASONS = ['2122', '2223', '2324', '2425', '2526'];

const EXTRA_LEAGUES: Array<{ competitionCode: string; fileCode: string }> = [
  { competitionCode: 'ARG', fileCode: 'ARG' },
  { competitionCode: 'AUT', fileCode: 'AUT' },
  { competitionCode: 'BSA', fileCode: 'BRA' },
  { competitionCode: 'CHN', fileCode: 'CHN' },
  { competitionCode: 'DNK', fileCode: 'DNK' },
  { competitionCode: 'FIN', fileCode: 'FIN' },
  { competitionCode: 'IRL', fileCode: 'IRL' },
  { competitionCode: 'JPN', fileCode: 'JPN' },
  { competitionCode: 'MEX', fileCode: 'MEX' },
  { competitionCode: 'NOR', fileCode: 'NOR' },
  { competitionCode: 'POL', fileCode: 'POL' },
  { competitionCode: 'ROU', fileCode: 'ROU' },
  { competitionCode: 'RUS', fileCode: 'RUS' },
  { competitionCode: 'SWE', fileCode: 'SWE' },
  { competitionCode: 'SWZ', fileCode: 'SWZ' },
  { competitionCode: 'USA', fileCode: 'USA' },
];

type LeagueGroupKey = 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';

const GROUP_LEAGUES: Record<LeagueGroupKey, string[]> = {
  UK_WITH_REF: ['E0', 'E1', 'E2', 'E3', 'EC', 'SC0', 'SC1', 'SC2', 'SC3'],
  EURO_NO_REF: ['B1', 'D1', 'D2', 'F1', 'F2', 'G1', 'I1', 'I2', 'N1', 'P1', 'SP1', 'SP2', 'T1'],
  EXTRA_GOALS_ONLY: ['ARG', 'AUT', 'BSA', 'CHN', 'DNK', 'FIN', 'IRL', 'JPN', 'MEX', 'NOR', 'POL', 'ROU', 'RUS', 'SWE', 'SWZ', 'USA'],
};

function getLeagueGroup(compCode: string): LeagueGroupKey {
  if (GROUP_LEAGUES.UK_WITH_REF.includes(compCode)) return 'UK_WITH_REF';
  if (GROUP_LEAGUES.EURO_NO_REF.includes(compCode)) return 'EURO_NO_REF';
  return 'EXTRA_GOALS_ONLY';
}

interface RangeDef {
  id: string;
  scope: 'full_match' | 'home' | 'away' | 'first_half';
  min: number;
  max: number;
  span: number;
  label: string;
}

const FULL_MATCH_RANGES: RangeDef[] = [
  [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 4], [3, 5], [3, 6], [4, 6],
].map(([a, b]) => ({
  id: `MULTI_GOALS_${a}_${b}`,
  scope: 'full_match',
  min: a,
  max: b,
  span: b - a + 1,
  label: `Multi goals ${a}-${b}`,
}));

const TEAM_HOME_RANGES: RangeDef[] = [
  [0, 1], [1, 2], [1, 3], [2, 3],
].map(([a, b]) => ({
  id: `TEAM_MULTI_GOALS_HOME_${a}_${b}`,
  scope: 'home',
  min: a,
  max: b,
  span: b - a + 1,
  label: `Home multi goals ${a}-${b}`,
}));

const TEAM_AWAY_RANGES: RangeDef[] = [
  [0, 1], [1, 2], [1, 3], [2, 3],
].map(([a, b]) => ({
  id: `TEAM_MULTI_GOALS_AWAY_${a}_${b}`,
  scope: 'away',
  min: a,
  max: b,
  span: b - a + 1,
  label: `Away multi goals ${a}-${b}`,
}));

const FIRST_HALF_RANGES: RangeDef[] = [
  [0, 1], [1, 2],
].map(([a, b]) => ({
  id: `FH_MULTI_GOALS_${a}_${b}`,
  scope: 'first_half',
  min: a,
  max: b,
  span: b - a + 1,
  label: `1st half multi goals ${a}-${b}`,
}));

const CACHE_DIR = path.join('/tmp', 'fdco_cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface MatchRow {
  id: string;
  competitionCode: string;
  season: string;
  kickoffMs: number;
  kickoffIso: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeHtScore: number | null;
  awayHtScore: number | null;
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

function currentDecayedRate(
  t: DecayedTracker | undefined,
  tsMs: number,
  priorMean: number,
  shrinkageK: number
): { forRate: number; againstRate: number; matches: number } {
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

function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / fact;
}

function dcTau(x: number, y: number, l: number, m: number, rho: number): number {
  if (x === 0 && y === 0) return Math.max(1e-6, 1 - l * m * rho);
  if (x === 0 && y === 1) return Math.max(1e-6, 1 + l * rho);
  if (x === 1 && y === 0) return Math.max(1e-6, 1 + m * rho);
  if (x === 1 && y === 1) return Math.max(1e-6, 1 - rho);
  return 1.0;
}

function clampProb(p: number): number {
  return Math.max(0.002, Math.min(0.998, p));
}

function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  } else {
    const ez = Math.exp(z);
    return ez / (1 + ez);
  }
}

function applyPlatt(rawProb: number, a: number, b: number): number {
  return clampProb(sigmoid(a * logit(rawProb) + b));
}

function logLossVal(p: number, y: number): number {
  const c = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return -(y * Math.log(c) + (1 - y) * Math.log(1 - c));
}

// Fit logistic regression calibration (Platt scaling): logit(y_hat) = a * logit(raw) + b
// Uses regularized Newton-Raphson / gradient descent strictly on provided past pairs.
function fitPlattParameters(obs: Array<{ raw: number; y: number }>): { a: number; b: number } {
  if (obs.length < 150) return { a: 1.0, b: 0.0 };
  let a = 1.0;
  let b = 0.0;
  const n = obs.length;
  const reg = 0.001;

  for (let iter = 0; iter < 40; iter++) {
    let gA = 0, gB = 0, hAA = 0, hAB = 0, hBB = 0;
    for (let i = 0; i < n; i++) {
      const x = logit(obs[i].raw);
      const y = obs[i].y;
      const p = sigmoid(a * x + b);
      const w = p * (1 - p);
      const diff = p - y;
      gA += diff * x;
      gB += diff;
      hAA += w * x * x;
      hAB += w * x;
      hBB += w;
    }
    gA = gA / n + reg * (a - 1.0);
    gB = gB / n + reg * b;
    hAA = hAA / n + reg;
    hAB = hAB / n;
    hBB = hBB / n + reg;

    const det = hAA * hBB - hAB * hAB;
    if (Math.abs(det) < 1e-10) break;
    const stepA = (hBB * gA - hAB * gB) / det;
    const stepB = (-hAB * gA + hAA * gB) / det;
    a = Math.max(0.4, Math.min(1.8, a - stepA));
    b = Math.max(-0.8, Math.min(0.8, b - stepB));
    if (Math.abs(stepA) < 1e-5 && Math.abs(stepB) < 1e-5) break;
  }

  return { a: Number(a.toFixed(4)), b: Number(b.toFixed(4)) };
}

async function fetchCsvWithCache(division: string, season: string): Promise<string | null> {
  const candidates = [
    path.join(CACHE_DIR, `${season}_${division}.csv`),
    path.join(CACHE_DIR, `${division}_${season}.csv`),
  ];
  for (const cachePath of candidates) {
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath, 'utf-8');
    }
  }

  const url = `https://football-data.co.uk/mmz4281/${season}/${division}.csv`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Calibrall/1.0 (Multi Goals Backtest)' },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  fs.writeFileSync(candidates[0], text, 'utf-8');
  return text;
}

async function fetchExtraCsvWithCache(fileCode: string): Promise<string | null> {
  const cachePath = path.join(CACHE_DIR, `${fileCode}.csv`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }
  const url = `https://football-data.co.uk/new/${fileCode}.csv`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Calibrall/1.0 (Multi Goals Backtest)' },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  fs.writeFileSync(cachePath, text, 'utf-8');
  return text;
}

function parseSeasonalMatches(division: string, season: string, csvText: string): MatchRow[] {
  const clean = csvText.replace(/^\uFEFF/, '').trim();
  const records: Record<string, string>[] = parse(clean, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    quote: '"',
    trim: true,
    relax_column_count: true,
  });

  const out: MatchRow[] = [];
  for (const row of records) {
    const rawHome = row['HomeTeam']?.trim();
    const rawAway = row['AwayTeam']?.trim();
    if (!rawHome || !rawAway) continue;
    const iso = parseLondonCsvDateTime(row['Date']?.trim() || '', row['Time']?.trim() || null);
    if (!iso) continue;
    const homeResolved = getCanonicalTeamForCsv(division, rawHome);
    const awayResolved = getCanonicalTeamForCsv(division, rawAway);
    if (!homeResolved || !awayResolved) continue;
    const hg = parseInt(row['FTHG'], 10);
    const ag = parseInt(row['FTAG'], 10);
    if (isNaN(hg) || isNaN(ag)) continue;
    const hthg = row['HTHG'] !== undefined ? parseInt(row['HTHG'], 10) : NaN;
    const htag = row['HTAG'] !== undefined ? parseInt(row['HTAG'], 10) : NaN;
    const cleanDateStr = (row['Date'] || '').replace(/\//g, '');
    const id = `fdco:${division.toLowerCase()}:${season}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;
    out.push({
      id,
      competitionCode: division,
      season,
      kickoffMs: new Date(iso).getTime(),
      kickoffIso: iso,
      homeTeamId: homeResolved.id,
      awayTeamId: awayResolved.id,
      homeScore: hg,
      awayScore: ag,
      homeHtScore: !isNaN(hthg) ? hthg : null,
      awayHtScore: !isNaN(htag) ? htag : null,
    });
  }
  return out;
}

function parseExtraMatches(competitionCode: string, fileCode: string, csvText: string): MatchRow[] {
  const clean = csvText.replace(/^\uFEFF/, '').trim();
  const records: Record<string, string>[] = parse(clean, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    quote: '"',
    trim: true,
    relax_column_count: true,
  });

  const out: MatchRow[] = [];
  for (const row of records) {
    const season = row['Season']?.trim() || '';
    if (!season) continue;
    const rawHome = row['Home']?.trim();
    const rawAway = row['Away']?.trim();
    if (!rawHome || !rawAway) continue;
    const rawDate = row['Date']?.trim() || '';
    const rawTime = row['Time']?.trim() || null;
    const iso = fileCode === 'BRA'
      ? parseBrazilCsvDate(rawDate)
      : (parseLondonCsvDateTime(rawDate, rawTime) || parseBrazilCsvDate(rawDate));
    if (!iso) continue;
    const homeResolved = getCanonicalTeamForCsv(competitionCode, rawHome);
    const awayResolved = getCanonicalTeamForCsv(competitionCode, rawAway);
    if (!homeResolved || !awayResolved) continue;
    const hg = parseInt(row['HG'], 10);
    const ag = parseInt(row['AG'], 10);
    if (isNaN(hg) || isNaN(ag)) continue;
    const cleanDateStr = rawDate.replace(/\//g, '');
    const id = `fdco:${fileCode.toLowerCase()}:${season.replace(/\//g, '_')}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;
    out.push({
      id,
      competitionCode,
      season,
      kickoffMs: new Date(iso).getTime(),
      kickoffIso: iso,
      homeTeamId: homeResolved.id,
      awayTeamId: awayResolved.id,
      homeScore: hg,
      awayScore: ag,
      homeHtScore: null,
      awayHtScore: null,
    });
  }
  return out;
}

interface RawPredObs {
  competitionCode: string;
  leagueGroup: LeagueGroupKey;
  matchId: string;
  kickoffMs: number;
  rangeId: string;
  scope: 'full_match' | 'home' | 'away' | 'first_half';
  span: number;
  rawProb: number;
  baseProb: number;
  y: number;
}

async function main() {
  const writeParams = process.argv.includes('--write-params');
  const calibratedParamsPath = path.join(process.cwd(), 'src/lib/prediction/calibratedParams.json');
  const existingParams = JSON.parse(fs.readFileSync(calibratedParamsPath, 'utf-8'));

  console.log('Downloading / loading historical CSVs into /tmp/fdco_cache...');
  const allMatchesByLeague = new Map<string, MatchRow[]>();

  for (const div of DIVISIONS) {
    const seasonsForDiv = div === 'T1' ? T1_SEASONS : SEASONS;
    const list: MatchRow[] = [];
    for (const s of seasonsForDiv) {
      const csv = await fetchCsvWithCache(div, s);
      if (!csv) continue;
      list.push(...parseSeasonalMatches(div, s, csv));
    }
    if (list.length > 0) {
      // Deduplicate by id and sort strictly chronologically
      const seen = new Set<string>();
      const deduped = list.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      }).sort((a, b) => a.kickoffMs - b.kickoffMs || a.id.localeCompare(b.id));
      allMatchesByLeague.set(div, deduped);
    }
  }

  for (const extra of EXTRA_LEAGUES) {
    const csv = await fetchExtraCsvWithCache(extra.fileCode);
    if (!csv) continue;
    const list = parseExtraMatches(extra.competitionCode, extra.fileCode, csv);
    if (list.length > 0) {
      const seen = new Set<string>();
      const deduped = list.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      }).sort((a, b) => a.kickoffMs - b.kickoffMs || a.id.localeCompare(b.id));
      allMatchesByLeague.set(extra.competitionCode, deduped);
    }
  }

  console.log(`Loaded ${allMatchesByLeague.size} leagues from CSVs.`);

  // Stage 1: Causal walk-forward prediction generation per league
  // Tracks strictly causal empirical total/home/away/1H goal distributions as naive baseline.
  const allRawObs: RawPredObs[] = [];
  const allRangesById = new Map<string, RangeDef>();
  for (const r of [...FULL_MATCH_RANGES, ...TEAM_HOME_RANGES, ...TEAM_AWAY_RANGES, ...FIRST_HALF_RANGES]) {
    allRangesById.set(r.id, r);
  }

  for (const [comp, rows] of Array.from(allMatchesByLeague.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const grp = getLeagueGroup(comp);
    const rho = existingParams.leagues?.[comp]?.goals?.dixonColesRho ?? -0.05;
    const hasHtCap = Boolean(existingParams.leagues?.[comp]?.capabilities?.hasHalfTimeGoals);

    const teamGoals = new Map<string, DecayedTracker>();
    const team1HGoals = new Map<string, DecayedTracker>();

    let leagueN = 0;
    let sumHG = 0;
    let sumAG = 0;
    const totalHist = new Array(15).fill(0);
    const homeHist = new Array(12).fill(0);
    const awayHist = new Array(12).fill(0);

    let htN = 0;
    let sum1HG = 0;
    let sum1AG = 0;
    const htTotalHist = new Array(10).fill(0);

    const warmupMatches = Math.max(80, Math.floor(rows.length * 0.25));

    for (let i = 0; i < rows.length; i++) {
      const m = rows[i];
      const isTest = i >= warmupMatches && leagueN >= 60;

      const avgHG = leagueN > 0 ? sumHG / leagueN : 1.44;
      const avgAG = leagueN > 0 ? sumAG / leagueN : 1.14;
      const avgTG = avgHG + avgAG;
      const basePerSide = Math.max(0.25, avgTG / 2);

      const hTeam = currentDecayedRate(teamGoals.get(m.homeTeamId), m.kickoffMs, basePerSide, K_TEAM);
      const aTeam = currentDecayedRate(teamGoals.get(m.awayTeamId), m.kickoffMs, basePerSide, K_TEAM);

      if (isTest && hTeam.matches >= 10 && aTeam.matches >= 10) {
        const lam = Math.max(0.25, Math.min(4.8, avgHG * (hTeam.forRate / basePerSide) * (aTeam.againstRate / basePerSide)));
        const mu = Math.max(0.25, Math.min(4.8, avgAG * (aTeam.forRate / basePerSide) * (hTeam.againstRate / basePerSide)));

        // Compute normalized Dixon-Coles matrix (0..8 x 0..8)
        let matSum = 0;
        const totDist = new Array(17).fill(0);
        const homeDist = new Array(9).fill(0);
        const awayDist = new Array(9).fill(0);

        for (let x = 0; x <= 8; x++) {
          const px = poissonProb(lam, x);
          for (let y = 0; y <= 8; y++) {
            const p = px * poissonProb(mu, y) * dcTau(x, y, lam, mu, rho);
            matSum += p;
            totDist[x + y] += p;
            homeDist[x] += p;
            awayDist[y] += p;
          }
        }
        for (let k = 0; k < totDist.length; k++) totDist[k] /= matSum;
        for (let k = 0; k < homeDist.length; k++) homeDist[k] /= matSum;
        for (let k = 0; k < awayDist.length; k++) awayDist[k] /= matSum;

        const actualTotal = m.homeScore + m.awayScore;

        // Full match 12 ranges
        for (const r of FULL_MATCH_RANGES) {
          let rawProb = 0;
          for (let k = r.min; k <= r.max; k++) rawProb += totDist[k] || 0;
          let baseCount = 0;
          for (let k = r.min; k <= r.max; k++) baseCount += totalHist[k] || 0;
          const baseProb = clampProb((baseCount + 0.5) / (leagueN + 1.0));
          const y = actualTotal >= r.min && actualTotal <= r.max ? 1 : 0;

          allRawObs.push({
            competitionCode: comp,
            leagueGroup: grp,
            matchId: m.id,
            kickoffMs: m.kickoffMs,
            rangeId: r.id,
            scope: 'full_match',
            span: r.span,
            rawProb: clampProb(rawProb),
            baseProb,
            y,
          });
        }

        // Home team 4 ranges
        for (const r of TEAM_HOME_RANGES) {
          let rawProb = 0;
          for (let k = r.min; k <= r.max; k++) rawProb += homeDist[k] || 0;
          let baseCount = 0;
          for (let k = r.min; k <= r.max; k++) baseCount += homeHist[k] || 0;
          const baseProb = clampProb((baseCount + 0.5) / (leagueN + 1.0));
          const y = m.homeScore >= r.min && m.homeScore <= r.max ? 1 : 0;

          allRawObs.push({
            competitionCode: comp,
            leagueGroup: grp,
            matchId: m.id,
            kickoffMs: m.kickoffMs,
            rangeId: r.id,
            scope: 'home',
            span: r.span,
            rawProb: clampProb(rawProb),
            baseProb,
            y,
          });
        }

        // Away team 4 ranges
        for (const r of TEAM_AWAY_RANGES) {
          let rawProb = 0;
          for (let k = r.min; k <= r.max; k++) rawProb += awayDist[k] || 0;
          let baseCount = 0;
          for (let k = r.min; k <= r.max; k++) baseCount += awayHist[k] || 0;
          const baseProb = clampProb((baseCount + 0.5) / (leagueN + 1.0));
          const y = m.awayScore >= r.min && m.awayScore <= r.max ? 1 : 0;

          allRawObs.push({
            competitionCode: comp,
            leagueGroup: grp,
            matchId: m.id,
            kickoffMs: m.kickoffMs,
            rangeId: r.id,
            scope: 'away',
            span: r.span,
            rawProb: clampProb(rawProb),
            baseProb,
            y,
          });
        }

        // 1st half ranges (only when HT data supported and available)
        if (hasHtCap && m.homeHtScore !== null && m.awayHtScore !== null && htN >= 50) {
          const avg1HG = sum1HG / htN;
          const avg1AG = sum1AG / htN;
          const base1H = Math.max(0.1, (avg1HG + avg1AG) / 2);
          const h1T = currentDecayedRate(team1HGoals.get(m.homeTeamId), m.kickoffMs, base1H, K_HALVES);
          const a1T = currentDecayedRate(team1HGoals.get(m.awayTeamId), m.kickoffMs, base1H, K_HALVES);
          if (h1T.matches >= 10 && a1T.matches >= 10) {
            const lam1 = Math.max(0.12, Math.min(2.6, avg1HG * (h1T.forRate / base1H) * (a1T.againstRate / base1H)));
            const mu1 = Math.max(0.12, Math.min(2.6, avg1AG * (a1T.forRate / base1H) * (h1T.againstRate / base1H)));
            const htTotMean = lam1 + mu1;
            const htDist = new Array(8).fill(0);
            let htSum = 0;
            for (let k = 0; k <= 7; k++) {
              const p = poissonProb(htTotMean, k);
              htDist[k] = p;
              htSum += p;
            }
            for (let k = 0; k <= 7; k++) htDist[k] /= htSum;

            const actualHtTotal = m.homeHtScore + m.awayHtScore;
            for (const r of FIRST_HALF_RANGES) {
              let rawProb = 0;
              for (let k = r.min; k <= r.max; k++) rawProb += htDist[k] || 0;
              let baseCount = 0;
              for (let k = r.min; k <= r.max; k++) baseCount += htTotalHist[k] || 0;
              const baseProb = clampProb((baseCount + 0.5) / (htN + 1.0));
              const y = actualHtTotal >= r.min && actualHtTotal <= r.max ? 1 : 0;

              allRawObs.push({
                competitionCode: comp,
                leagueGroup: grp,
                matchId: m.id,
                kickoffMs: m.kickoffMs,
                rangeId: r.id,
                scope: 'first_half',
                span: r.span,
                rawProb: clampProb(rawProb),
                baseProb,
                y,
              });
            }
          }
        }
      }

      // Causal update AFTER evaluation
      leagueN += 1;
      sumHG += m.homeScore;
      sumAG += m.awayScore;
      const totIdx = Math.min(totalHist.length - 1, m.homeScore + m.awayScore);
      const homeIdx = Math.min(homeHist.length - 1, m.homeScore);
      const awayIdx = Math.min(awayHist.length - 1, m.awayScore);
      totalHist[totIdx] += 1;
      homeHist[homeIdx] += 1;
      awayHist[awayIdx] += 1;

      if (!teamGoals.has(m.homeTeamId)) teamGoals.set(m.homeTeamId, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: m.kickoffMs });
      if (!teamGoals.has(m.awayTeamId)) teamGoals.set(m.awayTeamId, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: m.kickoffMs });
      updateTracker(teamGoals.get(m.homeTeamId)!, m.kickoffMs, m.homeScore, m.awayScore);
      updateTracker(teamGoals.get(m.awayTeamId)!, m.kickoffMs, m.awayScore, m.homeScore);

      if (m.homeHtScore !== null && m.awayHtScore !== null) {
        htN += 1;
        sum1HG += m.homeHtScore;
        sum1AG += m.awayHtScore;
        const htIdx = Math.min(htTotalHist.length - 1, m.homeHtScore + m.awayHtScore);
        htTotalHist[htIdx] += 1;

        if (!team1HGoals.has(m.homeTeamId)) team1HGoals.set(m.homeTeamId, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: m.kickoffMs });
        if (!team1HGoals.has(m.awayTeamId)) team1HGoals.set(m.awayTeamId, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: m.kickoffMs });
        updateTracker(team1HGoals.get(m.homeTeamId)!, m.kickoffMs, m.homeHtScore, m.awayHtScore);
        updateTracker(team1HGoals.get(m.awayTeamId)!, m.kickoffMs, m.awayHtScore, m.homeHtScore);
      }
    }
  }

  // Stage 2: Chronological expanding-window Platt calibration (strictly past observations only)
  console.log(`Generated ${allRawObs.length.toLocaleString()} raw Multi Goals range evaluations. Sorting chronologically for walk-forward calibration...`);
  allRawObs.sort((a, b) => a.kickoffMs - b.kickoffMs || a.matchId.localeCompare(b.matchId));

  // Maintain expanding history per scope: 'full_match', 'team' (home+away), 'first_half'
  type CalBucket = 'full_match' | 'team' | 'first_half';
  const bucketOf = (s: RawPredObs['scope']): CalBucket => (s === 'home' || s === 'away' ? 'team' : s);

  const pastForPlatt: Record<CalBucket, Array<{ raw: number; y: number }>> = {
    full_match: [],
    team: [],
    first_half: [],
  };
  const currentPlatt: Record<CalBucket, { a: number; b: number }> = {
    full_match: { a: 1.0, b: 0.0 },
    team: { a: 1.0, b: 0.0 },
    first_half: { a: 1.0, b: 0.0 },
  };
  const lastRefitSize: Record<CalBucket, number> = {
    full_match: 0,
    team: 0,
    first_half: 0,
  };

  interface CalObs extends RawPredObs {
    calProb: number;
  }
  const scoredObs: CalObs[] = [];

  // Strict split: first 25% of chronological timeline seeds initial Platt params,
  // and remaining 75% are strictly out-of-sample calibrated predictions with periodic expanding refits.
  const calWarmupCount = Math.floor(allRawObs.length * 0.25);

  for (let i = 0; i < allRawObs.length; i++) {
    const o = allRawObs[i];
    const bkt = bucketOf(o.scope);

    // Refit Platt scaling periodically strictly on prior observations
    if (pastForPlatt[bkt].length >= 500 && pastForPlatt[bkt].length - lastRefitSize[bkt] >= 4000) {
      currentPlatt[bkt] = fitPlattParameters(pastForPlatt[bkt]);
      lastRefitSize[bkt] = pastForPlatt[bkt].length;
    }

    if (i >= calWarmupCount) {
      const p = currentPlatt[bkt];
      const calProb = applyPlatt(o.rawProb, p.a, p.b);
      scoredObs.push({ ...o, calProb });
    }

    pastForPlatt[bkt].push({ raw: o.rawProb, y: o.y });
  }

  // Final production Platt params fitted on past 80% of all historical observations (held strictly before live)
  const prodCut = Math.floor(allRawObs.length * 0.80);
  const prodObs: Record<CalBucket, Array<{ raw: number; y: number }>> = {
    full_match: [],
    team: [],
    first_half: [],
  };
  const allObsForGlobalFit: Array<{ raw: number; y: number }> = [];
  for (let i = 0; i < prodCut; i++) {
    const o = allRawObs[i];
    prodObs[bucketOf(o.scope)].push({ raw: o.rawProb, y: o.y });
    allObsForGlobalFit.push({ raw: o.rawProb, y: o.y });
  }
  const finalPlatt = {
    global: fitPlattParameters(allObsForGlobalFit),
    fullMatch: fitPlattParameters(prodObs.full_match),
    team: fitPlattParameters(prodObs.team),
    firstHalf: fitPlattParameters(prodObs.first_half),
  };

  console.log('\nFitted Production Platt Parameters (past 80% historical window):', JSON.stringify(finalPlatt));

  // Stage 3: Compute overall, per-league, per-group, per-range, calibration bins, and line-ladder tier metrics
  let overallModBrier = 0, overallBaseBrier = 0, overallModLL = 0, overallBaseLL = 0;
  const calBins = Array.from({ length: 10 }, (_, idx) => ({
    binRange: `${idx * 10}-${(idx + 1) * 10}%`,
    count: 0,
    sumPred: 0,
    sumActual: 0,
  }));

  const byRange = new Map<string, {
    rangeId: string;
    scope: string;
    span: number;
    n: number;
    hits: number;
    sumPred: number;
    sumModBrier: number;
    sumBaseBrier: number;
    sumModLL: number;
    sumBaseLL: number;
  }>();

  // Match clusters per league for bootstrap CIs + line-ladder top pick simulation per match
  const leagueClusters = new Map<string, Map<string, { sumSqMod: number; sumSqBase: number; sumModLL: number; sumBaseLL: number; k: number }>>();
  const groupClusters = new Map<LeagueGroupKey, Map<string, { sumSqMod: number; sumSqBase: number; k: number }>>();
  const matchObsMap = new Map<string, CalObs[]>();

  for (const o of scoredObs) {
    const mB = (o.calProb - o.y) ** 2;
    const bB = (o.baseProb - o.y) ** 2;
    const mL = logLossVal(o.calProb, o.y);
    const bL = logLossVal(o.baseProb, o.y);

    overallModBrier += mB;
    overallBaseBrier += bB;
    overallModLL += mL;
    overallBaseLL += bL;

    const binIdx = Math.min(9, Math.max(0, Math.floor(o.calProb * 10)));
    calBins[binIdx].count += 1;
    calBins[binIdx].sumPred += o.calProb;
    calBins[binIdx].sumActual += o.y;

    let rAcc = byRange.get(o.rangeId);
    if (!rAcc) {
      rAcc = { rangeId: o.rangeId, scope: o.scope, span: o.span, n: 0, hits: 0, sumPred: 0, sumModBrier: 0, sumBaseBrier: 0, sumModLL: 0, sumBaseLL: 0 };
      byRange.set(o.rangeId, rAcc);
    }
    rAcc.n += 1;
    rAcc.hits += o.y;
    rAcc.sumPred += o.calProb;
    rAcc.sumModBrier += mB;
    rAcc.sumBaseBrier += bB;
    rAcc.sumModLL += mL;
    rAcc.sumBaseLL += bL;

    if (!leagueClusters.has(o.competitionCode)) leagueClusters.set(o.competitionCode, new Map());
    const lMap = leagueClusters.get(o.competitionCode)!;
    let lc = lMap.get(o.matchId);
    if (!lc) {
      lc = { sumSqMod: 0, sumSqBase: 0, sumModLL: 0, sumBaseLL: 0, k: 0 };
      lMap.set(o.matchId, lc);
    }
    lc.sumSqMod += mB;
    lc.sumSqBase += bB;
    lc.sumModLL += mL;
    lc.sumBaseLL += bL;
    lc.k += 1;

    if (!groupClusters.has(o.leagueGroup)) groupClusters.set(o.leagueGroup, new Map());
    const gMap = groupClusters.get(o.leagueGroup)!;
    let gc = gMap.get(o.matchId);
    if (!gc) {
      gc = { sumSqMod: 0, sumSqBase: 0, k: 0 };
      gMap.set(o.matchId, gc);
    }
    gc.sumSqMod += mB;
    gc.sumSqBase += bB;
    gc.k += 1;

    if (!matchObsMap.has(o.matchId)) matchObsMap.set(o.matchId, []);
    matchObsMap.get(o.matchId)!.push(o);
  }

  const totalN = Math.max(1, scoredObs.length);
  const overallModelBrier = overallModBrier / totalN;
  const overallNaiveBrier = overallBaseBrier / totalN;
  const overallModelLL = overallModLL / totalN;
  const overallNaiveLL = overallBaseLL / totalN;
  const overallBss = overallNaiveBrier > 0 ? 1 - overallModelBrier / overallNaiveBrier : 0;

  let ece = 0;
  const calibrationTable = calBins.map(b => {
    const meanPred = b.count > 0 ? b.sumPred / b.count : 0;
    const obsFreq = b.count > 0 ? b.sumActual / b.count : 0;
    if (b.count > 0) {
      ece += (b.count / totalN) * Math.abs(obsFreq - meanPred);
    }
    return {
      binRange: b.binRange,
      count: b.count,
      meanPredicted: Number(meanPred.toFixed(4)),
      observedFrequency: Number(obsFreq.toFixed(4)),
      calibrationError: Number((obsFreq - meanPred).toFixed(4)),
    };
  });

  // Deterministic bootstrapper
  let rngSeed = 20261126;
  const nextRand = () => {
    rngSeed = (rngSeed * 16807) % 2147483647;
    return (rngSeed - 1) / 2147483646;
  };

  function bootstrapBssCI(clusters: Array<{ sumSqMod: number; sumSqBase: number; k: number }>): {
    modelBrier: number;
    baseBrier: number;
    brierSkill: number;
    ci95Lower: number;
    ci95Upper: number;
  } {
    const nM = clusters.length;
    if (nM === 0) return { modelBrier: 0, baseBrier: 0, brierSkill: 0, ci95Lower: -1, ci95Upper: 1 };
    let totM = 0, totB = 0, totK = 0;
    for (const c of clusters) {
      totM += c.sumSqMod;
      totB += c.sumSqBase;
      totK += c.k;
    }
    const modelBrier = totM / totK;
    const baseBrier = totB / totK;
    const brierSkill = baseBrier > 0 ? 1 - modelBrier / baseBrier : 0;

    const boots = new Array<number>(1000);
    for (let it = 0; it < 1000; it++) {
      let bM = 0, bB = 0;
      for (let i = 0; i < nM; i++) {
        const c = clusters[Math.floor(nextRand() * nM)];
        bM += c.sumSqMod;
        bB += c.sumSqBase;
      }
      boots[it] = bB > 0 ? 1 - bM / bB : 0;
    }
    boots.sort((a, b) => a - b);
    return {
      modelBrier: Number(modelBrier.toFixed(5)),
      baseBrier: Number(baseBrier.toFixed(5)),
      brierSkill: Number(brierSkill.toFixed(4)),
      ci95Lower: Number(boots[25].toFixed(4)),
      ci95Upper: Number(boots[975].toFixed(4)),
    };
  }

  // Per-league table
  const perLeagueResults: Record<string, {
    competitionCode: string;
    leagueGroup: LeagueGroupKey;
    matches: number;
    samples: number;
    modelBrier: number;
    baseBrier: number;
    modelLogLoss: number;
    baseLogLoss: number;
    brierSkill: number;
    ci95Lower: number;
    ci95Upper: number;
    beatsBaseline: boolean;
    tierMode: 'ENABLED' | 'SPECULATIVE_ONLY' | 'DISABLED';
  }> = {};

  for (const [comp, mMap] of Array.from(leagueClusters.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const clusters = Array.from(mMap.values());
    const boot = bootstrapBssCI(clusters);
    let totK = 0, totMLL = 0, totBLL = 0;
    for (const c of clusters) {
      totK += c.k;
      totMLL += c.sumModLL;
      totBLL += c.sumBaseLL;
    }
    const modelLL = totMLL / Math.max(1, totK);
    const baseLL = totBLL / Math.max(1, totK);
    const beatsBaseline = clusters.length >= 30 && boot.brierSkill > 0 && boot.ci95Lower > 0 && boot.modelBrier < boot.baseBrier;
    const tierMode: 'ENABLED' | 'SPECULATIVE_ONLY' | 'DISABLED' =
      clusters.length < 30
        ? 'DISABLED'
        : beatsBaseline
        ? 'ENABLED'
        : 'SPECULATIVE_ONLY';

    perLeagueResults[comp] = {
      competitionCode: comp,
      leagueGroup: getLeagueGroup(comp),
      matches: clusters.length,
      samples: totK,
      modelBrier: boot.modelBrier,
      baseBrier: boot.baseBrier,
      modelLogLoss: Number(modelLL.toFixed(5)),
      baseLogLoss: Number(baseLL.toFixed(5)),
      brierSkill: boot.brierSkill,
      ci95Lower: boot.ci95Lower,
      ci95Upper: boot.ci95Upper,
      beatsBaseline,
      tierMode,
    };
  }

  // Per-group validation
  const perGroupValidation: Record<LeagueGroupKey, any> = {
    UK_WITH_REF: null,
    EURO_NO_REF: null,
    EXTRA_GOALS_ONLY: null,
  };
  for (const grp of ['UK_WITH_REF', 'EURO_NO_REF', 'EXTRA_GOALS_ONLY'] as LeagueGroupKey[]) {
    const gMap = groupClusters.get(grp);
    const clusters = gMap ? Array.from(gMap.values()) : [];
    const boot = bootstrapBssCI(clusters);
    const totalSamples = clusters.reduce((s, c) => s + c.k, 0);
    const allowed = clusters.length >= 30 && boot.brierSkill > 0 && boot.ci95Lower > 0;
    perGroupValidation[grp] = {
      leagueGroup: grp,
      market: 'multi_goals',
      matches: clusters.length,
      samples: totalSamples,
      modelBrier: boot.modelBrier,
      baseBrier: boot.baseBrier,
      brierSkill: boot.brierSkill,
      ci95Lower: boot.ci95Lower,
      ci95Upper: boot.ci95Upper,
      allowed,
      reason: allowed
        ? `Allowed: Multi goals BSS +${boot.brierSkill.toFixed(4)} (95% CI [+${boot.ci95Lower.toFixed(4)}, +${boot.ci95Upper.toFixed(4)}] > 0 across ${clusters.length} held-out matches).`
        : `Restricted: Multi goals BSS ${boot.brierSkill.toFixed(4)} (95% CI [${boot.ci95Lower.toFixed(4)}, ${boot.ci95Upper.toFixed(4)}]).`,
    };
  }

  // Line-ladder simulation per match -> Hit rate by tier
  // Rules:
  // - Tightness: span <= 3 always eligible; span === 4 eligible ONLY when calProb > 0.80; span >= 5 excluded
  // - Tiering: HIGH requires calProb >= 0.60 (preferring tighter ranges at >= 60%), MEDIUM >= 0.48 & > baseProb, SPECULATIVE otherwise (or when league failed naive baseline)
  const tierStats: Record<'HIGH' | 'MEDIUM' | 'SPECULATIVE', { n: number; hits: number; sumPred: number; sumBrier: number; sumBaseBrier: number }> = {
    HIGH: { n: 0, hits: 0, sumPred: 0, sumBrier: 0, sumBaseBrier: 0 },
    MEDIUM: { n: 0, hits: 0, sumPred: 0, sumBrier: 0, sumBaseBrier: 0 },
    SPECULATIVE: { n: 0, hits: 0, sumPred: 0, sumBrier: 0, sumBaseBrier: 0 },
  };
  const rangeTierStats: Record<'HIGH' | 'MEDIUM' | 'SPECULATIVE', { n: number; hits: number; sumPred: number; sumBrier: number; sumBaseBrier: number }> = {
    HIGH: { n: 0, hits: 0, sumPred: 0, sumBrier: 0, sumBaseBrier: 0 },
    MEDIUM: { n: 0, hits: 0, sumPred: 0, sumBrier: 0, sumBaseBrier: 0 },
    SPECULATIVE: { n: 0, hits: 0, sumPred: 0, sumBrier: 0, sumBaseBrier: 0 },
  };
  const selectedRangeCounts = new Map<string, { n: number; hits: number }>();

  for (const [, obsList] of Array.from(matchObsMap.entries())) {
    const eligible = obsList.filter(o => {
      if (o.span <= 3) return true;
      if (o.span === 4) return o.calProb > 0.80;
      return false;
    });
    if (eligible.length === 0) continue;

    for (const o of eligible) {
      const lPass = perLeagueResults[o.competitionCode]?.beatsBaseline ?? true;
      let oTier: 'HIGH' | 'MEDIUM' | 'SPECULATIVE' = 'SPECULATIVE';
      if (!lPass) {
        oTier = 'SPECULATIVE';
      } else if (o.calProb >= 0.60 && (o.span <= 3 || o.calProb > 0.80)) {
        oTier = 'HIGH';
      } else if (o.calProb >= 0.48 && o.calProb > o.baseProb) {
        oTier = 'MEDIUM';
      }
      rangeTierStats[oTier].n += 1;
      rangeTierStats[oTier].hits += o.y;
      rangeTierStats[oTier].sumPred += o.calProb;
      rangeTierStats[oTier].sumBrier += (o.calProb - o.y) ** 2;
      rangeTierStats[oTier].sumBaseBrier += (o.baseProb - o.y) ** 2;
    }

    // Score candidates: prefer High >= 0.60 with tightest span & highest calibrated prob
    eligible.sort((a, b) => {
      const aHigh = a.calProb >= 0.60 ? 1 : 0;
      const bHigh = b.calProb >= 0.60 ? 1 : 0;
      if (aHigh !== bHigh) return bHigh - aHigh;
      // Within High (>= 60%), tighter span (2 or 3 vs 4) earns a clear preference bonus
      const aScore = a.calProb - (a.span - 2) * 0.04 + (a.calProb - a.baseProb) * 0.25;
      const bScore = b.calProb - (b.span - 2) * 0.04 + (b.calProb - b.baseProb) * 0.25;
      return bScore - aScore;
    });

    const pick = eligible[0];
    const leaguePass = perLeagueResults[pick.competitionCode]?.beatsBaseline ?? true;
    let tier: 'HIGH' | 'MEDIUM' | 'SPECULATIVE' = 'SPECULATIVE';
    if (!leaguePass) {
      tier = 'SPECULATIVE';
    } else if (pick.calProb >= 0.60 && (pick.span <= 3 || pick.calProb > 0.80)) {
      tier = 'HIGH';
    } else if (pick.calProb >= 0.48 && pick.calProb > pick.baseProb) {
      tier = 'MEDIUM';
    }

    tierStats[tier].n += 1;
    tierStats[tier].hits += pick.y;
    tierStats[tier].sumPred += pick.calProb;
    tierStats[tier].sumBrier += (pick.calProb - pick.y) ** 2;
    tierStats[tier].sumBaseBrier += (pick.baseProb - pick.y) ** 2;

    const rc = selectedRangeCounts.get(pick.rangeId) || { n: 0, hits: 0 };
    rc.n += 1;
    rc.hits += pick.y;
    selectedRangeCounts.set(pick.rangeId, rc);
  }

  // Print Comprehensive Report
  console.log('\n====================================================================================================');
  console.log('MULTI GOALS WALK-FORWARD BACKTEST SUMMARY (OUT-OF-SAMPLE STRICTLY CAUSAL)');
  console.log('====================================================================================================');
  console.log(`Out-of-sample range observations: ${scoredObs.length.toLocaleString()} across ${matchObsMap.size.toLocaleString()} held-out matches (${Object.keys(perLeagueResults).length} leagues)`);
  console.log(`Overall Model Brier:  ${overallModelBrier.toFixed(5)} vs Naive League Baseline: ${overallNaiveBrier.toFixed(5)} (BSS: ${(overallBss * 100).toFixed(2)}%)`);
  console.log(`Overall Model LogLoss:${overallModelLL.toFixed(5)} vs Naive League Baseline: ${overallNaiveLL.toFixed(5)}`);
  console.log(`Expected Calibration Error (ECE): ${(ece * 100).toFixed(2)}%`);

  console.log('\n--- 1. PER-LEAGUE WALK-FORWARD PERFORMANCE VS NAIVE TOTAL-GOALS DISTRIBUTION BASELINE ---');
  console.log('League | Group            | Matches | ModelBrier | BaseBrier | BSS      | 95% CI               | ModelLL | BaseLL  | Status');
  console.log('-------+------------------+---------+------------+-----------+----------+----------------------+---------+---------+-----------------');
  for (const r of Object.values(perLeagueResults)) {
    const ci = `[${r.ci95Lower >= 0 ? '+' : ''}${r.ci95Lower.toFixed(4)}, ${r.ci95Upper >= 0 ? '+' : ''}${r.ci95Upper.toFixed(4)}]`;
    const bss = `${r.brierSkill >= 0 ? '+' : ''}${(r.brierSkill * 100).toFixed(2)}%`;
    console.log(
      `${r.competitionCode.padEnd(6)} | ${r.leagueGroup.padEnd(16)} | ${String(r.matches).padStart(7)} | ${r.modelBrier.toFixed(5).padStart(10)} | ${r.baseBrier.toFixed(5).padStart(9)} | ${bss.padStart(8)} | ${ci.padEnd(20)} | ${r.modelLogLoss.toFixed(5)} | ${r.baseLogLoss.toFixed(5)} | ${r.tierMode}`
    );
  }

  console.log('\n--- 2. CALIBRATION TABLE (10 BINS) ---');
  console.log('Bin       | Count   | Mean Pred | Observed Hit | Error');
  console.log('----------+---------+-----------+--------------+--------');
  for (const b of calibrationTable) {
    console.log(
      `${b.binRange.padEnd(9)} | ${String(b.count).padStart(7)} | ${(b.meanPredicted * 100).toFixed(2).padStart(8)}% | ${(b.observedFrequency * 100).toFixed(2).padStart(11)}% | ${(b.calibrationError >= 0 ? '+' : '')}${(b.calibrationError * 100).toFixed(2)}%`
    );
  }

  console.log('\n--- 3. HIT RATE & BRIER BY RANGE ---');
  console.log('Range ID                     | Scope      | Span | Samples | MeanPred | HitRate  | ModelBrier | BaseBrier | BeatsBase');
  console.log('-----------------------------+------------+------+---------+----------+----------+------------+-----------+----------');
  for (const r of Array.from(byRange.values())) {
    const mB = r.sumModBrier / r.n;
    const bB = r.sumBaseBrier / r.n;
    console.log(
      `${r.rangeId.padEnd(28)} | ${r.scope.padEnd(10)} | ${String(r.span).padStart(4)} | ${String(r.n).padStart(7)} | ${(r.sumPred / r.n * 100).toFixed(1).padStart(7)}% | ${(r.hits / r.n * 100).toFixed(1).padStart(7)}% | ${mB.toFixed(5).padStart(10)} | ${bB.toFixed(5).padStart(9)} | ${mB < bB ? 'YES' : 'NO'}`
    );
  }

  console.log('\n--- 4. LINE-LADDER RECOMMENDED PICK HIT RATE BY TIER ---');
  console.log('Tier        | Matches | MeanPred | HitRate  | ModelBrier | BaseBrier');
  console.log('------------+---------+----------+----------+------------+----------');
  for (const tier of ['HIGH', 'MEDIUM', 'SPECULATIVE'] as const) {
    const t = tierStats[tier];
    if (t.n === 0) {
      console.log(`${tier.padEnd(11)} |       0 |        - |        - |          - |         -`);
      continue;
    }
    console.log(
      `${tier.padEnd(11)} | ${String(t.n).padStart(7)} | ${(t.sumPred / t.n * 100).toFixed(1).padStart(7)}% | ${(t.hits / t.n * 100).toFixed(1).padStart(7)}% | ${(t.sumBrier / t.n).toFixed(5).padStart(10)} | ${(t.sumBaseBrier / t.n).toFixed(5).padStart(9)}`
    );
  }

  console.log('\n--- 4b. ALL ELIGIBLE TIGHT RANGE EVALUATIONS BY TIER ---');
  console.log('Tier        | Samples | MeanPred | HitRate  | ModelBrier | BaseBrier');
  console.log('------------+---------+----------+----------+------------+----------');
  for (const tier of ['HIGH', 'MEDIUM', 'SPECULATIVE'] as const) {
    const t = rangeTierStats[tier];
    if (t.n === 0) {
      console.log(`${tier.padEnd(11)} |       0 |        - |        - |          - |         -`);
      continue;
    }
    console.log(
      `${tier.padEnd(11)} | ${String(t.n).padStart(7)} | ${(t.sumPred / t.n * 100).toFixed(1).padStart(7)}% | ${(t.hits / t.n * 100).toFixed(1).padStart(7)}% | ${(t.sumBrier / t.n).toFixed(5).padStart(10)} | ${(t.sumBaseBrier / t.n).toFixed(5).padStart(9)}`
    );
  }

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    overall: {
      heldOutMatches: matchObsMap.size,
      totalRangeEvaluations: scoredObs.length,
      modelBrier: Number(overallModelBrier.toFixed(5)),
      naiveBrier: Number(overallNaiveBrier.toFixed(5)),
      brierSkill: Number(overallBss.toFixed(4)),
      modelLogLoss: Number(overallModelLL.toFixed(5)),
      naiveLogLoss: Number(overallNaiveLL.toFixed(5)),
      ece: Number(ece.toFixed(5)),
    },
    fittedPlattParams: finalPlatt,
    calibrationTable,
    perLeague: perLeagueResults,
    perGroup: perGroupValidation,
    byRange: Array.from(byRange.values()).map(r => ({
      rangeId: r.rangeId,
      scope: r.scope,
      span: r.span,
      samples: r.n,
      meanPred: Number((r.sumPred / r.n).toFixed(4)),
      hitRate: Number((r.hits / r.n).toFixed(4)),
      modelBrier: Number((r.sumModBrier / r.n).toFixed(5)),
      baseBrier: Number((r.sumBaseBrier / r.n).toFixed(5)),
    })),
    byTier: Object.fromEntries(
      (['HIGH', 'MEDIUM', 'SPECULATIVE'] as const).map(tier => {
        const t = tierStats[tier];
        return [
          tier,
          {
            matches: t.n,
            meanPred: t.n > 0 ? Number((t.sumPred / t.n).toFixed(4)) : 0,
            hitRate: t.n > 0 ? Number((t.hits / t.n).toFixed(4)) : 0,
            modelBrier: t.n > 0 ? Number((t.sumBrier / t.n).toFixed(5)) : 0,
            baseBrier: t.n > 0 ? Number((t.sumBaseBrier / t.n).toFixed(5)) : 0,
          },
        ];
      })
    ),
    byRangeTier: Object.fromEntries(
      (['HIGH', 'MEDIUM', 'SPECULATIVE'] as const).map(tier => {
        const t = rangeTierStats[tier];
        return [
          tier,
          {
            samples: t.n,
            meanPred: t.n > 0 ? Number((t.sumPred / t.n).toFixed(4)) : 0,
            hitRate: t.n > 0 ? Number((t.hits / t.n).toFixed(4)) : 0,
            modelBrier: t.n > 0 ? Number((t.sumBrier / t.n).toFixed(5)) : 0,
            baseBrier: t.n > 0 ? Number((t.sumBaseBrier / t.n).toFixed(5)) : 0,
          },
        ];
      })
    ),
  };

  fs.writeFileSync('/tmp/multi_goals_backtest_report.json', JSON.stringify(reportPayload, null, 2), 'utf-8');
  console.log('\nSaved full JSON report to /tmp/multi_goals_backtest_report.json');

  if (writeParams) {
    for (const grp of ['UK_WITH_REF', 'EURO_NO_REF', 'EXTRA_GOALS_ONLY'] as LeagueGroupKey[]) {
      existingParams.walkForwardMarketValidation = existingParams.walkForwardMarketValidation || {};
      existingParams.walkForwardMarketValidation[grp] = existingParams.walkForwardMarketValidation[grp] || {};
      existingParams.walkForwardMarketValidation[grp]['multi_goals'] = perGroupValidation[grp];
    }
    existingParams.multiGoalsValidation = {
      generatedAt: reportPayload.generatedAt,
      overall: reportPayload.overall,
      plattParams: finalPlatt,
      byTier: reportPayload.byTier,
      perLeague: perLeagueResults,
    };
    fs.writeFileSync(calibratedParamsPath, JSON.stringify(existingParams, null, 2), 'utf-8');
    console.log(`Updated ${calibratedParamsPath} with Multi Goals validation & fitted Platt params.`);
  }
}

main().catch(err => {
  console.error('Multi goals backtest failed:', err);
  process.exit(1);
});
