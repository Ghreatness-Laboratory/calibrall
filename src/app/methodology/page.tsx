import React from 'react';
import Link from 'next/link';
import { BookOpen, Cpu, CheckCircle2, TrendingUp, Layers, ArrowLeft } from 'lucide-react';

export default function MethodologyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4 text-xs leading-relaxed text-gray-300">
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center space-x-3">
            <BookOpen className="w-8 h-8 text-brand-emerald" />
            <span>Mathematical Methodology & Modeling Architecture</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Documentation of our statistical pipelines, Dixon-Coles Poisson parameters, and market selection engine.
          </p>
        </div>
      </div>

      {/* Section 1: Dixon-Coles Goal Model */}
      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-brand-emerald" />
          <span>1. The Dixon-Coles Bivariate Goal Model</span>
        </h2>
        <p>
          While naive Poisson regression assumes home and away goal scoring are independent, empirical football data reveals significant negative correlation at low scores (specifically 0-0, 1-0, 0-1, and 1-1). To account for this, CALIBRALL applies the Dixon & Coles (1997) parameter adjustment:
        </p>

        <div className="p-4 bg-surface-100 rounded border border-border font-mono text-[11px] text-gray-200 space-y-1">
          <p>P(X = x, Y = y) = τ(x, y, λ, μ, ρ) × [ (λ^x * e^-λ) / x! ] × [ (μ^y * e^-μ) / y! ]</p>
          <p className="text-gray-400 mt-2">Where adjustment parameter τ(x, y, λ, μ, ρ) is defined as:</p>
          <ul className="list-disc pl-5 text-brand-emerald space-y-0.5">
            <li>τ(0, 0) = 1 - λ * μ * ρ</li>
            <li>τ(1, 0) = 1 + μ * ρ</li>
            <li>τ(0, 1) = 1 + λ * ρ</li>
            <li>τ(1, 1) = 1 - ρ</li>
            <li>τ(x, y) = 1.0 (for all other x, y)</li>
          </ul>
        </div>
        <p>
          We estimate the empirical correlation coefficient ρ ≈ -0.13 across elite European leagues. From the resulting 10×10 scoreline matrix, we derive exact probabilities for Home Win, Draw, Away Win, Both Teams to Score (BTTS), and Over/Under lines (0.5 through 4.5).
        </p>
      </div>

      {/* Section 2: Corner & Card Modeling */}
      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-brand-blue" />
          <span>2. Corner Volume & Disciplinary Count Distributions</span>
        </h2>
        <p>
          Corner kicks exhibit overdispersion relative to goals. We deploy a compound Poisson / Negative Binomial count model that computes expected home and away corner generation based on:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-gray-300">
          <li>Rolling corner winning and conceding rates (past 20 league matches)</li>
          <li>Cross-field crossing frequency and field tilt metrics</li>
          <li>Opposition defensive block depth</li>
        </ul>
        <p className="mt-2">
          For disciplinary bookings (yellow cards = 1, red cards = 2), our model integrates referee historical card issuance rates with derby and rivalry intensity multipliers.
        </p>
      </div>

      {/* Section 3: Intelligent Market Selection */}
      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center space-x-2">
          <Layers className="w-4 h-4 text-brand-emerald" />
          <span>3. Intelligent Market Selection &amp; Expected Value</span>
        </h2>
        <p>
          Rather than forcing a match winner pick on every game, the platform evaluates all eligible market candidates. For decimal odds O and modeled probability p, expected return is:
        </p>
        <div className="p-3 bg-surface-100 rounded border border-border font-mono text-center text-sm font-bold text-brand-emerald">
          EV = (p × O) - 1.0
        </div>
        <p>
          Candidates qualify only if they pass three non-negotiable checks:
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-gray-300">
          <li><strong>Data Coverage:</strong> At least 85% verified underlying statistics across a minimum 12-match sample.</li>
          <li><strong>Statistical Edge:</strong> Modeled probability must exceed bookmaker implied probability by at least +3.0% to overcome overround.</li>
          <li><strong>Correlation Filter:</strong> Highly correlated selections within the same game (e.g. Over 2.5 Goals and BTTS Yes) are penalized to prevent artificial diversification.</li>
        </ol>
      </div>

      {/* Section 4: Context Factors and State-Based Weighing */}
      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-brand-emerald" />
          <span>4. Context Factors, State-Based Weighing &amp; Hypothesis Validation</span>
        </h2>
        <p>
          Before ranking any market line, CALIBRALL measures 10 verified pre-match factors. Crucially, weights are regularized and cross-validated with Bayesian shrinkage for small samples—never hand-picked:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">1. Team Form</span>
            <span className="text-[11px] text-gray-400">Rolling goals, xG, shots, corners and cards split by home and away, adjusted for opponent strength.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">2. Squad State</span>
            <span className="text-[11px] text-gray-400">Confirmed lineups, injuries, suspensions, rotation, and absence of key attackers, defenders or goalkeepers.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">3. Match Stakes</span>
            <span className="text-[11px] text-gray-400">League position, title/relegation/European pressure, local derby or rivalry, and dead-rubber matches.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">4. Schedule &amp; Fatigue</span>
            <span className="text-[11px] text-gray-400">Rest days, 3-match weekly congestion, midweek European travel distance, and timezone displacement.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">5. Tactical Matchup</span>
            <span className="text-[11px] text-gray-400">Pressing intensity (PPDA), possession tilt, wing play &amp; crossing frequency (corners), set-piece prowess.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">6. Referee &amp; Disciplinary</span>
            <span className="text-[11px] text-gray-400">Appointed referee card issuance averages, foul-to-card ratio, and competition disciplinary rules.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">7. Environment</span>
            <span className="text-[11px] text-gray-400">Home venue advantage, altitude, pitch dimensions, and verified meteorological conditions.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">8. Head-to-Head</span>
            <span className="text-[11px] text-gray-400">Low weight (5-8%), heavily shrunk (65%) toward the empirical league average.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">9. Managerial Changes</span>
            <span className="text-[11px] text-gray-400">New manager tenure (&lt; 5 matches), tactical transition, and major squad restructuring.</span>
          </div>
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="font-bold text-white block">10. Market Signals</span>
            <span className="text-[11px] text-gray-400">Odds drift used exclusively to check value and flag disagreement. Never fed back in circularly to predict the same price.</span>
          </div>
        </div>

        <div className="p-4 bg-surface-100 rounded border border-border space-y-2 mt-4 text-[11px]">
          <strong className="text-white block">State-to-Market Verified Hypotheses &amp; Abstention:</strong>
          <ul className="list-disc pl-5 text-gray-300 space-y-1">
            <li><strong>Key Attackers Absent:</strong> Lowers expected goals by 12-18% and reduces box corner touches.</li>
            <li><strong>Derby or High Stakes:</strong> Elevates disciplinary bookings expectation (+18%) and duel variance.</li>
            <li><strong>Congestion &amp; Fatigue:</strong> Raises uncertainty; reduces late-game crossing volume.</li>
            <li><strong>Dead Rubber:</strong> Multiplies variance by 1.45x; applies higher margin-of-safety hurdle favoring abstention.</li>
            <li><strong>Lineup Unconfirmed:</strong> Labeled &quot;pre-lineup&quot; with temporary +22% uncertainty margin until team sheets lock at T-60.</li>
            <li><strong>Missing Factor Rule:</strong> Never treated as neutral or zero; flags the missing variable, expands composite uncertainty, and downgrades confidence.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
