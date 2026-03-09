-- Adiciona preferência de lembretes de manutenção no cadastro do cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS autoriza_lembretes BOOLEAN NOT NULL DEFAULT true;

UPDATE public.clients
SET autoriza_lembretes = true
WHERE autoriza_lembretes IS NULL;
