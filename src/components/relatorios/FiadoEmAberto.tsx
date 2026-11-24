// Relatórios → Estoque → "Fiado em aberto": mercadoria que saiu no fiado e ainda
// não foi paga. Pagamento parcial = em aberto a proporção que falta de cada item
// (ex.: pagou metade, conta metade). Item ligado ao produto pelo id (fiados novos)
// ou pelo nome igual ao do produto (fiados antigos).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { matchesSearch } from '@/lib/textSearch';
import type { InventoryProduct } from '@/hooks/useInventory';

interface FiadoRow {
  id: string;
  client_name: string;
  client_phone: string | null;
  items: { desc?: string; qty?: number; value?: number; inventory_product_id?: string }[] | null;
  original_amount: number;
  amount_paid: number;
  interest_accrued: number;
  due_date: string;
  status: string;
  created_at: string;
}

const DIA = 86400000;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const chave = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

interface Props {
  produtos: InventoryProduct[];          // todos (para ligar pelo nome)
  idsNoFiltro: Set<string>;               // produtos que passam nos filtros de categoria/marca/fornecedor
  filtroDeProdutoAtivo: boolean;          // há filtro de categoria/marca/fornecedor ligado
  busca: string;
}

export function FiadoEmAberto({ produtos, idsNoFiltro, filtroDeProdutoAtivo, busca }: Props) {
  const { data: fiados = [], isLoading } = useQuery({
    queryKey: ['relatorio-fiado-aberto'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('fiados')
        .select('id, client_name, client_phone, items, original_amount, amount_paid, interest_accrued, due_date, status, created_at')
        .neq('status', 'pago')
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as FiadoRow[];
    },
  });

  const porNome = useMemo(() => new Map(produtos.map((p) => [chave(p.name || ''), p])), [produtos]);
  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const dados = useMemo(() => {
    const hoje = Date.now();
    const q = busca.trim().toLowerCase();
    const itens = new Map<string, { nome: string; produto?: InventoryProduct; qtd: number; valor: number; clientes: Set<string>; desde: number }>();
    const clientes: { nome: string; telefone: string | null; saldo: number; vencimento: string; atraso: number; itens: string }[] = [];

    for (const f of fiados) {
      const original = Number(f.original_amount) || 0;
      const pago = Number(f.amount_paid) || 0;
      const saldo = Math.max(original + (Number(f.interest_accrued) || 0) - pago, 0);
      if (saldo <= 0.005) continue;
      const proporcao = original > 0 ? Math.max(original - pago, 0) / original : 0; // parte da mercadoria ainda não paga
      const desde = new Date(f.created_at).getTime();
      const listaItens = Array.isArray(f.items) ? f.items : [];

      let algumItemNoFiltro = false;
      for (const it of listaItens) {
        const nome = (it.desc || '').trim();
        if (!nome) continue;
        const produto = (it.inventory_product_id && porId.get(it.inventory_product_id)) || porNome.get(chave(nome));
        if (filtroDeProdutoAtivo && (!produto || !idsNoFiltro.has(produto.id))) continue;
        if (q && !matchesSearch(q, nome, produto?.name, produto?.code, f.client_name)) continue;
        algumItemNoFiltro = true;
        const k = produto ? `p:${produto.id}` : `t:${chave(nome)}`;
        if (!itens.has(k)) itens.set(k, { nome: produto?.name || nome, produto, qtd: 0, valor: 0, clientes: new Set(), desde });
        const g = itens.get(k)!;
        const q2 = (Number(it.qty) || 1) * proporcao;
        g.qtd += q2;
        g.valor += q2 * (Number(it.value) || 0);
        g.clientes.add(f.client_name);
        g.desde = Math.min(g.desde, desde);
      }

      const semItens = listaItens.length === 0 && !filtroDeProdutoAtivo && (!q || matchesSearch(q, f.client_name));
      if (algumItemNoFiltro || semItens) {
        const atraso = Math.floor((hoje - new Date(`${f.due_date}T00:00:00`).getTime()) / DIA);
        clientes.push({
          nome: f.client_name,
          telefone: f.client_phone,
          saldo,
          vencimento: f.due_date,
          atraso,
          itens: listaItens.map((i) => `${qtd(Number(i.qty) || 1)}x ${i.desc}`).join(', '),
        });
      }
    }

    const listaItens = [...itens.values()].sort((a, b) => b.valor - a.valor);
    clientes.sort((a, b) => b.atraso - a.atraso || b.saldo - a.saldo);
    const total = clientes.reduce((s, c) => s + c.saldo, 0);
    const atrasado = clientes.filter((c) => c.atraso > 0).reduce((s, c) => s + c.saldo, 0);
    return { listaItens, clientes, total, atrasado, mercadoria: listaItens.reduce((s, i) => s + i.valor, 0) };
  }, [fiados, porId, porNome, idsNoFiltro, filtroDeProdutoAtivo, busca]);

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Fiado em aberto</p>
          <p className="text-lg font-bold">{brl(dados.total)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Já vencido</p>
          <p className={`text-lg font-bold ${dados.atrasado > 0 ? 'text-red-500' : ''}`}>{brl(dados.atrasado)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Mercadoria não paga (venda)</p>
          <p className="text-lg font-bold">{brl(dados.mercadoria)}</p>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Por produto</h3>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={dados.listaItens.length === 0}
            onClick={() => baixarPlanilha('fiado-em-aberto-por-produto',
              ['Produto', 'Código', 'Ligado ao estoque', 'Quantidade não paga', 'Valor não pago', 'Clientes', 'Desde'],
              dados.listaItens.map((i) => [i.nome, i.produto?.code ?? '', i.produto ? 'sim' : 'não', i.qtd, i.valor, i.clientes.size,
                new Date(i.desde).toLocaleDateString('pt-BR')]))}
          >
            Baixar planilha
          </Button>
        </div>
        {dados.listaItens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma mercadoria em fiado aberto no filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2">Produto</th>
                  <th className="py-1 px-1 text-right">Qtd não paga</th>
                  <th className="py-1 px-1 text-right">Valor não pago</th>
                  <th className="py-1 px-1 text-right">Clientes</th>
                  <th className="py-1 pl-1 text-right">Desde</th>
                </tr>
              </thead>
              <tbody>
                {dados.listaItens.map((i) => (
                  <tr key={i.nome + (i.produto?.id ?? '')} className="border-t border-border/50">
                    <td className="py-1 pr-2">
                      {i.nome}
                      {!i.produto && <span className="text-muted-foreground"> (sem ligação com o estoque)</span>}
                    </td>
                    <td className="py-1 px-1 text-right">{qtd(i.qtd)} {(i.produto?.unit || '').toUpperCase()}</td>
                    <td className="py-1 px-1 text-right">{brl(i.valor)}</td>
                    <td className="py-1 px-1 text-right">{i.clientes.size}</td>
                    <td className="py-1 pl-1 text-right">{new Date(i.desde).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Por cliente</h3>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={dados.clientes.length === 0}
            onClick={() => baixarPlanilha('fiado-em-aberto-por-cliente',
              ['Cliente', 'Telefone', 'Saldo em aberto', 'Vencimento', 'Dias de atraso', 'Itens'],
              dados.clientes.map((c) => [c.nome, c.telefone ?? '', c.saldo,
                new Date(`${c.vencimento}T00:00:00`).toLocaleDateString('pt-BR'), c.atraso > 0 ? c.atraso : 0, c.itens]))}
          >
            Baixar planilha
          </Button>
        </div>
        {dados.clientes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum fiado em aberto no filtro.</p>
        ) : (
          dados.clientes.map((c, idx) => (
            <div key={idx} className="flex justify-between gap-2 border-t border-border/50 pt-1 first:border-t-0 first:pt-0 text-xs">
              <div className="min-w-0">
                <p className="font-medium">{c.nome}</p>
                <p className="text-muted-foreground truncate">{c.itens || 'sem itens detalhados'}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold">{brl(c.saldo)}</p>
                <p className={c.atraso > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                  {c.atraso > 0 ? `${c.atraso} dia${c.atraso === 1 ? '' : 's'} de atraso` : `vence ${new Date(`${c.vencimento}T00:00:00`).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
            </div>
          ))
        )}
      </section>
      <p className="text-[11px] text-muted-foreground">
        Pagamento parcial: conta em aberto a parte que falta de cada item. Fiados antigos são ligados ao produto pelo nome; os novos já guardam o produto.
      </p>
    </div>
  );
}
