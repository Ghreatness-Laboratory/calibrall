'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import SportSwitcher from '@/components/SportSwitcher';

const SPORT_BAR_PREFIXES = [
  '/',
  '/matches',
  '/predictions',
  '/markets',
  '/performance',
  '/dashboard',
  '/saved',
];

export default function TopSportBar() {
  const pathname = usePathname();

  const shouldShow =
    pathname === '/' ||
    SPORT_BAR_PREFIXES.some(
      (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`))
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
