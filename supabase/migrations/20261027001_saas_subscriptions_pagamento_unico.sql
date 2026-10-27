-- Um pagamento do Asaas vira no máximo uma linha de assinatura.
-- O Asaas manda PAYMENT_CONFIRMED e PAYMENT_RECEIVED do mesmo pagamento (e
-- reenvia quando falha); o webhook confere antes, e este índice segura a
-- corrida quando os dois avisos chegam ao mesmo tempo (erro 23505 = ignora).
create unique index if not exists saas_subscriptions_asaas_payment_id_unico
  on public.saas_subscriptions (asaas_payment_id)
  where asaas_payment_id is not null;
