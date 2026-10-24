import { NextResponse } from 'next/server';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { getFootballDataProvider } from '@/lib/data/provider';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const nbaProvider = getNBADataProvider();
  // Ensure NBA fixtures are loaded if not yet synced
  const nbaHealth = nbaProvider.getFixturesHealth();
  if (nbaHealth.rowCount === 0) {
    await nbaProvider.syncLiveFixtures();
  }
  const updatedNbaHealth = nbaProvider.getFixturesHealth();

  // Football status
  const footballProvider = getFootballDataProvider();
  const footballHealth = await footballProvider.getHealth();
  const footballMatches = await footballProvider.getLiveFixtures().catch(() => ({ fixtures: [], lastUpdated: 'N/A' }));

  let newestFootballKickoff: string | null = null;
  let maxFootMs = 0;
  (footballMatches.fixtures || []).forEach(f => {
    const ms = new Date(f.kickoffTime).getTime();
    if (ms > maxFootMs) {
      maxFootMs = ms;
      newestFootballKickoff = f.kickoffTime;
    }
  });

  const isBasketballHealthy = updatedNbaHealth.rowCount > 0 && !updatedNbaHealth.isDelayed;

  return NextResponse.json(
    {
      status: isBasketballHealthy ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      sports: {
        basketball: {
          lastSyncTime: updatedNbaHealth.lastSyncTime,
          lastSyncFormatted: updatedNbaHealth.lastSyncFormatted,
          newestKickoff: updatedNbaHealth.newestKickoff,
          rowCount: updatedNbaHealth.rowCount,
          providerStatus: updatedNbaHealth.providerStatus,
          provider: updatedNbaHealth.provider,
          season: updatedNbaHealth.season,
          isDelayed: updatedNbaHealth.isDelayed,
        },
        football: {
          lastSyncTime: footballHealth.lastSyncTimestamp,
          lastSyncFormatted: footballMatches.lastUpdated,
          newestKickoff: newestFootballKickoff,
          rowCount: (footballMatches.fixtures || []).length,
          providerStatus: footballHealth.status,
          provider: footballHealth.providerName,
        },
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
