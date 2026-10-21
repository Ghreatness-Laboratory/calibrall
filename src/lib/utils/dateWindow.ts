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
