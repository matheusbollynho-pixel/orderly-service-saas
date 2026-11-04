-- Teste da regra de bloqueio (situacao_loja + comandos do SuperAdmin).
-- Cria uma loja FALSA, testa tudo e no fim dá RAISE EXCEPTION de propósito:
-- isso desfaz tudo — nada fica gravado. O resultado aparece na mensagem de erro.
-- Rodar no SQL Editor DEPOIS da migration 20261103001.
DO $$
DECLARE
  v_loja  uuid;
  v_admin uuid;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_r     jsonb;
  v_log   text := '';
  v_ok    int := 0;
  v_falha int := 0;

BEGIN
  SELECT user_id INTO v_admin FROM super_admins LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Nenhum super admin cadastrado'; END IF;

  INSERT INTO store_settings (company_name, plan, active)
  VALUES ('TESTE-BLOQUEIO-APAGAR', 'basic', true) RETURNING id INTO v_loja;

  -- 1) sem assinatura
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'liberada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 1 sem assinatura: ' || v_r; END IF;

  -- 2) assinatura em dia (+10)
  INSERT INTO saas_subscriptions (store_id, plan, status, due_date, amount, owner_name, owner_email, created_at)
  VALUES (v_loja, 'basic', 'active', v_hoje + 10, 79, 'Teste', 'teste@teste', now() - interval '10 days');
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'liberada' AND v_r->>'motivo' = 'em_dia' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 2 em dia: ' || v_r; END IF;

  -- 3) vence em 3 dias -> aviso
  UPDATE saas_subscriptions SET due_date = v_hoje + 3 WHERE store_id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'aviso' AND v_r->>'motivo' = 'vencendo' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 3 vencendo: ' || v_r; END IF;

  -- 4) venceu há 3 dias -> ainda aviso (tolerância)
  UPDATE saas_subscriptions SET due_date = v_hoje - 3 WHERE store_id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'aviso' AND v_r->>'motivo' = 'vencida_tolerancia' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 4 tolerância: ' || v_r; END IF;

  -- 5) venceu há 4 dias -> bloqueada MESMO com status ainda 'active' (sem depender do cron)
  UPDATE saas_subscriptions SET due_date = v_hoje - 4 WHERE store_id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'bloqueada' AND v_r->>'motivo' = 'vencida' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 5 vencida: ' || v_r; END IF;

  -- 6) cancelada / overdue / pending
  UPDATE saas_subscriptions SET status = 'cancelled', due_date = v_hoje + 10 WHERE store_id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'bloqueada' AND v_r->>'motivo' = 'cancelada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 6a cancelada: ' || v_r; END IF;
  UPDATE saas_subscriptions SET status = 'overdue' WHERE store_id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'bloqueada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 6b overdue: ' || v_r; END IF;
  UPDATE saas_subscriptions SET status = 'pending' WHERE store_id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'liberada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 6c pending: ' || v_r; END IF;

  -- 7) em dia mas desativada pelo admin -> bloqueada
  UPDATE saas_subscriptions SET status = 'active', due_date = v_hoje + 10 WHERE store_id = v_loja;
  UPDATE store_settings SET active = false WHERE id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'bloqueada' AND v_r->>'motivo' = 'desativada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 7 desativada: ' || v_r; END IF;
  UPDATE store_settings SET active = true WHERE id = v_loja;

  -- 8) teste grátis: 10 dias / 2 dias / acabou
  DELETE FROM saas_subscriptions WHERE store_id = v_loja;
  UPDATE store_settings SET plan = 'trial', trial_ends_at = now() + interval '10 days' WHERE id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'liberada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 8a teste 10d: ' || v_r; END IF;
  UPDATE store_settings SET trial_ends_at = now() + interval '2 days' WHERE id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'aviso' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 8b teste 2d: ' || v_r; END IF;
  UPDATE store_settings SET trial_ends_at = now() - interval '1 hour' WHERE id = v_loja;
  v_r := _situacao_loja_calc(v_loja);
  IF v_r->>'situacao' = 'bloqueada' AND v_r->>'motivo' = 'teste_acabou' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 8c teste acabou: ' || v_r; END IF;

  -- ---- Comandos do SuperAdmin, logado como super admin ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 9) liberar com data de hoje -> recusa
  BEGIN
    PERFORM admin_liberar_loja(v_loja, v_hoje);
    v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 9 aceitou liberar com data de hoje';
  EXCEPTION WHEN others THEN v_ok := v_ok + 1;
  END;

  -- 10) liberar teste vencido até +30 -> liberada e sai do trial
  v_r := admin_liberar_loja(v_loja, v_hoje + 30);
  IF v_r->>'situacao' = 'liberada' AND (SELECT plan FROM store_settings WHERE id = v_loja) <> 'trial'
     AND (SELECT due_date FROM saas_subscriptions WHERE store_id = v_loja ORDER BY created_at DESC LIMIT 1) = v_hoje + 30
  THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 10 liberar teste vencido: ' || v_r; END IF;

  -- 11) loja vencida e cancelada -> liberar resolve (não volta a travar: vencimento é futuro)
  UPDATE saas_subscriptions SET status = 'cancelled', due_date = v_hoje - 20, created_at = now() - interval '5 days' WHERE store_id = v_loja;
  UPDATE store_settings SET active = false WHERE id = v_loja;
  v_r := admin_liberar_loja(v_loja, v_hoje + 15);
  IF v_r->>'situacao' = 'liberada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 11 liberar cancelada: ' || v_r; END IF;

  -- 12) bloquear agora -> bloqueada
  v_r := admin_bloquear_loja(v_loja);
  IF v_r->>'situacao' = 'bloqueada' AND v_r->>'motivo' = 'desativada' THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 12 bloquear: ' || v_r; END IF;

  -- 13) dar baixa em loja bloqueada com vencimento futuro (+15) -> liberada, vencimento +15 +1 mês
  v_r := admin_registrar_pagamento(v_loja, 149);
  IF v_r->>'situacao' = 'liberada' AND v_r->>'vencimento' = ((v_hoje + 15) + interval '1 month')::date::text
  THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 13 baixa: ' || v_r; END IF;

  -- 14) dar baixa em loja vencida -> vencimento = hoje + 1 mês
  UPDATE saas_subscriptions SET status = 'overdue', due_date = v_hoje - 10, created_at = now() - interval '1 day' WHERE store_id = v_loja;
  v_r := admin_registrar_pagamento(v_loja, 149);
  IF v_r->>'situacao' = 'liberada' AND v_r->>'vencimento' = (v_hoje + interval '1 month')::date::text
  THEN v_ok := v_ok + 1; ELSE v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 14 baixa vencida: ' || v_r; END IF;

  -- 15) usuário comum não consegue ver outra loja nem usar comando
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM situacao_loja(v_loja);
    v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 15a estranho leu situação';
  EXCEPTION WHEN others THEN v_ok := v_ok + 1;
  END;
  BEGIN
    PERFORM admin_liberar_loja(v_loja, v_hoje + 30);
    v_falha := v_falha + 1; v_log := v_log || E'\nFALHA 15b estranho liberou';
  EXCEPTION WHEN others THEN v_ok := v_ok + 1;
  END;

  RAISE EXCEPTION 'RESULTADO: % ok, % falha(s). (Este erro é proposital: desfaz a loja de teste.)%', v_ok, v_falha, v_log;
END $$;
