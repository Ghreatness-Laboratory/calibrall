import { NextRequest, NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { matchesStore } from '@/lib/data/matchesStore';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const provider = getFootballDataProvider();
  const fixture = await provider.getFixtureById(params.id);

  if (!fixture) {
    return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
  }

  try {
    const [homeForm, awayForm, h2h] = await Promise.all([
      matchesStore.getTeamHistoryAndForm(fixture.homeTeam.name, fixture.kickoffTime),
      matchesStore.getTeamHistoryAndForm(fixture.awayTeam.name, fixture.kickoffTime),
      matchesStore.getHeadToHeadMeetings(fixture.homeTeam.name, fixture.awayTeam.name),
    ]);

    return NextResponse.json({
      fixtureId: fixture.id,
      competition: fixture.competition.name,
      kickoff: fixture.kickoffTime,
      homeForm,
      awayForm,
      h2h,
      definition: 'History is defined as team form (last 5 & 10 matches with scores, goals for/against, home/away splits, rest days, time-decayed attack and defence strengths). H2H is retained as a secondary feature with low weight.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to compute team form and history', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
