'use client';

import React, { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-12 space-y-4">
      <div className="space-y-1.5">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E2AE45]">
          Application Notice
        </span>
        <h1 className="text-[22px] font-bold text-[#ECF1EE]">
          Something went wrong
        </h1>
        <p className="text-[12.5px] text-[#8B9890] max-w-sm mx-auto">
          An error occurred while rendering this view. You can retry the operation.
        </p>
      </div>

      <button
        onClick={() => reset()}
        type="button"
        className="inline-flex items-center gap-1.5 px-4 h-[40px] rounded-[11px] bg-[#B6E63B] text-[#0A0F0D] font-semibold text-[13px] hover:bg-[#c3ed4e] transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Try again</span>
      </button>
    </div>
  );
}
