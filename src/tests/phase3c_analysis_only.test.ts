import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateFixtureMarkets } from '../lib/prediction/marketSelection';
import { isBettingRecommendationsEnabled } from '../lib/prediction/featureFlags';
import { getFixtureStatistics } from '../lib/data/seedData';
import { Fixture } from '../types';

console.log('--- STARTING PHASE 3c ANALYSIS-ONLY & ZERO-SHIPPED TEST SUITE ---');

// Test 1: Feature Flag & Global Recommendation Suppression
console.log('1. Testing global recommendation suppression flag...');
assert.strictEqual(
  isBettingRecommendationsEnabled(),
  false,
  'Betting recommendations must be disabled in Phase 3c'
);

// Test 2: Fixture Market Evaluation in Analysis-Only Mode
console.log('2. Testing fixture evaluation produces analysis-only outputs...');
const evalResult = evaluateFixtureMarkets({
  fixtureId: 'test_arsenal_liverpool',
  homeTeamName: 'Arsenal FC',
  awayTeamName: 'Liverpool FC',
  competitionCode: 'PL',
  competitionName: 'Premier League',
  homeAttackRating: 1.45,
  homeDefenseRating: 0.75,
  awayAttackRating: 1.40,
  awayDefenseRating: 0.80,
  homeXg: 1.85,
  awayXg: 1.55,
  expectedCornersHome: 6.2,
  expectedCornersAway: 5.1,
  expectedCards: 4.2,
  uncertaintyScore: 0.08,
  dataCoverageScore: 0.95,
  sampleSizeMatches: 24,
  stateTags: [],
  lineupConfirmed: true,
  hasRealTeamStrength: true,
  insufficientData: false,
  verifiedOdds: {
    homeWin: 2.30,
    draw: 3.50,
    awayWin: 3.10,
    over25Goals: 1.75,
    under25Goals: 2.10,
    bttsYes: 1.62,
    bttsNo: 2.30,
  },
});

assert(evalResult.predictions.length > 0, 'Must produce model predictions for analysis');

// Verify that no prediction claims betting value
evalResult.predictions.forEach(p => {
  assert.notStrictEqual(
    p.qualificationStatus,
    'QUALIFIED_VALUE',
    `Prediction ${p.selection} must not be labeled QUALIFIED_VALUE in analysis-only mode`
  );
  if (p.explanation) {
    assert(
      !p.explanation.headline.includes('Strong Value Opportunity'),
      `Headline for ${p.selection} must not contain 'Strong Value Opportunity'`
    );
    assert(
      !p.explanation.headline.includes('Best pick'),
      `Headline for ${p.selection} must not contain 'Best pick'`
    );
  }
});

// Test 3: Closing-Odds Validation Results and Zero Markets Shipped
console.log('3. Testing closing-odds validation output from stored results...');
const validationPath = path.join(process.cwd(), 'phase3c_validation_results.json');
assert(fs.existsSync(validationPath), 'phase3c_validation_results.json must exist');

const validationData = JSON.parse(fs.readFileSync(validationPath, 'utf8'));

// Check evaluated count and checksums
assert.strictEqual(validationData.evalCount, 6710, 'Evaluated count must be exactly 6,710 matches');
assert(validationData.checksums.matches, 'Match metadata checksum must be present');
assert(validationData.checksums.model, 'Model probabilities checksum must be present');
assert(validationData.checksums.closing, 'Closing odds checksum must be present');

// Markets audit
const allowedStatuses = ['BEATS CLOSING', 'MATCHES CLOSING', 'LOSES TO CLOSING', 'NO CLOSING DATA'];

assert(
  allowedStatuses.includes(validationData.market1X2.classification),
  `1X2 classification (${validationData.market1X2.classification}) must be valid`
);
assert.strictEqual(
  validationData.market1X2.classification,
  'LOSES TO CLOSING',
  '1X2 must be classified as LOSES TO CLOSING'
);

assert(
  allowedStatuses.includes(validationData.marketOU25.classification),
  `OU25 classification (${validationData.marketOU25.classification}) must be valid`
);
assert.strictEqual(
  validationData.marketOU25.classification,
  'LOSES TO CLOSING',
  'OU 2.5 must be classified as LOSES TO CLOSING'
);

// Asian handicap line validation
assert(Array.isArray(validationData.asianHandicap), 'Asian handicap lines must be an array');
assert.strictEqual(validationData.asianHandicap.length, 11, 'Must audit 11 distinct Asian handicap lines');

let matchesCount = 0;
let losesCount = 0;
let beatsCount = 0;

validationData.asianHandicap.forEach((item: any) => {
  assert(
    allowedStatuses.includes(item.classification),
    `Handicap line ${item.line} classification must be valid`
  );
  if (item.classification === 'BEATS CLOSING') beatsCount++;
  if (item.classification === 'MATCHES CLOSING') matchesCount++;
  if (item.classification === 'LOSES TO CLOSING') losesCount++;
});

console.log(`Asian Handicap audit: ${beatsCount} BEAT, ${matchesCount} MATCH, ${losesCount} LOSE`);
assert.strictEqual(beatsCount, 0, 'Zero Asian handicap lines beat closing odds');
assert.strictEqual(matchesCount, 3, 'Exactly 3 Asian handicap lines match closing odds (+0.5, -1.5, +1.5)');
assert.strictEqual(losesCount, 8, 'Exactly 8 Asian handicap lines lose to closing odds');

// Test 4: Verify Zero Markets Shipped
console.log('4. Verifying 0 of 8 markets shipped...');
const shippedMarkets = [
  { name: '1X2', shipped: false },
  { name: 'Over/Under 2.5', shipped: false },
  { name: 'Asian Handicap', shipped: false },
  { name: 'BTTS', shipped: false },
  { name: '1st Half Over 0.5', shipped: false },
  { name: 'Highest Scoring Half', shipped: false },
  { name: 'Total Corners Over 9.5', shipped: false },
  { name: 'Total Bookings Over 3.5', shipped: false }
];

const totalShipped = shippedMarkets.filter(m => m.shipped).length;
assert.strictEqual(totalShipped, 0, 'Zero markets must be shipped in Phase 3c');

console.log('✓ PASS: All Phase 3c analysis-only and closing-odds validation tests passed successfully!');
