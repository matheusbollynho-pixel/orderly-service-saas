-- Aviso automático no WhatsApp do cliente quando o preço especial (Lojista etc.) está para vencer.
-- Função lojista-aviso-vencimento, a cada 10 min das 9h às 18h (Fortaleza): 1 mensagem por loja por rodada.

-- Grupo: avisar X dias antes (vazio = não avisa) e texto próprio (vazio = texto padrão)
ALTER TABLE public.tipos_cliente ADD COLUMN IF NOT EXISTS aviso_dias integer DEFAULT 3
  CHECK (aviso_dias IS NULL OR (aviso_dias BETWEEN 1 AND 60));
ALTER TABLE public.tipos_cliente ADD COLUMN IF NOT EXISTS aviso_texto text;

-- Cliente: para qual validade já avisou, quando, e tentativas que falharam
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tipo_aviso_para date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tipo_aviso_em timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tipo_aviso_tentativas smallint NOT NULL DEFAULT 0;

-- Mesma trava de antes + validade nova zera as tentativas de aviso
CREATE OR REPLACE FUNCTION public.fn_cliente_tipo_permissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.tipo_cliente_id IS NULL AND NEW.tipo_valido_ate IS NOT NULL THEN
    NEW.tipo_valido_ate := NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tipo_valido_ate IS DISTINCT FROM OLD.tipo_valido_ate THEN
    NEW.tipo_aviso_tentativas := 0;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.tipo_cliente_id IS NOT DISTINCT FROM OLD.tipo_cliente_id
     AND NEW.tipo_valido_ate IS NOT DISTINCT FROM OLD.tipo_valido_ate THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.tipo_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.tipo_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tipos_cliente WHERE id = NEW.tipo_cliente_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'Tipo de cliente de outra loja';
  END IF;
  IF coalesce(current_setting('app.tipo_renova', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.pode_acao('dar_desconto') THEN
    RAISE EXCEPTION 'Sem permissão para mudar o tipo do cliente (preço de lojista). Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- A cada 10 min, das 9h às 17h50 (Fortaleza = UTC−3 → 12h às 20h50 UTC)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lojista-aviso-vencimento';
SELECT cron.schedule(
  'lojista-aviso-vencimento',
  '*/10 12-20 * * *',
  $$select public.cron_http('lojista-aviso-vencimento', 'lojista-aviso-vencimento')$$
);

-- Conferência: deve voltar 1 linha com '*/10 12-20 * * *'
SELECT jobname, schedule FROM cron.job WHERE jobname = 'lojista-aviso-vencimento';
