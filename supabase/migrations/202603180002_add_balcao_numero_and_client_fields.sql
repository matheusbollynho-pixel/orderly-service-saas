-- Número sequencial para notas de balcão
CREATE SEQUENCE IF NOT EXISTS balcao_orders_numero_seq START 1;

ALTER TABLE balcao_orders
  ADD COLUMN IF NOT EXISTS numero       INTEGER NOT NULL DEFAULT nextval('balcao_orders_numero_seq'),
  ADD COLUMN IF NOT EXISTS client_cpf   TEXT,
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS client_address TEXT;

-- Garantir que o número seja único
CREATE UNIQUE INDEX IF NOT EXISTS idx_balcao_orders_numero ON balcao_orders(numero);
