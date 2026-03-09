-- Simple materials table and basic RLS policies
-- If your project already has pgcrypto, gen_random_uuid() will work.
-- If not, you can switch to uuid_generate_v4() and enable uuid-ossp.

-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- optional if using uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add is_service flag (false = peca, true = servico) para diferenca entre pecas e servicos
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false;

-- Enable Row Level Security
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Remove any previous permissive policy name if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'materials' AND policyname = 'materials_public_access'
  ) THEN
    EXECUTE 'DROP POLICY materials_public_access ON public.materials';
  END IF;
END$$;

-- Define clear policies for each operation
CREATE POLICY materials_select ON public.materials
  FOR SELECT
  USING (true);

CREATE POLICY materials_insert ON public.materials
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY materials_update ON public.materials
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY materials_delete ON public.materials
  FOR DELETE
  USING (true);
-- Create trigger for automatic timestamp updates on materials
CREATE TRIGGER update_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for materials
ALTER PUBLICATION supabase_realtime ADD TABLE public.materials;