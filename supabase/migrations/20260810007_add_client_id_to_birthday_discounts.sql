ALTER TABLE birthday_discounts
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
