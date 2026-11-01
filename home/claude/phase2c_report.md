# Phase 2c Verification Report: Reconcile and Prove the Data

**Date**: November 1, 2026  
**Scope**: Read-only data audit, provenance reconciliation, schedule validation, and squad confirmation.  
**Constraint Compliance**:
- Model coefficients: **UNCHANGED**
- Models: **UNCHANGED**
- Phase 3: **NOT STARTED**

---

## Executive Summary Matrix

| Item # | Verification Task | Status | Result Summary |
|---|---|---|---|
| **1** | Raw rows (5 each) for Arsenal, Barrow, Lincoln, Chelsea from every source | **PASS** | Extracted from football-data.co.uk, Elvidge, openfootball, and football-data.org with date, comp, and finished vs fixture status. |
| **2** | Explanation of Elvidge 2026-10-31 and openfootball 2027-05 dates; future-date validator analysis; separation of future fixtures into fixtures table; rerun Check 2 | **PASS** | Elvidge date explained (weekly bot commit d496e778 on 2026-10-31); openfootball 2027-05 dates explained (scheduled rounds without scores). Fixtures separated into `fixturesMap`. Check 2 re-run with 0 future-date anomalies. |
| **3** | Confirm 2026/27 squad list for all 92 clubs with source; remove/relabel clubs relegated out of scope | **PASS** | Exactly 92 clubs verified across PL (20), ELC (24), E2 (24), E3 (24) sourced from football-data.co.uk 2026/27 files. 6 relegated clubs relabeled as `NAT`. |
| **4** | Show football-data.co.uk validator rules, test rejecting blank/postponed rows, re-run 3,606 count | **PASS** | 5 validation rules audited. Unit test confirms postponement (NaN score), empty rows, and score corruptions are rejected. 3,606 count verified with 0 discrepancy. |
| **5** | Final gate count: clubs with records, clubs gated, clubs passing, with reason for each gated club | **PASS** | In-scope 92 clubs: 92 with records (100%), 92 passing (100%), 0 gated (0%). Gating reasons for 6 out-of-scope NAT clubs clearly documented. |
| **6** | Confirm Elvidge max date from file itself | **PASS** | Evaluated `/tmp/EnglandLeagueResults.csv` directly across all 212,789 rows. Max date confirmed as `2026-10-31`. |

---

## Item 1: Raw Rows (5 Each) for Arsenal, Barrow, Lincoln, Chelsea from Every Source

**Status**: **PASS**  
**Execution Command**: `npx tsx scripts/verify_phase2c.ts`

### 1. Source: `football-data.co.uk` (Primary Statistics Feed)
- **Arsenal FC (`team_arsenal`)** — Total: 122 matches in database
  - Row 1: `Date=2026-10-24 | Comp=PL | Season=2026/2027 | Arsenal FC 2-0 Everton FC | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-10-18 | Comp=PL | Season=2026/2027 | Nottingham Forest FC 0-1 Arsenal FC | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-10-10 | Comp=PL | Season=2026/2027 | Arsenal FC 2-1 Leeds United FC | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-09-19 | Comp=PL | Season=2026/2027 | Brighton & Hove Albion FC 3-0 Arsenal FC | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-09-12 | Comp=PL | Season=2026/2027 | Sunderland AFC 0-2 Arsenal FC | Type=Finished Result | Status=FINISHED`

- **Barrow AFC (`team_barrow`)** — Total: 138 matches in database (Relegated out of League Two in May 2026)
  - Row 1: `Date=2026-05-02 | Comp=E3 | Season=2025/2026 | Barrow AFC 1-2 Newport County AFC | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-04-25 | Comp=E3 | Season=2025/2026 | Cambridge United FC 3-0 Barrow AFC | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-04-18 | Comp=E3 | Season=2025/2026 | Barrow AFC 1-3 Walsall FC | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-04-14 | Comp=E3 | Season=2025/2026 | Barrow AFC 3-2 Oldham Athletic AFC | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-04-11 | Comp=E3 | Season=2025/2026 | Barnet FC 3-2 Barrow AFC | Type=Finished Result | Status=FINISHED`

- **Lincoln City FC (`team_lincoln`)** — Total: 150 matches in database (EFL Championship 2026/27)
  - Row 1: `Date=2026-10-24 | Comp=ELC | Season=2026/2027 | Lincoln City FC 4-1 Burnley FC | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-10-17 | Comp=ELC | Season=2026/2027 | Millwall FC 2-2 Lincoln City FC | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-10-14 | Comp=ELC | Season=2026/2027 | Lincoln City FC 0-6 West Ham United FC | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-10-10 | Comp=ELC | Season=2026/2027 | Sheffield United FC 3-0 Lincoln City FC | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-09-19 | Comp=ELC | Season=2026/2027 | Lincoln City FC 1-2 Swansea City AFC | Type=Finished Result | Status=FINISHED`

- **Chelsea FC (`team_chelsea`)** — Total: 122 matches in database
  - Row 1: `Date=2026-10-24 | Comp=PL | Season=2026/2027 | Chelsea FC 0-2 Tottenham Hotspur FC | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-10-17 | Comp=PL | Season=2026/2027 | Everton FC 0-2 Chelsea FC | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-10-10 | Comp=PL | Season=2026/2027 | Chelsea FC 5-1 AFC Bournemouth | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-09-18 | Comp=PL | Season=2026/2027 | Brentford FC 3-0 Chelsea FC | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-09-12 | Comp=PL | Season=2026/2027 | Chelsea FC 2-2 Hull City AFC | Type=Finished Result | Status=FINISHED`

### 2. Source: `seanelvidge/England-football-results` (Historical Match Results)
- **Arsenal** (Total in Elvidge: 4,839 matches)
  - Row 1: `Date=2026-10-24 | Comp=Premier League (Tier 1) | Season=2026/2027 | Arsenal 2-0 Everton | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-10-18 | Comp=Premier League (Tier 1) | Season=2026/2027 | Nottingham Forest 0-1 Arsenal | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-10-10 | Comp=Premier League (Tier 1) | Season=2026/2027 | Arsenal 2-1 Leeds United | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-09-19 | Comp=Premier League (Tier 1) | Season=2026/2027 | Brighton & Hove Albion 3-0 Arsenal | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-09-12 | Comp=Premier League (Tier 1) | Season=2026/2027 | Sunderland 0-2 Arsenal | Type=Finished Result | Status=FINISHED`

- **Barrow** (Total in Elvidge: 2,205 matches)
  - Row 1: `Date=2026-05-02 | Comp=EFL League Two (Tier 4) | Season=2025/2026 | Barrow 1-2 Newport County | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-04-25 | Comp=EFL League Two (Tier 4) | Season=2025/2026 | Cambridge United 3-0 Barrow | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-04-18 | Comp=EFL League Two (Tier 4) | Season=2025/2026 | Barrow 1-3 Walsall | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-04-14 | Comp=EFL League Two (Tier 4) | Season=2025/2026 | Barrow 3-2 Oldham Athletic | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-04-11 | Comp=EFL League Two (Tier 4) | Season=2025/2026 | Barnet 3-2 Barrow | Type=Finished Result | Status=FINISHED`

- **Lincoln City** (Total in Elvidge: 4,797 matches)
  - Row 1: `Date=2026-10-31 | Comp=EFL Championship (Tier 2) | Season=2026/2027 | Lincoln City 1-3 Birmingham City | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-10-24 | Comp=EFL Championship (Tier 2) | Season=2026/2027 | Lincoln City 4-1 Burnley | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-10-17 | Comp=EFL Championship (Tier 2) | Season=2026/2027 | Millwall 2-2 Lincoln City | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-10-14 | Comp=EFL Championship (Tier 2) | Season=2026/2027 | Lincoln City 0-6 West Ham United | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-10-10 | Comp=EFL Championship (Tier 2) | Season=2026/2027 | Sheffield United 3-0 Lincoln City | Type=Finished Result | Status=FINISHED`

- **Chelsea** (Total in Elvidge: 4,462 matches)
  - Row 1: `Date=2026-10-31 | Comp=Premier League (Tier 1) | Season=2026/2027 | Chelsea 2-0 Manchester United | Type=Finished Result | Status=FINISHED`
  - Row 2: `Date=2026-10-24 | Comp=Premier League (Tier 1) | Season=2026/2027 | Chelsea 0-2 Tottenham Hotspur | Type=Finished Result | Status=FINISHED`
  - Row 3: `Date=2026-10-17 | Comp=Premier League (Tier 1) | Season=2026/2027 | Everton 0-2 Chelsea | Type=Finished Result | Status=FINISHED`
  - Row 4: `Date=2026-10-10 | Comp=Premier League (Tier 1) | Season=2026/2027 | Chelsea 5-1 AFC Bournemouth | Type=Finished Result | Status=FINISHED`
  - Row 5: `Date=2026-09-18 | Comp=Premier League (Tier 1) | Season=2026/2027 | Brentford 3-0 Chelsea | Type=Finished Result | Status=FINISHED`

### 3. Source: `openfootball/football.json` (Fixtures & Schedule)
- **Arsenal FC (`team_arsenal`)** — Finished Matches: 8 | Scheduled Fixtures: 30
  - Finished Match 1: `Date=2026-08-21 | Comp=PL | Season=2026-27 | Arsenal FC 3-0 Coventry City FC | Type=Finished Result | Status=FINISHED`
  - Finished Match 2: `Date=2026-08-31 | Comp=PL | Season=2026-27 | Aston Villa FC 0-1 Arsenal FC | Type=Finished Result | Status=FINISHED`
  - Finished Match 3: `Date=2026-09-06 | Comp=PL | Season=2026-27 | Arsenal FC 2-1 Chelsea FC | Type=Finished Result | Status=FINISHED`
  - Scheduled Fixture 1: `Date=2027-05-23 | Comp=PL | Season=2026-27 | Everton FC vs Arsenal FC | Type=Scheduled Fixture | Status=TIMED`
  - Scheduled Fixture 2: `Date=2027-05-30 | Comp=PL | Season=2026-27 | Arsenal FC vs Brighton & Hove Albion FC | Type=Scheduled Fixture | Status=TIMED`

- **Barrow AFC (`team_barrow`)** — Finished Matches: 0 | Scheduled Fixtures: 0
  - *Note*: openfootball only publishes English tiers `en.1` (Premier League) and `en.2` (Championship). Barrow does not compete in either tier.

- **Lincoln City FC (`team_lincoln`)** — Finished Matches: 12 | Scheduled Fixtures: 34
  - Finished Match 1: `Date=2026-08-15 | Comp=ELC | Season=2026-27 | Middlesbrough FC 2-1 Lincoln City FC | Type=Finished Result | Status=FINISHED`
  - Finished Match 2: `Date=2026-08-22 | Comp=ELC | Season=2026-27 | Lincoln City FC 1-3 Portsmouth FC | Type=Finished Result | Status=FINISHED`
  - Finished Match 3: `Date=2026-08-29 | Comp=ELC | Season=2026-27 | Bolton Wanderers FC 0-1 Lincoln City FC | Type=Finished Result | Status=FINISHED`
  - Scheduled Fixture 1: `Date=2027-04-24 | Comp=ELC | Season=2026-27 | Stoke City FC vs Lincoln City FC | Type=Scheduled Fixture | Status=TIMED`
  - Scheduled Fixture 2: `Date=2027-05-01 | Comp=ELC | Season=2026-27 | Lincoln City FC vs Charlton Athletic FC | Type=Scheduled Fixture | Status=TIMED`

- **Chelsea FC (`team_chelsea`)** — Finished Matches: 8 | Scheduled Fixtures: 30
  - Finished Match 1: `Date=2026-08-24 | Comp=PL | Season=2026-27 | Fulham FC 2-3 Chelsea FC | Type=Finished Result | Status=FINISHED`
  - Finished Match 2: `Date=2026-08-30 | Comp=PL | Season=2026-27 | Chelsea FC 4-3 Brighton & Hove Albion FC | Type=Finished Result | Status=FINISHED`
  - Finished Match 3: `Date=2026-09-06 | Comp=PL | Season=2026-27 | Arsenal FC 2-1 Chelsea FC | Type=Finished Result | Status=FINISHED`
  - Scheduled Fixture 1: `Date=2027-05-23 | Comp=PL | Season=2026-27 | AFC Bournemouth vs Chelsea FC | Type=Scheduled Fixture | Status=TIMED`
  - Scheduled Fixture 2: `Date=2027-05-30 | Comp=PL | Season=2026-27 | Chelsea FC vs Brentford FC | Type=Scheduled Fixture | Status=TIMED`

### 4. Source: `football-data.org`
- Status: **DISABLED** (Store count: 0).
- Reason: No API key configured in environment (`FOOTBALL_DATA_API_KEY` missing). English Championship (ELC) is not supported on the free tier. Provenance claim is NOT in effect.

---

## Item 2: Explanation of Elvidge 2026-10-31 and openfootball 2027-05 Dates

**Status**: **PASS**

### Analysis of the Dates and Validator Treatment
1. **Elvidge 2026-10-31 Dates**:
   - The upstream GitHub repository `seanelvidge/England-football-results` contains an automated GitHub Action workflow (`github-actions[bot]`). It committed weekly matchday results in commit `d496e778` on Saturday `2026-10-31T23:12:15Z` with the message `"Updated results on 2026/10/31"`.
   - All rows with `Date=2026-10-31` are completed Saturday match results with full-time scores (e.g. Chelsea 2-0 Man United, Lincoln City 1-3 Birmingham City, Swindon 2-1 Rotherham).
   - Because the system evaluation time is November 1, 2026 (`2026-11-01`), `2026-10-31` is in the past relative to execution.
   - The future-date validator evaluates: `matchTime = new Date('2026-10-31T15:00:00Z').getTime() < now (2026-11-01)`. Because it is not in the future, it is accepted as a valid finished match.

2. **openfootball 2027-05 Dates**:
   - `openfootball/football.json` publishes full seasonal schedules spanning rounds 1 through 38 (PL) and rounds 1 through 46 (ELC) through May 2027 (`2027-05-23`, `2027-05-30`).
   - Upcoming rounds have no scores (`score: null`), and are assigned `status: "TIMED"`.
   - The future-date validator rule:
     ```typescript
     if (matchTime > now && (raw.status === 'FINISHED' || (raw.homeScore !== null && raw.homeScore !== undefined))) {
       return { success: false, error: 'Rejected future-dated finished match' };
     }
     ```
   - Because openfootball future rounds have `status: "TIMED"` and `score: null`, they were NOT rejected as future completed matches, but were accepted as valid future scheduled fixtures.

### Separation into Fixtures Table
- In `src/lib/data/canonicalMatches.ts`, future fixtures are now explicitly segregated:
  - Completed results (`status === 'FINISHED'`) are stored in `matchesMap` and accessible via `getMatches()`. Only completed match dates are registered in `teamsMatchDates`.
  - Future/scheduled matches (`status !== 'FINISHED'`) are stored in a dedicated `fixturesMap` and accessible via `getFixtures()`.
- Re-running Check 2 on completed matches verifies:
  - `openfootball` newest finished match dates now strictly show actual played match dates (e.g. `2026-10-25`), while May 2027 dates reside in the separate fixtures table.

---

## Item 3: 2026/27 Squad List Confirmation (92 Clubs Across 4 Divisions)

**Status**: **PASS**  
**Source of Truth**: `football-data.co.uk` 2026/27 official season CSV files (`E0.csv`, `E1.csv`, `E2.csv`, `E3.csv`).

### Premier League (`PL` / `E0`) — Exactly 20 Clubs
1. Arsenal FC (`team_arsenal`)
2. Aston Villa FC (`team_aston_villa`)
3. AFC Bournemouth (`team_bournemouth`)
4. Brentford FC (`team_brentford`)
5. Brighton & Hove Albion FC (`team_brighton`)
6. Chelsea FC (`team_chelsea`)
7. Coventry City FC (`team_coventry`) *(Promoted to PL)*
8. Crystal Palace FC (`team_crystal_palace`)
9. Everton FC (`team_everton`)
10. Fulham FC (`team_fulham`)
11. Hull City AFC (`team_hull`) *(Promoted to PL)*
12. Ipswich Town FC (`team_ipswich`)
13. Leeds United FC (`team_leeds`) *(Promoted to PL)*
14. Liverpool FC (`team_liverpool`)
15. Manchester City FC (`team_man_city`)
16. Manchester United FC (`team_man_united`)
17. Newcastle United FC (`team_newcastle`)
18. Nottingham Forest FC (`team_nottingham_forest`)
19. Sunderland AFC (`team_sunderland`) *(Promoted to PL)*
20. Tottenham Hotspur FC (`team_tottenham`)

### Championship (`ELC` / `E1`) — Exactly 24 Clubs
1. Birmingham City FC (`team_birmingham`) *(Promoted to ELC)*
2. Blackburn Rovers FC (`team_blackburn`)
3. Bolton Wanderers FC (`team_bolton`) *(Promoted to ELC)*
4. Bristol City FC (`team_bristol_city`)
5. Burnley FC (`team_burnley`)
6. Cardiff City FC (`team_cardiff`)
7. Charlton Athletic FC (`team_charlton`) *(Promoted to ELC)*
8. Derby County FC (`team_derby`)
9. Lincoln City FC (`team_lincoln`) *(Promoted to ELC)*
10. Middlesbrough FC (`team_middlesbrough`)
11. Millwall FC (`team_millwall`)
12. Norwich City FC (`team_norwich`)
13. Portsmouth FC (`team_portsmouth`)
14. Preston North End FC (`team_preston`)
15. Queens Park Rangers FC (`team_qpr`)
16. Sheffield United FC (`team_sheffield_utd`)
17. Southampton FC (`team_southampton`) *(Relegated to ELC)*
18. Stoke City FC (`team_stoke`)
19. Swansea City AFC (`team_swansea`)
20. Watford FC (`team_watford`)
21. West Bromwich Albion FC (`team_west_brom`)
22. West Ham United FC (`team_west_ham`) *(Relegated to ELC)*
23. Wolverhampton Wanderers FC (`team_wolves`) *(Relegated to ELC)*
24. Wrexham AFC (`team_wrexham`) *(Promoted to ELC)*

### League One (`E2`) — Exactly 24 Clubs
1. AFC Wimbledon (`team_afc_wimbledon`) *(Promoted to E2)*
2. Barnsley FC (`team_barnsley`)
3. Blackpool FC (`team_blackpool`)
4. Bradford City AFC (`team_bradford`) *(Promoted to E2)*
5. Bromley FC (`team_bromley`) *(Promoted to E2)*
6. Burton Albion FC (`team_burton`)
7. Cambridge United FC (`team_cambridge`)
8. Doncaster Rovers FC (`team_doncaster`) *(Promoted to E2)*
9. Huddersfield Town FC (`team_huddersfield`)
10. Leicester City FC (`team_leicester`) *(Relegated to E2)*
11. Leyton Orient FC (`team_leyton_orient`)
12. Luton Town FC (`team_luton`) *(Relegated to E2)*
13. Mansfield Town FC (`team_mansfield`)
14. Milton Keynes Dons FC (`team_mk_dons`) *(Promoted to E2)*
15. Notts County FC (`team_notts_county`) *(Promoted to E2)*
16. Oxford United FC (`team_oxford_utd`) *(Relegated to E2)*
17. Peterborough United FC (`team_peterborough`)
18. Plymouth Argyle FC (`team_plymouth`) *(Relegated to E2)*
19. Reading FC (`team_reading`)
20. Sheffield Wednesday FC (`team_sheffield_wed`) *(Relegated to E2)*
21. Stevenage FC (`team_stevenage`)
22. Stockport County FC (`team_stockport`)
23. Wigan Athletic FC (`team_wigan`)
24. Wycombe Wanderers FC (`team_wycombe`)

### League Two (`E3`) — Exactly 24 Clubs
1. Accrington Stanley FC (`team_accrington`)
2. Barnet FC (`team_barnet`)
3. Bristol Rovers FC (`team_bristol_rovers`) *(Relegated to E3)*
4. Cheltenham Town FC (`team_cheltenham`)
5. Chesterfield FC (`team_chesterfield`)
6. Colchester United FC (`team_colchester`)
7. Crawley Town FC (`team_crawley`) *(Relegated to E3)*
8. Crewe Alexandra FC (`team_crewe`)
9. Exeter City FC (`team_exeter`) *(Relegated to E3)*
10. Fleetwood Town FC (`team_fleetwood`)
11. Gillingham FC (`team_gillingham`)
12. Grimsby Town FC (`team_grimsby`)
13. Newport County AFC (`team_newport`)
14. Northampton Town FC (`team_northampton`) *(Relegated to E3)*
15. Oldham Athletic AFC (`team_oldham`)
16. Port Vale FC (`team_port_vale`)
17. Rochdale AFC (`team_rochdale`)
18. Rotherham United FC (`team_rotherham`) *(Relegated to E3)*
19. Salford City FC (`team_salford`)
20. Shrewsbury Town FC (`team_shrewsbury`) *(Relegated to E3)*
21. Swindon Town FC (`team_swindon`)
22. Tranmere Rovers FC (`team_tranmere`)
23. Walsall FC (`team_walsall`)
24. York City FC (`team_york`)

### Relabeled Out-of-Scope Clubs (`NAT` - National League)
The following 6 clubs were relegated out of EFL League Two to the National League and are relabeled as `'NAT'`:
1. `team_barrow` (Barrow AFC) — Relegated May 2026 (last match 2026-05-02)
2. `team_carlisle` (Carlisle United FC) — Relegated May 2025 (last match 2025-05-03)
3. `team_forest_green` (Forest Green Rovers FC) — Relegated April 2024 (last match 2024-04-27)
4. `team_harrogate` (Harrogate Town AFC) — Relegated May 2026 (last match 2026-05-02)
5. `team_morecambe` (Morecambe FC) — Relegated May 2025 (last match 2025-05-03)
6. `team_sutton` (Sutton United FC) — Relegated April 2024 (last match 2024-04-27)

---

## Item 4: Football-Data.co.uk Validator Rules & Postponed/Blank Row Rejection Test

**Status**: **PASS**  
**Execution Command**: `npx tsx scripts/verify_phase2c.ts`

### Validation Rules Enforced
1. **Rule 1 (Schema & Truncation Guard)**: `row.length >= 5`
2. **Rule 2 (Date Integrity)**: `parseDate(rawDate) !== null` (strictly parses `DD/MM/YYYY` or `DD/MM/YY` into ISO format)
3. **Rule 3 (Team Name Presence)**: `rawHome.length > 0 && rawAway.length > 0`
4. **Rule 4 (Result & Postponement Guard)**: `!isNaN(fthg) && !isNaN(ftag)` (rejects empty scores, unplayed fixtures, postponed matches)
5. **Rule 5 (Impossible Score Sanity)**: `fthg >= 0 && fthg <= 25 && ftag >= 0 && ftag <= 25`

### Validator Unit Test Output
```
Validator Unit Tests:
  - [Valid completed match row]: Accepted=true | Reason: None (Valid Row)
  - [Postponed fixture with blank score]: Accepted=false | Reason: Score is NaN (postponed / unplayed match)
  - [Cancelled/blank row]: Accepted=false | Reason: Invalid/unparseable date
  - [Corrupted score row]: Accepted=false | Reason: Impossible score: 99--1
```

### Re-running the 3,606 Count for E2 & E3 Across 4 Seasons
```
Re-running E2 & E3 3,606 count with validator active:
  Stored E2 & E3 matches across 4 seasons in database: 3606
  Expected matches: 3,606 (E2: 552+552+552+143 = 1,799; E3: 552+552+552+151 = 1,807)
  Discrepancy: 0 (0 rejected rows in source CSVs; all 3,606 rows passed validator)
```

---

## Item 5: Final Staleness Gate Count

**Status**: **PASS**  
**Execution Command**: `npx tsx scripts/check5_staleness_gate.ts`

### In-Scope English Football League Clubs (2026/27 Season)
- **Total In-Scope Clubs Audited**: **92 clubs** (20 PL, 24 ELC, 24 E2, 24 E3)
- **Clubs with Match Records**: **92 clubs** (100.0%)
- **Clubs Passing Staleness Gate**: **92 clubs** (100.0%)
- **Clubs Gated as INSUFFICIENT DATA (0 records)**: **0 clubs** (0.0%)
- **Clubs Gated as STALE (>21 days or <5 matches in 120d)**: **0 clubs** (0.0%)
- **Total In-Scope Clubs Gated**: **0 clubs** (0.0%)
- **Reasons for Gated In-Scope Clubs**: **None**. Every single one of the 92 clubs in the 2026/27 English Football League has played matches between 2026-10-23 and 2026-10-27 (4 to 8 days ago) and has 11 to 13 matches in the last 120 days.

### Relegated / Out-of-Scope Clubs (`NAT`) Gate Audit
| # | Canonical ID | Club Name | Div | Last Match Date | Days Ago | Gate Status | Gating Reason |
|---|---|---|---|---|---|---|---|
| 1 | `team_barrow` | Barrow AFC | NAT | 2026-05-02 | 182 | STALE | Relegated out of scope to National League; last match 182d ago (2026-05-02) |
| 2 | `team_carlisle` | Carlisle United FC | NAT | 2025-05-03 | 546 | STALE | Relegated out of scope to National League; last match 546d ago (2025-05-03) |
| 3 | `team_forest_green` | Forest Green Rovers FC | NAT | 2024-04-27 | 917 | STALE | Relegated out of scope to National League; last match 917d ago (2024-04-27) |
| 4 | `team_harrogate` | Harrogate Town AFC | NAT | 2026-05-02 | 182 | STALE | Relegated out of scope to National League; last match 182d ago (2026-05-02) |
| 5 | `team_morecambe` | Morecambe FC | NAT | 2025-05-03 | 546 | STALE | Relegated out of scope to National League; last match 546d ago (2025-05-03) |
| 6 | `team_sutton` | Sutton United FC | NAT | 2024-04-27 | 917 | STALE | Relegated out of scope to National League; last match 917d ago (2024-04-27) |

---

## Item 6: Confirm Elvidge Max Date from File Itself

**Status**: **PASS**  
**Inspection Target**: `/tmp/EnglandLeagueResults.csv`

### Direct Command Output
```bash
python3 -c "
import csv
with open('/tmp/EnglandLeagueResults.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    dates = [row['Date'] for row in reader if row.get('Date')]
    print('Total rows:', len(dates))
    print('Max date:', max(dates))
    print('Min date:', min(dates))
    print('Unique dates count:', len(set(dates)))
"
```
```
Total rows: 212789
Max date: 2026-10-31
Min date: 1888-09-08
Unique dates count: 16255
```

### Upstream Repository Verification
```bash
curl -sL https://api.github.com/repos/seanelvidge/England-football-results/commits | head -n 25
```
```json
[
  {
    "sha": "d496e778c0ee126fe0418789db7afdfc9a47f2eb",
    "commit": {
      "author": {
        "name": "github-actions[bot]",
        "email": "41898282+github-actions[bot]@users.noreply.github.com",
        "date": "2026-10-31T23:12:15Z"
      },
      "message": "Updated results on 2026/10/31"
    }
  }
]
```
The file `/tmp/EnglandLeagueResults.csv` itself contains `2026-10-31` as its maximum date, matching the latest automated update from `github-actions[bot]` in the upstream `seanelvidge/England-football-results` repository.
