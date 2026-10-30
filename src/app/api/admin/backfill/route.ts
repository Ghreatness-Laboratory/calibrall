import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { matchesStore, StoredMatch, StoredOddsSnapshot } from '@/lib/data/matchesStore';
import { lookupTeamStrength } from '@/lib/data/teamDatabase';
import { displayName } from '@/lib/utils/formatText';
import { verifyAdminSecretHeader } from '@/lib/auth/adminAuth';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import {
  DIVISION_MAP,
  SUPPORTED_EUROPEAN_SEASONS,
  SUPPORTED_BRAZIL_SEASONS,
  generateBackfillCallList,
  sanitizeRawTeamForId,
  parseLondonCsvDateTime,
} from '@/lib/data/backfillCatalog';

/**
 * Cache for Supabase database aliases to minimize round-trips during backfill.
 */
let dbAliasesCache: Map<string, string> | null = null;
let dbAliasesCacheTime = 0;

async function getDatabaseAliases(): Promise<Map<string, string>> {
  const now = Date.now();
  if (dbAliasesCache && now - dbAliasesCacheTime < 60000) {
    return dbAliasesCache;
  }

  const map = new Map<string, string>();
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('team_aliases').select('team_id, alias');
      if (!error && data) {
        for (const row of data) {
          if (row.alias && row.team_id) {
            map.set(row.alias.trim().toLowerCase(), row.team_id);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  dbAliasesCache = map;
  dbAliasesCacheTime = now;
  return map;
}

/**
 * Resolves CSV team name strictly through team_aliases table and TEAM_STRENGTH_DATABASE.
 * Never auto-creates a team from a slugified name.
 */
async function resolveTeamName(
  rawName: string,
  unmatchedSet: Set<string>
): Promise<{ id: string; name: string; shortName: string } | null> {
  if (!rawName || !rawName.trim()) return null;
  const cleanRaw = rawName.trim();
  const lowerRaw = cleanRaw.toLowerCase();

  // 1. Check database team_aliases table
  const dbAliases = await getDatabaseAliases();
  const aliasedTeamId = dbAliases.get(lowerRaw);
  if (aliasedTeamId) {
    const lookup = lookupTeamStrength(aliasedTeamId);
    if (lookup.found && lookup.data) {
      return {
        id: lookup.data.id,
        name: lookup.data.name,
        shortName: lookup.data.shortName,
      };
    }
    return {
      id: aliasedTeamId,
      name: cleanRaw,
      shortName: cleanRaw,
    };
  }

  // 2. Check canonical TEAM_STRENGTH_DATABASE and its aliases
  const lookup = lookupTeamStrength(cleanRaw);
  if (lookup.found && lookup.data) {
    return {
      id: lookup.data.id,
      name: lookup.data.name,
      shortName: lookup.data.shortName,
    };
  }

  // 3. Unmatched: NEVER auto-create from slugified name
  unmatchedSet.add(cleanRaw);
  matchesStore.recordUnmatchedName(cleanRaw);
  return null;
}

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
    supportedLeagues: Object.keys(DIVISION_MAP).concat(['BSA']),
    supportedEuropeanSeasons: SUPPORTED_EUROPEAN_SEASONS,
    supportedBrazilSeasons: SUPPORTED_BRAZIL_SEASONS,
    droppedSeasons: ['1920', '2019'],
    callListTotal: callList.length,
    callList,
    idempotencyRule: 'provider_id format: fdco:{div}:{season}:{yyyymmdd}:{homeRaw}:{awayRaw}',
    unmatchedNames: matchesStore.getUnmatchedNames(),
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

  // Validate that season is not dropped season 1920
  if (season === '1920' || season === '2019') {
    return NextResponse.json(
      {
        error: 'Invalid season: Season 1920 has been deprecated and dropped from Calibrall pipelines. Please use 2021 through 2627.',
        supportedEuropeanSeasons: SUPPORTED_EUROPEAN_SEASONS,
        supportedBrazilSeasons: SUPPORTED_BRAZIL_SEASONS,
      },
      { status: 400 }
    );
  }

  const matches: StoredMatch[] = [];
  const oddsSnapshots: StoredOddsSnapshot[] = [];
  const unmatchedNames = new Set<string>();
  let sourceUsed = 'football-data.co.uk';

  try {
    // 3. Option A: Brazil Série A CSV
    if (league === 'BSA') {
      const csvRes = await fetch('https://football-data.co.uk/new/BRA.csv', {
        headers: { 'User-Agent': 'Calibrall/1.0' },
        cache: 'no-store',
      });

      if (!csvRes.ok) {
        throw new Error(`Failed to fetch Brazil CSV from football-data.co.uk: HTTP ${csvRes.status}`);
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
        throw new Error('Empty Brazil CSV response');
      }

      // Map requested season to Brazil season year: e.g. "2024", "2025", "2026"
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
        const rowSeason = row['Season']?.trim();
        if (rowSeason !== targetSeasonYear) continue;

        const rawHome = row['Home']?.trim();
        const rawAway = row['Away']?.trim();
        if (!rawHome || !rawAway) continue;

        const rawDate = row['Date']?.trim();
        const rawTime = row['Time']?.trim() || null;

        // Date validation: skip row if date is invalid (never default to now)
        const isoKickoff = parseLondonCsvDateTime(rawDate, rawTime);
        if (!isoKickoff) {
          continue; // Skip invalid date row
        }

        // Team identity: resolve through aliases, never auto-create from slugified name
        const homeResolved = await resolveTeamName(rawHome, unmatchedNames);
        const awayResolved = await resolveTeamName(rawAway, unmatchedNames);

        if (!homeResolved || !awayResolved) {
          // One or both teams unmatched: do not insert row with invented foreign keys
          continue;
        }

        const hg = parseInt(row['HG'], 10);
        const ag = parseInt(row['AG'], 10);
        const isFinished = !isNaN(hg) && !isNaN(ag);

        const cleanDateStr = rawDate.replace(/\//g, '');
        // provider_id format independent of team IDs for idempotent re-runs:
        // fdco:{div}:{season}:{yyyymmdd}:{homeRaw}:{awayRaw}
        const providerId = `fdco:bra:${targetSeasonYear}:${cleanDateStr}:${sanitizeRawTeamForId(rawHome)}:${sanitizeRawTeamForId(rawAway)}`;

        // Matchday: take from provider if present, or null. Never compute from row index!
        const matchdayRaw = row['Round'] || row['Matchday'] || row['MW'] || null;
        const matchday = matchdayRaw ? parseInt(matchdayRaw, 10) : null;

        matches.push({
          id: providerId,
          provider_id: providerId,
          competition_code: 'BSA',
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
          source: 'football-data.co.uk:brazil',
        });

        // Odds snapshots
        const oddH = parseFloat(row['AvgCH'] || row['AvgH'] || row['PSCH'] || row['PH']);
        const oddD = parseFloat(row['AvgCD'] || row['AvgD'] || row['PSCD'] || row['PD']);
        const oddA = parseFloat(row['AvgCA'] || row['AvgA'] || row['PSCA'] || row['PA']);

        if (!isNaN(oddH) && oddH >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: '1X2_HOME',
            selection: `${homeResolved.shortName} Win`,
            decimal_odds: oddH,
            source: 'football-data.co.uk:brazil',
          });
        }
        if (!isNaN(oddD) && oddD >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: '1X2_DRAW',
            selection: 'Draw',
            decimal_odds: oddD,
            source: 'football-data.co.uk:brazil',
          });
        }
        if (!isNaN(oddA) && oddA >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: '1X2_AWAY',
            selection: `${awayResolved.shortName} Win`,
            decimal_odds: oddA,
            source: 'football-data.co.uk:brazil',
          });
        }
      }
    } else {
      // 4. Option B: European Leagues CSV (PL, PD, BL1, SA, FL1, DED)
      const divCode = DIVISION_MAP[league];
      if (!divCode) {
        return NextResponse.json(
          {
            error: `Unsupported league code '${league}'. Supported leagues: ${Object.keys(DIVISION_MAP).join(', ')}, BSA`,
          },
          { status: 400 }
        );
      }

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
      // Apostrophes in names like M'gladbach and Nott'm Forest are parsed cleanly
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
        if (!rawHome || !rawAway) continue;

        const rawDate = row['Date']?.trim();
        const rawTime = row['Time']?.trim() || null;

        // Date validation: skip row if date is invalid (never default to now)
        const isoKickoff = parseLondonCsvDateTime(rawDate, rawTime);
        if (!isoKickoff) {
          continue; // Skip invalid date row
        }

        // Team identity: resolve through aliases, never auto-create from slugified name
        const homeResolved = await resolveTeamName(rawHome, unmatchedNames);
        const awayResolved = await resolveTeamName(rawAway, unmatchedNames);

        if (!homeResolved || !awayResolved) {
          // Skip match if either team has no resolved foreign key
          continue;
        }

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

        // Odds snapshots
        const hOdds = parseFloat(row['B365H'] || row['AvgH'] || row['PSH']);
        const dOdds = parseFloat(row['B365D'] || row['AvgD'] || row['PSD']);
        const aOdds = parseFloat(row['B365A'] || row['AvgA'] || row['PSA']);

        if (!isNaN(hOdds) && hOdds >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: row['B365H'] ? 'Bet365' : 'MarketAvg',
            market_code: '1X2_HOME',
            selection: `${homeResolved.shortName} Win`,
            decimal_odds: hOdds,
            source: `football-data.co.uk:${season}`,
          });
        }
        if (!isNaN(dOdds) && dOdds >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: row['B365D'] ? 'Bet365' : 'MarketAvg',
            market_code: '1X2_DRAW',
            selection: 'Draw',
            decimal_odds: dOdds,
            source: `football-data.co.uk:${season}`,
          });
        }
        if (!isNaN(aOdds) && aOdds >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: row['B365A'] ? 'Bet365' : 'MarketAvg',
            market_code: '1X2_AWAY',
            selection: `${awayResolved.shortName} Win`,
            decimal_odds: aOdds,
            source: `football-data.co.uk:${season}`,
          });
        }

        const o25Odds = parseFloat(row['Avg>2.5'] || row['B365>2.5'] || row['P>2.5']);
        const u25Odds = parseFloat(row['Avg<2.5'] || row['B365<2.5'] || row['P<2.5']);
        if (!isNaN(o25Odds) && o25Odds >= 1.01) {
          oddsSnapshots.push({
            match_id: providerId,
            bookmaker: 'MarketAvg',
            market_code: 'TOTAL_GOALS_O25',
            selection: 'Over 2.5 Goals',
            decimal_odds: o25Odds,
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
            source: `football-data.co.uk:${season}`,
          });
        }
      }
    }

    // 5. Upsert matches and odds into Store / Supabase
    // Creates the teams rows first so foreign keys cannot fail
    // In production, confirms writes to Supabase and fails loudly if unconfigured or on error
    const upsertResult = await matchesStore.upsertMatches(matches, oddsSnapshots);

    const sortedDates = matches.map(m => m.kickoff_time).sort();
    const earliestDate = sortedDates[0] || null;
    const latestDate = sortedDates[sortedDates.length - 1] || null;

    const unmatchedList = Array.from(unmatchedNames).sort();

    return NextResponse.json({
      success: true,
      league,
      season,
      sourceUsed,
      rowsFetched: upsertResult.fetched,
      rowsInserted: upsertResult.inserted,
      earliestDate,
      latestDate,
      oddsSnapshotsCount: oddsSnapshots.length,
      unmatchedNamesCount: unmatchedList.length,
      unmatchedNames: unmatchedList,
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
