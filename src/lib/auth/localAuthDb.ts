import crypto from 'node:crypto';
import { getLocalDatabase } from '@/lib/supabase/client';
import { TRIAL_DAYS } from '@/lib/tiers';
import {
  LOCAL_SESSION_TTL_MS,
  type LocalSessionTokenPayload,
} from '@/lib/auth/localSession';

export class LocalAuthError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hexHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function ensureLocalAuthSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_auth_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function buildPayloadFromProfileRow(
  row: Record<string, any>
): LocalSessionTokenPayload {
  const role = String(row.role || '').toLowerCase() === 'admin' ? 'admin' : 'user';
  const rawTier = String(row.tier || '').toLowerCase();
  const tier =
    rawTier === 'premium' ? 'premium' : rawTier === 'pro' ? 'pro' : 'free';
  return {
    userId: String(row.id),
    email: String(row.email),
    displayName: row.display_name ? String(row.display_name) : null,
    role,
    tier,
    tierExpiresAt: row.tier_expires_at ? String(row.tier_expires_at) : null,
    trialStartedAt: row.trial_started_at ? String(row.trial_started_at) : null,
    trialEndsAt: row.trial_ends_at ? String(row.trial_ends_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    exp: Date.now() + LOCAL_SESSION_TTL_MS,
  };
}

export function getLocalProfileRow(userId: string): Record<string, any> | null {
  const db = getLocalDatabase();
  if (!db) return null;
  const row = db
    .prepare(
      `SELECT id, email, display_name, role, tier, tier_expires_at, pending_tier,
              pending_tier_effective_at, cancel_at_period_end, renewal_reminder_sent_at,
              trial_started_at, trial_ends_at, trial_reminder_5d_sent_at,
              trial_ended_email_sent_at, suspended, suspended_at, suspended_reason, created_at
       FROM profiles WHERE id = ?`
    )
    .get(userId) as Record<string, any> | undefined;
  return row || null;
}

export function createLocalUserAccount(input: {
  email: string;
  password: string;
  displayName?: string;
}): LocalSessionTokenPayload {
  const db = getLocalDatabase();
  if (!db) {
    throw new LocalAuthError('Local database unavailable.', 503);
  }
  ensureLocalAuthSchema(db);

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new LocalAuthError('Please enter a valid email address.', 400);
  }
  if (!input.password || input.password.length < 8) {
    throw new LocalAuthError('Password must be at least 8 characters long.', 400);
  }

  const existingAuth = db
    .prepare('SELECT id FROM local_auth_users WHERE LOWER(email) = ?')
    .get(email) as { id: string } | undefined;
  if (existingAuth) {
    throw new LocalAuthError('An account with this email already exists. Please log in.', 409);
  }

  const existingProfile = db
    .prepare('SELECT id FROM profiles WHERE LOWER(email) = ?')
    .get(email) as { id: string } | undefined;

  const userId = existingProfile?.id || `local_${crypto.randomUUID()}`;
  const now = new Date();
  const nowIso = now.toISOString();
  const trialEndsIso = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
  const cleanName =
    input.displayName?.trim() || email.split('@')[0] || 'Member';
  const passwordHash = hashPassword(input.password);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO local_auth_users (id, email, password_hash, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, email, passwordHash, cleanName, nowIso);

    if (!existingProfile) {
      db.prepare(
        `INSERT INTO profiles (
          id, email, display_name, role, tier, tier_expires_at,
          trial_started_at, trial_ends_at, last_sign_in_at, created_at
        ) VALUES (?, ?, ?, 'user', 'free', NULL, ?, ?, ?, ?)`
      ).run(userId, email, cleanName, nowIso, trialEndsIso, nowIso, nowIso);
    } else {
      db.prepare(
        `UPDATE profiles
         SET display_name = COALESCE(display_name, ?),
             trial_started_at = COALESCE(trial_started_at, ?),
             trial_ends_at = COALESCE(trial_ends_at, ?),
             last_sign_in_at = ?
         WHERE id = ?`
      ).run(cleanName, nowIso, trialEndsIso, nowIso, userId);
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  const row = getLocalProfileRow(userId);
  if (!row) {
    throw new LocalAuthError('Failed to provision user profile.', 500);
  }
  return buildPayloadFromProfileRow(row);
}

export function authenticateLocalUserAccount(input: {
  email: string;
  password: string;
}): LocalSessionTokenPayload {
  const db = getLocalDatabase();
  if (!db) {
    throw new LocalAuthError('Local database unavailable.', 503);
  }
  ensureLocalAuthSchema(db);

  const email = input.email.trim().toLowerCase();
  const authRow = db
    .prepare('SELECT id, email, password_hash, display_name FROM local_auth_users WHERE LOWER(email) = ?')
    .get(email) as { id: string; email: string; password_hash: string; display_name: string | null } | undefined;

  if (!authRow || !verifyPassword(input.password, authRow.password_hash)) {
    throw new LocalAuthError('Invalid email or password.', 401);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const trialEndsIso = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();

  let profile = getLocalProfileRow(authRow.id);
  if (!profile) {
    db.prepare(
      `INSERT INTO profiles (
        id, email, display_name, role, tier, tier_expires_at,
        trial_started_at, trial_ends_at, last_sign_in_at, created_at
      ) VALUES (?, ?, ?, 'user', 'free', NULL, ?, ?, ?, ?)`
    ).run(
      authRow.id,
      email,
      authRow.display_name || email.split('@')[0] || 'Member',
      nowIso,
      trialEndsIso,
      nowIso,
      nowIso
    );
    profile = getLocalProfileRow(authRow.id);
  } else {
    if (profile.suspended === true || profile.suspended === 1) {
      throw new LocalAuthError('This account has been suspended.', 403);
    }
    db.prepare('UPDATE profiles SET last_sign_in_at = ? WHERE id = ?').run(nowIso, authRow.id);
  }

  if (!profile) {
    throw new LocalAuthError('Unable to load user profile.', 500);
  }
  return buildPayloadFromProfileRow(profile);
}

export function authenticateLocalTrialAccount(): LocalSessionTokenPayload {
  const db = getLocalDatabase();
  if (!db) {
    throw new LocalAuthError('Local database unavailable.', 503);
  }
  ensureLocalAuthSchema(db);

  const trialUserId = 'local_trial_member_default';
  const trialEmail = 'member@calibrall.local';
  const now = new Date();
  const nowIso = now.toISOString();
  const trialEndsIso = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();

  let profile = getLocalProfileRow(trialUserId);
  if (!profile) {
    db.prepare(
      `INSERT INTO profiles (
        id, email, display_name, role, tier, tier_expires_at,
        trial_started_at, trial_ends_at, last_sign_in_at, created_at
      ) VALUES (?, ?, ?, 'user', 'free', NULL, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_sign_in_at = excluded.last_sign_in_at`
    ).run(trialUserId, trialEmail, 'Trial Member', nowIso, trialEndsIso, nowIso, nowIso);
    profile = getLocalProfileRow(trialUserId);
  } else {
    // Ensure trial window is active if user is on free tier in local preview
    const trialExpired =
      profile.tier === 'free' &&
      profile.trial_ends_at &&
      Date.parse(String(profile.trial_ends_at)) <= now.getTime();
    if (trialExpired) {
      db.prepare(
        `UPDATE profiles SET trial_started_at = ?, trial_ends_at = ?, last_sign_in_at = ? WHERE id = ?`
      ).run(nowIso, trialEndsIso, nowIso, trialUserId);
      profile = getLocalProfileRow(trialUserId);
    } else {
      db.prepare('UPDATE profiles SET last_sign_in_at = ? WHERE id = ?').run(nowIso, trialUserId);
    }
  }

  if (!profile) {
    throw new LocalAuthError('Unable to provision local trial account.', 500);
  }
  return buildPayloadFromProfileRow(profile);
}

export function updateLocalProfileDisplayName(
  userId: string,
  displayName: string
): Record<string, any> | null {
  const db = getLocalDatabase();
  if (!db) return null;
  db.prepare('UPDATE profiles SET display_name = ? WHERE id = ?').run(displayName, userId);
  try {
    db.prepare('UPDATE local_auth_users SET display_name = ? WHERE id = ?').run(displayName, userId);
  } catch {}
  return getLocalProfileRow(userId);
}

export function deleteLocalUserAccount(userId: string): boolean {
  const db = getLocalDatabase();
  if (!db) return false;
  db.prepare('DELETE FROM local_auth_users WHERE id = ?').run(userId);
  db.prepare('DELETE FROM profiles WHERE id = ?').run(userId);
  return true;
}
