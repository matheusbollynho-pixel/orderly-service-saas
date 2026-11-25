-- Venda online (Instagram / WhatsApp / site) no lugar dos "setores da venda" (achado complicado demais).
-- A nota de balcão marca se foi online; o lançamento do caixa herda da nota (ou do estorno).
-- OS nunca é online (o veículo está na loja). Oficina × Balcão o caixa já separa.

ALTER TABLE public.balcao_orders ADD COLUMN IF NOT EXISTS venda_online boolean NOT NULL DEFAULT false;
ALTER TABLE public.cash_flow ADD COLUMN IF NOT EXISTS venda_online boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_caixa_venda_online()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT NEW.venda_online THEN
    IF NEW.estorno_de IS NOT NULL THEN
      SELECT coalesce(venda_online, false) INTO NEW.venda_online FROM cash_flow WHERE id = NEW.estorno_de;
    ELSIF NEW.balcao_order_id IS NOT NULL THEN
      SELECT coalesce(venda_online, false) INTO NEW.venda_online FROM balcao_orders WHERE id = NEW.balcao_order_id;
    END IF;
  END IF;
  NEW.venda_online := coalesce(NEW.venda_online, false);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_caixa_venda_online ON public.cash_flow;
CREATE TRIGGER trg_caixa_venda_online BEFORE INSERT ON public.cash_flow
  FOR EACH ROW EXECUTE FUNCTION public.fn_caixa_venda_online();

-- Setores: tira o que foi criado (só a Bandara tinha "Balcão"). A estrutura sai no próximo SQL,
-- depois que o site novo estiver no ar. Apagar o setor deixa as vendas ligadas a ele sem setor.
DELETE FROM public.setores_venda;

-- Trava: loja que usa abertura de caixa só recebe dinheiro (entrada) com o caixa aberto.
-- Vale para nota finalizada, pagamento de OS, fiado e lançamento manual feitos por alguém logado.
-- Saída, retirada e vale continuam livres; webhook/cron (sem usuário logado) não é barrado.
CREATE OR REPLACE FUNCTION public.fn_caixa_exige_aberto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.type <> 'entrada' OR auth.uid() IS NULL OR NEW.estorno_de IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM store_settings WHERE id = NEW.store_id AND usa_abertura_caixa)
     AND NOT EXISTS (SELECT 1 FROM caixa_turnos WHERE store_id = NEW.store_id AND fechado_em IS NULL) THEN
    RAISE EXCEPTION 'O caixa está fechado. Abra o caixa (tela Caixa → Abrir caixa) antes de registrar a venda.';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_caixa_exige_aberto ON public.cash_flow;
CREATE TRIGGER trg_caixa_exige_aberto BEFORE INSERT ON public.cash_flow
  FOR EACH ROW EXECUTE FUNCTION public.fn_caixa_exige_aberto();
