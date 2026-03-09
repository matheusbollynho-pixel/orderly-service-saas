-- Add client_birth_date column to service_orders if it doesn't exist
ALTER TABLE service_orders 
ADD COLUMN IF NOT EXISTS client_birth_date DATE;

-- Add comment to document the column
COMMENT ON COLUMN service_orders.client_birth_date IS 'Data de nascimento do cliente para campanha de aniversário';
