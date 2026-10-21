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

  const validSecret = process.env.REVALIDATE_SECRET || process.env.AUTH_SECRET || 'calibrall_revalidate_secret';

  if (!providedSecret || providedSecret !== validSecret) {
    return NextResponse.json(
      { 
        error: 'Unauthorized', 
        message: 'Missing or invalid revalidation secret in x-revalidate-secret header or Authorization Bearer token.' 
      },
      { status: 401 }
    );
  }

  // Parse optional target pattern or path
  let targetPattern: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    targetPattern = body?.pattern;
  } catch {}

  // 1. Bust server cache
  const deletedEntries = await serverCache.bust(targetPattern);

  // 2. Trigger Next.js framework revalidation across all dynamic pages
  try {
    revalidatePath('/', 'layout');
    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/matches');
    revalidatePath('/predictions');
    revalidatePath('/markets');
  } catch (err: any) {
    console.warn('[Revalidate] revalidatePath warning:', err?.message);
  }

  return NextResponse.json({
    revalidated: true,
    cacheEntriesBusted: deletedEntries,
    timestamp: new Date().toISOString(),
    message: 'Cache successfully busted and framework routes revalidated.',
  });
}
