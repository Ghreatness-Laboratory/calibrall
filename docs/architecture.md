# MATCHMIND Architecture Documentation

## 1. System Overview
MATCHMIND is a full-stack football prediction and market intelligence platform. Its central purpose is not merely forecasting match winners (1X2), but evaluating all candidate market lines for each fixture—Total Goals, Corners, Both Teams to Score (BTTS), Disciplinary Bookings, and Draw No Bet—to identify qualified probability and positive mathematical expected value ($EV > 0$).

## 2. Component Boundaries
1. **Frontend Presentation Layer (`src/app/`, `src/components/`)**:
   - Next.js App Router (TypeScript, Tailwind CSS, Lucide icons, Recharts).
   - High-density sports analytics aesthetic with dark navy/charcoal background, subtle borders, and monospace statistical alignment.
   - Pages: Landing (`/`), Dashboard (`/dashboard`), Fixture Explorer (`/matches`), Match Analysis with Dixon-Coles Heatmap (`/matches/[id]`), Today's Picks (`/predictions`), Cross-Match Market Explorer (`/markets`), Calibration & Performance (`/performance`), Saved Watchlist (`/saved`), Pricing (`/pricing`), User Preferences (`/settings`), Admin Operations (`/admin`), Responsible Use (`/responsible-use`), and Methodology (`/methodology`).

2. **Statistical Inference Engine (`src/lib/prediction/`)**:
   - `math.ts`: Dixon-Coles bivariate Poisson adjustment for low scores (0-0, 1-0, 0-1, 1-1) with empirical correlation parameter $\rho \approx -0.13$.
   - Negative Binomial / compound Poisson corner count distributions.
   - Disciplinary ordinal card distributions factoring referee baseline cards/game.
   - `marketSelection.ts`: Candidate ranking engine, Expected Value calculation ($EV = p \cdot O - 1$), minimum sample size filters, correlation penalty, and evidence explanation generator.

3. **Data Layer & Storage (`supabase/`, `src/lib/data/`)**:
   - Supabase PostgreSQL with 16 Row Level Security (RLS) policies.
   - Data provider abstraction supporting Football-Data.org, API-Football, and isolated Standby Development Seed Mode.
   - Immutable prediction logs storing pre-kickoff predictions with timestamps.

4. **REST API Endpoints (`src/app/api/v1/`)**:
   - `/health`: Telemetry, model status, and database health.
   - `/competitions`: Active Tier-1 European leagues.
   - `/fixtures`: Queryable fixtures feed.
   - `/fixtures/[id]/predictions`: Full quantitative context and ranked candidates.
   - `/predictions/today`: Filtered qualified opportunities.
   - `/performance/summary`: Audited Brier scores and calibration buckets.
