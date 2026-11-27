import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  applyPaystackPaymentRecord,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystackService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const secret = resolvePaystackSecretKey();
  if (!secret) {
    return NextResponse.json(
      { error: 'Paystack webhook secret is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature') || '';
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Paystack signature header.' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const expectedHash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedHash, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json(
      { error: 'Invalid Paystack webhook signature.' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const event = String(payload?.event || '');
  const data = payload?.data || {};
  const reference = String(data?.reference || '').trim();
  if (!reference) {
    return NextResponse.json({ error: 'Missing payment reference.' }, { status: 400 });
  }

  const status =
    event === 'charge.success' ? 'success' : String(data?.status || event || 'pending');

  try {
    const result = await applyPaystackPaymentRecord({
      reference,
      userId: data?.metadata?.user_id ? String(data.metadata.user_id) : null,
      customerEmail: data?.customer?.email ? String(data.customer.email) : null,
      planRaw: data?.metadata?.plan || data?.plan?.name || 'pro',
      amountKobo: Number(data?.amount) || 0,
      currency: String(data?.currency || 'NGN'),
      status,
      channel: data?.channel ? String(data.channel) : 'paystack',
      paidAt: data?.paid_at ? String(data.paid_at) : null,
      durationDays: Number(data?.metadata?.duration_days || 30),
      metadata: payload,
    });

    return NextResponse.json({ received: true, reference, status: result.status, applied: result.applied });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to persist Paystack webhook event.' },
      { status: 503 }
    );
  }
}
