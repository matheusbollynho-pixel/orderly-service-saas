-- Login ligado a um colaborador + permissão por ação "editar/remover itens da OS".
-- Pedido da Rei (25/11): 1 conta "Gerente" no PC (compartilhada, acesso a tudo) e cada capoteiro
-- com login no próprio celular só para ADICIONAR itens; tirar/alterar item só o gerente.
-- Nada muda para quem já usa: permissão ausente = liberado; login sem colaborador = como hoje.

-- 1) Quem é esta conta (opcional). Conta compartilhada fica sem colaborador.
ALTER TABLE public.store_members
  ADD COLUMN IF NOT EXISTS colaborador_tipo text,
  ADD COLUMN IF NOT EXISTS colaborador_id uuid;

ALTER TABLE public.store_members DROP CONSTRAINT IF EXISTS store_members_colaborador_tipo_check;
ALTER TABLE public.store_members
  ADD CONSTRAINT store_members_colaborador_tipo_check
  CHECK (colaborador_tipo IS NULL OR colaborador_tipo IN ('mecanico', 'atendente'));

-- 2) Pode fazer a ação? Dono sempre pode; sem login (sistema, cron, service role) pode;
--    permissão não marcada = liberado (padrão de quem já usa).
CREATE OR REPLACE FUNCTION public.pode_acao(acao text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  m record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  SELECT role, permissions INTO m
    FROM store_members
   WHERE user_id = auth.uid() AND active = true
   LIMIT 1;
  IF NOT FOUND OR m.role = 'owner' THEN
    RETURN true;
  END IF;
  RETURN COALESCE((m.permissions ->> acao)::boolean, true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pode_acao(text) TO authenticated;

-- 3) Itens da OS: remover ou mudar descrição/quantidade/valor/tipo/produto exige a permissão.
--    Mecânico do item, pagamento (paid_at) e acerto continuam livres.
CREATE OR REPLACE FUNCTION public.fn_materials_permissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT public.pode_acao('editar_itens_os') THEN
      RAISE EXCEPTION 'Sem permissão para remover itens da OS. Peça ao gerente.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF (NEW.descricao IS DISTINCT FROM OLD.descricao
      OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
      OR NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.is_service IS DISTINCT FROM OLD.is_service
      OR NEW.product_id IS DISTINCT FROM OLD.product_id)
     AND NOT public.pode_acao('editar_itens_os') THEN
    RAISE EXCEPTION 'Sem permissão para alterar itens da OS. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_materials_permissao ON public.materials;
CREATE TRIGGER trg_materials_permissao
  BEFORE UPDATE OR DELETE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.fn_materials_permissao();

-- 4) Movimentação de estoque: login ligado a um colaborador grava o NOME dele (antes: e-mail).
--    Reescrita a partir da versão no ar (20261124002); só muda o preenchimento de feito_por.
CREATE OR REPLACE FUNCTION public.fn_movimentacao_quem_fez()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  sm record;
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  IF NEW.feito_por IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT colaborador_tipo, colaborador_id INTO sm
      FROM store_members
     WHERE user_id = NEW.created_by AND active = true
     LIMIT 1;
    IF FOUND AND sm.colaborador_tipo = 'mecanico' THEN
      SELECT name INTO NEW.feito_por FROM mechanics WHERE id = sm.colaborador_id;
    ELSIF FOUND AND sm.colaborador_tipo = 'atendente' THEN
      SELECT name INTO NEW.feito_por FROM staff_members WHERE id = sm.colaborador_id;
    END IF;
    IF NEW.feito_por IS NULL THEN
      SELECT u.email INTO NEW.feito_por FROM auth.users u WHERE u.id = NEW.created_by;
    END IF;
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
