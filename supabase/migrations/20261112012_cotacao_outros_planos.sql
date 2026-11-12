-- Cotacao/Encomendas liberadas tambem no Teste, Pro e Premium (mesma regra da tela).
-- A IA de leitura continua presa ao limite de IA de cada plano (Pro = R$ 0, sem IA).
CREATE OR REPLACE FUNCTION loja_usa_cotacao(p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_settings s
     WHERE s.id = p_store_id
       AND CASE WHEN s.custom_features IS NOT NULL THEN 'cotacao' = ANY (s.custom_features)
                ELSE s.plan IN ('trial', 'pro', 'premium', 'enterprise') END);
$$;
