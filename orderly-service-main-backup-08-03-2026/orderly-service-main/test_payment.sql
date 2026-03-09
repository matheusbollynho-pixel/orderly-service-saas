-- Criar pagamento de teste com data de ontem
INSERT INTO payments (order_id, amount, method, created_at) 
SELECT id, 100.00, 'pix', '2026-01-22T10:00:00+00:00'::timestamptz 
FROM service_orders 
WHERE client_phone = '5575988388629' 
AND id NOT IN (SELECT order_id FROM payments WHERE created_at::date = '2026-01-22')
LIMIT 1;
