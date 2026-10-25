import { lookupTeamStrength } from '../src/lib/data/teamDatabase';
import { displayName, getTeamAbbreviation, formatMatchTime } from '../src/lib/utils/formatText';
import { evaluateMatchdayVariance } from '../src/lib/prediction/varianceGuard';
import { DixonColesV25Evaluator } from '../src/lib/prediction/v25/v25Evaluator';
import { REAL_250_MATCHES } from '../src/lib/data/realMatchArchive';
import { getFixtureStatistics } from '../src/lib/data/seedData';
import { evaluateFixtureMarkets } from '../src/lib/prediction/marketSelection';
import { Fixture, FixtureContext } from '../src/types';

async function runTests() {
  console.log('====================================================');
  console.log('CALIBRALL: VERIFYING DATA & DISPLAY BUG FIXES (1 - 8)');
  console.log('====================================================\n');

  let allPassed = true;

  // ----------------------------------------------------
  // TEST 1: Matchday Variance Guard & Non-Fallback Priors
  // ----------------------------------------------------
  console.log('--- TEST 1: Matchday Variance Guard & Non-Fallback Priors ---');

  // Evaluate the 12 active matchday fixtures
  const sampleFixtures = REAL_250_MATCHES.slice(0, 12);
  const evaluatedPicks: any[] = [];
  const homeProbs: number[] = [];
  const over15Probs: number[] = [];
  const matchdayList: { fixtureId: string; predictions: any[] }[] = [];

  for (const match of sampleFixtures) {
    const evalRes = evaluateFixtureMarkets(match.context);
    matchdayList.push({ fixtureId: match.id, predictions: evalRes.predictions });

    const homeWinPick = evalRes.predictions.find(p => p.marketCode === '1X2_HOME');
    const over15Pick = evalRes.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O15');

    const hProb = homeWinPick?.calibratedProbability ?? homeWinPick?.modelProbability ?? 0;
    const o15Prob = over15Pick?.calibratedProbability ?? over15Pick?.modelProbability ?? 0;

    homeProbs.push(hProb);
    over15Probs.push(o15Prob);

    evaluatedPicks.push({
      fixture: `${match.homeTeam} vs ${match.awayTeam}`,
      comp: match.competitionCode,
      homeWinProb: (hProb * 100).toFixed(1) + '%',
      over15Prob: (o15Prob * 100).toFixed(1) + '%',
      uncertainty: match.context.uncertaintyScore !== null ? `±${(match.context.uncertaintyScore * 100).toFixed(1)}%` : 'null',
      coverage: match.context.dataCoverageScore !== null ? `${(match.context.dataCoverageScore * 100).toFixed(0)}%` : 'null',
      topPick: evalRes.topPick?.selection || evalRes.noRecommendationReason || 'None',
    });
  }

  console.table(evaluatedPicks);

  // Run variance check across all markets
  const varianceReport = evaluateMatchdayVariance(matchdayList);

  console.log(`Matchday variance guard passed: ${varianceReport.passed}`);
  if (varianceReport.violations.length > 0) {
    console.error('Violations found:', varianceReport.violations);
    allPassed = false;
  } else {
    console.log('PASS: Variance guard passed across all matchday markets (zero >30% identical violations).');
  }

  // Check that not every fixture is 50.2% or 85.0%
  const has502Dominance = homeProbs.filter(p => (p * 100).toFixed(1) === '50.2').length / homeProbs.length > 0.30;
  const has850Dominance = over15Probs.filter(p => (p * 100).toFixed(1) === '85.0').length / over15Probs.length > 0.30;

  if (has502Dominance || has850Dominance) {
    console.error('FAIL: Fallback priors 50.2% or 85.0% still dominating!');
    allPassed = false;
  } else {
    console.log('PASS: Fallback priors 50.2% and 85.0% eliminated!');
  }

  // Hard rule check on insufficient data:
  const dummyContext: FixtureContext = {
    fixtureId: 'test_insufficient',
    homeTeamName: 'Unknown FC',
    awayTeamName: 'Mystery Rovers',
    competitionCode: 'BL1',
    competitionName: 'Bundesliga',
    homeAttackRating: 1.0,
    homeDefenseRating: 1.0,
    awayAttackRating: 1.0,
    awayDefenseRating: 1.0,
    homeXg: 1.5,
    awayXg: 1.0,
    expectedCornersHome: 5,
    expectedCornersAway: 4,
    expectedCards: 3.5,
    uncertaintyScore: null as any,
    dataCoverageScore: null as any,
    sampleSizeMatches: 0,
    stateTags: [],
    lineupConfirmed: false,
    insufficientData: true,
    hasRealTeamStrength: false,
  };

  const evalInsufficient = DixonColesV25Evaluator.evaluateFixture(dummyContext);
  console.log(`Insufficient data fixture topPick: ${evalInsufficient.topPick}, reason: "${evalInsufficient.noRecommendationReason}"`);
  if (evalInsufficient.topPick !== null || evalInsufficient.noRecommendationReason !== 'Not enough data') {
    console.error('FAIL: Hard rule for insufficient data failed!');
    allPassed = false;
  } else {
    console.log('PASS: Hard rule for insufficient data returned topPick: null and "Not enough data"');
  }

  // ----------------------------------------------------
  // TEST 2: Team Abbreviations Verification
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Team Abbreviations Verification ---');
  const testTeams = [
    { name: 'Bayer 04 Leverkusen', shortName: 'Leverkusen', expected: 'B04' },
    { name: 'Borussia Mönchengladbach', shortName: "M'gladbach", expected: 'BMG' },
    { name: '1. FSV Mainz 05', shortName: 'Mainz', expected: 'M05' },
    { name: 'SC Freiburg', shortName: 'Freiburg', expected: 'SCF' },
    { name: 'FC Bayern München', shortName: 'Bayern', expected: 'FCB' },
    { name: 'SC Paderborn 07', shortName: 'Paderborn', expected: 'SCP' },
    { name: 'Esporte Clube Bahia', shortName: 'Bahia', expected: 'BAH' },
    { name: 'SV 07 Elversberg', shortName: 'Elversberg', expected: 'SVE' },
  ];

  let abbrPassed = true;
  for (const t of testTeams) {
    const abbr = getTeamAbbreviation(t);
    const ok = abbr === t.expected;
    console.log(`Team: "${t.name}" -> Abbr: "${abbr}" (expected: "${t.expected}") [${ok ? 'OK' : 'MISMATCH'}]`);
    if (!ok) abbrPassed = false;
  }

  if (!abbrPassed) {
    console.error('FAIL: Team abbreviations mismatch!');
    allPassed = false;
  } else {
    console.log('PASS: All target team abbreviations match verified provider TLAs!');
  }

  // ----------------------------------------------------
  // TEST 3: Team Names Inconsistency & Pick Labels
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Team Names & Pick Labels Verification ---');
  const nameChecks = [
    { raw: 'Fortuna Sittard', expectedShort: 'Sittard' },
    { raw: 'FC Internazionale Milano', expectedShort: 'Inter' },
    { raw: 'Internazionale Milano', expectedShort: 'Inter' },
    { raw: 'Genoa CFC', expectedShort: 'Genoa' },
    { raw: 'AS Monaco FC', expectedShort: 'Monaco' },
    { raw: 'AS Monaco', expectedShort: 'Monaco' },
    { raw: 'Venezia FC', expectedShort: 'Venezia' },
    { raw: 'Excelsior Rotterdam', expectedShort: 'Excelsior' },
  ];

  let namePassed = true;
  for (const item of nameChecks) {
    const short = displayName(item.raw);
    const ok = short === item.expectedShort;
    console.log(`Raw: "${item.raw}" -> displayName: "${short}" (expected: "${item.expectedShort}") [${ok ? 'OK' : 'MISMATCH'}]`);
    if (!ok) namePassed = false;
  }

  // Check generated pick labels on Sittard and Inter:
  const sittardEval = evaluateFixtureMarkets({
    fixtureId: 'test_sittard',
    homeTeamName: 'Fortuna Sittard',
    awayTeamName: 'Excelsior',
    competitionCode: 'DED',
    competitionName: 'Eredivisie',
    homeAttackRating: 1.15,
    homeDefenseRating: 1.10,
    awayAttackRating: 1.05,
    awayDefenseRating: 1.25,
    homeXg: 1.45,
    awayXg: 1.10,
    expectedCornersHome: 5.5,
    expectedCornersAway: 4.5,
    expectedCards: 3.5,
    uncertaintyScore: 0.05,
    dataCoverageScore: 0.88,
    sampleSizeMatches: 18,
    stateTags: [],
    lineupConfirmed: true,
  });

  const pickLabels = sittardEval.predictions.map(p => p.selection);
  console.log('Sittard fixture pick labels:', pickLabels.slice(0, 5));

  const hasFortunaSittardWin = pickLabels.some(l => l.includes('Fortuna Sittard win') || l.includes('Fortuna Sittard Win'));
  const hasSittardWin = pickLabels.some(l => l.includes('Sittard win') || l.includes('Sittard or Draw'));

  console.log(`Contains "Fortuna Sittard win": ${hasFortunaSittardWin} (should be false)`);
  console.log(`Contains "Sittard win": ${hasSittardWin} (should be true)`);

  if (hasFortunaSittardWin || !hasSittardWin) {
    console.error('FAIL: Pick labels still contain raw cumbersome team names!');
    allPassed = false;
  } else {
    console.log('PASS: Pick labels consistently use displayName short names!');
  }

  // ----------------------------------------------------
  // TEST 4: Kickoff Times (WAT)
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Kickoff Times Timezone Verification ---');
  const sampleKickoff = '2026-03-01T13:30:00Z'; // 13:30 UTC = 14:30 WAT
  const formattedWat = formatMatchTime(sampleKickoff, 'Africa/Lagos');
  console.log(`UTC: 13:30 -> WAT formatted: "${formattedWat}" (expected: "14:30")`);
  if (formattedWat !== '14:30') {
    console.error('FAIL: Kickoff time in WAT did not match 14:30!');
    allPassed = false;
  } else {
    console.log('PASS: Kickoff time converts correctly to WAT without "UTC" suffix on cards!');
  }

  console.log('\n====================================================');
  console.log(allPassed ? 'ALL DATA & DISPLAY TESTS PASSED!' : 'SOME TESTS FAILED!');
  console.log('====================================================');
  
  if (!allPassed) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
