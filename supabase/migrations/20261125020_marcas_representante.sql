-- Marcas por representante: cada representante diz as marcas que vende (vazio = vende de tudo)
-- e a peça em falta pode ter marca (a do produto do estoque, ou digitada).
-- Na cotação, cada representante recebe só as peças das marcas dele (e as sem marca).
ALTER TABLE public.representantes ADD COLUMN IF NOT EXISTS marcas text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.cotacao_itens ADD COLUMN IF NOT EXISTS marca text;
