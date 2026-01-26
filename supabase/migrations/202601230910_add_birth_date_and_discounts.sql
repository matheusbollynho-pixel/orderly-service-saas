-- Add birth_date column to clients
ALTER TABLE clients ADD COLUMN birth_date DATE;

-- Create birthday_discounts table
CREATE TABLE IF NOT EXISTS birthday_discounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  message_sent_at TIMESTAMP WITH TIME ZONE,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for birthday lookups
CREATE INDEX idx_birthday_discounts_expires_at ON birthday_discounts(expires_at);
CREATE INDEX idx_birthday_discounts_client_id ON birthday_discounts(client_id);

-- Enable RLS
ALTER TABLE birthday_discounts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view all discounts
CREATE POLICY "Users can view all birthday discounts" ON birthday_discounts
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RLS Policy: Users can insert new discounts
CREATE POLICY "Users can insert birthday discounts" ON birthday_discounts
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- RLS Policy: Users can update discounts
CREATE POLICY "Users can update birthday discounts" ON birthday_discounts
  FOR UPDATE
  USING (auth.role() = 'authenticated');
