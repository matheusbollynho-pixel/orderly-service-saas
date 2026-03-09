-- Create trigger to send satisfaction survey after payment
-- This ensures messages are sent immediately after payment, not waiting for cron

CREATE OR REPLACE FUNCTION send_satisfaction_survey_after_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id UUID;
  v_client_phone TEXT;
  v_client_name TEXT;
  v_survey_already_sent BOOLEAN;
  v_response JSON;
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
    
    -- Mark survey as sent FIRST (to prevent duplicates)
    UPDATE service_orders
    SET satisfaction_survey_sent_at = now()
    WHERE id = v_order_id;

    -- Build the URL using environment variables
    -- Fallback to hardcoded value if settings not available
    BEGIN
      v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://' || current_database() || '.supabase.co'
      ) || '/functions/v1/send-satisfaction-survey';
    EXCEPTION WHEN OTHERS THEN
      v_url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/send-satisfaction-survey';
    END;

    -- Trigger edge function to send the message
    -- This call is async and won't block the payment creation
    BEGIN
      v_response := net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'order_id', v_order_id,
          'client_phone', v_client_phone,
          'client_name', v_client_name,
          'triggered_by', 'payment_trigger'
        )::text,
        timeout_milliseconds := 8000
      );
      
      RAISE LOG '✅ Satisfaction survey HTTP POST sent for order %, response: %', v_order_id, v_response;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '❌ HTTP POST failed for order %: %', v_order_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_payment_send_survey ON payments;

-- Create trigger on payment insert
CREATE TRIGGER trigger_payment_send_survey
AFTER INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION send_satisfaction_survey_after_payment();

-- Grant permissions
GRANT EXECUTE ON FUNCTION send_satisfaction_survey_after_payment() TO postgres, authenticated, service_role;
