'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
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

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProfile, isSupabaseAuthConfigured } = useAuth();
  const nextTarget = sanitizeNextTarget(searchParams.get('next'));

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed18Plus, setConfirmed18Plus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const authReady = isSupabaseAuthConfigured || isBrowserSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!confirmed18Plus) {
      setErrorMsg('You must confirm you are at least 18 years old to create an account.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg('Supabase authentication is not configured in this environment.');
      return;
    }

    setSubmitting(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextTarget)}`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
          data: {
            display_name: displayName.trim() || undefined,
            age_confirmed_18_plus: true,
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      // If email confirmation is disabled or session is immediately active, redirect in
      if (data.session) {
        await refreshProfile();
        router.push(nextTarget);
        router.refresh();
        return;
      }

      setVerificationSent(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create account right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setErrorMsg(null);
    if (!confirmed18Plus) {
      setErrorMsg('Please confirm you are 18+ before continuing with Google.');
      return;
    }
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
      setErrorMsg(err?.message || 'Unable to start Google sign up.');
      setOauthLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 sm:py-10 space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Create free account
        </h1>
        <p className="text-[13px] text-[var(--text-2)]">
          Access calibrated football and basketball probabilities on the public record.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[20px] p-5 space-y-4">
        {verificationSent ? (
          <div className="space-y-3 py-2 text-center">
            <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text)]">
              Verify your email
            </h2>
            <p className="text-[13px] text-[var(--text-2)] leading-[1.55]">
              We sent a verification link to <span className="text-[var(--text)] font-medium">{email}</span>. Open the link in your inbox to activate your account and continue to fixtures.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex min-h-[44px] px-5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[13px] font-semibold text-[var(--text)] items-center justify-center"
              >
                Back to log in
              </Link>
            </div>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div className="p-3 rounded-[12px] bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[var(--danger)] text-[12.5px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="signup-name" className="block text-[12px] font-medium text-[var(--text-2)]">
                  Display name <span className="text-[var(--text-3)]">(optional)</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-name"
                    type="text"
                    maxLength={80}
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full min-h-[44px] pl-10 pr-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="block text-[12px] font-medium text-[var(--text-2)]">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-email"
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
                <label htmlFor="signup-password" className="block text-[12px] font-medium text-[var(--text-2)]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full min-h-[44px] pl-10 pr-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  id="signup-age-confirm"
                  type="checkbox"
                  required
                  checked={confirmed18Plus}
                  onChange={(e) => setConfirmed18Plus(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-[var(--accent-fill)] shrink-0"
                />
                <span className="text-[12px] leading-[1.45] text-[var(--text-2)]">
                  I confirm I am at least <strong className="text-[var(--text)]">18 years old</strong> and accept the{' '}
                  <Link href="/terms" className="text-[var(--accent)] hover:underline">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-[var(--accent)] hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting || oauthLoading}
                className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 touch-press"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" strokeWidth={2.2} />
                )}
                <span>{submitting ? 'Creating account...' : 'Create free account'}</span>
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
                  onClick={handleGoogleSignup}
                  disabled={submitting || oauthLoading}
                  className="w-full min-h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text)] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 touch-press"
                >
                  {oauthLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Continue with Google</span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      <p className="text-center text-[12.5px] text-[var(--text-2)]">
        Already have an account?{' '}
        <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto py-10 text-center text-[13px] text-[var(--text-2)]">Loading sign up...</div>}>
      <SignupForm />
    </Suspense>
  );
}
