import fs from 'fs';
import path from 'path';

const matchesPath = path.join(process.cwd(), 'src/lib/data/free_sources_matches.json');
const matches = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

// Check AH line = -0.5 matches
let ahMinus05Count = 0;
let wins = 0;
let sumProfit = 0;
for (const m of matches) {
  if (m.kickoff_time >= '2024-08-01' && m.kickoff_time <= '2026-06-01') {
    if (m.closing_odds?.asianHandicapLine === -0.5) {
      ahMinus05Count++;
      const homeWin = m.home_score > m.away_score;
      const odds = m.closing_odds.asianHandicapHome;
      if (homeWin) {
        wins++;
        sumProfit += (odds - 1);
      } else {
        sumProfit -= 1;
      }
    }
  }
}
console.log('Matches with AH Line == -0.5:', ahMinus05Count);
console.log('Home wins on -0.5 line:', wins, (wins / ahMinus05Count * 100).toFixed(1) + '%');
console.log('Flat yield on -0.5 line:', (sumProfit / ahMinus05Count * 100).toFixed(2) + '%');
