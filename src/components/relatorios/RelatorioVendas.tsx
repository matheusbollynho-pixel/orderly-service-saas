// Relatórios → Vendas: o que foi vendido no período, por dia, por forma de pagamento,
// por pessoa e os itens que mais saíram. Mesma regra do "Vendeu" do Resumo:
//   OS entregues (status concluida_entregue, pela data de saída) − descontos dados nelas
//   + notas do balcão finalizadas ou no fiado (pela data de finalização).
// Datas no fuso da loja (America/Fortaleza, −03:00), igual ao banco.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { useMechanics } from '@/hooks/useMechanics';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { deIso, iso, problemaNoPeriodo, type Periodo } from '@/lib/periodo';
import { cn } from '@/lib/utils';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

const TZ = '-03:00';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: unknown) => Number(v) || 0;
// Igual ao banco: número do começo do texto da quantidade ("2", "1.5", "2 un"); vazio = 0
const qtdTexto = (t: string | null) => { const m = String(t ?? '').trim().match(/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/); return m ? Number(m[0]) : 0; };
// Dia no fuso da loja (−03:00), independente do fuso do aparelho
const diaLocal = (ts: string) => new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const chave = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
const FORMA: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', credito: 'Cartão de crédito', debito: 'Cartão de débito', fiado: 'Fiado', outro: 'Outro', transferencia: 'Transferência', boleto: 'Boleto', a_receber: 'Ficou a receber' };

interface OS {
  id: string; exit_date: string; mechanic_id: string | null; client_name: string;
  materials: { descricao: string; quantidade: string | null; valor: number | null; is_service: boolean | null }[];
  payments: { amount: number | null; discount_amount: number | null; method: string | null }[];
}
interface Nota {
  id: string; numero: number | null; client_name: string | null; status: string; total: number | null; discount_amount: number | null;
  payment_method: string | null; payment_methods: { method: string; amount: number }[] | null;
  finalized_at: string | null; created_at: string; atendente_id: string | null;
  balcao_items: { description: string; quantity: number | null; total_price: number | null; type: string | null }[];
}

function useVendas(p: Periodo) {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['relatorio-vendas', storeId, p.ini, p.fim],
    enabled: !!storeId && !problemaNoPeriodo(p),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const de = `${p.ini}T00:00:00${TZ}`;
      const fimMais1 = deIso(p.fim); fimMais1.setDate(fimMais1.getDate() + 1);
      const ate = `${iso(fimMais1)}T00:00:00${TZ}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [os, notas] = await Promise.all([
        buscarTodas<OS>((a, b) => db.from('service_orders')
          .select('id, exit_date, mechanic_id, client_name, materials(descricao, quantidade, valor, is_service), payments(amount, discount_amount, method)')
          .eq('store_id', storeId).eq('status', 'concluida_entregue').neq('equipment', '__QR_WALKIN_PLACEHOLDER__')
          .gte('exit_date', de).lt('exit_date', ate)
          .order('id').range(a, b)),
        buscarTodas<Nota>((a, b) => db.from('balcao_orders')
          .select('id, numero, client_name, status, total, discount_amount, payment_method, payment_methods, finalized_at, created_at, atendente_id, balcao_items(description, quantity, total_price, type)')
          .eq('store_id', storeId).in('status', ['finalizada', 'fiado'])
          .or(`and(finalized_at.gte.${de},finalized_at.lt.${ate}),and(finalized_at.is.null,created_at.gte.${de},created_at.lt.${ate})`)
          .order('id').range(a, b)),
      ]);
      return { os, notas };
    },
  });
}

export default function RelatorioVendas() {
  const per = usePeriodo('mes');
  const { atual } = per.escolhido;
  const { data, isLoading, isError, error, refetch } = useVendas(atual);
  const { mechanics } = useMechanics();
  const { members } = useTeamMembers();
  const [itens, setItens] = useState<'servicos' | 'pecas'>('servicos');

  const r = useMemo(() => {
    if (!data) return null;
    const porDia = new Map<string, { os: number; balcao: number }>();
    const porForma = new Map<string, number>();
    const porMecanico = new Map<string, { qtd: number; valor: number }>();
    const porAtendente = new Map<string, { qtd: number; valor: number }>();
    const servicos = new Map<string, { nome: string; qtd: number; valor: number }>();
    const pecas = new Map<string, { nome: string; qtd: number; valor: number }>();
    const somaItem = (m: typeof servicos, nome: string, q: number, v: number) => {
      const k = chave(nome || '(sem nome)');
      if (!m.has(k)) m.set(k, { nome: nome.trim() || '(sem nome)', qtd: 0, valor: 0 });
      const g = m.get(k)!; g.qtd += q; g.valor += v;
    };
    const dia = (d: string) => { if (!porDia.has(d)) porDia.set(d, { os: 0, balcao: 0 }); return porDia.get(d)!; };
    const add = (m: Map<string, number>, k: string, v: number) => { if (Math.abs(v) > 0.004) m.set(k, (m.get(k) ?? 0) + v); };

    let osTotal = 0, osDesc = 0, servTotal = 0, pecaOsTotal = 0;
    for (const o of data.os) {
      let total = 0;
      for (const m of o.materials ?? []) {
        const v = num(m.valor) * qtdTexto(m.quantidade);
        total += v;
        if (m.is_service) { servTotal += v; somaItem(servicos, m.descricao, qtdTexto(m.quantidade), v); }
        else { pecaOsTotal += v; somaItem(pecas, m.descricao, qtdTexto(m.quantidade), v); }
      }
      const desc = (o.payments ?? []).reduce((s, p) => s + num(p.discount_amount), 0);
      const liquido = total - desc;
      osTotal += total; osDesc += desc;
      dia(diaLocal(o.exit_date)).os += liquido;
      // Forma de pagamento: o que foi pago em cada forma; o resto ficou a receber
      // Igual ao Resumo: o recebido não passa do valor da OS (pagamento lançado sem tirar o desconto)
      const pago = (o.payments ?? []).reduce((s, p) => s + num(p.amount), 0);
      const fator = pago > liquido && pago > 0 ? Math.max(liquido, 0) / pago : 1;
      for (const p of o.payments ?? []) add(porForma, p.method || 'dinheiro', num(p.amount) * fator);
      add(porForma, 'a_receber', Math.max(Math.round((liquido - pago) * 100) / 100, 0));
      const mec = o.mechanic_id ? mechanics.find((m) => m.id === o.mechanic_id)?.name ?? 'Mecânico removido' : 'Sem mecânico';
      if (!porMecanico.has(mec)) porMecanico.set(mec, { qtd: 0, valor: 0 });
      porMecanico.get(mec)!.qtd += 1; porMecanico.get(mec)!.valor += liquido;
    }

    let notasTotal = 0;
    for (const n of data.notas) {
      const total = num(n.total);
      notasTotal += total;
      dia(diaLocal(n.finalized_at || n.created_at)).balcao += total;
      if (n.status === 'fiado') add(porForma, 'fiado', total);
      else {
        const entradas = Array.isArray(n.payment_methods) ? n.payment_methods.filter((e) => num(e.amount) > 0) : [];
        const soma = entradas.reduce((s, e) => s + num(e.amount), 0);
        // Pagamento dividido só vale se fechar com o total; senão vai tudo na forma principal
        if (entradas.length > 1 && Math.abs(soma - total) < 0.05) entradas.forEach((e) => add(porForma, e.method, num(e.amount)));
        else add(porForma, n.payment_method || entradas[0]?.method || 'dinheiro', total);
      }
      const at = n.atendente_id ? members.find((m) => m.id === n.atendente_id)?.name ?? 'Atendente removido' : 'Sem atendente';
      if (!porAtendente.has(at)) porAtendente.set(at, { qtd: 0, valor: 0 });
      porAtendente.get(at)!.qtd += 1; porAtendente.get(at)!.valor += total;
      // Item do balcão é sempre produto (do estoque ou avulso)
      for (const it of n.balcao_items ?? []) somaItem(pecas, it.description, num(it.quantity), num(it.total_price));
    }

    const vendeu = osTotal - osDesc + notasTotal;
    const qtd = data.os.length + data.notas.length;
    // Todos os dias do período (dia sem venda aparece zerado)
    const dias: { dia: string; os: number; balcao: number }[] = [];
    for (let d = deIso(atual.ini); iso(d) <= atual.fim; d.setDate(d.getDate() + 1)) {
      const v = porDia.get(iso(d)) ?? { os: 0, balcao: 0 };
      dias.push({ dia: iso(d), ...v });
    }
    const ord = <T extends { valor: number }>(m: Map<string, T>) => [...m.entries()].sort((a, b) => b[1].valor - a[1].valor);
    return {
      vendeu, qtd, ticket: qtd ? vendeu / qtd : 0,
      osLiquido: osTotal - osDesc, osQtd: data.os.length, osDesc, servTotal, pecaOsTotal,
      notasTotal, notasQtd: data.notas.length,
      dias, maxDia: Math.max(...dias.map((d) => d.os + d.balcao), 0),
      formas: [...porForma.entries()].sort((a, b) => (a[0] === 'a_receber' ? 1 : b[0] === 'a_receber' ? -1 : b[1] - a[1])),
      mecanicos: ord(porMecanico), atendentes: ord(porAtendente),
      servicos: [...servicos.values()].sort((a, b) => b.valor - a.valor),
      pecas: [...pecas.values()].sort((a, b) => b.valor - a.valor),
    };
  }, [data, mechanics, members, atual]);

  const Card = ({ t, v, sub, tom }: { t: string; v: string; sub?: string; tom?: string }) => (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{t}</p>
      <p className={cn('text-lg font-bold', tom)}>{v}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
  const Tabela = ({ titulo, linhas, rotuloQtd }: { titulo: string; linhas: [string, { qtd: number; valor: number }][]; rotuloQtd: string }) => (
    <section className="rounded-xl border bg-card p-3 space-y-1">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {linhas.length === 0 ? <p className="text-xs text-muted-foreground">Nada no período.</p> : linhas.map(([nome, g]) => (
        <div key={nome} className="flex justify-between gap-2 text-xs border-t border-border/50 pt-1 first:border-t-0 first:pt-0">
          <span>{nome} <span className="text-muted-foreground">· {g.qtd} {rotuloQtd}</span></span>
          <span className="tabular-nums">{brl(g.valor)}</span>
        </div>
      ))}
    </section>
  );

  const listaItens = r ? (itens === 'servicos' ? r.servicos : r.pecas) : [];

  return (
    <div className="space-y-3">
      <BarraPeriodo p={per} />
      {problemaNoPeriodo(atual) ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">{problemaNoPeriodo(atual)}</p>
      ) : isLoading || !r ? (
        isError ? (
          <div className="space-y-2 rounded-xl border p-4 text-sm">
            <p>Não consegui carregar as vendas.</p>
            {error instanceof Error && <p className="text-xs text-muted-foreground">{error.message}</p>}
            <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
          </div>
        ) : <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card t="Vendido" v={brl(r.vendeu)} sub={`${r.qtd} venda${r.qtd === 1 ? '' : 's'}`} />
            <Card t="Ticket médio" v={brl(r.ticket)} sub="por OS ou nota" />
            <Card t="Oficina (OS entregues)" v={brl(r.osLiquido)} sub={`${r.osQtd} OS · serviços ${brl(r.servTotal)} · peças ${brl(r.pecaOsTotal)}${r.osDesc > 0 ? ` · desconto ${brl(r.osDesc)}` : ''}`} />
            <Card t="Balcão (notas)" v={brl(r.notasTotal)} sub={`${r.notasQtd} nota${r.notasQtd === 1 ? '' : 's'}`} />
          </div>

          <section className="rounded-xl border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Por dia</h3>
              <span className="text-[11px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-sm bg-primary" /> oficina <span className="ml-1 inline-block h-2 w-2 rounded-sm bg-sky-500" /> balcão</span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => baixarPlanilha(`vendas-por-dia-${atual.ini}-a-${atual.fim}`,
                ['Dia', 'Oficina (OS)', 'Balcão', 'Total'], r.dias.map((d) => [deIso(d.dia).toLocaleDateString('pt-BR'), d.os, d.balcao, d.os + d.balcao]))}>
                Baixar planilha
              </Button>
            </div>
            {r.dias.map((d) => {
              const t = d.os + d.balcao;
              return (
                <div key={d.dia} className="flex items-center gap-2 text-xs">
                  <span className="w-20 flex-shrink-0 text-muted-foreground">{deIso(d.dia).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                  <div className="flex h-3 flex-1 overflow-hidden rounded bg-muted/40">
                    {r.maxDia > 0 && <div className="bg-primary" style={{ width: `${(Math.max(d.os, 0) / r.maxDia) * 100}%` }} />}
                    {r.maxDia > 0 && <div className="bg-sky-500" style={{ width: `${(Math.max(d.balcao, 0) / r.maxDia) * 100}%` }} />}
                  </div>
                  <span className={cn('w-24 flex-shrink-0 text-right tabular-nums', t === 0 && 'text-muted-foreground')}>{brl(t)}</span>
                </div>
              );
            })}
          </section>

          <section className="rounded-xl border bg-card p-3 space-y-1">
            <h3 className="text-sm font-semibold">Por forma de pagamento</h3>
            {r.formas.length === 0 ? <p className="text-xs text-muted-foreground">Nada no período.</p> : r.formas.map(([f, v]) => (
              <div key={f} className="flex justify-between gap-2 text-xs border-t border-border/50 pt-1 first:border-t-0 first:pt-0">
                <span className={cn(f === 'a_receber' || f === 'fiado' ? 'text-amber-500' : '')}>{FORMA[f] || f}</span>
                <span className="tabular-nums">{brl(v)}</span>
              </div>
            ))}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Tabela titulo="Oficina por mecânico" linhas={r.mecanicos} rotuloQtd="OS" />
            <Tabela titulo="Balcão por atendente" linhas={r.atendentes} rotuloQtd="notas" />
          </div>

          <section className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              <h3 className="mr-2 text-sm font-semibold">Mais vendidos</h3>
              <Button size="sm" variant={itens === 'servicos' ? 'default' : 'outline'} onClick={() => setItens('servicos')}>Serviços</Button>
              <Button size="sm" variant={itens === 'pecas' ? 'default' : 'outline'} onClick={() => setItens('pecas')}>Peças e produtos</Button>
              <Button size="sm" variant="outline" className="ml-auto" disabled={listaItens.length === 0}
                onClick={() => baixarPlanilha(`mais-vendidos-${itens}-${atual.ini}-a-${atual.fim}`, ['Item', 'Quantidade', 'Valor'], listaItens.map((i) => [i.nome, i.qtd, i.valor]))}>
                Baixar planilha
              </Button>
            </div>
            {listaItens.length === 0 ? <p className="text-xs text-muted-foreground">Nada no período.</p> : listaItens.slice(0, 30).map((i, n) => (
              <div key={i.nome} className="flex justify-between gap-2 text-xs border-t border-border/50 pt-1 first:border-t-0 first:pt-0">
                <span><span className="text-muted-foreground">{n + 1}.</span> {i.nome} <span className="text-muted-foreground">· {Number(i.qtd.toFixed(3)).toLocaleString('pt-BR')}x</span></span>
                <span className="tabular-nums">{brl(i.valor)}</span>
              </div>
            ))}
            {listaItens.length > 30 && <p className="text-[11px] text-muted-foreground">Mostrando os 30 primeiros de {listaItens.length}. A planilha tem todos.</p>}
          </section>

          <p className="text-[11px] text-muted-foreground">
            Mesma conta do "Vendeu" do Resumo: OS entregues no período (menos descontos) + notas do balcão finalizadas ou no fiado.
            Itens agrupados pelo nome escrito (OS e balcão juntos).
          </p>
        </>
      )}
    </div>
  );
}
