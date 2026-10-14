-- ============================================================
-- Rastreio de qual cron fez cada chamada HTTP.
-- O pg_net não guarda a URL nem quem chamou; adivinhar pelo horário falha
-- quando vários crons rodam no mesmo minuto (ex: 8h00 roda 5 juntos).
-- Agora os crons das edge functions chamam public.cron_http(), que faz o
-- net.http_post, já manda o x-cron-secret (Vault) e anota request_id ->
-- jobname em cron_http_chamadas. O coletor usa essa anotação.
-- (veicular-reprocessar fica como está: token próprio, outro produto.)
-- ============================================================

create table if not exists public.cron_http_chamadas (
  request_id bigint primary key,
  jobname text not null,
  created timestamptz not null default now()
);
alter table public.cron_http_chamadas enable row level security;

create or replace function public.cron_http(
  p_jobname text,
  p_funcao text,
  p_body jsonb default '{}'::jsonb,
  p_timeout_ms int default 20000
)
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  rid bigint;
begin
  rid := net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/' || p_funcao,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := p_body,
    timeout_milliseconds := p_timeout_ms
  );
  insert into public.cron_http_chamadas (request_id, jobname) values (rid, p_jobname);
  delete from public.cron_http_chamadas where created < now() - interval '2 days';
  return rid;
end;
$$;

-- Manda o segredo dos crons: NUNCA pode ser chamável pelo app.
revoke all on function public.cron_http(text, text, jsonb, int) from public, anon, authenticated;

select cron.alter_job((select jobid from cron.job where jobname = 'agendamento-lembrete-dia-anterior'),
  command := $$select public.cron_http('agendamento-lembrete-dia-anterior', 'agendamento-lembrete-dia-anterior')$$);
select cron.alter_job((select jobid from cron.job where jobname = 'boleto-alertas-diario'),
  command := $$select public.cron_http('boleto-alertas-diario', 'boleto-alertas')$$);
select cron.alter_job((select jobid from cron.job where jobname = 'check-maintenance-reminders-hourly'),
  command := $$select public.cron_http('check-maintenance-reminders-hourly', 'check-maintenance-reminders')$$);
select cron.alter_job((select jobid from cron.job where jobname = 'os-pronta-aviso'),
  command := $$select public.cron_http('os-pronta-aviso', 'os-pronta-aviso')$$);
select cron.alter_job((select jobid from cron.job where jobname = 'send-balcao-followup-daily'),
  command := $$select public.cron_http('send-balcao-followup-daily', 'send-balcao-followup')$$);
select cron.alter_job((select jobid from cron.job where jobname = 'send-satisfaction-gotejamento'),
  command := $$select public.cron_http('send-satisfaction-gotejamento', 'send-satisfaction-bulk')$$);
select cron.alter_job((select jobid from cron.job where jobname = 'system-health-check-daily'),
  command := $$select public.cron_http('system-health-check-daily', 'system-health-check')$$);

-- Coletor: usa a anotação; sem anotação, cai no palpite por horário.
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
         coalesce(
           (select c.jobname from public.cron_http_chamadas c where c.request_id = r.id),
           (select 'talvez: ' || string_agg(distinct j.jobname, ', ')
              from cron.job_run_details d
              join cron.job j on j.jobid = d.jobid
             where d.start_time between r.created - interval '3 seconds' and r.created)
         )
  from net._http_response r
  where r.created > now() - interval '3 hours'
    and (r.status_code is null or r.status_code >= 300 or r.timed_out or r.error_msg is not null)
  on conflict (id) do nothing;
  get diagnostics n = row_count;

  delete from public.cron_http_falhas where created < now() - interval '30 days';
  return n;
end;
$$;
