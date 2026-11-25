// CALIBRALL: sportsdataverse hoopR Open Data Source (NBA & NCAAB MBB Parquet)
// Verified repo layout:
// - NBA:   https://github.com/sportsdataverse/hoopR-nba-data/raw/main/nba/schedules/parquet/nba_schedule_{YEAR}.parquet
// - NCAAB: https://github.com/sportsdataverse/hoopR-mbb-data/raw/main/mbb/schedules/parquet/mbb_schedule_{YEAR}.parquet
// Strictly reads schedule files only (no play-by-play, no player box scores).
// Enforces:
// - NBA: season_type in [2, 3, 5] (regular, playoffs, play-in); skips exhibition All-Star non-franchise IDs > 30
// - NCAAB: season_type in [2, 3]; strict Division I vs Division I only (home_conference_id != null && away_conference_id != null && !away_non_div1_team)
// - Never estimates missing half scores (stores null when linescores absent/incomplete)
// - Never guesses unknown team names (returns null from resolveBasketballTeam and logs to unresolved)

import {
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
  parquetSchema,
} from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import {
  BasketballLeague,
  seasonLabelToHoopRYear,
} from '../markets';
import {
  CanonicalBasketballTeam,
  resolveBasketballTeam,
} from '../canonicalTeams';
import {
  BasketballGameStatus,
  BasketballUnresolvedEntry,
  StoredBbGame,
  StoredBbQuarterScores,
} from '../store';

export interface HoopRFetchResult {
  league: 'NBA' | 'NCAAB';
  season: string;
  sourceUrl: string;
  sourceUsed: string;
  rowsRead: number;
  rowsSkipped: number;
  skippedReasons: {
    nonTargetSeasonType: number;
    exhibitionOrNonD1: number;
    missingDateOrId: number;
    unresolvedTeam: number;
  };
  teams: CanonicalBasketballTeam[];
  games: StoredBbGame[];
  unresolvedTeams: BasketballUnresolvedEntry[];
}

const NBA_PARQUET_COLUMNS = [
  'game_id',
  'season_type',
  'game_date',
  'game_date_time',
  'start_date',
  'neutral_site',
  'status_type_name',
  'status_type_completed',
  'format_regulation_periods',
  'home_id',
  'home_display_name',
  'home_location',
  'home_abbreviation',
  'home_score',
  'home_linescores',
  'away_id',
  'away_display_name',
  'away_location',
  'away_abbreviation',
  'away_score',
  'away_linescores',
];

const MBB_PARQUET_COLUMNS = [
  ...NBA_PARQUET_COLUMNS,
  'home_conference_id',
  'away_conference_id',
  'away_non_div1_team',
];

function mapEspnStatus(statusName: unknown, completed: unknown): BasketballGameStatus {
  const s = String(statusName || '').toUpperCase();
  if (s === 'STATUS_FINAL' || completed === true) return 'FINISHED';
  if (s === 'STATUS_POSTPONED') return 'POSTPONED';
  if (s === 'STATUS_CANCELED' || s === 'STATUS_CANCELLED') return 'CANCELED';
  if (s === 'STATUS_HALFTIME' || s === 'STATUS_END_PERIOD') return 'PAUSED';
  if (s === 'STATUS_IN_PROGRESS') return 'IN_PLAY';
  return 'SCHEDULED';
}

function toIsoDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toIsoUtc(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString();
  }
  const str = String(val).trim();
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return null;
}

/**
 * Parses hoopR Python-repr linescores string, e.g.:
 * "[{'value': 25.0, 'displayValue': '25', 'period': 1.0}\n {'value': 22.0, ...}]"
 */
export function parseHoopRLinescores(raw: unknown): Array<{ period: number; value: number }> {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => ({
        period: Math.round(Number(item?.period)),
        value: Math.round(Number(item?.value ?? item?.displayValue)),
      }))
      .filter((x) => Number.isFinite(x.period) && x.period >= 1 && Number.isFinite(x.value));
  }

  const text = String(raw).trim();
  if (!text || text === '[]' || text === 'null' || text === 'None') return [];

  const out: Array<{ period: number; value: number }> = [];
  const dictMatches = text.match(/\{[^}]+\}/g) || [];
  for (const block of dictMatches) {
    const periodMatch = block.match(/'period'\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
    const valueMatch =
      block.match(/'value'\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)/) ||
      block.match(/'displayValue'\s*:\s*'(-?[0-9]+)'/);
    if (periodMatch && valueMatch) {
      const period = Math.round(Number(periodMatch[1]));
      const value = Math.round(Number(valueMatch[1]));
      if (Number.isFinite(period) && period >= 1 && Number.isFinite(value) && value >= 0) {
        out.push({ period, value });
      }
    }
  }
  return out.sort((a, b) => a.period - b.period);
}

export function extractHalfAndQuarterScores(
  league: 'NBA' | 'NCAAB',
  homeLinesRaw: unknown,
  awayLinesRaw: unknown,
  regulationPeriodsRaw: unknown,
  isFinished: boolean
): {
  h1_home: number | null;
  h1_away: number | null;
  ot_periods: number;
  q_scores: StoredBbQuarterScores | null;
} {
  if (!isFinished) {
    return { h1_home: null, h1_away: null, ot_periods: 0, q_scores: null };
  }

  const hLines = parseHoopRLinescores(homeLinesRaw);
  const aLines = parseHoopRLinescores(awayLinesRaw);
  if (hLines.length === 0 || aLines.length === 0) {
    return { h1_home: null, h1_away: null, ot_periods: 0, q_scores: null };
  }

  const regPeriods = Number(regulationPeriodsRaw) || (league === 'NBA' ? 4 : 2);
  const hMap = new Map(hLines.map((x) => [x.period, x.value]));
  const aMap = new Map(aLines.map((x) => [x.period, x.value]));

  let h1_home: number | null = null;
  let h1_away: number | null = null;

  if (league === 'NBA' || regPeriods === 4) {
    const h1 = hMap.get(1);
    const h2 = hMap.get(2);
    const a1 = aMap.get(1);
    const a2 = aMap.get(2);
    if (h1 !== undefined && h2 !== undefined && a1 !== undefined && a2 !== undefined) {
      h1_home = h1 + h2;
      h1_away = a1 + a2;
    }
  } else {
    // NCAAB uses 2 halves
    const h1 = hMap.get(1);
    const a1 = aMap.get(1);
    if (h1 !== undefined && a1 !== undefined) {
      h1_home = h1;
      h1_away = a1;
    }
  }

  const maxPeriod = Math.max(...hLines.map((x) => x.period), ...aLines.map((x) => x.period));
  const ot_periods = maxPeriod > regPeriods ? maxPeriod - regPeriods : 0;

  const hArr: number[] = [];
  const aArr: number[] = [];
  for (let p = 1; p <= maxPeriod; p++) {
    const hv = hMap.get(p);
    const av = aMap.get(p);
    if (hv === undefined || av === undefined) {
      // Incomplete period array — still preserve valid h1 if both half periods were present, omit incomplete q_scores
      return { h1_home, h1_away, ot_periods, q_scores: null };
    }
    hArr.push(hv);
    aArr.push(av);
  }

  return {
    h1_home,
    h1_away,
    ot_periods,
    q_scores: hArr.length > 0 ? { h: hArr, a: aArr } : null,
  };
}

export async function fetchHoopRSeason(
  league: 'NBA' | 'NCAAB',
  season: string
): Promise<HoopRFetchResult> {
  const hoopYear = seasonLabelToHoopRYear(season);
  if (!hoopYear) {
    throw new Error(`Invalid basketball season format '${season}'. Expected YYYY-YY (e.g. 2024-25).`);
  }

  const sourceUrl =
    league === 'NBA'
      ? `https://github.com/sportsdataverse/hoopR-nba-data/raw/main/nba/schedules/parquet/nba_schedule_${hoopYear}.parquet`
      : `https://github.com/sportsdataverse/hoopR-mbb-data/raw/main/mbb/schedules/parquet/mbb_schedule_${hoopYear}.parquet`;

  const sourceUsed = league === 'NBA' ? `hoopr:nba:${hoopYear}` : `hoopr:mbb:${hoopYear}`;
  const providerTag = league === 'NBA' ? 'bb:hoopr_nba' : 'bb:hoopr_ncaab';

  const file = await asyncBufferFromUrl({ url: sourceUrl });
  const metadata = await parquetMetadataAsync(file);
  const availableCols = new Set(parquetSchema(metadata).children.map((c: any) => c.element.name));
  const desiredCols = league === 'NBA' ? NBA_PARQUET_COLUMNS : MBB_PARQUET_COLUMNS;
  const cols = desiredCols.filter((c) => availableCols.has(c));

  const rows = await parquetReadObjects({
    file,
    metadata,
    compressors,
    columns: cols,
  });

  const teamsMap = new Map<string, CanonicalBasketballTeam>();
  const games: StoredBbGame[] = [];
  const unresolvedMap = new Map<string, BasketballUnresolvedEntry>();
  const skippedReasons = {
    nonTargetSeasonType: 0,
    exhibitionOrNonD1: 0,
    missingDateOrId: 0,
    unresolvedTeam: 0,
  };

  const allowedSeasonTypes = league === 'NBA' ? new Set([2, 3, 5]) : new Set([2, 3]);

  const recordUnresolved = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const prev = unresolvedMap.get(key);
    if (prev) {
      prev.count++;
    } else {
      unresolvedMap.set(key, {
        sourceName: clean,
        sourceProvider: providerTag,
        count: 1,
      });
    }
  };

  for (const row of rows as any[]) {
    const seasonType = Number(row.season_type);
    if (!allowedSeasonTypes.has(seasonType)) {
      skippedReasons.nonTargetSeasonType++;
      continue;
    }

    const homeIdNum = Number(row.home_id);
    const awayIdNum = Number(row.away_id);

    if (league === 'NBA') {
      // NBA canonical ESPN franchise IDs are strictly 1..30; >30 are All-Star / exhibition rosters
      if (!Number.isFinite(homeIdNum) || !Number.isFinite(awayIdNum) || homeIdNum < 1 || homeIdNum > 30 || awayIdNum < 1 || awayIdNum > 30) {
        skippedReasons.exhibitionOrNonD1++;
        continue;
      }
    } else {
      // NCAAB: strict Division I vs Division I only
      const hasHomeConf = row.home_conference_id !== null && row.home_conference_id !== undefined && String(row.home_conference_id).trim() !== '';
      const hasAwayConf = row.away_conference_id !== null && row.away_conference_id !== undefined && String(row.away_conference_id).trim() !== '';
      const nonD1Flag = row.away_non_div1_team === true || row.away_non_div1_team === 1 || String(row.away_non_div1_team).toLowerCase() === 'true';
      if (!hasHomeConf || !hasAwayConf || nonD1Flag) {
        skippedReasons.exhibitionOrNonD1++;
        continue;
      }
    }

    const gameId = row.game_id !== null && row.game_id !== undefined ? String(row.game_id).trim() : '';
    const gameDate = toIsoDate(row.game_date) || toIsoDate(row.start_date) || toIsoDate(row.game_date_time);
    if (!gameId || !gameDate) {
      skippedReasons.missingDateOrId++;
      continue;
    }

    const homeNameRaw = String(row.home_display_name || row.home_location || '').trim();
    const awayNameRaw = String(row.away_display_name || row.away_location || '').trim();

    const homeTeam = resolveBasketballTeam(league as BasketballLeague, {
      provider: 'hoopr',
      providerId: row.home_id,
      name: homeNameRaw,
    });
    const awayTeam = resolveBasketballTeam(league as BasketballLeague, {
      provider: 'hoopr',
      providerId: row.away_id,
      name: awayNameRaw,
    });

    if (!homeTeam || !awayTeam) {
      if (!homeTeam && homeNameRaw) recordUnresolved(`${homeNameRaw} (id:${row.home_id})`);
      if (!awayTeam && awayNameRaw) recordUnresolved(`${awayNameRaw} (id:${row.away_id})`);
      skippedReasons.unresolvedTeam++;
      continue;
    }

    teamsMap.set(homeTeam.id, homeTeam);
    teamsMap.set(awayTeam.id, awayTeam);

    const status = mapEspnStatus(row.status_type_name, row.status_type_completed);
    const isFinished = status === 'FINISHED';
    const rawHomeScore = row.home_score !== null && row.home_score !== undefined ? Number(row.home_score) : NaN;
    const rawAwayScore = row.away_score !== null && row.away_score !== undefined ? Number(row.away_score) : NaN;
    const validScores = isFinished && Number.isFinite(rawHomeScore) && Number.isFinite(rawAwayScore);

    const { h1_home, h1_away, ot_periods, q_scores } = extractHalfAndQuarterScores(
      league,
      row.home_linescores,
      row.away_linescores,
      row.format_regulation_periods,
      validScores
    );

    const idPrefix = league === 'NBA' ? 'bbg_nba_' : 'bbg_ncaab_';
    games.push({
      id: `${idPrefix}${gameId}`,
      league,
      season,
      game_date: gameDate,
      kickoff_utc: toIsoUtc(row.game_date_time || row.start_date),
      home_id: homeTeam.id,
      away_id: awayTeam.id,
      neutral: Boolean(row.neutral_site),
      status,
      home_pts: validScores ? Math.round(rawHomeScore) : null,
      away_pts: validScores ? Math.round(rawAwayScore) : null,
      h1_home,
      h1_away,
      ot_periods,
      q_scores,
      source: sourceUsed,
    });
  }

  const rowsSkipped =
    skippedReasons.nonTargetSeasonType +
    skippedReasons.exhibitionOrNonD1 +
    skippedReasons.missingDateOrId +
    skippedReasons.unresolvedTeam;

  return {
    league,
    season,
    sourceUrl,
    sourceUsed,
    rowsRead: rows.length,
    rowsSkipped,
    skippedReasons,
    teams: Array.from(teamsMap.values()),
    games,
    unresolvedTeams: Array.from(unresolvedMap.values()),
  };
}
