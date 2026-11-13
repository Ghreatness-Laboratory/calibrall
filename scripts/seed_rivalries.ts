import { getLocalDatabase } from '../src/lib/supabase/client';
import { seedRivalriesIntoDb } from '../src/lib/data/rivalriesSeed';

function main() {
  const db = getLocalDatabase();
  const result = seedRivalriesIntoDb(db);
  console.log('=== RIVALRIES SEED RESULT ===');
  console.log('Seeded rows:', result.seeded);
  console.log('Skipped (missing team ID):', result.skippedMissingTeam.length);
  if (result.skippedMissingTeam.length > 0) {
    console.log('Skipped details:', result.skippedMissingTeam);
  }

  const totalRow = db.prepare('SELECT COUNT(*) as c FROM rivalries').get() as { c: number };
  console.log('Total rows in SQLite rivalries table:', totalRow.c);

  const matchCov = db.prepare(`
    SELECT COUNT(*) as derby_matches
    FROM matches m
    JOIN rivalries r
      ON (
        (m.home_team_id = r.team_a_id AND m.away_team_id = r.team_b_id)
        OR (m.home_team_id = r.team_b_id AND m.away_team_id = r.team_a_id)
      )
    WHERE m.status = 'FINISHED'
  `).get() as { derby_matches: number };
  console.log('Stored historical derby matches matched via rivalries table:', matchCov.derby_matches);

  const sample = db.prepare(`
    SELECT id, team_a_id, team_b_id, competition_code, rivalry_name, intensity, source
    FROM rivalries
    ORDER BY competition_code, rivalry_name
    LIMIT 10
  `).all();
  console.log('Sample rows from rivalries table:');
  console.log(JSON.stringify(sample, null, 2));
}

main();
