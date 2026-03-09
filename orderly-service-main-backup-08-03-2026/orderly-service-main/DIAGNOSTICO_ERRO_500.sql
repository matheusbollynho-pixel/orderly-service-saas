-- ============================================================
-- DIAGNÓSTICO DO ERRO 500 AO BUSCAR SERVICE_ORDERS
-- Execute cada bloco para identificar o problema
-- ============================================================

-- ========================================
-- 1. VERIFICAR SE AS TABELAS EXISTEM
-- ========================================

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN ('service_orders', 'checklist_items', 'materials', 'payments', 'clients')
ORDER BY table_name;

-- Deve retornar 5 tabelas. Se faltar alguma, há problema!


-- ========================================
-- 2. VERIFICAR COLUNAS DA TABELA CLIENTS
-- ========================================

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'clients'
ORDER BY ordinal_position;

-- Verificar se autoriza_lembretes e autoriza_instagram existem


-- ========================================
-- 3. VERIFICAR FOREIGN KEYS
-- ========================================

SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'service_orders';

-- Verificar se existe FK para clients (client_id)


-- ========================================
-- 4. TESTAR QUERY SIMPLIFICADA
-- ========================================

-- Testar apenas service_orders (sem JOINs)
SELECT COUNT(*) as total_orders
FROM service_orders;

-- Se funcionar, o problema está nas relações


-- ========================================
-- 5. TESTAR CADA RELAÇÃO INDIVIDUALMENTE
-- ========================================

-- Testar checklist_items
SELECT COUNT(*) 
FROM service_orders o
LEFT JOIN checklist_items c ON c.order_id = o.id
LIMIT 1;

-- Testar materials
SELECT COUNT(*) 
FROM service_orders o
LEFT JOIN materials m ON m.service_order_id = o.id
LIMIT 1;

-- Testar payments
SELECT COUNT(*) 
FROM service_orders o
LEFT JOIN payments p ON p.service_order_id = o.id
LIMIT 1;

-- Testar clients
SELECT COUNT(*) 
FROM service_orders o
LEFT JOIN clients c ON c.id = o.client_id
LIMIT 1;


-- ========================================
-- 6. VERIFICAR SE HÁ DADOS CORROMPIDOS
-- ========================================

-- Ver se há service_orders com client_id inválido
SELECT 
    COUNT(*) as total_invalid_client_id
FROM service_orders o
WHERE o.client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients c WHERE c.id = o.client_id
  );

-- Se retornar > 0, há ordens com client_id que não existe em clients!


-- ========================================
-- 7. QUERY EXATA QUE O FRONTEND FAZ
-- ========================================

-- Reproduzir a query do useServiceOrders
SELECT 
    o.*,
    c.autoriza_lembretes,
    c.autoriza_instagram
FROM service_orders o
LEFT JOIN clients c ON c.id = o.client_id
ORDER BY o.created_at DESC
LIMIT 10;

-- Se esta query der erro, o problema está aqui!


-- ========================================
-- 8. VERIFICAR POLÍTICAS RLS
-- ========================================

-- Ver políticas da tabela clients
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'clients';

-- Ver políticas da tabela service_orders
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'service_orders';


-- ========================================
-- POSSÍVEIS SOLUÇÕES
-- ========================================

/*
Se o problema for FK quebrada (passo 6):
*/
-- Limpar client_id inválidos
-- UPDATE service_orders 
-- SET client_id = NULL 
-- WHERE client_id IS NOT NULL 
--   AND NOT EXISTS (SELECT 1 FROM clients WHERE id = client_id);

/*
Se o problema for coluna inexistente em clients:
*/
-- Adicionar colunas faltantes
-- ALTER TABLE clients ADD COLUMN IF NOT EXISTS autoriza_lembretes BOOLEAN DEFAULT TRUE;
-- ALTER TABLE clients ADD COLUMN IF NOT EXISTS autoriza_instagram BOOLEAN DEFAULT TRUE;

/*
Se o problema for políticas RLS bloqueando:
*/
-- Ver se RLS está habilitado
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients';
