'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Activity, 
  Layers, 
  BarChart3, 
  Bookmark, 
  ShieldAlert, 
  Sliders, 
  Search, 
  Clock, 
  Database,
  User,
  CheckCircle2,
  Lock,
  ChevronDown,
  Contrast
} from 'lucide-react';
import { getStoredUser, setStoredUser, isSupabaseConfigured } from '@/lib/supabase/client';
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

    // Initialize Black & White state
    try {
      const saved = localStorage.getItem('calibrall_monochrome_mode') === 'true';
      setIsMonochrome(saved);
      if (saved) {
        document.documentElement.classList.add('monochrome');
      }
    } catch (e) {
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
    { label: 'Today’s Picks', href: '/predictions', icon: CheckCircle2 },
    { label: 'Market Explorer', href: '/markets', icon: Sliders },
    { label: 'Performance', href: '/performance', icon: BarChart3 },
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
    <header className="sticky top-0 z-50 bg-[#0c1017]/95 backdrop-blur border-b border-border-subtle">
      {/* Top micro-bar: Environment & Engine Freshness */}
      <div className="bg-[#07090e] border-b border-border-subtle/60 px-4 py-1 text-xs flex items-center justify-between text-gray-400">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1 font-mono text-[11px] text-brand-emerald">
            <span className="w-2 h-2 rounded-full bg-brand-emerald animate-pulse"></span>
            <span>MODEL ENGINE: DIXON-COLES v2.4 ONLINE</span>
          </span>
          <span className="hidden md:inline-block text-gray-600">|</span>
          <span className="hidden md:flex items-center space-x-1 text-gray-400">
            <Database className="w-3 h-3 text-brand-blue" />
            <span>{isSupabaseConfigured ? 'Supabase Connected' : 'Development Seed Mode (Isolated)'}</span>
          </span>
        </div>
        <div className="flex items-center space-x-4 font-mono text-[11px]">
          <span className="flex items-center space-x-1" suppressHydrationWarning>
            <Clock className="w-3 h-3 text-gray-500" />
            <span suppressHydrationWarning>{timeStr || '12:00 UTC'}</span>
          </span>
          <Link href="/pricing" className="text-brand-amber hover:underline flex items-center space-x-1">
            <span>Tier:</span>
            <span className="uppercase font-bold tracking-wider">{user?.subscriptionTier || 'PRO'}</span>
          </Link>
        </div>
      </div>

      {/* Main navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-border flex items-center justify-center bg-[#f4f1ea] shadow-glow-lime">
                <img
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold tracking-tight text-white text-base">Calibrall</span>
                  <span className="w-2 h-2 rounded-full bg-brand-accent shadow-glow-lime" title="Live Model Active" />
                </div>
                <span className="block text-[9px] uppercase tracking-wider text-gray-400 -mt-0.5 font-mono">Every call, on record.</span>
              </div>
            </Link>

            {/* Nav links */}
            <nav className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      active
                        ? 'bg-surface-50 text-brand-emerald border border-border'
                        : 'text-gray-300 hover:text-white hover:bg-surface-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center space-x-2.5">
            <Link 
              href="/matches" 
              className="hidden sm:flex items-center space-x-1.5 text-xs text-gray-400 bg-surface-200 border border-border px-2.5 py-1.5 rounded hover:text-white"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search fixtures...</span>
              <kbd className="font-mono text-[10px] bg-surface-50 px-1 rounded text-gray-400">⌘K</kbd>
            </Link>

            {/* Black & White Mode Toggle Button */}
            <button
              onClick={toggleMonochrome}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-all ${
                isMonochrome
                  ? 'bg-white text-black border-white font-bold shadow-md'
                  : 'bg-surface-200 border-border text-gray-300 hover:text-white hover:border-gray-500'
              }`}
              title={isMonochrome ? 'Switch to Color Mode' : 'Switch to Black & White (Noir Terminal) Mode'}
            >
              <Contrast className="w-3.5 h-3.5" />
              <span>{isMonochrome ? 'B&W ON' : 'B&W'}</span>
            </button>

            <Link
              href="/admin"
              className={`p-1.5 rounded border text-xs transition-colors ${
                pathname === '/admin'
                  ? 'bg-surface-50 text-white border-brand-emerald'
                  : 'bg-surface-200 border-border text-gray-400 hover:text-white'
              }`}
              title="Admin Terminal"
            >
              <Lock className="w-3.5 h-3.5" />
            </Link>

            {/* User Account / Tier Switcher */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-2 bg-surface-200 border border-border hover:border-gray-600 px-2.5 py-1 rounded text-xs text-gray-200"
              >
                <div className="w-5 h-5 rounded-full bg-brand-blue/30 text-brand-blue flex items-center justify-center font-bold text-[10px]">
                  {user?.fullName ? user.fullName[0] : 'U'}
                </div>
                <span className="hidden sm:inline font-medium">{user?.fullName.split(' ')[0] || 'Analyst'}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-surface-100 border border-border rounded shadow-xl py-2 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-border/70">
                    <p className="font-semibold text-white">{user?.fullName}</p>
                    <p className="text-gray-400 truncate">{user?.email}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">Current Tier:</span>
                      <button
                        onClick={cycleTier}
                        className="px-2 py-0.5 rounded bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30 font-mono text-[10px] uppercase font-bold hover:bg-brand-emerald/20"
                      >
                        {user?.subscriptionTier} (Click to toggle)
                      </button>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3 py-1.5 text-gray-300 hover:bg-surface-50 hover:text-white"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2" />
                      Preferences & Models
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3 py-1.5 text-gray-300 hover:bg-surface-50 hover:text-white"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 mr-2" />
                      Subscription Plans
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center px-3 py-1.5 text-gray-300 hover:bg-surface-50 hover:text-white"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" />
                      System Admin
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
