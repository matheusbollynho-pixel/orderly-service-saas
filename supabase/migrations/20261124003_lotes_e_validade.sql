-- Lote e validade por produto (opcional, ligado produto a produto).
--
-- * inventory_products.controla_validade: desligado por padrão. Produto sem ele
--   segue exatamente como antes (nenhum lote é criado nem consumido).
-- * inventory_lotes: cada lote (lote, fabricação, validade, local) com o saldo.
--   O saldo total do produto continua em stock_current / stock_almox.
-- * inventory_lote_saidas: de qual lote saiu cada quantidade (para devolver ao
--   mesmo lote quando a peça volta da OS ou a venda é cancelada).
-- * Saídas tiram do lote que vence antes (FEFO). Transferência leva o lote junto.
-- * store_settings.dias_aviso_validade: quantos dias antes avisar (padrão 30).
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS controla_validade BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS dias_aviso_validade INTEGER NOT NULL DEFAULT 30;

-- Dados do lote informados na entrada
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS lote       TEXT,
  ADD COLUMN IF NOT EXISTS fabricacao DATE,
  ADD COLUMN IF NOT EXISTS validade   DATE;

CREATE TABLE IF NOT EXISTS inventory_lotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  local       TEXT NOT NULL DEFAULT 'loja' CHECK (local IN ('loja', 'almox')),
  lote        TEXT,
  fabricacao  DATE,
  validade    DATE,
  quantidade  NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lotes_produto_idx ON inventory_lotes (product_id, local, validade);
CREATE INDEX IF NOT EXISTS inventory_lotes_validade_idx ON inventory_lotes (store_id, validade) WHERE quantidade > 0;

CREATE TABLE IF NOT EXISTS inventory_lote_saidas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  movement_id  UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  lote_id      UUID NOT NULL REFERENCES inventory_lotes(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL,
  local        TEXT NOT NULL,
  order_id     UUID,
  quantidade   NUMERIC(10,3) NOT NULL,
  devolvido    NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lote_saidas_idx ON inventory_lote_saidas (product_id, local, created_at);

-- Só leitura para quem é da loja; escrita só pelos gatilhos abaixo
ALTER TABLE inventory_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lote_saidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_lotes: select" ON inventory_lotes;
CREATE POLICY "inventory_lotes: select" ON inventory_lotes FOR SELECT
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
DROP POLICY IF EXISTS "inventory_lote_saidas: select" ON inventory_lote_saidas;
CREATE POLICY "inventory_lote_saidas: select" ON inventory_lote_saidas FOR SELECT
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- Soma num lote igual (mesmo produto, local, lote e validade) ou cria um novo
CREATE OR REPLACE FUNCTION public.fn_lote_somar(
  p_store UUID, p_product UUID, p_local TEXT, p_lote TEXT, p_fab DATE, p_val DATE, p_qtd NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
    FROM inventory_lotes
   WHERE product_id = p_product AND local = p_local
     AND COALESCE(lote, '') = COALESCE(NULLIF(trim(p_lote), ''), '')
     AND validade IS NOT DISTINCT FROM p_val
   LIMIT 1
   FOR UPDATE;

  IF v_id IS NOT NULL THEN
    UPDATE inventory_lotes
       SET quantidade = quantidade + p_qtd,
           fabricacao = COALESCE(fabricacao, p_fab),
           updated_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO inventory_lotes (store_id, product_id, local, lote, fabricacao, validade, quantidade)
    VALUES (p_store, p_product, p_local, NULLIF(trim(p_lote), ''), p_fab, p_val, p_qtd)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_lote_somar(UUID, UUID, TEXT, TEXT, DATE, DATE, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Acompanha cada movimentação dos produtos que controlam validade
CREATE OR REPLACE FUNCTION public.fn_lotes_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ctrl   BOOLEAN;
  v_origem TEXT;
  v_rest   NUMERIC;
  v_take   NUMERIC;
  r        RECORD;
BEGIN
  SELECT controla_validade INTO v_ctrl FROM inventory_products WHERE id = NEW.product_id;
  IF NOT COALESCE(v_ctrl, false) THEN
    RETURN NEW;
  END IF;

  -- Entrada: cria/soma o lote informado (sem dados = "sem lote")
  IF NEW.type = 'entrada_manual' THEN
    PERFORM fn_lote_somar(NEW.store_id, NEW.product_id, COALESCE(NEW.local, 'loja'), NEW.lote, NEW.fabricacao, NEW.validade, NEW.quantity);
    RETURN NEW;
  END IF;

  -- Saídas, transferências e ajuste para menos: tira do lote que vence antes
  IF NEW.type IN ('saida_os', 'saida_venda', 'saida_balcao', 'transf_para_almox', 'transf_para_loja')
     OR (NEW.type = 'ajuste' AND NEW.saldo_anterior IS NOT NULL AND NEW.quantity < NEW.saldo_anterior) THEN

    v_origem := CASE NEW.type
                  WHEN 'transf_para_almox' THEN 'loja'
                  WHEN 'transf_para_loja' THEN 'almox'
                  ELSE COALESCE(NEW.local, 'loja')
                END;
    v_rest := CASE WHEN NEW.type = 'ajuste' THEN NEW.saldo_anterior - NEW.quantity ELSE NEW.quantity END;

    FOR r IN
      SELECT * FROM inventory_lotes
       WHERE product_id = NEW.product_id AND local = v_origem AND quantidade > 0
       ORDER BY validade NULLS LAST, created_at
       FOR UPDATE
    LOOP
      EXIT WHEN v_rest <= 0;
      v_take := LEAST(r.quantidade, v_rest);

      UPDATE inventory_lotes SET quantidade = quantidade - v_take, updated_at = now() WHERE id = r.id;
      INSERT INTO inventory_lote_saidas (store_id, movement_id, lote_id, product_id, local, order_id, quantidade)
      VALUES (NEW.store_id, NEW.id, r.id, NEW.product_id, v_origem, NEW.order_id, v_take);

      -- Transferência: o mesmo lote chega no outro lugar
      IF NEW.type IN ('transf_para_almox', 'transf_para_loja') THEN
        PERFORM fn_lote_somar(NEW.store_id, NEW.product_id,
                              CASE WHEN v_origem = 'loja' THEN 'almox' ELSE 'loja' END,
                              r.lote, r.fabricacao, r.validade, v_take);
      END IF;

      v_rest := v_rest - v_take;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Devolução: volta para o mesmo lote de onde saiu (a saída mais recente primeiro)
  IF NEW.type = 'devolucao' THEN
    v_rest := NEW.quantity;
    FOR r IN
      SELECT s.*
        FROM inventory_lote_saidas s
        JOIN inventory_movements m ON m.id = s.movement_id
       WHERE s.product_id = NEW.product_id
         AND s.local = COALESCE(NEW.local, 'loja')
         AND s.quantidade > s.devolvido
         AND m.type IN ('saida_os', 'saida_venda', 'saida_balcao')
         AND (NEW.order_id IS NULL OR s.order_id = NEW.order_id)
       ORDER BY s.created_at DESC
       FOR UPDATE OF s
    LOOP
      EXIT WHEN v_rest <= 0;
      v_take := LEAST(r.quantidade - r.devolvido, v_rest);
      UPDATE inventory_lote_saidas SET devolvido = devolvido + v_take WHERE id = r.id;
      UPDATE inventory_lotes SET quantidade = quantidade + v_take, updated_at = now() WHERE id = r.lote_id;
      v_rest := v_rest - v_take;
    END LOOP;
    IF v_rest > 0 THEN
      PERFORM fn_lote_somar(NEW.store_id, NEW.product_id, COALESCE(NEW.local, 'loja'), NULL, NULL, NULL, v_rest);
    END IF;
    RETURN NEW;
  END IF;

  -- Ajuste para mais: a sobra entra como "sem lote"
  IF NEW.type = 'ajuste' AND NEW.saldo_anterior IS NOT NULL AND NEW.quantity > NEW.saldo_anterior THEN
    PERFORM fn_lote_somar(NEW.store_id, NEW.product_id, COALESCE(NEW.local, 'loja'), NULL, NULL, NULL, NEW.quantity - NEW.saldo_anterior);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_lotes_on_movement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lotes_on_movement ON inventory_movements;
CREATE TRIGGER trg_lotes_on_movement
AFTER INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.fn_lotes_on_movement();
