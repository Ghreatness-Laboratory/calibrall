import { getLocalDatabase } from '../src/lib/supabase/client';
import { canonicalPairIds } from '../src/lib/data/rivalriesSeed';

const DECAY_LAMBDA = 0.005;
const DAY_MS = 1000 * 60 * 60 * 24;
const K_TEAM = 12;
const K_CORNERS = 12;

const ALIAS_TO_CANONICAL: Record<string, string> = {
  PL: 'E0', ELC: 'E1', PD: 'SP1', SA: 'I1', BL1: 'D1', FL1: 'F1',
  DED: 'N1', PPL: 'P1', TSL: 'T1', BSA: 'BSA', BRA: 'BSA', ROM: 'ROU', SUI: 'SWZ', SP: 'SC0',
};
const canonicalComp = (code: string) => ALIAS_TO_CANONICAL[String(code || '').toUpperCase().trim()] || String(code || '').toUpperCase().trim();

function clampProb(p: number): number { return Math.max(0.002, Math.min(0.998, p)); }
function logit(p: number): number { const c = clampProb(p); return Math.log(c / (1 - c)); }
function sigmoid(z: number): number { return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)); }
function logLossVal(p: number, y: number): number {
  const c = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return -(y * Math.log(c) + (1 - y) * Math.log(1 - c));
}

const factCache = [1];
function factorial(n: number): number {
  for (let i = factCache.length; i <= n; i++) factCache[i] = factCache[i - 1] * i;
  return factCache[n];
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
function nbOverProb(mu: number, line: number, alpha: number): number {
  let under = 0;
  const cut = Math.floor(line);
  for (let k = 0; k <= cut; k++) under += negBinomialProb(mu, k, alpha);
  return Math.max(0.005, Math.min(0.995, 1 - under));
}
function dcTau(x: number, y: number, l: number, m: number, rho: number): number {
  if (x === 0 && y === 0) return Math.max(1e-6, 1 - l * m * rho);
  if (x === 0 && y === 1) return Math.max(1e-6, 1 + l * rho);
  if (x === 1 && y === 0) return Math.max(1e-6, 1 + m * rho);
  if (x === 1 && y === 1) return Math.max(1e-6, 1 - rho);
  return 1.0;
}

interface DecayedTracker { matches: number; wSum: number; gfSum: number; gaSum: number; lastMs: number; }
function updateTracker(t: DecayedTracker, tsMs: number, vFor: number, vAgainst: number) {
  if (t.matches > 0 && t.lastMs > 0) {
    const dtDays = Math.max(0, (tsMs - t.lastMs) / DAY_MS);
    const decay = Math.exp(-DECAY_LAMBDA * dtDays);
    t.wSum *= decay; t.gfSum *= decay; t.gaSum *= decay;
  }
  t.matches += 1; t.wSum += 1.0; t.gfSum += vFor; t.gaSum += vAgainst; t.lastMs = tsMs;
}
function currentDecayedRate(t: DecayedTracker | undefined, tsMs: number, priorMean: number, K: number) {
  if (!t || t.matches === 0 || t.wSum <= 0) return { forRate: priorMean, againstRate: priorMean, matches: 0 };
  const dtDays = Math.max(0, (tsMs - t.lastMs) / DAY_MS);
  const decay = Math.exp(-DECAY_LAMBDA * dtDays);
  const w = t.wSum * decay;
  return {
    forRate: (t.gfSum * decay + K * priorMean) / (w + K),
    againstRate: (t.gaSum * decay + K * priorMean) / (w + K),
    matches: t.matches,
  };
}

function fitPlatt(obs: Array<{ raw: number; y: number }>): { a: number; b: number } {
  if (obs.length < 150) return { a: 1.0, b: 0.0 };
  let a = 1.0, b = 0.0;
  const n = obs.length, reg = 0.001;
  for (let iter = 0; iter < 35; iter++) {
    let gA = 0, gB = 0, hAA = 0, hAB = 0, hBB = 0;
    for (let i = 0; i < n; i++) {
      const x = logit(obs[i].raw);
      const y = obs[i].y;
      const p = sigmoid(a * x + b);
      const w = p * (1 - p);
      const diff = p - y;
      gA += diff * x; gB += diff;
      hAA += w * x * x; hAB += w * x; hBB += w;
    }
    gA = gA / n + reg * (a - 1.0); gB = gB / n + reg * b;
    hAA = hAA / n + reg; hAB = hAB / n; hBB = hBB / n + reg;
    const det = hAA * hBB - hAB * hAB;
    if (Math.abs(det) < 1e-10) break;
    const sA = (hBB * gA - hAB * gB) / det;
    const sB = (-hAB * gA + hAA * gB) / det;
    a = Math.max(0.4, Math.min(1.8, a - sA));
    b = Math.max(-0.8, Math.min(0.8, b - sB));
    if (Math.abs(sA) < 1e-5 && Math.abs(sB) < 1e-5) break;
  }
  return { a, b };
}

function bootstrapBssCI(clusters: Array<{ sqM: number; sqB: number; k: number }>, iters = 400, seed = 42) {
  const n = clusters.length;
  if (n < 20) return { bss: 0, lo: 0, hi: 0, brierM: 0, brierB: 0 };
  let totM = 0, totB = 0, totK = 0;
  for (const c of clusters) { totM += c.sqM; totB += c.sqB; totK += c.k; }
  const brierM = totM / totK;
  const brierB = totB / totK;
  const bss = brierB > 0 ? 1 - brierM / brierB : 0;

  let s = seed >>> 0;
  const rnd = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  const vals: number[] = [];
  for (let b = 0; b < iters; b++) {
    let sm = 0, sb = 0;
    for (let i = 0; i < n; i++) {
      const c = clusters[Math.floor(rnd() * n)];
      sm += c.sqM; sb += c.sqB;
    }
    vals.push(sb > 0 ? 1 - sm / sb : 0);
  }
  vals.sort((x, y) => x - y);
  return {
    bss: Number(bss.toFixed(4)),
    lo: Number(vals[Math.floor(0.025 * iters)].toFixed(4)),
    hi: Number(vals[Math.floor(0.975 * iters)].toFixed(4)),
    brierM: Number(brierM.toFixed(5)),
    brierB: Number(brierB.toFixed(5)),
  };
}

interface MatchRow {
  id: string;
  competition_code: string;
  season: string;
  kickoff_time: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  home_corners: number | null;
  away_corners: number | null;
}

const TEAM_RANGES: Array<{ id: string; scope: 'home' | 'away'; min: number; max: number }> = [
  { id: 'TEAM_MULTI_GOALS_HOME_0_1', scope: 'home', min: 0, max: 1 },
  { id: 'TEAM_MULTI_GOALS_HOME_1_2', scope: 'home', min: 1, max: 2 },
  { id: 'TEAM_MULTI_GOALS_HOME_1_3', scope: 'home', min: 1, max: 3 },
  { id: 'TEAM_MULTI_GOALS_HOME_2_3', scope: 'home', min: 2, max: 3 },
  { id: 'TEAM_MULTI_GOALS_AWAY_0_1', scope: 'away', min: 0, max: 1 },
  { id: 'TEAM_MULTI_GOALS_AWAY_1_2', scope: 'away', min: 1, max: 2 },
  { id: 'TEAM_MULTI_GOALS_AWAY_1_3', scope: 'away', min: 1, max: 3 },
  { id: 'TEAM_MULTI_GOALS_AWAY_2_3', scope: 'away', min: 2, max: 3 },
];

function main() {
  const db = getLocalDatabase()!;
  const matches = db.prepare(`
    SELECT id, competition_code, season, kickoff_time, home_team_id, away_team_id,
           home_score, away_score, home_corners, away_corners
    FROM matches
    WHERE status = 'FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL AND COALESCE(is_playoff,0) = 0
    ORDER BY kickoff_time ASC
  `).all() as MatchRow[];

  const byLeague = new Map<string, MatchRow[]>();
  for (const m of matches) {
    const c = canonicalComp(m.competition_code);
    if (!byLeague.has(c)) byLeague.set(c, []);
    byLeague.get(c)!.push(m);
  }

  // Empirical league rho (same as calibrate_models_from_db)
  const rhoByLeague = new Map<string, number>();
  for (const [comp, rows] of byLeague.entries()) {
    let sh = 0, sa = 0, n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (const m of rows) {
      sh += m.home_score; sa += m.away_score;
      if (m.home_score === 0 && m.away_score === 0) n00++;
      else if (m.home_score === 0 && m.away_score === 1) n01++;
      else if (m.home_score === 1 && m.away_score === 0) n10++;
      else if (m.home_score === 1 && m.away_score === 1) n11++;
    }
    const ah = sh / rows.length, aa = sa / rows.length;
    let bestR = -0.08, bestL = -Infinity;
    for (let r = -0.25; r <= 0.05; r += 0.005) {
      const t00 = 1 - ah * aa * r, t01 = 1 + ah * r, t10 = 1 + aa * r, t11 = 1 - r;
      if (t00 <= 0.01 || t01 <= 0.01 || t10 <= 0.01 || t11 <= 0.01) continue;
      const ll = n00 * Math.log(t00) + n01 * Math.log(t01) + n10 * Math.log(t10) + n11 * Math.log(t11);
      if (ll > bestL) { bestL = ll; bestR = r; }
    }
    rhoByLeague.set(comp, bestR);
  }

  const CORNER_LINES = [7.5, 8.5, 9.5, 10.5, 11.5];

  interface LeagueEval {
    comp: string;
    totalN: number;
    dc12Clusters: Array<{ sqM: number; sqB: number; k: number }>;
    dc12LlM: number; dc12LlB: number;
    dc12Cal70N: number; dc12Cal70Hit: number;
    dc12Raw70N: number; dc12Raw70Hit: number;
    dc12Bins: Array<{ pred: number; actual: number; n: number }>;

    bttsClusters: Array<{ sqM: number; sqB: number; k: number }>;
    bttsLlM: number; bttsLlB: number;
    btts70N: number; btts70Hit: number;
    bttsBins: Array<{ pred: number; actual: number; n: number }>;

    cornersEmpirical: {
      n: number; sumTot: number; sumSq: number;
      o: Record<number, number>;
    };
    cornersClusters75: Array<{ sqM: number; sqB: number; k: number }>;
    cornersClusters85: Array<{ sqM: number; sqB: number; k: number }>;
    cornersPerLine: Record<number, {
      clusters: Array<{ sqM: number; sqB: number; k: number }>;
      llM: number; llB: number;
      o70N: number; o70Hit: number;
      u70N: number; u70Hit: number;
    }>;

    // Raw TMG observations in test fold before causal Platt
    tmgObs: Array<{ idx: number; raw: number; base: number; y: number }>;
  }

  const results = new Map<string, LeagueEval>();
  const ALL_TMG_OBS: Array<{ comp: string; kickoffMs: number; raw: number; base: number; y: number; rangeId: string }> = [];

  for (const [comp, rows] of Array.from(byLeague.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const rho = rhoByLeague.get(comp) ?? -0.08;
    const teamGoals = new Map<string, DecayedTracker>();
    const teamCorners = new Map<string, DecayedTracker>();
    const h2h = new Map<string, Array<{ ms: number; homeId: string; hg: number; ag: number }>>();

    let n = 0, sumHG = 0, sumAG = 0, hw = 0, dw = 0, aw = 0, btts = 0;
    const homeHist = new Array(12).fill(0);
    const awayHist = new Array(12).fill(0);
    let cN = 0, cHC = 0, cAC = 0, cSumSq = 0;
    const cO: Record<number, number> = { 7.5: 0, 8.5: 0, 9.5: 0, 10.5: 0, 11.5: 0 };

    const empCN = rows.filter(r => r.home_corners !== null && r.away_corners !== null);
    const empO: Record<number, number> = { 7.5: 0, 8.5: 0, 9.5: 0, 10.5: 0, 11.5: 0 };
    let empSumTot = 0, empSumSq = 0;
    for (const r of empCN) {
      const tc = (r.home_corners ?? 0) + (r.away_corners ?? 0);
      empSumTot += tc; empSumSq += tc * tc;
      for (const l of CORNER_LINES) if (tc > l) empO[l]++;
    }

    const le: LeagueEval = {
      comp, totalN: rows.length,
      dc12Clusters: [], dc12LlM: 0, dc12LlB: 0, dc12Cal70N: 0, dc12Cal70Hit: 0, dc12Raw70N: 0, dc12Raw70Hit: 0,
      dc12Bins: Array.from({ length: 5 }, () => ({ pred: 0, actual: 0, n: 0 })),
      bttsClusters: [], bttsLlM: 0, bttsLlB: 0, btts70N: 0, btts70Hit: 0,
      bttsBins: Array.from({ length: 5 }, () => ({ pred: 0, actual: 0, n: 0 })),
      cornersEmpirical: { n: empCN.length, sumTot: empSumTot, sumSq: empSumSq, o: empO },
      cornersClusters75: [], cornersClusters85: [],
      cornersPerLine: Object.fromEntries(CORNER_LINES.map(l => [l, { clusters: [], llM: 0, llB: 0, o70N: 0, o70Hit: 0, u70N: 0, u70Hit: 0 }])),
      tmgObs: [],
    };

    const cutoff = Math.floor(rows.length * 0.25);

    for (let i = 0; i < rows.length; i++) {
      const m = rows[i];
      const tsMs = new Date(m.kickoff_time).getTime();
      const isEval = i >= cutoff && n >= 60;

      if (isEval) {
        const avgHG = sumHG / n, avgAG = sumAG / n, avgTG = avgHG + avgAG;
        const baseSide = Math.max(0.25, avgTG / 2);
        const hT = currentDecayedRate(teamGoals.get(m.home_team_id), tsMs, baseSide, K_TEAM);
        const aT = currentDecayedRate(teamGoals.get(m.away_team_id), tsMs, baseSide, K_TEAM);

        if (hT.matches >= 10 && aT.matches >= 10) {
          const baseLam = Math.max(0.25, Math.min(4.8, avgHG * (hT.forRate / baseSide) * (aT.againstRate / baseSide)));
          const baseMu = Math.max(0.25, Math.min(4.8, avgAG * (aT.forRate / baseSide) * (hT.againstRate / baseSide)));
          const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
          const pastH2h = (h2h.get(`${pA}__${pB}`) || []).filter(h => (tsMs - h.ms) <= 5 * 365.25 * DAY_MS).slice(-6);
          let h2hDiff = 0;
          if (pastH2h.length > 0) {
            h2hDiff = pastH2h.reduce((s, p) => s + (p.homeId === m.home_team_id ? p.hg - p.ag : p.ag - p.hg), 0) / pastH2h.length;
          }
          const h2hW = pastH2h.length > 0 ? Math.min(0.20, pastH2h.length / (pastH2h.length + 15)) : 0;
          const mod = 0.08 * h2hW * h2hDiff * 5.0;
          const lam = Math.max(0.25, Math.min(5.0, baseLam * Math.exp(mod)));
          const mu = Math.max(0.25, Math.min(5.0, baseMu * Math.exp(-mod)));

          let pH = 0, pD = 0, pA_p = 0, pBtts = 0, tot = 0;
          const pHomeG = new Array(9).fill(0), pAwayG = new Array(9).fill(0);
          for (let x = 0; x <= 8; x++) {
            const px = poissonProb(lam, x);
            for (let y = 0; y <= 8; y++) {
              const p = px * poissonProb(mu, y) * dcTau(x, y, lam, mu, rho);
              tot += p;
              if (x > y) pH += p; else if (x === y) pD += p; else pA_p += p;
              if (x >= 1 && y >= 1) pBtts += p;
              pHomeG[x] += p; pAwayG[y] += p;
            }
          }
          pH /= tot; pD /= tot; pA_p /= tot; pBtts /= tot;
          for (let k = 0; k <= 8; k++) { pHomeG[k] /= tot; pAwayG[k] /= tot; }

          // 1. DC_12
          const raw12 = pH + pA_p;
          const cal12 = sigmoid(0.970 * logit(raw12) - 0.004);
          const base12 = (hw + aw) / n;
          const act12 = m.home_score !== m.away_score ? 1 : 0;
          le.dc12Clusters.push({ sqM: (cal12 - act12) ** 2, sqB: (base12 - act12) ** 2, k: 1 });
          le.dc12LlM += logLossVal(cal12, act12);
          le.dc12LlB += logLossVal(base12, act12);
          if (cal12 >= 0.70) { le.dc12Cal70N++; if (act12 === 1) le.dc12Cal70Hit++; }
          if (raw12 >= 0.70) { le.dc12Raw70N++; if (act12 === 1) le.dc12Raw70Hit++; }
          const bIdx12 = Math.min(4, Math.max(0, Math.floor((cal12 - 0.5) / 0.1)));
          le.dc12Bins[bIdx12].n++; le.dc12Bins[bIdx12].pred += cal12; le.dc12Bins[bIdx12].actual += act12;

          // 2. BTTS
          const calBtts = sigmoid(0.960 * logit(pBtts) - 0.005);
          const baseBtts = btts / n;
          const actBtts = m.home_score >= 1 && m.away_score >= 1 ? 1 : 0;
          le.bttsClusters.push({ sqM: (calBtts - actBtts) ** 2, sqB: (baseBtts - actBtts) ** 2, k: 1 });
          le.bttsLlM += logLossVal(calBtts, actBtts);
          le.bttsLlB += logLossVal(baseBtts, actBtts);
          if (calBtts >= 0.70) { le.btts70N++; if (actBtts === 1) le.btts70Hit++; }
          else if ((1 - calBtts) >= 0.70) { le.btts70N++; if (actBtts === 0) le.btts70Hit++; }
          const bIdxB = Math.min(4, Math.max(0, Math.floor((calBtts - 0.25) / 0.12)));
          le.bttsBins[bIdxB].n++; le.bttsBins[bIdxB].pred += calBtts; le.bttsBins[bIdxB].actual += actBtts;

          // 3. Team Multi Goals (8 ranges)
          for (const tr of TEAM_RANGES) {
            let rawR = 0, baseCnt = 0;
            const gArr = tr.scope === 'home' ? pHomeG : pAwayG;
            const hist = tr.scope === 'home' ? homeHist : awayHist;
            for (let g = tr.min; g <= tr.max; g++) { rawR += gArr[g] ?? 0; baseCnt += hist[g] ?? 0; }
            const actR = (tr.scope === 'home' ? m.home_score : m.away_score);
            const yR = (actR >= tr.min && actR <= tr.max) ? 1 : 0;
            ALL_TMG_OBS.push({ comp, kickoffMs: tsMs, raw: rawR, base: baseCnt / n, y: yR, rangeId: tr.id });
          }

          // 4. Corners
          if (m.home_corners !== null && m.away_corners !== null && cN >= 30) {
            const hcT = currentDecayedRate(teamCorners.get(m.home_team_id), tsMs, (cHC + cAC) / (2 * cN), K_CORNERS);
            const acT = currentDecayedRate(teamCorners.get(m.away_team_id), tsMs, (cHC + cAC) / (2 * cN), K_CORNERS);
            if (hcT.matches >= 10 && acT.matches >= 10) {
              const avgHC = cHC / cN, avgAC = cAC / cN, avgTC = avgHC + avgAC, sideC = Math.max(0.5, avgTC / 2);
              const varC = Math.max(avgTC + 0.1, (cSumSq / cN - avgTC * avgTC) * (cN / Math.max(1, cN - 1)));
              const alphaC = Math.max(0.01, (varC - avgTC) / (avgTC * avgTC));
              const expHC = avgHC * (hcT.forRate / sideC) * (acT.againstRate / sideC);
              const expAC = avgAC * (acT.forRate / sideC) * (hcT.againstRate / sideC);
              const expTot = Math.max(4.5, Math.min(17.0, expHC + expAC));
              const totC = m.home_corners + m.away_corners;

              let sq75M = 0, sq75B = 0, sq85M = 0, sq85B = 0;
              for (const l of CORNER_LINES) {
                const rawO = nbOverProb(expTot, l, alphaC);
                const calO = sigmoid(0.930 * logit(rawO) + 0.015);
                const baseO = cO[l] / cN;
                const act = totC > l ? 1 : 0;
                const sqM = (calO - act) ** 2, sqB = (baseO - act) ** 2;
                le.cornersPerLine[l].clusters.push({ sqM, sqB, k: 1 });
                le.cornersPerLine[l].llM += logLossVal(calO, act);
                le.cornersPerLine[l].llB += logLossVal(baseO, act);
                if (calO >= 0.70) { le.cornersPerLine[l].o70N++; if (act === 1) le.cornersPerLine[l].o70Hit++; }
                if ((1 - calO) >= 0.70) { le.cornersPerLine[l].u70N++; if (act === 0) le.cornersPerLine[l].u70Hit++; }
                sq75M += sqM; sq75B += sqB;
                if (l >= 8.5) { sq85M += sqM; sq85B += sqB; }
              }
              le.cornersClusters75.push({ sqM: sq75M, sqB: sq75B, k: 5 });
              le.cornersClusters85.push({ sqM: sq85M, sqB: sq85B, k: 4 });
            }
          }
        }
      }

      n++; sumHG += m.home_score; sumAG += m.away_score;
      if (m.home_score > m.away_score) hw++; else if (m.home_score === m.away_score) dw++; else aw++;
      if (m.home_score >= 1 && m.away_score >= 1) btts++;
      homeHist[Math.min(11, m.home_score)]++;
      awayHist[Math.min(11, m.away_score)]++;

      if (!teamGoals.has(m.home_team_id)) teamGoals.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      if (!teamGoals.has(m.away_team_id)) teamGoals.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
      updateTracker(teamGoals.get(m.home_team_id)!, tsMs, m.home_score, m.away_score);
      updateTracker(teamGoals.get(m.away_team_id)!, tsMs, m.away_score, m.home_score);

      const [pA, pB] = canonicalPairIds(m.home_team_id, m.away_team_id);
      const pk = `${pA}__${pB}`;
      if (!h2h.has(pk)) h2h.set(pk, []);
      h2h.get(pk)!.push({ ms: tsMs, homeId: m.home_team_id, hg: m.home_score, ag: m.away_score });

      if (m.home_corners !== null && m.away_corners !== null) {
        const tc = m.home_corners + m.away_corners;
        cN++; cHC += m.home_corners; cAC += m.away_corners; cSumSq += tc * tc;
        for (const l of CORNER_LINES) if (tc > l) cO[l]++;
        if (!teamCorners.has(m.home_team_id)) teamCorners.set(m.home_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
        if (!teamCorners.has(m.away_team_id)) teamCorners.set(m.away_team_id, { matches: 0, wSum: 0, gfSum: 0, gaSum: 0, lastMs: tsMs });
        updateTracker(teamCorners.get(m.home_team_id)!, tsMs, m.home_corners, m.away_corners);
        updateTracker(teamCorners.get(m.away_team_id)!, tsMs, m.away_corners, m.home_corners);
      }
    }

    results.set(comp, le);
  }

  console.log('\n=== PART 2(d) DC_12 PER-LEAGUE WALK-FORWARD BACKTEST ===');
  for (const [comp, le] of results.entries()) {
    const n = le.dc12Clusters.length;
    if (n < 50) continue;
    const ci = bootstrapBssCI(le.dc12Clusters, 300, 101);
    const llM = (le.dc12LlM / n).toFixed(4), llB = (le.dc12LlB / n).toFixed(4);
    const hr = le.dc12Cal70N > 0 ? ((le.dc12Cal70Hit / le.dc12Cal70N) * 100).toFixed(1) : 'n/a';
    console.log(`${comp.padEnd(4)} | n=${String(n).padStart(4)} | Brier=${ci.brierM} (base=${ci.brierB}) | LL=${llM} (base=${llB}) | BSS=${ci.bss >= 0 ? '+' : ''}${ci.bss} [${ci.lo}, ${ci.hi}] ${ci.lo > 0 ? 'PASS' : 'FAIL'} | cal>=70%: ${le.dc12Cal70N} (hit=${hr}%) | raw>=70%: ${le.dc12Raw70N}`);
  }

  console.log('\n=== PART 2(d) BTTS PER-LEAGUE WALK-FORWARD BACKTEST ===');
  for (const [comp, le] of results.entries()) {
    const n = le.bttsClusters.length;
    if (n < 50) continue;
    const ci = bootstrapBssCI(le.bttsClusters, 300, 202);
    const llM = (le.bttsLlM / n).toFixed(4), llB = (le.bttsLlB / n).toFixed(4);
    const hr = le.btts70N > 0 ? ((le.btts70Hit / le.btts70N) * 100).toFixed(1) : 'n/a';
    console.log(`${comp.padEnd(4)} | n=${String(n).padStart(4)} | Brier=${ci.brierM} (base=${ci.brierB}) | LL=${llM} (base=${llB}) | BSS=${ci.bss >= 0 ? '+' : ''}${ci.bss} [${ci.lo}, ${ci.hi}] ${ci.lo > 0 ? 'PASS' : 'FAIL'} | >=70%: ${le.btts70N} (hit=${hr}%)`);
  }

  console.log('\n=== PART 2(e) CORNERS PER-LEAGUE WALK-FORWARD BACKTEST & EMPIRICAL RATES (7.5..11.5) ===');
  for (const [comp, le] of results.entries()) {
    if (le.cornersEmpirical.n < 50) continue;
    const en = le.cornersEmpirical.n;
    const avg = le.cornersEmpirical.sumTot / en;
    const vr = (le.cornersEmpirical.sumSq / en - avg * avg) * (en / Math.max(1, en - 1));
    const alpha = Math.max(0.01, (vr - avg) / (avg * avg));
    const ci75 = bootstrapBssCI(le.cornersClusters75, 300, 303);
    const ci85 = bootstrapBssCI(le.cornersClusters85, 300, 304);
    const rates = CORNER_LINES.map(l => `O${l}=${(le.cornersEmpirical.o[l] / en).toFixed(4)}`).join(' ');
    console.log(`${comp.padEnd(4)} | empN=${String(en).padStart(4)} avg=${avg.toFixed(2)} alpha=${alpha.toFixed(4)} | ${rates}`);
    console.log(`       evalN=${le.cornersClusters75.length} | 7.5..11.5: BSS=${ci75.bss} [${ci75.lo}, ${ci75.hi}] ${ci75.lo > 0 ? 'PASS' : 'FAIL'} | 8.5..11.5: BSS=${ci85.bss} [${ci85.lo}, ${ci85.hi}] ${ci85.lo > 0 ? 'PASS' : 'FAIL'}`);
    for (const l of CORNER_LINES) {
      const pl = le.cornersPerLine[l];
      const plCi = bootstrapBssCI(pl.clusters, 200, 400 + Math.floor(l * 10));
      console.log(`       line=${l.toFixed(1)}: Brier=${plCi.brierM}(base=${plCi.brierB}) LL=${(pl.llM/pl.clusters.length).toFixed(4)} BSS=${plCi.bss}[${plCi.lo},${plCi.hi}] | O>=70%: ${pl.o70N}(hit=${pl.o70N?((pl.o70Hit/pl.o70N)*100).toFixed(1):'n/a'}%) U>=70%: ${pl.u70N}(hit=${pl.u70N?((pl.u70Hit/pl.u70N)*100).toFixed(1):'n/a'}%)`);
    }
  }

  console.log('\n=== PART 2(f) TEAM MULTI GOALS PER-LEAGUE WALK-FORWARD BACKTEST ===');
  // Chronological global expanding-window Platt fit on TMG only (matching run_multi_goals_backtest.ts)
  ALL_TMG_OBS.sort((a, b) => a.kickoffMs - b.kickoffMs);
  const plattSplit = Math.floor(ALL_TMG_OBS.length * 0.45);
  const tmgFitPairs = ALL_TMG_OBS.slice(0, plattSplit).map(o => ({ raw: o.raw, y: o.y }));
  const tmgPlatt = fitPlatt(tmgFitPairs);
  console.log(`TMG global past-fold Platt: a=${tmgPlatt.a.toFixed(4)}, b=${tmgPlatt.b.toFixed(4)} (fit n=${tmgFitPairs.length}, test n=${ALL_TMG_OBS.length - plattSplit})`);

  const tmgByLeague = new Map<string, Array<{ cal: number; base: number; y: number }>>();
  for (let i = plattSplit; i < ALL_TMG_OBS.length; i++) {
    const o = ALL_TMG_OBS[i];
    const cal = clampProb(sigmoid(tmgPlatt.a * logit(o.raw) + tmgPlatt.b));
    if (!tmgByLeague.has(o.comp)) tmgByLeague.set(o.comp, []);
    tmgByLeague.get(o.comp)!.push({ cal, base: o.base, y: o.y });
  }

  const passingTmgLeagues: string[] = [];
  const failingTmgLeagues: string[] = [];
  for (const [comp, list] of Array.from(tmgByLeague.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    // Group by 8 obs per match (approximately 8 ranges per match)
    const clusters: Array<{ sqM: number; sqB: number; k: number }> = [];
    let llM = 0, llB = 0, n60 = 0, h60 = 0;
    for (let i = 0; i < list.length; i += 8) {
      const slice = list.slice(i, i + 8);
      let sqM = 0, sqB = 0;
      for (const x of slice) {
        sqM += (x.cal - x.y) ** 2;
        sqB += (x.base - x.y) ** 2;
        llM += logLossVal(x.cal, x.y);
        llB += logLossVal(x.base, x.y);
        if (x.cal >= 0.60) { n60++; if (x.y === 1) h60++; }
      }
      clusters.push({ sqM, sqB, k: slice.length });
    }
    const ci = bootstrapBssCI(clusters, 300, 505);
    const pass = ci.bss > 0 && ci.lo > 0;
    if (pass) passingTmgLeagues.push(comp); else failingTmgLeagues.push(comp);
    console.log(`${comp.padEnd(4)} | matches=${String(clusters.length).padStart(4)} | Brier=${ci.brierM}(base=${ci.brierB}) | LL=${(llM/list.length).toFixed(4)}(base=${(llB/list.length).toFixed(4)}) | BSS=${ci.bss>=0?'+':''}${ci.bss} [${ci.lo},${ci.hi}] ${pass?'PASS':'FAIL'} | >=60%: ${n60}(hit=${n60?((h60/n60)*100).toFixed(1):'n/a'}%)`);
  }
  console.log(`TMG PASSING LEAGUES (${passingTmgLeagues.length}):`, passingTmgLeagues.join(', '));
  console.log(`TMG FAILING LEAGUES (${failingTmgLeagues.length}):`, failingTmgLeagues.join(', '));
}

main();
