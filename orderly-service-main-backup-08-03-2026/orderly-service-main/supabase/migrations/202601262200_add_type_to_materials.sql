-- Adicionar campo type à tabela de materiais para categorizar como entrada, saida ou retirada
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'entrada' CHECK (type IN ('entrada', 'saida', 'retirada'));

-- Comentário explicativo
COMMENT ON COLUMN public.materials.type IS 'Tipo do item: entrada (receita/serviço), saida (despesa/material), retirada (retirada de caixa)';
