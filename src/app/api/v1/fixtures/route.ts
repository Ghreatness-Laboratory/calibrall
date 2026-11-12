import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { isCanonicalCompetitionId, logCompetitionIntegrityError } from '@/lib/data/canonicalCompetitions';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = (searchParams.get('sport') as Sport) || 'football';
  const rawCompetitionId = searchParams.get('competition_id') || undefined;
  const day = searchParams.get('day') || undefined;
  const status = searchParams.get('status') || undefined;
  const fixtureId = searchParams.get('id') || undefined;

  if (sport === 'basketball') {
    const nbaProvider = getNBADataProvider();
    const result = await nbaProvider.getFixtures(status);

    return NextResponse.json(
      {
        sport: 'basketball',
        data: result.fixtures,
        total: result.fixtures.length,
        liveDataAvailable: result.liveDataAvailable,
        lastUpdated: result.lastUpdated,
        isDelayed: result.isDelayed,
        season: result.season,
        filters: { sport, competition_id: 'comp_nba', status: status || 'ALL', day: day || 'ALL' },
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  // Rule 3: Filter by competition_id ONLY, combined with day filter.
  let competitionId: string | undefined = undefined;
  if (rawCompetitionId && rawCompetitionId !== 'ALL') {
    if (!isCanonicalCompetitionId(rawCompetitionId)) {
      logCompetitionIntegrityError('api_query', rawCompetitionId, '/api/v1/fixtures');
      return NextResponse.json(
        {
          sport: 'football',
          data: [],
          total: 0,
          liveDataAvailable: true,
          lastUpdated: new Date().toISOString().slice(11, 16) + ' UTC',
          error: `Rejected non-canonical competition_id: "${rawCompetitionId}".`,
          filters: { sport, competition_id: rawCompetitionId, day: day || 'ALL', status: status || 'ALL' },
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }
    competitionId = rawCompetitionId.trim().toLowerCase();
  }

  // Default: Football
  const provider = getFootballDataProvider();
  const result = await provider.getLiveFixtures({ competitionId, status, day });

  if (fixtureId && (!competitionId || competitionId === 'ALL')) {
    const single = await provider.getFixtureById(fixtureId);
    if (single && !result.fixtures.some(f => f.id === fixtureId)) {
      result.fixtures.unshift(single);
    }
  }

  return NextResponse.json(
    {
      sport: 'football',
      data: result.fixtures,
      total: result.fixtures.length,
      liveDataAvailable: result.liveDataAvailable,
      lastUpdated: result.lastUpdated,
      providerUsed: result.providerUsed,
      failedProvider: result.failedProvider,
      quotaHeaders: result.quotaHeaders,
      error: result.error,
      dateRange: result.dateRange,
      filters: { sport, competition_id: competitionId || 'ALL', day: day || 'ALL', status: status || 'ALL' },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
