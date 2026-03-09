-- Add paid_at column to materials table for payment tracking
ALTER TABLE materials ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE;
