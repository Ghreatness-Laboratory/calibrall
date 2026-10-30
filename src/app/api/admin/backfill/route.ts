import { NextRequest, NextResponse } from 'next/server';
import { matchesStore, StoredMatch, StoredOddsSnapshot } from '@/lib/data/matchesStore';
import { lookupTeamStrength } from '@/lib/data/teamDatabase';
import { displayName } from '@/lib/utils/formatText';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DIVISION_MAP: Record<string, string> = {
  PL: 'E0',
  PD: 'SP1',
  BL1: 'D1',
  SA: 'I1',
  FL1: 'F1',
  DED: 'N1',
};

function parseDateToISO(dateStr: string, timeStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return new Date().toISOString();

  let [d, m, y] = parts;
  if (y.length === 2) {
    y = parseInt(y, 10) > 50 ? `19${y}` : `20${y}`;
  }
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  const time = timeStr && timeStr.includes(':') ? `${timeStr.trim()}:00Z` : '15:00:00Z';

  return `${y}-${month}-${day}T${time}`;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(req: NextRequest) {
  // 1. Authenticate with ADMIN_SECRET header
  const adminSecret =
    req.headers.get('admin_secret') ||
    req.headers.get('x-admin-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  const validSecret =
    process.env.ADMIN_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.REVALIDATE_SECRET?.trim() ||
    'calibrall_secret_2026';

  if (!adminSecret || adminSecret !== validSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing ADMIN_SECRET header.' },
      { status: 401 }
    );
  }

  // 2. Extract parameters
  const url = new URL(req.url);
  const league = (url.searchParams.get('league') || 'SA').toUpperCase().trim();
  const season = (url.searchParams.get('season') || '2425').trim();

  const matches: StoredMatch[] = [];
  const oddsSnapshots: StoredOddsSnapshot[] = [];
  let sourceUsed = 'football-data.co.uk';

  try {
    // 3. Option A: Brazil Série A extra-league CSV file
    if (league === 'BSA') {
      const csvRes = await fetch('https://football-data.co.uk/new/BRA.csv', {
        headers: { 'User-Agent': 'Calibrall/1.0' },
        cache: 'no-store',
      });

      if (!csvRes.ok) {
        throw new Error(`Failed to fetch Brazil CSV from football-data.co.uk: HTTP ${csvRes.status}`);
      }

      const csvText = await csvRes.text();
      const lines = csvText.split('\n').filter(l => l.trim().length > 0);
      if (lines.length <= 1) {
        throw new Error('Empty Brazil CSV response');
      }

      const header = parseCSVLine(lines[0]);
      const idxSeason = header.indexOf('Season');
      const idxDate = header.indexOf('Date');
      const idxTime = header.indexOf('Time');
      const idxHome = header.indexOf('Home');
      const idxAway = header.indexOf('Away');
      const idxHG = header.indexOf('HG');
      const idxAG = header.indexOf('AG');
      const idxRes = header.indexOf('Res');
      const idxAvgH = header.indexOf('AvgCH') !== -1 ? header.indexOf('AvgCH') : header.indexOf('PSCH');
      const idxAvgD = header.indexOf('AvgCD') !== -1 ? header.indexOf('AvgCD') : header.indexOf('PSCD');
      const idxAvgA = header.indexOf('AvgCA') !== -1 ? header.indexOf('AvgCA') : header.indexOf('PSCA');

      // Match target season: e.g. "2024" if season="2425" or "2024"
      const targetSeasonYear = season.length === 4 && season.startsWith('20')
        ? season
        : season === '2425' ? '2024'
        : season === '2324' ? '2023'
        : season === '2223' ? '2022'
        : season === '2122' ? '2021'
        : season === '2021' ? '2020'
        : season === '1920' ? '2019'
        : '2024';

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 8) continue;
        const rowSeason = cols[idxSeason]?.trim();
        if (rowSeason !== targetSeasonYear) continue;

        const rawHome = cols[idxHome]?.trim();
        const rawAway = cols[idxAway]?.trim();
        if (!rawHome || !rawAway) continue;

        const homeLookup = lookupTeamStrength(rawHome);
        const awayLookup = lookupTeamStrength(rawAway);

        const homeTeamId = homeLookup?.data?.id || `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const awayTeamId = awayLookup?.data?.id || `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const homeTeamName = homeLookup?.data?.name || rawHome;
        const awayTeamName = awayLookup?.data?.name || rawAway;

        const rawDate = cols[idxDate];
        const rawTime = idxTime !== -1 ? cols[idxTime] : '16:00';
        const isoKickoff = parseDateToISO(rawDate, rawTime);

        const hg = parseInt(cols[idxHG], 10);
        const ag = parseInt(cols[idxAG], 10);
        const isFinished = !isNaN(hg) && !isNaN(ag);

        const cleanDateStr = rawDate.replace(/\//g, '');
        const providerId = `fdco_bra_${targetSeasonYear}_${cleanDateStr}_${homeTeamId}_${awayTeamId}`;

        matches.push({
          id: providerId,
          provider_id: providerId,
          competition_code: 'BSA',
          season: season,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          home_team_name: homeTeamName,
          away_team_name: awayTeamName,
          kickoff_time: isoKickoff,
          status: isFinished ? 'FINISHED' : 'SCHEDULED',
          home_score: isFinished ? hg : null,
          away_score: isFinished ? ag : null,
          source: 'football-data.co.uk:brazil',
        });

        // Parse odds if present
        if (idxAvgH !== -1 && idxAvgD !== -1 && idxAvgA !== -1) {
          const oddH = parseFloat(cols[idxAvgH]);
          const oddD = parseFloat(cols[idxAvgD]);
          const oddA = parseFloat(cols[idxAvgA]);
          if (!isNaN(oddH) && oddH >= 1.01) {
            oddsSnapshots.push({
              match_id: providerId,
              bookmaker: 'MarketAvg',
              market_code: '1X2_HOME',
              selection: `${homeLookup?.data?.shortName || displayName(homeTeamName)} Win`,
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
              selection: `${awayLookup?.data?.shortName || displayName(awayTeamName)} Win`,
              decimal_odds: oddA,
              source: 'football-data.co.uk:brazil',
            });
          }
        }
      }
    } else {
      // 4. Option B: European Leagues CSV (PL, PD, BL1, SA, FL1, DED)
      const divCode = DIVISION_MAP[league] || 'I1';
      const csvUrl = `https://football-data.co.uk/mmz4281/${season}/${divCode}.csv`;

      const csvRes = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Calibrall/1.0' },
        cache: 'no-store',
      });

      if (!csvRes.ok) {
        throw new Error(`Failed to fetch ${league} CSV for season ${season} from ${csvUrl}: HTTP ${csvRes.status}`);
      }

      const csvText = await csvRes.text();
      const lines = csvText.split('\n').filter(l => l.trim().length > 0);
      if (lines.length <= 1) {
        throw new Error(`Empty CSV file returned for ${league} ${season}`);
      }

      const header = parseCSVLine(lines[0]);
      const idxDate = header.indexOf('Date');
      const idxTime = header.indexOf('Time');
      const idxHome = header.indexOf('HomeTeam');
      const idxAway = header.indexOf('AwayTeam');
      const idxFTHG = header.indexOf('FTHG');
      const idxFTAG = header.indexOf('FTAG');
      const idxHTHG = header.indexOf('HTHG');
      const idxHTAG = header.indexOf('HTAG');
      const idxHC = header.indexOf('HC');
      const idxAC = header.indexOf('AC');
      const idxHY = header.indexOf('HY');
      const idxAY = header.indexOf('AY');
      const idxHR = header.indexOf('HR');
      const idxAR = header.indexOf('AR');
      const idxHS = header.indexOf('HS');
      const idxAS = header.indexOf('AS');
      const idxHST = header.indexOf('HST');
      const idxAST = header.indexOf('AST');

      // Odds columns
      const idxB365H = header.indexOf('B365H');
      const idxB365D = header.indexOf('B365D');
      const idxB365A = header.indexOf('B365A');
      const idxAvgO25 = header.indexOf('Avg>2.5') !== -1 ? header.indexOf('Avg>2.5') : header.indexOf('B365>2.5');
      const idxAvgU25 = header.indexOf('Avg<2.5') !== -1 ? header.indexOf('Avg<2.5') : header.indexOf('B365<2.5');

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 6) continue;

        const rawHome = cols[idxHome]?.trim();
        const rawAway = cols[idxAway]?.trim();
        if (!rawHome || !rawAway) continue;

        const homeLookup = lookupTeamStrength(rawHome);
        const awayLookup = lookupTeamStrength(rawAway);

        const homeTeamId = homeLookup?.data?.id || `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const awayTeamId = awayLookup?.data?.id || `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const homeTeamName = homeLookup?.data?.name || rawHome;
        const awayTeamName = awayLookup?.data?.name || rawAway;

        const rawDate = cols[idxDate];
        const rawTime = idxTime !== -1 ? cols[idxTime] : '15:00';
        const isoKickoff = parseDateToISO(rawDate, rawTime);

        const fthg = parseInt(cols[idxFTHG], 10);
        const ftag = parseInt(cols[idxFTAG], 10);
        const isFinished = !isNaN(fthg) && !isNaN(ftag);

        const cleanDateStr = rawDate.replace(/\//g, '');
        const providerId = `fdco_${league.toLowerCase()}_${season}_${cleanDateStr}_${homeTeamId}_${awayTeamId}`;

        matches.push({
          id: providerId,
          provider_id: providerId,
          competition_code: league,
          season: season,
          matchday: Math.floor(i / 10) + 1,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          home_team_name: homeTeamName,
          away_team_name: awayTeamName,
          kickoff_time: isoKickoff,
          status: isFinished ? 'FINISHED' : 'SCHEDULED',
          home_score: isFinished ? fthg : null,
          away_score: isFinished ? ftag : null,
          home_half_time_score: idxHTHG !== -1 && !isNaN(parseInt(cols[idxHTHG], 10)) ? parseInt(cols[idxHTHG], 10) : null,
          away_half_time_score: idxHTAG !== -1 && !isNaN(parseInt(cols[idxHTAG], 10)) ? parseInt(cols[idxHTAG], 10) : null,
          home_corners: idxHC !== -1 && !isNaN(parseInt(cols[idxHC], 10)) ? parseInt(cols[idxHC], 10) : null,
          away_corners: idxAC !== -1 && !isNaN(parseInt(cols[idxAC], 10)) ? parseInt(cols[idxAC], 10) : null,
          home_yellow_cards: idxHY !== -1 && !isNaN(parseInt(cols[idxHY], 10)) ? parseInt(cols[idxHY], 10) : null,
          away_yellow_cards: idxAY !== -1 && !isNaN(parseInt(cols[idxAY], 10)) ? parseInt(cols[idxAY], 10) : null,
          home_red_cards: idxHR !== -1 && !isNaN(parseInt(cols[idxHR], 10)) ? parseInt(cols[idxHR], 10) : null,
          away_red_cards: idxAR !== -1 && !isNaN(parseInt(cols[idxAR], 10)) ? parseInt(cols[idxAR], 10) : null,
          home_shots: idxHS !== -1 && !isNaN(parseInt(cols[idxHS], 10)) ? parseInt(cols[idxHS], 10) : null,
          away_shots: idxAS !== -1 && !isNaN(parseInt(cols[idxAS], 10)) ? parseInt(cols[idxAS], 10) : null,
          home_shots_on_target: idxHST !== -1 && !isNaN(parseInt(cols[idxHST], 10)) ? parseInt(cols[idxHST], 10) : null,
          away_shots_on_target: idxAST !== -1 && !isNaN(parseInt(cols[idxAST], 10)) ? parseInt(cols[idxAST], 10) : null,
          source: `football-data.co.uk:${divCode}`,
        });

        // Odds snapshots
        if (idxB365H !== -1 && idxB365D !== -1 && idxB365A !== -1) {
          const hOdds = parseFloat(cols[idxB365H]);
          const dOdds = parseFloat(cols[idxB365D]);
          const aOdds = parseFloat(cols[idxB365A]);
          if (!isNaN(hOdds) && hOdds >= 1.01) {
            oddsSnapshots.push({
              match_id: providerId,
              bookmaker: 'Bet365',
              market_code: '1X2_HOME',
              selection: `${homeLookup?.data?.shortName || displayName(homeTeamName)} Win`,
              decimal_odds: hOdds,
              source: `football-data.co.uk:${season}`,
            });
          }
          if (!isNaN(dOdds) && dOdds >= 1.01) {
            oddsSnapshots.push({
              match_id: providerId,
              bookmaker: 'Bet365',
              market_code: '1X2_DRAW',
              selection: 'Draw',
              decimal_odds: dOdds,
              source: `football-data.co.uk:${season}`,
            });
          }
          if (!isNaN(aOdds) && aOdds >= 1.01) {
            oddsSnapshots.push({
              match_id: providerId,
              bookmaker: 'Bet365',
              market_code: '1X2_AWAY',
              selection: `${awayLookup?.data?.shortName || displayName(awayTeamName)} Win`,
              decimal_odds: aOdds,
              source: `football-data.co.uk:${season}`,
            });
          }
        }

        if (idxAvgO25 !== -1 && idxAvgU25 !== -1) {
          const o25Odds = parseFloat(cols[idxAvgO25]);
          const u25Odds = parseFloat(cols[idxAvgU25]);
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
    }

    // 5. Upsert matches and odds into Store / Supabase
    const upsertResult = await matchesStore.upsertMatches(matches, oddsSnapshots);

    const sortedDates = matches.map(m => m.kickoff_time).sort();
    const earliestDate = sortedDates[0] || null;
    const latestDate = sortedDates[sortedDates.length - 1] || null;

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
      errors: upsertResult.errors,
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
