// v2: acerto de comissão. Contas no banco (relatorio_comissoes / fechar_acerto / desfazer_acerto):
// Comissão − Vales + saldo anterior = A pagar. Nada de valor vem da tela.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { problemaNoPeriodo, type Periodo } from '@/lib/periodo';

const db = supabase as unknown as SupabaseClient;

export interface Acerto {
  id: string; ini: string; fim: string; taxa: number; base: number; comissao: number; vales: number;
  saldo_anterior: number; a_pagar: number; pago_em: string;
}
export interface LinhaComissao {
  tipo: 'm' | 's'; id: string; nome: string; taxa: number; base: number; comissao: number; ja_pago: number;
  vales: number; qtd_vales: number; saldo_anterior: number; a_pagar: number; acerto: Acerto | null;
}

/** Dia em que a semana de acerto fecha (0=domingo … 6=sábado). Padrão sábado. */
export function useDiaAcerto() {
  const { storeId } = useStore();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['dia-acerto', storeId],
    enabled: !!storeId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from('store_settings').select('dia_acerto').eq('id', storeId).maybeSingle();
      if (error) throw error;
      return Number((data as { dia_acerto?: number } | null)?.dia_acerto ?? 6);
    },
  });
  const salvar = useMutation({
    mutationFn: async (dia: number) => {
      const { error } = await db.from('store_settings').update({ dia_acerto: dia }).eq('id', storeId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dia-acerto'] }); toast.success('Dia do acerto salvo.'); },
    onError: (e: Error) => toast.error(`Não consegui salvar: ${e.message}`),
  });
  return { dia: q.data ?? 6, carregando: q.isLoading, salvar };
}

export function useComissoes(p: Periodo | null) {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['comissoes', storeId, p?.ini, p?.fim],
    enabled: !!storeId && !!p && !problemaNoPeriodo(p),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('relatorio_comissoes', { p_store_id: storeId, p_ini: p!.ini, p_fim: p!.fim });
      if (error) throw error;
      return ((data ?? []) as LinhaComissao[]).map((l) => ({
        ...l,
        taxa: Number(l.taxa) || 0, base: Number(l.base) || 0, comissao: Number(l.comissao) || 0, ja_pago: Number(l.ja_pago) || 0,
        vales: Number(l.vales) || 0, qtd_vales: Number(l.qtd_vales) || 0, saldo_anterior: Number(l.saldo_anterior) || 0, a_pagar: Number(l.a_pagar) || 0,
        acerto: l.acerto ? { ...l.acerto, comissao: Number(l.acerto.comissao), vales: Number(l.acerto.vales), saldo_anterior: Number(l.acerto.saldo_anterior), a_pagar: Number(l.acerto.a_pagar), base: Number(l.acerto.base), taxa: Number(l.acerto.taxa) } : null,
      }));
    },
  });
}

export function useAcertoAcoes() {
  const { storeId } = useStore();
  const qc = useQueryClient();
  const atualizar = () => { for (const k of ['comissoes', 'vales', 'service-orders']) qc.invalidateQueries({ queryKey: [k] }); };
  const fechar = useMutation({
    mutationFn: async ({ l, p }: { l: LinhaComissao; p: Periodo }) => {
      const { error } = await db.rpc('fechar_acerto', { p_store_id: storeId, p_tipo: l.tipo, p_pessoa_id: l.id, p_ini: p.ini, p_fim: p.fim });
      if (error) throw error;
    },
    onSuccess: () => { atualizar(); toast.success('Acerto fechado.'); },
    onError: (e: Error) => toast.error(`Não consegui fechar: ${e.message}`),
  });
  const desfazer = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await db.rpc('desfazer_acerto', { p_id: id, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { atualizar(); toast.success('Acerto desfeito.'); },
    onError: (e: Error) => toast.error(`Não consegui desfazer: ${e.message}`),
  });
  return { fechar, desfazer };
}
