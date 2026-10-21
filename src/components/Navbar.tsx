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
    <header className="sticky top-0 z-40 bg-[#0a1812]/95 backdrop-blur-sm border-b border-white/[0.08]">
      {/* Top status bar: slim (28px), 11px mono, left "Dixon-Coles v2.4 online" with a small green dot, right "06:48 UTC" and a small outlined Pro chip. Strictly one line without wrapping. */}
      <div className="h-7 bg-[#07130e] border-b border-white/[0.06] px-4 text-[11px] font-mono flex items-center justify-between text-[#8fa69a] whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#b8e63a] shrink-0" />
          <span className="text-[#e8efe9]">Dixon-Coles v2.4 online</span>
        </div>

        <div className="flex items-center gap-3">
          <span suppressHydrationWarning>{timeStr || '06:48 UTC'}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] border border-[#e3b341]/60 text-[#e3b341] tracking-wide">
            {user?.subscriptionTier ? user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1).toLowerCase() : 'Pro'}
          </span>
        </div>
      </div>

      {/* Main header: 30px logo, "Calibrall" 15px/500, tagline 11px muted single line. Mobile right: avatar only. Desktop right: search, B&W icon button, avatar. Total height under 88px on mobile. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-[52px] md:h-14">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-[30px] h-[30px] min-w-[30px] min-h-[30px] rounded-[6px] overflow-hidden border border-white/[0.1] flex items-center justify-center bg-[#f4f1ea] shrink-0">
                <img
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[15px] font-[500] text-[#e8efe9] leading-tight group-hover:text-[#b8e63a] transition-colors whitespace-nowrap">
                  Calibrall
                </span>
                <span className="text-[11px] text-[#8fa69a] leading-tight whitespace-nowrap">
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
                    className={`px-3 py-1.5 rounded-[6px] text-[13px] font-[400] transition-colors ${
                      active
                        ? 'bg-white/[0.06] text-[#b8e63a]'
                        : 'text-[#8fa69a] hover:text-[#e8efe9] hover:bg-white/[0.03]'
                    }`}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side: On mobile, avatar only! On desktop, search + theme toggle + avatar. */}
          <div className="flex items-center gap-2">
            <Link
              href="/matches"
              className="hidden md:flex w-[30px] h-[30px] rounded-[6px] border border-white/[0.08] bg-[#0f2219] text-[#8fa69a] hover:text-[#e8efe9] items-center justify-center transition-colors"
              title="Search fixtures"
              aria-label="Search fixtures"
            >
              <Search className="w-3.5 h-3.5" />
            </Link>

            {/* Theme toggle: icon-only 30px button (hidden on mobile, accessible via avatar menu or desktop header) */}
            <button
              onClick={toggleMonochrome}
              type="button"
              className={`hidden md:flex w-[30px] h-[30px] rounded-[6px] border items-center justify-center transition-colors ${
                isMonochrome
                  ? 'bg-white text-black border-white'
                  : 'bg-[#0f2219] border-white/[0.08] text-[#8fa69a] hover:text-[#e8efe9] hover:border-white/20'
              }`}
              title={isMonochrome ? 'Switch to color mode' : 'Switch to black & white mode'}
              aria-label="Toggle monochrome mode"
            >
              <Contrast className="w-3.5 h-3.5" />
            </button>

            {/* Avatar / Account: icon-only 30px button */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                type="button"
                className="w-[30px] h-[30px] rounded-[6px] border border-white/[0.08] bg-[#0f2219] text-[#e8efe9] hover:border-white/20 flex items-center justify-center text-[12px] font-mono font-[500] transition-colors"
                title="Account menu"
                aria-label="Account menu"
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : 'A'}
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#0f2219] border border-white/[0.1] rounded-[8px] py-1.5 z-50 text-[12px] shadow-lg">
                  <div className="px-3 py-2 border-b border-white/[0.06]">
                    <p className="font-[500] text-[#e8efe9]">{user?.fullName || 'Analyst'}</p>
                    <p className="text-[11px] text-[#8fa69a] truncate">{user?.email || 'analyst@calibrall.app'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-[#8fa69a]">Tier:</span>
                      <button
                        onClick={cycleTier}
                        type="button"
                        className="px-2 py-0.5 rounded-[4px] bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30 font-mono text-[10px] capitalize font-[500] hover:bg-[#b8e63a]/25"
                      >
                        {user?.subscriptionTier || 'pro'} (click to change)
                      </button>
                    </div>
                  </div>
                  <div className="py-1">
                    {/* Mobile theme toggle in menu */}
                    <button
                      onClick={toggleMonochrome}
                      type="button"
                      className="w-full flex items-center px-3 py-1.5 text-[#8fa69a] hover:bg-white/[0.04] hover:text-[#e8efe9] text-left md:hidden"
                    >
                      <Contrast className="w-3.5 h-3.5 mr-2" />
                      <span>{isMonochrome ? 'Switch to color mode' : 'Black & white mode'}</span>
                    </button>
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3 py-1.5 text-[#8fa69a] hover:bg-white/[0.04] hover:text-[#e8efe9]"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2" />
                      Settings & model filters
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3 py-1.5 text-[#8fa69a] hover:bg-white/[0.04] hover:text-[#e8efe9]"
                    >
                      <User className="w-3.5 h-3.5 mr-2" />
                      Subscription tier
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3 py-1.5 text-[#8fa69a] hover:bg-white/[0.04] hover:text-[#e8efe9]"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" />
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
