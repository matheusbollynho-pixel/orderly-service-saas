-- Módulo fiscal: dados PÚBLICOS do certificado A1 de cada emissor (para avisar antes de vencer).
-- O arquivo do certificado e a senha NUNCA ficam no nosso banco: vão direto para a Spedy pela função `fiscal`.
ALTER TABLE public.fiscal_emissores ADD COLUMN IF NOT EXISTS certificado_validade timestamptz;
ALTER TABLE public.fiscal_emissores ADD COLUMN IF NOT EXISTS certificado_titular text;
ALTER TABLE public.fiscal_emissores ADD COLUMN IF NOT EXISTS certificado_conferido_em timestamptz;
