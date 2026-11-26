'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import SportSwitcher from '@/components/SportSwitcher';
import { useAuth } from '@/lib/context/AuthContext';

const SPORT_BAR_PREFIXES = [
  '/fixtures',
  '/matches',
  '/predictions',
  '/picks',
  '/markets',
  '/performance',
  '/record',
  '/dashboard',
  '/saved',
];

export default function TopSportBar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const shouldShow = SPORT_BAR_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Skip individual fixture detail page (/matches/[id])
  const isFixtureDetail = /^\/matches\/[^/]+$/.test(pathname);

  if (!shouldShow || isFixtureDetail) {
    return null;
  }

  return (
    <div className="pb-2.5 pt-0.5">
      <SportSwitcher />
    </div>
  );
}
