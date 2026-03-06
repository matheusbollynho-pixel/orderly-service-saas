-- Adiciona persistência do Termo de Entrega e Assinatura de Entrega na OS
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS delivery_terms_accepted boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_signature_data text NULL;
