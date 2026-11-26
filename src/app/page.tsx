import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Activity, Layers } from 'lucide-react';
import { getServerAuthSession } from '@/lib/supabase/serverAuth';
import LandingInstallHint from '@/components/pwa/LandingInstallHint';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const session = await getServerAuthSession();

  const blocks = [
    {
      icon: Activity,
      title: 'How it works',
      body: 'Models read historical results, scoring rates, referees, rest days, and head to head records to output calibrated probabilities.',
    },
    {
      icon: ShieldCheck,
      title: 'Accountability',
      body: 'Every pick is posted and timestamped before kickoff, then settled publicly on the Record page after full time.',
    },
    {
      icon: Layers,
      title: 'Markets covered',
      body: 'Football covers goals, multi goals, corners, cards, both teams to score, half markets, double chance, and handicap. Basketball covers game, team, and 1st half totals.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 space-y-6">
      {/* Hero */}
      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[22px] p-5 sm:p-8 space-y-4">
        <div className="space-y-2.5">
          <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">
            Calibrall
          </span>
          <h1 className="font-display text-[32px] sm:text-[42px] font-bold leading-[1.08] tracking-[-0.025em] text-[var(--text)]">
            Every call, on record.
          </h1>
          <p className="text-[14px] sm:text-[15px] leading-[1.55] text-[var(--text-2)] max-w-2xl">
            Free probabilistic football and basketball predictions where every pick is timestamped before kickoff and scored after full time.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
          {session ? (
            <>
              <Link
                href="/fixtures"
                className="min-h-[46px] px-5 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center gap-2 transition-opacity touch-press"
              >
                <span>Open fixtures</span>
                <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
              </Link>
              <Link
                href="/settings"
                className="min-h-[46px] px-5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[var(--text)] font-semibold text-[14px] flex items-center justify-center transition-colors touch-press"
              >
                Account
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/signup"
                className="min-h-[46px] px-5 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center gap-2 transition-opacity touch-press"
              >
                <span>Create free account</span>
                <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
              </Link>
              <Link
                href="/login"
                className="min-h-[46px] px-5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[var(--text)] font-semibold text-[14px] flex items-center justify-center transition-colors touch-press"
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Mobile Add to Home Screen Hint */}
      <LandingInstallHint />

      {/* 3 Core Blocks */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {blocks.map((block) => {
          const Icon = block.icon;
          return (
            <div
              key={block.title}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 sm:p-5 space-y-2.5"
            >
              <div className="w-9 h-9 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                <Icon className="w-4 h-4" strokeWidth={2} />
              </div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
                {block.title}
              </h2>
              <p className="text-[12.5px] leading-[1.55] text-[var(--text-2)]">
                {block.body}
              </p>
            </div>
          );
        })}
      </section>

      {/* Responsible use & 18+ notice */}
      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[16px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px] text-[var(--text-2)]">
        <p className="font-medium text-[var(--text)]">
          18+ only. Predictions are probabilities, not guarantees. Gamble responsibly.
        </p>
        <div className="flex items-center gap-4 shrink-0 text-[12px]">
          <Link href="/about" className="text-[var(--accent)] hover:underline">
            About
          </Link>
          <Link href="/terms" className="hover:text-[var(--text)]">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[var(--text)]">
            Privacy
          </Link>
        </div>
      </section>
    </div>
  );
}
