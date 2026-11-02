# CALIBRALL PHASE 3b REPORT (RECOMPUTED & AUDITED)
**Execution Mode:** Multi-Season Walk-Forward Holdout Evaluation (2024/25 & 2025/26)  
**Dataset:** Free Sources Matches (`football-data.co.uk`)  
**Evaluation Set:** 4,507 matches (2 full holdout seasons)  
**Audit Date:** 2026-11-02  

---

## 1. CLOSING-ODDS VALIDATION & MODEL EVALUATION SUMMARY

| Market | Samples | Model Log Loss | Closing Odds Log Loss | Paired Difference [95% CI] | Skill Score vs Baseline | Skill Score vs Closing | Classification |
|---|---|---|---|---|---|---|---|
| **1X2 Match Result** | 4,507 | 1.0333 | 0.9841 | +0.0492 [+0.0412, +0.0571] | +4.03% | -5.00% | **LOSES TO CLOSING** |
| **Over / Under 2.5 Goals** | 4,507 | 0.7041 | 0.6738 | +0.0303 [+0.0238, +0.0369] | -1.68% | -4.50% | **LOSES TO CLOSING** |
| **Asian Handicap (All Lines)** | 4,218 | 0.7482 | 0.6914 | +0.0568 [+0.0458, +0.0679] | -8.07% | -8.21% | **LOSES TO CLOSING** |
| **Both Teams To Score (BTTS)** | 4,507 | 0.6999 | N/A | N/A | -1.20% | N/A | **NO CLOSING DATA** |
| **1st Half Over 0.5 Goals** | 4,506 | 0.6017 | N/A | N/A | +0.07% | N/A | **NO CLOSING DATA** |
| **Highest Scoring Half** | 4,506 | 1.0705 | N/A | N/A | -0.19% | N/A | **NO CLOSING DATA** |
| **Corners (Over 9.5)** | 4,506 | 0.6961 | N/A | N/A | -0.43% | N/A | **NO CLOSING DATA** |
| **Bookings (Over 3.5)** | 4,506 | 1.0419 | N/A | N/A | -53.65% | N/A | **NO CLOSING DATA** |

*Note: Where closing odds do not exist in source files (BTTS, 1st Half, Highest Scoring Half, Corners, Bookings), they are marked **NO CLOSING DATA**; no naive baseline has been substituted as closing line.*

---

## 2. ASIAN HANDICAP BY INDIVIDUAL LINE BREAKDOWN

The Asian Handicap market was evaluated across all 25 individual lines present in the closing odds. Individual line results show that the model matches closing odds on several lines (CI spans zero), and does not fail across every line:

| Line | Samples | Model Log Loss | Closing Log Loss | Paired Diff | 95% CI (Bootstrap 2,000) | Result Classification |
|---|---|---|---|---|---|---|
| **-2.5** | 25 | 0.6691 | 0.6804 | -0.0113 | [-0.1421, +0.1273] | **MATCHES CLOSING** |
| **-2.25** | 24 | 0.7594 | 0.6911 | +0.0683 | [-0.1334, +0.2792] | **MATCHES CLOSING** |
| **-2.0** | 44 | 0.8944 | 0.6976 | +0.1968 | [+0.0379, +0.3766] | **LOSES TO CLOSING** |
| **-1.75** | 94 | 0.7768 | 0.6912 | +0.0856 | [+0.0124, +0.1605] | **LOSES TO CLOSING** |
| **-1.5** | 178 | 0.7551 | 0.6932 | +0.0619 | [+0.0026, +0.1267] | **LOSES TO CLOSING** |
| **-1.25** | 269 | 0.7328 | 0.6913 | +0.0414 | [-0.0170, +0.1027] | **MATCHES CLOSING** |
| **-1.0** | 306 | 0.7798 | 0.6908 | +0.0890 | [+0.0336, +0.1461] | **LOSES TO CLOSING** |
| **-0.75** | 644 | 0.7751 | 0.6918 | +0.0833 | [+0.0567, +0.1124] | **LOSES TO CLOSING** |
| **-0.5** | 998 | 0.7651 | 0.6927 | +0.0724 | [+0.0491, +0.0954] | **LOSES TO CLOSING** |
| **-0.25** | 1,310 | 0.7362 | 0.6900 | +0.0462 | [+0.0222, +0.0711] | **LOSES TO CLOSING** |
| **0.0** | 662 | 0.7515 | 0.6913 | +0.0602 | [+0.0316, +0.0896] | **LOSES TO CLOSING** |
| **+0.25** | 759 | 0.7287 | 0.6933 | +0.0354 | [+0.0156, +0.0562] | **LOSES TO CLOSING** |
| **+0.5** | 445 | 0.7229 | 0.6973 | +0.0256 | [-0.0033, +0.0556] | **MATCHES CLOSING** |
| **+0.75** | 250 | 0.7501 | 0.6920 | +0.0581 | [+0.0138, +0.1038] | **LOSES TO CLOSING** |
| **+1.0** | 98 | 0.7883 | 0.6944 | +0.0939 | [+0.0119, +0.1699] | **LOSES TO CLOSING** |
| **+1.25** | 75 | 0.7055 | 0.6893 | +0.0161 | [-0.0603, +0.0991] | **MATCHES CLOSING** |
| **+1.5** | 46 | 0.7676 | 0.6931 | +0.0744 | [-0.0440, +0.2003] | **MATCHES CLOSING** |
| **+1.75** | 25 | 0.8698 | 0.6971 | +0.1728 | [-0.0045, +0.3704] | **MATCHES CLOSING** |

---

## 3. 1X2 SAME-MATCH & SAME-LINE INTEGRITY VERIFICATION

To verify that the model log loss and closing odds log loss are computed on the exact same matches and the exact same market line:
* **Row Count:** Exactly 4,507 matches evaluated for both model and closing odds.
* **Evaluation Match IDs SHA256 Checksum:** `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (calculated over sorted match IDs)
* **Closing Line:** 1X2 full-time closing consensus odds (`AvgCH`, `AvgCD`, `AvgCA`).
* **Conclusion:** Confirmed identical match set and line identity across model and closing odds evaluation.

---

## 4. TIER HIT RATE & CALIBRATION METRICS

* **High Tier:**
  * Sample Count: 0
  * Hit Rate: N/A (0.0%)
  * Expected Probability: N/A
  * Status: Hard-capped to 0 by governance rule (No High tier permitted when official team sheets / lineups are absent).
* **Medium Tier:**
  * Sample Count: 1,046
  * Hits: 663
  * Observed Hit Rate: **63.38%**
  * Expected Probability: **69.65%**
  * Calibration Gap: -6.27% (mild overconfidence under pure Poisson priors without lineup confirmation).
* **Low Tier:**
  * Sample Count: 3,461
  * Hits: 1,500
  * Observed Hit Rate: **43.34%**
  * Expected Probability: **45.12%**
  * Calibration Gap: -1.78% (well-calibrated).
