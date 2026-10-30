// CALIBRALL: Backfill Catalog, Timezone Parser & Idempotent ID Utility

export const DIVISION_MAP: Record<string, string> = {
  PL: 'E0',
  PD: 'SP1',
  BL1: 'D1',
  SA: 'I1',
  FL1: 'F1',
  DED: 'N1',
};

// Authoritative Backfill Matrix: Seasons 2526 and 2627 (current) included for every league,
// BSA 2025 and 2026 included, 1920 dropped.
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
  exampleCommand: string;
}

export function generateBackfillCallList(baseUrl: string = 'https://calibrall.vercel.app'): BackfillCallItem[] {
  const calls: BackfillCallItem[] = [];

  const euroLeagues = [
    { code: 'PL', name: 'Premier League' },
    { code: 'PD', name: 'La Liga' },
    { code: 'BL1', name: 'Bundesliga' },
    { code: 'SA', name: 'Serie A' },
    { code: 'FL1', name: 'Ligue 1' },
    { code: 'DED', name: 'Eredivisie' },
  ];

  for (const league of euroLeagues) {
    for (const season of SUPPORTED_EUROPEAN_SEASONS) {
      calls.push({
        league: league.code,
        season,
        division: DIVISION_MAP[league.code],
        description: `${league.name} ${season} (${season === '2627' ? 'Current In-Play' : 'Completed/Historical'})`,
        exampleCommand: `curl -X POST "${baseUrl}/api/admin/backfill?league=${league.code}&season=${season}" -H "x-admin-secret: $ADMIN_SECRET"`,
      });
    }
  }

  for (const season of SUPPORTED_BRAZIL_SEASONS) {
    calls.push({
      league: 'BSA',
      season,
      division: 'BRA',
      description: `Brazil Série A ${season} (${season === '2026' ? 'Current/Upcoming' : 'Historical'})`,
      exampleCommand: `curl -X POST "${baseUrl}/api/admin/backfill?league=BSA&season=${season}" -H "x-admin-secret: $ADMIN_SECRET"`,
    });
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

/**
 * Creates canonical team identity from the CSV itself:
 * One canonical team per league and CSV name.
 * Attack/defense ratings, discipline, and sample_matches are left NULL until computed.
 * crest_url is left NULL (no made-up URLs).
 */
export function getCanonicalTeamForCsv(league: string, rawCsvName: string) {
  const cleanName = rawCsvName.trim();
  const sanitized = sanitizeRawTeamForId(cleanName);
  const canonicalId = `team_${league.toLowerCase()}_${sanitized}`;
  return {
    id: canonicalId,
    name: cleanName,
    shortName: cleanName,
    competitionCode: league,
  };
}
