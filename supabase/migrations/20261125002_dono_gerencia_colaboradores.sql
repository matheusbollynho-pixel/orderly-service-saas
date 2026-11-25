-- Tela Colaboradores: o dono não enxergava nem conseguia alterar os colaboradores.
-- store_members só tinha "self read" (cada login vê a própria linha) e nenhuma regra de UPDATE
-- para usuário logado: "Salvar permissões" e "Remover" não davam erro mas não gravavam nada.
-- Agora: o dono LÊ a equipe da loja dele; salvar/remover passam por funções que conferem o dono.

-- Dono ativo desta loja? (SECURITY DEFINER: lê a própria tabela sem cair na RLS dela)
CREATE OR REPLACE FUNCTION public.sou_dono_da_loja(p_store uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM store_members
     WHERE user_id = auth.uid() AND store_id = p_store AND role = 'owner' AND active = true
  );
$function$;

GRANT EXECUTE ON FUNCTION public.sou_dono_da_loja(uuid) TO authenticated;

DROP POLICY IF EXISTS "store_members: dono le a equipe" ON public.store_members;
CREATE POLICY "store_members: dono le a equipe"
  ON public.store_members FOR SELECT TO authenticated
  USING (public.sou_dono_da_loja(store_id));

-- Salvar permissões e "quem usa esta conta" de um colaborador (nunca de um dono)
CREATE OR REPLACE FUNCTION public.salvar_colaborador(
  p_member_id uuid,
  p_permissions jsonb,
  p_colaborador_tipo text,
  p_colaborador_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  alvo record;
BEGIN
  SELECT id, store_id, role INTO alvo FROM store_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;
  IF NOT public.sou_dono_da_loja(alvo.store_id) THEN
    RAISE EXCEPTION 'Apenas o proprietário pode alterar colaboradores.' USING ERRCODE = '42501';
  END IF;
  IF alvo.role = 'owner' THEN
    RAISE EXCEPTION 'Não dá para alterar o proprietário.';
  END IF;

  IF p_colaborador_tipo IS NOT NULL AND p_colaborador_tipo NOT IN ('mecanico', 'atendente') THEN
    RAISE EXCEPTION 'Tipo de colaborador inválido.';
  END IF;
  -- A pessoa ligada precisa ser desta loja
  IF p_colaborador_tipo = 'mecanico' AND NOT EXISTS (SELECT 1 FROM mechanics WHERE id = p_colaborador_id AND store_id = alvo.store_id) THEN
    RAISE EXCEPTION 'Mecânico não encontrado nesta loja.';
  END IF;
  IF p_colaborador_tipo = 'atendente' AND NOT EXISTS (SELECT 1 FROM staff_members WHERE id = p_colaborador_id AND store_id = alvo.store_id) THEN
    RAISE EXCEPTION 'Atendente não encontrado nesta loja.';
  END IF;

  UPDATE store_members
     SET permissions = COALESCE(p_permissions, permissions),
         colaborador_tipo = p_colaborador_tipo,
         colaborador_id = CASE WHEN p_colaborador_tipo IS NULL THEN NULL ELSE p_colaborador_id END
   WHERE id = p_member_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.salvar_colaborador(uuid, jsonb, text, uuid) TO authenticated;

-- Remover (desativar) um colaborador da loja (nunca um dono)
CREATE OR REPLACE FUNCTION public.remover_colaborador(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  alvo record;
BEGIN
  SELECT id, store_id, role INTO alvo FROM store_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;
  IF NOT public.sou_dono_da_loja(alvo.store_id) THEN
    RAISE EXCEPTION 'Apenas o proprietário pode remover colaboradores.' USING ERRCODE = '42501';
  END IF;
  IF alvo.role = 'owner' THEN
    RAISE EXCEPTION 'Não dá para remover o proprietário.';
  END IF;
  UPDATE store_members SET active = false WHERE id = p_member_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remover_colaborador(uuid) TO authenticated;
