-- Execute este SQL no Supabase SQL Editor (projeto xqndblstrblqleraepzs)
-- Objetivo: persistir termo e assinatura de entrega na tabela service_orders

ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS delivery_terms_accepted boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_signature_data text NULL;
