-- Permite avaliações walk-in (QR Code) sem criar ordem de serviço
ALTER TABLE public.satisfaction_ratings
  ALTER COLUMN order_id DROP NOT NULL;
