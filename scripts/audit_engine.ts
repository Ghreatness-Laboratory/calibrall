// Script to audit the current market selection and prediction engine over 250 fixtures
import { evaluateFixtureMarkets } from '../src/lib/prediction/marketSelection';
import { FixtureContext, StateTag } from '../src/types';

// Generate 250 realistic European fixtures with diverse team ratings, styles, and realistic outcomes
interface BacktestFixture {
  context: FixtureContext;
  actual: {
    homeGoals: number;
    awayGoals: number;
    homeCorners: number;
    awayCorners: number;
    cards: number;
    firstHalfHomeGoals: number;
    firstHalfAwayGoals: number;
    secondHalfHomeGoals: number;
    secondHalfAwayGoals: number;
  };
}

function generateBacktestDataset(): BacktestFixture[] {
  const fixtures: BacktestFixture[] = [];
  const comps = [
    { code: 'PL', name: 'Premier League', avgCorners: 10.45, avgGoals: 2.88, avgCards: 4.12 },
    { code: 'PD', name: 'La Liga', avgCorners: 9.30, avgGoals: 2.54, avgCards: 4.88 },
    { code: 'BL1', name: 'Bundesliga', avgCorners: 10.15, avgGoals: 3.18, avgCards: 3.75 },
    { code: 'SA', name: 'Serie A', avgCorners: 9.60, avgGoals: 2.62, avgCards: 4.50 },
    { code: 'CL', name: 'Champions League', avgCorners: 9.85, avgGoals: 3.02, avgCards: 3.95 },
  ];

  // Match profiles: Heavy favorite, balanced clash, low-scoring tactical grind, open attacking chaos, derby match, congested/tired
  const profiles = [
    { type: 'heavy_fav', homeAtk: 1.65, homeDef: 0.65, awayAtk: 0.75, awayDef: 1.35, tags: ['high-stakes'] },
    { type: 'moderate_fav', homeAtk: 1.35, homeDef: 0.85, awayAtk: 0.95, awayDef: 1.15, tags: [] },
    { type: 'balanced_tight', homeAtk: 1.05, homeDef: 0.85, awayAtk: 0.95, awayDef: 0.90, tags: [] },
    { type: 'open_shootout', homeAtk: 1.45, homeDef: 1.25, awayAtk: 1.35, awayDef: 1.30, tags: [] },
    { type: 'derby', homeAtk: 1.20, homeDef: 0.95, awayAtk: 1.15, awayDef: 1.00, tags: ['derby', 'high-stakes'] },
    { type: 'key_absences', homeAtk: 0.85, homeDef: 0.90, awayAtk: 0.80, awayDef: 0.85, tags: ['key-absences'] },
    { type: 'congested', homeAtk: 1.10, homeDef: 1.05, awayAtk: 1.05, awayDef: 1.10, tags: ['fixture-congested'] },
    { type: 'away_fav', homeAtk: 0.85, homeDef: 1.25, awayAtk: 1.55, awayDef: 0.75, tags: [] },
  ];

  let seed = 42;
  function pseudoRandom() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  function samplePoisson(lambda: number): number {
    let L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= pseudoRandom();
    } while (p > L && k < 30);
    return k - 1;
  }

  // Sample negative binomial for overdispersed counts (corners)
  function sampleNegBinomial(mean: number, dispersion: number = 1.35): number {
    // Mean = r * (1-p)/p, Var = mean * dispersion
    // variance = mean + mean^2 / r => r = mean^2 / (var - mean)
    const variance = mean * dispersion;
    const r = (mean * mean) / (variance - mean);
    const p = r / (r + mean);
    // Approximate with Poisson compounded or Gamma-Poisson
    // Use simple discretized normal approximation with matching variance:
    const std = Math.sqrt(variance);
    // Box-muller
    const u1 = Math.max(1e-6, pseudoRandom());
    const u2 = pseudoRandom();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(mean + z * std));
  }

  for (let i = 0; i < 250; i++) {
    const comp = comps[i % comps.length];
    const prof = profiles[i % profiles.length];

    // Compute expected metrics
    const homeXg = Number(((prof.homeAtk / prof.awayDef) * (comp.avgGoals / 2)).toFixed(2));
    const awayXg = Number(((prof.awayAtk / prof.homeDef) * (comp.avgGoals / 2) * 0.85).toFixed(2));
    const expectedCornersHome = Number(((prof.homeAtk * 1.1) * (comp.avgCorners / 2)).toFixed(1));
    const expectedCornersAway = Number(((prof.awayAtk * 0.9) * (comp.avgCorners / 2)).toFixed(1));
    const expectedCards = Number((comp.avgCards * (prof.tags.includes('derby') ? 1.22 : 1.0)).toFixed(1));

    // Simulated actual outcomes from underlying true distributions
    const homeGoals = samplePoisson(homeXg);
    const awayGoals = samplePoisson(awayXg);
    const h1Goals = samplePoisson(homeXg * 0.445);
    const a1Goals = samplePoisson(awayXg * 0.445);
    const h2Goals = Math.max(0, homeGoals - h1Goals);
    const a2Goals = Math.max(0, awayGoals - a1Goals);

    const homeCorners = sampleNegBinomial(expectedCornersHome, 1.4);
    const awayCorners = sampleNegBinomial(expectedCornersAway, 1.4);
    const actualCards = samplePoisson(expectedCards);

    const context: FixtureContext = {
      fixtureId: `backtest_fix_${i + 1}`,
      homeTeamName: `Team Home ${i + 1}`,
      awayTeamName: `Team Away ${i + 1}`,
      competitionCode: comp.code,
      competitionName: comp.name,
      homeAttackRating: prof.homeAtk,
      homeDefenseRating: prof.homeDef,
      awayAttackRating: prof.awayAtk,
      awayDefenseRating: prof.awayDef,
      homeXg,
      awayXg,
      expectedCornersHome,
      expectedCornersAway,
      expectedCards,
      uncertaintyScore: prof.tags.includes('key-absences') ? 0.16 : 0.08,
      dataCoverageScore: 0.94,
      sampleSizeMatches: 22,
      stateTags: prof.tags as StateTag[],
      lineupConfirmed: true,
      verifiedOdds: undefined,
    };

    fixtures.push({
      context,
      actual: {
        homeGoals,
        awayGoals,
        homeCorners,
        awayCorners,
        cards: actualCards,
        firstHalfHomeGoals: h1Goals,
        firstHalfAwayGoals: a1Goals,
        secondHalfHomeGoals: h2Goals,
        secondHalfAwayGoals: a2Goals,
      }
    });
  }

  return fixtures;
}

function resolveOutcome(marketCode: string, line: number | undefined, actual: BacktestFixture['actual']): boolean {
  const totalGoals = actual.homeGoals + actual.awayGoals;
  const totalCorners = actual.homeCorners + actual.awayCorners;
  const total1HGoals = actual.firstHalfHomeGoals + actual.firstHalfAwayGoals;
  const total2HGoals = actual.secondHalfHomeGoals + actual.secondHalfAwayGoals;

  if (marketCode.startsWith('1X2_HOME')) return actual.homeGoals > actual.awayGoals;
  if (marketCode.startsWith('1X2_DRAW')) return actual.homeGoals === actual.awayGoals;
  if (marketCode.startsWith('1X2_AWAY')) return actual.awayGoals > actual.homeGoals;
  if (marketCode === 'DC_1X') return actual.homeGoals >= actual.awayGoals;
  if (marketCode === 'DC_X2') return actual.awayGoals >= actual.homeGoals;
  if (marketCode === 'DC_12') return actual.homeGoals !== actual.awayGoals;
  if (marketCode === 'DNB_HOME') return actual.homeGoals > actual.awayGoals;
  if (marketCode === 'DNB_AWAY') return actual.awayGoals > actual.homeGoals;

  if (marketCode.startsWith('AH_HOME_')) {
    const l = line ?? 0.0;
    return (actual.homeGoals - actual.awayGoals + l) > 0;
  }
  if (marketCode.startsWith('AH_AWAY_')) {
    const l = line ?? 0.0;
    return (actual.awayGoals - actual.homeGoals + l) > 0;
  }
  if (marketCode === 'EH_HOME_M1') return (actual.homeGoals - actual.awayGoals) >= 2;
  if (marketCode === 'EH_AWAY_P1') return actual.awayGoals >= actual.homeGoals;
  if (marketCode === 'EH_HOME_P1') return actual.homeGoals >= actual.awayGoals;

  if (marketCode.startsWith('TOTAL_GOALS_O')) {
    const l = line ?? 2.5;
    return totalGoals > l;
  }
  if (marketCode.startsWith('TOTAL_GOALS_U')) {
    const l = line ?? 2.5;
    return totalGoals < l;
  }

  if (marketCode.startsWith('GB_')) {
    if (marketCode === 'GB_2_3') return totalGoals >= 2 && totalGoals <= 3;
    if (marketCode === 'GB_2_4') return totalGoals >= 2 && totalGoals <= 4;
    if (marketCode === 'GB_1_3') return totalGoals >= 1 && totalGoals <= 3;
    if (marketCode === 'GB_2_') return totalGoals >= 2;
    if (marketCode === 'GB_3_') return totalGoals >= 3;
  }

  if (marketCode.startsWith('TGB_HOME_')) {
    if (marketCode === 'TGB_HOME_1_2') return actual.homeGoals >= 1 && actual.homeGoals <= 2;
    if (marketCode === 'TGB_HOME_2_') return actual.homeGoals >= 2;
  }
  if (marketCode.startsWith('TGB_AWAY_')) {
    if (marketCode === 'TGB_AWAY_1_2') return actual.awayGoals >= 1 && actual.awayGoals <= 2;
    if (marketCode === 'TGB_AWAY_2_') return actual.awayGoals >= 2;
  }

  if (marketCode === 'BTTS_YES') return actual.homeGoals > 0 && actual.awayGoals > 0;
  if (marketCode === 'BTTS_NO') return actual.homeGoals === 0 || actual.awayGoals === 0;

  if (marketCode.startsWith('TOTAL_CORNERS_O')) {
    const l = line ?? 9.5;
    return totalCorners > l;
  }
  if (marketCode.startsWith('TOTAL_CORNERS_U')) {
    const l = line ?? 9.5;
    return totalCorners < l;
  }
  if (marketCode.startsWith('TEAM_CORNERS_HOME_O')) {
    const l = line ?? 4.5;
    return actual.homeCorners > l;
  }
  if (marketCode.startsWith('TEAM_CORNERS_AWAY_O')) {
    const l = line ?? 4.5;
    return actual.awayCorners > l;
  }

  if (marketCode.startsWith('CARDS_O')) {
    const l = line ?? 4.5;
    return actual.cards > l;
  }
  if (marketCode.startsWith('CARDS_U')) {
    const l = line ?? 4.5;
    return actual.cards < l;
  }
  if (marketCode.startsWith('BOOKING_POINTS_O355')) {
    return (actual.cards * 10) > 35.5;
  }

  if (marketCode === 'HSH_2ND') return total2HGoals > total1HGoals;
  if (marketCode === 'HSH_1ST') return total1HGoals > total2HGoals;
  if (marketCode === 'HSH_EQUAL') return total1HGoals === total2HGoals;

  if (marketCode === 'FH_GOALS_O05') return total1HGoals > 0.5;
  if (marketCode === 'FH_GOALS_U15') return total1HGoals < 1.5;

  if (marketCode === '2H_RESULT_HOME') return actual.secondHalfHomeGoals > actual.secondHalfAwayGoals;
  if (marketCode === '2H_RESULT_DRAW') return actual.secondHalfHomeGoals === actual.secondHalfAwayGoals;

  return false;
}

export function runAudit() {
  const fixtures = generateBacktestDataset();
  console.log(`Starting Audit over ${fixtures.length} backtest fixtures...\n`);

  const topPickFamilyCounts: Record<string, number> = {};
  const familyProbabilities: Record<string, number[]> = {};
  const familyBrier: Record<string, { brierSum: number; baselineBrierSum: number; count: number }> = {};
  const lineStats: Record<string, { probSum: number; count: number; hitCount: number }> = {};
  const dataCoverage: Record<string, { covered: number; total: number }> = {};

  fixtures.forEach(({ context, actual }) => {
    const result = evaluateFixtureMarkets(context);
    const topPick = result.topPick;

    if (topPick) {
      const fam = (topPick.marketFamily as string) || topPick.marketCategory || topPick.optionType;
      topPickFamilyCounts[fam] = (topPickFamilyCounts[fam] || 0) + 1;
    }

    result.predictions.forEach(p => {
      const fam = (p.marketFamily as string) || p.marketCategory || p.optionType;
      if (!familyProbabilities[fam]) familyProbabilities[fam] = [];
      familyProbabilities[fam].push(p.modelProbability);

      // Line stats
      const lineKey = `${p.marketCode}`;
      if (!lineStats[lineKey]) lineStats[lineKey] = { probSum: 0, count: 0, hitCount: 0 };
      lineStats[lineKey].probSum += p.modelProbability;
      lineStats[lineKey].count += 1;

      // Evaluation vs actual
      const outcome = resolveOutcome(p.marketCode, p.line, actual);
      if (outcome) lineStats[lineKey].hitCount += 1;

      const y = outcome ? 1 : 0;
      const brier = Math.pow(p.modelProbability - y, 2);

      // Naive empirical baseline
      const baselineP = p.baselineProbability ?? 0.50;
      const baselineBrier = Math.pow(baselineP - y, 2);

      if (!familyBrier[fam]) familyBrier[fam] = { brierSum: 0, baselineBrierSum: 0, count: 0 };
      familyBrier[fam].brierSum += brier;
      familyBrier[fam].baselineBrierSum += baselineBrier;
      familyBrier[fam].count += 1;

      // Coverage
      if (!dataCoverage[fam]) dataCoverage[fam] = { covered: 0, total: 0 };
      dataCoverage[fam].total += 1;
      if (p.qualificationStatus !== 'UNQUALIFIED_HIGH_UNCERTAINTY') {
        dataCoverage[fam].covered += 1;
      }
    });
  });

  console.log('=== AUDIT RESULTS (STEP 1) ===\n');

  console.log('1. TOP PICK SHARE BY MARKET FAMILY:');
  const sortedShares = Object.entries(topPickFamilyCounts).sort((a, b) => b[1] - a[1]);
  sortedShares.forEach(([fam, count]) => {
    const pct = ((count / fixtures.length) * 100).toFixed(1);
    console.log(`  - ${fam.padEnd(20)}: ${count} fixtures (${pct}%)`);
  });

  const topPickCodes: Record<string, number> = {};
  fixtures.forEach(({ context }) => {
    const res = evaluateFixtureMarkets(context);
    if (res.topPick) {
      topPickCodes[res.topPick.marketCode] = (topPickCodes[res.topPick.marketCode] || 0) + 1;
    }
  });
  console.log('\nTOP PICK BY MARKET CODE:');
  Object.entries(topPickCodes).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => {
    console.log(`  - ${c.padEnd(25)}: ${n} (${((n / fixtures.length) * 100).toFixed(1)}%)`);
  });

  console.log('\n2. AVERAGE MODEL PROBABILITY & BRIER SKILL SCORE BY MARKET FAMILY:');
  Object.keys(familyProbabilities).forEach(fam => {
    const probs = familyProbabilities[fam];
    const avgProb = (probs.reduce((a, b) => a + b, 0) / probs.length * 100).toFixed(1);
    const brierInfo = familyBrier[fam];
    const mseModel = brierInfo.brierSum / brierInfo.count;
    const mseBase = brierInfo.baselineBrierSum / brierInfo.count;
    const brierSkillScore = (1 - (mseModel / mseBase)).toFixed(4);
    const cov = dataCoverage[fam] ? ((dataCoverage[fam].covered / dataCoverage[fam].total) * 100).toFixed(1) : '100.0';
    console.log(`  - ${fam.padEnd(20)}: Avg Prob: ${avgProb}% | Brier: ${mseModel.toFixed(3)} | BSS: ${brierSkillScore} | Data Coverage: ${cov}%`);
  });

  console.log('\n3. TOP 10 HIGHEST PROBABILITY LINES:');
  const sortedLines = Object.entries(lineStats)
    .map(([code, s]) => ({ code, avgProb: s.probSum / s.count, count: s.count, hitRate: s.hitCount / s.count }))
    .sort((a, b) => b.avgProb - a.avgProb)
    .slice(0, 10);
  sortedLines.forEach(l => {
    console.log(`  - ${l.code.padEnd(25)}: Avg Model Prob: ${(l.avgProb * 100).toFixed(1)}% | Empirical Hit: ${(l.hitRate * 100).toFixed(1)}% (n=${l.count})`);
  });
}

runAudit();
