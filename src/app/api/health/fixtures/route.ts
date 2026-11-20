import { NextResponse } from 'next/server';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getStoredSportFreshness } from '@/lib/data/providerCallLogger';
import { BASKETBALL_SYNC_ENABLED } from '@/lib/data/providerBudget';
import { persistenceBackendInfo } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const persistence = persistenceBackendInfo();

  // Strictly DB-only read path: never triggers external provider API calls on health pings
  const nbaProvider = getNBADataProvider();
  const nbaMatches = await nbaProvider.getFixtures().catch(() => ({
    fixtures: [],
    lastUpdated: 'never',
    lastSyncTimestamp: null,
    isDelayed: true,
    season: '2026-27',
  }));
  const nbaFreshness = await getStoredSportFreshness('basketball');

  let newestNbaKickoff: string | null = null;
  let maxNbaMs = 0;
  (nbaMatches.fixtures || []).forEach(f => {
    const ms = new Date(f.kickoffTime).getTime();
    if (ms > maxNbaMs) {
      maxNbaMs = ms;
      newestNbaKickoff = f.kickoffTime;
    }
  });

  const footballProvider = getFootballDataProvider();
  const footballHealth = await footballProvider.getHealth();
  const footballMatches = await footballProvider.getLiveFixtures().catch(() => ({
    fixtures: [],
    lastUpdated: 'never',
    isDelayed: true,
    skippedLeagues: [],
  }));
  const footballFreshness = await getStoredSportFreshness('football');

  let newestFootballKickoff: string | null = null;
  let maxFootMs = 0;
  (footballMatches.fixtures || []).forEach(f => {
    const ms = new Date(f.kickoffTime).getTime();
    if (ms > maxFootMs) {
      maxFootMs = ms;
      newestFootballKickoff = f.kickoffTime;
    }
  });

  const isFootballHealthy = (footballMatches.fixtures || []).length > 0 && !footballMatches.isDelayed;
  const isBasketballHealthy = !BASKETBALL_SYNC_ENABLED || ((nbaMatches.fixtures || []).length > 0 && !nbaMatches.isDelayed);

  return NextResponse.json(
    {
      status: persistence.backend !== 'misconfigured' && isFootballHealthy && isBasketballHealthy ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      persistence,
      sports: {
        basketball: {
          enabled: BASKETBALL_SYNC_ENABLED,
          lastSyncTime: nbaFreshness.newestUpdatedAt || nbaMatches.lastSyncTimestamp || null,
          lastSyncFormatted: nbaMatches.lastUpdated,
          newestKickoff: newestNbaKickoff,
          rowCount: (nbaMatches.fixtures || []).length,
          providerStatus: BASKETBALL_SYNC_ENABLED ? (nbaFreshness.syncState?.status || 'ONLINE') : 'DISABLED',
          provider: BASKETBALL_SYNC_ENABLED ? (nbaFreshness.syncState?.providerName || 'ESPN NBA Live Scoreboard') : 'Disabled until basketball module is built',
          season: nbaMatches.season,
          isDelayed: BASKETBALL_SYNC_ENABLED ? nbaMatches.isDelayed : false,
          ageMinutes: nbaFreshness.ageMinutes,
        },
        football: {
          lastSyncTime: footballFreshness.newestUpdatedAt || footballHealth.lastSyncTimestamp,
          lastSyncFormatted: footballMatches.lastUpdated,
          newestKickoff: newestFootballKickoff,
          rowCount: (footballMatches.fixtures || []).length,
          providerStatus: footballFreshness.syncState?.status || footballHealth.status,
          provider: footballHealth.providerName,
          isDelayed: footballMatches.isDelayed,
          ageMinutes: footballFreshness.ageMinutes,
          skippedLeaguesCount: (footballMatches.skippedLeagues || []).length,
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
