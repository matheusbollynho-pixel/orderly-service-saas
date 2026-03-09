-- Add is_service column to materials table
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false;
