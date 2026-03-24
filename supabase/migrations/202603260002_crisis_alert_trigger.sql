-- Trigger que dispara a Edge Function crisis-alert quando uma avaliação baixa é inserida ou atualizada

CREATE OR REPLACE FUNCTION notify_crisis_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_crisis boolean;
BEGIN
  -- Verifica se alguma nota é < 3
  is_crisis := (NEW.atendimento_rating IS NOT NULL AND NEW.atendimento_rating < 3)
            OR (NEW.servico_rating IS NOT NULL AND NEW.servico_rating < 3);

  IF NOT is_crisis THEN
    RETURN NEW;
  END IF;

  -- Só dispara se for inserção nova ou se a nota acabou de ser preenchida (era null antes)
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.atendimento_rating IS NOT DISTINCT FROM NEW.atendimento_rating)
   AND (OLD.servico_rating IS NOT DISTINCT FROM NEW.servico_rating) THEN
      RETURN NEW; -- nada mudou nas notas
    END IF;
  END IF;

  -- Chama a Edge Function de forma assíncrona via pg_net
  PERFORM net.http_post(
    url := (SELECT COALESCE(current_setting('app.supabase_url', true), '') || '/functions/v1/crisis-alert'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER satisfaction_crisis_alert
  AFTER INSERT OR UPDATE OF atendimento_rating, servico_rating
  ON satisfaction_ratings
  FOR EACH ROW EXECUTE FUNCTION notify_crisis_alert();
