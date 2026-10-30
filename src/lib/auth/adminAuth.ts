// CALIBRALL: Administrative Authentication & Timing-Safe Security
// Strictly enforces:
// 1. Require ADMIN_SECRET from the environment (minimum 32 characters)
// 2. If missing or < 32 characters, return 503 and do nothing
// 3. Accept ONLY the x-admin-secret header, never query strings or other headers
// 4. Constant-time comparison using crypto.timingSafeEqual with equalized length timing
// 5. Zero hardcoded or fallback secrets

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export interface AdminAuthResult {
  authorized: boolean;
  response?: NextResponse;
}

export function verifyAdminSecretHeader(req: NextRequest): AdminAuthResult {
  const configuredSecret = process.env.ADMIN_SECRET?.trim();

  // 1. Check for configured ADMIN_SECRET with >= 32 chars
  if (!configuredSecret || configuredSecret.length < 32) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Service Unavailable: ADMIN_SECRET environment variable is missing or does not meet the minimum requirement (at least 32 characters).',
          hint: 'Configure ADMIN_SECRET in the environment with >= 32 characters to activate admin endpoints.',
        },
        { status: 503 }
      ),
    };
  }

  // 2. Accept ONLY x-admin-secret header (never query string, never other headers)
  const providedSecret = req.headers.get('x-admin-secret')?.trim();

  if (!providedSecret) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized: Missing required x-admin-secret header.',
          hint: 'Pass your secret exclusively via the x-admin-secret HTTP request header.',
        },
        { status: 401 }
      ),
    };
  }

  // 3. Timing-safe constant-time comparison
  const bufProvided = Buffer.from(providedSecret, 'utf8');
  const bufConfigured = Buffer.from(configuredSecret, 'utf8');

  // Prevent timing leak on buffer length mismatch while executing timingSafeEqual
  if (bufProvided.length !== bufConfigured.length) {
    crypto.timingSafeEqual(bufConfigured, bufConfigured);
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Invalid x-admin-secret header.' },
        { status: 401 }
      ),
    };
  }

  const isMatch = crypto.timingSafeEqual(bufProvided, bufConfigured);
  if (!isMatch) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Invalid x-admin-secret header.' },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}
