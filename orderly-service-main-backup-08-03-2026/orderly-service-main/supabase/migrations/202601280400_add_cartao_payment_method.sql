-- Adicionar 'cartao' como método de pagamento válido na tabela cash_flow
-- Remover a constraint antiga
ALTER TABLE cash_flow DROP CONSTRAINT cash_flow_payment_method_check;

-- Adicionar a nova constraint com 'cartao' incluído
ALTER TABLE cash_flow ADD CONSTRAINT cash_flow_payment_method_check 
  CHECK (payment_method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro'));
