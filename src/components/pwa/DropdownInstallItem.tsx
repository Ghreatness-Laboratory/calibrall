'use client';

import React from 'react';
import { useInstallPrompt } from './InstallPromptProvider';
import { Download, Smartphone } from 'lucide-react';

export default function DropdownInstallItem({
  onSelect,
}: {
  onSelect?: () => void;
}) {
  const { canShowButton, promptInstall, isInstalled, isIOS } = useInstallPrompt();

  if (!canShowButton || isInstalled) return null;

  const handleClick = async () => {
    if (onSelect) onSelect();
    await promptInstall();
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className="w-full flex items-center px-3 py-1.5 text-[12px] text-[#e8efe9] hover:bg-white/[0.04] hover:text-[#b8e63a] text-left transition-colors font-[500] border-b border-white/[0.06]"
      aria-label="Install Calibrall app"
    >
      {isIOS ? (
        <Smartphone className="w-4 h-4 mr-2 text-[#b8e63a] shrink-0" />
      ) : (
        <Download className="w-4 h-4 mr-2 text-[#b8e63a] shrink-0" />
      )}
      <span>Install app</span>
    </button>
  );
}
