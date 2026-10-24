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
  Building2
} from 'lucide-react';
import { getStoredUser, setStoredUser } from '@/lib/supabase/client';
import { UserProfile } from '@/types';
import DesktopInstallButton from '@/components/pwa/DesktopInstallButton';
import DropdownInstallItem from '@/components/pwa/DropdownInstallItem';

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isMonochrome, setIsMonochrome] = useState<boolean>(false);

  useEffect(() => {
    setUser(getStoredUser());

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
      className="sticky top-0 z-40 bg-[#0D1117]/95 backdrop-blur-md border-b border-[#232C3A]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-xl md:max-w-4xl lg:max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-[52px]">
          {/* Left: 32px Logo Tile + Calibrall (16px semibold) + Tagline (11px muted) */}
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2.5 group touch-press">
              <div className="w-[32px] h-[32px] min-w-[32px] min-h-[32px] rounded-[10px] overflow-hidden border border-[#232C3A] flex items-center justify-center bg-[#EDF1F6] shrink-0">
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
                <span className="text-[16px] font-semibold text-[#EDF1F6] leading-tight group-hover:text-[#A8E05F] transition-colors whitespace-nowrap tracking-[-0.01em]">
                  Calibrall
                </span>
                <span className="text-[11px] font-normal text-[#8A95A5] leading-tight whitespace-nowrap mt-0.5">
                  Every call, on record
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 ml-6">
              {navLinks.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium transition-colors ${
                      active
                        ? 'bg-[#1A222E] text-[#A8E05F]'
                        : 'text-[#8A95A5] hover:text-[#EDF1F6] hover:bg-[#141A23]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Small outlined PRO pill + 28px circular avatar */}
          <div className="flex items-center gap-2">
            <DesktopInstallButton />

            <Link
              href="/matches"
              className="hidden sm:flex w-[32px] h-[32px] rounded-[10px] border border-[#232C3A] bg-[#141A23] text-[#8A95A5] hover:text-[#EDF1F6] items-center justify-center transition-colors touch-press"
              title="Search fixtures"
              aria-label="Search fixtures"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={1.8} />
            </Link>

            {/* Outlined PRO pill */}
            <Link
              href="/pricing"
              className="text-[10px] font-semibold px-2 py-[2px] rounded-full border border-[#A8E05F] text-[#A8E05F] bg-[#A8E05F]/[0.08] hover:bg-[#A8E05F]/[0.18] transition-colors leading-none tracking-wide"
              title="Subscription tier: PRO"
            >
              PRO
            </Link>

            {/* 28px circular avatar */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                type="button"
                className="w-[28px] h-[28px] rounded-full border border-[#232C3A] bg-[#1A222E] text-[#EDF1F6] hover:border-[#A8E05F] flex items-center justify-center text-[12px] font-semibold transition-colors touch-press"
                title="Account menu"
                aria-label="Account menu"
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : 'M'}
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#141A23] border border-[#232C3A] rounded-[14px] py-1.5 z-50 text-[12px] shadow-2xl">
                  <div className="px-3.5 py-2.5 border-b border-[#232C3A]">
                    <p className="font-semibold text-[#EDF1F6] text-[12.5px]">{user?.fullName || 'Analyst'}</p>
                    <p className="text-[11px] text-[#8A95A5] truncate mt-0.5">{user?.email || 'analyst@calibrall.app'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-[#8A95A5]">Tier:</span>
                      <button
                        onClick={cycleTier}
                        type="button"
                        className="px-2 py-0.5 rounded-[6px] bg-[#A8E05F]/[0.14] text-[#A8E05F] border border-[#A8E05F]/30 text-[10.5px] capitalize font-semibold hover:bg-[#A8E05F]/[0.25]"
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
                      className="w-full flex items-center px-3.5 py-2 text-[#8A95A5] hover:bg-[#1A222E] hover:text-[#EDF1F6] text-left text-[12px]"
                    >
                      <Contrast className="w-3.5 h-3.5 mr-2" strokeWidth={1.8} />
                      <span>{isMonochrome ? 'Switch to color mode' : 'Black & white mode'}</span>
                    </button>
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8A95A5] hover:bg-[#1A222E] hover:text-[#EDF1F6] text-[12px]"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2" strokeWidth={1.8} />
                      Settings & preferences
                    </Link>
                    <Link
                      href="/creators"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8A95A5] hover:bg-[#1A222E] hover:text-[#A8E05F] text-[12px]"
                    >
                      <Building2 className="w-3.5 h-3.5 mr-2 text-[#A8E05F]" strokeWidth={1.8} />
                      Meet the creators
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8A95A5] hover:bg-[#1A222E] hover:text-[#EDF1F6] text-[12px]"
                    >
                      <User className="w-3.5 h-3.5 mr-2" strokeWidth={1.8} />
                      Subscription tier
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8A95A5] hover:bg-[#1A222E] hover:text-[#EDF1F6] text-[12px]"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" strokeWidth={1.8} />
                      System admin
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
