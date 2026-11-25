import assert from 'node:assert/strict';
import {
  BASKETBALL_AUTHORIZED_MARKETS,
  BASKETBALL_LEAGUE_SEASONS,
  seasonLabelToEuroLeagueCode,
  seasonLabelToHoopRYear,
} from '../lib/basketball/markets';
import { resolveBasketballTeam } from '../lib/basketball/canonicalTeams';
import {
  extractHalfAndQuarterScores,
  parseHoopRLinescores,
} from '../lib/basketball/sources/hoopRSource';

function runTests() {
  // 1. Markets strictly limited to the 5 total / 1st-half total families
  const categories = new Set(BASKETBALL_AUTHORIZED_MARKETS.map((m) => m.category));
  assert.deepEqual(
    Array.from(categories).sort(),
    ['away_total', 'game_total', 'h1_game_total', 'h1_team_total', 'home_total'],
    'Only authorized total & 1st-half total market categories allowed'
  );
  assert.equal(BASKETBALL_AUTHORIZED_MARKETS.length, 12);

  // 2. Season scope & converter helpers
  assert.equal(BASKETBALL_LEAGUE_SEASONS.NBA.length, 9);
  assert.equal(BASKETBALL_LEAGUE_SEASONS.NCAAB.length, 5);
  assert.equal(BASKETBALL_LEAGUE_SEASONS.EUROLEAGUE.length, 9);
  assert.equal(seasonLabelToHoopRYear('2024-25'), 2025);
  assert.equal(seasonLabelToEuroLeagueCode('2024-25'), 'E2024');

  // 3. Canonical team resolution (never guesses unknown teams)
  const lal = resolveBasketballTeam('NBA', { provider: 'hoopr', providerId: '13', name: 'Los Angeles Lakers' });
  assert.equal(lal?.id, 'bbt_nba_lal');
  const unknownNba = resolveBasketballTeam('NBA', { provider: 'hoopr', providerId: '130579', name: 'Team Chuck' });
  assert.equal(unknownNba, null);

  const realMadrid = resolveBasketballTeam('EUROLEAGUE', { provider: 'euroleague', providerId: 'MAD', name: 'Real Madrid' });
  assert.equal(realMadrid?.id, 'bbt_euroleague_mad');

  const duke = resolveBasketballTeam('NCAAB', { provider: 'espn', providerId: '150', name: 'Duke Blue Devils' });
  assert.equal(duke?.id, 'bbt_ncaab_duke_blue_devils');
  const unknownD1 = resolveBasketballTeam('NCAAB', { provider: 'espn', providerId: '9999999', name: 'Imaginary Non-D1 College' });
  assert.equal(unknownD1, null);

  // 4. hoopR linescore parsing & half-score extraction (never estimates)
  const nbaLinesH = "[{'value': 25.0, 'displayValue': '25', 'period': 1.0}\n {'value': 22.0, 'displayValue': '22', 'period': 2.0}\n {'value': 34.0, 'displayValue': '34', 'period': 3.0}\n {'value': 22.0, 'displayValue': '22', 'period': 4.0}]";
  const nbaLinesA = "[{'value': 22.0, 'displayValue': '22', 'period': 1.0}\n {'value': 26.0, 'displayValue': '26', 'period': 2.0}\n {'value': 20.0, 'displayValue': '20', 'period': 3.0}\n {'value': 23.0, 'displayValue': '23', 'period': 4.0}]";
  assert.equal(parseHoopRLinescores(nbaLinesH).length, 4);
  const nbaExtracted = extractHalfAndQuarterScores('NBA', nbaLinesH, nbaLinesA, 4, true);
  assert.equal(nbaExtracted.h1_home, 47);
  assert.equal(nbaExtracted.h1_away, 48);
  assert.equal(nbaExtracted.ot_periods, 0);
  assert.deepEqual(nbaExtracted.q_scores, { h: [25, 22, 34, 22], a: [22, 26, 20, 23] });

  const ncaabLinesH = "[{'displayValue': '31', 'period': 1.0, 'value': 31.0}\n {'displayValue': '32', 'period': 2.0, 'value': 32.0}\n {'displayValue': '9', 'period': 3.0, 'value': 9.0}]";
  const ncaabLinesA = "[{'displayValue': '28', 'period': 1.0, 'value': 28.0}\n {'displayValue': '35', 'period': 2.0, 'value': 35.0}\n {'displayValue': '7', 'period': 3.0, 'value': 7.0}]";
  const ncaabExtracted = extractHalfAndQuarterScores('NCAAB', ncaabLinesH, ncaabLinesA, 2, true);
  assert.equal(ncaabExtracted.h1_home, 31);
  assert.equal(ncaabExtracted.h1_away, 28);
  assert.equal(ncaabExtracted.ot_periods, 1);

  const missingHalf = extractHalfAndQuarterScores('NBA', null, null, 4, true);
  assert.equal(missingHalf.h1_home, null);
  assert.equal(missingHalf.h1_away, null);
  assert.equal(missingHalf.q_scores, null);

  console.log('ALL BASKETBALL BACKFILL TESTS PASSED.');
}

runTests();
