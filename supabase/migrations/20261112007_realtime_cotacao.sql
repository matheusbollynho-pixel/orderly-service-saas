-- Tela da Cotação/Encomendas atualiza NA HORA quando o representante responde
-- o link (ou outro funcionário mexe). A RLS continua valendo no tempo real.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cotacao_precos', 'cotacao_links', 'cotacao_itens', 'encomendas'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
