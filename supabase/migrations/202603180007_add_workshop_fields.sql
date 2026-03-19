-- Adiciona campos do Quadro da Oficina na tabela service_orders
-- previsao_entrega: data prevista para entrega da moto ao cliente
-- status_oficina: estado físico da moto dentro da oficina (independente do status de pagamento)

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS previsao_entrega DATE,
  ADD COLUMN IF NOT EXISTS status_oficina TEXT
    CHECK (status_oficina IN (
      'aguardando_inspecao',
      'em_servico',
      'aguardando_peca',
      'servico_concluido',
      'pronta_para_buscar'
    ));

-- Index para o quadro da oficina (filtra OS ativas ordenadas por previsao)
CREATE INDEX IF NOT EXISTS idx_service_orders_quadro
  ON service_orders (status, previsao_entrega)
  WHERE status != 'concluida_entregue';

COMMENT ON COLUMN service_orders.previsao_entrega IS 'Data prevista para entrega da moto ao cliente';
COMMENT ON COLUMN service_orders.status_oficina IS 'Estado físico da moto na oficina: aguardando_inspecao, em_servico, aguardando_peca, servico_concluido, pronta_para_buscar';
