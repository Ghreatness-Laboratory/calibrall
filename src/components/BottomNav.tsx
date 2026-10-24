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
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0A0F0D]/90 backdrop-blur-md border-t border-white/[0.07] flex flex-col justify-between"
      style={{
        height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="grid grid-cols-5 w-full h-[64px] items-center px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.isActive ? 'page' : undefined}
              className="min-h-[44px] flex flex-col items-center justify-center transition-all duration-150 touch-press select-none py-1"
            >
              <div
                className={`w-[44px] h-[26px] rounded-[8px] flex items-center justify-center transition-colors ${
                  tab.isActive ? 'bg-[#B6E63B]/[0.12]' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    tab.isActive ? 'text-[#B6E63B]' : 'text-[#8B9890]'
                  }`}
                  strokeWidth={2}
                />
              </div>

              <span
                className={`text-[10px] font-medium leading-none mt-1 whitespace-nowrap transition-colors ${
                  tab.isActive ? 'text-[#B6E63B] font-semibold' : 'text-[#8B9890]'
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
