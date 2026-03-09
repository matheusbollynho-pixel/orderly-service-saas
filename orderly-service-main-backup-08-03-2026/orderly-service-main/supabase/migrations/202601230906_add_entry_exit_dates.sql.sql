-- Add entry and exit dates to service_orders table
ALTER TABLE service_orders
ADD COLUMN entry_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN exit_date TIMESTAMP WITH TIME ZONE;

-- Add comment to columns
COMMENT ON COLUMN service_orders.entry_date IS 'Data de entrada da moto';
COMMENT ON COLUMN service_orders.exit_date IS 'Data de saída da moto';
