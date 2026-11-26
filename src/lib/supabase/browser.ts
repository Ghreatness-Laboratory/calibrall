'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedBrowserClient: SupabaseClient | null = null;

export function getPublicSupabaseConfig(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
} {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  const isConfigured = Boolean(
    url &&
      url.startsWith('https://') &&
      !url.includes('your-project-id') &&
      anonKey
  );

  return { url, anonKey, isConfigured };
}

export function isBrowserSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig().isConfigured;
}

/**
 * Browser-side Supabase client used STRICTLY for Supabase Authentication flows
 * (sign up, sign in, Google OAuth, password reset, sign out).
 * All picks, fixtures, history, and model outputs are read exclusively via authenticated /api/* routes.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getPublicSupabaseConfig();
  if (!isConfigured) return null;
  if (!cachedBrowserClient) {
    cachedBrowserClient = createBrowserClient(url, anonKey);
  }
  return cachedBrowserClient;
}
