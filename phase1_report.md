# PHASE 1 DIAGNOSTIC AND SOURCE AUDIT REPORT
**Project:** Calibrall  
**Phase:** 1 of 3 (Diagnose & Source Check)  
**Execution Timestamp:** 2026-10-31T10:30:00Z  
**Operating Mode:** Read-Only Analysis (No model logic, UI, schema, or auth modifications)

---

## 1. STALE-DATA WARNING DIAGNOSIS

### 1.1 Computation Location, Function, Formula, Threshold & Tables
* **Primary Computation Files & Functions:**
  1. `src/lib/data/seedData.ts`: `getFixtureStatistics(fixture: Fixture, asOfDate?: string)` (Lines 376–425)
  2. `src/lib/data/matchesStore.ts`: `MatchesStore.getTeamDaysSinceLastMatch(teamIdOrName, asOfDate)` (Lines 893–922) and `MatchesStore.getFormForTeam(teamIdOrName, asOfDate)` (Lines 785–805)
  3. `src/lib/data/canonicalMatches.ts`: `CanonicalMatchStore.getStalenessStatus(teamIdOrName, refDate)` (Lines 203–257)
  4. Gating consumer: `src/lib/prediction/marketSelection.ts` (Line 139) & `src/lib/prediction/v25/v25Evaluator.ts` (Line 58)
* **Underlying Storage / Table:**
  - In production / configured database mode: queries Supabase PostgreSQL table `matches` (via `supabase.from('matches')`).
  - In development / sandbox fallback: reads the in-memory map `this.inMemoryMatches`, populated by `free_sources_matches.json`, `CHAMPIONSHIP_HISTORICAL_MATCHES` (`championshipMatchArchive.ts`), and `REAL_250_MATCHES` (`realMatchArchive.ts`).
* **Thresholds & Rules:**
  - **Rule 1 (Max Days In-Season):** `daysSinceLastMatch > 21` days  
    `staleReason = "Data out of date: last match ${daysSince} days ago"`
  - **Rule 2 (Minimum Sample Window):** `matchesIn120 < 5` in the rolling 120-day pre-match window  
    `staleReason = "Data out of date: only ${matchesIn120} matches in last 120 days (min 5 required)"`
  - **Rule 3 (Zero Records Found):** `matchesCount === 0`  
    `staleReason = "Data out of date: no recent matches stored in database"`
* **Exact Mathematical Formula:**
  $$\text{daysSince} = \max\left(0, \text{round}\left(\frac{T_{\text{ref}} - T_{\text{lastMatch}}}{86,400,000}\right)\right)$$
  $$\text{matchesIn120} = \sum \mathbf{1}_{\{T_{\text{match}} \ge (T_{\text{ref}} - 120 \times 86,400,000) \land T_{\text{match}} \le T_{\text{ref}}\}}$$
  Where $T_{\text{ref}}$ is either `fixture.kickoffTime` or `Date.now()`.

---

### 1.2 Target Club Audit in Results Store (Query as of 2026-10-31)

| Club | Stored Matches | Team ID(s) Used | Newest Match Date | Matches in Last 120 Days | Days Since Last Match | Status / Staleness Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Norwich City** | 242 | `team_norwich` | 2026-10-24T12:30:00Z | 12 | 7 days | **Active** (Not Stale) in free sources; *was 546d in legacy archive* |
| **Watford** | 242 | `team_watford` | 2026-10-24T15:00:00Z | 12 | 7 days | **Active** (Not Stale) in free sources; *was 546d in legacy archive* |
| **Chelsea** | 146 | `team_chelsea` | 2026-10-24T17:30:00Z | 8 | 7 days | **Active** (Not Stale) |
| **Manchester United** | 123 | `team_man_united` (matches)<br>`team_manunited` (fixtures/db) | 2026-10-25T14:00:00Z (as `team_man_united`)<br>2024-04-04T00:00:00Z (as `team_manunited`) | 8 (by name)<br>**0 (by ID `team_manunited`)** | 6 days (by name)<br>**941 days (by ID `team_manunited`)** | **STALE (941 days ago)** when queried via fixture team ID! |
| **Stoke City** | 242 | `team_stoke` & `team_stokecity` | 2026-10-24T15:00:00Z | 12 | 7 days | **Active**, but split across two IDs |
| **Preston North End**| 242 | `team_preston` | 2026-10-24T15:00:00Z | 12 | 7 days | **Active** |
| **Lincoln City** | 12 | `team_lincoln` | 2026-10-24T15:00:00Z | 12 | 7 days | **Active** (League One) |

---

### 1.3 Exact Cause: Why Fixtures Showed "Last match 546 days ago" and "922 / 941 days ago"

The staleness symptoms stem from a combination of **two distinct verified issues**:

1. **The 922/941 Days Bug (Chelsea v Manchester United): ID Mismatch & Lookup Fallback Bug**
   - In `src/lib/data/teamDatabase.ts` and `src/lib/data/provider.ts` (ESPN mapping), Manchester United is assigned the ID `'team_manunited'` (no underscore).
   - In `src/lib/data/free_sources_matches.json`, all 122 recent 2024–2026 matches use `'team_man_united'` (with underscore).
   - In `src/lib/data/matchesStore.ts` line 894, `getTeamDaysSinceLastMatch` executes:
     `const lookup = lookupTeamStrength(rawInput);`
     Because `lookupTeamStrength` only indexes club names and aliases (not canonical IDs), calling it with `'team_manunited'` returns `{ found: false }`.
   - The query then falls back to searching `m.home_team_id === 'team_manunited' || m.away_team_id === 'team_manunited'`.
   - None of the 122 recent matches match because they have `'team_man_united'`. The **only** record that matches is a single legacy fixture in `REAL_250_MATCHES` (`pl_2324_che_mun`) dated **2024-04-04**!
   - From 2024-04-04 to 2026-10-31 is exactly **941 days** (and on mid-October dates was exactly **922 days**).
   - **Evidence:** Querying `matchesStore.getTeamDaysSinceLastMatch('team_manunited')` returns `days: 941, matchesInLast120Days: 0`. Querying by name `'Manchester United'` returns `days: 6, matchesInLast120Days: 8`.

2. **The 546 Days Bug (Norwich v Watford): Static Archive Cut-off Before Ingestion**
   - In `src/lib/data/championshipMatchArchive.ts`, the static championship archive abruptly ends on **2025-05-03** (`mat_elc_2425_551`, Bristol City vs Preston).
   - Calculating the difference between `2026-10-31` and `2025-05-03`:
     $$2026\text{-}10\text{-}31 - 2025\text{-}05\text{-}03 = 546\text{ days}$$
   - When the app ran before `free_sources_matches.json` was loaded, or whenever Championship queries fell back to `championshipMatchArchive.ts`, Norwich and Watford reported `last match 546 days ago`.

---

## 2. CURRENT FIXTURES PROVIDER AUDIT

### 2.1 Provider Configuration & Operational State
* **Current Active Ingestion Provider:** **ESPN Live Soccer Scoreboard API** (`provider:espn`)
  - **Endpoint:** `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?dates=${YYYYMMDD}`
  - **Standby Primary Providers:**
    - `Football-Data.org v4`: `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}` (Active when `FOOTBALL_DATA_API_KEY` present)
    - `Sportmonks v3`: `https://api.sportmonks.com/v3/football/fixtures/between/${dateFrom}/${dateTo}` (Active when `SPORTMONKS_API_TOKEN` present)
  - **Database Persistence Table:** Supabase `matches` (currently unconfigured in dev environment, running in-memory).
* **Season Parameter Handling:**
  - ESPN Live Scoreboard parses `ev.season?.year` (e.g. `2026`).
  - Football-Data.org uses dynamic date filtering (`dateFrom`, `dateTo` formatted as `YYYY-MM-DD`).
* **Cron Schedule:**
  - Configured in `vercel.json` line 3–7:
    ```json
    "crons": [
      {
        "path": "/api/v1/sync?sport=all",
        "schedule": "0 6 * * *"
      }
    ]
    ```
    (Runs daily at 06:00 UTC).
* **Last Successful Run:**
  - Standby mock/in-memory timestamp: tracks `this.lastGoodSyncTime` initialized at dev boot or on `/api/v1/sync` POST. Real DB cron logs are not persistent because Supabase credentials are not populated in `.env.example`.

### 2.2 Hardcoded Years & Seasons in Codebase
Grep audit across `src/` (excluding raw dataset JSONs):
* **Season strings (`'2324'`, `'2425'`, `'2526'`, `'2627'`):**
  - `src/lib/data/backfillCatalog.ts`: Lines 67–75 (`SUPPORTED_EUROPEAN_SEASONS = ['2021', '2122', '2223', '2324', '2425', '2526', '2627']`), Lines 77–85 (`SUPPORTED_BRAZIL_SEASONS = ['2020'...'2026']`), Line 122 (`season === '2627' ? 'Current In-Play' : 'Completed/Historical'`)
  - `src/app/api/admin/backfill/route.ts`: Lines 133–137 (Hardcoded matching for seasons 2627, 2526, 2425, 2324, 2223)
  - `src/lib/data/nbaSeedData.ts`: Lines 76–441 (`'2024-25'`, `'2023-24'` stats maps), Line 452, 485, 566, 593 (`seasonYear: '2024-25'`)
  - `src/lib/data/provider.ts`: Line 394 (`${ev.season?.year || '2026'}/${(ev.season?.year || 2026) + 1}`), Line 839 (`seasonYear: '2024/2025'`)
  - `src/lib/data/realMatchArchive.ts`: Line 17 (`pl_2324_...`), Line 29 (`season: '2324'`)
  - `src/lib/data/championshipMatchArchive.ts`: Line 25 (`season: '2324'`), Line 550 (`season: '2425'`)
  - `src/lib/data/canonicalMatches.ts`: Line 132 (`season: raw.season || existing?.season || '2026/2027'`)
  - `src/tests/backfill_csv_parsing.test.ts`: Lines 39–42, 130–140, 245–262 (Seasons 2425, 2526, 2627 validation)
  - `src/tests/basketball_staleness.test.ts`: Lines 19–20 (`'2026-27'`)
  - `src/app/admin/page.tsx`: Lines 168–196 (Hardcoded model train dates: `'24 Oct 2026'`, `'18 Oct 2026'`)
  - `src/app/creators/page.tsx`: Line 179 (`Established 2024`)
  - `src/lib/supabase/client.ts`: Line 58 (`createdAt: '2025-01-10T10:00:00Z'`)

---

## 3. TEAM ID MAPPING COMPARISON

Comparison for the audited clubs across Fixtures Provider (ESPN / `teamDatabase.ts`), Results Table (`matchesStore` / `free_sources_matches.json`), and Canonical Registry (`canonicalTeams.ts`):

| Club Name | Fixture Provider ID (`provider.ts` / `teamDatabase.ts`) | Results Store ID (`matchesStore` / `free_sources_matches.json`) | Canonical Registry ID (`canonicalTeams.ts`) | Match Status & Discrepancies |
| :--- | :--- | :--- | :--- | :--- |
| **Chelsea FC** | `team_chelsea` | `team_chelsea` | `team_chelsea` | **MATCHED** |
| **Manchester United FC**| `team_manunited` | `team_man_united` *(122 matches)*<br>`team_manunited` *(1 old match)* | `team_man_united` | **UNMATCHED / DESYNCHRONIZED:** Provider and Team Database use `team_manunited`, but results table and canonical registry use `team_man_united`. Causes 941-day stale flag! |
| **Norwich City FC** | `team_norwich` | `team_norwich` | `team_norwich` | **MATCHED** |
| **Watford FC** | `team_watford` | `team_watford` | `team_watford` | **MATCHED** |
| **Stoke City FC** | `team_stokecity` | `team_stoke` *(230 matches)*<br>`team_stokecity` *(12 matches)* | `team_stoke` | **UNMATCHED / SPLIT:** Provider/DB uses `team_stokecity`, but canonical and bulk results use `team_stoke`. |
| **Preston North End FC**| `team_preston` | `team_preston` | `team_preston` | **MATCHED** |
| **Lincoln City FC** | `team_lincoln` | `team_lincoln` | **UNMAPPED** (Missing from `canonicalTeams.ts`) | **PARTIALLY UNMATCHED:** Exists in `teamDatabase.ts` and results table, but completely missing from `canonicalTeams.ts`. |

---

## 4. MODEL FEATURE AUDIT

Every model, engine, and feature utilizing lineups, injuries, suspensions, rotation, confirmed starters, or referee data:

| Feature / Model Category | File & Line Number | Exact Implementation & Impact |
| :--- | :--- | :--- |
| **Lineup & Absence Discount Engine** | `src/lib/prediction/lineupImpact.ts`: Lines 73–141 | Computes single-scorer dependence (max goal share). If `key-absences` is tagged, applies up to **-28% team goal discount** (`homeAbsenceDiscount`) and **+16% defense penalty** on conceded goals. If lineup is unconfirmed, expands uncertainty by **+25%**. |
| **Starters & Roster Registry** | `src/lib/prediction/lineupImpact.ts`: Lines 11–68 | Hardcoded star rosters (`KEY_PLAYERS_REGISTRY`) with `status: 'confirmed_starter'`, minutes, goals, assists, penalty/corner duties for 6 clubs. Fallback squad generator for others. |
| **Tactical Rotation & Absence Simulator** | `src/lib/data/lineupsService.ts`: Lines 280–327 | `buildConfirmedLineup` alters Expected XI under `'absence'` or `'rotation'` scenarios (swaps starters with bench substitutes). |
| **Starting XI Comparison & Rotation Metric**| `src/lib/data/lineupsService.ts`: Lines 330–410 | `compareLineups` computes `rotationCount`, missing key starters, and surprise starters between Expected XI and Confirmed Lineup. |
| **30-Minute Lineup Gate Rule** | `src/lib/data/lineupsService.ts`: Lines 440–520 | `getFixtureLineupState` checks if kickoff is within 30 minutes; flags unconfirmed status or provides confirmed starters. |
| **Confidence Tier Downgrade Gate** | `src/lib/prediction/v25/confidenceEngine.ts`: Lines 40–120 | If team news or confirmed lineups are missing (`hasMissingLineup`, `hasKeyAbsences`), caps maximum confidence tier to `MEDIUM` (prevents `HIGH`). |
| **Model Explainability "Why Panel"** | `src/lib/prediction/v25/whyPanel.ts`: Lines 45–90 | Generates textual justifications referencing key player absences, confirmed starting status, and referee tendencies. |
| **Referee Card Issuance & Disciplinary Pricing** | `src/lib/prediction/marketSelection.ts`: Lines 1110–1200 | Prices Over/Under 4.5 Cards and Booking Points by multiplying referee historical issuance rate (`effectiveCards`) with derby multipliers (+18%). |
| **Referee Context Factor** | `src/lib/prediction/contextFactors.ts`: Lines 147–151, 542–555, 725–735 | `referee_rules` evaluates appointed referee baseline cards per 90 vs league average. |
| **Fragility Index Rotation & Absence Penalties** | `src/lib/prediction/fragilityAndSubstitutes.ts`: Lines 116–141 | Adds +0.15 to fragility for `high-fatigue` (rotation risk), +0.25 for key attacker absent with high reliance, and +0.12 for unconfirmed lineups. |
| **Data Coverage Score Weighting** | `src/lib/data/seedData.ts`: Lines 453–457 | Awards +0.07 data coverage bonus if referee is assigned, and +0.08 bonus if lineup is confirmed. |
| **Feature Store Schema & Z-Score** | `src/lib/data/featureStore.ts`: Lines 46–50, 202, 225–229 | Stores `lineupConfirmed` (multiplies parameter uncertainty by 1.25 if false) and `refereeStrictnessZScore`. |
| **Forward Pick Revision Trigger** | `src/lib/prediction/forwardPickLedger.ts`: Lines 100–140 | Registers a `lineup_revision` pick record if confirmed starters diverge significantly from Expected XI. |

---

## 5. FREE SOURCE LIVE VERIFICATION

### 5a) football-data.co.uk (E0 and E1 Current Season 2026/2027)
* **Live Fetch URLs:**
  - E0: `https://football-data.co.uk/mmz4281/2627/E0.csv`
  - E1: `https://football-data.co.uk/mmz4281/2627/E1.csv`
* **Exact Header Row (Identical on both):**
  `Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HxG,AxG,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A,BFDH,BFDD,BFDA,BVH,BVD,BVA,BWH,BWD,BWA,PPH,PPD,PPA,SKBH,SKBD,SKBA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,BFEH,BFED,BFEA,B365>2.5,B365<2.5,Max>2.5,Max<2.5,Avg>2.5,Avg<2.5,BFE>2.5,BFE<2.5,AHh,B365AHH,B365AHA,MaxAHH,MaxAHA,AvgAHH,AvgAHA,BFEAHH,BFEAHA,B365CH,B365CD,B365CA,BFDCH,BFDCD,BFDCA,BVCH,BVCD,BVCA,BWCH,BWCD,BWCA,PPCH,PPCD,PPCA,SKBCH,SKBCD,SKBCA,MaxCH,MaxCD,MaxCA,AvgCH,AvgCD,AvgCA,BFECH,BFECD,BFECA,B365C>2.5,B365C<2.5,MaxC>2.5,MaxC<2.5,AvgC>2.5,AvgC<2.5,BFEC>2.5,BFEC<2.5,AHCh,B365CAHH,B365CAHA,MaxCAHH,MaxCAHA,AvgCAHH,AvgCAHA,BFECAHH,BFECAHA`
* **Premier League (E0) Statistics:**
  - Matches (Row count): **80**
  - Newest match date: **25/10/2026** (e.g. Liverpool 2-0 Brighton, Man United 0-3 Bournemouth, Sunderland 0-0 Leeds)
* **Championship (E1) Statistics:**
  - Matches (Row count): **144**
  - Newest match date: **24/10/2026** (e.g. Wolves 1-0 Watford, Stoke 0-0 Bristol City, Preston 1-1 West Brom)
* **Required Column Verification:**
  - Shots (`HS`, `AS`): **PRESENT**
  - Corners (`HC`, `AC`): **PRESENT**
  - Yellow Cards (`HY`, `AY`): **PRESENT**
  - Red Cards (`HR`, `AR`): **PRESENT**
  - Half-Time Goals (`HTHG`, `HTAG`): **PRESENT**
  - Referee (`Referee`): **PRESENT**
  - Closing Odds (`B365CH`, `B365CD`, `B365CA`): **PRESENT**
  - Bonus metrics: `HxG` and `AxG` (Expected Goals) are also populated!
* **Missing Columns:** **NONE** (0 missing).

---

### 5b) football-data.org Free Tier (Live Verified via `/v4/competitions`)
Querying the live API `https://api.football-data.org/v4/competitions` returns exactly **12 competitions** under `plan: "TIER_ONE"` (the free tier):
1. **Championship** (`ELC`) — England (ID: `2016`) $\rightarrow$ **INCLUDED in free plan!**
2. **Premier League** (`PL`) — England (ID: `2021`) $\rightarrow$ **INCLUDED in free plan!**
3. **Campeonato Brasileiro Série A** (`BSA`) — Brazil (ID: `2013`)
4. **UEFA Champions League** (`CL`) — Europe (ID: `2001`)
5. **European Championship** (`EC`) — Europe (ID: `2018`)
6. **Ligue 1** (`FL1`) — France (ID: `2015`)
7. **Bundesliga** (`BL1`) — Germany (ID: `2002`)
8. **Serie A** (`SA`) — Italy (ID: `2019`)
9. **Eredivisie** (`DED`) — Netherlands (ID: `2003`)
10. **Primeira Liga** (`PPL`) — Portugal (ID: `2017`)
11. **Primera Division / La Liga** (`PD`) — Spain (ID: `2014`)
12. **FIFA World Cup** (`WC`) — World (ID: `2000`)

* **Lower English Leagues Status:**
  - **League One (`EL1` / `E2`):** `plan: "TIER_TWO"` $\rightarrow$ **NOT INCLUDED (Paid only)**
  - **League Two (`EL2`):** `plan: "TIER_THREE"` $\rightarrow$ **NOT INCLUDED (Paid only)**
  - **FA Cup (`FAC`):** `plan: "TIER_TWO"` $\rightarrow$ **NOT INCLUDED (Paid only)**
  - **EFL Cup (`FLC`):** `plan: "TIER_THREE"` $\rightarrow$ **NOT INCLUDED (Paid only)**

---

### 5c) Sean Elvidge England Results Repository
* **Repository URL:** `https://github.com/seanelvidge/England-football-results`
* **Licence:** **Creative Commons Attribution 4.0 International Public License (CC BY 4.0)** (verified in `LICENCE.md`).
* **Raw CSV URL:** `https://raw.githubusercontent.com/seanelvidge/England-football-results/main/EnglandLeagueResults.csv`
  (Also available with Elo ranks: `https://raw.githubusercontent.com/seanelvidge/England-football-results/main/EnglandLeagueResults_wRanks.csv`)
* **Last Commit Date:** **2026-10-30T05:45:18Z** (Commit message: `"Updated results on 2026/10/30"`)
* **Newest Match Date in CSV:** **2026-10-27** (e.g. Barnet 3-1 York City on 2026-10-27; Premier League matches up to 2026-10-25).
* **Columns Included:** `Date,Season,HomeTeam,AwayTeam,Score,FTHG,FTAG,TierName,Tier,FTR`

---

### 5d) openfootball Repository
* **Repository URL:** `https://github.com/openfootball/england`
* **Licence:** **Creative Commons Zero v1.0 Universal (CC0 1.0) / Public Domain Dedication** (verified in `LICENSE.md`).
* **Newest English Season Available:** **2026-27**
  - Contains `2026-27/1-premierleague.txt` and `2026-27/2-championship.txt`.
  - Up to Matchday 9/10 with kickoff times, dates, and half-time scores.

---

### 5e) TheSportsDB Free Tier
* **Registered Key Requirement:** **NO registered key is required.**
  - TheSportsDB provides a shared public v1 key: `123`.
  - Example verified endpoint: `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=Arsenal` (Returns HTTP 200 with full team metadata, crest badge URLs, and stadium info).
  - *Note:* The legacy test key `3` is permanently disabled.
* **Rate Limits:** **30 requests per minute** on the free tier.
* **Attribution Terms:** Requires attribution to **TheSportsDB.com** (linking or naming TheSportsDB as data & artwork provider).

---

## 6. BLOCKED OR UNVERIFIED ITEMS

1. **Football-Data.org API Key in Current Environment:**
   - Unverified live request with active user token: `FOOTBALL_DATA_API_KEY` is not populated in the current local `.env` (it runs against public endpoints and fallback). The API documentation and public endpoint structure are 100% verified.
2. **Supabase Production Database Connectivity:**
   - Supabase connection is currently standby/unconfigured (`isSupabaseConfigured: false`). In Phase 1 read-only mode, queries executed against the populated internal stores.
3. **TheSportsDB Deep Attribution Page (`/docs_terms_of_use.php`):**
   - The specific sub-page `/terms` returned HTTP 404, but `/free_sports_api` and `/pricing` were reached and confirmed rate limits (30 req/min), public key `123`, and attribution requirements.
