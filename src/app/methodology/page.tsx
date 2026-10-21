import React from 'react';
import Link from 'next/link';
import { BookOpen, Cpu, TrendingUp, Layers } from 'lucide-react';

export default function MethodologyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-7 py-2 text-[12px] leading-[1.65] text-[#8fa69a]">
      {/* Page Header */}
      <div className="space-y-1 text-left pb-4 border-b-[0.5px] border-white/[0.08]">
        <span className="text-[11px] font-[500] tracking-[0.04em] text-[#5eb6e8] block">
          Architecture philosophy
        </span>
        <h1 className="text-[22px] font-[500] leading-[1.25] tracking-[-0.01em] text-[#e8efe9] text-left">
          Mathematical methodology & modeling architecture
        </h1>
        <p className="text-[13px] leading-[1.65] text-[#8fa69a] text-left max-w-[560px]">
          Documentation of our statistical pipelines, Dixon-Coles Poisson parameters, and market selection engine.
        </p>
      </div>

      {/* Section 1: Dixon-Coles Goal Model */}
      <section className="p-4 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] space-y-3">
        <h2 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#b8e63a]" />
          <span>1. The Dixon-Coles bivariate goal model</span>
        </h2>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65]">
          While naive Poisson regression assumes home and away goal scoring are independent, empirical football data reveals significant negative correlation at low scores (specifically 0-0, 1-0, 0-1, and 1-1). To account for this, Calibrall applies the Dixon & Coles (1997) parameter adjustment:
        </p>

        <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08] font-mono text-[11px] text-[#c9d6ce] space-y-1">
          <p>P(X = x, Y = y) = τ(x, y, λ, μ, ρ) × [ (λ^x * e^-λ) / x! ] × [ (μ^y * e^-μ) / y! ]</p>
          <p className="text-[#8fa69a] mt-2">Where adjustment parameter τ(x, y, λ, μ, ρ) is defined as:</p>
          <ul className="list-disc pl-5 text-[#b8e63a] space-y-0.5">
            <li>τ(0, 0) = 1 - λ * μ * ρ</li>
            <li>τ(1, 0) = 1 + μ * ρ</li>
            <li>τ(0, 1) = 1 + λ * ρ</li>
            <li>τ(1, 1) = 1 - ρ</li>
            <li>τ(x, y) = 1.0 (for all other x, y)</li>
          </ul>
        </div>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65]">
          We estimate the empirical correlation coefficient ρ ≈ -0.13 across elite European leagues. From the resulting 10×10 scoreline matrix, we derive exact probabilities for Home Win, Draw, Away Win, Both Teams to Score (BTTS), and Over/Under lines (0.5 through 4.5).
        </p>
      </section>

      {/* Section 2: Corner & Card Modeling */}
      <section className="p-4 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] space-y-3">
        <h2 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#5eb6e8]" />
          <span>2. Corner volume & disciplinary count distributions</span>
        </h2>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65]">
          Corner kicks exhibit overdispersion relative to goals. We deploy a compound Poisson / Negative Binomial count model that computes expected home and away corner generation based on:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[#c9d6ce] text-[12px] leading-[1.65]">
          <li>Rolling corner winning and conceding rates (past 20 league matches)</li>
          <li>Cross-field crossing frequency and field tilt metrics</li>
          <li>Opposition defensive block depth</li>
        </ul>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65] mt-2">
          For disciplinary bookings (yellow cards = 1, red cards = 2), our model integrates referee historical card issuance rates with derby and rivalry intensity multipliers.
        </p>
      </section>

      {/* Section 3: Intelligent Market Selection */}
      <section className="p-4 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] space-y-3">
        <h2 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#b8e63a]" />
          <span>3. Intelligent market selection &amp; expected value</span>
        </h2>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65]">
          Rather than forcing a match winner pick on every game, the platform evaluates all eligible market candidates. For decimal odds O and modeled probability p, expected return is:
        </p>
        <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08] font-mono text-center text-[13px] font-[500] text-[#b8e63a]">
          EV = (p × O) - 1.0
        </div>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65]">
          Candidates qualify only if they pass three non-negotiable checks:
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-[#c9d6ce] text-[12px] leading-[1.65]">
          <li><strong className="text-[#e8efe9]">Data coverage:</strong> At least 85% verified underlying statistics across a minimum 12-match sample.</li>
          <li><strong className="text-[#e8efe9]">Statistical edge:</strong> Modeled probability must exceed bookmaker implied probability by at least +3.0% to overcome overround.</li>
          <li><strong className="text-[#e8efe9]">Correlation filter:</strong> Highly correlated selections within the same game (e.g. Over 2.5 Goals and BTTS Yes) are penalized to prevent artificial diversification.</li>
        </ol>
      </section>

      {/* Section 4: Context Factors and State-Based Weighing */}
      <section className="p-4 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] space-y-4">
        <h2 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#b8e63a]" />
          <span>4. Context factors, state-based weighing &amp; hypothesis validation</span>
        </h2>
        <p className="text-[12px] text-[#8fa69a] leading-[1.65]">
          Before ranking any market line, Calibrall measures 10 verified pre-match factors. Crucially, weights are regularized and cross-validated with Bayesian shrinkage for small samples—never hand-picked:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">1. Team form</span>
            <span className="text-[11px] text-[#8fa69a]">Rolling goals, xG, shots, corners and cards split by home and away, adjusted for opponent strength.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">2. Squad state</span>
            <span className="text-[11px] text-[#8fa69a]">Confirmed lineups, injuries, suspensions, rotation, and absence of key attackers, defenders or goalkeepers.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">3. Match stakes</span>
            <span className="text-[11px] text-[#8fa69a]">League position, title/relegation/European pressure, local derby or rivalry, and dead-rubber matches.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">4. Schedule &amp; fatigue</span>
            <span className="text-[11px] text-[#8fa69a]">Rest days, 3-match weekly congestion, midweek European travel distance, and timezone displacement.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">5. Tactical matchup</span>
            <span className="text-[11px] text-[#8fa69a]">Pressing intensity (PPDA), possession tilt, wing play &amp; crossing frequency (corners), set-piece prowess.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">6. Referee &amp; disciplinary</span>
            <span className="text-[11px] text-[#8fa69a]">Appointed referee card issuance averages, foul-to-card ratio, and competition disciplinary rules.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">7. Environment</span>
            <span className="text-[11px] text-[#8fa69a]">Home venue advantage, altitude, pitch dimensions, and verified meteorological conditions.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">8. Head-to-head</span>
            <span className="text-[11px] text-[#8fa69a]">Low weight (5-8%), heavily shrunk (65%) toward the empirical league average.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">9. Managerial changes</span>
            <span className="text-[11px] text-[#8fa69a]">New manager tenure (&lt; 5 matches), tactical transition, and major squad restructuring.</span>
          </div>
          <div className="p-3 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08]">
            <span className="font-[500] text-[#e8efe9] block text-[13px]">10. Market signals</span>
            <span className="text-[11px] text-[#8fa69a]">Odds drift used exclusively to check value and flag disagreement. Never fed back in circularly to predict the same price.</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#0a1812] rounded-[8px] border-[0.5px] border-white/[0.08] space-y-2 text-[11px] leading-[1.65]">
          <strong className="text-[#e8efe9] block text-[12px] font-[500]">State-to-market verified hypotheses &amp; abstention:</strong>
          <ul className="list-disc pl-5 text-[#8fa69a] space-y-1">
            <li><strong className="text-[#c9d6ce]">Key attackers absent:</strong> Lowers expected goals by 12-18% and reduces box corner touches.</li>
            <li><strong className="text-[#c9d6ce]">Derby or high stakes:</strong> Elevates disciplinary bookings expectation (+18%) and duel variance.</li>
            <li><strong className="text-[#c9d6ce]">Congestion &amp; fatigue:</strong> Raises uncertainty; reduces late-game crossing volume.</li>
            <li><strong className="text-[#c9d6ce]">Dead rubber:</strong> Multiplies variance by 1.45x; applies higher margin-of-safety hurdle favoring abstention.</li>
            <li><strong className="text-[#c9d6ce]">Lineup unconfirmed:</strong> Labeled &quot;pre-lineup&quot; with temporary +22% uncertainty margin until team sheets lock at T-60.</li>
            <li><strong className="text-[#c9d6ce]">Missing factor rule:</strong> Never treated as neutral or zero; flags the missing variable, expands composite uncertainty, and downgrades confidence.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
