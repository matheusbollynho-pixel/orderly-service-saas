// Tipos de cliente da loja (Lojista, Lava-jato...) e o tipo de um cliente.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import type { TipoCliente } from '@/lib/precoCliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useTiposCliente() {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['tipos-cliente', storeId],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TipoCliente[]> => {
      const { data, error } = await db.from('tipos_cliente').select('*').order('nome');
      if (error) throw error;
      return ((data ?? []) as TipoCliente[]).map((t) => ({ ...t, desconto_pct: Number(t.desconto_pct) || 0, compra_minima: Number(t.compra_minima) || 0 }));
    },
  });
}

/** Tipo e validade de um cliente (para a nota de balcão) */
export function useTipoDoCliente(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ['cliente-tipo', clientId],
    enabled: !!clientId,
    staleTime: 0,
    queryFn: async (): Promise<{ tipo_cliente_id: string | null; tipo_valido_ate: string | null }> => {
      const { data, error } = await db.from('clients').select('tipo_cliente_id, tipo_valido_ate').eq('id', clientId).maybeSingle();
      if (error) throw error;
      return data ?? { tipo_cliente_id: null, tipo_valido_ate: null };
    },
  });
}
