-- Pagamento da OS → caixa: lança o VALOR RECEBIDO (o que o cliente pagou), sem tirar o desconto de novo.
-- Todas as telas (saldo da OS, A receber, relatórios, impressão) já tratam payments.amount como o recebido
-- e o desconto à parte (recebido + desconto = total). Só este gatilho fazia amount − desconto, então quando o
-- atendente digitava o valor já com desconto, o caixa ficava com o desconto a menos (ex.: OS Noelia 26/11:
-- Pix R$100 com R$3 de desconto entrou R$97). O formulário passa a dizer "Valor recebido" e avisar se o
-- valor + desconto passar do que falta (hábito de digitar o total cheio).
-- Só vale para pagamento lançado ou alterado daqui pra frente: nenhum lançamento antigo é recalculado.
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount NUMERIC;
  v_store_id UUID;
  r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.discount_amount IS NOT DISTINCT FROM OLD.discount_amount
       AND NEW.method IS NOT DISTINCT FROM OLD.method
       AND DATE(NEW.created_at) IS NOT DISTINCT FROM DATE(OLD.created_at)
       AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id THEN
      RETURN NEW;  -- nada que mexa no caixa mudou
    END IF;
  END IF;

  v_amount := GREATEST(COALESCE(NEW.amount, 0), 0);  -- valor recebido; o desconto já está fora dele
  v_store_id := NEW.store_id;
  IF v_store_id IS NULL THEN
    SELECT store_id INTO v_store_id FROM service_orders WHERE id = NEW.order_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT id FROM cash_flow WHERE payment_id = NEW.id AND estornado_em IS NULL AND estorno_de IS NULL LOOP
      PERFORM estornar_cash_interno(r.id, 'Pagamento alterado na OS');
    END LOOP;
  END IF;

  IF v_amount > 0 AND v_store_id IS NOT NULL THEN
    INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, order_id, payment_id, date)
    SELECT v_store_id,
           'entrada',
           v_amount,
           'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
             CASE WHEN COALESCE(NEW.discount_amount, 0) > 0
               THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
               ELSE '' END,
           'Ordem de Servi' || U&'\00E7' || 'o',
           NEW.method,
           NEW.order_id,
           NEW.id,
           DATE(NEW.created_at)
      FROM service_orders so
     WHERE so.id = NEW.order_id;
  END IF;

  RETURN NEW;
END $$;
