-- Controle de estoque: cada movimentação grava QUEM fez (login + e-mail).
-- Vale para tudo: transferência, entrada, ajuste e a baixa automática quando a
-- peça é lançada na OS (os gatilhos rodam com o login de quem está usando).
-- Movimentação feita por tarefa automática (sem login) fica sem nome = "sistema".
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS feito_por TEXT;

ALTER TABLE inventory_movements
  ALTER COLUMN created_by SET DEFAULT auth.uid();

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
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_movimentacao_quem_fez() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_movimentacao_quem_fez ON inventory_movements;
CREATE TRIGGER trg_movimentacao_quem_fez
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.fn_movimentacao_quem_fez();
