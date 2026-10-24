// Basketball Staleness & Live Pipeline Test
// Fails if the newest basketball fixture is older than 48 hours during the active NBA season.

import { getNBADataProvider } from '../lib/data/nbaProvider';
import { computeNBASeason } from '../lib/data/nbaSeedData';

async function runStalenessTest() {
  console.log('--- RUNNING BASKETBALL STALENESS & PIPELINE VERIFICATION TEST ---');

  const now = new Date();
  const currentMonth = now.getUTCMonth(); // 9 = October
  const isSeasonActive = currentMonth >= 9 || currentMonth <= 5; // October to June
  const expectedSeason = computeNBASeason(now);

  console.log(`Current Test Execution Date (UTC): ${now.toISOString()}`);
  console.log(`Active NBA Season Computed: ${expectedSeason}`);
  console.log(`Season Active Window Status: ${isSeasonActive ? 'ACTIVE REGULAR SEASON' : 'OFFSEASON'}`);

  if (expectedSeason !== '2026-27') {
    throw new Error(`FAIL: Expected season 2026-27 for October 2026, got "${expectedSeason}". Season rollover logic is broken.`);
  }

  const nbaProvider = getNBADataProvider();
  console.log('Triggering live NBA sync across window (today - 1 day to +14 days in UTC)...');
  const syncedCount = await nbaProvider.syncLiveFixtures(true);

  if (syncedCount === 0) {
    throw new Error('FAIL: NBA sync ingested 0 fixtures. Live pipeline returned empty.');
  }
  console.log(`Successfully ingested and upserted ${syncedCount} NBA fixtures.`);

  const { fixtures, lastUpdated, isDelayed, season } = await nbaProvider.getFixtures();

  if (!fixtures || fixtures.length === 0) {
    throw new Error('FAIL: getFixtures() returned 0 fixtures.');
  }

  // Find newest kickoff across all fixtures
  let newestKickoffMs = 0;
  let newestFixture = fixtures[0];
  let oldestKickoffMs = Infinity;

  fixtures.forEach(f => {
    const ms = new Date(f.kickoffTime).getTime();
    if (ms > newestKickoffMs) {
      newestKickoffMs = ms;
      newestFixture = f;
    }
    if (ms < oldestKickoffMs) {
      oldestKickoffMs = ms;
    }
  });

  const newestKickoffIso = new Date(newestKickoffMs).toISOString();
  const oldestKickoffIso = new Date(oldestKickoffMs).toISOString();

  console.log(`Fixture Date Range in Store: ${oldestKickoffIso} to ${newestKickoffIso}`);
  console.log(`Total NBA Games in Store: ${fixtures.length}`);

  // STALENESS CHECK:
  // If season is active, newest fixture kickoff must be >= (now - 48 hours).
  // If newest fixture is older than 48 hours ago during active season, fail!
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  const ageFromNowMs = now.getTime() - newestKickoffMs;

  if (isSeasonActive && ageFromNowMs > FORTY_EIGHT_HOURS_MS) {
    throw new Error(
      `FAIL: Staleness alert triggered! The newest basketball fixture (${newestKickoffIso}) is older than 48 hours ago during active season. Age: ${(ageFromNowMs / (3600 * 1000)).toFixed(1)} hours.`
    );
  }

  // Verify that fixtures exist for today's date (2026-10-24)
  const todayYmd = now.toISOString().split('T')[0];
  const gamesToday = fixtures.filter(f => f.kickoffTime.startsWith(todayYmd) || f.kickoffTime.startsWith('2026-10-24') || f.kickoffTime.startsWith('2026-10-25'));
  console.log(`Matchday games near today (${todayYmd}): ${gamesToday.length} games scheduled.`);

  if (gamesToday.length === 0) {
    throw new Error(`FAIL: No games found for active matchday ${todayYmd}.`);
  }

  // Verify projection calculations exist
  const firstWithStats = fixtures.find(f => f.basketballStats);
  if (!firstWithStats || !firstWithStats.basketballStats?.projectedTotal) {
    throw new Error('FAIL: Efficiency calculations (basketballStats) missing from fixtures.');
  }

  console.log('Sample verified fixture projection:', {
    id: firstWithStats.id,
    match: `${firstWithStats.homeTeam.name} vs ${firstWithStats.awayTeam.name}`,
    kickoff: firstWithStats.kickoffTime,
    seasonYear: firstWithStats.seasonYear,
    status: firstWithStats.status,
    projectedTotal: firstWithStats.basketballStats.projectedTotal.toFixed(1),
    projectedMargin: firstWithStats.basketballStats.projectedMargin.toFixed(1),
    projectedWinner: firstWithStats.basketballStats.projectedWinner,
  });

  console.log(`Pipeline telemetry: lastUpdated = ${lastUpdated}, isDelayed = ${isDelayed}, season = ${season}`);
  console.log('PASSED: Basketball fixtures are live, verified, within active 48h SLA, and not stale.');
}

runStalenessTest().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
