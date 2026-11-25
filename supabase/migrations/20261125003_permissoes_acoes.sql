-- Permissões por ação (parte 2): excluir OS, dar desconto, estornar/cancelar pagamentos, ajustar estoque.
-- Mesmo padrão do 20261125001: pode_acao(chave) — dono sempre pode, sem login (sistema) pode,
-- chave ausente nas permissões = liberado (ninguém que já usa perde nada).

-- Excluir OS
CREATE OR REPLACE FUNCTION public.fn_os_permissao_excluir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT public.pode_acao('excluir_os') THEN
    RAISE EXCEPTION 'Sem permissão para excluir OS. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;
DROP TRIGGER IF EXISTS trg_os_permissao_excluir ON public.service_orders;
CREATE TRIGGER trg_os_permissao_excluir BEFORE DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_os_permissao_excluir();

-- Estornar / cancelar pagamentos: todo estorno vira uma linha do caixa com estorno_de
-- (estorno manual, pagamento da OS apagado ou alterado, item pago removido, nota cancelada, vale cancelado)
CREATE OR REPLACE FUNCTION public.fn_caixa_permissao_estorno()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.estorno_de IS NOT NULL AND NOT public.pode_acao('estornar') THEN
    RAISE EXCEPTION 'Sem permissão para estornar ou cancelar pagamentos. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_caixa_permissao_estorno ON public.cash_flow;
CREATE TRIGGER trg_caixa_permissao_estorno BEFORE INSERT ON public.cash_flow
  FOR EACH ROW EXECUTE FUNCTION public.fn_caixa_permissao_estorno();

-- Dar desconto no pagamento da OS (novo desconto ou aumentar; tirar desconto é livre)
CREATE OR REPLACE FUNCTION public.fn_pagamento_permissao_desconto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  antes numeric := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    antes := COALESCE(OLD.discount_amount, 0);
  END IF;
  IF COALESCE(NEW.discount_amount, 0) > antes AND NOT public.pode_acao('dar_desconto') THEN
    RAISE EXCEPTION 'Sem permissão para dar desconto. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_pagamento_permissao_desconto ON public.payments;
CREATE TRIGGER trg_pagamento_permissao_desconto BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_pagamento_permissao_desconto();

-- Dar desconto na nota do balcão (o % é a escolha da pessoa; o valor em R$ é recalculado)
CREATE OR REPLACE FUNCTION public.fn_balcao_permissao_desconto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  antes numeric := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    antes := COALESCE(OLD.discount_pct, 0);
  END IF;
  IF COALESCE(NEW.discount_pct, 0) > antes AND NOT public.pode_acao('dar_desconto') THEN
    RAISE EXCEPTION 'Sem permissão para dar desconto. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_balcao_permissao_desconto ON public.balcao_orders;
CREATE TRIGGER trg_balcao_permissao_desconto BEFORE INSERT OR UPDATE ON public.balcao_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_balcao_permissao_desconto();

-- Ajustar estoque: movimentação "ajuste" (loja ou almoxarifado)
CREATE OR REPLACE FUNCTION public.fn_movimentacao_permissao_ajuste()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.type = 'ajuste' AND NOT public.pode_acao('ajustar_estoque') THEN
    RAISE EXCEPTION 'Sem permissão para ajustar o estoque. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_movimentacao_permissao_ajuste ON public.inventory_movements;
CREATE TRIGGER trg_movimentacao_permissao_ajuste BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_movimentacao_permissao_ajuste();

-- Ajustar estoque: saldo digitado direto no cadastro do produto (só quando a gravação vem da
-- própria tabela pela API; baixas automáticas de venda/OS passam por gatilhos/funções e seguem livres)
CREATE OR REPLACE FUNCTION public.fn_produto_permissao_saldo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  mudou boolean := false;
BEGIN
  IF COALESCE(current_setting('request.path', true), '') <> '/inventory_products' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    mudou := COALESCE(NEW.stock_current, 0) <> 0 OR COALESCE(NEW.stock_almox, 0) <> 0;
  ELSE
    mudou := NEW.stock_current IS DISTINCT FROM OLD.stock_current OR NEW.stock_almox IS DISTINCT FROM OLD.stock_almox;
  END IF;
  IF mudou AND NOT public.pode_acao('ajustar_estoque') THEN
    RAISE EXCEPTION 'Sem permissão para mudar o saldo do estoque. Peça ao gerente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_produto_permissao_saldo ON public.inventory_products;
CREATE TRIGGER trg_produto_permissao_saldo BEFORE INSERT OR UPDATE ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_produto_permissao_saldo();
