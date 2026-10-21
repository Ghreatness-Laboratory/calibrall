'use client';

import Image from 'next/image';
import { useInstallPrompt } from './InstallPromptProvider';
import { Share, PlusSquare, X } from 'lucide-react';

export default function IOSInstallModal() {
  const { showIOSSheet, setShowIOSSheet } = useInstallPrompt();

  if (!showIOSSheet) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Calibrall to Home Screen"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => setShowIOSSheet(false)}
    >
      <div
        className="w-full sm:max-w-md bg-[#0f2219] border-t sm:border border-white/[0.1] rounded-t-[16px] sm:rounded-[14px] p-5 space-y-4 shadow-2xl pb-[calc(20px+env(safe-area-inset-bottom,0px))] sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] overflow-hidden border border-white/[0.1] bg-[#f4f1ea] p-0.5 shrink-0 relative">
              <Image
                src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                alt="Calibrall logo"
                width={32}
                height={32}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h2 className="text-[14px] font-[500] text-[#e8efe9]">Install Calibrall on iOS</h2>
              <p className="text-[11px] text-[#8fa69a]">Add to Home Screen for the full native terminal</p>
            </div>
          </div>

          <button
            onClick={() => setShowIOSSheet(false)}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#8fa69a] hover:text-[#e8efe9] hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-3 py-1 text-[13px] text-[#e8efe9]">
          <div className="flex items-start gap-3 p-3 rounded-[8px] bg-[#0a1812] border border-white/[0.06]">
            <div className="w-7 h-7 rounded-[6px] bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5 text-[#5eb6e8]">
              <Share className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="font-[500] text-[#e8efe9]">1. Tap the Share icon</div>
              <div className="text-[12px] text-[#8fa69a]">
                Located in Safari&apos;s bottom toolbar (or top right on iPad).
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-[8px] bg-[#0a1812] border border-white/[0.06]">
            <div className="w-7 h-7 rounded-[6px] bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5 text-[#b8e63a]">
              <PlusSquare className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="font-[500] text-[#e8efe9]">2. Choose Add to Home Screen</div>
              <div className="text-[12px] text-[#8fa69a]">
                Scroll down in the share sheet and tap &quot;Add to Home Screen&quot;.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-[8px] bg-[#0a1812] border border-white/[0.06]">
            <div className="w-7 h-7 rounded-[6px] bg-[#b8e63a]/15 text-[#b8e63a] font-mono text-[12px] font-[500] flex items-center justify-center shrink-0 mt-0.5">
              3
            </div>
            <div className="space-y-0.5">
              <div className="font-[500] text-[#e8efe9]">3. Tap Add</div>
              <div className="text-[12px] text-[#8fa69a]">
                Confirm in the top right corner. Calibrall will appear on your Home Screen.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <button
          onClick={() => setShowIOSSheet(false)}
          type="button"
          className="w-full h-[40px] rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] font-[500] text-[13px] transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
