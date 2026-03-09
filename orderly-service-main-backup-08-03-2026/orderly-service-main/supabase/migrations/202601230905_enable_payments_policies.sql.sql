-- Enable RLS and open policies for payments (mirroring other tables)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_all') THEN
    DROP POLICY payments_all ON public.payments;
  END IF;
END$$;

CREATE POLICY payments_all ON public.payments FOR ALL USING (true) WITH CHECK (true);
