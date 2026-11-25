-- Módulo fiscal: regime tributário da loja (Simples Nacional ou regime normal - Lucro Presumido/Real).
-- Simples usa CSOSN; regime normal usa CST + alíquota de ICMS e de PIS/COFINS. Quem define os valores é o contador.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_regime text NOT NULL DEFAULT 'simples'
  CHECK (fiscal_regime IN ('simples', 'normal'));
-- Alíquota interna de ICMS da UF, em % (ex.: 20.5 na Bahia). Só regime normal; item com ST não usa.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_icms_aliquota numeric(5,2)
  CHECK (fiscal_icms_aliquota IS NULL OR (fiscal_icms_aliquota >= 0 AND fiscal_icms_aliquota <= 100));
-- CST de PIS/COFINS no regime normal: 1 = tributável (Presumido 0,65% / 3%), 4 = monofásico revenda, 6 = alíquota zero...
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_pis_cofins_cst smallint NOT NULL DEFAULT 1;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_pis_aliquota numeric(6,4) NOT NULL DEFAULT 0.65;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_cofins_aliquota numeric(6,4) NOT NULL DEFAULT 3.00;
