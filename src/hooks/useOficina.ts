// v2: dados e ações da Oficina.
// - useOficinaAtivas: TODAS as OS ativas direto do banco (antes o Quadro só via as 200 mais recentes).
// - useMudarEtapa: troca de etapa numa gravação só, que só vale se a OS ainda estiver como o aparelho viu.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { patchPara, type Etapa } from '@/lib/etapaOS';
import type { ServiceOrder } from '@/types/service-order';

const db = supabase as unknown as SupabaseClient;

export function useOficinaAtivas() {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['oficina-ativas', storeId],
    enabled: !!storeId,
    staleTime: 15_000,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await db.from('service_orders')
        .select('*, checklist_items(*), materials(*), payments(*)')
        .in('status', ['aberta', 'em_andamento', 'concluida'])
        .order('entry_date', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as ServiceOrder[];
    },
  });
}

type Snapshot = Pick<ServiceOrder, 'status' | 'status_oficina' | 'conclusion_date' | 'exit_date' | 'mechanic_id' | 'aviso_retirada_enviado_em'>;

export function useMudarEtapa() {
  const qc = useQueryClient();
  const atualizar = () => {
    for (const k of ['oficina-ativas', 'service-orders', 'contagem-os', 'a-receber']) qc.invalidateQueries({ queryKey: [k] });
  };

  const mudar = useMutation({
    mutationFn: async ({ os, destino, mecanicoId }: { os: ServiceOrder; destino: Exclude<Etapa, 'entregue'>; mecanicoId?: string }) => {
      const anterior: Snapshot = {
        status: os.status, status_oficina: os.status_oficina ?? null, conclusion_date: os.conclusion_date ?? null,
        exit_date: os.exit_date ?? null, mechanic_id: os.mechanic_id ?? null, aviso_retirada_enviado_em: os.aviso_retirada_enviado_em ?? null,
      };
      const mecanico = mecanicoId ?? os.mechanic_id ?? null;
      const patch: Record<string, unknown> = { ...patchPara(destino) };
      if (mecanicoId) patch.mechanic_id = mecanicoId;

      if (destino === 'pronta' && mecanico) {
        // Serviços sem mecânico ficam com o mecânico da OS (comissão), numa gravação só
        await db.from('materials').update({ mechanic_id: mecanico })
          .eq('order_id', os.id).eq('is_service', true).is('mechanic_id', null);
      }
      // Só grava se ninguém mudou a OS em outro aparelho nesse meio-tempo
      const { data, error } = await db.from('service_orders').update(patch)
        .eq('id', os.id).eq('status', os.status).select('*, checklist_items(*), materials(*), payments(*)');
      if (error) throw error;
      if (!data?.length) throw new Error('JA_MUDOU');
      return { nova: data[0] as unknown as ServiceOrder, anterior };
    },
    onSuccess: atualizar,
    onError: (e: Error) => {
      if (e.message === 'JA_MUDOU') toast.error('Essa OS já foi mudada em outro aparelho. Atualizei a lista.');
      else toast.error(`Não consegui mudar a etapa: ${e.message}`);
      atualizar();
    },
  });

  /** Volta a OS ao que era (só se ela ainda estiver na etapa nova). */
  const desfazer = async (nova: ServiceOrder, anterior: Snapshot) => {
    const { data, error } = await db.from('service_orders').update(anterior).eq('id', nova.id).eq('status', nova.status).select('id');
    atualizar();
    if (error || !data?.length) { toast.error('Não deu para desfazer: a OS já mudou de novo.'); return false; }
    toast.success('Desfeito.');
    return true;
  };

  return { mudar, desfazer };
}
