-- ====================================================================
-- CALIBRALL: Add First-Half Corners to Matches Table
-- Migration: 20261031000000_add_first_half_corners_to_matches.sql
-- ====================================================================

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_first_half_corners INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_first_half_corners INTEGER;
