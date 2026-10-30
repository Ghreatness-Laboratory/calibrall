import { NextRequest, NextResponse } from 'next/server';
import { matchesStore } from '@/lib/data/matchesStore';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const home = url.searchParams.get('home') || '';
  const away = url.searchParams.get('away') || '';
  const asOf = url.searchParams.get('asOf') || undefined;

  if (!home || !away) {
    return NextResponse.json({ error: 'Missing home or away team query parameter' }, { status: 400 });
  }

  try {
    const [homeForm, awayForm, h2h] = await Promise.all([
      matchesStore.getTeamHistoryAndForm(home, asOf),
      matchesStore.getTeamHistoryAndForm(away, asOf),
      matchesStore.getHeadToHeadMeetings(home, away),
    ]);

    return NextResponse.json({
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
