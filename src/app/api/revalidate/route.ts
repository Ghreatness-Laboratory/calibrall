import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { serverCache } from '@/lib/cache/serverCache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Validate secret header (support x-revalidate-secret or Authorization Bearer)
  const headerSecret = req.headers.get('x-revalidate-secret');
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const providedSecret = headerSecret || bearerToken;

  const configuredSecret = process.env.REVALIDATE_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!configuredSecret) {
    console.error(
      '[Revalidate] REVALIDATE_SECRET environment variable is not configured in Vercel settings! Using fallback secret.'
    );
  }
  const validSecret = configuredSecret || 'calibrall_revalidate_secret';

  if (!providedSecret || providedSecret !== validSecret) {
    return NextResponse.json(
      { 
        error: 'Unauthorized', 
        message: 'Missing or invalid revalidation secret in x-revalidate-secret header or Authorization Bearer token.' 
      },
      { status: 401 }
    );
  }

  // Parse optional target pattern or sport
  let targetPattern: string | undefined;
  let sportToClear: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    targetPattern = body?.pattern;
    sportToClear = body?.sport;
  } catch {}

  // Determine cache bust pattern based on sport
  let effectivePattern = targetPattern;
  if (!effectivePattern && sportToClear) {
    if (sportToClear === 'basketball') {
      effectivePattern = 'basketball';
    } else if (sportToClear === 'football') {
      effectivePattern = 'football';
    }
  }

  // 1. Bust server cache
  const deletedEntries = await serverCache.bust(effectivePattern);
  if (sportToClear === 'basketball') {
    await serverCache.bust('nba:');
  }

  // 2. Trigger Next.js framework revalidation across all dynamic pages
  try {
    revalidatePath('/', 'layout');
    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/matches');
    revalidatePath('/predictions');
    revalidatePath('/markets');
    revalidatePath('/performance');
  } catch (err: any) {
    console.warn('[Revalidate] revalidatePath warning:', err?.message);
  }

  return NextResponse.json({
    revalidated: true,
    sportCleared: sportToClear || 'all',
    cacheEntriesBusted: deletedEntries,
    timestamp: new Date().toISOString(),
    message: `Cache successfully busted for ${sportToClear || 'all sports'} and framework routes revalidated.`,
  });
}
