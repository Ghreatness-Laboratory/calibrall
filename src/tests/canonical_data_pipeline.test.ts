import assert from 'assert';
import { lookupCanonicalTeam } from '../lib/data/canonicalTeams';
import { canonicalMatchStore, CanonicalMatchStore } from '../lib/data/canonicalMatches';
import { isTeamNewsEnabled } from '../lib/prediction/featureFlags';
import { calculateConfidenceTier, calculateRiskTier } from '../lib/prediction/math';
import { ConfidenceEngine } from '../lib/prediction/v25/confidenceEngine';
import { getRiskTierBadge, SUPPORTED_OPTIONS_CATALOGUE } from '../lib/prediction/marketCatalog';
import { matchesStore } from '../lib/data/matchesStore';

console.log('--- RUNNING CANONICAL DATA PIPELINE & FREE MODEL TESTS ---');

// 1. Team Name Mapper & Alias Resolution
console.log('1. Testing canonical team alias mapping...');
const manUtdResolved = lookupCanonicalTeam('Man United')?.canonicalId;
assert.strictEqual(manUtdResolved, 'team_man_united', 'Man United maps to team_man_united');

const manchesterUtdResolved = lookupCanonicalTeam('Manchester Utd')?.canonicalId;
assert.strictEqual(manchesterUtdResolved, 'team_man_united', 'Manchester Utd maps to team_man_united');

const spursResolved = lookupCanonicalTeam('Spurs')?.canonicalId;
assert.strictEqual(spursResolved, 'team_tottenham', 'Spurs maps to team_tottenham');

const wolvesResolved = lookupCanonicalTeam('Wolves')?.canonicalId;
assert.strictEqual(wolvesResolved, 'team_wolves', 'Wolves maps to team_wolves');

const norwichResolved = lookupCanonicalTeam('Norwich')?.canonicalId;
assert.strictEqual(norwichResolved, 'team_norwich', 'Norwich maps to team_norwich');

const watfordResolved = lookupCanonicalTeam('Watford')?.canonicalId;
assert.strictEqual(watfordResolved, 'team_watford', 'Watford maps to team_watford');

const chelseaObj = lookupCanonicalTeam('team_chelsea');
assert(chelseaObj !== null && chelseaObj.canonicalName === 'Chelsea FC', 'Canonical Chelsea object exists');

console.log('✓ Canonical team mapping passed.');

// 2. Composite Key & Deduplication Logic
console.log('2. Testing canonical match deduplication & validation...');
const testStore = new CanonicalMatchStore();
const key1 = testStore.generateKey('2026-10-24', 'team_watford', 'team_norwich');
assert.strictEqual(key1, '2026-10-24_team_watford_team_norwich', 'Composite key format is (date_home_away)');

// Negative score test
const invalidResult = testStore.upsertMatch({
  date: '2026-10-24',
  homeTeamId: 'team_watford',
  awayTeamId: 'team_norwich',
  homeScore: -1,
  awayScore: 0,
}, 'football-data.co.uk');
assert.strictEqual(invalidResult.success, false, 'Negative score rejected');

// Deduplication preference test (stats source vs status source)
const res1 = testStore.upsertMatch({
  date: '2026-10-24',
  homeTeamId: 'team_watford',
  awayTeamId: 'team_norwich',
  homeScore: 1,
  awayScore: 1,
  homeCorners: 6,
  awayCorners: 4,
}, 'football-data.co.uk');
assert.strictEqual(res1.success, true, 'Insert from football-data.co.uk succeeded');

const res2 = testStore.upsertMatch({
  date: '2026-10-24',
  homeTeamId: 'team_watford',
  awayTeamId: 'team_norwich',
  status: 'FINISHED',
}, 'football-data.org');
assert.strictEqual(res2.success, true, 'Merge from football-data.org succeeded');

const storedMatches = testStore.getMatches({ teamId: 'team_watford' });
assert.strictEqual(storedMatches.length, 1, 'Two duplicate records deduplicated into 1');
assert.strictEqual(storedMatches[0].homeCorners, 6, 'Merged record retains stats from football-data.co.uk');
assert.strictEqual(storedMatches[0].status, 'FINISHED', 'Merged record retains status');

console.log('✓ Match deduplication & validation passed.');

// 3. Dual Staleness Gate (days > 21 OR matchesInLast120Days < 5)
console.log('3. Testing staleness evaluation gates...');
const staleStatus = testStore.getStalenessStatus('team_non_existent', '2026-10-31');
assert.strictEqual(staleStatus.isStale, true, 'Unknown team with 0 matches triggers staleness gate');

// Active club check (Watford or Norwich in 26/27 dataset)
const watfordStaleness = matchesStore.getTeamDaysSinceLastMatch('team_watford', '2026-10-31');
assert(watfordStaleness.days !== null && watfordStaleness.days <= 21, `Watford last match was ${watfordStaleness.days} days ago (<= 21d)`);
assert(watfordStaleness.matchesInLast120Days >= 5, `Watford matches in last 120d: ${watfordStaleness.matchesInLast120Days} (>= 5)`);

console.log('✓ Staleness evaluation passed.');

// 4. Feature Flag & Confidence Tier Capping
console.log('4. Testing team_news_enabled feature flag and confidence capping...');
assert.strictEqual(isTeamNewsEnabled(), false, 'team_news_enabled defaults to false for free sources');

// High probability (0.85) without team news must cap to MEDIUM
const highProbTier = calculateConfidenceTier(0.85, 0.90, 0.08);
assert.strictEqual(highProbTier, 'MEDIUM', 'Confidence tier capped to MEDIUM when team news is disabled');

// v25 Confidence Engine check
const v25Eval = ConfidenceEngine.evaluateConfidence(
  0.88,
  0.03,
  0.95,
  0.09,
  {
    flags: [],
    downgradesCount: 0,
    hasVenueH2HContradiction: false,
    hasAdverseFormGap: false,
    hasKeyAbsences: false,
    hasScheduleCongestion: false,
    hasDerbyRivalry: false,
    hasNewManager: false,
    hasMissingLineup: false,
  },
  'win'
);
assert.notStrictEqual(v25Eval.confidenceTier, 'HIGH', 'v25 Engine caps HIGH tier when team news is absent');
assert.strictEqual(v25Eval.confidenceTier, 'MEDIUM', 'v25 Engine assigns MEDIUM');

// Ensure "SAFE" is never returned
const riskTier = calculateRiskTier(0.88, 0.90, 0.08);
assert.notStrictEqual(riskTier, 'SAFE', 'Word SAFE is strictly eliminated from risk tier');
const badge = getRiskTierBadge('SAFE');
assert.strictEqual(badge.label, 'HIGH', 'Legacy SAFE maps to HIGH badge label, not SAFE');

console.log('✓ Feature flag & confidence tier capping passed.');

// 5. Handicap Hurdle Rate Requirement (>= 60% probability and +4.5% edge)
console.log('5. Testing handicap hurdle rate criteria...');
const ahMeta = SUPPORTED_OPTIONS_CATALOGUE.asian_handicap;
assert(ahMeta.qualificationCriteria.minProbability >= 0.60, 'Asian Handicap minProbability >= 60%');
assert(ahMeta.qualificationCriteria.minEdge !== undefined && ahMeta.qualificationCriteria.minEdge >= 0.045, 'Asian Handicap minEdge >= +4.5%');

const ehMeta = SUPPORTED_OPTIONS_CATALOGUE.european_handicap;
assert(ehMeta.qualificationCriteria.minProbability >= 0.60, 'European Handicap minProbability >= 60%');
assert(ehMeta.qualificationCriteria.minEdge !== undefined && ehMeta.qualificationCriteria.minEdge >= 0.045, 'European Handicap minEdge >= +4.5%');

console.log('✓ Handicap hurdle criteria passed.');

console.log('\nALL CANONICAL DATA PIPELINE TESTS PASSED SUCCESSFULLY (6/6).');
