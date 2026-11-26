'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg('Supabase authentication is not configured in this environment.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push('/fixtures');
        router.refresh();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 sm:py-10 space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Choose a new password
        </h1>
        <p className="text-[13px] text-[var(--text-2)]">
          Set a new password for your Calibrall account.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[20px] p-5 space-y-4">
        {done ? (
          <div className="space-y-3 py-2 text-center">
            <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--text)]">
              Password updated
            </h2>
            <p className="text-[13px] text-[var(--text-2)]">
              Redirecting you to fixtures...
            </p>
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
                <label htmlFor="reset-password" className="block text-[12px] font-medium text-[var(--text-2)]">
                  New password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-password"
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

              <div className="space-y-1.5">
                <label htmlFor="reset-password-confirm" className="block text-[12px] font-medium text-[var(--text-2)]">
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
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
                <span>{submitting ? 'Updating...' : 'Update password'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
