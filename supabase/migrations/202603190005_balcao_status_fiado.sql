-- Adiciona status 'fiado' na constraint de balcao_orders
ALTER TABLE balcao_orders DROP CONSTRAINT IF EXISTS balcao_orders_status_check;
ALTER TABLE balcao_orders ADD CONSTRAINT balcao_orders_status_check
  CHECK (status IN ('aberta', 'finalizada', 'cancelada', 'fiado'));
