-- Equipe v2: um cadastro só por PESSOA (colaboradores) com dados pessoais, cargo, Pix e o que faz.
-- As tabelas antigas continuam sendo os "papéis" usados no sistema todo (OS, comissões, balcão, acertos):
--   mechanics      = faz serviço na OS (comissão de serviço/peças)
--   staff_members  = atende no balcão (comissão de venda)
-- A pessoa aponta para os papéis; nada do que já existe muda de lugar.

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  nome text NOT NULL,
  apelido text,
  cpf text,
  telefone text,
  email text,
  data_nascimento date,
  endereco text,
  cidade text,
  estado text,
  cargo text,
  data_admissao date,
  pix_tipo text,
  pix_chave text,
  observacoes text,
  foto_url text,
  ativo boolean NOT NULL DEFAULT true,
  faz_os boolean NOT NULL DEFAULT false,
  atende_balcao boolean NOT NULL DEFAULT false,
  mechanic_id uuid UNIQUE REFERENCES public.mechanics(id) ON DELETE SET NULL,
  staff_member_id uuid UNIQUE REFERENCES public.staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS colaboradores_store_idx ON public.colaboradores (store_id);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
-- Ler: quem é da loja e pode ver a Equipe (CPF/Pix não ficam abertos para todo login).
-- Gravar: só pela função salvar_pessoa_equipe (sem regra de insert/update/delete direto).
DROP POLICY IF EXISTS "colaboradores: ler equipe" ON public.colaboradores;
CREATE POLICY "colaboradores: ler equipe" ON public.colaboradores FOR SELECT TO authenticated
  USING (store_id = get_my_store_id() AND public.pode_acao('equipe'));

-- ---------------------------------------------------------------- juntar o que já existe
-- Cada mecânico vira uma pessoa; cada atendente com o MESMO nome (na mesma loja) junta nela,
-- senão vira outra pessoa. Roda uma vez (só cria o que ainda não está ligado).
DO $$
DECLARE
  m record;
  s record;
  alvo uuid;
BEGIN
  FOR m IN SELECT * FROM mechanics mm
            WHERE NOT EXISTS (SELECT 1 FROM colaboradores c WHERE c.mechanic_id = mm.id)
            ORDER BY created_at LOOP
    INSERT INTO colaboradores (store_id, nome, cargo, foto_url, ativo, faz_os, mechanic_id, created_at)
    VALUES (m.store_id, btrim(m.name), 'Mecânico', m.photo_url, COALESCE(m.active, true), true, m.id, COALESCE(m.created_at, now()));
  END LOOP;

  FOR s IN SELECT * FROM staff_members ss
            WHERE NOT EXISTS (SELECT 1 FROM colaboradores c WHERE c.staff_member_id = ss.id)
            ORDER BY created_at LOOP
    alvo := NULL;
    SELECT c.id INTO alvo FROM colaboradores c
     WHERE c.store_id = s.store_id AND c.staff_member_id IS NULL
       AND lower(btrim(c.nome)) = lower(btrim(s.name))
     ORDER BY c.created_at LIMIT 1;
    IF alvo IS NOT NULL THEN
      UPDATE colaboradores
         SET staff_member_id = s.id, atende_balcao = true,
             ativo = ativo OR COALESCE(s.active, true),
             foto_url = COALESCE(foto_url, s.photo_url),
             cargo = CASE WHEN s.role = 'dono' THEN 'Dono' ELSE cargo END
       WHERE id = alvo;
    ELSE
      INSERT INTO colaboradores (store_id, nome, cargo, foto_url, ativo, atende_balcao, staff_member_id, created_at)
      VALUES (s.store_id, btrim(s.name),
              CASE s.role WHEN 'dono' THEN 'Dono' WHEN 'balconista' THEN 'Atendente' ELSE NULL END,
              s.photo_url, COALESCE(s.active, true), true, s.id, COALESCE(s.created_at, now()));
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- quem cria papel por fora (app antigo aberto, onboarding)
-- ganha a pessoa automaticamente, para não sumir da Equipe.
CREATE OR REPLACE FUNCTION public.fn_papel_cria_pessoa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  alvo uuid;
BEGIN
  IF COALESCE(current_setting('app.equipe_rpc', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'mechanics' THEN
    SELECT id INTO alvo FROM colaboradores
     WHERE store_id = NEW.store_id AND mechanic_id IS NULL AND lower(btrim(nome)) = lower(btrim(NEW.name)) LIMIT 1;
    IF alvo IS NOT NULL THEN
      UPDATE colaboradores SET mechanic_id = NEW.id, faz_os = true WHERE id = alvo;
    ELSE
      INSERT INTO colaboradores (store_id, nome, cargo, foto_url, ativo, faz_os, mechanic_id)
      VALUES (NEW.store_id, btrim(NEW.name), 'Mecânico', NEW.photo_url, COALESCE(NEW.active, true), true, NEW.id);
    END IF;
  ELSE
    SELECT id INTO alvo FROM colaboradores
     WHERE store_id = NEW.store_id AND staff_member_id IS NULL AND lower(btrim(nome)) = lower(btrim(NEW.name)) LIMIT 1;
    IF alvo IS NOT NULL THEN
      UPDATE colaboradores SET staff_member_id = NEW.id, atende_balcao = true WHERE id = alvo;
    ELSE
      INSERT INTO colaboradores (store_id, nome, cargo, foto_url, ativo, atende_balcao, staff_member_id)
      VALUES (NEW.store_id, btrim(NEW.name), CASE NEW.role WHEN 'dono' THEN 'Dono' ELSE 'Atendente' END,
              NEW.photo_url, COALESCE(NEW.active, true), true, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mecanico_cria_pessoa ON public.mechanics;
CREATE TRIGGER trg_mecanico_cria_pessoa AFTER INSERT ON public.mechanics
  FOR EACH ROW EXECUTE FUNCTION public.fn_papel_cria_pessoa();
DROP TRIGGER IF EXISTS trg_atendente_cria_pessoa ON public.staff_members;
CREATE TRIGGER trg_atendente_cria_pessoa AFTER INSERT ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_papel_cria_pessoa();

-- ---------------------------------------------------------------- salvar (cria/edita a pessoa e acerta os papéis)
-- p: id (vazio = nova), dados pessoais, cargo, pix, ativo, faz_os + comissao_servicos/comissao_pecas,
--    atende_balcao + comissao_balcao/comissao_balcao_pecas, foto_url.
CREATE OR REPLACE FUNCTION public.salvar_pessoa_equipe(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  loja uuid := get_my_store_id();
  pid uuid := NULLIF(p->>'id', '')::uuid;
  pessoa colaboradores%ROWTYPE;
  nome_ text := btrim(COALESCE(p->>'nome', ''));
  ativo_ boolean := COALESCE((p->>'ativo')::boolean, true);
  faz_os_ boolean := COALESCE((p->>'faz_os')::boolean, false);
  balcao_ boolean := COALESCE((p->>'atende_balcao')::boolean, false);
  foto_ text := NULLIF(p->>'foto_url', '');
  novo_id uuid;
BEGIN
  IF loja IS NULL OR NOT public.pode_acao('equipe') THEN
    RAISE EXCEPTION 'Sem permissão para mexer na equipe.' USING ERRCODE = '42501';
  END IF;
  IF nome_ = '' THEN
    RAISE EXCEPTION 'Informe o nome.';
  END IF;
  PERFORM set_config('app.equipe_rpc', 'on', true);

  IF pid IS NULL THEN
    INSERT INTO colaboradores (store_id, nome) VALUES (loja, nome_) RETURNING * INTO pessoa;
  ELSE
    SELECT * INTO pessoa FROM colaboradores WHERE id = pid AND store_id = loja FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Colaborador não encontrado nesta loja.';
    END IF;
  END IF;

  UPDATE colaboradores SET
    nome = nome_,
    apelido = NULLIF(btrim(p->>'apelido'), ''),
    cpf = NULLIF(regexp_replace(COALESCE(p->>'cpf', ''), '\D', '', 'g'), ''),
    telefone = NULLIF(regexp_replace(COALESCE(p->>'telefone', ''), '\D', '', 'g'), ''),
    email = NULLIF(lower(btrim(p->>'email')), ''),
    data_nascimento = NULLIF(p->>'data_nascimento', '')::date,
    endereco = NULLIF(btrim(p->>'endereco'), ''),
    cidade = NULLIF(btrim(p->>'cidade'), ''),
    estado = NULLIF(upper(left(btrim(COALESCE(p->>'estado', '')), 2)), ''),
    cargo = NULLIF(btrim(p->>'cargo'), ''),
    data_admissao = NULLIF(p->>'data_admissao', '')::date,
    pix_tipo = NULLIF(btrim(p->>'pix_tipo'), ''),
    pix_chave = NULLIF(btrim(p->>'pix_chave'), ''),
    observacoes = NULLIF(btrim(p->>'observacoes'), ''),
    foto_url = CASE WHEN p ? 'foto_url' THEN foto_ ELSE foto_url END,
    ativo = ativo_,
    faz_os = faz_os_,
    atende_balcao = balcao_,
    updated_at = now()
  WHERE id = pessoa.id
  RETURNING * INTO pessoa;

  -- Papel "faz serviço na OS"
  IF faz_os_ AND pessoa.mechanic_id IS NULL THEN
    INSERT INTO mechanics (store_id, name, commission_rate, commission_parts_rate, active, photo_url)
    VALUES (loja, nome_, COALESCE((p->>'comissao_servicos')::numeric, 0), COALESCE((p->>'comissao_pecas')::numeric, 0), ativo_, pessoa.foto_url)
    RETURNING id INTO novo_id;
    UPDATE colaboradores SET mechanic_id = novo_id WHERE id = pessoa.id;
  ELSIF pessoa.mechanic_id IS NOT NULL THEN
    UPDATE mechanics SET
      name = nome_,
      commission_rate = COALESCE((p->>'comissao_servicos')::numeric, commission_rate),
      commission_parts_rate = COALESCE((p->>'comissao_pecas')::numeric, commission_parts_rate),
      active = ativo_ AND faz_os_,
      photo_url = pessoa.foto_url,
      updated_at = now()
    WHERE id = pessoa.mechanic_id;
  END IF;

  -- Papel "atende no balcão"
  IF balcao_ AND pessoa.staff_member_id IS NULL THEN
    INSERT INTO staff_members (store_id, name, role, commission_rate, commission_on_parts, active, photo_url)
    VALUES (loja, nome_, CASE WHEN lower(COALESCE(pessoa.cargo, '')) = 'dono' THEN 'dono' ELSE 'balconista' END,
            COALESCE((p->>'comissao_balcao')::numeric, 0), COALESCE((p->>'comissao_balcao_pecas')::boolean, false), ativo_, pessoa.foto_url)
    RETURNING id INTO novo_id;
    UPDATE colaboradores SET staff_member_id = novo_id WHERE id = pessoa.id;
  ELSIF pessoa.staff_member_id IS NOT NULL THEN
    UPDATE staff_members SET
      name = nome_,
      role = CASE WHEN lower(COALESCE(pessoa.cargo, '')) = 'dono' THEN 'dono' ELSE role END,
      commission_rate = COALESCE((p->>'comissao_balcao')::numeric, commission_rate),
      commission_on_parts = COALESCE((p->>'comissao_balcao_pecas')::boolean, commission_on_parts),
      active = ativo_ AND balcao_,
      photo_url = pessoa.foto_url,
      updated_at = now()
    WHERE id = pessoa.staff_member_id;
  END IF;

  RETURN pessoa.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.salvar_pessoa_equipe(jsonb) TO authenticated;
