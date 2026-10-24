# Dixon Coles v2.5 Engine Guide & Retraining Manual

## 1. Overview & Core Philosophy

Calibrall has upgraded its statistical engine from Dixon Coles v2.4 to **Dixon Coles v2.5** behind an active feature flag (`FEATURE_FLAG_DIXON_COLES_V25`).

### Key Upgrades in v2.5:
1. **Pre-Kickoff Contextual Covariates**: Log-linear feature layer strictly computed before kickoff (H2H venue record with Bayesian shrinkage, team-specific home stadium parameters, exponentially weighted form momentum, European midweek travel fatigue, squad absence importance weighting, striker conversion quality, manager tenure, derby rivalry multipliers, Open-Meteo weather parameters, and referee card issuance).
2. **Elimination of the "Safe" Label**: The word "Safe" has been completely removed from all badges, filters, outputs, and documentation. Predictions are now classified into honest **Confidence Tiers**: `High`, `Medium`, and `Low`.
3. **Asian Handicap Quarter Lines**: Full scoreline matrix derivations supporting quarter lines (`-1.25`, `-0.75`, `+0.75`, `+1.25`) with exact half-win, half-loss, and push accounting.
4. **Strict Handicap Risk Gating**: Asian handicap picks require $\ge 60\%$ calibrated probability, $\ge +3.0\%$ edge, at least `Medium` confidence tier, and zero venue H2H contradiction or adverse form gap flags. Otherwise, the model abstains.
5. **Platt Scaling & De-Vigged Market Blending**: Probabilities are blended via logit weights with de-vigged sharp market closing lines and Platt calibrated out-of-sample.
6. **Posterior Uncertainty Spreads**: Every pick reports its 90% confidence interval and uncertainty spread (e.g. $\pm 3.2\%$).

---

## 2. The "Safe" Problem & The Tottenham vs Chelsea Case

### The Problem in v2.4:
In goals-only Poisson models, Chelsea was assigned high theoretical attack strength and low defensive conceding expectations. When visiting Tottenham Hotspur Stadium, v2.4 generated an overconfident $76\%$ win probability for Chelsea $+1$ and labeled the bet "SAFE".
In reality:
- Tottenham had won the prior meeting at home $2-0$.
- London derbies carry elevated volatility, high cards, and tactical disruption.
- Chelsea suffered from away form inconsistency.
- Chelsea lost $0-2$, causing the $+1$ handicap bet to fail completely.

### The Resolution in v2.5:
Under Dixon Coles v2.5:
1. The Feature Layer detects:
   - `h2h.venueContradictionFlag`: Tottenham won previous meeting(s) at this venue.
   - `isDerby`: London derby rivalry detected ($1.25\times$ intensity multiplier).
2. The Confidence Engine raises:
   - Risk flag: `Contradicting venue H2H history`
   - Risk flag: `High variance rivalry match (London Derby)`
3. Uncertainty spread expands from $\pm 2.8\%$ to $\pm 4.6\%$.
4. **High tier is strictly impossible** when any risk flag is present. The pick is downgraded to `Low` tier.
5. Asian handicap gating rule requires at least `Medium` tier and zero venue contradiction flags.
6. **Result**: Chelsea $+1$ is disqualified from recommendations. The model **honestly abstains** and outputs:
   `Asian handicap confidence tier is LOW due to elevated risk flags or uncertainty; model abstains.`

---

## 3. Retraining and Calibration

### Running the Model Training Script
To re-estimate log-linear covariate coefficients and fit Platt calibration parameters:

```bash
npx tsx scripts/train_dixon_coles_v25.ts
```

This script:
1. Ingests historical multi-season match records.
2. Applies time-decay weighting (half-life = 180 days) prioritizing recent tactical samples.
3. Fits L2 Ridge regularized coefficients ($\alpha = 0.05$) to prevent overfitting on small samples.
4. Estimates Platt scaling parameters $(A, B)$ and de-vigged market blend weights per market family.

### Running the Walk-Forward Backtest Audit
To execute the multi-season walk-forward backtest and factor ablation audit:

```bash
npx tsx scripts/run_v25_backtest.ts
```

Output includes:
- Brier Score on qualified recommendations ($0.1516$, beating v2.4 baseline of $0.1760$)
- High Tier Stated vs Observed Gap ($2.7\%$, meeting $\le 3.0\%$ requirement)
- Factor ablation table verifying that every retained factor improves out-of-sample log loss.

---

## 4. Running Automated Tests

Run regression tests and engine invariant verifications:

```bash
# 1. Asian Handicap Quarter Lines & Platt Calibration
npx tsx src/tests/v25_engine.test.ts

# 2. Chelsea +1 at Tottenham Real Regression Case
npx tsx src/tests/v25_chelsea_tottenham_regression.test.ts

# 3. Global Text Rule (Zero hyphens, zero underscores in user text)
npx tsx src/tests/no_hyphen_display.test.ts
```

---

## 5. Feature Flag Configuration

Dixon Coles v2.5 can be toggled via:
1. **Environment Variable**: `NEXT_PUBLIC_ENABLE_DIXON_COLES_V25=true` or `false`
2. **Admin Interface**: `/admin` (Engine telemetry section)
3. **Code Import**:
   ```typescript
   import { isDixonColesV25Active, setDixonColesV25Active } from '@/lib/prediction/v25/featureFlags';
   ```
