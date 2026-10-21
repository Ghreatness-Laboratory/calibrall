'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RefreshCw, WifiOff, Wifi, ArrowLeft } from 'lucide-react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : false);

    const handleOnline = () => {
      setIsOnline(true);
      // Auto reload after brief confirmation
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsChecking(true);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      window.location.reload();
    } else {
      setTimeout(() => {
        setIsChecking(false);
      }, 800);
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-12">
      <div className="max-w-md w-full bg-[#0f2219] border border-white/[0.08] rounded-[16px] p-8 flex flex-col items-center space-y-6 shadow-xl">
        {/* Calibrall Logo */}
        <div className="relative">
          <div className="w-16 h-16 rounded-[14px] overflow-hidden border border-white/[0.1] bg-[#f4f1ea] p-1 flex items-center justify-center shadow-md relative">
            <Image
              src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
              alt="Calibrall logo"
              width={64}
              height={64}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0a1812] border border-white/[0.1] flex items-center justify-center">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-[#b8e63a]" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
        </div>

        {/* Text */}
        <div className="space-y-1.5">
          <h1 className="text-[18px] font-[500] text-[#e8efe9]">
            {isOnline ? 'Connection restored' : "You're offline"}
          </h1>
          <p className="text-[13px] text-[#8fa69a] max-w-xs mx-auto leading-relaxed">
            {isOnline
              ? 'Reloading live football intelligence and market odds...'
              : 'Reconnect to see live fixtures and picks.'}
          </p>
        </div>

        {/* Action Button */}
        <div className="w-full space-y-3 pt-2">
          <button
            onClick={handleRetry}
            disabled={isChecking}
            type="button"
            className="w-full h-[44px] rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] active:bg-[#a5cf30] text-[#0a1812] font-[500] text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking connection...' : 'Try again'}</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-[#8fa69a] hover:text-[#e8efe9] transition-colors py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to dashboard</span>
          </Link>
        </div>

        {/* Informational note */}
        <div className="text-[11px] font-mono text-[#8fa69a]/70 pt-2 border-t border-white/[0.06] w-full">
          Calibrall PWA shell active · Offline fallback
        </div>
      </div>
    </div>
  );
}
