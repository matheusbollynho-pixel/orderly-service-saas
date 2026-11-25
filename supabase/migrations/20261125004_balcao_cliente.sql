-- Nota do balcão passa a guardar o cadastro do cliente (antes: só nome/telefone/CPF em texto).
-- Preenchida quando o atendente escolhe o cliente na busca; o fiado do balcão herda.
-- Notas antigas continuam ligando pelo telefone/CPF na ficha do cliente.
ALTER TABLE public.balcao_orders
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS balcao_orders_client_id_idx ON public.balcao_orders (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiados_client_id_idx ON public.fiados (client_id) WHERE client_id IS NOT NULL;
