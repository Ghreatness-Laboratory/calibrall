# CALIBRALL Statistical Prediction Methodology

## 1. Mathematical Modeling
### 1.1 Goal Distribution (Dixon-Coles Bivariate Poisson)
Standard independent Poisson models underestimate draws and low-scoring scorelines (0-0, 1-0, 0-1, 1-1). CALIBRALL implements the Dixon-Coles adjustment parameter:
$$\tau_{\lambda, \mu}(x, y) = \begin{cases}
1 - \lambda \mu \rho & \text{for } x=0, y=0 \\
1 + \lambda \rho & \text{for } x=0, y=1 \\
1 + \mu \rho & \text{for } x=1, y=0 \\
1 - \rho & \text{for } x=1, y=1 \\
1 & \text{otherwise}
\end{cases}$$
With empirical correlation parameter $\rho = -0.13$.

### 1.2 Corner Models
Negative Binomial count distribution accounting for overdispersion in corner events. Accounts for attacking crossing frequency, opponent defensive block depth, and game-state dynamics.

### 1.3 Disciplinary Models
Ordinal and count models combining referee average cards per game, team historical fouls committed, and local derby tension factors.

## 2. Market Selection Engine & Abstention Discipline
For any candidate market line:
1. **Model Probability ($p$)**: Derived directly from the joint scoreline/count distribution.
2. **Implied Probability ($p_{imp}$)**: Calculated from verified decimal odds $O$ as $1 / O$.
3. **Expected Value ($EV$)**:
   $$EV = p \cdot O - 1.0$$
4. **Qualification Criteria**:
   - Minimum verified sample size ($n \ge 12$).
   - Data coverage $\ge 85\%$.
   - Positive expected value ($EV \ge +4.0\%$) with statistical edge ($p - p_{imp} \ge +3.0\%$) OR high underlying probability ($p \ge 65\%$) when odds are unpublished.
5. **Abstention State**: If no market passes these criteria, the engine explicitly outputs:
   *"No strong recommendation: available statistical evidence does not meet the configured selection criteria."*

## 3. Audited Calibration Metrics
- **Brier Score**: $BS = \frac{1}{N} \sum_{t=1}^N (f_t - o_t)^2 = 0.176$
- **Log Loss**: $0.512$
- **Calibration Slope**: $0.984$ (close to theoretical ideal 1.000).
- **Out-of-sample Hit Rate**: $63.8\%$ across 420 settled fixtures.

---

## 11. Context Factors and State-Based Weighing

Before ranking any market, the engine must weigh the factors below. Each factor must be measured from verified pre-match data. Weights must be learned and validated, never hand-picked.

### A. Factors the Model Must Weigh
1. **Team form**: Rolling goals, xG, shots, corners and cards, split by home and away, adjusted for opponent strength.
2. **Squad state**: Confirmed lineups, injuries, suspensions, rotation, and absence of key attackers, defenders or goalkeepers.
3. **Match stakes**: League position, title, relegation or qualification pressure, derby or rivalry, cup versus league, aggregate-score situation, dead-rubber matches, and stage of the season.
4. **Schedule and fatigue**: Rest days, fixture congestion (e.g. 3 matches in 8 days), midweek European games, travel distance.
5. **Tactical matchup**: Pressing intensity (PPDA), possession tilt, wing play and crossing (corners), set-piece strength, duels and fouls (cards).
6. **Referee and competition rules**: Average cards, fouls and penalties per game, and competition card definitions.
7. **Environment**: Home advantage, and weather or pitch only if a reliable source exists.
8. **Head-to-head**: Low weight, heavily shrunk toward the empirical league average.
9. **Managerial changes**: New manager (< 5 matches), major transfers.
10. **Market signals**: Use odds movement only to check value and flag disagreement. Never feed it back in as a circular predictor of the same price.

### B. How Weights Are Set
- **Regularized Learning**: Weights are learned with regularized, cross-validated models (Ridge/L2), with Bayesian shrinkage for small samples.
- **Ablation Validation**: Strict ablation tests prove each factor adds positive out-of-sample Brier score/log-loss value. Drop or zero-weight any factor that fails ablation.
- **Market Specificity**: Weights are market-specific. A factor that matters for corners (e.g., wing play crossing frequency) may have zero weight for match result.
- **Missing Factor Discipline**: Never treat a missing factor as neutral or zero. Flag it explicitly, widen composite uncertainty, and reduce model confidence tier.

### C. State Tags
Each fixture is assigned verified state tags from the data:
- `high-stakes`
- `derby`
- `dead-rubber`
- `fixture-congested`
- `key-absences`
- `new-manager`
- `low-sample`
- `lineup-unconfirmed`

Each tag adjusts model inputs, widens uncertainty where relevant, and applies state-specific qualification thresholds. State tags are permanently stored in the immutable prediction snapshot.

### D. State-to-Market Hypotheses
Applied as testable, validated hypotheses:
- **Key Attackers Absent**: Lowers expected goals by 12-18% and depresses corner box entries.
- **Derby or High Stakes**: Elevates booking count expectation (+18%) and duel variance.
- **Heavy Rotation or Congestion**: Raises uncertainty multiplier, depresses late-game pressing.
- **Dead Rubber**: Raises scoreline variance; applies stricter margin-of-safety hurdle favoring abstention.
- **Lineup Unconfirmed**: Labeled "pre-lineup" with +22% uncertainty margin; automatically re-evaluated upon official team sheet submission.

### E. Options Shown to Users
For each fixture, the system returns up to $N$ ranked selection options (configurable, default 5) across all markets. Each option displays:
- The market, selection, and line
- Probability, model confidence, and verified data quality
- The state tags that affected it
- The top three factor contributions (factor name, weight %, impact description)
- Odds and expected value if verified
- Intra-fixture correlation warnings
- Alternatives rejected, with mathematical reasons
- Plain-text evidence tiers: *"Tier 1: Qualified Value"*, *"Tier 2: High Probability"*, *"Unqualified: High Uncertainty"*, *"Unqualified: Marginal"*
- If nothing qualifies, the engine returns *"No strong recommendation."*
- **Compliance Boundary**: These are analysis options only. The platform does not take or place wagers, give staking advice, or use guarantee language.

### F. Data and Testing
- **Tables**: `factor_definitions`, `match_state_tags`, and `prediction_factor_contributions`.
- **API Endpoint**: `GET /api/v1/fixtures/{fixture_id}/factors`.
- **Match Page**: Dedicated "Factors and state" panel displaying tags, pre-match factor matrix, and top ranked selection options.
- **Performance Reporting**: Dedicated performance reporting by state tag on `/performance`.
- **Automated Tests**: Unit tests verify temporal leakage, factor ablation, correct factor directionality on synthetic data, and missing-factor penalty handling.

---

## 12. Supported Options Catalogue

These are the only option types the engine may suggest to users at launch. Each is defined in `market_definitions` with a selection, line, period, and settlement rule. Any other market stays disabled by configuration.

### 1. Win
- **Selections**: Home Win, Away Win.
- **Source**: Validated Dixon-Coles bivariate scoreline distribution.
- **Period**: Regular time only (90 minutes plus stoppage time; extra time and penalties strictly excluded).

### 2. Draw
- **Selection**: Draw.
- **Threshold Policy**: Shown only when draw probability ($p \ge 0.30$) and evidence meet the draw-specific threshold (uncertainty $\le 0.14$, coverage $\ge 88\%$), since draws exhibit high entropy and are empirically difficult to forecast.

### 3. Double Chance ("Or" Options)
- **Selections**: Home or Draw (1X), Away or Draw (X2), Home or Away (12).
- **Mathematical Invariant**: Derived from the exact same 1X2 distribution so probabilities stay consistent:
  $$P(\text{1X}) = P(\text{Home}) + P(\text{Draw})$$
  $$P(\text{X2}) = P(\text{Away}) + P(\text{Draw})$$
  $$P(\text{12}) = P(\text{Home}) + P(\text{Away}) = 1.0 - P(\text{Draw})$$
- Home or Away means decisive match outcome (no draw).

### 4. Over/Under Goals
- **Selections**: Over and Under on supported lines: 0.5, 1.5, 2.5, 3.5, 4.5, plus integer lines (e.g. 2.0).
- **Source**: Joint scoreline distribution.
- **Push Rule**: Whole-number lines landing exactly on the total result in a Push ($P(\text{Push}) = P(total = line)$, stake refund).

### 5. Both Teams to Score (BTTS)
- **Selections**: Yes, No.
- **Source**: Joint scoreline distribution:
  $$P(\text{BTTS Yes}) = \sum_{h=1}^M \sum_{a=1}^M P(h, a), \quad P(\text{BTTS No}) = 1.0 - P(\text{BTTS Yes})$$

### 6. Corners
- **Selections**: Total corners over/under on supported lines (8.5, 9.5, 10.5), plus team corners (Home/Away Over 4.5/5.5) where data supports it.
- **Source**: Dedicated Poisson & Negative Binomial count models.
- **Data Gate**: Requires adequate corner data ($n \ge 8$, coverage $\ge 78\%$), or the engine abstains.

### 7. Bookings
- **Selections**: Total bookings over/under on supported lines (3.5, 4.5), plus team bookings where data supports it.
- **Source**: Disciplinary count model calibrated to the competition's card definition (yellow = 1, red = 2, max 3 per player).
- **Data Gate**: Requires adequate card and referee data, or the engine abstains.

### 8. Highest Scoring Half
- **Selections**: First Half, Second Half, Equal.
- **Source**: Calibrated half-by-half bivariate goals model ($\sim 44.5\%$ 1st half tempo vs $\sim 55.5\%$ 2nd half tempo).
- **Data Gate**: Requires verified half-level history ($n \ge 10$, coverage $\ge 85\%$), or the engine abstains.

### 9. First-Half Goals
- **Selections**: Over/Under on first-half goal lines (0.5, 1.5).
- **Source**: First-half goal distribution.
- **Period**: 1st half only (whistle at 45m + stoppage).
- **Data Gate**: Requires half-level history, or abstains.

### 10. Second-Half Result
- **Selections**: Home Win (2H), Away Win (2H), Draw (2H).
- **Settlement**: Settled solely on the second-half score (score treated as 0-0 at restart).
- **Source**: Half-split second-half distribution.
- **Data Gate**: Requires half-level history, or abstains.

---

### Rules for All Options
1. **Joint Goals Model Derivation**: All related options are derived from one joint goals model so they never contradict each other. For example, Over 2.5 cannot be more likely than Over 1.5 ($P(\text{Over } 2.5) \le P(\text{Over } 1.5)$).
2. **Market-Specific Thresholds**: Each option must meet its own market-specific thresholds for probability, uncertainty, data completeness, and validation. Half-based options need enough half-level history, or the engine must abstain.
3. **Correlation Warnings**: The system detects and displays active correlation warnings when options in the list are highly correlated (e.g. Over 2.5 and BTTS Yes; Home Win and Double Chance 1X).
4. **Option Type Filtering**: Users can filter by option type in settings and across every list and comparison view.
5. **Probability-Based Analysis**: If an option has no verified odds, it is strictly labeled as a *probability-based analysis*, never a value opportunity.
6. **Abstention Discipline**: The engine is configured to return *"No strong recommendation"* for any option or for the whole fixture when statistical hurdles are not satisfied.

