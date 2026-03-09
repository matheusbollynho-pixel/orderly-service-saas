-- Script para preencher mechanic_id e atendimento_id na OS de teste

-- 1. Primeiro, vamos ver qual mecânico e atendente existem
SELECT 'MECHANICS:' as info;
SELECT id, name FROM mechanics LIMIT 5;

SELECT 'STAFF_MEMBERS:' as info;
SELECT id, name FROM staff_members LIMIT 5;

-- 2. Atualizar a OS com IDs válidos
-- IMPORTANTE: Substitua os IDs abaixo pelos IDs reais do seu banco!
-- Exemplo:
-- UPDATE service_orders 
-- SET mechanic_id = '11111111-1111-1111-1111-111111111111',
--     atendimento_id = '22222222-2222-2222-2222-222222222222'
-- WHERE id = '671408a2-e572-406d-8800-d07e70a9d7ea';
