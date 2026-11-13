-- Data de entrega confiavel (base dos Relatorios v2): toda OS que vira "Concluida e Entregue"
-- ganha exit_date se ainda nao tiver. Antes so a tela de detalhe e o Fiado gravavam.
create or replace function public.gravar_data_entrega()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'concluida_entregue' and old.status is distinct from 'concluida_entregue'
     and new.exit_date is null then
    new.exit_date := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gravar_data_entrega on public.service_orders;
create trigger trg_gravar_data_entrega
  before update of status on public.service_orders
  for each row execute function public.gravar_data_entrega();

-- Acerto das entregues antigas sem data: usa a data de conclusao (ou a ultima alteracao).
update public.service_orders
   set exit_date = coalesce(conclusion_date, updated_at)
 where status = 'concluida_entregue'
   and exit_date is null;

select count(*) filter (where exit_date is null) as entregues_sem_data
  from public.service_orders
 where status = 'concluida_entregue';
