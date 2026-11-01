import fs from 'fs';
import path from 'path';

const matchesPath = path.join(process.cwd(), 'src/lib/data/free_sources_matches.json');
const matches = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

// Let's inspect a few matches with asianHandicapLine
const sample = matches.slice(0, 5).map((m: any) => ({
  fixture: `${m.home_team_name} vs ${m.away_team_name}`,
  score: `${m.home_score}-${m.away_score}`,
  line: m.closing_odds?.asianHandicapLine,
  homeOdds: m.closing_odds?.asianHandicapHome,
  awayOdds: m.closing_odds?.asianHandicapAway,
  hwOdds: m.closing_odds?.homeWin,
}));
console.log('Sample AH records:', sample);
