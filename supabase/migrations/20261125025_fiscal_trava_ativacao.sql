-- Módulo fiscal é pago e emitir em PRODUÇÃO gera nota de verdade: só o administrador do SaaS
-- (ou o servidor / SQL Editor, onde não há usuário logado) liga o módulo ou troca o ambiente.
-- O dono da loja continua podendo ajustar regime, alíquotas e padrões.
CREATE OR REPLACE FUNCTION public.fn_fiscal_trava_ativacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.fiscal_ativo IS DISTINCT FROM OLD.fiscal_ativo OR NEW.fiscal_ambiente IS DISTINCT FROM OLD.fiscal_ambiente)
     AND auth.uid() IS NOT NULL AND NOT public.is_saas_admin() THEN
    RAISE EXCEPTION 'Só o suporte do sistema liga o módulo fiscal ou troca o ambiente de emissão.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_trava_ativacao ON public.store_settings;
CREATE TRIGGER trg_fiscal_trava_ativacao BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_trava_ativacao();
