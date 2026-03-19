-- Adiciona motivo de cancelamento em notas de balcão
ALTER TABLE balcao_orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT CHECK (cancel_reason IN (
    'erro_lancamento',
    'preco',
    'insatisfacao',
    'produto_indisponivel',
    'outro'
  )),
  ADD COLUMN IF NOT EXISTS cancel_notes TEXT;
