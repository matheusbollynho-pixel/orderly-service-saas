-- Almoxarifado (estoque de uso interno, ex.: estofaria) + dados fiscais do produto.
--
-- Tudo DESLIGADO por padrão: só muda algo na loja que ativar
-- store_settings.usa_almoxarifado. Lojas sem almoxarifado continuam exatamente
-- como antes (todas as movimentações seguem no local 'loja').
--
-- Base: versões das funções que estavam NO AR em 23/11/2026 (lidas do banco),
-- não as do repositório — ex.: 'ajuste' define o saldo exato.
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

-- 1. Liga/desliga por loja
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS usa_almoxarifado BOOLEAN NOT NULL DEFAULT false;

-- 2. Saldo do almoxarifado + dados fiscais (opcionais; o XML do fornecedor preenche)
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS stock_almox   NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ncm           TEXT,
  ADD COLUMN IF NOT EXISTS cest          TEXT,
  ADD COLUMN IF NOT EXISTS origem_fiscal SMALLINT CHECK (origem_fiscal BETWEEN 0 AND 8),
  ADD COLUMN IF NOT EXISTS csosn         TEXT,
  ADD COLUMN IF NOT EXISTS cfop          TEXT;

-- 3. Cada movimentação diz de qual lugar mexe
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS local TEXT NOT NULL DEFAULT 'loja' CHECK (local IN ('loja', 'almox'));

-- 4. Tipos novos: transferência loja -> almoxarifado e almoxarifado -> loja
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.inventory_movements'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%entrada_manual%'
  LOOP
    EXECUTE format('ALTER TABLE inventory_movements DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('entrada_manual', 'saida_os', 'saida_venda', 'saida_balcao', 'ajuste', 'devolucao',
                  'transf_para_almox', 'transf_para_loja'));

-- 5. Atualiza o saldo certo conforme o local (loja = stock_current, como sempre)
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
    ELSIF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao') THEN
      UPDATE inventory_products SET stock_almox = stock_almox - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    ELSIF NEW.type = 'ajuste' THEN
      UPDATE inventory_products SET stock_almox = NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Loja: igual ao que estava no ar
  IF NEW.type IN ('entrada_manual', 'devolucao') THEN
    UPDATE inventory_products SET stock_current = stock_current + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao') THEN
    UPDATE inventory_products SET stock_current = stock_current - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE inventory_products SET stock_current = NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. Peça lançada na OS: sai do almoxarifado se a loja usa almoxarifado
CREATE OR REPLACE FUNCTION public.fn_auto_deduct_stock_on_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_local TEXT := 'loja';
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.is_service IS NULL OR NEW.is_service = false) THEN
    IF EXISTS (SELECT 1 FROM store_settings WHERE id = NEW.store_id AND usa_almoxarifado) THEN
      v_local := 'almox';
    END IF;
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_cost, unit_price, order_id, material_id, notes, local)
    VALUES (NEW.store_id, NEW.product_id, 'saida_os', COALESCE(NEW.quantidade::NUMERIC, 1), NULL, NEW.valor, NEW.order_id, NEW.id,
            'Baixa automática via OS', v_local);
  END IF;
  RETURN NEW;
END;
$function$;

-- 7. Peça removida da OS: volta para o MESMO lugar de onde saiu.
--    (Quando este gatilho roda, o banco já limpou o material_id da baixa —
--    por isso procura a baixa pela OS + produto.)
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

    INSERT INTO inventory_movements (store_id, product_id, type, quantity, order_id, material_id, notes, local)
    VALUES (
      OLD.store_id,
      OLD.product_id,
      'devolucao',
      COALESCE(OLD.quantidade::NUMERIC, 1),
      OLD.order_id,
      NULL, -- material já foi deletado, não pode referenciar (violaria a FK)
      'Devolução automática — material removido da OS',
      COALESCE(v_local, 'loja')
    );
  END IF;
  RETURN OLD;
END;
$function$;
