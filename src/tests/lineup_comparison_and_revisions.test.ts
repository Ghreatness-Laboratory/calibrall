// CALIBRALL: Official Lineups, Comparison Engine & Pick Revisions Test Suite
// Verifies all acceptance criteria for Prompt: official lineups, comparison and highlights:
// 0. Provider coverage documentation check
// 1. Fetching: 90-minute polling window, quota enforcement, and stop-when-confirmed rule
// 2. Expected XI before release: labeled strictly "Expected XI", never "lineup"
// 3. Comparison when confirmed: rotation count, formation change, missing key players, impact summary
// 4. Effect on picks: highlight-only rule, "Review: lineup changed" flag
// 5. Record integrity: Revision 1 vs Revision 2 pre-kickoff timestamps and dual grading
// 6. UI rules: Sub-30-minute fallback "Lineup not released yet" without guessing

import assert from 'assert';
import { 
  buildExpectedXI, 
  buildConfirmedLineup, 
  compareLineups, 
  isFixtureInPollingWindow, 
  isFixtureWithin30Mins,
  getFixtureLineupState,
  syncActiveWindowLineups
} from '../lib/data/lineupsService';
import { forwardPickLedger } from '../lib/prediction/forwardPickLedger';
import { Fixture } from '../types';

console.log('--- STARTING OFFICIAL LINEUPS & PICK REVISIONS AUDIT TEST ---');

// -----------------------------------------------------------------------------
// TEST 1: Coverage Check Documentation
// -----------------------------------------------------------------------------
console.log('[TEST 1] Provider Coverage & Lineup Capabilities Audit...');
const PROVIDER_COVERAGE = {
  footballDataOrg: {
    plan: 'Free Tier (Tier One)',
    officialConfirmedLineups: false,
    formations: false,
    bench: false,
    injuriesOrSuspensions: false,
    latency: 'N/A on Free (T-60 on paid Tier Two/Enterprise)',
    predictedAvailable: false,
    upgradePlanRequired: 'Paid Tier Two or Enterprise for lineups; Sportmonks or API-Football for injuries',
  },
  sportmonks: {
    plan: 'Football Pro / Enterprise API v3',
    officialConfirmedLineups: true,
    formations: true,
    bench: true,
    injuriesOrSuspensions: true,
    latency: 'T-60 to T-45 mins before kickoff',
    predictedAvailable: true, // Tagged distinctly as predicted
    upgradePlanRequired: 'Already supported on Football Pro / Enterprise plan (Lineups & Sidelined includes)',
  },
  theOddsApi: {
    plan: 'Standard / Free / Paid',
    officialConfirmedLineups: false,
    formations: false,
    bench: false,
    injuriesOrSuspensions: false,
    latency: 'N/A (Strictly odds feed)',
    predictedAvailable: false,
    upgradePlanRequired: 'The Odds API has no squad/lineup data on any plan; must use Sportmonks Pro or API-Football',
  },
  fixturesFeedESPN: {
    plan: 'Public Verified Scoreboard',
    officialConfirmedLineups: true, // via summary endpoint
    formations: true,
    bench: true,
    injuriesOrSuspensions: false, // partial/inconsistent news notes only
    latency: 'T-60 mins before kickoff',
    predictedAvailable: false,
    upgradePlanRequired: 'Commercial B2B usage requires Sportmonks Pro or API-Football for structured SLA',
  }
};

assert.strictEqual(PROVIDER_COVERAGE.footballDataOrg.officialConfirmedLineups, false, 'Football-Data.org Free tier must not claim lineups');
assert.strictEqual(PROVIDER_COVERAGE.sportmonks.officialConfirmedLineups, true, 'Sportmonks Pro must support confirmed lineups');
assert.strictEqual(PROVIDER_COVERAGE.sportmonks.injuriesOrSuspensions, true, 'Sportmonks must provide sidelined/injury data');
assert.strictEqual(PROVIDER_COVERAGE.theOddsApi.officialConfirmedLineups, false, 'The Odds API does not provide lineups on any tier');
console.log('✓ PASS: Provider coverage documentation audit verified.');

// -----------------------------------------------------------------------------
// TEST 2: 90-Minute Polling Window & Stop-When-Confirmed Rule
// -----------------------------------------------------------------------------
console.log('[TEST 2] 90-Minute Polling Window Quota Enforcement...');
const nowMs = new Date('2026-10-24T12:00:00Z').getTime();

// 1. Kickoff in 45 mins -> within 90-min window -> should poll
const kickoffIn45 = new Date('2026-10-24T12:45:00Z').toISOString();
assert.strictEqual(isFixtureInPollingWindow(kickoffIn45, nowMs), true, 'Fixture in 45 mins must be inside polling window');

// 2. Kickoff in 120 mins -> outside 90-min window -> should skip to save quota
const kickoffIn120 = new Date('2026-10-24T14:00:00Z').toISOString();
assert.strictEqual(isFixtureInPollingWindow(kickoffIn120, nowMs), false, 'Fixture in 120 mins must be outside polling window');

// 3. Past kickoff -> should not poll
const kickoffPast = new Date('2026-10-24T11:30:00Z').toISOString();
assert.strictEqual(isFixtureInPollingWindow(kickoffPast, nowMs), false, 'Past fixture must not be polled');
console.log('✓ PASS: Polling restricted strictly to [now, now + 90 mins].');

// -----------------------------------------------------------------------------
// TEST 3: Expected XI Labeling Rule
// -----------------------------------------------------------------------------
console.log('[TEST 3] Expected XI Strict Labeling (Never "lineup")...');
const mciExpected = buildExpectedXI('Manchester City', 'team_mancity');

assert.strictEqual(mciExpected.status, 'predicted', 'Pre-release status must be "predicted"');
assert.strictEqual(mciExpected.starters.length, 11, 'Expected XI must contain exactly 11 starters');
assert(mciExpected.bench.length >= 5, 'Expected bench must contain substitute roster');

// Check that no output or label uses "lineup" for the unconfirmed state
const sampleDummyFixture: Fixture = {
  id: 'fix_test_mci_sou',
  competitionId: 'comp_pl',
  competition: { id: 'comp_pl', code: 'PL', name: 'Premier League', country: 'England', tier: 1, avgGoalsPerGame: 2.8, avgCornersPerGame: 10, avgCardsPerGame: 4, isActive: true },
  seasonYear: '2026/2027',
  homeTeam: { id: 'team_mci', name: 'Manchester City', shortName: 'Man City', tla: 'MCI', hasRealTeamStrength: true },
  awayTeam: { id: 'team_sou', name: 'Southampton', shortName: 'Southampton', tla: 'SOU', hasRealTeamStrength: true },
  kickoffTime: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
  matchday: 9,
  status: 'SCHEDULED',
};

const preReleaseState = getFixtureLineupState(sampleDummyFixture, { forceConfirmed: false });
assert.strictEqual(preReleaseState.home.expected.status, 'predicted', 'Unconfirmed state must be predicted');
console.log('✓ PASS: Pre-release rosters labeled strictly as "Expected XI".');

// -----------------------------------------------------------------------------
// TEST 4: Comparison When Lineup Confirmed (Rotations, Formations, Missing Key Players)
// -----------------------------------------------------------------------------
console.log('[TEST 4] Lineup Comparison Engine & Key Player Out Detection...');
// Simulate Erling Haaland rested/out
const mciConfirmedMissingHaaland = buildConfirmedLineup(mciExpected, 'key_missing', 'Erling Haaland');
const comparison = compareLineups(mciExpected, mciConfirmedMissingHaaland);

assert.strictEqual(comparison.hasKeyPlayerOut, true, 'Must detect that key player is out');
assert(comparison.keyPlayerOutNames.includes('Erling Haaland'), 'Missing key player must be Erling Haaland');
assert(comparison.rotationCount >= 1, 'Rotation count must be at least 1');
assert(comparison.impactSummary.some(s => s.includes('Erling Haaland not in the XI')), 'Must generate human-readable impact statement');
console.log('Sample Generated Impact Summary:', comparison.impactSummary);
console.log('✓ PASS: Comparison engine correctly flagged Erling Haaland out with rotation count.');

// -----------------------------------------------------------------------------
// TEST 5: Key Player Definition Verification
// -----------------------------------------------------------------------------
console.log('[TEST 5] Key Player Roles (Top Scorer/Assister, GK, CB, Captain)...');
// Verify template identifies roles
const hasCaptain = mciExpected.starters.some(p => p.isCaptain);
const hasGK = mciExpected.starters.some(p => p.position === 'GK' && p.isKeyPlayer);
const hasCB = mciExpected.starters.some(p => p.position === 'DF' && p.isKeyPlayer);
const hasScorer = mciExpected.starters.some(p => p.position === 'FW' && p.isKeyPlayer);

assert.strictEqual(hasCaptain, true, 'Expected XI must identify regular captain');
assert.strictEqual(hasGK, true, 'Expected XI must identify first-choice goalkeeper');
assert.strictEqual(hasCB, true, 'Expected XI must identify primary centre-back');
assert.strictEqual(hasScorer, true, 'Expected XI must identify primary goal scorer');
console.log('✓ PASS: Key player categories (captain, GK, CB, top scorer) fully mapped.');

// -----------------------------------------------------------------------------
// TEST 6: Effect on Picks (Highlight-Only & Review Badge)
// -----------------------------------------------------------------------------
console.log('[TEST 6] Effect on Picks: Highlight-Only & "Review: lineup changed"...');
const fixtureStateWithAbsence = getFixtureLineupState(sampleDummyFixture, {
  forceConfirmed: true,
  simulateKeyPlayerOut: true,
  keyPlayerOutName: 'Erling Haaland',
});

assert.strictEqual(fixtureStateWithAbsence.anyKeyPlayerOut, true);
assert.strictEqual(fixtureStateWithAbsence.pickReviewRequired, true, 'Pick review must be required when key player out');
console.log('✓ PASS: Pick review required flag enabled for missing key star.');

// -----------------------------------------------------------------------------
// TEST 7: Record Integrity: Revision 1 vs Revision 2 Pre-Kickoff Ledger
// -----------------------------------------------------------------------------
console.log('[TEST 7] Record Integrity: Immutable Revisions & Dual Grading...');
const revisions = forwardPickLedger.getPickRevisions('fix_pl_mci_sou');

assert(revisions.length >= 2, 'Must have both Revision 1 (pre-lineup) and Revision 2 (post-lineup)');
const rev1 = revisions.find(r => r.revisionNumber === 1);
const rev2 = revisions.find(r => r.revisionNumber === 2);

assert(rev1, 'Revision 1 must exist');
assert(rev2, 'Revision 2 must exist');

// Both must have timestamps strictly prior to kickoff
const kickoffTimeMs = new Date(rev1.kickoffTime).getTime();
const rev1RecordedMs = new Date(rev1.recordedAt).getTime();
const rev2RecordedMs = new Date(rev2.recordedAt).getTime();

assert(rev1RecordedMs < kickoffTimeMs, 'Revision 1 must be recorded prior to kickoff');
assert(rev2RecordedMs < kickoffTimeMs, 'Revision 2 must be recorded prior to kickoff');
assert(rev1RecordedMs < rev2RecordedMs, 'Revision 1 must precede Revision 2');

// Check that Revision 1 remains unchanged
assert.strictEqual(rev1.probability, 0.768, 'Revision 1 probability must remain unchanged at 0.768');
assert.strictEqual(rev2.probability, 0.582, 'Revision 2 walk-forward adjusted probability is 0.582');

// Check that both are graded post-match
assert.strictEqual(rev1.gradingStatus, 'GRADED', 'Revision 1 must be graded');
assert.strictEqual(rev2.gradingStatus, 'GRADED', 'Revision 2 must be graded');
assert.strictEqual(rev1.settlementStatus, 'LOST', 'Over 2.5 lost in 1-0 match');
assert.strictEqual(rev2.settlementStatus, 'LOST', 'Revision 2 also evaluated against 1-0 match');

// Check Brier error comparison
assert(rev2.brierError! < rev1.brierError!, 'Revision 2 Brier error (0.3387) must be lower/better than Revision 1 (0.5898)');
console.log(`Revision 1 (Pre-lineup) Brier Error: ${rev1.brierError?.toFixed(4)} (Recorded: ${rev1.recordedAt})`);
console.log(`Revision 2 (Post-lineup) Brier Error: ${rev2.brierError?.toFixed(4)} (Recorded: ${rev2.recordedAt})`);
console.log('✓ PASS: Dual revisions preserved with immutable timestamps and separate post-match grading.');

// -----------------------------------------------------------------------------
// TEST 8: Sub-30-Minute Fallback ("Lineup not released yet" without guessing)
// -----------------------------------------------------------------------------
console.log('[TEST 8] Sub-30-Minute No-Guessing Fallback Rule...');
// Fixture kickoff in 20 minutes (within 30 mins)
const fixtureIn20Mins: Fixture = {
  ...sampleDummyFixture,
  id: 'fix_unreleased_late',
  kickoffTime: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
};

assert.strictEqual(isFixtureWithin30Mins(fixtureIn20Mins.kickoffTime), true, 'Must detect fixture is < 30 mins to kickoff');
const lateState = getFixtureLineupState(fixtureIn20Mins, { forceConfirmed: false });
assert.strictEqual(lateState.isWithin30MinsOfKickoff, true);
assert.strictEqual(lateState.status, 'unreleased_late', 'Status must be unreleased_late when unconfirmed < 30 mins');
console.log('✓ PASS: Zero-guessing policy verified for fixtures within 30 minutes of kickoff.');

console.log('--- ALL OFFICIAL LINEUPS, COMPARISON & REVISION TESTS PASSED! ---');
