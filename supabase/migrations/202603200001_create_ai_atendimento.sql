-- ============================================================
-- IA de Atendimento WhatsApp — Estrutura de suporte
-- ============================================================

-- Tabela de estado das conversas da IA
CREATE TABLE IF NOT EXISTS conversation_state (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text UNIQUE NOT NULL,
  state       text NOT NULL DEFAULT 'novo',
  context     jsonb DEFAULT '{}',
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- Index para busca rápida por telefone
CREATE INDEX IF NOT EXISTS conversation_state_phone_idx ON conversation_state(phone);

-- Limpar estados inativos há mais de 2 horas (timeout de conversa)
CREATE OR REPLACE FUNCTION cleanup_stale_conversations()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM conversation_state
  WHERE updated_at < now() - interval '2 hours'
    AND state NOT IN ('aguardando_humano');
END;
$$;

-- Campo para controlar aviso de OS pronta não retirada
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS aviso_retirada_enviado_em timestamptz;

-- Campos para confirmação de agendamento (lembrete 1 dia antes)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS lembrete_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_pelo_cliente boolean,
  ADD COLUMN IF NOT EXISTS confirmacao_respondida_em timestamptz;

-- RLS para conversation_state (acesso via service role apenas)
ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on conversation_state"
  ON conversation_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cron: limpar conversas inativas a cada hora
SELECT cron.schedule(
  'cleanup-stale-conversations',
  '0 * * * *',
  $$SELECT cleanup_stale_conversations();$$
);

-- Cron: os-pronta-aviso — a cada 2 horas no horário comercial (8h-18h BRT = 11h-21h UTC)
SELECT cron.schedule(
  'os-pronta-aviso',
  '0 11,13,15,17,19,21 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url', true) || '/functions/v1/os-pronta-aviso'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cron: agendamento-lembrete-dia-anterior — 18h BRT = 21h UTC
SELECT cron.schedule(
  'agendamento-lembrete-dia-anterior',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url', true) || '/functions/v1/agendamento-lembrete-dia-anterior'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
