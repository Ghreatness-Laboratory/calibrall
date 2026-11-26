'use client';

import React from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { Download, Smartphone, CheckCircle2 } from 'lucide-react';

export default function AccountInstallRow() {
  const { canShowButton, promptInstall, isInstalled, isIOS } = useInstallPrompt();

  if (isInstalled) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[var(--text)]">Calibrall app installed</div>
            <div className="text-[11.5px] text-[var(--text-2)]">Running in standalone mode</div>
          </div>
        </div>
        <span className="text-[10.5px] text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-2.5 py-0.5 rounded-full font-semibold">
          Active
        </span>
      </div>
    );
  }

  if (!canShowButton) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
          {isIOS ? <Smartphone className="w-4 h-4" strokeWidth={2} /> : <Download className="w-4 h-4" strokeWidth={2} />}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[var(--text)]">Install Calibrall app</div>
          <div className="text-[11.5px] text-[var(--text-2)]">
            Add to Home Screen for fast access, offline cache, and line updates
          </div>
        </div>
      </div>

      <button
        onClick={promptInstall}
        type="button"
        className="min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] text-[13px] font-bold flex items-center justify-center gap-2 self-start sm:self-auto shrink-0 touch-press"
      >
        <Download className="w-4 h-4" strokeWidth={2} />
        <span>Install app</span>
      </button>
    </div>
  );
}
