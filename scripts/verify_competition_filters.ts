// CALIBRALL: Competition Integrity & Combined Filtering Verification Suite
// Tests all 5 requirements:
// 1. Every fixture has a canonical competition_id. None shown under fallback; invalid logged as error.
// 2. Build competition filter from database, not hard-coded list, grouped by country with counts.
// 3. Filter by competition_id only, combined with day filter.
// 4. Test: For each competition, filtered count equals fixtures with that competition_id.
// 5. Explain why filter failed before, and confirm Ligue 1 now appears.

import { supabase } from '../src/lib/supabase/client';
import {
  getCompetitionsFromDatabase,
  getCompetitionIntegrityErrors,
  isCanonicalCompetitionId,
} from '../src/lib/data/canonicalCompetitions';
import {
  getFixturesFromDatabase,
  mapDbRowToFixture,
  matchesDayFilter,
} from '../src/lib/data/fixturesDatabase';
import { validateFixtureIntegrity } from '../src/lib/data/fixtureIntegrity';
import { getFootballDataProvider } from '../src/lib/data/provider';

async function runVerification() {
  console.log('='.repeat(88));
  console.log('CALIBRALL: CANONICAL COMPETITION ID & COMBINED FILTERING VERIFICATION');
  console.log('='.repeat(88));

  // ---------------------------------------------------------------------------
  // STEP 0: SYNC REAL PROVIDER FIXTURES TO DATABASE (ZERO SEED DATA)
  // ---------------------------------------------------------------------------
  console.log('\n[STEP 0] SYNCING LIVE VERIFIED PROVIDER FIXTURES TO DATABASE');
  console.log('-'.repeat(88));
  const provider = getFootballDataProvider();
  const syncResult = await provider.ensureSynced(true);
  console.log(`✓ Sync completed (${syncResult.providerUsed || 'ESPN'}): ${syncResult.count} real fixtures stored in table "fixtures".`);

  // ---------------------------------------------------------------------------
  // REQUIREMENT 1: CANONICAL COMPETITION_ID ENFORCEMENT & ZERO FALLBACK
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 1] CANONICAL COMPETITION_ID ENFORCEMENT & ZERO FALLBACK');
  console.log('-'.repeat(88));

  const { data: allDbRows, error: dbErr } = await supabase.from('fixtures').select('*');
  if (dbErr) {
    throw new Error(`Failed to query database fixtures: ${dbErr.message}`);
  }

  const footballRows = (allDbRows || []).filter((r: any) => r.competition_id !== 'comp_nba');
  console.log(`Total football fixtures in database: ${footballRows.length}`);

  let validCount = 0;
  let nonCanonicalCount = 0;

  for (const row of footballRows) {
    const rawCompId = row.competition_id;
    if (isCanonicalCompetitionId(rawCompId)) {
      validCount++;
    } else {
      nonCanonicalCount++;
      console.error(`[Integrity Error] Row ${row.id || row.provider_id} lacks canonical competition_id: "${rawCompId}"`);
    }
  }

  console.log(`Fixtures with verified canonical competition_id: ${validCount}`);
  console.log(`Fixtures with non-canonical / missing competition_id: ${nonCanonicalCount}`);
  if (nonCanonicalCount > 0) {
    throw new Error('Integrity failure: database contains football fixtures without canonical competition_id!');
  }
  console.log('✓ [PASS] Every stored fixture has a verified canonical competition_id.');

  // Test deliberate rejection of missing / non-canonical competition_id
  console.log('\nTesting rejection of fixtures lacking canonical competition_id (logged as error, 0 fallback):');
  const dummyMissingComp: any = {
    id: 'fix_test_invalid_no_comp',
    providerId: 'test_inv_001',
    providerName: 'TestProvider',
    fetchTime: new Date().toISOString(),
    kickoffTime: new Date().toISOString(),
    status: 'TIMED',
    homeTeam: { id: 'team_hac', name: 'Le Havre AC', shortName: 'Le Havre', tla: 'HAC', crestUrl: '' },
    awayTeam: { id: 'team_psg', name: 'Paris Saint-Germain', shortName: 'PSG', tla: 'PSG', crestUrl: '' },
    competitionId: null,
    competition: null,
  };

  const dummyFallbackComp: any = {
    id: 'fix_test_invalid_fallback_comp',
    providerId: 'test_inv_002',
    providerName: 'TestProvider',
    fetchTime: new Date().toISOString(),
    kickoffTime: new Date().toISOString(),
    status: 'TIMED',
    homeTeam: { id: 'team_nic', name: 'Nice', shortName: 'Nice', tla: 'NIC', crestUrl: '' },
    awayTeam: { id: 'team_ren', name: 'Rennes', shortName: 'Rennes', tla: 'REN', crestUrl: '' },
    competitionId: 'comp_league',
    competition: { id: 'comp_league', code: 'SM', name: 'Football League', country: 'Europe' },
  };

  const report1 = validateFixtureIntegrity([dummyMissingComp]);
  const report2 = validateFixtureIntegrity([dummyFallbackComp]);
  const mappedNull = mapDbRowToFixture({ id: 'fix_bad', provider_id: 'bad_1', competition_id: null });
  const mappedFallback = mapDbRowToFixture({ id: 'fix_bad2', provider_id: 'bad_2', competition_id: 'comp_league' });
  const queryInvalid = await getFixturesFromDatabase({ competitionId: 'comp_league', sport: 'football' });
  const loggedErrors = getCompetitionIntegrityErrors();

  const rejectedAll =
    report1.validFixtures.length === 0 &&
    report2.validFixtures.length === 0 &&
    mappedNull === null &&
    mappedFallback === null &&
    queryInvalid.length === 0;

  console.log(`- validateFixtureIntegrity rejected null competition_id: ${report1.validFixtures.length === 0 ? 'YES' : 'NO'}`);
  console.log(`- validateFixtureIntegrity rejected "comp_league" fallback: ${report2.validFixtures.length === 0 ? 'YES' : 'NO'}`);
  console.log(`- mapDbRowToFixture rejected invalid DB rows: ${mappedNull === null && mappedFallback === null ? 'YES' : 'NO'}`);
  console.log(`- getFixturesFromDatabase rejected invalid competition_id query: ${queryInvalid.length === 0 ? 'YES' : 'NO'}`);
  console.log(`- Integrity error entries recorded: ${loggedErrors.length} (latest: "${loggedErrors[0]?.message}")`);

  if (!rejectedAll || loggedErrors.length === 0) {
    throw new Error('Integrity failure: Non-canonical competition_id was not rejected and logged!');
  }
  console.log('✓ [PASS] Rule 1 Verified: Missing/non-canonical competition_id is logged as an error and never shown.');

  // ---------------------------------------------------------------------------
  // REQUIREMENT 2: BUILD COMPETITION FILTER FROM DATABASE (GROUPED BY COUNTRY)
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 2] DYNAMIC DATABASE COMPETITION DISCOVERY & COUNTRY GROUPING');
  console.log('-'.repeat(88));

  const compResult = await getCompetitionsFromDatabase('football');
  console.log(`Total competitions discovered from database: ${compResult.total}`);
  console.log(`Total football fixtures in database: ${compResult.totalFixtures}`);
  console.log(`Distinct countries represented: ${compResult.groupedByCountry.length}\n`);

  console.log('| Country     | Competition ID | Code | Competition Name               | Active Fixtures |');
  console.log('|-------------|----------------|------|--------------------------------|-----------------|');
  for (const group of compResult.groupedByCountry) {
    for (const comp of group.competitions) {
      console.log(
        `| ${group.country.padEnd(11)} | ${comp.id.padEnd(14)} | ${comp.code.padEnd(4)} | ${comp.name.padEnd(30)} | ${String(comp.fixtureCount).padStart(15)} |`
      );
    }
  }

  const ligue1Found = compResult.competitions.find(c => c.id === 'comp_fl1');
  if (!ligue1Found) {
    throw new Error('Rule 2 failure: Ligue 1 (comp_fl1) was not discovered from the database!');
  }
  console.log(`\n✓ [PASS] Ligue 1 (comp_fl1) discovered from database under country "${ligue1Found.country}" with ${ligue1Found.fixtureCount} active fixtures.`);

  // ---------------------------------------------------------------------------
  // REQUIREMENT 3 & 4: FILTER BY competition_id ONLY & TEST FILTERED COUNTS
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 3 & 4] FILTER BY competition_id ONLY & COUNT EQUALITY TEST');
  console.log('-'.repeat(88));

  const rawDbCounts: Record<string, number> = {};
  for (const row of footballRows) {
    const cid = String(row.competition_id).toLowerCase();
    rawDbCounts[cid] = (rawDbCounts[cid] || 0) + 1;
  }

  console.log('| Competition ID | Name                           | Country     | DB Count | DB Query | Provider Query | Match? |');
  console.log('|----------------|--------------------------------|-------------|----------|----------|----------------|--------|');

  let allCountsMatched = true;

  for (const comp of compResult.competitions) {
    const cid = comp.id;
    const dbCount = rawDbCounts[cid] || 0;

    const dbFiltered = await getFixturesFromDatabase({ competitionId: cid, sport: 'football' });
    const providerFiltered = await provider.getLiveFixtures({ competitionId: cid, status: 'ALL', day: 'ALL' });

    const allMatchId =
      dbFiltered.every(f => f.competitionId === cid && f.competition.id === cid) &&
      providerFiltered.fixtures.every(f => f.competitionId === cid && f.competition.id === cid);

    const countEquals =
      dbFiltered.length === dbCount &&
      providerFiltered.fixtures.length === dbCount &&
      comp.fixtureCount === dbCount &&
      allMatchId;

    if (!countEquals) {
      allCountsMatched = false;
    }

    console.log(
      `| ${cid.padEnd(14)} | ${comp.name.padEnd(30)} | ${comp.country.padEnd(11)} | ${String(dbCount).padStart(8)} | ${String(dbFiltered.length).padStart(8)} | ${String(providerFiltered.fixtures.length).padStart(14)} | ${countEquals ? 'YES [✓]' : 'NO [X]'} |`
    );
  }

  if (!allCountsMatched) {
    throw new Error('Rule 4 failure: Filtered count did not equal database fixture count for all competitions!');
  }
  console.log('\n✓ [PASS] Rule 4 Verified: For every competition, filtered count strictly equals DB fixtures with that competition_id.');

  // ---------------------------------------------------------------------------
  // COMBINED FILTERING TEST: competition_id ONLY + DAY FILTER
  // ---------------------------------------------------------------------------
  console.log('\n[COMBINED FILTERING] COMBINING competition_id FILTER WITH DAY FILTER');
  console.log('-'.repeat(88));

  console.log('| Competition ID | ALL | Today (exp/got) | Tomorrow (exp/got) | Weekend (exp/got) | Valid? |');
  console.log('|----------------|-----|-----------------|--------------------|-------------------|--------|');

  let allCombinedValid = true;

  for (const comp of compResult.competitions) {
    const cid = comp.id;
    const allForComp = await getFixturesFromDatabase({ competitionId: cid, day: 'ALL', sport: 'football' });

    const expToday = allForComp.filter(f => matchesDayFilter(f.kickoffTime, 'today')).length;
    const expTomorrow = allForComp.filter(f => matchesDayFilter(f.kickoffTime, 'tomorrow')).length;
    const expWeekend = allForComp.filter(f => matchesDayFilter(f.kickoffTime, 'weekend')).length;

    const gotToday = (await provider.getLiveFixtures({ competitionId: cid, day: 'today', status: 'ALL' })).fixtures;
    const gotTomorrow = (await provider.getLiveFixtures({ competitionId: cid, day: 'tomorrow', status: 'ALL' })).fixtures;
    const gotWeekend = (await provider.getLiveFixtures({ competitionId: cid, day: 'weekend', status: 'ALL' })).fixtures;

    const isValid =
      gotToday.length === expToday &&
      gotTomorrow.length === expTomorrow &&
      gotWeekend.length === expWeekend &&
      gotToday.every(f => f.competitionId === cid && matchesDayFilter(f.kickoffTime, 'today')) &&
      gotTomorrow.every(f => f.competitionId === cid && matchesDayFilter(f.kickoffTime, 'tomorrow')) &&
      gotWeekend.every(f => f.competitionId === cid && matchesDayFilter(f.kickoffTime, 'weekend'));

    if (!isValid) {
      allCombinedValid = false;
    }

    console.log(
      `| ${cid.padEnd(14)} | ${String(allForComp.length).padStart(3)} | ${`${expToday}/${gotToday.length}`.padStart(15)} | ${`${expTomorrow}/${gotTomorrow.length}`.padStart(18)} | ${`${expWeekend}/${gotWeekend.length}`.padStart(17)} | ${isValid ? 'YES [✓]' : 'NO [X]'} |`
    );
  }

  if (!allCombinedValid) {
    throw new Error('Rule 3 failure: Combined competition_id + day filter produced unexpected counts!');
  }
  console.log('\n✓ [PASS] Rule 3 Verified: Combined filtering by competition_id + day filter matches exact subset for every league.');

  // ---------------------------------------------------------------------------
  // REQUIREMENT 5: LIGUE 1 CONFIRMATION & ROOT CAUSE SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 5] LIGUE 1 (comp_fl1) FIXTURES CONFIRMATION');
  console.log('-'.repeat(88));

  const fl1Fixtures = await getFixturesFromDatabase({ competitionId: 'comp_fl1', sport: 'football' });
  console.log(`Ligue 1 (comp_fl1) Fixtures Retrieved: ${fl1Fixtures.length}`);
  fl1Fixtures.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.id}] ${f.homeTeam.name} vs ${f.awayTeam.name} (${f.status}) | Kickoff: ${f.kickoffTime} | comp: ${f.competitionId}`);
  });

  console.log('\n' + '='.repeat(88));
  console.log('ALL 5 COMPETITION INTEGRITY & FILTERING REQUIREMENTS VERIFIED!');
  console.log('='.repeat(88));
}

runVerification().catch(err => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
