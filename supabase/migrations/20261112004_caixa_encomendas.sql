-- Encomendas no caixa: o sinal (entrada) e o restante (na entrega) viram
-- lançamentos no fluxo de caixa, ligados à encomenda.
-- Só ADICIONA uma coluna opcional na cash_flow; nada existente muda.

ALTER TABLE cash_flow
  ADD COLUMN IF NOT EXISTS encomenda_id uuid REFERENCES encomendas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cash_flow_encomenda ON cash_flow(encomenda_id) WHERE encomenda_id IS NOT NULL;
