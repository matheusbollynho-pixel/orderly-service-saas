-- Produto do estoque que chega no mínimo entra SOZINHO na lista de faltas da
-- cotação (sem quantidade chutada: a loja decide). Se repor o estoque antes de
-- pedir, sai da lista sozinho. Só vale pra produto com estoque mínimo cadastrado.

ALTER TABLE cotacao_itens
  ADD COLUMN IF NOT EXISTS produto_id uuid REFERENCES inventory_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cotacao_itens_produto ON cotacao_itens(produto_id);

-- Só lojas que usam o módulo de cotação (mesma regra da tela: enterprise ou liberado à mão)
CREATE OR REPLACE FUNCTION loja_usa_cotacao(p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_settings s
     WHERE s.id = p_store_id
       AND CASE WHEN s.custom_features IS NOT NULL THEN 'cotacao' = ANY (s.custom_features)
                ELSE s.plan = 'enterprise' END);
$$;

CREATE OR REPLACE FUNCTION estoque_minimo_para_faltas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  estava_ok boolean;
BEGIN
  IF NEW.store_id IS NULL OR NEW.active IS NOT TRUE OR COALESCE(NEW.stock_minimum, 0) <= 0
     OR NOT loja_usa_cotacao(NEW.store_id) THEN
    RETURN NEW;
  END IF;

  estava_ok := TG_OP = 'INSERT'
    OR OLD.active IS NOT TRUE
    OR COALESCE(OLD.stock_minimum, 0) <= 0
    OR OLD.stock_current > OLD.stock_minimum;

  -- Caiu no mínimo agora: entra na lista (se ainda não estiver)
  IF NEW.stock_current <= NEW.stock_minimum AND estava_ok THEN
    IF NOT EXISTS (
      SELECT 1 FROM cotacao_itens
       WHERE store_id = NEW.store_id AND status = 'pendente'
         AND (produto_id = NEW.id OR lower(trim(texto)) = lower(trim(NEW.name)))
    ) THEN
      INSERT INTO cotacao_itens (store_id, texto, quantidade, observacao, produto_id, created_by)
      VALUES (NEW.store_id, NEW.name, 1, U&'Entrou sozinho: estoque chegou no m\00EDnimo', NEW.id, NULL);
    END IF;

  -- Repôs acima do mínimo antes de pedir: sai da lista
  ELSIF TG_OP = 'UPDATE' AND NEW.stock_current > NEW.stock_minimum AND OLD.stock_current <= OLD.stock_minimum THEN
    UPDATE cotacao_itens
       SET status = 'cancelado'
     WHERE store_id = NEW.store_id AND produto_id = NEW.id
       AND status = 'pendente' AND pedido_preco_id IS NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_estoque_minimo_para_faltas ON inventory_products;
CREATE TRIGGER trg_estoque_minimo_para_faltas
  AFTER INSERT OR UPDATE OF stock_current, stock_minimum, active ON inventory_products
  FOR EACH ROW EXECUTE FUNCTION estoque_minimo_para_faltas();

-- Liga os itens que já estão na lista ao produto (mesmo nome) ...
UPDATE cotacao_itens c
   SET produto_id = p.id
  FROM inventory_products p
 WHERE c.produto_id IS NULL AND c.status = 'pendente' AND loja_usa_cotacao(c.store_id)
   AND p.store_id = c.store_id AND p.active
   AND lower(trim(c.texto)) = lower(trim(p.name));

-- ... e coloca na lista quem JÁ está no mínimo e ainda não está lá
INSERT INTO cotacao_itens (store_id, texto, quantidade, observacao, produto_id, created_by)
SELECT p.store_id, p.name, 1, U&'Entrou sozinho: estoque chegou no m\00EDnimo', p.id, NULL
  FROM inventory_products p
 WHERE p.active AND p.store_id IS NOT NULL AND loja_usa_cotacao(p.store_id)
   AND COALESCE(p.stock_minimum, 0) > 0 AND p.stock_current <= p.stock_minimum
   AND NOT EXISTS (
     SELECT 1 FROM cotacao_itens c
      WHERE c.store_id = p.store_id AND c.status = 'pendente'
        AND (c.produto_id = p.id OR lower(trim(c.texto)) = lower(trim(p.name))));
