-- Updated RPC to actually send the satisfaction message via Edge Function
CREATE OR REPLACE FUNCTION public.test_satisfaction_survey_4seconds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_name text;
  v_order_phone text;
  v_four_seconds_ago timestamptz;
  v_payment_id uuid;
BEGIN
  -- Find Matheus order
  SELECT id, client_name, client_phone INTO v_order_id, v_order_name, v_order_phone
  FROM service_orders
  WHERE client_name ILIKE '%Matheus%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Ordem de Matheus não encontrada'
    );
  END IF;

  IF v_order_phone IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Ordem de Matheus não tem telefone cadastrado'
    );
  END IF;

  -- Create payment with timestamp 4 seconds ago
  v_four_seconds_ago := now() - interval '4 seconds';
  
  INSERT INTO payments (order_id, amount, method, created_at)
  VALUES (v_order_id, 0.01, 'pix', v_four_seconds_ago)
  RETURNING id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Erro ao criar pagamento'
    );
  END IF;

  -- Update order to mark survey as sent
  UPDATE service_orders
  SET satisfaction_survey_sent_at = now()
  WHERE id = v_order_id;

  -- Return success - the Edge Function will be triggered by the frontend
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
