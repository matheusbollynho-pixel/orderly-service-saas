-- =============================================================================
-- COMPLETE SCHEMA - Orderly Service SaaS
-- Generated from all migrations in chronological order
-- Idempotent: safe to run on a fresh Supabase project
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- =============================================================================
-- ENUMS
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('aberta', 'em_andamento', 'concluida', 'concluida_entregue');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Garante que concluida_entregue existe mesmo se o enum já existia
DO $$ BEGIN
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'concluida_entregue';
EXCEPTION WHEN others THEN NULL;
END $$;

-- =============================================================================
-- FUNCTION: update_updated_at_column (must exist before triggers)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================================
-- TABLE: mechanics
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.mechanics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mechanics_all ON public.mechanics;
CREATE POLICY mechanics_all ON public.mechanics FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_mechanics_updated_at ON public.mechanics;
CREATE TRIGGER update_mechanics_updated_at
  BEFORE UPDATE ON public.mechanics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- TABLE: clients
-- (created before service_orders because service_orders may reference it)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  cpf                 TEXT UNIQUE NOT NULL,
  phone               TEXT,
  email               TEXT,
  whatsapp            TEXT,
  apelido             TEXT,
  instagram           TEXT,
  autoriza_instagram  BOOLEAN NOT NULL DEFAULT false,
  endereco            TEXT,
  cidade              TEXT,
  state               TEXT,
  notes               TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  birth_date          DATE,                                   -- from 202601230910
  autoriza_lembretes  BOOLEAN NOT NULL DEFAULT true,         -- from 202602160930
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_all ON public.clients;
CREATE POLICY clients_all ON public.clients FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS clients_cpf_idx   ON public.clients(cpf);
CREATE INDEX IF NOT EXISTS clients_name_idx  ON public.clients(name);
CREATE INDEX IF NOT EXISTS clients_phone_idx ON public.clients(phone);

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- TABLE: motorcycles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.motorcycles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  placa      TEXT UNIQUE NOT NULL,
  marca      TEXT NOT NULL,
  modelo     TEXT NOT NULL,
  ano        INTEGER,
  cilindrada TEXT,
  cor        TEXT,
  motor      TEXT,
  chassi     TEXT UNIQUE,
  notes      TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.motorcycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS motorcycles_all ON public.motorcycles;
CREATE POLICY motorcycles_all ON public.motorcycles FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS motorcycles_placa_idx     ON public.motorcycles(placa);
CREATE INDEX IF NOT EXISTS motorcycles_client_id_idx ON public.motorcycles(client_id);

DROP TRIGGER IF EXISTS update_motorcycles_updated_at ON public.motorcycles;
CREATE TRIGGER update_motorcycles_updated_at
  BEFORE UPDATE ON public.motorcycles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- TABLE: staff_members  (must exist before service_orders references it)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.staff_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('balconista', 'dono', 'outro')),
  photo_url  TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_members_all ON public.staff_members;
CREATE POLICY staff_members_all ON public.staff_members FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_staff_members_updated_at ON public.staff_members;
CREATE TRIGGER update_staff_members_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- TABLE: service_orders
-- Includes all columns added by subsequent ALTER TABLE migrations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.service_orders (
  id                           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name                  TEXT NOT NULL,
  client_phone                 TEXT NOT NULL,
  client_address               TEXT NOT NULL,
  equipment                    TEXT NOT NULL,
  problem_description          TEXT NOT NULL,
  status                       order_status NOT NULL DEFAULT 'aberta',
  signature_data               TEXT,
  -- from 202601230901
  mechanic_id                  UUID REFERENCES public.mechanics(id) ON DELETE SET NULL,
  -- from 202601230906
  entry_date                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  exit_date                    TIMESTAMP WITH TIME ZONE,
  -- from 202601230908
  client_apelido               TEXT NOT NULL DEFAULT '',
  client_instagram             TEXT NOT NULL DEFAULT '',
  autoriza_instagram           BOOLEAN NOT NULL DEFAULT false,
  -- from 202601231030
  client_cpf                   TEXT NOT NULL DEFAULT '',
  -- from 202601231100
  client_birth_date            DATE,
  -- from 202601231500
  satisfaction_survey_sent_at  TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  -- from 202601290002
  terms_accepted               BOOLEAN DEFAULT false,
  -- from 202603030002 (staff tracking)
  atendimento_id               UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  -- from 202603030003
  created_by_staff_id          UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  finalized_by_staff_id        UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  -- from 202603060001
  delivery_terms_accepted      BOOLEAN NOT NULL DEFAULT false,
  delivery_signature_data      TEXT NULL,
  first_signature_data         TEXT NULL,
  first_delivery_signature_data TEXT NULL,
  -- client/motorcycle FK
  client_id                    UUID,
  motorcycle_id                UUID,
  conclusion_date              TIMESTAMPTZ,
  -- delivery person info
  delivery_person_type         TEXT,
  delivery_person_name         TEXT,
  delivery_person_phone        TEXT,
  delivery_person_cpf          TEXT,
  -- lembretes
  autoriza_lembretes           BOOLEAN NOT NULL DEFAULT true,
  created_at                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.service_orders.entry_date IS 'Data de entrada da moto';
COMMENT ON COLUMN public.service_orders.exit_date IS 'Data de saída da moto';
COMMENT ON COLUMN public.service_orders.client_birth_date IS 'Data de nascimento do cliente para campanha de aniversário';
COMMENT ON COLUMN public.service_orders.satisfaction_survey_sent_at IS 'Data/hora em que a pesquisa de satisfação foi enviada';
COMMENT ON COLUMN public.service_orders.created_by_staff_id IS 'Staff member who created this service order';
COMMENT ON COLUMN public.service_orders.finalized_by_staff_id IS 'Staff member who finalized/received the payment';

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on service_orders" ON public.service_orders;
CREATE POLICY "Allow all operations on service_orders"
  ON public.service_orders
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_service_orders_updated_at ON public.service_orders;
CREATE TRIGGER update_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS service_orders_atendimento_id_idx
  ON public.service_orders(atendimento_id);

CREATE INDEX IF NOT EXISTS idx_satisfaction_survey_sent
  ON public.service_orders(satisfaction_survey_sent_at)
  WHERE satisfaction_survey_sent_at IS NULL;

-- =============================================================================
-- TABLE: checklist_items
-- Includes photo_url added later (202602140001)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id     UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
  label        TEXT NOT NULL,
  completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  photo_url    TEXT,
  item_type    TEXT NOT NULL DEFAULT 'checklist',
  rating       INTEGER,
  observations TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on checklist_items" ON public.checklist_items;
CREATE POLICY "Allow all operations on checklist_items"
  ON public.checklist_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- TABLE: checklist_photos  (from 202602140001)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.checklist_photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  order_id          UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  photo_url         TEXT NOT NULL,
  storage_path      TEXT,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checklist_photos IS 'Rastreamento de fotos para limpeza automática após 100 dias';
COMMENT ON COLUMN public.checklist_photos.uploaded_at IS 'Data de upload da foto (usada para limpeza automática)';
COMMENT ON COLUMN public.checklist_photos.storage_path IS 'Caminho no Supabase Storage para referência de deleção';

ALTER TABLE public.checklist_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_photos_all ON public.checklist_photos;
CREATE POLICY checklist_photos_all ON public.checklist_photos FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS checklist_photos_uploaded_at_idx ON public.checklist_photos(uploaded_at);
CREATE INDEX IF NOT EXISTS checklist_photos_order_id_idx    ON public.checklist_photos(order_id);

-- Note: checklist_photos does not have an updated_at column so no trigger needed

-- =============================================================================
-- TABLE: materials
-- Includes all columns added by ALTER TABLE in later migrations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.materials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  descricao      TEXT NOT NULL,
  quantidade     TEXT NOT NULL,
  valor          NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_service     BOOLEAN NOT NULL DEFAULT false,         -- from 202601230909
  paid_at        TIMESTAMPTZ,                            -- from 202601230903
  payment_method TEXT CHECK (payment_method IN         -- from 202601262100
    ('dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro')),
  type           TEXT DEFAULT 'entrada'                  -- from 202601262200
    CHECK (type IN ('entrada', 'saida', 'retirada')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.materials.payment_method IS 'Forma de pagamento do item: dinheiro, pix, credito, debito, transferencia ou outro';
COMMENT ON COLUMN public.materials.type IS 'Tipo do item: entrada (receita/serviço), saida (despesa/material), retirada (retirada de caixa)';

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS materials_select ON public.materials;
DROP POLICY IF EXISTS materials_insert ON public.materials;
DROP POLICY IF EXISTS materials_update ON public.materials;
DROP POLICY IF EXISTS materials_delete ON public.materials;

CREATE POLICY materials_select ON public.materials FOR SELECT USING (true);
CREATE POLICY materials_insert ON public.materials FOR INSERT WITH CHECK (true);
CREATE POLICY materials_update ON public.materials FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY materials_delete ON public.materials FOR DELETE USING (true);

DROP TRIGGER IF EXISTS update_materials_updated_at ON public.materials;
CREATE TRIGGER update_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- TABLE: payments
-- Includes all columns added by later migrations
-- Final method constraint includes 'cartao' (from 202601290001)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  method          TEXT NOT NULL CHECK (method IN
    ('dinheiro','pix','cartao','credito','debito','transferencia','outro')),
  reference       TEXT,
  notes           TEXT,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0    -- from 202603020001
    CHECK (discount_amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_all ON public.payments;
CREATE POLICY payments_all ON public.payments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments(order_id);

-- =============================================================================
-- TABLE: cash_flow
-- Includes material_id column (from 202601280200) and all subsequent changes
-- Final payment_method constraint includes 'cartao' (from 202601280400)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cash_flow (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'retirada')),
  amount         DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  description    TEXT NOT NULL,
  category       TEXT,
  payment_method TEXT CHECK (payment_method IN
    ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro')),
  order_id       UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  payment_id     UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  material_id    UUID REFERENCES public.materials(id) ON DELETE CASCADE,  -- from 202601280200
  created_at     TIMESTAMPTZ DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id),
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT
);

-- RLS: disabled (disabled in 202601262300) — access is fully open via anon/authenticated
ALTER TABLE public.cash_flow DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cash_flow_date       ON public.cash_flow(date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_flow_type       ON public.cash_flow(type);
CREATE INDEX IF NOT EXISTS idx_cash_flow_order      ON public.cash_flow(order_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_payment    ON public.cash_flow(payment_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_material_id ON public.cash_flow(material_id);  -- from 202601280200

-- Unique index: one cash_flow entry per payment (from 202602010003 / 202602010004)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_flow_payment_unique
  ON public.cash_flow(payment_id)
  WHERE payment_id IS NOT NULL;

-- =============================================================================
-- TABLE: birthday_discounts  (from 202601230910)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.birthday_discounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_order_id    UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,
  discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  starts_at           TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active           BOOLEAN DEFAULT TRUE,
  message_sent_at     TIMESTAMP WITH TIME ZONE,
  reminder_sent_at    TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.birthday_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on birthday_discounts" ON public.birthday_discounts;
CREATE POLICY "Allow all operations on birthday_discounts"
  ON public.birthday_discounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_birthday_discounts_expires_at ON public.birthday_discounts(expires_at);
CREATE INDEX IF NOT EXISTS idx_birthday_discounts_client_id  ON public.birthday_discounts(client_id);

-- =============================================================================
-- TABLE: maintenance_keywords  (from 202602170000)
-- RLS policies revised in 202603030001
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_keywords (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword          VARCHAR(255) NOT NULL UNIQUE,
  description      TEXT,
  reminder_days    INTEGER NOT NULL DEFAULT 90,
  reminder_message TEXT,
  enabled          BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.maintenance_keywords ENABLE ROW LEVEL SECURITY;

-- Drop any old policies before re-creating (from 202602170000 and 202603030001)
DROP POLICY IF EXISTS "Allow authenticated to read keywords"   ON public.maintenance_keywords;
DROP POLICY IF EXISTS "Allow authenticated to insert keywords" ON public.maintenance_keywords;
DROP POLICY IF EXISTS "Allow authenticated to update keywords" ON public.maintenance_keywords;
DROP POLICY IF EXISTS "Enable delete for authenticated users"  ON public.maintenance_keywords;
DROP POLICY IF EXISTS "Enable read access for all users"       ON public.maintenance_keywords;
DROP POLICY IF EXISTS "Enable insert for authenticated users"  ON public.maintenance_keywords;
DROP POLICY IF EXISTS "Enable update for authenticated users"  ON public.maintenance_keywords;

CREATE POLICY "Enable read access for all users"
  ON public.maintenance_keywords FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users"
  ON public.maintenance_keywords FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users"
  ON public.maintenance_keywords FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users"
  ON public.maintenance_keywords FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_maintenance_keywords_enabled ON public.maintenance_keywords(enabled);

-- Seed default keywords
INSERT INTO public.maintenance_keywords (keyword, description, reminder_days, reminder_message, enabled)
VALUES
  ('Óleo',       'Troca de óleo do motor',             90,  'Olá! Já se passaram {days} dias desde que você trocou o óleo. É hora de fazer a manutenção! 🛢️', true),
  ('Revisão',    'Revisão preventiva da moto',          180, 'Olá! Sua moto está no prazo para revisão preventiva. Agende agora! 🔧', true),
  ('Pneu',       'Troca/Verificação de pneu',           365, 'Olá! É hora de verificar a pressão e condição dos seus pneus. 🛞', true),
  ('Bateria',    'Verificação/Troca de bateria',        365, 'Olá! Faça uma revisão na bateria da sua moto. 🔋', true),
  ('Corrente',   'Limpeza e lubricação da corrente',   90,  'Olá! É hora de limpar e lubrificar a corrente da sua moto. ⛓️', true),
  ('Filtro de Ar','Troca de filtro de ar',              180, 'Olá! Seu filtro de ar pode estar saturado. Venha fazer a troca! 💨', true)
ON CONFLICT (keyword) DO NOTHING;

-- =============================================================================
-- TABLE: maintenance_reminders  (from 202602170000)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_reminders (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id         UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  client_id        UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  keyword_id       UUID NOT NULL REFERENCES public.maintenance_keywords(id) ON DELETE CASCADE,
  service_date     TIMESTAMPTZ NOT NULL,
  reminder_due_date TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  client_phone     VARCHAR(20),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.maintenance_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to read reminders"   ON public.maintenance_reminders;
DROP POLICY IF EXISTS "Allow authenticated to insert reminders" ON public.maintenance_reminders;
DROP POLICY IF EXISTS "Allow authenticated to update reminders" ON public.maintenance_reminders;

CREATE POLICY "Allow authenticated to read reminders"
  ON public.maintenance_reminders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated to insert reminders"
  ON public.maintenance_reminders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated to update reminders"
  ON public.maintenance_reminders FOR UPDATE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_due_date ON public.maintenance_reminders(reminder_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_sent_at  ON public.maintenance_reminders(reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_client   ON public.maintenance_reminders(client_id);

-- =============================================================================
-- TABLE: satisfaction_ratings  (from 202603030002)
-- order_id made nullable in 202603050001
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.satisfaction_ratings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,  -- nullable (202603050001)
  client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  atendimento_id    UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  mechanic_id       UUID REFERENCES public.mechanics(id) ON DELETE SET NULL,
  atendimento_rating INT CHECK (atendimento_rating BETWEEN 1 AND 5),
  servico_rating    INT CHECK (servico_rating BETWEEN 1 AND 5),
  tags              JSONB NOT NULL DEFAULT '{"atendimento":[],"servico":[]}'::jsonb,
  comment           TEXT,
  recommends        BOOLEAN,
  status            TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'resolvido')),
  responded_at      TIMESTAMPTZ,
  public_token      TEXT NOT NULL UNIQUE,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT satisfaction_one_per_order UNIQUE (order_id)
);

ALTER TABLE public.satisfaction_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS satisfaction_ratings_all ON public.satisfaction_ratings;
CREATE POLICY satisfaction_ratings_all ON public.satisfaction_ratings FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_satisfaction_ratings_updated_at ON public.satisfaction_ratings;
CREATE TRIGGER update_satisfaction_ratings_updated_at
  BEFORE UPDATE ON public.satisfaction_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS satisfaction_ratings_order_id_idx       ON public.satisfaction_ratings(order_id);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_atendimento_id_idx ON public.satisfaction_ratings(atendimento_id);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_mechanic_id_idx    ON public.satisfaction_ratings(mechanic_id);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_status_idx         ON public.satisfaction_ratings(status);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_responded_at_idx   ON public.satisfaction_ratings(responded_at DESC);

-- =============================================================================
-- FUNCTIONS: Cash Flow (final versions from latest migrations)
-- =============================================================================

-- sync_payment_to_cash_flow: used for INSERT and UPDATE on payments
-- Final version from 202603120001 (adds SECURITY DEFINER) + 202603020002 (discount)
CREATE OR REPLACE FUNCTION public.sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.cash_flow WHERE payment_id = NEW.id;

  INSERT INTO public.cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE
        WHEN COALESCE(NEW.discount_amount, 0) > 0
          THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    DATE(NEW.created_at)
  FROM public.service_orders so
  WHERE so.id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- register_payment_in_cash_flow: kept for backward compatibility / legacy triggers
-- Final version from 202603120001 (SECURITY DEFINER + discount)
CREATE OR REPLACE FUNCTION public.register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.cash_flow WHERE payment_id = NEW.id;

  INSERT INTO public.cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE
        WHEN COALESCE(NEW.discount_amount, 0) > 0
          THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    DATE(NEW.created_at)
  FROM public.service_orders so
  WHERE so.id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- remove_payment_from_cash_flow: called on DELETE of payments
-- Final version from 202603120001 (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.remove_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.cash_flow WHERE payment_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- register_material_payment_in_cash_flow: called on UPDATE of materials
-- Final version from 202603120001 (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.register_material_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    INSERT INTO public.cash_flow (
      type,
      amount,
      description,
      category,
      payment_method,
      order_id,
      date
    )
    SELECT
      'entrada',
      (NEW.valor * CAST(NEW.quantidade AS NUMERIC))::NUMERIC(10, 2),
      NEW.descricao || ' - Cliente: ' || so.client_name || ' (' || so.equipment || ')',
      CASE WHEN NEW.is_service THEN 'Serviço' ELSE 'Peça' END,
      NEW.payment_method,
      NEW.order_id,
      CURRENT_DATE
    FROM public.service_orders so
    WHERE so.id = NEW.order_id;
  END IF;

  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM public.cash_flow
    WHERE order_id = NEW.order_id
    AND description LIKE (NEW.descricao || '%')
    AND type = 'entrada'
    AND created_at::date = OLD.paid_at::date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- delete_material_from_cash_flow: called on DELETE of materials
-- Final version from 202601280300
CREATE OR REPLACE FUNCTION public.delete_material_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.paid_at IS NOT NULL THEN
    DELETE FROM public.cash_flow
    WHERE order_id = OLD.order_id
    AND type = 'entrada'
    AND description LIKE (OLD.descricao || '%')
    AND date = OLD.paid_at::date;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- update_payment_date_in_cash_flow: called on UPDATE of payments (date changes)
-- From 202601280500
CREATE OR REPLACE FUNCTION public.update_payment_date_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    UPDATE public.cash_flow
    SET date = DATE(NEW.created_at)
    WHERE payment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS: payments -> cash_flow
-- Final active set from 202602010005 + later migrations
-- trigger_payment_insert_cash_flow  (INSERT)
-- trigger_payment_update_cash_flow  (UPDATE on relevant columns)
-- trigger_payment_delete_cash_flow  (DELETE)
-- trigger_payment_send_survey       (INSERT, satisfaction survey via edge fn)
-- =============================================================================
DROP TRIGGER IF EXISTS trigger_register_payment_in_cash_flow   ON public.payments;
DROP TRIGGER IF EXISTS trigger_remove_payment_from_cash_flow   ON public.payments;
DROP TRIGGER IF EXISTS trigger_payment_insert_cash_flow        ON public.payments;
DROP TRIGGER IF EXISTS trigger_payment_update_cash_flow        ON public.payments;
DROP TRIGGER IF EXISTS trigger_payment_delete_cash_flow        ON public.payments;
DROP TRIGGER IF EXISTS trigger_payment_send_survey             ON public.payments;

CREATE TRIGGER trigger_payment_insert_cash_flow
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_payment_to_cash_flow();

CREATE TRIGGER trigger_payment_update_cash_flow
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  WHEN (
    OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
    OR OLD.method IS DISTINCT FROM NEW.method
  )
  EXECUTE FUNCTION public.sync_payment_to_cash_flow();

CREATE TRIGGER trigger_payment_delete_cash_flow
  BEFORE DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_payment_from_cash_flow();

-- =============================================================================
-- FUNCTION: send_satisfaction_survey_after_payment  (from 202602190002)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_send_survey_rpc_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id UUID;
  v_client_phone TEXT;
  v_client_name TEXT;
  v_survey_already_sent BOOLEAN;
  v_http_response JSON;
  v_url TEXT;
BEGIN
  SELECT id, client_phone, client_name, (satisfaction_survey_sent_at IS NOT NULL)
  INTO v_order_id, v_client_phone, v_client_name, v_survey_already_sent
  FROM public.service_orders
  WHERE id = NEW.order_id;

  IF v_order_id IS NOT NULL
    AND v_client_phone IS NOT NULL
    AND NOT v_survey_already_sent THEN

    RAISE LOG '🎯 Trigger v2 disparado para ordem: %, cliente: %', v_order_id, v_client_name;

    UPDATE public.service_orders
    SET satisfaction_survey_sent_at = now()
    WHERE id = v_order_id;

    BEGIN
      BEGIN
        v_url := current_setting('app.supabase_url', true) || '/functions/v1/send-satisfaction-survey';
        IF v_url IS NULL OR v_url = '/functions/v1/send-satisfaction-survey' THEN
          v_url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey';
      END;

      v_http_response := net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Authorization', coalesce('Bearer ' || current_setting('app.supabase_service_role_key', true), 'Bearer service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'order_id', v_order_id::text,
          'client_phone', v_client_phone,
          'client_name', v_client_name,
          'triggered_by', 'payment_trigger_v2',
          'timestamp', now()::text
        )::text,
        timeout_milliseconds := 10000
      );

      RAISE LOG '✅ HTTP POST response for order %: %', v_order_id, v_http_response;

    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '⚠️ HTTP POST failed for order %: % (but payment recorded)', v_order_id, SQLERRM;
    END;
  ELSE
    RAISE LOG '⏭️ Skipping survey for order %: exists=%s, phone=%s, not_sent=%s',
      NEW.order_id, (v_order_id IS NOT NULL), (v_client_phone IS NOT NULL), (NOT v_survey_already_sent);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Satisfaction survey trigger fires AFTER INSERT on payments
CREATE TRIGGER trigger_payment_send_survey
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_survey_rpc_v2();

-- =============================================================================
-- TRIGGERS: materials -> cash_flow
-- =============================================================================
DROP TRIGGER IF EXISTS trigger_register_material_payment_in_cash_flow ON public.materials;
DROP TRIGGER IF EXISTS trigger_delete_material_payment_from_cash_flow  ON public.materials;
DROP TRIGGER IF EXISTS trigger_delete_material_from_cash_flow          ON public.materials;

CREATE TRIGGER trigger_register_material_payment_in_cash_flow
  AFTER UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.register_material_payment_in_cash_flow();

CREATE TRIGGER trigger_delete_material_payment_from_cash_flow
  BEFORE DELETE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_material_from_cash_flow();

-- =============================================================================
-- FUNCTION: delete_old_checklist_photos  (from 202602160002, final version)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_old_checklist_photos()
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  v_deleted INT := 0;
  v_threshold TIMESTAMPTZ;
  v_storage_paths TEXT[];
BEGIN
  v_threshold := NOW() - INTERVAL '100 days';

  SELECT ARRAY_AGG(storage_path) INTO v_storage_paths
  FROM public.checklist_photos
  WHERE uploaded_at < v_threshold;

  DELETE FROM public.checklist_photos
  WHERE uploaded_at < v_threshold;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_old_checklist_photos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_checklist_photos() TO anon;

COMMENT ON FUNCTION public.delete_old_checklist_photos() IS 'Deleta fotos do checklist com mais de 100 dias';

-- =============================================================================
-- FUNCTION: test_satisfaction_survey_4seconds  (from 202602162100)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.test_satisfaction_survey_4seconds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_name TEXT;
  v_order_phone TEXT;
  v_four_seconds_ago TIMESTAMPTZ;
  v_payment_id UUID;
BEGIN
  SELECT id, client_name, client_phone INTO v_order_id, v_order_name, v_order_phone
  FROM public.service_orders
  WHERE client_name ILIKE '%Matheus%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Ordem de Matheus não encontrada');
  END IF;

  IF v_order_phone IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Ordem de Matheus não tem telefone cadastrado');
  END IF;

  v_four_seconds_ago := now() - interval '4 seconds';

  INSERT INTO public.payments (order_id, amount, method, created_at)
  VALUES (v_order_id, 0.01, 'pix', v_four_seconds_ago)
  RETURNING id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Erro ao criar pagamento');
  END IF;

  UPDATE public.service_orders
  SET satisfaction_survey_sent_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', '✅ Pagamento criado! Enviando mensagem para ' || v_order_name || '...',
    'order_name', v_order_name,
    'order_phone', v_order_phone,
    'payment_id', v_payment_id::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_satisfaction_survey_4seconds() TO authenticated;

-- =============================================================================
-- REALTIME PUBLICATIONS
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'checklist_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'materials') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.materials;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mechanics') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mechanics;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cash_flow') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_flow;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'staff_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_members;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'satisfaction_ratings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.satisfaction_ratings;
  END IF;
END $$;

-- =============================================================================
-- CRON JOBS (require pg_cron extension; adjust URLs/keys for your project)
-- =============================================================================

-- Delete old checklist photos daily at midnight UTC
SELECT cron.unschedule('delete-old-checklist-photos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-checklist-photos');

SELECT cron.schedule(
  'delete-old-checklist-photos',
  '0 0 * * *',
  'SELECT public.delete_old_checklist_photos();'
);

-- Send satisfaction survey daily at 08:00 UTC
SELECT cron.unschedule('send-satisfaction-survey-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-satisfaction-survey-daily');

SELECT cron.schedule(
  'send-satisfaction-survey-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('test', false, 'triggered_by', 'cron_job')::text,
    timeout_milliseconds := 10000
  ) as request_id;
  $$
);

-- Check maintenance reminders daily at 08:00 UTC
SELECT cron.unschedule('check_maintenance_reminders_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check_maintenance_reminders_daily');

SELECT cron.schedule(
  'check_maintenance_reminders_daily',
  '0 8 * * *',
  'SELECT net.http_post(
    url := ''https://xqndblstrblqleraepzs.supabase.co/functions/v1/check-maintenance-reminders'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || current_setting(''app.settings.supabase_key'', true)
    ),
    body := jsonb_build_object()::text
  ) as request_id;'
);

GRANT EXECUTE ON FUNCTION cron.schedule TO authenticated;
GRANT EXECUTE ON FUNCTION cron.schedule TO service_role;
