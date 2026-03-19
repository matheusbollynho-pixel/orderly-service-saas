-- Adiciona campo de atendente na nota de balcão
ALTER TABLE balcao_orders
  ADD COLUMN IF NOT EXISTS atendente_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;
