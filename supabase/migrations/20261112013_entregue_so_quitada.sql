-- OS so vira "Concluida e Entregue" sem saldo pendente: paga tudo ou o resto vai pro Fiado.
-- Vale so daqui pra frente (as que ja estao entregues nao mudam).
-- A conta e a mesma da tela (materiais x quantidade - pagamentos - descontos).

create or replace function public.saldo_os(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    (select coalesce(sum(coalesce(m.valor, 0) * coalesce(
        substring(btrim(coalesce(m.quantidade, '')) from '^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')::numeric, 0)), 0)
       from materials m where m.order_id = p_order_id)
    - (select coalesce(sum(coalesce(p.amount, 0) + coalesce(p.discount_amount, 0)), 0)
       from payments p where p.order_id = p_order_id)
  , 2);
$$;

revoke all on function public.saldo_os(uuid) from public, anon;
grant execute on function public.saldo_os(uuid) to authenticated, service_role;

create or replace function public.bloquear_entrega_com_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falta numeric;
begin
  if new.status = 'concluida_entregue' and old.status is distinct from 'concluida_entregue' then
    -- Mandou pro Fiado: a divida esta registrada, pode entregar
    if exists (select 1 from fiados f where f.origin_type = 'os' and f.origin_id = new.id::text) then
      return new;
    end if;
    v_falta := public.saldo_os(new.id);
    if v_falta > 0.01 then
      raise exception 'Falta R$ % nesta OS. Receba tudo ou mande o restante pro Fiado antes de marcar Concluida e Entregue.',
        to_char(v_falta, 'FM999G999G990D00')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_entrega_com_saldo on public.service_orders;
create trigger trg_bloquear_entrega_com_saldo
  before update of status on public.service_orders
  for each row execute function public.bloquear_entrega_com_saldo();
