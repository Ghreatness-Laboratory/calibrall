// CALIBRALL: Comprehensive Football-Data.co.uk Historical Backfill Runner
// First tiers: E0 (PL), SP1 (PD), I1 (SA), D1 (BL1), F1 (FL1), BRA (BSA 2021-2026)
// Second tiers: E1, E2, SP2, I2, D2, F2
// European Seasons: 2021/22 to 2026/27 (2122, 2223, 2324, 2425, 2526, 2627) - 66 files
// Brazil Série A: 2021 to 2026 from https://football-data.co.uk/new/BRA.csv
// Usage:
//   npx tsx scripts/run_history_backfill.ts --dry-run
//   npx tsx scripts/run_history_backfill.ts

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { supabase } from '../src/lib/supabase/client';
import { matchesStore, StoredMatch, StoredOddsSnapshot } from '../src/lib/data/matchesStore';
import {
  parseLondonCsvDateTime,
  parseBrazilCsvDate,
  getCanonicalTeamForCsv,
  sanitizeRawTeamForId,
  PROMOTED_BRAZIL_2026_IDS,
} from '../src/lib/data/backfillCatalog';
import {
  CANONICAL_TEAMS,
  getUnresolvedTeamsLog,
  clearUnresolvedTeamsLog,
} from '../src/lib/data/canonicalTeams';

const DIVISIONS = [
  // European Tier 1
  'E0', 'SP1', 'I1', 'D1', 'F1',
  // European Tier 2 / English Tier 3
  'E1', 'E2', 'SP2', 'I2', 'D2', 'F2',
];

const SEASONS = ['2122', '2223', '2324', '2425', '2526', '2627'];
const BRA_SEASONS = ['2021', '2022', '2023', '2024', '2025', '2026'];

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
  unresolvedNames: string[];
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

async function fetchBrazilCsvWithCache(): Promise<string> {
  const cachePath = path.join(CACHE_DIR, 'BRA.csv');
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = 'https://football-data.co.uk/new/BRA.csv';
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
  const unresolvedSet = new Set<string>();
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
    if (!homeResolved || !awayResolved) {
      if (!homeResolved) unresolvedSet.add(rawHome);
      if (!awayResolved) unresolvedSet.add(rawAway);
      skippedRows++;
      continue;
    }

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
    unresolvedNames: Array.from(unresolvedSet).sort(),
    columnsDetected,
  };
}

function parseBrazilSeasons(csvText: string): ParsedFile[] {
  const url = 'https://football-data.co.uk/new/BRA.csv';
  const cleanCsvText = csvText.replace(/^\uFEFF/, '').trim();

  const rawParsed: string[][] = parse(cleanCsvText, {
    columns: false,
    skip_empty_lines: true,
    bom: true,
    quote: '"',
    trim: true,
    relax_column_count: true,
    to_line: 1,
  });

  const headers = (rawParsed[0] || []).filter(Boolean);
  const headerSet = new Set(headers.map(h => h.trim()));

  const columnsDetected = {
    goals: headerSet.has('HG') && headerSet.has('AG'),
    results: headerSet.has('Res'),
    halfTimeGoals: false,
    corners: false,
    cards: false,
    shots: false,
    fouls: false,
    referee: false,
    oddsPreMatch: headerSet.has('B365H') || headerSet.has('AvgH') || headerSet.has('PH'),
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

  const filesBySeason: ParsedFile[] = [];

  for (const season of BRA_SEASONS) {
    const seasonRows = records.filter(r => r['Season']?.trim() === season);
    const validMatches: StoredMatch[] = [];
    const oddsSnapshots: StoredOddsSnapshot[] = [];
    const unresolvedSet = new Set<string>();
    let skippedRows = 0;

    for (const row of seasonRows) {
      const rawHome = row['Home']?.trim();
      const rawAway = row['Away']?.trim();
      if (!rawHome || !rawAway) {
        skippedRows++;
        continue;
      }

      const rawDate = row['Date']?.trim();
      const isoKickoff = parseBrazilCsvDate(rawDate);
      if (!isoKickoff) {
        skippedRows++;
        continue;
      }

      const homeResolved = getCanonicalTeamForCsv('BSA', rawHome);
      const awayResolved = getCanonicalTeamForCsv('BSA', rawAway);
      if (!homeResolved || !awayResolved) {
        if (!homeResolved) unresolvedSet.add(rawHome);
        if (!awayResolved) unresolvedSet.add(rawAway);
        skippedRows++;
        continue;
      }

      const hg = parseInt(row['HG'], 10);
      const ag = parseInt(row['AG'], 10);
      const isFinished = !isNaN(hg) && !isNaN(ag);

      const cleanDateStr = rawDate.replace(/\//g, '');
      const providerId = `fdco:bra:${season}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;
      const resCode = row['Res']?.trim();
      const resultOutcome = resCode ? resCode : (isFinished ? (hg > ag ? 'H' : hg === ag ? 'D' : 'A') : null);

      validMatches.push({
        id: providerId,
        provider_id: providerId,
        competition_code: 'BSA',
        season,
        matchday: null,
        home_team_id: homeResolved.id,
        away_team_id: awayResolved.id,
        home_team_name: homeResolved.name,
        away_team_name: awayResolved.name,
        kickoff_time: isoKickoff,
        status: isFinished ? 'FINISHED' : 'SCHEDULED',
        home_score: isFinished ? hg : null,
        away_score: isFinished ? ag : null,
        home_half_time_score: null,
        away_half_time_score: null,
        home_corners: null,
        away_corners: null,
        home_first_half_corners: null,
        away_first_half_corners: null,
        home_yellow_cards: null,
        away_yellow_cards: null,
        home_red_cards: null,
        away_red_cards: null,
        home_shots: null,
        away_shots: null,
        home_shots_on_target: null,
        away_shots_on_target: null,
        home_fouls: null,
        away_fouls: null,
        referee: null,
        result: resultOutcome,
        source: 'football-data.co.uk:BRA',
      });

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
          source: `football-data.co.uk:BRA:${season}:closing`,
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
          source: `football-data.co.uk:BRA:${season}:closing`,
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
          source: `football-data.co.uk:BRA:${season}:closing`,
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
          source: `football-data.co.uk:BRA:${season}:closing`,
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
          source: `football-data.co.uk:BRA:${season}:closing`,
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
          source: `football-data.co.uk:BRA:${season}:closing`,
        });
      }
    }

    filesBySeason.push({
      division: 'BSA',
      season,
      url,
      headers,
      rawRowsCount: seasonRows.length,
      validMatches,
      oddsSnapshots,
      skippedRows,
      unresolvedNames: Array.from(unresolvedSet).sort(),
      columnsDetected,
    });
  }

  return filesBySeason;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  clearUnresolvedTeamsLog();

  console.log('='.repeat(90));
  console.log(`CALIBRALL HISTORICAL FOOTBALL-DATA.CO.UK INGESTION PIPELINE (${isDryRun ? 'DRY RUN' : 'REAL BACKFILL'})`);
  console.log('Tier 1 Leagues: E0 (PL), SP1 (PD), I1 (SA), D1 (BL1), F1 (FL1), BRA (BSA)');
  console.log('Tier 2/3 Leagues: E1, E2, SP2, I2, D2, F2');
  console.log('Seasons: European 2122..2627 (66 CSVs) + Brazil BRA.csv 2021..2026 (6 seasons)');
  console.log('='.repeat(90));

  const parsedFiles: ParsedFile[] = [];

  for (const div of DIVISIONS) {
    for (const season of SEASONS) {
      const csvText = await fetchCsvWithCache(div, season);
      const parsed = parseFile(div, season, csvText);
      parsedFiles.push(parsed);
    }
  }

  const braCsvText = await fetchBrazilCsvWithCache();
  const braParsed = parseBrazilSeasons(braCsvText);
  parsedFiles.push(...braParsed);

  console.log('\n==========================================================================================');
  console.log('DRY RUN PREVIEW (PARSED METRICS PER DIVISION & SEASON)');
  console.log('==========================================================================================\n');

  let totalDryMatches = 0;
  let totalDryOdds = 0;
  let totalDrySkipped = 0;
  const allUnresolved = new Set<string>();

  console.log(
    'Division | Season | Rows Fetched | Valid Matches | Odds Snapshots | Skipped | Date Range'
  );
  console.log('-'.repeat(88));

  for (const f of parsedFiles) {
    const dates = f.validMatches.map(m => m.kickoff_time).sort();
    const earliest = dates[0]?.slice(0, 10) || 'N/A';
    const latest = dates[dates.length - 1]?.slice(0, 10) || 'N/A';

    totalDryMatches += f.validMatches.length;
    totalDryOdds += f.oddsSnapshots.length;
    totalDrySkipped += f.skippedRows;
    for (const u of f.unresolvedNames) allUnresolved.add(u);

    console.log(
      `${f.division.padEnd(8)} | ${f.season.padEnd(6)} | ${String(f.rawRowsCount).padStart(12)} | ${String(f.validMatches.length).padStart(13)} | ${String(f.oddsSnapshots.length).padStart(14)} | ${String(f.skippedRows).padStart(7)} | ${earliest} to ${latest}`
    );
  }

  console.log('-'.repeat(88));
  console.log('DRY RUN TOTALS:');
  console.log(`  Partitions Parsed:     ${parsedFiles.length} (66 Euro CSVs + 6 Brazil seasons)`);
  console.log(`  Total Matches Valid:   ${totalDryMatches}`);
  console.log(`  Total Odds Snapshots:  ${totalDryOdds}`);
  console.log(`  Total Rows Skipped:    ${totalDrySkipped}`);
  console.log(`  Unresolved Names:      ${allUnresolved.size}${allUnresolved.size > 0 ? ' -> ' + Array.from(allUnresolved).join(', ') : ' (NONE)'}`);

  if (isDryRun) {
    console.log('  Persistence Target:    DRY RUN ONLY — No database writes performed.');
    console.log('='.repeat(90));
    return;
  }

  console.log('\n==========================================================================================');
  console.log('REAL BACKFILL OUTPUT (WRITING TO SUPABASE)');
  console.log('==========================================================================================\n');

  let totalInsertedMatches = 0;
  let totalInsertedOdds = 0;
  let totalInsertedErrors = 0;

  console.log(
    'Division | Season | Matches Upserted | Odds Snapshots Upserted | Status'
  );
  console.log('-'.repeat(78));

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
      `${f.division.padEnd(8)} | ${f.season.padEnd(6)} | ${String(res.inserted).padStart(16)} | ${String(f.oddsSnapshots.length).padStart(23)} | ${statusStr}`
    );
  }

  // Ensure all Brazil 2026 Série B promoted clubs have explicit is_promoted = 1 in teams table
  if (supabase) {
    const promotedRows = Array.from(PROMOTED_BRAZIL_2026_IDS).map(id => {
      const canon = CANONICAL_TEAMS[id];
      return {
        id,
        name: canon?.canonicalName || id,
        short_name: canon?.shortName || id,
        competition_code: 'BSA',
        crest_url: canon?.crestUrl || null,
        tla: canon?.tla || null,
        is_promoted: 1,
      };
    });
    await supabase.from('teams').upsert(promotedRows, { onConflict: 'id' });
  }

  console.log('-'.repeat(78));
  console.log('REAL BACKFILL TOTALS:');
  console.log(`  Total Matches Upserted:        ${totalInsertedMatches}`);
  console.log(`  Total Odds Snapshots Upserted: ${totalInsertedOdds}`);
  console.log(`  Total Errors:                  ${totalInsertedErrors}`);
  console.log(`  Brazil 2026 Promoted Flagged:  ${Array.from(PROMOTED_BRAZIL_2026_IDS).join(', ')}`);

  console.log('\n==========================================================================================');
  console.log('DATA-STATUS OUTPUT (READ EXCLUSIVELY FROM SUPABASE)');
  console.log('==========================================================================================\n');

  const statusReport = await matchesStore.getDataStatus();
  const unresolvedLog = getUnresolvedTeamsLog();

  console.log('DATA-STATUS SERVICE REPORT:');
  console.log(`Store Used:            ${statusReport.storeUsed}`);
  console.log(`Persistence Mode:      ${statusReport.persistenceMode}`);
  console.log(`Total Matches in DB:   ${statusReport.totalMatches}`);
  console.log(`Overall Earliest Date: ${statusReport.earliestDate}`);
  console.log(`Overall Latest Date:   ${statusReport.latestDate}`);
  console.log(`Unresolved Teams Log:  ${unresolvedLog.length}`);

  console.log('\n--- MATCHES PER LEAGUE AND SEASON ---');
  console.log('League | Season | Match Count | Earliest Match       | Latest Match');
  console.log('-'.repeat(75));
  for (const row of statusReport.matchesPerLeagueAndSeason.sort((a, b) => a.league.localeCompare(b.league) || a.season.localeCompare(b.season))) {
    console.log(
      `${row.league.padEnd(6)} | ${row.season.padEnd(6)} | ${String(row.count).padStart(11)} | ${row.earliestDate.padEnd(20)} | ${row.latestDate}`
    );
  }

  console.log('\n--- LATEST MATCH DATE PER LEAGUE (7-DAY & 21-DAY STALENESS CHECK) ---');
  console.log('League | League Name                     | Match Count | Earliest Date        | Latest Date          | Days Ago | >7d Stale | >21d Stale');
  console.log('-'.repeat(120));
  for (const row of statusReport.leagueLatestDates.filter(l => l.count > 0)) {
    const stale7dLabel = row.isStale7d ? 'YES (>7d)' : 'NO (<=7d)';
    const stale21dLabel = row.isStale ? 'YES (>21d)' : 'NO (<=21d)';
    console.log(
      `${row.league.padEnd(6)} | ${row.leagueName.padEnd(31)} | ${String(row.count).padStart(11)} | ${(row.earliestDate || 'N/A').padEnd(20)} | ${(row.latestDate || 'N/A').padEnd(20)} | ${String(row.daysAgo ?? 'N/A').padStart(8)} | ${stale7dLabel.padEnd(9)} | ${stale21dLabel}`
    );
  }

  const { count: teamsCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: oddsCount } = await supabase.from('odds_snapshots').select('*', { count: 'exact', head: true });
  const { count: matchesCount } = await supabase.from('matches').select('*', { count: 'exact', head: true });

  console.log('\n--- SUPABASE DATABASE RECORD AUDIT ---');
  console.log(`  teams table count:          ${teamsCount}`);
  console.log(`  matches table count:        ${matchesCount}`);
  console.log(`  odds_snapshots table count: ${oddsCount}`);
  console.log('='.repeat(90));
}

main().catch(err => {
  console.error('Fatal error in backfill runner:', err);
  process.exit(1);
});
