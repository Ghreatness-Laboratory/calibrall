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
  CheckCircle2,
  Bookmark
} from 'lucide-react';
import { getStoredUser, setStoredUser } from '@/lib/supabase/client';
import { UserProfile } from '@/types';
import DesktopInstallButton from '@/components/pwa/DesktopInstallButton';
import DropdownInstallItem from '@/components/pwa/DropdownInstallItem';

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [timeStr, setTimeStr] = useState<string>('');
  const [isMonochrome, setIsMonochrome] = useState<boolean>(false);

  useEffect(() => {
    setUser(getStoredUser());
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toUTCString().slice(17, 22) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);

    try {
      const saved = localStorage.getItem('calibrall_monochrome_mode') === 'true';
      setIsMonochrome(saved);
      if (saved) {
        document.documentElement.classList.add('monochrome');
      }
    } catch {
      // safe fallback
    }

    return () => clearInterval(interval);
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

  const cycleTier = () => {
    if (!user) return;
    const tiers: ('free' | 'pro' | 'premium')[] = ['free', 'pro', 'premium'];
    const nextIndex = (tiers.indexOf(user.subscriptionTier) + 1) % tiers.length;
    const updated = { ...user, subscriptionTier: tiers[nextIndex] };
    setUser(updated);
    setStoredUser(updated);
  };

  const navLinks = [
    { label: 'Fixtures', href: '/matches' },
    { label: 'Picks', href: '/predictions' },
    { label: 'Markets', href: '/markets' },
    { label: 'Record', href: '/performance' },
    { label: 'Watchlist', href: '/saved' },
  ];

  return (
    <header
      className="sticky top-0 z-40 bg-[#0A0F0D]/95 backdrop-blur-md border-b border-white/[0.07]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* 1. Main Top App Bar: 52px high */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-[52px]">
          {/* Left: 32px Logo Tile + Calibrall (15px/650) + Tagline (11px muted) */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group touch-press">
              <div className="w-[32px] h-[32px] min-w-[32px] min-h-[32px] rounded-[9px] overflow-hidden border border-white/[0.07] flex items-center justify-center bg-[#f4f1ea] shrink-0">
                <Image
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall logo"
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[15px] font-[650] text-[#ECF1EE] leading-tight group-hover:text-[#B6E63B] transition-colors whitespace-nowrap tracking-[-0.01em]">
                  Calibrall
                </span>
                <span className="text-[11px] text-[#8B9890] leading-tight whitespace-nowrap mt-0.5">
                  Every call, on record.
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 ml-4">
              {navLinks.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors ${
                      active
                        ? 'bg-[#151E19] text-[#B6E63B]'
                        : 'text-[#8B9890] hover:text-[#ECF1EE] hover:bg-[#101713]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Small outlined mono PRO badge + 30px circular avatar */}
          <div className="flex items-center gap-2.5">
            <DesktopInstallButton />

            <Link
              href="/matches"
              className="hidden sm:flex w-[32px] h-[32px] rounded-[9px] border border-white/[0.07] bg-[#101713] text-[#8B9890] hover:text-[#ECF1EE] items-center justify-center transition-colors touch-press"
              title="Search fixtures"
              aria-label="Search fixtures"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>

            {/* Outlined mono PRO badge */}
            <Link
              href="/pricing"
              className="text-[9.5px] font-mono font-semibold px-2 py-[2px] rounded-[5px] border border-[#B6E63B]/40 text-[#B6E63B] tracking-wider leading-none hover:bg-[rgba(182,230,59,0.12)] transition-colors"
              title="Subscription tier: PRO"
            >
              PRO
            </Link>

            {/* 30px circular avatar with min-44px touch hitbox */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                type="button"
                className="w-[30px] h-[30px] rounded-full border border-white/[0.07] bg-[#151E19] text-[#ECF1EE] hover:border-[#B6E63B]/50 flex items-center justify-center text-[11.5px] font-mono font-semibold transition-colors touch-press"
                title="Account menu"
                aria-label="Account menu"
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : 'M'}
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#101713] border border-white/[0.07] rounded-[14px] py-1.5 z-50 text-[12px] shadow-xl">
                  <div className="px-3.5 py-2.5 border-b border-white/[0.07]">
                    <p className="font-semibold text-[#ECF1EE] text-[12.5px]">{user?.fullName || 'Analyst'}</p>
                    <p className="text-[11px] text-[#5E6A63] truncate mt-0.5">{user?.email || 'analyst@calibrall.app'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-[#8B9890]">Tier:</span>
                      <button
                        onClick={cycleTier}
                        type="button"
                        className="px-2 py-0.5 rounded-[5px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] border border-[#B6E63B]/30 font-mono text-[10px] capitalize font-medium hover:bg-[rgba(182,230,59,0.2)]"
                      >
                        {user?.subscriptionTier || 'pro'} (switch)
                      </button>
                    </div>
                  </div>
                  <div className="py-1">
                    <DropdownInstallItem onSelect={() => setUserDropdownOpen(false)} />

                    <button
                      onClick={toggleMonochrome}
                      type="button"
                      className="w-full flex items-center px-3.5 py-2 text-[#8B9890] hover:bg-[#151E19] hover:text-[#ECF1EE] text-left text-[12px]"
                    >
                      <Contrast className="w-3.5 h-3.5 mr-2" strokeWidth={2} />
                      <span>{isMonochrome ? 'Switch to color mode' : 'Black & white mode'}</span>
                    </button>
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9890] hover:bg-[#151E19] hover:text-[#ECF1EE] text-[12px]"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2" strokeWidth={2} />
                      Settings & preferences
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9890] hover:bg-[#151E19] hover:text-[#ECF1EE] text-[12px]"
                    >
                      <User className="w-3.5 h-3.5 mr-2" strokeWidth={2} />
                      Subscription tier
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9890] hover:bg-[#151E19] hover:text-[#ECF1EE] text-[12px]"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" strokeWidth={2} />
                      System admin
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Slim Mono Status Line under the bar: 10px, with small lime dot */}
      <div className="h-[24px] bg-[#0A0F0D] border-t border-white/[0.04] px-4 sm:px-6 text-[10px] font-mono flex items-center justify-between text-[#8B9890] whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#B6E63B] shrink-0" />
          <span className="text-[#ECF1EE]">Dixon Coles v2.4 online</span>
        </div>

        <div className="flex items-center gap-2">
          <span suppressHydrationWarning className="text-[#5E6A63] tabular-nums">
            {timeStr || '16:20 UTC'}
          </span>
        </div>
      </div>
    </header>
  );
}
