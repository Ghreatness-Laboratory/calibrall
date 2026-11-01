import fs from 'fs';
import path from 'path';

const matchesPath = path.join(process.cwd(), 'src/lib/data/free_sources_matches.json');
const matches = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

let withAh = 0;
let ahLines: Record<string, number> = {};
for (const m of matches) {
  if (m.closing_odds?.asianHandicapHome != null) {
    withAh++;
    const line = String(m.closing_odds.asianHandicapLine);
    ahLines[line] = (ahLines[line] || 0) + 1;
  }
}
console.log('Matches with asianHandicapHome:', withAh);
console.log('AH Lines:', ahLines);
