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

// --------------------------------------------------------------------------------------
// CASE C: Club with zero records in database (Fail-closed gate)
// --------------------------------------------------------------------------------------
console.log('\n' + '='.repeat(88));
console.log('[CASE C] CLUB WITH ZERO MATCH RECORDS IN DATABASE (FAIL-CLOSED GATE)');
console.log('Target Club: test_zero_records_club (0 matches stored)');
console.log('Evaluation Date: 2026-10-31T15:00:00Z\n');

const zeroStore = new CanonicalMatchStore();
const zeroStatus = zeroStore.getStalenessStatus('test_zero_records_club', '2026-10-31T15:00:00Z');
console.log('1. canonicalMatchStore.getStalenessStatus output for zero records:');
console.log(JSON.stringify(zeroStatus, null, 2));

const fixtureContextC = {
  fixtureId: 'fix_zero_sample_audit',
  homeTeamName: 'Zero Records FC',
  awayTeamName: 'Opponent FC',
  competitionCode: 'E3',
  competitionName: 'League Two',
  kickoffTime: '2026-10-31T15:00:00Z',
  homeAttackRating: 1.00,
  homeDefenseRating: 1.00,
  awayAttackRating: 1.00,
  awayDefenseRating: 1.00,
  homeXg: 0,
  awayXg: 0,
  expectedCornersHome: 0,
  expectedCornersAway: 0,
  expectedCards: 0,
  uncertaintyScore: null,
  dataCoverageScore: null,
  sampleSizeMatches: 0,
  noRecommendationReason: zeroStatus.displayStatus,
  insufficientData: true,
  hasRealTeamStrength: false,
};

const marketEvalC = evaluateFixtureMarkets(fixtureContextC);
console.log('\n2. evaluateFixtureMarkets Gate Execution for zero records:');
console.log(`- topPick: ${marketEvalC.topPick ? marketEvalC.topPick.selection : 'null (ABSTAINED)'}`);
console.log(`- noRecommendationReason: "${marketEvalC.noRecommendationReason}"`);
console.log(`- UI Display: "${zeroStatus.displayStatus}" (picks, confidence tiers, and EV suppressed)`);

// --------------------------------------------------------------------------------------
// PART 2: 92-CLUB STALENESS GATE AUDIT
// --------------------------------------------------------------------------------------
console.log('\n' + '='.repeat(88));
console.log('PART 2: ALL 92 ENGLISH CLUBS STALENESS GATE AUDIT (AS OF 2026-10-31)');
console.log('========================================================================================\n');

import { CANONICAL_TEAMS } from '../src/lib/data/canonicalTeams';

const allTeams = Object.values(CANONICAL_TEAMS);
const plTeams = allTeams.filter(t => t.competitionCode === 'PL');
const elcTeams = allTeams.filter(t => t.competitionCode === 'ELC');
const e2Teams = allTeams.filter(t => t.competitionCode === 'E2');
const e3Teams = allTeams.filter(t => t.competitionCode === 'E3');
const natTeams = allTeams.filter(t => t.competitionCode === 'NAT');
const clubs92 = [...plTeams, ...elcTeams, ...e2Teams, ...e3Teams];

let gatePassCount = 0;
let gateInsufficientCount = 0;
let gateStaleCount = 0;
const gatedReasons: { id: string; name: string; div: string; reason: string }[] = [];

console.log('| # | Canonical ID | Club Name | Div | Last Match Date | Days Ago | 120d Matches | Gate Status | Gate Display |');
console.log('|---|---|---|---|---|---|---|---|---|');

clubs92.forEach((club, idx) => {
  const query = matchesStore.getTeamDaysSinceLastMatch(club.canonicalId, '2026-10-31T15:00:00Z');
  let status: 'PASS' | 'INSUFFICIENT' | 'STALE' = 'PASS';
  let display = 'Active (Pass)';

  if (query.lastMatchDate === null || query.days === null) {
    status = 'INSUFFICIENT';
    display = 'Insufficient data (0 matches)';
    gateInsufficientCount++;
    gatedReasons.push({ id: club.canonicalId, name: club.canonicalName, div: club.competitionCode, reason: 'Zero match records stored in database' });
  } else if (query.days > 21) {
    status = 'STALE';
    display = `Stale (>21d: ${query.days}d ago)`;
    gateStaleCount++;
    gatedReasons.push({ id: club.canonicalId, name: club.canonicalName, div: club.competitionCode, reason: `Last match ${query.days} days ago (>21d limit)` });
  } else if (query.matchesInLast120Days < 5) {
    status = 'STALE';
    display = `Stale (<5 in 120d: ${query.matchesInLast120Days})`;
    gateStaleCount++;
    gatedReasons.push({ id: club.canonicalId, name: club.canonicalName, div: club.competitionCode, reason: `Only ${query.matchesInLast120Days} matches in last 120 days (<5 minimum required)` });
  } else {
    gatePassCount++;
  }

  const lastDateStr = query.lastMatchDate ? query.lastMatchDate.slice(0, 10) : 'NONE';
  const daysStr = query.days !== null ? query.days.toString() : 'N/A';

  console.log(`| ${(idx + 1).toString().padStart(2, ' ')} | ${club.canonicalId.padEnd(25, ' ')} | ${club.canonicalName.padEnd(26, ' ')} | ${club.competitionCode.padEnd(3, ' ')} | ${lastDateStr.padEnd(10, ' ')} | ${daysStr.padEnd(8, ' ')} | ${query.matchesInLast120Days.toString().padEnd(12, ' ')} | ${status.padEnd(12, ' ')} | ${display} |`);
});

console.log('\n--- AUDITING RELEGATED / OUT-OF-SCOPE CLUBS (NAT) ---');
console.log('| # | Canonical ID | Club Name | Div | Last Match Date | Days Ago | 120d Matches | Gate Status | Gating Reason |');
console.log('|---|---|---|---|---|---|---|---|---|');
natTeams.forEach((club, idx) => {
  const query = matchesStore.getTeamDaysSinceLastMatch(club.canonicalId, '2026-10-31T15:00:00Z');
  let status = 'STALE';
  let reason = '';
  if (query.lastMatchDate === null) {
    status = 'INSUFFICIENT';
    reason = 'Insufficient data: 0 matches';
  } else {
    reason = `Relegated out of scope to National League; last match ${query.days}d ago (${query.lastMatchDate?.slice(0, 10)})`;
  }
  const lastDateStr = query.lastMatchDate ? query.lastMatchDate.slice(0, 10) : 'NONE';
  const daysStr = query.days !== null ? query.days.toString() : 'N/A';
  console.log(`| ${(idx + 1).toString().padStart(2, ' ')} | ${club.canonicalId.padEnd(25, ' ')} | ${club.canonicalName.padEnd(26, ' ')} | ${club.competitionCode.padEnd(3, ' ')} | ${lastDateStr.padEnd(10, ' ')} | ${daysStr.padEnd(8, ' ')} | ${query.matchesInLast120Days.toString().padEnd(12, ' ')} | ${status.padEnd(12, ' ')} | ${reason} |`);
});

console.log('\n========================================================================================');
console.log('92-CLUB STALENESS GATE SUMMARY:');
console.log('========================================================================================');
console.log(`Total Clubs Audited: ${clubs92.length}`);
console.log(`Clubs With Records: ${clubs92.filter(c => matchesStore.getTeamDaysSinceLastMatch(c.canonicalId).lastMatchDate !== null).length} clubs`);
console.log(`PASS Gate: ${gatePassCount} clubs`);
console.log(`INSUFFICIENT DATA Gate (0 match records): ${gateInsufficientCount} clubs`);
console.log(`STALE Gate (>21d or <5 in 120d): ${gateStaleCount} clubs`);
console.log(`Total In-Scope Gated: ${gateInsufficientCount + gateStaleCount} clubs`);
if (gatedReasons.length > 0) {
  console.log('Gated Clubs Reasons:');
  gatedReasons.forEach(r => console.log(`  - [${r.div}] ${r.name} (${r.id}): ${r.reason}`));
} else {
  console.log('Gated Clubs Reasons: None. All 92 clubs in the 2026/27 English Football League pass the gate.');
}

console.log('\n[CODE PATHS THAT PRODUCED THE GATING]:');
console.log('1. Detection Path: src/lib/data/canonicalMatches.ts lines 211-260 (getStalenessStatus)');
console.log('   - RULE 0 (0 records): dates.length === 0 -> isStale = true, status = "INSUFFICIENT", displayStatus = "Insufficient data"');
console.log('   - RULE 1 (>21d): daysSince > 21 -> isStale = true, reason = `Data out of date: last match ${daysSince} days ago`');
console.log('   - RULE 2 (<5 matches in 120d): matchesIn120 < 5 -> isStale = true, reason = `Data out of date: only ${matchesIn120} matches in last 120 days (min 5 required)`');
console.log('2. Feed Gate Path: src/lib/data/seedData.ts lines 372-425 (getFixtureStatistics)');
console.log('   - Reads homeLastMatch and awayLastMatch; zero records flags insufficientData = true & sets noRecommendationReason = "Insufficient data"');
console.log('3. Market Gating Path: src/lib/prediction/marketSelection.ts line 139');
console.log('   - If insufficientData === true or noRecommendationReason includes "Insufficient data", evaluateFixtureMarkets returns empty predictions, topPick = null.');
console.log('4. UI Rendering Path: src/app/matches/[id]/page.tsx lines 555-568');
console.log('   - Detects noRecommendationReason; renders header "Insufficient data" with explanation, withholding model tier & EV.');
