-- ============================================================
-- SUPABASE MIGRATION - Orderly Service
-- Data: 21 de janeiro de 2026
-- ============================================================
-- Execute este script no Supabase Studio > SQL Editor
-- ============================================================

-- ============================================================
-- 1. ADD INSTAGRAM COLUMNS TO service_orders
-- ============================================================
ALTER TABLE public.service_orders 
  ADD COLUMN IF NOT EXISTS client_apelido TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_instagram TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS autoriza_instagram BOOLEAN NOT NULL DEFAULT false;

UPDATE public.service_orders 
SET client_apelido = COALESCE(client_apelido, ''),
    client_instagram = COALESCE(client_instagram, ''),
    autoriza_instagram = COALESCE(autoriza_instagram, false);

-- ============================================================
-- 2. CREATE MATERIALS TABLE
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_service BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for materials
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'materials' AND policyname = 'materials_public_access'
  ) THEN
    EXECUTE 'DROP POLICY materials_public_access ON public.materials';
  END IF;
END$$;

CREATE POLICY materials_select ON public.materials FOR SELECT USING (true);
CREATE POLICY materials_insert ON public.materials FOR INSERT WITH CHECK (true);
CREATE POLICY materials_update ON public.materials FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY materials_delete ON public.materials FOR DELETE USING (true);

-- Trigger for updated_at on materials
DROP TRIGGER IF EXISTS update_materials_updated_at ON public.materials;
CREATE TRIGGER update_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. CREATE MECHANICS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mechanics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on mechanics
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

-- Trigger for updated_at on mechanics
DROP TRIGGER IF EXISTS update_mechanics_updated_at ON public.mechanics;
CREATE TRIGGER update_mechanics_updated_at
BEFORE UPDATE ON public.mechanics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. ADD mechanic_id TO service_orders
-- ============================================================
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.mechanics(id) ON DELETE SET NULL;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
