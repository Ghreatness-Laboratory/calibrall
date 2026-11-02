import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface RawMatch {
  id: string;
  kickoff_time: string;
  season: string;
  competition_code: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  home_half_time_score?: number | null;
  away_half_time_score?: number | null;
  home_shots?: number | null;
  away_shots?: number | null;
  home_corners?: number | null;
  away_corners?: number | null;
  home_yellow_cards?: number | null;
  away_yellow_cards?: number | null;
  home_red_cards?: number | null;
  away_red_cards?: number | null;
  referee?: string | null;
  closing_odds?: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    over25?: number;
    under25?: number;
    asianHandicapLine?: number;
    asianHandicapHome?: number;
    asianHandicapAway?: number;
  } | null;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function dixonColesTau(x: number, y: number, lambda: number, mu: number, rho: number = -0.13): number {
  if (x === 0 && y === 0) return Math.max(0, 1 - (lambda * mu * rho));
  if (x === 0 && y === 1) return Math.max(0, 1 + (lambda * rho));
  if (x === 1 && y === 0) return Math.max(0, 1 + (mu * rho));
  if (x === 1 && y === 1) return Math.max(0, 1 - rho);
  return 1.0;
}

function logLossBinary(actual: number, predicted: number): number {
  const p = Math.max(1e-6, Math.min(1 - 1e-6, predicted));
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}

function logLossMulti(actualIndex: number, probs: number[]): number {
  const p = Math.max(1e-6, Math.min(1 - 1e-6, probs[actualIndex]));
  return -Math.log(p);
}

// PRNG for deterministic bootstrap
function createRng(seed: number) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function bootstrapCi(diffs: number[], resamples: number = 2000, seed: number = 42): [number, number] {
  const n = diffs.length;
  if (n === 0) return [0, 0];
  const rng = createRng(seed);
  const means: number[] = new Array(resamples);

  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sum += diffs[idx];
    }
    means[r] = sum / n;
  }
  means.sort((a, b) => a - b);
  const lowerIdx = Math.floor(0.025 * resamples);
  const upperIdx = Math.floor(0.975 * resamples);
  return [means[lowerIdx], means[upperIdx]];
}

async function run() {
  console.log('=== CALIBRALL PHASE 3c: FULL CLOSING-ODDS VALIDATION & AUDIT ===\n');

  const matchesPath = path.join(process.cwd(), 'src/lib/data/free_sources_matches.json');
  const rawMatches: RawMatch[] = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

  const allMatches = rawMatches
    .filter(m => Boolean(m.kickoff_time && m.home_score != null && m.away_score != null))
    .map(m => ({
      id: m.id,
      date: (m.kickoff_time || '').slice(0, 10),
      kickoffTime: m.kickoff_time,
      season: m.season,
      competitionCode: m.competition_code,
      homeTeamId: m.home_team_id,
      homeTeamName: m.home_team_name,
      awayTeamId: m.away_team_id,
      awayTeamName: m.away_team_name,
      homeScore: m.home_score,
      awayScore: m.away_score,
      homeHalfTimeScore: m.home_half_time_score,
      awayHalfTimeScore: m.away_half_time_score,
      homeCorners: m.home_corners,
      awayCorners: m.away_corners,
      homeYellowCards: m.home_yellow_cards,
      awayYellowCards: m.away_yellow_cards,
      homeRedCards: m.home_red_cards,
      awayRedCards: m.away_red_cards,
      referee: m.referee,
      closingOdds: m.closing_odds,
    }))
    .sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));

  const warmupMatches = allMatches.filter(m => m.date < '2024-08-01');
  const testMatches = allMatches.filter(m => m.date >= '2024-08-01' && m.date <= '2026-06-01');

  // Rolling history
  interface TeamStatsState {
    matches: number;
    homeMatches: number;
    awayMatches: number;
    goalsScored: number;
    goalsConceded: number;
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
    lastMatchDate: string;
    formGoals: number[];
  }

  const teamHistory = new Map<string, TeamStatsState>();
  const venueH2hHistory = new Map<string, { homeWins: number; draws: number; awayWins: number; total: number }>();

  function updateHistory(m: typeof allMatches[0]) {
    let h = teamHistory.get(m.homeTeamId);
    if (!h) {
      h = { matches: 0, homeMatches: 0, awayMatches: 0, goalsScored: 0, goalsConceded: 0, homeGoalsScored: 0, homeGoalsConceded: 0, awayGoalsScored: 0, awayGoalsConceded: 0, lastMatchDate: '', formGoals: [] };
      teamHistory.set(m.homeTeamId, h);
    }
    h.matches++;
    h.homeMatches++;
    h.goalsScored += m.homeScore;
    h.goalsConceded += m.awayScore;
    h.homeGoalsScored += m.homeScore;
    h.homeGoalsConceded += m.awayScore;
    h.lastMatchDate = m.date;
    h.formGoals.push(m.homeScore);
    if (h.formGoals.length > 8) h.formGoals.shift();

    let a = teamHistory.get(m.awayTeamId);
    if (!a) {
      a = { matches: 0, homeMatches: 0, awayMatches: 0, goalsScored: 0, goalsConceded: 0, homeGoalsScored: 0, homeGoalsConceded: 0, awayGoalsScored: 0, awayGoalsConceded: 0, lastMatchDate: '', formGoals: [] };
      teamHistory.set(m.awayTeamId, a);
    }
    a.matches++;
    a.awayMatches++;
    a.goalsScored += m.awayScore;
    a.goalsConceded += m.homeScore;
    a.awayGoalsScored += m.awayScore;
    a.awayGoalsConceded += m.homeScore;
    a.lastMatchDate = m.date;
    a.formGoals.push(m.awayScore);
    if (a.formGoals.length > 8) a.formGoals.shift();

    const h2hKey = `${m.homeTeamId}_vs_${m.awayTeamId}`;
    const h2h = venueH2hHistory.get(h2hKey) || { homeWins: 0, draws: 0, awayWins: 0, total: 0 };
    h2h.total++;
    if (m.homeScore > m.awayScore) h2h.homeWins++;
    else if (m.homeScore === m.awayScore) h2h.draws++;
    else h2h.awayWins++;
    venueH2hHistory.set(h2hKey, h2h);
  }

  for (const m of warmupMatches) {
    updateHistory(m);
  }

  interface EvalRecord {
    match: typeof testMatches[0];
    matrix: number[][]; // 9x9 score matrix
    lambdaHome: number;
    muAway: number;
    blended1X2: [number, number, number];
    closingOdds1X2: [number, number, number];
    modelOver25: number;
    closingOver25: number;
    modelUnder25: number;
    closingUnder25: number;
    ahLine: number | null;
    closingAhHomeOdds: number | null;
    closingAhAwayOdds: number | null;
    closingAhHomeProb: number | null;
    modelAhHomeProb: number | null;
    ahOutcome: number | null; // 1 = Home win, 0 = Away win, 0.5 = Push (or quarter push/win)
  }

  const evalRecords: EvalRecord[] = [];

  for (const m of testMatches) {
    const h = teamHistory.get(m.homeTeamId);
    const a = teamHistory.get(m.awayTeamId);

    if (!h || !a || h.matches < 5 || a.matches < 5) {
      updateHistory(m);
      continue;
    }

    const avgLeagueHomeGoals = 1.48;
    const avgLeagueAwayGoals = 1.18;

    const homeAtt = Math.max(0.6, (h.goalsScored / h.matches) / avgLeagueHomeGoals);
    const awayDef = Math.max(0.6, (a.goalsConceded / a.matches) / avgLeagueHomeGoals);
    const awayAtt = Math.max(0.6, (a.goalsScored / a.matches) / avgLeagueAwayGoals);
    const homeDef = Math.max(0.6, (h.goalsConceded / h.matches) / avgLeagueAwayGoals);

    const homeSplitAtt = h.homeMatches > 2 ? ((h.homeGoalsScored / h.homeMatches) / avgLeagueHomeGoals) : homeAtt;
    const awaySplitDef = a.awayMatches > 2 ? ((a.awayGoalsConceded / a.awayMatches) / avgLeagueHomeGoals) : awayDef;
    const awaySplitAtt = a.awayMatches > 2 ? ((a.awayGoalsScored / a.awayMatches) / avgLeagueAwayGoals) : awayAtt;
    const homeSplitDef = h.homeMatches > 2 ? ((h.homeGoalsConceded / h.homeMatches) / avgLeagueAwayGoals) : homeDef;

    const hFormAvg = h.formGoals.length ? h.formGoals.reduce((s, x) => s + x, 0) / h.formGoals.length : 1.4;
    const aFormAvg = a.formGoals.length ? a.formGoals.reduce((s, x) => s + x, 0) / a.formGoals.length : 1.1;
    const hFormAdj = 1.0 + 0.08 * (hFormAvg - 1.4);
    const aFormAdj = 1.0 + 0.08 * (aFormAvg - 1.1);

    const h2h = venueH2hHistory.get(`${m.homeTeamId}_vs_${m.awayTeamId}`);
    let h2hHomeBoost = 1.0;
    if (h2h && h2h.total >= 3) {
      const empiricalWinRate = h2h.homeWins / h2h.total;
      const shrunk = (h2h.total * empiricalWinRate + 6 * 0.45) / (h2h.total + 6);
      h2hHomeBoost = 1.0 + 0.12 * (shrunk - 0.45);
    }

    let hRestAdj = 1.0;
    let aRestAdj = 1.0;
    if (h.lastMatchDate) {
      const diffDays = (new Date(m.date).getTime() - new Date(h.lastMatchDate).getTime()) / (1000 * 3600 * 24);
      if (diffDays < 3.5) hRestAdj = 0.94;
    }
    if (a.lastMatchDate) {
      const diffDays = (new Date(m.date).getTime() - new Date(a.lastMatchDate).getTime()) / (1000 * 3600 * 24);
      if (diffDays < 3.5) aRestAdj = 0.94;
    }

    const lambdaHome = Math.max(0.2, avgLeagueHomeGoals * (0.6 * homeAtt + 0.4 * homeSplitAtt) * (0.6 * awayDef + 0.4 * awaySplitDef) * hFormAdj * h2hHomeBoost * hRestAdj);
    const muAway = Math.max(0.2, avgLeagueAwayGoals * (0.6 * awayAtt + 0.4 * awaySplitAtt) * (0.6 * homeDef + 0.4 * homeSplitDef) * aFormAdj * (2.0 - h2hHomeBoost) * aRestAdj);

    const matrix: number[][] = [];
    let hw = 0, dr = 0, aw = 0, tot = 0;
    let over25 = 0;

    for (let x = 0; x <= 8; x++) {
      matrix[x] = [];
      for (let y = 0; y <= 8; y++) {
        const p = poisson(lambdaHome, x) * poisson(muAway, y) * dixonColesTau(x, y, lambdaHome, muAway, -0.13);
        matrix[x][y] = p;
        tot += p;
        if (x > y) hw += p;
        else if (x === y) dr += p;
        else aw += p;
        if (x + y > 2.5) over25 += p;
      }
    }

    // Normalize matrix
    for (let x = 0; x <= 8; x++) {
      for (let y = 0; y <= 8; y++) {
        matrix[x][y] /= tot;
      }
    }

    const pRawHW = hw / tot;
    const pRawDr = dr / tot;
    const pRawAW = aw / tot;
    const pModelOver25 = over25 / tot;
    const pModelUnder25 = 1 - pModelOver25;

    // 1X2 closing odds
    if (!m.closingOdds?.homeWin || !m.closingOdds?.draw || !m.closingOdds?.awayWin) {
      updateHistory(m);
      continue;
    }

    const invH = 1 / m.closingOdds.homeWin;
    const invD = 1 / m.closingOdds.draw;
    const invA = 1 / m.closingOdds.awayWin;
    const sumInv1X2 = invH + invD + invA;
    const closing1X2: [number, number, number] = [invH / sumInv1X2, invD / sumInv1X2, invA / sumInv1X2];

    const pHW = 0.85 * pRawHW + 0.15 * closing1X2[0];
    const pDr = 0.85 * pRawDr + 0.15 * closing1X2[1];
    const pAW = 0.85 * pRawAW + 0.15 * closing1X2[2];

    // Over/Under 2.5 closing odds
    let closingOver25 = 0.5;
    let closingUnder25 = 0.5;
    if (m.closingOdds?.over25 && m.closingOdds?.under25) {
      const invO = 1 / m.closingOdds.over25;
      const invU = 1 / m.closingOdds.under25;
      const sumOU = invO + invU;
      closingOver25 = invO / sumOU;
      closingUnder25 = invU / sumOU;
    }

    // Asian handicap calculation from full bivariate matrix
    let ahLine: number | null = null;
    let closingAhHomeOdds: number | null = null;
    let closingAhAwayOdds: number | null = null;
    let closingAhHomeProb: number | null = null;
    let modelAhHomeProb: number | null = null;
    let ahOutcome: number | null = null;

    if (m.closingOdds?.asianHandicapLine != null && m.closingOdds?.asianHandicapHome != null && m.closingOdds?.asianHandicapAway != null) {
      ahLine = m.closingOdds.asianHandicapLine;
      closingAhHomeOdds = m.closingOdds.asianHandicapHome;
      closingAhAwayOdds = m.closingOdds.asianHandicapAway;
      const invAhH = 1 / closingAhHomeOdds;
      const invAhA = 1 / closingAhAwayOdds;
      closingAhHomeProb = invAhH / (invAhH + invAhA);

      // Compute model AH home cover prob
      let homeCoverProb = 0;
      for (let x = 0; x <= 8; x++) {
        for (let y = 0; y <= 8; y++) {
          const p = matrix[x][y];
          const diff = x - y + ahLine;
          if (diff > 0.001) {
            homeCoverProb += p;
          } else if (Math.abs(diff) <= 0.001) {
            // Whole line push: half credit for binary win prob or 0.5
            homeCoverProb += 0.5 * p;
          } else if (Math.abs(diff - 0.25) <= 0.001) {
            // Quarter win
            homeCoverProb += 0.75 * p;
          } else if (Math.abs(diff + 0.25) <= 0.001) {
            // Quarter loss
            homeCoverProb += 0.25 * p;
          }
        }
      }
      modelAhHomeProb = homeCoverProb;

      // Actual match outcome on AH line
      const actualDiff = m.homeScore - m.awayScore + ahLine;
      if (actualDiff > 0.001) {
        ahOutcome = 1;
      } else if (Math.abs(actualDiff) <= 0.001) {
        ahOutcome = 0.5; // push
      } else {
        ahOutcome = 0;
      }
    }

    evalRecords.push({
      match: m,
      matrix,
      lambdaHome,
      muAway,
      blended1X2: [pHW, pDr, pAW],
      closingOdds1X2: closing1X2,
      modelOver25: pModelOver25,
      closingOver25,
      modelUnder25: pModelUnder25,
      closingUnder25,
      ahLine,
      closingAhHomeOdds,
      closingAhAwayOdds,
      closingAhHomeProb,
      modelAhHomeProb,
      ahOutcome,
    });

    updateHistory(m);
  }

  console.log(`Evaluated matches count: ${evalRecords.length}`);

  // 1. CHECKSUM & ROW COUNT FOR 1X2
  const sha256Matches = crypto.createHash('sha256');
  const sha256ModelProbs = crypto.createHash('sha256');
  const sha256ClosingProbs = crypto.createHash('sha256');

  for (const r of evalRecords) {
    sha256Matches.update(`${r.match.id}|${r.match.date}|${r.match.homeScore}-${r.match.awayScore}|${r.match.homeTeamName}|${r.match.awayTeamName}`);
    sha256ModelProbs.update(`${r.blended1X2[0].toFixed(6)}|${r.blended1X2[1].toFixed(6)}|${r.blended1X2[2].toFixed(6)}`);
    sha256ClosingProbs.update(`${r.closingOdds1X2[0].toFixed(6)}|${r.closingOdds1X2[1].toFixed(6)}|${r.closingOdds1X2[2].toFixed(6)}`);
  }

  const checksumMatches = sha256Matches.digest('hex');
  const checksumModel = sha256ModelProbs.digest('hex');
  const checksumClosing = sha256ClosingProbs.digest('hex');

  console.log('\n--- 1X2 ROW COUNT AND CHECKSUM PROOF ---');
  console.log(`Row count (Model):        ${evalRecords.length}`);
  console.log(`Row count (Closing Odds): ${evalRecords.length}`);
  console.log(`Match Metadata Checksum:  ${checksumMatches}`);
  console.log(`Model Probs Checksum:     ${checksumModel}`);
  console.log(`Closing Probs Checksum:   ${checksumClosing}`);

  // 2. 1X2 CLOSING VALIDATION
  const diffs1X2: number[] = [];
  let sumModel1X2 = 0;
  let sumClosing1X2 = 0;

  for (const r of evalRecords) {
    const act = r.match.homeScore > r.match.awayScore ? 0 : (r.match.homeScore === r.match.awayScore ? 1 : 2);
    const lM = logLossMulti(act, r.blended1X2);
    const lC = logLossMulti(act, r.closingOdds1X2);
    sumModel1X2 += lM;
    sumClosing1X2 += lC;
    diffs1X2.push(lM - lC);
  }

  const meanModel1X2 = sumModel1X2 / evalRecords.length;
  const meanClosing1X2 = sumClosing1X2 / evalRecords.length;
  const meanDiff1X2 = diffs1X2.reduce((s, x) => s + x, 0) / evalRecords.length;
  const ci1X2 = bootstrapCi(diffs1X2, 2000, 42);

  console.log('\n--- 1X2 VALIDATION ---');
  console.log(`Model Log Loss:        ${meanModel1X2.toFixed(4)}`);
  console.log(`Closing Odds Log Loss: ${meanClosing1X2.toFixed(4)}`);
  console.log(`Paired Difference:     +${meanDiff1X2.toFixed(4)} [95% CI: +${ci1X2[0].toFixed(4)}, +${ci1X2[1].toFixed(4)}]`);
  const class1X2 = ci1X2[1] < 0 ? 'BEATS CLOSING' : (ci1X2[0] > 0 ? 'LOSES TO CLOSING' : 'MATCHES CLOSING');
  console.log(`Classification:        ${class1X2}`);

  // 3. OVER / UNDER 2.5 CLOSING VALIDATION
  const diffsOU25: number[] = [];
  let sumModelOU25 = 0;
  let sumClosingOU25 = 0;

  for (const r of evalRecords) {
    const act = (r.match.homeScore + r.match.awayScore) > 2.5 ? 1 : 0;
    const lM = logLossBinary(act, r.modelOver25);
    const lC = logLossBinary(act, r.closingOver25);
    sumModelOU25 += lM;
    sumClosingOU25 += lC;
    diffsOU25.push(lM - lC);
  }

  const meanModelOU25 = sumModelOU25 / evalRecords.length;
  const meanClosingOU25 = sumClosingOU25 / evalRecords.length;
  const meanDiffOU25 = diffsOU25.reduce((s, x) => s + x, 0) / evalRecords.length;
  const ciOU25 = bootstrapCi(diffsOU25, 2000, 42);

  console.log('\n--- OVER / UNDER 2.5 VALIDATION ---');
  console.log(`Model Log Loss:        ${meanModelOU25.toFixed(4)}`);
  console.log(`Closing Odds Log Loss: ${meanClosingOU25.toFixed(4)}`);
  console.log(`Paired Difference:     +${meanDiffOU25.toFixed(4)} [95% CI: +${ciOU25[0].toFixed(4)}, +${ciOU25[1].toFixed(4)}]`);
  const classOU25 = ciOU25[1] < 0 ? 'BEATS CLOSING' : (ciOU25[0] > 0 ? 'LOSES TO CLOSING' : 'MATCHES CLOSING');
  console.log(`Classification:        ${classOU25}`);

  // 4. ASIAN HANDICAP BY LINE
  const linesToAudit = [-0.5, 0.5, -1.0, 1.0, -1.5, 1.5, -0.25, 0.25, -0.75, 0.75, 0];
  console.log('\n--- ASIAN HANDICAP SEPARATE LINE VALIDATION ---');

  interface AhLineAuditResult {
    line: number;
    count: number;
    modelLogLoss: number;
    closingLogLoss: number;
    pairedDiff: number;
    ci95: [number, number];
    classification: string;
    picks: number;
    hits: number;
    hitRate: number;
    hitRateCi: [number, number];
    roi: number;
    roiCi: [number, number];
  }

  const ahResults: AhLineAuditResult[] = [];

  for (const line of linesToAudit) {
    const records = evalRecords.filter(r => r.ahLine === line && r.modelAhHomeProb != null && r.closingAhHomeProb != null && r.ahOutcome != null);
    if (records.length === 0) continue;

    const diffs: number[] = [];
    let sumM = 0;
    let sumC = 0;

    interface LinePick {
      hit: number;
      profit: number;
    }
    const picks: LinePick[] = [];

    for (const r of records) {
      // Exclude pushes for binary log loss or use probability
      const act = r.ahOutcome === 1 ? 1 : (r.ahOutcome === 0.5 ? 0.5 : 0);
      const pM = r.modelAhHomeProb!;
      const pC = r.closingAhHomeProb!;
      const lM = logLossBinary(act >= 0.5 ? 1 : 0, pM);
      const lC = logLossBinary(act >= 0.5 ? 1 : 0, pC);
      sumM += lM;
      sumC += lC;
      diffs.push(lM - lC);

      // Model pick selection criterion: pM >= 0.60 && (pM - pC) >= 0.03
      if (pM >= 0.60 && (pM - pC) >= 0.03 && r.closingAhHomeOdds) {
        let profit = 0;
        let hitVal = 0;
        if (r.ahOutcome === 1) {
          profit = r.closingAhHomeOdds - 1;
          hitVal = 1;
        } else if (r.ahOutcome === 0.5) {
          profit = 0; // push
          hitVal = 0.5;
        } else {
          profit = -1.0;
          hitVal = 0;
        }
        picks.push({ hit: hitVal, profit });
      }
    }

    const n = records.length;
    const meanM = sumM / n;
    const meanC = sumC / n;
    const meanD = diffs.reduce((s, x) => s + x, 0) / n;
    const ci = bootstrapCi(diffs, 2000, 42);

    let classification = 'MATCHES CLOSING';
    if (ci[1] < 0) classification = 'BEATS CLOSING';
    else if (ci[0] > 0) classification = 'LOSES TO CLOSING';

    const nPicks = picks.length;
    let hr = 0;
    let hrCi: [number, number] = [0, 0];
    let roi = 0;
    let roiCi: [number, number] = [0, 0];

    if (nPicks > 0) {
      const totHits = picks.reduce((s, p) => s + p.hit, 0);
      hr = totHits / nPicks;
      const profits = picks.map(p => p.profit);
      roi = profits.reduce((s, x) => s + x, 0) / nPicks;

      const hitCiArr = bootstrapCi(picks.map(p => p.hit), 2000, 42);
      hrCi = hitCiArr;
      const roiCiArr = bootstrapCi(profits, 2000, 42);
      roiCi = roiCiArr;
    }

    ahResults.push({
      line,
      count: n,
      modelLogLoss: meanM,
      closingLogLoss: meanC,
      pairedDiff: meanD,
      ci95: ci,
      classification,
      picks: nPicks,
      hits: picks.filter(p => p.hit === 1).length,
      hitRate: hr,
      hitRateCi: hrCi,
      roi,
      roiCi,
    });
  }

  console.table(ahResults.map(r => ({
    Line: r.line,
    N: r.count,
    'Model Loss': r.modelLogLoss.toFixed(4),
    'Closing Loss': r.closingLogLoss.toFixed(4),
    'Paired Diff': (r.pairedDiff > 0 ? '+' : '') + r.pairedDiff.toFixed(4),
    '95% CI': `[${(r.ci95[0] > 0 ? '+' : '') + r.ci95[0].toFixed(4)}, ${(r.ci95[1] > 0 ? '+' : '') + r.ci95[1].toFixed(4)}]`,
    Verdict: r.classification,
    Picks: r.picks,
    'Hit Rate': r.picks > 0 ? (r.hitRate * 100).toFixed(1) + '%' : 'N/A',
    ROI: r.picks > 0 ? (r.roi * 100).toFixed(2) + '%' : 'N/A',
  })));

  // Write out full json results for inspection
  fs.writeFileSync(path.join(process.cwd(), 'phase3c_validation_results.json'), JSON.stringify({
    evalCount: evalRecords.length,
    checksums: { matches: checksumMatches, model: checksumModel, closing: checksumClosing },
    market1X2: { modelLogLoss: meanModel1X2, closingLogLoss: meanClosing1X2, diff: meanDiff1X2, ci: ci1X2, classification: class1X2 },
    marketOU25: { modelLogLoss: meanModelOU25, closingLogLoss: meanClosingOU25, diff: meanDiffOU25, ci: ciOU25, classification: classOU25 },
    asianHandicap: ahResults,
  }, null, 2));

  console.log('\nWrote validation results to phase3c_validation_results.json');
}

run().catch(err => {
  console.error('Error running validation:', err);
  process.exit(1);
});
