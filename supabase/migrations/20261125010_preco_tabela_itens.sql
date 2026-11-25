-- Destaque do preço de tipo de cliente (Lojista etc.) na nota e na OS:
-- cada item guarda o preço normal da hora (preco_tabela) e o nome do tipo (tipo_preco).
ALTER TABLE public.balcao_items ADD COLUMN IF NOT EXISTS preco_tabela numeric(12,2);
ALTER TABLE public.balcao_items ADD COLUMN IF NOT EXISTS tipo_preco text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS preco_tabela numeric(12,2);
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS tipo_preco text;
