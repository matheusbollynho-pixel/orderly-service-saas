-- Módulo fiscal: NF-e (nota grande), carta de correção e contador.
-- UF de quem emite (decide venda interna x outro estado). A função preenche sozinha consultando a Spedy.
ALTER TABLE public.fiscal_emissores ADD COLUMN IF NOT EXISTS uf text;
-- Nome do cliente da NF-e (aparece no painel) e a última carta de correção (CC-e) enviada
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS destinatario_nome text;
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS cce_quantidade integer NOT NULL DEFAULT 0;
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS cce_ultima text;
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS cce_protocolo text;
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS cce_em timestamptz;
-- CPF/CNPJ do escritório de contabilidade: vai na nota como autorizado a baixar o XML na SEFAZ (grupo autXML).
-- Na Bahia é obrigatório na NF-e (rejeição 486); sem contador, o sistema informa o CNPJ da SEFAZ-BA.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_contador_doc text;
