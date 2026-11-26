'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Sliders,
  User,
  Lock,
  Contrast,
  Search,
  LogOut,
  CreditCard,
} from 'lucide-react';
import DesktopInstallButton from '@/components/pwa/DesktopInstallButton';
import DropdownInstallItem from '@/components/pwa/DropdownInstallItem';
import { useSport } from '@/lib/context/SportContext';
import { useAuth } from '@/lib/context/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const { sport } = useSport();
  const { user, isAuthenticated, isAdmin, signOutAndClearCaches } = useAuth();
  const isBasketball = sport === 'basketball';
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isMonochrome, setIsMonochrome] = useState<boolean>(false);
  const [utcTime, setUtcTime] = useState<string>('');

  const isFixtureDetail = /^\/matches\/[^/]+$/.test(pathname);

  useEffect(() => {
    try {
      const updateTime = () => {
        const d = new Date();
        const h = String(d.getUTCHours()).padStart(2, '0');
        const m = String(d.getUTCMinutes()).padStart(2, '0');
        setUtcTime(`${h}:${m} UTC`);
      };
      updateTime();
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    } catch {
      // safe fallback
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('calibrall_monochrome_mode') === 'true';
      setIsMonochrome(saved);
      if (saved) {
        document.documentElement.classList.add('monochrome');
      }
    } catch {
      // safe fallback
    }
  }, []);

  const toggleMonochrome = () => {
    const next = !isMonochrome;
    setIsMonochrome(next);
    try {
      if (next) {
        document.documentElement.classList.add('monochrome');
        localStorage.setItem('calibrall_monochrome_mode', 'true');
      } else {
        document.documentElement.classList.remove('monochrome');
        localStorage.setItem('calibrall_monochrome_mode', 'false');
      }
    } catch (e) {
      console.error('Failed to save monochrome state', e);
    }
  };

  const navLinks = [
    { label: 'Fixtures', href: '/fixtures', matchPrefixes: ['/fixtures', '/matches'] },
    { label: 'Analysis', href: '/predictions', matchPrefixes: ['/predictions', '/picks'] },
    { label: 'Markets', href: '/markets', matchPrefixes: ['/markets'] },
    { label: 'Record', href: '/performance', matchPrefixes: ['/performance', '/record'] },
    { label: 'Watchlist', href: '/saved', matchPrefixes: ['/saved'] },
  ];

  const userInitial = (user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase();
  const tierLabel = isAdmin
    ? 'Admin (Full)'
    : user?.tier
    ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1)
    : 'Free';

  return (
    <header
      className={`${
        isFixtureDetail ? 'hidden md:block' : 'block'
      } fixed top-0 left-0 right-0 z-40 bg-[var(--bg)]/95 backdrop-blur-xl border-b border-[var(--line)]`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-[52px] gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href={isAuthenticated ? '/fixtures' : '/'}
              className="flex items-center gap-2.5 group touch-press min-h-[44px]"
            >
              <div className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[10px] overflow-hidden border border-[var(--line)] flex items-center justify-center bg-[#EEF2F0] shrink-0">
                <Image
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall logo"
                  width={34}
                  height={34}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-[15px] font-bold text-[var(--text)] leading-tight group-hover:text-[var(--accent)] transition-colors whitespace-nowrap tracking-[-0.015em]">
                  Calibrall
                </span>
                <span className="text-[10.5px] font-normal text-[var(--text-2)] leading-tight whitespace-nowrap mt-0.5">
                  Every call, on record.
                </span>
              </div>
            </Link>

            {isAuthenticated ? (
              <nav className="hidden lg:flex items-center gap-1 ml-6">
                {navLinks.map((item) => {
                  const active = item.matchPrefixes.some((p) => pathname.startsWith(p));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`min-h-[44px] px-3 flex items-center rounded-[12px] text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-[var(--surface-2)] text-[var(--accent)] font-semibold'
                          : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            ) : (
              <nav className="hidden sm:flex items-center gap-1 ml-5">
                <Link
                  href="/about"
                  className={`min-h-[44px] px-3 flex items-center rounded-[12px] text-[13px] font-medium whitespace-nowrap transition-colors ${
                    pathname === '/about'
                      ? 'bg-[var(--surface-2)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                  }`}
                >
                  About
                </Link>
              </nav>
            )}
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-2 shrink-0">
              <DesktopInstallButton />

              <Link
                href="/fixtures"
                className="hidden sm:flex w-[36px] h-[36px] rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)] items-center justify-center transition-colors touch-press"
                title="Browse fixtures"
                aria-label="Browse fixtures"
              >
                <Search className="w-4 h-4" strokeWidth={2} />
              </Link>

              {utcTime && (
                <span className="hidden sm:inline text-[11px] tabular-nums text-[var(--text-2)] font-medium">
                  {utcTime}
                </span>
              )}

              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  type="button"
                  className="w-[36px] h-[36px] min-w-[36px] min-h-[36px] rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] flex items-center justify-center text-[12.5px] font-semibold transition-colors touch-press"
                  title="Account menu"
                  aria-label="Account menu"
                >
                  {userInitial}
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-[var(--surface)] border border-[var(--line)] rounded-[14px] py-1.5 z-50 text-[12.5px]">
                    <div className="px-3.5 py-2.5 border-b border-[var(--line)]">
                      <p className="font-semibold text-[var(--text)] text-[13px] truncate">
                        {user?.displayName || user?.email || 'Member'}
                      </p>
                      <p className="text-[11px] text-[var(--text-2)] truncate mt-0.5">
                        {user?.email}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-2)]">Access tier:</span>
                        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 text-[10.5px] font-semibold">
                          {tierLabel}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10.5px] text-[var(--text-3)]">
                        {isBasketball ? 'Basketball totals engine' : 'Football probability engine'}
                      </div>
                    </div>
                    <div className="py-1">
                      <DropdownInstallItem onSelect={() => setUserDropdownOpen(false)} />

                      <button
                        onClick={toggleMonochrome}
                        type="button"
                        className="w-full min-h-[44px] flex items-center px-3.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-left text-[12.5px]"
                      >
                        <Contrast className="w-4 h-4 mr-2.5 text-[var(--text-2)]" strokeWidth={2} />
                        <span>{isMonochrome ? 'Color mode' : 'Monochrome mode'}</span>
                      </button>

                      <Link
                        href="/settings"
                        onClick={() => setUserDropdownOpen(false)}
                        className="min-h-[44px] flex items-center px-3.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-[12.5px]"
                      >
                        <Sliders className="w-4 h-4 mr-2.5 text-[var(--text-2)]" strokeWidth={2} />
                        Account &amp; preferences
                      </Link>

                      <Link
                        href="/pricing"
                        onClick={() => setUserDropdownOpen(false)}
                        className="min-h-[44px] flex items-center px-3.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-[12.5px]"
                      >
                        <CreditCard className="w-4 h-4 mr-2.5 text-[var(--text-2)]" strokeWidth={2} />
                        Tier details
                      </Link>

                      <Link
                        href="/about"
                        onClick={() => setUserDropdownOpen(false)}
                        className="min-h-[44px] flex items-center px-3.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-[12.5px]"
                      >
                        <User className="w-4 h-4 mr-2.5 text-[var(--text-2)]" strokeWidth={2} />
                        About Calibrall
                      </Link>

                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setUserDropdownOpen(false)}
                          className="min-h-[44px] flex items-center px-3.5 text-[var(--accent)] hover:bg-[var(--surface-2)] text-[12.5px] font-medium"
                        >
                          <Lock className="w-4 h-4 mr-2.5 text-[var(--accent)]" strokeWidth={2} />
                          Admin console
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          signOutAndClearCaches('/login');
                        }}
                        className="w-full min-h-[44px] flex items-center px-3.5 text-[var(--danger)] hover:bg-[var(--danger-soft)] text-left text-[12.5px] font-medium"
                      >
                        <LogOut className="w-4 h-4 mr-2.5" strokeWidth={2} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/login"
                className="min-h-[36px] px-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[12.5px] font-medium text-[var(--text)] flex items-center justify-center whitespace-nowrap touch-press"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="min-h-[36px] px-3 rounded-[10px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] text-[12.5px] font-bold flex items-center justify-center whitespace-nowrap touch-press"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
