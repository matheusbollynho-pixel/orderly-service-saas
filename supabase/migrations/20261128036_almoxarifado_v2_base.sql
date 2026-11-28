-- Almoxarifado v2 (parte 1): de onde sai cada item da OS, fração de embalagem e quem retirou.
-- Só vale para loja com almoxarifado ligado (usa_almoxarifado). Loja sem almoxarifado: nada muda (tudo sai da loja).
--
-- Produto:
--   uso = 'venda' (sai da loja) | 'interno' (sai do almoxarifado) | 'ambos' (padrão: sai do almoxarifado, como era)
--   conteudo_qtd + conteudo_unidade = o que tem numa embalagem (lata = 300 ml, rolo = 20 m) para usar parte na OS
-- Item da OS:
--   origem = 'loja' | 'almox' escolhido na hora (vazio = segue o uso do produto)
--   retirado_por = quem pegou o material (vai para a movimentação do estoque)
-- Movimentação: retirado_por (separado de feito_por, que é quem lançou)
-- Junto: a devolução de item tirado da OS passa a gravar o preço (o lucro das peças descontava a venda sem o valor).

ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS uso text NOT NULL DEFAULT 'ambos'
  CHECK (uso IN ('venda', 'interno', 'ambos'));
ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS conteudo_qtd numeric(12,3)
  CHECK (conteudo_qtd IS NULL OR conteudo_qtd > 0);
ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS conteudo_unidade text
  CHECK (conteudo_unidade IS NULL OR conteudo_unidade IN ('ml', 'l', 'g', 'kg', 'cm', 'm', 'un'));

ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS origem text CHECK (origem IS NULL OR origem IN ('loja', 'almox'));
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS retirado_por text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS retirado_por text;

-- De onde sai um item da OS: loja sem almoxarifado = sempre loja; com almoxarifado = escolha da OS,
-- senão o uso do produto ('venda' = loja; 'interno' e 'ambos' = almoxarifado, como era antes).
CREATE OR REPLACE FUNCTION public.fn_local_item_os(p_store uuid, p_produto uuid, p_origem text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM store_settings WHERE id = p_store AND usa_almoxarifado) THEN 'loja'
    WHEN p_origem IN ('loja', 'almox') THEN p_origem
    WHEN (SELECT uso FROM inventory_products WHERE id = p_produto) = 'venda' THEN 'loja'
    ELSE 'almox'
  END;
$function$;
REVOKE ALL ON FUNCTION public.fn_local_item_os(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Peça lançada na OS: sai de onde foi escolhido (ou do padrão do produto)
CREATE OR REPLACE FUNCTION public.fn_auto_deduct_stock_on_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.is_service IS NULL OR NEW.is_service = false) THEN
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_cost, unit_price, order_id, material_id, notes, local, retirado_por)
    VALUES (NEW.store_id, NEW.product_id, 'saida_os', COALESCE(NEW.quantidade::NUMERIC, 1), NULL, NEW.valor, NEW.order_id, NEW.id,
            'Baixa automática via OS', public.fn_local_item_os(NEW.store_id, NEW.product_id, NEW.origem), NEW.retirado_por);
  END IF;
  RETURN NEW;
END;
$function$;

-- Peça removida da OS: volta para o MESMO lugar de onde saiu, agora com o preço da saída
CREATE OR REPLACE FUNCTION public.fn_restore_stock_on_material_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_local TEXT;
BEGIN
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    SELECT m.local INTO v_local
      FROM inventory_movements m
     WHERE m.order_id = OLD.order_id
       AND m.product_id = OLD.product_id
       AND m.type = 'saida_os'
     ORDER BY m.created_at DESC
     LIMIT 1;

    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, order_id, material_id, notes, local)
    VALUES (
      OLD.store_id,
      OLD.product_id,
      'devolucao',
      COALESCE(OLD.quantidade::NUMERIC, 1),
      OLD.valor,
      OLD.order_id,
      NULL, -- material já foi deletado, não pode referenciar (violaria a FK)
      'Devolução automática — material removido da OS',
      COALESCE(v_local, 'loja')
    );
  END IF;
  RETURN OLD;
END;
$function$;

-- Item da OS alterado: mesma regra de antes; quando não há baixa anterior ou o produto foi trocado,
-- o lugar segue a escolha do item / o uso do produto (antes era sempre o padrão da loja).
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
      v_local := public.fn_local_item_os(NEW.store_id, NEW.product_id, NEW.origem);
    END IF;

    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, order_id, material_id, notes, local, retirado_por)
    VALUES (NEW.store_id, NEW.product_id,
            CASE WHEN v_diff > 0 THEN 'saida_os' ELSE 'devolucao' END,
            abs(v_diff), NEW.valor, NEW.order_id, NEW.id,
            'Ajuste automático — quantidade do item da OS alterada', v_local,
            CASE WHEN v_diff > 0 THEN NEW.retirado_por END);
    RETURN NEW;
  END IF;

  -- Trocou o produto: devolve o antigo e desconta o novo
  IF v_old_qtd > 0 THEN
    SELECT m.local INTO v_local
      FROM inventory_movements m
     WHERE m.order_id = OLD.order_id AND m.product_id = OLD.product_id AND m.type = 'saida_os'
     ORDER BY m.created_at DESC LIMIT 1;
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, order_id, material_id, notes, local)
    VALUES (OLD.store_id, OLD.product_id, 'devolucao', v_old_qtd, OLD.valor, OLD.order_id, NEW.id,
            'Devolução automática — produto do item da OS trocado', COALESCE(v_local, 'loja'));
  END IF;
  IF v_new_qtd > 0 THEN
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, order_id, material_id, notes, local, retirado_por)
    VALUES (NEW.store_id, NEW.product_id, 'saida_os', v_new_qtd, NEW.valor, NEW.order_id, NEW.id,
            'Baixa automática via OS (produto trocado)', public.fn_local_item_os(NEW.store_id, NEW.product_id, NEW.origem), NEW.retirado_por);
  END IF;
  RETURN NEW;
END;
$function$;

-- Conferência: deve voltar 3 linhas com usa_local = true
SELECT p.proname, position('fn_local_item_os' in pg_get_functiondef(p.oid)) > 0 OR p.proname = 'fn_restore_stock_on_material_delete' AS usa_local
  FROM pg_proc p
 WHERE p.proname IN ('fn_auto_deduct_stock_on_material', 'fn_stock_on_material_update', 'fn_restore_stock_on_material_delete');
