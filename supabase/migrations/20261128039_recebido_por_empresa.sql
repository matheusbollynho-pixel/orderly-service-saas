-- Quanto cada empresa (CNPJ) recebeu no período — para loja com 2 CNPJs (vendas/peças e serviços).
-- Base: entradas do caixa (dinheiro que entrou de fato), com a mesma regra do Resumo:
-- lançamento e o estorno dele dentro do período se anulam; estorno de outro período desconta.
--   * Pagamento de OS (inclui fiado de OS, que vira pagamento da OS): divide pela composição da OS
--     (peças → empresa de vendas; mão de obra → empresa de serviços). OS sem itens = serviços.
--   * Nota do balcão e fiado do balcão/manual: empresa de vendas.
--   * Entrada lançada à mão sem origem: separada ("sem origem").
--   * Saída ligada a uma nota do balcão (devolução de venda): desconta da empresa de vendas.

CREATE OR REPLACE FUNCTION public.recebido_por_empresa(p_store_id uuid, p_ini date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
BEGIN
  IF p_ini IS NULL OR p_fim IS NULL OR p_fim < p_ini OR p_fim - p_ini > 1100 THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM store_members sm
     WHERE sm.user_id = auth.uid() AND sm.active = true AND sm.store_id = p_store_id
       AND (sm.role = 'owner' OR coalesce(sm.permissions->>'relatorios', 'false') = 'true')
  ) THEN
    RAISE EXCEPTION 'Sem acesso aos relatorios desta loja';
  END IF;

  WITH bruto AS (
    SELECT cf.id, cf.type, cf.amount, cf.category, cf.order_id, cf.payment_id, cf.balcao_order_id, cf.estorno_de,
           coalesce(nullif(cf.payment_method, ''), 'outro') AS forma
      FROM cash_flow cf
     WHERE cf.store_id = p_store_id AND cf.date BETWEEN p_ini AND p_fim
  ),
  caixa AS (
    SELECT b.*,
           (b.estorno_de IS NOT NULL AND EXISTS (SELECT 1 FROM bruto o WHERE o.id = b.estorno_de))
        OR EXISTS (SELECT 1 FROM bruto e WHERE e.estorno_de = b.id) AS anulado
      FROM bruto b
  ),
  -- Para cada lançamento: o "dono" (o próprio, ou o lançamento original quando é estorno)
  lanc AS (
    SELECT c.id, c.forma,
           CASE WHEN c.type = 'entrada' THEN 1 ELSE -1 END * c.amount AS valor,
           coalesce(o.order_id, c.order_id) AS order_id,
           coalesce(o.payment_id, c.payment_id) AS payment_id,
           coalesce(o.balcao_order_id, c.balcao_order_id) AS balcao_order_id,
           coalesce(o.category, c.category) AS category,
           c.estorno_de, c.type
      FROM caixa c
      LEFT JOIN cash_flow o ON o.id = c.estorno_de
     WHERE NOT c.anulado
       AND ((c.type = 'entrada' AND c.estorno_de IS NULL)                     -- dinheiro que entrou
            OR (c.estorno_de IS NOT NULL AND o.type = 'entrada')              -- estorno de uma entrada
            OR (c.type = 'saida' AND c.estorno_de IS NULL AND c.balcao_order_id IS NOT NULL))  -- devolução de venda do balcão
  ),
  classif AS (
    SELECT l.*,
           coalesce(l.order_id, (SELECT p.order_id FROM payments p WHERE p.id = l.payment_id)) AS os_id
      FROM lanc l
  ),
  -- Composição de cada OS (valor dos itens): peças × serviços
  comp AS (
    SELECT m.order_id,
           sum(coalesce(m.valor, 0) * coalesce(substring(btrim(coalesce(m.quantidade, '')) from '^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')::numeric, 0))
             FILTER (WHERE NOT coalesce(m.is_service, false)) AS pecas,
           sum(coalesce(m.valor, 0) * coalesce(substring(btrim(coalesce(m.quantidade, '')) from '^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')::numeric, 0))
             FILTER (WHERE coalesce(m.is_service, false)) AS servicos
      FROM materials m
     WHERE m.order_id IN (SELECT os_id FROM classif WHERE os_id IS NOT NULL)
     GROUP BY m.order_id
  ),
  partes AS (
    -- OS: parte de peças e parte de serviços
    SELECT 'vendas' AS empresa, 'os_pecas' AS origem, c.forma,
           c.valor * CASE WHEN coalesce(k.pecas, 0) + coalesce(k.servicos, 0) > 0
                          THEN coalesce(k.pecas, 0) / (coalesce(k.pecas, 0) + coalesce(k.servicos, 0)) ELSE 0 END AS valor
      FROM classif c LEFT JOIN comp k ON k.order_id = c.os_id
     WHERE c.os_id IS NOT NULL
    UNION ALL
    SELECT 'servicos', 'os_servicos', c.forma,
           c.valor * CASE WHEN coalesce(k.pecas, 0) + coalesce(k.servicos, 0) > 0
                          THEN coalesce(k.servicos, 0) / (coalesce(k.pecas, 0) + coalesce(k.servicos, 0)) ELSE 1 END
      FROM classif c LEFT JOIN comp k ON k.order_id = c.os_id
     WHERE c.os_id IS NOT NULL
    UNION ALL
    -- Balcão (nota, devolução) e fiado de balcão/manual
    SELECT 'vendas', CASE WHEN c.balcao_order_id IS NOT NULL OR c.category = 'venda_balcao' THEN 'balcao' ELSE 'fiado' END, c.forma, c.valor
      FROM classif c
     WHERE c.os_id IS NULL AND (c.balcao_order_id IS NOT NULL OR c.category IN ('venda_balcao', 'Fiado'))
    UNION ALL
    -- O resto: lançado à mão sem origem
    SELECT 'sem_origem', 'manual', c.forma, c.valor
      FROM classif c
     WHERE c.os_id IS NULL AND c.balcao_order_id IS NULL AND coalesce(c.category, '') NOT IN ('venda_balcao', 'Fiado')
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('ini', p_ini, 'fim', p_fim),
    'empresas', coalesce((
      SELECT jsonb_object_agg(empresa, dados) FROM (
        SELECT empresa, jsonb_build_object(
                 'total', round(sum(valor), 2),
                 'por_origem', (SELECT jsonb_object_agg(origem, v) FROM (
                     SELECT origem, round(sum(valor), 2) AS v FROM partes p2 WHERE p2.empresa = p1.empresa GROUP BY origem) o),
                 'por_forma', (SELECT jsonb_object_agg(forma, v) FROM (
                     SELECT forma, round(sum(valor), 2) AS v FROM partes p3 WHERE p3.empresa = p1.empresa GROUP BY forma HAVING round(sum(valor), 2) <> 0) f)
               ) AS dados
          FROM partes p1 GROUP BY empresa) e), '{}'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.recebido_por_empresa(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recebido_por_empresa(uuid, date, date) TO authenticated, service_role;
