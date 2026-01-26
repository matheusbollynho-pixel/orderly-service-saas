-- Mechanics table and relation with service_orders
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mechanics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0, -- percent, e.g., 10.00
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and permissive policies (similar to other tables)
ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'mechanics' AND policyname = 'mechanics_all'
  ) THEN
    EXECUTE 'DROP POLICY mechanics_all ON public.mechanics';
  END IF;
END$$;

CREATE POLICY mechanics_all ON public.mechanics FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_mechanics_updated_at ON public.mechanics;
CREATE TRIGGER update_mechanics_updated_at
BEFORE UPDATE ON public.mechanics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add mechanic_id to service_orders
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.mechanics(id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.mechanics;