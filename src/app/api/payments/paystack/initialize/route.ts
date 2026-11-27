import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/supabase/serverAuth';
import {
  getPaystackPlanSettings,
  resolvePaystackSecretKey,
  type PaidPlanId,
} from '@/lib/payments/paystackService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Please log in before subscribing to a plan.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const secret = resolvePaystackSecretKey();
  if (!secret) {
    return NextResponse.json(
      {
        error: 'Paystack checkout is not configured yet in this environment.',
        code: 'PAYSTACK_UNCONFIGURED',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  let body: { plan?: string } = {};
  try {
    body = (await request.json()) as { plan?: string };
  } catch {
    body = {};
  }

  const rawPlan = String(body.plan || '').toLowerCase();
  if (rawPlan !== 'pro' && rawPlan !== 'premium') {
    return NextResponse.json(
      { error: 'Plan must be either pro or premium.' },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const plan: PaidPlanId = rawPlan;
  const settings = getPaystackPlanSettings(plan);
  const reference = `calibrall_${plan}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const reqOrigin = new URL(request.url).origin;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || reqOrigin).replace(/\/+$/, '');
  const callbackUrl = `${baseUrl}/pricing`;

  try {
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: session.user.email,
        amount: settings.amountKobo,
        ...(settings.planCode ? { plan: settings.planCode } : {}),
        reference,
        callback_url: callbackUrl,
        metadata: {
          user_id: session.user.id,
          plan,
          duration_days: settings.durationDays,
        },
      }),
    });

    const json = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !json?.status || !json?.data?.authorization_url) {
      return NextResponse.json(
        { error: json?.message || 'Unable to initialize Paystack checkout.' },
        { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    return NextResponse.json(
      {
        authorizationUrl: String(json.data.authorization_url),
        reference: String(json.data.reference || reference),
        plan,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Paystack initialization failed.' },
      { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
