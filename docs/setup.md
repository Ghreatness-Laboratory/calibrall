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
