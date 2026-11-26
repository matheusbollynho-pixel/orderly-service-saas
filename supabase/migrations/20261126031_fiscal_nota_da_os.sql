-- Módulo fiscal: nota de VENDA (NFC-e / NF-e) das PEÇAS da OS. Uma nota válida por OS e modelo
-- (mesma trava que já existe para a venda do balcão). Mão de obra vai na nota de serviço, à parte.
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_uma_por_os ON public.notas_fiscais (order_id, modelo)
  WHERE order_id IS NOT NULL AND status NOT IN ('rejeitada', 'denegada', 'cancelada', 'erro', 'inutilizada');
