-- Pagamentos da equipe (substitui a tela de Acerto de comissão):
-- cada pessoa recebe "só fixo", "fixo + comissão" ou "só comissão", por semana/quinzena/mês.
-- Total = fixo + comissão - vales + saldo anterior (dívida que sobrou do último pagamento).
-- A comissão continua no cálculo de sempre (calc_comissao) e o pagamento grava o acerto de
-- cada papel por baixo (com pagamento_id): é ele que marca serviço pago e move o "desde o
-- último acerto", então a mesma comissão nunca é paga duas vezes.

-- ---------------------------------------------------------------- como a pessoa recebe
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS forma_pagamento text NOT NULL DEFAULT 'comissao',
  ADD COLUMN IF NOT EXISTS valor_fixo numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periodicidade text NOT NULL DEFAULT 'semanal',
  ADD COLUMN IF NOT EXISTS dia_pagamento smallint;

ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_forma_pagamento_check;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_forma_pagamento_check
  CHECK (forma_pagamento IN ('fixo', 'fixo_comissao', 'comissao'));
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_periodicidade_check;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_periodicidade_check
  CHECK (periodicidade IN ('semanal', 'quinzenal', 'mensal'));
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_valor_fixo_check;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_valor_fixo_check CHECK (valor_fixo >= 0);
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_dia_pagamento_check;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_dia_pagamento_check
  CHECK (dia_pagamento IS NULL OR dia_pagamento BETWEEN 0 AND 31);

-- ---------------------------------------------------------------- pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  pessoa_nome text NOT NULL,
  ini date NOT NULL,
  fim date NOT NULL,
  forma_pagamento text NOT NULL,
  valor_fixo numeric(12,2) NOT NULL DEFAULT 0,
  comissao numeric(12,2) NOT NULL DEFAULT 0,
  vales numeric(12,2) NOT NULL DEFAULT 0,
  saldo_anterior numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,       -- pode ser negativo (vira saldo do próximo)
  pago numeric(12,2) NOT NULL DEFAULT 0,        -- o que saiu de fato (nunca negativo)
  meio text NOT NULL CHECK (meio IN ('dinheiro', 'pix', 'fora_caixa')),
  cash_flow_id uuid REFERENCES public.cash_flow(id) ON DELETE SET NULL,
  pago_em timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  desfeito_em timestamptz,
  desfeito_motivo text,
  CONSTRAINT pagamentos_equipe_periodo CHECK (fim >= ini)
);
CREATE INDEX IF NOT EXISTS pagamentos_equipe_pessoa_idx ON public.pagamentos_equipe (colaborador_id, fim DESC);

ALTER TABLE public.pagamentos_equipe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagamentos_equipe: ler" ON public.pagamentos_equipe;
CREATE POLICY "pagamentos_equipe: ler" ON public.pagamentos_equipe FOR SELECT TO authenticated
  USING (public.pode_comissoes(store_id));

ALTER TABLE public.acertos ADD COLUMN IF NOT EXISTS pagamento_id uuid REFERENCES public.pagamentos_equipe(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- vale ligado à pessoa
ALTER TABLE public.vales ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public.vales ADD COLUMN IF NOT EXISTS pagamento_id uuid REFERENCES public.pagamentos_equipe(id) ON DELETE SET NULL;

UPDATE public.vales v SET colaborador_id = c.id
  FROM public.colaboradores c
 WHERE v.colaborador_id IS NULL
   AND ((v.mechanic_id IS NOT NULL AND c.mechanic_id = v.mechanic_id) OR (v.staff_member_id IS NOT NULL AND c.staff_member_id = v.staff_member_id));

-- Vale lançado pelo papel (tela antiga/aberta) ganha a pessoa sozinho
CREATE OR REPLACE FUNCTION public.fn_vale_pessoa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.colaborador_id IS NULL THEN
    SELECT id INTO NEW.colaborador_id FROM colaboradores
     WHERE (NEW.mechanic_id IS NOT NULL AND mechanic_id = NEW.mechanic_id)
        OR (NEW.staff_member_id IS NOT NULL AND staff_member_id = NEW.staff_member_id)
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_vale_pessoa ON public.vales;
CREATE TRIGGER trg_vale_pessoa BEFORE INSERT ON public.vales
  FOR EACH ROW EXECUTE FUNCTION public.fn_vale_pessoa();

-- Quem aparece para receber vale no Caixa (sem CPF/Pix: só nome)
CREATE OR REPLACE FUNCTION public.listar_pessoas_vale()
RETURNS TABLE (id uuid, nome text, cargo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT c.id, c.nome, c.cargo FROM colaboradores c
   WHERE c.store_id = get_my_store_id() AND c.ativo
   ORDER BY c.nome;
$function$;
GRANT EXECUTE ON FUNCTION public.listar_pessoas_vale() TO authenticated;

-- Lançar vale para a pessoa (usa o papel dela quando tem; senão fica só na pessoa)
CREATE OR REPLACE FUNCTION public.lancar_vale_pessoa(p_colaborador_id uuid, p_valor numeric, p_forma text, p_autorizado_por text, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  c colaboradores%ROWTYPE;
  v_cash uuid;
  v_id uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  SELECT * INTO c FROM colaboradores WHERE id = p_colaborador_id AND store_id = get_my_store_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa nao encontrada'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Valor invalido'; END IF;
  IF p_forma NOT IN ('dinheiro', 'pix', 'fora_caixa') THEN RAISE EXCEPTION 'Forma invalida'; END IF;
  IF coalesce(btrim(p_autorizado_por), '') = '' THEN RAISE EXCEPTION 'Informe quem autorizou'; END IF;

  IF p_forma <> 'fora_caixa' THEN
    INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, date, notes, created_by)
    VALUES (c.store_id, 'saida', round(p_valor, 2), 'Vale - ' || c.nome, 'Vale', p_forma, v_hoje,
            'Autorizado por: ' || btrim(p_autorizado_por) || coalesce(' | ' || nullif(btrim(p_motivo), ''), ''), auth.uid())
    RETURNING id INTO v_cash;
  END IF;

  INSERT INTO vales (store_id, mechanic_id, staff_member_id, colaborador_id, pessoa_nome, valor, data, forma, autorizado_por, motivo, cash_flow_id)
  VALUES (c.store_id,
          CASE WHEN c.mechanic_id IS NOT NULL THEN c.mechanic_id END,
          CASE WHEN c.mechanic_id IS NULL THEN c.staff_member_id END,
          c.id, c.nome, round(p_valor, 2), v_hoje, p_forma, btrim(p_autorizado_por), nullif(btrim(p_motivo), ''), v_cash)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.lancar_vale_pessoa(uuid, numeric, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lancar_vale_pessoa(uuid, numeric, text, text, text) TO authenticated;

-- ---------------------------------------------------------------- período
-- Próximo dia de pagamento a partir de d (inclusive).
CREATE OR REPLACE FUNCTION public.proximo_dia_pagamento(p_periodicidade text, p_dia smallint, d date)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  alvo int;
  ultimo date;
  m date;
BEGIN
  IF p_periodicidade = 'semanal' THEN
    alvo := coalesce(p_dia, 6);
    RETURN d + ((alvo - extract(dow FROM d)::int + 7) % 7);
  ELSIF p_periodicidade = 'quinzenal' THEN
    IF extract(day FROM d) <= 15 THEN
      RETURN make_date(extract(year FROM d)::int, extract(month FROM d)::int, 15);
    END IF;
    RETURN (date_trunc('month', d) + interval '1 month - 1 day')::date;
  END IF;
  -- mensal: no dia escolhido (ou no último dia, em mês curto)
  alvo := coalesce(nullif(p_dia, 0), 5);
  m := date_trunc('month', d)::date;
  ultimo := (m + interval '1 month - 1 day')::date;
  IF extract(day FROM d) <= least(alvo, extract(day FROM ultimo)::int) THEN
    RETURN m + (least(alvo, extract(day FROM ultimo)::int) - 1);
  END IF;
  m := (m + interval '1 month')::date;
  ultimo := (m + interval '1 month - 1 day')::date;
  RETURN m + (least(alvo, extract(day FROM ultimo)::int) - 1);
END;
$function$;

-- Período em aberto da pessoa: depois do último pagamento até o próximo dia de pagar.
CREATE OR REPLACE FUNCTION public.periodo_pagamento(p_colaborador_id uuid, p_hoje date DEFAULT ((now() AT TIME ZONE 'America/Fortaleza')::date))
RETURNS TABLE (ini date, fim date) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  c colaboradores%ROWTYPE;
  dia smallint;
  ultimo date;
  f date;
BEGIN
  SELECT * INTO c FROM colaboradores WHERE id = p_colaborador_id;
  IF NOT FOUND THEN RETURN; END IF;
  dia := c.dia_pagamento;
  IF c.periodicidade = 'semanal' AND dia IS NULL THEN
    SELECT s.dia_acerto INTO dia FROM store_settings s WHERE s.id = c.store_id;
  END IF;
  SELECT max(p.fim) INTO ultimo FROM pagamentos_equipe p WHERE p.colaborador_id = c.id AND p.desfeito_em IS NULL;
  IF ultimo IS NOT NULL THEN
    RETURN QUERY SELECT ultimo + 1, public.proximo_dia_pagamento(c.periodicidade, dia, ultimo + 1);
    RETURN;
  END IF;
  f := public.proximo_dia_pagamento(c.periodicidade, dia, p_hoje);
  IF c.periodicidade = 'semanal' THEN
    RETURN QUERY SELECT f - 6, f;
  ELSIF c.periodicidade = 'quinzenal' THEN
    RETURN QUERY SELECT (CASE WHEN extract(day FROM f) = 15 THEN date_trunc('month', f)::date ELSE make_date(extract(year FROM f)::int, extract(month FROM f)::int, 16) END), f;
  ELSE
    RETURN QUERY SELECT (f - interval '1 month' + interval '1 day')::date, f;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------- cálculo
CREATE OR REPLACE FUNCTION public.calc_pagamento(p_colaborador_id uuid, p_ini date, p_fim date)
RETURNS TABLE (valor_fixo numeric, comissao numeric, vales numeric, qtd_vales int, saldo_anterior numeric, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  c colaboradores%ROWTYPE;
  v_fixo numeric := 0;
  v_com numeric := 0;
  v_vales numeric := 0;
  v_qtd int := 0;
  v_saldo numeric := 0;
  x numeric;
BEGIN
  SELECT * INTO c FROM colaboradores WHERE id = p_colaborador_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.forma_pagamento IN ('fixo', 'fixo_comissao') THEN v_fixo := c.valor_fixo; END IF;
  IF c.forma_pagamento IN ('comissao', 'fixo_comissao') THEN
    IF c.mechanic_id IS NOT NULL THEN
      SELECT cc.comissao INTO x FROM public.calc_comissao(c.store_id, c.mechanic_id, NULL, p_ini, p_fim) cc;
      v_com := v_com + coalesce(x, 0);
    END IF;
    IF c.staff_member_id IS NOT NULL THEN
      SELECT cc.comissao INTO x FROM public.calc_comissao(c.store_id, NULL, c.staff_member_id, p_ini, p_fim) cc;
      v_com := v_com + coalesce(x, 0);
    END IF;
  END IF;
  SELECT coalesce(sum(v.valor), 0), count(*) INTO v_vales, v_qtd FROM vales v
   WHERE v.store_id = c.store_id AND v.estornado_em IS NULL AND v.acerto_id IS NULL AND v.pagamento_id IS NULL
     AND v.data <= p_fim
     AND (v.colaborador_id = c.id
          OR (c.mechanic_id IS NOT NULL AND v.mechanic_id = c.mechanic_id)
          OR (c.staff_member_id IS NOT NULL AND v.staff_member_id = c.staff_member_id));
  SELECT least(p.total, 0) INTO v_saldo FROM pagamentos_equipe p
   WHERE p.colaborador_id = c.id AND p.desfeito_em IS NULL
   ORDER BY p.fim DESC, p.pago_em DESC LIMIT 1;
  v_saldo := coalesce(v_saldo, 0);
  RETURN QUERY SELECT round(v_fixo, 2), round(v_com, 2), round(v_vales, 2), v_qtd, round(v_saldo, 2),
                      round(v_fixo + v_com - v_vales + v_saldo, 2);
END;
$function$;
REVOKE ALL ON FUNCTION public.calc_pagamento(uuid, date, date) FROM public, anon, authenticated;

-- Tabela de pagamento da loja: período em aberto e quanto cada um tem a receber.
CREATE OR REPLACE FUNCTION public.folha_equipe(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  r jsonb;
  hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF NOT public.pode_comissoes(p_store_id) THEN RAISE EXCEPTION 'Sem acesso aos pagamentos desta loja'; END IF;
  SELECT coalesce(jsonb_agg(linha ORDER BY (linha->>'fim')::date, linha->>'nome'), '[]'::jsonb) INTO r
  FROM (
    SELECT jsonb_build_object(
             'id', c.id, 'nome', c.nome, 'cargo', c.cargo, 'ativo', c.ativo,
             'forma', c.forma_pagamento, 'periodicidade', c.periodicidade, 'dia', c.dia_pagamento,
             'ini', per.ini, 'fim', per.fim,
             'situacao', CASE WHEN per.fim < hoje THEN 'atrasado' WHEN per.fim = hoje THEN 'hoje' ELSE 'em_dia' END,
             'valor_fixo', k.valor_fixo, 'comissao', k.comissao, 'vales', k.vales, 'qtd_vales', k.qtd_vales,
             'saldo_anterior', k.saldo_anterior, 'total', k.total,
             'ultimo', (SELECT jsonb_build_object('id', p.id, 'ini', p.ini, 'fim', p.fim, 'total', p.total, 'pago', p.pago, 'pago_em', p.pago_em)
                          FROM pagamentos_equipe p WHERE p.colaborador_id = c.id AND p.desfeito_em IS NULL
                         ORDER BY p.fim DESC, p.pago_em DESC LIMIT 1)) AS linha
      FROM colaboradores c
      CROSS JOIN LATERAL public.periodo_pagamento(c.id, hoje) per
      CROSS JOIN LATERAL public.calc_pagamento(c.id, per.ini, per.fim) k
     WHERE c.store_id = p_store_id
       AND (c.ativo OR k.vales > 0 OR k.saldo_anterior <> 0)
  ) t;
  RETURN r;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.folha_equipe(uuid) TO authenticated;

-- Prévia de um período escolhido à mão (tela de pagar)
CREATE OR REPLACE FUNCTION public.previa_pagamento(p_colaborador_id uuid, p_ini date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  c colaboradores%ROWTYPE;
  k record;
BEGIN
  SELECT * INTO c FROM colaboradores WHERE id = p_colaborador_id;
  IF NOT FOUND OR NOT public.pode_comissoes(c.store_id) THEN RAISE EXCEPTION 'Pessoa nao encontrada'; END IF;
  IF p_ini IS NULL OR p_fim IS NULL OR p_fim < p_ini OR p_fim - p_ini > 62 THEN RAISE EXCEPTION 'Periodo invalido'; END IF;
  SELECT * INTO k FROM public.calc_pagamento(c.id, p_ini, p_fim);
  RETURN to_jsonb(k);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.previa_pagamento(uuid, date, date) TO authenticated;

-- ---------------------------------------------------------------- pagar
CREATE OR REPLACE FUNCTION public.fechar_pagamento(p_colaborador_id uuid, p_ini date, p_fim date, p_meio text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  c colaboradores%ROWTYPE;
  k record;
  cm record;
  v_pag uuid;
  v_acerto uuid;
  v_cash uuid;
  v_desde date;
  v_tz constant text := 'America/Fortaleza';
  v_hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
  v_com boolean;
  papel record;
BEGIN
  SELECT * INTO c FROM colaboradores WHERE id = p_colaborador_id;
  IF NOT FOUND OR NOT public.pode_comissoes(c.store_id) THEN RAISE EXCEPTION 'Pessoa nao encontrada'; END IF;
  IF NOT public.pode_acao('pagar_equipe') THEN
    RAISE EXCEPTION 'Sem permissão para pagar a equipe. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  IF p_meio NOT IN ('dinheiro', 'pix', 'fora_caixa') THEN RAISE EXCEPTION 'Forma de pagamento invalida'; END IF;
  IF p_ini IS NULL OR p_fim IS NULL OR p_fim < p_ini OR p_fim - p_ini > 62 THEN RAISE EXCEPTION 'Periodo invalido'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pagamento:' || c.id::text));
  IF EXISTS (SELECT 1 FROM pagamentos_equipe p WHERE p.colaborador_id = c.id AND p.desfeito_em IS NULL
               AND p.ini <= p_fim AND p.fim >= p_ini) THEN
    RAISE EXCEPTION 'Esse periodo (ou parte dele) ja foi pago para %', c.nome;
  END IF;

  SELECT * INTO k FROM public.calc_pagamento(c.id, p_ini, p_fim);
  v_com := c.forma_pagamento IN ('comissao', 'fixo_comissao');

  INSERT INTO pagamentos_equipe (store_id, colaborador_id, pessoa_nome, ini, fim, forma_pagamento, valor_fixo, comissao, vales,
                                 saldo_anterior, total, pago, meio)
  VALUES (c.store_id, c.id, c.nome, p_ini, p_fim, c.forma_pagamento, k.valor_fixo, k.comissao, k.vales,
          k.saldo_anterior, k.total, greatest(k.total, 0), p_meio)
  RETURNING id INTO v_pag;

  -- Comissão de cada papel: grava o acerto (move o "desde o último acerto") e marca serviço pago
  IF v_com THEN
    FOR papel IN
      SELECT 'm'::text AS tipo, c.mechanic_id AS id WHERE c.mechanic_id IS NOT NULL
      UNION ALL
      SELECT 's', c.staff_member_id WHERE c.staff_member_id IS NOT NULL
    LOOP
      IF EXISTS (SELECT 1 FROM acertos a WHERE a.store_id = c.store_id AND a.desfeito_em IS NULL
                   AND a.mechanic_id IS NOT DISTINCT FROM (CASE WHEN papel.tipo = 'm' THEN papel.id END)
                   AND a.staff_member_id IS NOT DISTINCT FROM (CASE WHEN papel.tipo = 's' THEN papel.id END)
                   AND a.ini <= p_fim AND a.fim >= p_ini) THEN
        RAISE EXCEPTION 'A comissao desse periodo ja foi acertada para %', c.nome;
      END IF;
      SELECT * INTO cm FROM public.calc_comissao(c.store_id, CASE WHEN papel.tipo = 'm' THEN papel.id END,
                                                  CASE WHEN papel.tipo = 's' THEN papel.id END, p_ini, p_fim);
      SELECT least(coalesce(max(a.ini), p_ini), p_ini) INTO v_desde FROM acertos a
       WHERE a.id = (SELECT a2.id FROM acertos a2 WHERE a2.store_id = c.store_id AND a2.desfeito_em IS NULL
                       AND a2.mechanic_id IS NOT DISTINCT FROM (CASE WHEN papel.tipo = 'm' THEN papel.id END)
                       AND a2.staff_member_id IS NOT DISTINCT FROM (CASE WHEN papel.tipo = 's' THEN papel.id END)
                       AND a2.fim < p_ini ORDER BY a2.fim DESC, a2.pago_em DESC LIMIT 1);
      INSERT INTO acertos (store_id, mechanic_id, staff_member_id, pessoa_nome, ini, fim, taxa, base, comissao, vales,
                           saldo_anterior, a_pagar, taxa_pecas, base_pecas, pagamento_id)
      VALUES (c.store_id, CASE WHEN papel.tipo = 'm' THEN papel.id END, CASE WHEN papel.tipo = 's' THEN papel.id END,
              c.nome, p_ini, p_fim, cm.taxa, cm.base, cm.comissao, 0, 0, cm.comissao,
              coalesce(cm.taxa_pecas, 0), coalesce(cm.base_pecas, 0), v_pag)
      RETURNING id INTO v_acerto;
      IF papel.tipo = 'm' THEN
        UPDATE materials m SET paid_at = now(), acerto_id = v_acerto
          FROM service_orders o
         WHERE o.id = m.order_id AND o.store_id = c.store_id
           AND o.status IN ('concluida', 'concluida_entregue') AND o.equipment <> '__QR_WALKIN_PLACEHOLDER__'
           AND (coalesce(o.exit_date, o.conclusion_date, o.created_at) AT TIME ZONE v_tz)::date BETWEEN v_desde AND p_fim
           AND m.is_service = true AND m.paid_at IS NULL
           AND (m.mechanic_id = papel.id OR (m.mechanic_id IS NULL AND o.mechanic_id = papel.id));
      END IF;
      UPDATE vales v SET acerto_id = v_acerto
       WHERE v.store_id = c.store_id AND v.estornado_em IS NULL AND v.acerto_id IS NULL AND v.pagamento_id IS NULL
         AND v.data <= p_fim
         AND (CASE WHEN papel.tipo = 'm' THEN v.mechanic_id ELSE v.staff_member_id END) = papel.id;
    END LOOP;
  END IF;

  -- Vales descontados neste pagamento (os mesmos que entraram na conta)
  UPDATE vales v SET pagamento_id = v_pag
   WHERE v.store_id = c.store_id AND v.estornado_em IS NULL AND v.pagamento_id IS NULL
     AND (v.acerto_id IS NULL OR v.acerto_id IN (SELECT a.id FROM acertos a WHERE a.pagamento_id = v_pag))
     AND v.data <= p_fim
     AND (v.colaborador_id = c.id
          OR (c.mechanic_id IS NOT NULL AND v.mechanic_id = c.mechanic_id)
          OR (c.staff_member_id IS NOT NULL AND v.staff_member_id = c.staff_member_id));

  -- Saída no caixa (o que foi pago de fato)
  IF p_meio <> 'fora_caixa' AND k.total > 0 THEN
    INSERT INTO cash_flow (store_id, type, amount, description, category, payment_method, date, notes, created_by)
    VALUES (c.store_id, 'saida', round(k.total, 2),
            'Pagamento - ' || c.nome || ' (' || to_char(p_ini, 'DD/MM') || ' a ' || to_char(p_fim, 'DD/MM') || ')',
            'Salário', p_meio, v_hoje,
            'Fixo ' || k.valor_fixo || ' + comissão ' || k.comissao || ' - vales ' || k.vales
              || CASE WHEN k.saldo_anterior <> 0 THEN ' + saldo ' || k.saldo_anterior ELSE '' END,
            auth.uid())
    RETURNING id INTO v_cash;
    UPDATE pagamentos_equipe SET cash_flow_id = v_cash WHERE id = v_pag;
  END IF;

  RETURN v_pag;
END;
$function$;
REVOKE ALL ON FUNCTION public.fechar_pagamento(uuid, date, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fechar_pagamento(uuid, date, date, text) TO authenticated;

-- Desfazer (só o último da pessoa): estorna a saída do caixa, solta vales e serviços.
CREATE OR REPLACE FUNCTION public.desfazer_pagamento(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  p pagamentos_equipe%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  SELECT * INTO p FROM pagamentos_equipe WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pode_comissoes(p.store_id) THEN RAISE EXCEPTION 'Pagamento nao encontrado'; END IF;
  IF NOT public.pode_acao('pagar_equipe') THEN
    RAISE EXCEPTION 'Sem permissão para mexer em pagamentos da equipe.' USING ERRCODE = '42501';
  END IF;
  IF p.desfeito_em IS NOT NULL THEN RAISE EXCEPTION 'Esse pagamento ja foi desfeito'; END IF;
  IF EXISTS (SELECT 1 FROM pagamentos_equipe b WHERE b.colaborador_id = p.colaborador_id AND b.desfeito_em IS NULL
               AND b.id <> p.id AND (b.fim > p.fim OR (b.fim = p.fim AND b.pago_em > p.pago_em))) THEN
    RAISE EXCEPTION 'So da para desfazer o ultimo pagamento dessa pessoa';
  END IF;

  IF p.cash_flow_id IS NOT NULL THEN
    PERFORM estornar_cash_interno(p.cash_flow_id, 'Pagamento desfeito: ' || btrim(p_motivo));
  END IF;
  UPDATE materials SET paid_at = NULL, acerto_id = NULL
   WHERE acerto_id IN (SELECT a.id FROM acertos a WHERE a.pagamento_id = p.id);
  UPDATE vales SET acerto_id = NULL WHERE acerto_id IN (SELECT a.id FROM acertos a WHERE a.pagamento_id = p.id);
  UPDATE vales SET pagamento_id = NULL WHERE pagamento_id = p.id;
  UPDATE acertos SET desfeito_em = now(), desfeito_motivo = 'Pagamento desfeito: ' || btrim(p_motivo) WHERE pagamento_id = p.id;
  UPDATE pagamentos_equipe SET desfeito_em = now(), desfeito_motivo = btrim(p_motivo) WHERE id = p.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.desfazer_pagamento(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_pagamento(uuid, text) TO authenticated;

-- ---------------------------------------------------------------- salvar a ficha (com como recebe)
CREATE OR REPLACE FUNCTION public.salvar_pessoa_equipe(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  loja uuid := get_my_store_id();
  pid uuid := NULLIF(p->>'id', '')::uuid;
  pessoa colaboradores%ROWTYPE;
  nome_ text := btrim(COALESCE(p->>'nome', ''));
  ativo_ boolean := COALESCE((p->>'ativo')::boolean, true);
  faz_os_ boolean := COALESCE((p->>'faz_os')::boolean, false);
  balcao_ boolean := COALESCE((p->>'atende_balcao')::boolean, false);
  foto_ text := NULLIF(p->>'foto_url', '');
  novo_id uuid;
BEGIN
  IF loja IS NULL OR NOT public.pode_acao('equipe') THEN
    RAISE EXCEPTION 'Sem permissão para mexer na equipe.' USING ERRCODE = '42501';
  END IF;
  IF nome_ = '' THEN
    RAISE EXCEPTION 'Informe o nome.';
  END IF;
  PERFORM set_config('app.equipe_rpc', 'on', true);

  IF pid IS NULL THEN
    INSERT INTO colaboradores (store_id, nome) VALUES (loja, nome_) RETURNING * INTO pessoa;
  ELSE
    SELECT * INTO pessoa FROM colaboradores WHERE id = pid AND store_id = loja FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Colaborador não encontrado nesta loja.';
    END IF;
  END IF;

  UPDATE colaboradores SET
    nome = nome_,
    apelido = NULLIF(btrim(p->>'apelido'), ''),
    cpf = NULLIF(regexp_replace(COALESCE(p->>'cpf', ''), '\D', '', 'g'), ''),
    telefone = NULLIF(regexp_replace(COALESCE(p->>'telefone', ''), '\D', '', 'g'), ''),
    email = NULLIF(lower(btrim(p->>'email')), ''),
    data_nascimento = NULLIF(p->>'data_nascimento', '')::date,
    endereco = NULLIF(btrim(p->>'endereco'), ''),
    cidade = NULLIF(btrim(p->>'cidade'), ''),
    estado = NULLIF(upper(left(btrim(COALESCE(p->>'estado', '')), 2)), ''),
    cargo = NULLIF(btrim(p->>'cargo'), ''),
    data_admissao = NULLIF(p->>'data_admissao', '')::date,
    pix_tipo = NULLIF(btrim(p->>'pix_tipo'), ''),
    pix_chave = NULLIF(btrim(p->>'pix_chave'), ''),
    observacoes = NULLIF(btrim(p->>'observacoes'), ''),
    foto_url = CASE WHEN p ? 'foto_url' THEN foto_ ELSE foto_url END,
    ativo = ativo_,
    faz_os = faz_os_,
    atende_balcao = balcao_,
    forma_pagamento = CASE WHEN p->>'forma_pagamento' IN ('fixo', 'fixo_comissao', 'comissao') THEN p->>'forma_pagamento' ELSE forma_pagamento END,
    valor_fixo = CASE WHEN p ? 'valor_fixo' THEN greatest(coalesce(NULLIF(p->>'valor_fixo', '')::numeric, 0), 0) ELSE valor_fixo END,
    periodicidade = CASE WHEN p->>'periodicidade' IN ('semanal', 'quinzenal', 'mensal') THEN p->>'periodicidade' ELSE periodicidade END,
    dia_pagamento = CASE WHEN p ? 'dia_pagamento' THEN NULLIF(p->>'dia_pagamento', '')::smallint ELSE dia_pagamento END,
    updated_at = now()
  WHERE id = pessoa.id
  RETURNING * INTO pessoa;

  -- Papel "faz serviço na OS"
  IF faz_os_ AND pessoa.mechanic_id IS NULL THEN
    INSERT INTO mechanics (store_id, name, commission_rate, commission_parts_rate, active, photo_url)
    VALUES (loja, nome_, COALESCE((p->>'comissao_servicos')::numeric, 0), COALESCE((p->>'comissao_pecas')::numeric, 0), ativo_, pessoa.foto_url)
    RETURNING id INTO novo_id;
    UPDATE colaboradores SET mechanic_id = novo_id WHERE id = pessoa.id;
  ELSIF pessoa.mechanic_id IS NOT NULL THEN
    UPDATE mechanics SET
      name = nome_,
      commission_rate = COALESCE((p->>'comissao_servicos')::numeric, commission_rate),
      commission_parts_rate = COALESCE((p->>'comissao_pecas')::numeric, commission_parts_rate),
      active = ativo_ AND faz_os_,
      photo_url = pessoa.foto_url,
      updated_at = now()
    WHERE id = pessoa.mechanic_id;
  END IF;

  -- Papel "atende no balcão"
  IF balcao_ AND pessoa.staff_member_id IS NULL THEN
    INSERT INTO staff_members (store_id, name, role, commission_rate, commission_on_parts, active, photo_url)
    VALUES (loja, nome_, CASE WHEN lower(COALESCE(pessoa.cargo, '')) = 'dono' THEN 'dono' ELSE 'balconista' END,
            COALESCE((p->>'comissao_balcao')::numeric, 0), COALESCE((p->>'comissao_balcao_pecas')::boolean, false), ativo_, pessoa.foto_url)
    RETURNING id INTO novo_id;
    UPDATE colaboradores SET staff_member_id = novo_id WHERE id = pessoa.id;
  ELSIF pessoa.staff_member_id IS NOT NULL THEN
    UPDATE staff_members SET
      name = nome_,
      role = CASE WHEN lower(COALESCE(pessoa.cargo, '')) = 'dono' THEN 'dono' ELSE role END,
      commission_rate = COALESCE((p->>'comissao_balcao')::numeric, commission_rate),
      commission_on_parts = COALESCE((p->>'comissao_balcao_pecas')::boolean, commission_on_parts),
      active = ativo_ AND balcao_,
      photo_url = pessoa.foto_url,
      updated_at = now()
    WHERE id = pessoa.staff_member_id;
  END IF;

  RETURN pessoa.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.salvar_pessoa_equipe(jsonb) TO authenticated;

-- Tempo real
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pagamentos_equipe') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pagamentos_equipe;
  END IF;
END $$;
