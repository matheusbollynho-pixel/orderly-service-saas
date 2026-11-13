-- Vale do colaborador (fatias 1-2): registra o vale ligado a pessoa e, se saiu do caixa,
-- a saida no Caixa junto (categoria "Vale"). O desconto no acerto vem depois (acerto_id).
-- Nada se apaga: errou, estorna com motivo.

create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_settings(id) on delete cascade,
  mechanic_id uuid references public.mechanics(id) on delete set null,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  pessoa_nome text not null,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default ((now() at time zone 'America/Fortaleza')::date),
  forma text not null check (forma in ('dinheiro', 'pix', 'fora_caixa')),
  autorizado_por text not null,
  motivo text,
  cash_flow_id uuid references public.cash_flow(id) on delete set null,
  acerto_id uuid,
  estornado_em timestamptz,
  estorno_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint vales_uma_pessoa check (num_nonnulls(mechanic_id, staff_member_id) <= 1)
);

create index if not exists idx_vales_store_aberto on public.vales (store_id) where acerto_id is null and estornado_em is null;
create index if not exists idx_vales_mechanic on public.vales (mechanic_id);
create index if not exists idx_vales_staff on public.vales (staff_member_id);

alter table public.vales enable row level security;

drop policy if exists "vales: select" on public.vales;
create policy "vales: select" on public.vales for select to authenticated
  using (store_id in (select sm.store_id from public.store_members sm where sm.user_id = auth.uid() and sm.active = true));
-- Sem insert/update/delete direto: so pelas funcoes abaixo.

-- Lancar vale
create or replace function public.lancar_vale(
  p_mechanic_id uuid, p_staff_member_id uuid, p_valor numeric, p_forma text, p_autorizado_por text, p_motivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_nome text;
  v_cash uuid;
  v_id uuid;
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  if num_nonnulls(p_mechanic_id, p_staff_member_id) <> 1 then raise exception 'Escolha uma pessoa'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Valor invalido'; end if;
  if p_forma not in ('dinheiro', 'pix', 'fora_caixa') then raise exception 'Forma invalida'; end if;
  if coalesce(btrim(p_autorizado_por), '') = '' then raise exception 'Informe quem autorizou'; end if;

  if p_mechanic_id is not null then
    select store_id, name into v_store, v_nome from mechanics where id = p_mechanic_id;
  else
    select store_id, name into v_store, v_nome from staff_members where id = p_staff_member_id;
  end if;
  if v_store is null then raise exception 'Pessoa nao encontrada'; end if;

  if not exists (select 1 from store_members sm where sm.user_id = auth.uid() and sm.active = true and sm.store_id = v_store) then
    raise exception 'Pessoa nao encontrada';
  end if;

  if p_forma <> 'fora_caixa' then
    insert into cash_flow (store_id, type, amount, description, category, payment_method, date, notes, created_by)
    values (v_store, 'saida', round(p_valor, 2), 'Vale - ' || v_nome, 'Vale', p_forma, v_hoje,
            'Autorizado por: ' || btrim(p_autorizado_por) || coalesce(' | ' || nullif(btrim(p_motivo), ''), ''),
            auth.uid())
    returning id into v_cash;
  end if;

  insert into vales (store_id, mechanic_id, staff_member_id, pessoa_nome, valor, data, forma, autorizado_por, motivo, cash_flow_id)
  values (v_store, p_mechanic_id, p_staff_member_id, v_nome, round(p_valor, 2), v_hoje, p_forma,
          btrim(p_autorizado_por), nullif(btrim(p_motivo), ''), v_cash)
  returning id into v_id;
  return v_id;
end $$;

-- Estornar vale (ainda nao acertado). Estorna a saida do Caixa junto.
create or replace function public.estornar_vale(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v vales%rowtype;
begin
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  select * into v from vales where id = p_id for update;
  if not found or not exists (select 1 from store_members sm where sm.user_id = auth.uid() and sm.active = true and sm.store_id = v.store_id) then
    raise exception 'Vale nao encontrado';
  end if;
  if v.estornado_em is not null then raise exception 'Esse vale ja foi estornado'; end if;
  if v.acerto_id is not null then raise exception 'Esse vale ja foi descontado num acerto'; end if;

  if v.cash_flow_id is not null then
    perform estornar_cash_interno(v.cash_flow_id, btrim(p_motivo));  -- se ja estava estornado no Caixa, nao faz nada
  end if;
  update vales set estornado_em = now(), estorno_motivo = btrim(p_motivo) where id = p_id;
end $$;

-- Se a saida do vale for estornada direto na tela do Caixa, o vale cai junto.
create or replace function public.vale_segue_estorno_do_caixa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estornado_em is not null and old.estornado_em is null then
    update vales set estornado_em = new.estornado_em, estorno_motivo = coalesce(estorno_motivo, new.estorno_motivo)
     where cash_flow_id = new.id and estornado_em is null and acerto_id is null;
  end if;
  return new;
end $$;

drop trigger if exists trg_vale_segue_estorno on public.cash_flow;
create trigger trg_vale_segue_estorno after update of estornado_em on public.cash_flow
  for each row execute function public.vale_segue_estorno_do_caixa();

revoke all on function public.lancar_vale(uuid, uuid, numeric, text, text, text) from public, anon;
revoke all on function public.estornar_vale(uuid, text) from public, anon;
revoke all on function public.vale_segue_estorno_do_caixa() from public, anon, authenticated;
grant execute on function public.lancar_vale(uuid, uuid, numeric, text, text, text) to authenticated;
grant execute on function public.estornar_vale(uuid, text) to authenticated;

-- Tempo real (outros aparelhos veem o vale na hora)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vales') then
    alter publication supabase_realtime add table public.vales;
  end if;
end $$;

select count(*) as vales_existentes from public.vales;
