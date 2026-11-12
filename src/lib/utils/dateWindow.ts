// Request-time UTC date window calculation
// Invariant: MUST be computed dynamically at request execution time, NEVER at module load time.

export interface RequestDateWindow {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD (today + daysAhead in UTC)
  datesList: string[]; // ['YYYYMMDD', ...]
  nowUTC: Date;
  nowIso: string;
  lastUpdatedFormatted: string; // "hh:mm UTC"
}

export function computeRequestDateWindow(daysAhead: number = 14): RequestDateWindow {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Format today as YYYY-MM-DD in UTC
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yyyy = startDate.getUTCFullYear();
  const mm = String(startDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(startDate.getUTCDate()).padStart(2, '0');
  const dateFrom = `${yyyy}-${mm}-${dd}`;

  // Today + daysAhead in UTC
  const future = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead));
  const fYyyy = future.getUTCFullYear();
  const fMm = String(future.getUTCMonth() + 1).padStart(2, '0');
  const fDd = String(future.getUTCDate()).padStart(2, '0');
  const dateTo = `${fYyyy}-${fMm}-${fDd}`;

  const datesList: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const cur = new Date(startDate.getTime() + i * ONE_DAY_MS);
    const cy = cur.getUTCFullYear();
    const cm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const cd = String(cur.getUTCDate()).padStart(2, '0');
    datesList.push(`${cy}${cm}${cd}`);
  }

  // Current time in UTC formatted as "hh:mm UTC"
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const lastUpdatedFormatted = `${hh}:${min} UTC`;

  return {
    dateFrom,
    dateTo,
    datesList,
    nowUTC: now,
    nowIso: now.toISOString(),
    lastUpdatedFormatted,
  };
}

export type DayFilterType = 'ALL' | 'today' | 'tomorrow' | 'weekend';

/**
 * Checks if a fixture kickoffTime matches the selected day filter in UTC.
 */
export function matchesDayFilter(kickoffTime: string, day: DayFilterType | string): boolean {
  if (!day || day === 'ALL') return true;

  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowYmd = tomorrow.toISOString().slice(0, 10);

  const fixDate = new Date(kickoffTime);
  if (isNaN(fixDate.getTime())) return false;
  const fixYmd = fixDate.toISOString().slice(0, 10);

  if (day === 'today') {
    return fixYmd === todayYmd;
  }

  if (day === 'tomorrow') {
    return fixYmd === tomorrowYmd;
  }

  if (day === 'weekend') {
    const dayOfWeek = fixDate.getUTCDay(); // 0 is Sunday, 6 is Saturday
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  return fixYmd === day;
}

export interface NBADateWindow {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  datesList: string[]; // ['20261023', '20261024', ...]
  nowUTC: Date;
  nowIso: string;
  lastUpdatedFormatted: string; // "hh:mm UTC"
}

export function computeNBADateWindow(daysBefore: number = 1, daysAfter: number = 14): NBADateWindow {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Window start in UTC (today - daysBefore)
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBefore));
  const sYyyy = startDate.getUTCFullYear();
  const sMm = String(startDate.getUTCMonth() + 1).padStart(2, '0');
  const sDd = String(startDate.getUTCDate()).padStart(2, '0');
  const dateFrom = `${sYyyy}-${sMm}-${sDd}`;

  // Window end in UTC (today + daysAfter)
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAfter));
  const eYyyy = endDate.getUTCFullYear();
  const eMm = String(endDate.getUTCMonth() + 1).padStart(2, '0');
  const eDd = String(endDate.getUTCDate()).padStart(2, '0');
  const dateTo = `${eYyyy}-${eMm}-${eDd}`;

  // Generate list of date strings for query param (?dates=YYYYMMDD)
  const datesList: string[] = [];
  const totalDays = daysBefore + daysAfter;
  for (let i = 0; i <= totalDays; i++) {
    const cur = new Date(startDate.getTime() + (i * ONE_DAY_MS));
    const cy = cur.getUTCFullYear();
    const cm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const cd = String(cur.getUTCDate()).padStart(2, '0');
    datesList.push(`${cy}${cm}${cd}`);
  }

  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const lastUpdatedFormatted = `${hh}:${min} UTC`;

  return {
    dateFrom,
    dateTo,
    datesList,
    nowUTC: now,
    nowIso: now.toISOString(),
    lastUpdatedFormatted,
  };
}

