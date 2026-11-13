// CALIBRALL: Comprehensive Football-Data.co.uk Historical Backfill Runner
// Seasonal divisions (22): E0, E1, E2, E3, EC, SC0, SC1, SC2, SC3, SP1, SP2, I1, I2, D1, D2, F1, F2, N1, B1, P1, T1, G1
// Seasonal windows (7): 2021, 2122, 2223, 2324, 2425, 2526, 2627 (154 CSVs)
// Extra leagues (16): ARG, AUT, BSA (BRA), CHN, DNK, FIN, IRL, JPN, MEX, NOR, POL, ROU, RUS, SWE, SWZ, USA (2020..2026 / 2020/2021..2026/2027)
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
  // England
  'E0', 'E1', 'E2', 'E3', 'EC',
  // Scotland
  'SC0', 'SC1', 'SC2', 'SC3',
  // Spain, Italy, Germany, France
  'SP1', 'SP2', 'I1', 'I2', 'D1', 'D2', 'F1', 'F2',
  // Netherlands, Belgium, Portugal, Turkey, Greece
  'N1', 'B1', 'P1', 'T1', 'G1',
];

const SEASONS = ['2021', '2122', '2223', '2324', '2425', '2526', '2627'];

const EXTRA_LEAGUES: Array<{ competitionCode: string; fileCode: string }> = [
  { competitionCode: 'ARG', fileCode: 'ARG' },
  { competitionCode: 'AUT', fileCode: 'AUT' },
  { competitionCode: 'BSA', fileCode: 'BRA' },
  { competitionCode: 'CHN', fileCode: 'CHN' },
  { competitionCode: 'DNK', fileCode: 'DNK' },
  { competitionCode: 'FIN', fileCode: 'FIN' },
  { competitionCode: 'IRL', fileCode: 'IRL' },
  { competitionCode: 'JPN', fileCode: 'JPN' },
  { competitionCode: 'MEX', fileCode: 'MEX' },
  { competitionCode: 'NOR', fileCode: 'NOR' },
  { competitionCode: 'POL', fileCode: 'POL' },
  { competitionCode: 'ROU', fileCode: 'ROU' },
  { competitionCode: 'RUS', fileCode: 'RUS' },
  { competitionCode: 'SWE', fileCode: 'SWE' },
  { competitionCode: 'SWZ', fileCode: 'SWZ' },
  { competitionCode: 'USA', fileCode: 'USA' },
];

const VALID_EXTRA_SEASONS = new Set([
  '2020', '2021', '2022', '2023', '2024', '2025', '2026',
  '2020/2021', '2021/2022', '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027',
]);

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
    asianHandicapPrices: boolean;
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

async function fetchExtraCsvWithCache(fileCode: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${fileCode}.csv`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = `https://football-data.co.uk/new/${fileCode}.csv`;
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

function parseSeasonalFile(division: string, season: string, csvText: string): ParsedFile {
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

  const headers = (rawParsed[0] || []).filter(Boolean);
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
    asianHandicapPrices: headerSet.has('AHh') || headerSet.has('B365AHH') || headerSet.has('AvgAHH') || headerSet.has('PCAHH'),
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

    // Asian Handicap Pre-Match & Closing Odds
    const ahLine = parseFloat(row['AHh']);
    const ahPreH = parseFloat(row['AvgAHH'] || row['PAHH'] || row['B365AHH']);
    const ahPreA = parseFloat(row['AvgAHA'] || row['PAHA'] || row['B365AHA']);
    const ahPreBook = row['AvgAHH'] ? 'MarketAvg' : row['PAHH'] ? 'Pinnacle' : 'Bet365';
    const ahHomeLabel = !isNaN(ahLine) ? `${ahLine > 0 ? '+' : ''}${ahLine}` : 'Line';
    const ahAwayLabel = !isNaN(ahLine) ? `${-ahLine > 0 ? '+' : ''}${-ahLine}` : 'Line';

    if (!isNaN(ahPreH) && ahPreH >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: ahPreBook,
        market_code: 'ASIAN_HANDICAP_HOME',
        selection: `${homeResolved.shortName} AH ${ahHomeLabel}`,
        decimal_odds: ahPreH,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }
    if (!isNaN(ahPreA) && ahPreA >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: ahPreBook,
        market_code: 'ASIAN_HANDICAP_AWAY',
        selection: `${awayResolved.shortName} AH ${ahAwayLabel}`,
        decimal_odds: ahPreA,
        observed_at: null,
        snapshot_type: 'csv_pre_match',
        source: `football-data.co.uk:${season}`,
      });
    }

    const ahCloseLine = parseFloat(row['AHCh']);
    const ahCloseH = parseFloat(row['PCAHH'] || row['AvgCAHH'] || row['B365CAHH']);
    const ahCloseA = parseFloat(row['PCAHA'] || row['AvgCAHA'] || row['B365CAHA']);
    const ahCloseBook = row['PCAHH'] ? 'Pinnacle' : row['AvgCAHH'] ? 'MarketAvg' : 'Bet365';
    const ahCloseHomeLabel = !isNaN(ahCloseLine) ? `${ahCloseLine > 0 ? '+' : ''}${ahCloseLine}` : 'Line';
    const ahCloseAwayLabel = !isNaN(ahCloseLine) ? `${-ahCloseLine > 0 ? '+' : ''}${-ahCloseLine}` : 'Line';

    if (!isNaN(ahCloseH) && ahCloseH >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: ahCloseBook,
        market_code: 'ASIAN_HANDICAP_HOME',
        selection: `${homeResolved.shortName} AH ${ahCloseHomeLabel}`,
        decimal_odds: ahCloseH,
        observed_at: null,
        snapshot_type: 'csv_closing',
        source: `football-data.co.uk:${season}:closing`,
      });
    }
    if (!isNaN(ahCloseA) && ahCloseA >= 1.01) {
      oddsSnapshots.push({
        match_id: providerId,
        bookmaker: ahCloseBook,
        market_code: 'ASIAN_HANDICAP_AWAY',
        selection: `${awayResolved.shortName} AH ${ahCloseAwayLabel}`,
        decimal_odds: ahCloseA,
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

function parseExtraLeagueSeasons(competitionCode: string, fileCode: string, csvText: string): ParsedFile[] {
  const url = `https://football-data.co.uk/new/${fileCode}.csv`;
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
    asianHandicapPrices: false,
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

  // Group records by valid target seasons (2020..2026 and 2020/2021..2026/2027)
  const seasonsOrder: string[] = [];
  const rowsBySeason = new Map<string, Record<string, string>[]>();
  for (const r of records) {
    const s = r['Season']?.trim() || '';
    if (!VALID_EXTRA_SEASONS.has(s)) continue;
    let bucket = rowsBySeason.get(s);
    if (!bucket) {
      bucket = [];
      rowsBySeason.set(s, bucket);
      seasonsOrder.push(s);
    }
    bucket.push(r);
  }

  const filesBySeason: ParsedFile[] = [];

  for (const season of seasonsOrder) {
    const seasonRows = rowsBySeason.get(season) || [];
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
      const rawTime = row['Time']?.trim() || null;
      const isoKickoff = fileCode === 'BRA'
        ? parseBrazilCsvDate(rawDate)
        : (parseLondonCsvDateTime(rawDate, rawTime) || parseBrazilCsvDate(rawDate));
      if (!isoKickoff) {
        skippedRows++;
        continue;
      }

      const homeResolved = getCanonicalTeamForCsv(competitionCode, rawHome);
      const awayResolved = getCanonicalTeamForCsv(competitionCode, rawAway);
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
      const cleanSeasonKey = season.replace(/\//g, '_');
      const providerId = `fdco:${fileCode.toLowerCase()}:${cleanSeasonKey}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;
      const resCode = row['Res']?.trim();
      const resultOutcome = resCode ? resCode : (isFinished ? (hg > ag ? 'H' : hg === ag ? 'D' : 'A') : null);

      validMatches.push({
        id: providerId,
        provider_id: providerId,
        competition_code: competitionCode,
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
        source: `football-data.co.uk:${fileCode}`,
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
          source: `football-data.co.uk:${fileCode}:${season}:closing`,
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
          source: `football-data.co.uk:${fileCode}:${season}:closing`,
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
          source: `football-data.co.uk:${fileCode}:${season}:closing`,
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
          source: `football-data.co.uk:${fileCode}:${season}:closing`,
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
          source: `football-data.co.uk:${fileCode}:${season}:closing`,
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
          source: `football-data.co.uk:${fileCode}:${season}:closing`,
        });
      }
    }

    filesBySeason.push({
      division: competitionCode,
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
  if (!isDryRun) {
    clearUnresolvedTeamsLog();
  }

  console.log('='.repeat(110));
  console.log(`CALIBRALL HISTORICAL FOOTBALL-DATA.CO.UK INGESTION PIPELINE (${isDryRun ? 'DRY RUN' : 'REAL BACKFILL'})`);
  console.log(`Seasonal Divisions (22): ${DIVISIONS.join(', ')}`);
  console.log(`Seasonal Windows (7):    ${SEASONS.join(', ')} (${DIVISIONS.length * SEASONS.length} CSVs)`);
  console.log(`Extra Leagues (16):      ${EXTRA_LEAGUES.map(e => `${e.competitionCode}(${e.fileCode}.csv)`).join(', ')}`);
  console.log('='.repeat(110));

  const parsedFiles: ParsedFile[] = [];

  for (const div of DIVISIONS) {
    for (const season of SEASONS) {
      const csvText = await fetchCsvWithCache(div, season);
      const parsed = parseSeasonalFile(div, season, csvText);
      parsedFiles.push(parsed);
    }
  }

  for (const extra of EXTRA_LEAGUES) {
    const csvText = await fetchExtraCsvWithCache(extra.fileCode);
    const extraParsed = parseExtraLeagueSeasons(extra.competitionCode, extra.fileCode, csvText);
    parsedFiles.push(...extraParsed);
  }

  console.log('\n==============================================================================================================');
  console.log('DRY RUN PREVIEW (PARSED METRICS PER DIVISION & SEASON)');
  console.log('==============================================================================================================\n');

  let totalDryMatches = 0;
  let totalDryOdds = 0;
  let totalDrySkipped = 0;
  const allUnresolved = new Set<string>();

  console.log(
    'Division | Season    | Rows Fetched | Valid Matches | Odds Snapshots | Skipped | Date Range'
  );
  console.log('-'.repeat(95));

  for (const f of parsedFiles) {
    const dates = f.validMatches.map(m => m.kickoff_time).sort();
    const earliest = dates[0]?.slice(0, 10) || 'N/A';
    const latest = dates[dates.length - 1]?.slice(0, 10) || 'N/A';

    totalDryMatches += f.validMatches.length;
    totalDryOdds += f.oddsSnapshots.length;
    totalDrySkipped += f.skippedRows;
    for (const u of f.unresolvedNames) allUnresolved.add(u);

    console.log(
      `${f.division.padEnd(8)} | ${f.season.padEnd(9)} | ${String(f.rawRowsCount).padStart(12)} | ${String(f.validMatches.length).padStart(13)} | ${String(f.oddsSnapshots.length).padStart(14)} | ${String(f.skippedRows).padStart(7)} | ${earliest} to ${latest}`
    );
  }

  console.log('-'.repeat(95));
  console.log('DRY RUN TOTALS:');
  console.log(`  Partitions Parsed:     ${parsedFiles.length}`);
  console.log(`  Total Matches Valid:   ${totalDryMatches}`);
  console.log(`  Total Odds Snapshots:  ${totalDryOdds}`);
  console.log(`  Total Rows Skipped:    ${totalDrySkipped}`);
  console.log(`  Unresolved Names:      ${allUnresolved.size}${allUnresolved.size > 0 ? ' -> ' + Array.from(allUnresolved).join(', ') : ' (NONE)'}`);

  if (isDryRun) {
    console.log('  Persistence Target:    DRY RUN ONLY — No database writes performed.');
    console.log('='.repeat(110));
    return;
  }

  console.log('\n==============================================================================================================');
  console.log('REAL BACKFILL OUTPUT (WRITING TO SUPABASE)');
  console.log('==============================================================================================================\n');

  let totalInsertedMatches = 0;
  let totalInsertedOdds = 0;
  let totalInsertedErrors = 0;

  console.log(
    'Division | Season    | Matches Upserted | Odds Snapshots Upserted | Status'
  );
  console.log('-'.repeat(85));

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
      `${f.division.padEnd(8)} | ${f.season.padEnd(9)} | ${String(res.inserted).padStart(16)} | ${String(f.oddsSnapshots.length).padStart(23)} | ${statusStr}`
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

  console.log('-'.repeat(85));
  console.log('REAL BACKFILL TOTALS:');
  console.log(`  Total Matches Upserted:        ${totalInsertedMatches}`);
  console.log(`  Total Odds Snapshots Upserted: ${totalInsertedOdds}`);
  console.log(`  Total Errors:                  ${totalInsertedErrors}`);
  console.log(`  Brazil 2026 Promoted Flagged:  ${Array.from(PROMOTED_BRAZIL_2026_IDS).join(', ')}`);

  console.log('\n==============================================================================================================');
  console.log('DATA-STATUS OUTPUT (READ EXCLUSIVELY FROM SUPABASE)');
  console.log('==============================================================================================================\n');

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
  console.log('League | Season    | Match Count | Earliest Match       | Latest Match');
  console.log('-'.repeat(80));
  for (const row of statusReport.matchesPerLeagueAndSeason.sort((a, b) => a.league.localeCompare(b.league) || a.season.localeCompare(b.season))) {
    console.log(
      `${row.league.padEnd(6)} | ${row.season.padEnd(9)} | ${String(row.count).padStart(11)} | ${row.earliestDate.padEnd(20)} | ${row.latestDate}`
    );
  }

  console.log('\n--- LATEST MATCH DATE & EMPIRICAL FEATURE COVERAGE PER LEAGUE ---');
  console.log('League | League Name                     | Matches | Earliest   | Latest     | Cards       | Corners     | HT Goals    | Referee     | AH Prices');
  console.log('-'.repeat(156));
  for (const row of statusReport.leagueLatestDates.slice().sort((a, b) => a.league.localeCompare(b.league))) {
    const f = row.features;
    const fmt = (flag: boolean, count: number) => `${flag ? 'YES' : 'NO '} (${String(count).padStart(4)})`;
    console.log(
      `${row.league.padEnd(6)} | ${row.leagueName.padEnd(31)} | ${String(row.count).padStart(7)} | ${(row.earliestDate?.slice(0, 10) || 'N/A').padEnd(10)} | ${(row.latestDate?.slice(0, 10) || 'N/A').padEnd(10)} | ${fmt(f.cards, f.cardsCount).padEnd(11)} | ${fmt(f.corners, f.cornersCount).padEnd(11)} | ${fmt(f.halfTimeGoals, f.halfTimeGoalsCount).padEnd(11)} | ${fmt(f.referee, f.refereeCount).padEnd(11)} | ${fmt(f.asianHandicapPrices, f.asianHandicapCount)}`
    );
  }

  const { count: teamsCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: oddsCount } = await supabase.from('odds_snapshots').select('*', { count: 'exact', head: true });
  const { count: matchesCount } = await supabase.from('matches').select('*', { count: 'exact', head: true });

  console.log('\n--- SUPABASE DATABASE RECORD AUDIT ---');
  console.log(`  teams table count:          ${teamsCount}`);
  console.log(`  matches table count:        ${matchesCount}`);
  console.log(`  odds_snapshots table count: ${oddsCount}`);
  console.log('='.repeat(110));
}

main().catch(err => {
  console.error('Fatal error in backfill runner:', err);
  process.exit(1);
});
