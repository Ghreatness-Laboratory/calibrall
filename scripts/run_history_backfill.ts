// CALIBRALL: Comprehensive Football-Data.co.uk Historical Backfill Runner
// Downloads CSVs for:
// First tiers: E0, E1, I1, D1, F1
// Second tiers: E2, I2, D2, F2
// Seasons: 2021/22 to 2026/27 (2122, 2223, 2324, 2425, 2526, 2627) - 54 files total.
// 1. Prints each file's column headers
// 2. Dry run with full parsed metrics
// 3. Real backfill into Supabase (teams, matches, odds_snapshots)
// 4. Data-status report (matches per league and season, latest match date per league)

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { supabase } from '../src/lib/supabase/client';
import { matchesStore, StoredMatch, StoredOddsSnapshot } from '../src/lib/data/matchesStore';
import {
  parseLondonCsvDateTime,
  getCanonicalTeamForCsv,
  sanitizeRawTeamForId,
} from '../src/lib/data/backfillCatalog';

const DIVISIONS = [
  // First tiers
  'E0', 'E1', 'I1', 'D1', 'F1',
  // Second tiers
  'E2', 'I2', 'D2', 'F2',
];

const SEASONS = ['2122', '2223', '2324', '2425', '2526', '2627'];

const CACHE_DIR = path.join('/tmp', 'fdco_cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface ParsedFile {
  division: string;
  season: string;
  url: string;
  headers: string[];
  rawRowsCount: number;
  validMatches: StoredMatch[];
  oddsSnapshots: StoredOddsSnapshot[];
  skippedRows: number;
  columnsDetected: {
    goals: boolean;
    results: boolean;
    halfTimeGoals: boolean;
    corners: boolean;
    cards: boolean;
    shots: boolean;
    fouls: boolean;
    referee: boolean;
    oddsPreMatch: boolean;
    oddsClosing: boolean;
  };
}

async function fetchCsvWithCache(division: string, season: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${season}_${division}.csv`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = `https://football-data.co.uk/mmz4281/${season}/${division}.csv`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Calibrall/1.0 (History Ingestion Engine)' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }

  const text = await res.text();
  fs.writeFileSync(cachePath, text, 'utf-8');
  return text;
}

function parseFile(division: string, season: string, csvText: string): ParsedFile {
  const url = `https://football-data.co.uk/mmz4281/${season}/${division}.csv`;
  const cleanCsvText = csvText.replace(/^\uFEFF/, '').trim();

  // Extract raw column headers
  const rawParsed: string[][] = parse(cleanCsvText, {
    columns: false,
    skip_empty_lines: true,
    bom: true,
    quote: '"',
    trim: true,
    relax_column_count: true,
    to_line: 1,
  });

  const headers = rawParsed[0] || [];
  const headerSet = new Set(headers.map(h => h.trim()));

  const columnsDetected = {
    goals: headerSet.has('FTHG') && headerSet.has('FTAG'),
    results: headerSet.has('FTR'),
    halfTimeGoals: headerSet.has('HTHG') && headerSet.has('HTAG'),
    corners: headerSet.has('HC') && headerSet.has('AC'),
    cards: headerSet.has('HY') && headerSet.has('AY') && headerSet.has('HR') && headerSet.has('AR'),
    shots: headerSet.has('HS') && headerSet.has('AS') && headerSet.has('HST') && headerSet.has('AST'),
    fouls: headerSet.has('HF') && headerSet.has('AF'),
    referee: headerSet.has('Referee'),
    oddsPreMatch: headerSet.has('B365H') || headerSet.has('AvgH') || headerSet.has('MaxH'),
    oddsClosing: headerSet.has('PSCH') || headerSet.has('AvgCH') || headerSet.has('MaxCH'),
  };

  const records: Record<string, string>[] = parse(cleanCsvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    quote: '"',
    trim: true,
    relax_column_count: true,
  });

  const validMatches: StoredMatch[] = [];
  const oddsSnapshots: StoredOddsSnapshot[] = [];
  let skippedRows = 0;

  for (const row of records) {
    const rawHome = row['HomeTeam']?.trim();
    const rawAway = row['AwayTeam']?.trim();
    if (!rawHome || !rawAway) {
      skippedRows++;
      continue;
    }

    const rawDate = row['Date']?.trim();
    const rawTime = row['Time']?.trim() || null;
    const isoKickoff = parseLondonCsvDateTime(rawDate, rawTime);
    if (!isoKickoff) {
      skippedRows++;
      continue;
    }

    const homeResolved = getCanonicalTeamForCsv(division, rawHome);
    const awayResolved = getCanonicalTeamForCsv(division, rawAway);

    const fthg = parseInt(row['FTHG'], 10);
    const ftag = parseInt(row['FTAG'], 10);
    const isFinished = !isNaN(fthg) && !isNaN(ftag);

    const cleanDateStr = rawDate.replace(/\//g, '');
    const providerId = `fdco:${division.toLowerCase()}:${season}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;

    const matchdayRaw = row['Round'] || row['Matchday'] || row['MW'] || null;
    const matchday = matchdayRaw ? parseInt(matchdayRaw, 10) : null;

    const ftr = row['FTR']?.trim();
    const resultOutcome = ftr ? ftr : (isFinished ? (fthg > ftag ? 'H' : fthg === ftag ? 'D' : 'A') : null);

    validMatches.push({
      id: providerId,
      provider_id: providerId,
      competition_code: division,
      season: season,
      matchday: !isNaN(matchday as number) ? matchday : null,
      home_team_id: homeResolved.id,
      away_team_id: awayResolved.id,
      home_team_name: homeResolved.name,
      away_team_name: awayResolved.name,
      kickoff_time: isoKickoff,
      status: isFinished ? 'FINISHED' : 'SCHEDULED',
      home_score: isFinished ? fthg : null,
      away_score: isFinished ? ftag : null,
      home_half_time_score: row['HTHG'] !== undefined && !isNaN(parseInt(row['HTHG'], 10)) ? parseInt(row['HTHG'], 10) : null,
      away_half_time_score: row['HTAG'] !== undefined && !isNaN(parseInt(row['HTAG'], 10)) ? parseInt(row['HTAG'], 10) : null,
      home_corners: row['HC'] !== undefined && !isNaN(parseInt(row['HC'], 10)) ? parseInt(row['HC'], 10) : null,
      away_corners: row['AC'] !== undefined && !isNaN(parseInt(row['AC'], 10)) ? parseInt(row['AC'], 10) : null,
      home_first_half_corners: row['HHC'] !== undefined && !isNaN(parseInt(row['HHC'], 10)) ? parseInt(row['HHC'], 10) : null,
      away_first_half_corners: row['AHC'] !== undefined && !isNaN(parseInt(row['AHC'], 10)) ? parseInt(row['AHC'], 10) : null,
      home_yellow_cards: row['HY'] !== undefined && !isNaN(parseInt(row['HY'], 10)) ? parseInt(row['HY'], 10) : null,
      away_yellow_cards: row['AY'] !== undefined && !isNaN(parseInt(row['AY'], 10)) ? parseInt(row['AY'], 10) : null,
      home_red_cards: row['HR'] !== undefined && !isNaN(parseInt(row['HR'], 10)) ? parseInt(row['HR'], 10) : null,
      away_red_cards: row['AR'] !== undefined && !isNaN(parseInt(row['AR'], 10)) ? parseInt(row['AR'], 10) : null,
      home_shots: row['HS'] !== undefined && !isNaN(parseInt(row['HS'], 10)) ? parseInt(row['HS'], 10) : null,
      away_shots: row['AS'] !== undefined && !isNaN(parseInt(row['AS'], 10)) ? parseInt(row['AS'], 10) : null,
      home_shots_on_target: row['HST'] !== undefined && !isNaN(parseInt(row['HST'], 10)) ? parseInt(row['HST'], 10) : null,
      away_shots_on_target: row['AST'] !== undefined && !isNaN(parseInt(row['AST'], 10)) ? parseInt(row['AST'], 10) : null,
      home_fouls: row['HF'] !== undefined && !isNaN(parseInt(row['HF'], 10)) ? parseInt(row['HF'], 10) : null,
      away_fouls: row['AF'] !== undefined && !isNaN(parseInt(row['AF'], 10)) ? parseInt(row['AF'], 10) : null,
      referee: row['Referee'] ? row['Referee'].trim() : null,
      result: resultOutcome,
      source: `football-data.co.uk:${division}`,
    });

    // Pre-match 1X2 odds
    const b365H = parseFloat(row['B365H']);
    const b365D = parseFloat(row['B365D']);
    const b365A = parseFloat(row['B365A']);
    if (!isNaN(b365H) && b365H >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'Bet365',
        market_code: '1X2_HOME',
        selection: `${homeResolved.shortName} Win`,
        decimal_odds: b365H,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }
    if (!isNaN(b365D) && b365D >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'Bet365',
        market_code: '1X2_DRAW',
        selection: 'Draw',
        decimal_odds: b365D,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }
    if (!isNaN(b365A) && b365A >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'Bet365',
        market_code: '1X2_AWAY',
        selection: `${awayResolved.shortName} Win`,
        decimal_odds: b365A,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }

    const avgH = parseFloat(row['AvgH']);
    const avgD = parseFloat(row['AvgD']);
    const avgA = parseFloat(row['AvgA']);
    if (!isNaN(avgH) && avgH >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: '1X2_HOME',
        selection: `${homeResolved.shortName} Win`,
        decimal_odds: avgH,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }
    if (!isNaN(avgD) && avgD >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: '1X2_DRAW',
        selection: 'Draw',
        decimal_odds: avgD,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }
    if (!isNaN(avgA) && avgA >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: '1X2_AWAY',
        selection: `${awayResolved.shortName} Win`,
        decimal_odds: avgA,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }

    // Pre-match Totals (Over / Under 2.5)
    const o25 = parseFloat(row['Avg>2.5'] || row['B365>2.5'] || row['P>2.5']);
    const u25 = parseFloat(row['Avg<2.5'] || row['B365<2.5'] || row['P<2.5']);
    if (!isNaN(o25) && o25 >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: 'TOTAL_GOALS_O25',
        selection: 'Over 2.5 Goals',
        decimal_odds: o25,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }
    if (!isNaN(u25) && u25 >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: 'TOTAL_GOALS_U25',
        selection: 'Under 2.5 Goals',
        decimal_odds: u25,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }

    // Closing Odds (Pinnacle & Market Average)
    const psCH = parseFloat(row['PSCH']);
    const psCD = parseFloat(row['PSCD']);
    const psCA = parseFloat(row['PSCA']);
    if (!isNaN(psCH) && psCH >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'Pinnacle',
        market_code: '1X2_HOME',
        selection: `${homeResolved.shortName} Win`,
        decimal_odds: psCH,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }
    if (!isNaN(psCD) && psCD >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'Pinnacle',
        market_code: '1X2_DRAW',
        selection: 'Draw',
        decimal_odds: psCD,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }
    if (!isNaN(psCA) && psCA >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'Pinnacle',
        market_code: '1X2_AWAY',
        selection: `${awayResolved.shortName} Win`,
        decimal_odds: psCA,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }

    const avgCH = parseFloat(row['AvgCH']);
    const avgCD = parseFloat(row['AvgCD']);
    const avgCA = parseFloat(row['AvgCA']);
    if (!isNaN(avgCH) && avgCH >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: '1X2_HOME',
        selection: `${homeResolved.shortName} Win`,
        decimal_odds: avgCH,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }
    if (!isNaN(avgCD) && avgCD >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: '1X2_DRAW',
        selection: 'Draw',
        decimal_odds: avgCD,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }
    if (!isNaN(avgCA) && avgCA >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: 'MarketAvg',
        market_code: '1X2_AWAY',
        selection: `${awayResolved.shortName} Win`,
        decimal_odds: avgCA,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }
  }

  return {
    division,
    season,
    url,
    headers,
    rawRowsCount: records.length,
    validMatches,
    oddsSnapshots,
    skippedRows,
    columnsDetected,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('CALIBRALL HISTORICAL FOOTBALL-DATA.CO.UK INGESTION PIPELINE');
  console.log('Divisions (Tier 1 & Tier 2): E0, E1, I1, D1, F1, E2, I2, D2, F2');
  console.log('Seasons: 2021/22 (2122) to 2026/27 (2627)');
  console.log(`Total files to process: ${DIVISIONS.length} divisions x ${SEASONS.length} seasons = ${DIVISIONS.length * SEASONS.length} files`);
  console.log('='.repeat(80));

  // STEP 1: Fetch and print column headers for each file
  console.log('\n================================================================================');
  console.log('STEP 1: COLUMN HEADERS FOR ALL 54 FILES');
  console.log('================================================================================\n');

  const parsedFiles: ParsedFile[] = [];

  for (const div of DIVISIONS) {
    for (const season of SEASONS) {
      const csvText = await fetchCsvWithCache(div, season);
      const parsed = parseFile(div, season, csvText);
      parsedFiles.push(parsed);

      console.log(`--- [${div}] Season ${season} ---`);
      console.log(`URL: ${parsed.url}`);
      console.log(`Headers (${parsed.headers.length} columns):`);
      console.log(parsed.headers.join(', '));
      console.log(`Stored Columns Detected:`);
      console.log(`  - Goals (FTHG/FTAG): ${parsed.columnsDetected.goals ? 'YES' : 'NO'}`);
      console.log(`  - Results (FTR): ${parsed.columnsDetected.results ? 'YES' : 'NO'}`);
      console.log(`  - Half-Time Goals (HTHG/HTAG): ${parsed.columnsDetected.halfTimeGoals ? 'YES' : 'NO'}`);
      console.log(`  - Corners (HC/AC): ${parsed.columnsDetected.corners ? 'YES' : 'NO'}`);
      console.log(`  - Cards (HY/AY/HR/AR): ${parsed.columnsDetected.cards ? 'YES' : 'NO'}`);
      console.log(`  - Shots (HS/AS/HST/AST): ${parsed.columnsDetected.shots ? 'YES' : 'NO'}`);
      console.log(`  - Fouls (HF/AF): ${parsed.columnsDetected.fouls ? 'YES' : 'NO'}`);
      console.log(`  - Referee (Referee): ${parsed.columnsDetected.referee ? 'YES' : 'NO'}`);
      console.log(`  - Pre-Match Odds (1X2/Totals): ${parsed.columnsDetected.oddsPreMatch ? 'YES' : 'NO'}`);
      console.log(`  - Closing Odds (1X2): ${parsed.columnsDetected.oddsClosing ? 'YES' : 'NO'}`);
      console.log('');
    }
  }

  // STEP 2: DRY RUN
  console.log('\n================================================================================');
  console.log('STEP 2: DRY RUN OUTPUT');
  console.log('================================================================================\n');

  let totalDryMatches = 0;
  let totalDryOdds = 0;
  let totalDrySkipped = 0;

  console.log(
    'Division | Season | Rows Fetched | Valid Matches | Odds Snapshots | Skipped | Date Range'
  );
  console.log('-'.repeat(85));

  for (const f of parsedFiles) {
    const dates = f.validMatches.map(m => m.kickoff_time).sort();
    const earliest = dates[0]?.slice(0, 10) || 'N/A';
    const latest = dates[dates.length - 1]?.slice(0, 10) || 'N/A';

    totalDryMatches += f.validMatches.length;
    totalDryOdds += f.oddsSnapshots.length;
    totalDrySkipped += f.skippedRows;

    console.log(
      `${f.division.padEnd(8)} | ${f.season.padEnd(6)} | ${String(f.rawRowsCount).padStart(12)} | ${String(f.validMatches.length).padStart(13)} | ${String(f.oddsSnapshots.length).padStart(14)} | ${String(f.skippedRows).padStart(7)} | ${earliest} to ${latest}`
    );
  }

  console.log('-'.repeat(85));
  console.log(`DRY RUN TOTALS:`);
  console.log(`  Files Parsed:          ${parsedFiles.length}`);
  console.log(`  Total Matches Valid:   ${totalDryMatches}`);
  console.log(`  Total Odds Snapshots:  ${totalDryOdds}`);
  console.log(`  Total Rows Skipped:    ${totalDrySkipped}`);
  console.log(`  Persistence Target:    Dry Run Preview (No database writes performed)`);

  // STEP 3: REAL BACKFILL INTO SUPABASE
  console.log('\n================================================================================');
  console.log('STEP 3: REAL BACKFILL OUTPUT (WRITING TO SUPABASE)');
  console.log('================================================================================\n');

  let totalInsertedMatches = 0;
  let totalInsertedOdds = 0;
  let totalInsertedErrors = 0;

  console.log(
    'Division | Season | Matches Upserted | Odds Snapshots Upserted | Status'
  );
  console.log('-'.repeat(75));

  for (const f of parsedFiles) {
    const res = await matchesStore.upsertMatches(f.validMatches, f.oddsSnapshots);
    totalInsertedMatches += res.inserted;
    totalInsertedOdds += f.oddsSnapshots.length;
    if (res.errors && res.errors.length > 0) {
      totalInsertedErrors += res.errors.length;
    }

    const statusStr = res.errors && res.errors.length > 0
      ? `ERRORS: ${res.errors.length}`
      : 'SUCCESS (Supabase)';

    console.log(
      `${f.division.padEnd(8)} | ${f.season.padEnd(6)} | ${String(res.inserted).padStart(16)} | ${String(f.oddsSnapshots.length).padStart(22)} | ${statusStr}`
    );
  }

  console.log('-'.repeat(75));
  console.log(`REAL BACKFILL TOTALS:`);
  console.log(`  Total Matches Stored in Supabase:        ${totalInsertedMatches}`);
  console.log(`  Total Odds Snapshots Stored in Supabase: ${totalInsertedOdds}`);
  console.log(`  Total Errors:                            ${totalInsertedErrors}`);
  console.log(`  Persistence Target:                      Supabase Production (Persistent Database)`);

  // STEP 4: DATA-STATUS OUTPUT FROM SUPABASE
  console.log('\n================================================================================');
  console.log('STEP 4: DATA-STATUS OUTPUT (READ EXCLUSIVELY FROM SUPABASE)');
  console.log('================================================================================\n');

  const statusReport = await matchesStore.getDataStatus();

  console.log(`DATA-STATUS SERVICE REPORT:`);
  console.log(`Store Used:            ${statusReport.storeUsed}`);
  console.log(`Persistence Mode:      ${statusReport.persistenceMode}`);
  console.log(`Total Matches in DB:   ${statusReport.totalMatches}`);
  console.log(`Overall Earliest Date: ${statusReport.earliestDate}`);
  console.log(`Overall Latest Date:   ${statusReport.latestDate}`);
  console.log(`Unmatched Names Count: ${statusReport.unmatchedNamesCount}`);

  console.log('\n--- MATCHES PER LEAGUE AND SEASON ---');
  console.log('League | Season | Match Count | Earliest Match       | Latest Match');
  console.log('-'.repeat(70));
  for (const row of statusReport.matchesPerLeagueAndSeason.sort((a, b) => a.league.localeCompare(b.league) || a.season.localeCompare(b.season))) {
    console.log(
      `${row.league.padEnd(6)} | ${row.season.padEnd(6)} | ${String(row.count).padStart(11)} | ${row.earliestDate.padEnd(20)} | ${row.latestDate}`
    );
  }

  console.log('\n--- LATEST MATCH DATE PER LEAGUE ---');
  console.log('League | League Name                     | Match Count | Earliest Date        | Latest Date          | Days Ago | Status');
  console.log('-'.repeat(105));
  for (const row of statusReport.leagueLatestDates.filter(l => l.count > 0)) {
    const statusLabel = row.isStale ? `STALE (${row.daysAgo}d ago)` : `ACTIVE (${row.daysAgo}d ago)`;
    console.log(
      `${row.league.padEnd(6)} | ${row.leagueName.padEnd(31)} | ${String(row.count).padStart(11)} | ${(row.earliestDate || 'N/A').padEnd(20)} | ${(row.latestDate || 'N/A').padEnd(20)} | ${String(row.daysAgo ?? 'N/A').padStart(8)} | ${statusLabel}`
    );
  }

  // Also query count from teams and odds_snapshots tables directly from Supabase
  const { count: teamsCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: oddsCount } = await supabase.from('odds_snapshots').select('*', { count: 'exact', head: true });
  const { count: matchesCount } = await supabase.from('matches').select('*', { count: 'exact', head: true });

  console.log('\n--- SUPABASE DATABASE RECORD AUDIT ---');
  console.log(`  teams table count:          ${teamsCount}`);
  console.log(`  matches table count:        ${matchesCount}`);
  console.log(`  odds_snapshots table count: ${oddsCount}`);
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Fatal error in backfill runner:', err);
  process.exit(1);
});
