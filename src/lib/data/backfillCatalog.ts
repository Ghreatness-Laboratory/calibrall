import { lookupTeamStrength } from './teamDatabase';

// CALIBRALL: Backfill Catalog, Timezone Parser & Idempotent ID Utility

export const DIVISION_MAP: Record<string, string> = {
  PL: 'E0',
  ELC: 'E1',
  E2: 'E2',
  PD: 'SP1',
  BL1: 'D1',
  SA: 'I1',
  FL1: 'F1',
  DED: 'N1',
  P1: 'P1',
  PPL: 'P1',
  T1: 'T1',
  TSL: 'T1',
  SC0: 'SC0',
  SP: 'SC0',
};

// Extra Leagues hosted as single continuous CSV files at https://football-data.co.uk/new/{CODE}.csv
export const EXTRA_LEAGUES_MAP: Record<string, string> = {
  BSA: 'BRA',
  BRA: 'BRA',
  ARG: 'ARG',
  DNK: 'DNK',
  NOR: 'NOR',
  FIN: 'FIN',
  JPN: 'JPN',
};

export interface LeagueMetadata {
  code: string;
  name: string;
  country: string;
  divisionCode: string;
  sourceType: 'seasonal' | 'extra_file';
  hasCorners: boolean;
  hasCards: boolean;
  liveDataSource: string; // e.g. Football-Data.org Free / ESPN / Paid Sportmonks / None
  coverageNotes: string;
}

export const LEAGUE_METADATA: Record<string, LeagueMetadata> = {
  PL: { code: 'PL', name: 'Premier League', country: 'England', divisionCode: 'E0', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards' },
  ELC: { code: 'ELC', name: 'Championship', country: 'England', divisionCode: 'E1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN', coverageNotes: 'Full match stats + corners + cards' },
  E2: { code: 'E2', name: 'League One', country: 'England', divisionCode: 'E2', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org', coverageNotes: 'Full match stats + corners + cards' },
  PD: { code: 'PD', name: 'La Liga', country: 'Spain', divisionCode: 'SP1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards' },
  BL1: { code: 'BL1', name: 'Bundesliga', country: 'Germany', divisionCode: 'D1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards' },
  SA: { code: 'SA', name: 'Serie A', country: 'Italy', divisionCode: 'I1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards' },
  FL1: { code: 'FL1', name: 'Ligue 1', country: 'France', divisionCode: 'F1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards' },
  DED: { code: 'DED', name: 'Eredivisie', country: 'Netherlands', divisionCode: 'N1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org / ESPN', coverageNotes: 'Full match stats + corners + cards' },
  P1: { code: 'P1', name: 'Primeira Liga (Liga Portugal)', country: 'Portugal', divisionCode: 'P1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'Football-Data.org (PPL) / ESPN (por.1)', coverageNotes: 'Full match stats + corners + cards' },
  T1: { code: 'T1', name: 'Süper Lig', country: 'Turkey', divisionCode: 'T1', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Historical CSV has corners + cards; no live data source on standard free plan' },
  SC0: { code: 'SC0', name: 'Scottish Premiership', country: 'Scotland', divisionCode: 'SC0', sourceType: 'seasonal', hasCorners: true, hasCards: true, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Historical CSV has corners + cards; no live data source on standard free plan' },
  BSA: { code: 'BSA', name: 'Campeonato Brasileiro Série A', country: 'Brazil', divisionCode: 'BRA', sourceType: 'extra_file', hasCorners: false, hasCards: false, liveDataSource: 'Football-Data.org (BSA) / ESPN', coverageNotes: 'Scores and 1X2 odds only; NO corners, NO cards in extra file' },
  ARG: { code: 'ARG', name: 'Liga Profesional', country: 'Argentina', divisionCode: 'ARG', sourceType: 'extra_file', hasCorners: false, hasCards: false, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Scores and 1X2 odds only; NO corners, NO cards in extra file' },
  DNK: { code: 'DNK', name: 'Superliga', country: 'Denmark', divisionCode: 'DNK', sourceType: 'extra_file', hasCorners: false, hasCards: false, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Scores and 1X2 odds only; NO corners, NO cards in extra file' },
  NOR: { code: 'NOR', name: 'Eliteserien', country: 'Norway', divisionCode: 'NOR', sourceType: 'extra_file', hasCorners: false, hasCards: false, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Scores and 1X2 odds only; NO corners, NO cards in extra file' },
  FIN: { code: 'FIN', name: 'Veikkausliiga', country: 'Finland', divisionCode: 'FIN', sourceType: 'extra_file', hasCorners: false, hasCards: false, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Scores and 1X2 odds only; NO corners, NO cards in extra file' },
  JPN: { code: 'JPN', name: 'J1 League', country: 'Japan', divisionCode: 'JPN', sourceType: 'extra_file', hasCorners: false, hasCards: false, liveDataSource: 'No live source on free plan (Requires Sportmonks/Custom)', coverageNotes: 'Scores and 1X2 odds only; NO corners, NO cards in extra file' },
};

// Authoritative Backfill Matrix: Seasons 2526 and 2627 (current) included for every league,
// BSA/Extra 2024, 2025, 2026 included, 1920 dropped.
export const SUPPORTED_EUROPEAN_SEASONS = [
  '2021',
  '2122',
  '2223',
  '2324',
  '2425',
  '2526',
  '2627',
] as const;

export const SUPPORTED_BRAZIL_SEASONS = [
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
] as const;

export interface BackfillCallItem {
  league: string;
  season: string;
  division: string;
  description: string;
  hasCorners: boolean;
  hasCards: boolean;
  liveDataSource: string;
  exampleCommand: string;
}

export function generateBackfillCallList(baseUrl: string = 'https://calibrall.vercel.app'): BackfillCallItem[] {
  const calls: BackfillCallItem[] = [];

  const seasonalLeagues = [
    { code: 'PL', name: 'Premier League', div: 'E0' },
    { code: 'ELC', name: 'English Championship', div: 'E1' },
    { code: 'E2', name: 'English League One', div: 'E2' },
    { code: 'PD', name: 'La Liga', div: 'SP1' },
    { code: 'BL1', name: 'Bundesliga', div: 'D1' },
    { code: 'SA', name: 'Serie A', div: 'I1' },
    { code: 'FL1', name: 'Ligue 1', div: 'F1' },
    { code: 'DED', name: 'Eredivisie', div: 'N1' },
    { code: 'P1', name: 'Liga Portugal', div: 'P1' },
    { code: 'T1', name: 'Turkish Süper Lig', div: 'T1' },
    { code: 'SC0', name: 'Scottish Premiership', div: 'SC0' },
  ];

  for (const league of seasonalLeagues) {
    const meta = LEAGUE_METADATA[league.code] || { hasCorners: true, hasCards: true, liveDataSource: 'Configured API' };
    for (const season of SUPPORTED_EUROPEAN_SEASONS) {
      calls.push({
        league: league.code,
        season,
        division: league.div,
        description: `${league.name} ${season} (${season === '2627' ? 'Current In-Play' : 'Completed/Historical'})`,
        hasCorners: meta.hasCorners,
        hasCards: meta.hasCards,
        liveDataSource: meta.liveDataSource,
        exampleCommand: `curl -X POST "${baseUrl}/api/admin/backfill?league=${league.code}&season=${season}" -H "x-admin-secret: $ADMIN_SECRET"`,
      });
    }
  }

  const extraLeagues = [
    { code: 'BSA', name: 'Brazil Série A', div: 'BRA' },
    { code: 'ARG', name: 'Argentina Liga Profesional', div: 'ARG' },
    { code: 'DNK', name: 'Denmark Superliga', div: 'DNK' },
    { code: 'NOR', name: 'Norway Eliteserien', div: 'NOR' },
    { code: 'FIN', name: 'Finland Veikkausliiga', div: 'FIN' },
    { code: 'JPN', name: 'Japan J1 League', div: 'JPN' },
  ];

  for (const league of extraLeagues) {
    const meta = LEAGUE_METADATA[league.code] || { hasCorners: false, hasCards: false, liveDataSource: 'No live source on free plan' };
    for (const season of SUPPORTED_BRAZIL_SEASONS) {
      calls.push({
        league: league.code,
        season,
        division: league.div,
        description: `${league.name} ${season} (${season === '2026' ? 'Current/Upcoming' : 'Historical'})`,
        hasCorners: false,
        hasCards: false,
        liveDataSource: meta.liveDataSource,
        exampleCommand: `curl -X POST "${baseUrl}/api/admin/backfill?league=${league.code}&season=${season}" -H "x-admin-secret: $ADMIN_SECRET"`,
      });
    }
  }

  return calls;
}

/**
 * Sanitizes a raw team name from CSV for deterministic, idempotent provider_id generation.
 * Strips accents, punctuation, and spaces into underscores.
 */
export function sanitizeRawTeamForId(raw: string): string {
  if (!raw) return 'unknown';
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Robust date and Europe/London time parser:
 * 1. Skips invalid dates (never defaults to new Date() or now).
 * 2. If Time column is missing/empty, stores date with a null time (e.g. "YYYY-MM-DD", no 15:00 default).
 * 3. Interprets CSV time as Europe/London (observing GMT/BST) and converts to UTC ISO string.
 */
export function parseLondonCsvDateTime(dateStr: string, timeStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleanDate = dateStr.trim();
  const parts = cleanDate.split('/');
  if (parts.length !== 3) return null;

  let [dStr, mStr, yStr] = parts;
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  let y = parseInt(yStr, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  if (yStr.length === 2) {
    y = y > 50 ? 1900 + y : 2000 + y;
  }
  const day = String(d).padStart(2, '0');
  const month = String(m).padStart(2, '0');
  const year = String(y);

  // If Time column is missing, empty, or lacks colon, store the date with a null time (no 15:00 default)
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.trim() || !timeStr.includes(':')) {
    return `${year}-${month}-${day}`;
  }

  const [hStr, minStr] = timeStr.trim().split(':');
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return `${year}-${month}-${day}`;
  }

  const candidateUtc = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  });
  const partsTz = formatter.formatToParts(candidateUtc);
  const tzPart = partsTz.find(p => p.type === 'timeZoneName')?.value || 'GMT';
  let offsetHours = 0;
  if (tzPart.includes('+')) {
    offsetHours = parseInt(tzPart.split('+')[1], 10) || 0;
  } else if (tzPart.includes('-')) {
    offsetHours = -(parseInt(tzPart.split('-')[1], 10) || 0);
  }

  const actualUtcMs = Date.UTC(y, m - 1, d, hours - offsetHours, minutes, 0);
  return new Date(actualUtcMs).toISOString();
}

/**
 * Brazil Serie A matches from football-data.co.uk (BRA.csv):
 * Kickoff times are frequently missing or inconsistently collated.
 * Official timezone is America/Sao_Paulo (UTC-3), but Calibrall stores Brazil matches
 * strictly date-only (YYYY-MM-DD with null time) to avoid inventing kickoff hours.
 */
export function parseBrazilCsvDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleanDate = dateStr.trim();
  const parts = cleanDate.split('/');
  if (parts.length !== 3) return null;

  let [dStr, mStr, yStr] = parts;
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  let y = parseInt(yStr, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  if (yStr.length === 2) {
    y = y > 50 ? 1900 + y : 2000 + y;
  }
  const day = String(d).padStart(2, '0');
  const month = String(m).padStart(2, '0');
  const year = String(y);

  // Strictly date-only format: YYYY-MM-DD
  return `${year}-${month}-${day}`;
}

export function getCanonicalTeamForCsv(league: string, rawCsvName: string) {
  const cleanName = rawCsvName.trim();
  const lookup = lookupTeamStrength(cleanName);
  if (lookup.found && lookup.data) {
    return {
      id: lookup.data.id,
      name: lookup.data.name,
      shortName: lookup.data.shortName,
      competitionCode: league,
    };
  }
  const sanitized = sanitizeRawTeamForId(cleanName);
  // Shared team identity without division prefix so promoted/relegated clubs share match history
  const canonicalId = `team_${sanitized}`;
  return {
    id: canonicalId,
    name: cleanName,
    shortName: cleanName,
    competitionCode: league,
  };
}
