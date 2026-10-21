import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getFootballDataProvider } from '@/lib/data/provider';

export async function GET() {
  const provider = getFootballDataProvider();
  const providerHealth = await provider.getHealth();

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
      },
      models: {
        dixonColesGoals: 'v2.4.1-online',
        negBinomialCorners: 'v1.8.0-online',
        bookingsDisciplinary: 'v1.2.4-online',
      },
      provider: providerHealth,
    },
  });
}
