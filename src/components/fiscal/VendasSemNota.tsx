// Rede de segurança da nota automática: vendas finalizadas que DEVERIAM ter nota (regra da loja: cartão ou todas)
// e não têm nota válida. Conta só vendas depois da primeira nota emitida (não acusa o passado de quando o módulo não existia).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { buscarTodas } from '@/lib/buscarTodas';
import { deveEmitirAuto, type FiscalAuto } from '@/lib/fiscal';
import type { Periodo } from '@/lib/periodo';
import { deIso, iso } from '@/lib/periodo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TZ = '-03:00';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Venda { id: string; numero: number; total: number; finalized_at: string | null; created_at: string; payment_method: string | null; payment_methods: { method: string }[] | null; client_name: string | null }

export function VendasSemNota({ periodo, ambiente, onAbrirVenda }: { periodo: Periodo; ambiente: 'sandbox' | 'producao'; onAbrirVenda?: (id: string) => void }) {
  const { storeId } = useStore();
  const { settings } = useStoreSettings();
  const regra = (settings as { fiscal_auto?: FiscalAuto } | null)?.fiscal_auto ?? 'nao';
  const [ver, setVer] = useState(false);

  const { data: faltando = [] } = useQuery({
    queryKey: ['fiscal-vendas-sem-nota', storeId, ambiente, regra, periodo.ini, periodo.fim],
    enabled: !!storeId && regra !== 'nao',
    queryFn: async () => {
      // Desde quando a loja emite nota neste ambiente
      const { data: primeira } = await db.from('notas_fiscais').select('created_at').eq('store_id', storeId).eq('ambiente', ambiente)
        .order('created_at').limit(1);
      if (!primeira?.length) return [] as Venda[];
      const f = deIso(periodo.fim); f.setDate(f.getDate() + 1);
      const inicioPeriodo = `${periodo.ini}T00:00:00${TZ}`;
      const desde = primeira[0].created_at > new Date(inicioPeriodo).toISOString() ? primeira[0].created_at : inicioPeriodo;
      const vendas = await buscarTodas<Venda>((a, b) => db.from('balcao_orders')
        .select('id, numero, total, finalized_at, created_at, payment_method, payment_methods, client_name')
        .eq('store_id', storeId).eq('status', 'finalizada')
        .gte('finalized_at', desde).lt('finalized_at', `${iso(f)}T00:00:00${TZ}`)
        .order('finalized_at', { ascending: false }).order('id').range(a, b));
      const alvo = vendas.filter((v) => deveEmitirAuto(regra, v.payment_methods?.length ? v.payment_methods.map((x) => x.method) : [v.payment_method ?? '']));
      if (!alvo.length) return [];
      // Notas válidas (ou em andamento) dessas vendas
      const comNota = new Set<string>();
      for (let i = 0; i < alvo.length; i += 200) {
        const { data } = await db.from('notas_fiscais').select('balcao_order_id, status')
          .in('balcao_order_id', alvo.slice(i, i + 200).map((v) => v.id))
          .not('status', 'in', '(rejeitada,denegada,cancelada,erro,inutilizada)');
        for (const n of data ?? []) comNota.add(n.balcao_order_id);
      }
      return alvo.filter((v) => !comNota.has(v.id));
    },
  });

  if (regra === 'nao' || !faltando.length) return null;
  const total = faltando.reduce((s, v) => s + (Number(v.total) || 0), 0);
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <p className="flex-1 text-sm font-semibold text-amber-600">
          {faltando.length} {faltando.length === 1 ? 'venda' : 'vendas'} {regra === 'cartao' ? 'no cartão' : ''} sem nota fiscal ({brl(total)})
        </p>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setVer((v) => !v)}>{ver ? 'Esconder' : 'Ver quais'}</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">A nota automática não saiu (internet caiu, nota recusada…). Abra a venda e use "Emitir nota fiscal".</p>
      {ver && (
        <div className="mt-2 space-y-1">
          {faltando.slice(0, 50).map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs">
              <span>Venda #{String(v.numero).padStart(4, '0')} · {new Date(v.finalized_at ?? v.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{v.client_name ? ` · ${v.client_name}` : ''}</span>
              <span className="flex items-center gap-2 font-medium">{brl(Number(v.total) || 0)}
                {onAbrirVenda && <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onAbrirVenda(v.id)}>Abrir</Button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
