// Relatórios → Estoque → "Mais vendidos (ABC)": o que mais fatura e o que mais dá lucro.
// Venda = saídas de estoque da LOJA (venda, balcão, OS) menos devoluções, no período.
// Consumo do almoxarifado (uso interno) não conta como venda.
// Curva ABC pelo faturamento: A = produtos que somam até 80% do faturamento, B = até 95%, C = o resto.
// Lucro é estimado com o custo ATUAL do produto (a saída não guarda o custo da época).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { cn } from '@/lib/utils';
import type { InventoryProduct } from '@/hooks/useInventory';

const DIA = 86400000;
const PERIODOS = [30, 90, 180, 365];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

interface Mov { product_id: string; type: string; quantity: number; unit_price: number | null; local: string | null }
type Ordem = 'faturamento' | 'lucro' | 'quantidade';
type Classe = 'A' | 'B' | 'C';

export const SAIDAS_VENDA = ['saida_venda', 'saida_balcao', 'saida_os'];

/** Movimentos de venda da loja (saídas + devoluções) nos últimos `dias`. */
export function useVendasPorProduto(dias: number) {
  return useQuery({
    queryKey: ['estoque-vendas-produto', dias],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - dias * DIA).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await buscarTodas<Mov>((de, ate) => (supabase as any)
        .from('inventory_movements')
        .select('product_id, type, quantity, unit_price, local')
        .in('type', [...SAIDAS_VENDA, 'devolucao'])
        .gte('created_at', desde)
        .order('id', { ascending: true })
        .range(de, ate));
      // Por produto: quantidade líquida e faturamento (devolução desconta)
      const m = new Map<string, { qtd: number; fat: number }>();
      for (const mv of data) {
        if (mv.local === 'almox') continue;
        const sinal = mv.type === 'devolucao' ? -1 : 1;
        const q = Math.abs(Number(mv.quantity) || 0);
        if (!m.has(mv.product_id)) m.set(mv.product_id, { qtd: 0, fat: 0 });
        const g = m.get(mv.product_id)!;
        g.qtd += sinal * q;
        if (mv.unit_price != null) g.fat += sinal * q * Number(mv.unit_price);
      }
      return m;
    },
  });
}

export function CurvaABC({ products }: { products: InventoryProduct[] }) {
  const [dias, setDias] = useState(90);
  const [ordem, setOrdem] = useState<Ordem>('faturamento');
  const [classe, setClasse] = useState<Classe | null>(null);
  const { data: vendas, isLoading, isError } = useVendasPorProduto(dias);

  const dados = useMemo(() => {
    if (!vendas) return null;
    const linhas = products
      .map((p) => {
        const v = vendas.get(p.id);
        const q = Math.max(v?.qtd ?? 0, 0);
        const fat = Math.max(v?.fat ?? 0, 0);
        const custo = q * Number(p.cost_price || 0);
        return { p, q, fat, custo, lucro: fat - custo, margem: fat > 0 ? (fat - custo) / fat : 0, semCusto: !Number(p.cost_price) };
      })
      .filter((l) => l.q > 0.0005 || l.fat > 0.005);
    const total = linhas.reduce((s, l) => s + l.fat, 0);
    // Classificação ABC sempre pelo faturamento
    let acum = 0;
    const comClasse = [...linhas].sort((a, b) => b.fat - a.fat).map((l) => {
      const antes = acum;
      acum += l.fat;
      // Entra na classe pela posição em que COMEÇA (o produto que cruza 80% ainda é A)
      const c: Classe = total <= 0 ? 'C' : antes / total < 0.8 ? 'A' : antes / total < 0.95 ? 'B' : 'C';
      return { ...l, parte: total > 0 ? l.fat / total : 0, acumulado: total > 0 ? acum / total : 0, classe: c };
    });
    const resumo = (c: Classe) => {
      const g = comClasse.filter((l) => l.classe === c);
      return { n: g.length, fat: g.reduce((s, l) => s + l.fat, 0) };
    };
    return {
      linhas: comClasse,
      total,
      lucro: comClasse.reduce((s, l) => s + l.lucro, 0),
      semCusto: comClasse.filter((l) => l.semCusto).length,
      A: resumo('A'), B: resumo('B'), C: resumo('C'),
    };
  }, [vendas, products]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const l = classe ? dados.linhas.filter((x) => x.classe === classe) : dados.linhas;
    const chave = ordem === 'lucro' ? 'lucro' : ordem === 'quantidade' ? 'q' : 'fat';
    return [...l].sort((a, b) => b[chave] - a[chave]);
  }, [dados, classe, ordem]);

  const corClasse: Record<Classe, string> = { A: 'text-green-600 dark:text-green-400', B: 'text-amber-500', C: 'text-muted-foreground' };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm text-muted-foreground">Vendas dos últimos:</span>
        {PERIODOS.map((d) => (
          <Button key={d} size="sm" variant={dias === d ? 'default' : 'outline'} onClick={() => setDias(d)}>{d} dias</Button>
        ))}
      </div>

      {isLoading || !dados ? (
        isError ? <p className="text-sm text-red-500">Não consegui carregar as vendas.</p> : <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Faturamento</p>
              <p className="text-lg font-bold">{brl(dados.total)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Lucro estimado</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{brl(dados.lucro)}</p>
            </div>
            {(['A', 'B', 'C'] as Classe[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClasse((x) => (x === c ? null : c))}
                className={cn('rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60', classe === c && 'border-primary ring-1 ring-primary')}
              >
                <p className="text-xs text-muted-foreground">Classe {c} {c === 'A' ? '(80% do faturamento)' : c === 'B' ? '(próximos 15%)' : '(últimos 5%)'}</p>
                <p className={cn('text-lg font-bold', corClasse[c])}>{dados[c].n} produto{dados[c].n === 1 ? '' : 's'}</p>
                <p className="text-[11px] text-muted-foreground">{brl(dados[c].fat)}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">Ordenar por:</span>
            {(['faturamento', 'lucro', 'quantidade'] as Ordem[]).map((o) => (
              <Button key={o} size="sm" variant={ordem === o ? 'default' : 'outline'} onClick={() => setOrdem(o)}>
                {o === 'faturamento' ? 'Faturamento' : o === 'lucro' ? 'Lucro' : 'Quantidade'}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={lista.length === 0}
              onClick={() => baixarPlanilha(`mais-vendidos-${dias}-dias`,
                ['Classe', 'Código', 'Produto', 'Categoria', 'Marca', 'Unidade', 'Qtd vendida', 'Faturamento', 'Custo (atual)', 'Lucro estimado', 'Margem', '% do faturamento', '% acumulado', 'Saldo atual'],
                lista.map((l) => [l.classe, l.p.code, l.p.name, l.p.category, l.p.brand, l.p.unit, l.q, l.fat, l.custo, l.lucro,
                  pct(l.margem), pct(l.parte), pct(l.acumulado), Number(l.p.stock_current || 0)]))}
            >
              Baixar planilha
            </Button>
          </div>

          {classe && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Mostrando só a classe {classe}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setClasse(null)}>Mostrar tudo</Button>
            </div>
          )}

          {lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda de produto no período e no filtro.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card p-3">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2">ABC</th>
                    <th className="py-1 pr-2">Produto</th>
                    <th className="py-1 px-1 text-right">Qtd</th>
                    <th className="py-1 px-1 text-right">Faturamento</th>
                    <th className="py-1 px-1 text-right">Lucro</th>
                    <th className="py-1 px-1 text-right">Margem</th>
                    <th className="py-1 pl-1 text-right">% fat.</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((l) => (
                    <tr key={l.p.id} className="border-t border-border/50">
                      <td className={cn('py-1 pr-2 font-bold', corClasse[l.classe])}>{l.classe}</td>
                      <td className="py-1 pr-2">
                        {l.p.name}
                        {l.semCusto && <span className="text-amber-500"> (sem custo cadastrado)</span>}
                      </td>
                      <td className="py-1 px-1 text-right">{qtd(l.q)} {(l.p.unit || '').toUpperCase()}</td>
                      <td className="py-1 px-1 text-right">{brl(l.fat)}</td>
                      <td className={cn('py-1 px-1 text-right', l.lucro < 0 && 'text-red-500')}>{brl(l.lucro)}</td>
                      <td className="py-1 px-1 text-right">{l.semCusto ? '—' : pct(l.margem)}</td>
                      <td className="py-1 pl-1 text-right">{pct(l.parte)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Venda = saídas da loja (balcão, venda e OS) menos devoluções; uso do almoxarifado não entra.
            Lucro estimado com o custo atual de cada produto{dados.semCusto > 0 ? ` (${dados.semCusto} sem custo cadastrado: lucro aparece cheio)` : ''}.
            Classe A: os produtos que somam 80% do faturamento, cuide para não faltarem.
          </p>
        </>
      )}
    </div>
  );
}
