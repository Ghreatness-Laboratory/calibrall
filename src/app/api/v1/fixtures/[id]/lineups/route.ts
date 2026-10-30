import { NextRequest, NextResponse } from 'next/server';
import { LiveFootballDataProvider } from '@/lib/data/provider';
import { getFixtureLineupState } from '@/lib/data/lineupsService';
import { forwardPickLedger } from '@/lib/prediction/forwardPickLedger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fixtureId = params.id;
    if (!fixtureId) {
      return NextResponse.json({ error: 'Fixture ID is required' }, { status: 400 });
    }

    const provider = new LiveFootballDataProvider();
    const fixture = await provider.getFixtureById(fixtureId);

    if (!fixture) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
    }

    const lineupState = getFixtureLineupState(fixture);
    const revisions = forwardPickLedger.getPickRevisions(fixture.id);

    return NextResponse.json({
      success: true,
      fixtureId: fixture.id,
      match: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
      kickoffTime: fixture.kickoffTime,
      lineupState,
      revisions,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve fixture lineup state' },
      { status: 500 }
    );
  }
}
