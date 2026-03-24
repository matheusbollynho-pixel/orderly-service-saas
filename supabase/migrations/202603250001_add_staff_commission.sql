ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_on_parts boolean NOT NULL DEFAULT false;
