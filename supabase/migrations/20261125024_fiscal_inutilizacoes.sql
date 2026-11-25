-- Módulo fiscal: inutilização de numeração (números de NFC-e/NF-e pulados, ex.: nota recusada pela SEFAZ).
-- A SEFAZ exige que todo número pulado seja inutilizado. Gravar só pela função `fiscal` (service role).
CREATE TABLE IF NOT EXISTS public.fiscal_inutilizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  emissor_id uuid REFERENCES public.fiscal_emissores(id) ON DELETE SET NULL,
  modelo text NOT NULL CHECK (modelo IN ('nfce', 'nfe')),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'producao')),
  serie text NOT NULL,
  numero_de bigint NOT NULL,
  numero_ate bigint NOT NULL,
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'processando',
  fornecedor_id text,
  protocolo text,
  retorno text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (numero_ate >= numero_de)
);
CREATE INDEX IF NOT EXISTS fiscal_inutilizacoes_store_idx ON public.fiscal_inutilizacoes (store_id, created_at DESC);
ALTER TABLE public.fiscal_inutilizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_inutilizacoes: ler" ON public.fiscal_inutilizacoes;
CREATE POLICY "fiscal_inutilizacoes: ler" ON public.fiscal_inutilizacoes FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());

-- Nota recusada cujo número foi inutilizado continua "morta": não impede emitir nova nota da mesma venda
DROP INDEX IF EXISTS public.notas_fiscais_uma_por_venda;
CREATE UNIQUE INDEX notas_fiscais_uma_por_venda ON public.notas_fiscais (balcao_order_id, modelo)
  WHERE balcao_order_id IS NOT NULL AND status NOT IN ('rejeitada', 'denegada', 'cancelada', 'erro', 'inutilizada');
