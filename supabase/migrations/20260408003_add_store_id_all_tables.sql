-- ============================================================
-- STEP 3: Adiciona store_id em todas as tabelas de negócio
-- Faz backfill automático com o único store existente
-- ============================================================

DO $$
DECLARE v_store_id UUID;
BEGIN
  SELECT id INTO v_store_id FROM store_settings LIMIT 1;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma linha em store_settings. Crie uma antes de rodar esta migration.';
  END IF;

  -- ── MECHANICS ───────────────────────────────────────────────
  ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE mechanics SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE mechanics ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_mechanics_store_id ON mechanics(store_id);

  -- ── STAFF_MEMBERS ───────────────────────────────────────────
  ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE staff_members SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE staff_members ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_staff_members_store_id ON staff_members(store_id);

  -- ── CLIENTS ─────────────────────────────────────────────────
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE clients SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE clients ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_clients_store_id ON clients(store_id);

  -- ── MOTORCYCLES ─────────────────────────────────────────────
  ALTER TABLE motorcycles ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE motorcycles SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE motorcycles ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_motorcycles_store_id ON motorcycles(store_id);

  -- ── MAINTENANCE_KEYWORDS ────────────────────────────────────
  -- keyword era UNIQUE global → vira UNIQUE(store_id, keyword)
  ALTER TABLE maintenance_keywords DROP CONSTRAINT IF EXISTS maintenance_keywords_keyword_key;
  ALTER TABLE maintenance_keywords ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE maintenance_keywords SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE maintenance_keywords ALTER COLUMN store_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_keywords_store_keyword ON maintenance_keywords(store_id, keyword);
  CREATE INDEX IF NOT EXISTS idx_maintenance_keywords_store_id ON maintenance_keywords(store_id);

  -- ── INVENTORY_PRODUCTS ──────────────────────────────────────
  -- code era UNIQUE global → vira UNIQUE(store_id, code)
  ALTER TABLE inventory_products DROP CONSTRAINT IF EXISTS inventory_products_code_key;
  ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE inventory_products SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE inventory_products ALTER COLUMN store_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_products_store_code ON inventory_products(store_id, code) WHERE code IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_inventory_products_store_id ON inventory_products(store_id);

  -- ── SERVICE_ORDERS ──────────────────────────────────────────
  ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE service_orders SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE service_orders ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_service_orders_store_id ON service_orders(store_id);

  -- ── MATERIALS ───────────────────────────────────────────────
  ALTER TABLE materials ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE materials SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE materials ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_materials_store_id ON materials(store_id);

  -- ── PAYMENTS ────────────────────────────────────────────────
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE payments SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE payments ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_payments_store_id ON payments(store_id);

  -- ── CASH_FLOW ───────────────────────────────────────────────
  ALTER TABLE cash_flow ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE cash_flow SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE cash_flow ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_cash_flow_store_id ON cash_flow(store_id);

  -- ── CHECKLIST_ITEMS ─────────────────────────────────────────
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE checklist_items SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE checklist_items ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_checklist_items_store_id ON checklist_items(store_id);

  -- ── CHECKLIST_PHOTOS ────────────────────────────────────────
  ALTER TABLE checklist_photos ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE checklist_photos SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE checklist_photos ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_checklist_photos_store_id ON checklist_photos(store_id);

  -- ── SATISFACTION_RATINGS ────────────────────────────────────
  ALTER TABLE satisfaction_ratings ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE satisfaction_ratings SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE satisfaction_ratings ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_satisfaction_ratings_store_id ON satisfaction_ratings(store_id);

  -- ── INVENTORY_MOVEMENTS ─────────────────────────────────────
  ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE inventory_movements SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE inventory_movements ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_inventory_movements_store_id ON inventory_movements(store_id);

  -- ── BALCAO_ORDERS ───────────────────────────────────────────
  ALTER TABLE balcao_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE balcao_orders SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE balcao_orders ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_balcao_orders_store_id ON balcao_orders(store_id);

  -- ── BALCAO_ITEMS ────────────────────────────────────────────
  ALTER TABLE balcao_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE balcao_items SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE balcao_items ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_balcao_items_store_id ON balcao_items(store_id);

  -- ── APPOINTMENTS ────────────────────────────────────────────
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE appointments SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE appointments ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_appointments_store_id ON appointments(store_id);

  -- ── FIADOS ──────────────────────────────────────────────────
  ALTER TABLE fiados ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE fiados SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE fiados ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_fiados_store_id ON fiados(store_id);

  -- ── FIADO_PAYMENTS ──────────────────────────────────────────
  ALTER TABLE fiado_payments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE fiado_payments SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE fiado_payments ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_fiado_payments_store_id ON fiado_payments(store_id);

  -- ── FIADO_MESSAGES ──────────────────────────────────────────
  ALTER TABLE fiado_messages ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE fiado_messages SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE fiado_messages ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_fiado_messages_store_id ON fiado_messages(store_id);

  -- ── MAINTENANCE_REMINDERS ───────────────────────────────────
  ALTER TABLE maintenance_reminders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE maintenance_reminders SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE maintenance_reminders ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_store_id ON maintenance_reminders(store_id);

  -- ── MAINTENANCE_REMINDER_HISTORY ────────────────────────────
  ALTER TABLE maintenance_reminder_history ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE maintenance_reminder_history SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE maintenance_reminder_history ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_maintenance_reminder_history_store_id ON maintenance_reminder_history(store_id);

  -- ── BIRTHDAY_DISCOUNTS ──────────────────────────────────────
  ALTER TABLE birthday_discounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE birthday_discounts SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE birthday_discounts ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_birthday_discounts_store_id ON birthday_discounts(store_id);

  -- ── BOLETOS ─────────────────────────────────────────────────
  -- boletos já tem store_id mas pode não ter o FK correto
  ALTER TABLE boletos ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE boletos SET store_id = v_store_id WHERE store_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_boletos_store_id ON boletos(store_id);

  -- ── CONVERSATION_STATE ──────────────────────────────────────
  -- phone era UNIQUE global → vira UNIQUE(store_id, phone)
  ALTER TABLE conversation_state DROP CONSTRAINT IF EXISTS conversation_state_phone_key;
  ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE conversation_state SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE conversation_state ALTER COLUMN store_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_state_store_phone ON conversation_state(store_id, phone);
  CREATE INDEX IF NOT EXISTS idx_conversation_state_store_id ON conversation_state(store_id);

END $$;

NOTIFY pgrst, 'reload schema';
