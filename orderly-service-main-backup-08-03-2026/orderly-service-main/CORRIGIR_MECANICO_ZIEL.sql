-- VERIFICAR E CORRIGIR MATERIAIS DO MECÂNICO ZIEL
-- Execute no Supabase SQL Editor

-- ========================================
-- PASSO 1: ENCONTRAR O ID DO ZIEL
-- ========================================

SELECT id, name, created_at 
FROM mechanics 
WHERE name ILIKE '%Ziel%';

-- Anote o ID do Ziel aqui: __________________


-- ========================================
-- PASSO 2: VERIFICAR MATERIAIS COM ZIEL
-- ========================================

-- Ver todos os materiais atribuídos ao Ziel
SELECT 
    m.id as material_id,
    m.descricao,
    m.valor,
    m.created_at,
    m.mechanic_id,
    mec.name as mechanic_name,
    o.id as order_id,
    o.client_name,
    o.entry_date
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE mec.name ILIKE '%Ziel%'
ORDER BY m.created_at DESC;


-- ========================================
-- PASSO 3: VERIFICAR DATA DE CRIAÇÃO
-- ========================================

-- Ver materiais do Ziel criados ontem ou nos últimos dias
SELECT 
    m.id as material_id,
    m.descricao,
    m.created_at::date as data_criacao,
    mec.name as mechanic_name,
    o.client_name
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE mec.name ILIKE '%Ziel%'
  AND m.created_at >= NOW() - INTERVAL '3 days'  -- Últimos 3 dias
ORDER BY m.created_at DESC;


-- ========================================
-- PASSO 4: REMOVER ZIEL DOS MATERIAIS INCORRETOS
-- ========================================
-- ⚠️ DESCOMENTE APENAS DEPOIS DE VERIFICAR OS PASSOS ACIMA!
-- ⚠️ Substitua 'ID_DO_ZIEL' pelo ID encontrado no PASSO 1

/*
-- Opção A: Remover Ziel de TODOS os materiais dele
UPDATE materials 
SET mechanic_id = NULL 
WHERE mechanic_id = 'ID_DO_ZIEL';
*/

/*
-- Opção B: Remover Ziel apenas dos materiais de ontem
UPDATE materials 
SET mechanic_id = NULL 
WHERE mechanic_id = 'ID_DO_ZIEL'
  AND created_at::date = '2026-03-02';  -- Substitua pela data correta
*/

/*
-- Opção C: Remover Ziel de materiais específicos por ID
UPDATE materials 
SET mechanic_id = NULL 
WHERE id IN ('ID_MATERIAL_1', 'ID_MATERIAL_2', 'ID_MATERIAL_3');
*/


-- ========================================
-- PASSO 5: VERIFICAÇÃO FINAL
-- ========================================

-- Verificar quantos materiais o Ziel tem agora
SELECT 
    COUNT(*) as total_materiais_ziel
FROM materials m
JOIN mechanics mec ON mec.id = m.mechanic_id
WHERE mec.name ILIKE '%Ziel%';

-- Ver detalhes dos materiais restantes do Ziel
SELECT 
    m.id,
    m.descricao,
    m.created_at::date as data,
    o.client_name
FROM materials m
JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE mec.name ILIKE '%Ziel%'
ORDER BY m.created_at DESC;
