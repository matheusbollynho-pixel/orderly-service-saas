ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT NOT NULL DEFAULT 'moto'
    CHECK (vehicle_type IN ('moto', 'carro')),
  ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;
