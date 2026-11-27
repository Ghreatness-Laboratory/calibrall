import React from 'react';
import { Cpu, TrendingUp, Layers } from 'lucide-react';

export default function MethodologyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 py-2 text-[12.5px] sm:text-[13px] leading-[1.5] text-[var(--text-2)]">
      <header className="space-y-1 pb-3 border-b border-[var(--line)]">
        <span className="text-[11px] text-[var(--accent)] font-medium block">
          Architecture philosophy
        </span>
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] tracking-[-0.02em] text-[var(--text)]">
          Mathematical methodology
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)]">
          Documentation of our statistical pipelines, Dixon-Coles Poisson parameters, and market selection engine.
        </p>
      </header>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2.5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--accent)]" />
          <span>1. The Dixon-Coles bivariate goal model</span>
        </h2>
        <p className="leading-[1.55]">
          While naive Poisson regression assumes home and away goal scoring are independent, empirical football data reveals negative correlation at low scores (0-0, 1-0, 0-1, 1-1). Calibrall applies the Dixon &amp; Coles (1997) adjustment:
        </p>

        <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] font-mono text-[11.5px] text-[var(--text)] space-y-1 overflow-x-auto">
          <p>P(X = x, Y = y) = τ(x, y, λ, μ, ρ) × [ (λ^x · e^−λ) / x! ] × [ (μ^y · e^−μ) / y! ]</p>
          <p className="text-[var(--text-2)] mt-2">Adjustment parameter τ(x, y, λ, μ, ρ):</p>
          <ul className="list-disc pl-5 text-[var(--accent)] space-y-0.5">
            <li>τ(0, 0) = 1 − λ · μ · ρ</li>
            <li>τ(1, 0) = 1 + μ · ρ</li>
            <li>τ(0, 1) = 1 + λ · ρ</li>
            <li>τ(1, 1) = 1 − ρ</li>
            <li>τ(x, y) = 1.0 for all other scorelines</li>
          </ul>
        </div>
        <p className="leading-[1.55]">
          We estimate empirical correlation ρ ≈ −0.13 across elite leagues. From the 10×10 scoreline matrix, we derive exact probabilities for Home Win, Draw, Away Win, Both Teams to Score, and Over/Under goal lines.
        </p>
      </section>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2.5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
          <span>2. Corner volume &amp; disciplinary count distributions</span>
        </h2>
        <p className="leading-[1.55]">
          Corner kicks exhibit overdispersion relative to goals. We deploy a compound Poisson / Negative Binomial count model computing expected corners from:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[var(--text)] text-[12.5px] leading-[1.55]">
          <li>Rolling corner winning and conceding rates (past 20 league matches)</li>
          <li>Crossing frequency and field tilt metrics</li>
          <li>Opposition defensive block depth</li>
        </ul>
        <p className="leading-[1.55]">
          For disciplinary cards (yellow = 1, red = 2), our model integrates referee historical issuance rates with rivalry intensity multipliers.
        </p>
      </section>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2.5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--accent)]" />
          <span>3. Market selection &amp; model probability</span>
        </h2>
        <p className="leading-[1.55]">
          Rather than forcing a match winner projection on every fixture, the platform evaluates all eligible market candidates against calibration and coverage gates:
        </p>
        <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)] font-mono text-center text-[13px] font-semibold text-[var(--accent)]">
          Δp = p − p₀
        </div>
        <ol className="list-decimal pl-5 space-y-1 text-[var(--text)] text-[12.5px] leading-[1.55]">
          <li>
            <strong>Data coverage:</strong> At least 85% verified underlying statistics across a minimum 12-match sample.
          </li>
          <li>
            <strong>Calibration threshold:</strong> Modeled probability must pass out-of-sample reliability checks.
          </li>
          <li>
            <strong>Correlation filter:</strong> Correlated lines within the same match are penalized to avoid artificial diversification.
          </li>
        </ol>
      </section>

      <section className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2.5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--accent)]" />
          <span>4. Context factors &amp; Bayesian shrinkage</span>
        </h2>
        <p className="leading-[1.55]">
          Before ranking any line, Calibrall measures pre-match factors regularized with empirical Bayesian shrinkage for small samples:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)]">
            <span className="font-semibold text-[var(--text)] block text-[13px]">1. Team form</span>
            <span className="text-[12px] text-[var(--text-2)] mt-0.5 block">
              Exponentially time-decayed rolling performance
            </span>
          </div>
          <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)]">
            <span className="font-semibold text-[var(--text)] block text-[13px]">2. Expected goals (xG)</span>
            <span className="text-[12px] text-[var(--text-2)] mt-0.5 block">
              Shot quality differential beyond actual scores
            </span>
          </div>
          <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)]">
            <span className="font-semibold text-[var(--text)] block text-[13px]">3. Tactical matchup</span>
            <span className="text-[12px] text-[var(--text-2)] mt-0.5 block">
              High press vs low block spatial compatibility
            </span>
          </div>
          <div className="p-3 bg-[var(--surface-2)] rounded-[12px] border border-[var(--line)]">
            <span className="font-semibold text-[var(--text)] block text-[13px]">4. Rest &amp; congestion</span>
            <span className="text-[12px] text-[var(--text-2)] mt-0.5 block">
              Days between matches and travel load
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
