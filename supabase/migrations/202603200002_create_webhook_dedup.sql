-- Tabela de deduplicação de webhooks WhatsApp
-- Evita processar a mesma mensagem duas vezes quando há múltiplos webhooks configurados
create table if not exists webhook_message_log (
  message_id text primary key,
  phone      text,
  created_at timestamptz default now()
);

-- Limpar entradas antigas automaticamente (manter só últimas 24h)
create or replace function cleanup_webhook_message_log() returns void
language plpgsql security definer as $$
begin
  delete from webhook_message_log where created_at < now() - interval '24 hours';
end;
$$;

-- RLS: apenas service_role acessa
alter table webhook_message_log enable row level security;

create policy "service_role full access" on webhook_message_log
  using (true) with check (true);
