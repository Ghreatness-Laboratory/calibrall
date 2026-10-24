'use client';

import React from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { Download, Smartphone, CheckCircle2 } from 'lucide-react';

export default function AccountInstallRow() {
  const { canShowButton, promptInstall, isInstalled, isIOS } = useInstallPrompt();

  if (isInstalled) {
    return (
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#ECF1EE]">Calibrall app installed</div>
            <div className="text-[11.5px] text-[#8B9890]">Running in standalone terminal mode</div>
          </div>
        </div>
        <span className="text-[10px] font-mono text-[#B6E63B] bg-[rgba(182,230,59,0.12)] border border-[#B6E63B]/30 px-2 py-0.5 rounded-[5px]">
          Active
        </span>
      </div>
    );
  }

  if (!canShowButton) return null;

  return (
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[8px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] flex items-center justify-center shrink-0">
          {isIOS ? <Smartphone className="w-4 h-4" strokeWidth={2} /> : <Download className="w-4 h-4" strokeWidth={2} />}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#ECF1EE]">Install Calibrall app</div>
          <div className="text-[11.5px] text-[#8B9890]">
            Add to Home Screen for fast standalone access, offline cache, and line updates
          </div>
        </div>
      </div>

      <button
        onClick={promptInstall}
        type="button"
        className="min-h-[44px] px-4 rounded-[11px] bg-[#B6E63B] hover:bg-[#c8ee47] text-[#0A0F0D] text-[13px] font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.98] self-start sm:self-auto shrink-0 touch-press"
      >
        <Download className="w-3.5 h-3.5" strokeWidth={2} />
        <span>Install app</span>
      </button>
    </div>
  );
}
