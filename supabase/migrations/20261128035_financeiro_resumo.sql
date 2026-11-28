-- Financeiro: resumo do dia/semana no WhatsApp do dono (e prévia no app).
-- 1) O cálculo do Resumo dos Relatórios vira uma função interna (_relatorio_resumo_calc) para o robô usar
--    sem login. relatorio_resumo continua igual para o app: mesma checagem de acesso, mesmo resultado.
-- 2) financeiro_resumo junta: o resumo + período de comparação + entradas por forma + lucro das peças +
--    vendas abaixo do custo + caixa com diferença/aberto de outro dia + contas vencendo.
-- 3) Liga/desliga por loja (diário e semanal) e marca de envio para não repetir.

-- ------------------------------------------------------------------ 1) cálculo interno (sem checagem)
create or replace function public._relatorio_resumo_calc(p_store_id uuid, p_ini date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz constant text := 'America/Fortaleza';
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_fim_mes date;
  r jsonb;
begin
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 1100 then
    raise exception 'Periodo invalido';
  end if;

  v_fim_mes := (date_trunc('month', p_fim) + interval '1 month - 1 day')::date;

  with caixa_bruto as (
    select cf.id, cf.type, cf.amount, cf.category, cf.order_id, cf.payment_id, cf.balcao_order_id, cf.estorno_de
      from cash_flow cf
     where cf.store_id = p_store_id and cf.date between p_ini and p_fim
  ),
  -- lancamento estornado + estorno dentro do periodo se anulam: fora dos totais
  caixa as (
    select b.*,
           (b.estorno_de is not null and exists (select 1 from caixa_bruto o where o.id = b.estorno_de))
        or exists (select 1 from caixa_bruto e where e.estorno_de = b.id) as anulado
      from caixa_bruto b
  ),
  os_vendidas as (
    select o.id,
           (select coalesce(sum(coalesce(m.valor, 0) * coalesce(
                    substring(btrim(coalesce(m.quantidade, '')) from '^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')::numeric, 0)), 0)
              from materials m where m.order_id = o.id) as total,
           (select coalesce(sum(coalesce(p.amount, 0)), 0) from payments p where p.order_id = o.id) as pago,
           (select coalesce(sum(coalesce(p.discount_amount, 0)), 0) from payments p where p.order_id = o.id) as desconto
      from service_orders o
     where o.store_id = p_store_id
       and o.status = 'concluida_entregue'
       and o.equipment <> '__QR_WALKIN_PLACEHOLDER__'
       and (o.exit_date at time zone v_tz)::date between p_ini and p_fim
  ),
  notas as (
    select b.total, b.discount_amount, b.status
      from balcao_orders b
     where b.store_id = p_store_id
       and b.status in ('finalizada', 'fiado')
       and (coalesce(b.finalized_at, b.created_at) at time zone v_tz)::date between p_ini and p_fim
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('ini', p_ini, 'fim', p_fim),
    'caixa', (select jsonb_build_object(
        'entradas',   coalesce(sum(amount) filter (where type = 'entrada' and not anulado), 0),
        'saidas',     coalesce(sum(amount) filter (where type = 'saida' and not anulado), 0),
        'retiradas',  coalesce(sum(amount) filter (where type = 'retirada' and not anulado), 0),
        'entradas_os',     coalesce(sum(amount) filter (where type = 'entrada' and not anulado and estorno_de is null and (order_id is not null or payment_id is not null)), 0),
        'entradas_notas',  coalesce(sum(amount) filter (where type = 'entrada' and not anulado and estorno_de is null and order_id is null and payment_id is null
                                                        and (balcao_order_id is not null or category = 'venda_balcao')), 0),
        'entradas_fiado',  coalesce(sum(amount) filter (where type = 'entrada' and not anulado and estorno_de is null and order_id is null and payment_id is null
                                                        and balcao_order_id is null and category = 'Fiado'), 0),
        'entradas_estorno', coalesce(sum(amount) filter (where type = 'entrada' and not anulado and estorno_de is not null), 0),
        'estornos_qtd',   count(*) filter (where estorno_de is not null),
        'estornos_valor', coalesce(sum(amount) filter (where estorno_de is not null), 0)
      ) from caixa),
    'os', (select jsonb_build_object(
        'qtd', count(*),
        'total', coalesce(sum(total), 0),
        'desconto', coalesce(sum(desconto), 0),
        'recebido', coalesce(sum(least(pago, greatest(total - desconto, 0))), 0),
        'a_receber', coalesce(sum(greatest(round(total - pago - desconto, 2), 0)), 0)
      ) from os_vendidas),
    'notas', (select jsonb_build_object(
        'qtd', count(*),
        'total', coalesce(sum(total), 0),
        'no_fiado', coalesce(sum(total) filter (where status = 'fiado'), 0)
      ) from notas),
    'descontos', jsonb_build_object(
        'os', (select coalesce(sum(coalesce(p.discount_amount, 0)), 0) from payments p
                where p.store_id = p_store_id and (p.created_at at time zone v_tz)::date between p_ini and p_fim),
        'notas', (select coalesce(sum(coalesce(discount_amount, 0)), 0) from notas)
      ),
    'pra_pagar', (select jsonb_build_object(
        'qtd', count(*),
        'valor', coalesce(sum(coalesce(bo.valor, 0)), 0),
        'ate', v_fim_mes,
        'vencidas', count(*) filter (where bo.vencimento < v_hoje)
      ) from boletos bo
       where bo.store_id = p_store_id and bo.paid_at is null and bo.vencimento <= v_fim_mes),
    'fiado_vencido', (select jsonb_build_object(
        'qtd', count(*),
        'valor', coalesce(sum(greatest(coalesce(f.original_amount, 0) + coalesce(f.interest_accrued, 0) - coalesce(f.amount_paid, 0), 0)), 0)
      ) from fiados f
       where f.store_id = p_store_id and f.status <> 'pago' and f.due_date < v_hoje)
  ) into r;

  return r;
end;
$$;
-- Só outras funções do banco chamam (nada do app nem anônimo)
revoke all on function public._relatorio_resumo_calc(uuid, date, date) from public, anon, authenticated;

-- ------------------------------------------------------------------ relatorio_resumo: igual para o app
create or replace function public.relatorio_resumo(p_store_id uuid, p_ini date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 1100 then
    raise exception 'Periodo invalido';
  end if;
  if not exists (
    select 1 from store_members sm
     where sm.user_id = auth.uid() and sm.active = true and sm.store_id = p_store_id
       and (sm.role = 'owner' or coalesce(sm.permissions->>'relatorios', 'false') = 'true')
  ) then
    raise exception 'Sem acesso aos relatorios desta loja';
  end if;
  return public._relatorio_resumo_calc(p_store_id, p_ini, p_fim);
end;
$$;
revoke all on function public.relatorio_resumo(uuid, date, date) from public, anon;
grant execute on function public.relatorio_resumo(uuid, date, date) to authenticated;

-- ------------------------------------------------------------------ 2) resumo financeiro
create or replace function public.financeiro_resumo(p_store_id uuid, p_ini date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz constant text := 'America/Fortaleza';
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_dias int;
  v_ant_ini date;
  v_ant_fim date;
  r jsonb;
begin
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 92 then
    raise exception 'Periodo invalido';
  end if;
  -- Robô do servidor (service_role) ou quem vê relatórios da loja
  if coalesce(auth.role(), '') <> 'service_role' and not exists (
    select 1 from store_members sm
     where sm.user_id = auth.uid() and sm.active = true and sm.store_id = p_store_id
       and (sm.role = 'owner' or coalesce(sm.permissions->>'relatorios', 'false') = 'true')
  ) then
    raise exception 'Sem acesso aos relatorios desta loja';
  end if;

  -- Comparação: até 7 dias = mesmos dias da semana anterior; mais que isso = período anterior do mesmo tamanho
  v_dias := p_fim - p_ini + 1;
  if v_dias <= 7 then
    v_ant_ini := p_ini - 7; v_ant_fim := p_fim - 7;
  else
    v_ant_ini := p_ini - v_dias; v_ant_fim := p_ini - 1;
  end if;

  with caixa_bruto as (
    select cf.id, cf.type, cf.amount, cf.payment_method, cf.estorno_de
      from cash_flow cf
     where cf.store_id = p_store_id and cf.date between p_ini and p_fim
  ),
  caixa as (
    select b.*,
           (b.estorno_de is not null and exists (select 1 from caixa_bruto o where o.id = b.estorno_de))
        or exists (select 1 from caixa_bruto e where e.estorno_de = b.id) as anulado
      from caixa_bruto b
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('ini', p_ini, 'fim', p_fim, 'dias', v_dias),
    'anterior_periodo', jsonb_build_object('ini', v_ant_ini, 'fim', v_ant_fim),
    'resumo', public._relatorio_resumo_calc(p_store_id, p_ini, p_fim),
    'anterior', public._relatorio_resumo_calc(p_store_id, v_ant_ini, v_ant_fim),
    'por_forma', coalesce((
        select jsonb_agg(jsonb_build_object('forma', forma, 'valor', valor) order by valor desc)
          from (select coalesce(nullif(payment_method, ''), 'outros') as forma, round(sum(amount), 2) as valor
                  from caixa where type = 'entrada' and not anulado
                 group by 1 having round(sum(amount), 2) <> 0) x), '[]'::jsonb),
    'pecas', (
        select jsonb_build_object(
          'faturamento', round(coalesce(sum(qtd * preco) filter (where custo > 0), 0), 2),
          'custo',       round(coalesce(sum(qtd * custo) filter (where custo > 0), 0), 2),
          'sem_custo_produtos', count(distinct produto) filter (where custo <= 0 and qtd > 0),
          'sem_custo_valor', round(coalesce(sum(qtd * preco) filter (where custo <= 0), 0), 2))
          from inventory_movements mv
          join inventory_products p on p.id = mv.product_id
          cross join lateral (select
              case when mv.type = 'devolucao' then -1 else 1 end * abs(mv.quantity) as qtd,
              -- Material tirado da OS volta sem preço: usa o preço com que saiu nessa OS (senão o de venda do produto)
              coalesce(mv.unit_price,
                       (select s.unit_price from inventory_movements s
                         where mv.type = 'devolucao' and mv.order_id is not null and s.order_id = mv.order_id
                           and s.product_id = mv.product_id and s.type = 'saida_os' and s.unit_price is not null
                         order by s.created_at desc limit 1),
                       p.sale_price, 0) as preco,
              coalesce(nullif(mv.unit_cost, 0), p.cost_price, 0) as custo,
              p.id as produto) c
         where mv.store_id = p_store_id
           and mv.type in ('saida_venda', 'saida_balcao', 'saida_os', 'devolucao')
           and coalesce(mv.local, 'loja') <> 'almox'
           -- Peça de dentro de um kit: o kit já leva preço e custo somados (fora, senão conta 2 vezes)
           and not (coalesce(mv.skip_cash_flow_trigger, false) and coalesce(mv.notes, '') like 'Kit: %')
           and (mv.created_at at time zone v_tz)::date between p_ini and p_fim),
    'abaixo_custo', coalesce((
        select jsonb_agg(jsonb_build_object('produto', nome, 'preco', preco, 'custo', custo, 'qtd', qtd) order by perda desc)
          from (select *, (custo - preco) * qtd as perda, row_number() over (order by (custo - preco) * qtd desc) as pos
                  from (select p.name as nome, mv.unit_price as preco, coalesce(nullif(mv.unit_cost, 0), p.cost_price) as custo, sum(abs(mv.quantity)) as qtd
                  from inventory_movements mv
                  join inventory_products p on p.id = mv.product_id
                 where mv.store_id = p_store_id
                   and mv.type in ('saida_venda', 'saida_balcao', 'saida_os')
                   and coalesce(mv.local, 'loja') <> 'almox'
                   and mv.unit_price is not null and mv.unit_price > 0
                   and coalesce(nullif(mv.unit_cost, 0), p.cost_price, 0) > mv.unit_price + 0.009
                   and (mv.created_at at time zone v_tz)::date between p_ini and p_fim
                 group by 1, 2, 3) g) x
         where x.pos <= 5), '[]'::jsonb),
    'caixa_diferencas', coalesce((
        select jsonb_agg(jsonb_build_object('fechado_em', t.fechado_em, 'quem', t.fechado_por, 'diferenca', t.diferenca) order by t.fechado_em)
          from caixa_turnos t
         where t.store_id = p_store_id and t.fechado_em is not null
           and abs(coalesce(t.diferenca, 0)) >= 0.01
           and (t.fechado_em at time zone v_tz)::date between p_ini and p_fim), '[]'::jsonb),
    'caixa_aberto_desde', (
        select (t.aberto_em at time zone v_tz)::date from caixa_turnos t
         where t.store_id = p_store_id and t.fechado_em is null
           and (t.aberto_em at time zone v_tz)::date < v_hoje
         limit 1),
    'contas_proximas', (
        select jsonb_build_object(
          'vencidas_qtd', count(*) filter (where bo.vencimento < v_hoje),
          'vencidas_valor', round(coalesce(sum(bo.valor) filter (where bo.vencimento < v_hoje), 0), 2),
          'proximas_qtd', count(*) filter (where bo.vencimento between v_hoje and v_hoje + 2),
          'proximas_valor', round(coalesce(sum(bo.valor) filter (where bo.vencimento between v_hoje and v_hoje + 2), 0), 2))
          from boletos bo
         where bo.store_id = p_store_id and bo.paid_at is null and bo.vencimento <= v_hoje + 2)
  ) into r;

  return r;
end;
$$;
revoke all on function public.financeiro_resumo(uuid, date, date) from public, anon;
grant execute on function public.financeiro_resumo(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------------ 3) liga/desliga e marca de envio
alter table public.store_settings add column if not exists financeiro_resumo_diario boolean not null default false;
alter table public.store_settings add column if not exists financeiro_resumo_semanal boolean not null default false;
alter table public.store_settings add column if not exists financeiro_diario_enviado_em date;
alter table public.store_settings add column if not exists financeiro_semanal_enviado_em date;

-- Diário às 20h e semanal segunda às 8h (horário de Brasília = UTC−3)
select cron.unschedule(jobid) from cron.job where jobname in ('financeiro-resumo-diario', 'financeiro-resumo-semanal');
select cron.schedule('financeiro-resumo-diario', '0 23 * * *',
  $$select public.cron_http('financeiro-resumo-diario', 'financeiro-resumo', '{"tipo":"diario"}'::jsonb, 60000)$$);
select cron.schedule('financeiro-resumo-semanal', '0 11 * * 1',
  $$select public.cron_http('financeiro-resumo-semanal', 'financeiro-resumo', '{"tipo":"semanal"}'::jsonb, 60000)$$);
