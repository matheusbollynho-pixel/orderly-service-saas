-- Acesso do contador: login próprio que só LÊ as notas fiscais das lojas que liberaram.
-- O contador não é colaborador: não entra em store_members, não conta no limite do plano,
-- não vê nada da loja fora das notas (nem configurações, chaves, clientes, caixa).
-- Convidar e remover: só pela função `fiscal` (servidor), que confere se quem pede é o dono.

CREATE TABLE IF NOT EXISTS public.contador_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  email text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  convidado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz,
  UNIQUE (user_id, store_id)
);
CREATE INDEX IF NOT EXISTS contador_acessos_store_idx ON public.contador_acessos (store_id);

ALTER TABLE public.contador_acessos ENABLE ROW LEVEL SECURITY;
-- Ninguém grava pelo app (sem policy de INSERT/UPDATE/DELETE): só o servidor.
REVOKE INSERT, UPDATE, DELETE ON public.contador_acessos FROM anon, authenticated;
REVOKE ALL ON public.contador_acessos FROM anon;

-- Contador ativo desta loja? (SECURITY DEFINER: não depende da RLS da tabela)
CREATE OR REPLACE FUNCTION public.sou_contador_da_loja(p_store uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM contador_acessos
     WHERE user_id = auth.uid() AND store_id = p_store AND ativo = true
  );
$function$;
REVOKE ALL ON FUNCTION public.sou_contador_da_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sou_contador_da_loja(uuid) TO authenticated;

-- O contador lê os próprios acessos; o dono lê os da loja dele (lista na tela de configuração)
DROP POLICY IF EXISTS "contador_acessos: ler" ON public.contador_acessos;
CREATE POLICY "contador_acessos: ler" ON public.contador_acessos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.sou_dono_da_loja(store_id));

-- Leitura extra das notas e inutilizações para o contador (as regras da equipe continuam iguais)
DROP POLICY IF EXISTS "notas_fiscais: contador ler" ON public.notas_fiscais;
CREATE POLICY "notas_fiscais: contador ler" ON public.notas_fiscais FOR SELECT TO authenticated
  USING (public.sou_contador_da_loja(store_id));

DROP POLICY IF EXISTS "fiscal_inutilizacoes: contador ler" ON public.fiscal_inutilizacoes;
CREATE POLICY "fiscal_inutilizacoes: contador ler" ON public.fiscal_inutilizacoes FOR SELECT TO authenticated
  USING (public.sou_contador_da_loja(store_id));

-- Lojas que o contador atende: só nome e CNPJ (store_settings tem chaves e não pode ser aberta pra ele)
CREATE OR REPLACE FUNCTION public.contador_minhas_lojas()
RETURNS TABLE (store_id uuid, nome text, cnpj text, fiscal_ativo boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT a.store_id,
         s.company_name::text,
         (SELECT e.cnpj::text FROM fiscal_emissores e
           WHERE e.store_id = a.store_id AND e.papel = 'vendas' AND e.ativo
           ORDER BY (e.ambiente = s.fiscal_ambiente) DESC LIMIT 1),
         COALESCE(s.fiscal_ativo, false)
    FROM contador_acessos a
    JOIN store_settings s ON s.id = a.store_id
   WHERE a.user_id = auth.uid() AND a.ativo = true
   ORDER BY s.company_name;
$function$;
REVOKE ALL ON FUNCTION public.contador_minhas_lojas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contador_minhas_lojas() TO authenticated;
