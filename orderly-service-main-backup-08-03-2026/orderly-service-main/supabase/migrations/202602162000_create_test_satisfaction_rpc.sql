-- Create RPC function to test satisfaction survey with 4 second delay
create or replace function public.test_satisfaction_survey_4seconds()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_name text;
  v_order_phone text;
  v_four_seconds_ago timestamptz;
  v_payment_id uuid;
begin
  -- Find Matheus order
  select id, client_name, client_phone into v_order_id, v_order_name, v_order_phone
  from service_orders
  where client_name ilike '%Matheus%'
  order by created_at desc
  limit 1;

  if v_order_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Ordem de Matheus não encontrada'
    );
  end if;

  if v_order_phone is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Ordem de Matheus não tem telefone cadastrado'
    );
  end if;

  -- Create payment with timestamp 4 seconds ago
  v_four_seconds_ago := now() - interval '4 seconds';
  
  insert into payments (order_id, amount, method, created_at)
  values (v_order_id, 0.01, 'pix', v_four_seconds_ago)
  returning id into v_payment_id;

  if v_payment_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Erro ao criar pagamento'
    );
  end if;

  -- Update order to mark survey as sent
  update service_orders
  set satisfaction_survey_sent_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Teste realizado! Pesquisa será enviada em breve.',
    'order_name', v_order_name,
    'order_phone', v_order_phone,
    'payment_id', v_payment_id::text
  );
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.test_satisfaction_survey_4seconds() to authenticated;
