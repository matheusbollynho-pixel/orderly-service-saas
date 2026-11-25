-- Kit: produto que é um conjunto de outros (ex.: "Kit capa de banco" = 2 capas + 1 cola).
-- Vendeu o kit (nota, OS ou caixa) → baixa em cada peça; devolução do kit → peças voltam.
-- Estoque do kit = quantos dá para montar com as peças (atualiza sozinho). Custo = soma dos custos.
-- O preço de venda do kit o dono escolhe (a tela mostra a soma das peças).

ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS e_kit boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.kit_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL DEFAULT get_my_store_id() REFERENCES public.store_settings(id) ON DELETE CASCADE,
  kit_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  componente_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantidade numeric(12,3) NOT NULL CHECK (quantidade > 0),
  UNIQUE (kit_id, componente_id)
);
CREATE INDEX IF NOT EXISTS kit_itens_componente_idx ON public.kit_itens (componente_id);
ALTER TABLE public.kit_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kit_itens: loja" ON public.kit_itens;
CREATE POLICY "kit_itens: loja" ON public.kit_itens FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- Recalcula estoque (loja e almox) e custo do kit a partir das peças
CREATE OR REPLACE FUNCTION public.fn_kit_recalcular(p_kit uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_loja numeric; v_almox numeric; v_custo numeric; v_n int;
BEGIN
  SELECT count(*),
         min(floor(greatest(c.stock_current, 0) / k.quantidade)),
         min(floor(greatest(coalesce(c.stock_almox, 0), 0) / k.quantidade)),
         sum(coalesce(c.cost_price, 0) * k.quantidade)
    INTO v_n, v_loja, v_almox, v_custo
    FROM kit_itens k JOIN inventory_products c ON c.id = k.componente_id
   WHERE k.kit_id = p_kit;
  UPDATE inventory_products
     SET stock_current = CASE WHEN v_n > 0 THEN v_loja ELSE 0 END,
         stock_almox   = CASE WHEN v_n > 0 THEN v_almox ELSE 0 END,
         cost_price    = coalesce(round(v_custo, 2), 0),
         updated_at    = now()
   WHERE id = p_kit AND e_kit;
END;
$function$;

-- Peça do kit: mesma loja, não pode ser outro kit nem o próprio kit; o kit tem que estar marcado
CREATE OR REPLACE FUNCTION public.fn_kit_itens_valida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_kit_recalcular(OLD.kit_id);
    RETURN OLD;
  END IF;
  IF NEW.kit_id = NEW.componente_id THEN RAISE EXCEPTION 'O kit não pode ser peça dele mesmo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_products WHERE id = NEW.kit_id AND store_id = NEW.store_id AND e_kit) THEN
    RAISE EXCEPTION 'Produto do kit não encontrado (ou não está marcado como kit)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_products WHERE id = NEW.componente_id AND store_id = NEW.store_id AND NOT e_kit) THEN
    RAISE EXCEPTION 'Peça não encontrada (um kit não pode ter outro kit dentro)';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_kit_itens_valida ON public.kit_itens;
CREATE TRIGGER trg_kit_itens_valida BEFORE INSERT OR UPDATE ON public.kit_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_itens_valida();
DROP TRIGGER IF EXISTS trg_kit_itens_apagou ON public.kit_itens;
CREATE TRIGGER trg_kit_itens_apagou AFTER DELETE ON public.kit_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_itens_valida();

CREATE OR REPLACE FUNCTION public.fn_kit_itens_depois()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  PERFORM public.fn_kit_recalcular(NEW.kit_id);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_kit_itens_depois ON public.kit_itens;
CREATE TRIGGER trg_kit_itens_depois AFTER INSERT OR UPDATE ON public.kit_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_itens_depois();

-- Kit não recebe entrada, ajuste nem transferência: o estoque dele vem das peças
CREATE OR REPLACE FUNCTION public.fn_kit_movimento_valida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.type IN ('entrada_manual', 'ajuste', 'transf_para_almox', 'transf_para_loja')
     AND EXISTS (SELECT 1 FROM inventory_products WHERE id = NEW.product_id AND e_kit) THEN
    RAISE EXCEPTION 'Kit não tem estoque próprio: dê entrada ou ajuste nas peças do kit.';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_kit_movimento_valida ON public.inventory_movements;
CREATE TRIGGER trg_kit_movimento_valida BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_movimento_valida();

-- Depois de cada movimento (roda por último: nome "zz"):
--   saída/devolução de um KIT → mesma saída/devolução em cada peça (sem lançar no caixa de novo)
--   movimento de uma PEÇA → recalcula os kits que usam ela
CREATE OR REPLACE FUNCTION public.fn_kit_apos_movimento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  r record;
  v_kit inventory_products%ROWTYPE;
BEGIN
  SELECT * INTO v_kit FROM inventory_products WHERE id = NEW.product_id;
  IF v_kit.e_kit THEN
    IF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao', 'devolucao') THEN
      FOR r IN SELECT componente_id, quantidade FROM kit_itens WHERE kit_id = NEW.product_id LOOP
        INSERT INTO inventory_movements (store_id, product_id, type, local, quantity, order_id, balcao_order_id,
                                         notes, feito_por, skip_cash_flow_trigger, created_by)
        VALUES (NEW.store_id, r.componente_id, NEW.type, coalesce(NEW.local, 'loja'), NEW.quantity * r.quantidade,
                NEW.order_id, NEW.balcao_order_id, 'Kit: ' || v_kit.name, NEW.feito_por, true, NEW.created_by);
      END LOOP;
    END IF;
    PERFORM public.fn_kit_recalcular(NEW.product_id);
  ELSE
    FOR r IN SELECT DISTINCT kit_id FROM kit_itens WHERE componente_id = NEW.product_id LOOP
      PERFORM public.fn_kit_recalcular(r.kit_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_zz_kit_apos_movimento ON public.inventory_movements;
CREATE TRIGGER trg_zz_kit_apos_movimento AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_apos_movimento();

-- Custo da peça mudou (ex.: entrada por XML) → custo do kit acompanha
CREATE OR REPLACE FUNCTION public.fn_kit_custo_peca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE r record;
BEGIN
  IF NEW.cost_price IS DISTINCT FROM OLD.cost_price AND NOT NEW.e_kit THEN
    FOR r IN SELECT DISTINCT kit_id FROM kit_itens WHERE componente_id = NEW.id LOOP
      PERFORM public.fn_kit_recalcular(r.kit_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_kit_custo_peca ON public.inventory_products;
CREATE TRIGGER trg_kit_custo_peca AFTER UPDATE OF cost_price ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_custo_peca();

-- Salva o kit de uma vez: cria/atualiza o produto e troca a lista de peças.
-- p = { id (null = novo), name, code, sale_price, category, itens: [ { componente_id, quantidade } ] }
CREATE OR REPLACE FUNCTION public.salvar_kit(p jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE
  loja uuid := get_my_store_id();
  v_id uuid := nullif(p->>'id', '')::uuid;
  it jsonb;
BEGIN
  IF loja IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF coalesce(btrim(p->>'name'), '') = '' THEN RAISE EXCEPTION 'Dê um nome ao kit'; END IF;
  IF jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Coloque pelo menos uma peça no kit'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO inventory_products (store_id, code, name, unit, category, e_kit, sale_price, cost_price, stock_current, stock_minimum, active, status)
    VALUES (loja, nullif(btrim(p->>'code'), ''), btrim(p->>'name'), 'kit', nullif(btrim(p->>'category'), ''), true,
            coalesce(nullif(p->>'sale_price', '')::numeric, 0), 0, 0, 0, true, 'ativo')
    RETURNING id INTO v_id;
  ELSE
    UPDATE inventory_products SET name = btrim(p->>'name'), sale_price = coalesce(nullif(p->>'sale_price', '')::numeric, sale_price),
           category = coalesce(nullif(btrim(p->>'category'), ''), category), e_kit = true, updated_at = now()
     WHERE id = v_id AND store_id = loja;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kit não encontrado'; END IF;
    DELETE FROM kit_itens WHERE kit_id = v_id
       AND componente_id NOT IN (SELECT (x->>'componente_id')::uuid FROM jsonb_array_elements(p->'itens') x);
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p->'itens') LOOP
    INSERT INTO kit_itens (store_id, kit_id, componente_id, quantidade)
    VALUES (loja, v_id, (it->>'componente_id')::uuid, (it->>'quantidade')::numeric)
    ON CONFLICT (kit_id, componente_id) DO UPDATE SET quantidade = EXCLUDED.quantidade;
  END LOOP;
  PERFORM public.fn_kit_recalcular(v_id);
  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.salvar_kit(jsonb) TO authenticated;
