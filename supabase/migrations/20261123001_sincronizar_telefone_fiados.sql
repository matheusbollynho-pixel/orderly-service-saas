-- Quando a loja muda o telefone de um cliente, os fiados EM ABERTO dele passam
-- a usar o número novo. Sem isso, cada fiado guardava a cópia do telefone da
-- época e o atendente do WhatsApp não reconhecia o cliente que trocou de número.
--
-- Pega:
--   1) fiados ligados ao cliente (client_id = cliente);
--   2) fiados sem ligação (balcão/manual) da mesma loja com o telefone ANTIGO
--      (mesmos 8 últimos dígitos) — esses também passam a ficar ligados ao cliente.
-- Fiados pagos não mudam (histórico).
--
-- Aplicar pelo SQL Editor do Supabase (não usar db push).

CREATE OR REPLACE FUNCTION public.sincronizar_telefone_fiados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  antigo8 text := right(regexp_replace(coalesce(OLD.phone, ''), '\D', '', 'g'), 8);
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone AND coalesce(trim(NEW.phone), '') <> '' THEN
    UPDATE fiados f
       SET client_phone = NEW.phone,
           client_id    = coalesce(f.client_id, NEW.id),
           updated_at   = now()
     WHERE f.store_id IS NOT DISTINCT FROM NEW.store_id
       AND f.status <> 'pago'
       AND (
             f.client_id = NEW.id
          OR (f.client_id IS NULL
              AND length(antigo8) = 8
              AND right(regexp_replace(coalesce(f.client_phone, ''), '\D', '', 'g'), 8) = antigo8)
       );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_telefone_fiados() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clients_sincronizar_telefone_fiados ON clients;
CREATE TRIGGER trg_clients_sincronizar_telefone_fiados
AFTER UPDATE OF phone ON clients
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_telefone_fiados();
