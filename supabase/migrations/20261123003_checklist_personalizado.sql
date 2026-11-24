-- Checklist da OS personalizado por loja. Cada loja pode montar o próprio
-- checklist de moto e de carro (nome do item + tipo: sim/não, estrelas, texto).
-- Vazio (NULL) = usa o checklist padrão do sistema, como hoje.
-- checklist_items.posicao guarda a ordem montada pela loja (tela e PDF seguem).
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS checklist_moto  JSONB,
  ADD COLUMN IF NOT EXISTS checklist_carro JSONB;

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS posicao INTEGER;
