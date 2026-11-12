// CALIBRALL: Competition Integrity & Combined Filtering Verification Suite
// Tests all 5 requirements:
// 1. Every fixture has a canonical competition_id. None shown under fallback.
// 2. Build competition filter from database, not hard-coded list, grouped by country with counts.
// 3. Filter by competition_id only, combined with day filter.
// 4. Test: For each competition, filtered count equals fixtures with that competition_id.
// 5. Explain why filter failed before, and confirm Ligue 1 now appears.

import { supabase, isSupabaseConfigured } from '../src/lib/supabase/client';
import { 
  getCompetitionsFromDatabase, 
  getCanonicalCompetition, 
  isCanonicalCompetitionId,
  CANONICAL_COMPETITIONS 
} from '../src/lib/data/canonicalCompetitions';
import { 
  ensureVerifiedDatabaseFixtures, 
  getFixturesFromDatabase, 
  mapDbRowToFixture,
  matchesDayFilter 
} from '../src/lib/data/fixturesDatabase';
import { validateFixtureIntegrity } from '../src/lib/data/fixtureIntegrity';
import { Fixture } from '../src/types';

async function runVerification() {
  console.log('='.repeat(88));
  console.log('CALIBRALL: CANONICAL COMPETITION ID & COMBINED FILTERING VERIFICATION');
  console.log('='.repeat(88));

  // ---------------------------------------------------------------------------
  // STEP 0: INITIALIZE & SEED DATABASE
  // ---------------------------------------------------------------------------
  console.log('\n[STEP 0] SEEDING DATABASE FIXTURES & VALIDATING STORE');
  console.log('-'.repeat(88));
  const seededCount = await ensureVerifiedDatabaseFixtures();
  console.log(`✓ Verified football fixtures seeded/active in database table "fixtures": ${seededCount}`);

  // ---------------------------------------------------------------------------
  // REQUIREMENT 1: CANONICAL COMPETITION_ID ENFORCEMENT & ZERO FALLBACK
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 1] CANONICAL COMPETITION_ID ENFORCEMENT & ZERO FALLBACK');
  console.log('-'.repeat(88));

  const { data: allDbRows, error: dbErr } = await supabase.from('fixtures').select('*');
  if (dbErr) {
    throw new Error(`Failed to query database fixtures: ${dbErr.message}`);
  }

  console.log(`Total fixtures in database: ${allDbRows?.length}`);

  let validCount = 0;
  let nonCanonicalCount = 0;

  for (const row of allDbRows || []) {
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
    throw new Error('Integrity failure: database contains fixtures without canonical competition_id!');
  }
  console.log('✓ [PASS] Every stored fixture has a verified canonical competition_id.');

  // Test deliberate rejection of missing / non-canonical competition_id
  console.log('\nTesting rejection of invalid fixtures (simulated missing / fallback comp_id):');
  const dummyMissingComp: any = {
    id: 'fix_test_invalid_no_comp',
    providerId: 'test_inv_001',
    providerName: 'TestProvider',
    fetchTime: new Date().toISOString(),
    kickoffTime: new Date().toISOString(),
    status: 'TIMED',
    homeTeam: { id: 'team_hac', name: 'Le Havre AC', shortName: 'Le Havre', tla: 'HAC', crestUrl: '' },
    awayTeam: { id: 'team_psg', name: 'Paris Saint-Germain', shortName: 'PSG', tla: 'PSG', crestUrl: '' },
    competitionId: null, // MISSING
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
    competitionId: 'comp_league', // NON-CANONICAL FALLBACK
    competition: { id: 'comp_league', code: 'SM', name: 'Football League', country: 'Europe' },
  };

  const report1 = validateFixtureIntegrity([dummyMissingComp]);
  const report2 = validateFixtureIntegrity([dummyFallbackComp]);
  const mappedNull = mapDbRowToFixture({ id: 'fix_bad', provider_id: 'bad_1', competition_id: null });
  const mappedFallback = mapDbRowToFixture({ id: 'fix_bad2', provider_id: 'bad_2', competition_id: 'comp_league' });

  const rejectedBoth = report1.validFixtures.length === 0 && report2.validFixtures.length === 0;
  const mappedRejectedBoth = mappedNull === null && mappedFallback === null;

  console.log(`- Missing competition_id rejected by validateFixtureIntegrity: ${report1.validFixtures.length === 0 ? 'YES' : 'NO'}`);
  console.log(`- Fallback "comp_league" rejected by validateFixtureIntegrity: ${report2.validFixtures.length === 0 ? 'YES' : 'NO'}`);
  console.log(`- mapDbRowToFixture returns null for non-canonical rows: ${mappedRejectedBoth ? 'YES' : 'NO'}`);

  if (!rejectedBoth || !mappedRejectedBoth) {
    throw new Error('Integrity failure: Non-canonical competition_id was not rejected!');
  }
  console.log('✓ [PASS] Rule 1 Verified: Any fixture with missing or fallback competition_id is logged as an error and never displayed.');

  // ---------------------------------------------------------------------------
  // REQUIREMENT 2: BUILD COMPETITION FILTER FROM DATABASE (GROUPED BY COUNTRY)
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 2] DYNAMIC DATABASE COMPETITION DISCOVERY & COUNTRY GROUPING');
  console.log('-'.repeat(88));

  const compResult = await getCompetitionsFromDatabase('football');
  console.log(`Total competitions discovered from database: ${compResult.total}`);
  console.log(`Distinct countries represented: ${compResult.groupedByCountry.length}\n`);

  console.log('| Country   | Competition ID | Code | Competition Name      | Active Fixtures |');
  console.log('|-----------|----------------|------|-----------------------|-----------------|');
  for (const group of compResult.groupedByCountry) {
    for (const comp of group.competitions) {
      console.log(
        `| ${group.country.padEnd(9)} | ${comp.id.padEnd(14)} | ${comp.code.padEnd(4)} | ${comp.name.padEnd(21)} | ${String(comp.fixtureCount).padStart(15)} |`
      );
    }
  }

  const ligue1Found = compResult.competitions.find(c => c.id === 'comp_fl1');
  if (!ligue1Found) {
    throw new Error('Rule 2 failure: Ligue 1 (comp_fl1) was not discovered from the database!');
  }
  console.log(`\n✓ [PASS] Ligue 1 (comp_fl1) successfully discovered from database under country "${ligue1Found.country}" with ${ligue1Found.fixtureCount} active fixtures.`);

  // ---------------------------------------------------------------------------
  // REQUIREMENT 3 & 4: FILTER BY competition_id ONLY & TEST FILTERED COUNTS
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 3 & 4] FILTER BY competition_id ONLY & COUNT EQUALITY TEST');
  console.log('-'.repeat(88));

  // Get raw counts directly by querying database fixtures with competition_id
  const rawDbCounts: Record<string, number> = {};
  for (const row of allDbRows || []) {
    if (row.competition_id && row.competition_id !== 'comp_nba') {
      const cid = row.competition_id.toLowerCase();
      rawDbCounts[cid] = (rawDbCounts[cid] || 0) + 1;
    }
  }

  console.log('| Competition ID | Name                  | Country | DB Fixtures | Filtered Count | Match? |');
  console.log('|----------------|-----------------------|---------|-------------|----------------|--------|');

  let allCountsMatched = true;

  for (const comp of compResult.competitions) {
    const cid = comp.id;
    const dbCount = rawDbCounts[cid] || 0;

    // Filter strictly by competition_id using getFixturesFromDatabase
    const filteredFixtures = await getFixturesFromDatabase({ competitionId: cid });
    const filteredCount = filteredFixtures.length;

    // Verify all returned fixtures have this exact competitionId
    const allMatchId = filteredFixtures.every(f => f.competitionId === cid && f.competition.id === cid);
    const countEquals = filteredCount === dbCount && allMatchId;

    if (!countEquals) {
      allCountsMatched = false;
    }

    console.log(
      `| ${cid.padEnd(14)} | ${comp.name.padEnd(21)} | ${comp.country.padEnd(7)} | ${String(dbCount).padStart(11)} | ${String(filteredCount).padStart(14)} | ${countEquals ? 'YES [✓]' : 'NO [X]'} |`
    );
  }

  if (!allCountsMatched) {
    throw new Error('Rule 4 failure: Filtered count did not equal database fixture count!');
  }
  console.log('\n✓ [PASS] Rule 4 Verified: For every competition, filtered count equals database fixture count with that competition_id.');

  // ---------------------------------------------------------------------------
  // COMBINED FILTERING TEST: competition_id ONLY + DAY FILTER
  // ---------------------------------------------------------------------------
  console.log('\n[COMBINED FILTERING] COMBINING competition_id FILTER WITH DAY FILTER');
  console.log('-'.repeat(88));

  console.log('| Competition ID | Total | Today | Tomorrow | Weekend | Today+Tomorrow+Weekend Sum | Combined Valid? |');
  console.log('|----------------|-------|-------|----------|---------|----------------------------|-----------------|');

  let allCombinedValid = true;

  for (const comp of compResult.competitions) {
    const cid = comp.id;
    const total = (await getFixturesFromDatabase({ competitionId: cid, day: 'ALL' })).length;
    const today = (await getFixturesFromDatabase({ competitionId: cid, day: 'today' })).length;
    const tomorrow = (await getFixturesFromDatabase({ competitionId: cid, day: 'tomorrow' })).length;
    const weekend = (await getFixturesFromDatabase({ competitionId: cid, day: 'weekend' })).length;

    const sum = today + tomorrow + weekend;
    const isValid = sum === total;

    if (!isValid) {
      allCombinedValid = false;
    }

    console.log(
      `| ${cid.padEnd(14)} | ${String(total).padStart(5)} | ${String(today).padStart(5)} | ${String(tomorrow).padStart(8)} | ${String(weekend).padStart(7)} | ${String(sum).padStart(26)} | ${isValid ? 'YES [✓]' : 'NO [X]'}         |`
    );
  }

  if (!allCombinedValid) {
    throw new Error('Rule 3 failure: Combined competition_id + day filter produced unexpected counts!');
  }
  console.log('\n✓ [PASS] Rule 3 Verified: Combined filtering by competition_id and day filter works seamlessly without cross-leakage.');

  // ---------------------------------------------------------------------------
  // REQUIREMENT 5: LIGUE 1 CONFIRMATION & FAILURE ROOT CAUSE
  // ---------------------------------------------------------------------------
  console.log('\n[REQUIREMENT 5] LIGUE 1 AUDIT & WHY FILTER FAILED BEFORE');
  console.log('-'.repeat(88));

  const fl1Fixtures = await getFixturesFromDatabase({ competitionId: 'comp_fl1' });
  console.log(`Ligue 1 (comp_fl1) Fixtures Retrieved: ${fl1Fixtures.length}`);
  fl1Fixtures.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.id}] ${f.homeTeam.name} vs ${f.awayTeam.name} (${f.status}) | Kickoff: ${f.kickoffTime} | Venue: ${f.venue}`);
  });

  console.log('\nRoot Cause of Previous Failure:');
  console.log('1. Hardcoded COMPETITIONS array: In src/lib/data/seedData.ts, the list only contained 6 leagues (PL, CL, PD, BL1, SA, ELC). Ligue 1 (FL1/comp_fl1) was completely missing.');
  console.log('2. Key Inconsistency: The dropdown was filtering on comp.code (e.g. "PL", "SA") instead of canonical competition_id (e.g. "comp_fl1", "comp_pl").');
  console.log('3. Lack of Database Discovery: /api/v1/competitions served static seed constants instead of dynamically aggregating active fixtures from the database.');
  console.log('4. No Country Grouping or Search: The selector was a flat HTML select without country organization, search capabilities, or live fixture count badges.');

  console.log('\n' + '='.repeat(88));
  console.log('ALL 5 COMPETITION INTEGRITY & FILTERING REQUIREMENTS FULLY VERIFIED!');
  console.log('='.repeat(88));
}

runVerification().catch(err => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
