-- Add Instagram/Apelido/Autoriza columns to service_orders
ALTER TABLE public.service_orders 
  ADD COLUMN IF NOT EXISTS client_apelido TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_instagram TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS autoriza_instagram BOOLEAN NOT NULL DEFAULT false;

-- Backfill defaults (safety if existing rows present)
UPDATE public.service_orders 
SET client_apelido = COALESCE(client_apelido, ''),
    client_instagram = COALESCE(client_instagram, ''),
    autoriza_instagram = COALESCE(autoriza_instagram, false);
