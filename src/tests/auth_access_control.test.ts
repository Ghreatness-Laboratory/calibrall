import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

import { handleAuthMiddleware } from '../middleware';
import {
  buildServerAuthSessionFromUserAndProfile,
  computeEffectiveEntitlements,
  getEntitlements,
  isSafeRedirectPath,
  requireApiUser,
  type ServerAuthSession,
} from '../lib/supabase/serverAuth';
import {
  redactExplanationForTier,
  resolveTierFromSession,
  FREE_DAILY_SUMMARY_LIMIT,
} from '../lib/auth/tierAccess';
import { isPublicPagePath, isAdminPagePath, isExpiredAllowedPagePath } from '../lib/auth/routeAccess';
import { verifyAdminSecretHeader } from '../lib/auth/adminAuth';
import { getTrialBannerState, TRIAL_DAYS } from '../lib/tiers';
import { applyPaystackPaymentRecord } from '../lib/payments/paystackService';
import { isDisposableEmail } from '../lib/auth/disposableDomains';

import { GET as getAccount, PATCH as patchAccount, DELETE as deleteAccount } from '../app/api/account/route';
import { GET as getFixtures } from '../app/api/v1/fixtures/route';
import { GET as getFixturePredictions } from '../app/api/v1/fixtures/[id]/predictions/route';
import { GET as getFixtureFactors } from '../app/api/v1/fixtures/[id]/factors/route';
import { GET as getFixtureForm } from '../app/api/v1/fixtures/[id]/form/route';
import { GET as getFixtureLineups } from '../app/api/v1/fixtures/[id]/lineups/route';
import { GET as getBatchForm } from '../app/api/v1/fixtures/form/route';
import { GET as getCompetitions } from '../app/api/v1/competitions/route';
import { GET as getTodayPredictions } from '../app/api/v1/predictions/today/route';
import { GET as getPerformanceSummary } from '../app/api/v1/performance/summary/route';
import { GET as getMonitoring } from '../app/api/v1/monitoring/route';
import { GET as getNbaStats } from '../app/api/v1/nba/stats/route';
import { POST as postLineupsSync } from '../app/api/v1/lineups/sync/route';
import { POST as postSync } from '../app/api/v1/sync/route';

import { GET as getAdminOverview } from '../app/api/admin/overview/route';
import { GET as getAdminUsers } from '../app/api/admin/users/route';
import { GET as getAdminUserDetailRoute, PATCH as patchAdminUserRoute } from '../app/api/admin/users/[id]/route';
import { POST as postAdminPwReset } from '../app/api/admin/users/[id]/password-reset/route';
import { GET as getAdminAuditLog } from '../app/api/admin/audit-log/route';
import { GET as getAdminPayments, POST as postAdminPayments } from '../app/api/admin/payments/route';
import { GET as getAdminPicks } from '../app/api/admin/picks/route';
import { PATCH as patchAdminPick } from '../app/api/admin/picks/[id]/route';
import { POST as postAdminSync } from '../app/api/admin/sync/route';
import { GET as getAdminHealth } from '../app/api/admin/system-health/route';

import { getLocalDatabase } from '../lib/supabase/client';
import {
  getAdminOverview as getAdminOverviewSvc,
  listAdminUsers,
  getAdminUserDetail,
  updateAdminUser,
  listAuditLogs,
  listAdminPayments,
  recordManualGrant,
  getAdminSystemHealth,
  AdminServiceError,
} from '../lib/admin/adminService';

function makeNextRequest(urlPath: string, headers?: Record<string, string>, method = 'GET'): NextRequest {
  const url = `http://localhost:3000${urlPath}`;
  return new NextRequest(url, {
    method,
    headers: new Headers(headers || {}),
  });
}

function makeFakeSession(overrides: {
  id?: string;
  email?: string;
  role?: 'user' | 'admin';
  tier?: 'free' | 'pro' | 'premium';
  tierExpiresAt?: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  emailConfirmed?: boolean;
}): ServerAuthSession {
  const role = overrides.role ?? 'user';
  const tier = overrides.tier ?? 'free';
  const tierExpiresAt = overrides.tierExpiresAt ?? null;
  const id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  const email = overrides.email ?? 'member@example.com';
  const now = Date.now();
  const trialStartedAt =
    overrides.trialStartedAt !== undefined
      ? overrides.trialStartedAt
      : new Date(now).toISOString();
  const trialEndsAt =
    overrides.trialEndsAt !== undefined
      ? overrides.trialEndsAt
      : new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
  const emailConfirmed = overrides.emailConfirmed ?? true;

  return buildServerAuthSessionFromUserAndProfile(
    { id, email },
    {
      id,
      email,
      displayName: 'Test Member',
      role,
      tier,
      tierExpiresAt,
      trialStartedAt,
      trialEndsAt,
      emailConfirmed,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
  );
}

async function runTests() {
  console.log('--- STARTING AUTH, RBAC & RLS HARDENING TEST SUITE ---');

  // -------------------------------------------------------------------------
  // 1. VISITOR (UNAUTHENTICATED) TESTS
  // -------------------------------------------------------------------------
  console.log('\n[1] Testing VISITOR (unauthenticated) access controls...');

  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/terms',
    '/privacy',
    '/about',
  ];

  for (const route of publicRoutes) {
    assert.strictEqual(isPublicPagePath(route), true, `${route} must be public`);
    const res = await handleAuthMiddleware(makeNextRequest(route), {
      getSession: async () => null,
    });
    assert.strictEqual(res.status, 200, `Visitor GET ${route} must allow access (200), got ${res.status}`);
  }
  console.log(`  PASS: All ${publicRoutes.length} public routes allow visitor access.`);

  const protectedRoutes = [
    '/fixtures',
    '/fixtures?league=EPL',
    '/matches',
    '/matches/fix_123',
    '/predictions',
    '/picks',
    '/markets',
    '/performance',
    '/record',
    '/saved',
    '/settings',
    '/pricing',
    '/creators',
    '/methodology',
  ];

  for (const route of protectedRoutes) {
    const res = await handleAuthMiddleware(makeNextRequest(route), {
      getSession: async () => null,
    });
    assert.strictEqual(res.status, 307, `Visitor GET ${route} must redirect (307), got ${res.status}`);
    const loc = res.headers.get('location') || '';
    const locUrl = new URL(loc);
    assert.strictEqual(locUrl.pathname, '/login', `Visitor redirect for ${route} must go to /login`);
    assert.strictEqual(
      locUrl.searchParams.get('next'),
      route,
      `Visitor redirect for ${route} must preserve next param`
    );
  }
  console.log(`  PASS: All ${protectedRoutes.length} protected user routes redirect visitors to /login?next=...`);

  // Visitors hitting /admin/* get 404 (not redirect)
  for (const adminRoute of ['/admin', '/admin/backfill', '/admin/users/some-id']) {
    assert.strictEqual(isAdminPagePath(adminRoute), true);
    const res = await handleAuthMiddleware(makeNextRequest(adminRoute), {
      getSession: async () => null,
    });
    assert.strictEqual(res.status, 404, `Visitor GET ${adminRoute} must return 404, got ${res.status}`);
  }
  console.log('  PASS: Visitors requesting /admin/* receive HTTP 404.');

  // Ensure API routes return 401 JSON for unauthenticated callers even with spoofed tier headers/cookies
  const spoofHeaders = {
    'x-calibrall-tier': 'premium',
    cookie: 'calibrall_tier=premium',
  };

  const apiChecks: Array<{ name: string; run: () => Promise<Response> }> = [
    { name: 'GET /api/account', run: () => getAccount(new Request('http://localhost:3000/api/account', { headers: spoofHeaders })) },
    { name: 'PATCH /api/account', run: () => patchAccount(new Request('http://localhost:3000/api/account', { method: 'PATCH', headers: spoofHeaders, body: JSON.stringify({ displayName: 'Hacker', role: 'admin', tier: 'premium' }) })) },
    { name: 'DELETE /api/account', run: () => deleteAccount(new Request('http://localhost:3000/api/account', { method: 'DELETE', headers: spoofHeaders, body: JSON.stringify({ confirm: 'DELETE' }) })) },
    { name: 'GET /api/v1/fixtures', run: () => getFixtures(new Request('http://localhost:3000/api/v1/fixtures', { headers: spoofHeaders })) },
    { name: 'GET /api/v1/fixtures/[id]/predictions', run: () => getFixturePredictions(new Request('http://localhost:3000/api/v1/fixtures/fix_1/predictions', { headers: spoofHeaders }), { params: { id: 'fix_1' } }) },
    { name: 'GET /api/v1/fixtures/[id]/factors', run: () => getFixtureFactors(new Request('http://localhost:3000/api/v1/fixtures/fix_1/factors', { headers: spoofHeaders }), { params: { id: 'fix_1' } }) },
    { name: 'GET /api/v1/fixtures/[id]/form', run: () => getFixtureForm(new Request('http://localhost:3000/api/v1/fixtures/fix_1/form', { headers: spoofHeaders }), { params: { id: 'fix_1' } }) },
    { name: 'GET /api/v1/fixtures/[id]/lineups', run: () => getFixtureLineups(new Request('http://localhost:3000/api/v1/fixtures/fix_1/lineups', { headers: spoofHeaders }), { params: { id: 'fix_1' } }) },
    { name: 'GET /api/v1/fixtures/form', run: () => getBatchForm(new Request('http://localhost:3000/api/v1/fixtures/form?teamIds=a,b', { headers: spoofHeaders })) },
    { name: 'GET /api/v1/competitions', run: () => getCompetitions(new Request('http://localhost:3000/api/v1/competitions', { headers: spoofHeaders })) },
    { name: 'GET /api/v1/predictions/today', run: () => getTodayPredictions(new Request('http://localhost:3000/api/v1/predictions/today', { headers: spoofHeaders })) },
    { name: 'GET /api/v1/performance/summary', run: () => getPerformanceSummary(new Request('http://localhost:3000/api/v1/performance/summary', { headers: spoofHeaders })) },
    { name: 'GET /api/v1/monitoring', run: () => getMonitoring(new Request('http://localhost:3000/api/v1/monitoring', { headers: spoofHeaders })) },
    { name: 'GET /api/v1/nba/stats', run: () => getNbaStats(new Request('http://localhost:3000/api/v1/nba/stats', { headers: spoofHeaders })) },
  ];

  for (const check of apiChecks) {
    const res = await check.run();
    assert.strictEqual(res.status, 401, `${check.name} must return 401 for visitor, got ${res.status}`);
  }
  console.log(`  PASS: All ${apiChecks.length} authenticated API endpoints reject visitors with HTTP 401 (ignoring spoofed headers/cookies).`);

  // Cron/Sync routes fail closed without CRON_SECRET / ADMIN_SECRET
  const lineupsSyncRes = await postLineupsSync(makeNextRequest('/api/v1/lineups/sync', undefined, 'POST'));
  assert([401, 503].includes(lineupsSyncRes.status), `lineups/sync must fail closed without secret, got ${lineupsSyncRes.status}`);

  const syncRes = await postSync(new Request('http://localhost:3000/api/v1/sync', { method: 'POST' }));
  assert([401, 503].includes(syncRes.status), `/api/v1/sync must fail closed without secret, got ${syncRes.status}`);
  console.log('  PASS: Sync/cron endpoints fail closed (401/503) without valid secret.');

  // -------------------------------------------------------------------------
  // 2. FREE USER TESTS
  // -------------------------------------------------------------------------
  console.log('\n[2] Testing FREE USER session, entitlements & /admin protection...');

  const freeSession = makeFakeSession({ role: 'user', tier: 'free' });
  assert.strictEqual(freeSession.isAdmin, false);
  assert.strictEqual(freeSession.effectiveTier, 'free');
  assert.strictEqual(freeSession.isExpired, false);
  assert.strictEqual(resolveTierFromSession(freeSession), 'free');

  for (const userRoute of ['/fixtures', '/matches', '/predictions', '/markets', '/performance', '/saved', '/settings', '/pricing']) {
    const res = await handleAuthMiddleware(makeNextRequest(userRoute), {
      getSession: async () => freeSession,
    });
    assert.strictEqual(res.status, 200, `Free user GET ${userRoute} must be allowed (200), got ${res.status}`);
  }

  // Free user blocked from /admin/* with HTTP 404
  for (const adminRoute of ['/admin', '/admin/backfill', '/admin/users/test-id']) {
    assert.strictEqual(isAdminPagePath(adminRoute), true);
    const res = await handleAuthMiddleware(makeNextRequest(adminRoute), {
      getSession: async () => freeSession,
    });
    assert.strictEqual(res.status, 404, `Free user GET ${adminRoute} must return 404, got ${res.status}`);
  }

  // Signed-in user visiting /login or /signup redirects to safe target
  const loginBounce = await handleAuthMiddleware(makeNextRequest('/login?next=/performance'), {
    getSession: async () => freeSession,
  });
  assert.strictEqual(loginBounce.status, 307);
  assert.strictEqual(new URL(loginBounce.headers.get('location') || '').pathname, '/performance');

  // Open redirect safety check
  assert.strictEqual(isSafeRedirectPath('https://evil.example/phish'), '/fixtures');
  assert.strictEqual(isSafeRedirectPath('//evil.example'), '/fixtures');
  assert.strictEqual(isSafeRedirectPath('/login'), '/fixtures');
  assert.strictEqual(isSafeRedirectPath('/fixtures?sport=basketball'), '/fixtures?sport=basketball');

  // Free user explanation redaction (3 daily summaries max)
  const sampleExplanation = {
    oneLineSummary: 'Expect 2.7 total goals.',
    fullSummary: 'Deep model rationale.',
    reasoning: { primaryCase: 'Primary case', whyNotOtherMarket: 'Alt case' },
    alternates: [{ label: 'Alt', note: 'Note' }],
    generatedAt: '2026-11-26T00:00:00Z',
  };
  const freeFirst = redactExplanationForTier(sampleExplanation, 'free', 0)!;
  const freeFourth = redactExplanationForTier(sampleExplanation, 'free', FREE_DAILY_SUMMARY_LIMIT)!;
  assert.strictEqual(freeFirst.tierLocked, true);
  assert.strictEqual(freeFirst.fullSummary, '');
  assert.strictEqual(freeFirst.dailySummaryLimitReached, false);
  assert.strictEqual(freeFourth.dailySummaryLimitReached, true);

  // Expired pro/premium account automatically downgrades to free
  const expiredPro = computeEffectiveEntitlements({
    role: 'user',
    tier: 'premium',
    tierExpiresAt: '2024-01-01T00:00:00.000Z',
  });
  assert.deepStrictEqual(expiredPro, {
    effectiveTier: 'free',
    isExpired: true,
    isAdmin: false,
  });

  const activePro = computeEffectiveEntitlements({
    role: 'user',
    tier: 'pro',
    tierExpiresAt: '2099-01-01T00:00:00.000Z',
  });
  assert.deepStrictEqual(activePro, {
    effectiveTier: 'pro',
    isExpired: false,
    isAdmin: false,
  });

  console.log('  PASS: Free user routes, /admin denial, open-redirect protection, redaction & tier expiry verified.');

  // -------------------------------------------------------------------------
  // 3. ADMIN USER TESTS
  // -------------------------------------------------------------------------
  console.log('\n[3] Testing ADMIN USER entitlements, /admin access & ADMIN_SECRET check...');

  // Admin gets permanent non-expiring premium access even if tier='free' and tierExpiresAt is in the past
  const adminSession = makeFakeSession({
    email: 'owner@calibrall.app',
    role: 'admin',
    tier: 'free',
    tierExpiresAt: '2020-01-01T00:00:00.000Z',
  });
  assert.strictEqual(adminSession.isAdmin, true);
  assert.strictEqual(adminSession.isExpired, false);
  assert.strictEqual(adminSession.effectiveTier, 'premium');
  assert.strictEqual(resolveTierFromSession(adminSession), 'premium');

  const adminFullExplanation = redactExplanationForTier(sampleExplanation, adminSession.effectiveTier, 99)!;
  assert.strictEqual(adminFullExplanation.tierLocked, false);
  assert.strictEqual(adminFullExplanation.fullSummary, 'Deep model rationale.');

  for (const adminRoute of ['/admin', '/admin/backfill']) {
    const res = await handleAuthMiddleware(makeNextRequest(adminRoute), {
      getSession: async () => adminSession,
    });
    assert.strictEqual(res.status, 200, `Admin GET ${adminRoute} must be allowed (200), got ${res.status}`);
  }

  // ADMIN_SECRET header enforcement for API routes
  const prevAdminSecret = process.env.ADMIN_SECRET;
  try {
    const validSecret = 'test-admin-secret-value-at-least-32-chars-long';
    process.env.ADMIN_SECRET = validSecret;
    const badSecret = verifyAdminSecretHeader(makeNextRequest('/api/admin/data-status', { 'x-admin-secret': 'wrong-secret' }));
    assert.strictEqual(badSecret.authorized, false);
    const goodSecret = verifyAdminSecretHeader(makeNextRequest('/api/admin/data-status', { 'x-admin-secret': validSecret }));
    assert.strictEqual(goodSecret.authorized, true);
  } finally {
    if (prevAdminSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = prevAdminSecret;
  }
  console.log('  PASS: Admin receives permanent premium tier, exclusive /admin/* access, and strict ADMIN_SECRET check.');

  // -------------------------------------------------------------------------
  // 4. MIGRATION SQL & ZERO-FAKE-DATA STATIC CHECKS
  // -------------------------------------------------------------------------
  console.log('\n[4] Verifying migration SQL, RLS audit table coverage & zero fake data...');

  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261126000000_auth_profiles_and_rls_hardening.sql');
  assert(fs.existsSync(migrationPath), 'Auth & RLS hardening migration SQL must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const requiredTablesInRlsAudit = [
    'competitions', 'seasons', 'teams', 'team_aliases', 'fixtures', 'matches',
    'market_definitions', 'bookmaker_odds', 'odds_snapshots', 'prediction_models',
    'prediction_runs', 'market_predictions', 'prediction_explanations',
    'factor_definitions', 'match_state_tags', 'prediction_factor_contributions',
    'dixon_coles_v25_features', 'dixon_coles_v25_predictions', 'dixon_coles_v25_parameters',
    'lineups', 'pick_revisions', 'football_picks', 'unresolved_teams',
    'provider_call_logs', 'provider_sync_state', 'provider_sync_jobs', 'audit_logs',
    'bb_teams', 'bb_games', 'bb_picks', 'bb_settlements', 'bb_odds_snapshots',
  ];

  for (const tbl of requiredTablesInRlsAudit) {
    assert(sql.includes(`'${tbl}'`), `Migration SQL must harden RLS on table '${tbl}'`);
  }
  assert(sql.includes('on_auth_user_created'), 'Migration SQL must install auth.users signup trigger');
  assert(sql.includes('protect_profile_privileged_columns'), 'Migration SQL must guard privileged profile columns');
  assert(sql.includes('GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated'), 'Migration SQL must limit authenticated profile updates to display_name');

  // Verify landing page copy & zero fake demo copy across UI
  const landingCode = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');
  assert(landingCode.includes('Every call, on record.'), 'Landing page must contain exact Hero headline');
  assert(landingCode.includes('Start your 7-day free trial. No card needed.'), 'Landing page must contain 7-day free trial copy');
  assert(landingCode.includes('Log in'), 'Landing page must contain Log in CTA');
  assert(landingCode.includes('Predictions are probabilities, not guarantees. Gamble responsibly.'), 'Landing page must contain responsible gambling notice');

  const signupCode = fs.readFileSync(path.join(process.cwd(), 'src/app/signup/page.tsx'), 'utf8');
  assert(signupCode.includes('confirmed18Plus'), 'Signup page must require 18+ confirmation checkbox');
  assert(signupCode.includes('Start your 7-day free trial. No card needed.'), 'Signup page must contain 7-day trial copy');

  const forbiddenDemoStrings = ['Marcus Vance', 'Senior Quant', 'Pro Terminal', 'analyst@calibrall.app', 'Free forever'];
  const scanForDemoCopy = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        if (!full.endsWith(`${path.sep}tests`)) scanForDemoCopy(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
        const content = fs.readFileSync(full, 'utf8');
        for (const s of forbiddenDemoStrings) {
          assert(!content.includes(s), `Forbidden copy "${s}" found in ${full}`);
        }
      }
    }
  };
  scanForDemoCopy(path.join(process.cwd(), 'src'));

  console.log(`  PASS: All ${requiredTablesInRlsAudit.length} tables hardened in migration SQL; zero fake demo or 'Free forever' copy found.`);

  // -------------------------------------------------------------------------
  // 5. ADMIN PANEL API ROUTES, 404 ENFORCEMENT & AUDIT LOGGING
  // -------------------------------------------------------------------------
  console.log('\n[5] Testing Admin Panel API 404 guards, tier updates, self-demotion guard & audit log...');

  const adminApiChecks: Array<{ name: string; run: () => Promise<Response> }> = [
    { name: 'GET /api/admin/overview', run: () => getAdminOverview(new Request('http://localhost:3000/api/admin/overview', { headers: spoofHeaders })) },
    { name: 'GET /api/admin/users', run: () => getAdminUsers(new Request('http://localhost:3000/api/admin/users', { headers: spoofHeaders })) },
    { name: 'GET /api/admin/users/[id]', run: () => getAdminUserDetailRoute(new Request('http://localhost:3000/api/admin/users/u1', { headers: spoofHeaders }), { params: { id: 'u1' } }) },
    { name: 'PATCH /api/admin/users/[id]', run: () => patchAdminUserRoute(new Request('http://localhost:3000/api/admin/users/u1', { method: 'PATCH', headers: spoofHeaders, body: JSON.stringify({ action: 'change_tier', tier: 'pro' }) }), { params: { id: 'u1' } }) },
    { name: 'POST /api/admin/users/[id]/password-reset', run: () => postAdminPwReset(new Request('http://localhost:3000/api/admin/users/u1/password-reset', { method: 'POST', headers: spoofHeaders }), { params: { id: 'u1' } }) },
    { name: 'GET /api/admin/audit-log', run: () => getAdminAuditLog(new Request('http://localhost:3000/api/admin/audit-log', { headers: spoofHeaders })) },
    { name: 'GET /api/admin/payments', run: () => getAdminPayments(new Request('http://localhost:3000/api/admin/payments', { headers: spoofHeaders })) },
    { name: 'POST /api/admin/payments', run: () => postAdminPayments(new Request('http://localhost:3000/api/admin/payments', { method: 'POST', headers: spoofHeaders, body: JSON.stringify({ userIdOrEmail: 'u1', plan: 'pro', grantNote: 'test' }) })) },
    { name: 'GET /api/admin/picks', run: () => getAdminPicks(new Request('http://localhost:3000/api/admin/picks', { headers: spoofHeaders })) },
    { name: 'PATCH /api/admin/picks/[id]', run: () => patchAdminPick(new Request('http://localhost:3000/api/admin/picks/p1', { method: 'PATCH', headers: spoofHeaders, body: JSON.stringify({ sport: 'football', action: 'hide', reason: 'test' }) }), { params: { id: 'p1' } }) },
    { name: 'POST /api/admin/sync', run: () => postAdminSync(new Request('http://localhost:3000/api/admin/sync', { method: 'POST', headers: spoofHeaders })) },
    { name: 'GET /api/admin/system-health', run: () => getAdminHealth(new Request('http://localhost:3000/api/admin/system-health', { headers: spoofHeaders })) },
  ];

  for (const check of adminApiChecks) {
    const res = await check.run();
    assert.strictEqual(res.status, 404, `${check.name} must return 404 when caller is not a verified admin, got ${res.status}`);
  }
  console.log(`  PASS: All ${adminApiChecks.length} session-guarded /api/admin/* endpoints return HTTP 404 to non-admins.`);

  // Verify admin migration file
  const adminMigPath = path.join(process.cwd(), 'supabase/migrations/20261128000000_admin_panel_audit_payments.sql');
  assert(fs.existsSync(adminMigPath), 'Admin panel migration SQL must exist');
  const adminSql = fs.readFileSync(adminMigPath, 'utf8');
  for (const sym of [
    'admin_audit_log',
    'paystack_payments',
    'suspended',
    'is_current_user_admin',
    'get_admin_users_page',
    'get_admin_user_detail',
    'get_calibrall_database_size',
  ]) {
    assert(adminSql.includes(sym), `Admin migration SQL must define ${sym}`);
  }

  // Test real SQLite admin mutations, audit logging & self-demotion guard cleanly
  const db = getLocalDatabase();
  if (db) {
    const testAdminId = 'test-admin-rbac-0001';
    const testUserId = 'test-member-rbac-0002';
    const nowIso = new Date().toISOString();
    const svcAdminSession = makeFakeSession({
      id: testAdminId,
      email: 'admin-test@calibrall.app',
      role: 'admin',
      tier: 'premium',
    });

    try {
      db.prepare(`DELETE FROM admin_audit_log WHERE target_user_id IN (?, ?) OR admin_id = ?`).run(
        testAdminId,
        testUserId,
        testAdminId
      );
      db.prepare(`DELETE FROM paystack_payments WHERE user_id = ?`).run(testUserId);
      db.prepare(`DELETE FROM profiles WHERE id IN (?, ?)`).run(testAdminId, testUserId);

      db.prepare(
        `INSERT INTO profiles (id, email, display_name, role, tier, created_at) VALUES (?, ?, ?, 'admin', 'premium', ?)`
      ).run(testAdminId, 'admin-test@calibrall.app', 'Admin Owner', nowIso);
      db.prepare(
        `INSERT INTO profiles (id, email, display_name, role, tier, created_at) VALUES (?, ?, ?, 'user', 'free', ?)`
      ).run(testUserId, 'member-test@calibrall.app', 'Test Member', nowIso);

      // 1. Overview & User listing work against real DB
      const overview = await getAdminOverviewSvc();
      assert(overview.users.totalUsers >= 2, 'Overview must count persisted users');
      const userList = await listAdminUsers({ search: 'member-test@calibrall.app' });
      assert.strictEqual(userList.users.length, 1);
      assert.strictEqual(userList.users[0].tier, 'free');

      // 2. Admin changes test user tier -> takes effect immediately + writes audit log with before/after
      const tierUpdate = await updateAdminUser(svcAdminSession, testUserId, {
        action: 'change_tier',
        tier: 'pro',
        expiryDays: 30,
        note: 'Automated verification upgrade',
      });
      assert.strictEqual(tierUpdate.user.tier, 'pro');
      assert(tierUpdate.user.tierExpiresAt, 'Tier expiry must be set');
      assert.strictEqual(tierUpdate.auditLog.action, 'USER_TIER_UPDATED');
      assert.strictEqual(tierUpdate.auditLog.adminId, testAdminId);
      assert.strictEqual(tierUpdate.auditLog.targetUserId, testUserId);
      assert.strictEqual(tierUpdate.auditLog.beforeState?.tier, 'free');
      assert.strictEqual(tierUpdate.auditLog.afterState?.tier, 'pro');

      const reloaded = await getAdminUserDetail(testUserId);
      assert.strictEqual(reloaded.user.tier, 'pro');
      const liveMemberSession = buildServerAuthSessionFromUserAndProfile(
        { id: reloaded.user.id, email: reloaded.user.email },
        {
          id: reloaded.user.id,
          email: reloaded.user.email,
          displayName: reloaded.user.displayName,
          role: reloaded.user.role,
          tier: reloaded.user.tier,
          tierExpiresAt: reloaded.user.tierExpiresAt,
          suspended: reloaded.user.suspended,
          createdAt: reloaded.user.createdAt,
        }
      );
      assert.strictEqual(resolveTierFromSession(liveMemberSession), 'pro');
      const unlockedForPro = redactExplanationForTier(sampleExplanation, liveMemberSession.effectiveTier, 99)!;
      assert.strictEqual(unlockedForPro.tierLocked, false);
      assert.strictEqual(unlockedForPro.fullSummary, 'Deep model rationale.');

      // 3. Self-demotion must be rejected
      let selfDemoteFailed = false;
      try {
        await updateAdminUser(svcAdminSession, testAdminId, {
          action: 'set_role',
          role: 'user',
          confirm: true,
        });
      } catch (err: any) {
        selfDemoteFailed = err instanceof AdminServiceError && err.status === 400;
      }
      assert.strictEqual(selfDemoteFailed, true, 'Admin self-demotion must be rejected with HTTP 400');

      // 4. Suspend and reactivate user -> blocks admin middleware + records audit logs
      const suspendedRes = await updateAdminUser(svcAdminSession, testUserId, {
        action: 'suspend',
        reason: 'Chargeback review',
      });
      assert.strictEqual(suspendedRes.user.suspended, true);
      assert.strictEqual(suspendedRes.auditLog.action, 'USER_SUSPENDED');
      const suspendedSession = buildServerAuthSessionFromUserAndProfile(
        { id: testUserId, email: 'member-test@calibrall.app' },
        {
          id: testUserId,
          email: 'member-test@calibrall.app',
          displayName: 'Test Member',
          role: 'admin',
          tier: 'premium',
          tierExpiresAt: null,
          suspended: true,
          createdAt: nowIso,
        }
      );
      const suspendedAdminRes = await handleAuthMiddleware(makeNextRequest('/admin'), {
        getSession: async () => suspendedSession,
      });
      assert.strictEqual(suspendedAdminRes.status, 404, 'Suspended admin must receive 404 on /admin');

      const reactivatedRes = await updateAdminUser(svcAdminSession, testUserId, {
        action: 'reactivate',
        note: 'Cleared review',
      });
      assert.strictEqual(reactivatedRes.user.suspended, false);
      assert.strictEqual(reactivatedRes.auditLog.action, 'USER_REACTIVATED');

      // 5. Manual payment grant updates tier & writes payment + audit entry
      const grant = await recordManualGrant(svcAdminSession, {
        userIdOrEmail: testUserId,
        plan: 'premium',
        expiryDays: 90,
        grantNote: 'Invoice comp grant',
      });
      assert.strictEqual(grant.payment.isManualGrant, true);
      const paymentsPage = await listAdminPayments({ manualOnly: 'true', search: 'Invoice comp', page: 1, pageSize: 10 });
      assert.strictEqual(paymentsPage.page, 1);
      assert.strictEqual(paymentsPage.pageSize, 10);
      assert(paymentsPage.totalPages >= 1);
      assert(paymentsPage.payments.some((p) => p.reference === grant.payment.reference));

      const auditPage = await listAuditLogs({ targetUserId: testUserId, page: 1, pageSize: 10 });
      assert(auditPage.logs.some((l) => l.action === 'USER_TIER_UPDATED'));
      assert(auditPage.logs.some((l) => l.action === 'USER_SUSPENDED'));
      assert(auditPage.logs.some((l) => l.action === 'USER_REACTIVATED'));
      assert(auditPage.logs.some((l) => l.action === 'MANUAL_PAYMENT_GRANTED'));

      // 6. System health query works cleanly
      const health = await getAdminSystemHealth({ page: 1, pageSize: 10 });
      assert(typeof health.errorCount24h === 'number');
      assert.strictEqual(health.callLogs.pageSize, 10);
    } finally {
      db.prepare(`DELETE FROM admin_audit_log WHERE target_user_id IN (?, ?) OR admin_id = ?`).run(
        testAdminId,
        testUserId,
        testAdminId
      );
      db.prepare(`DELETE FROM paystack_payments WHERE user_id = ?`).run(testUserId);
      db.prepare(`DELETE FROM profiles WHERE id IN (?, ?)`).run(testAdminId, testUserId);
    }
    console.log('  PASS: Admin user tier mutation, audit log persistence, suspension guard, manual grant & self-demotion guard verified against DB.');
  }

  // -------------------------------------------------------------------------
  // 6. 7-DAY FREE TRIAL LIFECYCLE, 402 GUARD, PAYSTACK RECOVERY & BANNER
  // -------------------------------------------------------------------------
  console.log('\n[6] Testing 7-day free trial lifecycle, 402 blocking, Paystack restoration & banner...');

  // 6a. Trial migration SQL verification
  const trialMigPath = path.join(process.cwd(), 'supabase/migrations/20261129000000_seven_day_free_trial.sql');
  assert(fs.existsSync(trialMigPath), '7-day free trial migration SQL must exist');
  const trialSql = fs.readFileSync(trialMigPath, 'utf8');
  for (const sym of [
    'trial_started_at',
    'trial_ends_at',
    'on_auth_user_email_confirmed',
    'handle_user_email_confirmed',
    "WHERE role <> 'admin'",
    'get_admin_users_page',
    'get_admin_user_detail',
  ]) {
    assert(trialSql.includes(sym), `Trial migration SQL must define ${sym}`);
  }

  // 6b. New confirmed user receives 7 days; unconfirmed user does NOT
  const nowMs = Date.now();
  const newConfirmedEnt = getEntitlements(
    {
      role: 'user',
      tier: 'free',
      tierExpiresAt: null,
      trialStartedAt: new Date(nowMs).toISOString(),
      trialEndsAt: new Date(nowMs + TRIAL_DAYS * 86_400_000).toISOString(),
      emailConfirmed: true,
    },
    nowMs
  );
  assert.strictEqual(newConfirmedEnt.status, 'trial');
  assert.strictEqual(newConfirmedEnt.effectiveTier, 'free');
  assert.strictEqual(newConfirmedEnt.trialDaysRemaining, 7);
  assert.strictEqual(newConfirmedEnt.hasModelAccess, true);
  assert.strictEqual(newConfirmedEnt.isExpired, false);

  const unconfirmedEnt = getEntitlements(
    {
      role: 'user',
      tier: 'free',
      tierExpiresAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      emailConfirmed: false,
    },
    nowMs
  );
  assert.strictEqual(unconfirmedEnt.status, 'expired');
  assert.strictEqual(unconfirmedEnt.hasModelAccess, false);

  // Lapsed paid user goes directly to 'expired' (no second trial even if trialEndsAt is future)
  const lapsedPaidEnt = getEntitlements(
    {
      role: 'user',
      tier: 'pro',
      tierExpiresAt: '2024-01-01T00:00:00.000Z',
      trialStartedAt: new Date(nowMs).toISOString(),
      trialEndsAt: new Date(nowMs + 7 * 86_400_000).toISOString(),
      emailConfirmed: true,
    },
    nowMs
  );
  assert.strictEqual(lapsedPaidEnt.status, 'expired');
  assert.strictEqual(lapsedPaidEnt.hasModelAccess, false);

  // 6c. Expired trial user (backdated trial_ends_at): 402 on API, /pricing?reason=trial_ended on model pages, allowed on allowlisted pages
  const expiredTrialSession = makeFakeSession({
    role: 'user',
    tier: 'free',
    trialStartedAt: '2024-01-01T00:00:00.000Z',
    trialEndsAt: '2024-01-08T00:00:00.000Z',
    emailConfirmed: true,
  });
  assert.strictEqual(expiredTrialSession.entitlements.status, 'expired');
  assert.strictEqual(expiredTrialSession.entitlements.hasModelAccess, false);
  assert.strictEqual(expiredTrialSession.isExpired, true);

  const api402Check = await requireApiUser(new Request('http://localhost:3000/api/v1/fixtures'), {
    getSession: async () => expiredTrialSession,
  });
  assert.strictEqual(api402Check.authorized, false);
  assert.strictEqual(api402Check.errorResponse.status, 402, 'Expired trial user must receive HTTP 402 on API');
  const api402Body = await api402Check.errorResponse.json();
  assert.strictEqual(api402Body.code, 'TRIAL_EXPIRED');
  assert.strictEqual(api402Body.upgradeUrl, '/pricing?reason=trial_ended');

  // Verify every /api/v1/* model data route delegates to requireApiUser
  const v1ModelRouteFiles = [
    'src/app/api/v1/fixtures/route.ts',
    'src/app/api/v1/fixtures/[id]/predictions/route.ts',
    'src/app/api/v1/fixtures/[id]/factors/route.ts',
    'src/app/api/v1/fixtures/[id]/form/route.ts',
    'src/app/api/v1/fixtures/[id]/lineups/route.ts',
    'src/app/api/v1/fixtures/form/route.ts',
    'src/app/api/v1/competitions/route.ts',
    'src/app/api/v1/predictions/today/route.ts',
    'src/app/api/v1/performance/summary/route.ts',
    'src/app/api/v1/monitoring/route.ts',
    'src/app/api/v1/nba/stats/route.ts',
  ];
  for (const rel of v1ModelRouteFiles) {
    const code = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    assert(code.includes('requireApiUser('), `${rel} must call requireApiUser() for 401/402 enforcement`);
  }

  for (const allowed of ['/', '/pricing', '/account', '/settings', '/terms', '/privacy']) {
    assert.strictEqual(isExpiredAllowedPagePath(allowed), true);
    const res = await handleAuthMiddleware(makeNextRequest(allowed), {
      getSession: async () => expiredTrialSession,
    });
    assert.strictEqual(res.status, 200, `Expired user must still access ${allowed} (200), got ${res.status}`);
  }

  for (const blocked of ['/fixtures', '/matches', '/matches/fix_1', '/predictions', '/picks', '/markets', '/performance', '/record', '/saved', '/methodology']) {
    const res = await handleAuthMiddleware(makeNextRequest(blocked), {
      getSession: async () => expiredTrialSession,
    });
    assert.strictEqual(res.status, 307, `Expired user GET ${blocked} must redirect (307), got ${res.status}`);
    assert.strictEqual(
      res.headers.get('location'),
      'http://localhost:3000/pricing?reason=trial_ended',
      `Expired user GET ${blocked} must redirect to /pricing?reason=trial_ended`
    );
  }

  // Expired user hitting /admin still gets 404
  const expiredAdminAttempt = await handleAuthMiddleware(makeNextRequest('/admin'), {
    getSession: async () => expiredTrialSession,
  });
  assert.strictEqual(expiredAdminAttempt.status, 404);

  // 6d. Admin with backdated trial_ends_at is NEVER blocked
  const adminWithBackdatedTrial = makeFakeSession({
    role: 'admin',
    tier: 'free',
    trialStartedAt: '2020-01-01T00:00:00.000Z',
    trialEndsAt: '2020-01-08T00:00:00.000Z',
    tierExpiresAt: '2020-01-08T00:00:00.000Z',
  });
  assert.strictEqual(adminWithBackdatedTrial.entitlements.status, 'admin');
  assert.strictEqual(adminWithBackdatedTrial.entitlements.hasModelAccess, true);
  assert.strictEqual(adminWithBackdatedTrial.isExpired, false);
  const adminApiAccess = await requireApiUser(new Request('http://localhost:3000/api/v1/fixtures'), {
    getSession: async () => adminWithBackdatedTrial,
  });
  assert.strictEqual(adminApiAccess.authorized, true);

  // 6e. Banner countdown & colors (normal / amber at 2d / red at 1d & expired / hidden for admin & paid)
  const banner5d = getTrialBannerState({ entitlementStatus: 'trial', trialDaysRemaining: 5, isAdmin: false });
  assert.strictEqual(banner5d.visible, true);
  assert.strictEqual(banner5d.tone, 'normal');
  assert.strictEqual(banner5d.label, 'Free trial: 5 days left');
  assert.strictEqual(banner5d.isReminderDay, false);

  const banner2d = getTrialBannerState({ entitlementStatus: 'trial', trialDaysRemaining: 2, isAdmin: false });
  assert.strictEqual(banner2d.visible, true);
  assert.strictEqual(banner2d.tone, 'amber');
  assert.strictEqual(banner2d.label, 'Free trial: 2 days left');
  assert.strictEqual(banner2d.isReminderDay, true);
  assert.strictEqual(banner2d.reminderStage, 'day5');

  const banner1d = getTrialBannerState({ entitlementStatus: 'trial', trialDaysRemaining: 1, isAdmin: false });
  assert.strictEqual(banner1d.visible, true);
  assert.strictEqual(banner1d.tone, 'red');
  assert.strictEqual(banner1d.label, 'Free trial: 1 day left');
  assert.strictEqual(banner1d.isReminderDay, true);
  assert.strictEqual(banner1d.reminderStage, 'day7');

  assert.strictEqual(getTrialBannerState({ entitlementStatus: 'paid', trialDaysRemaining: 0, isAdmin: false }).visible, false);
  assert.strictEqual(getTrialBannerState({ entitlementStatus: 'trial', trialDaysRemaining: 2, isAdmin: true }).visible, false);

  // 6f. Disposable email domain check
  assert.strictEqual(isDisposableEmail('throwaway@mailinator.com'), true);
  assert.strictEqual(isDisposableEmail('person@gmail.com'), false);

  // 6g. Real DB tests: Paystack payment immediately restores expired user + admin extend_trial/end_trial + overview counts
  if (db) {
    const tAdminId = 'test-trial-admin-0001';
    const tUserId = 'test-trial-user-0002';
    const nowIso = new Date().toISOString();
    const pastStart = '2024-01-01T00:00:00.000Z';
    const pastEnd = '2024-01-08T00:00:00.000Z';
    const tAdminSession = makeFakeSession({
      id: tAdminId,
      email: 'trial-admin@calibrall.app',
      role: 'admin',
      tier: 'premium',
    });

    try {
      db.prepare(`DELETE FROM admin_audit_log WHERE target_user_id IN (?, ?) OR admin_id = ?`).run(tAdminId, tUserId, tAdminId);
      db.prepare(`DELETE FROM paystack_payments WHERE user_id = ?`).run(tUserId);
      db.prepare(`DELETE FROM profiles WHERE id IN (?, ?)`).run(tAdminId, tUserId);

      db.prepare(
        `INSERT INTO profiles (id, email, display_name, role, tier, created_at) VALUES (?, ?, 'Trial Admin', 'admin', 'premium', ?)`
      ).run(tAdminId, 'trial-admin@calibrall.app', nowIso);
      db.prepare(
        `INSERT INTO profiles (id, email, display_name, role, tier, trial_started_at, trial_ends_at, created_at) VALUES (?, ?, 'Trial User', 'user', 'free', ?, ?, ?)`
      ).run(tUserId, 'trial-user@calibrall.app', pastStart, pastEnd, nowIso);

      // Expired user starts blocked
      const beforePay = await getAdminUserDetail(tUserId);
      assert.strictEqual(beforePay.user.accessStatus, 'expired');
      assert.strictEqual(beforePay.user.trialDaysRemaining, 0);

      // Overview reports trial/expired/paid metrics
      const ov1 = await getAdminOverviewSvc();
      assert(typeof ov1.users.usersInTrial === 'number');
      assert(typeof ov1.users.usersExpired === 'number' && ov1.users.usersExpired >= 1);
      assert(typeof ov1.users.usersPaid === 'number');
      assert(typeof ov1.users.trialsEndingIn3d === 'number');

      // Admin extends trial -> user immediately returns to 'trial' + audit logged
      const extRes = await updateAdminUser(tAdminSession, tUserId, {
        action: 'extend_trial',
        trialDays: 5,
        note: 'Support trial extension',
      });
      assert.strictEqual(extRes.user.accessStatus, 'trial');
      assert.strictEqual(extRes.user.trialDaysRemaining, 5);
      assert.strictEqual(extRes.auditLog.action, 'USER_TRIAL_EXTENDED');

      // Admin ends trial now -> user immediately returns to 'expired' + audit logged
      const endRes = await updateAdminUser(tAdminSession, tUserId, {
        action: 'end_trial',
        note: 'Trial ended in test',
      });
      assert.strictEqual(endRes.user.accessStatus, 'expired');
      assert.strictEqual(endRes.user.trialDaysRemaining, 0);
      assert.strictEqual(endRes.auditLog.action, 'USER_TRIAL_ENDED');

      // User pays via Paystack -> access is restored immediately
      const payRes = await applyPaystackPaymentRecord({
        reference: `test_pay_${Date.now()}`,
        userId: tUserId,
        customerEmail: 'trial-user@calibrall.app',
        planRaw: 'pro',
        amountKobo: 2900000,
        currency: 'NGN',
        status: 'success',
        channel: 'card',
        durationDays: 30,
      });
      assert.strictEqual(payRes.applied, true);
      assert.strictEqual(payRes.plan, 'pro');

      const afterPay = await getAdminUserDetail(tUserId);
      assert.strictEqual(afterPay.user.tier, 'pro');
      assert.strictEqual(afterPay.user.accessStatus, 'paid');

      const restoredSession = buildServerAuthSessionFromUserAndProfile(
        { id: afterPay.user.id, email: afterPay.user.email },
        {
          id: afterPay.user.id,
          email: afterPay.user.email,
          displayName: afterPay.user.displayName,
          role: afterPay.user.role,
          tier: afterPay.user.tier,
          tierExpiresAt: afterPay.user.tierExpiresAt,
          trialStartedAt: afterPay.user.trialStartedAt,
          trialEndsAt: afterPay.user.trialEndsAt,
          emailConfirmed: true,
          createdAt: afterPay.user.createdAt,
        }
      );
      assert.strictEqual(restoredSession.entitlements.status, 'paid');
      assert.strictEqual(restoredSession.entitlements.hasModelAccess, true);
      assert.strictEqual(restoredSession.effectiveTier, 'pro');
      const apiAfterPay = await requireApiUser(new Request('http://localhost:3000/api/v1/fixtures'), {
        getSession: async () => restoredSession,
      });
      assert.strictEqual(apiAfterPay.authorized, true);
    } finally {
      db.prepare(`DELETE FROM admin_audit_log WHERE target_user_id IN (?, ?) OR admin_id = ?`).run(tAdminId, tUserId, tAdminId);
      db.prepare(`DELETE FROM paystack_payments WHERE user_id = ?`).run(tUserId);
      db.prepare(`DELETE FROM profiles WHERE id IN (?, ?)`).run(tAdminId, tUserId);
    }
  }

  console.log('  PASS: 7-day trial, 402 enforcement, expired redirects, Paystack restoration, admin override, banner states & admin trial controls verified.');
  console.log('\n--- ALL AUTH, RBAC, ADMIN, TRIAL & RLS HARDENING TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Auth & access control test suite FAILED:', err);
  process.exit(1);
});
