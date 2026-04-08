-- ============================================================
-- STEP 4: Reconstrói todas as políticas RLS com isolamento por store
-- Padrão: USING (store_id = get_my_store_id())
-- ============================================================

-- ── MECHANICS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "mechanics_all" ON mechanics;
CREATE POLICY "mechanics: store" ON mechanics FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── STAFF_MEMBERS ───────────────────────────────────────────
DROP POLICY IF EXISTS "staff_members_all" ON staff_members;
CREATE POLICY "staff_members: store" ON staff_members FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── CLIENTS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients_all" ON clients;
CREATE POLICY "clients: store" ON clients FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── MOTORCYCLES ─────────────────────────────────────────────
DROP POLICY IF EXISTS "motorcycles_all" ON motorcycles;
CREATE POLICY "motorcycles: store" ON motorcycles FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── SERVICE_ORDERS ──────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all operations on service_orders" ON service_orders;
CREATE POLICY "service_orders: store" ON service_orders FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── MATERIALS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "materials_select" ON materials;
DROP POLICY IF EXISTS "materials_insert" ON materials;
DROP POLICY IF EXISTS "materials_update" ON materials;
DROP POLICY IF EXISTS "materials_delete" ON materials;
CREATE POLICY "materials: store" ON materials FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── PAYMENTS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_all" ON payments;
CREATE POLICY "payments: store" ON payments FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── CASH_FLOW ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir leitura para todos usuários autenticados" ON cash_flow;
DROP POLICY IF EXISTS "Permitir inserção para usuários autenticados" ON cash_flow;
DROP POLICY IF EXISTS "Permitir atualização para usuários autenticados" ON cash_flow;
DROP POLICY IF EXISTS "Permitir exclusão para usuários autenticados" ON cash_flow;
CREATE POLICY "cash_flow: store" ON cash_flow FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
-- service_role para triggers
CREATE POLICY "cash_flow: service_role" ON cash_flow FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── CHECKLIST_ITEMS ─────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all operations on checklist_items" ON checklist_items;
CREATE POLICY "checklist_items: store" ON checklist_items FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── CHECKLIST_PHOTOS ────────────────────────────────────────
DROP POLICY IF EXISTS "checklist_photos_all" ON checklist_photos;
CREATE POLICY "checklist_photos: store" ON checklist_photos FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── SATISFACTION_RATINGS ────────────────────────────────────
DROP POLICY IF EXISTS "satisfaction_ratings_all" ON satisfaction_ratings;
CREATE POLICY "satisfaction_ratings: store" ON satisfaction_ratings FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
-- Anon para página pública de avaliação
CREATE POLICY "satisfaction_ratings: anon insert" ON satisfaction_ratings FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY "satisfaction_ratings: anon select" ON satisfaction_ratings FOR SELECT TO anon
  USING (true);

-- ── INVENTORY_PRODUCTS ──────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage inventory_products" ON inventory_products;
CREATE POLICY "inventory_products: store" ON inventory_products FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── INVENTORY_MOVEMENTS ─────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can insert inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can delete inventory_movements" ON inventory_movements;
CREATE POLICY "inventory_movements: store" ON inventory_movements FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
CREATE POLICY "inventory_movements: service_role" ON inventory_movements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── BALCAO_ORDERS ───────────────────────────────────────────
DROP POLICY IF EXISTS "Auth users can manage balcao_orders" ON balcao_orders;
CREATE POLICY "balcao_orders: store" ON balcao_orders FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── BALCAO_ITEMS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Auth users can manage balcao_items" ON balcao_items;
CREATE POLICY "balcao_items: store" ON balcao_items FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── APPOINTMENTS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON appointments;
CREATE POLICY "appointments: store" ON appointments FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── FIADOS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "fiados_demo_all" ON fiados;
CREATE POLICY "fiados: store" ON fiados FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── FIADO_PAYMENTS ──────────────────────────────────────────
DROP POLICY IF EXISTS "fiado_payments_demo_all" ON fiado_payments;
CREATE POLICY "fiado_payments: store" ON fiado_payments FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── FIADO_MESSAGES ──────────────────────────────────────────
DROP POLICY IF EXISTS "fiado_messages_demo_all" ON fiado_messages;
CREATE POLICY "fiado_messages: store" ON fiado_messages FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── BOLETOS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "boletos: store members only" ON boletos;
DROP POLICY IF EXISTS "boletos_all" ON boletos;
CREATE POLICY "boletos: store" ON boletos FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── MAINTENANCE_KEYWORDS ────────────────────────────────────
DROP POLICY IF EXISTS "Enable read access for all users" ON maintenance_keywords;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON maintenance_keywords;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON maintenance_keywords;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON maintenance_keywords;
CREATE POLICY "maintenance_keywords: store" ON maintenance_keywords FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── MAINTENANCE_REMINDERS ───────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated to read reminders" ON maintenance_reminders;
DROP POLICY IF EXISTS "Allow authenticated to insert reminders" ON maintenance_reminders;
DROP POLICY IF EXISTS "Allow authenticated to update reminders" ON maintenance_reminders;
CREATE POLICY "maintenance_reminders: store" ON maintenance_reminders FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
CREATE POLICY "maintenance_reminders: service_role" ON maintenance_reminders FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── MAINTENANCE_REMINDER_HISTORY ────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage reminder history" ON maintenance_reminder_history;
DROP POLICY IF EXISTS "maintenance_reminder_history_all" ON maintenance_reminder_history;
CREATE POLICY "maintenance_reminder_history: store" ON maintenance_reminder_history FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
CREATE POLICY "maintenance_reminder_history: service_role" ON maintenance_reminder_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── BIRTHDAY_DISCOUNTS ──────────────────────────────────────
DROP POLICY IF EXISTS "Allow all operations on birthday_discounts" ON birthday_discounts;
CREATE POLICY "birthday_discounts: store" ON birthday_discounts FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

-- ── CONVERSATION_STATE ──────────────────────────────────────
DROP POLICY IF EXISTS "service role full access" ON conversation_state;
CREATE POLICY "conversation_state: service_role" ON conversation_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);
