-- Módulo fiscal: emitir NFC-e sozinho ao finalizar a venda do balcão.
-- 'nao' = só pelo botão; 'cartao' = vendas com cartão (hábito da Bandara); 'todas' = toda venda finalizada.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS fiscal_auto text NOT NULL DEFAULT 'nao'
  CHECK (fiscal_auto IN ('nao', 'cartao', 'todas'));
