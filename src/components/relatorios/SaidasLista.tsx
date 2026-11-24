// Relatórios → Resumo → Saídas: lista do que saiu do caixa no período.
// Mesma regra do total (RPC relatorio_resumo): tipo 'saida', e lançamento + estorno
// dentro do mesmo período se anulam (semEstornosAnulados). Retirada não entra.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { Skeleton } from '@/components/ui/skeleton';
import { semEstornosAnulados } from '@/lib/caixaEstorno';
import type { Periodo } from '@/lib/periodo';

interface Lancamento {
  id: string;
  type: 'entrada' | 'saida' | 'retirada';
  amount: number;
  description: string;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  date: string;
  created_at: string;
  estorno_de: string | null;
}

const FORMA: Record<string, string> = { dinheiro: 'dinheiro', pix: 'Pix', cartao: 'cartão', fiado: 'fiado' };

export function SaidasLista({ periodo, valor, onAbrir }: { periodo: Periodo; valor: (n: number) => string; onAbrir?: (data: string, id: string) => void }) {
  const { storeId } = useStore();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['relatorio-saidas', storeId, periodo.ini, periodo.fim],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Busca o período todo (não só saídas) para achar os pares lançamento + estorno
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await buscarTodas<Lancamento>((de, ate) => (supabase as any)
        .from('cash_flow')
        .select('id, type, amount, description, category, payment_method, notes, date, created_at, estorno_de')
        .eq('store_id', storeId)
        .gte('date', periodo.ini)
        .lte('date', periodo.fim)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate));
      return semEstornosAnulados(data).filter((l) => l.type === 'saida');
    },
  });

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;
  if (isError) return <p className="text-xs text-red-500">Não consegui carregar as saídas.</p>;
  if (data.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma saída no período.</p>;

  // Resumo por categoria (maior primeiro)
  const porCategoria = new Map<string, number>();
  for (const l of data) {
    const c = l.estorno_de ? 'Estorno de entrada' : l.category?.trim() || 'Sem categoria';
    porCategoria.set(c, (porCategoria.get(c) || 0) + (Number(l.amount) || 0));
  }
  const categorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-2">
      {categorias.length > 1 && (
        <div className="space-y-0.5 border-b border-border/50 pb-1.5 text-xs">
          {categorias.map(([c, t]) => (
            <div key={c} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{c}</span>
              <span className="tabular-nums">{valor(t)}</span>
            </div>
          ))}
        </div>
      )}
      {data.map((l) => (
        <div
          key={l.id}
          role={onAbrir ? 'button' : undefined}
          title={onAbrir ? 'Abrir no Caixa' : undefined}
          onClick={onAbrir ? () => onAbrir(l.date, l.id) : undefined}
          className={`border-t border-border/50 pt-1.5 first:border-t-0 first:pt-0 text-xs ${onAbrir ? 'cursor-pointer rounded hover:bg-muted/60' : ''}`}
        >
          <div className="flex justify-between gap-2">
            <span className="font-medium">{l.description}</span>
            <span className="tabular-nums text-red-500 flex-shrink-0">{valor(Number(l.amount) || 0)}</span>
          </div>
          <p className="text-muted-foreground">
            {new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {l.category ? ` · ${l.category}` : ''}
            {l.payment_method ? ` · ${FORMA[l.payment_method] || l.payment_method}` : ''}
          </p>
          {l.notes && <p className="text-muted-foreground">Obs.: {l.notes}</p>}
        </div>
      ))}
    </div>
  );
}
