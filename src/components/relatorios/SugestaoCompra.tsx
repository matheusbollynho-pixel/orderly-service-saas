// Relatórios → Estoque → "Sugestão de compra": quanto comprar de cada produto.
// Média de venda por dia (últimos 90 dias, saídas da loja − devoluções) × dias que quer cobrir,
// nunca abaixo do estoque mínimo; desconta o que já tem (loja + almoxarifado).
// Agrupa por fornecedor para facilitar o pedido.
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { cn } from '@/lib/utils';
import type { InventoryProduct } from '@/hooks/useInventory';
import { useVendasPorProduto } from './CurvaABC';

const BASE_DIAS = 90;
const COBERTURAS = [15, 30, 60, 90];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
// Unidade inteira arredonda pra cima; litro/kg/metro fica com 1 casa
const fracionada = (u?: string | null) => ['l', 'ml', 'kg', 'g', 'm', 'cm'].includes((u || '').toLowerCase());
const arredondar = (v: number, u?: string | null) => (fracionada(u) ? Math.ceil(v * 10) / 10 : Math.ceil(v - 0.0001));

export function SugestaoCompra({ products }: { products: InventoryProduct[] }) {
  const [cobertura, setCobertura] = useState(30);
  const [porFornecedor, setPorFornecedor] = useState(true);
  const { data: vendas, isLoading, isError } = useVendasPorProduto(BASE_DIAS);

  const linhas = useMemo(() => {
    if (!vendas) return [];
    return products
      .filter((p) => p.active)
      .map((p) => {
        const vendeu = Math.max(vendas.get(p.id)?.qtd ?? 0, 0);
        const porDia = vendeu / BASE_DIAS;
        const saldo = Number(p.stock_current || 0) + Number((p as { stock_almox?: number }).stock_almox ?? 0);
        const minimo = Number(p.stock_minimum || 0);
        const alvo = Math.max(porDia * cobertura, minimo);
        // Saldo negativo = saiu sem ter entrada registrada; conta como zero e avisa
        const tem = Math.max(saldo, 0);
        const comprar = arredondar(Math.max(alvo - tem, 0), p.unit);
        const dura = porDia > 0 ? tem / porDia : null;
        const motivo = saldo < -0.0005 ? 'saldo negativo, conferir' : saldo <= 0.0005 && vendeu > 0 ? 'zerado' : minimo > 0 && saldo <= minimo ? 'abaixo do mínimo' : 'vai acabar';
        return { p, vendeu, porDia, saldo, minimo, comprar, dura, motivo, custo: comprar * Number(p.cost_price || 0) };
      })
      .filter((l) => l.comprar > 0)
      .sort((a, b) => (a.dura ?? 9999) - (b.dura ?? 9999) || b.custo - a.custo);
  }, [vendas, products, cobertura]);

  const grupos = useMemo(() => {
    if (!porFornecedor) return [{ nome: '', itens: linhas }];
    const m = new Map<string, typeof linhas>();
    for (const l of linhas) {
      const k = (l.p.supplier || '').trim() || 'Sem fornecedor';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return [...m.entries()]
      .map(([nome, itens]) => ({ nome, itens }))
      .sort((a, b) => b.itens.reduce((s, l) => s + l.custo, 0) - a.itens.reduce((s, l) => s + l.custo, 0));
  }, [linhas, porFornecedor]);

  const total = linhas.reduce((s, l) => s + l.custo, 0);

  if (isError) return <p className="text-sm text-red-500">Não consegui carregar as vendas.</p>;
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm text-muted-foreground">Comprar para durar:</span>
        {COBERTURAS.map((c) => (
          <Button key={c} size="sm" variant={cobertura === c ? 'default' : 'outline'} onClick={() => setCobertura(c)}>{c} dias</Button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" checked={porFornecedor} onChange={(e) => setPorFornecedor(e.target.checked)} />
          Separar por fornecedor
        </label>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={linhas.length === 0}
          onClick={() => baixarPlanilha(`sugestao-de-compra-${cobertura}-dias`,
            ['Fornecedor', 'Código', 'Produto', 'Marca', 'Unidade', 'Tem hoje', 'Mínimo', `Vendeu (${BASE_DIAS} dias)`, 'Vende por dia', 'Dura (dias)', 'Comprar', 'Custo unitário', 'Custo estimado', 'Motivo'],
            linhas.map((l) => [(l.p.supplier || '').trim(), l.p.code, l.p.name, l.p.brand, l.p.unit, l.saldo, l.minimo, l.vendeu,
              Number(l.porDia.toFixed(3)), l.dura == null ? '' : Math.floor(l.dura), l.comprar, Number(l.p.cost_price || 0), l.custo, l.motivo]))}
        >
          Baixar planilha
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Produtos para comprar</p>
          <p className="text-lg font-bold">{linhas.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Custo estimado da compra</p>
          <p className="text-lg font-bold">{brl(total)}</p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nada a comprar para durar {cobertura} dias no filtro.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.nome || 'todos'} className="overflow-x-auto rounded-xl border bg-card p-3 space-y-2">
            {g.nome && (
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{g.nome}</h3>
                <span className="text-xs text-muted-foreground">{g.itens.length} produto{g.itens.length === 1 ? '' : 's'} · {brl(g.itens.reduce((s, l) => s + l.custo, 0))}</span>
              </div>
            )}
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2">Produto</th>
                  <th className="py-1 px-1 text-right">Tem</th>
                  <th className="py-1 px-1 text-right">Vende/mês</th>
                  <th className="py-1 px-1 text-right">Dura</th>
                  <th className="py-1 px-1 text-right">Comprar</th>
                  <th className="py-1 pl-1 text-right">Custo</th>
                </tr>
              </thead>
              <tbody>
                {g.itens.map((l) => {
                  const u = (l.p.unit || '').toUpperCase();
                  return (
                    <tr key={l.p.id} className="border-t border-border/50">
                      <td className="py-1 pr-2">
                        {l.p.name}
                        <span className={cn('ml-1', l.motivo === 'zerado' || l.motivo.startsWith('saldo negativo') ? 'text-red-500' : l.motivo === 'abaixo do mínimo' ? 'text-amber-500' : 'text-muted-foreground')}>({l.motivo})</span>
                      </td>
                      <td className="py-1 px-1 text-right">{qtd(l.saldo)} {u}</td>
                      <td className="py-1 px-1 text-right">{Number((l.porDia * 30).toFixed(1)).toLocaleString('pt-BR')} {u}</td>
                      <td className="py-1 px-1 text-right">{l.dura == null ? '—' : `${Math.floor(l.dura)} d`}</td>
                      <td className="py-1 px-1 text-right font-semibold">{qtd(l.comprar)} {u}</td>
                      <td className="py-1 pl-1 text-right">{Number(l.p.cost_price) ? brl(l.custo) : 'sem custo'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
      <p className="text-[11px] text-muted-foreground">
        Conta: média de venda dos últimos {BASE_DIAS} dias × {cobertura} dias, nunca abaixo do estoque mínimo, menos o que já tem (loja + almoxarifado).
        "Dura" = quantos dias o estoque atual aguenta no ritmo de venda. Produto sem venda só aparece se estiver abaixo do mínimo.
      </p>
    </div>
  );
}
