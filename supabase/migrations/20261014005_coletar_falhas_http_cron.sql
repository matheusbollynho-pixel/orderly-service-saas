-- ============================================================
-- cron.job_run_details marca "succeeded" assim que o net.http_post é
-- enfileirado, mesmo se a edge function responder 401/500. Foi assim que
-- os crons de satisfação/health-check ficaram quebrados por semanas sem
-- ninguém ver. A resposta real fica em net._http_response, mas o pg_net
-- só guarda 6h — o relatório diário (24h) não enxergaria.
--
-- Solução: um cron SQL puro (sem HTTP, não depende de chave) copia de
-- hora em hora as respostas com erro pra cron_http_falhas, e o
-- system-health-check lê dessa tabela.
-- ============================================================

create table if not exists public.cron_http_falhas (
  id bigint primary key,            -- id da resposta no pg_net
  created timestamptz not null,
  status_code int,
  timed_out boolean,
  erro text,                        -- content ou error_msg, truncado
  jobs text                         -- cron(s) que rodaram no mesmo instante
);

-- Só service_role (edge function) lê; nada exposto pro app.
alter table public.cron_http_falhas enable row level security;

create or replace function public.coletar_falhas_http_cron()
returns int
language plpgsql
security definer
set search_path = public, net, cron
as $$
declare
  n int;
begin
  insert into public.cron_http_falhas (id, created, status_code, timed_out, erro, jobs)
  select r.id, r.created, r.status_code, r.timed_out,
         left(coalesce(r.error_msg, r.content::text, ''), 300),
         -- pg_net não guarda a URL; associa pelo horário de início do cron
         (select string_agg(distinct j.jobname, ', ')
            from cron.job_run_details d
            join cron.job j on j.jobid = d.jobid
           where d.start_time between r.created - interval '3 seconds' and r.created)
  from net._http_response r
  where r.created > now() - interval '3 hours'
    and (r.status_code is null or r.status_code >= 300 or r.timed_out or r.error_msg is not null)
  on conflict (id) do nothing;
  get diagnostics n = row_count;

  delete from public.cron_http_falhas where created < now() - interval '30 days';
  return n;
end;
$$;

revoke all on function public.coletar_falhas_http_cron() from public, anon, authenticated;
grant execute on function public.coletar_falhas_http_cron() to service_role;

select cron.schedule(
  'coletar-falhas-http-cron',
  '50 * * * *',
  'select public.coletar_falhas_http_cron();'
);
