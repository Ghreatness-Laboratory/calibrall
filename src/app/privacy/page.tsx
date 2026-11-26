import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Calibrall',
  description: 'Privacy policy and data protection practices for Calibrall.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-4 space-y-4 text-[13px] leading-[1.6] text-[var(--text-2)]">
      <header className="space-y-1 pb-3 border-b border-[var(--line)]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)] block">
          Legal
        </span>
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Privacy policy
        </h1>
        <p className="text-[12px] text-[var(--text-3)]">
          Data minimization and user control for Calibrall accounts.
        </p>
      </header>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          1. Information we store
        </h2>
        <p>
          When you sign up, we store your email address, optional display name, account role, and access tier via Supabase Authentication and PostgreSQL. Passwords are handled directly by Supabase Auth and are never stored in plaintext.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          2. Sessions &amp; browser storage
        </h2>
        <p>
          Essential cookies keep you signed in securely. Local preferences such as theme mode and saved watchlist IDs are stored in your browser and cleared automatically when you sign out.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          3. No data selling
        </h2>
        <p>
          We do not sell personal data or share account information with third party ad networks or bookmakers.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          4. Your rights &amp; account deletion
        </h2>
        <p>
          You can update your display name or permanently delete your account and associated profile record at any time from your Account settings page.
        </p>
      </section>

      <div className="text-[12px] flex items-center gap-4 pt-1">
        <Link href="/terms" className="text-[var(--accent)] hover:underline">
          Terms of service
        </Link>
        <Link href="/about" className="hover:text-[var(--text)]">
          About Calibrall
        </Link>
      </div>
    </div>
  );
}
