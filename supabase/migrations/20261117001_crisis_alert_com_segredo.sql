-- ============================================================
-- crisis-alert era pública (verify_jwt=false, sem auth): qualquer um com o
-- store_id mandava alerta falso de "avaliação ruim" pro WhatsApp do dono.
-- O gatilho passa a mandar o x-cron-secret (Vault 'cron_secret', mesmo do
-- public.cron_http) e a função passa a exigir o segredo.
-- Corpo idêntico à versão que estava no banco em 17/11/2026 (conferida via
-- pg_get_functiondef); só muda o header. Aplicada pelo SQL Editor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_crisis_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Só dispara se alguma nota for < 3
  IF NOT (
    (NEW.atendimento_rating IS NOT NULL AND NEW.atendimento_rating < 3) OR
    (NEW.servico_rating IS NOT NULL AND NEW.servico_rating < 3)
  ) THEN
    RETURN NEW;
  END IF;

  -- Ignora UPDATE quando as notas não mudaram
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.atendimento_rating IS NOT DISTINCT FROM NEW.atendimento_rating)
   AND (OLD.servico_rating IS NOT DISTINCT FROM NEW.servico_rating) THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/crisis-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
END;
$function$;
