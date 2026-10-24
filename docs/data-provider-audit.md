# Calibrall Data Provider Capability & Gap Audit

This audit evaluates the external sports data providers integrated or supported by Calibrall, detailing exact data capabilities, update latencies, pricing tiers, gaps, and the engine's deterministic fallback rules.

---

## 1. Provider Comparison Matrix

| Provider | Supported Sports | Tiers Evaluated | Confirmed Lineups (Names + Positions) | Lineup Latency | Injury / Absence Feeds | In-Play Events (Cards / Red Cards) | Pre-match & Live Odds |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Football-Data.org** | Football (Top 12 European Leagues & Cups) | Free Tier (Tier One) & Paid | ❌ **No (Free Tier)**<br>⚠️ Only available on paid Enterprise | N/A on Free | ❌ No injury or suspension feeds | ❌ Free tier provides FT/HT scores & referee, but no real-time push card events | ❌ No odds provided |
| **Sportmonks** | Football (European & Global) | Pro / Enterprise API v3 | ✅ **Yes** (Confirmed starting XI + bench) | T-60 to T-45 mins before kickoff | ✅ Detailed injury reasons, expected return dates, suspensions | ✅ Real-time webhook & polling for cards, goals, substitutions, VAR | ⚠️ Add-on odds feed available |
| **The-Odds-API** | Global (Football, NBA, NFL, etc.) | Free (500 req/mo) & Paid | ❌ No lineup or roster data | N/A | ❌ No injury logs | ❌ No event feeds (strictly market odds) | ✅ Real-time bookmaker prices (Pinnacle, Bet365, etc.) |
| **BallDontLie** | Basketball (NBA) | Free & Pro API | ✅ **Yes** (Starting 5, active roster, minutes) | T-30 mins before tip-off | ✅ Daily injury status reports (Out, Questionable, Doubtful) | ✅ Box score updates, fouls, technical ejections | ❌ No odds feeds |

---

## 2. Gaps & Calibrall Mitigation Policies

### Gap A: Missing Lineups (Football-Data.org Free Tier)
- **Engine Rule**: Never assume missing lineups mean "full strength" or "no injuries".
- **Action**: When confirmed starting XIs are not provided:
  1. The prediction is stamped `lineupStatus = "pre-lineup"`.
  2. The candidate's uncertainty multiplier is expanded by **+25%** (`uncertaintyPenaltyMultiplier = 1.25`).
  3. An explicit advisory flag is rendered in the UI: *"Lineup feeds unconfirmed (pre-lineup). Uncertainty expanded by +25%."*
  4. Top-pick eligibility is penalized: fragile picks without confirmed lineups are stepped down to lower-variance substitutes.

### Gap B: In-Play Red Cards
- **Engine Rule**: Red cards issued during a match radically alter match state (possession geometry, expected tempo, 10-man defensive compaction). Pre-match probabilities cannot be treated as live probabilities.
- **Action**:
  1. In-play state tracking checks for red card events.
  2. If a card is detected, the prediction status transitions to `isSupersededByRedCard = true`.
  3. UI warning is rendered: *"Match state changed: in-play red card issued ([Team] 10-man). Pre-match analysis no longer applies."*
  4. In the live module, tactical compaction is applied: down to 10 men, teams average +18% deeper defensive depth and counter-attack less, preventing false "overs" assumptions.

### Gap C: Odds Baselines vs Raw Market Feeds
- **Engine Rule**: Calibrall never uses hardcoded static assumptions.
- **Action**:
  1. Where bookmaker feeds are active via The-Odds-API, the consensus de-vigged bookmaker line serves as the market baseline.
  2. Where odds feeds are unconfigured, competition- and line-adjusted frequencies from the 250 real-match database serve as the baseline, with empirical Bayes shrinkage applied to avoid sample noise.
