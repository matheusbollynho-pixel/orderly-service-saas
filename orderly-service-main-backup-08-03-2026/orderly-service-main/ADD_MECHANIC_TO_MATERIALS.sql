-- ============================================================
-- Add mechanic_id to materials table
-- ============================================================

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.mechanics(id) ON DELETE SET NULL;

-- Create index for faster queries filtering by mechanic_id
CREATE INDEX IF NOT EXISTS idx_materials_mechanic_id ON public.materials(mechanic_id);
