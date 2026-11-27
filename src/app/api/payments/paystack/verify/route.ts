import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/supabase/serverAuth';
import {
  applyPaystackPaymentRecord,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystackService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Sign in required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const { searchParams } = new URL(request.url);
  const reference = (searchParams.get('reference') || searchParams.get('trxref') || '').trim();
  if (!reference) {
    return NextResponse.json({ error: 'Payment reference is required.' }, { status: 400 });
  }

  const secret = resolvePaystackSecretKey();
  if (!secret) {
    return NextResponse.json(
      { error: 'Paystack verification is not configured on the server.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  try {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
        cache: 'no-store',
      }
    );

    const json = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !json?.status || !json?.data) {
      return NextResponse.json(
        { error: json?.message || 'Unable to verify Paystack transaction.' },
        { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const data = json.data;
    const txStatus = String(data.status || '').toLowerCase();
    const metaUserId = data?.metadata?.user_id ? String(data.metadata.user_id) : null;
    const customerEmail = data?.customer?.email ? String(data.customer.email).toLowerCase() : null;

    if (
      metaUserId &&
      metaUserId !== session.user.id &&
      customerEmail !== session.user.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'Payment reference does not belong to the signed-in account.' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const applied = await applyPaystackPaymentRecord({
      reference,
      userId: session.user.id,
      customerEmail: customerEmail || session.user.email,
      planRaw: data?.metadata?.plan || data?.plan?.name || 'pro',
      amountKobo: Number(data.amount) || 0,
      currency: String(data.currency || 'NGN'),
      status: txStatus,
      channel: data?.channel ? String(data.channel) : 'paystack',
      paidAt: data?.paid_at ? String(data.paid_at) : null,
      durationDays: Number(data?.metadata?.duration_days || 30),
      metadata: json,
    });

    return NextResponse.json(
      {
        verified: txStatus === 'success',
        reference,
        status: applied.status,
        plan: applied.plan,
        tierExpiresAt: applied.tierExpiresAt,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Payment verification failed.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
