import { NextRequest, NextResponse } from 'next/server';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { NBASeason } from '@/lib/data/nbaSeedData';
import { requireApiUser } from '@/lib/supabase/serverAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const seasonParam = (searchParams.get('season') as NBASeason) || '2024-25';
  const forceRefresh = searchParams.get('refresh') === 'true';

  const provider = getNBADataProvider();
  const result = await provider.getTeamAdvancedStats(seasonParam, forceRefresh);

  return NextResponse.json(
    {
      success: true,
      data: result.stats,
      season: result.season,
      source: result.source,
      lastUpdated: result.lastUpdated,
      isLive: result.isLive,
      error: result.error,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
