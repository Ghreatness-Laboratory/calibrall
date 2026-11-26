import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Activity, Database, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'About | Calibrall',
  description:
    'Learn how Calibrall builds calibrated football and basketball probabilities and records every pick before kickoff.',
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto py-4 space-y-5 text-[13px] leading-[1.6] text-[var(--text-2)]">
      <header className="space-y-1.5 pb-3 border-b border-[var(--line)]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)] block">
          About Calibrall
        </span>
        <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)]">
          Every call, on record.
        </h1>
        <p className="text-[13px] text-[var(--text-2)]">
          Calibrall publishes probabilistic football and basketball forecasts built strictly from historical match data, lineups, referee tendencies, and calibration scoring.
        </p>
      </header>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--accent)]" />
          <span>Probabilistic modeling</span>
        </h2>
        <p>
          For football, Calibrall uses bivariate Poisson and Dixon Coles score matrices alongside negative binomial corner distributions and referee baseline adjustments. For basketball, pace and scoring distributions drive game, team, and first half total projections.
        </p>
        <p>
          Every probability is calibrated on historical out of sample data. When sample coverage is thin, the model explicitly abstains instead of forcing a pick.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
          <span>Immutable pre-kickoff ledger</span>
        </h2>
        <p>
          Every model selection is recorded before kickoff and settled strictly from official full time results (excluding extra time unless specified by the market). Unedited history is logged publicly on the Record page once signed in.
        </p>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2">
        <h2 className="font-display text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Database className="w-4 h-4 text-[var(--accent)]" />
          <span>Independent statistical workspace</span>
        </h2>
        <p>
          Calibrall is an informational and statistical research platform. It does not accept bets, process wagers, or act as a bookmaker. Access requires a free registered account and confirmation that you are 18 or older.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Link
          href="/signup"
          className="min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] font-bold text-[13px] inline-flex items-center gap-1.5"
        >
          <span>Create free account</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/login"
          className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] font-semibold text-[13px] inline-flex items-center"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
