-- Adiciona desconto em valor absoluto (R$) para pagamentos
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
