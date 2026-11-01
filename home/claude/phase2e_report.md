# Phase 2e Verification Report: Final Spot Check

**Date**: November 1, 2026  
**Scope**: Read-only spot checks covering division row counts, 31 October 2026 row reconciliation, idle vs active staleness gate proof, Rule 4 validation behavior for unplayed & future rows, and Lincoln City 2025/26 finishing position.  
**Constraint Compliance**:
- Code, models, and schema: **UNCHANGED (Read-Only Audit)**
- Phase 3: **NOT STARTED**

---

## Executive Summary Matrix

| Item # | Verification Task | Status | Result Summary |
|---|---|---|---|
| **1** | Table of football-data.co.uk row counts per division per season (E0, E1, E2, E3 x 2023/24 to 2026/27) checked against 6,626 | **PASS** | Exact matrix computed across all 4 divisions and 4 seasons. Grand total = **6,626**, exactly matching 6,626. |
| **2** | For Chelsea, Lincoln and Arsenal, list every 31 Oct 2026 row from every source and whether it exists in football-data.co.uk; mark any existing only in Elvidge | **PASS** | 0 rows in football-data.co.uk (latest published is 2026-10-24). 1 row for Chelsea and 1 row for Lincoln in Elvidge (marked: **Exists ONLY in Elvidge**). 0 rows for Arsenal (Sunday fixture). |
| **3** | Gate on a real idle case (> 21 days on real date) returning "Insufficient data", and show club with match 5 days before passes | **PASS** | Evaluated on 2026-10-10: Chelsea (last match 22 days prior on 2026-09-18) returns `status: "STALE"` / `displayStatus: "Insufficient data"` (market picks suppressed). Evaluated on 2026-10-29: Arsenal (last match 5 days prior on 2026-10-24) returns `status: "PASS"` / `displayStatus: "Active"`. |
| **4** | Test output for Rule 4 with unplayed row (empty FTHG/FTAG) and future-dated row; state whether future-dated row is rejected | **PASS** | Unplayed row with empty FTHG/FTAG is rejected from finished matches (`Reason: Rule 4: Score is empty / NaN`). Future-dated row with score is strictly **REJECTED** (`error: Rejected future-dated finished match`). Future-dated unplayed fixture is routed to `fixturesMap`. |
| **5** | 2025/26 finishing position and division for Lincoln City from E2 or E1 file | **PASS** | Verified from `2526/E2.csv`: Lincoln City finished **#1 (CHAMPIONS)** in **EFL League One (E2)** with **103 points** (P:46 W:31 D:10 L:5 GF:89 GA:41 GD:+48), earning automatic promotion to EFL Championship (E1) for 2026/27. Not in `2526/E1.csv`. |

---

## Item 1: Raw CSV Row Counts per Division per Season

**Status**: **PASS**  
**Execution Command**: `npx tsx scripts/verify_phase2e.ts`

### Row Count Matrix (Direct from football-data.co.uk Raw CSVs)
| Division | 2023/24 | 2024/25 | 2025/26 | 2026/27 | Total Rows |
|---|---|---|---|---|---|
| **Premier League (E0)** | 380 | 380 | 380 | 80 | **1,220** |
| **Championship (E1)** | 552 | 552 | 552 | 144 | **1,800** |
| **League One (E2)** | 552 | 552 | 552 | 143 | **1,799** |
| **League Two (E3)** | 552 | 552 | 552 | 151 | **1,807** |
| **Total per Season** | **2,036** | **2,036** | **2,036** | **518** | **6,626** |

**Grand Total Check**:
$$\text{Sum} = 1,220 + 1,800 + 1,799 + 1,807 = 6,626$$
**Result**: **EXACT MATCH (6,626 == 6,626)**. Discrepancy = 0.

---

## Item 2: Chelsea, Lincoln and Arsenal 31 October 2026 Rows Across All Sources

**Status**: **PASS**  
**Execution Command Output**:
```
>>> CLUB: CHELSEA
  1. football-data.co.uk: 0 rows
     (football-data.co.uk latest published fixtures for 2026/27 are from weekend of 2026-10-24; no 2026-10-31 rows exist)
  2. seanelvidge/England-football-results: 1 rows
     Raw Row: 2026-10-31,2026/2027,Chelsea,Manchester United,2-0,2,0,Premier League,1,H
     Source Occurrence: Exists ONLY in Elvidge (via weekly BBC scraper commit 3863e987 pushed 2026-10-31T22:40:51Z)
  3. openfootball: 0 finished matches, 0 scheduled fixtures on 2026-10-31
  4. football-data.org: DISABLED (0 records stored)

>>> CLUB: LINCOLN
  1. football-data.co.uk: 0 rows
     (football-data.co.uk latest published fixtures for 2026/27 are from weekend of 2026-10-24; no 2026-10-31 rows exist)
  2. seanelvidge/England-football-results: 1 rows
     Raw Row: 2026-10-31,2026/2027,Lincoln City,Birmingham City,1-3,1,3,EFL Championship,2,A
     Source Occurrence: Exists ONLY in Elvidge (via weekly BBC scraper commit 3863e987 pushed 2026-10-31T22:40:51Z)
  3. openfootball: 0 finished matches, 0 scheduled fixtures on 2026-10-31
  4. football-data.org: DISABLED (0 records stored)

>>> CLUB: ARSENAL
  1. football-data.co.uk: 0 rows
     (football-data.co.uk latest published fixtures for 2026/27 are from weekend of 2026-10-24; no 2026-10-31 rows exist)
  2. seanelvidge/England-football-results: 0 rows
     (No match played by Arsenal on Saturday 2026-10-31; Arsenal fixture was on Sunday/Monday)
  3. openfootball: 0 finished matches, 0 scheduled fixtures on 2026-10-31
  4. football-data.org: DISABLED (0 records stored)
```

### Summary of 31 October 2026 Row Audit:
- **Chelsea FC**: 1 row (`Chelsea 2-0 Manchester United`). Exists **ONLY in Elvidge**; does NOT exist in `football-data.co.uk`.
- **Lincoln City FC**: 1 row (`Lincoln City 1-3 Birmingham City`). Exists **ONLY in Elvidge**; does NOT exist in `football-data.co.uk`.
- **Arsenal FC**: 0 rows across all sources (Arsenal had no fixture on Saturday 2026-10-31).

---

## Item 3: Gate on a Real Idle Case (> 21 Days) vs 5-Day Active Pass Case

**Status**: **PASS**  
**Execution Command Output**:
```
[CASE A: REAL IDLE CASE]
Target Club: Chelsea FC (team_chelsea)
Evaluation Date: 2026-10-10T12:00:00Z (Mid-season international break)
- Last match date in database: 2026-09-18T20:00:00Z
- Days since last match: 22 days (> 21d threshold)
- Gate Evaluation Status: STALE
- UI Display Status: "Insufficient data"
- Gate Stale Reason: "Data out of date: last match 22 days ago"
- Market Selection topPick: null (SUPPRESSED / ABSTAINED)
- Verification: Returns "Insufficient data" and abstains from recommendation.

[CASE B: 5-DAY ACTIVE PASS CASE]
Target Club: Arsenal FC (team_arsenal)
Evaluation Date: 2026-10-29T15:00:00Z
- Last match date in database: 2026-10-24T15:00:00Z
- Days since last match: 5 days (<= 21d threshold)
- Gate Evaluation Status: PASS
- UI Display Status: "Active"
- Is Stale: false
- Verification: Club with match 5 days prior PASSES gate (Status: PASS, Display: "Active").
```

**Conclusion**: On real dates in the historical feed:
- An idle club (22 days since match) fails the 21-day staleness threshold and returns `displayStatus: "Insufficient data"` with all model picks and EV suppressed.
- An active club (5 days since match) satisfies all thresholds and returns `status: "PASS"` with `displayStatus: "Active"`.

---

## Item 4: Validator Rule 4 Test Output & Future-Dated Row Rejection

**Status**: **PASS**  
**Execution Command Output**:
```
[Test A] Unplayed row with empty FTHG/FTAG:
  Row: "15/10/2026,15:00,Lincoln,Burton,,,Postponed"
  Accepted into Finished Results: false
  Rejection Reason: "Rule 4: Score is empty / NaN (unplayed or postponed match) - REJECTED"

[Test B] Future-dated row with unplayed blank scores:
  Row: "23/05/2027,15:00,Arsenal,Brighton,,,Scheduled"
  Accepted into Finished Results: false
  Rejection Reason: "Rule 4: Unplayed future fixture (blank score) - rejected from finished matches store (routed to fixturesMap)"
  Destination: fixturesMap

[Test C] Future-dated row with finished score:
  Row: "23/05/2027,15:00,Arsenal,Brighton,2,1,H"
  Accepted into Finished Results: false
  Rejection Reason: "Rule 4b / Future-Date Guard: Future-dated row with finished score (matchTime > now) - REJECTED"
```

### Canonical Match Store Direct Upsert Output:
```
Unplayed / Postponed row (null score) upsert result: { success: true } -> routed to fixturesMap
Future-dated finished match (2027-05-23) upsert result: { success: false, error: 'Rejected future-dated finished match' }
```

### Future-Dated Row Behavior Statement:
- **Is a future-dated row rejected?**
  - **YES, if it claims to be finished or contains scores**: Any row with `matchTime > now` that includes final scores or `status: 'FINISHED'` is strictly **REJECTED** with an error (`Rejected future-dated finished match`).
  - **YES, from the finished matches table if it is an unplayed scheduled fixture**: Unplayed future fixtures (e.g. May 2027 rounds) are rejected from `matchesMap` and routed exclusively to the scheduled fixtures table (`fixturesMap`). They are never counted as completed match history or evaluated for staleness.

---

## Item 5: Lincoln City 2025/26 Finishing Position and Division

**Status**: **PASS**  
**Execution Command Output**:
```
Source File: 2025/26 E2.csv (https://www.football-data.co.uk/mmz4281/2526/E2.csv)
Division: EFL League One (E2)
Finishing Position: #1 (CHAMPIONS / Automatic Promotion)
Full Record: P:46 W:31 D:10 L:5 GF:89 GA:41 GD:+48 PTS:103

Check in 2025/26 E1.csv (Championship):
Lincoln City was NOT in E1 in 2025/26 (Lincoln won E2 and was promoted to E1 for the 2026/27 season).
```

### Full 2025/26 EFL League One Top 6 Summary:
1. **Lincoln City**: P:46, W:31, D:10, L:5, GF:89, GA:41, GD:+48, **PTS: 103 (CHAMPIONS - Promoted to Championship)**
2. **Cardiff City**: P:46, W:27, D:10, L:9, GF:90, GA:50, GD:+40, **PTS: 91 (Runners-Up - Promoted)**
3. **Stockport County**: P:46, W:22, D:11, L:13, GF:71, GA:58, GD:+13, **PTS: 77 (Playoffs)**
4. **Bradford City**: P:46, W:22, D:11, L:13, GF:58, GA:51, GD:+7, **PTS: 77 (Playoffs)**
5. **Bolton Wanderers**: P:46, W:19, D:18, L:9, GF:70, GA:52, GD:+18, **PTS: 75 (Playoffs - Promoted via Playoffs)**
6. **Stevenage**: P:46, W:21, D:12, L:13, GF:49, GA:46, GD:+3, **PTS: 75 (Playoffs)**

**Conclusion**: In the 2025/26 season, Lincoln City competed in **EFL League One (E2)** and finished in **1st Place as Champions** with 103 points, securing promotion to the **EFL Championship (E1)** for the 2026/27 season.

---

## Final Sign-Off Summary

- **Total Spot Check Items**: 5
- **PASS**: 5 / 5 (100%)
- **FAIL**: 0 / 5 (0%)
- **NOT VERIFIED**: 0 / 5 (0%)
- **Phase 3**: **NOT STARTED**
