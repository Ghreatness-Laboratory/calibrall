'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Activity, 
  Layers, 
  BarChart3, 
  Bookmark, 
  Sliders, 
  User, 
  CheckCircle2, 
  Lock, 
  Contrast,
  Search
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

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: Layers },
    { label: 'Fixtures', href: '/matches', icon: Activity },
    { label: 'Predictions', href: '/predictions', icon: CheckCircle2 },
    { label: 'Markets', href: '/markets', icon: Sliders },
    { label: 'Track record', href: '/performance', icon: BarChart3 },
    { label: 'Saved', href: '/saved', icon: Bookmark },
  ];

  const cycleTier = () => {
    if (!user) return;
    const tiers: ('free' | 'pro' | 'premium')[] = ['free', 'pro', 'premium'];
    const nextIndex = (tiers.indexOf(user.subscriptionTier) + 1) % tiers.length;
    const updated = { ...user, subscriptionTier: tiers[nextIndex] };
    setUser(updated);
    setStoredUser(updated);
  };

  return (
    <header
      className="sticky top-0 z-40 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* 1. Top status bar: 10.5px mono, bottom border 1px; green dot with soft 3px halo; PRO badge with 1px --warn border, 5px radius */}
      <div className="h-[28px] bg-[var(--bg)] border-b border-[var(--border)] px-4 text-[10.5px] font-mono flex items-center justify-between text-[var(--text-2)] whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0 shadow-[0_0_0_3px_var(--accent-soft)]" />
          <span className="text-[var(--text)] tracking-tight">Dixon-Coles v2.4 online</span>
        </div>

        <div className="flex items-center gap-2.5">
          <span suppressHydrationWarning className="text-[var(--text-3)]">{timeStr || '08:32 UTC'}</span>
          <span className="text-[9.5px] font-mono font-[600] px-1.5 py-[1px] rounded-[5px] border border-[var(--warn)] text-[var(--warn)] tracking-widest leading-none">
            PRO
          </span>
        </div>
      </div>

      {/* 2. Main header: 30px logo tile (radius 8) + name 15px/650 + tagline 11px --text-3; avatar 30px circle with 1px border */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-[48px]">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-[30px] h-[30px] min-w-[30px] min-h-[30px] rounded-[8px] overflow-hidden border border-[var(--border)] flex items-center justify-center bg-[#f4f1ea] shrink-0">
                <img
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[15px] font-[650] text-[var(--text)] leading-tight group-hover:text-[var(--accent)] transition-colors whitespace-nowrap tracking-[-0.01em]">
                  Calibrall
                </span>
                <span className="text-[11px] text-[var(--text-3)] leading-tight whitespace-nowrap">
                  Every call, on record.
                </span>
              </div>
            </Link>

            {/* Nav links (desktop) */}
            <nav className="hidden lg:flex items-center gap-1 ml-2">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-[8px] text-[12.5px] transition-colors ${
                      active
                        ? 'bg-[var(--surface-2)] text-[var(--accent)] font-[550]'
                        : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side: Desktop install button + search + theme toggle + avatar */}
          <div className="flex items-center gap-2">
            <DesktopInstallButton />

            <Link
              href="/matches"
              className="hidden md:flex w-[30px] h-[30px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)] items-center justify-center transition-colors"
              title="Search fixtures"
              aria-label="Search fixtures"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>

            <button
              onClick={toggleMonochrome}
              type="button"
              className={`hidden md:flex w-[30px] h-[30px] rounded-[8px] border items-center justify-center transition-colors ${
                isMonochrome
                  ? 'bg-white text-black border-white'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
              }`}
              title={isMonochrome ? 'Switch to color mode' : 'Switch to black & white mode'}
              aria-label="Toggle monochrome mode"
            >
              <Contrast className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>

            {/* Avatar: 30px circle button with 1px border */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                type="button"
                className="w-[30px] h-[30px] rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]/50 flex items-center justify-center text-[11.5px] font-mono font-[600] transition-colors"
                title="Account menu"
                aria-label="Account menu"
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : 'M'}
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-[12px] py-1.5 z-50 text-[12px] shadow-lg">
                  <div className="px-3.5 py-2.5 border-b border-[var(--border)]">
                    <p className="font-[600] text-[var(--text)] text-[12.5px]">{user?.fullName || 'Analyst'}</p>
                    <p className="text-[11px] text-[var(--text-3)] truncate mt-0.5">{user?.email || 'analyst@calibrall.app'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-[var(--text-3)]">Tier:</span>
                      <button
                        onClick={cycleTier}
                        type="button"
                        className="px-2 py-0.5 rounded-[5px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 font-mono text-[10px] capitalize font-[550] hover:bg-[var(--accent-soft)]/80"
                      >
                        {user?.subscriptionTier || 'pro'} (click to change)
                      </button>
                    </div>
                  </div>
                  <div className="py-1">
                    <DropdownInstallItem onSelect={() => setUserDropdownOpen(false)} />

                    <button
                      onClick={toggleMonochrome}
                      type="button"
                      className="w-full flex items-center px-3.5 py-1.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-left md:hidden text-[12px]"
                    >
                      <Contrast className="w-3.5 h-3.5 mr-2" strokeWidth={1.75} />
                      <span>{isMonochrome ? 'Switch to color mode' : 'Black & white mode'}</span>
                    </button>
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-1.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-[12px]"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2" strokeWidth={1.75} />
                      Settings & model filters
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-1.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-[12px]"
                    >
                      <User className="w-3.5 h-3.5 mr-2" strokeWidth={1.75} />
                      Subscription tier
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-1.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] text-[12px]"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" strokeWidth={1.75} />
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
