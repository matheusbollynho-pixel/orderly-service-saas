-- Tipos de cliente (ex.: Lojista, Lava-jato, Estética): preço diferente no balcão.
-- Cada tipo dá X% de desconto OU usa o "preço de atacado" do produto (se o produto tiver).
-- Validade opcional: o cliente fica no tipo até tipo_valido_ate; compra finalizada com valor
-- >= compra_minima renova sozinha por mais validade_dias. Sem validade = não vence.
-- Só quem pode dar desconto cria/edita tipos e coloca cliente num tipo.

CREATE TABLE IF NOT EXISTS public.tipos_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL DEFAULT get_my_store_id() REFERENCES public.store_settings(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  desconto_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_pct >= 0 AND desconto_pct <= 100),
  usa_preco_atacado boolean NOT NULL DEFAULT false,
  validade_dias integer CHECK (validade_dias IS NULL OR validade_dias > 0),
  compra_minima numeric(12,2) NOT NULL DEFAULT 0 CHECK (compra_minima >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tipos_cliente_store_idx ON public.tipos_cliente (store_id);

ALTER TABLE public.tipos_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_cliente: ler" ON public.tipos_cliente;
CREATE POLICY "tipos_cliente: ler" ON public.tipos_cliente FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());
DROP POLICY IF EXISTS "tipos_cliente: gravar" ON public.tipos_cliente;
CREATE POLICY "tipos_cliente: gravar" ON public.tipos_cliente FOR ALL TO authenticated
  USING (store_id = get_my_store_id() AND public.pode_acao('dar_desconto'))
  WITH CHECK (store_id = get_my_store_id() AND public.pode_acao('dar_desconto'));

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tipo_cliente_id uuid REFERENCES public.tipos_cliente(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tipo_valido_ate date;
CREATE INDEX IF NOT EXISTS clients_tipo_idx ON public.clients (store_id, tipo_cliente_id) WHERE tipo_cliente_id IS NOT NULL;

ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS preco_atacado numeric(12,2) CHECK (preco_atacado IS NULL OR preco_atacado >= 0);

-- Cliente: tipo tem que ser da mesma loja; mudar tipo/validade só com permissão de desconto
CREATE OR REPLACE FUNCTION public.fn_cliente_tipo_permissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.tipo_cliente_id IS NULL AND NEW.tipo_valido_ate IS NOT NULL THEN
    NEW.tipo_valido_ate := NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.tipo_cliente_id IS NOT DISTINCT FROM OLD.tipo_cliente_id
     AND NEW.tipo_valido_ate IS NOT DISTINCT FROM OLD.tipo_valido_ate THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.tipo_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.tipo_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tipos_cliente WHERE id = NEW.tipo_cliente_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'Tipo de cliente de outra loja';
  END IF;
  -- Renovação automática pela compra (função abaixo) passa sem checar permissão
  IF coalesce(current_setting('app.tipo_renova', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.pode_acao('dar_desconto') THEN
    RAISE EXCEPTION 'Sem permissão para mudar o tipo do cliente (preço de lojista). Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_cliente_tipo_permissao ON public.clients;
CREATE TRIGGER trg_cliente_tipo_permissao BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_cliente_tipo_permissao();

-- Nota do balcão finalizada (ou no fiado) com valor >= compra mínima renova a validade do tipo
CREATE OR REPLACE FUNCTION public.fn_balcao_renova_tipo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_tipo tipos_cliente%ROWTYPE;
  v_ate date;
  v_hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF NEW.client_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status
     OR OLD.status <> 'aberta' OR NEW.status NOT IN ('finalizada', 'fiado') THEN
    RETURN NEW;
  END IF;
  SELECT t.* INTO v_tipo FROM clients c JOIN tipos_cliente t ON t.id = c.tipo_cliente_id
   WHERE c.id = NEW.client_id AND c.store_id = NEW.store_id;
  IF NOT FOUND OR NOT v_tipo.ativo OR v_tipo.validade_dias IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.total, 0) < v_tipo.compra_minima THEN RETURN NEW; END IF;
  SELECT tipo_valido_ate INTO v_ate FROM clients WHERE id = NEW.client_id;
  PERFORM set_config('app.tipo_renova', 'on', true);
  UPDATE clients SET tipo_valido_ate = greatest(coalesce(v_ate, v_hoje), v_hoje + v_tipo.validade_dias)
   WHERE id = NEW.client_id;
  PERFORM set_config('app.tipo_renova', '', true);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_balcao_renova_tipo ON public.balcao_orders;
CREATE TRIGGER trg_balcao_renova_tipo AFTER UPDATE OF status ON public.balcao_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_balcao_renova_tipo();
