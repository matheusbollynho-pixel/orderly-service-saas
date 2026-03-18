-- ── Módulo Nota de Balcão ─────────────────────────────────────────────────────

-- 1. Tabela de notas
CREATE TABLE IF NOT EXISTS balcao_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name     TEXT,
  status          TEXT NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta', 'finalizada', 'cancelada')),
  payment_method  TEXT DEFAULT 'dinheiro',
  discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  finalized_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Itens da nota
CREATE TABLE IF NOT EXISTS balcao_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES balcao_orders(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'avulso' CHECK (type IN ('estoque', 'avulso')),
  product_id  UUID REFERENCES inventory_products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Coluna balcao_order_id em cash_flow (para cancelamento rastrear e deletar)
ALTER TABLE cash_flow
  ADD COLUMN IF NOT EXISTS balcao_order_id UUID REFERENCES balcao_orders(id) ON DELETE SET NULL;

-- 4. RLS
ALTER TABLE balcao_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE balcao_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage balcao_orders"
  ON balcao_orders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can manage balcao_items"
  ON balcao_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_balcao_orders_status     ON balcao_orders(status);
CREATE INDEX IF NOT EXISTS idx_balcao_orders_created_at ON balcao_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balcao_items_order_id    ON balcao_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_balcao_order   ON cash_flow(balcao_order_id);
