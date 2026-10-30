# MATCHMIND Setup & Local Development Guide

## Prerequisites
- Node.js v18+ or v20+ / Bun
- Optional: Supabase account for managed PostgreSQL and Auth

## Quick Start
1. Clone the repository and navigate to root:
   ```bash
   cd matchmind
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   bun install
   ```

3. Environment Configuration:
   ```bash
   cp .env.example .env.local
   ```
   *Note: If no Supabase credentials are provided, MATCHMIND automatically boots into isolated Standby Development Demonstration Mode with full feature fidelity.*

4. Run statistical test suite:
   ```bash
   bun run src/tests/engine.test.ts
   ```

5. Start the development server on port 3000:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Historical Match Backfill & Data Status API
Calibrall includes an institutional backfill pipeline for historical match ingestion from `football-data.co.uk`.

### Security Requirements
- Requires `ADMIN_SECRET` in `.env` (minimum 32 characters).
- Authentication is accepted strictly via HTTP header `x-admin-secret` (query string parameters are rejected).
- Verification uses constant-time comparison (`crypto.timingSafeEqual`). If `ADMIN_SECRET` is missing or < 32 characters, the endpoint returns `503 Service Unavailable`.

### Example Ingestion Commands
```bash
# Ingest Premier League 2026-27 (Current)
curl -X POST "http://localhost:3000/api/admin/backfill?league=PL&season=2627" \
  -H "x-admin-secret: $ADMIN_SECRET"

# Ingest Premier League 2025-26
curl -X POST "http://localhost:3000/api/admin/backfill?league=PL&season=2526" \
  -H "x-admin-secret: $ADMIN_SECRET"

# Ingest Brazil Série A 2026
curl -X POST "http://localhost:3000/api/admin/backfill?league=BSA&season=2026" \
  -H "x-admin-secret: $ADMIN_SECRET"

# Query Status (Joined Teams Table with < 10 matches, league/season counts, unmatched names)
curl -X GET "http://localhost:3000/api/admin/data-status" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

