// MATCHMIND: Production Environment Audit and Dynamic Base URL Resolver
// Enforces runtime process.env reading, safe Vercel URL detection, and secret-safe logging.

export interface EnvStatus {
  name: string;
  isPresent: boolean;
  isSecret: boolean;
  category: 'football_data' | 'odds' | 'cache' | 'database' | 'revalidation' | 'app_url';
  description: string;
}

export function getBaseUrl(): string {
  // 1. Explicit backend API URL if defined
  if (process.env.BACKEND_API_URL && process.env.BACKEND_API_URL.trim() !== '') {
    return process.env.BACKEND_API_URL.trim().replace(/\/$/, '');
  }

  // 2. Client-facing App URL if defined
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim() !== '') {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, '');
  }

  // 3. Vercel deployment URL (provided automatically in Vercel runtime)
  if (process.env.VERCEL_URL && process.env.VERCEL_URL.trim() !== '') {
    const vUrl = process.env.VERCEL_URL.trim().replace(/\/$/, '');
    return vUrl.startsWith('http') ? vUrl : `https://${vUrl}`;
  }

  // 4. Local development fallback
  return 'http://localhost:3000';
}

let hasLoggedStartupCheck = false;

export function checkAndLogStartupEnv(): void {
  if (hasLoggedStartupCheck) return;
  hasLoggedStartupCheck = true;

  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  // Football API check (at least one required for live fixtures)
  const hasFootballData = Boolean(process.env.FOOTBALL_DATA_API_KEY?.trim());
  const hasSportmonks = Boolean(process.env.SPORTMONKS_API_TOKEN?.trim());
  const hasApiFootball = Boolean(process.env.API_FOOTBALL_KEY?.trim());

  if (!hasFootballData && !hasSportmonks && !hasApiFootball) {
    missingRequired.push('FOOTBALL_DATA_API_KEY (or SPORTMONKS_API_TOKEN / API_FOOTBALL_KEY)');
  }

  // Redis cache check
  if (!process.env.REDIS_URL?.trim()) {
    missingRecommended.push('REDIS_URL');
  }

  // Odds check
  if (!process.env.ODDS_API_KEY?.trim()) {
    missingRecommended.push('ODDS_API_KEY');
  }

  // Revalidate Secret check
  if (!process.env.REVALIDATE_SECRET?.trim()) {
    missingRecommended.push('REVALIDATE_SECRET');
  }

  // Database check
  const hasDb = Boolean(
    process.env.DATABASE_URL?.trim() ||
    ((process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()) && 
     (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || 
      process.env.SUPABASE_ANON_KEY?.trim() || 
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()))
  );
  if (!hasDb) {
    missingRecommended.push('DATABASE_URL or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY/PUBLISHABLE_KEY');
  }

  if (missingRequired.length > 0) {
    console.error(
      `[Startup Check] CRITICAL MISSING ENV VARS (names only): ${missingRequired.join(', ')}. Live data will be unavailable until configured in Vercel settings.`
    );
  }

  if (missingRecommended.length > 0) {
    console.warn(
      `[Startup Check] Missing optional/recommended env vars (names only): ${missingRecommended.join(', ')}.`
    );
  }
}

export function getProductionEnvList(): EnvStatus[] {
  return [
    {
      name: 'FOOTBALL_DATA_API_KEY',
      isPresent: Boolean(process.env.FOOTBALL_DATA_API_KEY?.trim()),
      isSecret: true,
      category: 'football_data',
      description: 'Primary football API key for European fixtures, matchdays, and live scores (Football-Data.org v4)',
    },
    {
      name: 'SPORTMONKS_API_TOKEN',
      isPresent: Boolean(process.env.SPORTMONKS_API_TOKEN?.trim()),
      isSecret: true,
      category: 'football_data',
      description: 'Secondary football API token for in-depth lineups, statistics, and fallback fixtures (Sportmonks v3)',
    },
    {
      name: 'API_FOOTBALL_KEY',
      isPresent: Boolean(process.env.API_FOOTBALL_KEY?.trim()),
      isSecret: true,
      category: 'football_data',
      description: 'Tertiary football data key (API-Football / API-Sports v3)',
    },
    {
      name: 'ODDS_API_KEY',
      isPresent: Boolean(process.env.ODDS_API_KEY?.trim()),
      isSecret: true,
      category: 'odds',
      description: 'Market odds data feed key (The Odds API v4)',
    },
    {
      name: 'REDIS_URL',
      isPresent: Boolean(process.env.REDIS_URL?.trim()),
      isSecret: true,
      category: 'cache',
      description: 'Redis connection string (supports redis:// and rediss:// for TLS e.g. Upstash Redis)',
    },
    {
      name: 'REVALIDATE_SECRET',
      isPresent: Boolean(process.env.REVALIDATE_SECRET?.trim()),
      isSecret: true,
      category: 'revalidation',
      description: 'Secret token used to authenticate POST /api/revalidate requests via x-revalidate-secret header',
    },
    {
      name: 'DATABASE_URL',
      isPresent: Boolean(process.env.DATABASE_URL?.trim()),
      isSecret: true,
      category: 'database',
      description: 'PostgreSQL connection URL for relational storage and tracking logs',
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      isPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()),
      isSecret: false,
      category: 'database',
      description: 'Supabase project endpoint URL',
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      isPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim()),
      isSecret: true,
      category: 'database',
      description: 'Supabase anonymous client API key',
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      isPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()),
      isSecret: true,
      category: 'database',
      description: 'Supabase publishable client API key',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      isPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      isSecret: true,
      category: 'database',
      description: 'Supabase privileged service-role key for server-side persistence',
    },
    {
      name: 'BACKEND_API_URL',
      isPresent: Boolean(process.env.BACKEND_API_URL?.trim()),
      isSecret: false,
      category: 'app_url',
      description: 'Absolute backend API base URL for server-to-server calls and webhooks',
    },
    {
      name: 'NEXT_PUBLIC_APP_URL',
      isPresent: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
      isSecret: false,
      category: 'app_url',
      description: 'Canonical public domain URL (e.g. https://calibrall.vercel.app)',
    },
  ];
}
