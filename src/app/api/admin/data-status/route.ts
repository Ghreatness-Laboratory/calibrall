import { NextRequest, NextResponse } from 'next/server';
import { matchesStore } from '@/lib/data/matchesStore';
import { verifyAdminSecretHeader } from '@/lib/auth/adminAuth';
import { getAllProviderSyncStates, getStoredSportFreshness } from '@/lib/data/providerCallLogger';
import { getBudgetSummary, SkippedLeagueRecord } from '@/lib/data/providerBudget';
import { getBasketballDataStatus } from '@/lib/basketball/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // 1. Authenticate with ADMIN_SECRET via x-admin-secret header only
  const auth = verifyAdminSecretHeader(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const [report, syncStates, footballFreshness, basketballFreshness, basketballDataStatus] = await Promise.all([
      matchesStore.getDataStatus(),
      getAllProviderSyncStates(),
      getStoredSportFreshness('football'),
      getStoredSportFreshness('basketball'),
      getBasketballDataStatus(),
    ]);

    const skippedMap = new Map<string, SkippedLeagueRecord>();
    for (const st of syncStates) {
      for (const sk of st.skippedLeagues || []) {
        const key = `${sk.provider}:${sk.leagueCode}`;
        if (!skippedMap.has(key)) skippedMap.set(key, sk);
      }
    }

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        ...report,
        basketball: basketballDataStatus,
        providerSyncStates: syncStates,
        skippedLeagues: Array.from(skippedMap.values()),
        providerBudget: getBudgetSummary(),
        fixturesFreshness: {
          football: {
            count: footballFreshness.fixtureCount,
            lastUpdated: footballFreshness.lastUpdatedFormatted,
            ageMinutes: footballFreshness.ageMinutes,
            isStaleBeyondLimit: footballFreshness.isStaleBeyondLimit,
          },
          basketball: {
            count: basketballFreshness.fixtureCount,
            lastUpdated: basketballFreshness.lastUpdatedFormatted,
            ageMinutes: basketballFreshness.ageMinutes,
            isStaleBeyondLimit: basketballFreshness.isStaleBeyondLimit,
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve data status' },
      { status: 500 }
    );
  }
}
