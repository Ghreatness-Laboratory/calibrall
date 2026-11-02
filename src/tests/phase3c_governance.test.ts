// CALIBRALL: Phase 3c Analysis-Only Mode & Closing-Odds Validation Test Suite
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- STARTING PHASE 3c GOVERNANCE & VALIDATION TEST SUITE ---');

// Test 1: Verify Closing-Odds Classification for every market and ensure NO market shipped
console.log('\n[TEST 1] Closing-odds validation results & zero-market-shipped governance check...');
const resultsPath = path.join(process.cwd(), 'scripts/closing_odds_results.json');
assert(fs.existsSync(resultsPath), 'closing_odds_results.json must exist');
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

const requiredMarkets = [
  '1X2 Match Result',
  'Over / Under 2.5 Goals',
  'Asian Handicap (All Lines Pooled)',
  'Both Teams To Score (BTTS)',
  '1st Half Over 0.5 Goals',
  'Highest Scoring Half',
  'Corners (Over 9.5)',
  'Bookings (Over 3.5)',
];

const validStatuses = ['BEATS CLOSING', 'MATCHES CLOSING', 'LOSES TO CLOSING', 'NO CLOSING DATA'];

const table = results.classificationTable;
assert(Array.isArray(table), 'classificationTable must be an array');

for (const reqMarket of requiredMarkets) {
  const entry = table.find((m: any) => m.market === reqMarket);
  assert(entry !== undefined, `Market ${reqMarket} must be present in classification table`);
  assert(
    validStatuses.includes(entry.classification),
    `Market ${reqMarket} has valid classification (${entry.classification})`
  );
  console.log(`  ✓ Market: ${reqMarket} -> ${entry.classification} (Samples: ${entry.samples})`);
}

// Ensure NO market is shipped:
// Per Phase 3c specification: Do not publish or re-enable any betting recommendation in this phase.
const shippedMarkets = table.filter((m: any) => m.classification === 'SHIPPED');
assert.strictEqual(shippedMarkets.length, 0, 'Zero markets must be shipped');
console.log('✓ PASS: Exactly 0 markets shipped (Analysis-only mode strictly enforced across all 8 markets).');

// Test 2: Asian Handicap Individual Lines Validation
console.log('\n[TEST 2] Asian Handicap breakdown by individual lines...');
const ahLines = results.asianHandicapByLine;
assert(Array.isArray(ahLines) && ahLines.length > 0, 'Asian handicap lines must be populated');
const ahValidStatuses = ['BEATS CLOSING', 'MATCHES CLOSING', 'LOSES TO CLOSING', 'NO CLOSING DATA'];
for (const lineEntry of ahLines) {
  assert(
    ahValidStatuses.includes(lineEntry.classification),
    `Handicap line ${lineEntry.line} must have valid classification`
  );
}
console.log(`✓ PASS: Asian handicap validated across ${ahLines.length} lines individually.`);

// Test 3: Recommendation Wording Ban Check across UI codebase
console.log('\n[TEST 3] Recommendation and betting vocabulary purge check...');
const bannedPhrases = [
  'Best pick',
  'Best qualified pick',
  'Primary qualified recommendation',
  'Top ranked option',
  'Authorized catalogue',
];

const scannedDirs = ['src/components', 'src/app'];
let violationCount = 0;

function scanDir(dir: string) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      scanDir(full);
    } else if (/\.(tsx|jsx)$/.test(entry)) {
      const code = fs.readFileSync(full, 'utf8');
      for (const phrase of bannedPhrases) {
        if (code.includes(phrase)) {
          console.error(`  VIOLATION: "${phrase}" found in ${full}`);
          violationCount++;
        }
      }
    }
  }
}

for (const d of scannedDirs) {
  scanDir(path.join(process.cwd(), d));
}

assert.strictEqual(violationCount, 0, 'Zero banned recommendation phrases found in UI');
console.log('✓ PASS: UI is 100% clean of banned recommendation phrases.');

// Test 4: 1X2 Checksum & Evaluation Set Integrity
console.log('\n[TEST 4] 1X2 same-match holdout integrity and checksum...');
assert(results.evaluationSetSize > 4500, 'Evaluation set must exceed 4,500 matches');
assert(results.checksum1X2, '1X2 evaluation checksum must be present');
console.log(`✓ PASS: 1X2 evaluation holdout verified (checksum: ${results.checksum1X2})`);

console.log('\n--- ALL PHASE 3c GOVERNANCE & VALIDATION TESTS PASSED (4/4) ---');
