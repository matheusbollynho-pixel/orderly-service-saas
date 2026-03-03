-- VERIFICAR ORDENS DE SERVIÇO DO ZIEL
-- Execute no Supabase SQL Editor

-- ========================================
-- PASSO 1: VERIFICAR AS ORDENS
-- ========================================

-- Ver todas as ordens com "Ziel" no nome
SELECT 
    id,
    client_name,
    client_phone,
    entry_date,
    created_at,
    vehicle_plate,
    vehicle_model
FROM service_orders
WHERE client_name ILIKE '%Ziel%'
ORDER BY created_at DESC;

-- ========================================
-- PASSO 2: VERIFICAR SE HÁ PAGAMENTOS
-- ========================================

-- Ver se essas ordens têm pagamentos associados
SELECT 
    p.id as payment_id,
    p.service_order_id,
    p.amount,
    p.payment_date,
    o.client_name,
    o.entry_date
FROM payments p
JOIN service_orders o ON o.id = p.service_order_id
WHERE o.client_name ILIKE '%Ziel%'
ORDER BY p.payment_date DESC;

-- ========================================
-- PASSO 3: VERIFICAR SE HÁ MATERIAIS
-- ========================================

-- Ver se essas ordens têm materiais associados
SELECT 
    m.id as material_id,
    m.service_order_id,
    m.descricao,
    m.valor,
    m.created_at,
    o.client_name
FROM materials m
JOIN service_orders o ON o.id = m.service_order_id
WHERE o.client_name ILIKE '%Ziel%'
ORDER BY m.created_at DESC;

-- ========================================
-- PASSO 4: VERIFICAR SE HÁ LEMBRETES
-- ========================================

-- Ver se essas ordens têm lembretes de manutenção
SELECT 
    mr.id as reminder_id,
    mr.service_order_id,
    mr.reminder_due_date,
    mr.reminder_sent_at,
    o.client_name
FROM maintenance_reminders mr
JOIN service_orders o ON o.id = mr.service_order_id
WHERE o.client_name ILIKE '%Ziel%'
ORDER BY mr.created_at DESC;

-- ========================================
-- PASSO 5: DELETAR (APENAS SE CONFIRMADO)
-- ========================================
-- ⚠️ DESCOMENTE APENAS DEPOIS DE VERIFICAR OS PASSOS ACIMA!
-- ⚠️ Substitua os IDs pelas ordens que deseja deletar

/*
-- 1. Deletar lembretes primeiro
DELETE FROM maintenance_reminders 
WHERE service_order_id IN ('ID_ORDEM_1', 'ID_ORDEM_2', 'ID_ORDEM_3');

-- 2. Deletar materiais
DELETE FROM materials 
WHERE service_order_id IN ('ID_ORDEM_1', 'ID_ORDEM_2', 'ID_ORDEM_3');

-- 3. Deletar pagamentos
DELETE FROM payments 
WHERE service_order_id IN ('ID_ORDEM_1', 'ID_ORDEM_2', 'ID_ORDEM_3');

-- 4. Deletar as ordens de serviço
DELETE FROM service_orders 
WHERE id IN ('ID_ORDEM_1', 'ID_ORDEM_2', 'ID_ORDEM_3');
*/

-- ========================================
-- VERIFICAÇÃO FINAL
-- ========================================
-- Execute novamente para confirmar que foram deletadas:
-- SELECT * FROM service_orders WHERE client_name ILIKE '%Ziel%';
