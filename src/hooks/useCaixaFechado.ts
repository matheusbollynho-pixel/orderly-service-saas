// Trava de venda: loja que usa abertura de caixa só vende com o caixa aberto.
// O banco também barra a entrada no caixa (fn_caixa_exige_aberto); aqui é para avisar antes.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** true = a loja usa abertura de caixa e não tem caixa aberto agora */
export async function caixaFechadoAgora(storeId: string): Promise<boolean> {
  const [{ data: loja }, { data: turno }] = await Promise.all([
    db.from('store_settings').select('usa_abertura_caixa').eq('id', storeId).maybeSingle(),
    db.from('caixa_turnos').select('id').eq('store_id', storeId).is('fechado_em', null).limit(1),
  ]);
  return !!loja?.usa_abertura_caixa && !(turno?.length);
}

export function useCaixaFechado() {
  const { storeId } = useStore();
  // 'caixa-turno' é invalidado ao abrir/fechar e pelo tempo real
  const { data } = useQuery({
    queryKey: ['caixa-turno', 'trava', storeId],
    enabled: !!storeId,
    staleTime: 30_000,
    queryFn: () => caixaFechadoAgora(storeId!),
  });
  return data === true;
}
