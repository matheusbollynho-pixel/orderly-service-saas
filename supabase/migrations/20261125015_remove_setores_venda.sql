-- Remove os "setores da venda" (trocados pela marcação "venda online" na nota).
DROP TRIGGER IF EXISTS trg_caixa_setor ON public.cash_flow;
DROP TRIGGER IF EXISTS trg_balcao_setor_padrao ON public.balcao_orders;
DROP TRIGGER IF EXISTS trg_os_setor_padrao ON public.service_orders;
DROP FUNCTION IF EXISTS public.fn_caixa_setor();
DROP FUNCTION IF EXISTS public.fn_venda_setor_padrao();
DROP FUNCTION IF EXISTS public.fn_setor_da_loja(uuid, uuid);
ALTER TABLE public.cash_flow DROP COLUMN IF EXISTS setor_id;
ALTER TABLE public.balcao_orders DROP COLUMN IF EXISTS setor_id;
ALTER TABLE public.service_orders DROP COLUMN IF EXISTS setor_id;
DROP TABLE IF EXISTS public.setores_venda;
