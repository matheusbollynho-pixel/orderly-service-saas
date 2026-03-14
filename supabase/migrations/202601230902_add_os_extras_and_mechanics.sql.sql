-- Ensure pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Mechanics table (used across OS, materials, payments)
CREATE TABLE IF NOT EXISTS public.mechanics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for mechanics (open policies like other tables)
ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mechanics' AND policyname = 'mechanics_all') THEN
    DROP POLICY mechanics_all ON public.mechanics;
  END IF;
END$$;

CREATE POLICY mechanics_all ON public.mechanics FOR ALL USING (true) WITH CHECK (true);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS update_mechanics_updated_at ON public.mechanics;
CREATE TRIGGER update_mechanics_updated_at
BEFORE UPDATE ON public.mechanics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Service orders: add extra client fields and mechanic link
--ALTER TABLE public.service_orders
--  ADD COLUMN IF NOT EXISTS client_cpf TEXT NOT NULL DEFAULT '';

--ALTER TABLE public.service_orders
--  ADD COLUMN IF NOT EXISTS client_apelido TEXT NOT NULL DEFAULT '';

--ALTER TABLE public.service_orders
--  ADD COLUMN IF NOT EXISTS client_instagram TEXT NOT NULL DEFAULT '';

--ALTER TABLE public.service_orders
--  ADD COLUMN IF NOT EXISTS autoriza_instagram BOOLEAN NOT NULL DEFAULT false;

--ALTER TABLE public.service_orders
--  ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.mechanics(id) ON DELETE SET NULL;

-- Materials: add mechanic and paid flag
--ALTER TABLE public.materials
--  ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.mechanics(id) ON DELETE SET NULL;

--ALTER TABLE public.materials
--  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Index helpers
--CREATE INDEX IF NOT EXISTS service_orders_mechanic_id_idx ON public.service_orders(mechanic_id);
--CREATE INDEX IF NOT EXISTS materials_mechanic_id_idx ON public.materials(mechanic_id);
