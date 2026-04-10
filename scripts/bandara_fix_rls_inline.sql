-- ============================================================
-- FIX RLS BANDARA: substitui get_my_store_id() por subquery inline
-- Cole no SQL Editor do Supabase (projeto xqndblstrblqleraepzs)
-- ============================================================

-- store_settings
DROP POLICY IF EXISTS "store_settings: member read" ON store_settings;
CREATE POLICY "store_settings: member read" ON store_settings FOR SELECT TO authenticated
  USING (id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));
DROP POLICY IF EXISTS "store_settings: owner update" ON store_settings;
CREATE POLICY "store_settings: owner update" ON store_settings FOR UPDATE TO authenticated
  USING (id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- maintenance_reminders
DROP POLICY IF EXISTS "maintenance_reminders: store" ON maintenance_reminders;
CREATE POLICY "maintenance_reminders: store" ON maintenance_reminders FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- cash_flow
DROP POLICY IF EXISTS "cash_flow: store" ON cash_flow;
CREATE POLICY "cash_flow: store" ON cash_flow FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- service_orders
DROP POLICY IF EXISTS "service_orders: store" ON service_orders;
CREATE POLICY "service_orders: store" ON service_orders FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- clients
DROP POLICY IF EXISTS "clients: store" ON clients;
CREATE POLICY "clients: store" ON clients FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- motorcycles
DROP POLICY IF EXISTS "motorcycles: store" ON motorcycles;
CREATE POLICY "motorcycles: store" ON motorcycles FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- materials
DROP POLICY IF EXISTS "materials: store" ON materials;
CREATE POLICY "materials: store" ON materials FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- payments
DROP POLICY IF EXISTS "payments: store" ON payments;
CREATE POLICY "payments: store" ON payments FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- mechanics
DROP POLICY IF EXISTS "mechanics: store" ON mechanics;
CREATE POLICY "mechanics: store" ON mechanics FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- inventory_products
DROP POLICY IF EXISTS "inventory_products: store" ON inventory_products;
CREATE POLICY "inventory_products: store" ON inventory_products FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- inventory_movements
DROP POLICY IF EXISTS "inventory_movements: store" ON inventory_movements;
CREATE POLICY "inventory_movements: store" ON inventory_movements FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- balcao_orders
DROP POLICY IF EXISTS "balcao_orders: store" ON balcao_orders;
CREATE POLICY "balcao_orders: store" ON balcao_orders FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- balcao_items
DROP POLICY IF EXISTS "balcao_items: store" ON balcao_items;
CREATE POLICY "balcao_items: store" ON balcao_items FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- fiados
DROP POLICY IF EXISTS "fiados: store" ON fiados;
CREATE POLICY "fiados: store" ON fiados FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- fiado_payments
DROP POLICY IF EXISTS "fiado_payments: store" ON fiado_payments;
CREATE POLICY "fiado_payments: store" ON fiado_payments FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- fiado_messages
DROP POLICY IF EXISTS "fiado_messages: store" ON fiado_messages;
CREATE POLICY "fiado_messages: store" ON fiado_messages FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- appointments
DROP POLICY IF EXISTS "appointments: store" ON appointments;
CREATE POLICY "appointments: store" ON appointments FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- maintenance_keywords
DROP POLICY IF EXISTS "maintenance_keywords: store" ON maintenance_keywords;
CREATE POLICY "maintenance_keywords: store" ON maintenance_keywords FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- maintenance_reminder_history
DROP POLICY IF EXISTS "maintenance_reminder_history: store" ON maintenance_reminder_history;
CREATE POLICY "maintenance_reminder_history: store" ON maintenance_reminder_history FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- birthday_discounts
DROP POLICY IF EXISTS "birthday_discounts: store" ON birthday_discounts;
CREATE POLICY "birthday_discounts: store" ON birthday_discounts FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- checklist_items
DROP POLICY IF EXISTS "checklist_items: store" ON checklist_items;
CREATE POLICY "checklist_items: store" ON checklist_items FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- checklist_photos
DROP POLICY IF EXISTS "checklist_photos: store" ON checklist_photos;
CREATE POLICY "checklist_photos: store" ON checklist_photos FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- satisfaction_ratings
DROP POLICY IF EXISTS "satisfaction_ratings: store" ON satisfaction_ratings;
CREATE POLICY "satisfaction_ratings: store" ON satisfaction_ratings FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- staff_members
DROP POLICY IF EXISTS "staff_members: store" ON staff_members;
CREATE POLICY "staff_members: store" ON staff_members FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

-- boletos
DROP POLICY IF EXISTS "boletos: store" ON boletos;
CREATE POLICY "boletos: store" ON boletos FOR ALL TO authenticated
  USING (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true))
  WITH CHECK (store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true));

NOTIFY pgrst, 'reload schema';
