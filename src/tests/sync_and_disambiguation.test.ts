import assert from 'node:assert/strict';
import {
  CANONICAL_COMPETITIONS,
  getCanonicalCompetition,
} from '../lib/data/canonicalCompetitions';
import { BASKETBALL_SYNC_ENABLED } from '../lib/data/providerBudget';
import { evaluateLiveMatchState } from '../lib/prediction/liveMatchState';
import { Fixture } from '@/types';

async function runTests() {
  console.log('--- RUNNING EC DISAMBIGUATION, BASKETBALL GATE & LIVE MINUTE TESTS ---');

  // 1. Disambiguation of football-data.org 'EC' vs football-data.co.uk 'EC'
  const fdOrgEuro = getCanonicalCompetition('EC', 'football-data.org');
  const fdCoUkNatLeague = getCanonicalCompetition('EC', 'football-data.co.uk');
  assert.ok(fdOrgEuro, 'football-data.org EC should resolve');
  assert.ok(fdCoUkNatLeague, 'football-data.co.uk EC should resolve');
  assert.equal(fdOrgEuro.id, 'comp_euro');
  assert.equal(fdOrgEuro.code, 'EURO');
  assert.equal(fdCoUkNatLeague.id, 'comp_eng_national_league');
  assert.equal(fdCoUkNatLeague.code, 'EC');
  assert.notEqual(
    fdOrgEuro.id,
    fdCoUkNatLeague.id,
    'European Championship and National League must have distinct internal IDs'
  );
  assert.equal(
    getCanonicalCompetition('comp_ec')?.id,
    'comp_eng_national_league',
    'Legacy comp_ec resolves cleanly to comp_eng_national_league'
  );
  console.log('✓ PASS: comp_euro (football-data.org EC) vs comp_eng_national_league (football-data.co.uk EC)');

  // 2. Basketball syncing disabled gate
  assert.equal(BASKETBALL_SYNC_ENABLED, false, 'BASKETBALL_SYNC_ENABLED must be false');
  console.log('✓ PASS: Basketball syncing disabled until basketball module is built');

  // 3. No fake live minutes after kickoff without a verified live feed
  const pastKickoffIso = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const timedPastKickoff: Fixture = {
    id: 'fix_test_timed',
    competitionId: 'comp_pl',
    competition: CANONICAL_COMPETITIONS.comp_pl,
    seasonYear: '2026/2027',
    homeTeam: { id: 'team_arsenal', name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crestUrl: '' },
    awayTeam: { id: 'team_chelsea', name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crestUrl: '' },
    kickoffTime: pastKickoffIso,
    matchday: 12,
    status: 'TIMED',
    homeScore: null,
    awayScore: null,
    dataFreshness: pastKickoffIso,
  };
  const stateTimed = evaluateLiveMatchState(timedPastKickoff);
  assert.equal(stateTimed.minute, undefined, 'Never fabricate minute when TIMED past kickoff');
  assert.ok(
    stateTimed.statusNotice.toLowerCase().includes('kicked off, awaiting result'),
    `Expected awaiting result notice, got: ${stateTimed.statusNotice}`
  );

  const inPlayNoMinute: Fixture = {
    ...timedPastKickoff,
    status: 'IN_PLAY',
  };
  const stateInPlayNoMin = evaluateLiveMatchState(inPlayNoMinute);
  assert.equal(stateInPlayNoMin.minute, undefined, 'Never return fake minute=65 when fixture.minute is absent');

  const inPlayVerifiedMinute: Fixture = {
    ...timedPastKickoff,
    status: 'IN_PLAY',
    minute: 54,
  };
  const stateInPlayVerified = evaluateLiveMatchState(inPlayVerifiedMinute);
  assert.equal(stateInPlayVerified.minute, 54, 'Preserve verified provider minute when present');
  console.log('✓ PASS: Zero fabricated live minutes; post-kickoff shows awaiting result until next sync');

  console.log('--- ALL DISAMBIGUATION & SAFETY TESTS PASSED ---');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
