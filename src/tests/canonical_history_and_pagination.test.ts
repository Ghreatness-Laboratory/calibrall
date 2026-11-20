import assert from 'node:assert/strict';
import {
  resolveFixtureTeamCanonical,
  lookupCanonicalTeamByProviderId,
} from '../lib/data/canonicalTeams';
import { fetchAllRows } from '../lib/supabase/pagination';
import { matchesStore } from '../lib/data/matchesStore';
import { getLocalDatabase } from '../lib/supabase/client';
import { getFixtureStatistics } from '../lib/data/seedData';
import type { Fixture } from '../types';

async function runTests() {
  console.log('--- STARTING CANONICAL MAPPING, PAGINATION & HISTORY PRELOAD TESTS ---');

  // 1. Canonical provider-ID & alias mapping for key clubs
  const checks: Array<{
    label: string;
    provider: 'footballDataOrg' | 'footballDataCoUk' | 'espn' | 'sportmonks';
    providerTeamId?: string;
    name?: string;
    competitionCode?: string;
    expectedId: string;
  }> = [
    { label: 'Man City (FD.org ID)', provider: 'footballDataOrg', providerTeamId: '65', name: 'Manchester City FC', competitionCode: 'PL', expectedId: 'team_man_city' },
    { label: 'Man City (FD.co.uk alias)', provider: 'footballDataCoUk', name: 'Man City', competitionCode: 'E0', expectedId: 'team_man_city' },
    { label: 'Fulham (FD.org ID)', provider: 'footballDataOrg', providerTeamId: '63', name: 'Fulham FC', competitionCode: 'PL', expectedId: 'team_fulham' },
    { label: 'Fulham (ESPN ID)', provider: 'espn', providerTeamId: '370', name: 'Fulham', competitionCode: 'PL', expectedId: 'team_fulham' },
    { label: 'Bayern (FD.org ID)', provider: 'footballDataOrg', providerTeamId: '5', name: 'FC Bayern München', competitionCode: 'BL1', expectedId: 'team_bayern' },
    { label: 'Bayern (FD.co.uk alias)', provider: 'footballDataCoUk', name: 'Bayern Munich', competitionCode: 'D1', expectedId: 'team_bayern' },
    { label: 'Köln (FD.org ID)', provider: 'footballDataOrg', providerTeamId: '1', name: '1. FC Köln', competitionCode: 'BL1', expectedId: 'team_koln' },
    { label: 'Köln (FD.co.uk alias)', provider: 'footballDataCoUk', name: 'FC Koln', competitionCode: 'D1', expectedId: 'team_koln' },
    { label: 'Southampton (FD.org ID)', provider: 'footballDataOrg', providerTeamId: '340', name: 'Southampton FC', competitionCode: 'ELC', expectedId: 'team_southampton' },
    { label: 'Athletic (FD.org ID)', provider: 'footballDataOrg', providerTeamId: '77', name: 'Athletic Club', competitionCode: 'PD', expectedId: 'team_athletic' },
    { label: 'Athletic (FD.co.uk alias)', provider: 'footballDataCoUk', name: 'Ath Bilbao', competitionCode: 'SP1', expectedId: 'team_athletic' },
  ];

  for (const c of checks) {
    const resolved = resolveFixtureTeamCanonical({
      provider: c.provider,
      providerTeamId: c.providerTeamId,
      name: c.name,
      competitionCode: c.competitionCode,
    });
    assert.ok(resolved, `Expected canonical resolution for ${c.label}`);
    assert.equal(resolved.canonicalId, c.expectedId, `Mismatch for ${c.label}`);
  }

  // Provider-scoped ID isolation: Sportmonks ID 85 = FC København, NOT collided with Football-Data.org
  const sm85 = lookupCanonicalTeamByProviderId('sportmonks', '85');
  assert.equal(sm85?.canonicalId, 'team_fc_copenhagen');
  const fd85 = lookupCanonicalTeamByProviderId('footballDataOrg', '85');
  assert.notEqual(fd85?.canonicalId, 'team_fc_copenhagen');
  console.log('✓ PASS: Provider-scoped ID & exact alias canonicalization verified across all 6 clubs + isolation');

  // 2. fetchAllRows pagination beyond 1,000 rows
  const totalSimulated = 2500;
  let pagesRequested = 0;
  const { data: pagedRows, error: pageErr } = await fetchAllRows<{ id: string }>(async (from, to) => {
    pagesRequested++;
    const slice: Array<{ id: string }> = [];
    for (let i = from; i <= Math.min(to, totalSimulated - 1); i++) {
      slice.push({ id: `row_${i}` });
    }
    return { data: slice, error: null };
  });
  assert.equal(pageErr, null);
  assert.equal(pagedRows.length, totalSimulated, 'fetchAllRows must fetch every page beyond 1,000 rows');
  assert.equal(pagesRequested, 3, '2,500 rows with pageSize 1,000 must request 3 pages (0..999, 1000..1999, 2000..2999)');
  console.log('✓ PASS: fetchAllRows cleanly paginates 2,500 rows across 3 pages without a 1,000-row cutoff');

  // 3. Upsert canonicalization + kickoff_date population + DataStatus SQL aggregates (cleaned up in finally)
  const testPrefix = 'test_canon_pag_';
  const db = getLocalDatabase();
  try {
    const sampleDate = '2026-10-18T14:00:00Z';
    const upsertRes = await matchesStore.upsertMatches([
      {
        id: `${testPrefix}1`,
        provider_id: `${testPrefix}1`,
        competition_code: 'E0',
        season: '2627',
        matchday: 8,
        home_team_id: 'team_mancity', // legacy alias
        away_team_id: 'Fulham',       // raw alias
        home_team_name: 'Man City',
        away_team_name: 'Fulham',
        kickoff_time: sampleDate,
        status: 'FINISHED',
        home_score: 3,
        away_score: 1,
        result: 'H',
        source: 'test-suite',
      },
    ]);
    assert.equal(upsertRes.inserted, 1);

    if (db) {
      const storedRow = db
        .prepare('SELECT home_team_id, away_team_id, kickoff_date FROM matches WHERE provider_id = ?')
        .get(`${testPrefix}1`) as { home_team_id: string; away_team_id: string; kickoff_date: string | null } | undefined;
      assert.ok(storedRow, 'Inserted test row must be persisted');
      assert.equal(storedRow.home_team_id, 'team_man_city');
      assert.equal(storedRow.away_team_id, 'team_fulham');
      assert.equal(storedRow.kickoff_date, '2026-10-18');
    }

    const status = await matchesStore.getDataStatus();
    assert.ok(status.totalMatches > 1000, `Expected > 1000 totalMatches from SQL aggregates, got ${status.totalMatches}`);
    assert.ok(Array.isArray(status.teamsWithUnder8Matches), 'getDataStatus must expose teamsWithUnder8Matches');
    assert.ok(status.latestDate && status.latestDate.length >= 10, 'getDataStatus must compute latestDate via kickoff_time/kickoff_date');
    assert.equal(status.aggregationMethod, 'sqlite_sql_aggregates');
    console.log(`✓ PASS: upsertMatches canonicalizes IDs + sets kickoff_date; getDataStatus SQL aggregates returned ${status.totalMatches} totalMatches (${status.aggregationMethod})`);

    // 4. Cold-memory preload consistency check
    const syntheticManCityVsFulham: Fixture = {
      id: 'fix_test_mc_ful',
      providerId: 'test_mc_ful',
      providerName: 'Football-Data.org',
      fetchTime: new Date().toISOString(),
      source: 'provider:football-data',
      competitionId: 'comp_pl',
      competition: {
        id: 'comp_pl',
        code: 'PL',
        name: 'Premier League',
        country: 'England',
        tier: 1,
      },
      seasonYear: '2026/2027',
      homeTeam: {
        id: 'team_man_city',
        providerTeamId: '65',
        name: 'Manchester City FC',
        shortName: 'Man City',
        tla: 'MCI',
        crestUrl: '',
      },
      awayTeam: {
        id: 'team_fulham',
        providerTeamId: '63',
        name: 'Fulham FC',
        shortName: 'Fulham',
        tla: 'FUL',
        crestUrl: '',
      },
      kickoffTime: '2026-11-28T15:00:00Z',
      matchday: 13,
      status: 'TIMED',
      homeScore: null,
      awayScore: null,
      venue: 'Etihad Stadium',
      dataFreshness: new Date().toISOString(),
    };

    await matchesStore.preloadForFixtures([syntheticManCityVsFulham]);
    const stats = getFixtureStatistics(syntheticManCityVsFulham);
    assert.ok((stats.homeSampleMatches ?? 0) > 0, `Expected Man City stored match count > 0, got ${stats.homeSampleMatches}`);
    assert.ok((stats.awaySampleMatches ?? 0) > 0, `Expected Fulham stored match count > 0, got ${stats.awaySampleMatches}`);
    console.log(`✓ PASS: Preloaded history stats resolved Man City (${stats.homeSampleMatches}) vs Fulham (${stats.awaySampleMatches})`);
  } finally {
    if (db) {
      db.prepare('DELETE FROM matches WHERE provider_id LIKE ?').run(`${testPrefix}%`);
    }
  }

  console.log('--- ALL CANONICAL MAPPING, PAGINATION & HISTORY PRELOAD TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
