// v2: Resumo dos Relatórios calculado no banco (RPC relatorio_resumo), sem o limite de 200 OS.
// Leve de propósito: só recarrega ao trocar o período ou a cada 5 min (o banco já sofreu com recarga demais).
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { problemaNoPeriodo, type Periodo } from '@/lib/periodo';

const db = supabase as unknown as SupabaseClient;

export interface ResumoDados {
  caixa: {
    entradas: number; saidas: number; retiradas: number;
    entradas_os: number; entradas_notas: number; entradas_fiado: number; entradas_estorno: number;
    estornos_qtd: number; estornos_valor: number;
  };
  os: { qtd: number; total: number; desconto: number; recebido: number; a_receber: number };
  notas: { qtd: number; total: number; no_fiado: number };
  descontos: { os: number; notas: number };
  pra_pagar: { qtd: number; valor: number; ate: string; vencidas: number };
  fiado_vencido: { qtd: number; valor: number };
}

const num = (v: unknown) => Number(v) || 0;
function normalizar(r: Record<string, Record<string, unknown>>): ResumoDados {
  const n = <T extends Record<string, unknown>>(o: Record<string, unknown> | undefined, chaves: (keyof T)[]) =>
    Object.fromEntries(chaves.map((k) => [k, k === 'ate' ? String(o?.[k as string] ?? '') : num(o?.[k as string])])) as T;
  return {
    caixa: n(r.caixa, ['entradas', 'saidas', 'retiradas', 'entradas_os', 'entradas_notas', 'entradas_fiado', 'entradas_estorno', 'estornos_qtd', 'estornos_valor']),
    os: n(r.os, ['qtd', 'total', 'desconto', 'recebido', 'a_receber']),
    notas: n(r.notas, ['qtd', 'total', 'no_fiado']),
    descontos: n(r.descontos, ['os', 'notas']),
    pra_pagar: n(r.pra_pagar, ['qtd', 'valor', 'ate', 'vencidas']),
    fiado_vencido: n(r.fiado_vencido, ['qtd', 'valor']),
  } as ResumoDados;
}

export function useRelatorioResumo(p: Periodo | null) {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['relatorio-resumo', storeId, p?.ini, p?.fim],
    enabled: !!storeId && !!p && !problemaNoPeriodo(p),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await db.rpc('relatorio_resumo', { p_store_id: storeId, p_ini: p!.ini, p_fim: p!.fim });
      if (error) throw error;
      return normalizar((data ?? {}) as Record<string, Record<string, unknown>>);
    },
  });
}
