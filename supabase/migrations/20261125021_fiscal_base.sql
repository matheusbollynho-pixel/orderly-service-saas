-- Módulo fiscal (NFC-e / NF-e / NFS-e) — base. Fornecedor atual: Spedy (isolado na função `fiscal`).
-- Nada aqui emite nota sozinho: a emissão é feita pela função do servidor, que tem as chaves.

-- Loja: liga o módulo, ambiente e padrões para item sem cadastro fiscal (item digitado à mão)
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_ativo boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_ambiente text NOT NULL DEFAULT 'sandbox'
  CHECK (fiscal_ambiente IN ('sandbox', 'producao'));
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_ncm_padrao text;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_cfop_padrao text NOT NULL DEFAULT '5102';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_csosn_padrao text NOT NULL DEFAULT '102';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_origem_padrao smallint NOT NULL DEFAULT 0
  CHECK (fiscal_origem_padrao BETWEEN 0 AND 8);

-- Emissores da loja (CNPJ de vendas e, se houver, de serviços) já cadastrados no fornecedor
CREATE TABLE IF NOT EXISTS public.fiscal_emissores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('vendas', 'servicos')),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'producao')),
  cnpj text NOT NULL,
  razao_social text,
  fornecedor text NOT NULL DEFAULT 'spedy',
  fornecedor_empresa_id text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, papel, ambiente)
);
ALTER TABLE public.fiscal_emissores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_emissores: ler" ON public.fiscal_emissores;
CREATE POLICY "fiscal_emissores: ler" ON public.fiscal_emissores FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());

-- Chave de API de cada emissor: SÓ o servidor (service role) lê. Sem política = ninguém do app acessa.
CREATE TABLE IF NOT EXISTS public.fiscal_chaves (
  emissor_id uuid PRIMARY KEY REFERENCES public.fiscal_emissores(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fiscal_chaves ENABLE ROW LEVEL SECURITY;

-- Notas fiscais emitidas pelo sistema
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  emissor_id uuid REFERENCES public.fiscal_emissores(id) ON DELETE SET NULL,
  modelo text NOT NULL CHECK (modelo IN ('nfce', 'nfe', 'nfse')),
  origem text NOT NULL CHECK (origem IN ('balcao', 'os', 'site', 'manual')),
  balcao_order_id uuid REFERENCES public.balcao_orders(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'producao')),
  fornecedor_nota_id text,
  status text NOT NULL DEFAULT 'enviando',
  numero bigint,
  serie text,
  chave text,
  protocolo text,
  valor numeric(12,2),
  cpf_cnpj_cliente text,
  motivo text,
  autorizada_em timestamptz,
  cancelada_em timestamptz,
  cancel_motivo text,
  feito_por text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_fiscais_store_idx ON public.notas_fiscais (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notas_fiscais_balcao_idx ON public.notas_fiscais (balcao_order_id) WHERE balcao_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notas_fiscais_os_idx ON public.notas_fiscais (order_id) WHERE order_id IS NOT NULL;
-- Uma nota "viva" (não rejeitada/cancelada) por venda de balcão e modelo
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_uma_por_venda ON public.notas_fiscais (balcao_order_id, modelo)
  WHERE balcao_order_id IS NOT NULL AND status NOT IN ('rejeitada', 'denegada', 'cancelada', 'erro');
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notas_fiscais: ler" ON public.notas_fiscais;
CREATE POLICY "notas_fiscais: ler" ON public.notas_fiscais FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());
-- Gravar só pela função do servidor (service role)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notas_fiscais') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notas_fiscais;
  END IF;
END $$;
