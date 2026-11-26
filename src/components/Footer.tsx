'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';

export default function Footer() {
  const { isAuthenticated } = useAuth();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-8 pb-[calc(78px+env(safe-area-inset-bottom,0px))] md:pb-8 border-t border-[var(--line)] pt-5 text-[12px] text-[var(--text-2)]">
      <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-4 space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-[var(--text-2)]">
          <Link href="/about" className="hover:text-[var(--text)] transition-colors">
            About
          </Link>
          <Link href="/terms" className="hover:text-[var(--text)] transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[var(--text)] transition-colors">
            Privacy
          </Link>
          {isAuthenticated ? (
            <>
              <Link href="/fixtures" className="hover:text-[var(--text)] transition-colors">
                Fixtures
              </Link>
              <Link href="/performance" className="hover:text-[var(--text)] transition-colors">
                Record
              </Link>
              <Link href="/settings" className="hover:text-[var(--text)] transition-colors">
                Account
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-[var(--text)] transition-colors">
                Log in
              </Link>
              <Link href="/signup" className="hover:text-[var(--text)] transition-colors">
                Create free account
              </Link>
            </>
          )}
        </div>

        <div className="pt-2 border-t border-[var(--line)] text-center text-[11px] text-[var(--text-3)] space-y-1 max-w-2xl mx-auto leading-relaxed">
          <p className="font-medium text-[var(--text-2)]">
            18+ only. Predictions are probabilities, not guarantees. Gamble responsibly.
          </p>
          <p className="text-[10.5px] text-[var(--text-3)]">
            © 2024 to {currentYear} Calibrall. Every call, on record.
          </p>
        </div>
      </div>
    </footer>
  );
}
