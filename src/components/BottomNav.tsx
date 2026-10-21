'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Target, BarChart3, User } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  if (isKeyboardOpen) return null;

  // Tabs (5 in exact order):
  // 1. Home -> /
  // 2. Fixtures -> /matches (matches and match detail pages keep Fixtures active)
  // 3. Picks -> /predictions (picks, market-lines, and market pages keep Picks active)
  // 4. Record -> /performance (audited track record)
  // 5. Account -> /settings (account/profile, theme toggle, tier, etc.)
  const isHomeActive = pathname === '/';
  const isFixturesActive = pathname.startsWith('/matches');
  const isPicksActive =
    pathname.startsWith('/predictions') ||
    pathname.startsWith('/markets') ||
    pathname.startsWith('/saved');
  const isRecordActive = pathname.startsWith('/performance');
  const isAccountActive =
    pathname.startsWith('/settings') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/responsible-use') ||
    pathname.startsWith('/methodology');

  const tabs = [
    {
      id: 'home',
      label: 'Home',
      href: '/',
      icon: Home,
      isActive: isHomeActive,
    },
    {
      id: 'fixtures',
      label: 'Fixtures',
      href: '/matches',
      icon: Calendar,
      isActive: isFixturesActive,
    },
    {
      id: 'picks',
      label: 'Picks',
      href: '/predictions',
      icon: Target,
      isActive: isPicksActive,
      hasDot: true, // small lime dot for top picks today
    },
    {
      id: 'record',
      label: 'Record',
      href: '/performance',
      icon: BarChart3,
      isActive: isRecordActive,
    },
    {
      id: 'account',
      label: 'Account',
      href: '/settings',
      icon: User,
      isActive: isAccountActive,
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[rgba(11,18,16,0.96)] backdrop-blur-md border-t border-[var(--border)]"
      style={{
        paddingTop: '6px',
        paddingLeft: '6px',
        paddingRight: '6px',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="grid grid-cols-5 w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.isActive ? 'page' : undefined}
              className={`relative min-h-[46px] flex flex-col items-center justify-center transition-colors duration-150 active:opacity-75 focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded-[6px] ${
                tab.isActive
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
              }`}
            >
              {/* 2px x 24px indicator bar above active tab */}
              {tab.isActive && (
                <span
                  className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[var(--accent)] rounded-full"
                  aria-hidden="true"
                />
              )}

              <div className="relative mt-0.5">
                <Icon className="w-[19px] h-[19px]" strokeWidth={tab.isActive ? 2 : 1.75} />
                {tab.hasDot && !tab.isActive && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg)]"
                    aria-hidden="true"
                  />
                )}
              </div>

              <span
                className={`text-[10px] leading-tight mt-[3px] whitespace-nowrap select-none tracking-tight ${
                  tab.isActive ? 'font-[550] text-[var(--accent)]' : 'font-[450] text-[var(--text-3)]'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
