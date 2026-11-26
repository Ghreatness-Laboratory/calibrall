'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, BarChart2, Award, User } from 'lucide-react';

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

  const isHomeActive = pathname === '/';
  const isFixturesActive = pathname.startsWith('/matches');
  const isAnalysisActive =
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
      id: 'analysis',
      label: 'Analysis',
      href: '/predictions',
      icon: BarChart2,
      isActive: isAnalysisActive,
    },
    {
      id: 'record',
      label: 'Record',
      href: '/performance',
      icon: Award,
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
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[var(--bg)]/85 backdrop-blur-xl border-t border-[var(--line)] flex flex-col justify-start"
      style={{
        height: 'calc(62px + max(16px, env(safe-area-inset-bottom, 0px)))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="grid grid-cols-5 w-full h-[62px] items-center px-2 max-w-[430px] mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.isActive ? 'page' : undefined}
              className="min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all duration-150 touch-press select-none rounded-[12px]"
            >
              <Icon
                className={`w-[22px] h-[22px] transition-colors ${
                  tab.isActive ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'
                }`}
                strokeWidth={tab.isActive ? 2.2 : 1.75}
              />
              <span
                className={`text-[10.5px] leading-none whitespace-nowrap transition-colors ${
                  tab.isActive ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-2)] font-medium'
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
