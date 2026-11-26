import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Calibrall',
  description: 'Terms of service, 18+ eligibility, and probabilistic disclosures for Calibrall.',
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-4 space-y-4 text-[13px] leading-[1.6] text-[var(--text-2)]">
      <header className="space-y-1 pb-3 border-b border-[var(--line)]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)] block">
          Legal
        </span>
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Terms of service
        </h1>
        <p className="text-[12px] text-[var(--text-3)]">
          Applies to all Calibrall accounts and services.
        </p>
      </header>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          1. Eligibility (18+ only)
        </h2>
        <p>
          You must be at least 18 years old (or the age of majority in your jurisdiction, if higher) to create an account or use Calibrall. By registering, you confirm that you meet this requirement.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          2. Statistical analysis, not betting advice
        </h2>
        <p>
          Calibrall is not a bookmaker, gambling operator, or financial adviser. All outputs are mathematical probability estimates derived from historical sports data. Predictions are probabilities, not guarantees. You remain solely responsible for any decisions you make. Gamble responsibly.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          3. Accounts &amp; acceptable use
        </h2>
        <p>
          Access to fixtures, picks, model output, and track records requires an authenticated account. You agree not to scrape, redistribute bulk data, bypass tier or authentication controls, or attempt unauthorized access to admin endpoints.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
          4. Account termination
        </h2>
        <p>
          You may delete your account at any time from the Account settings page. We reserve the right to suspend or terminate accounts that violate these terms.
        </p>
      </section>

      <div className="text-[12px] flex items-center gap-4 pt-1">
        <Link href="/privacy" className="text-[var(--accent)] hover:underline">
          Privacy policy
        </Link>
        <Link href="/about" className="hover:text-[var(--text)]">
          About Calibrall
        </Link>
      </div>
    </div>
  );
}
