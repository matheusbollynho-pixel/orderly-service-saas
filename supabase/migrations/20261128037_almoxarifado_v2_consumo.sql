-- Almoxarifado v2 (parte 2): baixa sem OS (consumo interno) e estoque mínimo próprio do almoxarifado.
-- consumo_interno = saída do almoxarifado que não é de nenhuma moto (uso geral da oficina, limpeza,
-- perda/quebra, vencido). Não é venda: não gera caixa, não entra no lucro das peças nem na curva ABC.
-- Motivo vai em notes; quem retirou em retirado_por (coluna da parte 1).
-- As duas funções abaixo são as que estão no ar, só com 'consumo_interno' incluído nas saídas.

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('entrada_manual', 'saida_os', 'saida_venda', 'saida_balcao', 'ajuste', 'devolucao',
                  'transf_para_almox', 'transf_para_loja', 'consumo_interno'));

ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS stock_minimo_almox numeric(10,3) NOT NULL DEFAULT 0
  CHECK (stock_minimo_almox >= 0);

-- Saldo: consumo interno tira do lugar informado (almoxarifado)
CREATE OR REPLACE FUNCTION public.fn_update_stock_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Transferências mexem nos dois saldos
  IF NEW.type = 'transf_para_almox' THEN
    UPDATE inventory_products
       SET stock_current = stock_current - NEW.quantity,
           stock_almox   = stock_almox   + NEW.quantity,
           updated_at = now()
     WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF NEW.type = 'transf_para_loja' THEN
    UPDATE inventory_products
       SET stock_current = stock_current + NEW.quantity,
           stock_almox   = stock_almox   - NEW.quantity,
           updated_at = now()
     WHERE id = NEW.product_id;
    RETURN NEW;
  END IF;

  IF NEW.local = 'almox' THEN
    IF NEW.type IN ('entrada_manual', 'devolucao') THEN
      UPDATE inventory_products SET stock_almox = stock_almox + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    ELSIF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao', 'consumo_interno') THEN
      UPDATE inventory_products SET stock_almox = stock_almox - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    ELSIF NEW.type = 'ajuste' THEN
      UPDATE inventory_products SET stock_almox = NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Loja: igual ao que estava no ar
  IF NEW.type IN ('entrada_manual', 'devolucao') THEN
    UPDATE inventory_products SET stock_current = stock_current + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao', 'consumo_interno') THEN
    UPDATE inventory_products SET stock_current = stock_current - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE inventory_products SET stock_current = NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Lotes e validade: consumo interno gasta primeiro o lote que vence antes
CREATE OR REPLACE FUNCTION public.fn_lotes_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ctrl   BOOLEAN;
  v_origem TEXT;
  v_rest   NUMERIC;
  v_take   NUMERIC;
  r        RECORD;
BEGIN
  SELECT controla_validade INTO v_ctrl FROM inventory_products WHERE id = NEW.product_id;
  IF NOT COALESCE(v_ctrl, false) THEN
    RETURN NEW;
  END IF;

  -- Entrada: cria/soma o lote informado (sem dados = "sem lote")
  IF NEW.type = 'entrada_manual' THEN
    PERFORM fn_lote_somar(NEW.store_id, NEW.product_id, COALESCE(NEW.local, 'loja'), NEW.lote, NEW.fabricacao, NEW.validade, NEW.quantity);
    RETURN NEW;
  END IF;

  -- Saídas, transferências e ajuste para menos: tira do lote que vence antes
  IF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao', 'consumo_interno', 'transf_para_almox', 'transf_para_loja')
     OR (NEW.type = 'ajuste' AND NEW.saldo_anterior IS NOT NULL AND NEW.quantity < NEW.saldo_anterior) THEN

    v_origem := CASE NEW.type
                  WHEN 'transf_para_almox' THEN 'loja'
                  WHEN 'transf_para_loja' THEN 'almox'
                  ELSE COALESCE(NEW.local, 'loja')
                END;
    v_rest := CASE WHEN NEW.type = 'ajuste' THEN NEW.saldo_anterior - NEW.quantity ELSE NEW.quantity END;

    FOR r IN
      SELECT * FROM inventory_lotes
       WHERE product_id = NEW.product_id AND local = v_origem AND quantidade > 0
       ORDER BY validade NULLS LAST, created_at
       FOR UPDATE
    LOOP
      EXIT WHEN v_rest <= 0;
      v_take := LEAST(r.quantidade, v_rest);

      UPDATE inventory_lotes SET quantidade = quantidade - v_take, updated_at = now() WHERE id = r.id;
      INSERT INTO inventory_lote_saidas (store_id, movement_id, lote_id, product_id, local, order_id, quantidade)
      VALUES (NEW.store_id, NEW.id, r.id, NEW.product_id, v_origem, NEW.order_id, v_take);

      -- Transferência: o mesmo lote chega no outro lugar
      IF NEW.type IN ('transf_para_almox', 'transf_para_loja') THEN
        PERFORM fn_lote_somar(NEW.store_id, NEW.product_id,
                              CASE WHEN v_origem = 'loja' THEN 'almox' ELSE 'loja' END,
                              r.lote, r.fabricacao, r.validade, v_take);
      END IF;

      v_rest := v_rest - v_take;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Devolução: volta para o mesmo lote de onde saiu (a saída mais recente primeiro)
  IF NEW.type = 'devolucao' THEN
    v_rest := NEW.quantity;
    FOR r IN
      SELECT s.*
        FROM inventory_lote_saidas s
        JOIN inventory_movements m ON m.id = s.movement_id
       WHERE s.product_id = NEW.product_id
         AND s.local = COALESCE(NEW.local, 'loja')
         AND s.quantidade > s.devolvido
         AND m.type IN ('saida_os', 'saida_venda', 'saida_balcao')
         AND (NEW.order_id IS NULL OR s.order_id = NEW.order_id)
       ORDER BY s.created_at DESC
       FOR UPDATE OF s
    LOOP
      EXIT WHEN v_rest <= 0;
      v_take := LEAST(r.quantidade - r.devolvido, v_rest);
      UPDATE inventory_lote_saidas SET devolvido = devolvido + v_take WHERE id = r.id;
      UPDATE inventory_lotes SET quantidade = quantidade + v_take, updated_at = now() WHERE id = r.lote_id;
      v_rest := v_rest - v_take;
    END LOOP;
    IF v_rest > 0 THEN
      PERFORM fn_lote_somar(NEW.store_id, NEW.product_id, COALESCE(NEW.local, 'loja'), NULL, NULL, NULL, v_rest);
    END IF;
    RETURN NEW;
  END IF;

  -- Ajuste para mais: a sobra entra como "sem lote"
  IF NEW.type = 'ajuste' AND NEW.saldo_anterior IS NOT NULL AND NEW.quantity > NEW.saldo_anterior THEN
    PERFORM fn_lote_somar(NEW.store_id, NEW.product_id, COALESCE(NEW.local, 'loja'), NULL, NULL, NULL, NEW.quantity - NEW.saldo_anterior);
  END IF;

  RETURN NEW;
END;
$function$;

-- Kit não tem estoque próprio: consumo interno vai nas peças do kit, não no kit
CREATE OR REPLACE FUNCTION public.fn_consumo_interno_kit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.type = 'consumo_interno' AND EXISTS (SELECT 1 FROM inventory_products WHERE id = NEW.product_id AND e_kit) THEN
    RAISE EXCEPTION 'Kit não tem estoque próprio: dê baixa nas peças do kit.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_consumo_interno_kit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_consumo_interno_kit ON public.inventory_movements;
CREATE TRIGGER trg_consumo_interno_kit BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_consumo_interno_kit();

-- Conferência: deve voltar 2 linhas com consumo = true
SELECT p.proname, position('consumo_interno' in pg_get_functiondef(p.oid)) > 0 AS consumo
  FROM pg_proc p WHERE p.proname IN ('fn_update_stock_on_movement', 'fn_lotes_on_movement');
