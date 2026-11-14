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

// Stored fixtures are treated as within SLA until 120 minutes (2 hours) old.
// Error banners are suppressed while stored real fixtures are newer than this limit.
export const FIXTURE_STALE_LIMIT_MINUTES = 120;

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
    freeQuota: '10 requests/minute (authenticated free tier); 50 requests/day unauthenticated; max 10 days per query window',
    dailyQuotaLimit: 1000,
    callsPerLiveRefresh: 1,
    callsPerScheduleRefresh: 2,
    liveRefreshIntervalMinutes: 15,
    scheduleRefreshIntervalMinutes: 360,
    budgetedCallsPerDay: 104,
    beforeCallsPerDayEstimate: '720+ calls/day per visitor (every 120s) + 100% HTTP 400 failure from 15-day window',
    notes: 'Live poll checks [today-1..today+1] (1 call every 15m = 96/day). Schedule splits +2..+14d into two <=10d calls every 6h (8/day).',
  },
  sportmonks: {
    id: 'sportmonks',
    name: 'Sportmonks v3',
    sport: 'football',
    freeQuota: '180 requests/hour per endpoint (~3,000/day free/starter)',
    dailyQuotaLimit: 3000,
    callsPerLiveRefresh: 1,
    callsPerScheduleRefresh: 1,
    liveRefreshIntervalMinutes: 15,
    scheduleRefreshIntervalMinutes: 360,
    budgetedCallsPerDay: 100,
    beforeCallsPerDayEstimate: '720+ calls/day per visitor whenever Football-Data.org failed',
    notes: 'Fallback secondary provider; live poll 1 call/15m (96/day), schedule 1 call/6h (4/day).',
  },
  'the-odds-api': {
    id: 'the-odds-api',
    name: 'The Odds API v4',
    sport: 'odds',
    freeQuota: '500 credits/month (~16 credits/day)',
    dailyQuotaLimit: 16,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 4,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 360,
    budgetedCallsPerDay: 16,
    beforeCallsPerDayEstimate: 'Uncapped if polled per visit; easily exhausts 500/month in <1 day',
    notes: 'Strict daily cap of 16 calls/day (4 Tier-1 leagues every 6h). Tier 2/3 leagues skipped and reported in diagnostics when credits are low.',
  },
  espn_soccer: {
    id: 'espn_soccer',
    name: 'ESPN Soccer Scoreboard',
    sport: 'football',
    freeQuota: 'Public scoreboard endpoint (soft CDN rate limit; budgeted to <=2,500 calls/day)',
    dailyQuotaLimit: 2500,
    callsPerLiveRefresh: 15,
    callsPerScheduleRefresh: 280,
    liveRefreshIntervalMinutes: 15,
    scheduleRefreshIntervalMinutes: 360,
    budgetedCallsPerDay: 2560,
    beforeCallsPerDayEstimate: '~465,120 calls/day per active 120s visitor (38 leagues x 17 requests x 720 refreshes)',
    notes: 'Live cron every 15m only polls leagues with live or near-kickoff matches (<=20 calls/run). Schedule cron every 6h polls +1..+14d prioritising Tier 1 -> Tier 2 -> Tier 3 within daily call budget.',
  },
  espn_nba: {
    id: 'espn_nba',
    name: 'ESPN NBA Scoreboard',
    sport: 'basketball',
    freeQuota: 'Public scoreboard endpoint (budgeted to <=500 calls/day)',
    dailyQuotaLimit: 500,
    callsPerLiveRefresh: 2,
    callsPerScheduleRefresh: 14,
    liveRefreshIntervalMinutes: 15,
    scheduleRefreshIntervalMinutes: 360,
    budgetedCallsPerDay: 248,
    beforeCallsPerDayEstimate: '~11,520+ calls/day per active 120s visitor (16 dates x 720 refreshes)',
    notes: 'Live cron every 15m fetches yesterday + today (2 calls = 192/day). Schedule cron every 6h fetches +1..+14d (14 calls = 56/day).',
  },
  balldontlie: {
    id: 'balldontlie',
    name: 'BallDontLie v1',
    sport: 'basketball',
    freeQuota: '5 requests/minute free tier',
    dailyQuotaLimit: 200,
    callsPerLiveRefresh: 0,
    callsPerScheduleRefresh: 1,
    liveRefreshIntervalMinutes: 0,
    scheduleRefreshIntervalMinutes: 360,
    budgetedCallsPerDay: 4,
    beforeCallsPerDayEstimate: 'Manual / health-check only',
    notes: 'Polled at 6h schedule interval when BALLDONTLIE_API_KEY is configured.',
  },
};

export function getBudgetSummary() {
  const providers = Object.values(PROVIDER_BUDGETS);
  const totalBudgetedCallsPerDay = providers.reduce((acc, p) => acc + p.budgetedCallsPerDay, 0);
  return {
    totalBudgetedCallsPerDay,
    beforeCallsPerDaySingleVisitor: 465120 + 11520, // ESPN Soccer (646*720) + ESPN NBA (16*720)
    staleLimitMinutes: FIXTURE_STALE_LIMIT_MINUTES,
    tier1Leagues: [...TIER_1_LEAGUES],
    tier2Leagues: [...TIER_2_LEAGUES],
    tier3Leagues: [...TIER_3_LEAGUES],
    providers,
  };
}
