-- Adiciona novo status ao enum order_status
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'concluida_entregue';
