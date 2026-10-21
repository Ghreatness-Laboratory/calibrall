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
      className="md:hidden fixed left-3 right-3 z-40 transition-all duration-300 animate-in slide-in-from-bottom-4"
      style={{
        bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-3 flex items-center justify-between gap-2.5 shadow-xl">
        {/* Left: 32px logo */}
        <div className="w-8 h-8 rounded-[6px] overflow-hidden border border-white/[0.1] bg-[#f4f1ea] p-0.5 shrink-0 flex items-center justify-center relative">
          <Image
            src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
            alt="Calibrall logo"
            width={32}
            height={32}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Middle: Text */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="text-[13px] font-[500] text-[#e8efe9] leading-tight truncate">
            Install Calibrall
          </div>
          <div className="text-[11px] text-[#8fa69a] leading-tight truncate mt-0.5">
            Faster access and live fixture alerts
          </div>
        </div>

        {/* Right: Install lime button + Close X button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={promptInstall}
            type="button"
            className="h-[36px] px-3.5 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] active:bg-[#a5cf30] text-[#0a1812] font-[500] text-[13px] flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a] focus-visible:outline-offset-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>

          <button
            onClick={dismissBanner}
            type="button"
            aria-label="Dismiss installation prompt"
            className="w-[44px] h-[44px] rounded-[8px] text-[#8fa69a] hover:text-[#e8efe9] hover:bg-white/[0.05] flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
