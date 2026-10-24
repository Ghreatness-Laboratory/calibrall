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
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0F1814]/90 backdrop-blur-md border-t border-[#1B2A23]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="grid grid-cols-5 w-full h-[62px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center transition-colors duration-150 touch-press select-none ${
                tab.isActive
                  ? 'text-[#B8E63A]'
                  : 'text-[#8B9B93] hover:text-[#E9EFEB]'
              }`}
            >
              {tab.isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[2px] bg-[#B8E63A] rounded-full" />
              )}
              <div className="relative pt-0.5">
                <Icon className="w-[21px] h-[21px]" strokeWidth={1.7} />
              </div>

              <span
                className={`text-[10px] font-[500] leading-tight mt-0.5 whitespace-nowrap tracking-tight ${
                  tab.isActive ? 'text-[#B8E63A]' : 'text-[#8B9B93]'
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
