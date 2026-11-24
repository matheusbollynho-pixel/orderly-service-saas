-- Relatório do almoxarifado: perda/sobra na contagem.
-- O ajuste ("contei e tem X") só guardava o valor novo. Agora guarda também
-- quanto o sistema tinha antes, para calcular a diferença (perda ou sobra).
-- Mesma função que já grava "quem fez" (BEFORE INSERT em inventory_movements).
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(10,3);

CREATE OR REPLACE FUNCTION public.fn_movimentacao_quem_fez()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  IF NEW.feito_por IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT u.email INTO NEW.feito_por FROM auth.users u WHERE u.id = NEW.created_by;
  END IF;

  -- Ajuste: guarda o saldo de antes (do lugar ajustado) para mostrar perda/sobra
  IF NEW.type = 'ajuste' AND NEW.saldo_anterior IS NULL THEN
    SELECT CASE WHEN NEW.local = 'almox' THEN p.stock_almox ELSE p.stock_current END
      INTO NEW.saldo_anterior
      FROM inventory_products p
     WHERE p.id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$function$;
