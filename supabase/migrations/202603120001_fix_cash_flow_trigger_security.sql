-- Corrige RLS nos triggers de cash_flow adicionando SECURITY DEFINER
-- Sem isso, triggers rodando via REST API perdem o contexto auth.uid() do Supabase
-- e o INSERT no cash_flow é bloqueado pelo RLS com erro 42501.

CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

  INSERT INTO cash_flow (
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
  FROM service_orders so
  WHERE so.id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

  INSERT INTO cash_flow (
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
  FROM service_orders so
  WHERE so.id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION remove_payment_from_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION register_material_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    INSERT INTO cash_flow (
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
    FROM service_orders so
    WHERE so.id = NEW.order_id;
  END IF;

  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE order_id = NEW.order_id
    AND description LIKE (NEW.descricao || '%')
    AND type = 'entrada'
    AND created_at::date = OLD.paid_at::date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
