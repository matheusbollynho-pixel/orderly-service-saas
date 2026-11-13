// v2: vales do colaborador. Lança e estorna só por função no banco (lancar_vale / estornar_vale):
// o vale fica ligado à pessoa e, se saiu do caixa, a saída entra no Caixa junto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';

const db = supabase as unknown as SupabaseClient;

export type FormaVale = 'dinheiro' | 'pix' | 'fora_caixa';
export interface Vale {
  id: string; mechanic_id: string | null; staff_member_id: string | null; pessoa_nome: string;
  valor: number; data: string; forma: FormaVale; autorizado_por: string; motivo: string | null;
  cash_flow_id: string | null; acerto_id: string | null; estornado_em: string | null; created_at: string;
}
export interface PessoaVales { chave: string; nome: string; tipo: 'mecanico' | 'balcao'; total: number; vales: Vale[] }

/** Agrupa os vales em aberto por pessoa (maior total primeiro). */
export function agruparPorPessoa(vales: Vale[]): PessoaVales[] {
  const mapa = new Map<string, PessoaVales>();
  for (const v of vales) {
    const chave = v.mechanic_id ? `m:${v.mechanic_id}` : v.staff_member_id ? `s:${v.staff_member_id}` : `n:${v.pessoa_nome}`;
    const p = mapa.get(chave) ?? { chave, nome: v.pessoa_nome, tipo: v.mechanic_id ? 'mecanico' : 'balcao', total: 0, vales: [] };
    p.total = Math.round((p.total + Number(v.valor)) * 100) / 100;
    p.vales.push(v);
    mapa.set(chave, p);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/** Vales ainda não descontados em acerto (e não estornados). */
export function useValesAbertos() {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['vales', storeId],
    enabled: !!storeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from('vales').select('*')
        .eq('store_id', storeId).is('acerto_id', null).is('estornado_em', null)
        .order('data', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Vale[];
    },
  });
}

export function useValeAcoes() {
  const qc = useQueryClient();
  const atualizar = () => {
    for (const k of ['vales', 'cash-flow', 'cash-flow-summary', 'cash-flow-period', 'relatorio-resumo']) qc.invalidateQueries({ queryKey: [k] });
  };
  const lancar = useMutation({
    mutationFn: async (v: { mechanicId?: string; staffId?: string; valor: number; forma: FormaVale; autorizadoPor: string; motivo?: string }) => {
      const { error } = await db.rpc('lancar_vale', {
        p_mechanic_id: v.mechanicId ?? null, p_staff_member_id: v.staffId ?? null, p_valor: v.valor,
        p_forma: v.forma, p_autorizado_por: v.autorizadoPor, p_motivo: v.motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { atualizar(); toast.success('Vale lançado.'); },
    onError: (e: Error) => toast.error(`Não consegui lançar o vale: ${e.message}`),
  });
  const estornar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await db.rpc('estornar_vale', { p_id: id, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { atualizar(); toast.success('Vale estornado.'); },
    onError: (e: Error) => toast.error(`Não consegui estornar: ${e.message}`),
  });
  return { lancar, estornar };
}
