-- Entrada de estoque pelo XML da nota fiscal do fornecedor (NF-e).
-- A tela lê o XML e manda tudo para importar_nfe, que grava de uma vez (ou nada):
-- produtos novos, entradas no estoque (com lote/validade), custo atualizado e o "vínculo"
-- código do fornecedor → produto da loja (na próxima nota do mesmo fornecedor já vem ligado).
-- A mesma nota (chave de 44 dígitos) não entra duas vezes na loja.

CREATE TABLE IF NOT EXISTS public.nfe_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL DEFAULT get_my_store_id() REFERENCES public.store_settings(id) ON DELETE CASCADE,
  chave text NOT NULL,
  numero text,
  serie text,
  emitida_em timestamptz,
  fornecedor_nome text,
  fornecedor_cnpj text,
  valor_total numeric(12,2),
  itens integer NOT NULL DEFAULT 0,
  feito_por text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, chave)
);
ALTER TABLE public.nfe_entradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nfe_entradas: ler" ON public.nfe_entradas;
CREATE POLICY "nfe_entradas: ler" ON public.nfe_entradas FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());
DROP POLICY IF EXISTS "nfe_entradas: gravar" ON public.nfe_entradas;
CREATE POLICY "nfe_entradas: gravar" ON public.nfe_entradas FOR INSERT TO authenticated
  WITH CHECK (store_id = get_my_store_id());
DROP POLICY IF EXISTS "nfe_entradas: atualizar" ON public.nfe_entradas;
CREATE POLICY "nfe_entradas: atualizar" ON public.nfe_entradas FOR UPDATE TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

CREATE TABLE IF NOT EXISTS public.nfe_vinculos (
  store_id uuid NOT NULL DEFAULT get_my_store_id() REFERENCES public.store_settings(id) ON DELETE CASCADE,
  fornecedor_cnpj text NOT NULL,
  codigo_fornecedor text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  fator numeric(12,4) NOT NULL DEFAULT 1 CHECK (fator > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, fornecedor_cnpj, codigo_fornecedor)
);
ALTER TABLE public.nfe_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nfe_vinculos: ler" ON public.nfe_vinculos;
CREATE POLICY "nfe_vinculos: ler" ON public.nfe_vinculos FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());
DROP POLICY IF EXISTS "nfe_vinculos: gravar" ON public.nfe_vinculos;
CREATE POLICY "nfe_vinculos: gravar" ON public.nfe_vinculos FOR ALL TO authenticated
  USING (store_id = get_my_store_id()) WITH CHECK (store_id = get_my_store_id());

ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS nfe_entrada_id uuid REFERENCES public.nfe_entradas(id) ON DELETE SET NULL;

-- p = { chave, numero, serie, emitida_em, fornecedor_nome, fornecedor_cnpj, valor_total, local ('loja'|'almox'),
--       quem, atualizar_custo, itens: [ { acao: 'vincular'|'novo'|'ignorar', product_id, codigo_fornecedor, fator,
--       quantidade (já na unidade da loja), custo_unit, descricao_nf,
--       novo: { name, unit, barcode, ncm, cest, sale_price, controla_validade },
--       lotes: [ { numero, quantidade (unidade da loja), fabricacao, validade } ] } ] }
-- Roda com as permissões de quem chamou (RLS e travas do estoque valem).
CREATE OR REPLACE FUNCTION public.importar_nfe(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE
  loja uuid := get_my_store_id();
  v_entrada uuid;
  v_ja nfe_entradas%ROWTYPE;
  it jsonb;
  lt jsonb;
  v_prod uuid;
  v_local text := CASE WHEN p->>'local' = 'almox' THEN 'almox' ELSE 'loja' END;
  v_quem text := nullif(btrim(p->>'quem'), '');
  v_nota text;
  v_qtd numeric;
  v_custo numeric;
  v_novos int := 0;
  v_movs int := 0;
  v_itens int := 0;
BEGIN
  IF loja IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF coalesce(length(regexp_replace(p->>'chave', '\D', '', 'g')), 0) <> 44 THEN
    RAISE EXCEPTION 'Chave da nota inválida';
  END IF;
  SELECT * INTO v_ja FROM nfe_entradas WHERE store_id = loja AND chave = regexp_replace(p->>'chave', '\D', '', 'g');
  IF FOUND THEN
    RAISE EXCEPTION 'Essa nota já foi lançada em % (%).',
      to_char(v_ja.created_at AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), coalesce(v_ja.feito_por, 'sem nome');
  END IF;

  INSERT INTO nfe_entradas (store_id, chave, numero, serie, emitida_em, fornecedor_nome, fornecedor_cnpj, valor_total, feito_por)
  VALUES (loja, regexp_replace(p->>'chave', '\D', '', 'g'), p->>'numero', p->>'serie', nullif(p->>'emitida_em', '')::timestamptz,
          p->>'fornecedor_nome', nullif(regexp_replace(coalesce(p->>'fornecedor_cnpj', ''), '\D', '', 'g'), ''),
          nullif(p->>'valor_total', '')::numeric, v_quem)
  RETURNING id INTO v_entrada;
  v_nota := 'NF ' || coalesce(p->>'numero', '?') || coalesce(' - ' || nullif(p->>'fornecedor_nome', ''), '');

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) LOOP
    CONTINUE WHEN it->>'acao' = 'ignorar';
    v_qtd := (it->>'quantidade')::numeric;
    v_custo := nullif(it->>'custo_unit', '')::numeric;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida no item "%"', it->>'descricao_nf';
    END IF;

    IF it->>'acao' = 'novo' THEN
      IF coalesce(btrim(it->'novo'->>'name'), '') = '' THEN
        RAISE EXCEPTION 'Produto novo sem nome (item "%")', it->>'descricao_nf';
      END IF;
      INSERT INTO inventory_products (store_id, code, name, unit, barcode, ncm, cest, supplier, cost_price, sale_price,
                                      stock_current, stock_minimum, active, status, controla_validade)
      VALUES (loja, NULL, btrim(it->'novo'->>'name'), coalesce(nullif(it->'novo'->>'unit', ''), 'un'),
              nullif(it->'novo'->>'barcode', ''), nullif(it->'novo'->>'ncm', ''), nullif(it->'novo'->>'cest', ''),
              nullif(p->>'fornecedor_nome', ''), coalesce(v_custo, 0), coalesce(nullif(it->'novo'->>'sale_price', '')::numeric, 0),
              0, 0, true, 'ativo', coalesce((it->'novo'->>'controla_validade')::boolean, false))
      RETURNING id INTO v_prod;
      v_novos := v_novos + 1;
    ELSE
      v_prod := (it->>'product_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM inventory_products WHERE id = v_prod AND store_id = loja) THEN
        RAISE EXCEPTION 'Produto não encontrado (item "%")', it->>'descricao_nf';
      END IF;
    END IF;

    -- Entrada: um movimento por lote (ou um só, sem lote)
    IF jsonb_array_length(coalesce(it->'lotes', '[]'::jsonb)) > 0 THEN
      FOR lt IN SELECT * FROM jsonb_array_elements(it->'lotes') LOOP
        INSERT INTO inventory_movements (store_id, product_id, type, local, quantity, unit_cost, notes, feito_por,
                                         lote, fabricacao, validade, nfe_entrada_id)
        VALUES (loja, v_prod, 'entrada_manual', v_local, (lt->>'quantidade')::numeric, v_custo, v_nota, v_quem,
                nullif(lt->>'numero', ''), nullif(lt->>'fabricacao', '')::date, nullif(lt->>'validade', '')::date, v_entrada);
        v_movs := v_movs + 1;
      END LOOP;
    ELSE
      INSERT INTO inventory_movements (store_id, product_id, type, local, quantity, unit_cost, notes, feito_por, nfe_entrada_id)
      VALUES (loja, v_prod, 'entrada_manual', v_local, v_qtd, v_custo, v_nota, v_quem, v_entrada);
      v_movs := v_movs + 1;
    END IF;

    IF coalesce((p->>'atualizar_custo')::boolean, true) AND v_custo IS NOT NULL AND it->>'acao' <> 'novo' THEN
      UPDATE inventory_products SET cost_price = v_custo, updated_at = now() WHERE id = v_prod;
    END IF;

    -- Lembra o código do fornecedor → produto (próxima nota já vem ligada)
    IF coalesce(it->>'codigo_fornecedor', '') <> '' AND coalesce(p->>'fornecedor_cnpj', '') <> '' THEN
      INSERT INTO nfe_vinculos (store_id, fornecedor_cnpj, codigo_fornecedor, product_id, fator)
      VALUES (loja, regexp_replace(p->>'fornecedor_cnpj', '\D', '', 'g'), it->>'codigo_fornecedor', v_prod,
              coalesce(nullif(it->>'fator', '')::numeric, 1))
      ON CONFLICT (store_id, fornecedor_cnpj, codigo_fornecedor)
      DO UPDATE SET product_id = EXCLUDED.product_id, fator = EXCLUDED.fator, updated_at = now();
    END IF;
    v_itens := v_itens + 1;
  END LOOP;

  IF v_itens = 0 THEN RAISE EXCEPTION 'Nenhum item para dar entrada'; END IF;
  UPDATE nfe_entradas SET itens = v_itens WHERE id = v_entrada;
  RETURN jsonb_build_object('entrada_id', v_entrada, 'itens', v_itens, 'produtos_novos', v_novos, 'movimentos', v_movs);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.importar_nfe(jsonb) TO authenticated;
