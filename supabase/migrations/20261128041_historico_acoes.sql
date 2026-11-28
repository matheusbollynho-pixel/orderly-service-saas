-- Histórico de ações sensíveis (quem fez o quê e quando), gravado pelo banco — não depende da tela.
-- Só o dono lê. Registra daqui para frente:
--   nota do balcão cancelada · desconto dado ou aumentado na nota · pagamento de OS apagado ou alterado
--   · desconto no pagamento da OS · estorno no caixa · ajuste de estoque, baixa sem OS e transferências
--   · OS excluída · item tirado da OS · devolução de item · fiado excluído · fiado aprovado / limite mudado

CREATE TABLE IF NOT EXISTS public.historico_acoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  quando timestamptz NOT NULL DEFAULT now(),
  quem text,
  tipo text NOT NULL,       -- cancelamento | desconto | pagamento | estorno | estoque | exclusao | devolucao | fiado
  acao text NOT NULL,
  valor numeric(12,2)
);
CREATE INDEX IF NOT EXISTS historico_acoes_loja_quando ON public.historico_acoes (store_id, quando DESC);
ALTER TABLE public.historico_acoes ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.historico_acoes FROM anon, authenticated;
DROP POLICY IF EXISTS "historico_acoes: dono le" ON public.historico_acoes;
CREATE POLICY "historico_acoes: dono le" ON public.historico_acoes FOR SELECT TO authenticated
  USING (public.sou_dono_da_loja(store_id));

-- Quem está logado: nome da pessoa (login ligado a mecânico/atendente) ou o e-mail; sem login = sistema
CREATE OR REPLACE FUNCTION public.quem_agora()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE coalesce(
    (SELECT CASE sm.colaborador_tipo
              WHEN 'mecanico' THEN (SELECT name FROM mechanics WHERE id = sm.colaborador_id)
              WHEN 'atendente' THEN (SELECT name FROM staff_members WHERE id = sm.colaborador_id)
            END
       FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active LIMIT 1),
    (SELECT email FROM store_members WHERE user_id = auth.uid() AND active LIMIT 1),
    'login ' || left(auth.uid()::text, 8)) END;
$function$;
REVOKE ALL ON FUNCTION public.quem_agora() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_acao(p_store uuid, p_tipo text, p_acao text, p_valor numeric DEFAULT NULL, p_quem text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  INSERT INTO historico_acoes (store_id, quem, tipo, acao, valor)
  SELECT p_store, coalesce(nullif(btrim(coalesce(p_quem, '')), ''), public.quem_agora()), p_tipo, p_acao, round(p_valor, 2)
   WHERE p_store IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.registrar_acao(uuid, text, text, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.os_rotulo(p_os uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT coalesce('OS de ' || nullif(btrim(client_name), '') || coalesce(' (' || nullif(btrim(equipment), '') || ')', ''), 'OS')
    FROM service_orders WHERE id = p_os;
$function$;
REVOKE ALL ON FUNCTION public.os_rotulo(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- nota do balcão: cancelamento e desconto
CREATE OR REPLACE FUNCTION public.fn_hist_balcao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.status = 'cancelada' AND OLD.status IS DISTINCT FROM 'cancelada' THEN
    PERFORM registrar_acao(NEW.store_id, 'cancelamento',
      'Cancelou a nota #' || coalesce(NEW.numero::text, '?') || coalesce(' de ' || nullif(btrim(NEW.client_name), ''), '')
        || coalesce(' — ' || nullif(btrim(NEW.cancel_reason), ''), '')
        || CASE WHEN OLD.status = 'aberta' THEN ' (ainda aberta)' ELSE '' END,
      NEW.total);
  END IF;
  IF coalesce(NEW.discount_amount, 0) > coalesce(OLD.discount_amount, 0) + 0.004 AND NEW.status <> 'cancelada' THEN
    PERFORM registrar_acao(NEW.store_id, 'desconto',
      'Desconto na nota #' || coalesce(NEW.numero::text, '?') || ': '
        || replace(to_char(coalesce(NEW.discount_pct, 0), 'FM990.##'), '.', ',') || '% (R$ '
        || replace(to_char(coalesce(NEW.discount_amount, 0), 'FM999999990.00'), '.', ',') || ')',
      NEW.discount_amount);
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_balcao ON public.balcao_orders;
CREATE TRIGGER trg_hist_balcao AFTER UPDATE ON public.balcao_orders FOR EACH ROW EXECUTE FUNCTION public.fn_hist_balcao();

-- ---------------------------------------------------------------- pagamento de OS: desconto, alterado, apagado
CREATE OR REPLACE FUNCTION public.fn_hist_pagamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.discount_amount, 0) > 0.004 THEN
      PERFORM registrar_acao(NEW.store_id, 'desconto', 'Desconto no pagamento da ' || coalesce(os_rotulo(NEW.order_id), 'OS'), NEW.discount_amount);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF coalesce(NEW.amount, 0) <> coalesce(OLD.amount, 0) OR coalesce(NEW.discount_amount, 0) <> coalesce(OLD.discount_amount, 0) THEN
      PERFORM registrar_acao(NEW.store_id, 'pagamento',
        'Alterou pagamento da ' || coalesce(os_rotulo(NEW.order_id), 'OS') || ': de R$ '
          || replace(to_char(coalesce(OLD.amount, 0), 'FM999999990.00'), '.', ',') || ' para R$ '
          || replace(to_char(coalesce(NEW.amount, 0), 'FM999999990.00'), '.', ',')
          || CASE WHEN coalesce(NEW.discount_amount, 0) <> coalesce(OLD.discount_amount, 0)
                  THEN ' (desconto de R$ ' || replace(to_char(coalesce(OLD.discount_amount, 0), 'FM999999990.00'), '.', ',')
                       || ' para R$ ' || replace(to_char(coalesce(NEW.discount_amount, 0), 'FM999999990.00'), '.', ',') || ')' ELSE '' END,
        NEW.amount);
    END IF;
    RETURN NEW;
  ELSE
    -- OS sendo apagada inteira: o registro da OS já basta
    IF os_rotulo(OLD.order_id) IS NULL THEN RETURN OLD; END IF;
    PERFORM registrar_acao(OLD.store_id, 'pagamento', 'Apagou pagamento da ' || os_rotulo(OLD.order_id), OLD.amount);
    RETURN OLD;
  END IF;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_pagamento ON public.payments;
CREATE TRIGGER trg_hist_pagamento AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.fn_hist_pagamento();

-- ---------------------------------------------------------------- estorno no caixa
CREATE OR REPLACE FUNCTION public.fn_hist_caixa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.estorno_de IS NOT NULL THEN
    PERFORM registrar_acao(NEW.store_id, 'estorno', 'Estornou no caixa: ' || coalesce(nullif(btrim(NEW.description), ''), 'lançamento'), NEW.amount);
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_caixa ON public.cash_flow;
CREATE TRIGGER trg_hist_caixa AFTER INSERT ON public.cash_flow FOR EACH ROW EXECUTE FUNCTION public.fn_hist_caixa();

-- ---------------------------------------------------------------- estoque mexido à mão
CREATE OR REPLACE FUNCTION public.fn_hist_estoque()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_nome text;
  v_q text := replace(to_char(NEW.quantity, 'FM999999990.###'), '.', ',');
BEGIN
  IF NEW.type NOT IN ('ajuste', 'consumo_interno', 'transf_para_almox', 'transf_para_loja', 'entrada_manual') THEN RETURN NEW; END IF;
  -- Entrada pela nota (XML) e baixa de OS/venda não entram: são o dia a dia
  IF NEW.type = 'entrada_manual' AND coalesce(NEW.notes, '') ILIKE '%NF-e%' THEN RETURN NEW; END IF;
  SELECT name INTO v_nome FROM inventory_products WHERE id = NEW.product_id;
  PERFORM registrar_acao(NEW.store_id, 'estoque',
    CASE NEW.type
      WHEN 'ajuste' THEN 'Ajustou o estoque' || CASE WHEN NEW.local = 'almox' THEN ' do almoxarifado' ELSE '' END || ' de ' || coalesce(v_nome, 'produto')
                         || coalesce(': de ' || replace(to_char(NEW.saldo_anterior, 'FM999999990.###'), '.', ','), '') || ' para ' || v_q
      WHEN 'consumo_interno' THEN 'Baixa sem OS de ' || v_q || ' ' || coalesce(v_nome, 'produto') || coalesce(' — ' || nullif(btrim(NEW.notes), ''), '')
                                  || coalesce(' (retirou: ' || nullif(btrim(NEW.retirado_por), '') || ')', '')
      WHEN 'transf_para_almox' THEN 'Passou ' || v_q || ' ' || coalesce(v_nome, 'produto') || ' da loja para o almoxarifado'
      WHEN 'transf_para_loja' THEN 'Passou ' || v_q || ' ' || coalesce(v_nome, 'produto') || ' do almoxarifado para a loja'
      ELSE 'Entrada manual de ' || v_q || ' ' || coalesce(v_nome, 'produto') || CASE WHEN NEW.local = 'almox' THEN ' no almoxarifado' ELSE '' END
    END,
    NULL, NEW.feito_por);
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_estoque ON public.inventory_movements;
CREATE TRIGGER trg_hist_estoque AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.fn_hist_estoque();

-- ---------------------------------------------------------------- OS excluída e item tirado da OS
CREATE OR REPLACE FUNCTION public.fn_hist_os_excluida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF coalesce(OLD.equipment, '') <> '__QR_WALKIN_PLACEHOLDER__' THEN
    PERFORM registrar_acao(OLD.store_id, 'exclusao',
      'Excluiu a OS de ' || coalesce(nullif(btrim(OLD.client_name), ''), 'cliente') || coalesce(' (' || nullif(btrim(OLD.equipment), '') || ')', ''), NULL);
  END IF;
  RETURN OLD;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_os_excluida ON public.service_orders;
CREATE TRIGGER trg_hist_os_excluida BEFORE DELETE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.fn_hist_os_excluida();

CREATE OR REPLACE FUNCTION public.fn_hist_item_os()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_os text;
BEGIN
  -- OS sendo apagada inteira: o registro da OS já basta
  SELECT os_rotulo(OLD.order_id) INTO v_os;
  IF v_os IS NULL THEN RETURN OLD; END IF;
  PERFORM registrar_acao(OLD.store_id, 'exclusao',
    'Tirou da ' || v_os || ': ' || coalesce(nullif(btrim(OLD.quantidade), ''), '1') || 'x ' || coalesce(nullif(btrim(OLD.descricao), ''), 'item'),
    coalesce(OLD.valor, 0) * coalesce(nullif(regexp_replace(coalesce(OLD.quantidade, ''), '[^0-9.,]', '', 'g'), '')::numeric, 1));
  RETURN OLD;
EXCEPTION WHEN others THEN
  RETURN OLD; -- histórico nunca trava a exclusão
END $function$;
DROP TRIGGER IF EXISTS trg_hist_item_os ON public.materials;
CREATE TRIGGER trg_hist_item_os AFTER DELETE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.fn_hist_item_os();

-- ---------------------------------------------------------------- devolução de item do balcão
CREATE OR REPLACE FUNCTION public.fn_hist_devolucao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  PERFORM registrar_acao(NEW.store_id, 'devolucao',
    'Devolução na nota #' || coalesce((SELECT numero::text FROM balcao_orders WHERE id = NEW.order_id), '?') || ': '
      || replace(to_char(NEW.quantidade, 'FM999990.###'), '.', ',') || 'x ' || coalesce(NEW.descricao, 'item')
      || ' — ' || NEW.motivo || CASE WHEN NEW.forma = 'abater_fiado' THEN ' (abatido do fiado)' ELSE '' END,
    NEW.valor, NEW.feito_por);
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_devolucao ON public.balcao_devolucoes;
CREATE TRIGGER trg_hist_devolucao AFTER INSERT ON public.balcao_devolucoes FOR EACH ROW EXECUTE FUNCTION public.fn_hist_devolucao();

-- ---------------------------------------------------------------- fiado excluído; aprovação e limite
CREATE OR REPLACE FUNCTION public.fn_hist_fiado_excluido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  PERFORM registrar_acao(OLD.store_id, 'fiado', 'Excluiu o fiado de ' || coalesce(nullif(btrim(OLD.client_name), ''), 'cliente'),
    greatest(coalesce(OLD.original_amount, 0) + coalesce(OLD.interest_accrued, 0) - coalesce(OLD.amount_paid, 0), 0));
  RETURN OLD;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_fiado_excluido ON public.fiados;
CREATE TRIGGER trg_hist_fiado_excluido BEFORE DELETE ON public.fiados FOR EACH ROW EXECUTE FUNCTION public.fn_hist_fiado_excluido();

CREATE OR REPLACE FUNCTION public.fn_hist_cliente_fiado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.fiado_aprovado IS DISTINCT FROM OLD.fiado_aprovado THEN
    PERFORM registrar_acao(NEW.store_id, 'fiado',
      CASE WHEN NEW.fiado_aprovado THEN 'Liberou fiado para ' ELSE 'Tirou o fiado de ' END || coalesce(NEW.name, 'cliente'), NULL);
  END IF;
  IF NEW.fiado_limite IS DISTINCT FROM OLD.fiado_limite THEN
    PERFORM registrar_acao(NEW.store_id, 'fiado',
      'Limite de fiado de ' || coalesce(NEW.name, 'cliente') || ': '
        || coalesce('R$ ' || replace(to_char(OLD.fiado_limite, 'FM999999990.00'), '.', ','), 'sem limite') || ' → '
        || coalesce('R$ ' || replace(to_char(NEW.fiado_limite, 'FM999999990.00'), '.', ','), 'sem limite'),
      NEW.fiado_limite);
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_hist_cliente_fiado ON public.clients;
CREATE TRIGGER trg_hist_cliente_fiado AFTER UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.fn_hist_cliente_fiado();

REVOKE ALL ON FUNCTION public.fn_hist_balcao(), public.fn_hist_pagamento(), public.fn_hist_caixa(), public.fn_hist_estoque(),
  public.fn_hist_os_excluida(), public.fn_hist_item_os(), public.fn_hist_devolucao(), public.fn_hist_fiado_excluido(),
  public.fn_hist_cliente_fiado() FROM PUBLIC, anon, authenticated;

-- Conferência: deve voltar 9 gatilhos
SELECT count(*) AS gatilhos FROM pg_trigger WHERE tgname LIKE 'trg_hist_%';
