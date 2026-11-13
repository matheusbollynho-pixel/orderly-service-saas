-- Caixa: lancamento estornado + o estorno dele, dentro do mesmo periodo, se anulam e saem
-- de Entradas/Saidas (um valor digitado errado e estornado inflava os dois). Saldo nao muda.
-- Se cairem em periodos diferentes, cada um conta no seu. Mesma regra da tela do Caixa.

create or replace function public.relatorio_resumo(p_store_id uuid, p_ini date, p_fim date)
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

  if not exists (
    select 1 from store_members sm
     where sm.user_id = auth.uid() and sm.active = true and sm.store_id = p_store_id
       and (sm.role = 'owner' or coalesce(sm.permissions->>'relatorios', 'false') = 'true')
  ) then
    raise exception 'Sem acesso aos relatorios desta loja';
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

revoke all on function public.relatorio_resumo(uuid, date, date) from public, anon;
grant execute on function public.relatorio_resumo(uuid, date, date) to authenticated;


-- Conferencia: deve voltar aplicado = true
select position('anulado' in pg_get_functiondef('public.relatorio_resumo(uuid,date,date)'::regprocedure)) > 0 as aplicado;
