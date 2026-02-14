-- Adicionar coluna de fotos ao checklist_items
ALTER TABLE public.checklist_items
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Criar tabela para rastrear fotos para limpeza automática
CREATE TABLE IF NOT EXISTS public.checklist_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  storage_path TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índice para melhorar limpeza automática
CREATE INDEX IF NOT EXISTS checklist_photos_uploaded_at_idx ON public.checklist_photos(uploaded_at);
CREATE INDEX IF NOT EXISTS checklist_photos_order_id_idx ON public.checklist_photos(order_id);

-- Habilitar RLS
ALTER TABLE public.checklist_photos ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY checklist_photos_all ON public.checklist_photos FOR ALL USING (true) WITH CHECK (true);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_checklist_photos_updated_at ON public.checklist_photos;

CREATE TRIGGER update_checklist_photos_updated_at
BEFORE UPDATE ON public.checklist_photos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.checklist_photos IS 'Rastreamento de fotos para limpeza automática após 100 dias';
COMMENT ON COLUMN public.checklist_photos.uploaded_at IS 'Data de upload da foto (usada para limpeza automática)';
COMMENT ON COLUMN public.checklist_photos.storage_path IS 'Caminho no Supabase Storage para referência de deleção';
