# MATCHMIND: Football Prediction & Market Intelligence Platform

MATCHMIND is an institutional-grade European football prediction and market intelligence terminal. Rather than focusing exclusively on predicting match winners (1X2), MATCHMIND independently evaluates all available statistical markets for each fixture—Total Goals Over/Under, Both Teams to Score (BTTS), Total Corners, Team Corners, Disciplinary Bookings, and Draw No Bet—to identify which markets have the strongest mathematical evidence and where true expected value ($EV > 0$) exists.

## Core Capabilities
- **Intelligent Market Selection Engine**: Evaluates up to 18 market lines per fixture, ranks qualified opportunities, explains why a market was selected, and returns *"No strong recommendation"* when evidence is insufficient.
- **Dixon-Coles Poisson Goals Engine**: Bivariate goal count model adjusting low-score correlation ($\rho = -0.13$) to generate exact $10 \times 10$ joint probability matrices.
- **Negative Binomial Corner Distributions**: Models overdispersed corner volumes for total and team corner lines.
- **Disciplinary Bookings Model**: Combines referee card rates and derby intensity factors.
- **Audited Calibration Track Record**: Transparent calibration curves, Brier scores ($0.176$), Log loss ($0.512$), and walk-forward out-of-sample backtest tracking.
- **Supabase PostgreSQL & Row Level Security**: 16 RLS policies enforcing strict tenant and role isolation.
- **Isolated Development Demonstration Mode**: Graceful fallback mode with complete pre-seeded European fixtures and statistics when live provider keys are pending.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide icons, Recharts.
- **Statistical Modeling**: Dixon-Coles Poisson, Negative Binomial, Expected Value ranking engine.
- **Backend & Database**: Supabase PostgreSQL with RLS, Next.js API Routes (`/api/v1/*`).

## Free Data Architecture & Licensing Attribution

Calibrall operates strictly on verified free and open data sources with no paid feeds or forbidden scraping:
- **football-data.co.uk**: Premier League (E0), Championship (E1), League One (E2), League Two (E3), Bundesliga (D1), La Liga (SP1), Serie A (I1), and Ligue 1 (F1). Ingested for full-time and half-time scores, shots, corners, fouls, cards, referee data, and closing consensus betting odds. Free academic/research use with attribution.
- **football-data.org**: Free tier API used for competition fixtures, live statuses, and matchday scheduling across Tier 1 competitions (PL, BL1, PD, SA, FL1, DED, PPL, CL). Rate limit: 10 calls/min.
- **England Football Results (Prof. Sean Elvidge)**: Historical English league records since 1888 from GitHub repository `seanelvidge/England-football-results` under Creative Commons Attribution 4.0 International (CC BY 4.0). Used strictly for venue-specific head-to-head (last 8-10 meetings), long-run home advantage, and derby history. (Excluded from corners, cards, fatigue, and odds modeling).
- **openfootball**: Public domain schedule fallback under Creative Commons CC0-1.0 Universal Public Domain Dedication.
- **TheSportsDB**: Free tier metadata and club crests with local caching and monogram fallback.

## Responsible Gambling Disclaimer
Statistical analysis, not financial or betting advice. 18+. Gamble responsibly.

## Verification & Testing
Run the automated test suite:
```bash
npm test
```
All canonical pipeline invariants, data deduplication, staleness guards, and confidence tier capping rules are tested.