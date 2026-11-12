-- Link de cotação: cada representante recebe um link próprio com as peças da
-- cotação e marca, por peça, "tenho" (valor/marca/obs), "não tenho" ou "não
-- trabalhamos". A resposta cai direto na comparação, sem IA.
-- Acesso público só pela edge function cotacao-link (com o token); a tabela em
-- si só é visível pros membros da loja.

CREATE TABLE IF NOT EXISTS cotacao_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  representante_id uuid NOT NULL REFERENCES representantes(id) ON DELETE CASCADE,
  -- 64 caracteres aleatórios (2 UUIDs v4): impossível de adivinhar
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  itens uuid[] NOT NULL CHECK (cardinality(itens) BETWEEN 1 AND 300),
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  resposta_id uuid REFERENCES cotacao_respostas(id) ON DELETE SET NULL,
  respondido_em timestamptz,
  envios int NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_links_store ON cotacao_links(store_id, created_at DESC);

ALTER TABLE cotacao_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cotacao_links: membros da loja" ON cotacao_links;
CREATE POLICY "cotacao_links: membros da loja" ON cotacao_links FOR ALL TO authenticated
  USING (store_id = (SELECT get_my_store_id()))
  WITH CHECK (store_id = (SELECT get_my_store_id()));

-- Representante precisa ser da mesma loja do link
CREATE OR REPLACE FUNCTION cotacao_links_mesma_loja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM representantes WHERE id = NEW.representante_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'representante de outra loja';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cotacao_links_mesma_loja ON cotacao_links;
CREATE TRIGGER trg_cotacao_links_mesma_loja
  BEFORE INSERT OR UPDATE ON cotacao_links
  FOR EACH ROW EXECUTE FUNCTION cotacao_links_mesma_loja();
