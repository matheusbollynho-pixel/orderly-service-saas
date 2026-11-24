// Relatórios → Clientes: quem comprou no período, quem é novo, quem mais gasta
// e quem sumiu (pra chamar de volta).
// Compra = OS entregue (valor − desconto) ou nota do balcão finalizada/fiado, igual ao "Vendeu".
// O mesmo cliente é reconhecido pelo telefone (8 últimos dígitos); sem telefone, pelo nome.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { deIso, iso, problemaNoPeriodo } from '@/lib/periodo';
import { cn } from '@/lib/utils';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

const DIA = 86400000;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: unknown) => Number(v) || 0;
const qtdTexto = (t: string | null) => { const m = String(t ?? '').trim().match(/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/); return m ? Number(m[0]) : 0; };
// Dia no fuso da loja (−03:00), independente do fuso do aparelho
const diaLoja = (ts: string) => new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const nomeChave = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
const chaveCliente = (nome: string | null, tel: string | null) => {
  const d = String(tel ?? '').replace(/\D/g, '');
  return d.length >= 8 ? `t:${d.slice(-8)}` : `n:${nomeChave(nome || '')}`;
};
const SUMIDO = [60, 90, 180, 365];

interface Compra { dia: string; valor: number; tipo: 'os' | 'balcao' }
interface Cliente { chave: string; nome: string; tel: string; compras: Compra[] }

export default function RelatorioClientes() {
  const per = usePeriodo('mes');
  const { atual } = per.escolhido;
  const { storeId } = useStore();
  const [sumido, setSumido] = useState(90);

  // Histórico inteiro (pra saber quem é novo e quem sumiu)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['relatorio-clientes', storeId],
    enabled: !!storeId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [os, notas] = await Promise.all([
        buscarTodas<{ client_name: string; client_phone: string | null; exit_date: string | null; created_at: string; materials: { valor: number | null; quantidade: string | null }[]; payments: { discount_amount: number | null }[] }>((a, b) => db
          .from('service_orders').select('client_name, client_phone, exit_date, created_at, materials(valor, quantidade), payments(discount_amount)')
          .eq('store_id', storeId).eq('status', 'concluida_entregue').neq('equipment', '__QR_WALKIN_PLACEHOLDER__')
          .order('id').range(a, b)),
        buscarTodas<{ client_name: string | null; client_phone: string | null; total: number | null; finalized_at: string | null; created_at: string }>((a, b) => db
          .from('balcao_orders').select('client_name, client_phone, total, finalized_at, created_at')
          .eq('store_id', storeId).in('status', ['finalizada', 'fiado'])
          .order('id').range(a, b)),
      ]);
      const m = new Map<string, Cliente>();
      const add = (nome: string | null, tel: string | null, c: Compra) => {
        if (!(nome || '').trim() && String(tel ?? '').replace(/\D/g, '').length < 8) return; // venda sem cliente identificado
        const k = chaveCliente(nome, tel);
        if (!m.has(k)) m.set(k, { chave: k, nome: (nome || '').trim(), tel: tel || '', compras: [] });
        const g = m.get(k)!;
        g.compras.push(c);
        if (!g.tel && tel) g.tel = tel;
        if (!g.nome && nome) g.nome = nome.trim();
      };
      for (const o of os) {
        const total = (o.materials ?? []).reduce((s, x) => s + num(x.valor) * qtdTexto(x.quantidade), 0);
        const desc = (o.payments ?? []).reduce((s, p) => s + num(p.discount_amount), 0);
        add(o.client_name, o.client_phone, { dia: diaLoja(o.exit_date || o.created_at), valor: total - desc, tipo: 'os' });
      }
      for (const n of notas) {
        const nome = (n.client_name || '').trim();
        if (/^(consumidor|cliente)( final| balc[aã]o)?$/i.test(nome) && !n.client_phone) continue; // nota sem cliente
        add(n.client_name, n.client_phone, { dia: diaLoja(n.finalized_at || n.created_at), valor: num(n.total), tipo: 'balcao' });
      }
      return [...m.values()];
    },
  });

  const r = useMemo(() => {
    if (!data) return null;
    const hoje = iso(new Date());
    const linhas = data.map((c) => {
      const noPeriodo = c.compras.filter((x) => x.dia >= atual.ini && x.dia <= atual.fim);
      const antes = c.compras.filter((x) => x.dia < atual.ini);
      const ultima = c.compras.reduce((u, x) => (x.dia > u ? x.dia : u), '');
      return {
        c,
        gastoPeriodo: noPeriodo.reduce((s, x) => s + x.valor, 0),
        visitasPeriodo: noPeriodo.length,
        novo: noPeriodo.length > 0 && antes.length === 0,
        gastoTotal: c.compras.reduce((s, x) => s + x.valor, 0),
        visitas: c.compras.length,
        ultima,
        diasSemVir: ultima ? Math.round((deIso(hoje).getTime() - deIso(ultima).getTime()) / DIA) : 0,
      };
    });
    const atendidos = linhas.filter((l) => l.visitasPeriodo > 0);
    const novos = atendidos.filter((l) => l.novo);
    const gasto = atendidos.reduce((s, l) => s + l.gastoPeriodo, 0);
    return {
      atendidos: atendidos.length,
      novos: novos.length,
      voltaram: atendidos.length - novos.length,
      ticket: atendidos.length ? gasto / atendidos.length : 0,
      top: [...atendidos].sort((a, b) => b.gastoPeriodo - a.gastoPeriodo),
      todos: linhas,
    };
  }, [data, atual]);

  // Sumidos: já vieram mais de uma vez OU gastaram bem, e não voltam há X dias. Os que mais gastaram primeiro.
  const sumidos = useMemo(() => (r ? r.todos.filter((l) => l.diasSemVir >= sumido).sort((a, b) => b.gastoTotal - a.gastoTotal) : []), [r, sumido]);

  const Card = ({ t, v, sub, tom }: { t: string; v: string | number; sub?: string; tom?: string }) => (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{t}</p>
      <p className={cn('text-lg font-bold', tom)}>{v}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
  const fmt = (d: string) => (d ? deIso(d).toLocaleDateString('pt-BR') : '');

  return (
    <div className="space-y-3">
      <BarraPeriodo p={per} />
      {isError ? (
        <p className="rounded-xl border p-4 text-sm text-red-500">Não consegui carregar os clientes.</p>
      ) : isLoading || !r ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : problemaNoPeriodo(atual) ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">{problemaNoPeriodo(atual)}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card t="Clientes atendidos" v={r.atendidos} sub="compraram no período" />
            <Card t="Novos" v={r.novos} sub="primeira compra" tom="text-green-600 dark:text-green-400" />
            <Card t="Voltaram" v={r.voltaram} sub="já tinham comprado antes" />
            <Card t="Gasto médio por cliente" v={brl(r.ticket)} />
          </div>

          <section className="rounded-xl border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Quem mais comprou no período</h3>
              <Button size="sm" variant="outline" className="ml-auto" disabled={r.top.length === 0}
                onClick={() => baixarPlanilha(`clientes-${atual.ini}-a-${atual.fim}`, ['Cliente', 'Telefone', 'Compras no período', 'Gasto no período', 'Novo', 'Compras no total', 'Gasto no total'],
                  r.top.map((l) => [l.c.nome, l.c.tel, l.visitasPeriodo, l.gastoPeriodo, l.novo ? 'sim' : 'não', l.visitas, l.gastoTotal]))}>
                Baixar planilha
              </Button>
            </div>
            {r.top.length === 0 ? <p className="text-xs text-muted-foreground">Ninguém no período.</p> : r.top.slice(0, 20).map((l, i) => (
              <div key={l.c.chave} className="flex justify-between gap-2 border-t border-border/50 pt-1 text-xs first:border-t-0 first:pt-0">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{i + 1}.</span> {l.c.nome || l.c.tel}
                  {l.novo && <span className="ml-1 text-green-600 dark:text-green-400">novo</span>}
                  <span className="text-muted-foreground"> · {l.visitasPeriodo} compra{l.visitasPeriodo === 1 ? '' : 's'}</span>
                </span>
                <span className="flex-shrink-0 tabular-nums">{brl(l.gastoPeriodo)}</span>
              </div>
            ))}
            {r.top.length > 20 && <p className="text-[11px] text-muted-foreground">Mostrando 20 de {r.top.length}. A planilha tem todos.</p>}
          </section>

          <section className="rounded-xl border bg-card p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <h3 className="mr-2 text-sm font-semibold">Sumidos (pra chamar de volta)</h3>
              <span className="text-xs text-muted-foreground">sem comprar há</span>
              {SUMIDO.map((d) => (
                <Button key={d} size="sm" variant={sumido === d ? 'default' : 'outline'} onClick={() => setSumido(d)}>{d} dias</Button>
              ))}
              <Button size="sm" variant="outline" className="ml-auto" disabled={sumidos.length === 0}
                onClick={() => baixarPlanilha(`clientes-sumidos-${sumido}-dias`, ['Cliente', 'Telefone', 'Última compra', 'Dias sem comprar', 'Compras no total', 'Gasto no total'],
                  sumidos.map((l) => [l.c.nome, l.c.tel, fmt(l.ultima), l.diasSemVir, l.visitas, l.gastoTotal]))}>
                Baixar planilha
              </Button>
            </div>
            {sumidos.length === 0 ? <p className="text-xs text-muted-foreground">Ninguém sumido há {sumido} dias.</p> : sumidos.slice(0, 30).map((l) => (
              <div key={l.c.chave} className="flex justify-between gap-2 border-t border-border/50 pt-1 text-xs first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.c.nome || l.c.tel}</p>
                  <p className="text-muted-foreground">{l.c.tel || 'sem telefone'} · {l.visitas} compra{l.visitas === 1 ? '' : 's'} · {brl(l.gastoTotal)}</p>
                </div>
                <span className="flex-shrink-0 text-right text-muted-foreground">última {fmt(l.ultima)}<br />{l.diasSemVir} dias</span>
              </div>
            ))}
            {sumidos.length > 30 && <p className="text-[11px] text-muted-foreground">Mostrando 30 de {sumidos.length} (os que mais gastaram). A planilha tem todos.</p>}
          </section>
          <p className="text-[11px] text-muted-foreground">
            Compra = OS entregue ou nota do balcão. O mesmo cliente é reconhecido pelo telefone; sem telefone, pelo nome.
            Notas sem cliente (consumidor final) ficam de fora.
          </p>
        </>
      )}
    </div>
  );
}
