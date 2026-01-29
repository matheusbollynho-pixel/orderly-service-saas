-- Adicionar campo terms_accepted à tabela service_orders

ALTER TABLE public.service_orders
ADD COLUMN terms_accepted BOOLEAN DEFAULT false;
