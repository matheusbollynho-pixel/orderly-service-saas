// Situação do fiado de um cliente (aprovado, limite, em aberto, atrasado) para a ficha, o balcão e a OS.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { situacaoFiado, type FiadoAberto } from '@/lib/fiadoCliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function useFiadoCliente(clientId?: string | null) {
  return useQuery({
    queryKey: ['fiado-cliente', clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: c }, { data: f }] = await Promise.all([
        db.from('clients').select('fiado_aprovado, fiado_limite').eq('id', clientId).maybeSingle(),
        db.from('fiados').select('original_amount, interest_accrued, amount_paid, due_date, status').eq('client_id', clientId).neq('status', 'pago'),
      ]);
      return situacaoFiado(c ?? null, (f ?? []) as FiadoAberto[], hojeBr());
    },
  });
}
