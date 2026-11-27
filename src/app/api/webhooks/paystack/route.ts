import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getLocalDatabase, isProductionRuntime, persistenceBackendInfo } from '@/lib/supabase/client';
import { getSupabaseServiceClient, normalizeTier } from '@/lib/supabase/serverAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveWebhookSecret(): string {
  return (
    process.env.PAYSTACK_SECRET_KEY?.trim() ||
    process.env.PAYMENT_WEBHOOK_SECRET?.trim() ||
    process.env.PAYMENT_SECRET_KEY?.trim() ||
    ''
  );
}

export async function POST(request: Request) {
  const secret = resolveWebhookSecret();
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

  const customerEmail = data?.customer?.email ? String(data.customer.email).toLowerCase().trim() : null;
  const metaPlan = data?.metadata?.plan || data?.plan?.name || 'pro';
  const normalizedPlan = normalizeTier(metaPlan) === 'premium' ? 'premium' : 'pro';
  const durationDays = Number(data?.metadata?.duration_days || 30);
  const amountKobo = Number(data?.amount) || 0;
  const currency = String(data?.currency || 'NGN').toUpperCase();
  const status = event === 'charge.success' ? 'success' : String(data?.status || event || 'pending');
  const channel = data?.channel ? String(data.channel) : 'paystack';
  const paidAt = data?.paid_at ? String(data.paid_at) : status === 'success' ? new Date().toISOString() : null;
  const nowIso = new Date().toISOString();

  const backend = persistenceBackendInfo();
  const serviceClient = getSupabaseServiceClient();

  if (backend.isRemoteSupabase || serviceClient) {
    if (!serviceClient) {
      return NextResponse.json({ error: backend.message }, { status: 503 });
    }

    let userId: string | null = data?.metadata?.user_id ? String(data.metadata.user_id) : null;
    if (!userId && customerEmail) {
      const { data: prof } = await serviceClient
        .from('profiles')
        .select('id, tier_expires_at')
        .eq('email', customerEmail)
        .maybeSingle();
      if (prof?.id) userId = String(prof.id);
    }

    await serviceClient.from('paystack_payments').upsert(
      {
        user_id: userId,
        email: customerEmail,
        reference,
        plan: normalizedPlan,
        amount_kobo: amountKobo,
        currency,
        status,
        channel,
        is_manual_grant: false,
        paid_at: paidAt,
        metadata: payload,
        created_at: nowIso,
      },
      { onConflict: 'reference' }
    );

    if (status === 'success' && userId) {
      const expiresAt = new Date(Date.now() + Math.max(1, durationDays) * 86_400_000).toISOString();
      await serviceClient
        .from('profiles')
        .update({ tier: normalizedPlan, tier_expires_at: expiresAt })
        .eq('id', userId);
    }

    return NextResponse.json({ received: true, reference, status });
  }

  if (isProductionRuntime()) {
    return NextResponse.json({ error: backend.message }, { status: 503 });
  }

  const db = getLocalDatabase();
  if (!db) {
    return NextResponse.json({ error: 'Local database unavailable.' }, { status: 503 });
  }

  let userId: string | null = data?.metadata?.user_id ? String(data.metadata.user_id) : null;
  if (!userId && customerEmail) {
    const row = db
      .prepare(`SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) LIMIT 1`)
      .get(customerEmail) as { id?: string } | undefined;
    if (row?.id) userId = String(row.id);
  }

  db.prepare(
    `INSERT INTO paystack_payments (
      id, user_id, email, reference, plan, amount_kobo, currency, status, channel,
      is_manual_grant, paid_at, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(reference) DO UPDATE SET
      status = excluded.status,
      amount_kobo = excluded.amount_kobo,
      channel = excluded.channel,
      paid_at = COALESCE(excluded.paid_at, paystack_payments.paid_at),
      metadata = excluded.metadata`
  ).run(
    crypto.randomUUID(),
    userId,
    customerEmail,
    reference,
    normalizedPlan,
    amountKobo,
    currency,
    status,
    channel,
    paidAt,
    JSON.stringify(payload),
    nowIso
  );

  if (status === 'success' && userId) {
    const expiresAt = new Date(Date.now() + Math.max(1, durationDays) * 86_400_000).toISOString();
    db.prepare(`UPDATE profiles SET tier = ?, tier_expires_at = ? WHERE id = ?`).run(
      normalizedPlan,
      expiresAt,
      userId
    );
  }

  return NextResponse.json({ received: true, reference, status });
}
