-- Saldo de IA avulso (não renova todo mês).
-- Quando preenchido, o gasto de IA da loja é somado desde esta data (e não
-- desde o dia 1º do mês) e comparado com ai_monthly_budget_brl. Bateu no
-- teto = IA corta e fica cortada até o super admin mudar o valor.
-- NULL = comportamento antigo (limite mensal que renova todo dia 1º).
alter table public.store_settings
  add column if not exists ai_budget_avulso_desde timestamptz;
