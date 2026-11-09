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
  const [utcTime, setUtcTime] = useState<string>('20:50 UTC');
  const [dataMode, setDataMode] = useState<'live' | 'demo'>('demo');

  useEffect(() => {
    setUser(getStoredUser());

    // Check data provider status
    fetch('/api/v1/health')
      .then(r => r.json())
      .then(data => {
        if (data?.services?.provider?.isConfigured) {
          setDataMode('live');
        } else {
          setDataMode('demo');
        }
      })
      .catch(() => setDataMode('demo'));

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
    { label: 'Model Probabilities', href: '/predictions' },
    { label: 'Markets', href: '/markets' },
    { label: 'Record', href: '/performance' },
    { label: 'Watchlist', href: '/saved' },
  ];

  return (
    <header
      className="sticky top-0 z-40 bg-[#0A0E0C]/95 backdrop-blur-md border-b border-[#1F2A24]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-[18px]">
        {/* Top App Bar: 52px High */}
        <div className="flex items-center justify-between h-[52px]">
          {/* Left: 34px Logo Tile + Calibrall (15px 650) + Tagline (10.5px muted) */}
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2.5 group touch-press">
              <div className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[10px] overflow-hidden border border-[#1F2A24] flex items-center justify-center bg-[#E9EFEB] shrink-0">
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
                <span className="text-[15px] font-[650] text-[#E9EFEB] leading-tight group-hover:text-[#B8E636] transition-colors whitespace-nowrap tracking-[-0.015em]">
                  Calibrall
                </span>
                <span className="text-[10.5px] font-normal text-[#8B9892] leading-tight whitespace-nowrap mt-0.5">
                  Every call, on record.
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
                    className={`px-3 py-1.5 rounded-[11px] text-[12.5px] font-medium transition-colors ${
                      active
                        ? 'bg-[#151D19] text-[#B8E636]'
                        : 'text-[#8B9892] hover:text-[#E9EFEB] hover:bg-[#101613]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Live pill, PRO pill, 30px circular avatar */}
          <div className="flex items-center gap-2">
            <DesktopInstallButton />

            <Link
              href="/matches"
              className="hidden sm:flex w-[32px] h-[32px] rounded-[11px] border border-[#1F2A24] bg-[#101613] text-[#8B9892] hover:text-[#E9EFEB] items-center justify-center transition-colors touch-press"
              title="Search fixtures"
              aria-label="Search fixtures"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>

            {/* Live data pill */}
            <div
              className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1.5 leading-none tracking-tight select-none ${
                dataMode === 'live'
                  ? 'border-[#B8E636]/30 bg-[#B8E636]/12 text-[#B8E636]'
                  : 'border-[#E8B04A]/30 bg-[#E8B04A]/12 text-[#E8B04A]'
              }`}
              title={dataMode === 'live' ? 'Connected to live odds and statistical feeds' : 'Offline demo archive with real historical European data'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dataMode === 'live' ? 'bg-[#B8E636]' : 'bg-[#E8B04A]'}`} />
              <span>{dataMode === 'live' ? 'Live' : 'Demo'}</span>
            </div>

            {/* PRO pill */}
            <Link
              href="/pricing"
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-[#1F2A24] bg-[#101613] text-[#8B9892] hover:text-[#E9EFEB] hover:border-[#B8E636] transition-colors leading-none"
              title="Subscription tier: PRO"
            >
              PRO
            </Link>

            {/* 30px circular avatar */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                type="button"
                className="w-[30px] h-[30px] min-w-[30px] min-h-[30px] rounded-full border border-[#1F2A24] bg-[#151D19] text-[#E9EFEB] hover:border-[#B8E636] flex items-center justify-center text-[12px] font-semibold transition-colors touch-press"
                title="Account menu"
                aria-label="Account menu"
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : 'M'}
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#101613] border border-[#1F2A24] rounded-[14px] py-1.5 z-50 text-[12px] shadow-2xl">
                  <div className="px-3.5 py-2.5 border-b border-[#1F2A24]">
                    <p className="font-semibold text-[#E9EFEB] text-[12.5px]">{user?.fullName || 'Analyst'}</p>
                    <p className="text-[11px] text-[#8B9892] truncate mt-0.5">{user?.email || 'analyst@calibrall.app'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-[#8B9892]">Tier:</span>
                      <button
                        onClick={cycleTier}
                        type="button"
                        className="px-2 py-0.5 rounded-[6px] bg-[#B8E636]/12 text-[#B8E636] border border-[#B8E636]/30 text-[10.5px] capitalize font-semibold hover:bg-[#B8E636]/20"
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
                      className="w-full flex items-center px-3.5 py-2 text-[#8B9892] hover:bg-[#151D19] hover:text-[#E9EFEB] text-left text-[12px]"
                    >
                      <Contrast className="w-3.5 h-3.5 mr-2 text-[#8B9892]" strokeWidth={2} />
                      <span>{isMonochrome ? 'High Contrast Off' : 'High Contrast On'}</span>
                    </button>
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9892] hover:bg-[#151D19] hover:text-[#E9EFEB] text-[12px]"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2 text-[#8B9892]" strokeWidth={2} />
                      Settings & preferences
                    </Link>
                    <Link
                      href="/creators"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9892] hover:bg-[#151D19] hover:text-[#B8E636] text-[12px]"
                    >
                      <Building2 className="w-3.5 h-3.5 mr-2 text-[#B8E636]" strokeWidth={2} />
                      Meet the creators
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9892] hover:bg-[#151D19] hover:text-[#E9EFEB] text-[12px]"
                    >
                      <User className="w-3.5 h-3.5 mr-2 text-[#8B9892]" strokeWidth={2} />
                      Subscription tier
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3.5 py-2 text-[#8B9892] hover:bg-[#151D19] hover:text-[#E9EFEB] text-[12px]"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2 text-[#8B9892]" strokeWidth={2} />
                      System admin
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Slim status strip under the header: model status at 10.5px, with clock on right */}
      <div className="border-t border-[#1F2A24] bg-[#0A0E0C]/90 px-[18px] py-1">
        <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto flex items-center justify-between text-[10.5px] text-[#8B9892]">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B8E636] shrink-0" />
            <span>Dixon Coles v2.5 online</span>
          </div>
          <span className="tabular-nums font-medium text-[#8B9892]" suppressHydrationWarning>
            {utcTime}
          </span>
        </div>
      </div>
    </header>
  );
}
