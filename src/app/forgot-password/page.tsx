'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectTo = `${origin}/auth/callback?next=/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setSent(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to send reset instructions.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 sm:py-10 space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Reset password
        </h1>
        <p className="text-[13px] text-[var(--text-2)]">
          Enter your email and we will send you a password reset link.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[20px] p-5 space-y-4">
        {sent ? (
          <div className="space-y-3 py-2 text-center">
            <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text)]">
              Check your email
            </h2>
            <p className="text-[13px] text-[var(--text-2)] leading-[1.55]">
              If an account exists for <span className="text-[var(--text)] font-medium">{email}</span>, a reset link has been sent.
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
                <label htmlFor="forgot-email" className="block text-[12px] font-medium text-[var(--text-2)]">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="forgot-email"
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

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 touch-press"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{submitting ? 'Sending link...' : 'Send reset link'}</span>
              </button>
            </form>
          </>
        )}
      </div>

      <p className="text-center text-[12.5px] text-[var(--text-2)]">
        Remembered it?{' '}
        <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
