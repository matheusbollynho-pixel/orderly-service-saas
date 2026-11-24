// Aba "Parados" do Estoque: produtos com saldo e sem saída (venda, balcão ou OS)
// há X dias. Conta a partir da última saída ou do cadastro, o que for mais recente
// (produto recém-cadastrado não aparece como parado). Valor parado = saldo × custo.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { InventoryProduct } from '@/hooks/useInventory';
import { baixarPlanilha } from '@/lib/planilha';

const DIA = 86400000;
const PRAZOS = [30, 60, 90, 180];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function EstoqueParado({ products, local = 'todos' }: { products: InventoryProduct[]; local?: 'todos' | 'loja' | 'almox' }) {
  const [prazo, setPrazo] = useState(30);

  // Última saída de cada produto (busca o último ano; mais antigo = "há mais de 1 ano")
  const { data: ultimaSaida, isLoading } = useQuery({
    queryKey: ['estoque-ultima-saida'],
    queryFn: async () => {
      const desde = new Date(Date.now() - 365 * DIA).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await buscarTodas<{ product_id: string; created_at: string }>((de, ate) => (supabase as any)
        .from('inventory_movements')
        .select('product_id, created_at')
        .in('type', ['saida_venda', 'saida_balcao', 'saida_os'])
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate));
      const m = new Map<string, string>();
      for (const r of data) {
        if (!m.has(r.product_id)) m.set(r.product_id, r.created_at);
      }
      return m;
    },
  });

  const parados = useMemo(() => {
    if (!ultimaSaida) return [];
    const agora = Date.now();
    return products
      .filter((p) => p.active)
      .map((p) => {
        const loja = Number(p.stock_current || 0);
        const almox = Number((p as { stock_almox?: number }).stock_almox ?? 0);
        const saldo = local === 'loja' ? loja : local === 'almox' ? almox : loja + almox;
        const ult = ultimaSaida.get(p.id) ?? null;
        const ref = Math.max(ult ? new Date(ult).getTime() : 0, p.created_at ? new Date(p.created_at).getTime() : 0);
        const dias = ref ? Math.floor((agora - ref) / DIA) : 9999;
        return { p, saldo, ult, dias, valor: saldo * Number(p.cost_price || 0) };
      })
      .filter((r) => r.saldo > 0.0005 && r.dias >= prazo)
      .sort((a, b) => b.valor - a.valor || b.dias - a.dias);
  }, [products, ultimaSaida, prazo, local]);

  const total = parados.reduce((s, r) => s + r.valor, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-sm text-muted-foreground mr-1">Sem saída há:</span>
        {PRAZOS.map((d) => (
          <Button key={d} size="sm" variant={prazo === d ? 'default' : 'outline'} onClick={() => setPrazo(d)}>
            {d} dias
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={parados.length === 0}
          onClick={() => baixarPlanilha(`estoque-parado-${prazo}-dias`,
            ['Código', 'Produto', 'Categoria', 'Marca', 'Saldo', 'Unidade', 'Última saída', 'Dias parado', 'Custo unitário', 'Valor parado'],
            parados.map(({ p, saldo, ult, dias, valor }) => [
              p.code, p.name, p.category, p.brand, saldo, p.unit,
              ult ? new Date(ult).toLocaleDateString('pt-BR') : 'nenhuma no último ano',
              dias >= 9999 ? '' : dias, Number(p.cost_price || 0), valor,
            ]))}
        >
          Baixar planilha
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Produtos parados</p>
              <p className="text-lg font-bold">{parados.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Dinheiro parado (custo)</p>
              <p className={`text-lg font-bold ${total > 0 ? 'text-amber-500' : ''}`}>{brl(total)}</p>
            </div>
          </div>

          {parados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum produto com saldo parado há {prazo} dias ou mais.</p>
          ) : (
            <div className="space-y-1.5">
              {parados.map(({ p, saldo, ult, dias, valor }) => (
                <div key={p.id} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.code}
                      {' · '}
                      {ult ? `última saída ${new Date(ult).toLocaleDateString('pt-BR')}` : 'nenhuma saída no último ano'}
                      {' · '}
                      {dias >= 9999 ? 'sem data' : `${dias} dias parado`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold">{qtd(saldo)} {(p.unit || '').toUpperCase()}</p>
                    <p className="text-[11px] text-muted-foreground">{brl(valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Conta como saída: venda no balcão, venda avulsa e uso em OS. Dias contados desde a última saída ou o cadastro do produto. Valor pelo preço de custo atual.
          </p>
        </>
      )}
    </div>
  );
}
