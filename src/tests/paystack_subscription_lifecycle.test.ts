import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  TIER_RULES,
  PLAN_PERIOD_DAYS,
  MS_PER_DAY,
  formatNaira,
  formatMonthlyPrice,
  calculateProToPremiumUpgradeQuote,
  getPaidRenewalBannerState,
} from '../lib/tiers';
import {
  getPaystackPlanSettings,
  computeCheckoutQuoteForProfile,
  verifyPaystackWebhookSignature,
  sanitizePaystackPayload,
  createPendingCheckoutRecord,
  applyPaystackPaymentRecord,
  getRawProfileSubscriptionState,
  scheduleDowngradeForUser,
  cancelPendingDowngradeForUser,
  setCancelAtPeriodEndForUser,
  listUserPaymentHistory,
} from '../lib/payments/paystackService';
import {
  getAdminUserDetail,
  updateAdminUser,
} from '../lib/admin/adminService';
import {
  buildServerAuthSessionFromUserAndProfile,
  type ServerAuthSession,
} from '../lib/supabase/serverAuth';
import { getLocalDatabase } from '../lib/supabase/client';
import { POST as paystackWebhookPOST } from '../app/api/webhooks/paystack/route';

function signPaystackPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

function makeFakeAdminSession(id: string, email: string): ServerAuthSession {
  return buildServerAuthSessionFromUserAndProfile(
    { id, email, email_confirmed_at: '2026-01-01T00:00:00.000Z' },
    {
      id,
      email,
      displayName: 'Test Admin',
      role: 'admin',
      tier: 'premium',
      tierExpiresAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      emailConfirmed: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
  );
}

async function runTests() {
  console.log('=== PAYSTACK SUBSCRIPTION LIFECYCLE & PRICING VERIFICATION ===');

  // 1. Single source of truth pricing checks
  assert.strictEqual(TIER_RULES.pro.monthlyPriceNgn, 500);
  assert.strictEqual(TIER_RULES.pro.amountKobo, 50000);
  assert.strictEqual(TIER_RULES.pro.periodDays, 30);
  assert.strictEqual(formatMonthlyPrice('pro'), '₦500/month');

  assert.strictEqual(TIER_RULES.premium.monthlyPriceNgn, 2500);
  assert.strictEqual(TIER_RULES.premium.amountKobo, 250000);
  assert.strictEqual(TIER_RULES.premium.periodDays, 30);
  assert.strictEqual(formatMonthlyPrice('premium'), '₦2,500/month');

  assert.strictEqual(getPaystackPlanSettings('pro').amountKobo, 50000);
  assert.strictEqual(getPaystackPlanSettings('premium').amountKobo, 250000);
  assert.strictEqual(formatNaira(2333), '₦2,333');
  console.log('[PASS] Single source of truth NGN pricing: Pro=₦500/month (50000 kobo), Premium=₦2,500/month (250000 kobo)');

  // 2. Pro -> Premium proration verification for 0, 10, 20, and 30 days remaining
  const baseNowMs = Date.UTC(2026, 5, 1, 12, 0, 0);
  const prorationCases = [
    { days: 0, expectedCharge: 2500, expectedCredit: 0 },
    { days: 10, expectedCharge: 2333, expectedCredit: 167 },
    { days: 20, expectedCharge: 2167, expectedCredit: 333 },
    { days: 30, expectedCharge: 2000, expectedCredit: 500 },
  ];

  for (const tc of prorationCases) {
    const expIso =
      tc.days === 0
        ? new Date(baseNowMs - 1000).toISOString()
        : new Date(baseNowMs + tc.days * MS_PER_DAY).toISOString();
    const quote = calculateProToPremiumUpgradeQuote({
      tierExpiresAt: expIso,
      nowMs: baseNowMs,
    });
    assert.strictEqual(
      quote.chargeNgn,
      tc.expectedCharge,
      `Expected ${tc.days}d remaining to charge ${tc.expectedCharge} NGN, got ${quote.chargeNgn}`
    );
    assert.strictEqual(quote.chargeKobo, tc.expectedCharge * 100);
    assert.strictEqual(quote.creditNgn, tc.expectedCredit);
    console.log(
      `[PRORATION ${String(tc.days).padStart(2, ' ')}d remaining] Charge = ${formatNaira(quote.chargeNgn)} (${quote.chargeKobo} kobo), Credit = ${formatNaira(quote.creditNgn)}`
    );
  }

  // 3. Admin blocking & renewal banner state checks
  const adminQuote = computeCheckoutQuoteForProfile(
    { role: 'admin', tier: 'premium', tierExpiresAt: null },
    'pro',
    baseNowMs
  );
  assert.strictEqual(adminQuote.allowed, false);
  assert.strictEqual(adminQuote.mode, 'admin_blocked');

  const banner6d = getPaidRenewalBannerState({
    entitlementStatus: 'paid',
    tier: 'pro',
    tierExpiresAt: new Date(baseNowMs + 6 * MS_PER_DAY).toISOString(),
    cancelAtPeriodEnd: false,
    isAdmin: false,
    nowMs: baseNowMs,
  });
  assert.strictEqual(banner6d.showRenewButton, false);
  assert.strictEqual(banner6d.showRenewalBanner, false);

  const banner5d = getPaidRenewalBannerState({
    entitlementStatus: 'paid',
    tier: 'pro',
    tierExpiresAt: new Date(baseNowMs + 5 * MS_PER_DAY).toISOString(),
    cancelAtPeriodEnd: false,
    isAdmin: false,
    nowMs: baseNowMs,
  });
  assert.strictEqual(banner5d.showRenewButton, true);
  assert.strictEqual(banner5d.showRenewalBanner, false);

  const banner3d = getPaidRenewalBannerState({
    entitlementStatus: 'paid',
    tier: 'pro',
    tierExpiresAt: new Date(baseNowMs + 3 * MS_PER_DAY).toISOString(),
    cancelAtPeriodEnd: false,
    isAdmin: false,
    nowMs: baseNowMs,
  });
  assert.strictEqual(banner3d.showRenewButton, true);
  assert.strictEqual(banner3d.showRenewalBanner, true);
  assert.strictEqual(banner3d.tone, 'amber');

  const bannerCancelled = getPaidRenewalBannerState({
    entitlementStatus: 'paid',
    tier: 'pro',
    tierExpiresAt: new Date(baseNowMs + 2 * MS_PER_DAY).toISOString(),
    cancelAtPeriodEnd: true,
    isAdmin: false,
    nowMs: baseNowMs,
  });
  assert.strictEqual(bannerCancelled.showRenewalBanner, false);
  console.log('[PASS] Renewal button (<=5d), amber banner (<=3d), and admin/cancel guardrails');

  // 4. Card data sanitization verification
  const dirtyWebhook = {
    event: 'charge.success',
    data: {
      reference: 'ref_test_sanitize',
      amount: 50000,
      currency: 'NGN',
      authorization: {
        authorization_code: 'AUTH_secret123',
        last4: '4081',
        bin: '408408',
        exp_month: '12',
        exp_year: '2030',
        card_type: 'visa',
        reusable: true,
        bank: 'TEST BANK',
        signature: 'SIG_xyz',
      },
      customer: { email: 'user@example.com' },
      metadata: { plan: 'pro', user_id: 'u1' },
    },
  };
  const cleanedWebhook = sanitizePaystackPayload(dirtyWebhook)!;
  const serializedCleaned = JSON.stringify(cleanedWebhook);
  assert.strictEqual(cleanedWebhook.data.authorization, undefined);
  assert(!serializedCleaned.includes('4081'));
  assert(!serializedCleaned.includes('AUTH_secret123'));
  assert(!serializedCleaned.includes('last4'));
  assert.strictEqual(cleanedWebhook.data.reference, 'ref_test_sanitize');
  console.log('[PASS] Card/authorization data stripped cleanly from raw_webhook');

  // 5. Full Paystack TEST mode + DB + webhook lifecycle tests
  const db = getLocalDatabase();
  assert(db, 'Local SQLite database must be available for lifecycle tests');

  const prevSecret = process.env.PAYSTACK_SECRET_KEY;
  const testSecret = 'sk_test_calibrall_verification_key';
  process.env.PAYSTACK_SECRET_KEY = testSecret;

  const adminId = 'test-paystack-admin-9001';
  const userId = 'test-paystack-user-9002';
  const userEmail = 'paystack-lifecycle@calibrall.app';
  const adminSession = makeFakeAdminSession(adminId, 'paystack-admin@calibrall.app');

  try {
    db.prepare(`DELETE FROM admin_audit_log WHERE target_user_id IN (?, ?) OR admin_id = ?`).run(
      adminId,
      userId,
      adminId
    );
    db.prepare(`DELETE FROM paystack_payments WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM profiles WHERE id IN (?, ?)`).run(adminId, userId);

    const createdAtIso = new Date().toISOString();
    const expiredTrialEndIso = new Date(Date.now() - 2 * MS_PER_DAY).toISOString();
    db.prepare(
      `INSERT INTO profiles (id, email, display_name, role, tier, created_at) VALUES (?, ?, 'Paystack Admin', 'admin', 'premium', ?)`
    ).run(adminId, 'paystack-admin@calibrall.app', createdAtIso);

    db.prepare(
      `INSERT INTO profiles (id, email, display_name, role, tier, trial_started_at, trial_ends_at, created_at) VALUES (?, ?, 'Paystack Tester', 'user', 'free', ?, ?, ?)`
    ).run(userId, userEmail, '2026-01-01T00:00:00.000Z', expiredTrialEndIso, createdAtIso);

    // 5a. Forged webhook without valid signature -> rejected 401
    const forgedPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'forged_ref_001',
        amount: 50000,
        currency: 'NGN',
        customer: { email: userEmail },
        metadata: { user_id: userId, plan: 'pro' },
      },
    });
    const forgedRes = await paystackWebhookPOST(
      new Request('http://localhost:3000/api/webhooks/paystack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': 'deadbeef0000bad',
        },
        body: forgedPayload,
      })
    );
    assert.strictEqual(forgedRes.status, 401, 'Forged webhook must return HTTP 401');
    const afterForged = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterForged?.tier, 'free', 'Forged webhook must not alter tier');
    console.log('[PASS] Forged Paystack webhook rejected (HTTP 401), tier untouched');

    // 5b. New payment for Pro (50,000 kobo, 30 days)
    const proRef = `test_pro_new_${Date.now()}`;
    const t0 = Date.now();
    const proQuote = computeCheckoutQuoteForProfile(afterForged!, 'pro', t0);
    assert.strictEqual(proQuote.mode, 'new');
    assert.strictEqual(proQuote.amountKobo, 50000);
    await createPendingCheckoutRecord({
      reference: proRef,
      userId,
      email: userEmail,
      plan: 'pro',
      quote: proQuote,
    });

    const proWebhookBody = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: proRef,
        amount: 50000,
        currency: 'NGN',
        channel: 'card',
        paid_at: new Date(t0).toISOString(),
        customer: { email: userEmail },
        authorization: {
          last4: '4081',
          bin: '408408',
          card_type: 'visa',
          reusable: true,
          authorization_code: 'AUTH_should_not_be_saved',
        },
        metadata: {
          user_id: userId,
          plan: 'pro',
          duration_days: PLAN_PERIOD_DAYS,
          expected_amount_kobo: 50000,
        },
      },
    });

    const validProRes = await paystackWebhookPOST(
      new Request('http://localhost:3000/api/webhooks/paystack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': signPaystackPayload(proWebhookBody, testSecret),
        },
        body: proWebhookBody,
      })
    );
    assert.strictEqual(validProRes.status, 200);
    const validProJson = await validProRes.json();
    assert.strictEqual(validProJson.applied, true);
    assert.strictEqual(validProJson.alreadyProcessed, false);

    const afterPro = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterPro?.tier, 'pro');
    assert(afterPro?.tierExpiresAt, 'Pro expiry must be set');
    const firstProExpiryMs = Date.parse(afterPro!.tierExpiresAt!);
    assert(Math.abs(firstProExpiryMs - (t0 + 30 * MS_PER_DAY)) < 5000);

    // Check raw_webhook has NO card fields
    const savedProPayment = (await getAdminUserDetail(userId)).payments.find(
      (p) => p.reference === proRef
    );
    assert(savedProPayment?.rawWebhook, 'raw_webhook must be saved');
    assert(!JSON.stringify(savedProPayment!.rawWebhook).includes('4081'));
    assert(!JSON.stringify(savedProPayment!.rawWebhook).includes('AUTH_should_not_be_saved'));
    console.log('[PASS] New Pro payment activated for 30 days & card fields stripped from raw_webhook');

    // 5c. Duplicate webhook delivery for same reference -> idempotent, expiry does NOT extend twice
    const dupRes = await paystackWebhookPOST(
      new Request('http://localhost:3000/api/webhooks/paystack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': signPaystackPayload(proWebhookBody, testSecret),
        },
        body: proWebhookBody,
      })
    );
    assert.strictEqual(dupRes.status, 200);
    const dupJson = await dupRes.json();
    assert.strictEqual(dupJson.applied, false);
    assert.strictEqual(dupJson.alreadyProcessed, true);
    const afterDup = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterDup?.tierExpiresAt, afterPro?.tierExpiresAt);
    console.log('[PASS] Duplicate webhook delivery is idempotent; expiry unchanged');

    // 5d. Same-plan renewal before expiry extends from current expiry
    const renewRef = `test_pro_renew_${Date.now()}`;
    const renewQuote = computeCheckoutQuoteForProfile(afterDup!, 'pro', t0 + 1000);
    assert.strictEqual(renewQuote.mode, 'renewal');
    assert.strictEqual(renewQuote.amountKobo, 50000);
    const renewRes = await applyPaystackPaymentRecord({
      reference: renewRef,
      userId,
      customerEmail: userEmail,
      planRaw: 'pro',
      amountKobo: 50000,
      currency: 'NGN',
      status: 'success',
      durationDays: 30,
      nowMs: t0 + 1000,
    });
    assert.strictEqual(renewRes.applied, true);
    const afterRenew = await getRawProfileSubscriptionState(userId);
    const renewedExpiryMs = Date.parse(afterRenew!.tierExpiresAt!);
    assert.strictEqual(
      renewedExpiryMs,
      firstProExpiryMs + 30 * MS_PER_DAY,
      'Same-plan renewal must extend from current expiry'
    );
    console.log('[PASS] Same-plan renewal extended from current expiry (+30 days)');

    // 5e. Pro -> Premium upgrade with ~10 days remaining
    const simulated10dExpiry = new Date(Date.now() + 10 * MS_PER_DAY).toISOString();
    await updateAdminUser(adminSession, userId, {
      action: 'set_expiry',
      customDate: simulated10dExpiry,
      note: 'Set 10 days left to test upgrade proration',
    });
    const prof10d = await getRawProfileSubscriptionState(userId);
    const upgradeNowMs = Date.now();
    const upgradeQuote = computeCheckoutQuoteForProfile(prof10d!, 'premium', upgradeNowMs);
    assert.strictEqual(upgradeQuote.mode, 'upgrade');
    assert.strictEqual(upgradeQuote.amountNgn, 2333);
    assert.strictEqual(upgradeQuote.creditNgn, 167);

    const upgradeRef = `test_upgrade_prem_${Date.now()}`;
    await createPendingCheckoutRecord({
      reference: upgradeRef,
      userId,
      email: userEmail,
      plan: 'premium',
      quote: upgradeQuote,
    });
    const upgradeRes = await applyPaystackPaymentRecord({
      reference: upgradeRef,
      userId,
      customerEmail: userEmail,
      planRaw: 'premium',
      amountKobo: upgradeQuote.amountKobo,
      currency: 'NGN',
      status: 'success',
      durationDays: 30,
      nowMs: upgradeNowMs,
    });
    assert.strictEqual(upgradeRes.applied, true);
    const afterUpgrade = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterUpgrade?.tier, 'premium');
    assert.strictEqual(afterUpgrade?.tierExpiresAt, new Date(upgradeNowMs + 30 * MS_PER_DAY).toISOString());
    console.log('[PASS] Pro -> Premium upgrade applied credit (₦2,333 due, ₦167 credit) & set expiry to now + 30d');

    // 5f. Failed / abandoned payment leaves user's tier and expiry unchanged
    const failedRef = `test_failed_${Date.now()}`;
    const failedRes = await applyPaystackPaymentRecord({
      reference: failedRef,
      userId,
      customerEmail: userEmail,
      planRaw: 'premium',
      amountKobo: 250000,
      currency: 'NGN',
      status: 'failed',
      channel: 'card',
    });
    assert.strictEqual(failedRes.applied, false);
    assert.strictEqual(failedRes.status, 'failed');
    const afterFailed = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterFailed?.tier, 'premium');
    assert.strictEqual(afterFailed?.tierExpiresAt, afterUpgrade?.tierExpiresAt);
    console.log('[PASS] Failed payment recorded in history without altering tier or expiry');

    // 5g. Cancel renewal & Resume flow
    const cancelRes = await setCancelAtPeriodEndForUser(userId, true);
    assert.strictEqual(cancelRes.cancelAtPeriodEnd, true);
    const afterCancel = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterCancel?.cancelAtPeriodEnd, true);
    const cancelDetail = await getAdminUserDetail(userId);
    assert.strictEqual(cancelDetail.user.accessStatus, 'paid', 'Cancelled plan stays active until expiry');

    const resumeRes = await setCancelAtPeriodEndForUser(userId, false);
    assert.strictEqual(resumeRes.cancelAtPeriodEnd, false);
    const afterResume = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterResume?.cancelAtPeriodEnd, false);
    console.log('[PASS] Cancel / Resume renewal flow verified');

    // 5h. Schedule Downgrade (Premium -> Pro), cancel pending change, re-schedule, simulate expiry -> auto-applies
    const dow1 = await scheduleDowngradeForUser(userId, 'pro');
    assert.strictEqual(dow1.pendingTier, 'pro');
    assert.strictEqual(dow1.pendingTierEffectiveAt, afterUpgrade?.tierExpiresAt);

    await cancelPendingDowngradeForUser(userId);
    const afterCancelDow = await getRawProfileSubscriptionState(userId);
    assert.strictEqual(afterCancelDow?.pendingTier, null);

    // Re-schedule downgrade and backdate expiry via Admin Panel (audit-logged!)
    await scheduleDowngradeForUser(userId, 'pro');
    const pastExpiryIso = new Date(Date.now() - 60_000).toISOString();
    const adminBackdateRes = await updateAdminUser(adminSession, userId, {
      action: 'set_expiry',
      customDate: pastExpiryIso,
      note: 'Simulate period end for downgrade test',
    });
    assert.strictEqual(adminBackdateRes.user.tier, 'pro', 'Pending downgrade must auto-apply to pro at expiry');
    assert.strictEqual(adminBackdateRes.user.pendingTier, null, 'pending_tier must clear after auto-apply');
    assert.strictEqual(adminBackdateRes.user.accessStatus, 'expired', 'No free uncharged days after expiry and no trial restart');
    assert.strictEqual(adminBackdateRes.auditLog.action, 'USER_EXPIRY_UPDATED');

    // Admin direct edit of subscription flags is also audit logged
    const adminFlagRes = await updateAdminUser(adminSession, userId, {
      action: 'set_subscription_flags',
      pendingTier: null,
      cancelAtPeriodEnd: true,
      note: 'Admin updated lifecycle flags in test',
    });
    assert.strictEqual(adminFlagRes.user.cancelAtPeriodEnd, true);
    assert.strictEqual(adminFlagRes.auditLog.action, 'USER_SUBSCRIPTION_UPDATED');

    // Payment history receipts check
    const receipts = await listUserPaymentHistory(userId, 20);
    assert(receipts.length >= 4, 'Expected receipts for pro, renew, upgrade, and failed payment');
    console.log('[PASS] Downgrade scheduled, cancelled, re-scheduled & auto-applied at simulated expiry + admin audit log verified');

    console.log('ALL PAYSTACK SUBSCRIPTION LIFECYCLE TESTS PASSED');
  } finally {
    if (prevSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = prevSecret;

    db.prepare(`DELETE FROM admin_audit_log WHERE target_user_id IN (?, ?) OR admin_id = ?`).run(
      adminId,
      userId,
      adminId
    );
    db.prepare(`DELETE FROM paystack_payments WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM profiles WHERE id IN (?, ?)`).run(adminId, userId);
  }
}

runTests().catch((err) => {
  console.error('PAYSTACK LIFECYCLE TEST FAILED:', err);
  process.exit(1);
});
