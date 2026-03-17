-- ============================================================
-- MÓDULO DE ESTOQUE — SpeedSeek OS SaaS
-- ============================================================

-- ── 1. TABELA DE PRODUTOS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  code                  TEXT UNIQUE NOT NULL,         -- Código interno (obrigatório)
  barcode               TEXT,                          -- Código de barras
  sku                   TEXT,                          -- SKU
  name                  TEXT NOT NULL,                 -- Nome da peça (obrigatório)
  description           TEXT,                          -- Descrição detalhada

  -- Classificação
  classification        TEXT,                          -- Classificação geral
  category              TEXT,                          -- Categoria (freio, motor, suspensão, etc.)
  subcategory           TEXT,                          -- Subcategoria
  brand                 TEXT,                          -- Marca da peça/fabricante
  supplier              TEXT,                          -- Fornecedor
  part_type             TEXT CHECK (part_type IN ('original', 'paralela', 'usada', 'remanufaturada', 'outro')),

  -- Aplicação da peça
  moto_brand            TEXT,                          -- Marca da moto
  moto_model            TEXT,                          -- Modelo da moto
  moto_year             TEXT,                          -- Ano
  moto_displacement     TEXT,                          -- Cilindrada
  moto_version          TEXT,                          -- Versão
  compatibility         TEXT,                          -- Compatibilidade com outras motos (texto livre)

  -- Características técnicas
  manufacturer_part_number TEXT,                       -- Número da peça do fabricante
  dimensions            TEXT,                          -- Medidas/dimensões
  color                 TEXT,                          -- Cor
  material              TEXT,                          -- Material
  side                  TEXT CHECK (side IN ('direito', 'esquerdo', 'dianteiro', 'traseiro', 'ambos', 'nao_aplicavel')),
  unit                  TEXT NOT NULL DEFAULT 'un',    -- Unidade de venda (un, par, jogo, kit)

  -- Controle de estoque
  stock_current         NUMERIC(10,3) NOT NULL DEFAULT 0,
  stock_minimum         NUMERIC(10,3) NOT NULL DEFAULT 0,
  stock_maximum         NUMERIC(10,3),
  location              TEXT,                          -- Localização (rua, prateleira, box, gaveta)
  lot                   TEXT,                          -- Lote
  entry_date            DATE,                          -- Data de entrada

  -- Custos e vendas
  cost_price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  profit_margin         NUMERIC(5,2),                  -- Margem de lucro %
  promotional_price     NUMERIC(10,2),                 -- Preço promocional

  -- Situação
  active                BOOLEAN NOT NULL DEFAULT true,
  status                TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'em_falta', 'descontinuado')),

  -- Extras
  notes                 TEXT,                          -- Observações

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ── 2. TABELA DE MOVIMENTAÇÕES ─────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  type          TEXT NOT NULL CHECK (type IN ('entrada_manual', 'saida_os', 'saida_venda', 'ajuste', 'devolucao')),
  quantity      NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  unit_cost     NUMERIC(10,2),
  unit_price    NUMERIC(10,2),
  order_id      UUID REFERENCES service_orders(id) ON DELETE SET NULL,
  material_id   UUID REFERENCES materials(id) ON DELETE SET NULL,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 3. COLUNA product_id EM MATERIALS ──────────────────────
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES inventory_products(id) ON DELETE SET NULL;

-- ── 4. TRIGGER: ATUALIZA ESTOQUE AO INSERIR MOVIMENTAÇÃO ──
CREATE OR REPLACE FUNCTION fn_update_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IN ('entrada_manual', 'devolucao') THEN
    UPDATE inventory_products
      SET stock_current = stock_current + NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  ELSIF NEW.type IN ('saida_os', 'saida_venda') THEN
    UPDATE inventory_products
      SET stock_current = stock_current - NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    -- Para ajuste, quantity pode ser positivo (adicionar) ou negativo (remover)
    -- Usamos notes para indicar direção: '+' ou '-'
    -- Por simplicidade, ajuste sempre adiciona; para subtrair, usa quantity negativa via notes
    UPDATE inventory_products
      SET stock_current = NEW.quantity, -- ajuste define o valor absoluto
          updated_at = now()
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_stock_on_movement
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION fn_update_stock_on_movement();

-- ── 5. TRIGGER: BAIXA AUTOMÁTICA AO ADICIONAR MATERIAL NA OS
CREATE OR REPLACE FUNCTION fn_auto_deduct_stock_on_material()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.is_service IS NULL OR NEW.is_service = false) THEN
    INSERT INTO inventory_movements (product_id, type, quantity, unit_cost, unit_price, order_id, material_id, notes)
    VALUES (
      NEW.product_id,
      'saida_os',
      COALESCE(NEW.quantidade::NUMERIC, 1),
      NULL,
      NEW.valor,
      NEW.order_id,
      NEW.id,
      'Baixa automática via OS'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_deduct_stock_on_material
  AFTER INSERT ON materials
  FOR EACH ROW EXECUTE FUNCTION fn_auto_deduct_stock_on_material();

-- ── 6. TRIGGER: RESTAURA ESTOQUE AO REMOVER MATERIAL DA OS ─
CREATE OR REPLACE FUNCTION fn_restore_stock_on_material_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    INSERT INTO inventory_movements (product_id, type, quantity, order_id, material_id, notes)
    VALUES (
      OLD.product_id,
      'devolucao',
      COALESCE(OLD.quantidade::NUMERIC, 1),
      OLD.order_id,
      OLD.id,
      'Devolução automática — material removido da OS'
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_restore_stock_on_material_delete
  AFTER DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION fn_restore_stock_on_material_delete();

-- ── 7. TRIGGER: VENDA AVULSA → CAIXA ───────────────────────
CREATE OR REPLACE FUNCTION fn_register_sale_in_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_product_name TEXT;
BEGIN
  IF NEW.type = 'saida_venda' THEN
    SELECT name INTO v_product_name FROM inventory_products WHERE id = NEW.product_id;
    INSERT INTO cash_flow (type, amount, description, reference_date)
    VALUES (
      'entrada',
      NEW.quantity * COALESCE(NEW.unit_price, 0),
      'Venda avulsa: ' || COALESCE(v_product_name, 'Produto'),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_register_sale_in_cash_flow
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION fn_register_sale_in_cash_flow();

-- ── 8. VIEW: PRODUTOS COM ESTOQUE BAIXO ────────────────────
CREATE OR REPLACE VIEW inventory_low_stock AS
  SELECT * FROM inventory_products
  WHERE active = true
    AND stock_minimum > 0
    AND stock_current <= stock_minimum
  ORDER BY (stock_current / NULLIF(stock_minimum, 0)) ASC;

-- ── 9. RLS ─────────────────────────────────────────────────
ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage inventory_products"
  ON inventory_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view inventory_movements"
  ON inventory_movements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_movements"
  ON inventory_movements FOR INSERT TO authenticated WITH CHECK (true);

-- Movimentações são imutáveis — sem UPDATE nem DELETE direto
