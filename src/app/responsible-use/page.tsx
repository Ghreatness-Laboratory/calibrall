import React from 'react';
import { ShieldCheck, AlertCircle, Lock } from 'lucide-react';

export default function ResponsibleUsePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 py-2 text-[12.5px] sm:text-[13px] leading-[1.5] text-[var(--text-2)]">
      <header className="space-y-1 pb-3 border-b border-[var(--line)]">
        <span className="text-[11px] text-[var(--accent)] font-medium block">
          Compliance &amp; standards
        </span>
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] tracking-[-0.02em] text-[var(--text)]">
          Responsible use &amp; disclosures
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)]">
          Last updated: October 2026 · Calibrall compliance &amp; quantitative standards.
        </p>
      </header>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[var(--medium)]" />
          <span>1. Core product identity &amp; anti-wagering policy</span>
        </h2>
        <p className="leading-[1.55]">
          Calibrall is an analytical workspace for football and basketball statistical modeling.{' '}
          <strong className="text-[var(--text)]">
            Calibrall is not a bookmaker, betting exchange, or gambling operator.
          </strong>{' '}
          We do not accept, process, or facilitate wagers or cash transactions on sporting events.
        </p>
        <p className="leading-[1.55]">
          All probabilities, expected goals (xG), and calibrated outputs are quantitative mathematical estimates. Matches are influenced by human factors, refereeing, weather, injuries, and variance.
        </p>
      </section>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
          <span>2. Probabilistic disclaimer &amp; uncertainty</span>
        </h2>
        <p className="leading-[1.55]">
          High probability does not guarantee occurrence. A projected 75% probability means that under similar historical distributions, the outcome occurred roughly three times out of four and failed one time out of four.
        </p>
        <p className="leading-[1.55]">
          Users must exercise independent judgment. Past calibration does not guarantee future performance.
        </p>
      </section>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)]">
          3. Age restriction &amp; support resources
        </h2>
        <p className="leading-[1.55]">
          This service is intended for adults aged 18 or older. If you or someone you know needs support regarding gambling-related harm, consult free confidential resources:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[var(--accent)] text-[12.5px] leading-[1.55]">
          <li>National Council on Problem Gambling (US): 1 800 522 4700 / ncpgambling.org</li>
          <li>GamCare (UK): 0808 8020 133 / gamcare.org.uk</li>
          <li>Gambling Help Online (Australia): 1800 858 858 / gamblinghelponline.org.au</li>
        </ul>
      </section>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[var(--accent)]" />
          <span>4. Privacy &amp; data minimization</span>
        </h2>
        <p className="leading-[1.55]">
          We follow strict data minimization principles: we do not sell user data, track off-platform browsing, or store plaintext credentials. You may export or clear your saved fixtures and settings at any time.
        </p>
      </section>
    </div>
  );
}
