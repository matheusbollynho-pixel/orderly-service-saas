-- Fluxo único da peça: falta -> pedida -> CHEGOU.
-- 1) cotacao_itens ganha o status 'recebido' (+ data)
-- 2) peça chegou -> encomenda do cliente ligada vai pra "chegou" sozinha
-- 3) tempo real nas tabelas da cotação (tela atualiza sem F5)

ALTER TABLE cotacao_itens ADD COLUMN IF NOT EXISTS recebido_em timestamptz;

ALTER TABLE cotacao_itens DROP CONSTRAINT IF EXISTS cotacao_itens_status_check;
ALTER TABLE cotacao_itens ADD CONSTRAINT cotacao_itens_status_check
  CHECK (status IN ('pendente', 'pedido', 'recebido', 'cancelado'));

CREATE OR REPLACE FUNCTION cotacao_item_recebido_avanca_encomenda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'recebido' AND OLD.status IS DISTINCT FROM 'recebido' THEN
    UPDATE encomendas
       SET status = 'chegou', chegou_em = COALESCE(chegou_em, now())
     WHERE cotacao_item_id = NEW.id
       AND store_id = NEW.store_id
       AND status IN ('aguardando_cotacao', 'cliente_avisado', 'aprovado', 'pedido_feito');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cotacao_item_recebido_avanca_encomenda ON cotacao_itens;
CREATE TRIGGER trg_cotacao_item_recebido_avanca_encomenda
  AFTER UPDATE OF status ON cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION cotacao_item_recebido_avanca_encomenda();

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
