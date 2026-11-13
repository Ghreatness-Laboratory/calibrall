// CALIBRALL: Cross-Competition Integrity Verification Test
// Directly tests the 5 fixtures that failed in the user report:
// 1. Villarreal vs Espanyol in PD (La Liga)
// 2. SV Elversberg vs Mainz in BL1 (Bundesliga)
// 3. Le Havre AC vs Paris Saint-Germain in FL1 (Ligue 1)
// 4. Nice vs Stade Rennais in FL1 (Ligue 1)
// 5. Lille vs Lens in FL1 (Ligue 1)

import { validateFixtureIntegrity } from '../lib/data/fixtureIntegrity';
import { lookupTeamStrength } from '../lib/data/teamDatabase';
import { Fixture, Competition } from '@/types';

function createDummyFixture(
  id: string,
  compCode: string,
  compName: string,
  homeName: string,
  awayName: string,
  kickoffTime: string = '2026-10-31T15:00:00Z'
): Fixture {
  const comp: Competition = {
    id: `comp_${compCode.toLowerCase()}`,
    code: compCode,
    name: compName,
    country: 'Europe',
    emblemUrl: `https://crests.football-data.org/${compCode}.png`,
    tier: 1,
    avgGoalsPerGame: 2.8,
    avgCornersPerGame: 10.0,
    avgCardsPerGame: 4.1,
    isActive: true,
  };

  const homeLookup = lookupTeamStrength(homeName);
  const awayLookup = lookupTeamStrength(awayName);

  return {
    id,
    providerId: `provider_${id}`,
    providerName: 'TestProvider',
    fetchTime: '2026-10-30T12:00:00Z',
    source: 'test:integrity',
    competitionId: comp.id,
    competition: comp,
    seasonYear: '2026/2027',
    homeTeam: {
      id: homeLookup.data?.id || `team_${homeName.toLowerCase().replace(/\s+/g, '_')}`,
      name: homeName,
      shortName: homeLookup.data?.shortName || homeName,
      tla: homeLookup.data?.tla || homeName.slice(0, 3).toUpperCase(),
      crestUrl: homeLookup.data?.crestUrl || 'https://crests.football-data.org/65.png',
      hasRealTeamStrength: homeLookup.found,
    },
    awayTeam: {
      id: awayLookup.data?.id || `team_${awayName.toLowerCase().replace(/\s+/g, '_')}`,
      name: awayName,
      shortName: awayLookup.data?.shortName || awayName,
      tla: awayLookup.data?.tla || awayName.slice(0, 3).toUpperCase(),
      crestUrl: awayLookup.data?.crestUrl || 'https://crests.football-data.org/57.png',
      hasRealTeamStrength: awayLookup.found,
    },
    kickoffTime,
    matchday: 10,
    status: 'TIMED',
    dataFreshness: '2026-10-30T12:00:00Z',
  };
}

export function runCrossCompetitionIntegrityTests(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  console.log('========================================================');
  console.log('CALIBRALL: CROSS-COMPETITION LEAGUE INTEGRITY TEST SUITE');
  console.log('========================================================\n');

  const testFixtures: Fixture[] = [
    // 1. Villarreal vs Espanyol in PD (La Liga)
    createDummyFixture('fix_pd_vil_esp', 'PD', 'La Liga', 'Villarreal', 'Espanyol'),
    // 2. SV Elversberg vs Mainz in BL1 (Bundesliga)
    createDummyFixture('fix_bl1_elv_m05', 'BL1', 'Bundesliga', 'SV Elversberg', 'Mainz'),
    // 3. Le Havre AC vs Paris Saint-Germain in FL1 (Ligue 1)
    createDummyFixture('fix_fl1_hac_psg', 'FL1', 'Ligue 1', 'Le Havre AC', 'Paris Saint-Germain'),
    // 4. Nice vs Stade Rennais in FL1 (Ligue 1)
    createDummyFixture('fix_fl1_nic_ren', 'FL1', 'Ligue 1', 'Nice', 'Stade Rennais'),
    // 5. Lille vs Lens in FL1 (Ligue 1)
    createDummyFixture('fix_fl1_lil_len', 'FL1', 'Ligue 1', 'Lille', 'Lens'),
    // 6. AFC Bournemouth vs Leeds United in PL (English pyramid promotion/relegation)
    createDummyFixture('fix_pl_bou_lee', 'PL', 'Premier League', 'AFC Bournemouth', 'Leeds United'),
    // 7. Coventry City vs Sunderland in PL
    createDummyFixture('fix_pl_cov_sun', 'PL', 'Premier League', 'Coventry City', 'Sunderland'),
    // 8. Hull City vs Ipswich Town in PL
    createDummyFixture('fix_pl_hul_ips', 'PL', 'Premier League', 'Hull City', 'Ipswich Town'),
    // 9. Southampton vs Queens Park Rangers in ELC
    createDummyFixture('fix_elc_sou_qpr', 'ELC', 'Championship', 'Southampton', 'Queens Park Rangers'),
    // 10. West Ham United vs West Bromwich Albion in ELC
    createDummyFixture('fix_elc_whu_wba', 'ELC', 'Championship', 'West Ham United', 'West Bromwich Albion'),
    // 11. Wolverhampton Wanderers vs Cardiff City in ELC
    createDummyFixture('fix_elc_wol_car', 'ELC', 'Championship', 'Wolverhampton Wanderers', 'Cardiff City'),
    // 12. Levante vs Atlético Madrid in PD
    createDummyFixture('fix_pd_lev_atm', 'PD', 'La Liga', 'Levante', 'Atlético Madrid'),
    // 13. Real Betis vs Málaga in PD
    createDummyFixture('fix_pd_bet_mal', 'PD', 'La Liga', 'Real Betis', 'Málaga'),
    // 14. Schalke 04 vs RB Leipzig in BL1
    createDummyFixture('fix_bl1_s04_rbl', 'BL1', 'Bundesliga', 'Schalke 04', 'RB Leipzig'),
    // 15. Troyes vs Le Mans in FL1
    createDummyFixture('fix_fl1_tro_lem', 'FL1', 'Ligue 1', 'Troyes', 'Le Mans'),
  ];

  for (const f of testFixtures) {
    const report = validateFixtureIntegrity([f]);
    if (!report.isValid || report.validFixtures.length !== 1) {
      const reason = report.rejectedFixtures[0]?.reason || report.violations.join('; ');
      failures.push(`Fixture "${f.homeTeam.name} vs ${f.awayTeam.name}" in ${f.competition.code} failed integrity check: ${reason}`);
    } else {
      console.log(`✓ [Integrity PASS] ${f.homeTeam.name} (${f.homeTeam.id}) vs ${f.awayTeam.name} (${f.awayTeam.id}) in ${f.competition.code} accepted!`);
    }
  }

  // Also verify that a GENUINE cross-competition mismatch is still correctly rejected:
  // e.g. Arsenal (PL) vs Bayern Munich (BL1) in a domestic PL match
  console.log('\n--- Verifying Genuine Cross-Competition Rejection ---');
  const invalidFixture = createDummyFixture('fix_invalid_mix', 'PL', 'Premier League', 'Arsenal', 'FC Bayern München');
  const invalidReport = validateFixtureIntegrity([invalidFixture]);
  if (invalidReport.validFixtures.length > 0) {
    failures.push('Expected Arsenal vs Bayern Munich in PL to be rejected, but it was accepted!');
  } else {
    console.log('✓ [Integrity PASS] Genuine mismatch Arsenal (PL) vs Bayern Munich (BL1) in domestic PL correctly rejected.');
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('cross_competition_integrity')) {
  const result = runCrossCompetitionIntegrityTests();
  if (!result.passed) {
    console.error('\nINTEGRITY TEST FAILURES:');
    result.failures.forEach(f => console.error('  - ' + f));
    process.exit(1);
  } else {
    console.log('\n========================================================');
    console.log('ALL CROSS-COMPETITION LEAGUE INTEGRITY TESTS PASSED!');
    console.log('========================================================\n');
  }
}
