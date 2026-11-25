-- Módulo fiscal: chaves da Spedy CRIPTOGRAFADAS no Supabase Vault (antes: texto aberto em fiscal_chaves.api_key).
-- Só o servidor (service role) lê ou grava, pelas duas funções abaixo. Nem o dono da loja nem o app acessam.
-- A chave da EMPRESA PRINCIPAL da conta Spedy (que manda em todas as empresas) NÃO fica no banco:
-- fica como segredo da função (SPEDY_OWNER_KEY_SANDBOX / SPEDY_OWNER_KEY_PRODUCAO) e o emissor marca usa_chave_principal.
CREATE EXTENSION IF NOT EXISTS supabase_vault;

ALTER TABLE public.fiscal_chaves ADD COLUMN IF NOT EXISTS segredo_id uuid;
ALTER TABLE public.fiscal_chaves ALTER COLUMN api_key DROP NOT NULL;
ALTER TABLE public.fiscal_emissores ADD COLUMN IF NOT EXISTS usa_chave_principal boolean NOT NULL DEFAULT false;

-- Grava/troca a chave de um emissor (cria ou atualiza o segredo no Vault; nunca deixa texto aberto)
CREATE OR REPLACE FUNCTION public.fiscal_guardar_chave(p_emissor uuid, p_chave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_id uuid;
BEGIN
  IF coalesce(trim(p_chave), '') = '' THEN RAISE EXCEPTION 'Chave vazia'; END IF;
  SELECT segredo_id INTO v_id FROM public.fiscal_chaves WHERE emissor_id = p_emissor;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_chave, 'fiscal_emissor_' || p_emissor::text || '_' || extract(epoch FROM clock_timestamp())::bigint, 'Chave Spedy do emissor fiscal');
  ELSE
    PERFORM vault.update_secret(v_id, p_chave);
  END IF;
  INSERT INTO public.fiscal_chaves (emissor_id, segredo_id, api_key) VALUES (p_emissor, v_id, NULL)
  ON CONFLICT (emissor_id) DO UPDATE SET segredo_id = EXCLUDED.segredo_id, api_key = NULL;
END $$;

-- Lê a chave de um emissor (descriptografa do Vault)
CREATE OR REPLACE FUNCTION public.fiscal_ler_chave(p_emissor uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT ds.decrypted_secret
    FROM public.fiscal_chaves fc
    JOIN vault.decrypted_secrets ds ON ds.id = fc.segredo_id
   WHERE fc.emissor_id = p_emissor;
$$;

-- Só o servidor executa (funções nascem liberadas para todos: tira de todo mundo e dá só ao service_role)
REVOKE ALL ON FUNCTION public.fiscal_guardar_chave(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiscal_ler_chave(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_guardar_chave(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_ler_chave(uuid) TO service_role;

-- Migra as chaves que já existem (texto aberto -> Vault) e apaga o texto aberto
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT emissor_id, api_key FROM public.fiscal_chaves WHERE api_key IS NOT NULL AND segredo_id IS NULL LOOP
    PERFORM public.fiscal_guardar_chave(r.emissor_id, r.api_key);
  END LOOP;
END $$;

-- Daqui pra frente, texto aberto é proibido nesta tabela
ALTER TABLE public.fiscal_chaves DROP CONSTRAINT IF EXISTS fiscal_chaves_sem_texto_aberto;
ALTER TABLE public.fiscal_chaves ADD CONSTRAINT fiscal_chaves_sem_texto_aberto CHECK (api_key IS NULL);
