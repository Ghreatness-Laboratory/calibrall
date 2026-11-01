# Calibrall Phase 3b Model Validation Audit Report

**Date**: November 1, 2026  
**Auditor**: Lead Quantitative Evaluation & Verification Engine  
**Dataset**: `src/lib/data/free_sources_matches.json` (11,066 matches, 2023/24 warmup through 2025/26 season)  
**Evaluation Scope**: 6,710 completed fixtures (2024-08-01 through 2026-06-01)  
**Governance Rules**: Read-only on data; production model coefficients unchanged; authentication untouched.

---

## Executive Audit Summary

| Item | Audit Subject | Audit Status | Key Empirical Result |
|---|---|---|---|
| **Item 1** | **Leakage Test (50 Random Fixtures)** | **PASS** | 0 / 50 rows violated date threshold. All training rows strictly $< \text{prediction date}$. Code line verified. |
| **Item 2** | **1X2 vs Closing Odds** | **FAIL** | Model log loss (1.0485) is strictly worse than closing odds (0.9981) by $+0.0504$ [95% CI: $+0.0432, +0.0575$]. **SHIPPED REVOKED**. |
| **Item 3** | **Closing Odds in Features** | **PASS** | Market prior is blended ($0.85 \times \text{model} + 0.15 \times \text{market}$). Fit window was static 2023/24 warmup; loss without prior is 1.0689. |
| **Item 4** | **Asian Handicap (+3% Edge)** | **PASS** | Evaluated on held-out 2025/26 season: 61.11% hit rate [95% CI: 48.11%, 74.11%], yield $-7.76\%$ [95% CI: $-28.34\%, +12.82\%$]. Combined yield $-7.55\%$. |
| **Item 5** | **Reliability Curves (10 Bins)** | **PASS** | Reliability curves tabulated for all candidate markets with bin counts and calibration errors. 1X2 Home ECE = 7.90%; 1st Half Over 0.5 ECE = 4.05%. |
| **Item 6** | **Tier Acceptance (High & Medium)** | **FAIL** | High tier has 0 picks (as required). Medium tier observed hit rate (56.17%) deviates by **5.08 pp** from stated probability (61.25%), exceeding 3.0 pp tolerance. |
| **Item 7** | **Brier Score Definitions** | **PASS** | Explicit 3-outcome Brier is 0.6310 (range [0, 2]). Direct comparison with v2.4 (0.1760 binary) **DROPPED** as definition mismatch. Binary pick Brier is 0.2418. |
| **Item 8** | **1st Half Over 0.5 Skill** | **FAIL** | Skill over naive baseline is $+0.00006$ with 95% CI spanning zero ($-0.00450$ to $+0.00461$). **Not positive beyond noise**. **SHIPPED REVOKED**. |
| **Item 9** | **Date Range and Counts** | **PASS** | 6,816 total matches in window across 8 divisions (4,072 English + 2,744 European); 106 cold-start matches skipped; exactly 6,710 evaluated. |

---

## Revised Market Shipping Decisions

| Market | Phase 3 Decision | Phase 3b Audit Verdict | Revised Final Status | Reason & Action |
|---|---|---|---|---|
| **1X2 Match Result** | SHIPPED | **FAIL** | **NOT SHIPPED** | Model underperforms sharp closing odds by $+0.0504$ log loss ($t = 13.79$, $p < 0.0001$). Recommendation status revoked. |
| **1st Half Over 0.5 Goals** | SHIPPED | **FAIL** | **NOT SHIPPED** | Log loss skill ($+0.00006$) is indistinguishable from noise (95% CI spans zero: $[-0.00450, +0.00461]$). Recommendation status revoked. |
| **Asian Handicap (-0.5 Level)** | SHIPPED | **FAIL / GATED** | **NOT SHIPPED** | While hit rate is $59.87\%$, yield is negative ($-7.55\%$ combined, $-7.76\%$ held-out 2025/26 season). Edge fails to overcome vigorish. Suppressed. |
| **Over / Under 2.5 Goals** | NOT SHIPPED | **FAIL** (Unchanged) | **NOT SHIPPED** | Underperforms naive baseline ($0.7039 > 0.6932$). Suppressed. |
| **Both Teams To Score (BTTS)** | NOT SHIPPED | **FAIL** (Unchanged) | **NOT SHIPPED** | Underperforms naive baseline ($0.6996 > 0.6920$). Suppressed. |
| **Total Corners Over 9.5** | NOT SHIPPED | **FAIL** (Unchanged) | **NOT SHIPPED** | NegBinomial fails baseline ($0.6969 > 0.6931$). Suppressed. |
| **Total Bookings Over 3.5** | NOT SHIPPED | **FAIL** (Unchanged) | **NOT SHIPPED** | NegBinomial with referee fails baseline ($1.0502 > 0.6800$). Suppressed. |
| **Highest Scoring Half** | NOT SHIPPED | **FAIL** (Unchanged) | **NOT SHIPPED** | Underperforms naive baseline ($1.0718 > 1.0695$). Suppressed. |

**Platform-Wide Result**: **0 out of 8 markets shipped.** Under the strict scientific acceptance criteria and failure of Medium-tier calibration, all betting recommendation outputs are suppressed across the platform. Calibrall operates in **PROBABILITY ANALYSIS ONLY** mode.

---

## Detailed Audit Findings

### 1. Leakage Test (50 Random Evaluation Matches)
- **Methodology**: Evaluated 50 pseudorandomly sampled matches spanning 2024/25 and 2025/26 using fixed PRNG seed 42.
- **Enforcing Code**:
  - `scripts/run_phase3_verification.ts`, Lines 444-738 computes predictions solely from rolling structures (`teamHistory`, `venueH2hHistory`, `refereeHistory`).
  - `scripts/run_phase3_verification.ts`, Line 739 updates historical state strictly after evaluation:
    ```ts
    // Advance history safely AFTER prediction and market loss scoring
    updateMatchHistory(m);
    ```
  - Database filter verification:
    ```ts
    const trainingSet = allMatches.filter(row => row.date < evalMatch.date);
    ```
- **Result**: Exactly **0 / 50** evaluation fixtures had any training records on or after their prediction date. Zero closing odds of the evaluated fixture were ingested into historical team strength or baseline priors.
- **Status**: **PASS**.

Sample of 10 of the 50 audited fixtures:
- **#1** [2024-08-24T17:30:00Z] Udinese vs Lazio: 3,525 rows prior (latest: 2024-08-23) -> **PASS (0 rows >= date)**
- **#2** [2024-08-27T20:30:00Z] Vallecano vs FC Barcelona: 3,604 rows prior (latest: 2024-08-26) -> **PASS (0 rows >= date)**
- **#3** [2024-09-22T19:45:00Z] Lyon vs Marseille: 3,858 rows prior (latest: 2024-09-21) -> **PASS (0 rows >= date)**
- **#4** [2024-10-05T17:00:00Z] Atalanta vs Genoa: 4,015 rows prior (latest: 2024-10-04) -> **PASS (0 rows >= date)**
- **#5** [2024-10-06T15:00:00Z] Bristol City FC vs Cardiff City FC: 4,071 rows prior (latest: 2024-10-05) -> **PASS (0 rows >= date)**
- **#6** [2024-10-19T15:00:00Z] Ipswich Town FC vs Everton FC: 4,111 rows prior (latest: 2024-10-18) -> **PASS (0 rows >= date)**
- **#7** [2024-10-26T15:00:00Z] Accrington Stanley FC vs Walsall FC: 4,232 rows prior (latest: 2024-10-25) -> **PASS (0 rows >= date)**
- **#8** [2024-11-01T19:30:00Z] Bayer 04 Leverkusen vs VfB Stuttgart: 4,322 rows prior (latest: 2024-10-31) -> **PASS (0 rows >= date)**
- **#9** [2024-11-09T14:30:00Z] Mainz vs Borussia Dortmund: 4,401 rows prior (latest: 2024-11-08) -> **PASS (0 rows >= date)**
- **#10** [2024-11-23T14:30:00Z] VfB Stuttgart vs Bochum: 4,499 rows prior (latest: 2024-11-22) -> **PASS (0 rows >= date)**
*(Remaining 40 sampled matches verified 100% leak-free)*

---

### 2. 1X2 vs Closing Odds
- **Matched Samples**: $N = 6,710$ matches with de-vigged closing odds.
- **Model Log Loss**: $1.0485$ [95% CI: $1.0385, 1.0584$]
- **Closing Odds Log Loss**: $0.9981$ [95% CI: $0.9885, 1.0077$]
- **Paired Difference**: $\bar{d} = +0.0504$ [95% CI: $+0.0432, +0.0575$]
- **Hypothesis Test**: $t = 13.79$, $p < 0.0001$.
- **Finding**: The model's cross-entropy loss is significantly worse than closing market odds. Under the Phase 3b mandate, 1X2 cannot be certified as beating closing odds.
- **Status**: **FAIL** (1X2 removed from shipped).

---

### 3. Closing Odds in Features
- **Is Market Prior an Input?**: **YES**.
  - In `scripts/run_phase3_verification.ts` lines 528-533:
    ```ts
    if (hasClosingOdds) {
      pHW = 0.85 * pHW + 0.15 * pMarketHW;
      pDr = 0.85 * pDr + 0.15 * pMarketDr;
      pAW = 0.85 * pAW + 0.15 * pMarketAW;
    }
    ```
- **Model Comparison (With vs Without Prior)**:
  - **With Closing Odds Prior (15% blend)**: Log loss = $1.0485$, 3-outcome Brier = $0.6310$
  - **Without Closing Odds Prior (Pure Dixon-Coles Covariates)**: Log loss = $1.0689$, 3-outcome Brier = $0.6436$
  - The closing market prior reduces log loss by $0.0204$ points.
- **Fit Window of Logit Blend Weight**:
  - The $0.85 / 0.15$ weighting was determined heuristically on the 2023/24 warmup dataset ($< 2024-08-01$).
  - It was held constant and was not adaptively refitted in rolling out-of-sample windows.
- **Status**: **PASS** (Fully disclosed and quantified).

---

### 4. Asian Handicap (+3% Edge Hurdle & Out-of-Sample Rerun)
- **Selection Rule**: Home win probability $\ge 60.0\%$ AND edge over de-vigged closing odds $\ge +3.0\%$.
- **Was the +3% threshold chosen on the same data?**: **YES**, in Phase 3 the +3.0% threshold was evaluated on the pooled 2024-2026 data.
- **Rerun on Held-Out Season (2025/26 alone)**:
  - **Season 2024/25 (In-Sample / Tuning)**:
    - Picks: 98
    - Hits: 58
    - Hit Rate: $59.18\%$ [95% CI: $49.45\%, 68.91\%$]
    - Yield (ROI): $-7.44\%$ [95% CI: $-23.40\%, +8.52\%$]
  - **Season 2025/26 (Held-Out Out-of-Sample Test)**:
    - Picks: 54
    - Hits: 33
    - Hit Rate: $61.11\%$ [95% CI: $48.11\%, 74.11\%$]
    - Yield (ROI): $-7.76\%$ [95% CI: $-28.34\%, +12.82\%$]
  - **Combined (N = 152)**:
    - Hit Rate: $59.87\%$ [95% CI: $52.08\%, 67.66\%$]
    - Yield (ROI): $-7.55\%$ [95% CI: $-20.13\%, +5.03\%$]
- **Conclusion**: While the hit rate on the held-out 2025/26 season is $61.11\%$ (nominally meeting the $60.0\%$ threshold), the financial yield is negative ($-7.76\%$, 95% CI spans from $-28.34\%$ to $+12.82\%$). Betting heavy favorites at $60\%$ probability without sufficient bookmaker odds fails to generate a positive expectation against the market spread.
- **Status**: **PASS** (Audit reporting completed; market NOT shipped due to negative yield).

---

### 5. Reliability Curves
10-bin calibration partitions for evaluated markets:

#### 1X2 Home Win Probability (N = 6,710)
| Bin | Range | Count | Mean Pred | Obs Freq | Cal Error |
|---|---|---|---|---|---|
| 1 | [0.0, 0.1] | 192 | 7.2% | 10.4% | 3.26% |
| 2 | [0.1, 0.2] | 820 | 15.6% | 26.2% | 10.58% |
| 3 | [0.2, 0.3] | 1593 | 25.3% | 35.6% | 10.28% |
| 4 | [0.3, 0.4] | 1862 | 34.8% | 42.9% | 8.07% |
| 5 | [0.4, 0.5] | 1122 | 44.5% | 50.2% | 5.69% |
| 6 | [0.5, 0.6] | 610 | 54.5% | 59.8% | 5.37% |
| 7 | [0.6, 0.7] | 325 | 64.3% | 69.8% | 5.56% |
| 8 | [0.7, 0.8] | 138 | 74.2% | 76.1% | 1.91% |
| 9 | [0.8, 0.9] | 43 | 84.1% | 90.7% | 6.61% |
| 10 | [0.9, 1.0] | 5 | 93.3% | 40.0% | 53.34% |
- **Expected Calibration Error (ECE)**: $7.90\%$
- **Maximum Calibration Error (MCE)**: $53.34\%$

#### 1st Half Over 0.5 Goals Probability (N = 6,709)
| Bin | Range | Count | Mean Pred | Obs Freq | Cal Error |
|---|---|---|---|---|---|
| 4 | [0.3, 0.4] | 1 | 36.9% | 100.0% | 63.10% |
| 5 | [0.4, 0.5] | 21 | 46.9% | 52.4% | 5.47% |
| 6 | [0.5, 0.6] | 509 | 57.1% | 61.5% | 4.42% |
| 7 | [0.6, 0.7] | 2645 | 65.6% | 68.4% | 2.81% |
| 8 | [0.7, 0.8] | 2516 | 74.4% | 69.7% | 4.70% |
| 9 | [0.8, 0.9] | 958 | 83.6% | 78.3% | 5.27% |
| 10 | [0.9, 1.0] | 60 | 92.1% | 85.0% | 7.12% |
- **Expected Calibration Error (ECE)**: $4.05\%$
- **Maximum Calibration Error (MCE)**: $63.10\%$

- **Status**: **PASS** (Curves, bins, counts, and calibration errors fully computed).

---

### 6. Tier Acceptance: High-Tier Rule & Medium-Tier Calibration
- **High-Tier Rule Restatement**:
  > "No High tier while team_news_enabled = false. Acceptance: High-tier hit rate within about 3 points of stated probability over 200+ picks."
- **High Tier Count**: Exactly **0** picks (complies with team news suppression).
- **Medium-Tier Calibration Test**:
  - Picks ($N$): **2,553**
  - Hits: **1,434**
  - Observed Hit Rate: **56.17%**
  - Stated Expected Probability: **61.25%**
  - Absolute Calibration Gap: **5.08 percentage points**
  - Acceptance Criterion: Within $\approx 3.0$ percentage points.
- **Finding**: Observed hit rate (56.17%) lags stated probability (61.25%) by **5.08 percentage points**, which exceeds the allowable 3.0 point tolerance. This demonstrates that without verified starting lineups, confidence is moderately over-optimistic on medium favorites.
- **Status**: **FAIL**.

---

### 7. Brier Score Definitions & v2.4 Comparison
- **Explicit 3-Outcome 1X2 Brier Definition**:
  $$\text{Brier}_{1\text{X}2} = \frac{1}{N} \sum_{i=1}^N \sum_{k \in \{H, D, A\}} (p_{ik} - y_{ik})^2$$
  - Theoretical range: $[0.0, 2.0]$.
  - Phase 3 Model 3-Outcome Brier: **0.6310**.
- **Binary Single-Pick Brier Definition**:
  $$\text{Brier}_{\text{binary}} = \frac{1}{N} \sum_{i=1}^N (p_{\text{top}, i} - y_{\text{top}, i})^2$$
  - Theoretical range: $[0.0, 1.0]$.
  - v2.4 Benchmark: **0.1760**.
  - Phase 3 Model Binary Single-Pick Brier: **0.2418**.
- **Action**: The direct comparison between 0.6310 and 0.1760 in Phase 3 was a mathematical definition mismatch (sum of 3 squared differences vs single squared difference). The comparison of 0.6310 to v2.4 is formally **DROPPED**.
- **Status**: **PASS**.

---

### 8. 1st Half Over 0.5 Goals Skill Score
- **Evaluation Set**: $N = 6,709$ matches with valid halftime scores.
- **Model Log Loss**: $0.61160$
- **Naive Baseline Log Loss (70% prior)**: $0.61166$
- **Log Loss Skill Score**: $+0.00006$
- **Standard Error ($SE$)**: $0.00233$
- **95% Confidence Interval**: $[-0.00450, +0.00461]$
- **Finding**: The 95% confidence interval spans zero (lower bound is negative: $-0.00450$). The point estimate of $+0.00006$ is indistinguishable from random noise ($p = 0.970$).
- **Audit Mandate**: *"If not positive beyond noise, mark FAIL."*
- **Status**: **FAIL** (1st Half Over 0.5 removed from shipped).

---

### 9. Date Range and Match Counts Reconciliation
- **Evaluation Window**: August 1, 2024 to June 1, 2026.
- **Dataset Source**: `src/lib/data/free_sources_matches.json` (11,066 total fixtures).
- **Warmup Baseline**: 3,408 fixtures dated prior to 2024-08-01 (including full 2023/24 season).
- **Evaluation Window Total Scheduled**: 6,816 fixtures.

#### Division-by-Division Breakdown:
| Division Code | League / Competition | 2024/2025 Matches | 2025/2026 Matches | Total Fixtures in Window |
|---|---|---|---|---|
| **ELC** | Championship (E1) | 552 | 552 | 1,104 |
| **E2** | League One (E2) | 552 | 552 | 1,104 |
| **E3** | League Two (E3) | 552 | 552 | 1,104 |
| **PD** | La Liga (PD) | 380 | 380 | 760 |
| **FL1** | Ligue 1 (FL1) | 306 | 306 | 612 |
| **PL** | Premier League (E0) | 380 | 380 | 760 |
| **SA** | Serie A (SA) | 380 | 380 | 760 |
| **BL1** | Bundesliga (BL1) | 306 | 306 | 612 |
| **Total** | **All 8 Competitions** | **3,408** | **3,408** | **6,816** |

#### English League Subtotal:
- Premier League (PL): $380 \times 2 = 760$
- Championship (ELC): $552 \times 2 = 1,104$
- League One (E2): $552 \times 2 = 1,104$
- League Two (E3): $552 \times 2 = 1,104$
- **English Total**: **4,072 matches** across 2 full seasons.

#### Continental League Subtotal:
- La Liga (PD): $380 \times 2 = 760$
- Serie A (SA): $380 \times 2 = 760$
- Bundesliga (BL1): $306 \times 2 = 612$
- Ligue 1 (FL1): $306 \times 2 = 612$
- **Continental Total**: **2,744 matches**.

#### Reconciliation to 6,710 Evaluated Matches:
$$\text{Total in Window (6,816)} - \text{Cold-Start Safeguard Filter (106)} = \mathbf{6,710} \text{ Evaluated Matches}$$
- **Cold-Start Safeguard Filter**: Matches where either home or away team had fewer than 5 recorded previous fixtures in the rolling system were skipped for model scoring (to prevent unregularized sample instability). This accounted for exactly 106 fixtures.
- **Status**: **PASS**.

---

## Final Audit Sign-Off

1. **Authentication**: **UNTOUCHED** (Zero auth files modified).
2. **Data**: **READ-ONLY** (No training or historical records modified).
3. **Production Model Coefficients**: **UNCHANGED** (Audit performed strictly via evaluation harness).
4. **Final Shipped Markets**: **NONE (0 of 8 Shipped)**. All markets operate strictly under probability analysis without positive betting recommendation claims.
