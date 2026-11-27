'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient, isBrowserSupabaseConfigured } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/context/AuthContext';

function sanitizeNextTarget(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/fixtures';
  }
  if (raw.startsWith('/login') || raw.startsWith('/signup') || raw.startsWith('/auth/callback')) {
    return '/fixtures';
  }
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProfile, isSupabaseAuthConfigured } = useAuth();
  const nextTarget = sanitizeNextTarget(searchParams.get('next'));
  const callbackError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    callbackError ? 'Authentication link was invalid or expired. Please try again.' : null
  );

  const authReady = isSupabaseAuthConfigured || isBrowserSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg('Supabase authentication is not configured in this environment.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      await refreshProfile();
      router.push(nextTarget);
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg('Supabase authentication is not configured in this environment.');
      return;
    }
    setOauthLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextTarget)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) {
        setErrorMsg(error.message);
        setOauthLoading(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to start Google sign in.');
      setOauthLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 sm:py-10 space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Log in to Calibrall
        </h1>
        <p className="text-[13px] text-[var(--text-2)]">
          Sign in to view fixtures, model probabilities, and settled records.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[20px] p-5 space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-[12px] bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[var(--danger)] text-[12.5px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-[12px] font-medium text-[var(--text-2)]">
              Email address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="block text-[12px] font-medium text-[var(--text-2)]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[11.5px] font-medium text-[var(--accent)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || oauthLoading}
            className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 touch-press"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" strokeWidth={2.2} />
            )}
            <span>{submitting ? 'Signing in...' : 'Log in'}</span>
          </button>
        </form>

        {authReady && (
          <>
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[var(--line)]" />
              <span className="shrink mx-3 text-[11px] text-[var(--text-3)]">or</span>
              <div className="flex-grow border-t border-[var(--line)]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={submitting || oauthLoading}
              className="w-full min-h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text)] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 touch-press"
            >
              {oauthLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Continue with Google</span>
            </button>
          </>
        )}
      </div>

      <p className="text-center text-[12.5px] text-[var(--text-2)]">
        New to Calibrall?{' '}
        <Link href="/signup" className="text-[var(--accent)] font-semibold hover:underline">
          Start your 7-day free trial
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto py-10 text-center text-[13px] text-[var(--text-2)]">Loading sign in...</div>}>
      <LoginForm />
    </Suspense>
  );
}
