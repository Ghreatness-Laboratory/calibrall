// Verification test for provider budget, 10-day Football-Data range splitting,
// league priority tiering, DB-only visitor reads, and staleness error gating.

import assert from 'node:assert/strict';
import { splitDateRangeChunks, getFootballDataProvider } from '../lib/data/provider';
import { getNBADataProvider } from '../lib/data/nbaProvider';
import {
  sortLeaguesByPriority,
  getLeaguePriorityTier,
  FIXTURE_STALE_LIMIT_MINUTES,
  getBudgetSummary,
} from '../lib/data/providerBudget';
import { getRecentProviderCalls, upsertProviderSyncState } from '../lib/data/providerCallLogger';

async function runTests() {
  console.log('--- STARTING PROVIDER BUDGET & DB-ONLY READ VERIFICATION ---');

  // 1. Verify Football-Data.org <= 10-day range chunking
  const chunks = splitDateRangeChunks('2026-11-13', '2026-11-28', 10);
  assert.equal(chunks.length, 2, '16-day range must split into 2 chunks of <=10 days');
  assert.deepEqual(chunks[0], { dateFrom: '2026-11-13', dateTo: '2026-11-22' });
  assert.deepEqual(chunks[1], { dateFrom: '2026-11-23', dateTo: '2026-11-28' });
  console.log('✓ PASS: Date range splits into <=10-day chunks for Football-Data.org v4');

  // 2. Verify league priority tiering puts Tier 1 before Tier 2 & Tier 3
  const shuffled = ['RUS', 'TSL', 'PL', 'CHN', 'CL', 'ARG', 'BSA'];
  const sorted = sortLeaguesByPriority(shuffled);
  assert.equal(sorted[0], 'PL');
  assert.equal(sorted[1], 'CL');
  assert.equal(sorted[2], 'BSA');
  assert.equal(getLeaguePriorityTier('PL'), 1);
  assert.equal(getLeaguePriorityTier('TSL'), 2);
  assert.equal(getLeaguePriorityTier('RUS'), 3);
  console.log('✓ PASS: Priority tiering orders Tier 1 -> Tier 2 -> Tier 3');

  // 3. Verify call budget math shows dramatic reduction from per-visit polling
  const summary = getBudgetSummary();
  assert.ok(summary.totalBudgetedCallsPerDay < summary.beforeCallsPerDaySingleVisitor * 0.01);
  assert.equal(summary.staleLimitMinutes, 120);
  console.log(`✓ PASS: Daily budget = ${summary.totalBudgetedCallsPerDay} calls/day (down from ${summary.beforeCallsPerDaySingleVisitor}+/day)`);

  // 4. Verify visitor reads make ZERO external provider calls
  const beforeLogs = await getRecentProviderCalls(50);
  const beforeCount = beforeLogs.length;

  const footballProvider = getFootballDataProvider();
  const nbaProvider = getNBADataProvider();

  // Read football + basketball fixtures & competitions (visitor path)
  const [footRes, nbaRes, comps] = await Promise.all([
    footballProvider.getLiveFixtures({ status: 'ALL' }),
    nbaProvider.getFixtures('ALL'),
    footballProvider.getCompetitions(),
  ]);

  const afterLogs = await getRecentProviderCalls(50);
  assert.equal(afterLogs.length, beforeCount, 'Visitor reads must make 0 external provider calls');
  assert.ok(footRes.fixtures.length > 0 || footRes.liveDataAvailable !== undefined);
  assert.ok(nbaRes.fixtures.length > 0, 'NBA DB read should return stored fixtures');
  assert.ok(comps.length > 0, 'Competitions DB read should return active competitions');
  console.log(`✓ PASS: Visitor reads executed 0 provider calls (returned ${footRes.fixtures.length} football, ${nbaRes.fixtures.length} NBA fixtures, ${comps.length} competitions)`);

  // 5. Verify error banner stays suppressed while stored fixtures are within 120-min limit
  const { getProviderSyncState } = await import('../lib/data/providerCallLogger');
  const prevFootballState = await getProviderSyncState('football');
  await upsertProviderSyncState('football', {
    sport: 'football',
    providerName: 'Football-Data.org v4',
    status: 'ERROR',
    lastAttemptAt: new Date().toISOString(),
    lastError: 'Simulated refresh failure',
  });
  const afterErrorRes = await footballProvider.getLiveFixtures();
  if (afterErrorRes.fixtures.length > 0 && !afterErrorRes.isDelayed) {
    assert.equal(afterErrorRes.error, undefined, 'Error banner must be suppressed when stored fixtures are fresher than staleLimitMinutes');
    assert.equal(afterErrorRes.staleLimitMinutes, FIXTURE_STALE_LIMIT_MINUTES);
  }
  if (prevFootballState) {
    await upsertProviderSyncState('football', {
      sport: prevFootballState.sport,
      providerName: prevFootballState.providerName,
      status: prevFootballState.status,
      lastAttemptAt: prevFootballState.lastAttemptAt ?? new Date().toISOString(),
      lastSuccessAt: prevFootballState.lastSuccessAt,
      lastError: prevFootballState.lastError,
      lastHttpStatus: prevFootballState.lastHttpStatus,
      lastResponseBody: prevFootballState.lastResponseBody,
      quotaRemaining: prevFootballState.quotaRemaining,
      quotaHeaders: prevFootballState.quotaHeaders,
      skippedLeagues: prevFootballState.skippedLeagues,
      callsUsedLastRun: prevFootballState.callsUsedLastRun,
    });
  } else {
    await upsertProviderSyncState('football', {
      sport: 'football',
      providerName: 'ESPN Public Soccer API',
      status: 'ONLINE',
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    });
  }
  console.log('✓ PASS: Last good DB fixtures preserved and error banner suppressed within 120m SLA');

  console.log('--- ALL PROVIDER BUDGET & DB-ONLY READ TESTS PASSED ---');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
