// Request-time UTC date window calculation
// Invariant: MUST be computed dynamically at request execution time, NEVER at module load time.

export interface RequestDateWindow {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD (today + 7 days in UTC)
  nowUTC: Date;
  nowIso: string;
  lastUpdatedFormatted: string; // "hh:mm UTC"
}

export function computeRequestDateWindow(): RequestDateWindow {
  const now = new Date();
  
  // Format today as YYYY-MM-DD in UTC
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const dateFrom = `${yyyy}-${mm}-${dd}`;

  // Today + 7 days in UTC
  const future = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
  const fYyyy = future.getUTCFullYear();
  const fMm = String(future.getUTCMonth() + 1).padStart(2, '0');
  const fDd = String(future.getUTCDate()).padStart(2, '0');
  const dateTo = `${fYyyy}-${fMm}-${fDd}`;

  // Current time in UTC formatted as "hh:mm UTC"
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const lastUpdatedFormatted = `${hh}:${min} UTC`;

  return {
    dateFrom,
    dateTo,
    nowUTC: now,
    nowIso: now.toISOString(),
    lastUpdatedFormatted,
  };
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

