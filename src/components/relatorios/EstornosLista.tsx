// Relatórios → Resumo → Atenção: lista dos estornos do período com o motivo.
// Mesma regra do número no Resumo (RPC relatorio_resumo): lançamentos do caixa
// com estorno_de preenchido e data dentro do período. O motivo fica em `notes`.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Skeleton } from '@/components/ui/skeleton';
import type { Periodo } from '@/lib/periodo';

interface Estorno {
  id: string;
  type: 'entrada' | 'saida' | 'retirada';
  amount: number;
  description: string;
  notes: string | null;
  date: string;
  created_at: string;
}

export function EstornosLista({ periodo, valor, onAbrir }: { periodo: Periodo; valor: (n: number) => string; onAbrir?: (data: string, id: string) => void }) {
  const { storeId } = useStore();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['relatorio-estornos', storeId, periodo.ini, periodo.fim],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cash_flow')
        .select('id, type, amount, description, notes, date, created_at')
        .eq('store_id', storeId)
        .not('estorno_de', 'is', null)
        .gte('date', periodo.ini)
        .lte('date', periodo.fim)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Estorno[];
    },
  });

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;
  if (isError) return <p className="text-xs text-red-500">Não consegui carregar os estornos.</p>;
  if (data.length === 0) return <p className="text-xs text-muted-foreground">Nenhum estorno no período.</p>;

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/40 p-2">
      {data.map((e) => (
        <div
          key={e.id}
          role={onAbrir ? 'button' : undefined}
          title={onAbrir ? 'Abrir no Caixa' : undefined}
          onClick={onAbrir ? () => onAbrir(e.date, e.id) : undefined}
          className={`border-t border-border/50 pt-1.5 first:border-t-0 first:pt-0 text-xs ${onAbrir ? 'cursor-pointer rounded hover:bg-muted/60' : ''}`}
        >
          <div className="flex justify-between gap-2">
            <span className="font-medium">{e.description.replace(/^Estorno:\s*/i, '')}</span>
            <span className="tabular-nums text-red-500 flex-shrink-0">{valor(Number(e.amount) || 0)}</span>
          </div>
          <p className="text-muted-foreground">
            {new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {e.type === 'saida' ? 'devolveu uma entrada' : 'desfez uma saída'}
          </p>
          <p className={e.notes ? '' : 'text-muted-foreground italic'}>Motivo: {e.notes || 'não informado'}</p>
        </div>
      ))}
    </div>
  );
}
