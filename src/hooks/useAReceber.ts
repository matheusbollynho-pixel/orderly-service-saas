// v2: tudo o que a loja tem para receber, num lugar só (Início › Receber).
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { saldoOS, saldoFiado } from '@/lib/saldoOS';
import { QR_PLACEHOLDER } from '@/lib/etapaOS';
import type { ServiceOrder } from '@/types/service-order';

export interface OSAReceber { os: ServiceOrder; falta: number }
export interface FiadoAReceber { id: string; cliente: string; falta: number; vencimento: string | null; vencido: boolean }
export interface NotaAberta { id: string; numero: number | null; cliente: string; criada: string }

// Tipos gerados do banco estão desatualizados (fiados/balcão não estão lá): consulta sem tipos.
const db = supabase as unknown as SupabaseClient;

const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());

export function useAReceber(ativo = true) {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['a-receber', storeId],
    enabled: ativo && !!storeId,
    staleTime: 30_000,
    refetchOnMount: 'always', // abriu a tela = número atualizado (ex.: depois de receber)
    queryFn: async () => {
      const quatroMeses = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      const [prontasQ, entreguesQ, fiados, notas] = await Promise.all([
        // Todas as prontas (são poucas)
        db.from('service_orders')
          .select('*, checklist_items(*), materials(*), payments(*)')
          .eq('status', 'concluida')
          .neq('equipment', QR_PLACEHOLDER)
          .order('updated_at', { ascending: false })
          .limit(500),
        // Entregues sem quitar: só dos últimos 4 meses (as antigas são centenas)
        db.from('service_orders')
          .select('*, checklist_items(*), materials(*), payments(*)')
          .eq('status', 'concluida_entregue')
          .neq('equipment', QR_PLACEHOLDER)
          .gte('updated_at', quatroMeses)
          .order('updated_at', { ascending: false })
          .limit(400),
        db.from('fiados')
          .select('id, client_name, original_amount, interest_accrued, amount_paid, due_date, status, origin_type, origin_id')
          .neq('status', 'pago'),
        db.from('balcao_orders')
          .select('id, numero, client_name, created_at')
          .eq('status', 'aberta')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (prontasQ.error) throw prontasQ.error;
      if (entreguesQ.error) throw entreguesQ.error;

      const fiadoRows = (fiados.data ?? []) as unknown as {
        id: string; client_name: string | null; original_amount: number; interest_accrued: number | null; amount_paid: number | null;
        due_date: string | null; status: string; origin_type: string | null; origin_id: string | null;
      }[];
      // OS cujo resto virou fiado: a cobrança é pelo fiado (não listar duas vezes)
      const osComFiado = new Set(fiadoRows.filter((f) => f.origin_type === 'os' && f.origin_id).map((f) => String(f.origin_id)));

      const comSaldo: OSAReceber[] = ([...(prontasQ.data ?? []), ...(entreguesQ.data ?? [])] as unknown as ServiceOrder[])
        .filter((o) => !osComFiado.has(o.id))
        .map((o) => ({ os: o, falta: saldoOS(o).falta }))
        .filter((x) => x.falta > 0);

      const hoje = hojeISO();
      const fiadosAbertos: FiadoAReceber[] = fiadoRows
        .map((f) => ({
          id: f.id,
          cliente: f.client_name || 'Cliente',
          falta: saldoFiado(f),
          vencimento: f.due_date,
          vencido: !!f.due_date && f.due_date < hoje,
        }))
        .filter((f) => f.falta > 0)
        .sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999'));

      const notasAbertas: NotaAberta[] = ((notas.data ?? []) as unknown as { id: string; numero: number | null; client_name: string | null; created_at: string }[])
        .map((n) => ({ id: n.id, numero: n.numero, cliente: n.client_name || 'Consumidor', criada: n.created_at }));

      return {
        prontas: comSaldo.filter((x) => x.os.status === 'concluida'),
        entreguesSemQuitar: comSaldo.filter((x) => x.os.status === 'concluida_entregue'),
        fiados: fiadosAbertos,
        notas: notasAbertas,
      };
    },
  });
}

/** Quantas OS em cada status (conta no banco, não só nas 200 carregadas na tela). */
export function useContagemOS() {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['contagem-os', storeId],
    enabled: !!storeId,
    staleTime: 30_000,
    refetchOnMount: 'always', // abriu a tela = número atualizado (ex.: depois de receber)
    queryFn: async () => {
      const contar = async (status: string) => {
        const { count, error } = await db.from('service_orders').select('id', { count: 'exact', head: true }).eq('status', status).neq('equipment', QR_PLACEHOLDER);
        if (error) throw error;
        return count ?? 0;
      };
      const [aberta, em_andamento, concluida] = await Promise.all([contar('aberta'), contar('em_andamento'), contar('concluida')]);
      return { aberta, em_andamento, concluida } as Record<string, number>;
    },
  });
}
