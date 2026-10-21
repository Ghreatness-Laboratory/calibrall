import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Cpu, Database, AlertCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#07090e] border-t border-border-subtle mt-20 text-xs text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Responsible Use Notice */}
        <div className="mb-8 p-4 rounded bg-surface-100 border border-border-subtle flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
          <div className="text-gray-300 text-xs leading-relaxed">
            <span className="font-semibold text-white">Responsible Use & Probabilistic Disclaimer: </span>
            CALIBRALL is an analytical terminal providing objective statistical estimates, Poisson goal matrices, and market edge comparisons. Football matches are inherently stochastic; high statistical probability is not a guarantee of occurrence. CALIBRALL does not take wagers, manage bets, or offer guaranteed financial returns. 18+ only.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 font-bold text-white text-sm mb-3">
              <span className="w-5 h-5 rounded bg-brand-emerald flex items-center justify-center text-[10px] text-white font-mono">C</span>
              <span>CALIBRALL</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Institutional-grade market intelligence terminal for European football fixtures. Multi-market evaluation across goals, corners, cards, and match results.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Analytics & Models</h4>
            <ul className="space-y-1.5">
              <li><Link href="/methodology" className="hover:text-white transition-colors">Dixon-Coles Goals Engine</Link></li>
              <li><Link href="/methodology" className="hover:text-white transition-colors">Negative Binomial Corners</Link></li>
              <li><Link href="/methodology" className="hover:text-white transition-colors">Disciplinary Count Model</Link></li>
              <li><Link href="/performance" className="hover:text-white transition-colors">Brier Calibration Audit</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Platform Navigation</h4>
            <ul className="space-y-1.5">
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Terminal Dashboard</Link></li>
              <li><Link href="/matches" className="hover:text-white transition-colors">Fixtures Explorer</Link></li>
              <li><Link href="/predictions" className="hover:text-white transition-colors">Today’s Top Qualified Picks</Link></li>
              <li><Link href="/markets" className="hover:text-white transition-colors">Cross-Match Market Explorer</Link></li>
              <li><Link href="/pricing" className="hover:text-white transition-colors">Subscription Tiers</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Trust & Governance</h4>
            <ul className="space-y-1.5">
              <li><Link href="/responsible-use" className="hover:text-white transition-colors">Responsible Gaming & Use</Link></li>
              <li><Link href="/responsible-use" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/responsible-use" className="hover:text-white transition-colors">Privacy & Data Minimization</Link></li>
              <li><span className="text-brand-emerald font-mono">Engine: v2.4-stable</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border-subtle mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between text-gray-500 text-[11px]">
          <div>
            © {new Date().getFullYear()} CALIBRALL Intelligence Inc. All rights reserved.
          </div>
          <div className="flex items-center space-x-4 mt-2 sm:mt-0 font-mono">
            <span className="flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-brand-emerald" />
              <span>Inference: ~18ms</span>
            </span>
            <span className="flex items-center space-x-1">
              <Database className="w-3.5 h-3.5 text-brand-blue" />
              <span>PostgreSQL RLS Active</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
