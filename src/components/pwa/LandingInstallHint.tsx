'use client';

import React, { useState } from 'react';
import { Smartphone, Download } from 'lucide-react';
import { useInstallPrompt } from '@/components/pwa/InstallPromptProvider';

export default function LandingInstallHint() {
  const { isInstalled, isInstallable, isIOS, promptInstall } = useInstallPrompt();
  const [showTip, setShowTip] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable || isIOS) {
      const triggered = await promptInstall();
      if (triggered) return;
    }
    setShowTip((prev) => !prev);
  };

  return (
    <div className="md:hidden bg-[var(--surface)] border border-[var(--line)] rounded-[16px] p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            {isIOS ? (
              <Smartphone className="w-4 h-4" strokeWidth={2} />
            ) : (
              <Download className="w-4 h-4" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--text)] leading-tight">
              Add to home screen
            </div>
            <div className="text-[11px] text-[var(--text-2)] leading-tight mt-0.5">
              Install Calibrall on your phone for quick access
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClick}
          className="min-h-[38px] px-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--accent)] text-[12px] font-semibold text-[var(--text)] shrink-0 touch-press"
        >
          Install
        </button>
      </div>

      {showTip && (
        <p className="text-[11.5px] text-[var(--text-2)] leading-[1.45] pt-1 border-t border-[var(--line)]">
          Open your browser menu and choose <span className="text-[var(--text)] font-medium">Add to Home Screen</span> (or <span className="text-[var(--text)] font-medium">Install app</span>) to save Calibrall.
        </p>
      )}
    </div>
  );
}
