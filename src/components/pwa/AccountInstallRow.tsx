'use client';

import React from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { Download, Smartphone, CheckCircle2 } from 'lucide-react';

export default function AccountInstallRow() {
  const { canShowButton, promptInstall, isInstalled, isIOS } = useInstallPrompt();

  if (isInstalled) {
    return (
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#b8e63a]/15 text-[#b8e63a] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[13px] font-[500] text-[#e8efe9]">Calibrall app installed</div>
            <div className="text-[11px] text-[#8fa69a]">Running in standalone terminal mode</div>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[#b8e63a] bg-[#b8e63a]/15 border border-[#b8e63a]/30 px-2 py-0.5 rounded-[4px]">
          Active
        </span>
      </div>
    );
  }

  if (!canShowButton) return null;

  return (
    <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[8px] bg-[#b8e63a]/15 text-[#b8e63a] flex items-center justify-center shrink-0">
          {isIOS ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        </div>
        <div>
          <div className="text-[13px] font-[500] text-[#e8efe9]">Install Calibrall app</div>
          <div className="text-[11px] text-[#8fa69a]">
            Add to Home Screen for fast standalone access, offline shell, and live alerts
          </div>
        </div>
      </div>

      <button
        onClick={promptInstall}
        type="button"
        className="h-[36px] px-4 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] text-[13px] font-[500] flex items-center justify-center gap-2 transition-colors self-start sm:self-auto shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install app</span>
      </button>
    </div>
  );
}
