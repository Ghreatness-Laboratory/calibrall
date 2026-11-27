// CALIBRALL: Provider Quota Budgets, Polling Intervals & League Prioritisation

export type ProviderId =
  | 'football-data'
  | 'sportmonks'
  | 'the-odds-api'
  | 'balldontlie'
  | 'espn_soccer'
  | 'espn_nba';

export type SyncMode = 'live' | 'schedule' | 'full';

export interface ProviderBudgetSpec {
  id: ProviderId;
  name: string;
  sport: 'football' | 'basketball' | 'odds';
  freeQuota: string;
  dailyQuotaLimit: number | null;
  callsPerLiveRefresh: number;
  callsPerScheduleRefresh: number;
  liveRefreshIntervalMinutes: number;
  scheduleRefreshIntervalMinutes: number;
  budgetedCallsPerDay: number;
  beforeCallsPerDayEstimate: string;
  notes: string;
}

export interface SkippedLeagueRecord {
  leagueCode: string;
  leagueName: string;
  tier: 1 | 2 | 3;
  provider: string;
  reason: string;
}

// Basketball live schedule, scoreboard & results sync enabled (NBA, NCAAB D1, EuroLeague)
export const BASKETBALL_SYNC_ENABLED = true;

// Stored fixtures are treated as within SLA until 3 days (72 hours / 4320 minutes) old.
// Error banners are suppressed while stored real fixtures are newer than this limit.
export const FIXTURE_STALE_LIMIT_MINUTES = 4320;

// Exact competitions covered on the free tier
export const FOOTBALL_DATA_ORG_COVERED_CODES = new Set<string>([
  'BSA',
  'ELC',
  'PL',
  'CL',
  'EURO', // Football-Data.org returns code 'EC' for UEFA European Championship (internal id: comp_euro)
  'FL1',
  'BL1',
  'SA',
  'DED',
  'PPL',
  'CLI',
  'PD',
  'WC',
]);

export const SPORTMONKS_FREE_ADDITIONAL_CODES = new Set<string>([
  'SC0', // Scottish Premiership (league_id 501 / 513)
  'DNK', // Danish Superliga (league_id 271 / 1659)
]);

export function hasFreeFixturesCoverage(code: string): {
  hasFreeSource: boolean;
  provider: string | null;
} {
  const upper = code.trim().toUpperCase();
  if (FOOTBALL_DATA_ORG_COVERED_CODES.has(upper)) {
    return { hasFreeSource: true, provider: 'Football-Data.org v4 (Free)' };
  }
  if (SPORTMONKS_FREE_ADDITIONAL_CODES.has(upper)) {
    return { hasFreeSource: true, provider: 'Sportmonks v3 (Free)' };
  }
  return { hasFreeSource: false, provider: null };
}

// Priority Tiers (Tier 1 fetched first; lower tiers skipped first if quota is constrained)
export const TIER_1_LEAGUES = [
  'PL',
  'CL',
  'PD',
  'BL1',
  'SA',
  'FL1',
  'ELC',
  'BSA',
  'DED',
  'PPL',
] as const;

export const TIER_2_LEAGUES = [
  'TSL',
  'SC0',
  'ARG',
  'JPN',
  'MEX',
  'USA',
  'B1',
  'G1',
  'AUT',
  'DNK',
  'NOR',
  'SWE',
  'SWZ',
  'E2',
] as const;

export const TIER_3_LEAGUES = [
  'E3',
  'EC',
  'SP2',
  'D2',
  'I2',
  'F2',
  'SC1',
  'SC2',
  'SC3',
  'CHN',
  'FIN',
  'IRL',
  'POL',
  'ROU',
  'RUS',
] as const;

export function getLeaguePriorityTier(code: string): 1 | 2 | 3 {
  const upper = code.trim().toUpperCase();
  if ((TIER_1_LEAGUES as readonly string[]).includes(upper)) return 1;
  if ((TIER_2_LEAGUES as readonly string[]).includes(upper)) return 2;
  return 3;
}

export function sortLeaguesByPriority<T extends string>(codes: T[]): T[] {
  const priorityIndex = (c: string): number => {
    const upper = c.trim().toUpperCase();
    const i1 = (TIER_1_LEAGUES as readonly string[]).indexOf(upper);
    if (i1 !== -1) return i1;
    const i2 = (TIER_2_LEAGUES as readonly string[]).indexOf(upper);
    if (i2 !== -1) return 100 + i2;
    const i3 = (TIER_3_LEAGUES as readonly string[]).indexOf(upper);
    if (i3 !== -1) return 200 + i3;
    return 999;
  };
  return [...codes].sort((a, b) => priorityIndex(a) - priorityIndex(b));
}

export const PROVIDER_BUDGETS: Record<ProviderId, ProviderBudgetSpec> = {
  'football-data': {
    id: 'football-data',
    name: 'Football-Data.org v4',
    sport: 'football',
    freeQuota: '10 requests/minute (free tier); max 10 days per /v4/matches query window',
    dailyQuotaLimit: 1000,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 2,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 720,
    budgetedCallsPerDay: 4,
    beforeCallsPerDayEstimate: '104/day (15m cron) or 720+/day per visitor + HTTP 400 from 15-day window',
    notes: 'Vercel Hobby daily cron (06:00 UTC) + GitHub Actions evening cron (18:00 UTC), covering -1..+14d in two <=10d chunks (2 calls/run = 4 calls/day).',
  },
  sportmonks: {
    id: 'sportmonks',
    name: 'Sportmonks v3',
    sport: 'football',
    freeQuota: '180 requests/hour per endpoint (free tier covers PL, BL1, SC0, DNK)',
    dailyQuotaLimit: 3000,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 2,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 720,
    budgetedCallsPerDay: 4,
    beforeCallsPerDayEstimate: '100/day (15m fallback) or 720+/day per visitor',
    notes: 'Runs twice daily (Vercel 06:00 UTC + GitHub Actions 18:00 UTC) to supplement Scottish Premiership (SC0) and Danish Superliga (DNK) free-tier fixtures (2 calls/run = 4 calls/day).',
  },
  'the-odds-api': {
    id: 'the-odds-api',
    name: 'The Odds API v4',
    sport: 'odds',
    freeQuota: '500 credits/month (~16 credits/day average ceiling)',
    dailyQuotaLimit: 16,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 8,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 720,
    budgetedCallsPerDay: 16,
    beforeCallsPerDayEstimate: 'Uncapped blind polling of 10 leagues every 6h (up to 40/day) exhausting 500/month in <13 days',
    notes: 'Runs at most twice daily, ordering leagues by upcoming pick count descending and fetching h2h + totals (2 credits/league) ONLY for biggest active leagues with qualified picks (<=16 credits/day).',
  },
  espn_soccer: {
    id: 'espn_soccer',
    name: 'ESPN Soccer Scoreboard',
    sport: 'football',
    freeQuota: 'Retired from scheduled football ingestion (0 calls/day)',
    dailyQuotaLimit: 0,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 0,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 0,
    budgetedCallsPerDay: 0,
    beforeCallsPerDayEstimate: '2,560/day (15m/6h crons) and ~465,120/day per active 120s visitor; failed HTTP 400 on SP2/E3',
    notes: 'Disabled from automated football fixture sync. Covered leagues use Football-Data.org + Sportmonks free tiers; uncovered leagues show stored history only.',
  },
  espn_nba: {
    id: 'espn_nba',
    name: 'ESPN NBA/NCAAB & EuroLeague v2',
    sport: 'basketball',
    freeQuota: 'Public scoreboards + EuroLeague v2 (~14 calls/run twice daily = ~28/day) + 8/day BB Odds cap',
    dailyQuotaLimit: 40,
    callsPerLiveRefresh: 5,
    callsPerScheduleRefresh: 13,
    liveRefreshIntervalMinutes: 720,
    scheduleRefreshIntervalMinutes: 720,
    budgetedCallsPerDay: 28,
    beforeCallsPerDayEstimate: '248/day (15m/6h crons) and ~11,520+/day per active 120s visitor',
    notes: 'Runs inside existing scheduled /api/v1/sync for NBA, NCAAB D1, and EuroLeague (0 visitor calls). Basketball Odds API sub-cap strictly <= 8 credits/day inside shared 500/month cap.',
  },
  balldontlie: {
    id: 'balldontlie',
    name: 'BallDontLie v1',
    sport: 'basketball',
    freeQuota: 'Not used (replaced by hoopR + ESPN + EuroLeague v2)',
    dailyQuotaLimit: 0,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 0,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 0,
    budgetedCallsPerDay: 0,
    beforeCallsPerDayEstimate: '4/day (6h cron)',
    notes: 'Not required; NBA, NCAAB D1, and EuroLeague use hoopR, ESPN scoreboards, and EuroLeague official API v2.',
  },
};

export function getBudgetSummary() {
  const providers = Object.values(PROVIDER_BUDGETS);
  const totalBudgetedCallsPerDay = providers.reduce((acc, p) => acc + p.budgetedCallsPerDay, 0);
  return {
    totalBudgetedCallsPerDay,
    beforeCallsPerDaySingleVisitor: 465120 + 11520, // ESPN Soccer (646*720) + ESPN NBA (16*720)
    beforeCallsPerDayPreviousCron: 104 + 100 + 16 + 2560 + 248 + 4, // 3,032 calls/day before twice-daily migration
    staleLimitMinutes: FIXTURE_STALE_LIMIT_MINUTES,
    tier1Leagues: [...TIER_1_LEAGUES],
    tier2Leagues: [...TIER_2_LEAGUES],
    tier3Leagues: [...TIER_3_LEAGUES],
    providers,
  };
}
