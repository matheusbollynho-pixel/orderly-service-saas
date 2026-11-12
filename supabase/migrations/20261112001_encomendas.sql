-- ============================================================
-- Módulo de COTAÇÃO - parte 2: ENCOMENDAS DE CLIENTES
-- Cliente pede uma peça que a loja não tem -> entra na cotação -> loja informa
-- preço/prazo -> cliente aprova -> pedido -> chegou -> entregue (ou desistiu).
-- Só tabela nova + 1 trigger na cotacao_itens (cotacao_itens também é nova).
-- ============================================================

CREATE TABLE IF NOT EXISTS encomendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES store_settings(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  motorcycle_id uuid REFERENCES motorcycles(id) ON DELETE SET NULL,
  service_order_id uuid REFERENCES service_orders(id) ON DELETE SET NULL,
  cotacao_item_id uuid REFERENCES cotacao_itens(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL CHECK (length(trim(cliente_nome)) > 0),
  cliente_whatsapp text,
  moto text,
  peca text NOT NULL CHECK (length(trim(peca)) > 0),
  quantidade numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  origem text NOT NULL DEFAULT 'balcao' CHECK (origem IN ('balcao', 'whatsapp')),
  urgente boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aguardando_cotacao' CHECK (status IN (
    'aguardando_cotacao', 'cliente_avisado', 'aprovado', 'pedido_feito', 'chegou', 'entregue', 'desistiu')),
  custo numeric(10,2) CHECK (custo IS NULL OR custo >= 0),
  preco_venda numeric(10,2) CHECK (preco_venda IS NULL OR preco_venda >= 0),
  prazo_texto text,
  pago_adiantado numeric(10,2) NOT NULL DEFAULT 0 CHECK (pago_adiantado >= 0),
  observacao text,
  avisado_em timestamptz,
  aprovado_em timestamptz,
  pedido_em timestamptz,
  chegou_em timestamptz,
  entregue_em timestamptz,
  desistiu_em timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_encomendas_store_status ON encomendas(store_id, status);
CREATE INDEX IF NOT EXISTS idx_encomendas_item ON encomendas(cotacao_item_id);
CREATE INDEX IF NOT EXISTS idx_encomendas_client ON encomendas(client_id);

ALTER TABLE encomendas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "encomendas: membros da loja" ON encomendas;
CREATE POLICY "encomendas: membros da loja" ON encomendas FOR ALL TO authenticated
  USING (store_id = (SELECT get_my_store_id()))
  WITH CHECK (store_id = (SELECT get_my_store_id()));

-- Cliente/moto/OS/item precisam ser da MESMA loja da encomenda
CREATE OR REPLACE FUNCTION encomendas_mesma_loja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients WHERE id = NEW.client_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'cliente de outra loja';
  END IF;
  IF NEW.motorcycle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM motorcycles WHERE id = NEW.motorcycle_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'moto de outra loja';
  END IF;
  IF NEW.service_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM service_orders WHERE id = NEW.service_order_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'OS de outra loja';
  END IF;
  IF NEW.cotacao_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cotacao_itens WHERE id = NEW.cotacao_item_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'item de cotação de outra loja';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_encomendas_mesma_loja ON encomendas;
CREATE TRIGGER trg_encomendas_mesma_loja
  BEFORE INSERT OR UPDATE ON encomendas
  FOR EACH ROW EXECUTE FUNCTION encomendas_mesma_loja();

DROP TRIGGER IF EXISTS trg_encomendas_updated_at ON encomendas;
CREATE TRIGGER trg_encomendas_updated_at BEFORE UPDATE ON encomendas
  FOR EACH ROW EXECUTE FUNCTION cotacao_set_updated_at();

-- Quando a peça é marcada como pedida na Cotação, a encomenda ligada avança
-- sozinha pra "pedido feito" (se ainda não estava pedida/chegou/entregue).
CREATE OR REPLACE FUNCTION cotacao_item_pedido_avanca_encomenda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pedido' AND OLD.status IS DISTINCT FROM 'pedido' THEN
    UPDATE encomendas
       SET status = 'pedido_feito', pedido_em = COALESCE(pedido_em, now())
     WHERE cotacao_item_id = NEW.id
       AND store_id = NEW.store_id
       AND status IN ('aguardando_cotacao', 'cliente_avisado', 'aprovado');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cotacao_item_pedido_avanca_encomenda ON cotacao_itens;
CREATE TRIGGER trg_cotacao_item_pedido_avanca_encomenda
  AFTER UPDATE OF status ON cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION cotacao_item_pedido_avanca_encomenda();
