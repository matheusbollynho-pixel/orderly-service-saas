-- Gera o `code` de inventory_products no servidor quando vier vazio/nulo.
--
-- Antes, o código interno era chutado no cliente (maior número + 1 lido do
-- cache do React Query). Lista desatualizada -> código repetido -> o INSERT
-- batia na unique (store_id, code) e voltava 409 Conflict (caso da BAMOTOS).
--
-- Agora: se `code` chegar em branco, o trigger calcula MAX(parte numérica
-- dos códigos da loja) + 1, com padding de 3 dígitos, e repete caso esbarre
-- num código não-numérico igual. O usuário ainda pode digitar um código
-- manual — nesse caso o valor dele é respeitado.
CREATE OR REPLACE FUNCTION fn_inventory_products_autocode()
RETURNS TRIGGER AS $$
DECLARE
  v_next BIGINT;
BEGIN
  IF NEW.code IS NOT NULL AND btrim(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'store_id obrigatorio para gerar o codigo do produto';
  END IF;

  LOOP
    SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), '')::BIGINT), 0) + 1
      INTO v_next
      FROM inventory_products
     WHERE store_id = NEW.store_id;

    NEW.code := lpad(v_next::TEXT, 3, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM inventory_products
       WHERE store_id = NEW.store_id AND code = NEW.code
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_products_autocode ON inventory_products;
CREATE TRIGGER trg_inventory_products_autocode
  BEFORE INSERT ON inventory_products
  FOR EACH ROW EXECUTE FUNCTION fn_inventory_products_autocode();
