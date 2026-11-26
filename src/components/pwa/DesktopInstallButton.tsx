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
      className="hidden md:inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-[var(--line)] hover:border-[var(--accent)] bg-[var(--surface)] text-[var(--text)] hover:text-[var(--accent)] text-[12px] font-medium transition-colors touch-press"
      title="Install Calibrall app"
      aria-label="Install Calibrall app"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Install app</span>
    </button>
  );
}
