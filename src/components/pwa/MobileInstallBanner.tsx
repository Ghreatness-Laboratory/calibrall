'use client';

import Image from 'next/image';
import { useInstallPrompt } from './InstallPromptProvider';
import { X, Download } from 'lucide-react';

export default function MobileInstallBanner() {
  const { isBannerVisible, promptInstall, dismissBanner, isInstalled } = useInstallPrompt();

  if (!isBannerVisible || isInstalled) return null;

  return (
    <div
      role="region"
      aria-label="Install Calibrall application prompt"
      className="md:hidden fixed left-4 right-4 z-40 transition-all duration-150"
      style={{
        bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-3 flex items-center justify-between gap-2.5 backdrop-blur-xl">
        <div className="w-9 h-9 rounded-[10px] overflow-hidden border border-[var(--line)] bg-[#EEF2F0] p-0.5 shrink-0 flex items-center justify-center relative">
          <Image
            src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
            alt="Calibrall logo"
            width={36}
            height={36}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">
            Install Calibrall
          </div>
          <div className="text-[11px] text-[var(--text-2)] leading-tight truncate mt-0.5">
            Faster access and live fixture alerts
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={promptInstall}
            type="button"
            className="min-h-[44px] px-3.5 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[12.5px] flex items-center gap-1.5 touch-press"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>

          <button
            onClick={dismissBanner}
            type="button"
            aria-label="Dismiss installation prompt"
            className="w-[44px] h-[44px] rounded-[12px] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center justify-center touch-press"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
