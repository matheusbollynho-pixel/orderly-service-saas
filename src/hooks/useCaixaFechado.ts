// Trava de venda: loja que usa abertura de caixa só vende com o caixa DE HOJE aberto.
// Caixa esquecido aberto de outro dia também trava: tem que fechar aquele dia antes (regra pedida em 26/11).
// O banco também barra a entrada no caixa (fn_caixa_exige_aberto); aqui é para avisar antes.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface SituacaoCaixa {
  bloqueado: boolean;
  /** 'fechado' = nenhum caixa aberto; 'outro_dia' = caixa aberto desde um dia anterior */
  motivo: 'fechado' | 'outro_dia' | null;
  /** dia do caixa esquecido aberto (dd/mm/aaaa) */
  dia?: string;
}

const diaBrasilia = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export async function situacaoCaixa(storeId: string): Promise<SituacaoCaixa> {
  const [{ data: loja }, { data: turno }] = await Promise.all([
    db.from('store_settings').select('usa_abertura_caixa').eq('id', storeId).maybeSingle(),
    db.from('caixa_turnos').select('id, aberto_em').eq('store_id', storeId).is('fechado_em', null).limit(1),
  ]);
  if (!loja?.usa_abertura_caixa) return { bloqueado: false, motivo: null };
  if (!turno?.length) return { bloqueado: true, motivo: 'fechado' };
  const dia = diaBrasilia(turno[0].aberto_em);
  if (dia !== diaBrasilia(new Date())) return { bloqueado: true, motivo: 'outro_dia', dia };
  return { bloqueado: false, motivo: null };
}

/** true = a loja usa abertura de caixa e não tem o caixa de hoje aberto */
export async function caixaFechadoAgora(storeId: string): Promise<boolean> {
  return (await situacaoCaixa(storeId)).bloqueado;
}

/** Mensagem para quem tenta vender com o caixa travado */
export function textoTravaCaixa(s: SituacaoCaixa, acao = 'vender'): string {
  return s.motivo === 'outro_dia'
    ? `O caixa do dia ${s.dia} ainda está aberto. Feche o caixa daquele dia (tela Caixa → Fechar caixa) e abra o de hoje para ${acao}.`
    : `O caixa está fechado. Abra o caixa (tela Caixa → Abrir caixa) para ${acao}.`;
}

export function useSituacaoCaixa(): SituacaoCaixa {
  const { storeId } = useStore();
  // 'caixa-turno' é invalidado ao abrir/fechar e pelo tempo real
  const { data } = useQuery({
    queryKey: ['caixa-turno', 'trava', storeId],
    enabled: !!storeId,
    staleTime: 30_000,
    queryFn: () => situacaoCaixa(storeId!),
  });
  return data ?? { bloqueado: false, motivo: null };
}

export function useCaixaFechado() {
  return useSituacaoCaixa().bloqueado;
}
