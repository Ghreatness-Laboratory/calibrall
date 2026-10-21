import React from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#07130e] border-t border-white/[0.08] mt-16 text-[12px] text-[#8fa69a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Responsible Use Notice */}
        <div className="mb-6 p-3.5 rounded-[8px] bg-[#0f2219] border border-white/[0.08] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#e3b341] shrink-0 mt-0.5" />
          <div className="text-[#8fa69a] text-[12px] leading-normal">
            <span className="font-[500] text-[#e8efe9]">Responsible use disclaimer: </span>
            Calibrall is an analytical terminal providing objective statistical estimates, Poisson goal matrices, and market edge comparisons. Football matches are inherently stochastic; statistical probability is not a guarantee of outcome. Calibrall does not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-[4px] overflow-hidden border border-white/10 bg-[#f4f1ea] shrink-0">
                <img
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="font-[500] text-[#e8efe9] text-[14px]">Calibrall</span>
            </div>
            <p className="text-[11px] text-[#8fa69a]">Every call, on record.</p>
            <p className="text-[#8fa69a] text-[12px] leading-normal">
              Market intelligence terminal for European football fixtures across goals, corners, cards, and match results.
            </p>
          </div>

          <div>
            <h4 className="text-[#e8efe9] font-[500] text-[13px] mb-2">Analytics & models</h4>
            <ul className="space-y-1 text-[12px]">
              <li><Link href="/methodology" className="hover:text-[#e8efe9] transition-colors">Dixon-Coles goals engine</Link></li>
              <li><Link href="/methodology" className="hover:text-[#e8efe9] transition-colors">Negative binomial corners</Link></li>
              <li><Link href="/methodology" className="hover:text-[#e8efe9] transition-colors">Disciplinary card model</Link></li>
              <li><Link href="/performance" className="hover:text-[#e8efe9] transition-colors">Brier score calibration</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#e8efe9] font-[500] text-[13px] mb-2">Navigation</h4>
            <ul className="space-y-1 text-[12px]">
              <li><Link href="/dashboard" className="hover:text-[#e8efe9] transition-colors">Dashboard</Link></li>
              <li><Link href="/matches" className="hover:text-[#e8efe9] transition-colors">Fixtures</Link></li>
              <li><Link href="/predictions" className="hover:text-[#e8efe9] transition-colors">Predictions</Link></li>
              <li><Link href="/markets" className="hover:text-[#e8efe9] transition-colors">Market explorer</Link></li>
              <li><Link href="/pricing" className="hover:text-[#e8efe9] transition-colors">Subscription tiers</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#e8efe9] font-[500] text-[13px] mb-2">Governance</h4>
            <ul className="space-y-1 text-[12px]">
              <li><Link href="/responsible-use" className="hover:text-[#e8efe9] transition-colors">Responsible use</Link></li>
              <li><Link href="/responsible-use" className="hover:text-[#e8efe9] transition-colors">Terms of service</Link></li>
              <li><Link href="/responsible-use" className="hover:text-[#e8efe9] transition-colors">Privacy policy</Link></li>
              <li><span className="text-[#b8e63a] font-mono text-[11px]">Dixon-Coles v2.4</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/[0.06] mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between text-[#8fa69a] text-[11px]">
          <div>
            © {new Date().getFullYear()} Calibrall. All rights reserved.
          </div>
          <div className="flex items-center gap-4 mt-2 sm:mt-0 font-mono">
            <span>Latency: ~18ms</span>
            <span>PostgreSQL RLS Active</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
