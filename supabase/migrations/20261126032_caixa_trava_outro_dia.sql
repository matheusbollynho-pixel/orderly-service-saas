-- Caixa: loja que usa abertura de caixa só lança venda com o caixa DE HOJE aberto.
-- Caixa esquecido aberto de um dia anterior também trava as entradas: tem que fechar aquele dia antes
-- (regra pedida em 26/11 — o "esperado na gaveta" somava dois dias). Retirada, saída, estorno e o
-- fechamento continuam liberados (senão não dá para fechar o caixa antigo).
CREATE OR REPLACE FUNCTION public.fn_caixa_exige_aberto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_aberto timestamptz;
BEGIN
  IF NEW.type <> 'entrada' OR auth.uid() IS NULL OR NEW.estorno_de IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM store_settings WHERE id = NEW.store_id AND usa_abertura_caixa) THEN
    RETURN NEW;
  END IF;
  SELECT aberto_em INTO v_aberto FROM caixa_turnos
   WHERE store_id = NEW.store_id AND fechado_em IS NULL ORDER BY aberto_em DESC LIMIT 1;
  IF v_aberto IS NULL THEN
    RAISE EXCEPTION 'O caixa está fechado. Abra o caixa (tela Caixa → Abrir caixa) antes de registrar a venda.';
  END IF;
  IF (v_aberto AT TIME ZONE 'America/Sao_Paulo')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'O caixa do dia % ainda está aberto. Feche o caixa daquele dia (tela Caixa → Fechar caixa) e abra o de hoje antes de registrar a venda.',
      to_char(v_aberto AT TIME ZONE 'America/Sao_Paulo', 'DD/MM');
  END IF;
  RETURN NEW;
END;
$function$;
