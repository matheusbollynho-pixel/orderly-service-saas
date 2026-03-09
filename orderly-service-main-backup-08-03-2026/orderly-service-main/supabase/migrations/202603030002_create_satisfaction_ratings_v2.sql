-- Estrutura completa para módulo de satisfação (atendimento + oficina)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Equipe de atendimento (balcão/donos)
CREATE TABLE IF NOT EXISTS public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('balconista', 'dono', 'outro')),
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_members' AND policyname = 'staff_members_all'
  ) THEN
    DROP POLICY staff_members_all ON public.staff_members;
  END IF;
END$$;

CREATE POLICY staff_members_all ON public.staff_members
FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_staff_members_updated_at ON public.staff_members;
CREATE TRIGGER update_staff_members_updated_at
BEFORE UPDATE ON public.staff_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Quem atendeu no balcão
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS atendimento_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS service_orders_atendimento_id_idx
  ON public.service_orders(atendimento_id);

-- Avaliações por OS (1 resposta por ordem)
CREATE TABLE IF NOT EXISTS public.satisfaction_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  atendimento_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  mechanic_id UUID REFERENCES public.mechanics(id) ON DELETE SET NULL,

  atendimento_rating INT CHECK (atendimento_rating BETWEEN 1 AND 5),
  servico_rating INT CHECK (servico_rating BETWEEN 1 AND 5),

  tags JSONB NOT NULL DEFAULT '{"atendimento":[],"servico":[]}'::jsonb,
  comment TEXT,
  recommends BOOLEAN,

  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido')),
  responded_at TIMESTAMPTZ,

  public_token TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT satisfaction_one_per_order UNIQUE (order_id)
);

ALTER TABLE public.satisfaction_ratings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'satisfaction_ratings' AND policyname = 'satisfaction_ratings_all'
  ) THEN
    DROP POLICY satisfaction_ratings_all ON public.satisfaction_ratings;
  END IF;
END$$;

CREATE POLICY satisfaction_ratings_all ON public.satisfaction_ratings
FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_satisfaction_ratings_updated_at ON public.satisfaction_ratings;
CREATE TRIGGER update_satisfaction_ratings_updated_at
BEFORE UPDATE ON public.satisfaction_ratings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS satisfaction_ratings_order_id_idx ON public.satisfaction_ratings(order_id);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_atendimento_id_idx ON public.satisfaction_ratings(atendimento_id);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_mechanic_id_idx ON public.satisfaction_ratings(mechanic_id);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_status_idx ON public.satisfaction_ratings(status);
CREATE INDEX IF NOT EXISTS satisfaction_ratings_responded_at_idx ON public.satisfaction_ratings(responded_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'staff_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_members;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'satisfaction_ratings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.satisfaction_ratings;
  END IF;
END$$;
