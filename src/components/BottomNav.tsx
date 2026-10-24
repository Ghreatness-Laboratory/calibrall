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
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0D1117] border-t border-[#232C3A] flex flex-col justify-between"
      style={{
        height: 'calc(84px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      <div className="grid grid-cols-5 w-full pt-1.5 px-1 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center transition-colors duration-120 touch-press select-none py-0.5"
            >
              <div
                className={`w-[48px] h-[28px] rounded-full flex items-center justify-center transition-colors ${
                  tab.isActive ? 'bg-[#A8E05F]/[0.14]' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`w-[22px] h-[22px] transition-colors ${
                    tab.isActive ? 'text-[#A8E05F]' : 'text-[#7B8696]'
                  }`}
                  strokeWidth={1.8}
                />
              </div>

              <span
                className={`text-[10.5px] font-medium leading-none mt-1 whitespace-nowrap transition-colors ${
                  tab.isActive ? 'text-[#A8E05F]' : 'text-[#7B8696]'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Thin home-indicator safe area at the very bottom */}
      <div className="w-full flex justify-center pb-1">
        <div className="w-[134px] h-[4px] bg-[#EDF1F6]/20 rounded-full" />
      </div>
    </nav>
  );
}
