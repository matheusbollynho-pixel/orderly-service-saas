-- Fiado: só para cliente aprovado (opção da loja) e limite por cliente.
-- * store_settings.fiado_exige_aprovacao (padrão: desligado; nada muda para quem não liga)
-- * clients.fiado_aprovado / clients.fiado_limite (vazio = sem limite)
-- * Aprovar e mudar o limite: só o dono ou quem tem a permissão aprovar_fiado MARCADA
--   (diferente das outras ações, ausente = NÃO pode).
-- * O banco barra o fiado (balcão, OS ou lançamento manual) de cliente não aprovado ou acima do limite.
--   O limite vale sempre que estiver preenchido, mesmo com a aprovação desligada.
-- * Cliente com fiado atrasado continua comprando (só aviso na tela).

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiado_exige_aprovacao boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS fiado_aprovado boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS fiado_limite numeric(12,2) CHECK (fiado_limite IS NULL OR fiado_limite >= 0);

-- Dono, servidor, ou permissão aprovar_fiado marcada como true
CREATE OR REPLACE FUNCTION public.pode_aprovar_fiado()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  m record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  SELECT role, permissions INTO m FROM store_members WHERE user_id = auth.uid() AND active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN m.role = 'owner' OR COALESCE((m.permissions ->> 'aprovar_fiado')::boolean, false);
END;
$function$;
REVOKE ALL ON FUNCTION public.pode_aprovar_fiado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_aprovar_fiado() TO authenticated;

-- Ficha do cliente: aprovação e limite só por quem pode aprovar
CREATE OR REPLACE FUNCTION public.fn_cliente_fiado_permissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.fiado_aprovado OR NEW.fiado_limite IS NOT NULL))
     OR (TG_OP = 'UPDATE' AND (NEW.fiado_aprovado IS DISTINCT FROM OLD.fiado_aprovado
                               OR NEW.fiado_limite IS DISTINCT FROM OLD.fiado_limite)) THEN
    IF NOT public.pode_aprovar_fiado() THEN
      RAISE EXCEPTION 'Sem permissão para aprovar fiado ou mudar o limite. Peça ao dono ou gerente.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_cliente_fiado_permissao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_cliente_fiado_permissao ON public.clients;
CREATE TRIGGER trg_cliente_fiado_permissao BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_cliente_fiado_permissao();

-- Em aberto de um cliente: soma do que falta pagar nos fiados não quitados
CREATE OR REPLACE FUNCTION public.fiado_em_aberto_cliente(p_client uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(sum(greatest(coalesce(original_amount, 0) + coalesce(interest_accrued, 0) - coalesce(amount_paid, 0), 0)), 0)
    FROM fiados WHERE client_id = p_client AND status <> 'pago';
$function$;
REVOKE ALL ON FUNCTION public.fiado_em_aberto_cliente(uuid) FROM PUBLIC, anon, authenticated;

-- Novo fiado: cliente aprovado (se a loja exige) e dentro do limite (se tiver limite)
CREATE OR REPLACE FUNCTION public.fn_fiado_aprovacao_limite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_exige  boolean;
  v_achou  boolean := false;
  v_aprov  boolean := false;
  v_limite numeric;
  v_aberto numeric;
BEGIN
  SELECT fiado_exige_aprovacao INTO v_exige FROM store_settings WHERE id = NEW.store_id;
  IF NEW.client_id IS NOT NULL THEN
    SELECT true, fiado_aprovado, fiado_limite INTO v_achou, v_aprov, v_limite FROM clients WHERE id = NEW.client_id;
    v_achou := COALESCE(v_achou, false);
  END IF;

  IF COALESCE(v_exige, false) THEN
    IF NOT v_achou THEN
      RAISE EXCEPTION 'Para vender fiado, escolha um cliente cadastrado e aprovado.';
    END IF;
    IF NOT COALESCE(v_aprov, false) THEN
      RAISE EXCEPTION 'Cliente não aprovado para fiado. O dono ou gerente libera na ficha do cliente (Clientes).';
    END IF;
  END IF;

  IF v_achou AND v_limite IS NOT NULL THEN
    v_aberto := public.fiado_em_aberto_cliente(NEW.client_id);
    IF v_aberto + COALESCE(NEW.original_amount, 0) > v_limite + 0.005 THEN
      RAISE EXCEPTION 'Passa do limite de fiado deste cliente: limite R$ %, já em aberto R$ %, este fiado R$ %.',
        replace(to_char(v_limite, 'FM999999990.00'), '.', ','), replace(to_char(v_aberto, 'FM999999990.00'), '.', ','),
        replace(to_char(COALESCE(NEW.original_amount, 0), 'FM999999990.00'), '.', ',');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_fiado_aprovacao_limite() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fiado_aprovacao_limite ON public.fiados;
CREATE TRIGGER trg_fiado_aprovacao_limite BEFORE INSERT ON public.fiados
  FOR EACH ROW EXECUTE FUNCTION public.fn_fiado_aprovacao_limite();

-- Conferência: deve voltar 2 linhas
SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_cliente_fiado_permissao', 'trg_fiado_aprovacao_limite');
