-- ============================================================
-- MIGRATION MULTI-TENANT BANDARA MOTOS
-- Cole tudo no SQL Editor do Supabase (projeto xqndblstrblqleraepzs)
-- ============================================================

-- STEP 1: Funções e tabela store_members
CREATE TABLE IF NOT EXISTS store_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner'
               CHECK (role IN ('owner', 'admin', 'mechanic', 'receptionist')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_id, user_id)
);
ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_members: self read" ON store_members;
CREATE POLICY "store_members: self read" ON store_members FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "store_members: service_role all" ON store_members;
CREATE POLICY "store_members: service_role all" ON store_members FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION get_my_store_id() RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT store_id FROM store_members WHERE user_id = auth.uid() AND active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_saas_admin() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'is_saas_admin' = 'true');
$$;

-- STEP 2: Novos campos em store_settings
DROP INDEX IF EXISTS store_settings_single_row;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise'));
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS owner_email TEXT;

UPDATE store_settings SET plan = 'enterprise', active = true WHERE plan IS NULL OR plan = 'trial';

DROP POLICY IF EXISTS "anon can read settings" ON store_settings;
DROP POLICY IF EXISTS "authenticated can read settings" ON store_settings;
DROP POLICY IF EXISTS "authenticated can upsert settings" ON store_settings;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_settings: member read" ON store_settings;
CREATE POLICY "store_settings: member read" ON store_settings FOR SELECT TO authenticated USING (id = get_my_store_id());
DROP POLICY IF EXISTS "store_settings: owner update" ON store_settings;
CREATE POLICY "store_settings: owner update" ON store_settings FOR UPDATE TO authenticated USING (id = get_my_store_id());
DROP POLICY IF EXISTS "store_settings: anon read" ON store_settings;
CREATE POLICY "store_settings: anon read" ON store_settings FOR SELECT TO anon USING (active = true);
DROP POLICY IF EXISTS "store_settings: saas_admin all" ON store_settings;
CREATE POLICY "store_settings: saas_admin all" ON store_settings FOR ALL TO authenticated USING (is_saas_admin()) WITH CHECK (is_saas_admin());
DROP POLICY IF EXISTS "store_settings: service_role all" ON store_settings;
CREATE POLICY "store_settings: service_role all" ON store_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- STEP 3: store_id em todas as tabelas + backfill
DO $$
DECLARE v_store_id UUID;
BEGIN
  SELECT id INTO v_store_id FROM store_settings LIMIT 1;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma linha em store_settings. Crie uma antes de rodar esta migration.';
  END IF;

  ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE mechanics SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE mechanics ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_mechanics_store_id ON mechanics(store_id);

  ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE staff_members SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE staff_members ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_staff_members_store_id ON staff_members(store_id);

  ALTER TABLE clients ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE clients SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE clients ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_clients_store_id ON clients(store_id);

  ALTER TABLE motorcycles ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE motorcycles SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE motorcycles ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_motorcycles_store_id ON motorcycles(store_id);

  ALTER TABLE maintenance_keywords DROP CONSTRAINT IF EXISTS maintenance_keywords_keyword_key;
  ALTER TABLE maintenance_keywords ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE maintenance_keywords SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE maintenance_keywords ALTER COLUMN store_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_keywords_store_keyword ON maintenance_keywords(store_id, keyword);
  CREATE INDEX IF NOT EXISTS idx_maintenance_keywords_store_id ON maintenance_keywords(store_id);

  ALTER TABLE inventory_products DROP CONSTRAINT IF EXISTS inventory_products_code_key;
  ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE inventory_products SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE inventory_products ALTER COLUMN store_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_products_store_code ON inventory_products(store_id, code) WHERE code IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_inventory_products_store_id ON inventory_products(store_id);

  ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE service_orders SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE service_orders ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_service_orders_store_id ON service_orders(store_id);

  ALTER TABLE materials ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE materials SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE materials ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_materials_store_id ON materials(store_id);

  ALTER TABLE payments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE payments SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE payments ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_payments_store_id ON payments(store_id);

  ALTER TABLE cash_flow ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE cash_flow SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE cash_flow ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_cash_flow_store_id ON cash_flow(store_id);

  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE checklist_items SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE checklist_items ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_checklist_items_store_id ON checklist_items(store_id);

  ALTER TABLE checklist_photos ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE checklist_photos SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE checklist_photos ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_checklist_photos_store_id ON checklist_photos(store_id);

  ALTER TABLE satisfaction_ratings ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE satisfaction_ratings SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE satisfaction_ratings ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_satisfaction_ratings_store_id ON satisfaction_ratings(store_id);

  ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE inventory_movements SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE inventory_movements ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_inventory_movements_store_id ON inventory_movements(store_id);

  ALTER TABLE balcao_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE balcao_orders SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE balcao_orders ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_balcao_orders_store_id ON balcao_orders(store_id);

  ALTER TABLE balcao_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE balcao_items SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE balcao_items ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_balcao_items_store_id ON balcao_items(store_id);

  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE appointments SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE appointments ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_appointments_store_id ON appointments(store_id);

  ALTER TABLE fiados ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE fiados SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE fiados ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_fiados_store_id ON fiados(store_id);

  ALTER TABLE fiado_payments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE fiado_payments SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE fiado_payments ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_fiado_payments_store_id ON fiado_payments(store_id);

  ALTER TABLE fiado_messages ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE fiado_messages SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE fiado_messages ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_fiado_messages_store_id ON fiado_messages(store_id);

  ALTER TABLE maintenance_reminders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE maintenance_reminders SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE maintenance_reminders ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_store_id ON maintenance_reminders(store_id);

  ALTER TABLE maintenance_reminder_history ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE maintenance_reminder_history SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE maintenance_reminder_history ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_maintenance_reminder_history_store_id ON maintenance_reminder_history(store_id);

  ALTER TABLE birthday_discounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE birthday_discounts SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE birthday_discounts ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_birthday_discounts_store_id ON birthday_discounts(store_id);

  ALTER TABLE boletos ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE boletos SET store_id = v_store_id WHERE store_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_boletos_store_id ON boletos(store_id);

  ALTER TABLE conversation_state DROP CONSTRAINT IF EXISTS conversation_state_phone_key;
  ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES store_settings(id) ON DELETE CASCADE;
  UPDATE conversation_state SET store_id = v_store_id WHERE store_id IS NULL;
  ALTER TABLE conversation_state ALTER COLUMN store_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_state_store_phone ON conversation_state(store_id, phone);
  CREATE INDEX IF NOT EXISTS idx_conversation_state_store_id ON conversation_state(store_id);
END $$;

-- STEP 4: Políticas RLS por store
DROP POLICY IF EXISTS "mechanics_all" ON mechanics;
CREATE POLICY "mechanics: store" ON mechanics FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "staff_members_all" ON staff_members;
CREATE POLICY "staff_members: store" ON staff_members FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "clients_all" ON clients;
CREATE POLICY "clients: store" ON clients FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "motorcycles_all" ON motorcycles;
CREATE POLICY "motorcycles: store" ON motorcycles FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Allow all operations on service_orders" ON service_orders;
CREATE POLICY "service_orders: store" ON service_orders FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "materials_select" ON materials;
DROP POLICY IF EXISTS "materials_insert" ON materials;
DROP POLICY IF EXISTS "materials_update" ON materials;
DROP POLICY IF EXISTS "materials_delete" ON materials;
CREATE POLICY "materials: store" ON materials FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "payments_all" ON payments;
CREATE POLICY "payments: store" ON payments FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Permitir leitura para todos usuários autenticados" ON cash_flow;
DROP POLICY IF EXISTS "Permitir inserção para usuários autenticados" ON cash_flow;
DROP POLICY IF EXISTS "Permitir atualização para usuários autenticados" ON cash_flow;
DROP POLICY IF EXISTS "Permitir exclusão para usuários autenticados" ON cash_flow;
CREATE POLICY "cash_flow: store" ON cash_flow FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
DROP POLICY IF EXISTS "cash_flow: service_role" ON cash_flow;
CREATE POLICY "cash_flow: service_role" ON cash_flow FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on checklist_items" ON checklist_items;
CREATE POLICY "checklist_items: store" ON checklist_items FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "checklist_photos_all" ON checklist_photos;
CREATE POLICY "checklist_photos: store" ON checklist_photos FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "satisfaction_ratings_all" ON satisfaction_ratings;
CREATE POLICY "satisfaction_ratings: store" ON satisfaction_ratings FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
DROP POLICY IF EXISTS "satisfaction_ratings: anon insert" ON satisfaction_ratings;
CREATE POLICY "satisfaction_ratings: anon insert" ON satisfaction_ratings FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "satisfaction_ratings: anon select" ON satisfaction_ratings;
CREATE POLICY "satisfaction_ratings: anon select" ON satisfaction_ratings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage inventory_products" ON inventory_products;
CREATE POLICY "inventory_products: store" ON inventory_products FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Authenticated users can view inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can insert inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can delete inventory_movements" ON inventory_movements;
CREATE POLICY "inventory_movements: store" ON inventory_movements FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
DROP POLICY IF EXISTS "inventory_movements: service_role" ON inventory_movements;
CREATE POLICY "inventory_movements: service_role" ON inventory_movements FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth users can manage balcao_orders" ON balcao_orders;
CREATE POLICY "balcao_orders: store" ON balcao_orders FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Auth users can manage balcao_items" ON balcao_items;
CREATE POLICY "balcao_items: store" ON balcao_items FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON appointments;
CREATE POLICY "appointments: store" ON appointments FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "fiados_demo_all" ON fiados;
CREATE POLICY "fiados: store" ON fiados FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "fiado_payments_demo_all" ON fiado_payments;
CREATE POLICY "fiado_payments: store" ON fiado_payments FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "fiado_messages_demo_all" ON fiado_messages;
CREATE POLICY "fiado_messages: store" ON fiado_messages FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "boletos: store members only" ON boletos;
DROP POLICY IF EXISTS "boletos_all" ON boletos;
CREATE POLICY "boletos: store" ON boletos FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Enable read access for all users" ON maintenance_keywords;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON maintenance_keywords;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON maintenance_keywords;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON maintenance_keywords;
CREATE POLICY "maintenance_keywords: store" ON maintenance_keywords FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "Allow authenticated to read reminders" ON maintenance_reminders;
DROP POLICY IF EXISTS "Allow authenticated to insert reminders" ON maintenance_reminders;
DROP POLICY IF EXISTS "Allow authenticated to update reminders" ON maintenance_reminders;
CREATE POLICY "maintenance_reminders: store" ON maintenance_reminders FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
DROP POLICY IF EXISTS "maintenance_reminders: service_role" ON maintenance_reminders;
CREATE POLICY "maintenance_reminders: service_role" ON maintenance_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage reminder history" ON maintenance_reminder_history;
DROP POLICY IF EXISTS "maintenance_reminder_history_all" ON maintenance_reminder_history;
CREATE POLICY "maintenance_reminder_history: store" ON maintenance_reminder_history FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());
DROP POLICY IF EXISTS "maintenance_reminder_history: service_role" ON maintenance_reminder_history;
CREATE POLICY "maintenance_reminder_history: service_role" ON maintenance_reminder_history FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on birthday_discounts" ON birthday_discounts;
CREATE POLICY "birthday_discounts: store" ON birthday_discounts FOR ALL TO authenticated USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

DROP POLICY IF EXISTS "service role full access" ON conversation_state;
CREATE POLICY "conversation_state: service_role" ON conversation_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- STEP 5: Corrige triggers para propagar store_id
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, order_id, payment_id, date)
  SELECT so.store_id, 'entrada', NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço', NEW.method, NEW.order_id, NEW.id, CURRENT_DATE
  FROM service_orders so WHERE so.id = NEW.order_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_auto_deduct_stock_on_material()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.is_service IS NULL OR NEW.is_service = false) THEN
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_cost, unit_price, order_id, material_id, notes)
    VALUES (NEW.store_id, NEW.product_id, 'saida_os', COALESCE(NEW.quantidade::NUMERIC, 1), NULL, NEW.valor, NEW.order_id, NEW.id, 'Baixa automática via OS');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_restore_stock_on_material_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.product_id IS NOT NULL AND (OLD.is_service IS NULL OR OLD.is_service = false) THEN
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, order_id, material_id, notes)
    VALUES (OLD.store_id, OLD.product_id, 'devolucao', COALESCE(OLD.quantidade::NUMERIC, 1), OLD.order_id, OLD.id, 'Devolução automática — material removido da OS');
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_sale_in_cash_flow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_product_name TEXT;
BEGIN
  IF NEW.type = 'saida_venda' THEN
    SELECT name INTO v_product_name FROM inventory_products WHERE id = NEW.product_id;
    INSERT INTO cash_flow (store_id, type, amount, description, date)
    VALUES (NEW.store_id, 'entrada', NEW.quantity * COALESCE(NEW.unit_price, 0), 'Venda avulsa: ' || COALESCE(v_product_name, 'Produto'), CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

-- STEP 6: balcao_orders aceita status 'fiado'
ALTER TABLE balcao_orders DROP CONSTRAINT IF EXISTS balcao_orders_status_check;
ALTER TABLE balcao_orders ADD CONSTRAINT balcao_orders_status_check
  CHECK (status IN ('aberta', 'finalizada', 'cancelada', 'fiado'));

-- STEP 7: Vincular usuário Bandara ao store
INSERT INTO store_members (store_id, user_id, role)
SELECT id, '48f06c9e-6552-4f87-82e3-5cbd993ac5dc', 'owner'
FROM store_settings
LIMIT 1
ON CONFLICT (store_id, user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
