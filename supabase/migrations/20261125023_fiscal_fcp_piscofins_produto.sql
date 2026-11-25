-- Módulo fiscal (regime normal):
-- 1) FCP (Fundo de Combate à Pobreza) separado do ICMS na nota. Ex. Bahia: ICMS 18% + FCP 2,5%.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_fcp_aliquota numeric(5,2)
  CHECK (fiscal_fcp_aliquota IS NULL OR (fiscal_fcp_aliquota >= 0 AND fiscal_fcp_aliquota <= 10));
-- 2) CST de PIS/COFINS por produto (vazio = o padrão da loja). Ex.: peça monofásica (Lei 10.485) = 4; acessório tributável = 1.
ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS pis_cofins_cst smallint
  CHECK (pis_cofins_cst IS NULL OR (pis_cofins_cst BETWEEN 1 AND 99));
