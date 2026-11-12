-- Caixa a prova de ma-fe (a loja usa um login so): NADA some do caixa.
-- Erro = ESTORNO: lanca o valor contrario (com motivo) e o original fica marcado como estornado.
-- Vale para: lancamento manual, pagamento de OS (excluido ou alterado), peca paga tirada da OS, OS excluida.
-- Cancelar nota de balcao: estorna no caixa e devolve as pecas, via funcao segura que exige motivo.

ALTER TABLE cash_flow ADD COLUMN IF NOT EXISTS estorno_de uuid REFERENCES cash_flow(id);
ALTER TABLE cash_flow ADD COLUMN IF NOT EXISTS estornado_em timestamptz;
ALTER TABLE cash_flow ADD COLUMN IF NOT EXISTS estorno_motivo text;
CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_estorno_de_unico ON cash_flow (estorno_de) WHERE estorno_de IS NOT NULL;

-- ---------------------------------------------------------------- politicas do caixa: so ver e lancar
DROP POLICY IF EXISTS "cash_flow: store" ON cash_flow;
DROP POLICY IF EXISTS "cash_flow: select" ON cash_flow;
DROP POLICY IF EXISTS "cash_flow: insert" ON cash_flow;

CREATE POLICY "cash_flow: select" ON cash_flow FOR SELECT TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
CREATE POLICY "cash_flow: insert" ON cash_flow FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true)
              AND estorno_de IS NULL AND estornado_em IS NULL);

-- ---------------------------------------------------------------- pagamentos de OS: ver, lancar, alterar. Excluir so via estorno (com motivo)
DROP POLICY IF EXISTS "payments: store" ON payments;
DROP POLICY IF EXISTS "payments: select" ON payments;
DROP POLICY IF EXISTS "payments: insert" ON payments;
DROP POLICY IF EXISTS "payments: update" ON payments;

CREATE POLICY "payments: select" ON payments FOR SELECT TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
CREATE POLICY "payments: insert" ON payments FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
CREATE POLICY "payments: update" ON payments FOR UPDATE TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- ---------------------------------------------------------------- estorno (uso interno dos gatilhos/funcoes)
CREATE OR REPLACE FUNCTION estornar_cash_interno(p_id uuid, p_motivo text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v cash_flow%ROWTYPE;
  v_os uuid;
  v_novo uuid;
BEGIN
  SELECT * INTO v FROM cash_flow WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.estornado_em IS NOT NULL OR v.estorno_de IS NOT NULL THEN RETURN NULL; END IF;

  -- OS sendo excluida: o lancamento fica, so perde o vinculo com a OS
  IF v.order_id IS NOT NULL THEN SELECT id INTO v_os FROM service_orders WHERE id = v.order_id; END IF;

  INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, order_id, date, notes, created_by, estorno_de)
  VALUES (v.store_id,
          CASE WHEN v.type = 'entrada' THEN 'saida' ELSE 'entrada' END,
          v.amount,
          'Estorno: ' || v.description,
          v.category,
          v.payment_method,
          v_os,
          (now() AT TIME ZONE 'America/Fortaleza')::date,
          p_motivo,
          auth.uid(),
          v.id)
  RETURNING id INTO v_novo;

  UPDATE cash_flow
     SET estornado_em = now(), estorno_motivo = p_motivo, order_id = v_os, payment_id = NULL, material_id = NULL
   WHERE id = v.id;
  RETURN v_novo;
END $$;
REVOKE ALL ON FUNCTION estornar_cash_interno(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- estornar lancamento manual (tela do caixa)
CREATE OR REPLACE FUNCTION estornar_lancamento_caixa(p_id uuid, p_motivo text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v cash_flow%ROWTYPE;
  v_mov inventory_movements%ROWTYPE;
  v_novo uuid;
BEGIN
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno'; END IF;

  SELECT * INTO v FROM cash_flow
   WHERE id = p_id
     AND store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Lancamento nao encontrado'; END IF;
  IF v.estornado_em IS NOT NULL THEN RAISE EXCEPTION 'Esse lancamento ja foi estornado'; END IF;
  IF v.estorno_de IS NOT NULL THEN RAISE EXCEPTION 'Nao da pra estornar um estorno'; END IF;
  IF v.order_id IS NOT NULL OR v.balcao_order_id IS NOT NULL OR v.encomenda_id IS NOT NULL OR v.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esse lancamento vem de OS, nota ou encomenda: corrija por la';
  END IF;

  v_novo := estornar_cash_interno(p_id, btrim(p_motivo));

  -- Venda avulsa ligada a estoque: devolve a peca
  IF v.inventory_movement_id IS NOT NULL THEN
    SELECT * INTO v_mov FROM inventory_movements WHERE id = v.inventory_movement_id;
    IF FOUND AND v_mov.type = 'saida_venda' THEN
      INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, notes)
      VALUES (v.store_id, v_mov.product_id, 'devolucao', v_mov.quantity, v_mov.unit_price, 'Estorno de venda no caixa');
    END IF;
  END IF;

  RETURN v_novo;
END $$;
REVOKE ALL ON FUNCTION estornar_lancamento_caixa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION estornar_lancamento_caixa(uuid, text) TO authenticated;

-- ---------------------------------------------------------------- estornar pagamento de OS (sai da OS, fica no caixa como estornado)
CREATE OR REPLACE FUNCTION estornar_pagamento_os(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM payments
     WHERE id = p_id
       AND store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true)
  ) THEN RAISE EXCEPTION 'Pagamento nao encontrado'; END IF;

  PERFORM set_config('app.motivo_estorno', btrim(p_motivo), true);
  DELETE FROM payments WHERE id = p_id;  -- o gatilho estorna no caixa
END $$;
REVOKE ALL ON FUNCTION estornar_pagamento_os(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION estornar_pagamento_os(uuid, text) TO authenticated;

-- Pagamento saiu (estorno pela tela ou OS excluida): estorna em vez de apagar do caixa
CREATE OR REPLACE FUNCTION remove_payment_from_cash_flow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM cash_flow WHERE payment_id = OLD.id AND estornado_em IS NULL AND estorno_de IS NULL LOOP
    PERFORM estornar_cash_interno(r.id, coalesce(nullif(current_setting('app.motivo_estorno', true), ''), 'Pagamento removido da OS'));
  END LOOP;
  UPDATE cash_flow SET payment_id = NULL WHERE payment_id = OLD.id;
  RETURN OLD;
END $$;

-- Pagamento lancado/alterado: alterou valor, desconto, forma ou data => estorna o antigo e lanca o novo
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount NUMERIC;
  v_store_id UUID;
  r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.discount_amount IS NOT DISTINCT FROM OLD.discount_amount
       AND NEW.method IS NOT DISTINCT FROM OLD.method
       AND DATE(NEW.created_at) IS NOT DISTINCT FROM DATE(OLD.created_at)
       AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id THEN
      RETURN NEW;  -- nada que mexa no caixa mudou
    END IF;
  END IF;

  v_amount := GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0);
  v_store_id := NEW.store_id;
  IF v_store_id IS NULL THEN
    SELECT store_id INTO v_store_id FROM service_orders WHERE id = NEW.order_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT id FROM cash_flow WHERE payment_id = NEW.id AND estornado_em IS NULL AND estorno_de IS NULL LOOP
      PERFORM estornar_cash_interno(r.id, 'Pagamento alterado na OS');
    END LOOP;
  END IF;

  IF v_amount > 0 AND v_store_id IS NOT NULL THEN
    INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, order_id, payment_id, date)
    SELECT v_store_id,
           'entrada',
           v_amount,
           'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
             CASE WHEN COALESCE(NEW.discount_amount, 0) > 0
               THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
               ELSE '' END,
           'Ordem de Servi' || U&'\00E7' || 'o',
           NEW.method,
           NEW.order_id,
           NEW.id,
           DATE(NEW.created_at)
      FROM service_orders so
     WHERE so.id = NEW.order_id;
  END IF;

  RETURN NEW;
END $$;

-- Peca/servico pago tirado da OS: estorna em vez de apagar do caixa
CREATE OR REPLACE FUNCTION delete_material_from_cash_flow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM cash_flow
     WHERE estornado_em IS NULL AND estorno_de IS NULL AND type = 'entrada'
       AND (material_id = OLD.id
            OR (OLD.paid_at IS NOT NULL
                AND order_id = OLD.order_id
                AND description LIKE (OLD.descricao || '%')
                AND date = OLD.paid_at::date))
  LOOP
    PERFORM estornar_cash_interno(r.id, 'Item removido da OS');
  END LOOP;
  RETURN OLD;
END $$;

-- ---------------------------------------------------------------- cancelar nota de balcao: estorna no caixa e devolve as pecas
CREATE OR REPLACE FUNCTION cancelar_nota_balcao(p_order_id uuid, p_motivo text, p_obs text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v balcao_orders%ROWTYPE;
  r record;
  m inventory_movements%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Selecione o motivo do cancelamento'; END IF;

  SELECT * INTO v FROM balcao_orders
   WHERE id = p_order_id
     AND store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nota nao encontrada'; END IF;
  IF v.status = 'cancelada' THEN RAISE EXCEPTION 'Nota ja cancelada'; END IF;

  IF v.status = 'finalizada' THEN
    -- Caixa: estorna (nao apaga)
    FOR r IN SELECT id FROM cash_flow
              WHERE balcao_order_id = p_order_id AND store_id = v.store_id
                AND estornado_em IS NULL AND estorno_de IS NULL LOOP
      PERFORM estornar_cash_interno(r.id, 'Nota cancelada: ' || btrim(p_motivo));
    END LOOP;
    -- Estoque: devolve as pecas que a nota baixou
    FOR m IN SELECT * FROM inventory_movements
              WHERE balcao_order_id = p_order_id AND type = 'saida_balcao' LOOP
      INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, notes, balcao_order_id)
      VALUES (v.store_id, m.product_id, 'devolucao', m.quantity, m.unit_price, 'Nota de balcao cancelada', p_order_id);
    END LOOP;
  END IF;

  UPDATE balcao_orders
     SET status = 'cancelada', cancel_reason = btrim(p_motivo), cancel_notes = nullif(btrim(coalesce(p_obs, '')), ''), updated_at = now()
   WHERE id = p_order_id;
END $$;
REVOKE ALL ON FUNCTION cancelar_nota_balcao(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_nota_balcao(uuid, text, text) TO authenticated;
