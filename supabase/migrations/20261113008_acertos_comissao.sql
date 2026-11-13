-- Acerto de comissao (vale fatia 3 + Relatorios fatia 5): Comissao - Vales + saldo anterior = A pagar.
-- Calculado no banco. Mecanico: % sobre SERVICOS das OS concluidas no periodo (data de saida/conclusao).
-- Atendente: % sobre notas do balcao finalizadas + (se marcado) pecas das OS que ele abriu.
-- So conta servico ainda NAO marcado pago (a tela antiga marcava peca por peca): nunca paga duas vezes.
-- O que entrou depois do ultimo acerto (ex.: OS concluida no sabado a tarde) cai no proximo: nada se perde.

alter table public.store_settings add column if not exists dia_acerto smallint not null default 6;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_dia_acerto_check') then
    alter table public.store_settings add constraint store_settings_dia_acerto_check check (dia_acerto between 0 and 6);
  end if;
end $$;

create table if not exists public.acertos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_settings(id) on delete cascade,
  mechanic_id uuid references public.mechanics(id) on delete set null,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  pessoa_nome text not null,
  ini date not null,
  fim date not null,
  taxa numeric not null default 0,
  base numeric(12,2) not null default 0,
  comissao numeric(12,2) not null default 0,
  vales numeric(12,2) not null default 0,
  saldo_anterior numeric(12,2) not null default 0,
  a_pagar numeric(12,2) not null default 0,
  pago_em timestamptz not null default now(),
  created_by uuid default auth.uid(),
  desfeito_em timestamptz,
  desfeito_motivo text,
  constraint acertos_uma_pessoa check (num_nonnulls(mechanic_id, staff_member_id) <= 1),
  constraint acertos_periodo check (fim >= ini)
);
create index if not exists idx_acertos_pessoa on public.acertos (store_id, mechanic_id, staff_member_id, fim desc);

alter table public.acertos enable row level security;
drop policy if exists "acertos: select" on public.acertos;
create policy "acertos: select" on public.acertos for select to authenticated
  using (store_id in (select sm.store_id from public.store_members sm where sm.user_id = auth.uid() and sm.active = true));

alter table public.materials add column if not exists acerto_id uuid references public.acertos(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vales_acerto_id_fkey') then
    alter table public.vales add constraint vales_acerto_id_fkey foreign key (acerto_id) references public.acertos(id) on delete set null;
  end if;
end $$;

-- Quem pode ver/fechar acerto: dono, admin ou quem tem a permissao "comissoes".
create or replace function public.pode_comissoes(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from store_members sm
     where sm.user_id = auth.uid() and sm.active = true and sm.store_id = p_store_id
       and (sm.role in ('owner', 'admin') or coalesce(sm.permissions->>'comissoes', 'false') = 'true'));
$$;

-- Calculo interno (nao chamavel direto).
create or replace function public.calc_comissao(p_store_id uuid, p_mechanic_id uuid, p_staff_id uuid, p_ini date, p_fim date)
returns table (taxa numeric, base numeric, comissao numeric, ja_pago numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz constant text := 'America/Fortaleza';
  v_taxa numeric := 0;
  v_parts boolean := false;
  v_base numeric := 0;
  v_pago numeric := 0;
  v_notas numeric := 0;
  v_pecas numeric := 0;
  v_desde date;            -- mecanico: servico sem pagar desde o inicio do ultimo acerto (pega o que sobrou)
  v_depois timestamptz;    -- atendente: o que entrou depois do ultimo acerto
  v_ate timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Fortaleza');
begin
  select a.ini, a.pago_em into v_desde, v_depois from acertos a
   where a.store_id = p_store_id and a.desfeito_em is null
     and a.mechanic_id is not distinct from p_mechanic_id and a.staff_member_id is not distinct from p_staff_id
     and a.fim < p_ini
   order by a.fim desc, a.pago_em desc limit 1;
  v_desde := least(coalesce(v_desde, p_ini), p_ini);

  if p_mechanic_id is not null then
    select coalesce(commission_rate, 0) into v_taxa from mechanics where id = p_mechanic_id and store_id = p_store_id;
    select coalesce(sum(x.v) filter (where x.paid_at is null), 0), coalesce(sum(x.v) filter (where x.paid_at is not null), 0)
      into v_base, v_pago
      from (
        select coalesce(m.valor, 0) * coalesce(substring(btrim(coalesce(m.quantidade, '')) from '^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')::numeric, 0) as v,
               m.paid_at
          from materials m
          join service_orders o on o.id = m.order_id
         where o.store_id = p_store_id
           and o.status in ('concluida', 'concluida_entregue')
           and o.equipment <> '__QR_WALKIN_PLACEHOLDER__'
           and (coalesce(o.exit_date, o.conclusion_date, o.created_at) at time zone v_tz)::date between v_desde and p_fim
           and m.is_service = true
           and (m.paid_at is null or (coalesce(o.exit_date, o.conclusion_date, o.created_at) at time zone v_tz)::date >= p_ini)
           and (m.mechanic_id = p_mechanic_id or (m.mechanic_id is null and o.mechanic_id = p_mechanic_id))
      ) x;
  elsif p_staff_id is not null then
    select coalesce(commission_rate, 0), coalesce(commission_on_parts, false) into v_taxa, v_parts
      from staff_members where id = p_staff_id and store_id = p_store_id;
    select coalesce(sum(t.itens * (1 - coalesce(t.discount_pct, 0) / 100)), 0) into v_notas
      from (
        select b.discount_pct, (select coalesce(sum(i.unit_price * i.quantity), 0) from balcao_items i where i.order_id = b.id) as itens
          from balcao_orders b
         where b.store_id = p_store_id and b.status = 'finalizada' and b.atendente_id = p_staff_id
           and b.finalized_at < v_ate
           and (case when v_depois is not null then b.finalized_at > v_depois
                     else (b.finalized_at at time zone v_tz)::date >= p_ini end)
      ) t;
    if v_parts then
      select coalesce(sum(coalesce(m.valor, 0) * coalesce(substring(btrim(coalesce(m.quantidade, '')) from '^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')::numeric, 0)), 0)
        into v_pecas
        from materials m
        join service_orders o on o.id = m.order_id
       where o.store_id = p_store_id and o.atendimento_id = p_staff_id
         and o.status in ('concluida', 'concluida_entregue')
         and coalesce(o.exit_date, o.conclusion_date, o.created_at) < v_ate
         and (case when v_depois is not null then coalesce(o.exit_date, o.conclusion_date, o.created_at) > v_depois
                   else (coalesce(o.exit_date, o.conclusion_date, o.created_at) at time zone v_tz)::date >= p_ini end)
         and coalesce(m.is_service, false) = false;
    end if;
    v_base := v_notas + v_pecas;
  end if;
  return query select v_taxa, round(v_base, 2), round(v_base * v_taxa / 100, 2), round(v_pago, 2);
end $$;

-- Lista do periodo: uma linha por pessoa (ativos + quem tem vale em aberto).
create or replace function public.relatorio_comissoes(p_store_id uuid, p_ini date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
begin
  if p_ini is null or p_fim is null or p_fim < p_ini or p_fim - p_ini > 400 then raise exception 'Periodo invalido'; end if;
  if not public.pode_comissoes(p_store_id) then raise exception 'Sem acesso as comissoes desta loja'; end if;

  with pessoas as (
    select 'm'::text as tipo, m.id, m.name as nome from mechanics m
     where m.store_id = p_store_id and (m.active is not false
        or exists (select 1 from vales v where v.mechanic_id = m.id and v.acerto_id is null and v.estornado_em is null))
    union all
    select 's', s.id, s.name from staff_members s
     where s.store_id = p_store_id and (s.active is not false
        or exists (select 1 from vales v where v.staff_member_id = s.id and v.acerto_id is null and v.estornado_em is null))
  ),
  linhas as (
    select p.tipo, p.id, p.nome, c.taxa, c.base, c.comissao, c.ja_pago,
           (select coalesce(sum(v.valor), 0) from vales v
             where v.store_id = p_store_id and v.acerto_id is null and v.estornado_em is null and v.data <= p_fim
               and (case when p.tipo = 'm' then v.mechanic_id else v.staff_member_id end) = p.id) as vales,
           (select count(*) from vales v
             where v.store_id = p_store_id and v.acerto_id is null and v.estornado_em is null and v.data <= p_fim
               and (case when p.tipo = 'm' then v.mechanic_id else v.staff_member_id end) = p.id) as qtd_vales,
           (select least(a.a_pagar, 0) from acertos a
             where a.store_id = p_store_id and a.desfeito_em is null
               and (case when p.tipo = 'm' then a.mechanic_id else a.staff_member_id end) = p.id
             order by a.fim desc, a.pago_em desc limit 1) as saldo_anterior,
           (select to_jsonb(a) - 'store_id' - 'created_by' from acertos a
             where a.store_id = p_store_id and a.desfeito_em is null and a.ini <= p_fim and a.fim >= p_ini
               and (case when p.tipo = 'm' then a.mechanic_id else a.staff_member_id end) = p.id
             order by a.pago_em desc limit 1) as acerto
      from pessoas p
      cross join lateral public.calc_comissao(p_store_id, case when p.tipo = 'm' then p.id end, case when p.tipo = 's' then p.id end, p_ini, p_fim) c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', tipo, 'id', id, 'nome', nome, 'taxa', taxa, 'base', base, 'comissao', comissao, 'ja_pago', ja_pago,
           'vales', vales, 'qtd_vales', qtd_vales, 'saldo_anterior', coalesce(saldo_anterior, 0),
           'a_pagar', round(comissao - vales + coalesce(saldo_anterior, 0), 2), 'acerto', acerto)
         order by tipo, nome), '[]'::jsonb)
    into r
    from linhas
   where comissao > 0 or vales > 0 or coalesce(saldo_anterior, 0) <> 0 or acerto is not null or ja_pago > 0;
  return r;
end $$;

-- Marcar pago: fecha o periodo da pessoa (valores calculados aqui, nao vem da tela).
create or replace function public.fechar_acerto(p_store_id uuid, p_tipo text, p_pessoa_id uuid, p_ini date, p_fim date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mech uuid := case when p_tipo = 'm' then p_pessoa_id end;
  v_staff uuid := case when p_tipo = 's' then p_pessoa_id end;
  v_nome text;
  c record;
  v_vales numeric;
  v_saldo numeric;
  v_id uuid;
  v_desde date;
  v_tz constant text := 'America/Fortaleza';
begin
  if p_tipo not in ('m', 's') or p_pessoa_id is null then raise exception 'Pessoa invalida'; end if;
  if p_ini is null or p_fim is null or p_fim < p_ini then raise exception 'Periodo invalido'; end if;
  if not public.pode_comissoes(p_store_id) then raise exception 'Sem acesso as comissoes desta loja'; end if;

  if v_mech is not null then select name into v_nome from mechanics where id = v_mech and store_id = p_store_id;
  else select name into v_nome from staff_members where id = v_staff and store_id = p_store_id; end if;
  if v_nome is null then raise exception 'Pessoa nao encontrada'; end if;

  perform pg_advisory_xact_lock(hashtext('acerto:' || p_pessoa_id::text));
  if exists (select 1 from acertos a where a.store_id = p_store_id and a.desfeito_em is null
               and a.mechanic_id is not distinct from v_mech and a.staff_member_id is not distinct from v_staff
               and a.ini <= p_fim and a.fim >= p_ini) then
    raise exception 'Esse periodo (ou parte dele) ja foi acertado pra %', v_nome;
  end if;

  select * into c from public.calc_comissao(p_store_id, v_mech, v_staff, p_ini, p_fim);
  select least(coalesce(max(a.ini), p_ini), p_ini) into v_desde from acertos a
   where a.id = (select a2.id from acertos a2 where a2.store_id = p_store_id and a2.desfeito_em is null
                   and a2.mechanic_id is not distinct from v_mech and a2.staff_member_id is not distinct from v_staff
                   and a2.fim < p_ini order by a2.fim desc, a2.pago_em desc limit 1);
  select coalesce(sum(valor), 0) into v_vales from vales
   where store_id = p_store_id and acerto_id is null and estornado_em is null and data <= p_fim
     and mechanic_id is not distinct from v_mech and staff_member_id is not distinct from v_staff;
  select coalesce(least(a.a_pagar, 0), 0) into v_saldo from acertos a
   where a.store_id = p_store_id and a.desfeito_em is null
     and a.mechanic_id is not distinct from v_mech and a.staff_member_id is not distinct from v_staff
   order by a.fim desc, a.pago_em desc limit 1;
  v_saldo := coalesce(v_saldo, 0);

  insert into acertos (store_id, mechanic_id, staff_member_id, pessoa_nome, ini, fim, taxa, base, comissao, vales, saldo_anterior, a_pagar)
  values (p_store_id, v_mech, v_staff, v_nome, p_ini, p_fim, c.taxa, c.base, c.comissao, v_vales, v_saldo,
          round(c.comissao - v_vales + v_saldo, 2))
  returning id into v_id;

  update vales set acerto_id = v_id
   where store_id = p_store_id and acerto_id is null and estornado_em is null and data <= p_fim
     and mechanic_id is not distinct from v_mech and staff_member_id is not distinct from v_staff;

  if v_mech is not null then  -- marca os servicos contados como pagos (a tela antiga continua batendo)
    update materials m set paid_at = now(), acerto_id = v_id
      from service_orders o
     where o.id = m.order_id and o.store_id = p_store_id
       and o.status in ('concluida', 'concluida_entregue') and o.equipment <> '__QR_WALKIN_PLACEHOLDER__'
       and (coalesce(o.exit_date, o.conclusion_date, o.created_at) at time zone v_tz)::date between v_desde and p_fim
       and m.is_service = true and m.paid_at is null
       and (m.mechanic_id = v_mech or (m.mechanic_id is null and o.mechanic_id = v_mech));
  end if;
  return v_id;
end $$;

-- Desfazer o ultimo acerto da pessoa (errou): os vales e servicos voltam a ficar em aberto.
create or replace function public.desfazer_acerto(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  a acertos%rowtype;
begin
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  select * into a from acertos where id = p_id for update;
  if not found or not public.pode_comissoes(a.store_id) then raise exception 'Acerto nao encontrado'; end if;
  if a.desfeito_em is not null then raise exception 'Esse acerto ja foi desfeito'; end if;
  if exists (select 1 from acertos b where b.store_id = a.store_id and b.desfeito_em is null and b.id <> a.id
               and b.mechanic_id is not distinct from a.mechanic_id and b.staff_member_id is not distinct from a.staff_member_id
               and (b.fim > a.fim or (b.fim = a.fim and b.pago_em > a.pago_em))) then
    raise exception 'So da pra desfazer o ultimo acerto dessa pessoa';
  end if;
  update acertos set desfeito_em = now(), desfeito_motivo = btrim(p_motivo) where id = p_id;
  update vales set acerto_id = null where acerto_id = p_id;
  update materials set paid_at = null, acerto_id = null where acerto_id = p_id;
end $$;

revoke all on function public.calc_comissao(uuid, uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.pode_comissoes(uuid) from public, anon;
revoke all on function public.relatorio_comissoes(uuid, date, date) from public, anon;
revoke all on function public.fechar_acerto(uuid, text, uuid, date, date) from public, anon;
revoke all on function public.desfazer_acerto(uuid, text) from public, anon;
grant execute on function public.pode_comissoes(uuid) to authenticated;
grant execute on function public.relatorio_comissoes(uuid, date, date) to authenticated;
grant execute on function public.fechar_acerto(uuid, text, uuid, date, date) to authenticated;
grant execute on function public.desfazer_acerto(uuid, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'acertos') then
    alter publication supabase_realtime add table public.acertos;
  end if;
end $$;

select count(*) as acertos_existentes from public.acertos;
