-- Agendamento ligado a OS:
-- 1) Abriu OS pro mesmo cliente (cadastro, telefone ou nome) perto da data do agendamento -> liga os dois.
-- 2) OS virou "Concluida e Entregue" -> agendamento vira "Realizado".
-- Mudar status do agendamento nao manda WhatsApp.

create or replace function public.ligar_agendamento_na_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_tel text := right(regexp_replace(coalesce(new.client_phone, ''), '[^0-9]', '', 'g'), 8);
  v_nome text := lower(btrim(coalesce(new.client_name, '')));
  v_ag uuid;
begin
  if new.equipment = '__QR_WALKIN_PLACEHOLDER__' or new.store_id is null then
    return new;
  end if;

  select a.id into v_ag
  from appointments a
  where a.store_id = new.store_id
    and a.service_order_id is null
    and a.status in ('agendado', 'confirmado')
    and a.appointment_date between v_hoje - 3 and v_hoje + 1
    and (
      (new.client_id is not null and a.client_id = new.client_id)
      or (length(v_tel) = 8 and right(regexp_replace(coalesce(a.client_phone, ''), '[^0-9]', '', 'g'), 8) = v_tel)
      or (v_nome <> '' and lower(btrim(a.client_name)) = v_nome)
    )
  order by abs(a.appointment_date - v_hoje), a.appointment_time nulls last
  limit 1;

  if v_ag is not null then
    update appointments set service_order_id = new.id, updated_at = now() where id = v_ag;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ligar_agendamento_na_os on public.service_orders;
create trigger trg_ligar_agendamento_na_os
  after insert on public.service_orders
  for each row execute function public.ligar_agendamento_na_os();

create or replace function public.finalizar_agendamento_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'concluida_entregue' and old.status is distinct from 'concluida_entregue' then
    update appointments
       set status = 'realizado', updated_at = now()
     where service_order_id = new.id
       and status in ('agendado', 'confirmado');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finalizar_agendamento_da_os on public.service_orders;
create trigger trg_finalizar_agendamento_da_os
  after update of status on public.service_orders
  for each row execute function public.finalizar_agendamento_da_os();

-- Limpeza: agendamento de teste do Claude (Bandara)
delete from appointments
 where store_id = '9fd27114-97d1-48cd-ad09-1b057fa9c185'
   and id = 'd02709c9-14ca-40cc-875b-3e01f58ae4ae'
   and client_name = 'TESTE CLAUDE';
