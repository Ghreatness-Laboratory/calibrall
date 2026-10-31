import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { matchesStore, StoredMatch, StoredOddsSnapshot } from '@/lib/data/matchesStore';
import { verifyAdminSecretHeader } from '@/lib/auth/adminAuth';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import {
  DIVISION_MAP,
  EXTRA_LEAGUES_MAP,
  LEAGUE_METADATA,
  SUPPORTED_EUROPEAN_SEASONS,
  SUPPORTED_BRAZIL_SEASONS,
  generateBackfillCallList,
  sanitizeRawTeamForId,
  parseLondonCsvDateTime,
  parseBrazilCsvDate,
  getCanonicalTeamForCsv,
} from '@/lib/data/backfillCatalog';

export async function GET(req: NextRequest) {
  // Authenticate with ADMIN_SECRET via x-admin-secret header only
  const auth = verifyAdminSecretHeader(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const host = req.headers.get('host') || 'calibrall.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const callList = generateBackfillCallList(baseUrl);

  return NextResponse.json({
    service: 'Calibrall Admin Backfill Pipeline',
    status: 'ACTIVE',
    authentication: 'Header x-admin-secret required (min 32 characters, constant-time evaluated)',
    supportedLeagues: Array.from(new Set([...Object.keys(DIVISION_MAP), ...Object.keys(EXTRA_LEAGUES_MAP)])),
    leagueCapabilities: LEAGUE_METADATA,
    supportedEuropeanSeasons: SUPPORTED_EUROPEAN_SEASONS,
    supportedBrazilSeasons: SUPPORTED_BRAZIL_SEASONS,
    droppedSeasons: ['1920', '2019'],
    callListTotal: callList.length,
    callList,
    idempotencyRule: 'provider_id format: fdco:{div}:{season}:{yyyymmdd}:{homeRaw}:{awayRaw}',
    unmatchedNames: matchesStore.getUnmatchedNames(),
    unmappedFixtureNames: matchesStore.getUnmappedFixtureNames(),
  });
}

export async function POST(req: NextRequest) {
  // 1. Authenticate exclusively via x-admin-secret header with timing-safe comparison
  const auth = verifyAdminSecretHeader(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  // 2. Extract parameters
  const url = new URL(req.url);
  const league = (url.searchParams.get('league') || 'SA').toUpperCase().trim();
  const season = (url.searchParams.get('season') || '2425').trim();
  const dryRun = url.searchParams.get('dryRun') === 'true';

  // Validate that season is not dropped season 1920 or 2019
  if (season === '1920' || season === '2019') {
    return NextResponse.json(
      {
        error: 'Invalid season: Season 1920/2019 has been deprecated and dropped from Calibrall pipelines. Please use 2021 through 2627 for Europe, and 2020 through 2026 for Brazil/extra leagues.',
        supportedEuropeanSeasons: SUPPORTED_EUROPEAN_SEASONS,
        supportedBrazilSeasons: SUPPORTED_BRAZIL_SEASONS,
      },
      { status: 400 }
    );
  }

  const matches: StoredMatch[] = [];
  const oddsSnapshots: StoredOddsSnapshot[] = [];
  let rowsSkipped = 0;
  let sourceUsed = 'football-data.co.uk';

  try {
    // 3. Option A: Extra-League CSV files (/new/{CODE}.csv) - BSA, BRA, ARG, DNK, NOR, FIN, JPN
    const extraFileCode = EXTRA_LEAGUES_MAP[league];
    if (extraFileCode) {
      sourceUsed = `football-data.co.uk:${extraFileCode}`;
      const csvUrl = `https://football-data.co.uk/new/${extraFileCode}.csv`;
      const csvRes = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Calibrall/1.0' },
        cache: 'no-store',
      });

      if (!csvRes.ok) {
        throw new Error(`Failed to fetch ${league} CSV from ${csvUrl}: HTTP ${csvRes.status}`);
      }

      const csvRawText = await csvRes.text();
      // Strip any byte-order mark (BOM)
      const cleanCsvText = csvRawText.replace(/^\uFEFF/, '');

      // Parse with csv-parse library: quote is strictly '"'
      const records: Record<string, string>[] = parse(cleanCsvText, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        quote: '"',
        trim: true,
        relax_column_count: true,
      });

      if (records.length === 0) {
        throw new Error(`Empty CSV response for ${league}`);
      }

      // Map requested season to year or split year format
      const targetSeasonYear = season.length === 4 && season.startsWith('20')
        ? season
        : season === '2627' ? '2026'
        : season === '2526' ? '2025'
        : season === '2425' ? '2024'
        : season === '2324' ? '2023'
        : season === '2223' ? '2022'
        : season === '2122' ? '2021'
        : season === '2021' ? '2020'
        : season;

      for (const row of records) {
        const rowSeason = row['Season']?.trim() || '';
        const matchesSeason = (
          rowSeason === season ||
          rowSeason === targetSeasonYear ||
          rowSeason.replace('/', '') === season ||
          ((season === '2627' || season === '2026') && (rowSeason === '2026' || rowSeason === '2026/2027' || rowSeason === '2627')) ||
          ((season === '2526' || season === '2025') && (rowSeason === '2025' || rowSeason === '2025/2026' || rowSeason === '2526')) ||
          ((season === '2425' || season === '2024') && (rowSeason === '2024' || rowSeason === '2024/2025' || rowSeason === '2425')) ||
          ((season === '2324' || season === '2023') && (rowSeason === '2023' || rowSeason === '2023/2024' || rowSeason === '2324')) ||
          ((season === '2223' || season === '2022') && (rowSeason === '2022' || rowSeason === '2022/2023' || rowSeason === '2223')) ||
          ((season === '2122' || season === '2021') && (rowSeason === '2021' || rowSeason === '2021/2022' || rowSeason === '2122'))
        );
        if (!matchesSeason) continue;

        const rawHome = row['Home']?.trim();
        const rawAway = row['Away']?.trim();
        if (!rawHome || !rawAway) {
          rowsSkipped++;
          continue;
        }

        const rawDate = row['Date']?.trim();
        const rawTime = row['Time']?.trim() || null;
        const isoKickoff = parseLondonCsvDateTime(rawDate, rawTime) || parseBrazilCsvDate(rawDate);
        if (!isoKickoff) {
          rowsSkipped++;
          continue; // Skip invalid date row
        }

        const homeResolved = getCanonicalTeamForCsv(league, rawHome);
        const awayResolved = getCanonicalTeamForCsv(league, rawAway);

        const hg = parseInt(row['HG'], 10);
        const ag = parseInt(row['AG'], 10);
        const isFinished = !isNaN(hg) && !isNaN(ag);

        const cleanDateStr = rawDate.replace(/\//g, '');
        const providerId = `fdco:${extraFileCode.toLowerCase()}:${targetSeasonYear}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;

        const matchdayRaw = row['Round'] || row['Matchday'] || row['MW'] || null;
        const matchday = matchdayRaw ? parseInt(matchdayRaw, 10) : null;

        matches.push({
          id: providerId,
          provider_id: providerId,
          competition_code: league,
          season: season,
          matchday: !isNaN(matchday as number) ? matchday : null,
          home_team_id: homeResolved.id,
          away_team_id: awayResolved.id,
          home_team_name: homeResolved.name,
          away_team_name: awayResolved.name,
          kickoff_time: isoKickoff,
          status: isFinished ? 'FINISHED' : 'SCHEDULED',
          home_score: isFinished ? hg : null,
          away_score: isFinished ? ag : null,
          source: `football-data.co.uk:${extraFileCode.toLowerCase()}`,
        });

        // Pre-match odds (observed_at: null, snapshot_type: 'csv_pre_match')
        const preH = parseFloat(row['AvgH'] || row['PH'] || row['MaxH'] || row['B365H']);
        const preD = parseFloat(row['AvgD'] || row['PD'] || row['MaxD'] || row['B365D']);
        const preA = parseFloat(row['AvgA'] || row['PA'] || row['MaxA'] || row['B365A']);

        if (!isNaN(preH) && preH >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: '1X2_HOME',
            selection: `${homeResolved.shortName} Win`,
            decimal_odds: preH,
            observed_at: null,
            snapshot_type: 'csv_pre_match',
            source: `football-data.co.uk:${extraFileCode.toLowerCase()}`,
          });
        }
        if (!isNaN(preD) && preD >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: '1X2_DRAW',
            selection: 'Draw',
            decimal_odds: preD,
            observed_at: null,
            snapshot_type: 'csv_pre_match',
            source: `football-data.co.uk:${extraFileCode.toLowerCase()}`,
          });
        }
        if (!isNaN(preA) && preA >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: '1X2_AWAY',
            selection: `${awayResolved.shortName} Win`,
            decimal_odds: preA,
            observed_at: null,
            snapshot_type: 'csv_pre_match',
            source: `football-data.co.uk:${extraFileCode.toLowerCase()}`,
          });
        }

        // Closing odds (observed_at: null, snapshot_type: 'csv_closing')
        const closeH = parseFloat(row['AvgCH'] || row['PSCH'] || row['MaxCH'] || row['B365CH']);
        const closeD = parseFloat(row['AvgCD'] || row['PSCD'] || row['MaxCD'] || row['B365CD']);
        const closeA = parseFloat(row['AvgCA'] || row['PSCA'] || row['MaxCA'] || row['B365CA']);

        if (!isNaN(closeH) && closeH >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: row['PSCH'] ? 'Pinnacle' : 'MarketAvg',
            market_code: '1X2_HOME',
            selection: `${homeResolved.shortName} Win`,
            decimal_odds: closeH,
            observed_at: null,
            snapshot_type: 'csv_closing',
            source: `football-data.co.uk:${extraFileCode.toLowerCase()}:closing`,
          });
        }
        if (!isNaN(closeD) && closeD >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: row['PSCD'] ? 'Pinnacle' : 'MarketAvg',
            market_code: '1X2_DRAW',
            selection: 'Draw',
            decimal_odds: closeD,
            observed_at: null,
            snapshot_type: 'csv_closing',
            source: `football-data.co.uk:${extraFileCode.toLowerCase()}:closing`,
          });
        }
        if (!isNaN(closeA) && closeA >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: row['PSCA'] ? 'Pinnacle' : 'MarketAvg',
            market_code: '1X2_AWAY',
            selection: `${awayResolved.shortName} Win`,
            decimal_odds: closeA,
            observed_at: null,
            snapshot_type: 'csv_closing',
            source: `football-data.co.uk:${extraFileCode.toLowerCase()}:closing`,
          });
        }
      }
    } else {
      // 4. Option B: European Seasonal Leagues CSV (PL, ELC, PD, BL1, SA, FL1, DED, P1, T1, SC0, etc.)
      const divCode = DIVISION_MAP[league];
      if (!divCode) {
        return NextResponse.json(
          {
            error: `Unsupported league code '${league}'. Supported leagues: ${Array.from(new Set([...Object.keys(DIVISION_MAP), ...Object.keys(EXTRA_LEAGUES_MAP)])).join(', ')}`,
          },
          { status: 400 }
        );
      }

      sourceUsed = `football-data.co.uk:${divCode}`;
      const csvUrl = `https://football-data.co.uk/mmz4281/${season}/${divCode}.csv`;

      const csvRes = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Calibrall/1.0' },
        cache: 'no-store',
      });

      if (!csvRes.ok) {
        throw new Error(`Failed to fetch ${league} CSV for season ${season} from ${csvUrl}: HTTP ${csvRes.status}`);
      }

      const csvRawText = await csvRes.text();
      // Strip any byte-order mark (BOM)
      const cleanCsvText = csvRawText.replace(/^\uFEFF/, '');

      // Parse with csv-parse library: quote is strictly '"'
      // Apostrophes in names like M'gladbach and Nott'm Forest are parsed cleanly as literal characters
      const records: Record<string, string>[] = parse(cleanCsvText, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        quote: '"',
        trim: true,
        relax_column_count: true,
      });

      if (records.length === 0) {
        throw new Error(`Empty CSV file returned for ${league} ${season}`);
      }

      for (const row of records) {
        const rawHome = row['HomeTeam']?.trim();
        const rawAway = row['AwayTeam']?.trim();
        if (!rawHome || !rawAway) {
          rowsSkipped++;
          continue;
        }

        const rawDate = row['Date']?.trim();
        const rawTime = row['Time']?.trim() || null;

        // Date validation: skip row only if date is invalid (never default to now)
        // Missing time is stored with null time (no 15:00 default)
        const isoKickoff = parseLondonCsvDateTime(rawDate, rawTime);
        if (!isoKickoff) {
          rowsSkipped++;
          continue; // Skip invalid date row
        }

        // Canonical team identity created directly from CSV itself: One canonical team per league and CSV name
        // Never skips matches due to unknown team!
        const homeResolved = getCanonicalTeamForCsv(league, rawHome);
        const awayResolved = getCanonicalTeamForCsv(league, rawAway);

        const fthg = parseInt(row['FTHG'], 10);
        const ftag = parseInt(row['FTAG'], 10);
        const isFinished = !isNaN(fthg) && !isNaN(ftag);

        const cleanDateStr = rawDate.replace(/\//g, '');
        // provider_id format independent of team IDs for idempotent re-runs:
        // fdco:{div}:{season}:{yyyymmdd}:{homeRaw}:{awayRaw}
        const providerId = `fdco:${divCode.toLowerCase()}:${season}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;

        // Matchday: take from provider if present, or null. Never compute from row index!
        const matchdayRaw = row['Round'] || row['Matchday'] || row['MW'] || null;
        const matchday = matchdayRaw ? parseInt(matchdayRaw, 10) : null;

        matches.push({
          id: providerId,
          provider_id: providerId,
          competition_code: league,
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
          home_yellow_cards: row['HY'] !== undefined && !isNaN(parseInt(row['HY'], 10)) ? parseInt(row['HY'], 10) : null,
          away_yellow_cards: row['AY'] !== undefined && !isNaN(parseInt(row['AY'], 10)) ? parseInt(row['AY'], 10) : null,
          home_red_cards: row['HR'] !== undefined && !isNaN(parseInt(row['HR'], 10)) ? parseInt(row['HR'], 10) : null,
          away_red_cards: row['AR'] !== undefined && !isNaN(parseInt(row['AR'], 10)) ? parseInt(row['AR'], 10) : null,
          home_shots: row['HS'] !== undefined && !isNaN(parseInt(row['HS'], 10)) ? parseInt(row['HS'], 10) : null,
          away_shots: row['AS'] !== undefined && !isNaN(parseInt(row['AS'], 10)) ? parseInt(row['AS'], 10) : null,
          home_shots_on_target: row['HST'] !== undefined && !isNaN(parseInt(row['HST'], 10)) ? parseInt(row['HST'], 10) : null,
          away_shots_on_target: row['AST'] !== undefined && !isNaN(parseInt(row['AST'], 10)) ? parseInt(row['AST'], 10) : null,
          source: `football-data.co.uk:${divCode}`,
        });

        // 1. Pre-Match 1X2 Odds: observed_at: null, snapshot_type: 'csv_pre_match'
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

        // 2. Pre-Match Total Goals (Over/Under 2.5): observed_at: null, snapshot_type: 'csv_pre_match'
        const o25Odds = parseFloat(row['Avg>2.5'] || row['B365>2.5'] || row['P>2.5']);
        const u25Odds = parseFloat(row['Avg<2.5'] || row['B365<2.5'] || row['P<2.5']);
        if (!isNaN(o25Odds) && o25Odds >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: 'TOTAL_GOALS_O25',
            selection: 'Over 2.5 Goals',
            decimal_odds: o25Odds,
            observed_at: null,
            snapshot_type: 'csv_pre_match',
            source: `football-data.co.uk:${season}`,
          });
        }
        if (!isNaN(u25Odds) && u25Odds >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: 'TOTAL_GOALS_U25',
            selection: 'Under 2.5 Goals',
            decimal_odds: u25Odds,
            observed_at: null,
            snapshot_type: 'csv_pre_match',
            source: `football-data.co.uk:${season}`,
          });
        }

        // 3. Closing Odds (PSCH, PSCD, PSCA, AvgCH, AvgCD, AvgCA): observed_at: null, snapshot_type: 'csv_closing'
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
    }

    const sortedDates = matches.map(m => m.kickoff_time).sort();
    const earliestDate = sortedDates[0] || null;
    const latestDate = sortedDates[sortedDates.length - 1] || null;

    const unmappedFixtures = matchesStore.getUnmappedFixtureNames();

    // 5. If dryRun=true: preview counts, skipped rows and unmapped names without writing
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        league,
        season,
        sourceUsed,
        rowsFetched: matches.length + rowsSkipped,
        rowsInserted: matches.length,
        rowsSkipped: 0,
        oddsSnapshotsCount: oddsSnapshots.length,
        earliestDate,
        latestDate,
        unmappedFixtureNamesCount: unmappedFixtures.length,
        unmappedFixtureNames: unmappedFixtures,
        environment: process.env.NODE_ENV || 'development',
        persistenceTarget: 'Dry Run Preview (No writes performed)',
      });
    }

    // 6. Upsert matches and odds into Store / Supabase
    // Creates canonical teams rows first so foreign keys cannot fail
    // Leaves ratings and sample_matches null until computed
    // Leaves crest_url null (never builds made-up URLs)
    // In production, confirms writes to Supabase and fails loudly if unconfigured or on error
    const upsertResult = await matchesStore.upsertMatches(matches, oddsSnapshots);

    return NextResponse.json({
      success: true,
      dryRun: false,
      league,
      season,
      sourceUsed,
      rowsFetched: upsertResult.fetched + rowsSkipped,
      rowsInserted: upsertResult.inserted,
      rowsSkipped: 0,
      oddsSnapshotsCount: oddsSnapshots.length,
      earliestDate,
      latestDate,
      unmappedFixtureNamesCount: unmappedFixtures.length,
      unmappedFixtureNames: unmappedFixtures,
      errors: upsertResult.errors,
      environment: process.env.NODE_ENV || 'development',
      persistenceTarget: (isSupabaseConfigured && supabase) ? 'Supabase (Production Database)' : 'In-Memory Store (Sandbox Output)',
    });
  } catch (error: any) {
    console.error(`[AdminBackfill] Error backfilling ${league} ${season}:`, error);
    return NextResponse.json(
      {
        success: false,
        league,
        season,
        error: error.message || 'Backfill operation failed',
      },
      { status: 500 }
    );
  }
}
