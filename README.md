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

## Verification & Testing
Run the automated statistical test suite:
```bash
bun run src/tests/engine.test.ts
```
All mathematical invariants, probability conservation laws, and abstention criteria are tested.