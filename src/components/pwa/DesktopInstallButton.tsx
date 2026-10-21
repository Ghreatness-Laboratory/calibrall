'use client';

import React from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { Download } from 'lucide-react';

export default function DesktopInstallButton() {
  const { canShowButton, promptInstall, isInstalled } = useInstallPrompt();

  if (!canShowButton || isInstalled) return null;

  return (
    <button
      onClick={promptInstall}
      type="button"
      className="hidden md:inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[6px] border border-white/[0.08] hover:border-[#b8e63a]/50 bg-[#0f2219] hover:bg-[#0f2219]/80 text-[#e8efe9] hover:text-[#b8e63a] text-[12px] font-[500] transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a]"
      title="Install Calibrall app"
      aria-label="Install Calibrall app"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Install app</span>
    </button>
  );
}
