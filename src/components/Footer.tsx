import React from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[var(--bg)] border-t border-[var(--border)] mt-14 text-[12px] text-[var(--text-2)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        {/* Responsible Use Notice: warm amber-tinted card */}
        <div className="p-3.5 rounded-[12px] bg-[rgba(217,164,65,0.04)] border border-[rgba(217,164,65,0.30)] flex items-start gap-2.5">
          <AlertCircle className="w-[15px] h-[15px] text-[var(--warn)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="text-[11px] text-[var(--text-3)] leading-[1.6]">
            <strong className="font-[600] text-[var(--text-2)]">Responsible use disclaimer: </strong>
            Calibrall is an analytical terminal providing objective statistical estimates, Poisson goal matrices, and market edge comparisons. Football matches are inherently stochastic; statistical probability is not a guarantee of outcome. Calibrall does not accept wagers or provide financial advice. 18+ only.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* 11. Footer: 24px logo tile aligned top (flex: none so it never squishes), name 12.5px/620, description 11px --text-3 */}
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <div
                className="w-[24px] h-[24px] min-w-[24px] rounded-[6px] overflow-hidden border border-[var(--border)] bg-[#f4f1ea] mt-0.5 shrink-0"
                style={{ flex: 'none' }}
              >
                <img
                  src="/assets/aistudio/calibrall-profile-light_3415fbe5.png"
                  alt="Calibrall logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <span className="font-[620] text-[var(--text)] text-[12.5px] leading-tight block">
                  Calibrall
                </span>
                <p className="text-[10.5px] text-[var(--text-3)] leading-tight mt-0.5">Every call, on record.</p>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-3)] leading-normal mt-1.5">
              Market intelligence terminal for European football fixtures across goals, corners, cards, and match results.
            </p>
          </div>

          <div>
            <h4 className="text-[var(--text)] font-[600] text-[12.5px] mb-2">Analytics & models</h4>
            <ul className="space-y-1 text-[11.5px] text-[var(--text-2)]">
              <li><Link href="/methodology" className="hover:text-[var(--text)] transition-colors">Dixon-Coles goals engine</Link></li>
              <li><Link href="/methodology" className="hover:text-[var(--text)] transition-colors">Negative binomial corners</Link></li>
              <li><Link href="/methodology" className="hover:text-[var(--text)] transition-colors">Disciplinary card model</Link></li>
              <li><Link href="/performance" className="hover:text-[var(--text)] transition-colors">Brier score calibration</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[var(--text)] font-[600] text-[12.5px] mb-2">Navigation</h4>
            <ul className="space-y-1 text-[11.5px] text-[var(--text-2)]">
              <li><Link href="/dashboard" className="hover:text-[var(--text)] transition-colors">Dashboard</Link></li>
              <li><Link href="/matches" className="hover:text-[var(--text)] transition-colors">Fixtures</Link></li>
              <li><Link href="/predictions" className="hover:text-[var(--text)] transition-colors">Predictions</Link></li>
              <li><Link href="/markets" className="hover:text-[var(--text)] transition-colors">Market explorer</Link></li>
              <li><Link href="/pricing" className="hover:text-[var(--text)] transition-colors">Subscription tiers</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[var(--text)] font-[600] text-[12.5px] mb-2">Governance</h4>
            <ul className="space-y-1 text-[11.5px] text-[var(--text-2)]">
              <li><Link href="/responsible-use" className="hover:text-[var(--text)] transition-colors">Responsible use</Link></li>
              <li><Link href="/responsible-use" className="hover:text-[var(--text)] transition-colors">Terms of service</Link></li>
              <li><Link href="/responsible-use" className="hover:text-[var(--text)] transition-colors">Privacy policy</Link></li>
              <li><span className="text-[var(--accent)] font-mono text-[10.5px]">Dixon-Coles v2.4</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4 flex flex-col sm:flex-row items-center justify-between text-[var(--text-3)] text-[10.5px]">
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
