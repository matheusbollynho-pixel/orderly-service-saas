-- Adiciona links de Instagram e Google Maps nas configurações da loja
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS google_maps_url text;
