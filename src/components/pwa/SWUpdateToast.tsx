'use client';

import React, { useState } from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export default function SWUpdateToast() {
  const { waitingWorker, applyUpdate } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!waitingWorker || dismissed) return null;

  const handleRefresh = () => {
    setIsUpdating(true);
    applyUpdate();
  };

  return (
    <div
      role="alert"
      className="fixed top-4 right-4 z-50 max-w-sm w-full bg-[#0f2219] border border-[#b8e63a]/40 rounded-[10px] p-3 shadow-2xl animate-in slide-in-from-top-4 text-[12px]"
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-[#e8efe9] min-w-0">
          <Sparkles className="w-4 h-4 text-[#b8e63a] shrink-0" />
          <span className="font-[500] truncate">New version available</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={isUpdating}
            type="button"
            className="h-[28px] px-3 rounded-[6px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] font-[500] text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? 'Updating...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setDismissed(true)}
            type="button"
            aria-label="Dismiss update notification"
            className="w-7 h-7 rounded-[6px] text-[#8fa69a] hover:text-[#e8efe9] flex items-center justify-center hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
