-- ⚡ VERSÃO ALTERNATIVA: Trigger que chama via Edge Function com melhor tratamento de erros

-- Esta versão é mais robusta e trata melhor os casos de erro
-- Use esta se a versão anterior não funcionar

CREATE OR REPLACE FUNCTION trigger_send_survey_rpc_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id UUID;
  v_client_phone TEXT;
  v_client_name TEXT;
  v_survey_already_sent BOOLEAN;
  v_http_response JSON;
  v_url TEXT;
BEGIN
  -- Get order details
  SELECT id, client_phone, client_name, (satisfaction_survey_sent_at IS NOT NULL)
  INTO v_order_id, v_client_phone, v_client_name, v_survey_already_sent
  FROM service_orders
  WHERE id = NEW.order_id;

  -- Only proceed if order exists, has phone, and survey not yet sent
  IF v_order_id IS NOT NULL 
    AND v_client_phone IS NOT NULL 
    AND NOT v_survey_already_sent THEN
    
    RAISE LOG '🎯 Trigger v2 disparado para ordem: %, cliente: %', v_order_id, v_client_name;
    
    -- Mark survey as sent FIRST (to prevent duplicates even if email sending fails)
    UPDATE service_orders
    SET satisfaction_survey_sent_at = now()
    WHERE id = v_order_id;

    -- Try to call the edge function
    -- The function will handle actually sending the message
    BEGIN
      -- Build the URL - try to use app settings, fallback to hardcoded
      BEGIN
        v_url := current_setting('app.supabase_url', true) || '/functions/v1/send-satisfaction-survey';
        IF v_url IS NULL OR v_url = '/functions/v1/send-satisfaction-survey' THEN
          v_url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey';
      END;

      -- Call the edge function
      -- Note: We use Bearer token from service_role_key if available
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
      -- Log the error but don't fail - the payment was already recorded and marked as surveyed
      RAISE LOG '⚠️ HTTP POST failed for order %: % (but payment recorded)', v_order_id, SQLERRM;
    END;
  ELSE
    RAISE LOG '⏭️ Skipping survey for order %: exists=%s, phone=%s, not_sent=%s', 
      NEW.order_id, (v_order_id IS NOT NULL), (v_client_phone IS NOT NULL), (NOT v_survey_already_sent);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the old trigger if it exists
DROP TRIGGER IF EXISTS trigger_payment_send_survey ON payments CASCADE;

-- Create the new trigger using the v2 function
CREATE TRIGGER trigger_payment_send_survey
AFTER INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION trigger_send_survey_rpc_v2();

RAISE LOG '✅ Trigger v2 criado com sucesso para disparar pesquisa após pagamento';
