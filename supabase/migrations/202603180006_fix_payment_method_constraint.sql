-- Adiciona cartao_credito e cartao_debito ao check constraint do cash_flow
ALTER TABLE cash_flow DROP CONSTRAINT IF EXISTS cash_flow_payment_method_check;
ALTER TABLE cash_flow ADD CONSTRAINT cash_flow_payment_method_check
  CHECK (payment_method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro'));
