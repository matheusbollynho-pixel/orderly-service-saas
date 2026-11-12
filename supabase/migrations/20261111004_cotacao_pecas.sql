-- ============================================================
-- Módulo de COTAÇÃO DE PEÇAS (parte 1)
-- Lista de faltas da loja -> pede preço pros representantes pelo WhatsApp ->
-- cola a resposta -> IA liga cada preço à peça certa -> tabela de comparação.
-- Tudo novo; nenhuma tabela existente é alterada.
-- ============================================================

-- Representantes / fornecedores da loja
CREATE TABLE IF NOT EXISTS representantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  nome text NOT NULL,
  whatsapp text,
  perfil text CHECK (perfil IN ('original', 'popular', 'marca_propria')),
  -- Entrega grátis em dia fixo (0=domingo ... 6=sábado). Quinzenal precisa de uma
  -- data em que a entrega aconteceu, pra saber se a semana é "sim" ou "não".
  entrega_dia_semana smallint CHECK (entrega_dia_semana BETWEEN 0 AND 6),
  entrega_quinzenal boolean NOT NULL DEFAULT false,
  entrega_quinzenal_ref date,
  -- Entrega grátis por valor mínimo do pedido
  pedido_minimo numeric(10,2),
  prazo_dias smallint CHECK (prazo_dias >= 0),
  -- Até que horas pedir pra sair no prazo (ex: Osia até 12h chega no mesmo dia)
  horario_corte time,
  -- Entrega fora do dia grátis / abaixo do mínimo
  entrega_extra text CHECK (entrega_extra IN ('van', 'onibus', 'transportadora', 'outro')),
  frete_extra_valor numeric(10,2), -- null = valor variável
  tem_tabela boolean NOT NULL DEFAULT false,
  tabela_atualizada_em date,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_representantes_store ON representantes(store_id);

-- Lista de faltas (texto exatamente como a loja anota)
CREATE TABLE IF NOT EXISTS cotacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (length(trim(texto)) > 0),
  quantidade numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pedido', 'cancelado')),
  observacao text,
  pedido_preco_id uuid,  -- FK adicionada abaixo (cotacao_precos ainda não existe)
  pedido_em timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_itens_store_status ON cotacao_itens(store_id, status);

-- Cada resposta recebida de um representante (texto colado e/ou arquivo)
CREATE TABLE IF NOT EXISTS cotacao_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  representante_id uuid REFERENCES representantes(id) ON DELETE SET NULL,
  texto text,
  arquivo_nome text,
  prazo_entrega text,
  condicao_frete text,
  modelo text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_respostas_store ON cotacao_respostas(store_id, created_at DESC);

-- Cada opção de preço (uma linha da resposta, ou um preço da internet digitado)
CREATE TABLE IF NOT EXISTS cotacao_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  item_id uuid REFERENCES cotacao_itens(id) ON DELETE CASCADE,   -- null = IA não ligou a nenhum item
  resposta_id uuid REFERENCES cotacao_respostas(id) ON DELETE CASCADE,
  representante_id uuid REFERENCES representantes(id) ON DELETE SET NULL,
  fonte text NOT NULL DEFAULT 'representante' CHECK (fonte IN ('representante', 'internet')),
  loja_internet text,
  link text,
  texto_original text,
  situacao text NOT NULL CHECK (situacao IN ('cotado', 'nao_tem', 'duvida', 'nao_serve')),
  marca text,
  preco numeric(10,2) CHECK (preco IS NULL OR preco >= 0),
  frete numeric(10,2) CHECK (frete IS NULL OR frete >= 0),
  preco_por text NOT NULL DEFAULT 'nao_informado' CHECK (preco_por IN ('unidade', 'par', 'kit', 'nao_informado')),
  motivo text,
  confirmado boolean NOT NULL DEFAULT false,  -- loja conferiu uma "dúvida" e confirmou
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_precos_item ON cotacao_precos(item_id);
CREATE INDEX IF NOT EXISTS idx_cotacao_precos_store ON cotacao_precos(store_id, created_at DESC);

DO $$ BEGIN
  ALTER TABLE cotacao_itens
    ADD CONSTRAINT cotacao_itens_pedido_preco_fk
    FOREIGN KEY (pedido_preco_id) REFERENCES cotacao_precos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dicionário de gírias da loja (vai no prompt da IA)
CREATE TABLE IF NOT EXISTS cotacao_dicionario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  regra text NOT NULL CHECK (length(trim(regra)) > 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_dicionario_store ON cotacao_dicionario(store_id);

-- ------------------------------------------------------------
-- RLS: cada loja só enxerga e mexe no que é dela
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['representantes', 'cotacao_itens', 'cotacao_respostas', 'cotacao_precos', 'cotacao_dicionario'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s: membros da loja" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s: membros da loja" ON %I FOR ALL TO authenticated
         USING (store_id = (SELECT get_my_store_id()))
         WITH CHECK (store_id = (SELECT get_my_store_id()))', t, t);
  END LOOP;
END $$;

-- Uma opção de preço só pode apontar pra item/resposta/representante da MESMA loja
-- (a RLS checa o store_id da linha, mas não o das chaves estrangeiras).
CREATE OR REPLACE FUNCTION cotacao_precos_mesma_loja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cotacao_itens WHERE id = NEW.item_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'item de outra loja';
  END IF;
  IF NEW.resposta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cotacao_respostas WHERE id = NEW.resposta_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'resposta de outra loja';
  END IF;
  IF NEW.representante_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM representantes WHERE id = NEW.representante_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'representante de outra loja';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cotacao_precos_mesma_loja ON cotacao_precos;
CREATE TRIGGER trg_cotacao_precos_mesma_loja
  BEFORE INSERT OR UPDATE ON cotacao_precos
  FOR EACH ROW EXECUTE FUNCTION cotacao_precos_mesma_loja();

CREATE OR REPLACE FUNCTION cotacao_itens_pedido_mesma_loja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pedido_preco_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cotacao_precos WHERE id = NEW.pedido_preco_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'preço de outra loja';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cotacao_itens_pedido_mesma_loja ON cotacao_itens;
CREATE TRIGGER trg_cotacao_itens_pedido_mesma_loja
  BEFORE INSERT OR UPDATE ON cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION cotacao_itens_pedido_mesma_loja();

-- updated_at
CREATE OR REPLACE FUNCTION cotacao_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_representantes_updated_at ON representantes;
CREATE TRIGGER trg_representantes_updated_at BEFORE UPDATE ON representantes
  FOR EACH ROW EXECUTE FUNCTION cotacao_set_updated_at();
DROP TRIGGER IF EXISTS trg_cotacao_itens_updated_at ON cotacao_itens;
CREATE TRIGGER trg_cotacao_itens_updated_at BEFORE UPDATE ON cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION cotacao_set_updated_at();

-- ------------------------------------------------------------
-- Dicionário inicial da Bandara Motos (o que o dono já ensinou em 11/11/2026).
-- Só insere se a loja existir e ainda não tiver nenhuma regra.
-- ------------------------------------------------------------
DO $$
DECLARE bandara uuid := '9fd27114-97d1-48cd-ad09-1b057fa9c185';
BEGIN
  IF EXISTS (SELECT 1 FROM store_settings WHERE id = bandara)
     AND NOT EXISTS (SELECT 1 FROM cotacao_dicionario WHERE store_id = bandara) THEN
    INSERT INTO cotacao_dicionario (store_id, regra, created_by) VALUES
      (bandara, '"relação" = SEMPRE o kit completo: coroa + corrente + pinhão. Peça avulsa (só coroa e pinhão, sem corrente) NÃO é a relação.', NULL),
      (bandara, '"pop 110" = Honda Pop 110i.', NULL),
      (bandara, '"150" sozinho = Honda CG Titan 150. "2000" = Titan 125 (ano 2000). O último número do pedido é o ano da moto.', NULL),
      (bandara, '"titan 160" = Honda CG 160 Titan.', NULL),
      (bandara, '"cabo acelerador A" = cabo A do acelerador. Existe cabo A e cabo B; são peças diferentes, B NÃO serve no lugar de A.', NULL),
      (bandara, '"câmara 18 grossa" = câmara de ar 3.50/4.00-18 (motos altas: Lander, Tornado), traseira.', NULL),
      (bandara, '"câmara 18 fina" ou "câmara 18 Titan" = câmara aro 18 da linha Titan/Fan.', NULL),
      (bandara, 'Câmara de ar tem medida própria, diferente da medida do pneu.', NULL),
      (bandara, '"rd 135" = Yamaha RD 135. Pisca da RD não tem lado.', NULL),
      (bandara, '"cano de escape" = escapamento completo. Ponteira sozinha é outra peça.', NULL),
      (bandara, 'Quando a loja não fala marca, o representante pode mandar várias marcas: cada marca é uma opção separada.', NULL);
  END IF;
END $$;
