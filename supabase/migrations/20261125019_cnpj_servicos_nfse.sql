-- CNPJ de serviços (opcional; vazio = o mesmo CNPJ da loja) e controle da nota de serviço (NFS-e)
-- feita na prefeitura: a OS guarda o número e quando foi marcada como emitida.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS servicos_cnpj text;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS servicos_razao_social text;

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS nfse_numero text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS nfse_emitida_em timestamptz;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS nfse_por text;
