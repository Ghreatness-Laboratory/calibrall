import fs from 'fs';
import path from 'path';

const matchesPath = path.join(process.cwd(), 'src/lib/data/free_sources_matches.json');
const matches: any[] = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

const testMatches = matches.filter(m => m.kickoff_time >= '2024-08-01' && m.kickoff_time <= '2026-06-01' && m.home_score != null && m.away_score != null);

console.log('Total test matches:', testMatches.length);

const lineCounts: Record<string, { count: number; withOdds: number }> = {};

for (const m of testMatches) {
  const line = m.closing_odds?.asianHandicapLine;
  const lineStr = line != null ? line.toString() : 'null';
  if (!lineCounts[lineStr]) lineCounts[lineStr] = { count: 0, withOdds: 0 };
  lineCounts[lineStr].count++;
  if (m.closing_odds?.asianHandicapHome != null && m.closing_odds?.asianHandicapAway != null) {
    lineCounts[lineStr].withOdds++;
  }
}

console.log('Asian Handicap lines distribution:');
console.table(lineCounts);

// Also check BTTS, Over/Under 2.5, Corners, Cards in closing_odds
let ou25Count = 0;
let bttsCount = 0;
let fhCount = 0;
let cornersOddsCount = 0;
let cardsOddsCount = 0;

for (const m of testMatches) {
  if (m.closing_odds?.over25 != null && m.closing_odds?.under25 != null) ou25Count++;
  if ((m.closing_odds as any)?.bttsYes != null) bttsCount++;
  if ((m.closing_odds as any)?.fhOver05 != null) fhCount++;
}

console.log('Closing odds counts:');
console.log('1X2 closing odds:', testMatches.filter(m => m.closing_odds?.homeWin && m.closing_odds?.draw && m.closing_odds?.awayWin).length);
console.log('Over/Under 2.5 closing odds:', ou25Count);
console.log('BTTS closing odds:', bttsCount);
console.log('1st Half Over 0.5 closing odds:', fhCount);
console.log('Corners closing odds:', cornersOddsCount);
console.log('Cards closing odds:', cardsOddsCount);
