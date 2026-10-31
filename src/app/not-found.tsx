'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-12 space-y-4">
      <div className="space-y-1.5">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#B6E63B]">
          404 Not Found
        </span>
        <h1 className="text-[22px] font-bold text-[#ECF1EE]">
          Page not found
        </h1>
        <p className="text-[12.5px] text-[#8B9890] max-w-sm mx-auto">
          The requested page or market analytics route could not be found.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 px-4 h-[40px] rounded-[11px] bg-[#151E19] border border-white/[0.07] text-[13px] text-[#ECF1EE] hover:bg-white/[0.05] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to dashboard</span>
      </Link>
    </div>
  );
}
