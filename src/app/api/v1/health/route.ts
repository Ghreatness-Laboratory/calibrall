import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getFootballDataProvider } from '@/lib/data/provider';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const isProd = process.env.NODE_ENV === 'production';
  const provider = getFootballDataProvider();
  const providerHealth = await provider.getHealth();

  if (isProd && !isSupabaseConfigured) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: 'production',
      error: 'CRITICAL PERSISTENCE FAILURE: Supabase database is not configured in production. Silent in-memory and local mock fallbacks are strictly prohibited.',
      services: {
        database: {
          engine: 'PostgreSQL / Supabase',
          isConfigured: false,
          mode: 'DISCONNECTED',
          error: 'Missing SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY. In production, persistent storage is mandatory.',
        },
        models: {
          dixonColesGoals: 'v2.5.0-online',
          negBinomialCorners: 'v1.8.0-online',
          bookingsDisciplinary: 'v1.2.4-online',
        },
        provider: providerHealth,
      },
    }, { status: 503 });
  }

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        engine: 'PostgreSQL / Supabase',
        isConfigured: isSupabaseConfigured,
        mode: isSupabaseConfigured ? 'CONNECTED' : 'LOCAL_DEV_SEED_MODE',
        notice: isSupabaseConfigured
          ? 'Connected to Supabase PostgreSQL persistent storage'
          : 'Development mode active. In production, unconfigured Supabase will fail loudly with HTTP 503 error.',
      },
      models: {
        dixonColesGoals: 'v2.5.0-online',
        negBinomialCorners: 'v1.8.0-online',
        bookingsDisciplinary: 'v1.2.4-online',
      },
      provider: providerHealth,
    },
  });
}

