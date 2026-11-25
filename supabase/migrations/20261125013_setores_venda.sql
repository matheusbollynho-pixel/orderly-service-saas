-- Setor da venda (ex.: Balcão, Online, Estofaria). Opcional por loja: sem setor cadastrado, nada muda.
-- A nota de balcão e a OS guardam o setor (vem o padrão de cada uma); o lançamento do caixa
-- herda sozinho o setor da origem (nota, OS, pagamento da OS, encomenda, estorno).
-- Lançamento manual escolhe na tela (ou fica sem setor: despesa geral, retirada etc.).

CREATE TABLE IF NOT EXISTS public.setores_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL DEFAULT get_my_store_id() REFERENCES public.store_settings(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  padrao_balcao boolean NOT NULL DEFAULT false,
  padrao_os boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS setores_venda_store_idx ON public.setores_venda (store_id);
-- Um padrão de cada por loja
CREATE UNIQUE INDEX IF NOT EXISTS setores_venda_um_padrao_balcao ON public.setores_venda (store_id) WHERE padrao_balcao;
CREATE UNIQUE INDEX IF NOT EXISTS setores_venda_um_padrao_os ON public.setores_venda (store_id) WHERE padrao_os;

ALTER TABLE public.setores_venda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setores_venda: ler" ON public.setores_venda;
CREATE POLICY "setores_venda: ler" ON public.setores_venda FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());
DROP POLICY IF EXISTS "setores_venda: dono grava" ON public.setores_venda;
CREATE POLICY "setores_venda: dono grava" ON public.setores_venda FOR ALL TO authenticated
  USING (store_id = get_my_store_id() AND public.sou_dono_da_loja(store_id))
  WITH CHECK (store_id = get_my_store_id() AND public.sou_dono_da_loja(store_id));

ALTER TABLE public.balcao_orders ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores_venda(id) ON DELETE SET NULL;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores_venda(id) ON DELETE SET NULL;
ALTER TABLE public.cash_flow ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores_venda(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cash_flow_setor_idx ON public.cash_flow (store_id, setor_id) WHERE setor_id IS NOT NULL;

-- Setor tem que ser da mesma loja
CREATE OR REPLACE FUNCTION public.fn_setor_da_loja(p_setor uuid, p_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT p_setor IS NULL OR EXISTS (SELECT 1 FROM setores_venda WHERE id = p_setor AND store_id = p_store);
$function$;

-- Nota e OS novas: setor padrão da loja; setor de outra loja é recusado
CREATE OR REPLACE FUNCTION public.fn_venda_setor_padrao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.setor_id IS NULL THEN
    IF TG_TABLE_NAME = 'balcao_orders' THEN
      SELECT id INTO NEW.setor_id FROM setores_venda WHERE store_id = NEW.store_id AND padrao_balcao AND ativo LIMIT 1;
    ELSE
      SELECT id INTO NEW.setor_id FROM setores_venda WHERE store_id = NEW.store_id AND padrao_os AND ativo LIMIT 1;
    END IF;
  END IF;
  IF NOT public.fn_setor_da_loja(NEW.setor_id, NEW.store_id) THEN
    RAISE EXCEPTION 'Setor de outra loja';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_balcao_setor_padrao ON public.balcao_orders;
CREATE TRIGGER trg_balcao_setor_padrao BEFORE INSERT OR UPDATE OF setor_id ON public.balcao_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_venda_setor_padrao();
DROP TRIGGER IF EXISTS trg_os_setor_padrao ON public.service_orders;
CREATE TRIGGER trg_os_setor_padrao BEFORE INSERT OR UPDATE OF setor_id ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_venda_setor_padrao();

-- Caixa: herda o setor da origem quando não vem escolhido
CREATE OR REPLACE FUNCTION public.fn_caixa_setor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.setor_id IS NULL THEN
    IF NEW.estorno_de IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM cash_flow WHERE id = NEW.estorno_de;
    ELSIF NEW.balcao_order_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM balcao_orders WHERE id = NEW.balcao_order_id;
    ELSIF NEW.order_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM service_orders WHERE id = NEW.order_id;
    ELSIF NEW.payment_id IS NOT NULL THEN
      SELECT so.setor_id INTO NEW.setor_id FROM payments p JOIN service_orders so ON so.id = p.order_id WHERE p.id = NEW.payment_id;
    ELSIF NEW.encomenda_id IS NOT NULL THEN
      SELECT id INTO NEW.setor_id FROM setores_venda WHERE store_id = NEW.store_id AND padrao_balcao AND ativo LIMIT 1;
    END IF;
  END IF;
  IF NOT public.fn_setor_da_loja(NEW.setor_id, NEW.store_id) THEN
    RAISE EXCEPTION 'Setor de outra loja';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_caixa_setor ON public.cash_flow;
CREATE TRIGGER trg_caixa_setor BEFORE INSERT ON public.cash_flow
  FOR EACH ROW EXECUTE FUNCTION public.fn_caixa_setor();

-- Tempo real (os outros aparelhos veem setor novo)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'setores_venda') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.setores_venda;
  END IF;
END $$;
