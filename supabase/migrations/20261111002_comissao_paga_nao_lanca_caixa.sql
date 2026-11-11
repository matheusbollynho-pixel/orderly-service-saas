-- O botão "Pago" do relatório do mecânico só marca a COMISSÃO como paga (materials.paid_at).
-- O trigger antigo (da época em que paid_at era "cliente pagou o item") lançava o valor
-- do serviço como ENTRADA no caixa de novo — o dinheiro já tinha entrado pelo pagamento
-- da OS (tabela payments). Resultado: caixa/faturamento inflados.
--
-- Agora: marcar como pago NÃO lança nada. Desmarcar continua apagando a entrada
-- duplicada que tenha sido criada antes desta correção.
CREATE OR REPLACE FUNCTION register_material_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
    DELETE FROM cash_flow
    WHERE order_id = NEW.order_id
      AND payment_id IS NULL
      AND type = 'entrada'
      AND description LIKE (NEW.descricao || ' - Cliente: %')
      AND created_at::date = OLD.paid_at::date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
