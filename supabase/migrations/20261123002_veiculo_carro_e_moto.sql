-- Loja que atende carro E moto (ex.: estofaria). Antes cada loja era só 'moto'
-- ou só 'carro' (store_settings.vehicle_type) e o checklist da OS vinha disso.
-- Agora:
--   * store_settings.vehicle_type aceita 'ambos';
--   * cada veículo guarda o próprio tipo (motorcycles.tipo), usado pela OS para
--     escolher o checklist certo. Vazio = segue o tipo da loja (lojas antigas).
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'store_settings'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%vehicle_type%'
  LOOP
    EXECUTE format('ALTER TABLE store_settings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE store_settings
  ADD CONSTRAINT store_settings_vehicle_type_check
  CHECK (vehicle_type IN ('moto', 'carro', 'ambos'));

ALTER TABLE motorcycles
  ADD COLUMN IF NOT EXISTS tipo TEXT CHECK (tipo IN ('moto', 'carro'));
