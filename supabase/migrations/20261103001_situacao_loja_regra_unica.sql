-- ============================================================
-- Bloqueio da loja: UMA regra só, no banco
-- ============================================================
-- Antes eram duas chaves que não conversavam:
--   * store_settings.active  -> "Desativar app" do SuperAdmin mexia aqui,
--     mas o app nunca lia (botão não fazia nada);
--   * saas_subscriptions.status -> o modal só olhava isso, e a trava por
--     atraso dependia do cron das 6h ter rodado. Liberar com data velha
--     fazia o cron travar de novo no dia seguinte.
-- Agora: _situacao_loja_calc() decide; o modal do cliente e o SuperAdmin
-- usam a mesma resposta. Os comandos do SuperAdmin viram RPCs atômicas.
--
-- Regras (data de hoje em horário de Brasília):
--  1. Teste grátis (plan='trial' com trial_ends_at) sem assinatura ativa:
--     acabou -> bloqueada; faltam <=5 dias -> aviso.
--  2. Sem assinatura, ou assinatura 'pending'/plano trial -> liberada.
--  3. Assinatura mais recente 'cancelled' ou 'overdue' -> bloqueada.
--  4. 'active': venceu há mais de 3 dias -> bloqueada (calculado, não
--     depende do cron); vence em <=5 dias (ou venceu há <=3) -> aviso.
--  5. Se nada acima bloqueou e store_settings.active=false -> bloqueada
--     (desativada pelo admin).
-- ============================================================

CREATE OR REPLACE FUNCTION public._situacao_loja_calc(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja   record;
  v_sub    record;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dias   int;
  v_plano  text;
  v_valor  numeric;
  v_sit    text;
  v_motivo text;
  v_venc   text;
  v_precos jsonb := '{"basic":79,"pro":149,"premium":219}';
BEGIN
  SELECT id, plan, active, trial_ends_at INTO v_loja
    FROM store_settings WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('situacao', 'liberada', 'motivo', 'loja_nao_encontrada');
  END IF;

  SELECT status, plan, amount, due_date, paid_at INTO v_sub
    FROM saas_subscriptions
   WHERE store_id = p_store_id
   ORDER BY created_at DESC
   LIMIT 1;

  v_plano := COALESCE(NULLIF(v_sub.plan, 'trial'), NULLIF(v_loja.plan, 'trial'), 'basic');
  v_valor := COALESCE(v_sub.amount, (v_precos->>v_plano)::numeric, 79);

  IF v_loja.plan = 'trial' AND v_loja.trial_ends_at IS NOT NULL
     AND COALESCE(v_sub.status, '') <> 'active' THEN
    v_venc := v_loja.trial_ends_at::text;
    IF v_loja.trial_ends_at <= now() THEN
      v_sit := 'bloqueada'; v_motivo := 'teste_acabou';
    ELSIF v_loja.trial_ends_at - now() <= interval '5 days' THEN
      v_sit := 'aviso'; v_motivo := 'teste_acabando';
    ELSE
      v_sit := 'liberada'; v_motivo := 'em_teste';
    END IF;
  ELSIF v_sub.status IS NULL THEN
    v_sit := 'liberada'; v_motivo := 'sem_assinatura';
  ELSIF v_sub.status = 'pending' OR v_sub.plan = 'trial' THEN
    v_sit := 'liberada'; v_motivo := 'pendente';
  ELSIF v_sub.status = 'cancelled' THEN
    v_sit := 'bloqueada'; v_motivo := 'cancelada';
  ELSIF v_sub.status = 'overdue' THEN
    v_sit := 'bloqueada'; v_motivo := 'vencida';
  ELSIF v_sub.due_date IS NULL THEN
    v_sit := 'liberada'; v_motivo := 'em_dia';
  ELSE
    v_dias := v_sub.due_date - v_hoje;
    v_venc := v_sub.due_date::text;
    IF v_dias < -3 THEN
      v_sit := 'bloqueada'; v_motivo := 'vencida';
    ELSIF v_dias <= 5 THEN
      v_sit := 'aviso'; v_motivo := CASE WHEN v_dias < 0 THEN 'vencida_tolerancia' ELSE 'vencendo' END;
    ELSE
      v_sit := 'liberada'; v_motivo := 'em_dia';
    END IF;
  END IF;

  IF v_sit <> 'bloqueada' AND v_loja.active = false THEN
    v_sit := 'bloqueada'; v_motivo := 'desativada';
  END IF;

  RETURN jsonb_build_object(
    'situacao', v_sit,
    'motivo', v_motivo,
    'plano', v_plano,
    'valor', v_valor,
    'vencimento', COALESCE(v_venc, v_sub.due_date::text),
    'dias', v_dias,
    'eh_teste', (v_motivo IN ('teste_acabou', 'teste_acabando', 'em_teste')),
    'bloqueia_em', CASE WHEN v_sub.due_date IS NOT NULL AND v_motivo IN ('vencendo', 'vencida_tolerancia', 'em_dia')
                        THEN (v_sub.due_date + 4)::text END
  );
END;
$$;

REVOKE ALL ON FUNCTION public._situacao_loja_calc(uuid) FROM PUBLIC, anon, authenticated;

-- Cliente: só a própria loja. Admin: qualquer uma.
CREATE OR REPLACE FUNCTION public.situacao_loja(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS DISTINCT FROM get_my_store_id() AND NOT is_saas_admin() THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  RETURN _situacao_loja_calc(p_store_id);
END;
$$;

REVOKE ALL ON FUNCTION public.situacao_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.situacao_loja(uuid) TO authenticated;

-- Lista do SuperAdmin
CREATE OR REPLACE FUNCTION public.situacao_todas_lojas()
RETURNS TABLE (store_id uuid, situacao jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_saas_admin() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  RETURN QUERY SELECT s.id, _situacao_loja_calc(s.id) FROM store_settings s;
END;
$$;

REVOKE ALL ON FUNCTION public.situacao_todas_lojas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.situacao_todas_lojas() TO authenticated;

-- ------------------------------------------------------------
-- Comandos do SuperAdmin (tudo ou nada)
-- ------------------------------------------------------------

-- Liberar até uma data FUTURA: a loja não volta a travar sozinha.
CREATE OR REPLACE FUNCTION public.admin_liberar_loja(p_store_id uuid, p_ate date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_loja  record;
  v_sub   record;
  v_plano text;
BEGIN
  IF NOT is_saas_admin() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_ate IS NULL OR p_ate <= v_hoje THEN
    RAISE EXCEPTION 'A data de liberação precisa ser depois de hoje';
  END IF;

  SELECT id, plan, company_name INTO v_loja FROM store_settings WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;

  SELECT id, plan, owner_name, owner_email INTO v_sub
    FROM saas_subscriptions WHERE store_id = p_store_id
   ORDER BY created_at DESC LIMIT 1;

  v_plano := COALESCE(NULLIF(v_loja.plan, 'trial'), NULLIF(v_sub.plan, 'trial'), 'basic');

  IF v_sub.id IS NOT NULL THEN
    UPDATE saas_subscriptions
       SET status = 'active', due_date = p_ate,
           plan = CASE WHEN plan = 'trial' THEN v_plano ELSE plan END,
           updated_at = now()
     WHERE id = v_sub.id;
  ELSE
    INSERT INTO saas_subscriptions (store_id, plan, status, due_date, amount, owner_name, owner_email)
    VALUES (p_store_id, v_plano, 'active', p_ate, NULL,
            COALESCE(v_loja.company_name, 'Cliente'), 'sem-email@speedseekos.com.br');
  END IF;

  UPDATE store_settings
     SET active = true,
         plan = CASE WHEN plan = 'trial' THEN v_plano ELSE plan END,
         updated_at = now()
   WHERE id = p_store_id;

  RETURN _situacao_loja_calc(p_store_id);
END;
$$;

-- Bloquear agora (vale até alguém liberar ou o cliente pagar)
CREATE OR REPLACE FUNCTION public.admin_bloquear_loja(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_saas_admin() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  UPDATE store_settings SET active = false, updated_at = now() WHERE id = p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  RETURN _situacao_loja_calc(p_store_id);
END;
$$;

-- Pagamento recebido fora do Asaas (Pix direto, dinheiro): mesma conta do
-- webhook — +1 mês a partir do vencimento atual (se ainda não venceu) ou de hoje.
CREATE OR REPLACE FUNCTION public.admin_registrar_pagamento(p_store_id uuid, p_valor numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_loja  record;
  v_sub   record;
  v_base  date;
  v_plano text;
BEGIN
  IF NOT is_saas_admin() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor recebido'; END IF;

  SELECT id, plan, company_name INTO v_loja FROM store_settings WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;

  SELECT id, plan, status, due_date, owner_name, owner_email INTO v_sub
    FROM saas_subscriptions WHERE store_id = p_store_id
   ORDER BY created_at DESC LIMIT 1;

  v_plano := COALESCE(NULLIF(v_loja.plan, 'trial'), NULLIF(v_sub.plan, 'trial'), 'basic');
  v_base := CASE WHEN v_sub.status = 'active' AND v_sub.due_date > v_hoje THEN v_sub.due_date ELSE v_hoje END;

  INSERT INTO saas_subscriptions (store_id, plan, status, amount, paid_at, due_date, owner_name, owner_email)
  VALUES (p_store_id, v_plano, 'active', p_valor, now(), (v_base + interval '1 month')::date,
          COALESCE(v_sub.owner_name, v_loja.company_name, 'Cliente'),
          COALESCE(v_sub.owner_email, 'sem-email@speedseekos.com.br'));

  UPDATE store_settings
     SET active = true,
         plan = CASE WHEN plan = 'trial' THEN v_plano ELSE plan END,
         updated_at = now()
   WHERE id = p_store_id;

  RETURN _situacao_loja_calc(p_store_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_liberar_loja(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_bloquear_loja(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_registrar_pagamento(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_liberar_loja(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloquear_loja(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_registrar_pagamento(uuid, numeric) TO authenticated;
