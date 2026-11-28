-- Devolução de item de uma nota do balcão já finalizada (ou no fiado), sem cancelar a nota inteira.
-- * Quem pode: quem tem a permissão "estornar" (a mesma do cancelamento).
-- * Quantidade: até o vendido menos o que já foi devolvido daquele item.
-- * Valor: preço do item com o desconto da nota (proporcional).
-- * Estoque: o produto volta para a loja (devolução com preço).
-- * Dinheiro: saída no caixa "Devolução de venda" na forma escolhida, ligada à nota;
--   nota no fiado pode "abater do fiado" (diminui o que o cliente deve).
-- * Registro em balcao_devolucoes (quem, quando, motivo). A nota fiscal não muda (devolução fiscal é com o contador).

CREATE TABLE IF NOT EXISTS public.balcao_devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.balcao_orders(id) ON DELETE CASCADE,
  item_id uuid,
  product_id uuid,
  descricao text,
  quantidade numeric(10,3) NOT NULL CHECK (quantidade > 0),
  valor numeric(12,2) NOT NULL CHECK (valor >= 0),
  forma text NOT NULL,
  motivo text NOT NULL,
  feito_por text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS balcao_devolucoes_order_idx ON public.balcao_devolucoes (order_id);
ALTER TABLE public.balcao_devolucoes ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.balcao_devolucoes FROM anon, authenticated;
DROP POLICY IF EXISTS "balcao_devolucoes: ler" ON public.balcao_devolucoes;
CREATE POLICY "balcao_devolucoes: ler" ON public.balcao_devolucoes FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());

CREATE OR REPLACE FUNCTION public.devolver_item_balcao(
  p_item_id uuid, p_qtd numeric, p_forma text, p_motivo text, p_quem text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  it balcao_items%ROWTYPE;
  v balcao_orders%ROWTYPE;
  f fiados%ROWTYPE;
  v_ja numeric;
  v_valor numeric;
  v_quem text;
  v_hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo da devolução.'; END IF;
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RAISE EXCEPTION 'Informe quantas unidades voltaram.'; END IF;
  IF p_forma NOT IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'abater_fiado') THEN
    RAISE EXCEPTION 'Forma de devolução inválida.';
  END IF;
  IF NOT public.pode_acao('estornar') THEN
    RAISE EXCEPTION 'Sem permissão para devolver (precisa da permissão de estornar). Peça ao gerente.';
  END IF;

  SELECT * INTO it FROM balcao_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
  SELECT * INTO v FROM balcao_orders
   WHERE id = it.order_id
     AND store_id IN (SELECT sm.store_id FROM store_members sm WHERE sm.user_id = auth.uid() AND sm.active = true)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nota não encontrada.'; END IF;
  IF v.status NOT IN ('finalizada', 'fiado') THEN
    RAISE EXCEPTION 'Só dá para devolver item de nota finalizada ou no fiado.';
  END IF;

  SELECT coalesce(sum(quantidade), 0) INTO v_ja FROM balcao_devolucoes WHERE item_id = p_item_id;
  IF p_qtd > coalesce(it.quantity, 0) - v_ja + 0.0005 THEN
    RAISE EXCEPTION 'Só dá para devolver % deste item (vendido %, já devolvido %).',
      trim(to_char(coalesce(it.quantity, 0) - v_ja, 'FM999990.###')), trim(to_char(it.quantity, 'FM999990.###')), trim(to_char(v_ja, 'FM999990.###'));
  END IF;

  v_valor := round(p_qtd * coalesce(it.unit_price, 0) * (1 - coalesce(v.discount_pct, 0) / 100.0), 2);
  v_quem := coalesce(nullif(btrim(coalesce(p_quem, '')), ''),
                     (SELECT email FROM store_members WHERE user_id = auth.uid() AND active = true LIMIT 1));

  -- Estoque: volta para a loja
  IF it.type = 'estoque' AND it.product_id IS NOT NULL THEN
    INSERT INTO inventory_movements (store_id, product_id, type, quantity, unit_price, notes, balcao_order_id, local, skip_cash_flow_trigger, feito_por)
    VALUES (v.store_id, it.product_id, 'devolucao', p_qtd, it.unit_price,
            'Devolução de venda: ' || btrim(p_motivo), v.id, 'loja', true, v_quem);
  END IF;

  -- Dinheiro
  IF p_forma = 'abater_fiado' THEN
    SELECT * INTO f FROM fiados
     WHERE store_id = v.store_id AND origin_type = 'balcao' AND origin_id = v.id::text AND status <> 'pago'
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esta nota não tem fiado em aberto para abater. Escolha devolver em dinheiro ou Pix.'; END IF;
    IF coalesce(f.original_amount, 0) - v_valor < coalesce(f.amount_paid, 0) - 0.005 THEN
      RAISE EXCEPTION 'O cliente já pagou parte deste fiado e o abatimento ficaria negativo. Devolva a diferença em dinheiro ou Pix.';
    END IF;
    UPDATE fiados
       SET original_amount = greatest(coalesce(original_amount, 0) - v_valor, 0),
           status = CASE WHEN coalesce(amount_paid, 0) >= greatest(coalesce(original_amount, 0) - v_valor, 0) + coalesce(interest_accrued, 0) - 0.005
                         THEN 'pago' ELSE status END,
           notes = concat_ws(E'\n', nullif(notes, ''), 'Devolução de ' || trim(to_char(p_qtd, 'FM999990.###')) || 'x ' || coalesce(it.description, 'item')
                     || ': -R$ ' || replace(to_char(v_valor, 'FM999999990.00'), '.', ',')),
           updated_at = now()
     WHERE id = f.id;
    -- Fiado quitado pelo abatimento: a nota sai do "fiado" (igual a quando o cliente paga tudo)
    IF (SELECT status FROM fiados WHERE id = f.id) = 'pago' AND v.status = 'fiado' THEN
      UPDATE balcao_orders SET status = 'finalizada', updated_at = now() WHERE id = v.id;
    END IF;
  ELSIF v_valor > 0 THEN
    INSERT INTO cash_flow (store_id, type, amount, payment_method, date, category, description, balcao_order_id, notes)
    VALUES (v.store_id, 'saida', v_valor, p_forma, v_hoje, 'Devolução de venda',
            'Devolução: ' || trim(to_char(p_qtd, 'FM999990.###')) || 'x ' || coalesce(it.description, 'item')
              || ' (nota #' || coalesce(v.numero::text, '') || ')',
            v.id, btrim(p_motivo) || CASE WHEN v_quem IS NOT NULL THEN ' · ' || v_quem ELSE '' END);
  END IF;

  INSERT INTO balcao_devolucoes (store_id, order_id, item_id, product_id, descricao, quantidade, valor, forma, motivo, feito_por)
  VALUES (v.store_id, v.id, it.id, it.product_id, it.description, p_qtd, v_valor, p_forma, btrim(p_motivo), v_quem);

  RETURN jsonb_build_object('valor', v_valor, 'forma', p_forma);
END;
$function$;
REVOKE ALL ON FUNCTION public.devolver_item_balcao(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_item_balcao(uuid, numeric, text, text, text) TO authenticated;
