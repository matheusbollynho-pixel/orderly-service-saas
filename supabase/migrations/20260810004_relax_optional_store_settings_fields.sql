-- ============================================================
-- Campos opcionais de store_settings estavam NOT NULL (só com
-- default '' aplicado no INSERT). O app manda null explícito ao
-- salvar campo vazio no onboarding/config, o que violava a
-- constraint em UPDATE. Tornando nullable pra bater com o que o
-- frontend realmente envia.
-- ============================================================

ALTER TABLE store_settings
  ALTER COLUMN store_phone      DROP NOT NULL,
  ALTER COLUMN store_address    DROP NOT NULL,
  ALTER COLUMN store_cnpj       DROP NOT NULL,
  ALTER COLUMN store_instagram  DROP NOT NULL,
  ALTER COLUMN store_owner      DROP NOT NULL,
  ALTER COLUMN logo_url         DROP NOT NULL,
  ALTER COLUMN opening_hours    DROP NOT NULL,
  ALTER COLUMN payment_methods  DROP NOT NULL,
  ALTER COLUMN ai_notes         DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
