import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/supabase/serverAuth';
import {
  cancelPendingDowngradeForUser,
  computeCheckoutQuoteForProfile,
  getRawProfileSubscriptionState,
  listUserPaymentHistory,
  scheduleDowngradeForUser,
  setCancelAtPeriodEndForUser,
  type PaidPlanId,
} from '@/lib/payments/paystackService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  try {
    const dbProfile = await getRawProfileSubscriptionState(session.user.id).catch(() => null);
    const baseProfile = dbProfile || {
      id: session.user.id,
      email: session.user.email,
      role: session.profile.role,
      tier: session.profile.storedTier ?? session.profile.tier,
      tierExpiresAt: session.profile.tierExpiresAt,
      pendingTier: session.profile.pendingTier ?? null,
      pendingTierEffectiveAt: session.profile.pendingTierEffectiveAt ?? null,
      cancelAtPeriodEnd: Boolean(session.profile.cancelAtPeriodEnd),
    };

    const proQuote = computeCheckoutQuoteForProfile(baseProfile, 'pro');
    const premiumQuote = computeCheckoutQuoteForProfile(baseProfile, 'premium');
    const payments = session.isAdmin ? [] : await listUserPaymentHistory(session.user.id, 50);

    return NextResponse.json(
      {
        isAdmin: session.isAdmin,
        entitlementStatus: session.entitlements.status,
        effectiveTier: session.effectiveTier,
        storedTier: baseProfile.tier,
        tierExpiresAt: baseProfile.tierExpiresAt,
        pendingTier: baseProfile.pendingTier,
        pendingTierEffectiveAt: baseProfile.pendingTierEffectiveAt,
        cancelAtPeriodEnd: baseProfile.cancelAtPeriodEnd,
        quotes: {
          pro: proQuote,
          premium: premiumQuote,
        },
        payments,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load plan details.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  if (session.isAdmin || session.profile.role === 'admin') {
    return NextResponse.json(
      { error: 'Admin: full access accounts do not manage subscription plans.' },
      { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  let body: { action?: string; targetPlan?: string } = {};
  try {
    body = (await request.json()) as { action?: string; targetPlan?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const action = String(body.action || '').trim();

  try {
    if (action === 'schedule_downgrade') {
      const targetTier = String(body.targetPlan || 'pro').toLowerCase();
      if (targetTier !== 'pro') {
        return NextResponse.json({ error: 'Downgrade target must be pro.' }, { status: 400 });
      }
      const res = await scheduleDowngradeForUser(session.user.id, 'pro');
      return NextResponse.json(
        {
          success: true,
          action,
          pendingTier: res.pendingTier,
          pendingTierEffectiveAt: res.pendingTierEffectiveAt,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (action === 'cancel_pending_downgrade') {
      await cancelPendingDowngradeForUser(session.user.id);
      return NextResponse.json(
        { success: true, action, pendingTier: null, pendingTierEffectiveAt: null },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (action === 'cancel_renewal') {
      const res = await setCancelAtPeriodEndForUser(session.user.id, true);
      return NextResponse.json(
        {
          success: true,
          action,
          cancelAtPeriodEnd: res.cancelAtPeriodEnd,
          tierExpiresAt: res.tierExpiresAt,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (action === 'resume_renewal') {
      const res = await setCancelAtPeriodEndForUser(session.user.id, false);
      return NextResponse.json(
        {
          success: true,
          action,
          cancelAtPeriodEnd: res.cancelAtPeriodEnd,
          tierExpiresAt: res.tierExpiresAt,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (action === 'quote') {
      const target = String(body.targetPlan || '').toLowerCase() as PaidPlanId;
      if (target !== 'pro' && target !== 'premium') {
        return NextResponse.json({ error: 'targetPlan must be pro or premium.' }, { status: 400 });
      }
      const dbProfile = await getRawProfileSubscriptionState(session.user.id).catch(() => null);
      const quote = computeCheckoutQuoteForProfile(dbProfile || session.profile, target);
      return NextResponse.json({ success: true, quote }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    return NextResponse.json({ error: 'Unsupported plan action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Plan update failed.' },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
