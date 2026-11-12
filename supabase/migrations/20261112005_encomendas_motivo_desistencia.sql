-- Motivo de quando o cliente desiste da encomenda (aparece no card e dá pra
-- filtrar). Só adiciona uma coluna opcional.
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS motivo_desistencia text;
