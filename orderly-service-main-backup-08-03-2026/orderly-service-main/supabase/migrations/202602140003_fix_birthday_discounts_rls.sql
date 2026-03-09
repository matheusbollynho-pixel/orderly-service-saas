-- Fix RLS policies for birthday_discounts table
-- Remove old restrictive policies
DROP POLICY IF EXISTS "Users can view all birthday discounts" ON birthday_discounts;
DROP POLICY IF EXISTS "Users can insert birthday discounts" ON birthday_discounts;
DROP POLICY IF EXISTS "Users can update birthday discounts" ON birthday_discounts;
DROP POLICY IF EXISTS "Users can delete birthday discounts" ON birthday_discounts;

-- Create new permissive policy (allow all operations)
CREATE POLICY "Allow all operations on birthday_discounts" 
ON birthday_discounts 
FOR ALL 
USING (true)
WITH CHECK (true);
