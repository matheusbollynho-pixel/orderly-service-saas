-- Controle explícito de "o Max (ia-atendimento) pode pesquisar no estoque desta loja?".
-- Antes isso era inferido só por "a loja tem > 0 produtos em inventory_products",
-- o que ligava a busca em lojas com pouquíssima coisa cadastrada (ex.: Bandara
-- Motos) e fazia o Max prometer/negar peças com base numa tabela quase vazia.
--
--   NULL  = comportamento antigo (liga se houver produtos cadastrados)
--   true  = sempre pesquisa no estoque
--   false = nunca pesquisa; o Max responde que vai encaminhar a pergunta de
--           peça/preço pro setor responsável
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS ai_stock_search_enabled BOOLEAN DEFAULT NULL;

-- Bandara Motos não usa o módulo de estoque — desliga explicitamente.
UPDATE store_settings
   SET ai_stock_search_enabled = false
 WHERE ai_stock_search_enabled IS NULL
   AND company_name ILIKE '%bandara%';
