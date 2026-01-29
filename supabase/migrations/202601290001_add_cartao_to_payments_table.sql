-- Adicionar 'cartao' como método de pagamento válido na tabela payments

ALTER TABLE public.payments
DROP CONSTRAINT payments_method_check,
ADD CONSTRAINT payments_method_check CHECK (method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro'));
