// CALIBRALL: Free Sources Ingestion Script
// Downloads and normalizes football-data.co.uk CSVs across 2324, 2425, 2526, and 2627 seasons
// Generates src/lib/data/free_sources_matches.json

import fs from 'fs';
import path from 'path';
import { lookupCanonicalTeam } from '../src/lib/data/canonicalTeams';

const SEASONS = ['2324', '2425', '2526', '2627'];
const DIVISIONS = ['E0', 'E1', 'D1', 'SP1', 'I1', 'F1'];

const DIV_MAP: Record<string, string> = {
  E0: 'PL',
  E1: 'ELC',
  D1: 'BL1',
  SP1: 'PD',
  I1: 'SA',
  F1: 'FL1',
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseDate(dStr: string): string | null {
  if (!dStr) return null;
  const parts = dStr.split(/[/.-]/);
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parts[2];
  if (year.length === 2) {
    const yrNum = parseInt(year, 10);
    year = yrNum > 50 ? `19${year}` : `20${year}`;
  }
  return `${year}-${month}-${day}`;
}

async function run() {
  console.log('--- STARTING FREE SOURCES INGESTION (football-data.co.uk) ---');
  const allMatches: any[] = [];
  const unmatchedSet = new Set<string>();

  for (const div of DIVISIONS) {
    const compCode = DIV_MAP[div] || div;
    for (const season of SEASONS) {
      const url = `https://www.football-data.co.uk/mmz4281/${season}/${div}.csv`;
      try {
        console.log(`Fetching ${season} ${div}...`);
        const res = await fetch(url, {
          headers: { 'User-Agent': 'CalibrallFootballResearch/2.0' },
        });
        if (!res.ok) {
          console.warn(`HTTP ${res.status} for ${url}`);
          continue;
        }
        const text = await res.text();
        const lines = text.trim().split('\n').filter(l => l.trim().length > 0);
        if (lines.length < 2) continue;

        const header = parseCsvLine(lines[0]);
        const colIndex = (col: string) => header.indexOf(col);

        const idxDate = colIndex('Date');
        const idxTime = colIndex('Time');
        const idxHome = colIndex('HomeTeam');
        const idxAway = colIndex('AwayTeam');
        const idxFTHG = colIndex('FTHG');
        const idxFTAG = colIndex('FTAG');
        const idxHTHG = colIndex('HTHG');
        const idxHTAG = colIndex('HTAG');
        const idxReferee = colIndex('Referee');
        const idxHS = colIndex('HS');
        const idxAS = colIndex('AS');
        const idxHST = colIndex('HST');
        const idxAST = colIndex('AST');
        const idxHC = colIndex('HC');
        const idxAC = colIndex('AC');
        const idxHY = colIndex('HY');
        const idxAY = colIndex('AY');
        const idxHR = colIndex('HR');
        const idxAR = colIndex('AR');
        const idxHF = colIndex('HF');
        const idxAF = colIndex('AF');

        const idxAvgCH = colIndex('AvgCH') !== -1 ? colIndex('AvgCH') : colIndex('AvgH');
        const idxAvgCD = colIndex('AvgCD') !== -1 ? colIndex('AvgCD') : colIndex('AvgD');
        const idxAvgCA = colIndex('AvgCA') !== -1 ? colIndex('AvgCA') : colIndex('AvgA');
        const idxAvgCO25 = colIndex('AvgC>2.5') !== -1 ? colIndex('AvgC>2.5') : colIndex('Avg>2.5');
        const idxAvgCU25 = colIndex('AvgC<2.5') !== -1 ? colIndex('AvgC<2.5') : colIndex('Avg<2.5');
        const idxAHCh = colIndex('AHCh') !== -1 ? colIndex('AHCh') : colIndex('AHh');
        const idxAvgCAHH = colIndex('AvgCAHH') !== -1 ? colIndex('AvgCAHH') : colIndex('AvgAHH');
        const idxAvgCAHA = colIndex('AvgCAHA') !== -1 ? colIndex('AvgCAHA') : colIndex('AvgAHA');

        let seasonMatches = 0;
        for (let i = 1; i < lines.length; i++) {
          const row = parseCsvLine(lines[i]);
          if (row.length < 5) continue;

          const rawDate = row[idxDate];
          const parsedDate = parseDate(rawDate);
          if (!parsedDate) continue;

          const rawHome = row[idxHome];
          const rawAway = row[idxAway];
          if (!rawHome || !rawAway) continue;

          const homeCanon = lookupCanonicalTeam(rawHome);
          const awayCanon = lookupCanonicalTeam(rawAway);

          if (!homeCanon) unmatchedSet.add(rawHome);
          if (!awayCanon) unmatchedSet.add(rawAway);

          const homeId = homeCanon ? homeCanon.canonicalId : `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const awayId = awayCanon ? awayCanon.canonicalId : `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

          const fthg = parseInt(row[idxFTHG], 10);
          const ftag = parseInt(row[idxFTAG], 10);
          if (isNaN(fthg) || isNaN(ftag)) continue;

          const hthg = idxHTHG !== -1 ? parseInt(row[idxHTHG], 10) : null;
          const htag = idxHTAG !== -1 ? parseInt(row[idxHTAG], 10) : null;
          const hs = idxHS !== -1 ? parseInt(row[idxHS], 10) : null;
          const as_ = idxAS !== -1 ? parseInt(row[idxAS], 10) : null;
          const hst = idxHST !== -1 ? parseInt(row[idxHST], 10) : null;
          const ast = idxAST !== -1 ? parseInt(row[idxAST], 10) : null;
          const hc = idxHC !== -1 ? parseInt(row[idxHC], 10) : null;
          const ac = idxAC !== -1 ? parseInt(row[idxAC], 10) : null;
          const hy = idxHY !== -1 ? parseInt(row[idxHY], 10) : null;
          const ay = idxAY !== -1 ? parseInt(row[idxAY], 10) : null;
          const hr = idxHR !== -1 ? parseInt(row[idxHR], 10) : null;
          const ar = idxAR !== -1 ? parseInt(row[idxAR], 10) : null;
          const hf = idxHF !== -1 ? parseInt(row[idxHF], 10) : null;
          const af = idxAF !== -1 ? parseInt(row[idxAF], 10) : null;
          const referee = idxReferee !== -1 && row[idxReferee] ? row[idxReferee].trim() : null;

          const avgH = idxAvgCH !== -1 && row[idxAvgCH] ? parseFloat(row[idxAvgCH]) : undefined;
          const avgD = idxAvgCD !== -1 && row[idxAvgCD] ? parseFloat(row[idxAvgCD]) : undefined;
          const avgA = idxAvgCA !== -1 && row[idxAvgCA] ? parseFloat(row[idxAvgCA]) : undefined;
          const avgO25 = idxAvgCO25 !== -1 && row[idxAvgCO25] ? parseFloat(row[idxAvgCO25]) : undefined;
          const avgU25 = idxAvgCU25 !== -1 && row[idxAvgCU25] ? parseFloat(row[idxAvgCU25]) : undefined;
          const ahLine = idxAHCh !== -1 && row[idxAHCh] ? parseFloat(row[idxAHCh]) : undefined;
          const ahHome = idxAvgCAHH !== -1 && row[idxAvgCAHH] ? parseFloat(row[idxAvgCAHH]) : undefined;
          const ahAway = idxAvgCAHA !== -1 && row[idxAvgCAHA] ? parseFloat(row[idxAvgCAHA]) : undefined;

          const rawTime = idxTime !== -1 && row[idxTime] ? row[idxTime] : '15:00';
          const kickoffTime = `${parsedDate}T${rawTime.length === 5 ? rawTime : '15:00'}:00Z`;

          const matchId = `${parsedDate}_${homeId}_${awayId}`;

          allMatches.push({
            id: matchId,
            provider_id: matchId,
            competition_code: compCode,
            season: `20${season.slice(0, 2)}/20${season.slice(2, 4)}`,
            home_team_id: homeId,
            away_team_id: awayId,
            home_team_name: homeCanon?.canonicalName || rawHome,
            away_team_name: awayCanon?.canonicalName || rawAway,
            kickoff_time: kickoffTime,
            status: 'FINISHED',
            home_score: fthg,
            away_score: ftag,
            home_half_time_score: !isNaN(hthg as number) ? hthg : null,
            away_half_time_score: !isNaN(htag as number) ? htag : null,
            home_corners: !isNaN(hc as number) ? hc : null,
            away_corners: !isNaN(ac as number) ? ac : null,
            home_yellow_cards: !isNaN(hy as number) ? hy : null,
            away_yellow_cards: !isNaN(ay as number) ? ay : null,
            home_red_cards: !isNaN(hr as number) ? hr : null,
            away_red_cards: !isNaN(ar as number) ? ar : null,
            home_shots: !isNaN(hs as number) ? hs : null,
            away_shots: !isNaN(as_ as number) ? as_ : null,
            home_shots_on_target: !isNaN(hst as number) ? hst : null,
            away_shots_on_target: !isNaN(ast as number) ? ast : null,
            home_fouls: !isNaN(hf as number) ? hf : null,
            away_fouls: !isNaN(af as number) ? af : null,
            referee,
            closing_odds: (avgH && avgD && avgA) ? {
              homeWin: avgH,
              draw: avgD,
              awayWin: avgA,
              over25: avgO25,
              under25: avgU25,
              asianHandicapLine: ahLine,
              asianHandicapHome: ahHome,
              asianHandicapAway: ahAway,
            } : null,
            source: 'football-data.co.uk:free',
          });
          seasonMatches++;
        }
        console.log(`Ingested ${seasonMatches} matches for ${season} ${div}`);
      } catch (e: any) {
        console.error(`Error ingesting ${season} ${div}:`, e?.message);
      }
    }
  }

  // Deduplicate matches by id
  const dedupedMap = new Map<string, any>();
  for (const m of allMatches) {
    dedupedMap.set(m.id, m);
  }
  const finalMatches = Array.from(dedupedMap.values()).sort((a, b) => b.kickoff_time.localeCompare(a.kickoff_time));

  const outPath = path.resolve(process.cwd(), 'src/lib/data/free_sources_matches.json');
  fs.writeFileSync(outPath, JSON.stringify(finalMatches, null, 2));

  console.log(`\n✅ Ingestion complete!`);
  console.log(`Total canonical matches written: ${finalMatches.length}`);
  console.log(`File saved: ${outPath}`);
  console.log(`Unmatched clubs count: ${unmatchedSet.size}`);
  if (unmatchedSet.size > 0) {
    console.log(`Sample unmatched:`, Array.from(unmatchedSet).slice(0, 10));
  }
}

run();
