-- Defeito antigo: mudar a quantidade de um item já lançado na OS não mexia no
-- estoque (só havia gatilho ao inserir e ao apagar o item). Agora, ao alterar:
--   * aumentou a quantidade  -> desconta a diferença;
--   * diminuiu               -> devolve a diferença;
--   * marcou como serviço    -> devolve tudo (serviço não sai do estoque);
--   * desmarcou serviço      -> desconta;
--   * trocou o produto       -> devolve o antigo e desconta o novo.
-- A diferença usa o MESMO lugar (loja/almoxarifado) da baixa original desse
-- produto nessa OS; sem baixa anterior, segue a configuração da loja.
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

CREATE OR REPLACE FUNCTION public.fn_stock_on_material_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old_qtd NUMERIC := 0;
  v_new_qtd NUMERIC := 0;
  v_diff    NUMERIC;
  v_local   TEXT;
BEGIN
  -- Quantidade que "conta" no estoque: só item ligado a produto e que não é serviço
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    v_old_qtd := CASE WHEN trim(OLD.quantidade) ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(trim(OLD.quantidade), ',', '.')::NUMERIC ELSE 1 END;
  END IF;
  IF NEW.product_id IS NOT NULL AND (NEW.is_service IS NULL OR NEW.is_service = false) THEN
    v_new_qtd := CASE WHEN trim(NEW.quantidade) ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(trim(NEW.quantidade), ',', '.')::NUMERIC ELSE 1 END;
  END IF;

  IF OLD.product_id IS NOT DISTINCT FROM NEW.product_id THEN
    v_diff := v_new_qtd - v_old_qtd;
    IF v_diff = 0 OR NEW.product_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT m.local INTO v_local
      FROM inventory_movements m
     WHERE m.order_id = NEW.order_id AND m.product_id = NEW.product_id AND m.type = 'saida_os'
     ORDER BY m.created_at DESC LIMIT 1;
    IF v_local IS NULL THEN
      v_local := CASE WHEN EXISTS (SELECT 1 FROM store_settings WHERE id = NEW.store_id AND usa_almoxarifado)
                      THEN 'almox' ELSE 'loja' END;
    END IF;

    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, order_id, material_id, notes, local)
    VALUES (NEW.store_id, NEW.product_id,
            CASE WHEN v_diff > 0 THEN 'saida_os' ELSE 'devolucao' END,
            abs(v_diff), NEW.valor, NEW.order_id, NEW.id,
            'Ajuste automático — quantidade do item da OS alterada', v_local);
    RETURN NEW;
  END IF;

  -- Trocou o produto: devolve o antigo e desconta o novo
  IF v_old_qtd > 0 THEN
    SELECT m.local INTO v_local
      FROM inventory_movements m
     WHERE m.order_id = OLD.order_id AND m.product_id = OLD.product_id AND m.type = 'saida_os'
     ORDER BY m.created_at DESC LIMIT 1;
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, order_id, material_id, notes, local)
    VALUES (OLD.store_id, OLD.product_id, 'devolucao', v_old_qtd, OLD.order_id, NEW.id,
            'Devolução automática — produto do item da OS trocado', COALESCE(v_local, 'loja'));
  END IF;
  IF v_new_qtd > 0 THEN
    v_local := CASE WHEN EXISTS (SELECT 1 FROM store_settings WHERE id = NEW.store_id AND usa_almoxarifado)
                    THEN 'almox' ELSE 'loja' END;
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, order_id, material_id, notes, local)
    VALUES (NEW.store_id, NEW.product_id, 'saida_os', v_new_qtd, NEW.valor, NEW.order_id, NEW.id,
            'Baixa automática via OS (produto trocado)', v_local);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_stock_on_material_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stock_on_material_update ON materials;
CREATE TRIGGER trg_stock_on_material_update
AFTER UPDATE OF quantidade, product_id, is_service ON materials
FOR EACH ROW EXECUTE FUNCTION public.fn_stock_on_material_update();
