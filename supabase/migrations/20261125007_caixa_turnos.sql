-- Abertura e fechamento do caixa (conferência da gaveta). Opcional por loja (desligado por padrão).
-- Abre com o troco; fecha contando o dinheiro da gaveta e comparando com o esperado:
--   esperado = troco da abertura + entradas em dinheiro - saídas em dinheiro - retiradas (desde a abertura)
-- Estorno entra sozinho (é lançamento contrário na mesma forma). Pix/cartão aparecem só para conferir.

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS usa_abertura_caixa boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.caixa_turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  aberto_em timestamptz NOT NULL DEFAULT now(),
  aberto_por text NOT NULL,
  aberto_user uuid DEFAULT auth.uid(),
  valor_abertura numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_abertura >= 0),
  fechado_em timestamptz,
  fechado_por text,
  fechado_user uuid,
  esperado numeric(12,2),
  contado numeric(12,2),
  diferenca numeric(12,2),
  deixou_gaveta numeric(12,2),
  retirada_id uuid REFERENCES public.cash_flow(id) ON DELETE SET NULL,
  resumo jsonb,
  observacao text
);
-- Um caixa aberto por loja de cada vez
CREATE UNIQUE INDEX IF NOT EXISTS caixa_turnos_um_aberto ON public.caixa_turnos (store_id) WHERE fechado_em IS NULL;
CREATE INDEX IF NOT EXISTS caixa_turnos_store_idx ON public.caixa_turnos (store_id, aberto_em DESC);

ALTER TABLE public.caixa_turnos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "caixa_turnos: ler" ON public.caixa_turnos;
CREATE POLICY "caixa_turnos: ler" ON public.caixa_turnos FOR SELECT TO authenticated
  USING (store_id = get_my_store_id());
-- Gravar só pelas funções abaixo

-- Conta do turno (aberto: até agora; fechado: até o fechamento)
CREATE OR REPLACE FUNCTION public.resumo_caixa_turno(p_turno uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  t caixa_turnos%ROWTYPE;
  ate timestamptz;
  ent numeric; sai numeric; ret numeric;
  formas jsonb;
BEGIN
  SELECT * INTO t FROM caixa_turnos WHERE id = p_turno AND store_id = get_my_store_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Caixa nao encontrado'; END IF;
  ate := coalesce(t.fechado_em, now());
  SELECT coalesce(sum(amount) FILTER (WHERE type = 'entrada' AND payment_method = 'dinheiro'), 0),
         coalesce(sum(amount) FILTER (WHERE type = 'saida' AND payment_method = 'dinheiro'), 0),
         coalesce(sum(amount) FILTER (WHERE type = 'retirada' AND (id IS DISTINCT FROM t.retirada_id)), 0)
    INTO ent, sai, ret
    FROM cash_flow
   WHERE store_id = t.store_id AND created_at >= t.aberto_em AND created_at <= ate;
  SELECT coalesce(jsonb_object_agg(forma, total), '{}'::jsonb) INTO formas FROM (
    SELECT coalesce(payment_method, 'outro') AS forma,
           sum(CASE WHEN type = 'entrada' THEN amount WHEN type = 'saida' THEN -amount ELSE 0 END) AS total
      FROM cash_flow
     WHERE store_id = t.store_id AND created_at >= t.aberto_em AND created_at <= ate AND type IN ('entrada', 'saida')
     GROUP BY 1) f;
  RETURN jsonb_build_object(
    'abertura', t.valor_abertura, 'entradas_dinheiro', round(ent, 2), 'saidas_dinheiro', round(sai, 2),
    'retiradas', round(ret, 2), 'esperado', round(t.valor_abertura + ent - sai - ret, 2), 'por_forma', formas);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.resumo_caixa_turno(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.abrir_caixa(p_valor numeric, p_quem text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  loja uuid := get_my_store_id();
  v_id uuid;
BEGIN
  IF loja IS NULL THEN RAISE EXCEPTION 'Loja nao encontrada'; END IF;
  IF NOT public.pode_acao('abrir_fechar_caixa') THEN
    RAISE EXCEPTION 'Sem permissão para abrir ou fechar o caixa. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_quem), '') = '' THEN RAISE EXCEPTION 'Informe quem está abrindo o caixa'; END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'Valor do troco invalido'; END IF;
  IF EXISTS (SELECT 1 FROM caixa_turnos WHERE store_id = loja AND fechado_em IS NULL) THEN
    RAISE EXCEPTION 'O caixa já está aberto';
  END IF;
  INSERT INTO caixa_turnos (store_id, aberto_por, valor_abertura) VALUES (loja, btrim(p_quem), round(p_valor, 2))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.abrir_caixa(numeric, text) TO authenticated;

-- Fecha: compara contado x esperado. Se informar quanto fica na gaveta, o resto vira retirada.
CREATE OR REPLACE FUNCTION public.fechar_caixa(p_contado numeric, p_deixou numeric, p_quem text, p_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  loja uuid := get_my_store_id();
  t caixa_turnos%ROWTYPE;
  r jsonb;
  v_esp numeric;
  v_ret uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF NOT public.pode_acao('abrir_fechar_caixa') THEN
    RAISE EXCEPTION 'Sem permissão para abrir ou fechar o caixa. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_quem), '') = '' THEN RAISE EXCEPTION 'Informe quem está fechando o caixa'; END IF;
  IF p_contado IS NULL OR p_contado < 0 THEN RAISE EXCEPTION 'Informe o dinheiro contado na gaveta'; END IF;
  IF p_deixou IS NOT NULL AND (p_deixou < 0 OR p_deixou > p_contado) THEN
    RAISE EXCEPTION 'O que fica na gaveta não pode ser maior que o contado';
  END IF;
  SELECT * INTO t FROM caixa_turnos WHERE store_id = loja AND fechado_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O caixa não está aberto'; END IF;

  r := public.resumo_caixa_turno(t.id);
  v_esp := (r->>'esperado')::numeric;

  IF p_deixou IS NOT NULL AND p_contado - p_deixou > 0 THEN
    INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, date, notes, created_by)
    VALUES (loja, 'retirada', round(p_contado - p_deixou, 2), 'Retirada no fechamento do caixa', 'Retirada', 'dinheiro', v_hoje,
            'Fechado por ' || btrim(p_quem) || '. Ficou ' || round(p_deixou, 2) || ' na gaveta.', auth.uid())
    RETURNING id INTO v_ret;
  END IF;

  UPDATE caixa_turnos SET
    fechado_em = now(), fechado_por = btrim(p_quem), fechado_user = auth.uid(),
    esperado = v_esp, contado = round(p_contado, 2), diferenca = round(p_contado - v_esp, 2),
    deixou_gaveta = CASE WHEN p_deixou IS NULL THEN NULL ELSE round(p_deixou, 2) END,
    retirada_id = v_ret, resumo = r, observacao = nullif(btrim(p_obs), '')
  WHERE id = t.id;
  RETURN r || jsonb_build_object('contado', round(p_contado, 2), 'diferenca', round(p_contado - v_esp, 2));
END;
$function$;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(numeric, numeric, text, text) TO authenticated;

-- Tempo real (outro aparelho vê o caixa abrir/fechar)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'caixa_turnos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa_turnos;
  END IF;
END $$;
