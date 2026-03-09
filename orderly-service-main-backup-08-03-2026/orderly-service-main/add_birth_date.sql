ALTER TABLE IF EXISTS public.service_orders
ADD COLUMN IF NOT EXISTS client_birth_date DATE;

COMMENT ON COLUMN public.service_orders.client_birth_date IS 'Data de nascimento do cliente para campanha de aniversário';
