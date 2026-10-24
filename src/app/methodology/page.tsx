import React from 'react';
import Link from 'next/link';
import { BookOpen, Cpu, TrendingUp, Layers } from 'lucide-react';

export default function MethodologyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 py-2 text-[13px] leading-[1.55] text-[#8B9890]">
      {/* Page Header */}
      <div className="space-y-1 pb-3 border-b border-white/[0.07]">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#B6E63B] block">
          ARCHITECTURE PHILOSOPHY
        </span>
        <h1 className="text-[23px] font-[700] leading-[1.2] tracking-[-0.025em] text-[#ECF1EE]">
          Mathematical methodology & modeling architecture
        </h1>
        <p className="text-[12px] text-[#8B9890]">
          Documentation of our statistical pipelines, Dixon Coles Poisson parameters, and market selection engine.
        </p>
      </div>

      {/* Section 1: Dixon Coles Goal Model */}
      <section className="p-4 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2.5">
        <h2 className="text-[15px] font-semibold text-[#ECF1EE] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#B6E63B]" />
          <span>1. The Dixon Coles bivariate goal model</span>
        </h2>
        <p className="text-[13px] text-[#8B9890] leading-[1.55]">
          While naive Poisson regression assumes home and away goal scoring are independent, empirical football data reveals significant negative correlation at low scores (specifically 0 to 0, 1 to 0, 0 to 1, and 1 to 1). To account for this, Calibrall applies the Dixon & Coles (1997) parameter adjustment:
        </p>

        <div className="p-3 bg-[#151E19] rounded-[11px] border border-white/[0.07] font-mono text-[11px] text-[#ECF1EE] space-y-1">
          <p>P(X = x, Y = y) = τ(x, y, λ, μ, ρ) × [ (λ^x * e^&#8722;λ) / x! ] × [ (μ^y * e^&#8722;μ) / y! ]</p>
          <p className="text-[#8B9890] mt-2">Where adjustment parameter τ(x, y, λ, μ, ρ) is defined as:</p>
          <ul className="list-disc pl-5 text-[#B6E63B] space-y-0.5">
            <li>τ(0, 0) = 1 &#8722; λ * μ * ρ</li>
            <li>τ(1, 0) = 1 + μ * ρ</li>
            <li>τ(0, 1) = 1 + λ * ρ</li>
            <li>τ(1, 1) = 1 &#8722; ρ</li>
            <li>τ(x, y) = 1.0 (for all other x, y)</li>
          </ul>
        </div>
        <p className="text-[13px] text-[#8B9890] leading-[1.55]">
          We estimate the empirical correlation coefficient ρ ≈ &#8722;0.13 across elite European leagues. From the resulting 10×10 scoreline matrix, we derive exact probabilities for Home Win, Draw, Away Win, Both Teams to Score (BTTS), and Over/Under lines (0.5 through 4.5).
        </p>
      </section>

      {/* Section 2: Corner & Card Modeling */}
      <section className="p-4 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2.5">
        <h2 className="text-[15px] font-semibold text-[#ECF1EE] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#B6E63B]" />
          <span>2. Corner volume & disciplinary count distributions</span>
        </h2>
        <p className="text-[13px] text-[#8B9890] leading-[1.55]">
          Corner kicks exhibit overdispersion relative to goals. We deploy a compound Poisson / Negative Binomial count model that computes expected home and away corner generation based on:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[#ECF1EE] text-[12.5px] leading-[1.55]">
          <li>Rolling corner winning and conceding rates (past 20 league matches)</li>
          <li>Cross field crossing frequency and field tilt metrics</li>
          <li>Opposition defensive block depth</li>
        </ul>
        <p className="text-[13px] text-[#8B9890] leading-[1.55] mt-1">
          For disciplinary bookings (yellow cards = 1, red cards = 2), our model integrates referee historical card issuance rates with derby and rivalry intensity multipliers.
        </p>
      </section>

      {/* Section 3: Intelligent Market Selection */}
      <section className="p-4 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2.5">
        <h2 className="text-[15px] font-semibold text-[#ECF1EE] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#B6E63B]" />
          <span>3. Intelligent market selection &amp; expected value</span>
        </h2>
        <p className="text-[13px] text-[#8B9890] leading-[1.55]">
          Rather than forcing a match winner pick on every game, the platform evaluates all eligible market candidates. For decimal odds O and modeled probability p, expected return is:
        </p>
        <div className="p-3 bg-[#151E19] rounded-[11px] border border-white/[0.07] font-mono text-center text-[13px] font-semibold text-[#B6E63B]">
          EV = (p × O) &#8722; 1.0
        </div>
        <p className="text-[13px] text-[#8B9890] leading-[1.55]">
          Candidates qualify only if they pass three non negotiable checks:
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-[#ECF1EE] text-[12.5px] leading-[1.55]">
          <li><strong className="text-[#ECF1EE]">Data coverage:</strong> At least 85% verified underlying statistics across a minimum 12 match sample.</li>
          <li><strong className="text-[#ECF1EE]">Statistical edge:</strong> Modeled probability must exceed bookmaker implied probability by at least +3.0% to overcome overround.</li>
          <li><strong className="text-[#ECF1EE]">Correlation filter:</strong> Highly correlated selections within the same game (e.g. Over 2.5 Goals and BTTS Yes) are penalized to prevent artificial diversification.</li>
        </ol>
      </section>

      {/* Section 4: Context Factors and State Based Weighing */}
      <section className="p-4 bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2.5">
        <h2 className="text-[15px] font-semibold text-[#ECF1EE] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#B6E63B]" />
          <span>4. Context factors, state based weighing &amp; hypothesis validation</span>
        </h2>
        <p className="text-[13px] text-[#8B9890] leading-[1.55]">
          Before ranking any market line, Calibrall measures 10 verified pre match factors. Crucially, weights are regularized and cross validated with Bayesian shrinkage for small samples · never hand picked:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
            <span className="font-semibold text-[#ECF1EE] block text-[13px]">1. Team form</span>
            <span className="text-[11.5px] text-[#8B9890] mt-0.5 block">Exponentially time decayed rolling performance</span>
          </div>
          <div className="p-3 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
            <span className="font-semibold text-[#ECF1EE] block text-[13px]">2. Expected goals (xG)</span>
            <span className="text-[11.5px] text-[#8B9890] mt-0.5 block">Shot quality differential beyond actual scores</span>
          </div>
          <div className="p-3 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
            <span className="font-semibold text-[#ECF1EE] block text-[13px]">3. Tactical matchup</span>
            <span className="text-[11.5px] text-[#8B9890] mt-0.5 block">High press vs low block spatial compatibility</span>
          </div>
          <div className="p-3 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
            <span className="font-semibold text-[#ECF1EE] block text-[13px]">4. Rest & congestion</span>
            <span className="text-[11.5px] text-[#8B9890] mt-0.5 block">Days between matches and travel mileage</span>
          </div>
        </div>
      </section>
    </div>
  );
}
