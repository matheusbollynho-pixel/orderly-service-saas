-- ============================================================
-- O código de envio de link de satisfação (sendSatisfactionLink.ts)
-- nunca manda store_id no insert de satisfaction_ratings, mas a
-- coluna é NOT NULL e a policy de RLS depende dela — o recurso
-- de "enviar avaliação" estava 100% quebrado (RLS rejeitava o
-- insert). Preenchendo store_id automaticamente a partir da OS
-- relacionada, sem precisar mexer/redeployar o frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION autofill_satisfaction_ratings_store_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.store_id IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT store_id INTO NEW.store_id FROM service_orders WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autofill_satisfaction_ratings_store_id ON satisfaction_ratings;
CREATE TRIGGER trg_autofill_satisfaction_ratings_store_id
  BEFORE INSERT ON satisfaction_ratings
  FOR EACH ROW EXECUTE FUNCTION autofill_satisfaction_ratings_store_id();
