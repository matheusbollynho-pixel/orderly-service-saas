// Relatório do almoxarifado (aba na tela de Estoque, só para loja com almoxarifado).
// Fechamento por produto (entrou × usado × voltou × contagem), consumo por OS e
// consumo por mecânico/estofador da OS. Custo = quantidade × preço de custo atual.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMechanics } from '@/hooks/useMechanics';
import type { InventoryProduct } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { baixarPlanilha } from '@/lib/planilha';

type Periodo = 'este_mes' | 'mes_passado' | '30_dias';

interface Mov {
  id: string;
  type: string;
  local: string | null;
  quantity: number;
  saldo_anterior: number | null;
  product_id: string;
  order_id: string | null;
  created_at: string;
  service_orders: { client_name: string | null; equipment: string | null; mechanic_id: string | null; created_at: string } | null;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function intervalo(p: Periodo): { inicio: Date; fim: Date; rotulo: string } {
  const hoje = new Date();
  if (p === 'mes_passado') {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { inicio, fim, rotulo: inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  }
  if (p === '30_dias') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 30);
    return { inicio, fim: new Date(hoje.getTime() + 86400000), rotulo: 'últimos 30 dias' };
  }
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { inicio, fim: new Date(hoje.getTime() + 86400000), rotulo: 'este mês' };
}

export function RelatorioAlmoxarifado({ products }: { products: InventoryProduct[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('este_mes');
  const { inicio, fim, rotulo } = intervalo(periodo);
  const { mechanics } = useMechanics();

  const { data: movs = [], isLoading } = useQuery({
    queryKey: ['relatorio-almox', periodo],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return buscarTodas<Mov>((de, ate) => (supabase as any)
        .from('inventory_movements')
        .select('id, type, local, quantity, saldo_anterior, product_id, order_id, created_at, service_orders(client_name, equipment, mechanic_id, created_at)')
        .or('local.eq.almox,type.in.(transf_para_almox,transf_para_loja)')
        .gte('created_at', inicio.toISOString())
        .lt('created_at', fim.toISOString())
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate));
    },
  });

  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const custo = (productId: string) => Number(porId.get(productId)?.cost_price ?? 0);

  // 1. Fechamento por produto
  const fechamento = useMemo(() => {
    const m = new Map<string, { entrou: number; usado: number; voltou: number; contagem: number }>();
    const linha = (id: string) => {
      if (!m.has(id)) m.set(id, { entrou: 0, usado: 0, voltou: 0, contagem: 0 });
      return m.get(id)!;
    };
    for (const mv of movs) {
      const q = Number(mv.quantity) || 0;
      const l = linha(mv.product_id);
      if (mv.type === 'transf_para_almox') l.entrou += q;
      else if (mv.type === 'transf_para_loja') l.voltou += q;
      else if (mv.local === 'almox' && mv.type === 'entrada_manual') l.entrou += q;
      else if (mv.local === 'almox' && mv.type === 'saida_os') l.usado += q;
      else if (mv.local === 'almox' && mv.type === 'devolucao') {
        if (mv.order_id) l.usado -= q; else l.entrou += q;
      } else if (mv.local === 'almox' && mv.type === 'ajuste' && mv.saldo_anterior != null) {
        l.contagem += q - Number(mv.saldo_anterior);
      }
    }
    // Produtos com saldo no almoxarifado entram mesmo sem movimento no período
    for (const p of products) {
      if (Number((p as { stock_almox?: number }).stock_almox ?? 0) !== 0) linha(p.id);
    }
    return [...m.entries()]
      .map(([id, v]) => ({ id, ...v, produto: porId.get(id) }))
      .filter((r) => r.produto)
      .sort((a, b) => (a.produto!.name || '').localeCompare(b.produto!.name || '', 'pt-BR'));
  }, [movs, products, porId]);

  // 2. Consumo por OS (líquido: baixas menos devoluções da mesma OS)
  const porOS = useMemo(() => {
    const m = new Map<string, { os: Mov['service_orders']; itens: Map<string, number> }>();
    for (const mv of movs) {
      if (mv.local !== 'almox' || !mv.order_id || (mv.type !== 'saida_os' && mv.type !== 'devolucao')) continue;
      if (!porId.has(mv.product_id)) continue; // fora do filtro de produtos
      if (!m.has(mv.order_id)) m.set(mv.order_id, { os: mv.service_orders, itens: new Map() });
      const g = m.get(mv.order_id)!;
      const sinal = mv.type === 'saida_os' ? 1 : -1;
      g.itens.set(mv.product_id, (g.itens.get(mv.product_id) ?? 0) + sinal * (Number(mv.quantity) || 0));
    }
    return [...m.entries()]
      .map(([orderId, g]) => {
        const itens = [...g.itens.entries()].filter(([, q]) => q > 0.0005);
        return { orderId, os: g.os, itens, total: itens.reduce((s, [pid, q]) => s + q * custo(pid), 0) };
      })
      .filter((r) => r.itens.length > 0)
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movs, porId]);

  // 3. Consumo por mecânico/estofador da OS
  const porMecanico = useMemo(() => {
    const nome = new Map(mechanics.map((x) => [x.id, x.name]));
    const m = new Map<string, { nome: string; os: number; total: number }>();
    for (const r of porOS) {
      const id = r.os?.mechanic_id || 'sem';
      if (!m.has(id)) m.set(id, { nome: id === 'sem' ? 'Sem mecânico na OS' : (nome.get(id) || 'Mecânico removido'), os: 0, total: 0 });
      const g = m.get(id)!;
      g.os += 1;
      g.total += r.total;
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [porOS, mechanics]);

  const totalUsado = fechamento.reduce((s, r) => s + r.usado * custo(r.id), 0);
  const totalPerda = fechamento.reduce((s, r) => s + (r.contagem < 0 ? -r.contagem * custo(r.id) : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Material do almoxarifado — {rotulo}</p>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={fechamento.length === 0}
          onClick={() => baixarPlanilha(`almoxarifado-${periodo}`,
            ['Produto', 'Código', 'Unidade', 'Entrou', 'Usado em OS', 'Voltou p/ loja', 'Contagem (+sobra/-perda)', 'Saldo hoje', 'Custo unitário', 'Custo usado'],
            fechamento.map((r) => [
              r.produto!.name, r.produto!.code, r.produto!.unit, r.entrou, r.usado, r.voltou, r.contagem,
              Number((r.produto as { stock_almox?: number }).stock_almox ?? 0), custo(r.id), r.usado * custo(r.id),
            ]))}
        >
          Baixar planilha
        </Button>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="este_mes">Este mês</SelectItem>
            <SelectItem value="mes_passado">Mês passado</SelectItem>
            <SelectItem value="30_dias">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Material usado nas OS (custo)</p>
              <p className="text-lg font-bold">{brl(totalUsado)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Perda nas contagens (custo)</p>
              <p className={`text-lg font-bold ${totalPerda > 0 ? 'text-red-500' : ''}`}>{brl(totalPerda)}</p>
            </div>
          </div>

          {/* 1. Fechamento por produto */}
          <section className="rounded-xl border bg-card p-3 space-y-2">
            <h3 className="text-sm font-semibold">Fechamento por produto</h3>
            {fechamento.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum movimento no almoxarifado no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-2">Produto</th>
                      <th className="py-1 px-1 text-right">Entrou</th>
                      <th className="py-1 px-1 text-right">Usado em OS</th>
                      <th className="py-1 px-1 text-right">Voltou p/ loja</th>
                      <th className="py-1 px-1 text-right">Contagem</th>
                      <th className="py-1 px-1 text-right">Saldo hoje</th>
                      <th className="py-1 pl-1 text-right">Custo usado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechamento.map((r) => {
                      const u = (r.produto!.unit || '').toUpperCase();
                      return (
                        <tr key={r.id} className="border-t border-border/50">
                          <td className="py-1 pr-2">{r.produto!.name}</td>
                          <td className="py-1 px-1 text-right">{qtd(r.entrou)} {u}</td>
                          <td className="py-1 px-1 text-right">{qtd(r.usado)} {u}</td>
                          <td className="py-1 px-1 text-right">{qtd(r.voltou)} {u}</td>
                          <td className={`py-1 px-1 text-right ${r.contagem < 0 ? 'text-red-500 font-semibold' : r.contagem > 0 ? 'text-green-600' : ''}`}>
                            {r.contagem === 0 ? '—' : `${r.contagem > 0 ? '+' : ''}${qtd(r.contagem)} ${u}`}
                          </td>
                          <td className="py-1 px-1 text-right">{qtd(Number((r.produto as { stock_almox?: number }).stock_almox ?? 0))} {u}</td>
                          <td className="py-1 pl-1 text-right">{brl(r.usado * custo(r.id))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Contagem = diferença entre o que foi contado e o que o sistema tinha (negativo = perda). Custo pelo preço de custo atual do produto.
            </p>
          </section>

          {/* 2. Consumo por OS */}
          <section className="rounded-xl border bg-card p-3 space-y-2">
            <h3 className="text-sm font-semibold">Consumo por OS</h3>
            {porOS.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma OS usou material do almoxarifado no período.</p>
            ) : (
              porOS.map((r) => (
                <div key={r.orderId} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="font-medium">
                      {r.os?.client_name || 'OS'}{r.os?.equipment ? ` · ${r.os.equipment}` : ''}
                      {r.os?.created_at ? ` · ${new Date(r.os.created_at).toLocaleDateString('pt-BR')}` : ''}
                    </span>
                    <span className="font-semibold">{brl(r.total)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {r.itens.map(([pid, q]) => `${porId.get(pid)?.name ?? 'Produto'}: ${qtd(q)} ${(porId.get(pid)?.unit || '').toUpperCase()}`).join(' · ')}
                  </p>
                </div>
              ))
            )}
          </section>

          {/* 3. Consumo por mecânico/estofador */}
          <section className="rounded-xl border bg-card p-3 space-y-2">
            <h3 className="text-sm font-semibold">Consumo por mecânico/estofador</h3>
            {porMecanico.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem consumo no período.</p>
            ) : (
              porMecanico.map((g) => (
                <div key={g.nome} className="flex justify-between text-xs border-t border-border/50 pt-1 first:border-t-0 first:pt-0">
                  <span>{g.nome} <span className="text-muted-foreground">({g.os} OS)</span></span>
                  <span className="font-semibold">{brl(g.total)}</span>
                </div>
              ))
            )}
            <p className="text-[11px] text-muted-foreground">Pelo mecânico responsável marcado na OS.</p>
          </section>
        </>
      )}
    </div>
  );
}
