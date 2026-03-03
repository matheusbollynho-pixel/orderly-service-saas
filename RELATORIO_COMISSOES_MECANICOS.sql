-- ============================================================
-- RELATÓRIO DE COMISSÕES POR MECÂNICO
-- Execute no Supabase SQL Editor antes de fazer pagamentos
-- ============================================================

-- ========================================
-- RESUMO GERAL POR MECÂNICO (ÚLTIMOS 30 DIAS)
-- ========================================

SELECT 
    COALESCE(mec.name, '🔴 SEM MECÂNICO') as mecanico,
    COUNT(DISTINCT m.id) as total_materiais,
    COUNT(DISTINCT m.service_order_id) as total_ordens,
    SUM(m.valor) as valor_total_materiais,
    MIN(m.created_at::date) as primeira_data,
    MAX(m.created_at::date) as ultima_data
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
WHERE m.created_at >= NOW() - INTERVAL '30 days'
GROUP BY mec.name
ORDER BY valor_total_materiais DESC NULLS LAST;


-- ========================================
-- DETALHES POR MECÂNICO - ÚLTIMOS 7 DIAS
-- ========================================

SELECT 
    m.created_at::date as data,
    COALESCE(mec.name, '🔴 SEM MECÂNICO') as mecanico,
    COUNT(*) as qtd_materiais,
    SUM(m.valor) as valor_total,
    STRING_AGG(DISTINCT o.client_name, ', ') as clientes
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE m.created_at >= NOW() - INTERVAL '7 days'
GROUP BY m.created_at::date, mec.name
ORDER BY m.created_at::date DESC, mecanico;


-- ========================================
-- LISTA COMPLETA POR MECÂNICO (PARA AUDITORIA)
-- ========================================

SELECT 
    m.created_at::date as data,
    COALESCE(mec.name, '🔴 SEM MECÂNICO') as mecanico,
    o.client_name as cliente,
    m.descricao,
    m.valor,
    m.id as material_id,
    o.id as order_id
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE m.created_at >= NOW() - INTERVAL '7 days'
ORDER BY m.created_at::date DESC, mec.name, o.client_name;


-- ========================================
-- ⚠️ MATERIAIS SEM MECÂNICO (REQUER ATENÇÃO!)
-- ========================================

SELECT 
    m.created_at::date as data,
    o.client_name as cliente,
    m.descricao,
    m.valor,
    m.id as material_id,
    o.id as order_id
FROM materials m
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE m.mechanic_id IS NULL
  AND m.created_at >= NOW() - INTERVAL '7 days'
ORDER BY m.created_at DESC;


-- ========================================
-- ONTEM (2026-03-02) - VERIFICAÇÃO ESPECÍFICA
-- ========================================

SELECT 
    COALESCE(mec.name, '🔴 SEM MECÂNICO') as mecanico,
    o.client_name as cliente,
    m.descricao,
    m.valor,
    m.created_at::time as hora,
    m.id as material_id
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE m.created_at::date = '2026-03-02'  -- Ontem (dia que Ziel NÃO trabalhou)
ORDER BY mec.name, m.created_at;


-- ========================================
-- HOJE (2026-03-03) - VERIFICAÇÃO ATUAL
-- ========================================

SELECT 
    COALESCE(mec.name, '🔴 SEM MECÂNICO') as mecanico,
    o.client_name as cliente,
    m.descricao,
    m.valor,
    m.created_at::time as hora,
    m.id as material_id
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE m.created_at::date = CURRENT_DATE  -- Hoje
ORDER BY mec.name, m.created_at;


-- ========================================
-- CORRIGIR MECÂNICO DE UM MATERIAL ESPECÍFICO
-- ========================================
-- ⚠️ Use este comando para corrigir materiais com mecânico errado
-- ⚠️ Substitua os IDs conforme necessário

/*
-- Exemplo: Atribuir material ao mecânico correto
UPDATE materials 
SET mechanic_id = 'ID_DO_MECANICO_CORRETO'
WHERE id = 'ID_DO_MATERIAL';
*/

/*
-- Exemplo: Remover mecânico incorreto de vários materiais
UPDATE materials 
SET mechanic_id = NULL
WHERE id IN ('ID_1', 'ID_2', 'ID_3');
*/


-- ========================================
-- CÁLCULO DE COMISSÕES (EXEMPLO 10%)
-- ========================================
-- Ajuste a porcentagem conforme sua política de comissões

SELECT 
    mec.name as mecanico,
    COUNT(DISTINCT m.id) as total_servicos,
    SUM(m.valor) as valor_total,
    ROUND(SUM(m.valor) * 0.10, 2) as comissao_10_porcento,
    ROUND(SUM(m.valor) * 0.15, 2) as comissao_15_porcento
FROM materials m
JOIN mechanics mec ON mec.id = m.mechanic_id
WHERE m.created_at >= NOW() - INTERVAL '30 days'
GROUP BY mec.name
ORDER BY valor_total DESC;


-- ========================================
-- EXPORTAR PARA EXCEL/PLANILHA
-- ========================================
-- Cole o resultado desta query no Excel para análise detalhada

SELECT 
    m.created_at::date as "Data",
    COALESCE(mec.name, 'SEM MECÂNICO') as "Mecânico",
    o.client_name as "Cliente",
    m.descricao as "Descrição",
    m.valor as "Valor R$",
    ROUND(m.valor * 0.10, 2) as "Comissão 10%",
    m.id as "ID Material"
FROM materials m
LEFT JOIN mechanics mec ON mec.id = m.mechanic_id
LEFT JOIN service_orders o ON o.id = m.service_order_id
WHERE m.created_at >= NOW() - INTERVAL '30 days'
ORDER BY m.created_at DESC, mec.name;
