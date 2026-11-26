import assert from 'node:assert/strict';
import {
  CANONICAL_COMPETITIONS_CATALOG,
  buildCompetitionGroupsFromFixtures,
  canonicalizeCompetitionId,
  competitionMatchesSearch,
  fixtureMatchesSearchQuery,
  getFixtureCanonicalCompetitionId,
  normalizeSearchText,
  normalizeSelectedCompetitionIds,
} from '../lib/data/competitionSearch';
import {
  getCanonicalCompetition,
  resolveAndVerifyFixtureCompetition,
} from '../lib/data/canonicalCompetitions';
import type { Fixture } from '@/types';

function makeFixture(
  id: string,
  compId: string,
  homeName: string,
  awayName: string,
  kickoffTime: string,
  sport: 'football' | 'basketball' = 'football'
): Fixture {
  const canon = CANONICAL_COMPETITIONS_CATALOG[canonicalizeCompetitionId(compId) || compId] || {
    id: compId,
    code: compId.replace(/^comp_/, '').toUpperCase(),
    name: compId,
    country: 'Europe',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.5,
    avgCornersPerGame: 9.5,
    avgCardsPerGame: 4.0,
    isActive: true,
    sport,
    aliases: [],
    sortOrder: 100,
  };

  return {
    id,
    providerId: id,
    providerName: 'TestProvider',
    fetchTime: new Date().toISOString(),
    source: 'test:competition_filter',
    competitionId: compId,
    competition: { ...canon, sport },
    seasonYear: '2026/2027',
    sport,
    homeTeam: {
      id: `team_home_${id}`,
      name: homeName,
      shortName: homeName.slice(0, 12),
      tla: homeName.slice(0, 3).toUpperCase(),
      crestUrl: '',
    },
    awayTeam: {
      id: `team_away_${id}`,
      name: awayName,
      shortName: awayName.slice(0, 12),
      tla: awayName.slice(0, 3).toUpperCase(),
      crestUrl: '',
    },
    kickoffTime,
    matchday: 1,
    status: 'TIMED',
    dataFreshness: new Date().toISOString(),
  };
}

export function runCompetitionFilterAndSearchTests() {
  // 1. Canonical catalog metadata completeness
  const allCatalog = Object.values(CANONICAL_COMPETITIONS_CATALOG);
  assert(allCatalog.length >= 45, 'Expected canonical catalog to contain 45+ competitions');
  for (const comp of allCatalog) {
    assert(typeof comp.id === 'string' && comp.id.startsWith('comp_'), `Missing canonical id: ${comp.id}`);
    assert(typeof comp.code === 'string' && comp.code.length > 0, `Missing code for ${comp.id}`);
    assert(typeof comp.name === 'string' && comp.name.length > 0, `Missing name for ${comp.id}`);
    assert(typeof comp.country === 'string' && comp.country.length > 0, `Missing country for ${comp.id}`);
    assert(comp.sport === 'football' || comp.sport === 'basketball', `Invalid sport for ${comp.id}`);
    assert(Array.isArray(comp.aliases), `Aliases must be an array for ${comp.id}`);
    assert(typeof comp.sortOrder === 'number', `sortOrder must be numeric for ${comp.id}`);
  }

  // 2. Case- and accent-insensitive alias search
  const bundes = CANONICAL_COMPETITIONS_CATALOG.comp_bl1;
  const pl = CANONICAL_COMPETITIONS_CATALOG.comp_pl;
  const brazil = CANONICAL_COMPETITIONS_CATALOG.comp_bsa;
  const serieA = CANONICAL_COMPETITIONS_CATALOG.comp_sa;
  const nba = CANONICAL_COMPETITIONS_CATALOG.comp_nba;

  assert.equal(normalizeSearchText('São Paulo — Série A'), 'sao paulo serie a');
  assert.equal(competitionMatchesSearch(bundes, 'bundes'), true);
  assert.equal(competitionMatchesSearch(bundes, 'BUNDESLIGA'), true);
  assert.equal(competitionMatchesSearch(pl, 'epl'), true);
  assert.equal(competitionMatchesSearch(pl, 'england'), true);
  assert.equal(competitionMatchesSearch(brazil, 'sao'), true);
  assert.equal(competitionMatchesSearch(brazil, 'Série A'), true);
  assert.equal(competitionMatchesSearch(serieA, 'série a'), true);
  assert.equal(competitionMatchesSearch(nba, 'usa basketball'), true);
  assert.equal(competitionMatchesSearch(pl, 'bundesliga'), false);

  // 3. Fixture search against team names, competition names, country, and aliases
  const now = new Date();
  const todayIso = now.toISOString();
  const tomorrowIso = new Date(now.getTime() + 86400_000).toISOString();

  const fPl = makeFixture('fix_1', 'comp_pl', 'Arsenal', 'Chelsea', todayIso, 'football');
  const fBl1 = makeFixture('fix_2', 'comp_bl1', 'Bayern München', 'Borussia Dortmund', tomorrowIso, 'football');
  const fBsa = makeFixture('fix_3', 'comp_bsa', 'São Paulo', 'Flamengo', todayIso, 'football');
  const fEcLegacy = makeFixture('fix_4', 'comp_ec', 'York City', 'Barnet', todayIso, 'football');
  const fNba = makeFixture('fix_5', 'comp_nba', 'Boston Celtics', 'New York Knicks', todayIso, 'basketball');

  assert.equal(fixtureMatchesSearchQuery(fPl, 'Arsenal'), true);
  assert.equal(fixtureMatchesSearchQuery(fPl, 'epl'), true);
  assert.equal(fixtureMatchesSearchQuery(fBl1, 'munchen'), true);
  assert.equal(fixtureMatchesSearchQuery(fBl1, 'bundes'), true);
  assert.equal(fixtureMatchesSearchQuery(fBsa, 'sao paulo'), true);
  assert.equal(fixtureMatchesSearchQuery(fBsa, 'brasileirao'), true);
  assert.equal(fixtureMatchesSearchQuery(fNba, 'Celtics'), true);
  assert.equal(fixtureMatchesSearchQuery(fNba, 'usa basketball'), true);
  assert.equal(fixtureMatchesSearchQuery(fNba, 'Arsenal'), false);

  // 4. Legacy alias canonicalization & multi-select normalization
  assert.equal(canonicalizeCompetitionId('comp_ec'), 'comp_eng_national_league');
  assert.equal(getFixtureCanonicalCompetitionId(fEcLegacy), 'comp_eng_national_league');
  assert.deepEqual(
    normalizeSelectedCompetitionIds('ALL, comp_pl, comp_ec, comp_nba, bad_id', 'football'),
    ['comp_pl', 'comp_eng_national_league']
  );
  assert.deepEqual(
    normalizeSelectedCompetitionIds('comp_pl, comp_nba', 'basketball'),
    ['comp_nba']
  );
  assert.deepEqual(
    normalizeSelectedCompetitionIds('comp_pl, comp_nba', 'all'),
    ['comp_pl', 'comp_nba']
  );

  // 5. Country grouping, day filtering, zero-fixture hiding, and multi-sport scoping
  const allFixtures = [fPl, fBl1, fBsa, fEcLegacy, fNba];

  const footballAllDays = buildCompetitionGroupsFromFixtures({
    fixtures: allFixtures,
    sport: 'football',
    day: 'ALL',
    hideZeroFixtures: true,
  });
  assert.equal(footballAllDays.totalFixtures, 4);
  assert.equal(footballAllDays.competitions.some((c) => c.id === 'comp_nba'), false);
  const englandGroup = footballAllDays.groupedByCountry.find((g) => g.country === 'England');
  assert(englandGroup, 'Expected England group');
  assert.equal(
    englandGroup.competitions.find((c) => c.id === 'comp_pl')?.fixtureCount,
    1
  );
  assert.equal(
    englandGroup.competitions.find((c) => c.id === 'comp_eng_national_league')?.fixtureCount,
    1
  );

  const footballToday = buildCompetitionGroupsFromFixtures({
    fixtures: allFixtures,
    sport: 'football',
    day: 'today',
    hideZeroFixtures: true,
  });
  assert.equal(footballToday.totalFixtures, 3);
  assert.equal(
    footballToday.competitions.some((c) => c.id === 'comp_bl1'),
    false,
    'Bundesliga fixture is tomorrow so 0-fixture comp must be hidden for today'
  );

  const footballTodayWithZero = buildCompetitionGroupsFromFixtures({
    fixtures: allFixtures,
    sport: 'football',
    day: 'today',
    hideZeroFixtures: false,
  });
  assert.equal(
    footballTodayWithZero.competitions.find((c) => c.id === 'comp_bl1')?.fixtureCount,
    0
  );

  const multiSportAllDays = buildCompetitionGroupsFromFixtures({
    fixtures: allFixtures,
    sport: 'all',
    day: 'ALL',
    hideZeroFixtures: true,
  });
  assert.equal(multiSportAllDays.totalFixtures, 5);
  assert.equal(multiSportAllDays.competitions.some((c) => c.id === 'comp_nba'), true);
  assert.equal(multiSportAllDays.competitions.some((c) => c.id === 'comp_pl'), true);

  // 6. Strict unmapped detection (never guess missing/unknown/conflicting rows)
  const missingComp = resolveAndVerifyFixtureCompetition({
    id: 'bad_missing',
    home_team_name: 'Team A',
    away_team_name: 'Team B',
    competition_id: null,
    competition_code: 'PL',
  });
  assert('unmapped' in missingComp, 'Missing competition_id must be unmapped, never guessed');

  const conflictComp = resolveAndVerifyFixtureCompetition({
    id: 'bad_conflict',
    home_team_name: 'Arsenal',
    away_team_name: 'Chelsea',
    competition_id: 'comp_pl',
    competition_code: 'BL1',
  });
  assert('unmapped' in conflictComp, 'Conflicting competition_id/code must be unmapped');

  const validLegacy = resolveAndVerifyFixtureCompetition({
    id: 'ok_ec',
    home_team_name: 'York City',
    away_team_name: 'Barnet',
    competition_id: 'comp_ec',
    competition_code: 'EC',
    source: 'provider:football-data.co.uk',
  });
  assert('competitionId' in validLegacy && validLegacy.competitionId === 'comp_eng_national_league');
  assert.equal(getCanonicalCompetition('EC', 'provider:football-data.org')?.id, 'comp_euro');
  assert.equal(getCanonicalCompetition('EC', 'provider:football-data.co.uk')?.id, 'comp_eng_national_league');
}

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('competition_filter_and_search')) {
  runCompetitionFilterAndSearchTests();
  console.log('COMPETITION FILTER & SEARCH TESTS PASSED.');
}
