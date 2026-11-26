import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { syncActiveWindowLineups } from '@/lib/data/lineupsService';

export const dynamic = 'force-dynamic';

function constantTimeMatch(provided: string, expected: string): boolean {
  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufB, bufB);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifySyncSecret(req: NextRequest): NextResponse | null {
  const allowedSecrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.ADMIN_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));

  if (allowedSecrets.length === 0) {
    return NextResponse.json(
      { error: 'Service Unavailable: CRON_SECRET or ADMIN_SECRET must be configured.' },
      { status: 503 }
    );
  }

  const provided =
    req.headers.get('x-sync-secret')?.trim() ||
    req.headers.get('x-admin-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';

  if (!provided || !allowedSecrets.some((exp) => constantTimeMatch(provided, exp))) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid sync secret.' },
      { status: 401 }
    );
  }

  return null;
}

export async function POST(req: NextRequest) {
  const authError = verifySyncSecret(req);
  if (authError) return authError;

  try {
    const provider = getFootballDataProvider();
    const liveResult = await provider.getLiveFixtures({ status: 'ALL' });
    const fixtures = liveResult.fixtures || [];

    const syncReport = await syncActiveWindowLineups(fixtures);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      syncReport,
      policy: 'Polling active strictly for fixtures starting within [now, now + 90 mins]. Polling stops immediately upon confirmed lineup flag.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Lineup sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
