'use client';

import React, { useState, useEffect } from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { WifiOff, AlertTriangle } from 'lucide-react';

export default function OfflineBanner() {
  const { isOffline } = useInstallPrompt();
  const [cachedTime, setCachedTime] = useState<string>('');

  useEffect(() => {
    if (isOffline && !cachedTime) {
      const now = new Date();
      setCachedTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC'
      );
    }
  }, [isOffline, cachedTime]);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-[#e3b341]/10 border-b border-[#e3b341]/30 text-[#e3b341] px-4 py-2 text-[12px] flex items-center justify-between gap-3 sticky top-[84px] z-30 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span className="font-[500] truncate">
          Offline: data may be out of date
        </span>
        <span className="text-[11px] text-[#e3b341]/80 hidden sm:inline">
          · Showing cached football intelligence snapshot ({cachedTime || 'saved session'}). Reconnect for real-time odds &amp; lines.
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] px-2 py-0.5 rounded-[4px] bg-[#e3b341]/20">
        <AlertTriangle className="w-3 h-3" />
        <span>Cached mode</span>
      </div>
    </div>
  );
}
