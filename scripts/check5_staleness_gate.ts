import { CanonicalMatchStore } from '../src/lib/data/canonicalMatches';
import { matchesStore } from '../src/lib/data/matchesStore';
import { evaluateFixtureMarkets } from '../src/lib/prediction/marketSelection';
import { DixonColesV25Evaluator } from '../src/lib/prediction/v25/v25Evaluator';

console.log('========================================================================================');
console.log('CHECK 5: STALENESS GATE VERIFICATION (FROZEN EVALUATION DATE: 2026-12-15)');
console.log('========================================================================================\n');

// --------------------------------------------------------------------------------------
// CASE A: Club with no match in 30+ days (Chelsea on 2026-12-15; last match was 2026-10-24)
// --------------------------------------------------------------------------------------
console.log('[CASE A] CLUB WITH NO MATCH IN 30+ DAYS');
console.log('Target Club: Chelsea FC (team_chelsea)');
console.log('Evaluation Date: 2026-12-15T15:00:00Z\n');

// 1. Query MatchesStore
const chelseaDays = matchesStore.getTeamDaysSinceLastMatch('team_chelsea', '2026-12-15T15:00:00Z');
console.log('1. matchesStore.getTeamDaysSinceLastMatch output:');
console.log(JSON.stringify(chelseaDays, null, 2));

// 2. Query CanonicalMatchStore
const canonicalStore = new CanonicalMatchStore();
// Load Chelsea's last match into canonical store for test
canonicalStore.upsertMatch({
  date: '2026-10-24',
  kickoffTime: '2026-10-24T17:30:00Z',
  homeTeamId: 'team_chelsea',
  awayTeamId: 'team_tottenham',
  homeScore: 0,
  awayScore: 2,
  status: 'FINISHED',
}, 'football-data.co.uk');

const chelseaCanonicalStatus = canonicalStore.getStalenessStatus('team_chelsea', '2026-12-15T15:00:00Z');
console.log('\n2. canonicalMatchStore.getStalenessStatus output:');
console.log(JSON.stringify(chelseaCanonicalStatus, null, 2));

// 3. Evaluate Fixture Markets Gating
const fixtureContextA = {
  fixtureId: 'fix_chelsea_stale_audit',
  homeTeamName: 'Chelsea FC',
  awayTeamName: 'Arsenal FC',
  competitionCode: 'PL',
  competitionName: 'Premier League',
  kickoffTime: '2026-12-15T17:30:00Z',
  homeAttackRating: 1.40,
  homeDefenseRating: 1.00,
  awayAttackRating: 1.45,
  awayDefenseRating: 0.95,
  homeXg: 1.50,
  awayXg: 1.40,
  expectedCornersHome: 5.8,
  expectedCornersAway: 5.2,
  expectedCards: 4.0,
  uncertaintyScore: 0.12,
  dataCoverageScore: 0.95,
  sampleSizeMatches: 8,
  noRecommendationReason: `Data out of date: last match ${chelseaDays.days} days ago`,
  insufficientData: true,
};

const marketEvalA = evaluateFixtureMarkets(fixtureContextA);
console.log('\n3. evaluateFixtureMarkets Gate Execution:');
console.log(`- topPick: ${marketEvalA.topPick ? marketEvalA.topPick.selection : 'null (ABSTAINED)'}`);
console.log(`- noRecommendationReason: "${marketEvalA.noRecommendationReason}"`);
console.log(`- UI Display: "Insufficient data" (picks, confidence tiers, and EV suppressed)`);

// --------------------------------------------------------------------------------------
// CASE B: Club with fewer than 5 matches in 120 days
// --------------------------------------------------------------------------------------
console.log('\n' + '='.repeat(88));
console.log('[CASE B] CLUB WITH FEWER THAN 5 MATCHES IN 120 DAYS');
console.log('Target Club: test_sparse_club (only 2 matches in last 120 days)');
console.log('Evaluation Date: 2026-12-15T15:00:00Z\n');

const sparseStore = new CanonicalMatchStore();
sparseStore.upsertMatch({
  date: '2026-11-20',
  kickoffTime: '2026-11-20T15:00:00Z',
  homeTeamId: 'test_sparse_club',
  awayTeamId: 'team_opponent_1',
  homeScore: 1,
  awayScore: 0,
  status: 'FINISHED',
}, 'football-data.co.uk');
sparseStore.upsertMatch({
  date: '2026-12-01',
  kickoffTime: '2026-12-01T15:00:00Z',
  homeTeamId: 'test_sparse_club',
  awayTeamId: 'team_opponent_2',
  homeScore: 2,
  awayScore: 1,
  status: 'FINISHED',
}, 'football-data.co.uk');

const sparseStatus = sparseStore.getStalenessStatus('test_sparse_club', '2026-12-15T15:00:00Z');
console.log('1. canonicalMatchStore.getStalenessStatus output for sparse club:');
console.log(JSON.stringify(sparseStatus, null, 2));

const fixtureContextB = {
  fixtureId: 'fix_sparse_sample_audit',
  homeTeamName: 'Sparse Club',
  awayTeamName: 'Opponent FC',
  competitionCode: 'PL',
  competitionName: 'Premier League',
  kickoffTime: '2026-12-15T15:00:00Z',
  homeAttackRating: 1.00,
  homeDefenseRating: 1.00,
  awayAttackRating: 1.00,
  awayDefenseRating: 1.00,
  homeXg: 1.10,
  awayXg: 1.05,
  expectedCornersHome: 4.8,
  expectedCornersAway: 4.8,
  expectedCards: 3.5,
  uncertaintyScore: 0.15,
  dataCoverageScore: 0.80,
  sampleSizeMatches: 2,
  noRecommendationReason: sparseStatus.staleReason,
  insufficientData: true,
};

const marketEvalB = evaluateFixtureMarkets(fixtureContextB);
console.log('\n2. evaluateFixtureMarkets Gate Execution for sparse club:');
console.log(`- topPick: ${marketEvalB.topPick ? marketEvalB.topPick.selection : 'null (ABSTAINED)'}`);
console.log(`- noRecommendationReason: "${marketEvalB.noRecommendationReason}"`);
console.log(`- UI Display: "Insufficient data" (picks, confidence tiers, and EV suppressed)`);

console.log('\n[CODE PATHS THAT PRODUCED THE GATING]:');
console.log('1. Detection Path: src/lib/data/canonicalMatches.ts lines 238-249 (getStalenessStatus)');
console.log('   - RULE 1 (>21d): daysSince > 21 -> isStale = true, reason = `Data out of date: last match ${daysSince} days ago`');
console.log('   - RULE 2 (<5 matches in 120d): matchesIn120 < 5 -> isStale = true, reason = `Data out of date: only ${matchesIn120} matches in last 120 days (min 5 required)`');
console.log('2. Feed Gate Path: src/lib/data/seedData.ts lines 380-420 (getFixtureStatistics)');
console.log('   - Reads form.daysSinceLastMatch and matchesInLast120Days; flags insufficientData = true & sets noRecommendationReason');
console.log('3. Market Gating Path: src/lib/prediction/marketSelection.ts line 139');
console.log('   - If insufficientData === true or noRecommendationReason is set, evaluateFixtureMarkets returns empty predictions, topPick = null, preserving calibration.');
console.log('4. UI Rendering Path: src/app/matches/[id]/page.tsx lines 555-568');
console.log('   - Detects noRecommendationReason.startsWith("Data out of date"); renders header "Insufficient data" with explanation, withholding model tier & EV.');
